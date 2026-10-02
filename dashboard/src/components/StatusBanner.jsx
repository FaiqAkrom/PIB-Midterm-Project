import React from 'react';
import { ShieldCheck, AlertTriangle, Flame, Info } from 'lucide-react';

export default function StatusBanner({ level = 'aman', profileData, riskScore = 0 }) {
  const levels = profileData?.levels || {};
  const levelInfo = levels[level] || {
    label: level.toUpperCase(),
    description: 'Status pemantauan lumbung pangan.'
  };

  const isAman = level === 'aman';
  const isWaspada = level === 'waspada';
  const isBahaya = level === 'bahaya';

  return (
    <div
      id="status-banner"
      className={`rounded-2xl p-5 sm:p-6 transition-all duration-300 border-2 relative overflow-hidden ${
        isBahaya
          ? 'bg-red-950/40 border-red-500 glow-red'
          : isWaspada
          ? 'bg-amber-950/40 border-amber-500 glow-amber'
          : 'bg-emerald-950/40 border-emerald-500 glow-emerald'
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Ikon dan Label Status */}
        <div className="flex items-start sm:items-center gap-4">
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 border-2 shadow-lg ${
              isBahaya
                ? 'bg-red-500/20 border-red-400 text-red-400'
                : isWaspada
                ? 'bg-amber-500/20 border-amber-400 text-amber-400'
                : 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
            }`}
          >
            {isBahaya && <Flame className="w-8 h-8 sm:w-10 sm:h-10 animate-bounce" />}
            {isWaspada && <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10" />}
            {isAman && <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-400">
                Kondisi Lumbung Saat Ini
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  isBahaya
                    ? 'bg-red-500 text-white'
                    : isWaspada
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-emerald-500 text-slate-950'
                }`}
              >
                {level.toUpperCase()}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 text-white">
              {levelInfo.label}
            </h2>

            <p className="text-sm sm:text-base text-slate-200 mt-1 max-w-2xl font-medium">
              {levelInfo.description}
            </p>
          </div>
        </div>

        {/* Skor Risiko */}
        <div className="sm:self-center shrink-0 bg-slate-900/80 px-4 py-3 rounded-xl border border-white/10 text-right w-full sm:w-auto flex sm:flex-col justify-between items-center sm:items-end">
          <span className="text-xs text-slate-400 font-medium">Tingkat Risiko Kerusakan</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className={`text-2xl sm:text-3xl font-black ${
                isBahaya ? 'text-red-400' : isWaspada ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {riskScore}
            </span>
            <span className="text-xs text-slate-400 font-bold">/ 100</span>
          </div>
        </div>
      </div>
    </div>
  );
}
