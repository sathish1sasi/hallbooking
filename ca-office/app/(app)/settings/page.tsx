'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { validGSTIN, validPAN } from '@/lib/format';
import { INDIAN_STATES, type FirmSettings } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Button, Card, Empty, ErrorNote, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';

export default function SettingsPage() {
  const { me } = useApp();
  const [f, setF] = useState<FirmSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase().from('firm_settings').select('*').single().then(({ data }: { data: FirmSettings | null }) => setF(data));
  }, []);

  if (me && me.role !== 'admin') return <Empty>Only admins can change firm settings.</Empty>;
  if (!f) return <Empty>Loading…</Empty>;

  const set = (k: keyof FirmSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setF({ ...f, [k]: k === 'next_invoice_no' ? Number(e.target.value) : e.target.value });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.pan && !validPAN(f.pan)) return setError('PAN format looks wrong.');
    if (f.gstin && !validGSTIN(f.gstin)) return setError('GSTIN format looks wrong.');
    setError(null);
    const { id, ...rest } = f;
    const { error } = await supabase().from('firm_settings').update({ ...rest, pan: f.pan?.toUpperCase() || null, gstin: f.gstin?.toUpperCase() || null }).eq('id', id);
    if (error) setError(error.message); else setSaved(true);
  };

  return (
    <>
      <PageHeader title="Firm settings" subtitle="Printed on every invoice. The state decides CGST+SGST vs IGST." />
      <Card>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Firm name"><Input required value={f.name} onChange={set('name')} /></Field>
            <Field label="State">
              <Select value={f.state ?? ''} onChange={set('state')}>
                <option value="">—</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="GSTIN"><Input className="uppercase" value={f.gstin ?? ''} onChange={set('gstin')} /></Field>
            <Field label="PAN"><Input className="uppercase" value={f.pan ?? ''} onChange={set('pan')} /></Field>
            <Field label="Phone"><Input value={f.phone ?? ''} onChange={set('phone')} /></Field>
            <Field label="Email"><Input type="email" value={f.email ?? ''} onChange={set('email')} /></Field>
            <Field label="Invoice prefix"><Input value={f.invoice_prefix} onChange={set('invoice_prefix')} /></Field>
            <Field label="Next invoice number"><Input type="number" min="1" value={f.next_invoice_no} onChange={set('next_invoice_no')} /></Field>
          </div>
          <Field label="Address"><Textarea value={f.address ?? ''} onChange={set('address')} /></Field>
          <Field label="Bank details (printed on invoices)"><Textarea value={f.bank_details ?? ''} onChange={set('bank_details')} placeholder={'Bank: …\nA/c no: …\nIFSC: …'} /></Field>
          <ErrorNote error={error} />
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
            <Button>Save settings</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
