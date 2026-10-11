// The single settings document. New keys get defaults via withDefaults() on load.
import { DEFAULT_RISK } from '../modules/risk/rules.js';
import { storage, withDefaults } from './storage.js';
import { DEFAULT_REACTIVE } from '../modules/skins/signals.js';
import { DEFAULT_SESSIONS } from '../modules/sessions/sessions.js';
import { DEFAULT_SOUND } from '../modules/sound/events.js';

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
    seeded: false,          // starter custom skins installed into the library once
  },
  sound: structuredClone(DEFAULT_SOUND),
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
    skinsView: 'library',
  },
  sites: [],                // custom sites for the generic adapter: { host, selector }
  risk: structuredClone(DEFAULT_RISK),
  chartTime: {
    enabled: true,            // local only: how long you're on the chart per day, session and symbol
    countWhen: 'focused',     // focused | visible
    idleMin: 5,               // stop counting after this long without mouse/keyboard activity
    sessions: [],             // [] = all; otherwise only these session ids (plus 'none' = outside sessions)
    dailyLimitMin: 0,         // reminder when today's chart time passes this (0 = off)
    breakEveryMin: 0,         // break reminder after this much continuous chart time (0 = off)
    breakLenMin: 5,           // a gap this long counts as a break
  },
  capture: {
    hotkey: 'Alt+Shift+S',      // screenshot card → clipboard
    miniHotkey: 'Alt+Shift+P',  // mini chart window
    card: { theme: 'midnight', aspect: '16:9', title: '', watermark: '', show: { price: true, session: true, pnl: true, time: true, brand: true } },
    recorder: {
      auto: false,              // start when a trade is entered, stop after you're flat
      stopOnExit: true,
      postRollSec: 10,
      preRollSec: 15,           // keep this many seconds before the entry (WebCodecs; not with mic narration)
      maxMin: 30,
      useOpenPnl: true,         // when Risk Guard reads open P&L from the screen, ≠ 0 means "in a trade"
      alsoOn: { tvAlert: false, priceAlert: false },
      fps: 15,
      quality: 'medium',        // low | medium | high
      height: 720,              // 720 | 1080 | 'native'
      overlays: { symbol: true, timer: true, pnl: true, events: true, watermark: true },
      watermark: '',
      mic: false,
      save: 'library',          // library | download | both
      keep: 20,
      hotkey: 'Alt+Shift+R',
    },
  },
  share: {                      // which things go to Discord/Telegram automatically (webhook/token live in options)
    discord: { enabled: false, cards: true, journal: false, risk: false, recordings: false, recap: true },
    telegram: { enabled: false, cards: true, journal: false, risk: false, recordings: false, recap: true },
  },
  voice: {
    enabled: false,             // opt-in: Chrome's recognition sends audio to Google unless on-device is available
    mode: 'push',               // push (press the hotkey, say one command) | wake (listen for "suite …")
    hotkey: 'Alt+Shift+V',
    wakeWord: 'suite',
    lang: 'en-US',
    onDevice: true,             // use on-device recognition when Chrome offers it
    onDeviceOnly: false,        // never fall back to cloud recognition
    reply: true,                // speak the answer
  },
  lights: {
    enabled: false,             // devices are set up in Options → Lights
    brightness: 0.8,
    base: 'session',            // session (session colour) | fixed | none (events only)
    fixedColor: '#5b8cff',
    offOutside: false,          // lights off when no session is open
    events: {
      tradeEntry: { on: true, color: '#22c55e' }, tradeExit: { on: true, color: '#5b8cff' }, alert: { on: true, color: '#f7a600' },
      riskWarn: { on: true, color: '#f7a600' }, riskBreach: { on: true, color: '#f23645' }, riskTarget: { on: true, color: '#22c55e' },
      calm: { on: false, color: '#f7a600' },
    },
  },
  recap: {
    auto: 'off',               // off | session (when a session closes) | day (at the trading-day reset)
    sessions: [],              // [] = every session; otherwise only these session ids
  },
  cowatch: { name: '', stun: true, follow: true, share: true },
  bridge: {
    share: true,              // publish this tab's symbol to your other TVSuite tabs (local storage only)
    projectxRoots: {},        // user overrides: { CL: 'CLE' } for ProjectX/TopstepX contract ids
    watchlistTo: 'ninjatrader',
  },
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
