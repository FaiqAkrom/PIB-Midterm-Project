/**
 * Pengendali Otomasi Kipas Ventilasi & Histeresis — Silo-Guard
 */

import { THRESHOLDS } from '../config/thresholds.js';

class FanController {
  constructor() {
    // Menyimpan status per silo: { [siloId]: { fanOn: boolean, safeCount: number, manualOverride: boolean, exposureMinutes: number } }
    this.silos = new Map();
  }

  getSiloState(siloId) {
    if (!this.silos.has(siloId)) {
      this.silos.set(siloId, {
        fanOn: false,
        safeCount: 0,
        manualOverride: false,
        exposureMinutes: 0,
        lastEvaluatedAt: Date.now()
      });
    }
    return this.silos.get(siloId);
  }

  /**
   * Evaluasi otomasi kipas dengan histeresis
   * @param {string} siloId 
   * @param {string} riskLevel ('aman' | 'waspada' | 'bahaya')
   * @param {Function} publishCommandFn (siloId, boolean) => Promise<void>
   * @param {Function} recordEventFn (siloId, 'ON'|'OFF', 'otomatis'|'manual') => Promise<void>
   */
  async evaluateAutomation(siloId, riskLevel, publishCommandFn, recordEventFn) {
    const state = this.getSiloState(siloId);
    const now = Date.now();
    const elapsedMinutes = (now - state.lastEvaluatedAt) / 60000;
    state.lastEvaluatedAt = now;

    // Hitung akumulasi menit paparan
    if (riskLevel === 'waspada' || riskLevel === 'bahaya') {
      state.exposureMinutes += Math.max(0.08, elapsedMinutes); // minimal 5 detik ~ 0.083 menit
    } else if (riskLevel === 'aman' && state.exposureMinutes > 0) {
      // Pelan-pelan pulih jika aman
      state.exposureMinutes = Math.max(0, state.exposureMinutes - (elapsedMinutes * 0.5));
    }

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
      exposureMinutes: Number(state.exposureMinutes.toFixed(1))
    };
  }

  /**
   * Perintah kontrol manual dari pengguna (Dashboard)
   */
  async setManualFan(siloId, targetState, publishCommandFn, recordEventFn) {
    const state = this.getSiloState(siloId);
    state.fanOn = Boolean(targetState);
    state.safeCount = 0;
    state.manualOverride = true;

    console.log(`[FAN MANUAL] Perintah manual diterima: Kipas ${siloId} -> ${targetState ? 'ON' : 'OFF'}`);
    if (publishCommandFn) await publishCommandFn(siloId, targetState);
    if (recordEventFn) await recordEventFn(siloId, targetState ? 'ON' : 'OFF', 'manual');

    return {
      siloId,
      fanOn: state.fanOn,
      mode: 'manual'
    };
  }

  syncHardwareStatus(siloId, hardwareFanOn) {
    const state = this.getSiloState(siloId);
    state.fanOn = hardwareFanOn;
  }
}

export const fanController = new FanController();
