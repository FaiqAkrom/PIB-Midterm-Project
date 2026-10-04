/**
 * Lapisan Akses Data (Database & Realtime Layer) — Silo-Guard
 * Prioritas koneksi:
 *   1. PostgreSQL Lokal  (DATABASE_URL)
 *   2. Supabase          (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *   3. In-Memory Store   (fallback untuk dev/testing)
 */

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

export const dataEvents = new EventEmitter();

const { Pool } = pg;

// ================= LAYER 1: POSTGRESQL LOKAL =================
let pgPool = null;
let isPgConfigured = false;

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  try {
    pgPool = new Pool({
      connectionString: databaseUrl,
      // Batas koneksi yang aman untuk lokal
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    // Test koneksi saat startup & seed jika data kosong
    pgPool.query('SELECT 1').then(async () => {
      isPgConfigured = true;
      console.log('[DB] ✅ Terhubung ke PostgreSQL Lokal via DATABASE_URL.');

      // Pastikan ada data awal telemetri agar grafik kurva langsung terbentuk
      try {
        const countRes = await pgPool.query('SELECT count(*) FROM telemetry');
        const count = parseInt(countRes?.rows?.[0]?.count || '0', 10);
        if (count < 2) {
          console.log('[DB] ℹ️  Tabel telemetry kosong/kurang dari 2 titik, melakukan auto-seeding riwayat...');
          const now = Date.now();
          for (let i = 20; i >= 1; i--) {
            const time = new Date(now - i * 120000);
            const temp = Number((27.2 + Math.sin(i / 2.5) * 1.6).toFixed(1));
            const hum = Number((64.5 + Math.cos(i / 2.5) * 4.2).toFixed(1));
            const gas = Math.round(270 + Math.sin(i / 2) * 55);
            await pgPool.query(
              'INSERT INTO telemetry (silo_id, temp, humidity, gas, fan_on, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
              ['silo-01', temp, hum, gas, hum > 70, time.toISOString()]
            );
          }
          console.log('[DB] ✅ Auto-seeding telemetri berhasil.');
        }
      } catch (seedErr) {
        console.warn('[DB] Catatan saat cek/seed telemetry:', seedErr.message);
      }
    }).catch((err) => {
      console.warn('[DB] ⚠️  Gagal konek ke PostgreSQL Lokal:', err.message);
      console.warn('[DB]    Pastikan PostgreSQL berjalan dan DATABASE_URL benar.');
      pgPool = null;
    });
  } catch (err) {
    console.warn('[DB] ⚠️  Inisialisasi pg Pool gagal:', err.message);
  }
}

// ================= LAYER 2: SUPABASE =================
let supabase = null;
let isSupabaseConfigured = false;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!databaseUrl && supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    isSupabaseConfigured = true;
    console.log('[DB] ✅ Menggunakan koneksi Supabase Postgres & Realtime.');
  } catch (err) {
    console.warn('[DB] ⚠️  Inisialisasi Supabase gagal:', err.message);
  }
}

if (!databaseUrl && !supabaseUrl) {
  console.log('[DB] ℹ️  Tidak ada DATABASE_URL atau SUPABASE_URL. Berjalan dalam Mode In-Memory.');
}

// ================= LAYER 3: IN-MEMORY STORE (FALLBACK) =================
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

// Seed telemetri awal untuk In-Memory
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

// ================= HELPER =================
/**
 * Jalankan query ke PostgreSQL lokal.
 * Mengembalikan rows[] atau null jika koneksi belum siap.
 */
async function pgQuery(text, params = []) {
  if (!pgPool) return null;
  try {
    const result = await pgPool.query(text, params);
    return result.rows;
  } catch (err) {
    console.warn('[PG QUERY ERROR]', err.message, '| Query:', text);
    return null;
  }
}

// ================= FUNGSI OPERASI DATA =================

export async function getSilos() {
  // PostgreSQL lokal
  const rows = await pgQuery('SELECT * FROM silos ORDER BY created_at');
  if (rows && rows.length > 0) return rows;

  // Supabase
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('silos').select('*');
    if (!error && data && data.length > 0) return data;
  }

  return memoryStore.silos;
}

export async function getSiloById(id) {
  // PostgreSQL lokal
  const rows = await pgQuery('SELECT * FROM silos WHERE id = $1 LIMIT 1', [id]);
  if (rows && rows.length > 0) return rows[0];

  // Supabase
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('silos').select('*').eq('id', id).single();
    if (!error && data) return data;
  }

  return memoryStore.silos.find(s => s.id === id) || memoryStore.silos[0];
}

export async function saveTelemetry({ silo_id, temp, humidity, gas, fan_on, sensor_ok = true }) {
  const record = {
    silo_id,
    temp: Number(temp),
    humidity: Number(humidity),
    gas: Number(gas),
    fan_on: Boolean(fan_on),
    sensor_ok: Boolean(sensor_ok),
    created_at: new Date().toISOString()
  };

  // Simpan ke In-Memory (selalu, sebagai cache cepat)
  const inMemRecord = { id: Date.now(), ...record };
  memoryStore.telemetry.unshift(inMemRecord);
  if (memoryStore.telemetry.length > 300) memoryStore.telemetry.pop();

  // PostgreSQL lokal
  // Kolom sensor_ok di DB bersifat opsional — fallback ke INSERT tanpa kolom itu jika belum migrasi
  const rows = await pgQuery(
    `INSERT INTO telemetry (silo_id, temp, humidity, gas, fan_on, sensor_ok)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [silo_id, temp, humidity, gas, fan_on, sensor_ok]
  ) ?? await pgQuery(
    `INSERT INTO telemetry (silo_id, temp, humidity, gas, fan_on)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [silo_id, temp, humidity, gas, fan_on]
  );
  if (rows && rows[0]) {
    const emitted = { ...rows[0], sensor_ok: Boolean(sensor_ok) };
    dataEvents.emit('telemetry', emitted);
    return emitted;
  }

  // Supabase
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
  // PostgreSQL lokal
  const rows = await pgQuery(
    `SELECT * FROM telemetry
     WHERE silo_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [siloId, Number(limit)]
  );
  if (rows && rows.length > 0) return rows;

  // Supabase
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('telemetry')
      .select('*')
      .eq('silo_id', siloId)
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    if (!error && data) return data;
  }

  // In-Memory fallback
  return memoryStore.telemetry
    .filter(t => t.silo_id === siloId)
    .slice(0, Number(limit));
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

  // PostgreSQL lokal
  const rows = await pgQuery(
    `INSERT INTO alerts (silo_id, level, jenis, pesan_teknis, pesan_lokal, resolved)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [silo_id, level, jenis, pesan_teknis, pesan_lokal, level === 'aman']
  );
  if (rows && rows[0]) {
    dataEvents.emit('alert', rows[0]);
    return rows[0];
  }

  // Supabase
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
  // PostgreSQL lokal
  if (silo_id) {
    const rows = await pgQuery(
      'SELECT * FROM alerts WHERE silo_id = $1 ORDER BY created_at DESC LIMIT $2',
      [silo_id, Number(limit)]
    );
    if (rows && rows.length >= 0 && isPgConfigured) return rows;
  } else {
    const rows = await pgQuery(
      'SELECT * FROM alerts ORDER BY created_at DESC LIMIT $1',
      [Number(limit)]
    );
    if (rows && isPgConfigured) return rows;
  }

  // Supabase
  if (isSupabaseConfigured) {
    let query = supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    if (silo_id) query = query.eq('silo_id', silo_id);
    const { data, error } = await query;
    if (!error && data) return data;
  }

  let list = memoryStore.alerts;
  if (silo_id) list = list.filter(a => a.silo_id === silo_id);
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

  // PostgreSQL lokal
  const rows = await pgQuery(
    'INSERT INTO fan_events (silo_id, aksi, penyebab) VALUES ($1, $2, $3) RETURNING *',
    [silo_id, aksi, penyebab]
  );
  if (rows && rows[0]) {
    dataEvents.emit('fan_event', rows[0]);
    return rows[0];
  }

  // Supabase
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

  // PostgreSQL lokal
  const rows = await pgQuery(
    `INSERT INTO loss_estimates
       (silo_id, risk_score, est_susut_persen, est_susut_kg, est_kerugian_rp, est_dicegah_rp)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [silo_id, risk_score, est_susut_persen, est_susut_kg, est_kerugian_rp, est_dicegah_rp]
  );
  if (rows && rows[0]) {
    dataEvents.emit('loss_estimate', rows[0]);
    return rows[0];
  }

  // Supabase
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
  // PostgreSQL lokal
  const rows = await pgQuery(
    `SELECT * FROM loss_estimates
     WHERE silo_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [siloId]
  );
  if (rows && rows.length > 0) return rows[0];

  // Supabase
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
