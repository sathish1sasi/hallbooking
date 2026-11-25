'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { fyMonths, gstReturnsForPeriod, type GstCell } from '@/lib/compliance';
import { addDays, fmtDate, todayISO } from '@/lib/format';
import { useApp } from '@/components/AppContext';
import { Card, Empty, Input, PageHeader, Select } from '@/components/ui';

type C = { id: string; name: string; gstin: string | null; services: string[]; assigned_to: string | null };
type T = { id: string; client_id: string; compliance_key: string; status: string; due_date: string | null; completed_at: string | null; acknowledgement_no: string | null };
type State = 'filed' | 'open' | 'overdue' | 'missing' | 'soon' | 'later';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STYLE: Record<State, string> = {
  filed: 'bg-emerald-500 text-white',
  open: 'bg-blue-100 text-blue-700 ring-1 ring-blue-300',
  overdue: 'bg-rose-500 text-white',
  missing: 'bg-rose-50 text-rose-600 border border-dashed border-rose-400',
  soon: 'bg-white text-slate-500 ring-1 ring-slate-300',
  later: 'bg-slate-50 text-slate-300',
};
const LEGEND: [State, string][] = [['filed', 'Filed'], ['open', 'In progress'], ['overdue', 'Overdue'], ['missing', 'Past due, no task'], ['soon', 'Created automatically soon'], ['later', 'Future']];

export default function GstTracker() {
  const { staffName } = useApp();
  const today = todayISO();
  const now = new Date(today + 'T00:00:00');
  const currentFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [fy, setFy] = useState(currentFy);
  const [clients, setClients] = useState<C[] | null>(null);
  const [tasks, setTasks] = useState<T[]>([]);
  const [lead, setLead] = useState(10);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'pending' | 'monthly' | 'quarterly'>('all');

  useEffect(() => {
    const sb = api();
    sb.from('firm_settings').select('auto_compliance_days').single().then(({ data }: { data: { auto_compliance_days: number } | null }) => setLead(data?.auto_compliance_days ?? 10));
    sb.from('clients').select('id, name, gstin, services, assigned_to').eq('status', 'active').order('name')
      .then(({ data }: { data: C[] | null }) => setClients((data ?? []).filter((c) => c.services.includes('GST_MONTHLY') || c.services.includes('GST_QUARTERLY'))));
  }, []);

  useEffect(() => {
    if (!clients?.length) { setTasks([]); return; }
    api().from('tasks').select('id, client_id, compliance_key, status, due_date, completed_at, acknowledgement_no')
      .in('client_id', clients.map((c) => c.id)).not('compliance_key', 'is', null)
      .gte('due_date', `${fy}-05-01`).lte('due_date', `${fy + 1}-04-30`).limit(20000)
      .then(({ data }: { data: T[] | null }) => setTasks(data ?? []));
  }, [clients, fy]);

  const months = fyMonths(fy);
  const byKey = useMemo(() => new Map(tasks.map((t) => [`${t.client_id}|${t.compliance_key}`, t])), [tasks]);
  const autoFrom = addDays(today, lead);

  const cellState = (c: C, cell: GstCell): { state: State; task?: T } => {
    const task = byKey.get(`${c.id}|${cell.key}`);
    if (task) return { task, state: task.status === 'done' ? 'filed' : cell.dueDate < today ? 'overdue' : 'open' };
    if (cell.dueDate < today) return { state: 'missing' };
    return { state: lead > 0 && cell.dueDate <= addDays(autoFrom, 31) ? 'soon' : 'later' };
  };

  const rows = useMemo(() => (clients ?? []).map((c) => {
    const quarterly = !c.services.includes('GST_MONTHLY');
    const cols = months.map(({ y, m }) => gstReturnsForPeriod(y, m, quarterly).map((cell) => ({ cell, ...cellState(c, cell) })));
    const pending = cols.flat().filter((x) => x.state === 'overdue' || x.state === 'missing' || x.state === 'open').length;
    return { c, quarterly, cols, pending };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [clients, byKey, fy, lead]);

  const visible = rows.filter((r) =>
    (!q || r.c.name.toLowerCase().includes(q.toLowerCase()) || r.c.gstin?.toLowerCase().includes(q.toLowerCase())) &&
    (show === 'all' || (show === 'pending' ? r.pending > 0 : show === 'quarterly' ? r.quarterly : !r.quarterly)));

  // Headline: returns due this calendar month (i.e. for last month's period).
  const thisMonth = today.slice(0, 7);
  const dueNow = rows.flatMap((r) => r.cols.flat().filter((x) => x.cell.dueDate.startsWith(thisMonth)));
  const filedNow = dueNow.filter((x) => x.state === 'filed').length;
  const overdueAll = rows.flatMap((r) => r.cols.flat()).filter((x) => x.state === 'overdue' || x.state === 'missing').length;
  const curIdx = months.findIndex(({ y, m }) => `${y}-${String(m).padStart(2, '0')}` === thisMonth);

  return (
    <>
      <PageHeader title="GST filing tracker" subtitle="Every GST client, every month. Tasks are created automatically each month; this grid shows what has been filed."
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm">
            <button onClick={() => setFy(fy - 1)} className="rounded p-1.5 hover:bg-slate-100" aria-label="Previous year"><ChevronLeft size={16} /></button>
            <span className="px-2 text-sm font-semibold tabular-nums">FY {fy}-{String((fy + 1) % 100).padStart(2, '0')}</span>
            <button onClick={() => setFy(fy + 1)} className="rounded p-1.5 hover:bg-slate-100" aria-label="Next year"><ChevronRight size={16} /></button>
          </div>
        } />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Due this month</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{filedNow} <span className="text-base font-medium text-slate-400">/ {dueNow.length} filed</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${dueNow.length ? (filedNow / dueNow.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Overdue this year</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${overdueAll ? 'text-rose-600' : ''}`}>{overdueAll}</div>
          <button onClick={() => setShow('pending')} className="mt-1 text-xs text-brand-600 hover:underline">Show clients with pending returns</button>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">GST clients</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{rows.length}</div>
          <div className="text-xs text-slate-500">{rows.filter((r) => !r.quarterly).length} monthly · {rows.filter((r) => r.quarterly).length} QRMP</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <Input className="pl-9" placeholder="Search client or GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-auto" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Filter">
          <option value="all">All GST clients</option><option value="pending">With pending returns</option>
          <option value="monthly">Monthly filers</option><option value="quarterly">QRMP filers</option>
        </Select>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
        {LEGEND.map(([s, l]) => <span key={s} className="flex items-center gap-1.5"><span className={`inline-block h-4 w-6 rounded ${STYLE[s]}`} />{l}</span>)}
      </div>

      <Card className="overflow-hidden">
        {!clients ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No active clients have a GST service. Tick “GST (monthly filer)” or “GST (QRMP)” on a client.</Empty> : (
          <div className="-m-4 overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-3 py-2 text-left font-medium uppercase tracking-wide text-slate-500">Client</th>
                  {months.map(({ y, m }, i) => (
                    <th key={i} className={`border-b border-slate-200 px-1.5 py-2 text-center font-medium ${i === curIdx - 1 ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}>
                      {MON[m - 1]}<div className="font-normal text-slate-400">{y}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(({ c, quarterly, cols }) => (
                  <tr key={c.id}>
                    <td className="sticky left-0 z-10 min-w-[12rem] border-b border-slate-100 bg-white px-3 py-2">
                      <Link href={`/clients/view/?id=${c.id}`} className="font-medium text-slate-800 hover:text-brand-600">{c.name}</Link>
                      <div className="font-mono text-[11px] text-slate-400">{c.gstin ?? 'no GSTIN'} · {quarterly ? 'QRMP' : 'Monthly'}</div>
                      <div className="text-[11px] text-slate-400">{staffName(c.assigned_to)}</div>
                    </td>
                    {cols.map((cells, i) => (
                      <td key={i} className={`border-b border-slate-100 px-1.5 py-2 text-center ${i === curIdx - 1 ? 'bg-brand-50/60' : ''}`}>
                        <div className="flex justify-center gap-1">
                          {cells.map(({ cell, state, task }) => {
                            const tip = `${cell.title}\nDue ${fmtDate(cell.dueDate)}${task?.completed_at ? `\nFiled ${fmtDate(task.completed_at)}` : ''}${task?.acknowledgement_no ? `\nARN ${task.acknowledgement_no}` : ''}${state === 'soon' ? '\nTask will be created automatically' : ''}`;
                            const cls = `inline-grid h-6 min-w-[2rem] place-items-center rounded px-1 text-[10px] font-bold ${STYLE[state]}`;
                            return task
                              ? <Link key={cell.key} href={`/tasks/view/?id=${task.id}`} title={tip} className={`${cls} hover:opacity-80`}>{cell.label}</Link>
                              : <span key={cell.key} title={tip} className={cls}>{cell.label}</span>;
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">Columns are the tax period (the month the sales belong to). Returns for a period are filed the following month. Click a filled cell to open the task.</p>
    </>
  );
}
