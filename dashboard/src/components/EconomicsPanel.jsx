import React, { useState } from 'react';
import { DollarSign, ShieldAlert, Sparkles, TrendingDown, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function EconomicsPanel({ economics = {}, siloInfo = {} }) {
  const [showFormula, setShowFormula] = useState(false);

  const riskScore = economics.risk_score ?? 10;
  const susutPersen = economics.est_susut_persen ?? 0.05;
  const susutKg = economics.est_susut_kg ?? 2.5;
  const kerugianRp = economics.est_kerugian_rp ?? 33750;
  const dicegahRp = economics.est_dicegah_rp ?? 120000;
  const stokKg = siloInfo.stok_kg || economics.stok_kg || 5000;
  const hargaPerKg = siloInfo.harga_per_kg || economics.harga_per_kg || 13500;

  // Format Rupiah
  const formatRp = (num) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="bg-cardBg rounded-2xl p-5 sm:p-6 border border-cardBorder shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-cardBorder">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emeraldLight text-emeraldPrimary flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-textTitle">Analisis Risiko Ekonomi Komoditas</h3>
            <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emeraldLight text-emeraldPrimary border border-emerald-200">
              Estimasi Simulasi
            </span>
          </div>
          <p className="text-xs text-textMuted mt-1">
            Komoditas: <strong className="text-textTitle">{siloInfo.komoditas || 'Padi Ciherang'}</strong> | Total Stok:{' '}
            <strong className="text-textTitle">{stokKg.toLocaleString('id-ID')} kg</strong> | Acuan GKP:{' '}
            <strong className="text-textTitle">{formatRp(hargaPerKg)}/kg</strong>
          </p>
        </div>

        <button
          onClick={() => setShowFormula(!showFormula)}
          className="text-xs text-textMuted hover:text-emeraldPrimary flex items-center gap-1 self-start sm:self-auto py-1 px-2.5 rounded-lg bg-appBg border border-cardBorder transition cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>{showFormula ? 'Tutup Rumus' : 'Lihat Rumus Matematis'}</span>
          {showFormula ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Rincian Rumus Transparan (Collapsible) */}
      {showFormula && (
        <div className="my-4 p-4 rounded-xl bg-appBg border border-cardBorder text-xs text-textMuted space-y-2">
          <p className="font-semibold text-emeraldPrimary">Model Matematis Susut Pascapanen (Empirical Degradation Model):</p>
          <ul className="list-disc list-inside space-y-1 text-textMuted">
            <li>
              <strong>Laju Susut Dasar:</strong> 0.002%/jam (Aman), 0.04%/jam (Waspada), 0.20%/jam (Bahaya).
            </li>
            <li>
              <strong>Faktor Pengali Gas (Ammonia/Fermentasi):</strong> 1 + (Gas &gt; 35 ppm ? ((Gas - 35)/50) : 0).
            </li>
            <li>
              <strong>Estimasi Kerugian:</strong> Susut Bobot (kg) × Harga Komoditas per kg.
            </li>
            <li>
              <strong>Nilai Tercegah:</strong> Menghitung delta kerugian yang dihemat saat kipas sirkulasi aktif menstabilkan mikroklimat lumbung.
            </li>
          </ul>
        </div>
      )}

      {/* 4 Kolom Metrik Ekonomi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        {/* 1. Skor Risiko Gabah */}
        <div className="p-4 rounded-xl bg-appBg border border-cardBorder flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-textMuted">
            <span>Skor Risiko Kerusakan</span>
            <ShieldAlert className="w-4 h-4 text-statusWarn" />
          </div>
          <div className="my-3">
            <span
              className={`text-2xl font-bold font-mono ${
                riskScore > 50
                  ? 'text-statusDanger'
                  : riskScore > 20
                  ? 'text-statusWarn'
                  : 'text-statusGreen'
              }`}
            >
              {riskScore.toFixed(0)}
              <span className="text-sm font-normal text-textMuted"> / 100</span>
            </span>
          </div>
          <div className="w-full bg-cardBorder h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                riskScore > 50 ? 'bg-statusDanger' : riskScore > 20 ? 'bg-statusWarn' : 'bg-statusGreen'
              }`}
              style={{ width: `${Math.min(riskScore, 100)}%` }}
            />
          </div>
        </div>

        {/* 2. Estimasi Susut Bobot (%) */}
        <div className="p-4 rounded-xl bg-appBg border border-cardBorder flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-textMuted">
            <span>Estimasi Susut Bobot</span>
            <TrendingDown className="w-4 h-4 text-accentOrange" />
          </div>
          <div className="my-3">
            <span className="text-2xl font-bold text-textTitle font-mono">
              {susutPersen.toFixed(2)}
              <span className="text-sm font-normal text-textMuted"> %</span>
            </span>
          </div>
          <p className="text-[11px] text-textMuted font-mono">
            Setara: <strong className="text-textTitle">{susutKg.toFixed(1)} kg</strong> gabah
          </p>
        </div>

        {/* 3. Estimasi Kerugian Finansial (Rp) */}
        <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-statusDanger">
            <span>Potensi Kerugian Berjalan</span>
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="my-3">
            <span className="text-xl font-bold text-statusDanger font-mono">
              {formatRp(kerugianRp)}
            </span>
          </div>
          <p className="text-[11px] text-rose-700">
            {kerugianRp > 100000 ? 'Kerugian perlu mitigasi cepat!' : 'Dalam toleransi alami'}
          </p>
        </div>

        {/* 4. Nilai Finansial Yang Berhasil Dicegah (Rp) */}
        <div className="p-4 rounded-xl bg-emeraldLight/70 border border-emerald-200 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-statusGreen">
            <span>Nilai Berhasil Dicegah</span>
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="my-3">
            <span className="text-xl font-bold text-statusGreen font-mono">
              {formatRp(dicegahRp)}
            </span>
          </div>
          <p className="text-[11px] text-emerald-800">
            Hasil otomatisasi sirkulasi kipas
          </p>
        </div>
      </div>
    </div>
  );
}
