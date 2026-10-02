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
    .map((item, idx) => {
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
    <div className="glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-bold text-white">Grafik Tren Mikroklimat & Ambang Batas</h3>
        </div>

        {/* Pemilih Tab & Rentang Waktu */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Metrik */}
          <div className="flex bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveMetric('all')}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                activeMetric === 'all' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setActiveMetric('temp')}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                activeMetric === 'temp' ? 'bg-orange-500/20 text-orange-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Suhu
            </button>
            <button
              onClick={() => setActiveMetric('humidity')}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                activeMetric === 'humidity' ? 'bg-blue-500/20 text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Kelembapan
            </button>
            <button
              onClick={() => setActiveMetric('gas')}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                activeMetric === 'gas' ? 'bg-purple-500/20 text-purple-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Gas
            </button>
          </div>

          {/* Rentang Waktu */}
          <div className="flex bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => onRangeChange('1h')}
              className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                currentRange === '1h' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1 Jam
            </button>
            <button
              onClick={() => onRangeChange('24h')}
              className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                currentRange === '24h' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              24 Jam
            </button>
          </div>
        </div>
      </div>

      {/* Kontainer Grafik */}
      <div className="w-full h-72 sm:h-80 mt-4">
        {formattedData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
            Menunggu data telemetri pertama masuk...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} />
              {activeMetric === 'gas' && (
                <YAxis yAxisId="gasAxis" orientation="right" stroke="#c084fc" tick={{ fontSize: 11 }} domain={[100, 1000]} />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  fontSize: '0.75rem',
                  color: '#fff'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

              {/* Garis Ambang Batas Penting */}
              {(activeMetric === 'all' || activeMetric === 'humidity') && (
                <ReferenceLine yAxisId="left" y={70} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Batas RH 70%', fill: '#f59e0b', fontSize: 10 }} />
              )}
              {(activeMetric === 'all' || activeMetric === 'humidity') && (
                <ReferenceLine yAxisId="left" y={75} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Kritis RH 75%', fill: '#ef4444', fontSize: 10 }} />
              )}
              {(activeMetric === 'all' || activeMetric === 'temp') && (
                <ReferenceLine yAxisId="left" y={30} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'Suhu 30°C', fill: '#f97316', fontSize: 10 }} />
              )}

              {/* Garis Data Suhu */}
              {(activeMetric === 'all' || activeMetric === 'temp') && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="temp"
                  name="Suhu (°C)"
                  stroke="#fb923c"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              )}

              {/* Garis Data Kelembapan */}
              {(activeMetric === 'all' || activeMetric === 'humidity') && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="humidity"
                  name="Kelembapan (%)"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              )}

              {/* Garis Data Gas */}
              {(activeMetric === 'all' || activeMetric === 'gas') && (
                <Line
                  yAxisId={activeMetric === 'gas' ? 'gasAxis' : 'left'}
                  type="monotone"
                  dataKey="gas"
                  name={activeMetric === 'gas' ? 'Gas (ppm)' : 'Gas (/10)'}
                  stroke="#c084fc"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
