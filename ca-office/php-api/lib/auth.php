<?php

function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('caoffice');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
    // Sessions expire after 12 hours of inactivity.
    if (isset($_SESSION['seen']) && time() - $_SESSION['seen'] > 12 * 3600) { $_SESSION = []; }
    $_SESSION['seen'] = time();
}

/** The signed-in user's profile, or null. */
function current_user(): ?array {
    static $user = false;
    if ($user !== false) return $user;
    start_session();
    $user = null;
    if (!empty($_SESSION['uid'])) {
        $st = db()->prepare('SELECT id, email, full_name, role, active FROM profiles WHERE id = ?');
        $st->execute([$_SESSION['uid']]);
        $row = $st->fetch();
        if ($row && (int) $row['active'] === 1) $user = $row;
        else $_SESSION = [];
    }
    return $user;
}

function require_user(): array {
    $u = current_user();
    if (!$u) fail(401, 'Your session has ended. Please sign in again.');
    return $u;
}

function is_admin(): bool { return (current_user()['role'] ?? '') === 'admin'; }

function require_admin(): array {
    $u = require_user();
    if ($u['role'] !== 'admin') fail(403, 'Only admins can do this.');
    return $u;
}

function client_ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? 'unknown', 0, 64); }

function check_password_strength(string $pw): void {
    if (strlen($pw) < 8) fail(400, 'Use a password of at least 8 characters.');
}

function auth_status(): array {
    $has = (int) db()->query('SELECT COUNT(*) FROM profiles')->fetchColumn() > 0;
    $u = current_user();
    return ['hasUsers' => $has, 'user' => $u ? ['id' => $u['id'], 'email' => $u['email']] : null];
}

function auth_signin(string $email, string $password): array {
    $pdo = db();
    $ip = client_ip();
    $st = $pdo->prepare('SELECT failures, last_failure FROM login_attempts WHERE ip = ?');
    $st->execute([$ip]);
    $att = $st->fetch();
    if ($att && (int) $att['failures'] >= 10 && strtotime($att['last_failure'] . ' UTC') > time() - 900) {
        fail(429, 'Too many failed sign-ins. Wait 15 minutes and try again.');
    }
    $st = $pdo->prepare('SELECT id, password_hash, active FROM profiles WHERE email = ?');
    $st->execute([strtolower(trim($email))]);
    $row = $st->fetch();
    if (!$row || !password_verify($password, $row['password_hash'])) {
        $pdo->prepare('INSERT INTO login_attempts (ip, failures, last_failure) VALUES (?, 1, UTC_TIMESTAMP())
                       ON DUPLICATE KEY UPDATE failures = IF(last_failure < UTC_TIMESTAMP() - INTERVAL 15 MINUTE, 1, failures + 1), last_failure = UTC_TIMESTAMP()')
            ->execute([$ip]);
        usleep(400000);
        fail(400, 'Wrong email or password.');
    }
    if ((int) $row['active'] !== 1) fail(403, 'This account has been switched off. Ask your admin.');
    $pdo->prepare('DELETE FROM login_attempts WHERE ip = ?')->execute([$ip]);
    if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
        $pdo->prepare('UPDATE profiles SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
    }
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = $row['id'];
    return auth_status();
}

/** Creates a user. The very first account becomes admin. */
function create_user(string $email, string $password, string $fullName, string $role = 'staff'): string {
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Enter a valid email address.');
    check_password_strength($password);
    if (!in_array($role, ['admin', 'staff'], true)) fail(400, 'Unknown role.');
    $pdo = db();
    $st = $pdo->prepare('SELECT COUNT(*) FROM profiles WHERE email = ?');
    $st->execute([$email]);
    if ((int) $st->fetchColumn() > 0) fail(400, 'An account with this email already exists.');
    $id = uuid();
    $pdo->prepare('INSERT INTO profiles (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)')
        ->execute([$id, $email, password_hash($password, PASSWORD_DEFAULT), trim($fullName) ?: explode('@', $email)[0], $role]);
    return $id;
}

/** Self sign-up is only possible while there are no users (first-run). */
function auth_signup(string $email, string $password, string $fullName): array {
    if (auth_status()['hasUsers']) fail(403, 'Sign-up is closed. Ask your admin to create an account for you.');
    $id = create_user($email, $password, $fullName, 'admin');
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = $id;
    return auth_status();
}

function auth_signout(): array {
    start_session();
    $_SESSION = [];
    session_destroy();
    return ['ok' => true];
}
