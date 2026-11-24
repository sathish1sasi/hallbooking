'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { amountInWords, fmtDate, inr, todayISO } from '@/lib/format';
import type { FirmSettings, Invoice, InvoiceItem, Payment } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Button, Card, ErrorNote, Field, Input, InvoiceStatusBadge, Select, Table, Td } from '@/components/ui';

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useApp();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [firm, setFirm] = useState<FirmSettings | null>(null);
  const [pay, setPay] = useState({ amount: '', paid_on: todayISO(), mode: 'bank', reference: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [i, it, p, f] = await Promise.all([
      sb.from('invoices').select('*, clients(name, gstin, pan, address, state, email)').eq('id', id).single(),
      sb.from('invoice_items').select('*').eq('invoice_id', id),
      sb.from('payments').select('*').eq('invoice_id', id).order('paid_on'),
      sb.from('firm_settings').select('*').single(),
    ]);
    setInv(i.data as Invoice);
    setItems((it.data ?? []) as InvoiceItem[]);
    setPayments((p.data ?? []) as Payment[]);
    setFirm(f.data as FirmSettings);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!inv || !firm) return <p className="py-8 text-center text-sm text-slate-500">Loading…</p>;

  const paid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const balance = Number(inv.total) - paid;
  const half = Number(inv.tax_amount) / 2;

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabase().from('payments').insert({
      invoice_id: inv.id, amount: Number(pay.amount), paid_on: pay.paid_on, mode: pay.mode, reference: pay.reference || null,
    });
    if (error) return setError(error.message);
    setPay({ ...pay, amount: '', reference: '' });
    load();
  };

  const removePayment = async (pid: string) => {
    if (!confirm('Delete this payment?')) return;
    const { error } = await supabase().from('payments').delete().eq('id', pid);
    if (error) return alert(error.message);
    load();
  };

  const unbillTasks = async () => {
    const ids = items.map((i) => i.task_id).filter(Boolean) as string[];
    if (ids.length) await supabase().from('tasks').update({ billed: false }).in('id', ids);
  };

  const cancel = async () => {
    if (!confirm('Cancel this invoice? Linked tasks will become unbilled again.')) return;
    const { error } = await supabase().from('invoices').update({ status: 'cancelled' }).eq('id', inv.id);
    if (error) return alert(error.message);
    await unbillTasks();
    load();
  };

  const remove = async () => {
    if (!confirm('Permanently delete this invoice? (Cancelling is usually better for GST records.)')) return;
    await unbillTasks();
    const { error } = await supabase().from('invoices').delete().eq('id', inv.id);
    if (error) return alert(error.message);
    router.replace('/invoices');
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/invoices" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Billing</Link>
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceStatusBadge status={inv.status} />
          {inv.status !== 'cancelled' && <Button variant="secondary" onClick={cancel}>Cancel invoice</Button>}
          {me?.role === 'admin' && <Button variant="ghost" className="text-red-600" onClick={remove}>Delete</Button>}
          <Button onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>
        </div>
      </div>

      {/* Printable invoice */}
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8 text-sm print:border-0 print:p-0">
        {inv.status === 'cancelled' && <div className="mb-4 rounded bg-red-50 p-2 text-center font-semibold text-red-700">CANCELLED</div>}
        <header className="flex flex-wrap justify-between gap-6 border-b pb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{firm.name}</h1>
            <p className="whitespace-pre-line text-slate-600">{firm.address}</p>
            {firm.state && <p className="text-slate-600">State: {firm.state}</p>}
            {firm.gstin && <p className="text-slate-600">GSTIN: {firm.gstin}</p>}
            {firm.pan && <p className="text-slate-600">PAN: {firm.pan}</p>}
            {(firm.phone || firm.email) && <p className="text-slate-600">{[firm.phone, firm.email].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold uppercase tracking-wide text-brand-700">Tax Invoice</div>
            <div className="mt-2"><span className="text-slate-500">No.</span> <b>{inv.invoice_no}</b></div>
            <div><span className="text-slate-500">Date</span> {fmtDate(inv.issue_date)}</div>
            {inv.due_date && <div><span className="text-slate-500">Due</span> {fmtDate(inv.due_date)}</div>}
          </div>
        </header>

        <section className="py-5">
          <div className="text-xs font-semibold uppercase text-slate-500">Bill to</div>
          <div className="mt-1 font-semibold text-slate-900">{inv.clients?.name}</div>
          {inv.clients?.address && <div className="whitespace-pre-line text-slate-600">{inv.clients.address}</div>}
          {inv.clients?.state && <div className="text-slate-600">Place of supply: {inv.clients.state}</div>}
          {inv.clients?.gstin && <div className="text-slate-600">GSTIN: {inv.clients.gstin}</div>}
          {!inv.clients?.gstin && inv.clients?.pan && <div className="text-slate-600">PAN: {inv.clients.pan}</div>}
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-2 py-2">#</th><th className="px-2 py-2">Description</th><th className="px-2 py-2">SAC</th>
              <th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, n) => (
              <tr key={it.id} className="border-b">
                <td className="px-2 py-2">{n + 1}</td>
                <td className="px-2 py-2">{it.description}</td>
                <td className="px-2 py-2">{it.sac}</td>
                <td className="px-2 py-2 text-right">{Number(it.qty)}</td>
                <td className="px-2 py-2 text-right">{inr(it.rate)}</td>
                <td className="px-2 py-2 text-right">{inr(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-72 space-y-1">
            <div className="flex justify-between"><dt className="text-slate-500">Taxable value</dt><dd>{inr(inv.subtotal)}</dd></div>
            {inv.is_igst ? (
              <div className="flex justify-between"><dt className="text-slate-500">IGST @ {Number(inv.tax_rate)}%</dt><dd>{inr(inv.tax_amount)}</dd></div>
            ) : (<>
              <div className="flex justify-between"><dt className="text-slate-500">CGST @ {Number(inv.tax_rate) / 2}%</dt><dd>{inr(half)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">SGST @ {Number(inv.tax_rate) / 2}%</dt><dd>{inr(half)}</dd></div>
            </>)}
            <div className="flex justify-between border-t pt-1 text-base font-bold"><dt>Total</dt><dd>{inr(inv.total)}</dd></div>
            {paid > 0 && <>
              <div className="flex justify-between text-slate-500"><dt>Received</dt><dd>{inr(paid)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd>{inr(balance)}</dd></div>
            </>}
          </dl>
        </div>
        <p className="mt-3 text-slate-600"><span className="text-slate-500">Amount in words:</span> {amountInWords(Number(inv.total))}</p>
        {inv.notes && <p className="mt-3 whitespace-pre-line text-slate-600">{inv.notes}</p>}

        <footer className="mt-8 flex flex-wrap justify-between gap-6 border-t pt-5">
          <div className="max-w-xs">
            {firm.bank_details && <>
              <div className="text-xs font-semibold uppercase text-slate-500">Bank details</div>
              <p className="whitespace-pre-line text-slate-600">{firm.bank_details}</p>
            </>}
          </div>
          <div className="text-right">
            <div className="h-14" />
            <div className="border-t pt-1 text-slate-600">For {firm.name}<br />Authorised signatory</div>
          </div>
        </footer>
      </article>

      {/* Payments */}
      <div className="mx-auto mt-6 max-w-3xl print:hidden">
        <Card title={`Payments · balance ${inr(balance)}`}>
          {payments.length > 0 && (
            <div className="mb-4">
              <Table head={['Date', 'Mode', 'Reference', 'Amount', '']}>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <Td>{fmtDate(p.paid_on)}</Td>
                    <Td className="uppercase">{p.mode}</Td>
                    <Td>{p.reference}</Td>
                    <Td>{inr(p.amount)}</Td>
                    <Td>{me?.role === 'admin' && <button className="text-xs text-red-600 hover:underline" onClick={() => removePayment(p.id)}>delete</button>}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
          {inv.status !== 'cancelled' && balance > 0 && (
            <form onSubmit={addPayment} className="grid items-end gap-3 sm:grid-cols-5">
              <Field label="Amount"><Input type="number" step="0.01" min="0.01" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder={balance.toFixed(2)} /></Field>
              <Field label="Date"><Input type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} /></Field>
              <Field label="Mode">
                <Select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                  <option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="other">Other</option>
                </Select>
              </Field>
              <Field label="UTR / cheque no."><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
              <Button>Record payment</Button>
            </form>
          )}
          <div className="mt-3"><ErrorNote error={error} /></div>
        </Card>
      </div>
    </>
  );
}
