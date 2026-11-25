'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ListPlus, Pencil, Send, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { stepsFor } from '@/lib/checklists';
import { daysUntil, fmtDate, inr } from '@/lib/format';
import { TASK_STATUSES, type ChecklistItem, type DocumentRow, type Task, type TaskComment, type TaskStatus, type TimeEntry } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { TaskForm } from '@/components/forms';
import { FileLink } from '@/components/FileLink';
import { UploadButton } from '@/components/FileButton';
import { Button, Card, DueBadge, Empty, ErrorNote, Input, Modal, StatusBadge, Textarea } from '@/components/ui';

const timeAgo = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export default function TaskDetailPage() {
  return <Suspense><TaskDetail /></Suspense>;
}

function TaskDetail() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { me, staffName } = useApp();
  const [task, setTask] = useState<Task | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [files, setFiles] = useState<DocumentRow[]>([]);
  const [time, setTime] = useState<TimeEntry[]>([]);
  const [newItem, setNewItem] = useState('');
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = api();
    const [t, c, cm, d, te] = await Promise.all([
      sb.from('tasks').select('*, clients(name)').eq('id', id).maybeSingle(),
      sb.from('task_checklist').select('*').eq('task_id', id).order('position'),
      sb.from('task_comments').select('*').eq('task_id', id).order('created_at'),
      sb.from('documents').select('*').eq('task_id', id).order('created_at'),
      sb.from('time_entries').select('*, profiles(full_name)').eq('task_id', id).order('work_date', { ascending: false }),
    ]);
    if (!t.data) { setMissing(true); return; }
    setTask(t.data as Task);
    setItems((c.data ?? []) as ChecklistItem[]);
    setComments((cm.data ?? []) as TaskComment[]);
    setFiles((d.data ?? []) as DocumentRow[]);
    setTime((te.data ?? []) as TimeEntry[]);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (missing) return <Empty>This task no longer exists. <Link className="text-brand-600" href="/tasks">Back to tasks</Link></Empty>;
  if (!task) return <Empty>Loading…</Empty>;

  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const nextPos = (items.at(-1)?.position ?? 0) + 1;

  const setStatus = async (status: TaskStatus) => {
    setTask({ ...task, status });
    const { error } = await api().from('tasks').update({ status }).eq('id', task.id);
    if (error) { setError(error.message); load(); }
  };

  const toggle = async (it: ChecklistItem) => {
    const doneNow = !it.done;
    setItems(items.map((x) => (x.id === it.id ? { ...x, done: doneNow } : x)));
    await api().from('task_checklist').update({ done: doneNow, done_by: doneNow ? me?.id : null, done_at: doneNow ? new Date().toISOString() : null }).eq('id', it.id);
    // Moving a To-do task to In progress once work starts saves a click.
    if (doneNow && task.status === 'todo') setStatus('in_progress');
  };

  const addItems = async (labels: string[]) => {
    const rows = labels.map((label, i) => ({ task_id: task.id, label, position: nextPos + i }));
    const { error } = await api().from('task_checklist').insert(rows);
    if (error) return setError(error.message);
    setNewItem('');
    load();
  };

  const removeItem = async (it: ChecklistItem) => {
    setItems(items.filter((x) => x.id !== it.id));
    await api().from('task_checklist').delete().eq('id', it.id);
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    const { error } = await api().from('task_comments').insert({ task_id: task.id, body: comment.trim() });
    if (error) return setError(error.message);
    setComment('');
    load();
  };

  const deleteComment = async (c: TaskComment) => {
    await api().from('task_comments').delete().eq('id', c.id);
    load();
  };

  const hours = time.reduce((a, t) => a + Number(t.hours), 0);

  return (
    <>
      <Link href="/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Tasks</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/clients/view/?id=${task.client_id}`} className="text-sm font-medium text-brand-600 hover:underline">{task.clients?.name}</Link>
          <h1 className="text-2xl font-semibold text-slate-900">{task.title}{task.period && <span className="font-normal text-slate-500"> · {task.period}</span>}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>Due {fmtDate(task.due_date)}</span><DueBadge days={daysUntil(task.due_date)} done={task.status === 'done'} />
            <span>· {staffName(task.assigned_to)}</span><span>· {task.category}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={task.status} onChange={(e) => setStatus(e.target.value as TaskStatus)} aria-label="Status"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</Button>
        </div>
      </div>
      <ErrorNote error={error} />

      <div className="mt-3 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={<span>Checklist {items.length > 0 && <span className="font-normal text-slate-500">· {done}/{items.length}</span>}</span>}
            action={!items.length ? <Button variant="ghost" onClick={() => addItems(stepsFor(task.category))}><ListPlus size={15} /> Add standard {task.category} steps</Button> : undefined}>
            {items.length > 0 && (
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
            )}
            <ul className="divide-y divide-slate-100">
              {items.map((it) => (
                <li key={it.id} className="group flex items-center gap-3 py-2 text-sm">
                  <input id={`ck-${it.id}`} type="checkbox" checked={it.done} onChange={() => toggle(it)} className="h-4 w-4 accent-emerald-600" />
                  <label htmlFor={`ck-${it.id}`} className={`flex-1 cursor-pointer ${it.done ? 'text-slate-400 line-through' : ''}`}>{it.label}</label>
                  {it.done && it.done_by && <span className="text-xs text-slate-400">{staffName(it.done_by)}</span>}
                  <button onClick={() => removeItem(it)} className="text-slate-300 opacity-0 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${it.label}`}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) addItems([newItem.trim()]); }} className="mt-3 flex gap-2">
              <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a step…" aria-label="New checklist step" />
              <Button variant="secondary">Add</Button>
            </form>
            {items.length > 0 && pct === 100 && task.status !== 'done' && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                All steps are done. <Button onClick={() => setStatus('done')}>Mark task done</Button>
              </div>
            )}
          </Card>

          <Card title={`Discussion · ${comments.length}`}>
            {!comments.length && <p className="mb-3 text-sm text-slate-400">No comments yet. Use this for review points, client queries and handover notes.</p>}
            <ul className="space-y-4">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {staffName(c.user_id).split(' ').map((w) => w[0]).slice(0, 2).join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-sm"><b className="font-medium">{staffName(c.user_id)}</b><span className="text-xs text-slate-400">{timeAgo(c.created_at)}</span>
                      {(c.user_id === me?.id || me?.role === 'admin') && <button onClick={() => deleteComment(c)} className="ml-auto text-xs text-slate-400 hover:text-rose-600">Delete</button>}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form onSubmit={postComment} className="mt-4 space-y-2">
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" aria-label="Comment"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) postComment(e); }} />
              <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Ctrl + Enter to post</span><Button disabled={!comment.trim()}><Send size={14} /> Post</Button></div>
            </form>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ['Status', <StatusBadge key="s" status={task.status} />],
                ['Priority', <span key="p" className="capitalize">{task.priority}</span>],
                ['Fee', `${inr(task.fee)}${task.billed ? ' · billed' : ''}`],
                ['ARN / Ack. no.', task.acknowledgement_no ?? '—'],
                ['Completed', task.completed_at ? fmtDate(task.completed_at) : '—'],
                ['Hours logged', hours.toFixed(1)],
              ].map(([k, v]) => <div key={k as string} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
            </dl>
            {task.notes && <p className="mt-3 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-600">{task.notes}</p>}
          </Card>

          <Card title="Files" action={<UploadButton clientId={task.client_id} taskId={task.id} label="Upload" onDone={load} />}>
            {!files.length ? <p className="text-sm text-slate-400">Working papers, computations and acknowledgements for this task.</p> : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="text-sm">
                    {f.file_path ? <FileLink doc={f} onRemoved={load} /> : <span>{f.name} <span className="text-xs text-amber-600">(requested, not received)</span></span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editing && (
        <Modal title="Edit task" wide onClose={() => setEditing(false)}>
          <TaskForm task={task} onSaved={() => { setEditing(false); load(); }} onDeleted={() => router.replace('/tasks')} />
        </Modal>
      )}
    </>
  );
}
