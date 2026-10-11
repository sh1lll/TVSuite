// Extension content script entry (isolated world).
import { startTVSuite } from './app.js';
import { ai, openOptions, fetchGallery, journal, notify, share, recordings, lightsSend } from './host-api.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'panel.toggle') { window.__TVSUITE__?.panel.toggle(); sendResponse({ ok: true }); }
  else if (msg?.type === 'status') sendResponse({ ok: !!window.__TVSUITE__, status: window.__TVSUITE__?.status(), adapter: window.__TVSUITE__?.adapter });
  return false;
});

const boot = () => startTVSuite({ ai, openOptions, fetchGallery, journal, notify, share, recordings, lightsSend }).catch((err) => console.error('[TVSuite] failed to start', err));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
