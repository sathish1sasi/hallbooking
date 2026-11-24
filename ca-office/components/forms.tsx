'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SERVICES, TASK_CATEGORIES } from '@/lib/compliance';
import { stepsFor } from '@/lib/checklists';
import { todayISO, validGSTIN, validPAN } from '@/lib/format';
import { CLIENT_TYPES, INDIAN_STATES, TASK_STATUSES, type Client, type DocumentRow, type Task } from '@/lib/types';
import { useApp } from './AppContext';
import { Button, ErrorNote, Field, Input, Select, Textarea } from './ui';

const blankToNull = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v])) as T;

// ---------------------------------------------------------------------------
export function ClientForm({ client, onSaved }: { client?: Client; onSaved: (c: Client) => void }) {
  const { staff, reloadLookups } = useApp();
  const [f, setF] = useState({
    name: client?.name ?? '',
    client_type: client?.client_type ?? 'individual',
    pan: client?.pan ?? '',
    gstin: client?.gstin ?? '',
    tan: client?.tan ?? '',
    cin: client?.cin ?? '',
    contact_person: client?.contact_person ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    address: client?.address ?? '',
    state: client?.state ?? '',
    services: client?.services ?? [],
    assigned_to: client?.assigned_to ?? '',
    status: client?.status ?? 'active',
    notes: client?.notes ?? '',
    reminders_opt_out: client?.reminders_opt_out ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const toggleService = (code: string) =>
    setF({ ...f, services: f.services.includes(code) ? f.services.filter((s) => s !== code) : [...f.services, code] });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validPAN(f.pan)) return setError('PAN format looks wrong (e.g. ABCDE1234F).');
    if (!validGSTIN(f.gstin)) return setError('GSTIN format looks wrong (15 characters, e.g. 27ABCDE1234F1Z5).');
    setBusy(true); setError(null);
    const payload = blankToNull({ ...f, pan: f.pan.toUpperCase(), gstin: f.gstin.toUpperCase(), tan: f.tan.toUpperCase() });
    const q = client
      ? supabase().from('clients').update(payload).eq('id', client.id).select().single()
      : supabase().from('clients').insert(payload).select().single();
    const { data, error } = await q;
    setBusy(false);
    if (error) return setError(error.message);
    await reloadLookups();
    onSaved(data as Client);
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client / entity name *"><Input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Type">
          <Select value={f.client_type} onChange={set('client_type')}>
            {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase() === t ? t : t[0].toUpperCase() + t.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="PAN"><Input value={f.pan} onChange={set('pan')} maxLength={10} className="uppercase" /></Field>
        <Field label="GSTIN"><Input value={f.gstin} onChange={set('gstin')} maxLength={15} className="uppercase" /></Field>
        <Field label="TAN"><Input value={f.tan} onChange={set('tan')} maxLength={10} className="uppercase" /></Field>
        <Field label="CIN / LLPIN"><Input value={f.cin} onChange={set('cin')} /></Field>
        <Field label="Contact person"><Input value={f.contact_person} onChange={set('contact_person')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="State (for GST place of supply)">
          <Select value={f.state} onChange={set('state')}>
            <option value="">—</option>
            {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Relationship manager">
          <Select value={f.assigned_to} onChange={set('assigned_to')}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>
      <Field label="Address"><Textarea rows={2} value={f.address} onChange={set('address')} /></Field>
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">Services engaged (drives the compliance calendar)</span>
        <div className="flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <button
              type="button"
              key={s.code}
              onClick={() => toggleService(s.code)}
              className={`rounded-full border px-3 py-1 text-xs ${f.services.includes(s.code) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <Field label="Notes"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={f.reminders_opt_out} onChange={(e) => setF({ ...f, reminders_opt_out: e.target.checked })} /> Don’t send automatic reminders to this client
      </label>
      <ErrorNote error={error} />
      <div className="flex justify-end"><Button disabled={busy}>{busy ? 'Saving…' : 'Save client'}</Button></div>
    </form>
  );
}

// ---------------------------------------------------------------------------
export function TaskForm({ task, clientId, onSaved, onDeleted }: {
  task?: Task; clientId?: string; onSaved: () => void; onDeleted?: () => void;
}) {
  const { staff, clients, me } = useApp();
  const [f, setF] = useState({
    client_id: task?.client_id ?? clientId ?? '',
    title: task?.title ?? '',
    category: task?.category ?? 'other',
    period: task?.period ?? '',
    due_date: task?.due_date ?? '',
    assigned_to: task?.assigned_to ?? me?.id ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'normal',
    fee: String(task?.fee ?? 0),
    acknowledgement_no: task?.acknowledgement_no ?? '',
    notes: task?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withSteps, setWithSteps] = useState(true);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const payload = blankToNull({ ...f, fee: Number(f.fee) || 0 });
    let error;
    if (task) {
      ({ error } = await supabase().from('tasks').update(payload).eq('id', task.id));
    } else {
      const res = await supabase().from('tasks').insert(payload).select('id').single();
      error = res.error;
      if (!error && withSteps) {
        await supabase().from('task_checklist').insert(stepsFor(f.category).map((label, i) => ({ task_id: res.data.id, label, position: i + 1 })));
      }
    }
    setBusy(false);
    if (error) return setError(error.message);
    onSaved();
  };

  const remove = async () => {
    if (!task || !confirm('Delete this task?')) return;
    const { error } = await supabase().from('tasks').delete().eq('id', task.id);
    if (error) return setError(error.message);
    onDeleted?.();
  };

  return (
    <form onSubmit={save} className="space-y-3">
      {!clientId && (
        <Field label="Client *">
          <Select required value={f.client_id} onChange={set('client_id')}>
            <option value="">Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Task *"><Input required value={f.title} onChange={set('title')} placeholder="e.g. GSTR-3B, ITR-3, Statutory audit" /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category">
          <Select value={f.category} onChange={set('category')}>{TASK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        </Field>
        <Field label="Period"><Input value={f.period} onChange={set('period')} placeholder="Oct-2026 / AY 2026-27" /></Field>
        <Field label="Due date"><Input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
        <Field label="Assigned to">
          <Select value={f.assigned_to} onChange={set('assigned_to')}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={set('status')}>{TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        </Field>
        <Field label="Priority">
          <Select value={f.priority} onChange={set('priority')}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
          </Select>
        </Field>
        <Field label="Professional fee (₹)"><Input type="number" min="0" step="0.01" value={f.fee} onChange={set('fee')} /></Field>
        <Field label="ARN / Ack. no."><Input value={f.acknowledgement_no} onChange={set('acknowledgement_no')} /></Field>
      </div>
      <Field label="Notes"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      {!task && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={withSteps} onChange={(e) => setWithSteps(e.target.checked)} /> Add the standard {f.category} checklist ({stepsFor(f.category).length} steps)
        </label>
      )}
      <ErrorNote error={error} />
      <div className="flex justify-between">
        {task ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}>Delete</Button> : <span />}
        <Button disabled={busy}>{busy ? 'Saving…' : 'Save task'}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
export function DocumentForm({ doc, clientId, onSaved }: { doc?: DocumentRow; clientId?: string; onSaved: () => void }) {
  const { clients } = useApp();
  const [f, setF] = useState({
    client_id: doc?.client_id ?? clientId ?? '',
    name: doc?.name ?? '',
    status: doc?.status ?? 'pending',
    requested_on: doc?.requested_on ?? todayISO(),
    notes: doc?.notes ?? '',
  });
  const [bulk, setBulk] = useState('');
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const sb = supabase();
    let res;
    if (doc) {
      res = await sb.from('documents').update(blankToNull(f)).eq('id', doc.id);
    } else {
      // Allow several documents at once, one per line.
      const names = [f.name, ...bulk.split('\n')].map((s) => s.trim()).filter(Boolean);
      res = await sb.from('documents').insert(names.map((name) => blankToNull({ ...f, name })));
    }
    if (res.error) return setError(res.error.message);
    onSaved();
  };

  return (
    <form onSubmit={save} className="space-y-3">
      {!clientId && (
        <Field label="Client *">
          <Select required value={f.client_id} onChange={set('client_id')}>
            <option value="">Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Document *"><Input required value={f.name} onChange={set('name')} placeholder="e.g. Form 16, bank statements Apr–Mar" /></Field>
      {!doc && (
        <Field label="More documents (one per line, optional)">
          <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Form 26AS / AIS\nCapital gains statement\nRent receipts'} />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Requested on"><Input type="date" value={f.requested_on} onChange={set('requested_on')} /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={set('status')}>
            <option value="pending">Pending</option><option value="received">Received</option><option value="returned">Returned to client</option>
          </Select>
        </Field>
      </div>
      <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      <ErrorNote error={error} />
      <div className="flex justify-end"><Button>Save</Button></div>
    </form>
  );
}
