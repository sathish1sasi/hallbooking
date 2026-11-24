'use client';
import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { addDays, todayISO } from '@/lib/format';
import type { Attendance } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Button, Card, Empty, ErrorNote, PageHeader, Select } from '@/components/ui';

const MARK: Record<Attendance['status'], { short: string; cls: string; label: string }> = {
  present: { short: 'P', cls: 'bg-emerald-100 text-emerald-700', label: 'Present' },
  half_day: { short: 'H', cls: 'bg-amber-100 text-amber-800', label: 'Half day' },
  leave: { short: 'L', cls: 'bg-rose-100 text-rose-700', label: 'Leave' },
  wfh: { short: 'W', cls: 'bg-blue-100 text-blue-700', label: 'Work from home' },
};
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');

export default function AttendancePage() {
  const { me, staff } = useApp();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [rows, setRows] = useState<Attendance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);

  const load = useCallback(async () => {
    const { data } = await supabase().from('attendance').select('*').gte('work_date', `${month}-01`).lte('work_date', `${month}-${daysInMonth}`);
    setRows((data ?? []) as Attendance[]);
  }, [month, daysInMonth]);
  useEffect(() => { load(); }, [load]);

  const mine = rows?.find((r) => r.user_id === me?.id && r.work_date === today);

  const upsert = async (userId: string, date: string, patch: Partial<Attendance>) => {
    setError(null);
    const { error } = await supabase().from('attendance').upsert({ user_id: userId, work_date: date, ...patch }, { onConflict: 'user_id,work_date' });
    if (error) setError(error.message);
    load();
  };

  const cycle = (userId: string, date: string) => {
    if (me?.role !== 'admin' && userId !== me?.id) return;
    const cur = rows?.find((r) => r.user_id === userId && r.work_date === date)?.status;
    const order: (Attendance['status'] | null)[] = [null, 'present', 'half_day', 'leave', 'wfh'];
    const next = order[(order.indexOf(cur ?? null) + 1) % order.length];
    if (next === null) {
      supabase().from('attendance').delete().eq('user_id', userId).eq('work_date', date).then(load);
    } else upsert(userId, date, { status: next });
  };

  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); });

  return (
    <>
      <PageHeader title="Attendance" subtitle="Check in when you arrive. Admins can correct anyone's register."
        actions={
          !mine?.check_in ? <Button onClick={() => upsert(me!.id, today, { status: 'present', check_in: new Date().toISOString() })}><LogIn size={16} /> Check in</Button>
            : !mine.check_out ? <Button variant="secondary" onClick={() => upsert(me!.id, today, { check_out: new Date().toISOString() })}><LogOut size={16} /> Check out (in since {time(mine.check_in)})</Button>
            : <span className="text-sm text-slate-500">Today: {time(mine.check_in)} – {time(mine.check_out)}</span>
        } />
      <ErrorNote error={error} />
      <Card title={
        <div className="flex items-center gap-3">
          <Select className="w-auto py-1" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {months.map((mm) => <option key={mm} value={mm}>{new Date(mm + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>)}
          </Select>
          <span className="hidden gap-2 text-xs font-normal sm:flex">{Object.values(MARK).map((v) => <span key={v.short} className={`rounded px-1.5 ${v.cls}`}>{v.short} {v.label}</span>)}</span>
        </div>
      } className="mt-3">
        {!rows ? <Empty>Loading…</Empty> : (
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white px-2 py-1 text-left font-medium text-slate-500">Staff</th>
                  {dates.map((d) => {
                    const dow = new Date(d + 'T00:00:00').getDay();
                    return <th key={d} className={`w-7 px-0.5 py-1 font-medium ${dow === 0 ? 'text-rose-400' : 'text-slate-500'}`}>{Number(d.slice(8))}</th>;
                  })}
                  <th className="px-2 font-medium text-slate-500">Days</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const mineRows = rows.filter((r) => r.user_id === s.id);
                  const days = mineRows.reduce((a, r) => a + (r.status === 'present' || r.status === 'wfh' ? 1 : r.status === 'half_day' ? 0.5 : 0), 0);
                  return (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="sticky left-0 whitespace-nowrap bg-white px-2 py-1.5 text-sm">{s.full_name}</td>
                      {dates.map((d) => {
                        const r = mineRows.find((x) => x.work_date === d);
                        const editable = me?.role === 'admin' || s.id === me?.id;
                        return (
                          <td key={d} className="p-0.5 text-center">
                            <button onClick={() => cycle(s.id, d)} disabled={!editable || d > addDays(today, 30)}
                              title={r ? `${MARK[r.status].label}${r.check_in ? ` · ${time(r.check_in)}–${time(r.check_out)}` : ''}` : 'Not marked'}
                              className={`h-6 w-6 rounded text-[11px] font-semibold ${r ? MARK[r.status].cls : 'bg-slate-50 text-slate-300'} ${d === today ? 'ring-2 ring-brand-500' : ''}`}>
                              {r ? MARK[r.status].short : '·'}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2 text-sm font-semibold tabular-nums">{days}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">Click a cell to cycle Present → Half day → Leave → Work from home → clear.</p>
          </div>
        )}
      </Card>
    </>
  );
}
