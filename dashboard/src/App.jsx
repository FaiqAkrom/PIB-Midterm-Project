import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import StatusBanner from './components/StatusBanner';
import MetricCards from './components/MetricCards';
import TrendsChart from './components/TrendsChart';
import EconomicsPanel from './components/EconomicsPanel';
import AlertsList from './components/AlertsList';
import TraditionReminders from './components/TraditionReminders';

import {
  fetchSilos,
  fetchTelemetry,
  fetchAlerts,
  fetchEconomics,
  fetchLocaleData,
  updateCultureProfile,
  setFanState,
  subscribeRealtimeEvents
} from './services/api';

export default function App() {
  const [silos, setSilos] = useState([]);
  const [selectedSiloId, setSelectedSiloId] = useState('silo-01');
  const [cultureProfile, setCultureProfile] = useState('sunda');
  const [localeData, setLocaleData] = useState(null);

  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [latestTelemetry, setLatestTelemetry] = useState({
    temp: 27.5,
    humidity: 65.0,
    gas: 280,
    fan_on: false,
    created_at: new Date().toISOString()
  });

  const [alerts, setAlerts] = useState([]);
  const [economics, setEconomics] = useState({
    risk_score: 12,
    est_susut_persen: 0.05,
    est_susut_kg: 2.5,
    est_kerugian_rp: 33750,
    est_dicegah_rp: 120000
  });

  const [currentLevel, setCurrentLevel] = useState('aman');
  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [timeRange, setTimeRange] = useState('1h');
  const [isTogglingFan, setIsTogglingFan] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // 1. Inisialisasi Data Dasar
  useEffect(() => {
    async function initData() {
      try {
        const [silosRes, localeRes] = await Promise.all([
          fetchSilos(),
          fetchLocaleData()
        ]);

        if (silosRes?.data) setSilos(silosRes.data);
        if (localeRes?.data) {
          setLocaleData(localeRes.data);
          if (localeRes.currentProfile) setCultureProfile(localeRes.currentProfile);
        }
      } catch (err) {
        console.warn('[INIT ERROR]:', err.message);
      }
    }
    initData();
  }, []);

  // 2. Muat data spesifik silo saat silo dipilih
  useEffect(() => {
    if (!selectedSiloId) return;

    async function loadSiloData() {
      try {
        const [teleRes, alertsRes, ecoRes] = await Promise.all([
          fetchTelemetry(selectedSiloId, timeRange),
          fetchAlerts(selectedSiloId),
          fetchEconomics(selectedSiloId)
        ]);

        if (teleRes?.data && teleRes.data.length > 0) {
          setTelemetryHistory(teleRes.data);
          setLatestTelemetry(teleRes.data[0]);
          setLastUpdated(new Date(teleRes.data[0].created_at).toLocaleTimeString('id-ID'));
        }

        if (alertsRes?.data) {
          setAlerts(alertsRes.data);
          if (alertsRes.data.length > 0) {
            setCurrentLevel(alertsRes.data[0].level || 'aman');
          }
        }

        if (ecoRes?.economics) {
          setEconomics(ecoRes.economics);
        }
      } catch (err) {
        console.warn('[LOAD SILO DATA ERROR]:', err.message);
      }
    }

    loadSiloData();
  }, [selectedSiloId, timeRange]);

  // 3. Berlangganan Realtime Event Stream (SSE & Supabase)
  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents({
      onConnectionChange: (online) => setIsOnline(online),
      onTelemetry: (data) => {
        if (data.silo_id === selectedSiloId) {
          setLatestTelemetry(prev => ({
            ...prev,
            temp: Number(data.temp),
            humidity: Number(data.humidity),
            gas: Number(data.gas),
            fan_on: Boolean(data.fan_on ?? data.fan ?? prev.fan_on),
            created_at: data.created_at || new Date().toISOString()
          }));

          setTelemetryHistory(prev => [data, ...prev.slice(0, 39)]);
          setLastUpdated(new Date().toLocaleTimeString('id-ID'));
        }
      },
      onAlert: (data) => {
        if (data.silo_id === selectedSiloId) {
          setAlerts(prev => [data, ...prev]);
          if (data.level) setCurrentLevel(data.level);
        }
      },
      onLoss: (data) => {
        if (data.silo_id === selectedSiloId) {
          setEconomics(data);
        }
      },
      onFan: (data) => {
        if (data.silo_id === selectedSiloId) {
          setLatestTelemetry(prev => ({
            ...prev,
            fan_on: data.aksi === 'ON'
          }));
        }
      }
    });

    return () => unsubscribe();
  }, [selectedSiloId]);

  // Handler Kontrol Kipas Manual
  const handleToggleFan = async (targetState) => {
    setIsTogglingFan(true);
    try {
      // Optimistic update
      setLatestTelemetry(prev => ({ ...prev, fan_on: targetState }));
      await setFanState(selectedSiloId, targetState);
    } catch (err) {
      console.error('Gagal mengubah status kipas:', err);
      // Revert if error
      setLatestTelemetry(prev => ({ ...prev, fan_on: !targetState }));
    } finally {
      setIsTogglingFan(false);
    }
  };

  // Handler Ubah Profil Budaya
  const handleChangeProfile = async (newProfile) => {
    setCultureProfile(newProfile);
    try {
      await updateCultureProfile(newProfile);
      // Refresh notifikasi agar pesan lokal terupdate
      const alertsRes = await fetchAlerts(selectedSiloId);
      if (alertsRes?.data) setAlerts(alertsRes.data);
    } catch (err) {
      console.error('Gagal mengubah profil budaya:', err);
    }
  };

  // Injeksi Simulasi Cepat (Tombol Praktis di Dashboard)
  const handleQuickSimulation = async (scenarioType) => {
    setIsSimulating(true);
    let payload = { silo_id: selectedSiloId };

    if (scenarioType === 'danger') {
      payload = { ...payload, temp: 33.4, humidity: 78.5, gas: 760 };
    } else if (scenarioType === 'warning') {
      payload = { ...payload, temp: 29.8, humidity: 73.2, gas: 430 };
    } else {
      payload = { ...payload, temp: 26.8, humidity: 64.5, gas: 260 };
    }

    try {
      const res = await fetch(`http://localhost:3001/api/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data?.data) {
        if (data.data.riskLevel) setCurrentLevel(data.data.riskLevel);
        if (data.data.fan) setLatestTelemetry(prev => ({ ...prev, fan_on: data.data.fan.fanOn }));
        if (data.data.economics) setEconomics(data.data.economics);
      }
    } catch (err) {
      console.error('Simulasi gagal:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const selectedSilo = silos.find(s => s.id === selectedSiloId) || silos[0];
  const activeProfileData = localeData?.profiles?.[cultureProfile] || null;

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col font-sans pb-12">
      {/* 1. Header */}
      <Header
        silos={silos}
        selectedSiloId={selectedSiloId}
        onSelectSilo={setSelectedSiloId}
        cultureProfile={cultureProfile}
        localeData={localeData}
        onChangeProfile={handleChangeProfile}
        isOnline={isOnline}
        lastUpdated={lastUpdated}
      />

      {/* Konten Utama */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 w-full mt-6 space-y-6 flex-1">
        {/* Banner Uji Cepat Simulasi & Informasi Lumbung */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-slate-300">
              Lumbung Aktif: <strong className="text-amber-400 font-bold">{selectedSilo?.nama || 'Leuit Pangraksa'}</strong> ({selectedSilo?.lokasi || 'Sukabumi'})
            </span>
          </div>

          {/* Tombol Demo Cepat (1-Klik untuk Penguji) */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-slate-400 font-semibold hidden md:inline">Uji Skenario Cepat:</span>
            <button
              onClick={() => handleQuickSimulation('safe')}
              disabled={isSimulating}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 font-semibold transition cursor-pointer"
            >
              Normal (Aman)
            </button>
            <button
              onClick={() => handleQuickSimulation('warning')}
              disabled={isSimulating}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 font-semibold transition cursor-pointer"
            >
              Lembap (Waspada)
            </button>
            <button
              onClick={() => handleQuickSimulation('danger')}
              disabled={isSimulating}
              className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 font-semibold transition cursor-pointer"
            >
              Busuk (Bahaya)
            </button>
          </div>
        </div>

        {/* 2. Status Banner (Aman/Waspada/Bahaya Berbahasa Lokal) */}
        <StatusBanner
          level={currentLevel}
          profileData={activeProfileData}
          riskScore={economics?.risk_score ?? 10}
        />

        {/* 3. Kartu Metrik Realtime */}
        <MetricCards
          temp={latestTelemetry.temp}
          humidity={latestTelemetry.humidity}
          gas={latestTelemetry.gas}
          fanOn={latestTelemetry.fan_on}
          fanTerm={activeProfileData?.fan_term || 'Kipas Ventilasi'}
          onToggleFan={handleToggleFan}
          isTogglingFan={isTogglingFan}
        />

        {/* 4. Panel Risiko & Kalkulasi Ekonomi */}
        <EconomicsPanel
          economics={economics}
          siloInfo={selectedSilo}
        />

        {/* 5. Grafik Tren Mikroklimat & Ambang Batas */}
        <TrendsChart
          telemetryHistory={telemetryHistory}
          onRangeChange={setTimeRange}
          currentRange={timeRange}
        />

        {/* 6. Grid Notifikasi & Pengingat Tradisi Adat */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daftar Notifikasi (Pesan Lokal Utama + Teknis Accordion) */}
          <AlertsList alerts={alerts} />

          {/* Tata Kelola Tradisi Adat & Pengingat Rutin */}
          <TraditionReminders profileData={activeProfileData} />
        </div>
      </main>

      {/* Footer Hak Cipta & Standar Pangan */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 w-full mt-10 pt-6 border-t border-slate-850 text-center text-xs text-slate-500">
        <p>
          Silo-Guard © 2026 — Digital Twin IoT Lumbung Pascapanen Berbasis Kearifan Adat Nusantara.
        </p>
        <p className="mt-1 text-[11px] text-slate-600">
          Protokol komunikasi: MQTT (ESP32 Wokwi) & Supabase Postgres Realtime. Seluruh istilah adat berstatus panduan awal.
        </p>
      </footer>
    </div>
  );
}
