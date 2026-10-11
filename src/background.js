// MV3 background service worker: AI generation (holds the API key) and custom-site registration.
import { generateSkin, DEFAULT_AI } from './ai/providers.js';

const AI_KEY = 'ai';

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

chrome.runtime.onInstalled.addListener(() => { syncSites().catch(() => {}); });
chrome.permissions.onAdded.addListener(() => { syncSites().catch(() => {}); });
