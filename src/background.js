// MV3 background service worker: AI generation (holds the API key) and custom-site registration.
import { generateSkin, DEFAULT_AI } from './ai/providers.js';
import { journalStore } from './modules/journal/store.js';
import { selectionToTradingView } from './modules/bridge/symbols.js';
import { recordingsStore } from './core/recordings-store.js';
import { SECRETS_KEY, sendDiscord, sendTelegram } from './share/send.js';

// The e2e suite runs a copy of the extension granted http://127.0.0.1/* so it can talk to local mock servers.
const allowLoopback = () => (chrome.runtime.getManifest().host_permissions || []).includes('http://127.0.0.1/*');

function dataUrlToBlob(url) {
  const m = /^data:([\w/+.-]+);base64,(.*)$/.exec(url || '');
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

// msg: { kind, targets?, text, title, fields, image (data URL) | recordingId, filename }
async function share(msg) {
  const [{ settings }, { [SECRETS_KEY]: secrets = {} }] = await Promise.all([chrome.storage.local.get('settings'), chrome.storage.local.get(SECRETS_KEY)]);
  const prefs = settings?.share || {};
  const targets = (msg.targets || ['discord', 'telegram']).filter((t) => (msg.targets ? true : prefs[t]?.enabled && prefs[t]?.[msg.kind] !== false));
  let file = null;
  if (msg.image) { const b = dataUrlToBlob(msg.image); if (b) file = new File([b], msg.filename || `tvsuite.${b.type.split('/')[1] || 'png'}`, { type: b.type }); }
  if (msg.recordingId) { const r = await recordingsStore.get(msg.recordingId); if (r) file = new File([r.blob], r.name, { type: r.mime }); }
  const body = { text: msg.text || '', title: msg.title || '', fields: msg.fields || [], file };
  const results = {};
  for (const t of targets) {
    try {
      if (t === 'discord') { const url = secrets.discord?.webhook; if (!url) throw new Error('No Discord webhook set'); results[t] = { ok: true, ...(await sendDiscord(url, body, { allowLoopback: allowLoopback() })) }; }
      else if (t === 'telegram') { const tg = secrets.telegram || {}; results[t] = { ok: true, ...(await sendTelegram(tg, body, { allowLoopback: allowLoopback() })) }; }
    } catch (err) { results[t] = { ok: false, error: err.message }; }
  }
  return { results, targets };
}

const AI_KEY = 'ai';
const GALLERY_URL = 'https://raw.githubusercontent.com/sh1lll/TVSuite/main/gallery/index.json';

async function aiConfig() {
  const { [AI_KEY]: cfg } = await chrome.storage.local.get(AI_KEY);
  return { ...DEFAULT_AI, ...(cfg || {}) };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'ai.generate') {
    aiConfig()
      .then((cfg) => generateSkin(cfg, msg.prompt))
      .then((skin) => sendResponse({ skin }), (err) => sendResponse({ error: err.message || String(err) }));
    return true; // async response
  }
  if (msg?.type === 'journal.add') {
    journalStore.add(msg.entry)
      .then(() => chrome.storage.local.set({ 'journal:rev': Date.now() }))
      .then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: err.message || String(err) }));
    return true;
  }
  if (msg?.type === 'gallery.fetch') {
    fetch(GALLERY_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => sendResponse({ skins: Array.isArray(d?.skins) ? d.skins.slice(0, 200) : [] }), (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'journal.list') {
    journalStore.all()
      .then((all) => sendResponse({ entries: all.filter((e) => e.createdAt >= (+msg.since || 0)).slice(0, 100).map(({ image, ...rest }) => rest) }), (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'share.send') {
    share(msg.payload || {}).then((r) => sendResponse(r), (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'recordings.list') {
    recordingsStore.list().then((list) => sendResponse({ list }), (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'recordings.remove') {
    recordingsStore.remove(String(msg.id)).then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'recordings.open') {
    chrome.tabs.create({ url: chrome.runtime.getURL(`recordings.html${msg.id ? `#${encodeURIComponent(msg.id)}` : ''}`) });
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === 'journal.open') {
    chrome.tabs.create({ url: chrome.runtime.getURL('journal.html') });
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === 'options.open') {
    chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${msg.hash ? `#${msg.hash}` : ''}`) });
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === 'notify') {
    showNotification(msg, sender.tab).then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg?.type === 'sites.sync') {
    syncSites().then(() => sendResponse({ ok: true }), (err) => sendResponse({ error: err.message }));
    return true;
  }
  return false;
});

// Custom sites (TopstepX/ProjectX, brokers, any canvas dashboard): content scripts are registered
// dynamically only for hosts the user explicitly granted.
async function syncSites() {
  const { settings } = await chrome.storage.local.get('settings');
  const sites = settings?.sites || [];
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const ids = existing.filter((s) => s.id.startsWith('tvsuite-site-')).map((s) => s.id);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  const granted = [];
  for (const site of sites) {
    const origins = [`https://${site.host}/*`];
    if (await chrome.permissions.contains({ origins })) granted.push({ site, origins });
  }
  if (!granted.length) return;
  await chrome.scripting.registerContentScripts(granted.flatMap(({ site, origins }, i) => [
    { id: `tvsuite-site-${i}-main`, matches: origins, js: ['main-world.js'], runAt: 'document_start', world: 'MAIN', allFrames: true, persistAcrossSessions: true },
    { id: `tvsuite-site-${i}`, matches: origins, js: ['content.js'], runAt: 'document_idle', allFrames: site.kind !== 'generic', persistAcrossSessions: true },
  ]));
}

chrome.runtime.onInstalled.addListener(() => {
  syncSites().catch(() => {});
  // Platform Bridge: select a ticker on any page (broker, news, X, Discord web…) → open it in TradingView.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'tvsuite-open-tv', title: 'Open “%s” in TradingView', contexts: ['selection'] });
  });
});

chrome.contextMenus?.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'tvsuite-open-tv') return;
  const { settings } = await chrome.storage.local.get('settings');
  const tv = selectionToTradingView(info.selectionText, settings?.bridge?.projectxRoots || {});
  // Unrecognized text: hand the first word to TradingView and let its own symbol resolver try.
  const sym = tv || String(info.selectionText || '').trim().split(/\s+/)[0].replace(/^\$/, '').slice(0, 40).toUpperCase();
  chrome.tabs.create({ url: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}` });
});
chrome.permissions.onAdded.addListener(() => { syncSites().catch(() => {}); });

// Desktop notifications (optional permission). Clicking one focuses the chart tab that sent it.
async function showNotification({ title, body, tag }, tab) {
  if (!chrome.notifications || !(await chrome.permissions.contains({ permissions: ['notifications'] }))) return;
  const id = `tvs|${tab?.id ?? ''}|${tab?.windowId ?? ''}|${tag || ''}|${Date.now()}`;
  await chrome.notifications.create(id, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: String(title || 'TVSuite').slice(0, 80), message: String(body || '').slice(0, 200), priority: 1 });
}
function onNotificationClick(id) {
  const [, tabId, windowId] = id.split('|');
  if (tabId) chrome.tabs.update(+tabId, { active: true }).catch(() => {});
  if (windowId) chrome.windows.update(+windowId, { focused: true }).catch(() => {});
  chrome.notifications.clear(id);
}
// The listener only exists once the permission is granted, so register it whenever possible.
const hookNotifications = () => { if (chrome.notifications && !chrome.notifications.onClicked.hasListener(onNotificationClick)) chrome.notifications.onClicked.addListener(onNotificationClick); };
hookNotifications();
chrome.permissions.onAdded.addListener(hookNotifications);
