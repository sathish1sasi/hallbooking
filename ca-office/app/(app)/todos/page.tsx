'use client';
import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fmtDate, todayISO } from '@/lib/format';
import type { Todo } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Button, Card, Empty, Input, PageHeader, Select } from '@/components/ui';

export default function TodosPage() {
  const { clients } = useApp();
  const [rows, setRows] = useState<Todo[] | null>(null);
  const [f, setF] = useState({ title: '', due_date: todayISO(), client_id: '' });
  const today = todayISO();

  const load = useCallback(async () => {
    const { data } = await supabase().from('todos').select('*').order('done').order('due_date').limit(500);
    setRows((data ?? []) as Todo[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    await supabase().from('todos').insert({ ...f, title: f.title.trim(), client_id: f.client_id || null });
    setF({ ...f, title: '' });
    load();
  };
  const toggle = async (t: Todo) => { await supabase().from('todos').update({ done: !t.done }).eq('id', t.id); load(); };
  const remove = async (t: Todo) => { await supabase().from('todos').delete().eq('id', t.id); load(); };
  const name = (id: string | null) => clients.find((c) => c.id === id)?.name;

  const sections = [
    { title: 'Overdue', items: (rows ?? []).filter((t) => !t.done && t.due_date < today) },
    { title: 'Today', items: (rows ?? []).filter((t) => !t.done && t.due_date === today) },
    { title: 'Upcoming', items: (rows ?? []).filter((t) => !t.done && t.due_date > today) },
    { title: 'Completed', items: (rows ?? []).filter((t) => t.done).slice(0, 30) },
  ];

  return (
    <>
      <PageHeader title="To-Do" subtitle="Your personal list: calls, visits, errands. Only you can see it." />
      <Card className="mb-5">
        <form onSubmit={add} className="flex flex-wrap gap-3">
          <Input className="min-w-[14rem] flex-1" placeholder="e.g. Call Mr Reddy about Form 16" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="To-do" />
          <Input type="date" className="w-auto" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} aria-label="Date" />
          <Select className="w-auto" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} aria-label="Client">
            <option value="">No client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button>Add</Button>
        </form>
      </Card>
      {!rows ? <Empty>Loading…</Empty> : (
        <div className="grid gap-5 md:grid-cols-2">
          {sections.map((s) => (
            <Card key={s.title} title={<span className={s.title === 'Overdue' && s.items.length ? 'text-rose-600' : ''}>{s.title} · {s.items.length}</span>}>
              {!s.items.length ? <p className="text-sm text-slate-400">Nothing here.</p> : (
                <ul className="divide-y divide-slate-100">
                  {s.items.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                      <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="h-4 w-4 accent-brand-600" aria-label={`Mark ${t.title} done`} />
                      <span className={`flex-1 ${t.done ? 'text-slate-400 line-through' : ''}`}>{t.title}{name(t.client_id) && <span className="block text-xs text-slate-500">{name(t.client_id)}</span>}</span>
                      <span className="text-xs text-slate-500">{fmtDate(t.due_date)}</span>
                      <button onClick={() => remove(t)} className="text-slate-300 hover:text-rose-600" aria-label="Delete"><Trash2 size={15} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
