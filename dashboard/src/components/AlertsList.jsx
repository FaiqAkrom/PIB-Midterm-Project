import React, { useState } from 'react';
import { Bell, AlertTriangle, ShieldCheck, Flame, ChevronDown, ChevronUp, Terminal } from 'lucide-react';

export default function AlertsList({ alerts = [] }) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + ' WIB';
  };

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-bold text-white">Catatan Peringatan & Hawa Lumbung</h3>
        </div>
        <span className="text-xs text-slate-400 font-semibold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
          {alerts.length} Riwayat
        </span>
      </div>

      <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1">
        {alerts.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500/50 mb-2" />
            Lumbung dalam keadaan tenang dan rahayu. Belum ada peringatan anomali.
          </div>
        ) : (
          alerts.map((alert) => {
            const isBahaya = alert.level === 'bahaya';
            const isWaspada = alert.level === 'waspada';
            const isExpanded = expandedId === alert.id;

            return (
              <div
                key={alert.id || alert.created_at}
                className={`p-3.5 rounded-xl border transition-all ${
                  isBahaya
                    ? 'bg-red-950/20 border-red-500/30'
                    : isWaspada
                    ? 'bg-amber-950/20 border-amber-500/30'
                    : 'bg-emerald-950/20 border-emerald-500/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                        isBahaya
                          ? 'bg-red-500/20 text-red-400'
                          : isWaspada
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {isBahaya && <Flame className="w-4 h-4" />}
                      {isWaspada && <AlertTriangle className="w-4 h-4" />}
                      {!isBahaya && !isWaspada && <ShieldCheck className="w-4 h-4" />}
                    </div>

                    <div>
                      {/* Pesan Utama Berbahasa Lokal */}
                      <p className="text-sm font-bold text-white tracking-wide">
                        {alert.pesan_lokal}
                      </p>

                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                            isBahaya
                              ? 'bg-red-500/30 text-red-300'
                              : isWaspada
                              ? 'bg-amber-500/30 text-amber-300'
                              : 'bg-emerald-500/30 text-emerald-300'
                          }`}
                        >
                          {alert.level}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatTimestamp(alert.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tombol Rincian Teknis */}
                  <button
                    onClick={() => toggleExpand(alert.id)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title="Buka rincian teknis sensor"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Detail Teknis (Accordion) */}
                {isExpanded && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800 text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg flex items-start gap-2">
                    <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                        Rincian Diagnosa Sensor:
                      </span>
                      <p className="font-mono text-slate-300 mt-0.5">{alert.pesan_teknis}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
