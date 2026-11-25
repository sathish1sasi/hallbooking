<?php
// Copy to config.php (the web installer does this for you) and fill in.
// Never commit config.php: it holds your database password.
return [
    // cPanel -> MySQL Databases. Names usually look like "cpaneluser_caoffice".
    'db_host' => 'localhost',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',

    // Uploaded client files. Keep this OUTSIDE public_html so files can only be
    // downloaded through the app (which checks the user is signed in).
    // Default: a folder next to public_html, e.g. /home/cpaneluser/ca-office-files
    'storage_dir' => dirname(__DIR__, 2) . '/ca-office-files',

    'timezone' => 'Asia/Kolkata',

    // Email reminders. 'mail' uses your hosting's own mail server (works on most
    // cPanel hosts; use an address on your own domain as "from").
    // 'resend' sends through resend.com and needs an API key.
    'mail' => [
        'driver' => 'mail',
        'from' => 'Your Firm <reminders@yourfirm.in>',
        'resend_api_key' => '',
    ],

    // Optional WhatsApp Cloud API (Meta). Template needs two body variables:
    // {{1}} client name, {{2}} details.
    'whatsapp' => [
        'token' => '',
        'phone_number_id' => '',
        'template' => 'client_reminder',
        'lang' => 'en',
    ],
];
