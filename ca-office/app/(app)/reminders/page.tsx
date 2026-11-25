'use client';
import { useEffect, useState } from 'react';
import { Eye, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import type { FirmSettings } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, PageHeader, Table, Td } from '@/components/ui';

type Summary = {
  date: string; recurringCreated: number; remindersEnabled: boolean; emailReady: boolean; whatsappReady: boolean;
  planned: number; sent: number; failed: number; skipped: number;
  details: { client: string; kind: string; channel: string; status: string; detail?: string }[];
};
type Log = { id: string; sent_on: string; kind: string; channel: string; status: string; detail: string | null; clients: { name: string } | null };

const KINDS = [
  ['deadline', 'Upcoming deadlines', 'Sent N days before a task is due, listing every filing due that day.'],
  ['documents', 'Pending documents', 'Sent when a requested document has been pending for N days, then repeated.'],
  ['payment', 'Overdue payments', 'Sent N days after an invoice due date, then repeated until paid.'],
] as const;

export default function RemindersPage() {
  const { me } = useApp();
  const [f, setF] = useState<FirmSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [log, setLog] = useState<Log[]>([]);

  const loadLog = () => api().from('reminder_log').select('id, sent_on, kind, channel, status, detail, clients(name)')
    .order('created_at', { ascending: false }).limit(100).then(({ data }: { data: Log[] | null }) => setLog(data ?? []));

  useEffect(() => {
    api().from('firm_settings').select('*').single().then(({ data }: { data: FirmSettings | null }) => setF(data));
    loadLog();
  }, []);

  if (me && me.role !== 'admin') return <Empty>Only admins can change reminder settings.</Empty>;
  if (!f) return <Empty>Loading…</Empty>;

  const toggle = (k: 'reminder_kinds' | 'reminder_channels', v: string) => {
    setSaved(false);
    setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  };
  const num = (k: keyof FirmSettings) => (e: React.ChangeEvent<HTMLInputElement>) => { setSaved(false); setF({ ...f, [k]: Math.max(0, Number(e.target.value)) }); };

  const save = async () => {
    setError(null);
    const { reminders_enabled, reminder_deadline_days, reminder_doc_after_days, reminder_repeat_days, reminder_payment_grace_days, reminder_kinds, reminder_channels } = f;
    const { error } = await api().from('firm_settings').update({
      reminders_enabled, reminder_deadline_days, reminder_doc_after_days, reminder_repeat_days, reminder_payment_grace_days, reminder_kinds, reminder_channels,
    }).eq('id', 1);
    if (error) setError(error.message); else setSaved(true);
  };

  const run = async (dry: boolean) => {
    setBusy(dry ? 'preview' : 'send'); setError(null);
    const { data, error } = await api().rpc<Summary>('run_daily_job', { dry });
    if (error) setError(error.message);
    else { setPreview(data); if (!dry) loadLog(); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader title="Automatic reminders" subtitle="Every morning (when the cPanel cron job runs) the app emails (and optionally WhatsApps) clients about deadlines, pending documents and overdue payments."
        actions={<>
          <Button variant="secondary" disabled={!!busy} onClick={() => run(true)}><Eye size={16} /> {busy === 'preview' ? 'Checking…' : 'Preview today'}</Button>
          <Button disabled={!!busy || !f.reminders_enabled} onClick={() => run(false)} title={f.reminders_enabled ? '' : 'Switch reminders on first'}><Send size={16} /> {busy === 'send' ? 'Sending…' : 'Send now'}</Button>
        </>} />
      <ErrorNote error={error} />

      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        <Card title="Settings">
          <label className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <span><b className="block text-sm">Send reminders automatically</b><span className="text-xs text-slate-500">When off, nothing is sent. Preview still works.</span></span>
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={f.reminders_enabled} onChange={(e) => { setSaved(false); setF({ ...f, reminders_enabled: e.target.checked }); }} />
          </label>
          <div className="space-y-3">
            {KINDS.map(([k, label, hint]) => (
              <label key={k} className="flex gap-3 text-sm">
                <input type="checkbox" className="mt-1 accent-brand-600" checked={f.reminder_kinds.includes(k)} onChange={() => toggle('reminder_kinds', k)} />
                <span><b className="font-medium">{label}</b><span className="block text-xs text-slate-500">{hint}</span></span>
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Deadline: days before due"><Input type="number" min="1" value={f.reminder_deadline_days} onChange={num('reminder_deadline_days')} /></Field>
            <Field label="Documents: chase after (days)"><Input type="number" min="1" value={f.reminder_doc_after_days} onChange={num('reminder_doc_after_days')} /></Field>
            <Field label="Payment: days after due date"><Input type="number" min="0" value={f.reminder_payment_grace_days} onChange={num('reminder_payment_grace_days')} /></Field>
            <Field label="Repeat chasers every (days)"><Input type="number" min="1" value={f.reminder_repeat_days} onChange={num('reminder_repeat_days')} /></Field>
          </div>
          <div className="mt-4 flex gap-5 text-sm">
            <span className="text-xs font-medium text-slate-600">Send by:</span>
            {['email', 'whatsapp'].map((c) => (
              <label key={c} className="flex items-center gap-2 capitalize"><input type="checkbox" className="accent-brand-600" checked={f.reminder_channels.includes(c)} onChange={() => toggle('reminder_channels', c)} />{c === 'whatsapp' ? 'WhatsApp' : 'Email'}</label>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
            <Button onClick={save}>Save settings</Button>
          </div>
          <p className="mt-4 text-xs text-slate-500">Clients can be excluded individually: edit the client and tick “Don’t send automatic reminders”.</p>
        </Card>

        <Card title={preview ? `Today (${fmtDate(preview.date)}): ${preview.planned} reminder${preview.planned === 1 ? '' : 's'}` : 'Preview'}>
          {!preview ? <Empty>Press “Preview today” to see who would get a reminder this morning. Nothing is sent.</Empty> : (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <Badge className={preview.emailReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}>Email {preview.emailReady ? 'connected' : 'not set up'}</Badge>
                <Badge className={preview.whatsappReady ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>WhatsApp {preview.whatsappReady ? 'connected' : 'not set up'}</Badge>
                {preview.sent + preview.failed > 0 && <Badge className="bg-blue-100 text-blue-700">{preview.sent} sent · {preview.failed} failed</Badge>}
              </div>
              {!preview.details.length ? <p className="text-sm text-slate-500">Nobody needs a reminder today.</p> : (
                <Table head={['Client', 'Type', 'Channel', 'Result']}>
                  {preview.details.map((d, i) => (
                    <tr key={i}><Td className="font-medium">{d.client}</Td><Td className="capitalize">{d.kind}</Td><Td className="capitalize">{d.channel}</Td>
                      <Td><span className={d.status === 'failed' ? 'text-rose-600' : d.status === 'sent' ? 'text-emerald-600' : 'text-slate-500'}>{d.detail ?? d.status}</span></Td></tr>
                  ))}
                </Table>
              )}
            </>
          )}
        </Card>
      </div>

      <Card title="Sent log" className="mt-5">
        {!log.length ? <Empty>No reminders sent yet.</Empty> : (
          <Table head={['Date', 'Client', 'Type', 'Channel', 'Status', 'Detail']}>
            {log.map((l) => (
              <tr key={l.id}><Td className="whitespace-nowrap">{fmtDate(l.sent_on)}</Td><Td>{l.clients?.name}</Td><Td className="capitalize">{l.kind}</Td><Td className="capitalize">{l.channel}</Td>
                <Td><Badge className={l.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : l.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}>{l.status}</Badge></Td>
                <Td className="text-xs text-slate-500">{l.detail}</Td></tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
