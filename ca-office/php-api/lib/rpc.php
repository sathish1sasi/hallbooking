<?php
/* Server-side functions the browser can call by name. */

function rpc(string $name, array $a): array {
    $u = require_user();
    switch ($name) {
        case 'next_invoice_number': {
            $date = (string) ($a['p_date'] ?? today());
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) fail(400, 'Bad date.');
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $row = $pdo->query('SELECT next_invoice_no, invoice_prefix FROM firm_settings WHERE id = 1 FOR UPDATE')->fetch();
                $pdo->exec('UPDATE firm_settings SET next_invoice_no = next_invoice_no + 1 WHERE id = 1');
                $pdo->commit();
            } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
            [$y, $m] = array_map('intval', explode('-', $date));
            return ['data' => $row['invoice_prefix'] . '/' . fy_label($y, $m) . '/' . sprintf('%04d', $row['next_invoice_no'])];
        }
        case 'advance_package': {
            db()->prepare("UPDATE packages SET next_bill_date = CASE frequency
                    WHEN 'monthly' THEN DATE_ADD(next_bill_date, INTERVAL 1 MONTH)
                    WHEN 'quarterly' THEN DATE_ADD(next_bill_date, INTERVAL 3 MONTH)
                    WHEN 'half_yearly' THEN DATE_ADD(next_bill_date, INTERVAL 6 MONTH)
                    WHEN 'yearly' THEN DATE_ADD(next_bill_date, INTERVAL 1 YEAR)
                    ELSE next_bill_date END,
                  active = IF(frequency = 'one_time', 0, active)
                WHERE id = ?")->execute([(string) ($a['p_id'] ?? '')]);
            return ['data' => null];
        }
        case 'generate_recurring_tasks':
            return ['data' => generate_recurring_tasks(max(0, min(60, (int) ($a['p_lead_days'] ?? 7))))];
        case 'run_daily_job':
            require_admin();
            return ['data' => run_daily_job(!empty($a['dry']))];
        case 'admin_create_user':
            require_admin();
            $id = create_user((string) ($a['email'] ?? ''), (string) ($a['password'] ?? ''), (string) ($a['full_name'] ?? ''), (string) ($a['role'] ?? 'staff'));
            return ['data' => ['id' => $id]];
        case 'admin_set_password': {
            require_admin();
            $pw = (string) ($a['password'] ?? '');
            check_password_strength($pw);
            $st = db()->prepare('UPDATE profiles SET password_hash = ? WHERE id = ?');
            $st->execute([password_hash($pw, PASSWORD_DEFAULT), (string) ($a['user_id'] ?? '')]);
            if (!$st->rowCount()) fail(404, 'User not found.');
            return ['data' => null];
        }
        case 'change_password': {
            $st = db()->prepare('SELECT password_hash FROM profiles WHERE id = ?');
            $st->execute([$u['id']]);
            if (!password_verify((string) ($a['current'] ?? ''), (string) $st->fetchColumn())) fail(400, 'Your current password is not correct.');
            $pw = (string) ($a['password'] ?? '');
            check_password_strength($pw);
            db()->prepare('UPDATE profiles SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
            return ['data' => null];
        }
    }
    fail(400, "Unknown function: $name");
}
