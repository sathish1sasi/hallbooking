'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { addDays, todayISO } from '@/lib/format';
import type { Todo } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Donut, LineChart, Ring } from '@/components/charts';

type T = {
  id: string; category: string; status: string; due_date: string | null; assigned_to: string | null;
  created_at: string; completed_at: string | null; billed: boolean; fee: number;
};

const GROUPS = {
  pending: { label: 'Pending', statuses: ['todo'], color: '#f59e0b' },
  hold: { label: 'Hold', statuses: ['hold'], color: '#94a3b8' },
  progress: { label: 'In progress', statuses: ['in_progress', 'waiting_client', 'review'], color: '#3b82f6' },
  done: { label: 'Completed', statuses: ['done'], color: '#22c55e' },
} as const;
type GroupKey = keyof typeof GROUPS;
const groupOf = (s: string) => (Object.keys(GROUPS) as GroupKey[]).find((k) => (GROUPS[k].statuses as readonly string[]).includes(s))!;

export default function Dashboard() {
  const { me, staff } = useApp();
  const [tasks, setTasks] = useState<T[] | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [packagesDue, setPackagesDue] = useState(0);
  const [tab, setTab] = useState<GroupKey>('pending');
  const [todoTab, setTodoTab] = useState<'today' | 'upcoming' | 'done'>('today');
  const [newTodo, setNewTodo] = useState('');
  const today = todayISO();

  const loadTodos = useCallback(async () => {
    const { data } = await api().from('todos').select('*').order('due_date').limit(200);
    setTodos((data ?? []) as Todo[]);
  }, []);

  useEffect(() => {
    if (!me) return;
    const sb = api();
    sb.from('tasks').select('id, category, status, due_date, assigned_to, created_at, completed_at, billed, fee').limit(10000)
      .then(({ data }: { data: T[] | null }) => setTasks(data ?? []));
    sb.from('packages').select('id', { count: 'exact', head: true }).eq('active', true).lte('next_bill_date', today)
      .then(({ count }: { count: number | null }) => setPackagesDue(count ?? 0));
    loadTodos();
  }, [me, today, loadTodos]);

  const d = useMemo(() => {
    const all = tasks ?? [];
    const open = all.filter((t) => t.status !== 'done' && t.due_date);
    const tomorrow = addDays(today, 1), week = addDays(today, 7), weekAgo = addDays(today, -7);
    const buckets = {
      today: open.filter((t) => t.due_date === today).length,
      tomorrow: open.filter((t) => t.due_date === tomorrow).length,
      week: open.filter((t) => t.due_date! > tomorrow && t.due_date! <= week).length,
      overdue7: open.filter((t) => t.due_date! < today && t.due_date! >= weekAgo).length,
      overdueOld: open.filter((t) => t.due_date! < weekAgo).length,
    };
    const counts = { pending: 0, hold: 0, progress: 0, done: 0 } as Record<GroupKey, number>;
    const byCat = new Map<string, { total: number; done: number; g: Record<GroupKey, number> }>();
    all.forEach((t) => {
      const g = groupOf(t.status);
      counts[g]++;
      const e = byCat.get(t.category) ?? { total: 0, done: 0, g: { pending: 0, hold: 0, progress: 0, done: 0 } };
      e.total++; e.g[g]++; if (g === 'done') e.done++;
      byCat.set(t.category, e);
    });

    // Best performer: tasks due this month per assignee.
    const month = today.slice(0, 7);
    const perf = staff.map((s) => {
      const mine = all.filter((t) => t.assigned_to === s.id && t.due_date?.startsWith(month));
      const done = mine.filter((t) => t.status === 'done').length;
      return { s, total: mine.length, done, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 };
    }).filter((p) => p.total > 0).sort((a, b) => b.pct - a.pct || b.done - a.done);

    // Quarterly performance for the current financial year.
    const now = new Date(today + 'T00:00:00');
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const qOf = (iso: string) => {
      const dt = new Date(iso);
      const m = dt.getMonth(), y = dt.getFullYear();
      const fy = m >= 3 ? y : y - 1;
      return fy === fyStart ? Math.floor(((m + 9) % 12) / 3) : -1;
    };
    const created = [0, 0, 0, 0], completed = [0, 0, 0, 0];
    all.forEach((t) => {
      const qc = qOf(t.created_at); if (qc >= 0) created[qc]++;
      if (t.completed_at) { const qd = qOf(t.completed_at); if (qd >= 0) completed[qd]++; }
    });

    const unbilled = all.filter((t) => t.status === 'done' && !t.billed && Number(t.fee) > 0).length;
    return { buckets, counts, byCat: [...byCat.entries()].sort((a, b) => b[1].total - a[1].total), perf, created, completed, fyStart, unbilled };
  }, [tasks, staff, today]);

  const visibleTodos = todos.filter((t) =>
    todoTab === 'done' ? t.done : !t.done && (todoTab === 'today' ? t.due_date <= today : t.due_date > today));

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    await api().from('todos').insert({ title: newTodo.trim(), due_date: todoTab === 'upcoming' ? addDays(today, 1) : today });
    setNewTodo('');
    loadTodos();
  };
  const toggleTodo = async (t: Todo) => {
    setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await api().from('todos').update({ done: !t.done }).eq('id', t.id);
  };

  if (!tasks) return <p className="py-10 text-center text-sm text-slate-500">Loading dashboard…</p>;
  const notDone = d.counts.pending + d.counts.hold + d.counts.progress;

  return (
    <div className="space-y-5">
      {/* Due buckets */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <DueTile n={d.buckets.today} title="Due" sub="Today" href="/tasks?view=today" tone="amber" />
        <DueTile n={d.buckets.tomorrow} title="Due" sub="Tomorrow" href="/tasks?view=tomorrow" tone="blue" />
        <DueTile n={d.buckets.week} title="Due" sub="In 7 days" href="/tasks?view=week" tone="green" />
        <DueTile n={d.buckets.overdue7} title="Overdue" sub="Up to 7 days" href="/tasks?view=overdue7" tone="orange" />
        <DueTile n={d.buckets.overdueOld} title="Overdue" sub="More than 7 days" href="/tasks?view=overdue_old" tone="rose" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Tasks by service + summary */}
        <section className="rounded-xl bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
            <Link href="/tasks" className="grid h-8 w-8 place-items-center rounded-lg text-brand-600 hover:bg-brand-50" aria-label="Go to tasks"><Plus size={18} /></Link>
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
                {(Object.keys(GROUPS) as GroupKey[]).map((k) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`flex-1 rounded-md px-2 py-1.5 ${tab === k ? 'bg-white font-medium text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    {GROUPS[k].label}
                  </button>
                ))}
              </div>
              {!d.byCat.length ? <p className="py-6 text-center text-sm text-slate-500">No tasks yet. Generate them from the compliance calendar.</p> : (
                <ul className="divide-y divide-slate-100">
                  {d.byCat.map(([cat, e]) => (
                    <li key={cat} className="grid grid-cols-[1fr_auto_auto] items-center gap-6 py-2.5 text-sm">
                      <Link href={`/tasks?category=${encodeURIComponent(cat)}`} className="text-slate-700 hover:text-brand-600">{cat}</Link>
                      <span className="w-10 text-right font-semibold tabular-nums text-brand-600">{e.g[tab]}</span>
                      <Ring done={e.done} total={e.total} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Task summary</h3>
              <div className="mt-3 flex items-center justify-between gap-4">
                <ul className="space-y-3 text-sm">
                  {(Object.keys(GROUPS) as GroupKey[]).map((k) => (
                    <li key={k} className="flex items-center gap-2.5">
                      <span className="h-3 w-3 rounded-full" style={{ background: GROUPS[k].color }} />
                      <span className="leading-tight"><span className="block text-xs text-slate-500">{GROUPS[k].label}</span><b className="tabular-nums">{d.counts[k]}</b></span>
                    </li>
                  ))}
                </ul>
                <Donut size={130} stroke={16}
                  parts={(Object.keys(GROUPS) as GroupKey[]).map((k) => ({ value: d.counts[k], color: GROUPS[k].color, label: GROUPS[k].label }))}
                  center={<span><b className="block text-xl tabular-nums">{tasks.length}</b><span className="text-[11px] text-slate-500">total</span></span>} />
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm">
                <span className="text-slate-600">Still to complete</span><b className="text-lg tabular-nums text-brand-700">{notDone}</b>
              </div>
            </div>
          </div>
        </section>

        {/* To-Do */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">To-Do</h2>
            <Link href="/todos" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(['today', 'upcoming', 'done'] as const).map((k) => (
              <button key={k} onClick={() => setTodoTab(k)}
                className={`flex-1 rounded-md px-2 py-1.5 capitalize ${todoTab === k ? 'bg-white font-medium text-brand-700 shadow-sm' : 'text-slate-500'}`}>
                {k === 'done' ? 'Completed' : k}
              </button>
            ))}
          </div>
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {!visibleTodos.length && <li className="py-6 text-center text-sm text-slate-400">Nothing here.</li>}
            {visibleTodos.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                  <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t)} className="h-4 w-4 rounded-full accent-brand-600" />
                  <span className={t.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{t.title}</span>
                  {!t.done && t.due_date < today && <span className="ml-auto text-xs text-rose-600">late</span>}
                </label>
              </li>
            ))}
          </ul>
          {todoTab !== 'done' && (
            <form onSubmit={addTodo} className="mt-2 flex gap-2">
              <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} placeholder={`Add a to-do for ${todoTab === 'today' ? 'today' : 'tomorrow'}…`}
                aria-label="New to-do" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none" />
              <button className="rounded-lg bg-brand-600 px-3 text-white hover:bg-brand-700" aria-label="Add to-do"><Plus size={16} /></button>
            </form>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.2fr)]">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Need to make invoice</h2>
          <div className="mt-5 grid grid-cols-2 divide-x divide-slate-200 text-center">
            <Link href="/packages" className="hover:opacity-80"><b className="block text-3xl tabular-nums text-brand-600">{packagesDue}</b><span className="text-xs text-slate-500">Packages</span></Link>
            <Link href="/invoices/new" className="hover:opacity-80"><b className="block text-3xl tabular-nums text-brand-600">{d.unbilled}</b><span className="text-xs text-slate-500">Tasks</span></Link>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Best performer</h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">This month</span>
          </div>
          {!d.perf.length ? <p className="py-6 text-center text-sm text-slate-400">No tasks due this month yet.</p> : (
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="pb-2 font-medium">User</th><th className="pb-2 text-right font-medium">Total</th><th className="pb-2 text-right font-medium">Done</th><th className="pb-2 text-right font-medium">%</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.perf.slice(0, 5).map(({ s, total, done, pct }) => (
                  <tr key={s.id}>
                    <td className="py-2"><span className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">{(s.full_name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>{s.full_name}</span></td>
                    <td className="py-2 text-right tabular-nums">{total}</td>
                    <td className="py-2 text-right tabular-nums">{done}</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Performance</h2>
            <span className="text-xs text-slate-500">FY {d.fyStart}-{String((d.fyStart + 1) % 100).padStart(2, '0')}</span>
          </div>
          <LineChart labels={['Q1 Apr–Jun', 'Q2 Jul–Sep', 'Q3 Oct–Dec', 'Q4 Jan–Mar']}
            series={[{ name: 'Tasks created', color: '#5eead4', values: d.created }, { name: 'Tasks completed', color: '#4f46e5', values: d.completed }]} />
        </section>
      </div>
    </div>
  );
}

const TONES = {
  amber: 'bg-amber-50 text-amber-500',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-500',
  orange: 'bg-orange-50 text-orange-500',
  rose: 'bg-rose-50 text-rose-500',
};
function DueTile({ n, title, sub, href, tone }: { n: number; title: string; sub: string; href: string; tone: keyof typeof TONES }) {
  return (
    <Link href={href} className={`flex items-center justify-between rounded-xl px-5 py-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 ${TONES[tone]}`}>
      <span className="text-4xl font-bold tabular-nums">{n}</span>
      <span className="text-right leading-tight"><b className="block text-sm text-slate-800">{title}</b><span className="text-xs text-slate-500">{sub}</span></span>
    </Link>
  );
}
