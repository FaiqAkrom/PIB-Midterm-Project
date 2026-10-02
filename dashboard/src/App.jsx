import React, { useState, useEffect, useMemo } from 'react';
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
  // Navigation Tab: 'overview' | 'sensor' | 'culture' | 'finance'
  const [activeTab, setActiveTab] = useState('overview');

  // Silo & Locale States
  const [silos, setSilos] = useState([
    { id: 'silo-01', nama: 'Leuit Pangraksa Sri 01', komoditas: 'Padi Ciherang (GKP)', stok_kg: 5000, harga_per_kg: 13500, lokasi: 'Kasepuhan Ciptagelar, Sukabumi' },
    { id: 'silo-02', nama: 'Lumbung Makmur Jaya 02', komoditas: 'Padi IR-64', stok_kg: 8500, harga_per_kg: 13200, lokasi: 'Desa Karanganyar, Boyolali' }
  ]);
  const [selectedSiloId, setSelectedSiloId] = useState('silo-01');
  const [cultureProfile, setCultureProfile] = useState('sunda');
  const [localeData, setLocaleData] = useState(null);

  // Telemetry & Fan State
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [currentTemp, setCurrentTemp] = useState(27.4);
  const [currentHum, setCurrentHum] = useState(64.0);
  const [currentGas, setCurrentGas] = useState(18);
  const [fanOn, setFanOn] = useState(false);
  const [isFanManual, setIsFanManual] = useState(false);

  // Alerts & Economics
  const [alerts, setAlerts] = useState([]);
  const [economics, setEconomics] = useState({
    risk_score: 10,
    est_susut_persen: 0.05,
    est_susut_kg: 2.5,
    est_kerugian_rp: 33750,
    est_dicegah_rp: 120000
  });

  const [isOnline, setIsOnline] = useState(true);
  const [timeRange, setTimeRange] = useState('1h');
  const [isSimulating, setIsSimulating] = useState(false);

  // 1. Inisialisasi Data Awal
  useEffect(() => {
    async function initData() {
      try {
        const [silosRes, localeRes] = await Promise.all([
          fetchSilos(),
          fetchLocaleData()
        ]);

        if (silosRes?.data && silosRes.data.length > 0) setSilos(silosRes.data);
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

  // 2. Muat data spesifik silo saat dipilih
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
          const latest = teleRes.data[0];
          setCurrentTemp(Number(latest.temp) || 27.4);
          setCurrentHum(Number(latest.humidity) || 64.0);
          // normalisasi gas display (ppm scale)
          const rawGas = Number(latest.gas) || 18;
          setCurrentGas(rawGas > 150 ? Math.round(rawGas / 10) : rawGas);
          setFanOn(Boolean(latest.fan_on));
        }

        if (alertsRes?.data) {
          setAlerts(alertsRes.data);
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
          const t = Number(data.temp);
          const h = Number(data.humidity);
          const rawG = Number(data.gas);
          const g = rawG > 150 ? Math.round(rawG / 10) : rawG;

          setCurrentTemp(t);
          setCurrentHum(h);
          setCurrentGas(g);
          setFanOn(Boolean(data.fan_on ?? data.fan));
          setTelemetryHistory(prev => [data, ...prev.slice(0, 39)]);
        }
      },
      onAlert: (data) => {
        if (data.silo_id === selectedSiloId) {
          setAlerts(prev => [data, ...prev]);
        }
      },
      onLoss: (data) => {
        if (data.silo_id === selectedSiloId) {
          setEconomics(data);
        }
      },
      onFan: (data) => {
        if (data.silo_id === selectedSiloId) {
          setFanOn(data.aksi === 'ON');
        }
      }
    });

    return () => unsubscribe();
  }, [selectedSiloId]);

  // Status Evaluasi (Safe / Warn / Danger)
  const evaluatedStatus = useMemo(() => {
    if (currentHum >= 78 || currentGas >= 60 || currentTemp >= 35) {
      return {
        level: 'danger',
        lossPct: 12.5,
        color: '#DE4A4A',
        badgeClass: 'bg-rose-50 text-statusDanger border border-rose-200',
        probeColor: '#DE4A4A',
        grainFillColor: '#DE4A4A',
        humLabel: 'Kritis',
        gasLabel: 'Terdeteksi Fermentasi',
        humSubtitle: 'Bahaya pembusukan aktif!'
      };
    } else if (currentHum >= 70 || currentGas >= 35 || currentTemp >= 31) {
      return {
        level: 'warn',
        lossPct: 3.5,
        color: '#E29E1B',
        badgeClass: 'bg-amber-50 text-statusWarn border border-amber-200',
        probeColor: '#E29E1B',
        grainFillColor: '#E29E1B',
        humLabel: 'Waspada',
        gasLabel: 'Uap Fermentasi Awal',
        humSubtitle: 'Uap lembap meningkat'
      };
    }
    return {
      level: 'safe',
      lossPct: 0,
      color: '#22A358',
      badgeClass: 'bg-emeraldLight text-statusGreen',
      probeColor: '#22A358',
      grainFillColor: '#22A358',
      humLabel: 'Normal',
      gasLabel: 'Bersih & Segar',
      humSubtitle: 'Kondisi seimbang optimal'
    };
  }, [currentTemp, currentHum, currentGas]);

  // Silo Info & Valuasi Aset Terlindungi
  const selectedSilo = silos.find(s => s.id === selectedSiloId) || silos[0];
  const stokKg = selectedSilo?.stok_kg || 5000;
  const hargaPerKg = selectedSilo?.harga_per_kg || 13500;
  const totalAssetVal = stokKg * hargaPerKg; // default: 5000 * 13500 = Rp 67.500.000 atau Rp 64.000.000
  const nominalKerugian = (evaluatedStatus.lossPct / 100) * totalAssetVal;

  // Arc Gauge Suhu (Rentang 20°C - 42°C)
  const pctArc = Math.min(100, Math.max(0, ((currentTemp - 20) / (42 - 20)) * 100));

  // Teks Kearifan Budaya Dinamis Sesuai Profil
  const culturalWisdom = useMemo(() => {
    if (cultureProfile === 'jawa') {
      if (evaluatedStatus.level === 'danger') {
        return {
          title: '"Awas! Gabah Kepanasen & Mambet"',
          body: 'Konsentrasi gas fermentasi jamur dan kelembapan sangat tinggi! Segera jalankan kipas dan lakukan pembalikan gabah.'
        };
      }
      if (evaluatedStatus.level === 'warn') {
        return {
          title: '"Hawa Sumuk Lan Anyep"',
          body: 'Kondensasi uap meningkat di dalam tumpukan gabah. Diperlukan sirkulasi udara berkala agar tidak memicu bau apek.'
        };
      }
      return {
        title: '"Gabah Ayem, Hawa Adhem Becik"',
        body: 'Mikroklimat stabil sesuai kaidah lumbung tradisional. Jamur pembusuk terkendali penuh dan tidak ada risiko susut bobot.'
      };
    } else if (cultureProfile === 'petani') {
      if (evaluatedStatus.level === 'danger') {
        return {
          title: '"Bahaya Kritis Pembusukan!"',
          body: 'Suhu tumpukan dan kelembapan ekstrem. Jamur aktif merusak gabah. Blower sirkulasi harus menyala penuh.'
        };
      }
      if (evaluatedStatus.level === 'warn') {
        return {
          title: '"Waspada Lembap Naik"',
          body: 'Uap air tumpukan melebihi ambang batas aman. Jalankan sirkulasi ventilasi agar tidak menimbulkan jamur.'
        };
      }
      return {
        title: '"Lumbung Aman & Terkendali"',
        body: 'Kondisi udara sejuk kering. Kualitas gabah terjamin aman dari jamur dan pembusukan biologis.'
      };
    }
    // Default: Sunda (Kasepuhan Leuit)
    if (evaluatedStatus.level === 'danger') {
      return {
        title: '"Gelar Bahaya! Pare Kakeueum Hawa Buruk"',
        body: 'Hawa pengap jeung beueus pisan, pare kakeueum uap buruk. Kipas ventilasi hurung pinuh, buru pariksa tumpukan pare!'
      };
    }
    if (evaluatedStatus.level === 'warn') {
      return {
        title: '"Kudu Taliti, Pare Mimiti Beueus"',
        body: 'Aya tanda-tanda hawa beueus haneut di jero leuit. Angin-angin kudu dibuka sangkan hawa seger ngalir lancar.'
      };
    }
    return {
      title: '"Leuit Tengtrem, Hawa Sejuk Rahayu"',
      body: 'Hawa leuit seger, gabah garing sampurna, teu aya tanda haseum atawa beueus. Padi aman kajaga berkah.'
    };
  }, [cultureProfile, evaluatedStatus.level]);

  // Handler Ganti Kipas
  const handleToggleFan = async () => {
    const nextState = !fanOn;
    setIsFanManual(true);
    setFanOn(nextState);

    try {
      await setFanState(selectedSiloId, nextState);
    } catch (e) {
      console.warn('Gagal sinkron status kipas ke backend:', e.message);
    }
  };

  // Handler Injeksi Skenario Uji Simulator
  const applyScenario = async (type) => {
    setIsSimulating(true);
    let t = 27.4, h = 64, g = 18;
    if (type === 'warn') {
      t = 31.8;
      h = 74;
      g = 39;
    } else if (type === 'danger') {
      t = 37.0;
      h = 85;
      g = 88;
    }

    setCurrentTemp(t);
    setCurrentHum(h);
    setCurrentGas(g);

    // Kirim juga ke REST backend jika tersedia agar konsisten
    try {
      await fetch(`http://localhost:3001/api/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          silo_id: selectedSiloId,
          temp: t,
          humidity: h,
          gas: g * 10
        })
      });
    } catch (e) {
      // ignore offline fallback
    } finally {
      setIsSimulating(false);
    }
  };

  // Handler Slider Virtual Sensor
  const handleSliderChange = (t, h, g) => {
    if (t !== undefined) setCurrentTemp(t);
    if (h !== undefined) setCurrentHum(h);
    if (g !== undefined) setCurrentGas(g);
  };

  return (
    <div className="bg-appBg text-textTitle font-sans antialiased min-h-screen flex selection:bg-emeraldPrimary selection:text-white w-full">
      {/* SIDEBAR NAVIGATION (SLIM ICONIC) */}
      <aside className="w-16 sm:w-20 bg-cardBg border-r border-cardBorder flex flex-col items-center py-6 justify-between flex-shrink-0 z-20">
        <div className="flex flex-col items-center space-y-7 w-full">
          {/* App Logo */}
          <div className="w-10 h-10 rounded-xl bg-emeraldLight flex items-center justify-center text-emeraldPrimary font-bold text-lg shadow-sm">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>

          {/* Nav Icons */}
          <nav className="flex flex-col space-y-3 w-full px-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full py-3 rounded-xl flex items-center justify-center transition cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-emeraldLight text-emeraldPrimary shadow-pill'
                  : 'text-textMuted hover:bg-emeraldLight/60 hover:text-emeraldPrimary'
              }`}
              title="Overview (Ringkasan)"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>

            <button
              onClick={() => setActiveTab('sensor')}
              className={`w-full py-3 rounded-xl flex items-center justify-center transition cursor-pointer ${
                activeTab === 'sensor'
                  ? 'bg-emeraldLight text-emeraldPrimary shadow-pill'
                  : 'text-textMuted hover:bg-emeraldLight/60 hover:text-emeraldPrimary'
              }`}
              title="Monitoring (Sensor IoT)"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </button>

            <button
              onClick={() => setActiveTab('culture')}
              className={`w-full py-3 rounded-xl flex items-center justify-center transition cursor-pointer ${
                activeTab === 'culture'
                  ? 'bg-emeraldLight text-emeraldPrimary shadow-pill'
                  : 'text-textMuted hover:bg-emeraldLight/60 hover:text-emeraldPrimary'
              }`}
              title="Kearifan Budaya & Tata Kelola Adat"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </button>

            <button
              onClick={() => setActiveTab('finance')}
              className={`w-full py-3 rounded-xl flex items-center justify-center transition cursor-pointer ${
                activeTab === 'finance'
                  ? 'bg-emeraldLight text-emeraldPrimary shadow-pill'
                  : 'text-textMuted hover:bg-emeraldLight/60 hover:text-emeraldPrimary'
              }`}
              title="Economic Insights (Kalkulasi Finansial)"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </button>
          </nav>
        </div>

        {/* Bottom Status / Settings */}
        <div className="flex flex-col items-center space-y-4">
          <div
            className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-statusGreen animate-pulse' : 'bg-statusDanger'}`}
            title={isOnline ? 'Terhubung Realtime (MQTT/SSE)' : 'Terputus'}
          />
          <button
            onClick={() => setActiveTab('overview')}
            className="text-textMuted hover:text-textTitle transition cursor-pointer"
            title="Pengaturan SiloGuard"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* TOP BAR (BRAND & PILL TABS) */}
        <header className="h-20 bg-cardBg/90 backdrop-blur border-b border-cardBorder px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emeraldPrimary' : 'bg-statusDanger'} inline-block`} />
              <h1 className="font-bold text-lg sm:text-xl text-textTitle tracking-tight">
                SiloGuard <span className="text-xs font-semibold text-textMuted font-mono">v2.6 Digital Twin</span>
              </h1>
            </div>

            {/* Pill Navigation Tabs (Like reference) */}
            <div className="hidden md:flex items-center space-x-1 bg-appBg p-1.5 rounded-full border border-cardBorder text-xs font-semibold">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-1.5 rounded-full transition cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-cardBg text-emeraldPrimary shadow-pill'
                    : 'text-textMuted hover:text-textTitle'
                }`}
              >
                Ringkasan
              </button>
              <button
                onClick={() => setActiveTab('sensor')}
                className={`px-4 py-1.5 rounded-full transition cursor-pointer ${
                  activeTab === 'sensor'
                    ? 'bg-cardBg text-emeraldPrimary shadow-pill'
                    : 'text-textMuted hover:text-textTitle'
                }`}
              >
                Sensor IoT
              </button>
              <button
                onClick={() => setActiveTab('culture')}
                className={`px-4 py-1.5 rounded-full transition cursor-pointer ${
                  activeTab === 'culture'
                    ? 'bg-cardBg text-emeraldPrimary shadow-pill'
                    : 'text-textMuted hover:text-textTitle'
                }`}
              >
                Kearifan Budaya
              </button>
              <button
                onClick={() => setActiveTab('finance')}
                className={`px-4 py-1.5 rounded-full transition cursor-pointer ${
                  activeTab === 'finance'
                    ? 'bg-cardBg text-emeraldPrimary shadow-pill'
                    : 'text-textMuted hover:text-textTitle'
                }`}
              >
                Kalkulasi Finansial
              </button>
            </div>
          </div>

          {/* Right Controls & Utilities */}
          <div className="flex items-center space-x-3">
            {/* Pemilih Silo Aktif */}
            <div className="hidden sm:flex items-center text-xs font-semibold bg-appBg rounded-xl px-2.5 py-1.5 border border-cardBorder">
              <span className="text-textMuted mr-1.5">Lumbung:</span>
              <select
                value={selectedSiloId}
                onChange={(e) => setSelectedSiloId(e.target.value)}
                className="bg-transparent text-textTitle font-bold focus:outline-none cursor-pointer"
              >
                {silos.map(s => (
                  <option key={s.id} value={s.id}>{s.nama}</option>
                ))}
              </select>
            </div>

            {/* Pemilih Profil Budaya */}
            <div className="hidden sm:flex items-center text-xs font-semibold bg-emeraldLight text-emeraldPrimary rounded-xl px-2.5 py-1.5 border border-emerald-200">
              <select
                value={cultureProfile}
                onChange={async (e) => {
                  const val = e.target.value;
                  setCultureProfile(val);
                  try {
                    await updateCultureProfile(val);
                  } catch (err) {
                    console.warn(err);
                  }
                }}
                className="bg-transparent font-bold focus:outline-none cursor-pointer"
              >
                <option value="sunda">Tradisi Sunda (Leuit)</option>
                <option value="jawa">Tradisi Jawa (Lumbung)</option>
                <option value="petani">Bahasa Petani Lugas</option>
              </select>
            </div>

            {/* Alert Bell Button */}
            <button
              onClick={() => setActiveTab('culture')}
              className="relative w-9 h-9 rounded-full bg-appBg flex items-center justify-center text-textMuted hover:text-textTitle transition cursor-pointer"
              title="Notifikasi & Peringatan"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {alerts.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-statusDanger" />
              )}
            </button>

            {/* User Avatar */}
            <div className="flex items-center space-x-2 pl-2">
              <div className="w-9 h-9 rounded-full bg-emeraldPrimary text-white flex items-center justify-center font-bold text-xs shadow-sm">
                FA
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT GRID */}
        <main className="p-6 space-y-6 max-w-7xl w-full mx-auto flex-1">
          {/* VIEW: RINGKASAN (OVERVIEW) */}
          {activeTab === 'overview' && (
            <>
              {/* TOP METRIC CARDS ROW */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Metric 1: Date & Status */}
                <div className="bg-cardBg p-4 rounded-2xl border border-cardBorder shadow-soft flex flex-col justify-between">
                  <div className="flex items-center space-x-1.5 text-xs text-textMuted font-medium">
                    <span className="w-2 h-2 rounded-full bg-statusGreen" />
                    <span>Jadwal Lumbung</span>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-extrabold text-textTitle font-mono">
                      {new Date().toLocaleDateString('id-ID', { day: '2-digit' })}
                    </div>
                    <span className="text-xs text-textMuted font-medium">
                      {new Date().toLocaleDateString('id-ID', { month: 'long' })}, Siklus Panen
                    </span>
                  </div>
                </div>

                {/* Metric 2: Total Gabah / Volume */}
                <div className="bg-cardBg p-4 rounded-2xl border border-cardBorder shadow-soft flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-textMuted font-medium">
                    <span>Stok Terkelola</span>
                    <span className="text-emeraldPrimary bg-emeraldLight px-2 py-0.5 rounded-full text-[11px] font-semibold">
                      Aktif
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-extrabold text-textTitle font-mono">
                      {(stokKg / 1000).toFixed(1)} <span className="text-base font-normal text-textMuted">Ton</span>
                    </div>
                    <span className="text-xs text-textMuted">Gabah Kering Panen (GKP)</span>
                  </div>
                </div>

                {/* Metric 3: Active Zones */}
                <div className="bg-cardBg p-4 rounded-2xl border border-cardBorder shadow-soft flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-textMuted font-medium">
                    <span>Sektor Pemantauan</span>
                    <span className="text-statusGreen font-bold font-mono">3 Probe</span>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-extrabold text-textTitle font-mono">
                      04 <span className="text-base font-normal text-textMuted">Ruang</span>
                    </div>
                    <span className="text-xs text-textMuted truncate" title={selectedSilo?.nama}>
                      {selectedSilo?.nama || 'Lumbung Komunal A'}
                    </span>
                  </div>
                </div>

                {/* Metric 4: Health Index / Efficiency */}
                <div className="bg-cardBg p-4 rounded-2xl border border-cardBorder shadow-soft flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-textMuted font-medium">
                    <span>Indeks Kesehatan Padi</span>
                    <span className="text-statusGreen text-[11px] font-semibold font-mono">
                      {(100 - (economics?.risk_score ?? 10)).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-extrabold text-emeraldPrimary font-mono">
                      {(100 - (economics?.risk_score ?? 10)).toFixed(1)}%
                    </div>
                    <span className="text-xs text-textMuted">Bebas Pembusukan & Jamur</span>
                  </div>
                </div>
              </div>

              {/* MAIN ISOMETRIC / FIELD VISUALIZER SECTION */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* LEFT COLUMN: SENSOR DIALS & RESOURCE PROGRESS (4 COLS) */}
                <div className="lg:col-span-4 space-y-4 flex flex-col">
                  {/* Climate / Sensor Gauge Card */}
                  <div className="bg-cardBg p-5 rounded-2xl border border-cardBorder shadow-soft flex-1 flex flex-col justify-between">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-textMuted uppercase tracking-wider">
                        Telemetri Mikroklimat
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emeraldLight text-emeraldPrimary font-bold">
                        Wokwi ESP32
                      </span>
                    </div>

                    {/* Radial Gauge Visual (Suhu) */}
                    <div className="flex flex-col items-center justify-center my-4">
                      <div className="relative w-36 h-36 flex items-center justify-center">
                        {/* SVG Arc Gauge */}
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-gray-100"
                            strokeWidth="3.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className="transition-all duration-700"
                            strokeDasharray={`${pctArc * 0.75}, 100`}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            stroke={evaluatedStatus.color}
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                          <span className="text-3xl font-extrabold text-textTitle font-mono">
                            {currentTemp.toFixed(1)}
                          </span>
                          <span className="text-xs text-textMuted font-medium">°C Suhu Inti</span>
                        </div>
                      </div>
                      <span className="text-xs text-textMuted mt-1">Rentang ideal: 24.0°C – 30.0°C</span>
                    </div>

                    {/* Resource Breakdown (Air, Gas, Ventilasi) */}
                    <div className="space-y-3 pt-3 border-t border-cardBorder">
                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-textMuted">Kelembapan Nisbi (RH)</span>
                          <span className="font-mono text-emeraldPrimary">
                            {Math.round(currentHum)}% ({evaluatedStatus.humLabel})
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.max(0, currentHum))}%`,
                              backgroundColor: evaluatedStatus.color
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-textMuted">Kadar Gas Bau / Amonia</span>
                          <span className="font-mono text-emeraldPrimary">
                            {Math.round(currentGas)} ppm ({evaluatedStatus.gasLabel})
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, (currentGas / 120) * 100)}%`,
                              backgroundColor: evaluatedStatus.color
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Toggle Blower Card (Thumb action friendly) */}
                  <div className="bg-cardBg p-4 rounded-2xl border border-cardBorder shadow-soft flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          fanOn ? 'bg-amber-50 text-accentOrange' : 'bg-gray-100 text-textMuted'
                        }`}
                      >
                        <svg
                          className={`w-5 h-5 ${fanOn ? 'fan-running' : ''}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 2v20M2 12h20" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-textTitle">Blower Sirkulasi</h4>
                        <p className="text-[11px] text-textMuted">
                          {fanOn
                            ? (isFanManual ? 'Manual Aktif' : 'Menyala Otomatis')
                            : 'Siaga (Otomatis)'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleFan}
                      className="px-3.5 py-2 rounded-xl bg-emeraldPrimary hover:bg-emeraldHover text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <span>{fanOn ? 'Matikan' : 'Nyalakan'}</span>
                    </button>
                  </div>
                </div>

                {/* RIGHT COLUMN: ISOMETRIC SILO TWIN / INTERACTIVE FIELD (8 COLS) */}
                <div className="lg:col-span-8 flex flex-col space-y-4">
                  {/* Isometric Smart Silo Viewport */}
                  <div className="relative bg-gradient-to-br from-[#2D6043] via-[#234F36] to-[#173826] rounded-3xl p-6 shadow-xl text-white overflow-hidden min-h-[380px] flex flex-col justify-between">
                    {/* Grid Lines Background Pattern */}
                    <div
                      className="absolute inset-0 opacity-10 pointer-events-none"
                      style={{
                        backgroundSize: '32px 32px',
                        backgroundImage:
                          'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)'
                      }}
                    />

                    {/* Top Floating Controls on Visualizer */}
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center space-x-2 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs">
                        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-statusGreen animate-pulse' : 'bg-statusDanger'}`} />
                        <span className="font-medium">
                          {selectedSilo?.nama || 'Silo Twin #01'} — Realtime Isometric
                        </span>
                      </div>

                      {/* Pill Tools */}
                      <div className="flex items-center space-x-1.5 bg-black/20 backdrop-blur-md p-1 rounded-full border border-white/10">
                        <button
                          onClick={() => setActiveTab('sensor')}
                          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition text-xs cursor-pointer"
                          title="Lihat Detail Grafik Sensor"
                        >
                          📈
                        </button>
                        <button
                          onClick={() => setActiveTab('culture')}
                          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition text-xs cursor-pointer"
                          title="Lihat Kearifan Budaya"
                        >
                          🌾
                        </button>
                        <button
                          onClick={() => setActiveTab('finance')}
                          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 transition text-xs cursor-pointer"
                          title="Lihat Analisis Finansial"
                        >
                          💰
                        </button>
                      </div>
                    </div>

                    {/* Isometric Silo Graphic / SVG Vector inside Visualizer */}
                    <div className="relative z-10 flex items-center justify-center my-2">
                      <svg className="w-80 h-52 filter drop-shadow-2xl" viewBox="0 0 300 200" fill="none">
                        {/* Roof Cone */}
                        <polygon points="150,20 80,60 220,60" fill="#417D5A" stroke="#71A888" strokeWidth="2" />
                        <line x1="150" y1="20" x2="150" y2="60" stroke="#71A888" strokeDasharray="2 2" />

                        {/* Cylinder Body */}
                        <rect x="80" y="60" width="140" height="95" rx="4" fill="#2A5A3F" stroke="#71A888" strokeWidth="2" />

                        {/* Grain Heap Fill Line (Dynamic Color) */}
                        <path
                          d="M82,105 Q150,95 218,105 L218,153 L82,153 Z"
                          fill={evaluatedStatus.grainFillColor}
                          fillOpacity="0.45"
                          stroke={evaluatedStatus.grainFillColor}
                          strokeWidth="1.5"
                          className="transition-all duration-700"
                        />

                        {/* Stilts / Kolong Lumbung */}
                        <line x1="90" y1="155" x2="90" y2="185" stroke="#71A888" strokeWidth="3" />
                        <line x1="125" y1="155" x2="125" y2="185" stroke="#71A888" strokeWidth="3" />
                        <line x1="175" y1="155" x2="175" y2="185" stroke="#71A888" strokeWidth="3" />
                        <line x1="210" y1="155" x2="210" y2="185" stroke="#71A888" strokeWidth="3" />

                        {/* Sensor Probe Callout (Interactive dot) */}
                        <circle
                          cx="150"
                          cy="115"
                          r="5"
                          fill={evaluatedStatus.probeColor}
                          stroke="#FFFFFF"
                          strokeWidth="2"
                          className="transition-all duration-500"
                        />
                        <circle
                          cx="150"
                          cy="115"
                          r="9"
                          stroke={evaluatedStatus.probeColor}
                          strokeWidth="1"
                          className="animate-ping"
                          opacity="0.6"
                        />

                        {/* Ventilation Rotor at Top Right */}
                        <g
                          id="isoBlowerRotor"
                          className={fanOn ? 'fan-running' : ''}
                          style={{ transformOrigin: '215px 50px' }}
                        >
                          <circle cx="215" cy="50" r="9" fill="#173826" stroke="#E87A38" strokeWidth="2" />
                          <path d="M215,43 L215,57 M208,50 L222,50" stroke="#E87A38" strokeWidth="2" />
                        </g>
                      </svg>

                      {/* Floating Glassmorphic Telemetry Badge on Visualizer */}
                      <div className="absolute bottom-4 right-4 bg-white/10 backdrop-blur-md border border-white/20 p-3.5 rounded-2xl shadow-lg max-w-[210px] text-left">
                        <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-200">
                          <span className={`w-2 h-2 rounded-full ${evaluatedStatus.level === 'danger' ? 'bg-statusDanger' : evaluatedStatus.level === 'warn' ? 'bg-statusWarn' : 'bg-statusGreen'}`} />
                          <span>Kelembapan Gabah</span>
                        </div>
                        <div className="flex items-baseline space-x-1 mt-1">
                          <span className="text-2xl font-bold font-mono">
                            {currentHum.toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-100/80 mt-0.5">
                          {evaluatedStatus.humSubtitle}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Footnote inside Isometric Map */}
                    <div className="relative z-10 flex items-center justify-between text-xs text-emerald-100/70 border-t border-white/10 pt-3">
                      <span>Sektor: {selectedSilo?.lokasi || '01-Komunal Barat'}</span>
                      <span>Kapasitas Efektif: {((stokKg / 10000) * 100).toFixed(0)}% Terisi</span>
                    </div>
                  </div>

                  {/* BOTTOM ROW INSIGHTS: FORECAST & AI RECOMMENDATION */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Financial Forecast Card */}
                    <div className="bg-cardBg p-5 rounded-2xl border border-cardBorder shadow-soft flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-textMuted uppercase">Valuasi Panen Terlindungi</span>
                          <div className="text-2xl font-extrabold text-textTitle font-mono mt-0.5">
                            Rp {totalAssetVal.toLocaleString('id-ID')}
                          </div>
                          <span className="text-[11px] text-textMuted">
                            Variansi susut bobot: {evaluatedStatus.lossPct}%
                          </span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emeraldLight text-emeraldPrimary flex items-center justify-center font-bold">
                          Rp
                        </div>
                      </div>

                      {/* Bar Comparison Chart */}
                      <div className="mt-4 pt-3 border-t border-cardBorder flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-7 h-12 bg-emeraldPrimary rounded-lg flex items-end justify-center pb-1 text-[10px] font-mono text-white font-bold">
                            {(stokKg / 1000).toFixed(0)}T
                          </div>
                          <div
                            className={`w-7 h-12 rounded-lg flex items-end justify-center pb-1 text-[10px] font-mono text-white font-bold ${
                              evaluatedStatus.level === 'danger' ? 'bg-statusDanger' : evaluatedStatus.level === 'warn' ? 'bg-statusWarn' : 'bg-accentOrange/80'
                            }`}
                          >
                            {evaluatedStatus.lossPct}%
                          </div>
                          <span className="text-xs text-textMuted">Rasio selamat vs risiko susut</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${evaluatedStatus.badgeClass}`}>
                          {evaluatedStatus.level === 'safe'
                            ? 'Rp 0 Terbuang'
                            : `Rugi: Rp ${nominalKerugian.toLocaleString('id-ID')}`}
                        </span>
                      </div>
                    </div>

                    {/* Cultural & AI Insight Card */}
                    <div className="bg-cardBg p-5 rounded-2xl border border-cardBorder shadow-soft flex flex-col justify-between">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-emeraldPrimary">
                            <span>✨</span>
                            <span>Wawasan Budaya & Agroekologis</span>
                          </div>
                          <h3 className="text-sm font-bold text-textTitle mt-1">
                            {culturalWisdom.title}
                          </h3>
                          <p className="text-xs text-textMuted mt-1 leading-relaxed">
                            {culturalWisdom.body}
                          </p>
                        </div>
                      </div>

                      {/* Action Link */}
                      <div className="mt-4 pt-3 border-t border-cardBorder flex items-center justify-between">
                        <span className="text-[11px] text-textMuted">Rekomendasi adaptasi pranata mangsa</span>
                        <button
                          onClick={() => setActiveTab('culture')}
                          className="w-8 h-8 rounded-full bg-emeraldPrimary text-white flex items-center justify-center hover:bg-emeraldHover transition shadow-sm cursor-pointer"
                          title="Lihat Pedoman Adat"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* DIGITAL TWIN VIRTUAL SLIDER CONTROLS (WOKWI TESTING CONTROLLER) */}
              <div className="bg-cardBg p-5 rounded-2xl border border-cardBorder shadow-soft">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-cardBorder gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-textTitle flex items-center gap-2">
                      <span>🎛️</span>
                      <span>Stimulator Sensor IoT Virtual (Wokwi Testing Controller)</span>
                    </h3>
                    <p className="text-xs text-textMuted">
                      Geser nilai di bawah ini untuk mensimulasikan perubahan data telemetri secara instan tanpa hardware fisik.
                    </p>
                  </div>

                  <div className="flex gap-1.5 text-xs font-semibold">
                    <button
                      onClick={() => applyScenario('safe')}
                      disabled={isSimulating}
                      className="px-3 py-1 rounded-lg bg-emeraldLight text-emeraldPrimary hover:bg-emerald-100 transition cursor-pointer"
                    >
                      Normal
                    </button>
                    <button
                      onClick={() => applyScenario('warn')}
                      disabled={isSimulating}
                      className="px-3 py-1 rounded-lg bg-amber-50 text-statusWarn border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                    >
                      Lembap
                    </button>
                    <button
                      onClick={() => applyScenario('danger')}
                      disabled={isSimulating}
                      className="px-3 py-1 rounded-lg bg-rose-50 text-statusDanger border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                    >
                      Bahaya Jamur
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 text-xs font-medium">
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-textMuted">Suhu (°C)</span>
                      <span className="font-bold font-mono text-emeraldPrimary">
                        {currentTemp.toFixed(1)} °C
                      </span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="42"
                      step="0.2"
                      value={currentTemp}
                      onChange={(e) => handleSliderChange(parseFloat(e.target.value), undefined, undefined)}
                      className="w-full accent-emeraldPrimary cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-textMuted">Kelembapan Nisbi / RH (%)</span>
                      <span className="font-bold font-mono text-emeraldPrimary">
                        {Math.round(currentHum)} %
                      </span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="95"
                      step="1"
                      value={currentHum}
                      onChange={(e) => handleSliderChange(undefined, parseFloat(e.target.value), undefined)}
                      className="w-full accent-emeraldPrimary cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-textMuted">Gas Busuk / Fermentasi (PPM)</span>
                      <span className="font-bold font-mono text-emeraldPrimary">
                        {Math.round(currentGas)} ppm
                      </span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="150"
                      step="1"
                      value={currentGas}
                      onChange={(e) => handleSliderChange(undefined, undefined, parseFloat(e.target.value))}
                      className="w-full accent-emeraldPrimary cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* VIEW: SENSOR IOT (GRAFIK DETAIL & TELEMETRI) */}
          {activeTab === 'sensor' && (
            <div className="space-y-6">
              <TrendsChart
                telemetryHistory={telemetryHistory}
                onRangeChange={setTimeRange}
                currentRange={timeRange}
              />
            </div>
          )}

          {/* VIEW: KEARIFAN BUDAYA & NOTIFIKASI ADAT */}
          {activeTab === 'culture' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AlertsList alerts={alerts} />
              <TraditionReminders profileData={localeData?.profiles?.[cultureProfile]} />
            </div>
          )}

          {/* VIEW: KALKULASI FINANSIAL & EKONOMI KOMODITAS */}
          {activeTab === 'finance' && (
            <div className="space-y-6">
              <EconomicsPanel
                economics={economics}
                siloInfo={selectedSilo}
              />
            </div>
          )}
        </main>

        {/* FOOTER */}
        <footer className="border-t border-cardBorder py-6 px-6 text-center text-xs text-textMuted">
          <p>
            SiloGuard © 2026 — Smart Silo & Grain Management Dashboard Berbasis Digital Twin IoT & Kearifan Lokal Nusantara.
          </p>
        </footer>
      </div>
    </div>
  );
}
