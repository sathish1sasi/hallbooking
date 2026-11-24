'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TASK_CATEGORIES } from '@/lib/compliance';
import { stepsFor } from '@/lib/checklists';
import { addDays, fmtDate, inr, todayISO } from '@/lib/format';
import type { RecurringTask } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Td, Textarea } from '@/components/ui';

const FREQ: Record<RecurringTask['frequency'], string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half-yearly', yearly: 'Yearly' };

export default function RecurringPage() {
  const { staffName, me } = useApp();
  const [rows, setRows] = useState<RecurringTask[] | null>(null);
  const [modal, setModal] = useState<null | 'new' | RecurringTask>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase().from('recurring_tasks').select('*, clients(name)').order('next_due');
    setRows((data ?? []) as RecurringTask[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setBusy(true); setError(null); setMsg(null);
    const { data, error } = await supabase().rpc('generate_recurring_tasks', { p_lead_days: 7 });
    setBusy(false);
    if (error) return setError(error.message);
    setMsg(data ? `Created ${data} task${data === 1 ? '' : 's'} due in the next 7 days.` : 'Nothing new: every task due in the next 7 days already exists.');
    load();
  };

  return (
    <>
      <Link href="/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Tasks</Link>
      <PageHeader title="Recurring tasks"
        subtitle="Work that repeats for a client, like monthly bookkeeping or a weekly MIS. Each task appears 7 days before it is due, with its checklist. This runs automatically every morning."
        actions={<>
          <Button variant="secondary" disabled={busy} onClick={generate}><RefreshCw size={15} /> {busy ? 'Creating…' : 'Create due tasks now'}</Button>
          <Button onClick={() => setModal('new')}><Plus size={16} /> New recurring task</Button>
        </>} />
      <ErrorNote error={error} />
      {msg && <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      <Card>
        {!rows ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No recurring tasks yet. Statutory returns come from the compliance calendar; use this for everything else that repeats.</Empty> : (
          <Table head={['Client', 'Task', 'Repeats', 'Next due', 'Assigned', 'Fee', 'Steps']}>
            {rows.map((r) => (
              <tr key={r.id} className={`cursor-pointer hover:bg-slate-50 ${r.active ? '' : 'opacity-50'}`} onClick={() => setModal(r)}>
                <Td className="font-medium">{r.clients?.name}</Td>
                <Td>{r.title}<div className="text-xs text-slate-500">{r.category}</div></Td>
                <Td>{FREQ[r.frequency]}{r.frequency !== 'weekly' && <span className="text-xs text-slate-500"> · day {r.anchor_day}</span>}</Td>
                <Td className="whitespace-nowrap">{r.active ? fmtDate(r.next_due) : <Badge>paused</Badge>}</Td>
                <Td>{staffName(r.assigned_to)}</Td>
                <Td>{inr(r.fee)}</Td>
                <Td>{r.checklist.length}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {modal && (
        <Modal title={modal === 'new' ? 'New recurring task' : 'Edit recurring task'} wide onClose={() => setModal(null)}>
          <RecurringForm rec={modal === 'new' ? undefined : modal} canDelete={me?.role === 'admin'} onSaved={() => { setModal(null); load(); }} />
        </Modal>
      )}
    </>
  );
}

function RecurringForm({ rec, canDelete, onSaved }: { rec?: RecurringTask; canDelete: boolean; onSaved: () => void }) {
  const { clients, staff } = useApp();
  const [f, setF] = useState({
    client_id: rec?.client_id ?? '', title: rec?.title ?? '', category: rec?.category ?? 'Accounting',
    frequency: rec?.frequency ?? 'monthly', anchor_day: String(rec?.anchor_day ?? 10), next_due: rec?.next_due ?? addDays(todayISO(), 7),
    period_mode: rec?.period_mode ?? 'previous', assigned_to: rec?.assigned_to ?? '', fee: String(rec?.fee ?? 0),
    checklist: (rec?.checklist ?? stepsFor('Accounting')).join('\n'), active: rec?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...f, anchor_day: Math.min(31, Math.max(1, Number(f.anchor_day) || 1)), fee: Number(f.fee) || 0,
      assigned_to: f.assigned_to || null, checklist: f.checklist.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    const { error } = rec ? await supabase().from('recurring_tasks').update(payload).eq('id', rec.id) : await supabase().from('recurring_tasks').insert(payload);
    if (error) return setError(error.message);
    onSaved();
  };
  const remove = async () => {
    if (!rec) return;
    const { error } = await supabase().from('recurring_tasks').delete().eq('id', rec.id);
    if (error) return setError(error.message);
    onSaved();
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client *">
          <Select required value={f.client_id} onChange={set('client_id')}><option value="">Select client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="Task *"><Input required value={f.title} onChange={set('title')} placeholder="Monthly bookkeeping" /></Field>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => {
            const category = e.target.value;
            // Swap in the standard steps if the user hasn't customised them.
            const untouched = f.checklist === stepsFor(f.category).join('\n') || !f.checklist.trim();
            setF({ ...f, category, checklist: untouched ? stepsFor(category).join('\n') : f.checklist });
          }}>{TASK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        </Field>
        <Field label="Assign to">
          <Select value={f.assigned_to} onChange={set('assigned_to')}><option value="">Client's manager / unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
        </Field>
        <Field label="Repeats">
          <Select value={f.frequency} onChange={set('frequency')}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        {f.frequency !== 'weekly' && <Field label="Due on day of month"><Input type="number" min="1" max="31" value={f.anchor_day} onChange={set('anchor_day')} /></Field>}
        <Field label="First / next due date"><Input type="date" required value={f.next_due} onChange={set('next_due')} /></Field>
        <Field label="Period label on tasks">
          <Select value={f.period_mode} onChange={set('period_mode')}>
            <option value="previous">Previous period (e.g. due 10 Dec → Nov-2026)</option>
            <option value="current">Same month as due date</option>
            <option value="none">No period</option>
          </Select>
        </Field>
        <Field label="Fee per occurrence (₹)"><Input type="number" min="0" step="0.01" value={f.fee} onChange={set('fee')} /></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
      </div>
      <Field label="Checklist (one step per line, copied onto every task)"><Textarea rows={6} value={f.checklist} onChange={set('checklist')} /></Field>
      <ErrorNote error={error} />
      <div className="flex justify-between">
        {rec && canDelete ? (confirmDelete
          ? <span className="flex items-center gap-2 text-sm">Delete this template? Existing tasks stay. <Button type="button" variant="danger" onClick={remove}>Delete</Button><Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button></span>
          : <Button type="button" variant="ghost" className="text-red-600" onClick={() => setConfirmDelete(true)}>Delete</Button>) : <span />}
        <Button>Save</Button>
      </div>
    </form>
  );
}
