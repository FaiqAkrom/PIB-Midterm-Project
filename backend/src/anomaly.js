/**
 * Modul Deteksi Anomali & Evaluasi Risiko Pembusukan — Silo-Guard
 */

import { THRESHOLDS } from '../config/thresholds.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Muat kamus kearifan lokal
let localWisdomData = null;
try {
  const localePath = path.resolve(__dirname, '../../locale/kearifan_lokal.json');
  const fileContent = fs.readFileSync(localePath, 'utf8');
  localWisdomData = JSON.parse(fileContent);
} catch (err) {
  console.warn('[ANOMALY] Peringatan: Tidak dapat membaca kearifan_lokal.json, menggunakan fallback pesan.');
}

/**
 * Menghitung Moving Average dari deret angka
 */
export function calculateMovingAverage(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) return 0;
  const sum = dataPoints.reduce((acc, val) => acc + val, 0);
  return Number((sum / dataPoints.length).toFixed(2));
}

/**
 * Menghitung laju perubahan (trend slope) per menit dari riwayat telemetri 5 menit terakhir
 */
export function evaluateTrend(recentTelemetryHistory = []) {
  if (recentTelemetryHistory.length < 2) {
    return { rapidGasRise: false, rapidHumidityRise: false, gasSlopePerMin: 0, humiditySlopePerMin: 0 };
  }

  // Urutkan dari terlama ke terbaru
  const sorted = [...recentTelemetryHistory].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];

  const timeDiffMinutes = (new Date(newest.created_at) - new Date(oldest.created_at)) / 60000;
  if (timeDiffMinutes <= 0.1) {
    return { rapidGasRise: false, rapidHumidityRise: false, gasSlopePerMin: 0, humiditySlopePerMin: 0 };
  }

  const gasDiff = newest.gas - oldest.gas;
  const humidityDiff = newest.humidity - oldest.humidity;

  const gasSlopePerMin = Number((gasDiff / timeDiffMinutes).toFixed(2));
  const humiditySlopePerMin = Number((humidityDiff / timeDiffMinutes).toFixed(2));

  const rapidGasRise = gasSlopePerMin >= THRESHOLDS.trend.gasRateWarningPerMin;
  const rapidHumidityRise = humiditySlopePerMin >= THRESHOLDS.trend.humidityRateWarningPerMin;

  return {
    rapidGasRise,
    rapidHumidityRise,
    gasSlopePerMin,
    humiditySlopePerMin,
    hasRapidTrend: rapidGasRise || rapidHumidityRise
  };
}

/**
 * Menghitung Risk Score (0 - 100) terbobot
 */
export function calculateRiskScore(temp, humidity, gas, trend = {}) {
  // 1. Skor Suhu (0 - 100)
  let tempRisk = 0;
  if (temp > THRESHOLDS.temperature.dangerMax) {
    tempRisk = Math.min(100, 75 + (temp - THRESHOLDS.temperature.dangerMax) * 12.5);
  } else if (temp > THRESHOLDS.temperature.safeMax) {
    tempRisk = 40 + ((temp - THRESHOLDS.temperature.safeMax) / (THRESHOLDS.temperature.dangerMax - THRESHOLDS.temperature.safeMax)) * 35;
  } else if (temp > 25) {
    tempRisk = ((temp - 25) / 5) * 40;
  }

  // 2. Skor Kelembapan (0 - 100)
  let humRisk = 0;
  if (humidity > THRESHOLDS.humidity.dangerMax) {
    humRisk = Math.min(100, 75 + (humidity - THRESHOLDS.humidity.dangerMax) * 5);
  } else if (humidity > THRESHOLDS.humidity.safeMax) {
    humRisk = 40 + ((humidity - THRESHOLDS.humidity.safeMax) / (THRESHOLDS.humidity.dangerMax - THRESHOLDS.humidity.safeMax)) * 35;
  } else if (humidity > 60) {
    humRisk = ((humidity - 60) / 10) * 40;
  }

  // 3. Skor Gas (0 - 100)
  let gasRisk = 0;
  if (gas > THRESHOLDS.gas.dangerThreshold) {
    gasRisk = Math.min(100, 80 + ((gas - THRESHOLDS.gas.dangerThreshold) / 300) * 20);
  } else if (gas > THRESHOLDS.gas.warningThreshold) {
    gasRisk = 40 + ((gas - THRESHOLDS.gas.warningThreshold) / (THRESHOLDS.gas.dangerThreshold - THRESHOLDS.gas.warningThreshold)) * 40;
  } else if (gas > 200) {
    gasRisk = ((gas - 200) / 200) * 40;
  }

  // Hitung rata-rata terbobot
  let totalScore = (
    tempRisk * THRESHOLDS.temperature.weight +
    humRisk * THRESHOLDS.humidity.weight +
    gasRisk * THRESHOLDS.gas.weight
  );

  // Tambahan penalti jika ada lonjakan tren cepat
  if (trend.hasRapidTrend) {
    totalScore += 12;
  }

  return Number(Math.min(100, Math.max(0, totalScore)).toFixed(1));
}

/**
 * Menentukan Level Risiko (aman | waspada | bahaya)
 */
export function determineRiskLevel(temp, humidity, gas, trend = {}, riskScore = 0) {
  // Aturan Bahaya
  const isDangerCombined = (humidity > THRESHOLDS.humidity.dangerMax && temp > THRESHOLDS.temperature.dangerMax);
  const isDangerGas = (gas >= THRESHOLDS.gas.dangerThreshold);
  const isDangerRisk = (riskScore >= 70);

  if (isDangerCombined || isDangerGas || isDangerRisk) {
    return 'bahaya';
  }

  // Aturan Waspada
  const isWarningHumidity = (humidity > THRESHOLDS.humidity.safeMax);
  const isWarningTemp = (temp > THRESHOLDS.temperature.safeMax);
  const isWarningGas = (gas >= THRESHOLDS.gas.warningThreshold);
  const isWarningRisk = (riskScore >= 35);
  const isWarningTrend = Boolean(trend.hasRapidTrend);

  if (isWarningHumidity || isWarningTemp || isWarningGas || isWarningRisk || isWarningTrend) {
    return 'waspada';
  }

  return 'aman';
}

/**
 * Menghasilkan Pesan Teknis dan Pesan Kearifan Lokal berdasarkan anomali
 */
export function generateAlertMessages(level, details, cultureProfile = 'sunda') {
  const profile = (localWisdomData && localWisdomData.profiles && localWisdomData.profiles[cultureProfile]) 
    ? localWisdomData.profiles[cultureProfile] 
    : (localWisdomData?.profiles?.sunda || null);

  const { temp, humidity, gas, trend } = details;
  let jenis = 'kondisi_stabil';
  let pesanTeknis = `Mikroklimat lumbung normal. Suhu: ${temp}°C, Kelembapan: ${humidity}%, Gas: ${gas} ppm.`;
  let pesanLokal = profile?.alerts?.resolved || 'Kondisi lumbung aman dan terjaga.';

  if (level === 'bahaya') {
    if (humidity > THRESHOLDS.humidity.dangerMax && temp > THRESHOLDS.temperature.dangerMax) {
      jenis = 'bahaya_kombinasi_panas_lembab';
      pesanTeknis = `Kombinasi Kritis! Suhu ${temp}°C (>${THRESHOLDS.temperature.dangerMax}°C) dan Kelembapan ${humidity}% (>${THRESHOLDS.humidity.dangerMax}%) memicu percepatan pembusukan!`;
      pesanLokal = profile?.alerts?.combined_danger || 'Bahaya rangkep! Hawa panas jeung beueus ngancam pare!';
    } else if (gas >= THRESHOLDS.gas.dangerThreshold) {
      jenis = 'bahaya_gas_pembusukan';
      pesanTeknis = `Gas pembusukan mencapai ${gas} ppm (ambang bahaya >= ${THRESHOLDS.gas.dangerThreshold} ppm). Fermentasi aktif!`;
      pesanLokal = profile?.alerts?.gas_danger || 'Bau apek jeung gas pembusukan pekat! Buru pariksa leuit!';
    } else {
      jenis = 'bahaya_kelembapan_kritis';
      pesanTeknis = `Kelembapan sangat tinggi (${humidity}%). Spora jamur dapat berkembang biak dalam hitungan jam.`;
      pesanLokal = profile?.alerts?.humidity_danger || 'Uap beueus luhur pisan di leuit! Kipas ventilasi hurung.';
    }
  } else if (level === 'waspada') {
    if (trend && trend.hasRapidTrend) {
      jenis = 'waspada_tren_kenaikan_cepat';
      pesanTeknis = `Deteksi tren: Kenaikan cepat terdeteksi (Gas: +${trend.gasSlopePerMin} ppm/mnt, RH: +${trend.humiditySlopePerMin}%/mnt).`;
      pesanLokal = profile?.alerts?.rapid_trend || 'Hawa robah gancang dina 5 menit terakhir!';
    } else if (humidity > THRESHOLDS.humidity.safeMax) {
      jenis = 'waspada_kelembapan_tinggi';
      pesanTeknis = `Kelembapan ${humidity}% melebihi ambang batas ideal (${THRESHOLDS.humidity.safeMax}%).`;
      pesanLokal = profile?.alerts?.humidity_warning || 'Pare mimiti beueus, buka angin-angin leuit.';
    } else if (gas >= THRESHOLDS.gas.warningThreshold) {
      jenis = 'waspada_gas_respirasi';
      pesanTeknis = `Gas indikator lumbung mencapai ${gas} ppm (ambang waspada ${THRESHOLDS.gas.warningThreshold} ppm).`;
      pesanLokal = profile?.alerts?.gas_warning || 'Kaciri aya hawa haseum tina pare, geura pariksa tumpukan.';
    } else {
      jenis = 'waspada_suhu_meningkat';
      pesanTeknis = `Suhu lumbung ${temp}°C melampaui batas rekomendasi sejuk (${THRESHOLDS.temperature.safeMax}°C).`;
      pesanLokal = profile?.alerts?.temp_warning || 'Hawa leuit panas teuing, sirkulasi hawa kudu ditingkatkeun.';
    }
  }

  return { jenis, pesanTeknis, pesanLokal };
}
