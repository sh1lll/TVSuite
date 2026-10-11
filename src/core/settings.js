// The single settings document. New keys get defaults via withDefaults() on load.
import { storage, withDefaults } from './storage.js';
import { DEFAULT_REACTIVE } from '../modules/skins/signals.js';
import { DEFAULT_SESSIONS } from '../modules/sessions/sessions.js';

export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS = {
  skins: {
    enabled: true,
    active: { kind: 'builtin', base: 'aurora', id: 'aurora', name: 'Aurora' },
    mode: 'under',          // 'under' (chart background cleared) | 'overlay' (blend layer above the chart)
    blend: 'screen',        // overlay blend mode
    opacity: 0.9,
    dim: 0.25,
    blur: 0,
    saturate: 1,
    grayscale: false,
    fps: 30,
    scale: 0.75,            // render resolution relative to device pixels
    includeAxes: false,     // also clear price/time axis backgrounds
    params: {},             // per-skin param overrides: { [skinId]: {...} }
    library: [],            // user skins (validated packs)
    reactive: structuredClone(DEFAULT_REACTIVE),
    dayStartTz: 'UTC',      // when "distance from the daily open" resets
    sessionThemes: false,
    perSymbol: {},          // { [symbol]: skin record } — wins over session themes and the default skin
    playlist: { enabled: false, minutes: 15, ids: [] }, // rotate through these skin ids on the clock
  },
  sessions: {
    list: structuredClone(DEFAULT_SESSIONS),
    hud: true,
  },
  templates: {
    concurrency: 4,
    keepSnapshots: 20,
    snapshotBeforeRestore: true,
    autoBackup: { enabled: false, everyHours: 24 },
  },
  tools: {
    focusHotkey: 'Alt+Shift+F',
    journalHotkey: 'Alt+Shift+J',
    risk: { account: 10000, riskPct: 1, entry: 0, stop: 0, market: 'stock', pointValue: 1, lotSize: 100000, pipSize: 0.0001 },
  },
  ui: {
    panelHotkey: 'Alt+Shift+T',
    skinHotkey: 'Alt+Shift+K',
    streamHotkey: 'Alt+Shift+H', // hide all TVSuite UI (clean screenshots / streams)
    fab: true,
    panelOpen: false,
    tab: 'skins',
  },
  sites: [],                // custom sites for the generic adapter: { host, selector }
};

export async function loadSettings() {
  return withDefaults(DEFAULT_SETTINGS, await storage.get(SETTINGS_KEY));
}

// Every context (each tab's content script, popup, options page) tags its writes, so a tab can tell its
// own storage echoes apart from real changes made elsewhere — even when the content is identical.
export const WRITER_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
let rev = 0;

export async function saveSettings(settings) {
  settings._meta = { writer: WRITER_ID, rev: ++rev };
  return storage.set(SETTINGS_KEY, settings);
}

export function isOwnWrite(value) { return value?._meta?.writer === WRITER_ID; }
