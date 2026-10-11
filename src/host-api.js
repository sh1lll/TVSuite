// Calls into the background worker, shared by the content script and the settings page.
import { validateSkin } from './modules/skins/packs.js';

export const openOptions = (hash) => chrome.runtime.sendMessage({ type: 'options.open', hash });

// Remote gallery entries are re-validated in the UI and always pass through the trust prompt.
export const fetchGallery = () => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'gallery.fetch' }, (res) => {
  if (chrome.runtime.lastError || !res || res.error) return reject(new Error(res?.error || chrome.runtime.lastError?.message || 'gallery unavailable'));
  resolve(res.skins.map((x) => validateSkin(x).skin).filter(Boolean));
}));

export const journal = {
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

export const notify = (n) => { try { chrome.runtime.sendMessage({ type: 'notify', ...n }).catch(() => {}); } catch (_) { /* extension reloaded */ } };

// Discord/Telegram and the recordings library live in the background worker.
export const share = (payload) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'share.send', payload }, (res) => {
  if (chrome.runtime.lastError || !res || res.error) return reject(new Error(res?.error || chrome.runtime.lastError?.message || 'Sharing unavailable'));
  resolve(res);
}));
export const recordings = {
  list: () => new Promise((resolve) => chrome.runtime.sendMessage({ type: 'recordings.list' }, (res) => resolve(res?.list || []))),
  open: (id) => chrome.runtime.sendMessage({ type: 'recordings.open', id }),
};

// Lights are driven by the background worker (it can reach your home network).
export const lightsSend = (msg) => new Promise((resolve) => chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : res)));

export const ai = {
  pine: (code, lang) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'ai.pine', code, lang }, (res) => {
    if (chrome.runtime.lastError || !res || res.error) return reject(new Error(res?.error || chrome.runtime.lastError?.message || 'No response from background worker'));
    resolve(res);
  })),
  generate: (prompt) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'ai.generate', prompt }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res || res.error) return reject(new Error(res?.error || 'No response from background worker'));
      resolve(res.skin);
    });
  }),
};

