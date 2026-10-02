/**
 * Unit Tests — Silo-Guard
 * Menguji: Deteksi Anomali, Histeresis Kipas, dan Kalkulasi Ekonomi
 */

import test from 'node:test';
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

test('1. Pengujian Deteksi Anomali & Level Risiko', async (t) => {
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

test('2. Pengujian Otomasi Kipas & Histeresis', async (t) => {
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

test('3. Pengujian Formula & Model Kalkulasi Ekonomi', async (t) => {
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
