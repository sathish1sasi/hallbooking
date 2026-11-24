'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { daysUntil, fmtDate } from '@/lib/format';
import type { Dsc } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { DocTabs } from '@/components/DocTabs';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Td, Textarea } from '@/components/ui';

function expiry(validTo: string) {
  const d = daysUntil(validTo) ?? 0;
  if (d < 0) return <Badge className="bg-rose-100 text-rose-700">Expired {-d}d ago</Badge>;
  if (d <= 30) return <Badge className="bg-amber-100 text-amber-800">Expires in {d}d</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700">Valid</Badge>;
}

export default function DscPage() {
  const { clients, me } = useApp();
  const [rows, setRows] = useState<Dsc[] | null>(null);
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState<null | 'new' | Dsc>(null);

  const load = useCallback(async () => {
    const { data } = await supabase().from('dsc').select('*, clients(name, phone)').order('valid_to');
    setRows((data ?? []) as Dsc[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => {
    const d = daysUntil(r.valid_to) ?? 0;
    return !filter || (filter === 'expiring' ? d >= 0 && d <= 30 : filter === 'expired' ? d < 0 : r.location === filter);
  }), [rows, filter]);

  return (
    <>
      <DocTabs />
      <PageHeader title="DSC register" subtitle="Digital signature certificates: who holds them, where the token is, and when they expire."
        actions={<Button onClick={() => setModal('new')}><Plus size={16} /> Add DSC</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[['', 'All'], ['expiring', 'Expiring in 30 days'], ['expired', 'Expired'], ['office', 'Token in office'], ['client', 'Token with client']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-sm ${filter === k ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>
        ))}
      </div>
      <Card>
        {!rows ? <Empty>Loading…</Empty> : !shown.length ? <Empty>No DSCs here.</Empty> : (
          <Table head={['Holder', 'Client', 'Class', 'Valid to', 'Status', 'Token']}>
            {shown.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setModal(r)}>
                <Td className="font-medium">{r.holder_name}<div className="text-xs text-slate-500">{r.issued_by}</div></Td>
                <Td><Link onClick={(e) => e.stopPropagation()} href={`/clients/${r.client_id}`} className="hover:text-brand-600">{r.clients?.name}</Link></Td>
                <Td>{r.dsc_class}</Td>
                <Td className="whitespace-nowrap">{fmtDate(r.valid_to)}</Td>
                <Td>{expiry(r.valid_to)}</Td>
                <Td><Badge className={r.location === 'office' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}>{r.location === 'office' ? 'In office' : 'With client'}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {modal && (
        <Modal title={modal === 'new' ? 'Add DSC' : 'Edit DSC'} onClose={() => setModal(null)}>
          <DscForm dsc={modal === 'new' ? undefined : modal} clients={clients} canDelete={me?.role === 'admin'} onSaved={() => { setModal(null); load(); }} />
        </Modal>
      )}
    </>
  );
}

function DscForm({ dsc, clients, canDelete, onSaved }: { dsc?: Dsc; clients: { id: string; name: string }[]; canDelete: boolean; onSaved: () => void }) {
  const [f, setF] = useState({
    client_id: dsc?.client_id ?? '', holder_name: dsc?.holder_name ?? '', dsc_class: dsc?.dsc_class ?? 'Class 3',
    issued_by: dsc?.issued_by ?? '', valid_from: dsc?.valid_from ?? '', valid_to: dsc?.valid_to ?? '',
    location: dsc?.location ?? 'office', token_password_hint: dsc?.token_password_hint ?? '', notes: dsc?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]));
    const { error } = dsc ? await supabase().from('dsc').update(payload).eq('id', dsc.id) : await supabase().from('dsc').insert(payload);
    if (error) return setError(error.message);
    onSaved();
  };
  const remove = async () => {
    if (!dsc) return;
    const { error } = await supabase().from('dsc').delete().eq('id', dsc.id);
    if (error) return setError(error.message);
    onSaved();
  };
  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Client *">
        <Select required value={f.client_id} onChange={set('client_id')}><option value="">Select client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Holder name *"><Input required value={f.holder_name} onChange={set('holder_name')} placeholder="Director / partner name" /></Field>
        <Field label="Class"><Select value={f.dsc_class} onChange={set('dsc_class')}><option>Class 3</option><option>Class 3 (Sign + Encrypt)</option><option>DGFT</option></Select></Field>
        <Field label="Issued by"><Input value={f.issued_by} onChange={set('issued_by')} placeholder="eMudhra, Capricorn…" /></Field>
        <Field label="Token is"><Select value={f.location} onChange={set('location')}><option value="office">In our office</option><option value="client">With client</option></Select></Field>
        <Field label="Valid from"><Input type="date" value={f.valid_from} onChange={set('valid_from')} /></Field>
        <Field label="Valid to *"><Input required type="date" value={f.valid_to} onChange={set('valid_to')} /></Field>
      </div>
      <Field label="Password hint (never the password itself)"><Input value={f.token_password_hint} onChange={set('token_password_hint')} placeholder="e.g. client's usual pattern, ask Ravi" /></Field>
      <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      <ErrorNote error={error} />
      <div className="flex justify-between">
        {dsc && canDelete ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove}>Delete</Button> : <span />}
        <Button>Save</Button>
      </div>
    </form>
  );
}
