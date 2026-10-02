# Panduan Penggunaan Firmware Virtual Wokwi — Silo-Guard

Firmware ini disiapkan untuk dijalankan langsung di simulator [Wokwi ESP32](https://wokwi.com/).

### Komponen Virtual:
1. **ESP32 DevKit v1**
2. **DHT22**: Sensor suhu dan kelembapan (terhubung ke pin GPIO 15).
3. **Potensiometer 10k**: Simulasi sensor gas MQ-2 / pembusukan organik (terhubung ke pin ADC GPIO 34).
4. **Relay Module & Cyan LED**: Aktuator kipas ventilasi lumbung (terhubung ke pin GPIO 4 dan GPIO 2).

---

### Cara Menjalankan di Wokwi:
1. Buka [wokwi.com](https://wokwi.com/) dan pilih proyek **ESP32**.
2. Salin isi file:
   - `sketch.ino` ke editor kode Wokwi.
   - `diagram.json` ke tab `diagram.json` di Wokwi.
   - `libraries.txt` ke tab `libraries.txt` di Wokwi (atau tambahkan via Library Manager di Wokwi: `DHT sensor library`, `PubSubClient`, `ArduinoJson`).
3. Tekan tombol **Play (Start Simulation)** di Wokwi.

---

### Cara Mensimulasikan Kondisi Buruk & Pemicu Anomali:
1. **Menaikkan Kelembapan / Suhu:**
   - Klik sensor **DHT22** di layar simulator saat simulasi sedang berjalan.
   - Geser slider **Humidity** ke atas `> 70%` (misal 78%) atau **Temperature** ke atas `> 32°C`.
2. **Menaikkan Konsentrasi Gas Pembusukan (MQ-2):**
   - Klik **Potensiometer (Simulasi Gas MQ-2)**.
   - Putar tuas potensiometer searah jarum jam untuk menaikkan nilai analog (akan dikonversi menjadi `> 400 ppm` hingga `1000 ppm`).
3. **Memantau Reaksi Kipas:**
   - Dalam 5 detik, backend akan mendeteksi level bahaya/waspada dan mengirimkan perintah `{"fan":true}` via topik `silo-guard/silo-01/command`.
   - Di Wokwi, Anda akan melihat LED Cyan dan Relay menyala seketika!
