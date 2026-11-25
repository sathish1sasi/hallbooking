import 'server-only';
import { adminClient } from './supabase-admin';
import { emailConfigured, normalisePhone, sendEmail, sendWhatsApp, whatsappConfigured } from './send';
import { addDaysISO, planReminders, type ReminderKind } from '../reminders';
import { complianceTasksDue } from '../compliance';
import { stepsFor } from '../checklists';

/** Today's date in India, whatever timezone the server runs in. */
export const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export interface JobSummary {
  date: string;
  recurringCreated: number;
  complianceCreated: number;
  remindersEnabled: boolean;
  emailReady: boolean;
  whatsappReady: boolean;
  planned: number;
  sent: number;
  failed: number;
  skipped: number;
  details: { client: string; kind: ReminderKind; channel: string; status: string; detail?: string }[];
}

export async function runDailyJob({ dryRun = false } = {}): Promise<JobSummary> {
  const sb = adminClient();
  const today = todayIST();

  // 1. Recurring tasks (always runs, even if reminders are switched off).
  let recurringCreated = 0;
  if (!dryRun) {
    const { data, error } = await sb.rpc('generate_recurring_tasks', { p_lead_days: 7 });
    if (error) throw new Error(`Recurring tasks failed: ${error.message}`);
    recurringCreated = data ?? 0;
  }

  const { data: firm } = await sb.from('firm_settings').select('*').single();

  // 2. Statutory tasks (GST, TDS, ROC…) for every client, N days before due.
  let complianceCreated = 0;
  const lead = firm?.auto_compliance_days ?? 10;
  if (!dryRun && lead > 0) {
    const { data: cl } = await sb.from('clients').select('id, services, assigned_to').eq('status', 'active');
    const rows = complianceTasksDue(cl ?? [], today, lead);
    for (let i = 0; i < rows.length; i += 500) {
      const { data: created, error } = await sb.from('tasks')
        .upsert(rows.slice(i, i + 500), { onConflict: 'client_id,compliance_key', ignoreDuplicates: true })
        .select('id, category');
      if (error) throw new Error(`Compliance tasks failed: ${error.message}`);
      complianceCreated += created?.length ?? 0;
      const steps = (created ?? []).flatMap((t) => stepsFor(t.category).map((label, n) => ({ task_id: t.id, label, position: n + 1 })));
      if (steps.length) await sb.from('task_checklist').insert(steps);
    }
  }

  // 3. Reminders.
  const summary: JobSummary = { date: today, recurringCreated, complianceCreated, remindersEnabled: !!firm?.reminders_enabled, emailReady: emailConfigured(), whatsappReady: whatsappConfigured(), planned: 0, sent: 0, failed: 0, skipped: 0, details: [] };
  if (!firm?.reminders_enabled && !dryRun) return summary;

  const settings = {
    firmName: firm?.name ?? '',
    kinds: (firm?.reminder_kinds ?? []) as ReminderKind[],
    deadlineDays: firm?.reminder_deadline_days ?? 3,
    docAfterDays: firm?.reminder_doc_after_days ?? 7,
    repeatDays: firm?.reminder_repeat_days ?? 7,
    paymentGraceDays: firm?.reminder_payment_grace_days ?? 3,
  };
  const channels: string[] = firm?.reminder_channels ?? ['email'];

  const [clients, tasks, docs, invoices, log] = await Promise.all([
    sb.from('clients').select('id, name, contact_person, email, phone, reminders_opt_out, status').eq('status', 'active'),
    sb.from('tasks').select('client_id, title, period, due_date, status').eq('due_date', addDaysISO(today, settings.deadlineDays)).neq('status', 'done'),
    sb.from('documents').select('client_id, name, requested_on, status').eq('status', 'pending'),
    sb.from('invoice_balances').select('client_id, invoice_no, issue_date, due_date, balance, status').in('status', ['unpaid', 'partial']),
    sb.from('reminder_log').select('client_id, kind, sent_on, status').gte('sent_on', addDaysISO(today, -60)),
  ]);

  const plan = planReminders({
    today, settings,
    clients: clients.data ?? [], tasks: tasks.data ?? [], docs: docs.data ?? [], invoices: invoices.data ?? [], log: log.data ?? [],
  });
  summary.planned = plan.length;

  for (const p of plan) {
    for (const channel of channels) {
      let status: 'sent' | 'failed' | 'skipped' = 'skipped';
      let detail: string | undefined;
      if (channel === 'email') {
        if (!p.client.email) detail = 'Client has no email address.';
        else if (dryRun) detail = `Would email ${p.client.email}`;
        else {
          const r = await sendEmail(p.client.email, p.subject, p.body, firm?.email);
          status = r.ok ? 'sent' : 'failed';
          detail = r.ok ? p.client.email : r.error;
        }
      } else if (channel === 'whatsapp') {
        const phone = normalisePhone(p.client.phone);
        if (!phone) detail = 'Client has no valid mobile number.';
        else if (dryRun) detail = `Would WhatsApp +${phone}`;
        else {
          const r = await sendWhatsApp(phone, p.client.contact_person || p.client.name, p.oneLine);
          status = r.ok ? 'sent' : 'failed';
          detail = r.ok ? `+${phone}` : r.error;
        }
      }
      summary[status]++;
      summary.details.push({ client: p.client.name, kind: p.kind, channel, status, detail });
      if (!dryRun) {
        await sb.from('reminder_log').insert({ client_id: p.client.id, kind: p.kind, channel, sent_on: today, status, detail: detail ?? null });
      }
    }
  }
  return summary;
}
