import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend
} from 'recharts';
import { Activity, Clock } from 'lucide-react';

export default function TrendsChart({ telemetryHistory = [], onRangeChange, currentRange = '1h' }) {
  const [activeMetric, setActiveMetric] = useState('all'); // 'all' | 'temp' | 'humidity' | 'gas'

  // Format data untuk grafik
  const formattedData = [...telemetryHistory]
    .reverse()
    .map((item) => {
      const date = item.created_at ? new Date(item.created_at) : new Date();
      const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return {
        time: timeStr,
        temp: Number(item.temp),
        humidity: Number(item.humidity),
        gas: Number(item.gas),
        fan: item.fan_on ? 1 : 0
      };
    });

  return (
    <div className="bg-cardBg rounded-2xl p-5 sm:p-6 border border-cardBorder shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-cardBorder">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emeraldLight text-emeraldPrimary flex items-center justify-center font-bold">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-textTitle">Grafik Tren Mikroklimat & Ambang Batas</h3>
            <p className="text-xs text-textMuted">Data historis telemetri sensor lumbung</p>
          </div>
        </div>

        {/* Pemilih Tab & Rentang Waktu */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Metrik */}
          <div className="flex bg-appBg p-1 rounded-xl border border-cardBorder text-xs font-semibold">
            <button
              onClick={() => setActiveMetric('all')}
              className={`px-3 py-1 rounded-lg transition ${
                activeMetric === 'all' ? 'bg-cardBg text-emeraldPrimary shadow-pill' : 'text-textMuted hover:text-textTitle'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setActiveMetric('temp')}
              className={`px-3 py-1 rounded-lg transition ${
                activeMetric === 'temp' ? 'bg-cardBg text-accentOrange shadow-pill' : 'text-textMuted hover:text-textTitle'
              }`}
            >
              Suhu
            </button>
            <button
              onClick={() => setActiveMetric('humidity')}
              className={`px-3 py-1 rounded-lg transition ${
                activeMetric === 'humidity' ? 'bg-cardBg text-emeraldPrimary shadow-pill' : 'text-textMuted hover:text-textTitle'
              }`}
            >
              RH %
            </button>
            <button
              onClick={() => setActiveMetric('gas')}
              className={`px-3 py-1 rounded-lg transition ${
                activeMetric === 'gas' ? 'bg-cardBg text-statusDanger shadow-pill' : 'text-textMuted hover:text-textTitle'
              }`}
            >
              Gas
            </button>
          </div>

          {/* Pemilih Rentang Waktu */}
          <div className="flex items-center gap-1 text-xs text-textMuted">
            <Clock className="w-3.5 h-3.5" />
            <button
              onClick={() => onRangeChange?.('1h')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                currentRange === '1h'
                  ? 'bg-emeraldPrimary text-white'
                  : 'bg-appBg hover:bg-emeraldLight text-textMuted'
              }`}
            >
              1 Jam
            </button>
            <button
              onClick={() => onRangeChange?.('24h')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                currentRange === '24h'
                  ? 'bg-emeraldPrimary text-white'
                  : 'bg-appBg hover:bg-emeraldLight text-textMuted'
              }`}
            >
              24 Jam
            </button>
          </div>
        </div>
      </div>

      {/* Area Grafik Recharts */}
      <div className="mt-5 h-72 w-full">
        {formattedData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-textMuted text-xs">
            Menunggu data telemetri pertama dari sensor ESP32...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE8" vertical={false} />
              <XAxis dataKey="time" stroke="#687B71" fontSize={11} tickLine={false} />
              <YAxis stroke="#687B71" fontSize={11} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E5ECE8',
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px -2px rgba(18, 48, 32, 0.08)',
                  fontSize: '12px',
                  color: '#17231C'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

              {/* Garis Ambang Batas Kritis */}
              {(activeMetric === 'all' || activeMetric === 'temp') && (
                <ReferenceLine y={32} stroke="#DE4A4A" strokeDasharray="3 3" label={{ value: 'Batas Suhu 32°C', fill: '#DE4A4A', fontSize: 10, position: 'insideTopRight' }} />
              )}
              {(activeMetric === 'all' || activeMetric === 'humidity') && (
                <ReferenceLine y={70} stroke="#E29E1B" strokeDasharray="3 3" label={{ value: 'Batas RH 70%', fill: '#E29E1B', fontSize: 10, position: 'insideTopLeft' }} />
              )}

              {/* Garis Suhu */}
              {(activeMetric === 'all' || activeMetric === 'temp') && (
                <Line
                  type="monotone"
                  dataKey="temp"
                  name="Suhu (°C)"
                  stroke="#E87A38"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#E87A38' }}
                />
              )}

              {/* Garis Kelembapan */}
              {(activeMetric === 'all' || activeMetric === 'humidity') && (
                <Line
                  type="monotone"
                  dataKey="humidity"
                  name="Kelembapan (%)"
                  stroke="#1E5336"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#1E5336' }}
                />
              )}

              {/* Garis Gas */}
              {(activeMetric === 'all' || activeMetric === 'gas') && (
                <Line
                  type="monotone"
                  dataKey="gas"
                  name="Gas Busuk (PPM)"
                  stroke="#DE4A4A"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#DE4A4A' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-cardBorder flex flex-wrap items-center justify-between text-xs text-textMuted gap-2">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-statusGreen" />
          Kondisi Ideal: Suhu 24°C - 30°C | RH 60% - 68%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-statusDanger" />
          Ambang Waspada Kipas: RH &gt; 70% atau Gas &gt; 35 PPM
        </span>
      </div>
    </div>
  );
}
