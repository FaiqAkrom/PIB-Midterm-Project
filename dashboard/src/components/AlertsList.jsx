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
    <div className="bg-cardBg rounded-2xl p-5 sm:p-6 border border-cardBorder shadow-soft">
      <div className="flex items-center justify-between pb-4 border-b border-cardBorder">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emeraldLight text-emeraldPrimary flex items-center justify-center font-bold">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-textTitle">Catatan Peringatan & Kondisi Lumbung</h3>
            <p className="text-xs text-textMuted">Histori alarm dan respon tata kelola lumbung</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-appBg text-textMuted border border-cardBorder">
          {alerts.length} Riwayat
        </span>
      </div>

      <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1">
        {alerts.length === 0 ? (
          <div className="py-8 text-center text-textMuted text-xs">
            <ShieldCheck className="w-8 h-8 mx-auto text-statusGreen mb-2 opacity-60" />
            Lumbung dalam keadaan aman dan optimal. Belum ada peringatan anomali.
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
                    ? 'bg-rose-50/70 border-rose-200'
                    : isWaspada
                    ? 'bg-amber-50/70 border-amber-200'
                    : 'bg-emeraldLight/70 border-emerald-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                        isBahaya
                          ? 'bg-rose-100 text-statusDanger'
                          : isWaspada
                          ? 'bg-amber-100 text-statusWarn'
                          : 'bg-emerald-100 text-statusGreen'
                      }`}
                    >
                      {isBahaya ? (
                        <Flame className="w-4 h-4" />
                      ) : isWaspada ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      {/* Pesan Kearifan Lokal */}
                      <p className="text-xs sm:text-sm font-semibold text-textTitle leading-snug">
                        {alert.pesan_lokal || alert.pesan_teknis || 'Kondisi stabil'}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-textMuted">
                        <span
                          className={`font-bold uppercase text-[10px] px-2 py-0.2 rounded-full ${
                            isBahaya
                              ? 'bg-rose-100 text-statusDanger'
                              : isWaspada
                              ? 'bg-amber-100 text-statusWarn'
                              : 'bg-emerald-100 text-statusGreen'
                          }`}
                        >
                          {alert.level || 'Info'}
                        </span>
                        <span>•</span>
                        <span>{formatTimestamp(alert.created_at)}</span>
                        {alert.jenis && (
                          <>
                            <span>•</span>
                            <span className="font-mono">{alert.jenis}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tombol Accordion Rincian Teknis */}
                  {alert.pesan_teknis && (
                    <button
                      onClick={() => toggleExpand(alert.id)}
                      className="p-1 rounded text-textMuted hover:text-textTitle transition cursor-pointer"
                      title="Lihat pesan teknis instrumen"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Bagian Accordion Terbuka */}
                {isExpanded && alert.pesan_teknis && (
                  <div className="mt-3 pt-2.5 border-t border-cardBorder/60 flex items-start gap-2 text-xs font-mono text-textMuted bg-cardBg/90 p-2.5 rounded-lg border border-cardBorder">
                    <Terminal className="w-3.5 h-3.5 text-textMuted shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-textTitle block font-sans text-[11px] mb-0.5">
                        Telemetri Sensor:
                      </strong>
                      <span>{alert.pesan_teknis}</span>
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
