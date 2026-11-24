'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { addDays, fmtDate, inr, todayISO } from '@/lib/format';
import type { FirmSettings, Package } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Td } from '@/components/ui';

const FREQ: Record<Package['frequency'], string> = { monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half-yearly', yearly: 'Yearly', one_time: 'One time' };

export default function PackagesPage() {
  const router = useRouter();
  const { clients, me } = useApp();
  const [rows, setRows] = useState<Package[] | null>(null);
  const [modal, setModal] = useState<null | 'new' | Package>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const load = useCallback(async () => {
    const { data } = await supabase().from('packages').select('*, clients(name)').order('next_bill_date');
    setRows((data ?? []) as Package[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const due = (rows ?? []).filter((p) => p.active && p.next_bill_date <= today);
  const mrr = (rows ?? []).filter((p) => p.active).reduce((a, p) => a + Number(p.fee) / ({ monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12, one_time: Infinity }[p.frequency]), 0);

  // Create an invoice for one package and move its next billing date forward.
  const invoice = async (p: Package) => {
    setBusy(p.id); setError(null);
    const sb = supabase();
    const [{ data: firm }, { data: no, error: e1 }] = await Promise.all([
      sb.from('firm_settings').select('*').single(),
      sb.rpc('next_invoice_number', { p_date: today }),
    ]);
    if (e1) { setBusy(null); return setError(e1.message); }
    const client = clients.find((c) => c.id === p.client_id);
    const f = firm as FirmSettings | null;
    const { data: inv, error: e2 } = await sb.from('invoices').insert({
      invoice_no: no, client_id: p.client_id, issue_date: today, due_date: addDays(today, 15),
      is_igst: !!(f?.state && client?.state && f.state !== client.state),
    }).select('id').single();
    if (e2) { setBusy(null); return setError(e2.message); }
    await sb.from('invoice_items').insert({ invoice_id: inv.id, description: `${p.name} (${FREQ[p.frequency]}) — period from ${fmtDate(p.next_bill_date)}`, qty: 1, rate: p.fee });
    await sb.rpc('advance_package', { p_id: p.id });
    router.push(`/invoices/${inv.id}`);
  };

  return (
    <>
      <PageHeader title="Packages" subtitle="Recurring fee arrangements. When a package falls due it appears under Need to make invoice."
        actions={<Button onClick={() => setModal('new')}><Plus size={16} /> New package</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Due to invoice now" value={String(due.length)} tone={due.length ? 'text-amber-600' : ''} />
        <Stat label="Active packages" value={String((rows ?? []).filter((p) => p.active).length)} />
        <Stat label="Recurring fees per month" value={inr(Math.round(mrr))} />
      </div>
      <ErrorNote error={error} />
      <Card className="mt-3">
        {!rows ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No packages yet. Add one, e.g. “GST returns — ₹2,500 monthly”.</Empty> : (
          <Table head={['Client', 'Package', 'Frequency', 'Fee', 'Next bill', '']}>
            {rows.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                <Td><Link href={`/clients/${p.client_id}`} className="font-medium hover:text-brand-600">{p.clients?.name}</Link></Td>
                <Td><button className="text-left hover:text-brand-600" onClick={() => setModal(p)}>{p.name}</button></Td>
                <Td>{FREQ[p.frequency]}</Td>
                <Td className="tabular-nums">{inr(p.fee)}</Td>
                <Td className="whitespace-nowrap">{fmtDate(p.next_bill_date)} {p.active && p.next_bill_date <= today && <Badge className="bg-amber-100 text-amber-800">due</Badge>}{!p.active && <Badge>inactive</Badge>}</Td>
                <Td>{p.active && p.next_bill_date <= today && <Button variant="secondary" disabled={busy === p.id} onClick={() => invoice(p)}>{busy === p.id ? 'Creating…' : 'Create invoice'}</Button>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {modal && (
        <Modal title={modal === 'new' ? 'New package' : 'Edit package'} onClose={() => setModal(null)}>
          <PackageForm pkg={modal === 'new' ? undefined : modal} clients={clients} canDelete={me?.role === 'admin'} onSaved={() => { setModal(null); load(); }} />
        </Modal>
      )}
    </>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div></div>;
}

function PackageForm({ pkg, clients, canDelete, onSaved }: { pkg?: Package; clients: { id: string; name: string }[]; canDelete: boolean; onSaved: () => void }) {
  const [f, setF] = useState({
    client_id: pkg?.client_id ?? '', name: pkg?.name ?? '', fee: String(pkg?.fee ?? ''),
    frequency: pkg?.frequency ?? 'monthly', next_bill_date: pkg?.next_bill_date ?? todayISO(), active: pkg?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...f, fee: Number(f.fee) };
    const { error } = pkg ? await supabase().from('packages').update(payload).eq('id', pkg.id) : await supabase().from('packages').insert(payload);
    if (error) return setError(error.message);
    onSaved();
  };
  const remove = async () => {
    if (!pkg) return;
    const { error } = await supabase().from('packages').delete().eq('id', pkg.id);
    if (error) return setError(error.message);
    onSaved();
  };
  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Client *">
        <Select required value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
          <option value="">Select client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Package name *"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="GST returns + bookkeeping" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fee (₹, before GST) *"><Input required type="number" min="0" step="0.01" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
        <Field label="Frequency">
          <Select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Package['frequency'] })}>
            {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Next bill date"><Input type="date" value={f.next_bill_date} onChange={(e) => setF({ ...f, next_bill_date: e.target.value })} /></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
      </div>
      <ErrorNote error={error} />
      <div className="flex justify-between">
        {pkg && canDelete ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}>Delete</Button> : <span />}
        <Button>Save package</Button>
      </div>
    </form>
  );
}
