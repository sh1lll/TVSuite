// Full-page settings: the same tabs as the on-page panel, usable without a chart open.
// Anything that needs a live chart (previews, P&L meters, sounds, recording) is stubbed here and works in the panel.
import { el, setChildren } from './core/dom.js';
import { Bus } from './core/bus.js';
import { storage, withDefaults, stableStringify } from './core/storage.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings, isOwnWrite } from './core/settings.js';
import { CSS, icon, brandMark } from './ui/kit.js';
import { skinsTab } from './ui/tab-skins.js';
import { sessionsTab } from './ui/tab-sessions.js';
import { toolsTab } from './ui/tab-tools.js';
import { aboutTab } from './ui/tab-about.js';
import { soundTab } from './ui/tab-sound.js';
import { bridgeTab } from './ui/tab-bridge.js';
import { riskTab } from './ui/tab-risk.js';
import { captureTab } from './ui/tab-capture.js';
import * as hostApi from './host-api.js';
import { builtinIndex } from './modules/skins/builtins.js';
import { NEUTRAL_SIGNALS } from './modules/skins/signals.js';

const VIEW_KEYS = ['tab', 'panelOpen', 'skinsView', 'riskView', 'captureView', 'soundView', 'bridgeView'];
const NAV = [['skins', 'Skins'], ['sound', 'Sound'], ['risk', 'Risk'], ['capture', 'Capture'], ['bridge', 'Bridge'], ['sessions', 'Sessions'], ['tools', 'Tools'], ['about', 'About']];
const MAKE = { skins: skinsTab, sound: soundTab, risk: riskTab, capture: captureTab, bridge: bridgeTab, sessions: sessionsTab, tools: toolsTab, about: aboutTab };
const VERSION = chrome.runtime.getManifest().version;

const PAGE_CSS = `
.shell { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 24px; max-width: 1040px; margin: 0 auto; padding: 28px 20px 60px; }
.side { position: sticky; top: 24px; align-self: start; }
.side .brand { display: flex; align-items: center; gap: 9px; font-weight: 600; font-size: 15px; margin: 0 4px 16px; }
.side .brand .mark { width: 24px; height: 24px; }
.side .brand small { color: var(--faint); font-weight: 400; font-size: 11px; }
.nav { display: flex; flex-direction: column; }
.nav button, .nav a { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 0; border-left: 2px solid transparent; background: none; color: var(--muted); cursor: pointer;
  font: inherit; font-size: 13px; text-align: left; text-decoration: none; }
.nav button:hover, .nav a:hover { color: var(--text); background: var(--raise); }
.nav button.on { color: #fff; background: var(--raise); border-left-color: var(--accent); }
.nav hr { border: 0; border-top: 1px solid var(--line); margin: 10px 0; width: 100%; }
.side .note { margin: 14px 4px 0; }
.content { background: var(--panel); border: 1px solid var(--line2); border-radius: 6px; padding: 8px 18px 20px; min-height: 70vh; }
.banner { margin: 10px 0 4px; padding: 8px 10px; border-radius: 4px; background: var(--raise); border: 1px solid var(--line2); color: var(--muted); }
@media (max-width: 760px) { .shell { grid-template-columns: 1fr; } .side { position: static; } .nav { flex-direction: row; flex-wrap: wrap; } }
`;

const noop = () => {};
// Modules that only exist on a chart tab: unknown members become harmless no-ops.
const live = (o = {}) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && k !== 'then' ? noop : undefined) });

async function main() {
  let settings = await loadSettings();
  const bus = new Bus();

  // Writes are re-applied to a fresh copy so a chart tab's newer changes aren't overwritten by this page's older copy.
  let pending = [], flushing = null;
  const flush = () => {
    if (flushing) return flushing;
    flushing = new Promise((r) => setTimeout(r, 120)).then(async () => {
      const fns = pending; pending = []; flushing = null;
      const fresh = await loadSettings();
      for (const fn of fns) fn(fresh);
      await saveSettings(fresh);
    });
    return flushing;
  };

  const host = document.getElementById('mount');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(el('style', {}, CSS + PAGE_CSS));
  const root = el('div', { class: 'root' });
  shadow.append(root);
  const content = el('div', { class: 'content' });
  let current = NAV.some(([id]) => id === settings.ui.tab) ? settings.ui.tab : 'skins';
  const views = {};

  const app = {
    version: VERSION, host: 'settings', live: false, root, bus,
    adapter: { id: 'settings', name: 'Settings page', features: { templates: false }, layoutHost: () => null },
    ...hostApi,
    getSettings: () => settings,
    update(fn, { silent = false } = {}) {
      fn(settings); pending.push(fn); flush();
      if (!silent) bus.emit('settings', settings);
    },
    rerender: () => rerender(),
    queryMain: async () => null,
    setChart: async () => 'none',
    panel: live({ hide: noop, show: noop }),
    skins: live({ builtins: builtinIndex(), status: () => ({ state: 'off' }), signals: () => ({ ...NEUTRAL_SIGNALS }), symbol: () => '', preview: noop, update: noop }),
    sound: live({ muted: () => false, stats: () => ({}), requestVoices: noop }),
    risk: live({ tick: () => null, last: () => null, state: () => ({ trades: [] }), addTrade: async () => { throw new Error('Add trades from the panel on your chart'); }, removeTrade: async () => {}, resetDay: async () => {} }),
    chartTime: live({ days: () => ({}) }),
    recorder: live({ armed: () => false, armError: () => '', recording: () => false, elapsed: () => 0 }),
    voice: live({ supported: false, state: () => ({ listening: false }) }),
    mini: live({ state: () => ({ chart: false, pipSupported: false }), openChart: async () => { throw new Error('Open a TradingView chart to use the mini chart'); }, openPlayer: async () => { throw new Error('Open a TradingView chart to use the player'); } }),
    lights: live({ test: async () => ({ results: [] }) }),
    focus: live({ active: () => false }),
    capture: live({ makeCard: () => null, cardInfo: () => ({ title: '' }), copyCanvas: async () => { throw new Error('Open a chart to make a card'); }, toggleRecording: noop }),
    recap: live({ show: noop }),
    link: live(),
    cowatch: null,
  };

  const needsChart = new Set(['capture']);
  function view(id) {
    if (!views[id]) {
      try { views[id] = MAKE[id](app); }
      catch (err) { console.error('[TVSuite settings]', id, err); views[id] = { el: el('div', { class: 'note' }, `This section couldn’t load here (${err.message}). Open it from the panel on your chart.`) }; }
    }
    return views[id];
  }
  function show(id) {
    current = id;
    for (const b of nav.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === id);
    const v = view(id);
    if (id === 'about') v.render?.();
    setChildren(content, needsChart.has(id) ? el('div', { class: 'banner' }, 'Previews, recording and the mini window need a chart. Your choices here still apply to them.') : null, v.el);
    app.update((s) => { s.ui.tab = id; }, { silent: true });
  }
  function rerender() { for (const k of Object.keys(views)) { views[k].dispose?.(); delete views[k]; } show(current); }

  const nav = el('div', { class: 'nav' },
    ...NAV.map(([id, label]) => el('button', { type: 'button', dataset: { tab: id }, onclick: () => show(id) }, icon(id), label)),
    el('hr'),
    el('a', { href: 'options.html' }, icon('sliders'), 'Accounts, sites & data'),
    el('a', { href: 'journal.html' }, icon('book'), 'Journal'),
    el('a', { href: 'recordings.html' }, icon('film'), 'Recordings'));
  root.append(el('div', { class: 'shell' },
    el('div', { class: 'side' }, el('div', { class: 'brand' }, brandMark(), 'TVSuite', el('small', {}, `v${VERSION}`)), nav,
      el('div', { class: 'note' }, 'Changes save instantly and apply to every open TradingView tab.')),
    content));
  show(current);

  // Settings changed in a chart tab or the popup: refresh unless you're in the middle of typing.
  storage.watch(SETTINGS_KEY, (v) => {
    if (!v || isOwnWrite(v)) return;
    const strip = (x) => ({ ...x, _meta: 0, ui: { ...x.ui, ...Object.fromEntries(VIEW_KEYS.map((k) => [k, 0])) } });
    const changed = stableStringify(strip(v)) !== stableStringify(strip(settings));
    const mine = Object.fromEntries(VIEW_KEYS.map((k) => [k, settings.ui[k]]));
    settings = withDefaults(DEFAULT_SETTINGS, v);
    Object.assign(settings.ui, mine);
    if (!changed) return;
    const a = shadow.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    rerender();
  });
}
main();
