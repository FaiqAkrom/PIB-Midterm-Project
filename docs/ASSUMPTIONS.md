# ASSUMPTIONS & DESIGN DECISIONS — SILO-GUARD

Dokumen ini mencatat asumsi operasional, arsitektural, dan penyederhanaan yang diambil selama perancangan dan implementasi prototipe **Silo-Guard**.

---

### 1. Lingkungan Kerja & Direktori
- **Lokasi Proyek:** `C:\Users\user\.gemini\antigravity-ide\scratch\silo-guard`
- **Rekomendasi Workspace:** Pengguna disarankan membuka direktori ini sebagai *Active Workspace* di IDE.
- **Node.js Runtime:** Node.js v18.8.0+ / npm 8.18.0+.

---

### 2. Konektivitas & IoT (Firmware Wokwi)
- **Broker MQTT Publik:** Menggunakan `broker.hivemq.com` port 1883 (non-TLS) untuk koneksi ESP32 Wokwi dan Backend.
  - Prefix topik: `silo-guard/<silo_id>/...`
  - Contoh silo default: `silo-01`
  - Payload dikirim setiap 5 detik (dapat diubah tanpa delay blocking memakai `millis()`).
- **WiFi Simulator:** Menggunakan SSID `Wokwi-GUEST` tanpa kata sandi sesuai spesifikasi simulator Wokwi.
- **Simulasi Sensor Gas (MQ-2 / MQ-135):**
  - Wokwi belum memiliki sensor MQ fisik bawaan lengkap dengan gas chamber.
  - **Asumsi implementasi:** Menggunakan potensiometer linier 10k pada GPIO 34 (ADC input). Nilai analog ADC 0–4095 dipetakan ke rentang 0–1000 ppm gas volatil (CO2/etilen/amonia indikator pembusukan lumbung). Di Wokwi, slider potensiometer sangat intuitif digeser oleh pengguna untuk memicu simulasi lonjakan gas pembusukan.
- **Sensor Suhu & Kelembapan:** DHT22 pada GPIO 15.
- **Aktuator Kipas (Ventilasi):** Relay pada GPIO 4 dan LED indikator aktif kipas pada GPIO 2.

---

### 3. Database & Supabase Fallback
- Skema relational Postgres lengkap disediakan di `supabase/migrations/001_init.sql`.
- Tabel: `silos`, `telemetry`, `alerts`, `fan_events`, `loss_estimates`.
- **Asumsi Keandalan Prototipe (Graceful Degradation):**
  - Jika URL dan Key Supabase diisi di `.env`, backend dan frontend terhubung langsung ke Supabase Postgres & Realtime channel.
  - Jika user belum mengkonfigurasi akun Supabase, backend memiliki *In-Memory & SQLite/File Fallback Store* serta event-emitter lokal/SSE/WebSocket agar pengujian lokal tetap berjalan lancar tanpa terhenti oleh kegagalan koneksi pihak ketiga.

---

### 4. Batasan & Ambang Anomali (Default Thresholds)
- **Aman:** Suhu ≤ 30°C, Kelembapan ≤ 70%, Gas ≤ 400 ppm.
- **Waspada (Warning):** Kelembapan > 70% ATAU Suhu > 30°C ATAU Gas > 400 ppm.
- **Bahaya (Danger):** (Kelembapan > 75% DAN Suhu > 32°C) ATAU Gas > 700 ppm.
- **Deteksi Tren:** Kenaikan laju gas > 50 ppm/menit atau kelembapan > 5% dalam 5 menit terakhir mengindikasikan respirasi jamur aktif.
- **Risk Score:** 0–100 dihitung secara terbobot:
  $$\text{Risk Score} = 0.45 \times \text{Risk}_{\text{humidity}} + 0.30 \times \text{Risk}_{\text{gas}} + 0.25 \times \text{Risk}_{\text{temperature}}$$
- **Histeresis Kipas:** Kipas menyala saat status Waspada/Bahaya. Kipas baru akan dimatikan otomatis setelah pembacaan sensor kembali ke kondisi Aman stabil selama minimal 3 siklus telemetri (15 detik) untuk mencegah siklus hidup-mati (hunting/chattering) yang merusak motor.

---

### 5. Formula Ekonomi Pascapanen
- Komoditas default: Padi Ciherang / IR-64.
- Stok default lumbung percontohan: 5.000 kg (5 ton), harga acuan GKP (Gabah Kering Panen) Rp 13.500 / kg.
- Kerugian dihitung berdasarkan akumulasi menit paparan kondisi tidak ideal dengan laju susut bobot/kualitas $0.05\% - 0.25\%$ per jam paparan buruk.
- **Penting:** Semua angka ekonomi berlabel tegas **Estimasi Simulasi**, bukan data timbangan riil laboratorium.

---

### 6. Lapisan Budaya & Kearifan Lokal
- Istilah adat (seperti *Leuit, Lumbung, Lengki, Rangki, Pare*) dan pepatah tata kelola pangan adat bersifat *placeholder berbasis studi pustaka etno-agronomi*.
- Wajib divalidasi oleh tokoh adat, kasepuhan, atau penyuluh pertanian lapangan (PPL) setempat sebelum digunakan di lapangan nyata.
