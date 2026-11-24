'use client';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Columns3, List, Plus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TASK_CATEGORIES } from '@/lib/compliance';
import { daysUntil, fmtDate, inr, todayISO } from '@/lib/format';
import { TASK_STATUSES, type Task, type TaskStatus } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { TaskForm } from '@/components/forms';
import { Badge, Button, Card, DueBadge, Empty, Input, Modal, PageHeader, Select, StatusBadge, Table, Td } from '@/components/ui';

export default function TasksPage() {
  return <Suspense><Tasks /></Suspense>;
}

function Tasks() {
  const params = useSearchParams();
  const { me, staff, staffName } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [q, setQ] = useState('');
  const [assignee, setAssignee] = useState('');
  const [category, setCategory] = useState('');
  const [when, setWhen] = useState(params.get('view') === 'overdue' ? 'overdue' : 'open');
  const [modal, setModal] = useState<null | 'new' | Task>(null);

  const load = useCallback(async () => {
    let query = supabase().from('tasks').select('*, clients(name)').order('due_date', { nullsFirst: false }).limit(1000);
    if (when !== 'all' && when !== 'done') query = query.neq('status', 'done');
    if (when === 'done') query = query.eq('status', 'done').order('completed_at', { ascending: false });
    const { data } = await query;
    setTasks((data ?? []) as Task[]);
  }, [when]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const today = todayISO();
    const needle = q.trim().toLowerCase();
    return (tasks ?? []).filter((t) =>
      (!assignee || (assignee === 'me' ? t.assigned_to === me?.id : assignee === 'none' ? !t.assigned_to : t.assigned_to === assignee)) &&
      (!category || t.category === category) &&
      (when !== 'overdue' || (t.due_date && t.due_date < today)) &&
      (!needle || [t.title, t.period, t.clients?.name].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [tasks, q, assignee, category, when, me]);

  const setStatus = async (t: Task, status: TaskStatus) => {
    setTasks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, status } : x)) ?? null);
    const { error } = await supabase().from('tasks').update({ status }).eq('id', t.id);
    if (error) { alert(error.message); load(); }
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={tasks ? `${filtered.length} shown` : undefined}
        actions={<>
          <div className="flex rounded-md border border-slate-300 bg-white">
            <button className={`px-3 py-2 ${view === 'list' ? 'bg-slate-100' : ''}`} onClick={() => setView('list')} aria-label="List view"><List size={16} /></button>
            <button className={`px-3 py-2 ${view === 'board' ? 'bg-slate-100' : ''}`} onClick={() => setView('board')} aria-label="Board view"><Columns3 size={16} /></button>
          </div>
          <Button onClick={() => setModal('new')}><Plus size={16} /> New task</Button>
        </>}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <Input className="pl-9" placeholder="Search task, period or client…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-auto" value={when} onChange={(e) => setWhen(e.target.value)}>
          <option value="open">Open</option><option value="overdue">Overdue</option><option value="done">Completed</option><option value="all">All</option>
        </Select>
        <Select className="w-auto" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Everyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </Select>
        <Select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>{TASK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>

      {!tasks ? <Empty>Loading…</Empty> : view === 'list' ? (
        <Card>
          {!filtered.length ? <Empty>No tasks.</Empty> : (
            <Table head={['Client', 'Task', 'Period', 'Due', 'Assignee', 'Fee', 'Status']}>
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td><Link href={`/clients/${t.client_id}`} className="font-medium text-slate-900 hover:text-brand-600">{t.clients?.name}</Link></Td>
                  <Td>
                    <button className="text-left hover:text-brand-600" onClick={() => setModal(t)}>{t.title}</button>
                    <div className="flex gap-1">{t.priority === 'high' && <Badge className="bg-red-50 text-red-700">high</Badge>}<span className="text-xs text-slate-500">{t.category}</span></div>
                  </Td>
                  <Td>{t.period}</Td>
                  <Td><div className="whitespace-nowrap">{fmtDate(t.due_date)}</div><DueBadge days={daysUntil(t.due_date)} done={t.status === 'done'} /></Td>
                  <Td>{staffName(t.assigned_to)}</Td>
                  <Td className="whitespace-nowrap">{inr(t.fee)}</Td>
                  <Td>
                    <select value={t.status} onChange={(e) => setStatus(t, e.target.value as TaskStatus)} className="rounded border-slate-200 bg-transparent text-xs">
                      {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 overflow-x-auto md:grid-cols-5">
          {TASK_STATUSES.map((col) => {
            const items = filtered.filter((t) => t.status === col.value);
            return (
              <div
                key={col.value}
                className="min-w-[14rem] rounded-lg bg-slate-100 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const t = filtered.find((x) => x.id === e.dataTransfer.getData('id'));
                  if (t && t.status !== col.value) setStatus(t, col.value);
                }}
              >
                <div className="mb-2 flex items-center justify-between px-1"><StatusBadge status={col.value} /><span className="text-xs text-slate-500">{items.length}</span></div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('id', t.id)} onClick={() => setModal(t)}
                      className="cursor-pointer rounded-md border border-slate-200 bg-white p-2.5 text-sm shadow-sm hover:border-brand-500">
                      <div className="font-medium">{t.clients?.name}</div>
                      <div className="text-slate-600">{t.title}{t.period ? ` · ${t.period}` : ''}</div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                        <span>{fmtDate(t.due_date)}</span><DueBadge days={daysUntil(t.due_date)} done={t.status === 'done'} />
                      </div>
                      <div className="text-xs text-slate-400">{staffName(t.assigned_to)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'new' ? 'New task' : 'Edit task'} wide onClose={() => setModal(null)}>
          <TaskForm
            task={modal === 'new' ? undefined : modal}
            onSaved={() => { setModal(null); load(); }}
            onDeleted={() => { setModal(null); load(); }}
          />
        </Modal>
      )}
    </>
  );
}
