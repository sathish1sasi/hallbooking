'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from './AppContext';

/** Banner + admin control for the automatic monthly creation of statutory tasks. */
export function AutoCreateSetting() {
  const { me } = useApp();
  const [days, setDays] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase().from('firm_settings').select('auto_compliance_days').single()
      .then(({ data }: { data: { auto_compliance_days: number } | null }) => setDays(data?.auto_compliance_days ?? 10));
  }, []);
  if (days === null) return null;

  const save = async (v: number) => {
    setDays(v); setSaved(false);
    const { error } = await supabase().from('firm_settings').update({ auto_compliance_days: v }).eq('id', 1);
    if (!error) setSaved(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm">
      <Repeat size={18} className="text-brand-600" />
      <span className="flex-1 text-slate-700">
        {days > 0
          ? <>Every month, GST, TDS and other statutory tasks are created <b>automatically {days} days before</b> they are due, for each client with that service, with the standard checklist. Track GST month by month on the <Link className="font-medium text-brand-700 underline" href="/gst">GST tracker</Link>.</>
          : <>Automatic creation is <b>off</b>. Use the buttons below to create tasks each month.</>}
      </span>
      {me?.role === 'admin' && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Create
          <select value={days} onChange={(e) => save(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-2 py-1 text-sm" aria-label="Days before due date">
            <option value={0}>Off</option>
            {[5, 7, 10, 15, 20, 30].map((d) => <option key={d} value={d}>{d} days before</option>)}
          </select>
          {saved && <span className="text-emerald-600">Saved</span>}
        </label>
      )}
    </div>
  );
}
