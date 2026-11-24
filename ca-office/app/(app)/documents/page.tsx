'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { daysUntil, fmtDate } from '@/lib/format';
import type { DocumentRow } from '@/lib/types';
import { DocumentForm } from '@/components/forms';
import { DocStatusSelect } from '@/components/DocStatusSelect';
import { Button, Card, Empty, Input, Modal, PageHeader, Select, Table, Td } from '@/components/ui';

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<null | 'new' | DocumentRow>(null);

  const load = useCallback(async () => {
    let query = supabase().from('documents').select('*, clients(name)').order('requested_on').limit(1000);
    if (status) query = query.eq('status', status);
    const { data } = await query;
    setDocs((data ?? []) as DocumentRow[]);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (docs ?? []).filter((d) => !n || d.name.toLowerCase().includes(n) || d.clients?.name.toLowerCase().includes(n));
  }, [docs, q]);

  // Group pending docs by client so a single reminder can be sent per client.
  const reminder = (clientName: string) => {
    const list = filtered.filter((d) => d.clients?.name === clientName && d.status === 'pending').map((d) => `• ${d.name}`).join('\n');
    const text = `Dear ${clientName},\n\nGentle reminder — we are still awaiting the following documents:\n${list}\n\nKindly share them at the earliest so we can complete your filings on time.\n\nRegards`;
    navigator.clipboard.writeText(text).then(() => alert('Reminder text copied — paste it into WhatsApp or email.'));
  };

  return (
    <>
      <PageHeader
        title="Document tracker"
        subtitle="Track what you've asked clients for and what has come in."
        actions={<Button onClick={() => setModal('new')}><Plus size={16} /> Request documents</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <Input className="pl-9" placeholder="Search document or client…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option><option value="received">Received</option><option value="returned">Returned</option><option value="">All</option>
        </Select>
      </div>
      <Card>
        {!docs ? <Empty>Loading…</Empty> : !filtered.length ? <Empty>No documents.</Empty> : (
          <Table head={['Client', 'Document', 'Requested', 'Received', 'Status', '']}>
            {filtered.map((d) => {
              const age = -(daysUntil(d.requested_on) ?? 0);
              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <Td><Link href={`/clients/${d.client_id}`} className="font-medium hover:text-brand-600">{d.clients?.name}</Link></Td>
                  <Td><button className="text-left hover:text-brand-600" onClick={() => setModal(d)}>{d.name}</button>{d.notes && <div className="text-xs text-slate-500">{d.notes}</div>}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(d.requested_on)}{d.status === 'pending' && age > 7 && <div className="text-xs text-red-600">{age} days waiting</div>}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(d.received_on)}</Td>
                  <Td><DocStatusSelect doc={d} onChanged={load} /></Td>
                  <Td>{d.status === 'pending' && <button className="text-xs text-brand-600 hover:underline" onClick={() => reminder(d.clients?.name ?? '')}>Copy reminder</button>}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      {modal && (
        <Modal title={modal === 'new' ? 'Request documents' : 'Edit document'} onClose={() => setModal(null)}>
          <DocumentForm doc={modal === 'new' ? undefined : modal} onSaved={() => { setModal(null); load(); }} />
        </Modal>
      )}
    </>
  );
}
