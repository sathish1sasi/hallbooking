'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { addDays, inr, todayISO } from '@/lib/format';
import type { FirmSettings } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Button, Card, ErrorNote, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';

type Line = { key: number; task_id: string | null; description: string; sac: string; qty: string; rate: string };
type UnbilledTask = { id: string; title: string; period: string | null; fee: number; status: string };

export default function NewInvoicePage() {
  return <Suspense><NewInvoice /></Suspense>;
}

let seq = 0;
const blank = (): Line => ({ key: ++seq, task_id: null, description: '', sac: '998222', qty: '1', rate: '' });

function NewInvoice() {
  const router = useRouter();
  const params = useSearchParams();
  const { clients } = useApp();
  const [clientId, setClientId] = useState(params.get('client') ?? '');
  const [firm, setFirm] = useState<FirmSettings | null>(null);
  const [unbilled, setUnbilled] = useState<UnbilledTask[]>([]);
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [issue, setIssue] = useState(todayISO());
  const [due, setDue] = useState(addDays(todayISO(), 15));
  const [taxRate, setTaxRate] = useState('18');
  const [igst, setIgst] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api().from('firm_settings').select('*').single().then(({ data }: { data: FirmSettings | null }) => setFirm(data));
  }, []);

  useEffect(() => {
    if (!clientId) { setUnbilled([]); return; }
    const c = clients.find((x) => x.id === clientId);
    setIgst(!!(firm?.state && c?.state && firm.state !== c.state));
    api().from('tasks').select('id, title, period, fee, status').eq('client_id', clientId).eq('billed', false).gt('fee', 0).order('due_date')
      .then(({ data }: { data: UnbilledTask[] | null }) => setUnbilled(data ?? []));
    setLines([blank()]);
  }, [clientId, clients, firm]);

  const toggleTask = (t: UnbilledTask) => {
    if (lines.some((l) => l.task_id === t.id)) setLines(lines.filter((l) => l.task_id !== t.id));
    else setLines([...lines.filter((l) => l.description || l.rate), { ...blank(), task_id: t.id, description: `${t.title}${t.period ? ` — ${t.period}` : ''}`, rate: String(t.fee) }]);
  };
  const upd = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const valid = lines.filter((l) => l.description.trim() && Number(l.rate) > 0 && Number(l.qty) > 0);
  const subtotal = valid.reduce((a, l) => a + Math.round(Number(l.qty) * Number(l.rate) * 100) / 100, 0);
  const tax = Math.round(subtotal * Number(taxRate || 0)) / 100;

  const save = async () => {
    if (!clientId) return setError('Pick a client.');
    if (!valid.length) return setError('Add at least one line with a description and amount.');
    setBusy(true); setError(null);
    const sb = api();
    const { data: no, error: e1 } = await sb.rpc('next_invoice_number', { p_date: issue });
    if (e1) { setBusy(false); return setError(e1.message); }
    const { data: inv, error: e2 } = await sb.from('invoices').insert({
      invoice_no: no, client_id: clientId, issue_date: issue, due_date: due || null,
      tax_rate: Number(taxRate || 0), is_igst: igst, notes: notes || null,
    }).select('id').single();
    if (e2) { setBusy(false); return setError(e2.message); }
    const { error: e3 } = await sb.from('invoice_items').insert(valid.map((l) => ({
      invoice_id: inv.id, task_id: l.task_id, description: l.description.trim(), sac: l.sac || null, qty: Number(l.qty), rate: Number(l.rate),
    })));
    if (e3) { setBusy(false); return setError(e3.message); }
    const taskIds = valid.map((l) => l.task_id).filter(Boolean) as string[];
    if (taskIds.length) await sb.from('tasks').update({ billed: true }).in('id', taskIds);
    router.replace(`/invoices/view/?id=${inv.id}`);
  };

  return (
    <>
      <PageHeader title="New invoice" subtitle={firm ? `Next number: ${firm.invoice_prefix}/…/${String(firm.next_invoice_no).padStart(4, '0')}` : undefined} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Client *">
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Select client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Invoice date"><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
              <Field label="Payment due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            </div>
          </Card>

          {unbilled.length > 0 && (
            <Card title="Unbilled work for this client">
              <ul className="space-y-1">
                {unbilled.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={lines.some((l) => l.task_id === t.id)} onChange={() => toggleTask(t)} />
                        {t.title}{t.period ? ` — ${t.period}` : ''}
                        {t.status !== 'done' && <span className="text-xs text-amber-600">(not completed)</span>}
                      </span>
                      <span>{inr(t.fee)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Line items" action={<Button variant="ghost" onClick={() => setLines([...lines, blank()])}><Plus size={14} /> Add line</Button>}>
            <div className="space-y-2">
              <div className="hidden grid-cols-12 gap-2 text-xs font-medium text-slate-500 sm:grid">
                <span className="col-span-6">Description</span><span className="col-span-2">SAC</span><span className="col-span-1">Qty</span><span className="col-span-2">Rate</span>
              </div>
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-12 gap-2">
                  <Input className="col-span-12 sm:col-span-6" placeholder="Professional fees for…" value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} />
                  <Input className="col-span-4 sm:col-span-2" value={l.sac} onChange={(e) => upd(l.key, { sac: e.target.value })} />
                  <Input className="col-span-2 sm:col-span-1" type="number" min="0" step="0.01" value={l.qty} onChange={(e) => upd(l.key, { qty: e.target.value })} />
                  <Input className="col-span-4 sm:col-span-2" type="number" min="0" step="0.01" placeholder="0.00" value={l.rate} onChange={(e) => upd(l.key, { rate: e.target.value })} />
                  <button className="col-span-2 text-slate-400 hover:text-red-600 sm:col-span-1" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remove line">
                    <Trash2 size={16} className="mx-auto" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
          <Field label="Notes on invoice"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Reimbursement of government fees at actuals" /></Field>
        </div>

        <Card title="Summary" className="h-fit lg:sticky lg:top-6">
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Field label="GST rate %"><Input type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
              <Field label="Tax type">
                <Select value={igst ? 'igst' : 'cgst'} onChange={(e) => setIgst(e.target.value === 'igst')}>
                  <option value="cgst">CGST + SGST</option><option value="igst">IGST</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{inr(subtotal)}</span></div>
            {igst ? (
              <div className="flex justify-between"><span className="text-slate-500">IGST @ {taxRate}%</span><span>{inr(tax)}</span></div>
            ) : (<>
              <div className="flex justify-between"><span className="text-slate-500">CGST @ {Number(taxRate) / 2}%</span><span>{inr(tax / 2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">SGST @ {Number(taxRate) / 2}%</span><span>{inr(tax / 2)}</span></div>
            </>)}
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{inr(subtotal + tax)}</span></div>
            <ErrorNote error={error} />
            <Button className="w-full" disabled={busy} onClick={save}>{busy ? 'Creating…' : 'Create invoice'}</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
