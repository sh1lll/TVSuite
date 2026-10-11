// Discord webhooks and Telegram bots, called from the background worker only (no CORS, and the webhook URL /
// bot token never reach a web page). Payload builders are pure and unit-tested.
export const SECRETS_KEY = 'share:secrets';
const DISCORD_RE = /^https:\/\/(?:canary\.|ptb\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
const LOOPBACK_RE = /^http:\/\/127\.0\.0\.1:\d{2,5}\//;
export const DISCORD_MAX = 10 * 1024 * 1024;      // webhook upload limit since 2025-01-16
export const TELEGRAM_MAX = 50 * 1024 * 1024;     // bot upload limit
export const TELEGRAM_PHOTO_MAX = 10 * 1024 * 1024;

// allowLoopback is only true in the test build (an extension copy granted http://127.0.0.1/*).
export function validWebhook(url, { allowLoopback = false } = {}) {
  const u = String(url || '').trim();
  return DISCORD_RE.test(u) || (allowLoopback && LOOPBACK_RE.test(u) && /\/api\/webhooks\//.test(u));
}
export function validTelegram({ token, chatId }) {
  return /^\d{5,15}:[\w-]{30,60}$/.test(String(token || '')) && /^(-?\d{3,20}|@[A-Za-z]\w{4,31})$/.test(String(chatId || ''));
}

// Discord: text (≤2000), an optional embed, and an optional file.
export function discordPayload({ text = '', title = '', fields = [], color = 0x5b8cff, file = null, username = 'TVSuite' }) {
  const content = String(text).slice(0, 2000);
  const embed = title || fields.length ? { title: String(title).slice(0, 256), color, fields: fields.slice(0, 10).map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024) || '—', inline: f.inline !== false })), ...(file && /^image\//.test(file.type) ? { image: { url: `attachment://${file.name}` } } : {}) } : null;
  const json = { username, content, ...(embed ? { embeds: [embed] } : {}), ...(file ? { attachments: [{ id: 0, filename: file.name }] } : {}) };
  if (!file) return { json };
  if (file.size > DISCORD_MAX) return { json: { ...json, attachments: undefined, embeds: embed ? [{ ...embed, image: undefined }] : undefined, content: `${content}\n(${file.name} is over Discord’s 10 MB limit, not attached)`.trim() }, skipped: file.name };
  return { json, file };
}

// Telegram: which method and field for a file, honouring size limits.
export function telegramMethod(file) {
  if (!file) return { method: 'sendMessage' };
  if (/^image\//.test(file.type) && file.size <= TELEGRAM_PHOTO_MAX) return { method: 'sendPhoto', field: 'photo' };
  if (/^video\//.test(file.type) && file.size <= TELEGRAM_MAX) return { method: 'sendVideo', field: 'video' };
  if (file.size <= TELEGRAM_MAX) return { method: 'sendDocument', field: 'document' };
  return { method: 'sendMessage', skipped: file.name };
}

async function post(url, body, retries = 1) {
  const r = await fetch(url, { method: 'POST', body, ...(typeof body === 'string' ? { headers: { 'Content-Type': 'application/json' } } : {}) });
  if (r.status === 429 && retries > 0) {
    let wait = 1;
    try { const j = await r.clone().json(); wait = j.retry_after ?? j.parameters?.retry_after ?? 1; } catch (_) { wait = +r.headers.get('Retry-After') || 1; }
    await new Promise((res) => setTimeout(res, Math.min(10, wait) * 1000));
    return post(url, body, retries - 1);
  }
  if (!r.ok) { let msg = `HTTP ${r.status}`; try { const j = await r.json(); msg += `: ${j.message || j.description || ''}`; } catch (_) { /* no body */ } throw new Error(msg); }
  return r;
}

export async function sendDiscord(webhook, msg, opts) {
  if (!validWebhook(webhook, opts)) throw new Error('That isn’t a Discord webhook URL');
  const p = discordPayload(msg);
  if (!p.file) { await post(`${webhook}?wait=true`, JSON.stringify(p.json)); return { skipped: p.skipped || null }; }
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify(p.json));
  fd.append('files[0]', p.file, p.file.name);
  await post(`${webhook}?wait=true`, fd);
  return { skipped: null };
}

export async function sendTelegram({ token, chatId, base = 'https://api.telegram.org' }, { text = '', title = '', fields = [], file = null }, { allowLoopback = false } = {}) {
  if (!validTelegram({ token, chatId })) throw new Error('Check the Telegram bot token and chat id');
  if (base !== 'https://api.telegram.org' && !(allowLoopback && LOOPBACK_RE.test(`${base}/`))) throw new Error('Bad Telegram API base');
  const plain = [title, text, ...fields.map((f) => `${f.name}: ${f.value}`)].filter(Boolean).join('\n').slice(0, 4000);
  const m = telegramMethod(file);
  const url = `${base}/bot${token}/${m.method}`;
  if (m.method === 'sendMessage') { await post(url, JSON.stringify({ chat_id: chatId, text: (m.skipped ? `${plain}\n(${m.skipped} too large to attach)` : plain) || '—' })); return { skipped: m.skipped || null }; }
  const fd = new FormData();
  fd.append('chat_id', chatId);
  fd.append('caption', plain.slice(0, 1024));
  fd.append(m.field, file, file.name);
  await post(url, fd);
  return { skipped: null };
}
