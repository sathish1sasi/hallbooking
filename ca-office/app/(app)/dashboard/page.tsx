'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, FileClock, IndianRupee, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { addDays, daysUntil, fmtDate, inr, todayISO } from '@/lib/format';
import { TASK_STATUSES, type Task } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Card, DueBadge, Empty, PageHeader, StatusBadge } from '@/components/ui';

interface Stats {
  clients: number;
  overdue: Task[];
  upcoming: Task[];
  byStatus: Record<string, number>;
  pendingDocs: number;
  receivable: number;
  billedThisMonth: number;
  collectedThisMonth: number;
  myHoursThisWeek: number;
}

export default function Dashboard() {
  const { me, staffName } = useApp();
  const [s, setS] = useState<Stats | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const sb = supabase();
      const today = todayISO();
      const monthStart = today.slice(0, 8) + '01';
      const d = new Date();
      const weekStart = addDays(today, -((d.getDay() + 6) % 7));

      let open = sb.from('tasks').select('*, clients(name)').neq('status', 'done').order('due_date', { nullsFirst: false });
      if (mineOnly) open = open.eq('assigned_to', me.id);

      const [clients, openTasks, docs, balances, inv, pay, hrs] = await Promise.all([
        sb.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        open,
        sb.from('documents').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('invoice_balances').select('balance, status').neq('status', 'cancelled'),
        sb.from('invoices').select('total').neq('status', 'cancelled').gte('issue_date', monthStart),
        sb.from('payments').select('amount').gte('paid_on', monthStart),
        sb.from('time_entries').select('hours').eq('user_id', me.id).gte('work_date', weekStart),
      ]);
      const tasks = (openTasks.data ?? []) as Task[];
      const byStatus: Record<string, number> = {};
      tasks.forEach((t) => { byStatus[t.status] = (byStatus[t.status] ?? 0) + 1; });
      const sum = (rows: any[] | null, k: string) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);

      setS({
        clients: clients.count ?? 0,
        overdue: tasks.filter((t) => t.due_date && t.due_date < today),
        upcoming: tasks.filter((t) => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 14)),
        byStatus,
        pendingDocs: docs.count ?? 0,
        receivable: sum(balances.data, 'balance'),
        billedThisMonth: sum(inv.data, 'total'),
        collectedThisMonth: sum(pay.data, 'amount'),
        myHoursThisWeek: sum(hrs.data, 'hours'),
      });
    })();
  }, [me, mineOnly]);

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}${me?.full_name ? ', ' + me.full_name.split(' ')[0] : ''}`}
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only my tasks
          </label>
        }
      />
      {!s ? <Empty>Loading…</Empty> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat icon={<AlertTriangle size={18} />} label="Overdue tasks" value={s.overdue.length} tone={s.overdue.length ? 'red' : 'slate'} href="/tasks?view=overdue" />
            <Stat icon={<CalendarDays size={18} />} label="Due in 14 days" value={s.upcoming.length} href="/tasks" />
            <Stat icon={<FileClock size={18} />} label="Documents pending" value={s.pendingDocs} href="/documents" />
            <Stat icon={<IndianRupee size={18} />} label="Receivables" value={inr(s.receivable)} href="/invoices" />
            <Stat icon={<Users size={18} />} label="Active clients" value={s.clients} href="/clients" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Overdue" className="lg:col-span-2">
              <TaskList tasks={s.overdue} staffName={staffName} empty="Nothing overdue — nice." />
            </Card>
            <Card title="Pipeline">
              <ul className="space-y-2">
                {TASK_STATUSES.filter((x) => x.value !== 'done').map((st) => (
                  <li key={st.value} className="flex items-center justify-between">
                    <StatusBadge status={st.value} />
                    <span className="font-semibold">{s.byStatus[st.value] ?? 0}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 space-y-1 border-t pt-4 text-sm">
                <Row k="Billed this month" v={inr(s.billedThisMonth)} />
                <Row k="Collected this month" v={inr(s.collectedThisMonth)} />
                <Row k="My hours this week" v={s.myHoursThisWeek.toFixed(1)} />
              </div>
            </Card>
          </div>

          <Card title="Coming up (next 14 days)">
            <TaskList tasks={s.upcoming} staffName={staffName} empty="No deadlines in the next two weeks." />
          </Card>
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-medium">{v}</span></div>;
}

function Stat({ icon, label, value, tone = 'slate', href }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: 'red' | 'slate'; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-500">
      <div className={`flex items-center gap-2 text-xs font-medium ${tone === 'red' ? 'text-red-600' : 'text-slate-500'}`}>{icon}{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone === 'red' ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
    </Link>
  );
}

function TaskList({ tasks, staffName, empty }: { tasks: Task[]; staffName: (id: string | null) => string; empty: string }) {
  if (!tasks.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.slice(0, 12).map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="min-w-0">
            <Link href={`/clients/${t.client_id}`} className="font-medium text-slate-900 hover:text-brand-600">{t.clients?.name}</Link>
            <div className="text-sm text-slate-500">{t.title}{t.period ? ` · ${t.period}` : ''} · {staffName(t.assigned_to)}</div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">{fmtDate(t.due_date)}</span>
            <DueBadge days={daysUntil(t.due_date)} />
            <StatusBadge status={t.status} />
          </div>
        </li>
      ))}
      {tasks.length > 12 && <li className="pt-2 text-sm"><Link className="text-brand-600" href="/tasks">View all {tasks.length} →</Link></li>}
    </ul>
  );
}
