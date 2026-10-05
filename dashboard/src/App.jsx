import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  setFanStateWithDuration,
  releaseFanManual,
  fetchFanStatus,
  subscribeRealtimeEvents
} from './services/api';

export default function App() {
  // Navigation View: 'farm' (Main My Farm layout) | 'sensor' | 'culture' | 'finance'
  const [activeView, setActiveView] = useState('farm');

  // Silo & Locale States
  const [silos, setSilos] = useState([
    { id: 'silo-01', nama: 'Leuit Pangraksa Sri 01', komoditas: 'Padi Ciherang (GKP)', stok_kg: 5000, harga_per_kg: 13500, lokasi: 'Kasepuhan Ciptagelar, Sukabumi' },
    { id: 'silo-02', nama: 'Lumbung Makmur Jaya 02', komoditas: 'Padi IR-64', stok_kg: 8500, harga_per_kg: 13200, lokasi: 'Desa Karanganyar, Boyolali' }
  ]);
  const [selectedSiloId, setSelectedSiloId] = useState('silo-01');
  const [cultureProfile, setCultureProfile] = useState(() => {
    try {
      return localStorage.getItem('silo_culture_profile') || 'indonesia';
    } catch (e) {
      return 'indonesia';
    }
  });
  const [localeData, setLocaleData] = useState(null);

  // Telemetry & Fan State
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [currentTemp, setCurrentTemp] = useState(30.0);
  const [currentHum, setCurrentHum] = useState(65.0);
  const [currentGas, setCurrentGas] = useState(18);
  const [fanOn, setFanOn] = useState(false);
  const [isFanManual, setIsFanManual] = useState(false);
  const [manualOverrideExpiresAt, setManualOverrideExpiresAt] = useState(null); // epoch ms
  const [sensorOk, setSensorOk] = useState(true); // false = DHT22 bermasalah

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
  const [toastMessage, setToastMessage] = useState(null);
  const [showSimulator, setShowSimulator] = useState(false); // Default false agar fokus memantau live Wokwi
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  const [lastLiveTelemetryAt, setLastLiveTelemetryAt] = useState(null);
  const [simulationMode, setSimulationMode] = useState('auto'); // 'auto' | 'manual'
  const manualTelemetryTimeoutRef = useRef(null);

  const isLiveDeviceActive = Boolean(lastLiveTelemetryAt && (currentTimeMs - lastLiveTelemetryAt < 12000));
  const isSimulatorLocked = isLiveDeviceActive && simulationMode === 'auto';

  // Hitung mundur live dan sinkronisasi kedaluwarsa kunci manual
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCurrentTimeMs(now);
      if (isFanManual && manualOverrideExpiresAt && now >= manualOverrideExpiresAt) {
        setIsFanManual(false);
        setManualOverrideExpiresAt(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isFanManual, manualOverrideExpiresAt]);

  // Toast notification helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Draggable Floating Card State & Handlers
  const mapContainerRef = useRef(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ startMouseX: 0, startMouseY: 0, startPosX: 0, startPosY: 0 });

  const handleCardMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: dragPos.x,
      startPosY: dragPos.y
    };

    const handleMouseMove = (ev) => {
      if (!isDraggingRef.current) return;
      const dx = ev.clientX - dragStartRef.current.startMouseX;
      const dy = ev.clientY - dragStartRef.current.startMouseY;
      let nextX = dragStartRef.current.startPosX + dx;
      let nextY = dragStartRef.current.startPosY + dy;

      if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        const cardWidth = 240;
        const cardHeight = 220;
        const minX = -(rect.width - 24 - cardWidth);
        const maxX = 16;
        const minY = -16;
        const maxY = Math.max(0, rect.height - cardHeight - 16);
        nextX = Math.max(minX, Math.min(maxX, nextX));
        nextY = Math.max(minY, Math.min(maxY, nextY));
      }
      setDragPos({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleCardTouchStart = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    const touch = e.touches[0];
    isDraggingRef.current = true;
    dragStartRef.current = {
      startMouseX: touch.clientX,
      startMouseY: touch.clientY,
      startPosX: dragPos.x,
      startPosY: dragPos.y
    };

    const handleTouchMove = (ev) => {
      if (!isDraggingRef.current) return;
      const t = ev.touches[0];
      const dx = t.clientX - dragStartRef.current.startMouseX;
      const dy = t.clientY - dragStartRef.current.startMouseY;
      let nextX = dragStartRef.current.startPosX + dx;
      let nextY = dragStartRef.current.startPosY + dy;

      if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        const cardWidth = 240;
        const cardHeight = 220;
        const minX = -(rect.width - 24 - cardWidth);
        const maxX = 16;
        const minY = -16;
        const maxY = Math.max(0, rect.height - cardHeight - 16);
        nextX = Math.max(minX, Math.min(maxX, nextX));
        nextY = Math.max(minY, Math.min(maxY, nextY));
      }
      setDragPos({ x: nextX, y: nextY });
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  };

  // Helper ganti profil bahasa / kearifan lokal
  const handleCultureProfileChange = async (newProfile) => {
    setCultureProfile(newProfile);
    try {
      localStorage.setItem('silo_culture_profile', newProfile);
    } catch (e) {}

    const profileLabels = {
      indonesia: 'Bahasa Indonesia (Standar)',
      indonesia_desa: 'Indonesia Desa (Lugas)',
      sunda: 'Kearifan Pasundan (Sunda)',
      jawa: 'Kearifan Kejawen (Jawa)'
    };
    showToast(`Bahasa dialihkan ke: ${profileLabels[newProfile] || newProfile}`);

    try {
      await updateCultureProfile(newProfile);
    } catch (err) {
      console.warn('[CULTURE UPDATE ERROR]:', err.message);
    }
  };

  // 1. Inisialisasi Data Awal
  useEffect(() => {
    async function initData() {
      try {
        const savedProfile = (() => {
          try {
            return localStorage.getItem('silo_culture_profile');
          } catch (e) {
            return null;
          }
        })();

        const [silosRes, localeRes] = await Promise.all([
          fetchSilos(),
          fetchLocaleData()
        ]);

        if (silosRes?.data && silosRes.data.length > 0) setSilos(silosRes.data);
        if (localeRes?.data) {
          setLocaleData(localeRes.data);
        }

        const effectiveProfile = savedProfile || localeRes?.currentProfile || 'indonesia';
        setCultureProfile(effectiveProfile);
        if (savedProfile && savedProfile !== localeRes?.currentProfile) {
          updateCultureProfile(savedProfile).catch(() => {});
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
        const [teleRes, alertsRes, ecoRes, fanRes] = await Promise.all([
          fetchTelemetry(selectedSiloId, timeRange),
          fetchAlerts(selectedSiloId),
          fetchEconomics(selectedSiloId),
          fetchFanStatus(selectedSiloId)
        ]);

        if (teleRes?.data && teleRes.data.length > 0) {
          setTelemetryHistory(teleRes.data);
          const latest = teleRes.data[0];
          setCurrentTemp(Number(latest.temp) || 30.0);
          setCurrentHum(Number(latest.humidity) || 65.0);
          const rawGas = Number(latest.gas) || 18;
          setCurrentGas(rawGas > 150 ? Math.round(rawGas / 10) : rawGas);
          setFanOn(Boolean(latest.fan_on));
          setSensorOk(latest.sensor_ok !== false); // undefined => true (sensor lama tanpa field)
        }

        if (fanRes?.data) {
          setFanOn(Boolean(fanRes.data.fanOn));
          setIsFanManual(Boolean(fanRes.data.manualOverride));
          setManualOverrideExpiresAt(fanRes.data.manualOverrideExpiresAt);
        }

        if (alertsRes?.data) setAlerts(alertsRes.data);
        if (ecoRes?.economics) setEconomics(ecoRes.economics);
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

          if (data.source !== 'simulator') {
            setLastLiveTelemetryAt(Date.now());
          }

          // Sinkronkan slider jika dalam mode auto (mengikuti Wokwi) atau jika paket berasal dari simulator itu sendiri
          if (simulationMode === 'auto' || data.source === 'simulator') {
            setCurrentTemp(t);
            setCurrentHum(h);
            setCurrentGas(g);
          }

          setFanOn(Boolean(data.fan_on ?? data.fan));
          setSensorOk(data.sensor_ok !== false);
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

  // Status Evaluasi Dinamis sesuai Profil Bahasa & Budaya
  const evaluatedStatus = useMemo(() => {
    const profile = localeData?.profiles?.[cultureProfile];
    const levels = profile?.levels;

    if (currentHum >= 75 || currentGas >= 50 || currentTemp >= 34) {
      return {
        level: 'danger',
        label: levels?.bahaya?.label || 'Bahaya (Kritis)',
        color: '#EF4444',
        needleDeg: 45,
        pestRisk: cultureProfile === 'sunda' ? 'Kritis' : cultureProfile === 'jawa' ? 'Bebaya Dhuwur' : 'Risiko Tinggi'
      };
    } else if (currentHum >= 70 || currentGas >= 35 || currentTemp >= 31) {
      return {
        level: 'warning',
        label: levels?.waspada?.label || 'Waspada',
        color: '#F59E0B',
        needleDeg: 15,
        pestRisk: cultureProfile === 'sunda' ? 'Waspada' : cultureProfile === 'jawa' ? 'Prayitna' : 'Risiko Sedang'
      };
    }
    return {
      level: 'safe',
      label: levels?.aman?.label || 'Aman & Optimal',
      color: '#B5EA3A',
      needleDeg: -35,
      pestRisk: cultureProfile === 'sunda' ? 'Tengtrem' : cultureProfile === 'jawa' ? 'Rahayu' : 'Risiko Rendah'
    };
  }, [currentTemp, currentHum, currentGas, localeData, cultureProfile]);

  const selectedSilo = silos.find(s => s.id === selectedSiloId) || silos[0];
  const stokKg = selectedSilo?.stok_kg || 5000;

  // Toggle Fan — mode manual 60 menit
  const handleToggleFan = async () => {
    const nextState = !fanOn;
    setIsFanManual(true);
    setFanOn(nextState);

    showToast(nextState ? '💨 Kipas dinyalakan manual (60 mnt)' : '⏹️ Kipas dimatikan manual (60 mnt)');

    try {
      const result = await setFanStateWithDuration(selectedSiloId, nextState, 60);
      if (result?.data) {
        if (typeof result.data.fanOn === 'boolean') setFanOn(result.data.fanOn);
        if (typeof result.data.manualOverride === 'boolean') setIsFanManual(result.data.manualOverride);
        if (result.data.manualOverrideExpiresAt !== undefined) {
          setManualOverrideExpiresAt(result.data.manualOverrideExpiresAt);
        }
      }
    } catch (e) {
      console.warn('Gagal sinkron status kipas:', e.message);
    }
  };

  // Lepas mode manual — kembalikan kendali ke otomasi
  const handleReleaseManual = async () => {
    setIsFanManual(false);
    setManualOverrideExpiresAt(null);
    showToast('🔄 Kipas dikembalikan ke mode otomatis');
    try {
      const result = await releaseFanManual(selectedSiloId);
      if (result?.data && typeof result.data.fanOn === 'boolean') {
        setFanOn(result.data.fanOn);
      }
    } catch (e) {
      console.warn('Gagal lepas mode manual:', e.message);
    }
  };

  // Debounced push saat menggeser slider secara manual
  const sendManualTelemetry = (newTemp, newHum, newGas = currentGas) => {
    if (manualTelemetryTimeoutRef.current) {
      clearTimeout(manualTelemetryTimeoutRef.current);
    }
    manualTelemetryTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`http://localhost:3001/api/telemetry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            silo_id: selectedSiloId,
            temp: newTemp,
            humidity: newHum,
            gas: newGas * 10,
            force_override: true
          })
        });
      } catch (e) {
        // ignore offline fallback
      }
    }, 400);
  };

  // Quick preset apply
  const applyPreset = async (type) => {
    if (isSimulatorLocked) {
      showToast('⚠️ Wokwi sedang aktif! Aktifkan "Override Manual" jika ingin menguji preset.');
      return;
    }

    let t = 27.4, h = 64, g = 18;
    if (type === 'warn') {
      t = 31.8; h = 74; g = 39;
      showToast('⚠️ Skenario Lembap diterapkan');
    } else if (type === 'danger') {
      t = 36.5; h = 82; g = 85;
      showToast('🚨 Skenario Bahaya Jamur diterapkan');
    } else {
      showToast('✅ Skenario Normal Sejuk diterapkan');
    }

    setCurrentTemp(t);
    setCurrentHum(h);
    setCurrentGas(g);

    try {
      await fetch(`http://localhost:3001/api/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          silo_id: selectedSiloId,
          temp: t,
          humidity: h,
          gas: g * 10,
          force_override: true
        })
      });
    } catch (e) {
      // ignore offline fallback
    }
  };

  return (
    <div className="w-full max-w-[1580px] bg-[#D7DDDE] rounded-[2.5rem] p-3 sm:p-5 lg:p-7 shadow-2xl flex flex-col lg:flex-row gap-5 relative overflow-hidden border border-white/40 my-auto">

      {/* TOAST POPUP */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-5 py-2.5 rounded-full text-xs font-semibold backdrop-blur-lg shadow-2xl z-50 transition-all duration-300 transform animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* ================= LEFT SLIM SIDEBAR ================= */}
      <aside className="hidden lg:flex flex-col justify-between items-center py-3 px-2 w-16 bg-[#EEF2F3]/60 backdrop-blur-md rounded-2xl border border-white/60 shrink-0">
        <div className="flex flex-col items-center gap-7 w-full">
          {/* App Brand Logo Icon */}
          <button
            onClick={() => setActiveView('farm')}
            className="w-11 h-11 bg-black text-white rounded-2xl flex items-center justify-center shadow-md hover:scale-105 transition-transform cursor-pointer"
            title="My Farm - Central Dashboard"
          >
            <svg className="w-6 h-6 fill-current text-white" viewBox="0 0 24 24">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A9.49 9.49 0 0 0 11.23 21c3.84 0 6.6-1.57 8.35-4.13C21.4 14.2 22 10.9 22 8c0-.6 0-1-.07-1.42A7.32 7.32 0 0 0 17 8zM5.5 12c1.78-2.6 4.38-4.66 7.42-5.74A11.16 11.16 0 0 0 12 3a9 9 0 0 0-9 9c0 .7.1 1.38.28 2.03A12.72 12.72 0 0 1 5.5 12z" />
            </svg>
          </button>

          {/* Navigation Icons */}
          <nav className="flex flex-col gap-4 items-center">
            {/* 1. Main Farm View */}
            <button
              onClick={() => setActiveView('farm')}
              className={`w-10 h-10 rounded-xl transition flex items-center justify-center cursor-pointer ${
                activeView === 'farm'
                  ? 'bg-white/90 text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
              title="Overview (My Farm)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>

            {/* 2. Sensor IoT Trends */}
            <button
              onClick={() => setActiveView('sensor')}
              className={`w-10 h-10 rounded-xl transition flex items-center justify-center cursor-pointer ${
                activeView === 'sensor'
                  ? 'bg-white/90 text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
              title="Sensor IoT Trends"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>

            {/* 3. Cultural Governance & Alerts */}
            <button
              onClick={() => setActiveView('culture')}
              className={`w-10 h-10 rounded-xl transition flex items-center justify-center cursor-pointer relative ${
                activeView === 'culture'
                  ? 'bg-white/90 text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
              title="Kearifan Budaya & Peringatan Adat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {alerts.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>

            {/* 4. Financial Economics */}
            <button
              onClick={() => setActiveView('finance')}
              className={`w-10 h-10 rounded-xl transition flex items-center justify-center cursor-pointer ${
                activeView === 'finance'
                  ? 'bg-white/90 text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
              title="Kalkulasi Finansial & Susut Ekonomi"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* 5. Virtual Simulator Toggle */}
            <button
              onClick={() => setShowSimulator(!showSimulator)}
              className={`w-10 h-10 rounded-xl transition flex items-center justify-center cursor-pointer ${
                showSimulator
                  ? 'bg-[#B5EA3A] text-slate-900 shadow-sm font-bold'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
              }`}
              title="Stimulator Sensor IoT (Virtual Wokwi Controller)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </button>
          </nav>
        </div>

        {/* Bottom User Avatar */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-[#B5EA3A] ring-2 ring-[#B5EA3A]/40 animate-pulse' : 'bg-rose-500'}`}
            title={isOnline ? 'Online Realtime' : 'Offline'}
          />
          <button
            onClick={() => showToast('Petani Terverifikasi: FA (Admin Silo)')}
            className="w-10 h-10 rounded-full bg-slate-300 hover:ring-2 ring-emerald-500 transition overflow-hidden flex items-center justify-center cursor-pointer"
          >
            <svg className="w-6 h-6 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ================= DASHBOARD MAIN CONTENT ================= */}
      <main className="flex-1 flex flex-col gap-5 overflow-hidden">

        {/* SENSOR FAULT BANNER — muncul jika DHT22 gagal baca */}
        {!sensorOk && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-300 text-red-700 rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-sm animate-pulse">
            <span className="text-base">⚠️</span>
            <span>
              <strong>Sensor Bermasalah!</strong> DHT22 gagal membaca — data suhu &amp; kelembapan saat ini adalah nilai fallback dan tidak dapat diandalkan. Periksa kabel sensor dan koneksi perangkat.
            </span>
          </div>
        )}

        {/* HEADER */}

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Title & Sub-controls */}
          <div className="flex items-center gap-4">
            {activeView !== 'farm' && (
              <button
                onClick={() => setActiveView('farm')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E5EAEC] hover:bg-white text-xs font-semibold text-slate-600 shadow-sm border border-white/50 transition cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                {cultureProfile === 'sunda' ? 'Mulih' : cultureProfile === 'jawa' ? 'Wangsul' : 'Kembali'}
              </button>
            )}
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                My Farm
              </h1>
              <span className="text-xs font-medium text-slate-500">
                {selectedSilo?.nama || 'Leuit Pangraksa Sri 01'} • {selectedSilo?.komoditas || 'Padi Ciherang (GKP)'}
              </span>
            </div>
          </div>

          {/* Right Header Widget Group */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Field Operations / Silo Switcher Dropdown */}
            <div className="relative">
              <select
                value={selectedSiloId}
                onChange={(e) => {
                  setSelectedSiloId(e.target.value);
                  showToast(`Lumbung dialihkan ke: ${e.target.value}`);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#E3E8EA] hover:bg-white/90 rounded-full text-xs font-semibold text-slate-700 border border-white/60 shadow-sm transition cursor-pointer focus:outline-none"
              >
                {silos.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nama} ({s.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Language & Cultural Governance Selector Dropdown */}
            <div className="relative">
              <select
                id="header-culture-selector"
                value={cultureProfile}
                onChange={(e) => handleCultureProfileChange(e.target.value)}
                className="flex items-center gap-2 px-3.5 py-2 bg-[#E3E8EA] hover:bg-white/90 rounded-full text-xs font-semibold text-slate-700 border border-white/60 shadow-sm transition cursor-pointer focus:outline-none"
                title="Pilih Bahasa & Tata Kelola Lumbung"
              >
                <option value="indonesia">Bahasa Indonesia (Standar)</option>
                <option value="indonesia_desa">Indonesia Desa (Lugas)</option>
                <option value="sunda">Sunda (Leuit Kasepuhan)</option>
                <option value="jawa">Jawa (Lumbung Kejawen)</option>
              </select>
            </div>

            {/* Weather Status Card (Real-Time IoT Climate Integration) */}
            <div className="glass-card px-4 py-2.5 flex flex-col justify-between min-w-[190px]">
              <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-600">
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
                  </svg>
                  Weather
                </span>
                <span className="text-slate-500">
                  {currentHum > 75 ? 'Humid' : currentTemp > 32 ? 'Warm' : 'Cloudy'}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div className="text-2xl font-bold text-slate-800 font-mono">
                  {currentTemp.toFixed(0)}<span className="text-sm font-semibold text-slate-500 align-top">°C</span>
                </div>
                <div className="flex flex-col text-[10px] text-slate-500 text-right">
                  <span>≈ Wind</span>
                  <span>☼ {Math.round(currentHum)}%</span>
                </div>
              </div>

              {/* Heat scale bar */}
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-500">
                <span>28°</span><span>29°</span><span>31°</span><span>32°</span><span>33°</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-lime-400 via-amber-400 to-rose-500 mt-0.5" />
            </div>

            {/* Padi Ciherang Commodity Card */}
            <div
              onClick={() => showToast('Komoditas Padi Ciherang (Silo 01): Kelembapan tumpukan terpantau')}
              className="glass-card p-2 flex flex-col justify-between w-28 h-24 relative overflow-hidden group hover:scale-[1.02] transition cursor-pointer"
            >
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-900 z-10 drop-shadow-sm">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm" /> Padi Ciherang
              </div>
              <div className="absolute inset-0 z-0">
                <img
                  src="https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?auto=format&fit=crop&w=300&q=80"
                  alt="Gabah Padi Ciherang"
                  className="w-full h-full object-cover rounded-2xl opacity-85 group-hover:scale-105 transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-white/60" />
              </div>
              {/* Pest / Status risk badge */}
              <div className="z-10 mt-auto">
                <div className={`rounded-full px-2 py-0.5 text-[9px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-sm ${
                  evaluatedStatus.level === 'danger' ? 'bg-red-500/90 text-white' : 'bg-lime-500/90 text-black'
                }`}>
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {evaluatedStatus.pestRisk}
                </div>
              </div>
            </div>

            {/* Padi IR-64 Commodity Card */}
            <div
              onClick={() => showToast('Komoditas Padi IR-64 (Silo 02): Terproteksi sistem lumbung')}
              className="glass-card p-2 flex flex-col justify-between w-28 h-24 relative overflow-hidden group hover:scale-[1.02] transition cursor-pointer"
            >
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-900 z-10 drop-shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" /> Padi IR-64
              </div>
              <div className="absolute inset-0 z-0">
                <img
                  src="https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80"
                  alt="Bulir Gabah Padi IR-64"
                  className="w-full h-full object-cover rounded-2xl opacity-85 group-hover:scale-105 transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-white/60" />
              </div>
              {/* Quality / Protection badge */}
              <div className="z-10 mt-auto">
                <div className={`rounded-full px-2 py-0.5 text-[9px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-sm ${
                  evaluatedStatus.level === 'danger' ? 'bg-amber-500/90 text-white' : 'bg-emerald-500/90 text-white'
                }`}>
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {evaluatedStatus.level === 'danger' ? 'Perlu Cek' : 'Kualitas Baik'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* VIRTUAL STIMULATOR TOOLBAR (WHEN TOGGLED) */}
        {showSimulator && (
          <div className={`glass-card p-4 flex flex-col lg:flex-row items-center justify-between gap-3 border-2 transition-all ${
            isSimulatorLocked ? 'border-emerald-500/80 bg-emerald-50/40' : 'border-[#B5EA3A] bg-white/60'
          }`}>
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isLiveDeviceActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {isLiveDeviceActive ? 'ESP32 Wokwi Live:' : 'IoT Simulator:'}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  isSimulatorLocked ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}>
                  {isSimulatorLocked ? 'Read-Only (Terkunci ke Wokwi)' : 'Mode Manual Virtual'}
                </span>
              </div>

              {/* Tombol switch mode jika Wokwi aktif */}
              {isLiveDeviceActive && (
                <button
                  onClick={() => {
                    const nextMode = simulationMode === 'auto' ? 'manual' : 'auto';
                    setSimulationMode(nextMode);
                    showToast(nextMode === 'manual' ? '⚡ Mode Manual Aktif (Override Wokwi)' : '🔒 Terkunci kembali ke Stream Wokwi');
                  }}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                    simulationMode === 'manual'
                      ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                      : 'bg-white/80 text-slate-700 border-slate-300 hover:bg-white'
                  }`}
                  title={simulationMode === 'manual' ? 'Kembali ke data stream Wokwi' : 'Izinkan pengubahan slider dan preset secara manual'}
                >
                  {simulationMode === 'manual' ? 'Kembali ke Stream Wokwi' : 'Override Manual'}
                </button>
              )}

              {/* Presets */}
              <div className="flex gap-1.5 text-xs font-semibold">
                <button
                  disabled={isSimulatorLocked}
                  onClick={() => applyPreset('safe')}
                  className={`px-3 py-1 rounded-lg transition ${
                    isSimulatorLocked
                      ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer'
                  }`}
                  title={isSimulatorLocked ? 'Terkunci karena Wokwi aktif' : 'Terapkan kondisi normal'}
                >
                  Normal
                </button>
                <button
                  disabled={isSimulatorLocked}
                  onClick={() => applyPreset('warn')}
                  className={`px-3 py-1 rounded-lg transition ${
                    isSimulatorLocked
                      ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200 cursor-pointer'
                  }`}
                  title={isSimulatorLocked ? 'Terkunci karena Wokwi aktif' : 'Terapkan kondisi lembap'}
                >
                  Lembap
                </button>
                <button
                  disabled={isSimulatorLocked}
                  onClick={() => applyPreset('danger')}
                  className={`px-3 py-1 rounded-lg transition ${
                    isSimulatorLocked
                      ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-rose-100 text-rose-800 hover:bg-rose-200 cursor-pointer'
                  }`}
                  title={isSimulatorLocked ? 'Terkunci karena Wokwi aktif' : 'Terapkan bahaya jamur'}
                >
                  Bahaya Jamur
                </button>
              </div>
            </div>

            {/* Sliders */}
            <div className="flex items-center gap-4 text-xs font-mono w-full lg:w-auto justify-end">
              <label className={`flex items-center gap-1.5 ${isSimulatorLocked ? 'opacity-70' : ''}`}>
                <span>Suhu:</span>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="0.5"
                  disabled={isSimulatorLocked}
                  value={currentTemp}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setCurrentTemp(val);
                    sendManualTelemetry(val, currentHum);
                  }}
                  className={`w-20 accent-slate-800 ${isSimulatorLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  title={isSimulatorLocked ? 'Terkunci: Nilai dikendalikan sensor DHT22 Wokwi' : 'Geser untuk ubah suhu simulasi'}
                />
                <span className="font-bold">{currentTemp.toFixed(1)}°C</span>
              </label>

              <label className={`flex items-center gap-1.5 ${isSimulatorLocked ? 'opacity-70' : ''}`}>
                <span>RH:</span>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="1"
                  disabled={isSimulatorLocked}
                  value={currentHum}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setCurrentHum(val);
                    sendManualTelemetry(currentTemp, val);
                  }}
                  className={`w-20 accent-slate-800 ${isSimulatorLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  title={isSimulatorLocked ? 'Terkunci: Nilai dikendalikan sensor DHT22 Wokwi' : 'Geser untuk ubah kelembapan simulasi'}
                />
                <span className="font-bold">{Math.round(currentHum)}%</span>
              </label>
            </div>
          </div>
        )}

        {/* MAIN VIEWPORT: MY FARM OVERVIEW */}
        {activeView === 'farm' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            {/* ================= LEFT & MIDDLE COLUMN ================= */}
            <div className="xl:col-span-6 flex flex-col gap-4">

              {/* Top Section: Schedule & Daily Tasks */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                {/* Big Schedule date card */}
                <div className="sm:col-span-5 glass-card p-5 flex flex-col justify-between bg-gradient-to-b from-white/80 to-[#E4EAEB]/80 min-h-[160px]">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 tracking-wide uppercase">
                      <span className="w-2 h-2 rounded bg-slate-600" />
                      Schedule
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 leading-snug mt-1">For The Day</h2>
                  </div>

                  <div className="flex items-baseline gap-2 mt-4">
                    <span className="text-5xl font-black text-slate-900 tracking-tight font-mono">
                      {new Date().getDate()}
                    </span>
                    <span className="text-sm font-semibold text-slate-600">
                      {new Date().toLocaleString('en-US', { month: 'long' })}
                    </span>
                  </div>
                </div>

                {/* Tasks list right side */}
                <div className="sm:col-span-7 flex flex-col gap-3">
                  {/* Task 1 (Blower Control) */}
                  <div className="flex flex-col gap-1.5">
                    <div
                      onClick={handleToggleFan}
                      className="glass-card p-4 flex items-center justify-between hover:bg-white/90 transition shadow-sm cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                          fanOn ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <svg className={`w-5 h-5 fill-current ${fanOn ? 'fan-running' : ''}`} viewBox="0 0 24 24">
                            <path d="M12 2C9.5 2 7.5 3.5 7 5.5c-2.5.5-4.5 2.5-4.5 5.5 0 5.5 5 11 9.5 11s9.5-5.5 9.5-11c0-3-2-5-4.5-5.5-.5-2-2.5-3.5-5-3.5zm0 2c1.7 0 3 1.2 3.4 2.8-.7.2-1.5.5-2.2.9-.6-.6-1.5-1-2.4-1-.3 0-.6.1-.8.2C10.4 5.2 11.1 4 12 4z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 leading-tight">
                            {fanOn ? 'Ventilation Blower' : 'Standby Blower'}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            {fanOn
                              ? isFanManual
                                ? `Manual ON – Kunci ${manualOverrideExpiresAt ? Math.max(0, Math.ceil((manualOverrideExpiresAt - currentTimeMs) / 60000)) + ' mnt' : 'aktif'}`
                                : 'Automatic Running'
                              : isFanManual
                                ? `Manual OFF – Kunci ${manualOverrideExpiresAt ? Math.max(0, Math.ceil((manualOverrideExpiresAt - currentTimeMs) / 60000)) + ' mnt' : 'aktif'}`
                                : 'Idle Standby'}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full transition ${
                        fanOn ? 'bg-[#B5EA3A] text-slate-900' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {fanOn ? 'In progress' : 'Idle'}
                      </span>
                    </div>
                    {/* Tombol Lepas Manual — muncul saat mode manual aktif */}
                    {isFanManual && (
                      <button
                        onClick={handleReleaseManual}
                        className="w-full text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl py-1.5 transition"
                      >
                        🔄 Lepas Manual — Kembalikan ke Otomasi
                      </button>
                    )}
                  </div>

                  {/* Task 2 */}
                  <div
                    onClick={() => setActiveView('culture')}
                    className="glass-card p-4 flex items-center justify-between hover:bg-white/90 transition shadow-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M20 10c0 4.99-3.34 9.17-8 10-4.66-.83-8-5.01-8-10 0-4.41 3.59-8 8-8 1.15 0 2.23.25 3.2.69C14.7 1.63 13.43 1 12 1 6.48 1 2 5.48 2 11c0 6.63 5.37 12 12 12s12-5.37 12-12c0-.34-.02-.67-.05-1H20z" />
                          <circle cx="12" cy="11" r="7" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          {cultureProfile === 'sunda'
                            ? 'Nilik Leuit & Adat'
                            : cultureProfile === 'jawa'
                            ? 'Priksa Lumbung & Adat'
                            : 'Inspeksi & Pengingat Lumbung'}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          {cultureProfile === 'indonesia'
                            ? 'Panduan tata kelola pascapanen'
                            : 'Kearifan lokal lumbung'}
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-[#B5EA3A] text-slate-900">
                      In progress
                    </span>
                  </div>
                </div>
              </div>

              {/* Middle Section: Gauges */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                {/* Gauge 1: My Farm Workers / Core Condition */}
                <div className="sm:col-span-5 glass-card p-4 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                    </svg>
                    My Farm
                  </div>

                  {/* Gauge Semi-Circle Visualization */}
                  <div className="relative flex flex-col items-center justify-center my-2">
                    <svg viewBox="0 0 200 110" className="w-40 sm:w-44 overflow-visible">
                      <defs>
                        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#84cc16" />
                          <stop offset="50%" stopColor="#eab308" />
                          <stop offset="100%" stopColor="#ef4444" />
                        </linearGradient>
                      </defs>
                      {/* Background Arc */}
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#E2E8F0" strokeWidth="8" strokeLinecap="round" />
                      {/* Value Arc */}
                      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="8" strokeDasharray="251.2" strokeDashoffset="65" strokeLinecap="round" />
                      {/* Center Needle / Indicator line */}
                      <g style={{ transform: `rotate(${evaluatedStatus.needleDeg}deg)`, transformOrigin: '100px 100px', transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                        <line x1="100" y1="100" x2="100" y2="28" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))" />
                      </g>
                      <circle cx="100" cy="100" r="5" fill="#475569" />
                    </svg>
                    {/* Center Metric Text */}
                    <div className="text-center -mt-2">
                      <span className="text-[11px] text-slate-500 font-medium block">Workers</span>
                      <span className="text-2xl font-black text-slate-900 font-mono">50</span>
                    </div>
                  </div>
                </div>

                {/* Gauge 2: Crop Distribution Meter */}
                <div className="sm:col-span-7 glass-card p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                      <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                      </svg>
                      Crop Distribution
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-600 font-medium">
                      <div className="flex flex-col gap-0.5 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-slate-400">● Ciherang</span>
                          <span className="font-bold text-slate-700">38.5%</span>
                          <span className="text-slate-500 text-[10px]">14.5 Ha</span>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-rose-400">● IR-64</span>
                          <span className="font-bold text-slate-700">32.3%</span>
                          <span className="text-slate-500 text-[10px]">13.5 Ha</span>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-amber-400">● Pandan W</span>
                          <span className="font-bold text-slate-700">29.2%</span>
                          <span className="text-slate-500 text-[10px]">18.5 Ha</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Semi-circle Arch Gauge */}
                  <div className="relative flex flex-col items-center justify-center mt-1">
                    <svg viewBox="0 0 240 130" className="w-52 sm:w-56 overflow-visible">
                      <defs>
                        <linearGradient id="cropDistGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#84cc16" />
                          <stop offset="50%" stopColor="#38bdf8" />
                          <stop offset="85%" stopColor="#f43f5e" />
                        </linearGradient>
                      </defs>
                      {/* Background semi-arc */}
                      <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="#E2E8F0" strokeWidth="10" strokeLinecap="round" />
                      {/* Colored active arc (70% filled) */}
                      <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="url(#cropDistGrad)" strokeWidth="10" strokeDasharray="314" strokeDashoffset="94" strokeLinecap="round" />
                    </svg>
                    {/* Center Text metric */}
                    <div className="text-center -mt-8">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Hectares</span>
                      <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">45.4</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Farm Acres & Yield */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                {/* Farm Acres Card with Landscape Image */}
                <div className="sm:col-span-5 glass-card relative overflow-hidden p-4 min-h-[170px] flex flex-col justify-between group">
                  <img
                    src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80"
                    alt="Aerial Farm Acres"
                    className="absolute inset-0 w-full h-full object-cover rounded-2xl group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/50" />

                  <div className="relative z-10 flex items-center justify-between text-white">
                    <span className="text-xs font-semibold flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-md">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      Farm Acres
                    </span>
                  </div>

                  {/* Crosshair center icon mockup */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
                    <svg className="w-12 h-12 text-white/80" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </div>

                  <div className="relative z-10 text-white mt-auto">
                    <div className="text-[11px] text-white/70 font-medium">Acres</div>
                    <div className="text-3xl font-extrabold tracking-tight font-mono">850</div>
                  </div>
                </div>

                {/* Yield Chart Card */}
                <div className="sm:col-span-7 glass-card p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                      <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                      Yield & Output
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1 text-slate-600 font-medium">
                        <span className="w-2 h-2 rounded-full bg-[#B5EA3A]" /> Expected
                      </span>
                      <span className="flex items-center gap-1 text-slate-600 font-medium">
                        <span className="w-2 h-2 rounded-full bg-rose-500" /> Actual
                      </span>
                    </div>
                  </div>

                  {/* Yield headline value */}
                  <div className="text-center my-1">
                    <div className="text-2xl font-black text-slate-900 leading-none font-mono">
                      {(stokKg / 10).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">Tones</div>
                  </div>

                  {/* Bar chart visualization */}
                  <div className="h-28 w-full flex items-end justify-between px-2 pt-2 border-b border-slate-200">
                    {/* Yield 1 */}
                    <div className="flex flex-col items-center gap-1 group">
                      <div className="flex items-end gap-1 h-20">
                        <div className="w-2 bg-[#B5EA3A] rounded-t-full transition-all group-hover:brightness-110" style={{height:'3rem'}} title="Expected: 420" />
                        <div className="w-2 bg-rose-500 rounded-t-full transition-all group-hover:brightness-110" style={{height:'3.5rem'}} title="Actual: 470" />
                      </div>
                      <span className="text-[9px] text-slate-500 font-semibold">Yield 1</span>
                    </div>

                    {/* Yield 2 */}
                    <div className="flex flex-col items-center gap-1 group">
                      <div className="flex items-end gap-1 h-20">
                        <div className="w-2 bg-[#B5EA3A] rounded-t-full transition-all group-hover:brightness-110" style={{height:'3.5rem'}} />
                        <div className="w-2 bg-rose-500 rounded-t-full transition-all group-hover:brightness-110" style={{height:'3rem'}} />
                      </div>
                      <span className="text-[9px] text-slate-500 font-semibold">Yield 2</span>
                    </div>

                    {/* Yield 3 (Highlighted Peak) */}
                    <div className="flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-3 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                      <div className="flex items-end gap-1 h-20">
                        <div className="w-2 bg-[#B5EA3A] rounded-t-full transition-all group-hover:brightness-110" style={{height:'4rem'}} />
                        <div className="w-2 bg-rose-500 rounded-t-full transition-all group-hover:brightness-110 shadow-sm" style={{height:'4.5rem'}} />
                      </div>
                      <span className="text-[9px] text-slate-900 font-bold">Yield 3</span>
                    </div>

                    {/* Yield 4 */}
                    <div className="flex flex-col items-center gap-1 group">
                      <div className="flex items-end gap-1 h-20">
                        <div className="w-2 bg-[#B5EA3A] rounded-t-full transition-all group-hover:brightness-110" style={{height:'3.75rem'}} />
                        <div className="w-2 bg-rose-500 rounded-t-full transition-all group-hover:brightness-110" style={{height:'3.5rem'}} />
                      </div>
                      <span className="text-[9px] text-slate-500 font-semibold">Yield 4</span>
                    </div>

                    {/* Yield 5 */}
                    <div className="flex flex-col items-center gap-1 group">
                      <div className="flex items-end gap-1 h-20">
                        <div className="w-2 bg-[#B5EA3A] rounded-t-full transition-all group-hover:brightness-110" style={{height:'2.75rem'}} />
                        <div className="w-2 bg-rose-500 rounded-t-full transition-all group-hover:brightness-110" style={{height:'3.75rem'}} />
                      </div>
                      <span className="text-[9px] text-slate-500 font-semibold">Yield 5</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* ================= RIGHT SATELLITE FIELD MONITORING AND NDVI ZONE ================= */}
            <div ref={mapContainerRef} className="xl:col-span-6 relative rounded-[2rem] overflow-hidden min-h-[440px] xl:min-h-full border border-white/60 shadow-xl group">

              {/* Satellite Base Map Image */}
              <img
                src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1600&q=85"
                alt="Satellite Aerial Farmland"
                className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-700 ease-out"
              />

              {/* Secondary Aerial Tint for agriculture feel */}
              <div className="absolute inset-0 bg-emerald-950/20 mix-blend-multiply pointer-events-none" />

              {/* SVG Multispectral NDVI Polygon Overlay */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 700" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="ndviGradient" x1="20%" y1="90%" x2="80%" y2="20%">
                    <stop offset="0%" stopColor="#15803d" stopOpacity="0.92" />
                    <stop offset="35%" stopColor="#22c55e" stopOpacity="0.9" />
                    <stop offset="55%" stopColor="#eab308" stopOpacity="0.88" />
                    <stop offset="75%" stopColor="#f97316" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.96" />
                  </linearGradient>

                  <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Precision Selected Parcel Zone with multispectral colors */}
                <polygon
                  points="230,550 490,440 680,240 540,160 450,290 310,380"
                  fill="url(#ndviGradient)"
                  stroke="#FFFFFF"
                  strokeWidth="3.5"
                  strokeDasharray="6,4"
                  className="ndvi-polygon"
                  filter="url(#softGlow)"
                />

                {/* Internal Contour / Irrigation Ditch line */}
                <polyline
                  points="330,480 370,440 370,410 400,390 420,340 440,320 480,290"
                  fill="none"
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>

              {/* Top Right Fullscreen Icon */}
              <button
                onClick={() => showToast('NDVI Multispectral: Zoom 100%')}
                className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white backdrop-blur-md flex items-center justify-center transition border border-white/20 cursor-pointer"
                title="Fullscreen Map"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>

              {/* Floating Draggable Moisture / Water Card */}
              <div
                onMouseDown={handleCardMouseDown}
                onTouchStart={handleCardTouchStart}
                style={{
                  transform: `translate3d(${dragPos.x}px, ${dragPos.y}px, 0)`,
                  touchAction: 'none'
                }}
                className="absolute top-6 right-6 z-30 glass-card-dark p-4 w-60 shadow-2xl text-white select-none cursor-grab active:cursor-grabbing transition-shadow hover:shadow-cyan-500/25 border border-white/20 backdrop-blur-md"
                title="Tahan & geser untuk memindahkan jendela ini. Dobel-klik untuk reset posisi."
                onDoubleClick={() => setDragPos({ x: 0, y: 0 })}
              >
                {/* Drag Handle Bar Indicator */}
                <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-2 opacity-70 hover:opacity-100 transition" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white/90">
                    <svg className="w-4 h-4 text-cyan-400 fill-current" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v.25c0 3.2 2.6 6 5.8 6a.75.75 0 010 1.5 7.5 7.5 0 01-13.1 0 .75.75 0 010-1.5c3.2 0 5.8-2.8 5.8-6v-.25A.75.75 0 0110 2z" clipRule="evenodd" />
                    </svg>
                    Water & RH
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-white/40 tracking-wider">⠿ DRAG</span>
                    <span className={`w-2 h-2 rounded-full ${evaluatedStatus.level === 'danger' ? 'bg-rose-500 animate-pulse' : 'bg-cyan-400'}`} />
                  </div>
                </div>

                <p className="text-[11px] text-white/60 font-medium mt-0.5">
                  {evaluatedStatus.label}
                </p>

                {/* Water Sparkline Graph & Level Indicator */}
                <div className="flex items-center justify-between my-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-lime-400 rounded-sm" />
                    <span className="w-1.5 h-4 bg-lime-400 rounded-sm" />
                    <span className="w-1.5 h-2 bg-emerald-400 rounded-sm" />
                    <span className="w-1.5 h-3 bg-yellow-400 rounded-sm" />
                    <span className={`w-1.5 h-5 rounded-sm ${evaluatedStatus.level === 'danger' ? 'bg-rose-500' : 'bg-cyan-400'}`} />
                  </div>

                  {/* Big Percent Value */}
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-xl sm:text-2xl font-black tracking-tight text-white font-mono">
                      {currentHum.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Interactive Action Buttons */}
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-bold">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFan();
                    }}
                    className="py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-md flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    <span>{fanOn ? '⏹' : '+'}</span> {fanOn ? 'Blower ON' : 'Watering'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      showToast('⏰ Moisture alert snoozed for 60 minutes');
                    }}
                    className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 border border-white/10 flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    <span>✕</span> Snooze
                  </button>
                </div>
              </div>

              {/* Left Vertical Map Tools (+ / - zoom & filters) */}
              <div className="absolute bottom-6 left-6 flex flex-col gap-2">
                <div className="flex flex-col bg-white/80 backdrop-blur-md rounded-2xl p-1 shadow-lg border border-white/60">
                  <button
                    onClick={() => showToast('Map Zoom In')}
                    className="w-9 h-9 flex items-center justify-center hover:bg-slate-200/80 rounded-xl text-slate-800 font-bold transition text-lg cursor-pointer"
                  >
                    +
                  </button>
                  <div className="w-full h-px bg-slate-200" />
                  <button
                    onClick={() => showToast('Map Zoom Out')}
                    className="w-9 h-9 flex items-center justify-center hover:bg-slate-200/80 rounded-xl text-slate-800 font-bold transition text-lg cursor-pointer"
                  >
                    −
                  </button>
                </div>

                {/* Secondary Layer / Thermal toggle */}
                <button
                  onClick={() => showToast('Layer: Multispectral NDVI Thermal Active')}
                  className="w-11 h-11 bg-white/80 hover:bg-white backdrop-blur-md rounded-2xl flex items-center justify-center text-slate-700 shadow-lg border border-white/60 transition cursor-pointer"
                  title="Layer settings"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </button>
              </div>

              {/* Bottom Right Mini-Map Inset */}
              <div className="absolute bottom-6 right-6 w-24 h-24 rounded-2xl overflow-hidden border-2 border-white/80 shadow-2xl backdrop-blur-md">
                <img
                  src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=300&q=70"
                  className="w-full h-full object-cover"
                  alt="Mini map viewport"
                />
                <div className="absolute inset-0 m-auto w-10 h-10 border-2 border-white/90 rounded-lg bg-white/10 backdrop-brightness-125" />
              </div>

            </div>

          </div>
        )}

        {/* VIEW: SENSOR IOT DETAIL */}
        {activeView === 'sensor' && (
          <div className="space-y-4">
            <TrendsChart
              telemetryHistory={telemetryHistory}
              onRangeChange={setTimeRange}
              currentRange={timeRange}
            />
          </div>
        )}

        {/* VIEW: CULTURAL REMINDERS & ALERTS */}
        {activeView === 'culture' && (
          <div className="space-y-5">
            {/* Kartu Pemilih Profil Bahasa & Tata Kelola Lumbung */}
            <div className="glass-card p-5 border border-white/60 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm font-bold text-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Pilihan Bahasa &amp; Tata Kelola Lumbung
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Pilih bahasa tampilan dan rujukan kearifan lokal Nusantara untuk peringatan mikroklimat
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 self-start sm:self-auto border border-emerald-200">
                  Aktif: {localeData?.profiles?.[cultureProfile]?.name || 'Bahasa Indonesia (Standar)'}
                </span>
              </div>

              {/* 4 Pilihan Profil Bahasa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    id: 'indonesia',
                    code: 'ID',
                    title: 'Bahasa Indonesia',
                    subtitle: 'Standar & Modern',
                    granary: 'Lumbung Pangan',
                    desc: 'Manajemen pascapanen formal dengan terminologi baku nasional.'
                  },
                  {
                    id: 'indonesia_desa',
                    code: 'DESA',
                    title: 'Indonesia Desa',
                    subtitle: 'Lugas & Praktis',
                    granary: 'Lumbung Pangan',
                    desc: 'Instruksi langsung dan sederhana tanpa istilah teknis berbelit.'
                  },
                  {
                    id: 'sunda',
                    code: 'SUNDA',
                    title: 'Kearifan Pasundan',
                    subtitle: 'Tradisi Sunda',
                    granary: 'Leuit Adat',
                    desc: 'Disarikan dari filosofi Leuit Adat Kasepuhan Banten Kidul & Ciptagelar.'
                  },
                  {
                    id: 'jawa',
                    code: 'JAWA',
                    title: 'Kearifan Kejawen',
                    subtitle: 'Tradisi Jawa',
                    granary: 'Gedhong Pantun',
                    desc: 'Disarikan saking tradisi lumbung ageng lan pranata mangsa Jawa.'
                  }
                ].map((item) => {
                  const isSelected = cultureProfile === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleCultureProfileChange(item.id)}
                      className={`p-3.5 rounded-2xl text-left transition-all border flex flex-col justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                          : 'bg-white/70 hover:bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <span className="text-[10px] font-bold font-mono tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                            {item.code}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                              Terpilih
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                          {item.title}
                        </h4>
                        <span className="text-[11px] font-semibold text-emerald-700 block">
                          {item.subtitle}
                        </span>
                        <p className="text-[11px] text-slate-500 font-medium mt-1.5 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[10px] text-slate-600 font-mono">
                        <span>Sebutan:</span>
                        <strong className="text-slate-800">{item.granary}</strong>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List Peringatan dan Pedoman Tradisi */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <AlertsList alerts={alerts} />
              <TraditionReminders profileData={localeData?.profiles?.[cultureProfile]} />
            </div>
          </div>
        )}

        {/* VIEW: FINANCIAL ECONOMICS */}
        {activeView === 'finance' && (
          <div className="space-y-4">
            <EconomicsPanel
              economics={economics}
              siloInfo={selectedSilo}
            />
          </div>
        )}

      </main>
    </div>
  );
}
