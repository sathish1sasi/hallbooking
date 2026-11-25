<?php
/* Business rules that the PostgreSQL version ran as triggers. */

function before_insert(string $table, array &$row): void {
    if ($table === 'tasks' && ($row['status'] ?? 'todo') === 'done') {
        $row['completed_at'] = gmdate('c');
    }
    if ($table === 'documents') {
        $s = $row['status'] ?? 'pending';
        if ($s === 'received' && empty($row['received_on'])) $row['received_on'] = today();
        if ($s === 'returned' && empty($row['returned_on'])) $row['returned_on'] = today();
    }
    if ($table === 'invoice_items') {
        $row['amount'] = round((float) ($row['qty'] ?? 1) * (float) ($row['rate'] ?? 0), 2);
    }
    if ($table === 'payments' && (float) ($row['amount'] ?? 0) <= 0) fail(400, 'Payment amount must be more than zero.');
    if ($table === 'time_entries') {
        $h = (float) ($row['hours'] ?? 0);
        if ($h <= 0 || $h > 24) fail(400, 'Hours must be between 0 and 24.');
    }
    if ($table === 'task_comments' && trim((string) ($row['body'] ?? '')) === '') fail(400, 'Write a comment first.');
}

/** Extra SET clauses that must run before the column assignments of an UPDATE. */
function update_extras(string $table, array $data, array &$params): array {
    $sets = [];
    if ($table === 'tasks' && array_key_exists('status', $data)) {
        $sets[] = $data['status'] === 'done'
            ? "`completed_at` = IF(`status` <> 'done' OR `completed_at` IS NULL, UTC_TIMESTAMP(), `completed_at`)"
            : '`completed_at` = NULL';
    }
    if ($table === 'documents' && array_key_exists('status', $data)) {
        if ($data['status'] === 'received') { $sets[] = '`received_on` = COALESCE(`received_on`, ?)'; $params[] = today(); }
        elseif ($data['status'] === 'returned') { $sets[] = '`returned_on` = COALESCE(`returned_on`, ?)'; $params[] = today(); }
        else { $sets[] = '`received_on` = NULL'; $sets[] = '`returned_on` = NULL'; }
    }
    return $sets;
}

function after_write(string $table, array $invoiceIds): void {
    if ($table === 'invoice_items') recalc_invoices($invoiceIds);
    if ($table === 'payments') foreach (array_unique($invoiceIds) as $id) refresh_invoice_status((string) $id);
}

function recalc_invoices(array $ids): void {
    $st = db()->prepare('UPDATE invoices i SET
            subtotal = (SELECT COALESCE(SUM(amount), 0) FROM invoice_items WHERE invoice_id = i.id),
            tax_amount = ROUND((SELECT COALESCE(SUM(amount), 0) FROM invoice_items WHERE invoice_id = i.id) * tax_rate / 100, 2),
            total = (SELECT COALESCE(SUM(amount), 0) FROM invoice_items WHERE invoice_id = i.id)
                  + ROUND((SELECT COALESCE(SUM(amount), 0) FROM invoice_items WHERE invoice_id = i.id) * tax_rate / 100, 2)
        WHERE id = ?');
    foreach (array_unique($ids) as $id) {
        $st->execute([$id]);
        refresh_invoice_status((string) $id);
    }
}

function refresh_invoice_status(string $id): void {
    $pdo = db();
    $st = $pdo->prepare('SELECT total, status, (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = invoices.id) AS paid FROM invoices WHERE id = ?');
    $st->execute([$id]);
    $inv = $st->fetch();
    if (!$inv || $inv['status'] === 'cancelled') return;
    $paid = (float) $inv['paid'];
    $status = $paid <= 0 ? 'unpaid' : ($paid >= (float) $inv['total'] ? 'paid' : 'partial');
    $pdo->prepare('UPDATE invoices SET status = ? WHERE id = ?')->execute([$status, $id]);
}

/** Staff may rename themselves; only admins change roles, rates or switch accounts off. */
function guard_profile_update(array $data, array $filters): void {
    $allowed = is_admin() ? ['full_name', 'role', 'hourly_rate', 'active'] : ['full_name'];
    foreach (array_keys($data) as $k) {
        if (!in_array($k, $allowed, true)) fail(403, 'Only admins can change role or hourly rate.');
    }
    $demote = (isset($data['role']) && $data['role'] !== 'admin') || (array_key_exists('active', $data) && !$data['active']);
    if ($demote) {
        $ids = target_ids('profiles', 'update', $filters);
        if (!$ids) return;
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = db()->prepare("SELECT COUNT(*) FROM profiles WHERE role = 'admin' AND active = 1 AND id NOT IN ($in)");
        $st->execute($ids);
        if ((int) $st->fetchColumn() === 0) fail(400, 'Keep at least one active admin. Promote someone else first.');
    }
}
