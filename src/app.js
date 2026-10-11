// Shared bootstrap for every host (extension content script, TradingView Desktop injection, userscript).
import { Bus } from './core/bus.js';
import { storage, withDefaults, stableStringify } from './core/storage.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from './core/settings.js';
import { HOST } from './core/env.js';
import { debounce } from './core/dom.js';
import { matchHotkey, isTypingTarget } from './core/hotkeys.js';
import { pickAdapter } from './adapters/tradingview.js';
import { createSkinsModule } from './modules/skins/index.js';
import { SkinHost } from './modules/skins/host.js';
import { createFocus } from './modules/tools/focus.js';
import { createPanel } from './ui/panel.js';
import { createHud } from './ui/hud.js';
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

export async function startTVSuite({ ai = null, openOptions = null, fetchGallery = null, forceInline = false } = {}) {
  if (window.__TVSUITE__) return window.__TVSUITE__;
  let settings = await loadSettings();
  const adapter = pickAdapter(settings.sites);
  if (!adapter) return null;

  const bus = new Bus();
  // Remember what we wrote so storage change events caused by our own saves are not mistaken for
  // edits from the popup/options page/another tab (which would rebuild the panel under the user).
  const ownWrites = [stableStringify(settings)];
  const persist = debounce(() => { const json = stableStringify(settings); ownWrites.push(json); if (ownWrites.length > 20) ownWrites.shift(); saveSettings(settings); }, 250);

  const app = {
    version: VERSION, host: HOST, adapter, bus, ai, openOptions, fetchGallery, queryMain,
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

  // Settings changed elsewhere (popup, options page, another tab).
  storage.watch(SETTINGS_KEY, (v) => {
    const json = stableStringify(v);
    if (!v || ownWrites.includes(json) || json === stableStringify(settings)) return;
    settings = withDefaults(DEFAULT_SETTINGS, v);
    ownWrites.push(json);
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
