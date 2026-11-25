'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { SERVICES } from '@/lib/compliance';
import type { Client } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { ClientForm } from '@/components/forms';
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Table, Td } from '@/components/ui';

export default function ClientsPage() {
  const router = useRouter();
  const { staffName } = useApp();
  const [rows, setRows] = useState<Client[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [service, setService] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api().from('clients').select('*').order('name').then(({ data }: { data: Client[] | null }) => setRows(data ?? []));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((c) =>
      (!status || c.status === status) &&
      (!service || c.services.includes(service)) &&
      (!needle || [c.name, c.pan, c.gstin, c.contact_person, c.phone, c.email].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [rows, q, status, service]);

  const exportCsv = () => {
    const cols: (keyof Client)[] = ['name', 'client_type', 'pan', 'gstin', 'tan', 'contact_person', 'phone', 'email', 'state', 'status'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...filtered.map((c) => cols.map((k) => esc(c[k])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'clients.csv';
    a.click();
  };

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={rows ? `${filtered.length} of ${rows.length}` : undefined}
        actions={<>
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          <Button onClick={() => setAdding(true)}><Plus size={16} /> New client</Button>
        </>}
      />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <Input className="pl-9" placeholder="Search name, PAN, GSTIN, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-auto" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">All services</option>
            {SERVICES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </Select>
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="">All</option>
          </Select>
        </div>
        {!rows ? <Empty>Loading…</Empty> : !filtered.length ? <Empty>No clients match.</Empty> : (
          <Table head={['Name', 'Type', 'PAN', 'GSTIN', 'Contact', 'Manager', 'Services']}>
            {filtered.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/clients/view/?id=${c.id}`)}>
                <Td><Link href={`/clients/view/?id=${c.id}`} className="font-medium text-slate-900">{c.name}</Link></Td>
                <Td className="capitalize">{c.client_type}</Td>
                <Td className="font-mono text-xs">{c.pan ?? '—'}</Td>
                <Td className="font-mono text-xs">{c.gstin ?? '—'}</Td>
                <Td>{c.contact_person ?? ''}<div className="text-xs text-slate-500">{c.phone}</div></Td>
                <Td>{staffName(c.assigned_to)}</Td>
                <Td><div className="flex flex-wrap gap-1">{c.services.map((s) => <Badge key={s}>{s.replace('_', ' ')}</Badge>)}</div></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {adding && (
        <Modal title="New client" wide onClose={() => setAdding(false)}>
          <ClientForm onSaved={(c) => router.push(`/clients/view/?id=${c.id}`)} />
        </Modal>
      )}
    </>
  );
}
