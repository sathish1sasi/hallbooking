<?php
/* Client files are saved outside public_html and only served to signed-in users. */

function storage_dir(): string {
    $dir = rtrim((string) (config()['storage_dir'] ?? ''), '/');
    if ($dir === '') fail(500, 'storage_dir is not set in api/config.php.');
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) fail(500, 'Cannot create the file storage folder. Check storage_dir in api/config.php.');
    // If someone points storage inside public_html, at least block direct web access.
    if (!is_file("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
    return $dir;
}

function safe_rel_path(string $p): string {
    if (!preg_match('#^[A-Za-z0-9_\-][A-Za-z0-9_\-. /]*$#', $p) || str_contains($p, '..') || strlen($p) > 250) fail(400, 'Invalid file path.');
    return $p;
}

function storage_upload(): array {
    require_user();
    $path = safe_rel_path((string) ($_POST['path'] ?? ''));
    $f = $_FILES['file'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $code = $f['error'] ?? -1;
        fail(400, in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
            ? 'This file is larger than your hosting allows. Raise upload_max_filesize in cPanel → MultiPHP INI Editor.'
            : 'The upload did not complete. Please try again.');
    }
    if ($f['size'] > MAX_UPLOAD_BYTES) fail(400, 'Files can be at most 25 MB.');
    $dest = storage_dir() . '/' . $path;
    if (file_exists($dest)) fail(409, 'A file with this name already exists.');
    if (!is_dir(dirname($dest)) && !@mkdir(dirname($dest), 0750, true)) fail(500, 'Could not create the folder for this file.');
    if (!move_uploaded_file($f['tmp_name'], $dest)) fail(500, 'Could not save the file. Check the storage folder permissions.');
    @chmod($dest, 0640);
    return ['data' => ['path' => $path]];
}

function delete_stored_file(string $path): void {
    $full = storage_dir() . '/' . safe_rel_path($path);
    if (is_file($full)) @unlink($full);
}

function storage_remove(array $paths): array {
    $u = require_user();
    foreach ($paths as $p) {
        $p = safe_rel_path((string) $p);
        $st = db()->prepare('SELECT uploaded_by FROM documents WHERE file_path = ? LIMIT 1');
        $st->execute([$p]);
        $owner = $st->fetchColumn();
        if ($owner !== false && $owner !== null && $owner !== $u['id'] && !is_admin()) fail(403, 'Only the person who uploaded this file or an admin can delete it.');
        delete_stored_file($p);
    }
    return ['data' => null];
}

function storage_download(string $path): never {
    require_user();
    $path = safe_rel_path($path);
    $st = db()->prepare('SELECT file_name FROM documents WHERE file_path = ? LIMIT 1');
    $st->execute([$path]);
    $name = $st->fetchColumn();
    $full = storage_dir() . '/' . $path;
    if ($name === false || !is_file($full)) fail(404, 'File not found.');
    $mime = function_exists('mime_content_type') ? (mime_content_type($full) ?: 'application/octet-stream') : 'application/octet-stream';
    // Never render active content from our own domain.
    $inline = preg_match('#^(application/pdf|image/(png|jpe?g|gif|webp)|text/plain)$#', $mime) === 1;
    if (!$inline) $mime = 'application/octet-stream';
    $safe = preg_replace('/[^\w.\- ]+/u', '_', (string) $name);
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($full));
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename=\"$safe\"; filename*=UTF-8''" . rawurlencode((string) $name));
    header('Cache-Control: private, no-store');
    readfile($full);
    exit;
}
