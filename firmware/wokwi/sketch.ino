
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <time.h>

// ================= KONFIGURASI PERANGKAT =================
const char* SILO_ID = "silo-01";
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

const char* MQTT_BROKER = "broker.hivemq.com";
const int MQTT_PORT = 1883;

// Topik MQTT
String topicTelemetry = String("silo-guard/") + SILO_ID + "/telemetry";
String topicCommand   = String("silo-guard/") + SILO_ID + "/command";
String topicStatus    = String("silo-guard/") + SILO_ID + "/status";

// Pinout Hardware ESP32
#define DHT_PIN       15
#define DHT_TYPE      DHT22
#define GAS_PIN       34      // ADC1 input (potensiometer simulator MQ-2)
#define RELAY_PIN     4       // Kontrol Relay Kipas
#define LED_FAN_PIN   2       // LED Indikator Kipas (Onboard/External)

// ================= OBJEK & VARIABEL GLOBAL =================
DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

bool fanState = false;
bool sensorOk = true;   // false jika DHT22 gagal dibaca
float lastValidTemp = 28.0;
float lastValidHumidity = 65.0;
int consecutiveDhtErrors = 0;
const int MAX_DHT_ERRORS = 3; // Toleransi 3 kegagalan berturut-turut sebelum menandai sensor fault

unsigned long lastTelemetryMillis = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 5000;

unsigned long lastMqttRetryMillis = 0;
const unsigned long MQTT_RETRY_INTERVAL_MS = 5000;

// Mendapatkan timestamp epoch (NTP atau fallback millis)
unsigned long getEpochTime() {
  time_t now;
  time(&now);
  if (now > 100000000) {
    return (unsigned long)now;
  }
  // Fallback timestamp realistis jika NTP belum sinkron di simulator
  return 1727874000UL + (millis() / 1000);
}

// ================= KONTROL AKTUATOR =================
void setFanState(bool state, const char* source) {
  fanState = state;
  digitalWrite(RELAY_PIN, fanState ? HIGH : LOW);
  digitalWrite(LED_FAN_PIN, fanState ? HIGH : LOW);

  Serial.printf("[AKTUATOR] Kipas %s oleh %s\n", fanState ? "MENYALA (AKTIF)" : "DIMATIKAN", source);

  // Publish konfirmasi status aktuator ke MQTT
  StaticJsonDocument<128> doc;
  doc["silo_id"] = SILO_ID;
  doc["fan"] = fanState;
  doc["source"] = source;
  doc["ts"] = getEpochTime();

  char buffer[128];
  serializeJson(doc, buffer);
  mqttClient.publish(topicStatus.c_str(), buffer);
  Serial.printf("[MQTT STATUS] Terkirim -> %s\n", buffer);
}

// ================= MQTT CALLBACK =================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.printf("[MQTT RECV] Topik: %s | Pesan: %s\n", topic, message);

  if (String(topic) == topicCommand) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);

    if (error) {
      Serial.printf("[MQTT ERROR] Gagal parse JSON command: %s\n", error.c_str());
      return;
    }

    if (doc.containsKey("fan")) {
      bool targetFan = doc["fan"];
      setFanState(targetFan, "backend_command");
    }
  }
}

// ================= KONEKSI JARINGAN =================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("[WiFi] Menghubungkan ke: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void checkMqttConnection() {
  if (mqttClient.connected()) return;

  unsigned long currentMillis = millis();
  if (currentMillis - lastMqttRetryMillis >= MQTT_RETRY_INTERVAL_MS) {
    lastMqttRetryMillis = currentMillis;

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Menunggu sambungan WiFi sebelum menyambung MQTT...");
      return;
    }

    String clientId = String("silo-guard-esp32-") + String(random(0xffff), HEX);
    Serial.printf("[MQTT] Menyambungkan ke broker %s:%d dengan ClientId: %s...\n", 
                  MQTT_BROKER, MQTT_PORT, clientId.c_str());

    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("[MQTT] Berhasil terhubung!");
      mqttClient.subscribe(topicCommand.c_str());
      Serial.printf("[MQTT] Subscribe ke topik: %s\n", topicCommand.c_str());
      
      // Kirim status awal kipas
      setFanState(fanState, "initial_boot");
    } else {
      Serial.printf("[MQTT] Gagal konek, rc=%d. Mencoba lagi 5 detik kemudian.\n", mqttClient.state());
    }
  }
}

// ================= PEMBACAAN SENSOR =================
/**
 * Membaca suhu dan kelembapan dari DHT22 secara terintegrasi.
 * Menggunakan toleransi MAX_DHT_ERRORS dan mempertahankan nilai valid terakhir
 * agar jitter simulator Wokwi / mikrokontroler tidak menyebabkan alarm palsu.
 */
void readDhtSensors(float &outTemp, float &outHum) {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    consecutiveDhtErrors++;
    Serial.printf("[SENSOR WARN] Gagal membaca DHT22 (percobaan gagal: %d/%d)!\n", consecutiveDhtErrors, MAX_DHT_ERRORS);
    if (consecutiveDhtErrors >= MAX_DHT_ERRORS) {
      sensorOk = false;
      outTemp = 27.0; // nilai fallback darurat jika sensor benar-benar putus/rusak
      outHum = 65.0;
    } else {
      // Gunakan nilai valid sebelumnya; sensor belum dianggap rusak
      sensorOk = true;
      outTemp = lastValidTemp;
      outHum = lastValidHumidity;
    }
  } else {
    consecutiveDhtErrors = 0;
    sensorOk = true;
    lastValidTemp = t;
    lastValidHumidity = h;
    outTemp = t;
    outHum = h;
  }
}

int readGasPpm() {
  // Pembacaan analog 12-bit (0-4095) dari simulator potensiometer MQ-2
  int rawAdc = analogRead(GAS_PIN);

  // Konversi ke rentang perkiraan PPM gas indikator lumbung (100 - 1000 ppm)
  int gasPpm = map(rawAdc, 0, 4095, 100, 1000);
  return gasPpm;
}

// ================= SETUP & LOOP =================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n==========================================");
  Serial.println("  SILO-GUARD: ESP32 Virtual Firmware Boot ");
  Serial.println("==========================================");

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_FAN_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(LED_FAN_PIN, LOW);

  pinMode(GAS_PIN, INPUT);

  dht.begin();
  delay(1500); // Beri waktu stabilisasi komponen virtual DHT22
  
  connectWiFi();

  // Konfigurasi NTP Time
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  Serial.println("[SYSTEM] Setup selesai. Memulai loop telemetri non-blocking.");
}

void loop() {
  // Reconnect WiFi non-blocking
  if (WiFi.status() != WL_CONNECTED) {
    // WiFi ESP32 otomatis mencoba reconnect di background
  }

  // Jaga koneksi MQTT non-blocking
  if (!mqttClient.connected()) {
    checkMqttConnection();
  } else {
    mqttClient.loop();
  }

  // Kirim Telemetri setiap 5 detik
  unsigned long currentMillis = millis();
  if (currentMillis - lastTelemetryMillis >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMillis = currentMillis;

    float temperature = 27.0;
    float humidity = 65.0;
    readDhtSensors(temperature, humidity);

    int gasPpm        = readGasPpm();
    unsigned long ts  = getEpochTime();

    // Buat payload JSON sesuai spesifikasi (sensor_ok ditambahkan untuk deteksi kerusakan)
    // {"silo_id":"silo-01","temp":28.4,"humidity":72.1,"gas":340,"fan":false,"sensor_ok":true,"ts":<epoch>}
    StaticJsonDocument<256> doc;
    doc["silo_id"] = SILO_ID;
    doc["temp"] = serialized(String(temperature, 1));
    doc["humidity"] = serialized(String(humidity, 1));
    doc["gas"] = gasPpm;
    doc["fan"] = fanState;
    doc["sensor_ok"] = sensorOk;
    doc["ts"] = ts;

    char buffer[256];
    serializeJson(doc, buffer);

    if (mqttClient.connected()) {
      mqttClient.publish(topicTelemetry.c_str(), buffer);
      Serial.printf("[TELEMETRI TERKIRIM] %s -> %s\n", topicTelemetry.c_str(), buffer);
    } else {
      Serial.printf("[OFFLINE TELEMETRI] (MQTT belum tersambung): %s\n", buffer);
    }
  }
}
