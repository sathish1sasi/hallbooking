<?php
/*
 * Daily job: creates recurring and statutory tasks and sends reminders.
 * cPanel → Cron Jobs → Once Per Day, command:
 *   php /home/YOUR_CPANEL_USER/public_html/api/cron.php
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Run this from cron.'); }
require __DIR__ . '/lib/bootstrap.php';
try {
    $s = run_daily_job(in_array('--dry', $argv, true));
    echo date('Y-m-d H:i') . " recurring={$s['recurringCreated']} statutory={$s['complianceCreated']} reminders sent={$s['sent']} failed={$s['failed']} skipped={$s['skipped']}\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Daily job failed: ' . $e->getMessage() . "\n");
    exit(1);
}
