/**
 * MQTT Broker Client & Message Handler — Silo-Guard
 */

import mqtt from 'mqtt';
import dotenv from 'dotenv';
import dns from 'node:dns';

// Pastikan prioritas IPv4 agar koneksi ke broker MQTT publik (seperti HiveMQ) tidak gagal ECONNREFUSED di Windows
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore jika versi Node tidak mendukung
}

dotenv.config();

const brokerUrl = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883';

class MqttService {
  constructor() {
    this.client = null;
    this.onTelemetryHandler = null;
    this.onStatusHandler = null;
    this.isConnected = false;
  }

  init({ onTelemetry, onStatus }) {
    this.onTelemetryHandler = onTelemetry;
    this.onStatusHandler = onStatus;

    console.log(`[MQTT BACKEND] Menghubungkan ke broker: ${brokerUrl}`);
    this.client = mqtt.connect(brokerUrl, {
      clientId: `silo-guard-backend-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 4000,
      clean: true
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      console.log('[MQTT BACKEND] Terhubung dengan sukses ke broker MQTT!');

      // Subscribe ke topik telemetri dan status semua lumbung
      const telemetryPattern = 'silo-guard/+/telemetry';
      const statusPattern = 'silo-guard/+/status';

      this.client.subscribe([telemetryPattern, statusPattern], (err) => {
        if (err) {
          console.error('[MQTT BACKEND] Gagal subscribe:', err);
        } else {
          console.log(`[MQTT BACKEND] Berhasil subscribe: ${telemetryPattern}, ${statusPattern}`);
        }
      });
    });

    this.client.on('message', (topic, payload) => {
      try {
        const payloadStr = payload.toString();
        const data = JSON.parse(payloadStr);

        console.log(`[MQTT RECV] Diterima dari topik: ${topic} |`, JSON.stringify(data));

        if (topic.endsWith('/telemetry')) {
          if (this.onTelemetryHandler) {
            this.onTelemetryHandler(data, topic);
          }
        } else if (topic.endsWith('/status')) {
          if (this.onStatusHandler) {
            this.onStatusHandler(data, topic);
          }
        }
      } catch (err) {
        console.warn(`[MQTT PARSE WARN] Gagal membaca pesan dari topik ${topic}:`, err.message, '| Raw payload:', payload.toString());
      }
    });

    this.client.on('error', (err) => {
      console.error('[MQTT BACKEND ERROR]:', err.message);
    });

    this.client.on('offline', () => {
      this.isConnected = false;
      console.warn('[MQTT BACKEND] Status: Offline dari broker.');
    });

    this.client.on('reconnect', () => {
      console.log('[MQTT BACKEND] Mencoba menyambung kembali ke broker...');
    });
  }

  async publishFanCommand(siloId, fanState) {
    if (!this.client || !this.isConnected) {
      console.warn('[MQTT WARN] Klien MQTT belum terhubung, perintah antri...');
    }
    const topic = `silo-guard/${siloId}/command`;
    const payload = JSON.stringify({ fan: Boolean(fanState), ts: Math.floor(Date.now() / 1000) });

    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[MQTT PUBLISH ERROR] Gagal mengirim ke ${topic}:`, err);
          return reject(err);
        }
        console.log(`[MQTT PUBLISH] Perintah terkirim ke ${topic}: ${payload}`);
        resolve();
      });
    });
  }
}

export const mqttService = new MqttService();
