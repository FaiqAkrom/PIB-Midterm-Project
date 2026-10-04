import React from 'react';
import { Warehouse, Globe, Wifi, WifiOff, Clock } from 'lucide-react';

export default function Header({
  silos = [],
  selectedSiloId,
  onSelectSilo,
  cultureProfile,
  localeData,
  onChangeProfile,
  isOnline,
  lastUpdated
}) {
  const profiles = localeData?.profiles || {};
  const currentProfileInfo = profiles[cultureProfile] || {};
  const granaryTerm = currentProfileInfo.granary_term || 'Lumbung';

  return (
    <header className="bg-silo-card/90 border-b border-silo-border sticky top-0 z-40 backdrop-blur-md px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Logo & Judul Aplikasi */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Warehouse className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Silo-Guard</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Digital Twin IoT
                </span>
              </div>
              <p className="text-xs text-slate-400">Pengawal Mikroklimat & Pangan Adat</p>
            </div>
          </div>

          {/* Indikator Online/Offline Mobile */}
          <div className="flex md:hidden items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
               style={{
                 borderColor: isOnline ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                 backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                 color: isOnline ? '#10b981' : '#ef4444'
               }}>
            {isOnline ? <Wifi className="w-3.5 h-3.5 animate-pulse" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Terhubung' : 'Terputus'}</span>
          </div>
        </div>

        {/* Kontrol: Pemilih Lumbung, Budaya, & Status */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Pilih Lumbung */}
          <div className="flex items-center gap-2 bg-silo-dark/80 px-3 py-1.5 rounded-lg border border-silo-border">
            <Warehouse className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs text-slate-400 hidden sm:inline">{granaryTerm}:</span>
            <select
              id="silo-selector"
              value={selectedSiloId}
              onChange={(e) => onSelectSilo(e.target.value)}
              className="bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer"
            >
              {silos.map(s => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.nama} ({s.id})
                </option>
              ))}
            </select>
          </div>

          {/* Pemilih Profil Kearifan Lokal */}
          <div className="flex items-center gap-2 bg-silo-dark/80 px-3 py-1.5 rounded-lg border border-silo-border">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            <select
              id="culture-profile-selector"
              value={cultureProfile}
              onChange={(e) => onChangeProfile(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-medium text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="indonesia" className="bg-slate-900 text-white">Bahasa Indonesia (Standar)</option>
              <option value="indonesia_desa" className="bg-slate-900 text-white">Bahasa Desa (Lugas)</option>
              <option value="sunda" className="bg-slate-900 text-white">Adat Sunda (Leuit)</option>
              <option value="jawa" className="bg-slate-900 text-white">Adat Jawa (Lumbung)</option>
            </select>
          </div>

          {/* Indikator Online Desktop */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold"
               style={{
                 borderColor: isOnline ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                 backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                 color: isOnline ? '#10b981' : '#ef4444'
               }}>
            {isOnline ? <Wifi className="w-4 h-4 animate-pulse" /> : <WifiOff className="w-4 h-4" />}
            <span>{isOnline ? 'Sensor Siaga (Live)' : 'Koneksi Terputus'}</span>
          </div>

          {/* Waktu Data Terakhir */}
          {lastUpdated && (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 px-2.5 py-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Update: {lastUpdated}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
