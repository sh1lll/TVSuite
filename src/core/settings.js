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
  },
  sessions: {
    list: structuredClone(DEFAULT_SESSIONS),
    hud: true,
  },
  templates: {
    concurrency: 4,
    keepSnapshots: 20,
    snapshotBeforeRestore: true,
  },
  tools: {
    focusHotkey: 'Alt+Shift+F',
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

export async function saveSettings(settings) {
  await storage.set(SETTINGS_KEY, settings);
}
