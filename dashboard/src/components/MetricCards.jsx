import React from 'react';
import { Thermometer, Droplets, Wind, Fan, Power } from 'lucide-react';

export default function MetricCards({
  temp = 27.5,
  humidity = 65.0,
  gas = 280,
  fanOn = false,
  fanTerm = 'Kipas Ventilasi',
  onToggleFan,
  isTogglingFan
}) {
  // Evaluasi status visual kartu
  const tempStatus = temp > 32 ? 'danger' : temp > 30 ? 'warning' : 'safe';
  const humStatus = humidity > 75 ? 'danger' : humidity > 70 ? 'warning' : 'safe';
  const gasStatus = gas > 700 ? 'danger' : gas > 400 ? 'warning' : 'safe';

  const getStatusBadge = (status, safeText = 'Ideal') => {
    if (status === 'danger') {
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40">Bahaya Panas</span>;
    }
    if (status === 'warning') {
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">Perlu Perhatian</span>;
    }
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">{safeText}</span>;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Suhu (DHT22) */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
              <Thermometer className="w-5 h-5" />
            </div>
            <span>Suhu Ruang</span>
          </div>
          {getStatusBadge(tempStatus, 'Sejuk (Ideal)')}
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {Number(temp).toFixed(1)}
            </span>
            <span className="text-lg font-semibold text-slate-400">°C</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Batas aman: ≤ 30.0°C</p>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              tempStatus === 'danger' ? 'bg-red-500' : tempStatus === 'warning' ? 'bg-amber-500' : 'bg-orange-400'
            }`}
            style={{ width: `${Math.min(100, (temp / 45) * 100)}%` }}
          />
        </div>
      </div>

      {/* 2. Kelembapan Udara (DHT22) */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Droplets className="w-5 h-5" />
            </div>
            <span>Kelembapan (RH)</span>
          </div>
          {getStatusBadge(humStatus, 'Kering Aman')}
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {Number(humidity).toFixed(1)}
            </span>
            <span className="text-lg font-semibold text-slate-400">%</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Batas aman: ≤ 70.0% RH</p>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              humStatus === 'danger' ? 'bg-red-500' : humStatus === 'warning' ? 'bg-amber-500' : 'bg-blue-400'
            }`}
            style={{ width: `${Math.min(100, humidity)}%` }}
          />
        </div>
      </div>

      {/* 3. Gas Pembusukan Organik (MQ-2 / MQ-135) */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Wind className="w-5 h-5" />
            </div>
            <span>Gas Pembusukan</span>
          </div>
          {getStatusBadge(gasStatus, 'Segar Normal')}
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {Math.round(gas)}
            </span>
            <span className="text-lg font-semibold text-slate-400">ppm</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Ambang waspada: ≥ 400 ppm</p>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              gasStatus === 'danger' ? 'bg-red-500' : gasStatus === 'warning' ? 'bg-amber-500' : 'bg-purple-400'
            }`}
            style={{ width: `${Math.min(100, (gas / 1000) * 100)}%` }}
          />
        </div>
      </div>

      {/* 4. Aktuator Kipas Ventilasi Lumbung */}
      <div
        className={`glass-panel rounded-2xl p-5 border flex flex-col justify-between transition-all ${
          fanOn
            ? 'border-cyan-500/60 bg-cyan-950/30 shadow-lg shadow-cyan-500/10'
            : 'border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
            <div
              className={`p-2 rounded-lg transition-colors ${
                fanOn ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              <Fan className={`w-5 h-5 ${fanOn ? 'animate-fan-spin text-cyan-300' : ''}`} />
            </div>
            <span>{fanTerm}</span>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              fanOn
                ? 'bg-cyan-500 text-slate-950 font-black animate-pulse'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {fanOn ? 'BERPUTAR' : 'MATI'}
          </span>
        </div>

        <div className="my-3">
          <div className="text-xl sm:text-2xl font-bold text-white">
            {fanOn ? 'Sirkulasi Udara Aktif' : 'Ventilasi Ditutup'}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {fanOn ? 'Meniup hawa lembap & gas keluar lumbung' : 'Kondisi mikroklimat stabil'}
          </p>
        </div>

        {/* Tombol Kontrol Manual */}
        <button
          id="btn-toggle-fan"
          onClick={() => onToggleFan(!fanOn)}
          disabled={isTogglingFan}
          className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 ${
            fanOn
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold shadow-md'
          }`}
        >
          <Power className="w-4 h-4" />
          <span>{fanOn ? 'Matikan Kipas (Manual)' : 'Nyalakan Kipas Sekarang'}</span>
        </button>
      </div>
    </div>
  );
}
