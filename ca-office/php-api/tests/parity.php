<?php
// Prints compliance items and reminder plans as JSON so they can be compared with the TypeScript version.
require dirname(__DIR__) . '/lib/bootstrap.php';
date_default_timezone_set('Asia/Kolkata');
$in = json_decode(file_get_contents($argv[1]), true);
$items = [];
for ($y = 2024; $y <= 2031; $y++) for ($m = 1; $m <= 12; $m++) $items["$y-$m"] = due_items_for_month($y, $m);
$auto = [];
foreach ($in['autoDates'] as $d) $auto[$d] = compliance_tasks_due($in['clients'], $d, 10);
$plans = [];
foreach ($in['scenarios'] as $i => $sc) {
    $p = plan_reminders($sc['today'], $sc['settings'], $sc['clients'], $sc['tasks'], $sc['docs'], $sc['invoices'], $sc['log']);
    $plans[] = array_map(fn ($r) => ['client' => $r['client']['id'], 'kind' => $r['kind'], 'subject' => $r['subject'], 'body' => $r['body'], 'oneLine' => $r['oneLine'], 'items' => $r['items']], $p);
}
$rec = [];
foreach ([['2026-01-31', 'monthly', 31], ['2026-02-28', 'monthly', 31], ['2026-11-10', 'quarterly', 10], ['2026-11-24', 'weekly', 1], ['2026-08-31', 'half_yearly', 31], ['2027-02-15', 'yearly', 15]] as [$d, $f, $a]) {
    $rec[] = [recurring_next($d, $f, $a), recurring_period($d, $f, 'previous'), recurring_period($d, $f, 'current')];
}
echo json_encode(['items' => $items, 'auto' => $auto, 'plans' => $plans, 'rec' => $rec, 'inr' => array_map('inr', [0, 5, 3540, 1234.5, 125000.75, 12500000, 99.99])], JSON_UNESCAPED_UNICODE);
