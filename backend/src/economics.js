/**
 * Modul Kalkulasi Ekonomi Pascapanen — Silo-Guard
 * 
 * PENTING: Semua kalkulasi dalam modul ini adalah ESTIMASI SIMULASI
 * berbasis model matematis indikatif, bukan data pengukuran riil laboratorium pangan.
 */

export const ECONOMIC_CONFIG = {
  // Koefisien laju susut per jam paparan buruk (fraksi dari stok)
  lossCoefficients: {
    // Pada kondisi aman (risk 0-30), susut respirasi minimal
    safeHourlyRatePercent: 0.002, 
    // Pada kondisi waspada (risk 31-60), penguapan & uap air memicu susut bobot
    warningHourlyRatePercent: 0.04,
    // Pada kondisi bahaya (risk 61-100), respirasi mikrobial & kapang merusak gabah
    dangerHourlyRatePercent: 0.20
  },

  // Efektivitas intervensi kipas ventilasi dalam menekan laju susut (70% terhindar)
  fanMitigationEfficiency: 0.70,

  // Eksponen non-linier percepatan kerusakan saat risk score mendekati 100
  riskExponent: 1.5
};

/**
 * Menghitung estimasi susut bobot (persen & kg) serta nilai kerugian (Rupiah)
 * 
 * Formula:
 * 1. Base rate ditentukan oleh level risk_score (0-100).
 * 2. Laju akselerasi = (risk_score / 100) ^ riskExponent.
 * 3. Jika kipas aktif saat kondisi buruk, laju kerusakan ditekan sebesar fanMitigationEfficiency.
 * 4. est_susut_kg = stok_kg * (est_susut_persen / 100).
 * 5. est_kerugian_rp = est_susut_kg * harga_per_kg.
 * 
 * @param {Object} params
 * @param {number} params.stokKg - Total persediaan gabah di lumbung (kg)
 * @param {number} params.hargaPerKg - Harga acuan per kg (Rp)
 * @param {number} params.riskScore - Nilai risiko saat ini (0 - 100)
 * @param {number} params.exposureDurationMinutes - Akumulasi durasi paparan kondisi saat ini (menit)
 * @param {boolean} params.fanOn - Apakah kipas saat ini aktif
 * @returns {Object} Hasil estimasi ekonomi
 */
export function calculateEconomics({
  stokKg = 5000,
  hargaPerKg = 13500,
  riskScore = 0,
  exposureDurationMinutes = 5,
  fanOn = false
}) {
  const safeStock = Math.max(0, Number(stokKg) || 0);
  const safePrice = Math.max(0, Number(hargaPerKg) || 0);
  const safeRisk = Math.min(100, Math.max(0, Number(riskScore) || 0));
  const safeMinutes = Math.max(1, Number(exposureDurationMinutes) || 1);
  const hours = safeMinutes / 60.0;

  // Tentukan koefisien dasar berdasarkan risiko
  let baseRatePerHour = ECONOMIC_CONFIG.lossCoefficients.safeHourlyRatePercent;
  if (safeRisk > 60) {
    baseRatePerHour = ECONOMIC_CONFIG.lossCoefficients.dangerHourlyRatePercent;
  } else if (safeRisk > 30) {
    baseRatePerHour = ECONOMIC_CONFIG.lossCoefficients.warningHourlyRatePercent;
  }

  // Model non-linear percepatan susut berdasarkan risk score
  const severityMultiplier = Math.pow(safeRisk / 100, ECONOMIC_CONFIG.riskExponent) * 2.5;
  
  // Laju susut tanpa intervensi kipas (% per periode waktu)
  const grossSusutPercent = Math.min(10.0, (baseRatePerHour * hours) + (severityMultiplier * 0.15 * hours));

  // Efek perlindungan kipas jika aktif saat risiko > 30
  let netSusutPercent = grossSusutPercent;
  if (fanOn && safeRisk > 30) {
    netSusutPercent = grossSusutPercent * (1.0 - ECONOMIC_CONFIG.fanMitigationEfficiency);
  }

  // Bulatkan ke 3 desimal
  const estSusutPersen = Number(netSusutPercent.toFixed(3));
  const estSusutKg = Number(((safeStock * estSusutPersen) / 100).toFixed(2));
  const estKerugianRp = Math.round(estSusutKg * safePrice);

  // Perhitungan kerugian yang berhasil dicegah berkat kipas
  const susutTanpaKipasPersen = Number(grossSusutPercent.toFixed(3));
  const susutTanpaKipasKg = Number(((safeStock * susutTanpaKipasPersen) / 100).toFixed(2));
  const potensiKerugianTanpaKipasRp = Math.round(susutTanpaKipasKg * safePrice);
  
  const estDicegahRp = Math.max(0, potensiKerugianTanpaKipasRp - estKerugianRp);

  return {
    risk_score: safeRisk,
    est_susut_persen: estSusutPersen,
    est_susut_kg: estSusutKg,
    est_kerugian_rp: estKerugianRp,
    est_dicegah_rp: estDicegahRp,
    stok_kg: safeStock,
    harga_per_kg: safePrice,
    durasi_paparan_menit: Math.round(safeMinutes),
    fan_on: fanOn,
    label_status: "ESTIMASI SIMULASI",
    disclaimer: "Angka merupakan estimasi simulasi berbasis model susut pascapanen, bukan timbangan riil laboratorium."
  };
}
