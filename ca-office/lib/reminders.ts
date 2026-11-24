// Decides which clients get which automatic reminder today.
// Pure function: no database or network access, so it can be unit-tested and
// used both for the on-screen preview and by the scheduled server job.

export type ReminderKind = 'deadline' | 'documents' | 'payment';

export interface ReminderSettings {
  firmName: string;
  kinds: ReminderKind[];
  deadlineDays: number;     // remind this many days before a task's due date
  docAfterDays: number;     // first chase when a document has been pending this long
  repeatDays: number;       // repeat document/payment chasers at most this often
  paymentGraceDays: number; // first payment reminder this many days after invoice due date
}

export interface RClient { id: string; name: string; contact_person: string | null; email: string | null; phone: string | null; reminders_opt_out: boolean; status: string }
export interface RTask { client_id: string; title: string; period: string | null; due_date: string | null; status: string }
export interface RDoc { client_id: string; name: string; requested_on: string; status: string }
export interface RInvoice { client_id: string; invoice_no: string; issue_date: string; due_date: string | null; balance: number; status: string }
export interface RLog { client_id: string; kind: ReminderKind; sent_on: string; status: string }

export interface PlannedReminder {
  client: RClient;
  kind: ReminderKind;
  subject: string;
  body: string;       // multi-line text for email
  oneLine: string;    // single-line summary (WhatsApp template parameters cannot contain newlines)
  items: string[];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso: string) => `${iso.slice(8, 10)} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

export function planReminders(input: {
  today: string;
  settings: ReminderSettings;
  clients: RClient[];
  tasks: RTask[];
  docs: RDoc[];
  invoices: RInvoice[];
  log: RLog[];
}): PlannedReminder[] {
  const { today, settings: s } = input;
  const eligible = new Map(input.clients.filter((c) => c.status === 'active' && !c.reminders_opt_out).map((c) => [c.id, c]));

  const lastSent = (clientId: string, kind: ReminderKind) =>
    input.log.filter((l) => l.client_id === clientId && l.kind === kind && l.status === 'sent')
      .map((l) => l.sent_on).sort().pop();
  const recentlySent = (clientId: string, kind: ReminderKind, withinDays: number) => {
    const last = lastSent(clientId, kind);
    return !!last && daysBetween(last, today) < withinDays;
  };

  const byClient = <T extends { client_id: string }>(rows: T[]) =>
    rows.reduce<Map<string, T[]>>((m, r) => (eligible.has(r.client_id) ? m.set(r.client_id, [...(m.get(r.client_id) ?? []), r]) : m), new Map());

  const out: PlannedReminder[] = [];
  const greet = (c: RClient) => `Dear ${c.contact_person || c.name},`;
  const sign = `Regards,\n${s.firmName}`;

  if (s.kinds.includes('deadline')) {
    const target = addDaysISO(today, s.deadlineDays);
    const due = byClient(input.tasks.filter((t) => t.status !== 'done' && t.due_date === target));
    for (const [cid, ts] of due) {
      if (recentlySent(cid, 'deadline', 1)) continue;
      const c = eligible.get(cid)!;
      const items = ts.map((t) => `${t.title}${t.period ? ` (${t.period})` : ''} – due ${fmt(t.due_date!)}`);
      out.push({
        client: c, kind: 'deadline', items,
        subject: `Upcoming due date: ${ts.map((t) => t.title).join(', ')}`,
        body: `${greet(c)}\n\nThe following filing${items.length > 1 ? 's are' : ' is'} due in ${s.deadlineDays} day${s.deadlineDays === 1 ? '' : 's'}:\n${items.map((i) => `• ${i}`).join('\n')}\n\nIf any information is still pending from your side, please share it today so we can file on time.\n\n${sign}`,
        oneLine: `${items.join('; ')}. Please share any pending information today.`,
      });
    }
  }

  if (s.kinds.includes('documents')) {
    const pending = byClient(input.docs.filter((d) => d.status === 'pending' && daysBetween(d.requested_on, today) >= s.docAfterDays));
    for (const [cid, ds] of pending) {
      if (recentlySent(cid, 'documents', s.repeatDays)) continue;
      const c = eligible.get(cid)!;
      const items = ds.map((d) => `${d.name} (requested ${fmt(d.requested_on)})`);
      out.push({
        client: c, kind: 'documents', items,
        subject: `Documents pending: ${ds.length} item${ds.length > 1 ? 's' : ''}`,
        body: `${greet(c)}\n\nGentle reminder: we are still awaiting the following:\n${items.map((i) => `• ${i}`).join('\n')}\n\nKindly share them at the earliest so we can complete your work on time.\n\n${sign}`,
        oneLine: `We are still awaiting: ${ds.map((d) => d.name).join('; ')}.`,
      });
    }
  }

  if (s.kinds.includes('payment')) {
    const overdue = byClient(input.invoices.filter((i) =>
      ['unpaid', 'partial'].includes(i.status) && Number(i.balance) > 0 && i.due_date && daysBetween(i.due_date, today) >= s.paymentGraceDays));
    for (const [cid, inv] of overdue) {
      if (recentlySent(cid, 'payment', s.repeatDays)) continue;
      const c = eligible.get(cid)!;
      const total = inv.reduce((a, i) => a + Number(i.balance), 0);
      const items = inv.map((i) => `${i.invoice_no} dated ${fmt(i.issue_date)}: ${inr(i.balance)} (due ${fmt(i.due_date!)})`);
      out.push({
        client: c, kind: 'payment', items,
        subject: `Payment reminder: ${inr(total)} outstanding`,
        body: `${greet(c)}\n\nThis is a friendly reminder that the following invoice${inv.length > 1 ? 's are' : ' is'} pending:\n${items.map((i) => `• ${i}`).join('\n')}\n\nTotal outstanding: ${inr(total)}. Please ignore this if already paid.\n\n${sign}`,
        oneLine: `${inr(total)} outstanding on ${inv.map((i) => i.invoice_no).join(', ')}. Please ignore if already paid.`,
      });
    }
  }

  return out;
}
