import React from 'react';
import { BookOpen, AlertCircle, CalendarCheck, Shield } from 'lucide-react';

export default function TraditionReminders({ profileData }) {
  const reminders = profileData?.cultural_reminders || [];
  const disclaimer = profileData?.disclaimer || 'Konten kearifan lokal berstatus panduan awal.';

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-bold text-white">Tata Kelola Adat & Pengingat Tradisi</h3>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
          Pedoman Budaya
        </span>
      </div>

      {/* Banner Disclaimer Validasi Adat */}
      <div className="my-4 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold text-amber-300">Pemberitahuan Status Budaya: </strong>
          <span>{disclaimer}</span>
        </div>
      </div>

      {/* Daftar Pengingat Tradisi */}
      <div className="space-y-3 mt-4">
        {reminders.map((reminder, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3 hover:border-slate-700 transition"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200 leading-relaxed">
                {reminder}
              </p>
              <span className="text-[10px] text-slate-500 font-medium block mt-1">
                Kearifan agronomi lokal lumbung pangan
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
