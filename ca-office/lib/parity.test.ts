// Checks that the PHP backend (used on cPanel) makes the same decisions as this TypeScript code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dueItemsForMonth, complianceTasksDue } from './compliance.ts';
import { planReminders, type ReminderSettings } from './reminders.ts';

const clients = [
  { id: 'a', services: ['GST_MONTHLY', 'TDS', 'ROC', 'ADVANCE_TAX', 'ACCOUNTING'], assigned_to: 'u1' },
  { id: 'b', services: ['GST_QUARTERLY', 'ITR', 'AUDIT', 'LLP'], assigned_to: null },
];
const autoDates = ['2026-01-25', '2026-03-28', '2026-06-30', '2026-07-25', '2026-09-25', '2026-10-25', '2026-11-24', '2026-12-25', '2027-04-25'];
const S: ReminderSettings = { firmName: 'Venkatesh & Associates', kinds: ['deadline', 'documents', 'payment'], deadlineDays: 3, docAfterDays: 7, repeatDays: 7, paymentGraceDays: 3 };
const rc = (id: string, x = {}) => ({ id, name: id.toUpperCase() + ' Pvt Ltd', contact_person: id === 'a' ? 'Mr Rao' : null, email: `${id}@x.in`, phone: null, reminders_opt_out: false, status: 'active', ...x });
const scenarios = [
  { today: '2026-11-24', settings: S, clients: [rc('a'), rc('b'), rc('c', { reminders_opt_out: true })],
    tasks: [{ client_id: 'a', title: 'GSTR-3B', period: 'Oct-2026', due_date: '2026-11-27', status: 'todo' }, { client_id: 'a', title: 'PMT-06', period: null, due_date: '2026-11-27', status: 'review' }, { client_id: 'c', title: 'X', period: null, due_date: '2026-11-27', status: 'todo' }],
    docs: [{ client_id: 'a', name: 'Bank statement', requested_on: '2026-11-10', status: 'pending' }, { client_id: 'b', name: 'Form 16', requested_on: '2026-11-01', status: 'pending' }, { client_id: 'b', name: 'Rent receipts', requested_on: '2026-11-20', status: 'pending' }],
    invoices: [{ client_id: 'a', invoice_no: 'INV/1', issue_date: '2026-10-01', due_date: '2026-11-15', balance: 1000, status: 'partial' }, { client_id: 'a', invoice_no: 'INV/2', issue_date: '2026-10-05', due_date: '2026-11-20', balance: 125000.75, status: 'unpaid' }],
    log: [{ client_id: 'b', kind: 'documents' as const, sent_on: '2026-11-20', status: 'sent' }] },
  { today: '2026-12-01', settings: { ...S, deadlineDays: 1, kinds: ['deadline', 'payment'] as const }, clients: [rc('a')],
    tasks: [{ client_id: 'a', title: 'TDS/TCS deposit', period: 'Nov-2026', due_date: '2026-12-02', status: 'todo' }], docs: [],
    invoices: [{ client_id: 'a', invoice_no: 'INV/9', issue_date: '2026-11-01', due_date: '2026-11-28', balance: 5, status: 'unpaid' }], log: [] },
];

test('PHP and TypeScript give identical compliance dates, reminders and money formats', () => {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  const file = join(dir, 'in.json');
  writeFileSync(file, JSON.stringify({ clients, autoDates, scenarios }));
  const php = JSON.parse(execFileSync('php', ['php-api/tests/parity.php', file], { encoding: 'utf8' }));

  for (let y = 2024; y <= 2031; y++) for (let m = 1; m <= 12; m++) {
    assert.deepEqual(php.items[`${y}-${m}`], dueItemsForMonth(y, m), `due items ${y}-${m}`);
  }
  for (const d of autoDates) assert.deepEqual(php.auto[d], complianceTasksDue(clients, d, 10), `auto-create on ${d}`);
  scenarios.forEach((sc, i) => {
    const ts = planReminders(sc as never).map((r) => ({ client: r.client.id, kind: r.kind, subject: r.subject, body: r.body, oneLine: r.oneLine, items: r.items }));
    assert.deepEqual(php.plans[i], ts, `reminder scenario ${i}`);
  });
  const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  assert.deepEqual(php.inr, [0, 5, 3540, 1234.5, 125000.75, 12500000, 99.99].map(inr));
  assert.deepEqual(php.rec, [
    ['2026-02-28', 'Dec-2025', 'Jan-2026'], ['2026-03-31', 'Jan-2026', 'Feb-2026'], ['2027-02-10', 'Aug–Oct 2026', 'Nov-2026'],
    ['2026-12-01', 'Week of 24 Nov 2026', 'Week of 24 Nov 2026'], ['2027-02-28', 'Feb–Jul 2026', 'Aug-2026'], ['2028-02-15', 'Year to Jan 2027', 'Feb-2027'],
  ]);
});
