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
    <div className="glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-400" />
              <span>Analisis Risiko Ekonomi Komoditas</span>
            </h3>
            <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Estimasi Simulasi
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Komoditas: <strong className="text-slate-200">{siloInfo.komoditas || 'Padi Ciherang'}</strong> | Total Stok:{' '}
            <strong className="text-slate-200">{stokKg.toLocaleString('id-ID')} kg</strong> | Acuan GKP:{' '}
            <strong className="text-slate-200">{formatRp(hargaPerKg)}/kg</strong>
          </p>
        </div>

        <button
          onClick={() => setShowFormula(!showFormula)}
          className="text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1 self-start sm:self-auto py-1 px-2 rounded-lg bg-slate-800/60 border border-slate-700 transition cursor-pointer"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>{showFormula ? 'Tutup Rumus' : 'Lihat Rumus Matematis'}</span>
          {showFormula ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Rincian Rumus Transparan (Collapsible) */}
      {showFormula && (
        <div className="my-4 p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 text-xs text-slate-300 space-y-2">
          <p className="font-semibold text-amber-400">Model Matematis Susut Pascapanen (Empirical Degradation Model):</p>
          <ul className="list-disc list-inside space-y-1 text-slate-300">
            <li>
              <strong>Laju Susut Dasar:</strong> 0.002%/jam (Aman), 0.04%/jam (Waspada), 0.20%/jam (Bahaya).
            </li>
            <li>
              <strong>Faktor Keparahan:</strong> Dipercepat non-linier oleh skor risiko: <code>(Risk / 100)^1.5 × 2.5</code>.
            </li>
            <li>
              <strong>Intervensi Kipas:</strong> Menekan laju kerusakan hingga <strong>70%</strong> saat kipas sirkulasi aktif.
            </li>
            <li>
              <strong>Susut Kg & Nilai Rupiah:</strong> <code>Stok × Susut%</code> dan <code>Susut Kg × Harga/kg</code>.
            </li>
          </ul>
          <p className="text-[11px] text-slate-400 italic">
            *Catatan: Model ini dirancang sebagai peringatan dini risiko susut, bukan timbangan analitik laboratorium.
          </p>
        </div>
      )}

      {/* Grid Kartu Ekonomi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        {/* 1. Risk Score Gauge */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Skor Kerentanan Gabah</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black ${
                riskScore > 60 ? 'text-red-400' : riskScore > 30 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {riskScore}
              </span>
              <span className="text-xs text-slate-400 font-bold">/ 100</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {riskScore > 60 ? 'Tinggi: Terjadi pembusukan aktif' : riskScore > 30 ? 'Sedang: Mulai timbul uap lembap' : 'Rendah: Gabah stabil sejuk'}
            </p>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                riskScore > 60 ? 'bg-red-500' : riskScore > 30 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
        </div>

        {/* 2. Estimasi Susut Bobot */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Estimasi Susut Bobot</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-rose-400">
                {susutPersen.toFixed(2)}%
              </span>
              <span className="text-sm font-bold text-slate-300">
                ({susutKg.toFixed(1)} kg)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Dari total stok {stokKg.toLocaleString('id-ID')} kg gabah
            </p>
          </div>
          <div className="text-[11px] text-slate-500">
            Respirasi & uap air berlebih
          </div>
        </div>

        {/* 3. Estimasi Kerugian Finansial */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Potensi Kerugian Berjalan</span>
            <DollarSign className="w-4 h-4 text-red-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-red-400">
              {formatRp(kerugianRp)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Jika kondisi saat ini tidak ditangani
            </p>
          </div>
          <div className="text-[11px] text-slate-500">
            Dihitung dari harga gabah setempat
          </div>
        </div>

        {/* 4. Kerugian Berhasil Dicegah (Intervensi Kipas) */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 to-slate-900/80 border border-emerald-500/40 flex flex-col justify-between shadow-lg shadow-emerald-500/5">
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span className="font-bold flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Kerugian Berhasil Dicegah
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-emerald-400">
              {formatRp(dicegahRp)}
            </div>
            <p className="text-xs text-emerald-300/80 mt-1">
              Diselamatkan oleh ventilasi otomatis
            </p>
          </div>
          <div className="text-[11px] text-emerald-400/60 font-medium">
            Nilai gabah terlindungi dari jamur
          </div>
        </div>
      </div>
    </div>
  );
}
