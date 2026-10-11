// MV3 background service worker: AI generation (holds the API key) and custom-site registration.
import { generateSkin, DEFAULT_AI } from './ai/providers.js';
import { journalStore } from './modules/journal/store.js';
import { selectionToTradingView } from './modules/bridge/symbols.js';

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
