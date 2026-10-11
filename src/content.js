// Extension content script entry (isolated world).
import { startTVSuite } from './app.js';
import { validateSkin } from './modules/skins/packs.js';

const openOptions = (hash) => chrome.runtime.sendMessage({ type: 'options.open', hash });

// Remote gallery entries are re-validated in the UI and always pass through the trust prompt.
const fetchGallery = () => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'gallery.fetch' }, (res) => {
  if (chrome.runtime.lastError || !res || res.error) return reject(new Error(res?.error || chrome.runtime.lastError?.message || 'gallery unavailable'));
  resolve(res.skins.map((x) => validateSkin(x).skin).filter(Boolean));
}));

const journal = {
  add: (entry) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'journal.add', entry }, (res) => {
    if (chrome.runtime.lastError || !res || res.error) return reject(new Error(res?.error || chrome.runtime.lastError?.message || 'Journal unavailable'));
    resolve();
  })),
  open: () => chrome.runtime.sendMessage({ type: 'journal.open' }),
  list: ({ since = 0 } = {}) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'journal.list', since }, (res) => {
    if (chrome.runtime.lastError || !res || res.error) return reject(new Error(res?.error || chrome.runtime.lastError?.message || 'Journal unavailable'));
    resolve(res.entries);
  })),
};

const notify = (n) => { try { chrome.runtime.sendMessage({ type: 'notify', ...n }).catch(() => {}); } catch (_) { /* extension reloaded */ } };

// Discord/Telegram and the recordings library live in the background worker.
const share = (payload) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'share.send', payload }, (res) => {
  if (chrome.runtime.lastError || !res || res.error) return reject(new Error(res?.error || chrome.runtime.lastError?.message || 'Sharing unavailable'));
  resolve(res);
}));
const recordings = {
  list: () => new Promise((resolve) => chrome.runtime.sendMessage({ type: 'recordings.list' }, (res) => resolve(res?.list || []))),
  open: (id) => chrome.runtime.sendMessage({ type: 'recordings.open', id }),
};

const ai = {
  generate: (prompt) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'ai.generate', prompt }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res || res.error) return reject(new Error(res?.error || 'No response from background worker'));
      resolve(res.skin);
    });
  }),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'panel.toggle') { window.__TVSUITE__?.panel.toggle(); sendResponse({ ok: true }); }
  else if (msg?.type === 'status') sendResponse({ ok: !!window.__TVSUITE__, status: window.__TVSUITE__?.status(), adapter: window.__TVSUITE__?.adapter });
  return false;
});

const boot = () => startTVSuite({ ai, openOptions, fetchGallery, journal, notify, share, recordings }).catch((err) => console.error('[TVSuite] failed to start', err));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
