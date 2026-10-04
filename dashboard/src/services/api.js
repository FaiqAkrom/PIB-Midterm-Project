/**
 * API & Realtime Service — Silo-Guard Dashboard
 */

import { createClient } from '@supabase/supabase-js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Inisialisasi Supabase Client jika kredensial diatur di frontend
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project')) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('[DASHBOARD] Supabase Realtime diaktifkan.');
  } catch (err) {
    console.warn('[DASHBOARD] Gagal inisialisasi Supabase frontend:', err.message);
  }
}

export async function fetchSilos() {
  const res = await fetch(`${API_BASE}/api/silos`);
  return res.json();
}

export async function fetchTelemetry(siloId, range = '1h') {
  const res = await fetch(`${API_BASE}/api/silos/${siloId}/telemetry?range=${range}&limit=40`);
  return res.json();
}

export async function fetchAlerts(siloId) {
  const query = siloId ? `?silo_id=${siloId}&limit=20` : '?limit=20';
  const res = await fetch(`${API_BASE}/api/alerts${query}`);
  return res.json();
}

export async function fetchEconomics(siloId) {
  const res = await fetch(`${API_BASE}/api/silos/${siloId}/economics`);
  return res.json();
}

export async function fetchLocaleData() {
  const res = await fetch(`${API_BASE}/api/locale`);
  return res.json();
}

export async function updateCultureProfile(profile) {
  const res = await fetch(`${API_BASE}/api/locale/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile })
  });
  return res.json();
}

export async function setFanState(siloId, fanState) {
  const res = await fetch(`${API_BASE}/api/silos/${siloId}/fan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fan: fanState })
  });
  return res.json();
}

/**
 * Kontrol manual kipas dengan durasi kunci (menit).
 * duration = null => permanen sampai dilepas eksplisit.
 */
export async function setFanStateWithDuration(siloId, fanState, duration = 60) {
  const res = await fetch(`${API_BASE}/api/silos/${siloId}/fan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fan: fanState, duration })
  });
  return res.json();
}

/**
 * Lepaskan mode manual — kembalikan otomasi.
 */
export async function releaseFanManual(siloId) {
  const res = await fetch(`${API_BASE}/api/silos/${siloId}/fan/manual`, {
    method: 'DELETE'
  });
  return res.json();
}

/**
 * Berlangganan Event Realtime
 * Menggunakan SSE (Server-Sent Events) dari backend yang selalu bekerja secara lokal,
 * serta Supabase Realtime Channel jika akun Supabase aktif.
 */
export function subscribeRealtimeEvents({ onTelemetry, onAlert, onLoss, onFan, onConnectionChange }) {
  let eventSource = null;
  let supabaseChannel = null;

  try {
    eventSource = new EventSource(`${API_BASE}/api/events`);

    eventSource.onopen = () => {
      console.log('[SSE] Terhubung ke streaming realtime backend');
      if (onConnectionChange) onConnectionChange(true);
    };

    eventSource.onerror = (err) => {
      console.warn('[SSE WARN] Koneksi streaming terputus, mencoba reconnect...');
      if (onConnectionChange) onConnectionChange(false);
    };

    if (onTelemetry) {
      eventSource.addEventListener('telemetry', (e) => {
        try { onTelemetry(JSON.parse(e.data)); } catch (err) {}
      });
    }

    if (onAlert) {
      eventSource.addEventListener('alert', (e) => {
        try { onAlert(JSON.parse(e.data)); } catch (err) {}
      });
    }

    if (onLoss) {
      eventSource.addEventListener('loss_estimate', (e) => {
        try { onLoss(JSON.parse(e.data)); } catch (err) {}
      });
    }

    if (onFan) {
      eventSource.addEventListener('fan_event', (e) => {
        try { onFan(JSON.parse(e.data)); } catch (err) {}
      });
    }
  } catch (err) {
    console.warn('[SSE ERROR]:', err);
  }

  // Jika Supabase Realtime terkonfigurasi, pasang listener juga
  if (supabase) {
    supabaseChannel = supabase
      .channel('silo-guard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry' }, (payload) => {
        if (onTelemetry) onTelemetry(payload.new);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
        if (onAlert) onAlert(payload.new);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loss_estimates' }, (payload) => {
        if (onLoss) onLoss(payload.new);
      })
      .subscribe();
  }

  // Fungsi pembersihan (unmount)
  return () => {
    if (eventSource) eventSource.close();
    if (supabaseChannel) supabase.removeChannel(supabaseChannel);
  };
}
