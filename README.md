# Silo-Guard — Smart Post-Harvest Granary IoT & Digital Twin
### Sistem Manajemen Lumbung Pascapanen Cerdas Berbasis Digital Twin IoT & Kearifan Lokal Nusantara

[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B-green.svg)](https://nodejs.org/)
[![Vite + React](https://img.shields.io/badge/Frontend-Vite%20%2B%20React%20%2B%20Tailwind-blue.svg)](https://vitejs.dev/)
[![Wokwi Simulator](https://img.shields.io/badge/Firmware-ESP32%20Wokwi-orange.svg)](https://wokwi.com/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%7C%20Supabase%20%7C%20In--Memory-emerald.svg)](https://supabase.com/)

---

## Ringkasan Proyek

**Silo-Guard** adalah prototipe sistem manajemen lumbung padi pascapanen terintegrasi yang memadukan tiga pilar utama:
1. **Pemantauan Mikroklimat Presisi:** Sensor virtual suhu & kelembapan (DHT22) serta gas pembusukan organik (MQ-2/MQ-135) yang terhubung ke ESP32.
2. **Kearifan Lokal Adat Nusantara:** Bahasa dan antarmuka dirancang khusus untuk petani desa tanpa istilah teknis rumit. Seluruh istilah status dan peringatan disesuaikan dengan tradisi lokal (Sunda: *Leuit*, Jawa: *Lumbung*, atau *Bahasa Petani Lugas*) yang dapat diganti secara dinamis via kamus `locale/kearifan_lokal.json`.
3. **Analisis Risiko Ekonomi Komoditas:** Kalkulasi empiris estimasi susut bobot (kg dan %) serta potensi kerugian finansial (Rupiah) yang diproyeksikan secara transparan, lengkap dengan visualisasi "Kerugian yang Berhasil Dicegah" berkat respon cepat kipas sirkulasi.

---

## Diagram Arsitektur Sistem

```mermaid
graph TD
    subgraph Edge_IoT["Lapisan IoT (ESP32 Virtual Wokwi)"]
        DHT["Sensor DHT22<br/>(Suhu & Kelembapan)"]
        MQ["Potensiometer Simulator<br/>(Gas Pembusukan MQ-2)"]
        RELAY["Relay & LED Indikator<br/>(Kipas Ventilasi Lumbung)"]
        ESP["ESP32 Microcontroller<br/>(WiFi Wokwi-GUEST)"]

        DHT -->|GPIO 15| ESP
        MQ -->|GPIO 34 ADC| ESP
        ESP -->|GPIO 4 & 2| RELAY
    end

    subgraph Broker["MQTT Broker Publik"]
        HIVEMQ["HiveMQ Broker<br/>broker.hivemq.com:1883"]
    end

    subgraph Backend_Cloud["Backend & Engine Analisis (Node.js Express)"]
        MQTT_IN["MQTT Ingestion & Zod Validation"]
        HTTP_FALLBACK["HTTP POST /api/telemetry (Fallback)"]
        ANOMALY["Engine Deteksi Anomali & Moving Average"]
        ECONOMICS["Modul Kalkulasi Susut Ekonomi (economics.js)"]
        FAN_CTRL["Pengendali Otomasi Kipas & Histeresis"]
        LOCALE_LAYER["Lapisan Kamus Budaya (kearifan_lokal.json)"]
    end

    subgraph Storage["Database & Realtime (Multi-Tier Storage)"]
        PG_LOCAL["PostgreSQL Lokal (pg Pool)<br/>(DATABASE_URL)"]
        SUPABASE["Supabase Postgres & Realtime<br/>(SUPABASE_URL)"]
        FALLBACK_STORE["In-Memory Store & SSE Broadcaster<br/>(Zero-Config Fallback)"]
    end

    subgraph Frontend["Dashboard Petani (Vite + React + Tailwind)"]
        DASH_HEADER["Status Lumbung & Pemilih Profil Adat"]
        DASH_CARDS["Kartu Metrik Suhu, RH, Gas & Kipas"]
        DASH_GAUGE["Panel Analisis Ekonomi & Pencegahan Susut"]
        DASH_CHART["Grafik Tren Recharts 1 Jam / 24 Jam"]
        DASH_ALERTS["Catatan Peringatan Kearifan Lokal (Accordion)"]
        DASH_TRADISI["Pengingat Tradisi Tata Kelola Adat"]
    end

    %% Jalur Data
    ESP -->|Publish Telemetry Tiap 5s| HIVEMQ
    HIVEMQ -->|Topic: silo-guard/+/telemetry| MQTT_IN
    HTTP_FALLBACK --> MQTT_IN
    
    MQTT_IN --> ANOMALY
    ANOMALY --> FAN_CTRL
    ANOMALY --> ECONOMICS
    ANOMALY --> LOCALE_LAYER

    FAN_CTRL -->|Publish Command: fan=true/false| HIVEMQ
    HIVEMQ -->|Topic: silo-guard/silo-01/command| ESP

    ANOMALY --> PG_LOCAL
    ANOMALY --> SUPABASE
    ANOMALY --> FALLBACK_STORE
    
    PG_LOCAL -->|Server-Sent Events / SSE| Frontend
    SUPABASE -->|Supabase Realtime| Frontend
    FALLBACK_STORE -->|Server-Sent Events / SSE| Frontend
    Frontend -->|Kontrol Manual POST /api/silos/:id/fan| FAN_CTRL
```

---

## Daftar Topik MQTT

| Topik | Arah Aliran | Payload Contoh | Deskripsi |
| :--- | :--- | :--- | :--- |
| `silo-guard/<silo_id>/telemetry` | ESP32 -> Backend | `{"silo_id":"silo-01","temp":28.4,"humidity":72.1,"gas":340,"fan":false,"ts":1727874000}` | Telemetri periodik dikirim tiap 5 detik |
| `silo-guard/<silo_id>/command` | Backend -> ESP32 | `{"fan":true,"ts":1727874000}` | Perintah menyalakan/mematikan kipas |
| `silo-guard/<silo_id>/status` | ESP32 -> Backend | `{"silo_id":"silo-01","fan":true,"source":"backend_command","ts":1727874000}` | Konfirmasi status fisik kipas dari ESP32 |

---

## Struktur Repositori

```
silo-guard/
├── firmware/
│   └── wokwi/
│       ├── diagram.json          # Diagram pengkabelan ESP32 + DHT22 + Potentiometer + Relay + LED
│       ├── sketch.ino            # Firmware Arduino C++ non-blocking (millis)
│       ├── libraries.txt         # Library dependency: DHT sensor library, PubSubClient, ArduinoJson
│       ├── wokwi.toml            # Konfigurasi simulasi Wokwi CLI & browser
│       └── README.md             # Panduan pengujian cepat firmware di Wokwi
├── backend/
│   ├── config/
│   │   └── thresholds.js         # Ambang batas suhu, RH, gas, histeresis & moving average
│   ├── src/
│   │   ├── server.js             # Express REST API, SSE streaming, Zod ingestion
│   │   ├── anomaly.js            # Deteksi pembusukan, moving average, risk score 0-100
│   │   ├── economics.js          # Model empiris susut gabah & kerugian Rupiah
│   │   ├── fanController.js      # Otomasi kipas dengan histeresis 3 siklus aman
│   │   ├── mqttClient.js         # Klien HiveMQ MQTT pub/sub
│   │   └── db.js                 # Integrasi PostgreSQL Lokal + Supabase + In-Memory Fallback
│   ├── tests/
│   │   └── silo_guard.test.js    # Unit test deteksi anomali, histeresis, dan ekonomi
│   ├── .env.example              # Template variabel lingkungan backend
│   └── package.json
├── dashboard/
│   ├── src/
│   │   ├── components/           # Header, StatusBanner, MetricCards, EconomicsPanel, TrendsChart, AlertsList, TraditionReminders
│   │   ├── services/api.js       # Klien REST, SSE listener, Supabase Realtime
│   │   ├── App.jsx               # Dashboard utama dengan reactive state
│   │   └── index.css             # Tailwind styling, dark mode, animasi sirkulasi kipas
│   ├── index.html
│   ├── tailwind.config.js
│   └── package.json
├── supabase/
│   └── migrations/
│       └── 001_init.sql          # Migrasi skema database Supabase, index, realtime publication & seed data
├── locale/
│   └── kearifan_lokal.json       # Kamus istilah & pesan budaya (Sunda, Jawa, Petani Indonesia)
├── scripts/
│   ├── init_db.sql               # Skrip DDL skema & seed data untuk PostgreSQL lokal
│   └── simulate.js               # Skrip simulator multi-skenario (normal -> lembap -> busuk -> pulih)
├── docs/
│   ├── ASSUMPTIONS.md            # Catatan asumsi teknis dan operasional
│   ├── LIMITATIONS.md            # Batasan instrumen dan model simulasi
│   └── WOKWI_CONNECTION.md       # Panduan arsitektur koneksi & pemecahan masalah Wokwi-MQTT
├── package.json                  # Root monorepo scripts & dependencies
└── README.md
```

---

## Panduan Menjalankan Sistem

### 1. Prasyarat
- **Node.js**: v18.8.0 atau lebih baru (mendukung ESM & Node native test runner).
- Koneksi internet untuk terhubung ke broker publik `broker.hivemq.com:1883`.

---

### 2. Konfigurasi Database (Tiga Pilihan Fleksibel)

Backend Silo-Guard dirancang adaptif dengan tiga opsi penyimpanan data (diatur di file `backend/.env`):

#### **Opsi A: PostgreSQL Lokal (Prioritas Utama)**
Cocok untuk lingkungan lumbung mandiri/offline:
1. Buat database PostgreSQL (contoh nama: `siloguard`):
   ```bash
   createdb -U postgres siloguard
   ```
2. Jalankan skrip skema database:
   ```bash
   psql -U postgres -d siloguard -f scripts/init_db.sql
   ```
3. Set variabel di `backend/.env`:
   ```ini
   DATABASE_URL=postgresql://postgres:password@localhost:5432/siloguard
   ```

#### **Opsi B: Supabase Postgres Terkelola (Cloud Realtime)**
Cocok untuk pemantauan multi-cabang berbasis cloud:
1. Buat proyek baru di [supabase.com](https://supabase.com/).
2. Buka menu **SQL Editor**, salin dan jalankan isi `supabase/migrations/001_init.sql`.
3. Buka **Project Settings -> API**, salin `Project URL` dan `service_role key` / `anon key`.
4. Set variabel di `backend/.env`:
   ```ini
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJh......
   SUPABASE_ANON_KEY=eyJh......
   ```

#### **Opsi C: Zero-Config In-Memory Store (Tanpa Database)**
> **Graceful Degradation:** Jika `DATABASE_URL` dan `SUPABASE_URL` tidak diisi (dikosongkan), backend otomatis berjalan dalam **Mode In-Memory Store & SSE Streaming**. Seluruh fitur pemantauan, grafik riwayat, dan otomasi kipas tetap dapat diuji 100% tanpa perlu menginstal database apa pun!

---

### 3. Menjalankan Backend & Dashboard

Anda dapat menjalankannya langsung dari root monorepo atau masuk ke masing-masing folder:

#### **Cara 1 — Dari Root Monorepo:**
Buka dua jendela terminal di direktori root `silo-guard/`:

**Terminal 1 — Backend:**
```bash
npm run dev:backend
```
*Backend berjalan di `http://localhost:3001`.*

**Terminal 2 — Dashboard:**
```bash
npm run dev:dashboard
```
*Buka browser di `http://localhost:5173/`.*

#### **Cara 2 — Dari Subdirektori Masing-Masing:**
```bash
# Terminal 1: Backend
cd backend && npm install && npm start

# Terminal 2: Dashboard
cd dashboard && npm install && npm run dev
```

---

### 4. Menjalankan Simulasi Firmware Wokwi (ESP32 Virtual)

Untuk mensimulasikan sensor dan mikrokontroler fisik:
1. Kunjungi [Wokwi ESP32](https://wokwi.com/).
2. Buat proyek baru **ESP32 DevKit v1**.
3. Salin berkas:
   - Isi `firmware/wokwi/sketch.ino` ke tab editor kode utama.
   - Isi `firmware/wokwi/diagram.json` ke tab diagram.
   - Tambahkan library di tab `libraries.txt`: `DHT sensor library`, `PubSubClient`, `ArduinoJson`.
4. Tekan tombol **Start Simulation (Play)**.
5. Telemetri akan otomatis dipublish tiap 5 detik ke broker HiveMQ dan diterima oleh backend secara instan!

> 📘 **Panduan Lengkap Wokwi:** Untuk diagram pengkabelan pin, detail format payload MQTT, dan panduan troubleshooting, silakan baca [docs/WOKWI_CONNECTION.md](file:///c:/Users/user/repos/silo-guard/docs/WOKWI_CONNECTION.md).

---

## Skenario Demonstrasi 3 Menit

Untuk mendemonstrasikan sistem end-to-end secara otomatis tanpa perlu membuka simulator Wokwi:

Jalankan skrip simulator 4-fase di terminal:
```bash
# Jalankan via root shortcut (MQTT)
npm run simulate

# Atau via jalur alternatif HTTP POST
npm run simulate:http
```

### Alur Skenario:
1. **Menit 0:00 – Fase 1 (Normal / Sejuk):**
   - Suhu: 26.8°C | Kelembapan: 64% | Gas: 250 ppm.
   - Status: **Aman & Tengtrem** (Hijau).
   - Kipas ventilasi mati (hawa lumbung sejuk terjaga).
2. **Menit 1:00 – Fase 2 (Lembap Naik):**
   - Kelembapan naik melampaui ambang batas (>70%, misal 73%).
   - Status berubah menjadi **Kudu Taliti (Waspada)** (Kuning/Oranye).
   - Muncul notifikasi adat: *"Pare mimiti beueus, buka angin-angin leuit sangkan hawa ngalir lancar."*
   - Kipas ventilasi otomatis menyala (*BERPUTAR*).
3. **Menit 1:45 – Fase 3 (Bahaya Pembusukan):**
   - Suhu > 32°C dan Gas > 700 ppm (simulasi lonjakan fermentasi tumpukan).
   - Status berubah menjadi **Bahaya Pembusukan** (Merah).
   - Estimasi susut melonjak di panel ekonomi, menunjukkan potensi kerugian finansial.
   - Kipas bekerja penuh, nilai *"Kerugian yang Berhasil Dicegah"* bertambah seiring waktu respon.
4. **Menit 2:30 – Fase 4 (Pemulihan & Histeresis):**
   - Pembacaan sensor kembali normal (Kelembapan 64%, Gas 260 ppm).
   - Kipas **TIDAK langsung mati mendadak** (menjalankan histeresis 3 siklus stabil aman untuk menjaga motor dan memastikan uap benar-benar keluar).
   - Setelah 3 siklus stabil, kipas mati otomatis dan tercatat notifikasi pemulihan.

---

## Menjalankan Unit Test

Untuk menguji algoritma deteksi anomali, histeresis kipas, dan formula susut ekonomi:

```bash
# Dari root monorepo
npm run test:backend

# Atau langsung di folder backend
cd backend && npm test
```

Semua pengujian berjalan secara native menggunakan Node test runner:
- [x] Deteksi kondisi Aman, Waspada, Bahaya & Tren kenaikan cepat 5 menit.
- [x] Perilaku histeresis kipas (tidak chattering saat fluktuasi sesaat).
- [x] Model matematis kerugian ekonomi dan nilai pencegahan susut gabah.

---

## Kebijakan Kearifan Lokal & Batasan

- **Istilah Adat Berstatus Placeholder:** Istilah seperti *Leuit, Gedhong Pantun, Kudu Taliti, Rahayu* diambil dari tinjauan pustaka etno-agronomi dan **wajib divalidasi oleh pemangku adat/PPL setempat** sebelum implementasi nyata di lapangan.
- **Model Simulasi:** Angka susut persentase dan Rupiah merupakan simulasi matematis empiris untuk *early warning*, bukan timbangan riil laboratorium. Baca selengkapnya di [docs/LIMITATIONS.md](file:///c:/Users/user/repos/silo-guard/docs/LIMITATIONS.md) dan [docs/ASSUMPTIONS.md](file:///c:/Users/user/repos/silo-guard/docs/ASSUMPTIONS.md).

