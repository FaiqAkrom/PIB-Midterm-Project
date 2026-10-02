/**
 * Skrip Simulator Telemetri Otomatis — Silo-Guard
 * Menghasilkan skenario demonstrasi 4 fase:
 * 1. Normal (Aman)
 * 2. Lembap Naik (Waspada)
 * 3. Pembusukan Aktif (Bahaya Kritis)
 * 4. Pemulihan Pascaventilasi (Aman & Histeresis Kipas)
 * 
 * Penggunaan:
 *   node scripts/simulate.js              (via MQTT)
 *   node scripts/simulate.js --http       (via HTTP REST endpoint)
 */

import mqtt from 'mqtt';

const args = process.argv.slice(2);
const useHttp = args.includes('--http');
const siloId = 'silo-01';

const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883';
const HTTP_ENDPOINT = 'http://localhost:3001/api/telemetry';

console.log('===============================================================');
console.log('       SILO-GUARD: SIMULATOR TELEMETRI MULTI-SKENARIO          ');
console.log(` Target Silo : ${siloId}`);
console.log(` Jalur Kirim : ${useHttp ? 'HTTP POST (' + HTTP_ENDPOINT + ')' : 'MQTT (' + MQTT_BROKER + ')'}`);
console.log('===============================================================');

// Daftar langkah skenario simulasi
const scenarios = [
  // FASE 1: NORMAL / AMAN (3 langkah)
  { phase: '1. Kondisi Normal', temp: 26.8, humidity: 64.0, gas: 250, desc: 'Lumbung kering sejuk, gabah stabil' },
  { phase: '1. Kondisi Normal', temp: 27.0, humidity: 64.8, gas: 260, desc: 'Fluktuasi alami pagi hari' },
  { phase: '1. Kondisi Normal', temp: 27.2, humidity: 65.5, gas: 275, desc: 'Kondisi stabil terjaga' },

  // FASE 2: LEMBAP NAIK (WASPADA) (3 langkah)
  { phase: '2. Lembap Meningkat', temp: 28.5, humidity: 71.5, gas: 330, desc: 'Uap air hujan masuk, kelembapan > 70%' },
  { phase: '2. Lembap Meningkat', temp: 29.2, humidity: 73.0, gas: 380, desc: 'Mulai tercium bau apek di tumpukan' },
  { phase: '2. Lembap Meningkat', temp: 29.8, humidity: 74.2, gas: 420, desc: 'Ambang waspada gas & RH terlampaui' },

  // FASE 3: PEMBUSUKAN AKTIF (BAHAYA KRITIS) (3 langkah)
  { phase: '3. Bahaya Pembusukan', temp: 32.8, humidity: 77.0, gas: 680, desc: 'Respirasi panas jamur aktif, gas melonjak' },
  { phase: '3. Bahaya Pembusukan', temp: 33.5, humidity: 79.2, gas: 790, desc: 'BAHAYA KRITIS! Suhu >32C & RH >75%, gas >700ppm' },
  { phase: '3. Bahaya Pembusukan', temp: 33.1, humidity: 78.0, gas: 750, desc: 'Kipas bekerja keras sirkulasi udara' },

  // FASE 4: PEMULIHAN PASCA-VENTILASI (4 langkah)
  { phase: '4. Pemulihan Udara', temp: 30.2, humidity: 72.0, gas: 510, desc: 'Kipas meniup uap air & gas keluar' },
  { phase: '4. Pemulihan Udara', temp: 28.6, humidity: 68.5, gas: 380, desc: 'Kondisi kembali ke zona aman (Siklus histeresis 1)' },
  { phase: '4. Pemulihan Udara', temp: 27.8, humidity: 66.0, gas: 310, desc: 'Kondisi aman berlanjut (Siklus histeresis 2)' },
  { phase: '4. Pemulihan Udara', temp: 27.0, humidity: 64.5, gas: 260, desc: 'Lumbung pulih sepenuhnya. Kipas mati otomatis.' }
];

let stepIndex = 0;
let mqttClient = null;

async function sendViaHttp(payload) {
  const response = await fetch(HTTP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  return json;
}

function sendViaMqtt(payload) {
  const topic = `silo-guard/${payload.silo_id}/telemetry`;
  const message = JSON.stringify(payload);
  mqttClient.publish(topic, message, { qos: 0 });
}

function runStep() {
  if (stepIndex >= scenarios.length) {
    console.log('\n[SELESAI] Seluruh siklus simulasi 4 fase telah selesai didemonstrasikan.');
    if (mqttClient) mqttClient.end();
    process.exit(0);
  }

  const s = scenarios[stepIndex];
  const payload = {
    silo_id: siloId,
    temp: s.temp,
    humidity: s.humidity,
    gas: s.gas,
    ts: Math.floor(Date.now() / 1000)
  };

  const timeStr = new Date().toLocaleTimeString('id-ID');
  console.log(`\n[${timeStr}] Langkah ${stepIndex + 1}/${scenarios.length} — [${s.phase}]`);
  console.log(`  Suhu: ${s.temp}°C | Kelembapan: ${s.humidity}% | Gas: ${s.gas} ppm`);
  console.log(`  Catatan: ${s.desc}`);

  if (useHttp) {
    sendViaHttp(payload)
      .then(res => {
        if (res.data) {
          console.log(`  -> Response: Level [${res.data.riskLevel.toUpperCase()}] | Risk Score: ${res.data.riskScore} | Kipas: ${res.data.fan.fanOn ? 'ON' : 'OFF'} | Est Kerugian: Rp ${res.data.economics.est_kerugian_rp.toLocaleString('id-ID')}`);
        }
      })
      .catch(err => console.error('  -> HTTP Error:', err.message));
  } else {
    sendViaMqtt(payload);
    console.log(`  -> Terkirim ke MQTT: silo-guard/${siloId}/telemetry`);
  }

  stepIndex++;
  setTimeout(runStep, 4000); // interval tiap 4 detik
}

if (!useHttp) {
  mqttClient = mqtt.connect(MQTT_BROKER, {
    clientId: `silo-guard-simulator-${Math.random().toString(16).slice(2, 6)}`
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Berhasil tersambung ke HiveMQ broker. Memulai simulasi...');
    runStep();
  });

  mqttClient.on('error', (err) => {
    console.error('[MQTT ERROR]:', err.message);
  });
} else {
  runStep();
}
