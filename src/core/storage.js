// Key/value settings store. Uses chrome.storage.local inside the extension and
// localStorage elsewhere (TradingView Desktop / userscript). Values are JSON.
import { IS_EXTENSION } from './env.js';

const PREFIX = 'tvsuite:';

function lsGet(key) {
  try { const raw = localStorage.getItem(PREFIX + key); return raw == null ? undefined : JSON.parse(raw); }
  catch (_) { return undefined; }
}

function lsSet(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (_) { /* quota or disabled */ }
}

export const storage = {
  async get(key, fallback) {
    if (IS_EXTENSION) {
      try {
        const out = await chrome.storage.local.get(key);
        return out[key] === undefined ? fallback : out[key];
      } catch (_) { return fallback; }
    }
    const v = lsGet(key);
    return v === undefined ? fallback : v;
  },

  async set(key, value) {
    if (IS_EXTENSION) {
      try { await chrome.storage.local.set({ [key]: value }); } catch (_) { /* context invalidated */ }
      return;
    }
    lsSet(key, value);
  },

  // Calls fn(newValue) whenever key changes from another context (popup, options page, other tab).
  watch(key, fn) {
    if (IS_EXTENSION) {
      const listener = (changes, area) => {
        if (area === 'local' && key in changes) fn(changes[key].newValue);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
    const listener = (e) => { if (e.key === PREFIX + key) fn(e.newValue == null ? undefined : JSON.parse(e.newValue)); };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  },
};

// Deep-merge saved settings over defaults so new keys added in updates get defaults.
export function withDefaults(defaults, saved) {
  if (saved == null || typeof saved !== 'object' || Array.isArray(saved)) return structuredClone(defaults);
  const out = structuredClone(defaults);
  for (const [k, v] of Object.entries(saved)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k])) {
      out[k] = withDefaults(defaults[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// JSON with sorted object keys. chrome.storage hands values back with keys sorted, so equality checks
// against what we wrote must ignore key order.
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
