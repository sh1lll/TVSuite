// Extension content script entry (isolated world).
import { startTVSuite } from './app.js';

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

const boot = () => startTVSuite({ ai }).catch((err) => console.error('[TVSuite] failed to start', err));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
