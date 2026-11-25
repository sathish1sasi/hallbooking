'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { daysUntil, fmtDate, inr } from '@/lib/format';
import { Button, Card, Empty, Input, InvoiceStatusBadge, PageHeader, Select, Table, Td } from '@/components/ui';

type Row = {
  id: string; invoice_no: string; client_id: string; issue_date: string; due_date: string | null;
  total: number; paid: number; balance: number; status: string; clients?: { name: string } | null;
};

export default function InvoicesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState('outstanding');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const sb = api();
      const [b, c] = await Promise.all([
        sb.from('invoice_balances').select('*').order('issue_date', { ascending: false }).limit(1000),
        sb.from('clients').select('id, name'),
      ]);
      const names = new Map(((c.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
      setRows(((b.data ?? []) as Row[]).map((r) => ({ ...r, clients: { name: names.get(r.client_id) ?? '' } })));
    })();
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (status === '' || (status === 'outstanding' ? ['unpaid', 'partial'].includes(r.status) : r.status === status)) &&
      (!n || r.invoice_no.toLowerCase().includes(n) || r.clients?.name.toLowerCase().includes(n)),
    );
  }, [rows, status, q]);

  const live = (rows ?? []).filter((r) => r.status !== 'cancelled');
  const outstanding = live.reduce((a, r) => a + Number(r.balance), 0);
  const overdue = live.filter((r) => Number(r.balance) > 0 && r.due_date && (daysUntil(r.due_date) ?? 0) < 0).reduce((a, r) => a + Number(r.balance), 0);
  const fyStart = (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-04-01`; })();
  const billedFy = live.filter((r) => r.issue_date >= fyStart).reduce((a, r) => a + Number(r.total), 0);

  return (
    <>
      <PageHeader title="Billing" actions={<Link href="/invoices/new"><Button><Plus size={16} /> New invoice</Button></Link>} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Outstanding" value={inr(outstanding)} />
        <Kpi label="Overdue" value={inr(overdue)} red={overdue > 0} />
        <Kpi label="Billed this FY" value={inr(billedFy)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <Input className="pl-9" placeholder="Search invoice no. or client…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="outstanding">Outstanding</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option><option value="">All</option>
        </Select>
      </div>
      <Card>
        {!rows ? <Empty>Loading…</Empty> : !filtered.length ? <Empty>No invoices.</Empty> : (
          <Table head={['Invoice', 'Client', 'Date', 'Due', 'Total', 'Balance', 'Status']}>
            {filtered.map((r) => {
              const late = Number(r.balance) > 0 && r.status !== 'cancelled' && r.due_date && (daysUntil(r.due_date) ?? 0) < 0;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td><Link href={`/invoices/view/?id=${r.id}`} className="font-medium text-brand-700">{r.invoice_no}</Link></Td>
                  <Td><Link href={`/clients/view/?id=${r.client_id}`} className="hover:text-brand-600">{r.clients?.name}</Link></Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.issue_date)}</Td>
                  <Td className={`whitespace-nowrap ${late ? 'text-red-600' : ''}`}>{fmtDate(r.due_date)}</Td>
                  <Td>{inr(r.total)}</Td>
                  <Td className="font-medium">{inr(r.balance)}</Td>
                  <Td><InvoiceStatusBadge status={r.status} /></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}

function Kpi({ label, value, red }: { label: string; value: string; red?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${red ? 'text-red-600' : ''}`}>{value}</div>
    </div>
  );
}
