<?php

function mail_cfg(): array { return config()['mail'] ?? ['driver' => 'mail', 'from' => '']; }
function wa_cfg(): array { return config()['whatsapp'] ?? []; }

function email_configured(): bool {
    $m = mail_cfg();
    if (empty($m['from'])) return false;
    return ($m['driver'] ?? 'mail') === 'resend' ? !empty($m['resend_api_key']) : function_exists('mail');
}
function whatsapp_configured(): bool { $w = wa_cfg(); return !empty($w['token']) && !empty($w['phone_number_id']); }

function from_address(string $from): string { return preg_match('/<([^>]+)>/', $from, $m) ? $m[1] : trim($from); }

/** @return array{ok: bool, error?: string} */
function send_email(string $to, string $subject, string $text, ?string $replyTo): array {
    $m = mail_cfg();
    if (!email_configured()) return ['ok' => false, 'error' => 'Email is not set up. Add a "from" address in api/config.php.'];
    if (($m['driver'] ?? 'mail') === 'resend') {
        $res = http_post_json('https://api.resend.com/emails', ['Authorization: Bearer ' . $m['resend_api_key']],
            ['from' => $m['from'], 'to' => [$to], 'subject' => $subject, 'text' => $text] + ($replyTo ? ['reply_to' => $replyTo] : []));
        return $res['ok'] ? ['ok' => true] : ['ok' => false, 'error' => 'Email provider said ' . $res['status'] . ': ' . substr($res['body'], 0, 200)];
    }
    // Hosting's own mail server.
    $headers = [
        'From: ' . $m['from'],
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];
    if ($replyTo) $headers[] = 'Reply-To: ' . $replyTo;
    $ok = @mail($to, mb_encode_mimeheader($subject, 'UTF-8'), $text, implode("\r\n", $headers), '-f' . from_address($m['from']));
    return $ok ? ['ok' => true] : ['ok' => false, 'error' => 'The hosting mail server refused the message. Check the "from" address is on your domain.'];
}

function normalise_phone(?string $raw): ?string {
    $d = ltrim(preg_replace('/\D/', '', (string) $raw), '0');
    if (strlen($d) === 10) return '91' . $d;
    if (strlen($d) === 12 && str_starts_with($d, '91')) return $d;
    return null;
}

function send_whatsapp(string $phone, string $name, string $summary): array {
    $w = wa_cfg();
    if (!whatsapp_configured()) return ['ok' => false, 'error' => 'WhatsApp is not set up in api/config.php.'];
    $clean = fn ($s) => mb_substr(trim(preg_replace('/\s+/', ' ', $s)), 0, 900);
    $res = http_post_json('https://graph.facebook.com/v20.0/' . $w['phone_number_id'] . '/messages', ['Authorization: Bearer ' . $w['token']], [
        'messaging_product' => 'whatsapp', 'to' => $phone, 'type' => 'template',
        'template' => ['name' => $w['template'] ?? 'client_reminder', 'language' => ['code' => $w['lang'] ?? 'en'],
            'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $clean($name)], ['type' => 'text', 'text' => $clean($summary)]]]]],
    ]);
    return $res['ok'] ? ['ok' => true] : ['ok' => false, 'error' => 'WhatsApp said ' . $res['status'] . ': ' . substr($res['body'], 0, 200)];
}

function http_post_json(string $url, array $headers, array $body): array {
    if (!function_exists('curl_init')) return ['ok' => false, 'status' => 0, 'body' => 'PHP curl extension is not enabled.'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => array_merge($headers, ['Content-Type: application/json']),
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]);
    $out = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => $out === false ? $err : (string) $out];
}
