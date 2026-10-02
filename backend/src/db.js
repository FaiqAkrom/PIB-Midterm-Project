/**
 * Lapisan Akses Data (Database & Realtime Layer) — Silo-Guard
 * Mendukung Supabase Client dengan Fallback InMemory Store yang andal untuk dev/testing lokal.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

export const dataEvents = new EventEmitter();

// Konfigurasi Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
let isSupabaseConfigured = false;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    isSupabaseConfigured = true;
    console.log('[DB] Menggunakan koneksi Supabase Postgres & Realtime.');
  } catch (err) {
    console.warn('[DB] Inisialisasi Supabase gagal, beralih ke InMemory Store:', err.message);
  }
} else {
  console.log('[DB] Supabase URL/Key belum disetel. Berjalan dalam Mode In-Memory Store untuk pengujian lokal.');
}

// ================= IN-MEMORY STORE (FALLBACK & CACHE) =================
const memoryStore = {
  silos: [
    {
      id: 'silo-01',
      nama: 'Leuit Pangraksa Sri 01',
      komoditas: 'Padi Ciherang (GKP)',
      stok_kg: 5000.0,
      harga_per_kg: 13500.0,
      lokasi: 'Kasepuhan Ciptagelar, Sukabumi',
      created_at: new Date().toISOString()
    },
    {
      id: 'silo-02',
      nama: 'Lumbung Makmur Jaya 02',
      komoditas: 'Padi IR-64',
      stok_kg: 8500.0,
      harga_per_kg: 13200.0,
      lokasi: 'Desa Karanganyar, Boyolali',
      created_at: new Date().toISOString()
    }
  ],
  telemetry: [],
  alerts: [],
  fan_events: [],
  loss_estimates: []
};

// Seed initial telemetry memory
const nowMs = Date.now();
for (let i = 12; i >= 0; i--) {
  const ts = new Date(nowMs - i * 60000).toISOString();
  memoryStore.telemetry.push({
    id: 1000 + (12 - i),
    silo_id: 'silo-01',
    temp: 27.2 + (Math.sin(i) * 0.4),
    humidity: 65.0 + (Math.cos(i) * 1.5),
    gas: 280 + (i * 2),
    fan_on: false,
    created_at: ts
  });
}

// ================= FUNGSI OPERASI DATA =================

export async function getSilos() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('silos').select('*');
    if (!error && data && data.length > 0) return data;
  }
  return memoryStore.silos;
}

export async function getSiloById(id) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('silos').select('*').eq('id', id).single();
    if (!error && data) return data;
  }
  return memoryStore.silos.find(s => s.id === id) || memoryStore.silos[0];
}

export async function saveTelemetry({ silo_id, temp, humidity, gas, fan_on }) {
  const record = {
    silo_id,
    temp: Number(temp),
    humidity: Number(humidity),
    gas: Number(gas),
    fan_on: Boolean(fan_on),
    created_at: new Date().toISOString()
  };

  // Simpan ke InMemory
  const inMemRecord = { id: Date.now(), ...record };
  memoryStore.telemetry.unshift(inMemRecord);
  if (memoryStore.telemetry.length > 300) {
    memoryStore.telemetry.pop();
  }

  // Jika Supabase aktif, simpan juga ke Postgres
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('telemetry').insert([record]).select().single();
      if (!error && data) {
        dataEvents.emit('telemetry', data);
        return data;
      }
    } catch (e) {
      console.warn('[DB SUPABASE ERROR] Gagal insert telemetry:', e.message);
    }
  }

  dataEvents.emit('telemetry', inMemRecord);
  return inMemRecord;
}

export async function getTelemetryHistory(siloId, { limit = 50, range = '1h' } = {}) {
  if (isSupabaseConfigured) {
    let query = supabase
      .from('telemetry')
      .select('*')
      .eq('silo_id', siloId)
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    const { data, error } = await query;
    if (!error && data) return data;
  }

  // Fallback memory store
  const filtered = memoryStore.telemetry
    .filter(t => t.silo_id === siloId)
    .slice(0, Number(limit));
  return filtered;
}

export async function saveAlert({ silo_id, level, jenis, pesan_teknis, pesan_lokal }) {
  const record = {
    silo_id,
    level,
    jenis,
    pesan_teknis,
    pesan_lokal,
    resolved: level === 'aman',
    created_at: new Date().toISOString()
  };

  const inMemRecord = { id: Date.now(), ...record };
  memoryStore.alerts.unshift(inMemRecord);
  if (memoryStore.alerts.length > 100) memoryStore.alerts.pop();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('alerts').insert([record]).select().single();
      if (!error && data) {
        dataEvents.emit('alert', data);
        return data;
      }
    } catch (e) {
      console.warn('[DB SUPABASE ERROR] Gagal insert alert:', e.message);
    }
  }

  dataEvents.emit('alert', inMemRecord);
  return inMemRecord;
}

export async function getAlerts({ silo_id, limit = 20 } = {}) {
  if (isSupabaseConfigured) {
    let query = supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (silo_id) {
      query = query.eq('silo_id', silo_id);
    }

    const { data, error } = await query;
    if (!error && data) return data;
  }

  let list = memoryStore.alerts;
  if (silo_id) {
    list = list.filter(a => a.silo_id === silo_id);
  }
  return list.slice(0, Number(limit));
}

export async function saveFanEvent({ silo_id, aksi, penyebab }) {
  const record = {
    silo_id,
    aksi,
    penyebab,
    created_at: new Date().toISOString()
  };

  const inMemRecord = { id: Date.now(), ...record };
  memoryStore.fan_events.unshift(inMemRecord);
  if (memoryStore.fan_events.length > 50) memoryStore.fan_events.pop();

  if (isSupabaseConfigured) {
    try {
      await supabase.from('fan_events').insert([record]);
    } catch (e) {
      console.warn('[DB SUPABASE ERROR] Gagal insert fan_event:', e.message);
    }
  }

  dataEvents.emit('fan_event', inMemRecord);
  return inMemRecord;
}

export async function saveLossEstimate({ silo_id, risk_score, est_susut_persen, est_susut_kg, est_kerugian_rp, est_dicegah_rp }) {
  const record = {
    silo_id,
    risk_score,
    est_susut_persen,
    est_susut_kg,
    est_kerugian_rp,
    est_dicegah_rp,
    created_at: new Date().toISOString()
  };

  const inMemRecord = { id: Date.now(), ...record };
  memoryStore.loss_estimates.unshift(inMemRecord);
  if (memoryStore.loss_estimates.length > 100) memoryStore.loss_estimates.pop();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('loss_estimates').insert([record]).select().single();
      if (!error && data) {
        dataEvents.emit('loss_estimate', data);
        return data;
      }
    } catch (e) {
      console.warn('[DB SUPABASE ERROR] Gagal insert loss_estimate:', e.message);
    }
  }

  dataEvents.emit('loss_estimate', inMemRecord);
  return inMemRecord;
}

export async function getLatestLossEstimate(siloId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('loss_estimates')
      .select('*')
      .eq('silo_id', siloId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && data) return data;
  }

  return memoryStore.loss_estimates.find(l => l.silo_id === siloId) || {
    silo_id: siloId,
    risk_score: 10.0,
    est_susut_persen: 0.05,
    est_susut_kg: 2.5,
    est_kerugian_rp: 33750,
    est_dicegah_rp: 120000,
    created_at: new Date().toISOString()
  };
}
