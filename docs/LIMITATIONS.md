# BATASAN SISTEM (LIMITATIONS) — SILO-GUARD

Silo-Guard adalah prototipe sistem pemantauan pascapanen berbasis Digital Twin IoT. Dokumen ini menjelaskan batasan teknis dan operasional sistem ini.

---

### 1. Status Prototipe & Non-Kalibrasi
- Sistem ini dirancang untuk demonstrasi, simulasi edukatif, dan pembuktian konsep (Proof of Concept / PoC).
- Sensor simulasi (DHT22 dan potensiometer gas MQ-2 di Wokwi) **bukan alat ukur tersertifikasi BMKG atau laboratorium pangan**. Nilai ppm dan suhu pada simulator adalah variabel numerik sintetis.
- Pada implementasi fisik di lapangan, sensor gas MQ-2/MQ-135 memerlukan waktu pre-heating (pemanasan awal) hingga 24–48 jam untuk mencapai resistansi baseline $R_0$ yang stabil, serta kompensasi suhu-kelembapan lingkungan.

---

### 2. Akurasi Kalkulasi Ekonomi
- Estimasi kerugian finansial (Rupiah) dan susut bobot gabah (kg) menggunakan model empiris matematis sederhana berbasis durasi paparan.
- Laju kerusakan biologis sebenarnya di lumbung dipengaruhi oleh varietas gabah, kadar air awal (MC - Moisture Content), populasi hama gudang (kumbang bubuk *Sitophilus oryzae*), dan kepadatan tumpukan.
- Angka susut dan pencegahan kerugian finansial yang ditampilkan **wajib dipahami sebagai panduan indikatif (early warning indicator)**, bukan catatan akuntansi keuangan nyata.

---

### 3. Konektivitas & Keandalan Jaringan
- Menggunakan broker MQTT publik (`broker.hivemq.com`). Pada deployment industri/lapangan sesungguhnya:
  - Wajib beralih ke broker privat dengan autentikasi mTLS/TLS (port 8883) dan username/password unik per perangkat.
  - Perlu mekanisme *store-and-forward* (penyimpanan lokal di SD card / EEPROM ESP32) jika koneksi internet desa terputus.

---

### 4. Lapisan Kearifan Lokal
- Istilah bahasa Sunda, Jawa, atau adat nusantara lainnya yang disediakan di `locale/kearifan_lokal.json` merupakan hasil rangkuman literatur awal.
- Sistem tidak boleh diterapkan di wilayah adat tertentu tanpa musyawarah dan izin tertulis dari pemangku adat serta verifikasi tata bahasa lokal setempat.
