<?php
/* The daily job: recurring tasks, statutory tasks, reminders. Run by cron.php (and "Send now"). */

function run_daily_job(bool $dryRun = false): array {
    $pdo = db();
    $today = today();
    $firm = $pdo->query('SELECT * FROM firm_settings WHERE id = 1')->fetch() ?: [];

    $recurring = $dryRun ? 0 : generate_recurring_tasks(7);
    $lead = (int) ($firm['auto_compliance_days'] ?? 10);
    $compliance = (!$dryRun && $lead > 0) ? create_due_compliance_tasks($today, $lead) : 0;

    $summary = ['date' => $today, 'recurringCreated' => $recurring, 'complianceCreated' => $compliance,
        'remindersEnabled' => (bool) ($firm['reminders_enabled'] ?? false), 'emailReady' => email_configured(),
        'whatsappReady' => whatsapp_configured(), 'planned' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0, 'details' => []];
    if (empty($firm['reminders_enabled']) && !$dryRun) return $summary;

    $settings = [
        'firmName' => $firm['name'] ?? '',
        'kinds' => json_decode((string) ($firm['reminder_kinds'] ?? '[]'), true) ?: [],
        'deadlineDays' => (int) ($firm['reminder_deadline_days'] ?? 3),
        'docAfterDays' => (int) ($firm['reminder_doc_after_days'] ?? 7),
        'repeatDays' => (int) ($firm['reminder_repeat_days'] ?? 7),
        'paymentGraceDays' => (int) ($firm['reminder_payment_grace_days'] ?? 3),
    ];
    $channels = json_decode((string) ($firm['reminder_channels'] ?? '["email"]'), true) ?: ['email'];

    $q = function (string $sql, array $p = []) use ($pdo) { $st = $pdo->prepare($sql); $st->execute($p); return $st->fetchAll(); };
    $clients = $q("SELECT id, name, contact_person, email, phone, reminders_opt_out, status FROM clients WHERE status = 'active'");
    $tasks = $q("SELECT client_id, title, period, due_date, status FROM tasks WHERE due_date = ? AND status <> 'done'", [add_days($today, $settings['deadlineDays'])]);
    $docs = $q("SELECT client_id, name, requested_on, status FROM documents WHERE status = 'pending'");
    $invoices = $q("SELECT i.client_id, i.invoice_no, i.issue_date, i.due_date, i.status, i.total - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS balance
                    FROM invoices i WHERE i.status IN ('unpaid', 'partial')");
    $log = $q('SELECT client_id, kind, sent_on, status FROM reminder_log WHERE sent_on >= ?', [add_days($today, -60)]);

    $plan = plan_reminders($today, $settings, $clients, $tasks, $docs, $invoices, $log);
    $summary['planned'] = count($plan);
    $ins = $pdo->prepare('INSERT INTO reminder_log (id, client_id, kind, channel, sent_on, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?)');

    foreach ($plan as $p) {
        $c = $p['client'];
        foreach ($channels as $channel) {
            $status = 'skipped';
            $detail = null;
            if ($channel === 'email') {
                if (!$c['email']) $detail = 'Client has no email address.';
                elseif ($dryRun) $detail = 'Would email ' . $c['email'];
                else { $r = send_email($c['email'], $p['subject'], $p['body'], $firm['email'] ?? null); $status = $r['ok'] ? 'sent' : 'failed'; $detail = $r['ok'] ? $c['email'] : $r['error']; }
            } elseif ($channel === 'whatsapp') {
                $phone = normalise_phone($c['phone']);
                if (!$phone) $detail = 'Client has no valid mobile number.';
                elseif ($dryRun) $detail = 'Would WhatsApp +' . $phone;
                else { $r = send_whatsapp($phone, $c['contact_person'] ?: $c['name'], $p['oneLine']); $status = $r['ok'] ? 'sent' : 'failed'; $detail = $r['ok'] ? "+$phone" : $r['error']; }
            } else continue;
            $summary[$status]++;
            $summary['details'][] = ['client' => $c['name'], 'kind' => $p['kind'], 'channel' => $channel, 'status' => $status, 'detail' => $detail];
            if (!$dryRun) $ins->execute([uuid(), $c['id'], $p['kind'], $channel, $today, $status, $detail ? mb_substr($detail, 0, 500) : null]);
        }
    }
    return $summary;
}
