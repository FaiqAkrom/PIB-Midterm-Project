-- ================= TABEL SILOS =================
CREATE TABLE IF NOT EXISTS silos (
  id            TEXT PRIMARY KEY,
  nama          TEXT NOT NULL,
  komoditas     TEXT,
  stok_kg       FLOAT   DEFAULT 0,
  harga_per_kg  FLOAT   DEFAULT 0,
  lokasi        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ================= TABEL TELEMETRI =================
CREATE TABLE IF NOT EXISTS telemetry (
  id          BIGSERIAL PRIMARY KEY,
  silo_id     TEXT REFERENCES silos(id) ON DELETE CASCADE,
  temp        FLOAT,
  humidity    FLOAT,
  gas         INTEGER,
  fan_on      BOOLEAN     DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index untuk query riwayat telemetri yang cepat
CREATE INDEX IF NOT EXISTS idx_telemetry_silo_created
  ON telemetry (silo_id, created_at DESC);

-- ================= TABEL ALERTS =================
CREATE TABLE IF NOT EXISTS alerts (
  id            BIGSERIAL PRIMARY KEY,
  silo_id       TEXT REFERENCES silos(id) ON DELETE CASCADE,
  level         TEXT,
  jenis         TEXT,
  pesan_teknis  TEXT,
  pesan_lokal   TEXT,
  resolved      BOOLEAN     DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_silo_created
  ON alerts (silo_id, created_at DESC);

-- ================= TABEL FAN EVENTS =================
CREATE TABLE IF NOT EXISTS fan_events (
  id          BIGSERIAL PRIMARY KEY,
  silo_id     TEXT REFERENCES silos(id) ON DELETE CASCADE,
  aksi        TEXT,
  penyebab    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ================= TABEL LOSS ESTIMATES =================
CREATE TABLE IF NOT EXISTS loss_estimates (
  id                BIGSERIAL PRIMARY KEY,
  silo_id           TEXT REFERENCES silos(id) ON DELETE CASCADE,
  risk_score        FLOAT,
  est_susut_persen  FLOAT,
  est_susut_kg      FLOAT,
  est_kerugian_rp   FLOAT,
  est_dicegah_rp    FLOAT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loss_silo_created
  ON loss_estimates (silo_id, created_at DESC);

-- ================= SEED DATA AWAL =================
INSERT INTO silos (id, nama, komoditas, stok_kg, harga_per_kg, lokasi)
VALUES
  (
    'silo-01',
    'Leuit Pangraksa Sri 01',
    'Padi Ciherang (GKP)',
    5000.0,
    13500.0,
    'Kasepuhan Ciptagelar, Sukabumi'
  ),
  (
    'silo-02',
    'Lumbung Makmur Jaya 02',
    'Padi IR-64',
    8500.0,
    13200.0,
    'Desa Karanganyar, Boyolali'
ON CONFLICT (id) DO NOTHING;

-- Seed riwayat telemetri awal agar grafik kurva langsung terbentuk
INSERT INTO telemetry (silo_id, temp, humidity, gas, fan_on, created_at)
SELECT
  'silo-01',
  27.0 + round((sin(s.i * 0.5) * 1.5)::numeric, 1),
  65.0 + round((cos(s.i * 0.4) * 4.0)::numeric, 1),
  280 + round(sin(s.i * 0.3) * 50),
  false,
  now() - (s.i || ' minutes')::interval
FROM generate_series(30, 1, -2) AS s(i);

-- ================= VERIFIKASI =================
SELECT 'Schema Silo-Guard berhasil dibuat!' AS status;
SELECT id, nama, komoditas, stok_kg FROM silos;
