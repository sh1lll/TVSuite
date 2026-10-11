// Shared bootstrap for every host (extension content script, TradingView Desktop injection, userscript).
import { Bus } from './core/bus.js';
import { storage, withDefaults, stableStringify } from './core/storage.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings, isOwnWrite } from './core/settings.js';
import { HOST } from './core/env.js';
import { debounce } from './core/dom.js';
import { matchHotkey, isTypingTarget } from './core/hotkeys.js';
import { pickAdapter } from './adapters/tradingview.js';
import { createSkinsModule } from './modules/skins/index.js';
import { SkinHost } from './modules/skins/host.js';
import { createFocus } from './modules/tools/focus.js';
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

export async function startTVSuite({ ai = null, openOptions = null, fetchGallery = null, journal = null, forceInline = false } = {}) {
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
    version: VERSION, host: HOST, adapter, bus, ai, openOptions, fetchGallery, journal, queryMain,
    getSettings: () => settings,
    update(fn, { silent = false } = {}) {
      fn(settings);
      persist();
      if (!silent) { skins.update(); bus.emit('settings', settings); }
    },
    rerender: () => panel?.rerender(),
  };

  const skins = createSkinsModule({ adapter, getSettings: () => settings, bus, SkinHost, workerSource: WORKER_SOURCE, forceInline });
  app.skins = skins;
  app.focus = createFocus(adapter, bus);
  await skins.start();
  const panel = await createPanel(app);
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
    const changedUi = stableStringify({ ...v, _meta: 0 }) !== stableStringify({ ...settings, _meta: 0 });
    settings = withDefaults(DEFAULT_SETTINGS, v);
    if (!changedUi) return;
    skins.update();
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
