'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { dueItemsForMonth, SERVICES, type DueItem } from '@/lib/compliance';
import { daysUntil, fmtDate } from '@/lib/format';
import { Badge, Button, Card, DueBadge, Empty, ErrorNote, PageHeader } from '@/components/ui';
import { stepsFor } from '@/lib/checklists';
import { AutoCreateSetting } from '@/components/AutoCreateSetting';

type C = { id: string; name: string; services: string[]; assigned_to: string | null };
type T = { client_id: string; compliance_key: string; status: string };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CompliancePage() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [clients, setClients] = useState<C[]>([]);
  const [existing, setExisting] = useState<T[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo(() => dueItemsForMonth(ym.y, ym.m), [ym]);

  const load = useCallback(async () => {
    const sb = api();
    const keys = items.map((i) => i.key);
    const [c, t] = await Promise.all([
      sb.from('clients').select('id, name, services, assigned_to').eq('status', 'active').order('name'),
      keys.length ? sb.from('tasks').select('client_id, compliance_key, status').in('compliance_key', keys) : Promise.resolve({ data: [] }),
    ]);
    setClients((c.data ?? []) as C[]);
    setExisting((t.data ?? []) as T[]);
  }, [items]);
  useEffect(() => { load(); }, [load]);

  const applicable = (it: DueItem) => clients.filter((c) => c.services.includes(it.service));
  const statusFor = (it: DueItem, clientId: string) => existing.find((t) => t.compliance_key === it.key && t.client_id === clientId)?.status;

  const generate = async (list: DueItem[]) => {
    setBusy(list.length === 1 ? list[0].service + list[0].key : 'all'); setError(null); setMsg(null);
    const rows = list.flatMap((it) =>
      applicable(it)
        .filter((c) => !statusFor(it, c.id))
        .map((c) => ({
          client_id: c.id,
          title: it.title,
          category: it.category,
          period: it.period,
          due_date: it.dueDate,
          assigned_to: c.assigned_to,
          compliance_key: it.key,
        })),
    );
    if (!rows.length) { setBusy(null); setMsg('All tasks for this selection already exist.'); return; }
    const { data: created, error } = await api().from('tasks')
      .upsert(rows, { onConflict: 'client_id,compliance_key', ignoreDuplicates: true }).select('id, category');
    if (!error && created?.length) {
      await api().from('task_checklist').insert(
        created.flatMap((t: { id: string; category: string }) => stepsFor(t.category).map((label, n) => ({ task_id: t.id, label, position: n + 1 }))));
    }
    setBusy(null);
    if (error) return setError(error.message);
    setMsg(`Created ${rows.length} task${rows.length === 1 ? '' : 's'}, assigned to each client's manager.`);
    load();
  };

  const shift = (d: number) => {
    const idx = ym.y * 12 + (ym.m - 1) + d;
    setYm({ y: Math.floor(idx / 12), m: (idx % 12) + 1 });
  };

  const byDate = items.reduce<Record<string, DueItem[]>>((acc, it) => ((acc[it.dueDate] ??= []).push(it), acc), {});
  const totalMissing = items.reduce((a, it) => a + applicable(it).filter((c) => !statusFor(it, c.id)).length, 0);

  return (
    <>
      <PageHeader
        title="Compliance calendar"
        subtitle="Statutory due dates for the month, matched against each client's engaged services."
        actions={<Button disabled={!!busy || !totalMissing} onClick={() => generate(items)}><Wand2 size={16} /> Generate all ({totalMissing})</Button>}
      />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></Button>
        <div className="w-44 text-center font-semibold">{MONTHS[ym.m - 1]} {ym.y}</div>
        <Button variant="secondary" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></Button>
      </div>
      <div className="mb-4 space-y-2">
        <ErrorNote error={error} />
        {msg && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
        <AutoCreateSetting />
      </div>

      {!items.length ? <Empty>No statutory deadlines this month.</Empty> : (
        <div className="space-y-4">
          {Object.entries(byDate).map(([date, list]) => (
            <Card key={date} title={<span className="flex items-center gap-2">{fmtDate(date)} <DueBadge days={daysUntil(date)} /></span>}>
              <ul className="divide-y divide-slate-100">
                {list.map((it) => {
                  const cl = applicable(it);
                  const created = cl.filter((c) => statusFor(it, c.id));
                  const done = cl.filter((c) => statusFor(it, c.id) === 'done');
                  const id = it.service + it.key;
                  return (
                    <li key={id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <button className="font-medium text-slate-900 hover:text-brand-600" onClick={() => setOpen(open === id ? null : id)}>
                            {it.title} <span className="font-normal text-slate-500">· {it.period}</span>
                          </button>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            <Badge>{SERVICES.find((s) => s.code === it.service)?.label}</Badge>
                            <span>{cl.length} client{cl.length === 1 ? '' : 's'}</span>
                            {cl.length > 0 && <span>· {created.length} tasks · {done.length} filed</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {cl.length > 0 && (
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full bg-emerald-500" style={{ width: `${(done.length / cl.length) * 100}%` }} />
                            </div>
                          )}
                          <Button variant="secondary" disabled={!!busy || created.length === cl.length} onClick={() => generate([it])}>
                            {busy === id ? 'Creating…' : created.length === cl.length ? 'Up to date' : `Create ${cl.length - created.length}`}
                          </Button>
                        </div>
                      </div>
                      {open === id && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {!cl.length && <span className="text-sm text-slate-500">No active clients have this service enabled.</span>}
                          {cl.map((c) => {
                            const st = statusFor(it, c.id);
                            return (
                              <a key={c.id} href={`/clients/view/?id=${c.id}`}
                                className={`rounded-full px-2.5 py-1 text-xs ${st === 'done' ? 'bg-emerald-100 text-emerald-700' : st ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                {c.name}{st === 'done' ? ' ✓' : ''}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
          <p className="text-xs text-slate-500">
            Dates are standard statutory due dates. Government extensions and state-wise variations (e.g. GSTR-3B QRMP 22nd/24th) are not applied — edit the task's due date if an extension is notified.
          </p>
        </div>
      )}
    </>
  );
}
