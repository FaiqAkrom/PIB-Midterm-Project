# Koneksi Wokwi IoT Simulator dengan Sistem Silo-Guard

## Gambaran Umum

Silo-Guard menggunakan **simulasi perangkat IoT berbasis Wokwi** untuk menggantikan hardware ESP32 fisik selama pengembangan dan pengujian. Wokwi mensimulasikan mikrokontroler ESP32 beserta sensor-sensornya secara virtual di browser, lalu mengirim data sensor ke backend melalui jaringan internet menggunakan protokol **MQTT**.

---

## Arsitektur Koneksi

```
┌──────────────────────────────────────────────────────────────────────┐
│  LAPISAN PERANGKAT (Device Layer)                                    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────┐            │
│  │  Wokwi Simulator (browser)                          │            │
│  │                                                     │            │
│  │  ┌───────────┐  ┌────────────┐  ┌───────────────┐  │            │
│  │  │  DHT22    │  │ Potensiom. │  │ Relay + LED   │  │            │
│  │  │ (Suhu &   │  │ (Gas MQ-2) │  │ (Kipas)       │  │            │
│  │  │ Humidity) │  │            │  │               │  │            │
│  │  └─────┬─────┘  └─────┬──────┘  └───────┬───────┘  │            │
│  │        │              │                  │           │            │
│  │        └──────────────┼──────────────────┘           │            │
│  │                       │                              │            │
│  │              ESP32 Virtual (sketch.ino)              │            │
│  │              Publish MQTT setiap 5 detik             │            │
│  └───────────────────────┬──────────────────────────────┘            │
└──────────────────────────┼───────────────────────────────────────────┘
                           │
                           │  MQTT over TCP (port 1883)
                           │  Topic: silo-guard/silo-01/telemetry
                           │  Payload: JSON
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAPISAN PERANTARA (Broker Layer)                                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  broker.hivemq.com  (Server MQTT Publik & Gratis)    │           │
│  │                                                      │           │
│  │  • Menerima pesan dari Wokwi (publisher)             │           │
│  │  • Meneruskan pesan ke Backend (subscriber)          │           │
│  │  • Meneruskan perintah dari Backend ke Wokwi         │           │
│  └──────────────────────────────────────────────────────┘           │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           │  MQTT Subscribe
                           │  Topic: silo-guard/+/telemetry
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAPISAN BACKEND (Processing Layer)                                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  Node.js Backend (localhost:3001)                    │           │
│  │                                                      │           │
│  │  mqttClient.js → processTelemetryIngestion()         │           │
│  │       │                                              │           │
│  │       ├─► anomaly.js     (deteksi risiko)            │           │
│  │       ├─► fanController.js (otomasi kipas)           │           │
│  │       ├─► economics.js   (hitung kerugian)           │           │
│  │       └─► db.js          (simpan ke database)        │           │
│  └──────────────────────────┬───────────────────────────┘           │
└─────────────────────────────┼────────────────────────────────────────┘
                              │
                              │  SSE — Server-Sent Events
                              │  GET /api/events
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAPISAN DASHBOARD (Presentation Layer)                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  React Dashboard (localhost:5173)                    │           │
│  │                                                      │           │
│  │  • Grafik suhu, kelembapan, gas real-time            │           │
│  │  • Panel alert & notifikasi                          │           │
│  │  • Estimasi kerugian ekonomi                         │           │
│  │  • Tombol kontrol kipas manual                       │           │
│  └──────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Komponen Penghubung

### 1. MQTT — Protokol Pesan IoT

**MQTT (Message Queuing Telemetry Transport)** adalah protokol komunikasi ringan yang dirancang untuk perangkat IoT. Cara kerjanya menggunakan model **publish/subscribe**:

| Peran | Siapa | Topik MQTT | Aksi |
|---|---|---|---|
| **Publisher** | Wokwi (ESP32) | `silo-guard/silo-01/telemetry` | Kirim data sensor |
| **Subscriber** | Backend Node.js | `silo-guard/+/telemetry` | Terima & proses data |
| **Publisher** | Backend Node.js | `silo-guard/silo-01/command` | Kirim perintah kipas |
| **Subscriber** | Wokwi (ESP32) | `silo-guard/silo-01/command` | Terima & eksekusi perintah |

Simbol `+` dalam topik backend adalah **wildcard** — artinya backend mendengarkan data dari **semua silo**, tidak hanya `silo-01`.

### 2. broker.hivemq.com — Jembatan di Cloud

Wokwi dan Backend **tidak berkomunikasi langsung** satu sama lain. Keduanya menghubungkan diri ke server perantara yang sama: `broker.hivemq.com`.

> **Analogi:** Seperti grup WhatsApp. Wokwi kirim pesan ke "grup", backend yang sudah bergabung ke grup yang sama langsung menerima pesan tersebut. Broker adalah server WhatsApp-nya.

Konfigurasi ini ada di dua file berbeda, dan **harus identik**:

```cpp
// firmware/wokwi/sketch.ino (di Wokwi)
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT   = 1883;
```

```js
// backend/.env (di Backend)
MQTT_BROKER=mqtt://broker.hivemq.com:1883
```

### 3. SSE — Jembatan Backend ke Dashboard

Setelah backend memproses data dari MQTT, hasilnya diteruskan ke dashboard menggunakan **Server-Sent Events (SSE)** — koneksi HTTP satu arah yang tetap terbuka, sehingga dashboard menerima update otomatis tanpa perlu refresh halaman.

```
Backend                     Dashboard
   │                            │
   │  GET /api/events           │
   │◄───────────────────────────│  (buka koneksi SSE)
   │                            │
   │  event: telemetry          │
   │  data: {...}               │
   │───────────────────────────►│  (push data otomatis)
   │                            │
   │  event: alert              │
   │  data: {...}               │
   │───────────────────────────►│  (push alert otomatis)
```

---

## Format Payload Data

### Telemetri (Wokwi → Backend)

Data dikirim setiap **5 detik** dalam format JSON:

```json
{
  "silo_id":  "silo-01",
  "temp":     27.5,
  "humidity": 68.2,
  "gas":      340,
  "fan":      false,
  "ts":       1727874120
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `silo_id` | string | ID lumbung padi |
| `temp` | float | Suhu dalam °C (dari DHT22) |
| `humidity` | float | Kelembapan relatif % (dari DHT22) |
| `gas` | integer | Estimasi PPM gas pembusukan (dari potensiometer MQ-2) |
| `fan` | boolean | Status kipas saat ini |
| `ts` | integer | Unix timestamp (epoch) |

### Perintah Kipas (Backend → Wokwi)

```json
{
  "fan": true,
  "ts": 1727874150
}
```

---

## Pemetaan Hardware Virtual Wokwi

| Komponen Virtual | Tipe Wokwi | Pin ESP32 | Fungsi |
|---|---|---|---|
| Sensor suhu & kelembapan | `wokwi-dht22` | GPIO 15 | Baca temp & humidity |
| Simulasi sensor gas | `wokwi-potentiometer` | GPIO 34 (ADC) | Putar untuk ubah nilai gas PPM |
| Relay kipas | `wokwi-relay-module` | GPIO 4 | Aktuator sirkulasi udara |
| LED indikator kipas | `wokwi-led` | GPIO 2 | Indikator visual status kipas |

---

## Alur Lengkap Satu Siklus Data

```
1. [Wokwi] DHT22 baca suhu=27.5°C, humidity=68.2%
2. [Wokwi] Potensiometer dibaca → gas=340 PPM
3. [Wokwi] sketch.ino publish JSON ke broker.hivemq.com
           Topic: silo-guard/silo-01/telemetry

4. [Broker] broker.hivemq.com terima pesan, teruskan ke subscriber

5. [Backend] mqttClient.js terima pesan dari broker
6. [Backend] anomaly.js hitung risk score → misal: 42 (waspada)
7. [Backend] fanController.js evaluasi → nyalakan kipas otomatis
8. [Backend] mqttClient.js publish perintah ke broker
             Topic: silo-guard/silo-01/command → {"fan": true}
9. [Backend] economics.js hitung estimasi kerugian
10.[Backend] db.js simpan semua ke database
11.[Backend] dataEvents.emit() → trigger SSE

12.[Broker] teruskan perintah fan ke Wokwi
13.[Wokwi] ESP32 terima command → aktifkan relay & LED

14.[Dashboard] SSE terima event 'telemetry' + 'fan_event'
15.[Dashboard] Grafik dan panel update otomatis (tanpa refresh)
```

---

## Cara Menjalankan Sistem Lengkap

### Prasyarat
- Node.js terinstall
- Koneksi internet aktif (untuk MQTT broker)

### Langkah

**1. Jalankan Backend**
```bash
cd backend
npm install
npm run dev
```
Tunggu hingga muncul:
```
SILO-GUARD BACKEND SERVER BERJALAN DI PORT 3001
[MQTT BACKEND] Terhubung dengan sukses ke broker MQTT!
```

**2. Jalankan Dashboard**
```bash
cd dashboard
npm install
npm run dev
```

**3. Jalankan Simulasi Wokwi**
- Buka [wokwi.com](https://wokwi.com)
- Paste isi `firmware/wokwi/sketch.ino` ke editor
- Paste isi `firmware/wokwi/diagram.json` ke tab diagram
- Tambahkan library: `PubSubClient`, `DHT sensor library`, `Adafruit Unified Sensor`, `ArduinoJson`
- Klik **▶ Start Simulation**

**4. Verifikasi**

Buka `http://localhost:3001/health` di browser:
```json
{
  "status": "ok",
  "mqttConnected": true,
  ...
}
```

Jika `mqttConnected: true` → sistem terhubung penuh dan data mengalir dari Wokwi ke Dashboard.

---

## Troubleshooting

| Gejala | Kemungkinan Penyebab | Solusi |
|---|---|---|
| `mqttConnected: false` di `/health` | Backend gagal konek ke broker | Cek koneksi internet; coba restart backend |
| Data tidak masuk meski Wokwi jalan | Topic tidak cocok | Pastikan `SILO_ID` di `sketch.ino` dan topik backend identik |
| Dashboard tidak update | SSE tidak terhubung | Refresh dashboard; pastikan backend jalan di port 3001 |
| Wokwi disconnect terus-menerus | Batas waktu simulasi gratis | Klik Stop lalu Start lagi di Wokwi |
| Error compile library di Wokwi | Library belum ditambah | Tambah library via Library Manager di UI Wokwi |

---

*Dokumentasi ini adalah bagian dari proyek Silo-Guard — Sistem Monitoring Pascapanen Berbasis IoT.*
