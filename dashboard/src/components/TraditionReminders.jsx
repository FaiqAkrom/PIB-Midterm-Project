import React from 'react';
import { BookOpen, AlertCircle, CalendarCheck } from 'lucide-react';

export default function TraditionReminders({ profileData }) {
  const reminders = profileData?.cultural_reminders || [
    'Mariksa leuit waktu isuk sangkan hawa heubeul ganti ku hawa anyar nu seger.',
    'Ulah nutup rapet angin-angin leuit mun pare anyar tas diakut ti huma.',
    'Mun aya bau apek atawa haseum, geura jemur deui pare dina poe panas.'
  ];
  const disclaimer = profileData?.disclaimer || 'Konten kearifan lokal berstatus panduan awal.';

  return (
    <div className="bg-cardBg rounded-2xl p-5 sm:p-6 border border-cardBorder shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-cardBorder">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emeraldLight text-emeraldPrimary flex items-center justify-center font-bold">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-textTitle">Tata Kelola Adat & Pengingat Tradisi</h3>
            <p className="text-xs text-textMuted">Pedoman kearifan agronomi lokal</p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emeraldLight text-emeraldPrimary border border-emerald-200">
          Pedoman Budaya
        </span>
      </div>

      {/* Banner Disclaimer Validasi Adat */}
      <div className="my-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
        <AlertCircle className="w-4 h-4 text-statusWarn shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold text-amber-950">Pemberitahuan Status Budaya: </strong>
          <span>{disclaimer}</span>
        </div>
      </div>

      {/* Daftar Pengingat Tradisi */}
      <div className="space-y-3 mt-4">
        {reminders.map((reminder, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-appBg border border-cardBorder flex items-start gap-3 hover:border-emerald-200 transition"
          >
            <div className="p-2 rounded-lg bg-emeraldLight text-emeraldPrimary shrink-0 mt-0.5">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-semibold text-textTitle leading-relaxed">
                {reminder}
              </p>
              <span className="text-[11px] text-textMuted font-medium block mt-1">
                Kearifan agronomi lumbung pangan tradisi
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
