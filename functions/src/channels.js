/**
 * Adaptadores de canales de notificación.
 * Cada función devuelve { channel, status: 'sent'|'partial'|'error'|'skipped', count, failed, error? }
 * Un canal sin configuración devuelve 'skipped' (estructura preparada).
 */
const admin = require('firebase-admin');
const { logger } = require('firebase-functions');

const env = (k, d = '') => process.env[k] || d;
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const summarize = (channel, ok, failed, error) => ({
  channel,
  status: ok && !failed ? 'sent' : ok ? 'partial' : failed ? 'error' : 'skipped',
  count: ok,
  failed,
  ...(error ? { error: String(error).slice(0, 300) } : {}),
});

/** Ejecuta fn sobre items con concurrencia limitada. */
async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]).then(
        (v) => ({ ok: true, v }),
        (e) => ({ ok: false, e }),
      );
    }
  });
  await Promise.all(workers);
  return results;
}

/** Normaliza a E.164 (+57...). */
function normalizePhone(p) {
  if (!p) return null;
  const raw = String(p).trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+${env('DEFAULT_COUNTRY_CODE', '57')}${digits}`;
  return `+${digits}`;
}

/* ------------------------------ PUSH (FCM) ------------------------------ */

function buildMessage({ title, body, data = {}, link, critical, tag }) {
  const strData = Object.fromEntries(Object.entries({ ...data, link: link || '' }).map(([k, v]) => [k, String(v ?? '')]));
  return {
    notification: { title, body },
    data: strData,
    android: { priority: 'high', notification: { channelId: 'emergencias', sound: 'default', tag } },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', 'interruption-level': critical ? 'time-sensitive' : 'active' } },
    },
    webpush: {
      headers: { Urgency: 'high', TTL: '3600' },
      notification: {
        title,
        body,
        tag,
        renotify: true,
        requireInteraction: Boolean(critical),
        vibrate: [600, 200, 600, 200, 900],
      },
      ...(link ? { fcmOptions: { link } } : {}),
    },
  };
}

async function pushTopic({ topic, condition, ...msg }) {
  try {
    await admin.messaging().send({ ...buildMessage(msg), ...(condition ? { condition } : { topic }) });
    return summarize('push', 1, 0);
  } catch (e) {
    logger.error('push topic', e);
    return summarize('push', 0, 1, e.message);
  }
}

/** Push a tokens concretos; elimina tokens inválidos. */
async function pushTokens(tokens, msg) {
  const list = [...new Set(tokens)].filter(Boolean);
  if (!list.length) return summarize('push', 0, 0);
  let ok = 0;
  let failed = 0;
  const invalid = [];
  for (const part of chunk(list, 500)) {
    const res = await admin.messaging().sendEachForMulticast({ ...buildMessage(msg), tokens: part });
    ok += res.successCount;
    failed += res.failureCount;
    res.responses.forEach((r, i) => {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) invalid.push(part[i]);
    });
  }
  await Promise.all(invalid.map((t) => admin.firestore().doc(`fcmTokens/${t}`).delete().catch(() => {})));
  return summarize('push', ok, failed);
}

async function pushUsers(uids, msg) {
  if (!uids.length) return summarize('push', 0, 0);
  const db = admin.firestore();
  const tokens = [];
  for (const part of chunk([...new Set(uids)], 30)) {
    const snap = await db.collection('fcmTokens').where('uid', 'in', part).get();
    snap.forEach((d) => tokens.push(d.id));
  }
  return pushTokens(tokens, msg);
}

/* ------------------------------ CORREO ------------------------------ */

let transporter = null;
function mailer() {
  if (!env('SMTP_HOST')) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port: Number(env('SMTP_PORT', '587')),
      secure: env('SMTP_SECURE') === 'true',
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
      pool: true,
      maxConnections: 3,
    });
  }
  return transporter;
}

async function sendEmail(to, subject, html, text) {
  const t = mailer();
  const list = [...new Set(to.filter((e) => /^\S+@\S+\.\S+$/.test(e || '')))];
  if (!t || !list.length) return summarize('email', 0, 0);
  let ok = 0;
  let failed = 0;
  let lastErr;
  // BCC por lotes: los destinatarios no ven las direcciones de los demás
  for (const part of chunk(list, 80)) {
    try {
      await t.sendMail({ from: env('SMTP_FROM', env('SMTP_USER')), to: env('SMTP_FROM', env('SMTP_USER')), bcc: part, subject, html, text, priority: 'high' });
      ok += part.length;
    } catch (e) {
      failed += part.length;
      lastErr = e.message;
      logger.error('email', e);
    }
  }
  return summarize('email', ok, failed, lastErr);
}

/* ------------------------------ WHATSAPP ------------------------------ */

/**
 * WhatsApp Business Cloud API. Mensajes iniciados por la empresa requieren
 * plantilla aprobada por Meta (WHATSAPP_TEMPLATE).
 */
async function sendWhatsApp(phones, params) {
  const token = env('WHATSAPP_TOKEN');
  const phoneId = env('WHATSAPP_PHONE_ID');
  const list = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  if (!token || !phoneId || !list.length) return summarize('whatsapp', 0, 0);
  const url = `https://graph.facebook.com/${env('WHATSAPP_API_VERSION', 'v21.0')}/${phoneId}/messages`;
  const results = await mapLimit(list, 20, async (to) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace('+', ''),
        type: 'template',
        template: {
          name: env('WHATSAPP_TEMPLATE', 'alerta_emergencia'),
          language: { code: env('WHATSAPP_LANG', 'es') },
          components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p).slice(0, 200) })) }],
        },
      }),
    });
    if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`);
  });
  const ok = results.filter((r) => r.ok).length;
  const err = results.find((r) => !r.ok)?.e?.message;
  if (err) logger.warn('whatsapp', err);
  return summarize('whatsapp', ok, list.length - ok, err);
}

/* ------------------------------ SMS ------------------------------ */

async function sendSMS(phones, text) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const auth = env('TWILIO_AUTH_TOKEN');
  const list = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  if (!sid || !auth || !list.length || (!env('TWILIO_FROM') && !env('TWILIO_MESSAGING_SERVICE_SID'))) {
    return summarize('sms', 0, 0);
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const basic = Buffer.from(`${sid}:${auth}`).toString('base64');
  const results = await mapLimit(list, 10, async (to) => {
    const body = new URLSearchParams({ To: to, Body: text.slice(0, 600) });
    if (env('TWILIO_MESSAGING_SERVICE_SID')) body.set('MessagingServiceSid', env('TWILIO_MESSAGING_SERVICE_SID'));
    else body.set('From', env('TWILIO_FROM'));
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${basic}` }, body });
    if (!r.ok) throw new Error(`SMS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  });
  const ok = results.filter((r) => r.ok).length;
  const err = results.find((r) => !r.ok)?.e?.message;
  if (err) logger.warn('sms', err);
  return summarize('sms', ok, list.length - ok, err);
}

module.exports = { pushTopic, pushTokens, pushUsers, sendEmail, sendWhatsApp, sendSMS, normalizePhone, chunk, mapLimit };
