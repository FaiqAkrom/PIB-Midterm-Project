/**
 * Unit Tests — Silo-Guard
 * Menguji: Deteksi Anomali, Histeresis Kipas, dan Kalkulasi Ekonomi
 */

process.env.NODE_ENV = 'test';

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateRiskScore,
  determineRiskLevel,
  evaluateTrend,
  calculateMovingAverage
} from '../src/anomaly.js';

import { fanController } from '../src/fanController.js';
import { calculateEconomics } from '../src/economics.js';
import { THRESHOLDS } from '../config/thresholds.js';

await test('1. Pengujian Deteksi Anomali & Level Risiko', async (t) => {
  await t.test('Harus mendeteksi kondisi AMAN jika suhu, kelembapan, dan gas di bawah ambang', () => {
    const temp = 26.5;
    const humidity = 64.0;
    const gas = 280;
    const trend = { hasRapidTrend: false };

    const score = calculateRiskScore(temp, humidity, gas, trend);
    const level = determineRiskLevel(temp, humidity, gas, trend, score);

    assert.ok(score < 35, `Risk score harus rendah (<35), aktual: ${score}`);
    assert.equal(level, 'aman', 'Level harus aman');
  });

  await t.test('Harus mendeteksi WASPADA jika kelembapan > 70% atau gas > 400 ppm', () => {
    const temp = 28.0;
    const humidity = 72.5; // > 70%
    const gas = 350;
    const trend = { hasRapidTrend: false };

    const score = calculateRiskScore(temp, humidity, gas, trend);
    const level = determineRiskLevel(temp, humidity, gas, trend, score);

    assert.equal(level, 'waspada', 'Level harus waspada saat kelembapan tinggi');
  });

  await t.test('Harus mendeteksi BAHAYA jika kombinasi Suhu > 32°C DAN Kelembapan > 75%', () => {
    const temp = 33.5;
    const humidity = 78.0;
    const gas = 380;
    const trend = { hasRapidTrend: false };

    const score = calculateRiskScore(temp, humidity, gas, trend);
    const level = determineRiskLevel(temp, humidity, gas, trend, score);

    assert.equal(level, 'bahaya', 'Kombinasi suhu dan kelembapan tinggi harus memicu bahaya');
  });

  await t.test('Harus mendeteksi BAHAYA jika konsentrasi gas pembusukan > 700 ppm', () => {
    const temp = 27.0;
    const humidity = 65.0;
    const gas = 780; // > 700 ppm
    const trend = { hasRapidTrend: false };

    const score = calculateRiskScore(temp, humidity, gas, trend);
    const level = determineRiskLevel(temp, humidity, gas, trend, score);

    assert.equal(level, 'bahaya', 'Gas > 700 ppm harus memicu bahaya');
  });

  await t.test('Harus mendeteksi lonjakan tren cepat dalam 5 menit terakhir', () => {
    const history = [
      { created_at: new Date(Date.now() - 4 * 60000).toISOString(), gas: 200, humidity: 62 },
      { created_at: new Date(Date.now()).toISOString(), gas: 360, humidity: 69 }
    ];

    const trend = evaluateTrend(history);
    assert.ok(trend.hasRapidTrend, 'Harus mendeteksi tren kenaikan cepat');
    assert.ok(trend.gasSlopePerMin > 15, 'Laju kenaikan gas harus di atas 15 ppm/menit');
  });
});

await test('2. Pengujian Otomasi Kipas & Histeresis', async (t) => {
  const testSiloId = 'silo-test-fan';
  const publishedCommands = [];
  const recordedEvents = [];

  const mockPublish = async (sId, state) => {
    publishedCommands.push({ sId, state });
  };

  const mockRecord = async (sId, aksi, penyebab) => {
    recordedEvents.push({ sId, aksi, penyebab });
  };

  await t.test('Kipas otomatis menyala saat level waspada/bahaya', async () => {
    const result = await fanController.evaluateAutomation(testSiloId, 'waspada', mockPublish, mockRecord);

    assert.equal(result.fanOn, true, 'Kipas harus menyala');
    assert.equal(publishedCommands.length, 1);
    assert.equal(publishedCommands[0].state, true);
    assert.equal(recordedEvents[0].aksi, 'ON');
  });

  await t.test('Kipas TIDAK langsung mati pada siklus aman pertama (efek histeresis)', async () => {
    // Siklus aman ke-1
    const res1 = await fanController.evaluateAutomation(testSiloId, 'aman', mockPublish, mockRecord);
    assert.equal(res1.fanOn, true, 'Kipas masih harus menyala di siklus aman 1');

    // Siklus aman ke-2
    const res2 = await fanController.evaluateAutomation(testSiloId, 'aman', mockPublish, mockRecord);
    assert.equal(res2.fanOn, true, 'Kipas masih harus menyala di siklus aman 2');
  });

  await t.test('Kipas mati setelah mencapai ambang batas siklus stabil aman', async () => {
    // Siklus aman ke-3 (mencapai THRESHOLDS.fan.safeCyclesToTurnOff = 3)
    const res3 = await fanController.evaluateAutomation(testSiloId, 'aman', mockPublish, mockRecord);
    assert.equal(res3.fanOn, false, 'Kipas harus mati setelah stabil aman');
    assert.equal(recordedEvents[recordedEvents.length - 1].aksi, 'OFF');
  });
});

await test('3. Pengujian Formula & Model Kalkulasi Ekonomi', async (t) => {
  await t.test('Kerugian harus 0 atau minimal saat risk score rendah', () => {
    const eco = calculateEconomics({
      stokKg: 5000,
      hargaPerKg: 13500,
      riskScore: 10,
      exposureDurationMinutes: 10,
      fanOn: false
    });

    assert.ok(eco.est_susut_persen <= 0.05, `Susut persen harus kecil: ${eco.est_susut_persen}`);
    assert.ok(eco.est_kerugian_rp < 50000, 'Kerugian rupiah harus rendah');
  });

  await t.test('Kerugian meningkat proporsional saat risiko tinggi dan durasi lama', () => {
    const eco = calculateEconomics({
      stokKg: 5000,
      hargaPerKg: 13500,
      riskScore: 85,
      exposureDurationMinutes: 60, // 1 jam di kondisi bahaya
      fanOn: false
    });

    assert.ok(eco.est_susut_persen > 0.3, `Susut persen harus signifikan: ${eco.est_susut_persen}`);
    assert.ok(eco.est_susut_kg > 15, `Susut kg harus nyata: ${eco.est_susut_kg}`);
    assert.ok(eco.est_kerugian_rp > 200000, `Estimasi kerugian rupiah: ${eco.est_kerugian_rp}`);
  });

  await t.test('Intervensi kipas harus mengurangi kerugian dan menghasilkan est_dicegah_rp positif', () => {
    const withFan = calculateEconomics({
      stokKg: 5000,
      hargaPerKg: 13500,
      riskScore: 80,
      exposureDurationMinutes: 60,
      fanOn: true
    });

    const withoutFan = calculateEconomics({
      stokKg: 5000,
      hargaPerKg: 13500,
      riskScore: 80,
      exposureDurationMinutes: 60,
      fanOn: false
    });

    assert.ok(withFan.est_kerugian_rp < withoutFan.est_kerugian_rp, 'Kerugian dengan kipas harus lebih kecil');
    assert.ok(withFan.est_dicegah_rp > 0, `Kerugian yang berhasil dicegah harus > 0: ${withFan.est_dicegah_rp}`);
  });
});

await test('4. Pengujian Kunci Manual Kipas & Safety Override', async (t) => {
  const published = [];
  const recorded = [];
  const mockPublish = async (sId, state) => { published.push({ sId, state }); };
  const mockRecord = async (sId, aksi, penyebab) => { recorded.push({ sId, aksi, penyebab }); };

  await t.test('Kunci manual dengan durasi aktif dan memblokir otomasi waspada', async () => {
    const sId = 'silo-test-manual-lock';
    // Petani mematikan kipas secara manual selama 30 menit
    const res = await fanController.setManualFan(sId, false, mockPublish, mockRecord, 30);
    assert.equal(res.fanOn, false);
    assert.equal(res.manualOverride, true);
    assert.ok(res.manualOverrideExpiresAt > Date.now());

    const state = fanController.getSiloState(sId);
    assert.equal(fanController.isManualActive(state), true, 'Mode manual harus aktif');

    // Kondisi menjadi waspada: otomasi harus DIBLOKIR oleh kunci manual
    const autoRes = await fanController.evaluateAutomation(sId, 'waspada', mockPublish, mockRecord);
    assert.equal(autoRes.fanOn, false, 'Kipas harus tetap OFF karena terkunci manual');
    assert.equal(autoRes.manualOverride, true);
  });

  await t.test('Kunci manual kedaluwarsa secara otomatis dan mengaktifkan otomasi kembali', async () => {
    const sId = 'silo-test-manual-expiry';
    await fanController.setManualFan(sId, false, mockPublish, mockRecord, 10);
    const state = fanController.getSiloState(sId);

    // Simulasikan waktu melewati batas kedaluwarsa
    state.manualOverrideExpiresAt = Date.now() - 5000; // sudah lewat 5 detik lalu

    assert.equal(fanController.isManualActive(state), false, 'Mode manual harus otomatis non-aktif');
    assert.equal(state.manualOverride, false);

    // Sekarang otomasi berjalan normal menyalakan kipas saat waspada
    const autoRes = await fanController.evaluateAutomation(sId, 'waspada', mockPublish, mockRecord);
    assert.equal(autoRes.fanOn, true, 'Kipas otomatis menyala setelah kunci manual kedaluwarsa');
  });

  await t.test('Pelepasan manual eksplisit (releaseManualOverride) mengembalikan kendali ke otomasi', async () => {
    const sId = 'silo-test-release';
    await fanController.setManualFan(sId, true, mockPublish, mockRecord, 60);
    assert.equal(fanController.getStatus(sId).manualOverride, true);

    const released = fanController.releaseManualOverride(sId);
    assert.equal(released.manualOverride, false);
    assert.equal(fanController.getStatus(sId).manualOverride, false);
  });

  await t.test('SAFETY OVERRIDE: Status BAHAYA menimpa kunci manual OFF dan memaksa kipas menyala', async () => {
    const sId = 'silo-test-safety-override';
    // Petani mematikan kipas manual saat kondisi belum bahaya
    await fanController.setManualFan(sId, false, mockPublish, mockRecord, 60);
    const stateBefore = fanController.getSiloState(sId);
    assert.equal(stateBefore.fanOn, false);
    assert.equal(fanController.isManualActive(stateBefore), true);

    // Kondisi tiba-tiba melonjak ke BAHAYA
    const evalRes = await fanController.evaluateAutomation(sId, 'bahaya', mockPublish, mockRecord);

    // Safety override harus membatalkan manual lock dan menyalakan kipas
    assert.equal(evalRes.fanOn, true, 'Kipas harus dipaksa ON demi keselamatan gabah');
    assert.equal(evalRes.manualOverride, false, 'Kunci manual harus dibatalkan');
    assert.equal(evalRes.safetyOverrideTriggered, true, 'Bendera safety override harus aktif');

    const statusAfter = fanController.getStatus(sId);
    assert.equal(statusAfter.fanOn, true);
    assert.equal(statusAfter.manualOverride, false);
  });

  await t.test('Validasi parameter duration dan endpoint GET fan status', async () => {
    const { default: app } = await import('../src/server.js');
    const server = app.listen(0);
    const port = server.address().port;

    try {
      // 1. Duration "abc" harus ditolak dengan status 400
      const res1 = await fetch(`http://localhost:${port}/api/silos/silo-01/fan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fan: true, duration: 'abc' })
      });
      assert.equal(res1.status, 400, 'Duration "abc" harus ditolak');

      // 2. Duration negatif harus ditolak dengan status 400
      const res2 = await fetch(`http://localhost:${port}/api/silos/silo-01/fan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fan: true, duration: -15 })
      });
      assert.equal(res2.status, 400, 'Duration negatif harus ditolak');

      // 3. Duration valid 45 menit harus diterima
      const res3 = await fetch(`http://localhost:${port}/api/silos/silo-01/fan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fan: true, duration: 45 })
      });
      assert.equal(res3.status, 200, 'Duration 45 harus berhasil');

      // 4. GET /api/silos/:id/fan/status mengembalikan status kunci dan hitung mundur
      const res4 = await fetch(`http://localhost:${port}/api/silos/silo-01/fan/status`);
      assert.equal(res4.status, 200);
      const body4 = await res4.json();
      assert.equal(body4.success, true);
      assert.equal(body4.data.fanOn, true);
      assert.equal(body4.data.manualOverride, true);
      assert.ok(body4.data.remainingMinutes >= 44 && body4.data.remainingMinutes <= 45);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

await test('5. Pengujian Deteksi Kegagalan Sensor (sensor_ok = false)', async (t) => {
  await t.test('Telemetri dengan sensor_ok = false dilewati dan ditandai tidak_diketahui', async () => {
    const { processTelemetryIngestion } = await import('../src/server.js');
    const { pgQuery } = await import('../src/db.js');

    // Kirim payload dengan kegagalan sensor (data fallback)
    const result = await processTelemetryIngestion({
      silo_id: 'silo-01',
      temp: 27.0, // fallback
      humidity: 65.0, // fallback
      gas: 280,
      fan: false,
      sensor_ok: false
    });

    try {
      assert.equal(result.riskScore, null, 'Risk score tidak boleh dihitung dari data fallback');
      assert.equal(result.riskLevel, 'tidak_diketahui', 'Level risiko harus tidak_diketahui');
      assert.equal(result.sensorFault, true, 'Bendera sensorFault harus bernilai true');
      assert.equal(result.telemetry.sensor_ok, false, 'sensor_ok harus tersimpan false');
    } finally {
      // Bersihkan data uji agar tidak merusak data real-time dashboard silo-01
      if (result.telemetry?.id) {
        await pgQuery('DELETE FROM telemetry WHERE id = $1', [result.telemetry.id]);
      }
      await pgQuery("DELETE FROM alerts WHERE silo_id = 'silo-01' AND jenis = 'SENSOR_FAULT' AND resolved = false");
    }
  });
});

await test('6. Pengujian Akumulasi Ekonomi Kumulatif & Reset Harian', async (t) => {
  const { calculateIncrementalLoss, getHourlyLossRate } = await import('../src/economics.js');

  await t.test('Laju bahaya (risk 85) dan laju aman (risk 10) memiliki selisih nyata', () => {
    const dangerRate = getHourlyLossRate(85, false);
    const safeRate = getHourlyLossRate(10, false);

    assert.ok(dangerRate.grossRatePerHour > safeRate.grossRatePerHour * 20, 'Laju bahaya harus jauh lebih tinggi daripada laju aman');
  });

  await t.test('Kerugian akumulatif bertambah per siklus dan TIDAK turun drastis saat kondisi pulih', () => {
    const stokKg = 5000;
    const hargaPerKg = 13500;

    // Siklus 1: Kondisi bahaya (risk 85) selama 30 menit
    const delta1 = calculateIncrementalLoss({
      stokKg,
      hargaPerKg,
      riskScore: 85,
      elapsedMinutes: 30,
      fanOn: false
    });

    // Validasi nilai uji: risk 85, 30 menit ~ Rp166.725
    assert.ok(delta1.deltaKerugianRp >= 160000 && delta1.deltaKerugianRp <= 170000,
      `Kerugian siklus 1 harus sekitar Rp166.725, aktual: ${delta1.deltaKerugianRp}`);

    // Siklus 2: Kondisi pulih ke aman (risk 10) selama 30 menit berikutnya
    const delta2 = calculateIncrementalLoss({
      stokKg,
      hargaPerKg,
      riskScore: 10,
      elapsedMinutes: 30,
      fanOn: false
    });

    assert.ok(delta2.deltaKerugianRp > 0 && delta2.deltaKerugianRp < 10000,
      `Delta siklus 2 harus kecil (~Rp4.725), aktual: ${delta2.deltaKerugianRp}`);

    // Akumulasi total kerugian:
    const totalKerugian = delta1.deltaKerugianRp + delta2.deltaKerugianRp;

    // Kerugian kumulatif harus LEBIH BESAR dari delta1, TIDAK anjlok ke delta2!
    assert.ok(totalKerugian > delta1.deltaKerugianRp,
      `Total akumulasi (${totalKerugian}) tidak boleh turun setelah kondisi pulih`);
    assert.ok(totalKerugian > 165000, 'Kerugian masa lalu tetap tersimpan secara kumulatif');
  });

  await t.test('Reset harian mereset akumulasi kerugian saat pergantian hari kalender', () => {
    const sId = 'silo-test-daily-reset';
    const state = fanController.getSiloState(sId);
    state.cumulativeLossRp = 250000;
    state.cumulativeExposureMinutes = 180;
    state.cumulativeLossDate = '2025-01-01'; // tanggal kemarin / lampau

    fanController.checkDailyReset(state, sId);

    assert.equal(state.cumulativeLossRp, 0, 'Kerugian harus direset ke 0 pada hari baru');
    assert.equal(state.cumulativeExposureMinutes, 0, 'Menit paparan harus direset');
    assert.equal(state.cumulativeLossDate, new Date().toISOString().slice(0, 10));
  });

  await t.test('Pemulihan akumulasi dari database (initFromDbEstimate) mengembalikan nilai hari ini', () => {
    const sId = 'silo-test-restore-db';
    const today = new Date().toISOString();
    const mockDbRecord = {
      est_kerugian_rp: 145000,
      est_susut_kg: 10.74,
      est_dicegah_rp: 45000,
      created_at: today
    };

    fanController.initFromDbEstimate(sId, mockDbRecord);
    const state = fanController.getSiloState(sId);

    assert.equal(state.cumulativeLossRp, 145000, 'Harus memulihkan nilai kerugian dari DB');
    assert.equal(state.cumulativeSusutKg, 10.74, 'Harus memulihkan susut kg dari DB');
  });
});

const { closeDb } = await import('../src/db.js');
await closeDb();
process.exit(0);

