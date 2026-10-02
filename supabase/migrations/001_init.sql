-- ==============================================================================
-- SILO-GUARD: Database Schema Migration
-- File: supabase/migrations/001_init.sql
-- ==============================================================================

-- 1. Tabel Silos (Lumbung Pangan)
CREATE TABLE IF NOT EXISTS silos (
    id VARCHAR(64) PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    komoditas VARCHAR(128) NOT NULL DEFAULT 'Padi Ciherang',
    stok_kg NUMERIC(12, 2) NOT NULL DEFAULT 5000.00,
    harga_per_kg NUMERIC(12, 2) NOT NULL DEFAULT 13500.00,
    lokasi VARCHAR(255) DEFAULT 'Desa Sukamaju, Jawa Barat',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabel Telemetry (Catatan Sensor Realtime)
CREATE TABLE IF NOT EXISTS telemetry (
    id BIGSERIAL PRIMARY KEY,
    silo_id VARCHAR(64) REFERENCES silos(id) ON DELETE CASCADE,
    temp NUMERIC(5, 2) NOT NULL,
    humidity NUMERIC(5, 2) NOT NULL,
    gas NUMERIC(7, 2) NOT NULL,
    fan_on BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index performa query riwayat telemetri berdasarkan silo dan waktu terbaru
CREATE INDEX IF NOT EXISTS idx_telemetry_silo_created 
ON telemetry (silo_id, created_at DESC);

-- 3. Tabel Alerts (Peringatan & Anomali Pascapanen)
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    silo_id VARCHAR(64) REFERENCES silos(id) ON DELETE CASCADE,
    level VARCHAR(32) NOT NULL CHECK (level IN ('aman', 'waspada', 'bahaya')),
    jenis VARCHAR(64) NOT NULL,
    pesan_teknis TEXT NOT NULL,
    pesan_lokal TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_silo_created 
ON alerts (silo_id, created_at DESC);

-- 4. Tabel Fan Events (Riwayat Aktuasi Kipas Ventilasi)
CREATE TABLE IF NOT EXISTS fan_events (
    id BIGSERIAL PRIMARY KEY,
    silo_id VARCHAR(64) REFERENCES silos(id) ON DELETE CASCADE,
    aksi VARCHAR(16) NOT NULL CHECK (aksi IN ('ON', 'OFF')),
    penyebab VARCHAR(32) NOT NULL CHECK (penyebab IN ('otomatis', 'manual')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fan_events_silo_created 
ON fan_events (silo_id, created_at DESC);

-- 5. Tabel Loss Estimates (Estimasi Risiko & Kerugian Ekonomi)
CREATE TABLE IF NOT EXISTS loss_estimates (
    id BIGSERIAL PRIMARY KEY,
    silo_id VARCHAR(64) REFERENCES silos(id) ON DELETE CASCADE,
    risk_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    est_susut_persen NUMERIC(6, 3) NOT NULL DEFAULT 0.000,
    est_susut_kg NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    est_kerugian_rp NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    est_dicegah_rp NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loss_estimates_silo_created 
ON loss_estimates (silo_id, created_at DESC);

-- ==============================================================================
-- AKTIFKAN SUPABASE REALTIME REPLICATION
-- ==============================================================================
-- Memastikan Supabase Realtime mendengarkan perubahan pada tabel-tabel utama
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE telemetry;
    EXCEPTION WHEN duplicate_object THEN
        -- Publication already exists
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
    EXCEPTION WHEN duplicate_object THEN
        -- Publication already exists
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE loss_estimates;
    EXCEPTION WHEN duplicate_object THEN
        -- Publication already exists
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE fan_events;
    EXCEPTION WHEN duplicate_object THEN
        -- Publication already exists
    END;
END $$;

-- ==============================================================================
-- SEED DATA AWAL: Lumbung Padi Contoh
-- ==============================================================================
INSERT INTO silos (id, nama, komoditas, stok_kg, harga_per_kg, lokasi)
VALUES (
    'silo-01',
    'Leuit Pangraksa Sri 01',
    'Padi Ciherang (GKP)',
    5000.00,
    13500.00,
    'Kasepuhan Ciptagelar, Sukabumi'
)
ON CONFLICT (id) DO UPDATE 
SET nama = EXCLUDED.nama,
    stok_kg = EXCLUDED.stok_kg,
    harga_per_kg = EXCLUDED.harga_per_kg;

-- Initial Seed Telemetry (Kondisi normal awal)
INSERT INTO telemetry (silo_id, temp, humidity, gas, fan_on, created_at)
VALUES 
    ('silo-01', 27.2, 65.0, 280.0, false, timezone('utc'::text, now()) - interval '10 minutes'),
    ('silo-01', 27.5, 65.4, 290.0, false, timezone('utc'::text, now()) - interval '5 minutes'),
    ('silo-01', 27.8, 66.0, 295.0, false, timezone('utc'::text, now()));

-- Initial Loss Estimate
INSERT INTO loss_estimates (silo_id, risk_score, est_susut_persen, est_susut_kg, est_kerugian_rp, est_dicegah_rp, created_at)
VALUES ('silo-01', 12.0, 0.05, 2.5, 33750.00, 150000.00, timezone('utc'::text, now()));
