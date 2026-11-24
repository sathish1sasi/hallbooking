// Statutory compliance calendar for Indian CA practices.
// Dates are the standard statutory due dates; the government frequently
// extends them, so always confirm against CBDT/CBIC/MCA notifications.

export type ServiceCode =
  | 'GST_MONTHLY'
  | 'GST_QUARTERLY'
  | 'TDS'
  | 'ITR'
  | 'AUDIT'
  | 'ADVANCE_TAX'
  | 'ROC'
  | 'LLP'
  | 'ACCOUNTING';

export const SERVICES: { code: ServiceCode; label: string }[] = [
  { code: 'GST_MONTHLY', label: 'GST (monthly filer)' },
  { code: 'GST_QUARTERLY', label: 'GST (QRMP quarterly)' },
  { code: 'TDS', label: 'TDS' },
  { code: 'ITR', label: 'Income tax return' },
  { code: 'AUDIT', label: 'Tax audit' },
  { code: 'ADVANCE_TAX', label: 'Advance tax' },
  { code: 'ROC', label: 'ROC / company' },
  { code: 'LLP', label: 'LLP compliance' },
  { code: 'ACCOUNTING', label: 'Bookkeeping' },
];

export interface DueItem {
  /** Stable key, unique per client — used to avoid duplicate task generation. */
  key: string;
  ruleId: string;
  service: ServiceCode;
  category: string;
  title: string;
  period: string;
  dueDate: string; // YYYY-MM-DD
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Financial year label (Apr–Mar) containing the given month, e.g. 2026-27. */
export function fyLabel(year: number, month: number): string {
  const start = month >= 4 ? year : year - 1;
  return `${start}-${pad((start + 1) % 100)}`;
}

/** Assessment year for a financial year that started in `fyStart`. */
function ayLabel(fyStart: number): string {
  return `AY ${fyStart + 1}-${pad((fyStart + 2) % 100)}`;
}

function prevMonth(year: number, month: number): { y: number; m: number } {
  return month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
}

function monthLabel(y: number, m: number) {
  return `${MONTHS[m - 1]}-${y}`;
}

/** Quarter that ended just before `month` (for months Jan/Apr/Jul/Oct). */
function prevQuarterLabel(year: number, month: number): string {
  const { y, m } = prevMonth(year, month); // last month of the quarter
  const startM = m - 2;
  return `${MONTHS[startM - 1]}–${MONTHS[m - 1]} ${y}`;
}

type Rule = {
  id: string;
  service: ServiceCode;
  category: string;
  title: string;
  /** Return due day + period label if the rule falls due in this month. */
  due(year: number, month: number): { day: number; period: string } | null;
};

const QUARTER_START = [1, 4, 7, 10];

const RULES: Rule[] = [
  // ---- GST ----
  {
    id: 'GSTR1', service: 'GST_MONTHLY', category: 'GST', title: 'GSTR-1',
    due: (y, m) => { const p = prevMonth(y, m); return { day: 11, period: monthLabel(p.y, p.m) }; },
  },
  {
    id: 'GSTR3B', service: 'GST_MONTHLY', category: 'GST', title: 'GSTR-3B',
    due: (y, m) => { const p = prevMonth(y, m); return { day: 20, period: monthLabel(p.y, p.m) }; },
  },
  {
    id: 'GSTR1Q', service: 'GST_QUARTERLY', category: 'GST', title: 'GSTR-1 (quarterly)',
    due: (y, m) => (QUARTER_START.includes(m) ? { day: 13, period: prevQuarterLabel(y, m) } : null),
  },
  {
    id: 'GSTR3BQ', service: 'GST_QUARTERLY', category: 'GST', title: 'GSTR-3B (quarterly)',
    due: (y, m) => (QUARTER_START.includes(m) ? { day: 22, period: prevQuarterLabel(y, m) } : null),
  },
  {
    id: 'PMT06', service: 'GST_QUARTERLY', category: 'GST', title: 'PMT-06 GST payment',
    due: (y, m) => {
      if (QUARTER_START.includes(m)) return null;
      const p = prevMonth(y, m);
      return { day: 25, period: monthLabel(p.y, p.m) };
    },
  },
  {
    id: 'GSTR9', service: 'GST_MONTHLY', category: 'GST', title: 'GSTR-9 annual return',
    due: (y, m) => (m === 12 ? { day: 31, period: `FY ${y - 1}-${pad(y % 100)}` } : null),
  },
  {
    id: 'GSTR9Q', service: 'GST_QUARTERLY', category: 'GST', title: 'GSTR-9 annual return',
    due: (y, m) => (m === 12 ? { day: 31, period: `FY ${y - 1}-${pad(y % 100)}` } : null),
  },

  // ---- TDS ----
  {
    id: 'TDSPAY', service: 'TDS', category: 'TDS', title: 'TDS/TCS deposit',
    due: (y, m) => {
      const p = prevMonth(y, m);
      return { day: m === 4 ? 30 : 7, period: monthLabel(p.y, p.m) };
    },
  },
  {
    id: 'TDSRET', service: 'TDS', category: 'TDS', title: 'TDS return (24Q/26Q)',
    due: (y, m) => {
      if (m === 7) return { day: 31, period: `Q1 FY ${fyLabel(y, 4)}` };
      if (m === 10) return { day: 31, period: `Q2 FY ${fyLabel(y, 7)}` };
      if (m === 1) return { day: 31, period: `Q3 FY ${fyLabel(y - 1, 10)}` };
      if (m === 5) return { day: 31, period: `Q4 FY ${fyLabel(y, 3)}` };
      return null;
    },
  },

  // ---- Income tax ----
  {
    id: 'ADVTAX', service: 'ADVANCE_TAX', category: 'Income Tax', title: 'Advance tax instalment',
    due: (y, m) => {
      const pct: Record<number, string> = { 6: '15%', 9: '45%', 12: '75%', 3: '100%' };
      return pct[m] ? { day: 15, period: `${pct[m]} · FY ${fyLabel(y, m)}` } : null;
    },
  },
  {
    id: 'ITR', service: 'ITR', category: 'Income Tax', title: 'ITR filing (non-audit)',
    due: (y, m) => (m === 7 ? { day: 31, period: ayLabel(y - 1) } : null),
  },
  {
    id: 'TAR', service: 'AUDIT', category: 'Audit', title: 'Tax audit report (3CA/3CB-3CD)',
    due: (y, m) => (m === 9 ? { day: 30, period: ayLabel(y - 1) } : null),
  },
  {
    id: 'ITRAUDIT', service: 'AUDIT', category: 'Income Tax', title: 'ITR filing (audit case)',
    due: (y, m) => (m === 10 ? { day: 31, period: ayLabel(y - 1) } : null),
  },

  // ---- ROC / MCA ----
  {
    id: 'AOC4', service: 'ROC', category: 'ROC', title: 'AOC-4 financial statements',
    due: (y, m) => (m === 10 ? { day: 30, period: `FY ${y - 1}-${pad(y % 100)}` } : null),
  },
  {
    id: 'MGT7', service: 'ROC', category: 'ROC', title: 'MGT-7 annual return',
    due: (y, m) => (m === 11 ? { day: 29, period: `FY ${y - 1}-${pad(y % 100)}` } : null),
  },
  {
    id: 'LLP11', service: 'LLP', category: 'ROC', title: 'LLP Form 11 annual return',
    due: (y, m) => (m === 5 ? { day: 30, period: `FY ${y - 1}-${pad(y % 100)}` } : null),
  },
  {
    id: 'LLP8', service: 'LLP', category: 'ROC', title: 'LLP Form 8 statement of accounts',
    due: (y, m) => (m === 10 ? { day: 30, period: `FY ${y - 1}-${pad(y % 100)}` } : null),
  },

  // ---- Internal ----
  {
    id: 'BOOKS', service: 'ACCOUNTING', category: 'Accounting', title: 'Monthly bookkeeping close',
    due: (y, m) => { const p = prevMonth(y, m); return { day: 10, period: monthLabel(p.y, p.m) }; },
  },
];

/** All compliance items falling due in the given calendar month (1–12). */
export function dueItemsForMonth(year: number, month: number): DueItem[] {
  const items: DueItem[] = [];
  for (const r of RULES) {
    const d = r.due(year, month);
    if (!d) continue;
    items.push({
      key: `${r.id}:${d.period}`,
      ruleId: r.id,
      service: r.service,
      category: r.category,
      title: r.title,
      period: d.period,
      dueDate: iso(year, month, d.day),
    });
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}

export const TASK_CATEGORIES = ['GST', 'TDS', 'Income Tax', 'Audit', 'ROC', 'Accounting', 'Advisory', 'other'];
