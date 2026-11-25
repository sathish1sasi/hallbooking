'use client';
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { inr, todayISO } from '@/lib/format';
import { useApp } from '@/components/AppContext';
import { Button, Card, Empty, Field, Input, PageHeader, Table, Td } from '@/components/ui';

type Tk = { id: string; client_id: string; category: string; status: string; due_date: string | null; assigned_to: string | null; completed_at: string | null; fee: number };
type Te = { user_id: string; client_id: string; hours: number; billable: boolean; work_date: string };
type Bal = { client_id: string; issue_date: string; total: number; paid: number; balance: number; status: string };

const fyStart = () => { const d = new Date(); return `${d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1}-04-01`; };

export default function ReportsPage() {
  const { staff, clients } = useApp();
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayISO());
  const [tab, setTab] = useState<'staff' | 'clients' | 'compliance'>('staff');
  const [data, setData] = useState<{ tasks: Tk[]; time: Te[]; inv: Bal[] } | null>(null);

  useEffect(() => {
    const sb = api();
    Promise.all([
      sb.from('tasks').select('id, client_id, category, status, due_date, assigned_to, completed_at, fee').gte('due_date', from).lte('due_date', to).limit(20000),
      sb.from('time_entries').select('user_id, client_id, hours, billable, work_date').gte('work_date', from).lte('work_date', to).limit(20000),
      sb.from('invoice_balances').select('client_id, issue_date, total, paid, balance, status').gte('issue_date', from).lte('issue_date', to).neq('status', 'cancelled'),
    ]).then(([t, te, i]) => setData({ tasks: (t.data ?? []) as Tk[], time: (te.data ?? []) as Te[], inv: (i.data ?? []) as Bal[] }));
  }, [from, to]);

  const today = todayISO();
  const r = useMemo(() => {
    if (!data) return null;
    const staffRows = staff.map((s) => {
      const t = data.tasks.filter((x) => x.assigned_to === s.id);
      const done = t.filter((x) => x.status === 'done');
      const onTime = done.filter((x) => x.completed_at && x.due_date && x.completed_at.slice(0, 10) <= x.due_date).length;
      const hrs = data.time.filter((x) => x.user_id === s.id);
      return {
        name: s.full_name ?? '', assigned: t.length, done: done.length,
        onTime: done.length ? Math.round((onTime / done.length) * 100) : 0,
        overdue: t.filter((x) => x.status !== 'done' && x.due_date && x.due_date < today).length,
        hours: hrs.reduce((a, x) => a + Number(x.hours), 0),
        billable: hrs.filter((x) => x.billable).reduce((a, x) => a + Number(x.hours), 0),
      };
    });
    const clientRows = clients.map((c) => {
      const inv = data.inv.filter((x) => x.client_id === c.id);
      return {
        name: c.name, billed: inv.reduce((a, x) => a + Number(x.total), 0), received: inv.reduce((a, x) => a + Number(x.paid), 0),
        outstanding: inv.reduce((a, x) => a + Number(x.balance), 0),
        hours: data.time.filter((x) => x.client_id === c.id).reduce((a, x) => a + Number(x.hours), 0),
      };
    }).filter((x) => x.billed || x.hours).sort((a, b) => b.billed - a.billed);
    const cats = [...new Set(data.tasks.map((t) => t.category))].map((cat) => {
      const t = data.tasks.filter((x) => x.category === cat);
      return { cat, total: t.length, done: t.filter((x) => x.status === 'done').length, open: t.filter((x) => x.status !== 'done').length,
        overdue: t.filter((x) => x.status !== 'done' && x.due_date && x.due_date < today).length };
    }).sort((a, b) => b.total - a.total);
    return { staffRows, clientRows, cats };
  }, [data, staff, clients, today]);

  const exportTab = () => {
    if (!r) return;
    if (tab === 'staff') downloadCsv(`staff-report-${from}-to-${to}.csv`, ['Staff', 'Assigned', 'Completed', 'On time %', 'Overdue', 'Hours', 'Billable hours'],
      r.staffRows.map((x) => [x.name, x.assigned, x.done, x.onTime, x.overdue, x.hours, x.billable]));
    if (tab === 'clients') downloadCsv(`client-revenue-${from}-to-${to}.csv`, ['Client', 'Billed', 'Received', 'Outstanding', 'Hours'],
      r.clientRows.map((x) => [x.name, x.billed, x.received, x.outstanding, x.hours]));
    if (tab === 'compliance') downloadCsv(`compliance-status-${from}-to-${to}.csv`, ['Category', 'Total', 'Completed', 'Open', 'Overdue'],
      r.cats.map((x) => [x.cat, x.total, x.done, x.open, x.overdue]));
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Defaults to the current financial year." actions={<Button variant="secondary" onClick={exportTab}><Download size={16} /> Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="mb-4 flex gap-1 rounded-lg bg-white p-1 shadow-sm sm:w-fit">
        {([['staff', 'Staff productivity'], ['clients', 'Revenue by client'], ['compliance', 'Compliance status']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
        ))}
      </div>
      <Card>
        {!r ? <Empty>Loading…</Empty> : tab === 'staff' ? (
          <Table head={['Staff', 'Assigned', 'Completed', 'On time', 'Overdue', 'Hours', 'Billable']}>
            {r.staffRows.map((x) => (
              <tr key={x.name}><Td className="font-medium">{x.name}</Td><Td>{x.assigned}</Td><Td>{x.done}</Td>
                <Td className={x.onTime >= 80 ? 'text-emerald-600' : 'text-amber-600'}>{x.onTime}%</Td>
                <Td className={x.overdue ? 'text-rose-600' : ''}>{x.overdue}</Td><Td>{x.hours.toFixed(1)}</Td><Td>{x.billable.toFixed(1)}</Td></tr>
            ))}
          </Table>
        ) : tab === 'clients' ? (!r.clientRows.length ? <Empty>No billing or time in this period.</Empty> : (
          <Table head={['Client', 'Billed', 'Received', 'Outstanding', 'Hours', 'Billed per hour']}>
            {r.clientRows.map((x) => (
              <tr key={x.name}><Td className="font-medium">{x.name}</Td><Td>{inr(x.billed)}</Td><Td>{inr(x.received)}</Td>
                <Td className={x.outstanding ? 'font-medium text-amber-700' : ''}>{inr(x.outstanding)}</Td><Td>{x.hours.toFixed(1)}</Td>
                <Td>{x.hours ? inr(Math.round(x.billed / x.hours)) : '—'}</Td></tr>
            ))}
          </Table>
        )) : (!r.cats.length ? <Empty>No tasks due in this period.</Empty> : (
          <Table head={['Category', 'Total', 'Completed', 'Open', 'Overdue', 'Progress']}>
            {r.cats.map((x) => (
              <tr key={x.cat}><Td className="font-medium">{x.cat}</Td><Td>{x.total}</Td><Td>{x.done}</Td><Td>{x.open}</Td>
                <Td className={x.overdue ? 'text-rose-600' : ''}>{x.overdue}</Td>
                <Td><div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${(x.done / x.total) * 100}%` }} /></div></Td></tr>
            ))}
          </Table>
        ))}
      </Card>
    </>
  );
}
