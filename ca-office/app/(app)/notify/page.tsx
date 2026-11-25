'use client';
import { useEffect, useMemo, useState } from 'react';
import { Copy, Mail, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, inr, todayISO, addDays } from '@/lib/format';
import { Card, Empty, Field, PageHeader, Select, Textarea } from '@/components/ui';

type C = { id: string; name: string; phone: string | null; email: string | null; contact_person: string | null };
type Kind = 'documents' | 'payment' | 'deadline' | 'dsc';

const KINDS: Record<Kind, string> = {
  documents: 'Pending documents',
  payment: 'Payment reminder',
  deadline: 'Upcoming deadlines (next 10 days)',
  dsc: 'DSC renewal',
};

export default function NotifyPage() {
  const [kind, setKind] = useState<Kind>('documents');
  const [firm, setFirm] = useState('');
  const [clients, setClients] = useState<C[]>([]);
  const [lines, setLines] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sb = api();
    sb.from('firm_settings').select('name').single().then(({ data }: { data: { name: string } | null }) => setFirm(data?.name ?? ''));
    sb.from('clients').select('id, name, phone, email, contact_person').eq('status', 'active').then(({ data }: { data: C[] | null }) => setClients(data ?? []));
  }, []);

  // Build the per-client list of items for the chosen reminder type.
  useEffect(() => {
    const sb = api();
    const t = todayISO();
    const group = (rows: { client_id: string }[], fmt: (r: any) => string) =>
      rows.reduce<Record<string, string[]>>((acc, r) => ((acc[r.client_id] ??= []).push(fmt(r)), acc), {});
    setSelected(null);
    if (kind === 'documents') sb.from('documents').select('client_id, name').eq('status', 'pending')
      .then(({ data }: { data: any[] | null }) => setLines(group(data ?? [], (r) => r.name)));
    if (kind === 'payment') sb.from('invoice_balances').select('client_id, invoice_no, issue_date, balance, status').in('status', ['unpaid', 'partial'])
      .then(({ data }: { data: any[] | null }) => setLines(group(data ?? [], (r) => `${r.invoice_no} dated ${fmtDate(r.issue_date)}: ${inr(r.balance)}`)));
    if (kind === 'deadline') sb.from('tasks').select('client_id, title, period, due_date').neq('status', 'done').gte('due_date', t).lte('due_date', addDays(t, 10))
      .then(({ data }: { data: any[] | null }) => setLines(group(data ?? [], (r) => `${r.title}${r.period ? ` (${r.period})` : ''}: due ${fmtDate(r.due_date)}`)));
    if (kind === 'dsc') sb.from('dsc').select('client_id, holder_name, valid_to').lte('valid_to', addDays(t, 30))
      .then(({ data }: { data: any[] | null }) => setLines(group(data ?? [], (r) => `${r.holder_name}: valid till ${fmtDate(r.valid_to)}`)));
  }, [kind]);

  const targets = useMemo(() => clients.filter((c) => lines[c.id]?.length).sort((a, b) => a.name.localeCompare(b.name)), [clients, lines]);

  const compose = (c: C) => {
    const items = lines[c.id].map((l) => `• ${l}`).join('\n');
    const hi = `Dear ${c.contact_person || c.name},`;
    const body = {
      documents: `Gentle reminder: we are still awaiting the following documents:\n${items}\n\nKindly share them at the earliest so we can complete your filings on time.`,
      payment: `This is a friendly reminder that the following invoice(s) are pending:\n${items}\n\nKindly arrange the payment. Please ignore this if already paid.`,
      deadline: `The following compliance deadlines are coming up:\n${items}\n\nPlease share any pending information so we can file on time.`,
      dsc: `The following digital signature certificate(s) are expiring soon:\n${items}\n\nPlease let us know if we should arrange the renewal.`,
    }[kind];
    return `${hi}\n\n${body}\n\nRegards,\n${firm}`;
  };

  const pick = (c: C) => { setSelected(c.id); setText(compose(c)); setCopied(false); };
  const sel = targets.find((c) => c.id === selected);
  const phone = sel?.phone?.replace(/\D/g, '') ?? '';
  const waNumber = phone.length === 10 ? '91' + phone : phone;

  return (
    <>
      <PageHeader title="Send notifications" subtitle="Reminders written from live data. Pick a client, check the message, then send it on WhatsApp or email." />
      <div className="mb-4 max-w-sm">
        <Field label="Reminder type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title={`Clients to remind · ${targets.length}`}>
          {!targets.length ? <Empty>Nobody needs this reminder right now.</Empty> : (
            <ul className="divide-y divide-slate-100">
              {targets.map((c) => (
                <li key={c.id}>
                  <button onClick={() => pick(c)} className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left text-sm ${selected === c.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                    <span><b className="font-medium">{c.name}</b><span className="block text-xs text-slate-500">{c.phone || 'no phone'} · {c.email || 'no email'}</span></span>
                    <span className="rounded-full bg-slate-100 px-2 text-xs">{lines[c.id].length}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Message">
          {!sel ? <Empty>Choose a client on the left.</Empty> : (
            <div className="space-y-3">
              <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" />
              <div className="flex flex-wrap gap-2">
                <a target="_blank" rel="noreferrer" href={`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white ${waNumber ? 'bg-emerald-600 hover:bg-emerald-700' : 'pointer-events-none bg-slate-300'}`}>
                  <MessageCircle size={16} /> WhatsApp
                </a>
                <a href={`mailto:${sel.email ?? ''}?subject=${encodeURIComponent(KINDS[kind] + ' — ' + firm)}&body=${encodeURIComponent(text)}`}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${sel.email ? 'border-slate-300 hover:bg-slate-50' : 'pointer-events-none border-slate-200 text-slate-300'}`}>
                  <Mail size={16} /> Email
                </a>
                <button onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                  <Copy size={16} /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-slate-500">WhatsApp opens with the message filled in. You press send, so nothing goes out without you checking it.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
