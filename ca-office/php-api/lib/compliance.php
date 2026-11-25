<?php
/*
 * Statutory compliance calendar. Mirrors lib/compliance.ts in the web app;
 * tests/parity.php checks both produce identical results.
 * Standard statutory due dates; extensions must be applied by hand.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fy_label(int $y, int $m): string { $s = $m >= 4 ? $y : $y - 1; return sprintf('%d-%02d', $s, ($s + 1) % 100); }
function ay_label(int $fyStart): string { return sprintf('AY %d-%02d', $fyStart + 1, ($fyStart + 2) % 100); }
function prev_month(int $y, int $m): array { return $m === 1 ? [$y - 1, 12] : [$y, $m - 1]; }
function month_label(int $y, int $m): string { return MON[$m - 1] . '-' . $y; }
function prev_quarter_label(int $y, int $m): string { [$py, $pm] = prev_month($y, $m); return MON[$pm - 3] . '–' . MON[$pm - 1] . ' ' . $py; }
function fy_span(int $y): string { return sprintf('FY %d-%02d', $y - 1, $y % 100); }

function compliance_rules(): array {
    static $rules = null;
    if ($rules) return $rules;
    $QS = [1, 4, 7, 10];
    $prev = function (int $y, int $m, int $day): array { [$py, $pm] = prev_month($y, $m); return [$day, month_label($py, $pm)]; };
    $rules = [
        ['GSTR1', 'GST_MONTHLY', 'GST', 'GSTR-1', fn ($y, $m) => $prev($y, $m, 11)],
        ['GSTR3B', 'GST_MONTHLY', 'GST', 'GSTR-3B', fn ($y, $m) => $prev($y, $m, 20)],
        ['GSTR1Q', 'GST_QUARTERLY', 'GST', 'GSTR-1 (quarterly)', fn ($y, $m) => in_array($m, $QS, true) ? [13, prev_quarter_label($y, $m)] : null],
        ['GSTR3BQ', 'GST_QUARTERLY', 'GST', 'GSTR-3B (quarterly)', fn ($y, $m) => in_array($m, $QS, true) ? [22, prev_quarter_label($y, $m)] : null],
        ['PMT06', 'GST_QUARTERLY', 'GST', 'PMT-06 GST payment', fn ($y, $m) => in_array($m, $QS, true) ? null : $prev($y, $m, 25)],
        ['GSTR9', 'GST_MONTHLY', 'GST', 'GSTR-9 annual return', fn ($y, $m) => $m === 12 ? [31, fy_span($y)] : null],
        ['GSTR9Q', 'GST_QUARTERLY', 'GST', 'GSTR-9 annual return', fn ($y, $m) => $m === 12 ? [31, fy_span($y)] : null],
        ['TDSPAY', 'TDS', 'TDS', 'TDS/TCS deposit', fn ($y, $m) => $prev($y, $m, $m === 4 ? 30 : 7)],
        ['TDSRET', 'TDS', 'TDS', 'TDS return (24Q/26Q)', fn ($y, $m) => match ($m) {
            7 => [31, 'Q1 FY ' . fy_label($y, 4)], 10 => [31, 'Q2 FY ' . fy_label($y, 7)],
            1 => [31, 'Q3 FY ' . fy_label($y - 1, 10)], 5 => [31, 'Q4 FY ' . fy_label($y, 3)], default => null }],
        ['ADVTAX', 'ADVANCE_TAX', 'Income Tax', 'Advance tax instalment', function ($y, $m) {
            $pct = [6 => '15%', 9 => '45%', 12 => '75%', 3 => '100%'];
            return isset($pct[$m]) ? [15, $pct[$m] . ' · FY ' . fy_label($y, $m)] : null; }],
        ['ITR', 'ITR', 'Income Tax', 'ITR filing (non-audit)', fn ($y, $m) => $m === 7 ? [31, ay_label($y - 1)] : null],
        ['TAR', 'AUDIT', 'Audit', 'Tax audit report (3CA/3CB-3CD)', fn ($y, $m) => $m === 9 ? [30, ay_label($y - 1)] : null],
        ['ITRAUDIT', 'AUDIT', 'Income Tax', 'ITR filing (audit case)', fn ($y, $m) => $m === 10 ? [31, ay_label($y - 1)] : null],
        ['AOC4', 'ROC', 'ROC', 'AOC-4 financial statements', fn ($y, $m) => $m === 10 ? [30, fy_span($y)] : null],
        ['MGT7', 'ROC', 'ROC', 'MGT-7 annual return', fn ($y, $m) => $m === 11 ? [29, fy_span($y)] : null],
        ['LLP11', 'LLP', 'ROC', 'LLP Form 11 annual return', fn ($y, $m) => $m === 5 ? [30, fy_span($y)] : null],
        ['LLP8', 'LLP', 'ROC', 'LLP Form 8 statement of accounts', fn ($y, $m) => $m === 10 ? [30, fy_span($y)] : null],
        ['BOOKS', 'ACCOUNTING', 'Accounting', 'Monthly bookkeeping close', fn ($y, $m) => $prev($y, $m, 10)],
    ];
    return $rules;
}

/** All compliance items falling due in a calendar month, sorted by date then title. */
function due_items_for_month(int $y, int $m): array {
    $items = [];
    foreach (compliance_rules() as [$id, $svc, $cat, $title, $fn]) {
        $d = $fn($y, $m);
        if (!$d) continue;
        $items[] = ['key' => "$id:{$d[1]}", 'ruleId' => $id, 'service' => $svc, 'category' => $cat, 'title' => $title,
            'period' => $d[1], 'dueDate' => sprintf('%04d-%02d-%02d', $y, $m, $d[0])];
    }
    usort($items, fn ($a, $b) => strcmp($a['dueDate'], $b['dueDate']) ?: strcmp($a['title'], $b['title']));
    return $items;
}

/** Statutory tasks that should exist: due from today up to lead days ahead. */
function compliance_tasks_due(array $clients, string $today, int $lead): array {
    if ($lead <= 0) return [];
    $until = add_days($today, $lead);
    $months = [];
    for ($d = $today; $d <= $until; $d = add_days($d, 1)) $months[substr($d, 0, 7)] = true;
    $rows = [];
    foreach (array_keys($months) as $ym) {
        [$y, $m] = array_map('intval', explode('-', $ym));
        foreach (due_items_for_month($y, $m) as $it) {
            if ($it['dueDate'] < $today || $it['dueDate'] > $until) continue;
            foreach ($clients as $c) {
                if (!in_array($it['service'], $c['services'], true)) continue;
                $rows[] = ['client_id' => $c['id'], 'title' => $it['title'], 'category' => $it['category'], 'period' => $it['period'],
                    'due_date' => $it['dueDate'], 'assigned_to' => $c['assigned_to'], 'compliance_key' => $it['key']];
            }
        }
    }
    return $rows;
}

const STANDARD_STEPS = [
    'GST' => ['Collect sales & purchase data', 'Reconcile with GSTR-2B', 'Prepare return', 'Partner review', 'Client approval of tax payable', 'File return & save ARN', 'Send acknowledgement to client'],
    'TDS' => ['Collect payment & deduction details', 'Verify PAN of deductees', 'Prepare challan / return', 'Review', 'File & download FVU/acknowledgement', 'Issue TDS certificates'],
    'Income Tax' => ['Collect Form 16 / AIS / 26AS', 'Collect investment & deduction proofs', 'Compute income', 'Partner review', 'Client approval', 'File ITR & e-verify', 'Send ITR-V to client'],
    'Audit' => ['Engagement letter', 'Collect trial balance & ledgers', 'Vouching & verification', 'Prepare audit report', 'Partner review', 'Sign & upload (UDIN)', 'Send report to client'],
    'ROC' => ['Collect board resolutions & financials', 'Prepare form', 'Director DSC signatures', 'Professional certification', 'File on MCA & pay fees', 'Save SRN challan'],
    'Accounting' => ['Collect bank statements & bills', 'Post entries', 'Bank reconciliation', 'Review ledgers', 'Share MIS with client'],
    'Advisory' => ['Understand requirement', 'Research', 'Draft opinion', 'Partner review', 'Send to client'],
    'other' => ['Collect information', 'Prepare', 'Review', 'Complete & inform client'],
];
function steps_for(string $category): array { return STANDARD_STEPS[$category] ?? STANDARD_STEPS['other']; }

/** Inserts tasks (skipping existing compliance keys) and gives each new one its checklist. Returns how many were created. */
function insert_tasks_with_checklists(array $rows, ?callable $stepsOf = null): int {
    $pdo = db();
    $ins = $pdo->prepare('INSERT INTO tasks (id, client_id, title, category, period, due_date, assigned_to, fee, compliance_key, created_by)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL) ON DUPLICATE KEY UPDATE id = id');
    $exists = $pdo->prepare('SELECT 1 FROM tasks WHERE id = ?');
    $step = $pdo->prepare('INSERT INTO task_checklist (id, task_id, label, position) VALUES (?, ?, ?, ?)');
    $n = 0;
    foreach ($rows as $r) {
        $id = uuid();
        $ins->execute([$id, $r['client_id'], $r['title'], $r['category'], $r['period'], $r['due_date'], $r['assigned_to'], $r['fee'] ?? 0, $r['compliance_key']]);
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) continue;
        $n++;
        $labels = $stepsOf ? $stepsOf($r) : steps_for($r['category']);
        foreach (array_values($labels) as $i => $label) $step->execute([uuid(), $id, $label, $i + 1]);
    }
    return $n;
}

function create_due_compliance_tasks(string $today, int $lead): int {
    $clients = [];
    foreach (db()->query("SELECT id, services, assigned_to FROM clients WHERE status = 'active'") as $c) {
        $c['services'] = json_decode((string) $c['services'], true) ?: [];
        $clients[] = $c;
    }
    return insert_tasks_with_checklists(compliance_tasks_due($clients, $today, $lead));
}

// ---- Recurring task templates ----

function recurring_next(string $d, string $freq, int $anchor): string {
    if ($freq === 'weekly') return add_days($d, 7);
    $months = ['monthly' => 1, 'quarterly' => 3, 'half_yearly' => 6][$freq] ?? 12;
    $base = (new DateTimeImmutable(substr($d, 0, 7) . '-01'))->modify("+$months months");
    $last = (int) $base->format('t');
    return $base->format('Y-m-') . sprintf('%02d', min($anchor, $last));
}

function recurring_period(string $d, string $freq, string $mode): ?string {
    if ($mode === 'none') return null;
    $first = new DateTimeImmutable(substr($d, 0, 7) . '-01');
    $back = fn (int $n) => $first->modify("-$n months");
    if ($freq === 'weekly') return 'Week of ' . (new DateTimeImmutable($d))->format('d M Y');
    if ($mode === 'current') return $first->format('M-Y');
    return match ($freq) {
        'monthly' => $back(1)->format('M-Y'),
        'quarterly' => $back(3)->format('M') . '–' . $back(1)->format('M Y'),
        'half_yearly' => $back(6)->format('M') . '–' . $back(1)->format('M Y'),
        default => 'Year to ' . $back(1)->format('M Y'),
    };
}

/** Creates tasks for every active template due within lead days, then rolls each template forward. */
function generate_recurring_tasks(int $lead): int {
    $pdo = db();
    $horizon = add_days(today(), $lead);
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT r.*, c.assigned_to AS client_manager FROM recurring_tasks r JOIN clients c ON c.id = r.client_id
                             WHERE r.active = 1 AND r.next_due <= ? FOR UPDATE');
        $st->execute([$horizon]);
        $count = 0;
        $upd = $pdo->prepare('UPDATE recurring_tasks SET next_due = ? WHERE id = ?');
        foreach ($st->fetchAll() as $r) {
            $steps = json_decode((string) $r['checklist'], true) ?: [];
            $due = $r['next_due'];
            $rows = [];
            for ($guard = 0; $due <= $horizon && $guard < 400; $guard++) {
                $rows[] = ['client_id' => $r['client_id'], 'title' => $r['title'], 'category' => $r['category'],
                    'period' => recurring_period($due, $r['frequency'], $r['period_mode']), 'due_date' => $due,
                    'assigned_to' => $r['assigned_to'] ?? $r['client_manager'], 'fee' => $r['fee'], 'compliance_key' => "REC:{$r['id']}:$due"];
                $due = recurring_next($due, $r['frequency'], (int) $r['anchor_day']);
            }
            $count += insert_tasks_with_checklists($rows, fn () => $steps);
            $upd->execute([$due, $r['id']]);
        }
        $pdo->commit();
        return $count;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
