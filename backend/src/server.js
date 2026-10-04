/**
 * Server REST API & Telemetry Engine — Silo-Guard
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  getSilos,
  getSiloById,
  saveTelemetry,
  getTelemetryHistory,
  saveAlert,
  getAlerts,
  saveFanEvent,
  saveLossEstimate,
  getLatestLossEstimate,
  dataEvents
} from './db.js';

import {
  calculateRiskScore,
  determineRiskLevel,
  evaluateTrend,
  generateAlertMessages
} from './anomaly.js';

import { fanController } from './fanController.js';
import { calculateEconomics, calculateIncrementalLoss } from './economics.js';
import { mqttService } from './mqttClient.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Status level terakhir per silo untuk menghindari spam notifikasi
const lastLevelBySilo = new Map();
// Cache profil budaya yang dipilih
let currentCultureProfile = process.env.DEFAULT_CULTURE_PROFILE || 'sunda';

// Muat kamus kearifan lokal
let localWisdomData = null;
try {
  const localePath = path.resolve(__dirname, '../../locale/kearifan_lokal.json');
  localWisdomData = JSON.parse(fs.readFileSync(localePath, 'utf8'));
} catch (e) {
  console.warn('[SERVER] Tidak dapat membaca locale/kearifan_lokal.json:', e.message);
}

// Skema Validasi Telemetri dengan Zod
const telemetrySchema = z.object({
  silo_id: z.string().min(1, 'silo_id wajib diisi'),
  temp: z.coerce.number().min(-20).max(80, 'Suhu harus di antara -20 sampai 80 C'),
  humidity: z.coerce.number().min(0).max(100, 'Kelembapan harus di antara 0 sampai 100%'),
  gas: z.coerce.number().min(0).max(5000, 'Gas ppm harus valid'),
  fan: z.boolean().optional(),
  sensor_ok: z.boolean().optional().default(true),  // false = DHT22 gagal, data fallback
  ts: z.coerce.number().optional()
});

/**
 * Pipeline Pemrosesan Telemetri Terpusat (dipakai oleh MQTT & HTTP POST)
 */
export async function processTelemetryIngestion(payload) {
  const parsed = telemetrySchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Data telemetri tidak valid: ${parsed.error.issues.map(i => i.message).join(', ')}`);
  }

  const { silo_id, temp, humidity, gas, fan, sensor_ok } = parsed.data;

  // Inisialisasi/pulihkan state ekonomi hari ini dari database jika baru pertama kali dipanggil
  const latestDbEstimate = await getLatestLossEstimate(silo_id);
  fanController.initFromDbEstimate(silo_id, latestDbEstimate);

  // 1. Simpan Telemetri ke Database
  const savedTelemetry = await saveTelemetry({
    silo_id,
    temp,
    humidity,
    gas,
    fan_on: fan ?? false,
    sensor_ok: sensor_ok ?? true
  });

  // JIKA SENSOR RUSAK / NILAI FALLBACK:
  // Jangan pakai nilai fallback (27°C / 65%) untuk menghitung risiko atau kalkulasi kerugian
  if (sensor_ok === false) {
    console.warn(`[SENSOR FAULT] ${silo_id}: Sensor bermasalah — evaluasi risiko dan otomasi dilewati, status ditandai 'tidak_diketahui'`);

    // Catat alert kerusakan sensor (jika belum tercatat agar tidak spam)
    const previousLevel = lastLevelBySilo.get(silo_id);
    if (previousLevel !== 'tidak_diketahui') {
      lastLevelBySilo.set(silo_id, 'tidak_diketahui');

      await saveAlert({
        silo_id,
        level: 'waspada',
        jenis: 'SENSOR_FAULT',
        pesan_teknis: `Sensor telemetri lumbung ${silo_id} mengalami kegagalan baca (nilai suhu/kelembapan/gas adalah fallback).`,
        pesan_lokal: `Peringatan: Sensor leuit ${silo_id} nuju gangguan atawa ruksak. Geura pariksa alat sangkan pantauan teu kaganggu.`
      });
    }

    const fanStatus = fanController.getStatus(silo_id);
    const siloState = fanController.getSiloState(silo_id);

    return {
      telemetry: savedTelemetry,
      riskScore: null,
      riskLevel: 'tidak_diketahui',
      sensorFault: true,
      trend: { hasRapidTrend: false, isRising: false, tempSlopePerMin: 0, humSlopePerMin: 0, gasSlopePerMin: 0 },
      fan: {
        fanOn: fanStatus.fanOn,
        exposureMinutes: Number(siloState.cumulativeExposureMinutes.toFixed(1)),
        manualOverride: fanStatus.manualOverride,
        manualOverrideExpiresAt: fanStatus.manualOverrideExpiresAt
      },
      economics: latestDbEstimate
    };
  }

  // 2. Ambil riwayat telemetri singkat untuk deteksi tren 5 menit terakhir
  const recentHistory = await getTelemetryHistory(silo_id, { limit: 12 });
  const trend = evaluateTrend(recentHistory);

  // 3. Kalkulasi Risk Score (0 - 100)
  const riskScore = calculateRiskScore(temp, humidity, gas, trend);

  // 4. Tentukan Level Risiko (aman | waspada | bahaya)
  const currentLevel = determineRiskLevel(temp, humidity, gas, trend, riskScore);

  // 5. Evaluasi Otomasi Kipas (Histeresis & Safety Override)
  // publishFanCommand dibuat non-blocking: tidak await agar broker putus tidak menghambat pipeline
  const fanPublishFn = (sId, state) => {
    mqttService.publishFanCommand(sId, state).catch((err) =>
      console.error(`[FAN PUBLISH ERROR] Gagal publish ke ${sId}:`, err.message)
    );
  };
  const fanResult = await fanController.evaluateAutomation(
    silo_id,
    currentLevel,
    fanPublishFn,
    (sId, aksi, penyebab) => saveFanEvent({ silo_id: sId, aksi, penyebab })
  );

  // Jika Safety Override terpicu (Bahaya menimpa kunci manual): Buat Alert Khusus Keselamatan
  if (fanResult.safetyOverrideTriggered) {
    await saveAlert({
      silo_id,
      level: 'bahaya',
      jenis: 'SAFETY_OVERRIDE',
      pesan_teknis: `Kondisi BAHAYA terdeteksi saat kipas dimatikan manual. Kunci manual ditimpa otomatis dan kipas dinyalakan demi perlindungan stok gabah.`,
      pesan_lokal: `Bahaya karuksakan gabah! Kunci manual dibolaykeun sacara otomatis jeung kipas dihurungkeun deui demi kasalametan beas.`
    });
  }

  // 6. Evaluasi Perubahan Level & Notifikasi (Hanya buat alert saat level berubah)
  const previousLevel = lastLevelBySilo.get(silo_id) || 'aman';
  if (currentLevel !== previousLevel) {
    lastLevelBySilo.set(silo_id, currentLevel);

    const { jenis, pesanTeknis, pesanLokal } = generateAlertMessages(
      currentLevel,
      { temp, humidity, gas, trend },
      currentCultureProfile
    );

    await saveAlert({
      silo_id,
      level: currentLevel,
      jenis,
      pesan_teknis: pesanTeknis,
      pesan_lokal: pesanLokal
    });

    console.log(`[ALERT BARU] Level ${silo_id} berubah: ${previousLevel} -> ${currentLevel} (${pesanLokal})`);
  }

  // 7. Kalkulasi Ekonomi Kumulatif
  const silo = await getSiloById(silo_id);
  const siloState = fanController.getSiloState(silo_id);
  const now = Date.now();
  const elapsedMinutes = Math.min(60, Math.max(0.05, (now - siloState.lastEconomicsAt) / 60000));
  siloState.lastEconomicsAt = now;

  // Hitung penambahan kerugian siklus ini berdasarkan risk score saat ini
  const delta = calculateIncrementalLoss({
    stokKg: silo?.stok_kg || 5000,
    hargaPerKg: silo?.harga_per_kg || 13500,
    riskScore: riskScore,
    elapsedMinutes: elapsedMinutes,
    fanOn: fanResult.fanOn
  });

  // Tambahkan ke total akumulasi hari ini
  siloState.cumulativeLossRp += delta.deltaKerugianRp;
  siloState.cumulativeSusutKg += delta.deltaSusutKg;
  siloState.cumulativeDicegahRp += delta.deltaDicegahRp;

  const currentStock = silo?.stok_kg || 5000;
  const cumulativeSusutPercent = currentStock > 0 ? (siloState.cumulativeSusutKg / currentStock) * 100 : 0;

  const economics = calculateEconomics({
    stokKg: currentStock,
    hargaPerKg: silo?.harga_per_kg || 13500,
    riskScore: riskScore,
    exposureDurationMinutes: fanResult.exposureMinutes,
    fanOn: fanResult.fanOn,
    cumulativeLoss: {
      est_kerugian_rp: siloState.cumulativeLossRp,
      est_susut_kg: siloState.cumulativeSusutKg,
      est_susut_persen: cumulativeSusutPercent,
      est_dicegah_rp: siloState.cumulativeDicegahRp
    }
  });

  // Simpan hasil kalkulasi ekonomi ke DB
  await saveLossEstimate({
    silo_id,
    risk_score: economics.risk_score,
    est_susut_persen: economics.est_susut_persen,
    est_susut_kg: economics.est_susut_kg,
    est_kerugian_rp: economics.est_kerugian_rp,
    est_dicegah_rp: economics.est_dicegah_rp
  });

  return {
    telemetry: savedTelemetry,
    riskScore,
    riskLevel: currentLevel,
    trend,
    fan: fanResult,
    economics
  };
}

// Inisialisasi MQTT Broker Subscriber (hanya saat bukan mode test)
if (process.env.NODE_ENV !== 'test') {
  mqttService.init({
    onTelemetry: async (data, topic) => {
      try {
        const result = await processTelemetryIngestion(data);
        console.log(`[INGEST SUCCESS] ${data.silo_id} -> Suhu: ${data.temp}°C, Lembap: ${data.humidity}%, Gas: ${data.gas}ppm | Risiko: ${result.riskLevel.toUpperCase()} (Skor: ${result.riskScore})`);
      } catch (err) {
        console.error('[MQTT INGEST ERROR]:', err.message);
      }
    },
    onStatus: (data) => {
      if (data.silo_id && typeof data.fan === 'boolean') {
        fanController.syncHardwareStatus(data.silo_id, data.fan);
      }
    }
  });
}

// ================= REST API ENDPOINTS =================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Silo-Guard Backend',
    time: new Date().toISOString(),
    mqttConnected: mqttService.isConnected,
    cultureProfile: currentCultureProfile
  });
});

// GET /api/silos — Daftar lumbung
app.get('/api/silos', async (req, res) => {
  try {
    const silos = await getSilos();
    res.json({ success: true, data: silos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/silos/:id/telemetry?range= — Riwayat telemetri lumbung
app.get('/api/silos/:id/telemetry', async (req, res) => {
  try {
    const { id } = req.params;
    const { range = '1h', limit = 50 } = req.query;
    const history = await getTelemetryHistory(id, { range, limit });
    res.json({ success: true, silo_id: id, count: history.length, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/alerts — Daftar notifikasi & peringatan
app.get('/api/alerts', async (req, res) => {
  try {
    const { silo_id, limit = 20 } = req.query;
    const alerts = await getAlerts({ silo_id, limit });
    res.json({ success: true, count: alerts.length, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/silos/:id/economics — Estimasi susut bobot & kerugian ekonomi
app.get('/api/silos/:id/economics', async (req, res) => {
  try {
    const { id } = req.params;
    const estimate = await getLatestLossEstimate(id);
    const silo = await getSiloById(id);

    res.json({
      success: true,
      silo_id: id,
      silo_info: {
        nama: silo?.nama,
        komoditas: silo?.komoditas,
        stok_kg: silo?.stok_kg,
        harga_per_kg: silo?.harga_per_kg
      },
      economics: estimate
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/silos/:id/fan/status — Status kipas dan kunci manual
app.get('/api/silos/:id/fan/status', (req, res) => {
  try {
    const { id } = req.params;
    const status = fanController.getStatus(id);
    res.json({ success: true, silo_id: id, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alias GET /api/silos/:id/fan
app.get('/api/silos/:id/fan', (req, res) => {
  try {
    const { id } = req.params;
    const status = fanController.getStatus(id);
    res.json({ success: true, silo_id: id, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/silos/:id/fan — Kontrol manual kipas dari dashboard
// Body: { fan: boolean, duration?: number (menit, null = permanen) }
app.post('/api/silos/:id/fan', async (req, res) => {
  try {
    const { id } = req.params;
    const { fan, duration } = req.body;

    if (typeof fan !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Field `fan` harus berupa boolean (true/false)' });
    }

    // Validasi parameter duration:
    // undefined => default 60 menit
    // null => permanen sampai dilepas
    // angka positif => N menit
    let durationMinutes = 60;
    if (duration === null) {
      durationMinutes = null;
    } else if (duration !== undefined) {
      const parsed = Number(duration);
      if (isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Parameter `duration` tidak valid. Harus berupa angka positif (menit), null untuk permanen, atau dikosongkan untuk default 60 menit.'
        });
      }
      durationMinutes = Math.min(10080, Math.round(parsed)); // batas wajar maks 7 hari
    }

    // MQTT publish non-blocking agar REST response tidak tertahan jika broker putus
    const fanPublishFn = (sId, state) => {
      mqttService.publishFanCommand(sId, state).catch((err) =>
        console.error(`[FAN PUBLISH ERROR] Gagal publish ke ${sId}:`, err.message)
      );
    };

    const result = await fanController.setManualFan(
      id,
      fan,
      fanPublishFn,
      (sId, aksi, penyebab) => saveFanEvent({ silo_id: sId, aksi, penyebab }),
      durationMinutes
    );

    res.json({ success: true, message: `Kipas berhasil diubah ke: ${fan ? 'ON' : 'OFF'}`, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/silos/:id/fan/manual — Lepas mode manual, kembalikan ke otomasi
app.delete('/api/silos/:id/fan/manual', (req, res) => {
  try {
    const { id } = req.params;
    const result = fanController.releaseManualOverride(id);
    res.json({ success: true, message: `Mode manual ${id} dilepas. Otomasi aktif kembali.`, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/telemetry — Jalur HTTP alternatif (fallback jika MQTT tidak tersedia)
app.post('/api/telemetry', async (req, res) => {
  try {
    const result = await processTelemetryIngestion(req.body);
    res.status(201).json({ success: true, message: 'Telemetri berhasil diproses via HTTP', data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/locale — Kamus kearifan lokal & profil budaya
app.get('/api/locale', (req, res) => {
  res.json({
    success: true,
    currentProfile: currentCultureProfile,
    data: localWisdomData
  });
});

// POST /api/locale/profile — Mengganti profil budaya aktif
app.post('/api/locale/profile', (req, res) => {
  const { profile } = req.body;
  if (!localWisdomData?.profiles?.[profile]) {
    return res.status(400).json({ success: false, error: `Profil '${profile}' tidak ditemukan.` });
  }
  currentCultureProfile = profile;
  res.json({ success: true, message: `Profil budaya diubah ke ${profile}`, currentProfile: currentCultureProfile });
});

// Server-Sent Events (SSE) untuk update realtime langsung ke dashboard web
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (eventType, data) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onTelemetry = (data) => sendEvent('telemetry', data);
  const onAlert = (data) => sendEvent('alert', data);
  const onLoss = (data) => sendEvent('loss_estimate', data);
  const onFan = (data) => sendEvent('fan_event', data);

  dataEvents.on('telemetry', onTelemetry);
  dataEvents.on('alert', onAlert);
  dataEvents.on('loss_estimate', onLoss);
  dataEvents.on('fan_event', onFan);

  req.on('close', () => {
    dataEvents.off('telemetry', onTelemetry);
    dataEvents.off('alert', onAlert);
    dataEvents.off('loss_estimate', onLoss);
    dataEvents.off('fan_event', onFan);
  });
});

// Mulai Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=====================================================`);
    console.log(`  SILO-GUARD BACKEND SERVER BERJALAN DI PORT ${PORT}`);
    console.log(`  REST API : http://localhost:${PORT}/api/silos`);
    console.log(`  Health   : http://localhost:${PORT}/health`);
    console.log(`  SSE Live : http://localhost:${PORT}/api/events`);
    console.log(`=====================================================`);
  });
}

export default app;
