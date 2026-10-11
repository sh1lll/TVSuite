// Shared bootstrap for every host (extension content script, TradingView Desktop injection, userscript).
import { Bus } from './core/bus.js';
import { storage, withDefaults, stableStringify } from './core/storage.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings, isOwnWrite } from './core/settings.js';
import { HOST } from './core/env.js';
import { debounce } from './core/dom.js';
import { matchHotkey, isTypingTarget } from './core/hotkeys.js';
import { pickAdapter } from './adapters/tradingview.js';
import { createSkinsModule } from './modules/skins/index.js';
import { createSoundModule } from './modules/sound/index.js';
import { SkinHost } from './modules/skins/host.js';
import { createFocus } from './modules/tools/focus.js';
import { createSymbolLink } from './modules/bridge/link.js';
import { createRiskGuard } from './modules/risk/index.js';
import { createChartTime } from './modules/risk/chart-time.js';
import { createBlockOverlay } from './ui/block-overlay.js';
import { createRecorder } from './modules/capture/recorder.js';
import { setupCapture } from './ui/capture.js';
import { createMini } from './modules/capture/mini.js';
import { createLights } from './modules/lights/index.js';
import { createVoice } from './modules/voice/index.js';
import { createCowatch } from './modules/cowatch/index.js';
import { createPanel } from './ui/panel.js';
import { createHud } from './ui/hud.js';
import { setupJournalCapture } from './ui/journal-capture.js';
import { maybeAutoBackup } from './modules/templates/snapshots.js';
import { starterSkins } from './modules/skins/starters.js';
import { createTvApi } from './modules/templates/api.js';
import { WORKER_SOURCE } from 'tvsuite:worker-source';

export const VERSION = '0.1.0';

// Ask the MAIN-world helper a question (synchronous CustomEvent round trip).
function queryMain(q) {
  return new Promise((resolve) => {
    let answered = false;
    const onAnswer = (e) => {
      answered = true;
      document.removeEventListener('tvsuite:answer', onAnswer);
      try { resolve(e.detail ? JSON.parse(e.detail) : null); } catch (_) { resolve(null); }
    };
    document.addEventListener('tvsuite:answer', onAnswer);
    document.dispatchEvent(new CustomEvent('tvsuite:query', { detail: q }));
    setTimeout(() => { if (!answered) { document.removeEventListener('tvsuite:answer', onAnswer); resolve(null); } }, 200);
  });
}

const VIEW_KEYS = ['tab', 'panelOpen', 'skinsView', 'riskView', 'captureView', 'soundView', 'bridgeView'];

export async function startTVSuite({ ai = null, openOptions = null, fetchGallery = null, journal = null, notify = null, share = null, recordings = null, lightsSend = null, forceInline = false } = {}) {
  if (window.__TVSUITE__) return window.__TVSUITE__;
  let settings = await loadSettings();
  const adapter = pickAdapter(settings.sites);
  if (!adapter) return null;
  if (adapter.id === 'tradingview-embed') {
    // Registered hosts inject into every frame; only frames that actually render a chart start TVSuite.
    const { waitFor } = await import('./core/dom.js');
    if (!(await waitFor('.chart-markup-table, .chart-container', { timeout: 30000 }))) return null;
  }

  const bus = new Bus();

  // First run (or first run after an update that added starters): install starter custom skins once.
  if (!settings.skins.seeded) {
    const have = new Set(settings.skins.library.map((x) => x.id));
    settings.skins.library = [...settings.skins.library, ...starterSkins().filter((x) => !have.has(x.id))];
    settings.skins.seeded = true;
    await saveSettings(settings);
  }
  const persist = debounce(() => saveSettings(settings), 250);

  const app = {
    version: VERSION, host: HOST, adapter, bus, ai, openOptions, fetchGallery, journal, queryMain, share, recordings,
    getSettings: () => settings,
    update(fn, { silent = false } = {}) {
      fn(settings);
      persist();
      if (!silent) { skins.update(); sound.update(); bus.emit('settings', settings); }
    },
    rerender: () => panel?.rerender(),
    // Change the chart's symbol/interval: TradingView's page API when present (no reload), else the URL.
    async setChart({ symbol = null, interval = null } = {}) {
      const r = await queryMain(JSON.stringify({ cmd: 'setChart', symbol, interval }));
      if (r?.ok) { bus.emit('chart:set', { symbol, interval, via: 'api' }); return 'api'; }
      const onChart = /(^|\.)tradingview\.com$/.test(location.hostname) && location.pathname.startsWith('/chart');
      const u = new URL(onChart ? location.href : 'https://www.tradingview.com/chart/');
      if (symbol) u.searchParams.set('symbol', symbol);
      if (interval) u.searchParams.set('interval', interval);
      if (onChart) location.assign(u.toString()); else window.open(u.toString(), '_blank', 'noopener');
      return 'url';
    },
  };

  // Trade entry/exit detection (pop-up keywords, hotkeys) feeds sound, the recorder and lights.
  const wantsTradeEvents = () => settings.sound.enabled || settings.capture.recorder.auto || settings.lights.enabled;
  const skins = createSkinsModule({ adapter, getSettings: () => settings, bus, SkinHost, workerSource: WORKER_SOURCE, forceInline });
  app.skins = skins;
  const sound = createSoundModule({ adapter, getSettings: () => settings, bus, forceInline, notify, wantsTradeEvents: () => wantsTradeEvents(), update: (fn) => app.update(fn) });
  app.sound = sound;
  app.focus = createFocus(adapter, bus);
  app.risk = createRiskGuard({ getSettings: () => settings, bus, symbol: () => skins.symbol() });
  app.chartTime = createChartTime({ getSettings: () => settings, bus, symbol: () => skins.symbol() });
  app.recorder = createRecorder({ adapter, getSettings: () => settings, bus, risk: app.risk, symbol: () => skins.symbol() });
  app.mini = createMini({ adapter, getSettings: () => settings, bus, risk: app.risk, recorder: app.recorder, sound, symbol: () => skins.symbol() });
  app.lights = createLights({ getSettings: () => settings, bus, risk: app.risk, send: lightsSend });
  app.voice = createVoice(app);
  app.cowatch = createCowatch(app);
  app.link = createSymbolLink({ getSymbol: () => skins.symbol(), getSettings: () => settings, bus });
  await skins.start();
  sound.start();
  const panel = await createPanel(app);
  app.panel = panel;
  createBlockOverlay(app);
  app.capture = setupCapture(app);
  createHud(app);
  setupJournalCapture(app);

  // Scheduled template backup (read-only), checked shortly after load and then hourly while a chart is open.
  if (adapter.features?.templates) {
    const runAuto = async () => {
      try {
        const res = await maybeAutoBackup({ api: createTvApi(), settings, user: (await queryMain('user'))?.username || 'user' });
        if (res.saved) bus.emit('templates:auto', res);
      } catch (err) { console.warn('[TVSuite] auto-backup failed:', err.message); }
    };
    setTimeout(runAuto, 30000);
    setInterval(runAuto, 3600e3);
  }

  // Settings changed elsewhere (popup, options page, another tab).
  storage.watch(SETTINGS_KEY, (v) => {
    // Our own saves echo back through storage events; only react to writes from other contexts.
    if (!v || isOwnWrite(v)) return;
    // Which panel tab/sub-view is open is per tab: another tab's view must neither re-render this one nor
    // overwrite it (two open panels would otherwise keep re-saving at each other).
    const strip = (x) => ({ ...x, _meta: 0, ui: { ...x.ui, ...Object.fromEntries(VIEW_KEYS.map((k) => [k, 0])) } });
    const changed = stableStringify(strip(v)) !== stableStringify(strip(settings));
    const mine = Object.fromEntries(VIEW_KEYS.map((k) => [k, settings.ui[k]]));
    settings = withDefaults(DEFAULT_SETTINGS, v);
    Object.assign(settings.ui, mine);
    if (!changed) return;
    skins.update();
    sound.update();
    panel.rerender();
  });

  // Stream / screenshot mode: hide every piece of TVSuite UI (the skin itself stays).
  let streaming = false;
  function toggleStream() {
    streaming = !streaming;
    for (const id of ['tvsuite-panel-host', 'tvsuite-hud-host']) { const n = document.getElementById(id); if (n) n.style.display = streaming ? 'none' : ''; }
    bus.emit('stream:change', streaming);
  }

  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e)) return;
    const ui = settings.ui;
    if (matchHotkey(e, ui.panelHotkey)) { e.preventDefault(); e.stopPropagation(); panel.toggle(); }
    else if (matchHotkey(e, ui.skinHotkey)) { e.preventDefault(); e.stopPropagation(); app.update((s) => { s.skins.enabled = !s.skins.enabled; }); }
    else if (matchHotkey(e, settings.tools.focusHotkey)) { e.preventDefault(); e.stopPropagation(); app.focus.toggle(); }
    else if (matchHotkey(e, ui.streamHotkey)) { e.preventDefault(); e.stopPropagation(); toggleStream(); }
    else if (matchHotkey(e, settings.tools.journalHotkey)) { e.preventDefault(); e.stopPropagation(); bus.emit('journal:capture'); }
    else if (matchHotkey(e, settings.capture.recorder.hotkey)) { e.preventDefault(); e.stopPropagation(); app.capture.toggleRecording(); }
    else if (settings.voice.enabled && matchHotkey(e, settings.voice.hotkey)) { e.preventDefault(); e.stopPropagation(); app.voice.listen(); }
    else if (matchHotkey(e, settings.capture.miniHotkey)) { e.preventDefault(); e.stopPropagation(); app.mini.openChart().catch((err) => console.warn('[TVSuite]', err.message)); }
    else if (matchHotkey(e, settings.capture.hotkey)) { e.preventDefault(); e.stopPropagation(); app.capture.quickCard(); }
    else if (wantsTradeEvents() && matchHotkey(e, settings.sound.hotkeys.entry)) { e.preventDefault(); e.stopPropagation(); bus.emit('trade:event', { type: 'tradeEntry', source: 'hotkey' }); }
    else if (wantsTradeEvents() && matchHotkey(e, settings.sound.hotkeys.exit)) { e.preventDefault(); e.stopPropagation(); bus.emit('trade:event', { type: 'tradeExit', source: 'hotkey' }); }
    else if (settings.sound.enabled && matchHotkey(e, settings.sound.hotkeys.mute)) { e.preventDefault(); e.stopPropagation(); sound.toggleMute(); }
  }, true);

  // Shared skin links: https://www.tradingview.com/chart/#tvskin=TVSKIN1.xxxx (the fragment never reaches a server).
  const takeLink = () => {
    const m = location.hash.match(/tvskin=(TVSKIN1\.[A-Za-z0-9_-]+)/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    panel.open('skins');
    setTimeout(() => bus.emit('skins:import', m[1]), 50);
  };
  window.addEventListener('hashchange', takeLink);
  takeLink();

  window.__TVSUITE__ = { version: VERSION, host: HOST, adapter: adapter.id, status: () => skins.status(), signals: () => skins.signals(), panel, settings: () => settings };
  return window.__TVSUITE__;
}
