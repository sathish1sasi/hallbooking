'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { addDays, fmtDate, inr, todayISO } from '@/lib/format';
import type { TimeEntry } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Td, Textarea } from '@/components/ui';

export default function TimesheetsPage() {
  const { me, staff, clients } = useApp();
  const today = todayISO();
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));
  const [from, setFrom] = useState(monday);
  const [to, setTo] = useState(today);
  const [who, setWho] = useState<string>('me');
  const [rows, setRows] = useState<TimeEntry[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    let q = supabase().from('time_entries').select('*, clients(name), profiles(full_name)')
      .gte('work_date', from).lte('work_date', to).order('work_date', { ascending: false });
    if (who === 'me') q = q.eq('user_id', me.id);
    else if (who) q = q.eq('user_id', who);
    const { data } = await q;
    setRows((data ?? []) as TimeEntry[]);
  }, [me, from, to, who]);
  useEffect(() => { load(); }, [load]);

  const rate = (uid: string) => Number(staff.find((s) => s.id === uid)?.hourly_rate ?? 0);
  const totals = useMemo(() => {
    const byClient = new Map<string, { name: string; hours: number; billable: number; value: number }>();
    let hours = 0, billable = 0, value = 0;
    (rows ?? []).forEach((r) => {
      const h = Number(r.hours);
      hours += h;
      const e = byClient.get(r.client_id) ?? { name: r.clients?.name ?? '', hours: 0, billable: 0, value: 0 };
      e.hours += h;
      if (r.billable) { billable += h; e.billable += h; const v = h * rate(r.user_id); value += v; e.value += v; }
      byClient.set(r.client_id, e);
    });
    return { hours, billable, value, byClient: [...byClient.entries()].sort((a, b) => b[1].hours - a[1].hours) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, staff]);

  const remove = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    const { error } = await supabase().from('time_entries').delete().eq('id', id);
    if (error) alert(error.message); else load();
  };

  return (
    <>
      <PageHeader title="Timesheets" actions={<Button onClick={() => setAdding(true)}><Plus size={16} /> Log time</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Staff">
          <Select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="me">Me</option><option value="">Everyone</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </Field>
        <div className="flex gap-2 pb-0.5">
          <Button variant="ghost" onClick={() => { setFrom(monday); setTo(today); }}>This week</Button>
          <Button variant="ghost" onClick={() => { setFrom(today.slice(0, 8) + '01'); setTo(today); }}>This month</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Entries" className="lg:col-span-2">
          {!rows ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No time logged in this range.</Empty> : (
            <Table head={['Date', 'Client', 'Staff', 'Hours', 'Work done', '']}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{fmtDate(r.work_date)}</Td>
                  <Td><Link className="hover:text-brand-600" href={`/clients/${r.client_id}`}>{r.clients?.name}</Link></Td>
                  <Td>{r.profiles?.full_name}</Td>
                  <Td>{Number(r.hours).toFixed(2)}{!r.billable && <div className="text-xs text-slate-400">non-billable</div>}</Td>
                  <Td>{r.description}</Td>
                  <Td>{(r.user_id === me?.id || me?.role === 'admin') && (
                    <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600" aria-label="Delete"><Trash2 size={15} /></button>
                  )}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Summary">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Total hours</span><b>{totals.hours.toFixed(1)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Billable hours</span><b>{totals.billable.toFixed(1)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Billable value</span><b>{inr(totals.value)}</b></div>
          </div>
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase text-slate-500">By client</h3>
          <ul className="space-y-1 text-sm">
            {totals.byClient.map(([id, c]) => (
              <li key={id} className="flex justify-between gap-2"><span className="truncate">{c.name}</span><span>{c.hours.toFixed(1)}h</span></li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-400">Value uses each staff member's hourly rate (set by an admin on the Staff page).</p>
        </Card>
      </div>

      {adding && (
        <Modal title="Log time" onClose={() => setAdding(false)}>
          <TimeForm clients={clients} onSaved={() => { setAdding(false); load(); }} />
        </Modal>
      )}
    </>
  );
}

function TimeForm({ clients, onSaved }: { clients: { id: string; name: string }[]; onSaved: () => void }) {
  const [f, setF] = useState({ client_id: '', task_id: '', work_date: todayISO(), hours: '1', description: '', billable: true });
  const [tasks, setTasks] = useState<{ id: string; title: string; period: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!f.client_id) { setTasks([]); return; }
    supabase().from('tasks').select('id, title, period').eq('client_id', f.client_id).neq('status', 'done').order('due_date')
      .then(({ data }: { data: typeof tasks | null }) => setTasks(data ?? []));
  }, [f.client_id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase().from('time_entries').insert({
      ...f, task_id: f.task_id || null, hours: Number(f.hours), description: f.description || null,
    });
    if (error) return setError(error.message);
    onSaved();
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Client *">
        <Select required value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value, task_id: '' })}>
          <option value="">Select client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Task (optional)">
        <Select value={f.task_id} onChange={(e) => setF({ ...f, task_id: e.target.value })}>
          <option value="">—</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.period ? ` · ${t.period}` : ''}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={f.work_date} onChange={(e) => setF({ ...f, work_date: e.target.value })} /></Field>
        <Field label="Hours"><Input type="number" min="0.25" max="24" step="0.25" required value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></Field>
      </div>
      <Field label="Work done"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} /> Billable</label>
      <ErrorNote error={error} />
      <div className="flex justify-end"><Button>Save</Button></div>
    </form>
  );
}
