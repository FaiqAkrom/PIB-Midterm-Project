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
     *   lastEvaluatedAt: number
     * }
     */
    this.silos = new Map();
  }

  getSiloState(siloId) {
    if (!this.silos.has(siloId)) {
      this.silos.set(siloId, {
        fanOn: false,
        safeCount: 0,
        manualOverride: false,
        manualOverrideExpiresAt: null,
        cumulativeExposureMinutes: 0,
        lastEvaluatedAt: Date.now()
      });
    }
    return this.silos.get(siloId);
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
   * Evaluasi otomasi kipas dengan histeresis.
   * Dilewati seluruhnya saat mode manual aktif.
   *
   * @param {string} siloId
   * @param {string} riskLevel ('aman' | 'waspada' | 'bahaya')
   * @param {Function} publishCommandFn (siloId, boolean) => Promise<void>
   * @param {Function} recordEventFn   (siloId, 'ON'|'OFF', 'otomatis'|'manual') => Promise<void>
   */
  async evaluateAutomation(siloId, riskLevel, publishCommandFn, recordEventFn) {
    const state = this.getSiloState(siloId);
    const now = Date.now();
    const elapsedMinutes = (now - state.lastEvaluatedAt) / 60000;
    state.lastEvaluatedAt = now;

    // --- Akumulasi paparan KUMULATIF (hanya bertambah, tidak pernah berkurang) ---
    if (riskLevel === 'waspada' || riskLevel === 'bahaya') {
      state.cumulativeExposureMinutes += Math.max(0.08, elapsedMinutes);
    }
    // Jika kondisi aman, paparan tetap tersimpan (kerugian sudah terjadi)

    // --- Blokir otomasi selama mode manual aktif ---
    if (this.isManualActive(state)) {
      const expiresIn = state.manualOverrideExpiresAt
        ? Math.ceil((state.manualOverrideExpiresAt - Date.now()) / 60000)
        : null;
      console.log(`[FAN MANUAL] Otomasi diblokir untuk ${siloId}. Sisa kunci: ${expiresIn !== null ? expiresIn + ' menit' : 'permanen'}`);
      return {
        fanOn: state.fanOn,
        exposureMinutes: Number(state.cumulativeExposureMinutes.toFixed(1)),
        manualOverride: true,
        manualOverrideExpiresAt: state.manualOverrideExpiresAt
      };
    }

    // --- Logika Otomasi + Histeresis ---
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
      manualOverrideExpiresAt: null
    };
  }

  /**
   * Perintah kontrol manual dari dashboard.
   *
   * @param {string}   siloId
   * @param {boolean}  targetState       - true = ON, false = OFF
   * @param {Function} publishCommandFn
   * @param {Function} recordEventFn
   * @param {number|null} durationMinutes - berapa menit kunci manual berlaku
   *                                        (null = permanen sampai dilepas eksplisit)
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
    return { siloId, manualOverride: false };
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
