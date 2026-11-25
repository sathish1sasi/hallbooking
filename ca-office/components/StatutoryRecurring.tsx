'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { dueItemsForMonth, type DueItem } from '@/lib/compliance';
import { addDays, fmtDate, todayISO } from '@/lib/format';
import { Card, Empty } from './ui';

const REPEATS: Record<string, string> = {
  GSTR1: 'Monthly', GSTR3B: 'Monthly', TDSPAY: 'Monthly', BOOKS: 'Monthly', PMT06: 'Monthly (non-quarter months)',
  GSTR1Q: 'Quarterly', GSTR3BQ: 'Quarterly', TDSRET: 'Quarterly', ADVTAX: 'Quarterly',
};
const GST_RULES = ['GSTR1', 'GSTR3B', 'GSTR1Q', 'GSTR3BQ', 'PMT06'];

type C = { id: string; name: string; services: string[] };

/** Every client's statutory filings shown as recurring items, with the next due date. */
export function StatutoryRecurring() {
  const today = todayISO();
  const [clients, setClients] = useState<C[] | null>(null);
  const [lead, setLead] = useState(10);
  const [gstOnly, setGstOnly] = useState(true);

  useEffect(() => {
    const sb = api();
    sb.from('clients').select('id, name, services').eq('status', 'active').order('name').then(({ data }: { data: C[] | null }) => setClients(data ?? []));
    sb.from('firm_settings').select('auto_compliance_days').single().then(({ data }: { data: { auto_compliance_days: number } | null }) => setLead(data?.auto_compliance_days ?? 10));
  }, []);

  // Next occurrence of every rule over the coming 12 months.
  const nextByRule = useMemo(() => {
    const out = new Map<string, DueItem>();
    const d = new Date(today + 'T00:00:00');
    for (let i = 0; i < 13; i++) {
      const y = d.getFullYear() + Math.floor((d.getMonth() + i) / 12), m = ((d.getMonth() + i) % 12) + 1;
      for (const it of dueItemsForMonth(y, m)) if (it.dueDate >= today && !out.has(it.ruleId + it.service)) out.set(it.ruleId + it.service, it);
    }
    return [...out.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [today]);

  const rows = (clients ?? []).map((c) => ({
    c, items: nextByRule.filter((it) => c.services.includes(it.service) && (!gstOnly || GST_RULES.includes(it.ruleId))),
  })).filter((r) => r.items.length);

  return (
    <Card className="mt-5" title="Statutory returns: repeat automatically for every client"
      action={<label className="flex items-center gap-2 text-xs font-normal text-slate-500"><input type="checkbox" checked={gstOnly} onChange={(e) => setGstOnly(e.target.checked)} /> GST only</label>}>
      <p className="mb-3 text-sm text-slate-500">
        These come from each client’s services, so there is nothing to set up per client. {lead > 0
          ? <>Each task is created <b>{lead} days before</b> its due date, assigned to the client’s manager, with the standard checklist.</>
          : <>Automatic creation is off; turn it on from the Compliance page.</>} See every month’s status on the <Link href="/gst" className="font-medium text-brand-700 underline">GST tracker</Link>.
      </p>
      {!clients ? <Empty>Loading…</Empty> : !rows.length ? <Empty>No clients have {gstOnly ? 'a GST' : 'a statutory'} service ticked yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Client</th><th className="px-3 py-2 font-medium">Return</th><th className="px-3 py-2 font-medium">Repeats</th>
              <th className="px-3 py-2 font-medium">Next period</th><th className="px-3 py-2 font-medium">Next due</th><th className="px-3 py-2 font-medium">Task created on</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.flatMap(({ c, items }) => items.map((it, i) => (
                <tr key={c.id + it.key}>
                  <td className="px-3 py-2">{i === 0 && <Link href={`/clients/view/?id=${c.id}`} className="font-medium hover:text-brand-600">{c.name}</Link>}</td>
                  <td className="px-3 py-2">{it.title}</td>
                  <td className="px-3 py-2 text-slate-600">{REPEATS[it.ruleId] ?? 'Yearly'}</td>
                  <td className="px-3 py-2 text-slate-600">{it.period}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(it.dueDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{lead > 0 ? (addDays(it.dueDate, -lead) <= today ? 'Already created' : fmtDate(addDays(it.dueDate, -lead))) : '—'}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
