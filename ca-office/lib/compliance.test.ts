import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueItemsForMonth, fyLabel } from './compliance.ts';

const find = (items: ReturnType<typeof dueItemsForMonth>, id: string) => items.find((i) => i.ruleId === id);

test('fyLabel splits at April', () => {
  assert.equal(fyLabel(2026, 3), '2025-26');
  assert.equal(fyLabel(2026, 4), '2026-27');
  assert.equal(fyLabel(2099, 12), '2099-00');
});

test('monthly GST returns are for the previous month', () => {
  const jan = dueItemsForMonth(2027, 1);
  assert.deepEqual(
    { d: find(jan, 'GSTR1')!.dueDate, p: find(jan, 'GSTR1')!.period },
    { d: '2027-01-11', p: 'Dec-2026' },
  );
  assert.equal(find(jan, 'GSTR3B')!.dueDate, '2027-01-20');
});

test('QRMP returns only in the month after a quarter, PMT-06 otherwise', () => {
  const oct = dueItemsForMonth(2026, 10);
  assert.equal(find(oct, 'GSTR1Q')!.period, 'Jul–Sep 2026');
  assert.equal(find(oct, 'PMT06'), undefined);
  const nov = dueItemsForMonth(2026, 11);
  assert.equal(find(nov, 'GSTR1Q'), undefined);
  assert.equal(find(nov, 'PMT06')!.dueDate, '2026-11-25');
});

test('TDS deposit for March is due 30 April', () => {
  assert.equal(find(dueItemsForMonth(2027, 4), 'TDSPAY')!.dueDate, '2027-04-30');
  assert.equal(find(dueItemsForMonth(2027, 5), 'TDSPAY')!.dueDate, '2027-05-07');
});

test('TDS return quarters map to the right FY', () => {
  assert.equal(find(dueItemsForMonth(2027, 1), 'TDSRET')!.period, 'Q3 FY 2026-27');
  assert.equal(find(dueItemsForMonth(2027, 5), 'TDSRET')!.period, 'Q4 FY 2026-27');
  assert.equal(find(dueItemsForMonth(2026, 7), 'TDSRET')!.period, 'Q1 FY 2026-27');
});

test('annual income tax dates use the right assessment year', () => {
  assert.equal(find(dueItemsForMonth(2027, 7), 'ITR')!.period, 'AY 2027-28');
  assert.equal(find(dueItemsForMonth(2027, 10), 'ITRAUDIT')!.dueDate, '2027-10-31');
  assert.equal(find(dueItemsForMonth(2027, 3), 'ADVTAX')!.period, '100% · FY 2026-27');
});

test('keys are unique within a month and items are sorted by date', () => {
  for (let m = 1; m <= 12; m++) {
    const items = dueItemsForMonth(2026, m);
    const keys = items.map((i) => i.service + i.key);
    assert.equal(new Set(keys).size, keys.length);
    const dates = items.map((i) => i.dueDate);
    assert.deepEqual(dates, [...dates].sort());
  }
});

import { amountInWords, validGSTIN, validPAN } from './format.ts';

test('amount in words uses lakh/crore', () => {
  assert.equal(amountInWords(3540), 'Rupees Three Thousand Five Hundred Forty Only');
  assert.equal(amountInWords(12500000.5), 'Rupees One Crore Twenty Five Lakh and Fifty Paise Only');
});

test('PAN / GSTIN validation', () => {
  assert.ok(validPAN('ABCDE1234F'));
  assert.ok(!validPAN('ABCD1234F'));
  assert.ok(validGSTIN('27ABCDE1234F1Z5'));
  assert.ok(!validGSTIN('27ABCDE1234F1X5'));
});

import { complianceTasksDue, gstReturnsForPeriod, fyMonths } from './compliance.ts';

test('auto-creation picks items due within the lead window only', () => {
  const clients = [
    { id: 'm', services: ['GST_MONTHLY', 'TDS'], assigned_to: 'u1' },
    { id: 'q', services: ['GST_QUARTERLY'], assigned_to: null },
  ];
  const rows = complianceTasksDue(clients, '2026-12-01', 10);
  const keys = rows.map((r) => `${r.client_id}|${r.compliance_key}|${r.due_date}`).sort();
  assert.deepEqual(keys, ['m|TDSPAY:Nov-2026|2026-12-07', 'm|GSTR1:Nov-2026|2026-12-11'].sort());
  assert.equal(rows.find((r) => r.compliance_key.startsWith('GSTR1'))!.assigned_to, 'u1');
  // spans into next month
  const jan = complianceTasksDue(clients, '2026-12-28', 10).map((r) => r.compliance_key);
  assert.ok(jan.includes('GSTR9:FY 2025-26'));
  assert.ok(jan.includes('TDSPAY:Dec-2026'));
  assert.deepEqual(complianceTasksDue(clients, '2026-12-01', 0), []);
});

test('GST returns per period: monthly vs QRMP', () => {
  assert.deepEqual(gstReturnsForPeriod(2026, 10, false).map((c) => [c.key, c.dueDate]), [['GSTR1:Oct-2026', '2026-11-11'], ['GSTR3B:Oct-2026', '2026-11-20']]);
  assert.deepEqual(gstReturnsForPeriod(2026, 12, false).map((c) => c.key), ['GSTR1:Dec-2026', 'GSTR3B:Dec-2026']);
  assert.deepEqual(gstReturnsForPeriod(2026, 9, true).map((c) => c.key), ['GSTR1Q:Jul–Sep 2026', 'GSTR3BQ:Jul–Sep 2026']);
  assert.deepEqual(gstReturnsForPeriod(2026, 10, true).map((c) => [c.key, c.label]), [['PMT06:Oct-2026', 'PMT']]);
  assert.deepEqual(gstReturnsForPeriod(2027, 3, true).map((c) => c.dueDate), ['2027-04-13', '2027-04-22']);
});

test('financial year months run Apr to Mar', () => {
  const m = fyMonths(2026);
  assert.deepEqual([m[0], m[8], m[9], m[11]], [{ y: 2026, m: 4 }, { y: 2026, m: 12 }, { y: 2027, m: 1 }, { y: 2027, m: 3 }]);
});
