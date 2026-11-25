<?php
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function config(): array {
    static $cfg = null;
    if ($cfg === null) {
        $file = dirname(__DIR__) . '/config.php';
        if (!is_file($file)) {
            fail(503, 'The app is not installed yet. Open api/install.php to set it up.');
        }
        $cfg = require $file;
    }
    return $cfg;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        $pdo = connect_db($c['db_host'], $c['db_name'], $c['db_user'], $c['db_pass']);
        date_default_timezone_set($c['timezone'] ?? 'Asia/Kolkata');
    }
    return $pdo;
}

function connect_db(string $host, string $name, string $user, string $pass): PDO {
    $pdo = new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    // Store all timestamps in UTC; dates are computed in PHP (India time).
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

final class ApiError extends Exception {
    public function __construct(public int $status, string $message) { parent::__construct($message); }
}

function fail(int $status, string $message): never { throw new ApiError($status, $message); }

function uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

/** Today's date in the firm's time zone (India by default). */
function today(): string { return date('Y-m-d'); }
function utc_now(): string { return gmdate('Y-m-d H:i:s'); }
function add_days(string $iso, int $n): string { return date('Y-m-d', strtotime("$iso $n days")); }
function days_between(string $a, string $b): int { return (int) round((strtotime($b . ' 00:00:00 UTC') - strtotime($a . ' 00:00:00 UTC')) / 86400); }

function json_out(mixed $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

require_once __DIR__ . '/tables.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/query.php';
require_once __DIR__ . '/hooks.php';
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/compliance.php';
require_once __DIR__ . '/reminders.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/job.php';
require_once __DIR__ . '/rpc.php';
