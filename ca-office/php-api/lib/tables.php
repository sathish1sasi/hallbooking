<?php
/*
 * Every table the browser may touch, its columns (with types) and who may do
 * what. Anything not listed here is unreachable from the API. These rules are
 * the same as the row-level security policies of the earlier Supabase version.
 *
 * Column types: s string, i int, n decimal, b boolean, d date, t timestamp (UTC), j JSON list
 * Permissions:  all | admin | none | own (owner column must be you; admins may act for anyone)
 *               own_strict (owner must be you, even for admins) | profile (special rules)
 */

const REL_CLIENT = ['client_id', 'clients'];
const REL_USER = ['user_id', 'profiles'];

const TABLES = [
    'profiles' => [
        'cols' => ['id' => 's', 'email' => 's', 'full_name' => 's', 'role' => 's', 'hourly_rate' => 'n', 'active' => 'b', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'none', 'update' => 'profile', 'delete' => 'none'],
    ],
    'firm_settings' => [
        'pk' => 'id',
        'cols' => ['id' => 'i', 'name' => 's', 'address' => 's', 'state' => 's', 'gstin' => 's', 'pan' => 's', 'phone' => 's', 'email' => 's',
            'bank_details' => 's', 'invoice_prefix' => 's', 'next_invoice_no' => 'i', 'reminders_enabled' => 'b',
            'reminder_deadline_days' => 'i', 'reminder_doc_after_days' => 'i', 'reminder_repeat_days' => 'i',
            'reminder_payment_grace_days' => 'i', 'reminder_kinds' => 'j', 'reminder_channels' => 'j', 'auto_compliance_days' => 'i'],
        'perm' => ['read' => 'all', 'insert' => 'none', 'update' => 'admin', 'delete' => 'none'],
    ],
    'clients' => [
        'cols' => ['id' => 's', 'name' => 's', 'client_type' => 's', 'pan' => 's', 'gstin' => 's', 'tan' => 's', 'cin' => 's',
            'contact_person' => 's', 'email' => 's', 'phone' => 's', 'address' => 's', 'state' => 's', 'services' => 'j',
            'assigned_to' => 's', 'status' => 's', 'notes' => 's', 'reminders_opt_out' => 'b', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'admin'],
        'defaults' => ['services' => []],
    ],
    'tasks' => [
        'unique' => [['client_id', 'compliance_key']],
        'cols' => ['id' => 's', 'client_id' => 's', 'title' => 's', 'category' => 's', 'period' => 's', 'due_date' => 'd',
            'assigned_to' => 's', 'status' => 's', 'priority' => 's', 'fee' => 'n', 'billed' => 'b', 'compliance_key' => 's',
            'acknowledgement_no' => 's', 'notes' => 's', 'completed_at' => 't', 'created_by' => 's', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'all'],
        'rel' => ['clients' => REL_CLIENT],
        'defaults' => ['created_by' => '@me'],
    ],
    'documents' => [
        'cols' => ['id' => 's', 'client_id' => 's', 'task_id' => 's', 'name' => 's', 'status' => 's', 'requested_on' => 'd',
            'received_on' => 'd', 'returned_on' => 'd', 'notes' => 's', 'file_path' => 's', 'file_name' => 's',
            'file_size' => 'i', 'uploaded_by' => 's', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'all'],
        'rel' => ['clients' => REL_CLIENT],
        'defaults' => ['requested_on' => '@today'],
    ],
    'time_entries' => [
        'owner' => 'user_id',
        'cols' => ['id' => 's', 'user_id' => 's', 'client_id' => 's', 'task_id' => 's', 'work_date' => 'd', 'hours' => 'n',
            'description' => 's', 'billable' => 'b', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'own', 'update' => 'own', 'delete' => 'own'],
        'rel' => ['clients' => REL_CLIENT, 'profiles' => REL_USER],
        'defaults' => ['user_id' => '@me', 'work_date' => '@today'],
    ],
    'invoices' => [
        'cols' => ['id' => 's', 'invoice_no' => 's', 'client_id' => 's', 'issue_date' => 'd', 'due_date' => 'd', 'is_igst' => 'b',
            'tax_rate' => 'n', 'subtotal' => 'n', 'tax_amount' => 'n', 'total' => 'n', 'status' => 's', 'notes' => 's', 'created_at' => 't'],
        'readonly' => ['subtotal', 'tax_amount', 'total'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'admin'],
        'rel' => ['clients' => REL_CLIENT],
        'defaults' => ['issue_date' => '@today'],
    ],
    'invoice_balances' => [
        'virtual' => "(SELECT i.id, i.invoice_no, i.client_id, i.issue_date, i.due_date, i.total, i.status,
                        COALESCE(p.paid, 0) AS paid, i.total - COALESCE(p.paid, 0) AS balance
                       FROM invoices i
                       LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id)",
        'cols' => ['id' => 's', 'invoice_no' => 's', 'client_id' => 's', 'issue_date' => 'd', 'due_date' => 'd', 'total' => 'n',
            'status' => 's', 'paid' => 'n', 'balance' => 'n'],
        'perm' => ['read' => 'all', 'insert' => 'none', 'update' => 'none', 'delete' => 'none'],
        'rel' => ['clients' => REL_CLIENT],
    ],
    'invoice_items' => [
        'cols' => ['id' => 's', 'invoice_id' => 's', 'task_id' => 's', 'description' => 's', 'sac' => 's', 'qty' => 'n', 'rate' => 'n', 'amount' => 'n'],
        'readonly' => ['amount'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'all'],
    ],
    'payments' => [
        'cols' => ['id' => 's', 'invoice_id' => 's', 'amount' => 'n', 'paid_on' => 'd', 'mode' => 's', 'reference' => 's', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'admin'],
        'defaults' => ['paid_on' => '@today'],
    ],
    'todos' => [
        'owner' => 'user_id',
        'cols' => ['id' => 's', 'user_id' => 's', 'title' => 's', 'due_date' => 'd', 'done' => 'b', 'client_id' => 's', 'created_at' => 't'],
        'perm' => ['read' => 'own_strict', 'insert' => 'own_strict', 'update' => 'own_strict', 'delete' => 'own_strict'],
        'defaults' => ['user_id' => '@me', 'due_date' => '@today'],
    ],
    'packages' => [
        'cols' => ['id' => 's', 'client_id' => 's', 'name' => 's', 'fee' => 'n', 'frequency' => 's', 'next_bill_date' => 'd', 'active' => 'b', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'admin'],
        'rel' => ['clients' => REL_CLIENT],
        'defaults' => ['next_bill_date' => '@today'],
    ],
    'dsc' => [
        'cols' => ['id' => 's', 'client_id' => 's', 'holder_name' => 's', 'dsc_class' => 's', 'issued_by' => 's', 'valid_from' => 'd',
            'valid_to' => 'd', 'location' => 's', 'token_password_hint' => 's', 'notes' => 's', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'admin'],
        'rel' => ['clients' => REL_CLIENT],
    ],
    'attendance' => [
        'owner' => 'user_id',
        'unique' => [['user_id', 'work_date']],
        'cols' => ['id' => 's', 'user_id' => 's', 'work_date' => 'd', 'check_in' => 't', 'check_out' => 't', 'status' => 's', 'note' => 's'],
        'perm' => ['read' => 'all', 'insert' => 'own', 'update' => 'own', 'delete' => 'admin'],
        'defaults' => ['user_id' => '@me', 'work_date' => '@today'],
    ],
    'task_checklist' => [
        'cols' => ['id' => 's', 'task_id' => 's', 'label' => 's', 'done' => 'b', 'position' => 'i', 'done_by' => 's', 'done_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'all'],
    ],
    'task_comments' => [
        'owner' => 'user_id',
        'cols' => ['id' => 's', 'task_id' => 's', 'user_id' => 's', 'body' => 's', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'own_strict', 'update' => 'none', 'delete' => 'own'],
        'defaults' => ['user_id' => '@me'],
    ],
    'recurring_tasks' => [
        'cols' => ['id' => 's', 'client_id' => 's', 'title' => 's', 'category' => 's', 'frequency' => 's', 'anchor_day' => 'i',
            'next_due' => 'd', 'period_mode' => 's', 'assigned_to' => 's', 'fee' => 'n', 'checklist' => 'j', 'active' => 'b', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'all', 'update' => 'all', 'delete' => 'admin'],
        'rel' => ['clients' => REL_CLIENT],
        'defaults' => ['checklist' => []],
    ],
    'reminder_log' => [
        'cols' => ['id' => 's', 'client_id' => 's', 'kind' => 's', 'channel' => 's', 'sent_on' => 'd', 'status' => 's', 'detail' => 's', 'created_at' => 't'],
        'perm' => ['read' => 'all', 'insert' => 'none', 'update' => 'none', 'delete' => 'none'],
        'rel' => ['clients' => REL_CLIENT],
    ],
];

/** Fixed value lists, so bad data can't get in even without database CHECK constraints. */
const ENUMS = [
    'profiles.role' => ['admin', 'staff'],
    'clients.client_type' => ['individual', 'huf', 'proprietorship', 'partnership', 'llp', 'company', 'trust', 'other'],
    'clients.status' => ['active', 'inactive'],
    'tasks.status' => ['todo', 'in_progress', 'hold', 'waiting_client', 'review', 'done'],
    'tasks.priority' => ['low', 'normal', 'high'],
    'documents.status' => ['pending', 'received', 'returned'],
    'invoices.status' => ['unpaid', 'partial', 'paid', 'cancelled'],
    'payments.mode' => ['bank', 'upi', 'cheque', 'cash', 'other'],
    'packages.frequency' => ['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'],
    'dsc.location' => ['office', 'client'],
    'attendance.status' => ['present', 'half_day', 'leave', 'wfh'],
    'recurring_tasks.frequency' => ['weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'],
    'recurring_tasks.period_mode' => ['previous', 'current', 'none'],
];

function table_def(string $t): array {
    if (!isset(TABLES[$t])) fail(400, "Unknown table: $t");
    return TABLES[$t];
}
