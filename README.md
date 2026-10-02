# Silo-Guard — Smart Post-Harvest Granary IoT & Digital Twin
### Sistem Manajemen Lumbung Pascapanen Cerdas Berbasis Digital Twin IoT & Kearifan Lokal Nusantara

[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B-green.svg)](https://nodejs.org/)
[![Vite + React](https://img.shields.io/badge/Frontend-Vite%20%2B%20React%20%2B%20Tailwind-blue.svg)](https://vitejs.dev/)
[![Wokwi Simulator](https://img.shields.io/badge/Firmware-ESP32%20Wokwi-orange.svg)](https://wokwi.com/)
[![Database](https://img.shields.io/badge/Database-Supabase%20Postgres%20Realtime-emerald.svg)](https://supabase.com/)

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

    subgraph Storage["Database & Realtime"]
        SUPABASE["Supabase Postgres<br/>(silos, telemetry, alerts, loss_estimates)"]
        FALLBACK_STORE["In-Memory Cache & SSE Broadcaster"]
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

    ANOMALY --> SUPABASE
    ANOMALY --> FALLBACK_STORE
    
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
│       ├── libraries.txt         # DHT sensor library, PubSubClient, ArduinoJson
│       └── README.md             # Panduan pengujian langsung di Wokwi.com
├── backend/
│   ├── config/
│   │   └── thresholds.js         # Ambang batas suhu, RH, gas, histeresis & moving average
│   ├── src/
│   │   ├── server.js             # Express REST API, SSE streaming, Zod ingestion
│   │   ├── anomaly.js            # Deteksi pembusukan, moving average, risk score 0-100
│   │   ├── economics.js          # Model empiris susut gabah & kerugian Rupiah
│   │   ├── fanController.js      # Otomasi kipas dengan histeresis 3 siklus aman
│   │   ├── mqttClient.js         # Klien HiveMQ MQTT pub/sub
│   │   └── db.js                 # Integrasi Supabase Postgres + In-Memory Fallback
│   ├── tests/
│   │   └── silo_guard.test.js    # Unit test deteksi anomali, histeresis, dan ekonomi
│   ├── .env.example
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
│       └── 001_init.sql          # Migrasi skema database, index, realtime, seed data
├── locale/
│   └── kearifan_lokal.json       # Kamus istilah & pesan budaya (Sunda, Jawa, Petani Indonesia)
├── scripts/
│   └── simulate.js               # Skrip simulator multi-skenario (normal -> lembap -> busuk -> pulih)
├── docs/
│   ├── ASSUMPTIONS.md            # Catatan asumsi teknis dan operasional
│   └── LIMITATIONS.md            # Batasan instrumen dan model simulasi
├── package.json                  # Root monorepo scripts
└── README.md
```

---

## Panduan Menjalankan Sistem

### 1. Prasyarat
- **Node.js**: v18.8.0 atau lebih baru (mendukung ESM & Node native test runner).
- Koneksi internet untuk terhubung ke broker publik `broker.hivemq.com:1883`.

### 2. Setup Database Supabase (Opsional tapi Direkomendasikan)
1. Buat proyek baru di [supabase.com](https://supabase.com/).
2. Buka menu **SQL Editor**, salin seluruh isi `supabase/migrations/001_init.sql` dan jalankan (*Run*).
3. Buka **Project Settings -> API**, salin `Project URL` dan `anon key` / `service_role key`.
4. Masukkan ke file `backend/.env`:
   ```ini
   PORT=3001
   MQTT_BROKER=mqtt://broker.hivemq.com:1883
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJh......
   SUPABASE_ANON_KEY=eyJh......
   ```
   > **Graceful Degradation Note:** Jika Anda belum memiliki akun Supabase, biarkan `.env` kosong. Backend otomatis berjalan menggunakan **Mode In-Memory Store & SSE Streaming**, sehingga 100% fitur tetap dapat diuji secara langsung!

---

### 3. Menjalankan Backend & Dashboard

Buka dua jendela terminal di direktori proyek:

**Terminal 1 — Backend:**
```bash
cd backend
npm install
npm start
```
*Backend akan berjalan di `http://localhost:3001`.*

**Terminal 2 — Dashboard Web:**
```bash
cd dashboard
npm install
npm run dev
```
*Buka browser di `http://localhost:5173/`.*

---

### 4. Menjalankan Simulasi Firmware Wokwi (ESP32 Virtual)

1. Kunjungi [Wokwi ESP32](https://wokwi.com/).
2. Buat proyek baru **ESP32 DevKit v1**.
3. Salin:
   - Isi `firmware/wokwi/sketch.ino` ke tab kode utama.
   - Isi `firmware/wokwi/diagram.json` ke tab diagram.
   - Tambahkan library di tab `libraries.txt`: `DHT sensor library`, `PubSubClient`, `ArduinoJson`.
4. Tekan tombol **Start Simulation (Play)**.
5. Amati telemetri terkirim di Serial Monitor Wokwi dan data langsung muncul di Dashboard Web dalam waktu < 2 detik!

---

## Skenario Demonstrasi 3 Menit

Untuk mendemonstrasikan sistem end-to-end secara cepat tanpa perlu membuka Wokwi:

Jalankan skrip simulator 4-fase di terminal ketiga:
```bash
# Jalankan simulator via jalur MQTT
node scripts/simulate.js

# Atau via jalur alternatif HTTP POST
node scripts/simulate.js --http
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
   - Estimasi susut melonjak di panel ekonomi, menunjukkan potensi kerugian puluhan/ratusan ribu Rupiah.
   - Kipas bekerja penuh, nilai *"Kerugian yang Berhasil Dicegah"* bertambah.
4. **Menit 2:30 – Fase 4 (Pemulihan & Histeresis):**
   - Pembacaan sensor kembali normal (Kelembapan 64%, Gas 260 ppm).
   - Kipas **TIDAK langsung mati mendadak** (menjalankan histeresis 3 siklus stabil aman untuk menjaga motor dan memastikan uap benar-benar keluar).
   - Setelah 3 siklus stabil, kipas mati otomatis dan notifikasi *"Alhamdulillah, hawa leuit geus balik deui tengtrem"* tercatat.

---

## Menjalankan Unit Test

Untuk menguji algoritma deteksi anomali, histeresis kipas, dan formula susut ekonomi:

```bash
cd backend
npm test
```

Semua pengujian berjalan secara native menggunakan Node test runner:
- [x] Deteksi kondisi Aman, Waspada, Bahaya & Tren kenaikan cepat 5 menit.
- [x] Perilaku histeresis kipas (tidak chattering saat fluktuasi sesaat).
- [x] Model matematis kerugian ekonomi dan nilai pencegahan susut gabah.

---

## Kebijakan Kearifan Lokal & Batasan

- **Istilah Adat Berstatus Placeholder:** Istilah seperti *Leuit, Gedhong Pantun, Kudu Taliti, Rahayu* diambil dari tinjauan pustaka etno-agronomi dan **wajib divalidasi oleh pemangku adat/PPL setempat** sebelum implementasi nyata di lapangan.
- **Model Simulasi:** Angka susut persentase dan Rupiah merupakan simulasi matematis indikatif untuk *early warning*, bukan timbangan riil laboratorium. Baca selengkapnya di `docs/LIMITATIONS.md` dan `docs/ASSUMPTIONS.md`.
