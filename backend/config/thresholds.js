/**
 * Konfigurasi Ambang Batas (Thresholds) & Bobot Risiko Silo-Guard
 * Parameter ini disesuaikan dengan karakteristik penyimpanan gabah kering panen (GKP)
 * kadar air ideal 13-14%, suhu ruang optimal 24-28°C.
 */

export const THRESHOLDS = {
  // Batas Suhu (°C)
  temperature: {
    safeMax: 30.0,      // Di atas 30°C mulai waspada respirasi gabah
    dangerMax: 32.0,    // Di atas 32°C memicu perkembangan cepat serangga & jamur
    weight: 0.25        // Bobot dalam Risk Score (25%)
  },

  // Batas Kelembapan Udara (%)
  humidity: {
    safeMax: 70.0,      // Di atas 70% RH gabah mulai menyerap uap air
    dangerMax: 75.0,    // Di atas 75% RH spora kapang Aspergillus & Penicillium berkecambah
    weight: 0.45        // Bobot terbesar dalam Risk Score (45%)
  },

  // Batas Konsentrasi Gas Pembusukan / Fermentasi (ppm)
  // MQ-2 / MQ-135 mendeteksi gas volatil organik (VOC), metana, CO2 pembusukan
  gas: {
    warningThreshold: 400,  // Ambang-1: bau apek / gas respirasi aktif
    dangerThreshold: 700,   // Ambang-2: pembusukan anaerobik nyata
    weight: 0.30            // Bobot dalam Risk Score (30%)
  },

  // Deteksi Tren Kenaikan Cepat (5 Menit Terakhir)
  trend: {
    windowMinutes: 5,
    gasRateWarningPerMin: 15.0,    // Kenaikan rata-rata gas > 15 ppm/menit
    humidityRateWarningPerMin: 1.0 // Kenaikan kelembapan > 1% / menit
  },

  // Otomasi Kipas & Histeresis
  fan: {
    // Jumlah siklus telemetri stabil di zona 'aman' sebelum kipas dimatikan
    // 3 siklus @ 5 detik = 15 detik stabil aman (mencegah chattering)
    safeCyclesToTurnOff: 3
  }
};
