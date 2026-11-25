<?php
/* Decides which clients get which automatic reminder. Mirrors lib/reminders.ts. */

function fmt_date(string $iso): string { return substr($iso, 8, 2) . ' ' . MON[(int) substr($iso, 5, 2) - 1] . ' ' . substr($iso, 0, 4); }

function inr(float $n): string {
    // Indian digit grouping, e.g. ₹12,34,567.5
    $neg = $n < 0; $n = abs($n);
    $int = (string) floor($n);
    $dec = round($n - floor($n), 2);
    $last3 = substr($int, -3);
    $rest = substr($int, 0, -3);
    $grouped = $rest !== '' ? preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest) . ',' . $last3 : $last3;
    $frac = $dec > 0 ? rtrim(rtrim(substr(sprintf('%.2f', $dec), 1), '0'), '.') : '';
    return ($neg ? '-' : '') . '₹' . $grouped . $frac;
}

/**
 * @param array $s settings: firmName, kinds[], deadlineDays, docAfterDays, repeatDays, paymentGraceDays
 */
function plan_reminders(string $today, array $s, array $clients, array $tasks, array $docs, array $invoices, array $log): array {
    $eligible = [];
    foreach ($clients as $c) if ($c['status'] === 'active' && empty($c['reminders_opt_out'])) $eligible[$c['id']] = $c;

    $recently = function (string $cid, string $kind, int $within) use ($log, $today): bool {
        $last = null;
        foreach ($log as $l) if ($l['client_id'] === $cid && $l['kind'] === $kind && $l['status'] === 'sent' && ($last === null || $l['sent_on'] > $last)) $last = $l['sent_on'];
        return $last !== null && days_between($last, $today) < $within;
    };
    $group = function (array $rows) use ($eligible): array {
        $g = [];
        foreach ($rows as $r) if (isset($eligible[$r['client_id']])) $g[$r['client_id']][] = $r;
        return $g;
    };
    $greet = fn ($c) => 'Dear ' . ($c['contact_person'] ?: $c['name']) . ',';
    $sign = "Regards,\n" . $s['firmName'];
    $bullets = fn (array $items) => implode("\n", array_map(fn ($i) => "• $i", $items));
    $out = [];

    if (in_array('deadline', $s['kinds'], true)) {
        $target = add_days($today, (int) $s['deadlineDays']);
        $due = $group(array_filter($tasks, fn ($t) => $t['status'] !== 'done' && $t['due_date'] === $target));
        foreach ($due as $cid => $ts) {
            if ($recently($cid, 'deadline', 1)) continue;
            $c = $eligible[$cid];
            $items = array_map(fn ($t) => $t['title'] . ($t['period'] ? " ({$t['period']})" : '') . ' – due ' . fmt_date($t['due_date']), $ts);
            $n = (int) $s['deadlineDays'];
            $out[] = ['client' => $c, 'kind' => 'deadline', 'items' => $items,
                'subject' => 'Upcoming due date: ' . implode(', ', array_column($ts, 'title')),
                'body' => $greet($c) . "\n\nThe following filing" . (count($items) > 1 ? 's are' : ' is') . " due in $n day" . ($n === 1 ? '' : 's') . ":\n" . $bullets($items)
                    . "\n\nIf any information is still pending from your side, please share it today so we can file on time.\n\n$sign",
                'oneLine' => implode('; ', $items) . '. Please share any pending information today.'];
        }
    }

    if (in_array('documents', $s['kinds'], true)) {
        $pending = $group(array_filter($docs, fn ($d) => $d['status'] === 'pending' && days_between($d['requested_on'], $today) >= (int) $s['docAfterDays']));
        foreach ($pending as $cid => $ds) {
            if ($recently($cid, 'documents', (int) $s['repeatDays'])) continue;
            $c = $eligible[$cid];
            $items = array_map(fn ($d) => "{$d['name']} (requested " . fmt_date($d['requested_on']) . ')', $ds);
            $out[] = ['client' => $c, 'kind' => 'documents', 'items' => $items,
                'subject' => 'Documents pending: ' . count($ds) . ' item' . (count($ds) > 1 ? 's' : ''),
                'body' => $greet($c) . "\n\nGentle reminder: we are still awaiting the following:\n" . $bullets($items)
                    . "\n\nKindly share them at the earliest so we can complete your work on time.\n\n$sign",
                'oneLine' => 'We are still awaiting: ' . implode('; ', array_column($ds, 'name')) . '.'];
        }
    }

    if (in_array('payment', $s['kinds'], true)) {
        $overdue = $group(array_filter($invoices, fn ($i) => in_array($i['status'], ['unpaid', 'partial'], true) && (float) $i['balance'] > 0
            && $i['due_date'] && days_between($i['due_date'], $today) >= (int) $s['paymentGraceDays']));
        foreach ($overdue as $cid => $inv) {
            if ($recently($cid, 'payment', (int) $s['repeatDays'])) continue;
            $c = $eligible[$cid];
            $total = array_sum(array_map(fn ($i) => (float) $i['balance'], $inv));
            $items = array_map(fn ($i) => "{$i['invoice_no']} dated " . fmt_date($i['issue_date']) . ': ' . inr((float) $i['balance']) . ' (due ' . fmt_date($i['due_date']) . ')', $inv);
            $out[] = ['client' => $c, 'kind' => 'payment', 'items' => $items,
                'subject' => 'Payment reminder: ' . inr($total) . ' outstanding',
                'body' => $greet($c) . "\n\nThis is a friendly reminder that the following invoice" . (count($inv) > 1 ? 's are' : ' is') . " pending:\n" . $bullets($items)
                    . "\n\nTotal outstanding: " . inr($total) . ". Please ignore this if already paid.\n\n$sign",
                'oneLine' => inr($total) . ' outstanding on ' . implode(', ', array_column($inv, 'invoice_no')) . '. Please ignore if already paid.'];
        }
    }
    return $out;
}
