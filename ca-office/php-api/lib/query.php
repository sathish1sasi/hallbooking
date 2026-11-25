<?php
/*
 * Translates the browser's query objects into parameterised SQL.
 * Every table and column name is checked against TABLES before use, and every
 * value is bound as a parameter, so nothing the browser sends ends up in SQL text.
 */

function qi(string $id): string { return '`' . str_replace('`', '', $id) . '`'; }

function col_type(array $def, string $col): string {
    if (!isset($def['cols'][$col])) fail(400, "Unknown column: $col");
    return $def['cols'][$col];
}

function to_db(string $type, mixed $v): mixed {
    if ($v === null) return null;
    switch ($type) {
        case 'b': return ($v === true || $v === 1 || $v === '1' || $v === 'true') ? 1 : 0;
        case 'i':
            if (!is_numeric($v)) fail(400, 'Expected a whole number.');
            return (int) $v;
        case 'n':
            if (!is_numeric($v)) fail(400, 'Expected a number.');
            return (string) $v;
        case 'd':
            if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}/', $v)) fail(400, 'Expected a date (YYYY-MM-DD).');
            return substr($v, 0, 10);
        case 't':
            $ts = is_string($v) ? strtotime($v) : false;
            if ($ts === false) fail(400, 'Expected a date and time.');
            return gmdate('Y-m-d H:i:s', $ts);
        case 'j':
            if (!is_array($v)) fail(400, 'Expected a list.');
            return json_encode(array_values(array_map('strval', $v)), JSON_UNESCAPED_UNICODE);
        default:
            if (is_array($v) || is_bool($v)) fail(400, 'Expected text.');
            return (string) $v;
    }
}

function from_db(string $type, mixed $v): mixed {
    if ($type === 'j') {
        $a = $v === null ? null : json_decode((string) $v, true);
        return is_array($a) ? $a : [];
    }
    if ($v === null) return null;
    return match ($type) {
        'b' => (bool) (int) $v,
        'i' => (int) $v,
        'n' => (float) $v,
        't' => str_replace(' ', 'T', (string) $v) . 'Z',
        default => $v,
    };
}

function cast_row(array $def, array $row): array {
    foreach ($row as $k => $v) if (isset($def['cols'][$k])) $row[$k] = from_db($def['cols'][$k], $v);
    return $row;
}

function check_enum(string $table, string $col, mixed $v): void {
    $key = "$table.$col";
    if ($v !== null && isset(ENUMS[$key]) && !in_array($v, ENUMS[$key], true)) fail(400, "Invalid value for $col.");
}

/** Parses "*, clients(name, phone)" into [columns, relations]. */
function parse_select(string $table, ?string $sel): array {
    $def = table_def($table);
    $sel = trim((string) $sel) === '' ? '*' : (string) $sel;
    $parts = [];
    $depth = 0;
    $cur = '';
    foreach (str_split($sel) as $ch) {
        if ($ch === '(') $depth++;
        if ($ch === ')') $depth--;
        if ($ch === ',' && $depth === 0) { $parts[] = $cur; $cur = ''; continue; }
        $cur .= $ch;
    }
    $parts[] = $cur;
    $cols = [];
    $rels = [];
    foreach ($parts as $p) {
        $p = trim($p);
        if ($p === '') continue;
        if (preg_match('/^(\w+)\((.*)\)$/s', $p, $m)) {
            $rel = $m[1];
            if (!isset($def['rel'][$rel])) fail(400, "Unknown relation: $rel");
            $rdef = table_def($def['rel'][$rel][1]);
            if (($rdef['perm']['read'] ?? '') !== 'all') fail(403, 'This relation cannot be read.');
            $rc = [];
            foreach (explode(',', $m[2]) as $c) {
                $c = trim($c);
                if ($c === '*') { $rc = array_merge($rc, array_keys($rdef['cols'])); continue; }
                col_type($rdef, $c);
                $rc[] = $c;
            }
            $rels[$rel] = array_values(array_unique($rc));
        } elseif ($p === '*') {
            $cols = array_merge($cols, array_keys($def['cols']));
        } else {
            col_type($def, $p);
            $cols[] = $p;
        }
    }
    return [array_values(array_unique($cols)), $rels];
}

/** WHERE fragment for the permission mode of an action. */
function perm_where(string $table, string $action, array &$params): string {
    $def = table_def($table);
    $mode = $def['perm'][$action] ?? 'none';
    $u = require_user();
    switch ($mode) {
        case 'all': return '1=1';
        case 'admin':
            if (!is_admin()) fail(403, 'Only admins can do this.');
            return '1=1';
        case 'own':
            if (is_admin()) return '1=1';
            $params[] = $u['id'];
            return qi($def['owner']) . ' = ?';
        case 'own_strict':
            $params[] = $u['id'];
            return qi($def['owner']) . ' = ?';
        case 'profile':
            if (is_admin()) return '1=1';
            $params[] = $u['id'];
            return '`id` = ?';
        default:
            fail(403, 'This action is not allowed.');
    }
}

function build_filters(array $def, array $filters, array &$params): array {
    $w = [];
    foreach ($filters as $f) {
        if (!is_array($f) || count($f) < 2) fail(400, 'Bad filter.');
        [$col, $op] = $f;
        $val = $f[2] ?? null;
        $type = col_type($def, (string) $col);
        $c = qi((string) $col);
        switch ($op) {
            case 'eq':
                if ($val === null) { $w[] = "$c IS NULL"; break; }
                $w[] = "$c = ?"; $params[] = to_db($type, $val); break;
            case 'neq': $w[] = "$c <> ?"; $params[] = to_db($type, $val); break;
            case 'gt': $w[] = "$c > ?"; $params[] = to_db($type, $val); break;
            case 'gte': $w[] = "$c >= ?"; $params[] = to_db($type, $val); break;
            case 'lt': $w[] = "$c < ?"; $params[] = to_db($type, $val); break;
            case 'lte': $w[] = "$c <= ?"; $params[] = to_db($type, $val); break;
            case 'in':
                if (!is_array($val)) fail(400, 'Filter "in" needs a list.');
                if (!$val) { $w[] = '1=0'; break; }
                if (count($val) > 5000) fail(400, 'Too many values in filter.');
                $w[] = "$c IN (" . implode(',', array_fill(0, count($val), '?')) . ')';
                foreach ($val as $v) $params[] = to_db($type, $v);
                break;
            case 'is':
                if ($val === null) $w[] = "$c IS NULL";
                else { $w[] = "$c = ?"; $params[] = $val ? 1 : 0; }
                break;
            case 'not_is':
                if ($val === null) $w[] = "$c IS NOT NULL";
                else { $w[] = "$c <> ?"; $params[] = $val ? 1 : 0; }
                break;
            default: fail(400, "Unsupported filter: $op");
        }
    }
    return $w;
}

function order_sql(array $def, array $order): string {
    $parts = [];
    foreach ($order as $o) {
        [$col, $asc] = [$o[0] ?? '', $o[1] ?? true];
        col_type($def, (string) $col);
        // Same NULL placement as PostgreSQL: last when ascending, first when descending.
        $nullsFirst = array_key_exists(2, $o) && $o[2] !== null ? (bool) $o[2] : !$asc;
        $c = qi((string) $col);
        $parts[] = "($c IS NULL) " . ($nullsFirst ? 'DESC' : 'ASC');
        $parts[] = "$c " . ($asc ? 'ASC' : 'DESC');
    }
    return $parts ? ' ORDER BY ' . implode(', ', $parts) : '';
}

function from_sql(string $table): string {
    $def = table_def($table);
    return isset($def['virtual']) ? $def['virtual'] . ' AS ' . qi($table) : qi($table);
}

/** Loads rows by id, with relations; used for select and for returning rows after writes. */
function fetch_rows(string $table, array $cols, array $rels, string $whereSql, array $params, string $orderSql = '', ?int $limit = null): array {
    $def = table_def($table);
    $fetch = $cols;
    foreach ($rels as $rel => $_) {
        $fk = $def['rel'][$rel][0];
        if (!in_array($fk, $fetch, true)) $fetch[] = $fk;
    }
    if (!$fetch) $fetch = [array_key_first($def['cols'])];
    $sql = 'SELECT ' . implode(', ', array_map('qi', $fetch)) . ' FROM ' . from_sql($table) . " WHERE $whereSql$orderSql";
    if ($limit !== null) $sql .= ' LIMIT ' . max(1, min($limit, 20000));
    $st = db()->prepare($sql);
    $st->execute($params);
    $rows = array_map(fn ($r) => cast_row($def, $r), $st->fetchAll());

    foreach ($rels as $rel => $rc) {
        [$fk, $rtable] = $def['rel'][$rel];
        $rdef = table_def($rtable);
        $ids = array_values(array_unique(array_filter(array_column($rows, $fk), fn ($v) => $v !== null)));
        $map = [];
        if ($ids) {
            $sel = array_unique(array_merge(['id'], $rc));
            $q = db()->prepare('SELECT ' . implode(', ', array_map('qi', $sel)) . ' FROM ' . qi($rtable) . ' WHERE `id` IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
            $q->execute($ids);
            foreach ($q->fetchAll() as $r) $map[$r['id']] = cast_row($rdef, $r);
        }
        foreach ($rows as &$row) {
            $r = $map[$row[$fk]] ?? null;
            $row[$rel] = $r === null ? null : array_intersect_key($r, array_flip($rc));
        }
        unset($row);
    }
    // Drop helper columns that weren't asked for.
    $keep = array_flip(array_merge($cols, array_keys($rels)));
    return array_map(fn ($r) => array_intersect_key($r, $keep), $rows);
}

function op_select(array $b): array {
    $table = (string) ($b['table'] ?? '');
    $def = table_def($table);
    [$cols, $rels] = parse_select($table, $b['columns'] ?? '*');
    $params = [];
    $where = array_merge([perm_where($table, 'read', $params)], build_filters($def, $b['filters'] ?? [], $params));
    $wsql = implode(' AND ', $where);
    $count = null;
    if (!empty($b['count'])) {
        $st = db()->prepare('SELECT COUNT(*) FROM ' . from_sql($table) . " WHERE $wsql");
        $st->execute($params);
        $count = (int) $st->fetchColumn();
        if (!empty($b['head'])) return ['data' => null, 'count' => $count];
    }
    $limit = isset($b['limit']) ? (int) $b['limit'] : 10000;
    $rows = fetch_rows($table, $cols, $rels, $wsql, $params, order_sql($def, $b['order'] ?? []), $limit);
    return ['data' => single_mode($rows, $b['single'] ?? null), 'count' => $count];
}

function single_mode(array $rows, ?string $mode): mixed {
    if ($mode === 'one') {
        if (count($rows) !== 1) fail(406, count($rows) ? 'More than one row matched.' : 'Not found.');
        return $rows[0];
    }
    if ($mode === 'maybe') {
        if (count($rows) > 1) fail(406, 'More than one row matched.');
        return $rows[0] ?? null;
    }
    return $rows;
}

/** Validates a row from the browser and converts it for the database. */
function prepare_row(string $table, array $row, string $action): array {
    $def = table_def($table);
    $u = require_user();
    foreach ($row as $k => $v) {
        col_type($def, (string) $k);
        if (in_array($k, $def['readonly'] ?? [], true)) fail(400, "$k is calculated automatically.");
        check_enum($table, (string) $k, $v);
    }
    if ($action === 'insert') {
        foreach ($def['defaults'] ?? [] as $k => $d) {
            if (array_key_exists($k, $row) && $row[$k] !== null) continue;
            $row[$k] = $d === '@me' ? $u['id'] : ($d === '@today' ? today() : $d);
        }
        if (isset($def['cols']['id']) && $def['cols']['id'] === 's' && empty($row['id'])) $row['id'] = uuid();
    }
    // Ownership rules for own / own_strict tables.
    $mode = $def['perm'][$action] ?? 'none';
    if (isset($def['owner']) && array_key_exists($def['owner'], $row)) {
        $owner = $row[$def['owner']];
        if ($mode === 'own_strict' && $owner !== $u['id']) fail(403, 'You can only do this for yourself.');
        if ($mode === 'own' && $owner !== $u['id'] && !is_admin()) fail(403, 'You can only do this for yourself.');
    }
    return $row;
}

function convert_row(string $table, array $row): array {
    $def = table_def($table);
    $out = [];
    foreach ($row as $k => $v) $out[$k] = to_db($def['cols'][$k], $v);
    return $out;
}

function op_insert(array $b): array {
    $table = (string) ($b['table'] ?? '');
    $def = table_def($table);
    $mode = $def['perm']['insert'] ?? 'none';
    if ($mode === 'none') fail(403, 'This action is not allowed.');
    if ($mode === 'admin' && !is_admin()) fail(403, 'Only admins can do this.');
    $rows = $b['rows'] ?? [];
    if (!is_array($rows) || !$rows) fail(400, 'Nothing to save.');
    if (count($rows) > 2000) fail(400, 'Too many rows at once.');
    $upsert = $b['upsert'] ?? null;
    if ($upsert) {
        $conflict = array_map('strval', (array) ($upsert['onConflict'] ?? []));
        $allowed = $def['unique'] ?? [];
        if (!in_array($conflict, $allowed, true)) fail(400, 'Upsert is not supported on these columns.');
        if (!empty($upsert['ignoreDuplicates'])) {
            // fine
        } elseif (($def['perm']['update'] ?? 'none') === 'none') {
            fail(403, 'This action is not allowed.');
        }
    }

    $pdo = db();
    $ids = [];
    $invoiceIds = [];
    $pdo->beginTransaction();
    try {
        foreach ($rows as $raw) {
            if (!is_array($raw)) fail(400, 'Bad row.');
            $row = prepare_row($table, $raw, 'insert');
            before_insert($table, $row);
            $vals = convert_row($table, $row);
            $cols = array_keys($vals);
            $sql = 'INSERT INTO ' . qi($table) . ' (' . implode(', ', array_map('qi', $cols)) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')';
            if ($upsert) {
                if (!empty($upsert['ignoreDuplicates'])) {
                    $sql .= ' ON DUPLICATE KEY UPDATE `id` = `id`';
                } else {
                    $upd = array_diff($cols, array_merge(['id'], $upsert['onConflict']));
                    $sql .= ' ON DUPLICATE KEY UPDATE ' . ($upd ? implode(', ', array_map(fn ($c) => qi($c) . ' = VALUES(' . qi($c) . ')', $upd)) : '`id` = `id`');
                }
            }
            $pdo->prepare($sql)->execute(array_values($vals));
            // Work out the id of the row that now holds the data.
            if (!$upsert) {
                $ids[] = $row['id'] ?? null;
            } else {
                $params = [];
                $w = [];
                foreach ($upsert['onConflict'] as $c) {
                    if ($vals[$c] ?? null) { $w[] = qi($c) . ' = ?'; $params[] = $vals[$c]; }
                    else $w[] = qi($c) . ' IS NULL';
                }
                $st = $pdo->prepare('SELECT `id` FROM ' . qi($table) . ' WHERE ' . implode(' AND ', $w));
                $st->execute($params);
                $found = $st->fetchColumn();
                // With ignoreDuplicates only rows we actually inserted are returned (as PostgREST does).
                if ($found && (empty($upsert['ignoreDuplicates']) || $found === $row['id'])) $ids[] = $found;
            }
            if (in_array($table, ['invoice_items', 'payments'], true)) $invoiceIds[] = $row['invoice_id'] ?? null;
        }
        after_write($table, array_filter($invoiceIds));
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['data' => returning($table, $b['returning'] ?? null, array_values(array_filter($ids)), $b['single'] ?? null)];
}

function returning(string $table, ?string $columns, array $ids, ?string $single): mixed {
    if ($columns === null) return null;
    [$cols, $rels] = parse_select($table, $columns);
    if (!$ids) return single_mode([], $single);
    $def = table_def($table);
    $pk = $def['pk'] ?? 'id';
    $rows = fetch_rows($table, $cols, $rels, qi($pk) . ' IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
    return single_mode($rows, $single);
}

/** Ids of rows the user may act on, matching the filters. */
function target_ids(string $table, string $action, array $filters): array {
    $def = table_def($table);
    if (!$filters) fail(400, 'Refusing to change every row. Add a filter.');
    $params = [];
    $where = array_merge([perm_where($table, $action, $params)], build_filters($def, $filters, $params));
    $pk = $def['pk'] ?? 'id';
    $st = db()->prepare('SELECT ' . qi($pk) . ' FROM ' . qi($table) . ' WHERE ' . implode(' AND ', $where));
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_COLUMN);
}

function op_update(array $b): array {
    $table = (string) ($b['table'] ?? '');
    $def = table_def($table);
    if (isset($def['virtual'])) fail(403, 'This action is not allowed.');
    $data = $b['data'] ?? [];
    if (!is_array($data) || !$data) fail(400, 'Nothing to change.');
    unset($data['id']);
    $data = prepare_row($table, $data, 'update');
    if ($table === 'profiles') guard_profile_update($data, $b['filters'] ?? []);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $ids = target_ids($table, 'update', $b['filters'] ?? []);
        if ($ids) {
            $params = [];
            $sets = update_extras($table, $data, $params);   // must run before the column assignments
            foreach (convert_row($table, $data) as $k => $v) { $sets[] = qi($k) . ' = ?'; $params[] = $v; }
            if ($table === 'invoice_items' && (isset($data['qty']) || isset($data['rate']))) $sets[] = '`amount` = ROUND(`qty` * `rate`, 2)';
            $pk = $def['pk'] ?? 'id';
            $sql = 'UPDATE ' . qi($table) . ' SET ' . implode(', ', $sets) . ' WHERE ' . qi($pk) . ' IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
            $pdo->prepare($sql)->execute(array_merge($params, $ids));
            after_write($table, invoice_ids_for($table, $ids));
            if ($table === 'invoices' && array_key_exists('tax_rate', $data)) recalc_invoices($ids);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['data' => returning($table, $b['returning'] ?? null, $ids, $b['single'] ?? null)];
}

function op_delete(array $b): array {
    $table = (string) ($b['table'] ?? '');
    $def = table_def($table);
    if (isset($def['virtual'])) fail(403, 'This action is not allowed.');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $ids = target_ids($table, 'delete', $b['filters'] ?? []);
        $files = [];
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $invoiceIds = invoice_ids_for($table, $ids);
            // Remember stored files so they can be removed with their records.
            if ($table === 'documents') $files = column_values("SELECT file_path FROM documents WHERE id IN ($in) AND file_path IS NOT NULL", $ids);
            if ($table === 'clients') $files = column_values("SELECT file_path FROM documents WHERE client_id IN ($in) AND file_path IS NOT NULL", $ids);
            $pk = $def['pk'] ?? 'id';
            $pdo->prepare('DELETE FROM ' . qi($table) . ' WHERE ' . qi($pk) . " IN ($in)")->execute($ids);
            after_write($table, $invoiceIds);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    foreach ($files as $f) delete_stored_file($f);
    return ['data' => null];
}

function column_values(string $sql, array $params): array {
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_COLUMN);
}

function invoice_ids_for(string $table, array $ids): array {
    if (!$ids || !in_array($table, ['invoice_items', 'payments'], true)) return [];
    return column_values('SELECT DISTINCT invoice_id FROM ' . qi($table) . ' WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
}
