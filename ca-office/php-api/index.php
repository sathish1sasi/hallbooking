<?php
/* Single API endpoint for the CA Office web app. */
require __DIR__ . '/lib/bootstrap.php';

try {
    $op = $_GET['op'] ?? '';
    if ($op === 'file') storage_download((string) ($_GET['path'] ?? ''));
    if ($op === 'health') json_out(['ok' => true, 'php' => PHP_VERSION, 'db' => (bool) db()->query('SELECT 1')->fetchColumn()]);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'Use POST.');
    // Custom header: browsers can't send it cross-site without permission, which blocks CSRF.
    if (($_SERVER['HTTP_X_CA_OFFICE'] ?? '') !== '1') fail(403, 'Missing request header.');

    if ($op === 'upload') json_out(storage_upload());

    $b = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($b)) fail(400, 'Bad request.');
    $result = match ($b['op'] ?? '') {
        'select' => op_select($b),
        'insert' => op_insert($b),
        'update' => op_update($b),
        'delete' => op_delete($b),
        'rpc' => rpc((string) ($b['name'] ?? ''), (array) ($b['args'] ?? [])),
        'storage.remove' => storage_remove((array) ($b['paths'] ?? [])),
        'auth.status' => ['data' => auth_status()],
        'auth.signin' => ['data' => auth_signin((string) ($b['email'] ?? ''), (string) ($b['password'] ?? ''))],
        'auth.signup' => ['data' => auth_signup((string) ($b['email'] ?? ''), (string) ($b['password'] ?? ''), (string) ($b['full_name'] ?? ''))],
        'auth.signout' => ['data' => auth_signout()],
        default => fail(400, 'Unknown operation.'),
    };
    json_out($result + ['error' => null]);
} catch (ApiError $e) {
    json_out(['data' => null, 'error' => ['message' => $e->getMessage()]], $e->status);
} catch (PDOException $e) {
    error_log('[ca-office] ' . $e->getMessage());
    $code = $e->errorInfo[1] ?? 0;
    $msg = match ((int) $code) {
        1062 => 'This record already exists.',
        1451 => 'This record is still in use (for example, a client with invoices). Remove those first.',
        1452 => 'A linked record is missing. Refresh the page and try again.',
        default => 'Database error. Please try again; if it keeps happening, check the PHP error log in cPanel.',
    };
    json_out(['data' => null, 'error' => ['message' => $msg]], in_array((int) $code, [1062, 1451, 1452], true) ? 409 : 500);
} catch (Throwable $e) {
    error_log('[ca-office] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_out(['data' => null, 'error' => ['message' => 'Server error. Check the PHP error log in cPanel.']], 500);
}
