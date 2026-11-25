<?php
/*
 * One-time web installer. Creates the tables, writes config.php and the first
 * admin account. It refuses to run again once config.php exists.
 */
declare(strict_types=1);

$configFile = __DIR__ . '/config.php';
$h = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$installed = is_file($configFile);
$error = null;
$done = false;
$form = array_merge(['db_host' => 'localhost', 'db_name' => '', 'db_user' => '', 'db_pass' => '', 'firm' => '', 'name' => '', 'email' => '', 'password' => ''], $_POST);

if (!$installed && $_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        foreach (['db_name', 'db_user', 'firm', 'name', 'email', 'password'] as $k) {
            if (trim((string) $form[$k]) === '') throw new RuntimeException('Please fill in every field.');
        }
        if (!filter_var($form['email'], FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Enter a valid email address for the admin.');
        if (strlen((string) $form['password']) < 8) throw new RuntimeException('Use an admin password of at least 8 characters.');
        if (version_compare(PHP_VERSION, '8.1', '<')) throw new RuntimeException('PHP 8.1 or newer is needed. Change it in cPanel → MultiPHP Manager.');
        if (!extension_loaded('pdo_mysql')) throw new RuntimeException('The PHP extension pdo_mysql is missing. Enable it in cPanel → Select PHP Version → Extensions.');

        require_once __DIR__ . '/lib/bootstrap.php';
        try {
            $pdo = connect_db($form['db_host'], $form['db_name'], $form['db_user'], $form['db_pass']);
        } catch (PDOException $e) {
            throw new RuntimeException('Could not connect to the database. Check the name, user and password, and that the user is added to the database with ALL PRIVILEGES (cPanel → MySQL Databases).');
        }

        // Create tables (statements are separated by semicolons at line ends).
        $sqlFile = is_file(__DIR__ . '/schema.sql') ? __DIR__ . '/schema.sql' : dirname(__DIR__) . '/mysql/schema.sql';
        $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($sqlFile));
        foreach (preg_split('/;\s*$/m', $sql) as $stmt) if (trim($stmt) !== '') $pdo->exec($stmt);

        $storage = dirname(__DIR__, 2) . '/ca-office-files';
        $config = [
            'db_host' => $form['db_host'], 'db_name' => $form['db_name'], 'db_user' => $form['db_user'], 'db_pass' => $form['db_pass'],
            'storage_dir' => $storage, 'timezone' => 'Asia/Kolkata',
            'mail' => ['driver' => 'mail', 'from' => $form['firm'] . ' <' . $form['email'] . '>', 'resend_api_key' => ''],
            'whatsapp' => ['token' => '', 'phone_number_id' => '', 'template' => 'client_reminder', 'lang' => 'en'],
        ];
        $php = "<?php\n// Written by install.php. Keep this file private.\nreturn " . var_export($config, true) . ";\n";

        $count = (int) $pdo->query('SELECT COUNT(*) FROM profiles')->fetchColumn();
        if ($count === 0) {
            $pdo->prepare('INSERT INTO profiles (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)')
                ->execute([uuid(), strtolower(trim($form['email'])), password_hash($form['password'], PASSWORD_DEFAULT), trim($form['name']), 'admin']);
        }
        $pdo->prepare('UPDATE firm_settings SET name = ?, email = COALESCE(email, ?) WHERE id = 1')->execute([trim($form['firm']), strtolower(trim($form['email']))]);

        if (!is_dir($storage)) @mkdir($storage, 0750, true);
        if (@file_put_contents($configFile, $php) === false) {
            $error = 'Tables are ready, but config.php could not be written. Create api/config.php in File Manager and paste this into it:';
            $manual = $php;
        } else {
            @chmod($configFile, 0640);
            $done = true;
        }
    } catch (Throwable $e) {
        $error = $e instanceof RuntimeException ? $e->getMessage() : 'Setup failed: ' . $e->getMessage();
    }
}
$cronPath = __DIR__ . '/cron.php';
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CA Office Manager setup</title>
<style>
  body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#eef2f7;color:#1a2332;margin:0;padding:32px 16px}
  main{max-width:640px;margin:auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{margin:0 0 4px;font-size:22px} h2{font-size:15px;margin:22px 0 8px;color:#2563eb}
  label{display:block;font-size:13px;color:#475569;margin-top:10px} input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;margin-top:3px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:12px} @media(max-width:520px){.two{grid-template-columns:1fr}}
  button{margin-top:20px;background:#2563eb;color:#fff;border:0;border-radius:8px;padding:11px 18px;font:600 15px system-ui;cursor:pointer;width:100%}
  .err{background:#fde8ee;color:#9f1239;padding:10px 12px;border-radius:8px;margin-top:14px} .ok{background:#e7f7ec;color:#14532d;padding:12px;border-radius:8px}
  code,pre{background:#f1f5f9;border-radius:6px;padding:2px 6px;font-size:13px;word-break:break-all} pre{padding:10px;white-space:pre-wrap}
  .muted{color:#64748b;font-size:13px} ol li{margin:6px 0}
</style></head><body><main>
<h1>CA Office Manager setup</h1>
<?php if ($installed && !$done): ?>
  <p class="ok">The app is already installed. For safety this installer is now switched off.</p>
  <p class="muted">You can delete <code>api/install.php</code> from File Manager. <a href="../">Open the app →</a></p>
<?php elseif ($done): ?>
  <p class="ok"><b>Done.</b> The database is ready and your admin account is created.</p>
  <h2>Two last steps</h2>
  <ol>
    <li>In cPanel open <b>Cron Jobs</b>, choose <b>Once Per Day</b>, and use this command:<br><pre>php <?= $h($cronPath) ?></pre>This creates the monthly GST/TDS tasks and sends reminders every morning.</li>
    <li>Delete <code>api/install.php</code> in File Manager (it is already switched off, this is just tidy).</li>
  </ol>
  <p><a href="../login/">Open the app and sign in →</a></p>
<?php else: ?>
  <p class="muted">First create a database in cPanel → <b>MySQL Databases</b>: add a database, add a user with a strong password, then add the user to the database with <b>ALL PRIVILEGES</b>. Enter those details below.</p>
  <?php if ($error): ?><div class="err"><?= $h($error) ?></div><?php if (!empty($manual)): ?><pre><?= $h($manual) ?></pre><?php endif; ?><?php endif; ?>
  <form method="post" autocomplete="off">
    <h2>1. Database</h2>
    <div class="two">
      <label>Database name<input name="db_name" value="<?= $h($form['db_name']) ?>" placeholder="cpaneluser_caoffice" required></label>
      <label>Database user<input name="db_user" value="<?= $h($form['db_user']) ?>" placeholder="cpaneluser_caadmin" required></label>
      <label>Database password<input name="db_pass" type="password" value="<?= $h($form['db_pass']) ?>"></label>
      <label>Host<input name="db_host" value="<?= $h($form['db_host']) ?>"></label>
    </div>
    <h2>2. Your firm and admin login</h2>
    <label>Firm name<input name="firm" value="<?= $h($form['firm']) ?>" placeholder="Venkatesh &amp; Associates" required></label>
    <div class="two">
      <label>Your name<input name="name" value="<?= $h($form['name']) ?>" required></label>
      <label>Your email (used to sign in)<input name="email" type="email" value="<?= $h($form['email']) ?>" required></label>
    </div>
    <label>Password (at least 8 characters)<input name="password" type="password" minlength="8" required></label>
    <button>Install</button>
  </form>
<?php endif; ?>
</main></body></html>
