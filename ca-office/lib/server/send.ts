import 'server-only';

export type SendResult = { ok: true } | { ok: false; error: string };

export const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.REMINDER_FROM_EMAIL);
export const whatsappConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** Email through Resend (https://resend.com). */
export async function sendEmail(to: string, subject: string, text: string, replyTo?: string | null): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, error: 'Email is not configured (RESEND_API_KEY / REMINDER_FROM_EMAIL).' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.REMINDER_FROM_EMAIL, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  return res.ok ? { ok: true } : { ok: false, error: `Email provider said ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

/** Indian mobile numbers: 10 digits -> 91XXXXXXXXXX. */
export function normalisePhone(raw: string | null): string | null {
  const d = (raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 12 && d.startsWith('91')) return d;
  return null;
}

/**
 * WhatsApp through the Meta WhatsApp Cloud API. Business-initiated messages
 * must use an approved template; ours takes two body parameters:
 * {{1}} = client name, {{2}} = one-line summary of what is pending.
 */
export async function sendWhatsApp(phone: string, clientName: string, summary: string): Promise<SendResult> {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).' };
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 900);
  const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE ?? 'client_reminder',
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: clean(clientName) }, { type: 'text', text: clean(summary) }] }],
      },
    }),
  });
  return res.ok ? { ok: true } : { ok: false, error: `WhatsApp said ${res.status}: ${(await res.text()).slice(0, 200)}` };
}
