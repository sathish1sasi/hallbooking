import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReminders, type ReminderSettings, type RClient } from './reminders.ts';

const settings: ReminderSettings = { firmName: 'Test & Co', kinds: ['deadline', 'documents', 'payment'], deadlineDays: 3, docAfterDays: 7, repeatDays: 7, paymentGraceDays: 3 };
const c = (id: string, extra: Partial<RClient> = {}): RClient => ({ id, name: id.toUpperCase(), contact_person: null, email: `${id}@x.in`, phone: null, reminders_opt_out: false, status: 'active', ...extra });
const base = { today: '2026-11-24', settings, clients: [c('a'), c('b'), c('optout', { reminders_opt_out: true })], tasks: [], docs: [], invoices: [], log: [] };

test('deadline reminder only for open tasks due exactly N days ahead, grouped per client', () => {
  const r = planReminders({ ...base, tasks: [
    { client_id: 'a', title: 'GSTR-3B', period: 'Nov-2026', due_date: '2026-11-27', status: 'todo' },
    { client_id: 'a', title: 'PMT-06', period: null, due_date: '2026-11-27', status: 'in_progress' },
    { client_id: 'a', title: 'Done one', period: null, due_date: '2026-11-27', status: 'done' },
    { client_id: 'b', title: 'Later', period: null, due_date: '2026-11-28', status: 'todo' },
    { client_id: 'optout', title: 'X', period: null, due_date: '2026-11-27', status: 'todo' },
  ] });
  assert.equal(r.length, 1);
  assert.equal(r[0].client.id, 'a');
  assert.equal(r[0].items.length, 2);
  assert.match(r[0].body, /due in 3 days/);
  assert.ok(!r[0].oneLine.includes('\n'));
});

test('documents chased after N days and not again within the repeat window', () => {
  const docs = [{ client_id: 'a', name: 'Bank statement', requested_on: '2026-11-10', status: 'pending' },
                { client_id: 'b', name: 'Form 16', requested_on: '2026-11-20', status: 'pending' }];
  assert.deepEqual(planReminders({ ...base, docs }).map((x) => x.client.id), ['a']);
  const log = [{ client_id: 'a', kind: 'documents' as const, sent_on: '2026-11-20', status: 'sent' }];
  assert.equal(planReminders({ ...base, docs, log }).length, 0);
  const oldLog = [{ client_id: 'a', kind: 'documents' as const, sent_on: '2026-11-17', status: 'sent' }];
  assert.equal(planReminders({ ...base, docs, log: oldLog }).length, 1);
  const failed = [{ client_id: 'a', kind: 'documents' as const, sent_on: '2026-11-23', status: 'failed' }];
  assert.equal(planReminders({ ...base, docs, log: failed }).length, 1, 'a failed send is retried');
});

test('payment reminders respect grace days and sum the balance', () => {
  const invoices = [
    { client_id: 'a', invoice_no: 'INV/1', issue_date: '2026-10-01', due_date: '2026-11-15', balance: 1000, status: 'partial' },
    { client_id: 'a', invoice_no: 'INV/2', issue_date: '2026-10-05', due_date: '2026-11-20', balance: 2540, status: 'unpaid' },
    { client_id: 'b', invoice_no: 'INV/3', issue_date: '2026-11-01', due_date: '2026-11-23', balance: 500, status: 'unpaid' },
    { client_id: 'b', invoice_no: 'INV/4', issue_date: '2026-09-01', due_date: '2026-09-15', balance: 0, status: 'paid' },
  ];
  const r = planReminders({ ...base, invoices });
  assert.equal(r.length, 1);
  assert.match(r[0].subject, /3,540/);
});

test('kinds can be switched off', () => {
  const docs = [{ client_id: 'a', name: 'x', requested_on: '2026-11-01', status: 'pending' }];
  assert.equal(planReminders({ ...base, docs, settings: { ...settings, kinds: ['payment'] } }).length, 0);
});
