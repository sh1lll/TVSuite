// Runtime environment detection. TVSuite runs in three hosts:
//  - "extension": a Chrome MV3 content script (chrome.runtime available)
//  - "desktop":   injected into TradingView Desktop over CDP by desktop/launcher.mjs
//  - "userscript": pasted into the console / loaded by a userscript manager
export function detectHost() {
  if (globalThis.__TVSUITE_HOST__) return globalThis.__TVSUITE_HOST__;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) return 'extension';
  } catch (_) { /* extension context invalidated */ }
  return 'userscript';
}

export const HOST = detectHost();
export const IS_EXTENSION = HOST === 'extension';

// Resolve a packaged resource URL (only meaningful inside the extension).
export function resourceUrl(path) {
  return IS_EXTENSION ? chrome.runtime.getURL(path) : null;
}
