/**
 * Pengendali Otomasi Kipas Ventilasi & Histeresis — Silo-Guard
 */

import { THRESHOLDS } from '../config/thresholds.js';

// Durasi default kunci manual (menit)
const DEFAULT_MANUAL_OVERRIDE_MINUTES = 60;

class FanController {
  constructor() {
    /**
     * Status per silo:
     * {
     *   fanOn: boolean,
     *   safeCount: number,
     *   manualOverride: boolean,
     *   manualOverrideExpiresAt: number|null,  // epoch ms, null = permanen sampai dilepas
     *   cumulativeExposureMinutes: number,      // TOTAL paparan kondisi buruk sepanjang hari
     *   cumulativeLossRp: number,              // Total kerugian akumulatif hari ini (Rp)
     *   cumulativeSusutKg: number,             // Total susut bobot akumulatif hari ini (kg)
     *   cumulativeDicegahRp: number,           // Total kerugian dicegah berkat kipas (Rp)
     *   cumulativeLossDate: string,            // 'YYYY-MM-DD' untuk reset harian
     *   lastEvaluatedAt: number,
     *   lastEconomicsAt: number,
     *   isInitializedFromDb: boolean
     * }
     */
    this.silos = new Map();
  }

  getSiloState(siloId) {
    if (!this.silos.has(siloId)) {
      const today = new Date().toISOString().slice(0, 10);
      this.silos.set(siloId, {
        fanOn: false,
        safeCount: 0,
        manualOverride: false,
        manualOverrideExpiresAt: null,
        cumulativeExposureMinutes: 0,
        cumulativeLossRp: 0,
        cumulativeSusutKg: 0,
        cumulativeDicegahRp: 0,
        cumulativeLossDate: today,
        lastEvaluatedAt: Date.now(),
        lastEconomicsAt: Date.now(),
        isInitializedFromDb: false
      });
    }
    const state = this.silos.get(siloId);
    this.checkDailyReset(state, siloId);
    return state;
  }

  /**
   * Reset metrik ekonomi kumulatif jika pergantian hari kalender terdeteksi
   */
  checkDailyReset(state, siloId) {
    const today = new Date().toISOString().slice(0, 10);
    if (state.cumulativeLossDate !== today) {
      console.log(`[ECONOMICS] Reset harian untuk ${siloId}: ${state.cumulativeLossDate} -> ${today}`);
      state.cumulativeExposureMinutes = 0;
      state.cumulativeLossRp = 0;
      state.cumulativeSusutKg = 0;
      state.cumulativeDicegahRp = 0;
      state.cumulativeLossDate = today;
    }
  }

  /**
   * Pulihkan nilai akumulasi hari ini dari basis data (misal setelah backend restart)
   */
  initFromDbEstimate(siloId, dbEstimate) {
    const state = this.getSiloState(siloId);
    if (state.isInitializedFromDb) return;

    if (dbEstimate && dbEstimate.created_at) {
      const estimateDate = new Date(dbEstimate.created_at).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      if (estimateDate === today) {
        state.cumulativeLossRp = Math.max(state.cumulativeLossRp, Number(dbEstimate.est_kerugian_rp) || 0);
        state.cumulativeSusutKg = Math.max(state.cumulativeSusutKg, Number(dbEstimate.est_susut_kg) || 0);
        state.cumulativeDicegahRp = Math.max(state.cumulativeDicegahRp, Number(dbEstimate.est_dicegah_rp) || 0);
        console.log(`[ECONOMICS] Memulihkan akumulasi ekonomi hari ini untuk ${siloId} dari DB: Rp${state.cumulativeLossRp}`);
      }
    }
    state.isInitializedFromDb = true;
  }

  /**
   * Apakah mode manual sedang aktif (belum kedaluwarsa)?
   */
  isManualActive(state) {
    if (!state.manualOverride) return false;
    if (state.manualOverrideExpiresAt === null) return true; // permanen
    if (Date.now() < state.manualOverrideExpiresAt) return true;
    // Kadaluwarsa — lepas override secara otomatis
    state.manualOverride = false;
    state.manualOverrideExpiresAt = null;
    console.log('[FAN AUTO] Mode manual telah kedaluwarsa, otomasi diaktifkan kembali.');
    return false;
  }

  /**
   * Evaluasi otomasi kipas dengan histeresis & perlindungan keselamatan stok.
   *
   * @param {string} siloId
   * @param {string} riskLevel ('aman' | 'waspada' | 'bahaya' | 'tidak_diketahui')
   * @param {Function} publishCommandFn (siloId, boolean) => Promise<void>
   * @param {Function} recordEventFn   (siloId, 'ON'|'OFF', 'otomatis'|'manual') => Promise<void>
   */
  async evaluateAutomation(siloId, riskLevel, publishCommandFn, recordEventFn) {
    const state = this.getSiloState(siloId);
    const now = Date.now();
    const elapsedMinutes = (now - state.lastEvaluatedAt) / 60000;
    state.lastEvaluatedAt = now;

    // --- Akumulasi paparan KUMULATIF (hanya bertambah saat waspada/bahaya) ---
    if (riskLevel === 'waspada' || riskLevel === 'bahaya') {
      state.cumulativeExposureMinutes += Math.max(0.08, elapsedMinutes);
    }

    // --- OVERRIDE KESELAMATAN (SAFETY OVERRIDE) SAAT BAHAYA ---
    // Status Bahaya menimpa kunci manual jika kipas dalam keadaan mati demi melindungi stok gabah
    if (riskLevel === 'bahaya' && this.isManualActive(state) && !state.fanOn) {
      console.warn(`[SAFETY OVERRIDE] Silo ${siloId} dalam kondisi BAHAYA! Kunci manual dibatalkan demi keselamatan stok.`);
      state.manualOverride = false;
      state.manualOverrideExpiresAt = null;
      state.fanOn = true;
      state.safeCount = 0;

      if (publishCommandFn) await publishCommandFn(siloId, true);
      if (recordEventFn) await recordEventFn(siloId, 'ON', 'otomatis');

      return {
        fanOn: true,
        exposureMinutes: Number(state.cumulativeExposureMinutes.toFixed(1)),
        manualOverride: false,
        manualOverrideExpiresAt: null,
        safetyOverrideTriggered: true
      };
    }

    // --- Blokir otomasi selama mode manual aktif (jika bukan bahaya mati) ---
    if (this.isManualActive(state)) {
      const expiresIn = state.manualOverrideExpiresAt
        ? Math.ceil((state.manualOverrideExpiresAt - Date.now()) / 60000)
        : null;
      console.log(`[FAN MANUAL] Otomasi diblokir untuk ${siloId}. Sisa kunci: ${expiresIn !== null ? expiresIn + ' menit' : 'permanen'}`);
      return {
        fanOn: state.fanOn,
        exposureMinutes: Number(state.cumulativeExposureMinutes.toFixed(1)),
        manualOverride: true,
        manualOverrideExpiresAt: state.manualOverrideExpiresAt,
        safetyOverrideTriggered: false
      };
    }

    // --- Logika Otomasi + Histeresis Normal ---
    if (riskLevel === 'waspada' || riskLevel === 'bahaya') {
      state.safeCount = 0;

      if (!state.fanOn) {
        state.fanOn = true;
        console.log(`[FAN AUTO] Menyalakan kipas untuk ${siloId} (Level: ${riskLevel})`);
        if (publishCommandFn) await publishCommandFn(siloId, true);
        if (recordEventFn) await recordEventFn(siloId, 'ON', 'otomatis');
      }
    } else if (riskLevel === 'aman') {
      if (state.fanOn) {
        state.safeCount++;
        console.log(`[FAN HISTERESIS] Silo ${siloId} aman (${state.safeCount}/${THRESHOLDS.fan.safeCyclesToTurnOff} siklus stabil)`);

        if (state.safeCount >= THRESHOLDS.fan.safeCyclesToTurnOff) {
          state.fanOn = false;
          state.safeCount = 0;
          console.log(`[FAN AUTO] Mematikan kipas untuk ${siloId} setelah stabil aman.`);
          if (publishCommandFn) await publishCommandFn(siloId, false);
          if (recordEventFn) await recordEventFn(siloId, 'OFF', 'otomatis');
        }
      } else {
        state.safeCount = 0;
      }
    }

    return {
      fanOn: state.fanOn,
      exposureMinutes: Number(state.cumulativeExposureMinutes.toFixed(1)),
      manualOverride: false,
      manualOverrideExpiresAt: null,
      safetyOverrideTriggered: false
    };
  }

  /**
   * Perintah kontrol manual dari dashboard.
   */
  async setManualFan(siloId, targetState, publishCommandFn, recordEventFn, durationMinutes = DEFAULT_MANUAL_OVERRIDE_MINUTES) {
    const state = this.getSiloState(siloId);
    state.fanOn = Boolean(targetState);
    state.safeCount = 0;
    state.manualOverride = true;
    state.manualOverrideExpiresAt = durationMinutes !== null
      ? Date.now() + durationMinutes * 60 * 1000
      : null;

    const expiresLabel = durationMinutes !== null
      ? `selama ${durationMinutes} menit (sampai ${new Date(state.manualOverrideExpiresAt).toLocaleTimeString('id-ID')})`
      : 'permanen (sampai dilepas)';
    console.log(`[FAN MANUAL] Perintah manual: Kipas ${siloId} -> ${targetState ? 'ON' : 'OFF'}, kunci ${expiresLabel}`);

    if (publishCommandFn) await publishCommandFn(siloId, targetState);
    if (recordEventFn) await recordEventFn(siloId, targetState ? 'ON' : 'OFF', 'manual');

    return {
      siloId,
      fanOn: state.fanOn,
      mode: 'manual',
      manualOverride: true,
      manualOverrideExpiresAt: state.manualOverrideExpiresAt
    };
  }

  /**
   * Lepaskan mode manual — kembalikan kendali ke otomasi.
   */
  releaseManualOverride(siloId) {
    const state = this.getSiloState(siloId);
    state.manualOverride = false;
    state.manualOverrideExpiresAt = null;
    console.log(`[FAN AUTO] Mode manual untuk ${siloId} dilepas. Otomasi aktif kembali.`);
    return { siloId, manualOverride: false, fanOn: state.fanOn };
  }

  /**
   * Dapatkan ringkasan status kipas dan sisa waktu kunci
   */
  getStatus(siloId) {
    const state = this.getSiloState(siloId);
    const isManual = this.isManualActive(state);
    const remainingMs = (isManual && state.manualOverrideExpiresAt)
      ? Math.max(0, state.manualOverrideExpiresAt - Date.now())
      : null;
    const remainingMinutes = remainingMs !== null ? Math.ceil(remainingMs / 60000) : null;
    const remainingSeconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;

    return {
      siloId,
      fanOn: state.fanOn,
      manualOverride: isManual,
      manualOverrideExpiresAt: isManual ? state.manualOverrideExpiresAt : null,
      remainingMinutes,
      remainingSeconds
    };
  }

  syncHardwareStatus(siloId, hardwareFanOn) {
    const state = this.getSiloState(siloId);
    // Jangan timpa state jika mode manual sedang aktif
    if (!this.isManualActive(state)) {
      state.fanOn = hardwareFanOn;
    }
  }
}

export const fanController = new FanController();
