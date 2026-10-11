// Content-side controller for live skins: mounts the layer under (or over) the chart,
// keeps it attached as TradingView re-renders, feeds it chart signals and session themes.
import { IS_EXTENSION, resourceUrl } from '../../core/env.js';
import { SignalTracker, NEUTRAL_SIGNALS } from './signals.js';
import { activeSession, zonedParts } from '../sessions/sessions.js';
import { builtinIndex } from './builtins.js';

const LAYER_ID = 'tvsuite-skin-layer';
const STYLE_ID = 'tvsuite-skin-css';

function randomToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Transport to a renderer living in the extension's sandboxed iframe.
class FrameTransport {
  constructor(shadow, onStatus, page = 'sandbox.html') {
    this.page = page;
    this.token = randomToken();
    this.queue = [];
    this.ready = false;
    this.onStatus = onStatus;
    this.frame = document.createElement('iframe');
    this.frame.src = `${resourceUrl(page)}#token=${this.token}`;
    this.frame.setAttribute('allowtransparency', 'true');
    this.frame.setAttribute('aria-hidden', 'true');
    this.frame.tabIndex = -1;
    Object.assign(this.frame.style, { border: '0', width: '100%', height: '100%', display: 'block', background: 'transparent', pointerEvents: 'none', colorScheme: 'normal' });
    this.pendingThumbs = new Map();
    this.onMessage = (e) => {
      const m = e.data;
      if (e.source !== this.frame.contentWindow || !m || m.tvsuite !== 'sandbox' || m.token !== this.token) return;
      if (m.type === 'hello') { this.ready = true; for (const q of this.queue.splice(0)) this._post(q); }
      else if (m.type === 'status') this.onStatus(m.status);
      else if (m.type === 'thumb') {
        const done = this.pendingThumbs.get(m.id);
        this.pendingThumbs.delete(m.id);
        if (!done) return;
        if (m.blob instanceof Blob) createImageBitmap(m.blob).then(done, () => done(null)); else done(null);
      }
    };
    window.addEventListener('message', this.onMessage);
    shadow.append(this.frame);
  }
  _post(msg) { this.frame.contentWindow?.postMessage({ tvsuite: 'layer', token: this.token, ...msg }, '*'); }
  send(msg) {
    if (!this.ready) {
      // Keep only the latest message of each type while the frame loads.
      if (msg.type !== 'thumb') this.queue = this.queue.filter((q) => q.type !== msg.type);
      this.queue.push(msg);
    } else this._post(msg);
  }
  thumbnail(skin, width, height) {
    if (this.page !== 'sandbox.html') return Promise.resolve(null);
    const id = Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      this.pendingThumbs.set(id, resolve);
      this.send({ type: 'thumb', id, skin, width, height, _unique: id }); // queued until the sandbox is ready
      setTimeout(() => { if (this.pendingThumbs.delete(id)) resolve(null); }, 20000);
    });
  }
  destroy() { window.removeEventListener('message', this.onMessage); this.frame.remove(); for (const r of this.pendingThumbs.values()) r(null); }
}

// Transport to a renderer running directly in this page (TradingView Desktop / userscript / fallback).
class InlineTransport {
  constructor(shadow, onStatus, SkinHost, workerSource) {
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'absolute', inset: '0', overflow: 'hidden' });
    shadow.append(box);
    this.box = box;
    this.host = new SkinHost({ container: box, workerSource, allowInlineFallback: true, onStatus });
  }
  send(m) {
    const h = this.host;
    switch (m.type) {
      case 'skin': h.setSkin(m.skin); break;
      case 'signals': h.setSignals(m.signals); break;
      case 'params': h.setParams(m.params); break;
      case 'fps': h.setFps(m.fps); break;
      case 'scale': h.setScale(m.scale); break;
      case 'pause': h.setPaused(m.paused); break;
      default: break;
    }
  }
  async thumbnail(skin, width, height) {
    const blob = await this.host.thumbnail(skin, width, height);
    return blob ? createImageBitmap(blob).catch(() => null) : null;
  }
  destroy() { this.host.destroy(); this.box.remove(); }
}

export function createSkinsModule(ctx) {
  const { adapter, getSettings, bus } = ctx;
  const builtins = builtinIndex();
  let layer = null, shadow = null, transport = null, status = { state: 'off' };
  let tracker = new SignalTracker(getSettings().skins.reactive);
  let lastSession = undefined;
  let timers = [];
  let lastApplied = null;
  let sent = {};

  function s() { return getSettings().skins; }

  function setStatus(st) {
    status = st.state === 'starting' || st.state === 'error' || st.state === 'off' ? { ...st } : { ...status, ...st };
    if (layer) { layer.dataset.state = status.state || ''; if (st.skin) layer.dataset.skin = st.skin; }
    if (layer) { if (st.state === 'error') layer.dataset.error = String(st.message || '').slice(0, 200); else if (st.state === 'running') delete layer.dataset.error; }
    if (layer && status.fps != null) layer.dataset.fps = String(status.fps);
    if (layer && status.frameMs != null) layer.dataset.frameMs = String(status.frameMs);
    bus.emit('skins:status', status);
  }

  function applyCss() {
    const cfg = s();
    let style = document.getElementById(STYLE_ID);
    if (!style) { style = document.createElement('style'); style.id = STYLE_ID; (document.head || document.documentElement).append(style); }
    const root = 'html[data-tvsuite-mode="under"]';
    const list = [...adapter.transparentSelectors, ...(cfg.blendAxes !== false && adapter.axesSelector ? adapter.axesSelector.split(',').map((x) => x.trim()) : [])];
    const sel = list.map((x) => `${root} ${x}`).join(',\n');
    style.textContent = `
${sel ? `${sel} { background: transparent !important; background-color: transparent !important; }` : ''}
html[data-tvsuite-mode] [data-tvsuite-layer-host] { isolation: isolate; }
`;
    const on = cfg.enabled;
    const html = document.documentElement;
    if (on) html.setAttribute('data-tvsuite-mode', cfg.mode); else html.removeAttribute('data-tvsuite-mode');
    // Tell the MAIN-world script which canvases may have their background fill cleared.
    if (on && cfg.mode === 'under' && adapter.clearScope) {
      html.setAttribute('data-tvsuite-clear', adapter.clearScope);
      if (cfg.blendAxes === false && adapter.axesSelector) html.setAttribute('data-tvsuite-clear-exclude', adapter.axesSelector);
      else html.removeAttribute('data-tvsuite-clear-exclude');
    } else {
      html.removeAttribute('data-tvsuite-clear');
      html.removeAttribute('data-tvsuite-clear-exclude');
    }
  }

  function layerStyle() {
    if (!layer) return;
    const cfg = s();
    const filters = [];
    if (cfg.dim > 0) filters.push(`brightness(${(1 - cfg.dim).toFixed(3)})`);
    if (cfg.blur > 0) filters.push(`blur(${cfg.blur}px)`);
    if (cfg.saturate !== 1) filters.push(`saturate(${cfg.saturate})`);
    if (cfg.grayscale) filters.push('grayscale(1)');
    const under = cfg.mode === 'under';
    Object.assign(layer.style, {
      position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none',
      zIndex: under ? '-1' : '3',
      mixBlendMode: under ? 'normal' : cfg.blend,
      opacity: String(cfg.opacity),
      filter: filters.join(' ') || 'none',
      display: cfg.enabled ? 'block' : 'none',
    });
  }

  async function mount() {
    const hostEl = adapter.layoutHost();
    if (!hostEl) return false;
    if (layer && layer.isConnected && layer.parentElement === hostEl) return true;
    unmount();
    hostEl.setAttribute('data-tvsuite-layer-host', '');
    if (getComputedStyle(hostEl).position === 'static') hostEl.style.position = 'relative';
    layer = document.createElement('div');
    layer.id = LAYER_ID;
    shadow = layer.attachShadow({ mode: 'closed' });
    hostEl.prepend(layer);
    layerStyle();
    const preferFrame = IS_EXTENSION && !ctx.forceInline;
    if (preferFrame) {
      transport = new FrameTransport(shadow, setStatus, wantedPage(currentSkin()));
      // If the sandbox frame never says hello (blocked frame, CSP), fall back to an in-page renderer.
      const t = transport;
      setTimeout(() => { if (transport === t && !t.ready) { console.warn('[TVSuite] sandbox frame unavailable, using in-page renderer'); switchToInline(); } }, 4000);
    } else {
      await switchToInline();
    }
    layer.dataset.transport = preferFrame ? 'frame' : 'inline';
    lastApplied = null; sent = {};
    pushAll();
    return true;
  }

  async function switchToInline() {
    if (!shadow) return;
    transport?.destroy();
    transport = new InlineTransport(shadow, setStatus, ctx.SkinHost, ctx.workerSource);
    if (layer) layer.dataset.transport = 'inline';
    lastApplied = null; sent = {};
    pushAll();
  }

  function unmount() {
    transport?.destroy();
    transport = null;
    layer?.remove();
    layer = null; shadow = null;
  }

  let symbol = null, tick = 0;

  function sessionSkinFor(sessId) {
    if (!sessId) return null;
    const sess = getSettings().sessions.list.find((x) => x.id === sessId);
    return recordFor(sess?.skin);
  }

  // The skin record to show, without per-skin param overrides (those travel as 'params' messages so
  // dragging a slider tweaks the live renderer instead of spawning a new one).
  function recordFor(id) {
    if (!id) return null;
    const lib = s().library.find((x) => x.id === id);
    if (lib) return lib;
    const b = builtins.get(id);
    return b ? { kind: 'builtin', base: b.id, id: b.id, name: b.name } : null;
  }

  // Playlist position comes from the clock, so every tab shows the same skin and nothing needs saving.
  function playlistSkin(now = Date.now()) {
    const pl = s().playlist;
    if (!pl?.enabled) return null;
    const ids = (pl.ids || []).filter((id) => recordFor(id));
    if (!ids.length) return null;
    return recordFor(ids[Math.floor(now / (Math.max(1, pl.minutes) * 60000)) % ids.length]);
  }

  let previewSkin = null; // Studio "test on chart": temporary, never saved
  function baseSkin() {
    const cfg = s();
    if (previewSkin) return previewSkin;
    const pinned = symbol && cfg.perSymbol?.[symbol];
    return pinned || (cfg.sessionThemes && sessionSkinFor(lastSession)) || playlistSkin() || cfg.active || null;
  }
  function overridesFor(skin) { return skin ? s().params?.[skin.id || skin.base] || null : null; }
  function currentSkin() {
    const skin = baseSkin();
    const o = overridesFor(skin);
    return skin && o ? { ...skin, params: { ...(skin.params || {}), ...o } } : skin;
  }

  // Local media files live in extension storage, which only the extension-origin media frame can read.
  function wantedPage(skin) { return skin?.kind === 'media' && skin.url?.startsWith('local:') ? 'media.html' : 'sandbox.html'; }

  function pushAll() {
    if (!transport) return;
    const cfg = s();
    if (transport instanceof FrameTransport && cfg.enabled) {
      const page = wantedPage(currentSkin());
      if (page !== transport.page) {
        transport.destroy();
        transport = new FrameTransport(shadow, setStatus, page);
        lastApplied = null; sent = {};
      }
    }
    // Only send what changed: a scale message resizes (and re-seeds) the running skin.
    if (sent.fps !== cfg.fps) { sent.fps = cfg.fps; transport.send({ type: 'fps', fps: cfg.fps }); }
    if (sent.scale !== cfg.scale) { sent.scale = cfg.scale; transport.send({ type: 'scale', scale: cfg.scale }); }
    const base = cfg.enabled ? baseSkin() : null;
    const key = JSON.stringify(base);
    const overrides = JSON.stringify(overridesFor(base));
    const o = overridesFor(base);
    if (key !== lastApplied || (overrides !== sent.params && !o)) {
      // New skin, or overrides were reset (params merge, so defaults need a fresh start).
      lastApplied = key; sent.params = overrides;
      transport.send({ type: 'skin', skin: cfg.enabled ? currentSkin() : null });
    } else if (overrides !== sent.params) {
      sent.params = overrides;
      transport.send({ type: 'params', params: { ...(base?.params || {}), ...o } });
    }
    transport.send({ type: 'pause', paused: !cfg.enabled || document.hidden });
    transport.send({ type: 'signals', signals: cfg.reactive.enabled ? tracker.signals() : NEUTRAL_SIGNALS });
  }

  function signalTick() {
    const cfg = s();
    if (!cfg.enabled || !transport) return;
    const reactive = cfg.reactive.enabled;
    const wantSymbol = Object.keys(cfg.perSymbol || {}).length > 0 && (tick++ % 4 === 0);
    if (!reactive && !wantSymbol) return;
    const obs = adapter.readObservation?.();
    if (obs?.symbol && obs.symbol !== symbol) {
      symbol = obs.symbol;
      bus.emit('skins:symbol', symbol);
      if (cfg.perSymbol?.[symbol] || lastApplied) pushAll();
    }
    if (reactive) {
      const now = Date.now();
      if (obs) tracker.update({ ...obs, t: now, dayKey: zonedParts(new Date(now), cfg.dayStartTz || 'UTC').dateKey });
      else tracker.tick(now);
      const sig = tracker.signals();
      transport.send({ type: 'signals', signals: sig });
      if (layer) { layer.dataset.intensity = sig.intensity.toFixed(3); layer.dataset.calm = sig.calm.toFixed(3); layer.dataset.dist = sig.dist.toFixed(3); }
      bus.emit('skins:signals', sig);
    }
  }

  function sessionTick() {
    if (s().playlist?.enabled && s().enabled) pushAll(); // rotation boundary (pushAll is a no-op if unchanged)
    const all = getSettings().sessions.list;
    const sess = activeSession(all, new Date());
    const id = sess?.id ?? null;
    if (id !== lastSession) {
      if (lastSession !== undefined) { tracker.sessionChanged(); bus.emit('sessions:change', sess); }
      lastSession = id;
      if (s().sessionThemes) pushAll();
    }
  }

  function onVisibility() { transport?.send({ type: 'pause', paused: !s().enabled || document.hidden }); }

  async function start() {
    applyCss();
    const tryMount = async () => { if (adapter.ready() && s().enabled) await mount(); };
    await tryMount();
    timers.push(setInterval(tryMount, 2000));      // re-attach after TradingView re-renders the layout
    timers.push(setInterval(signalTick, 250));
    timers.push(setInterval(sessionTick, 5000));
    sessionTick();
    document.addEventListener('visibilitychange', onVisibility);
  }

  function update() {
    tracker.opts = { ...tracker.opts, ...s().reactive, calm: { ...tracker.opts.calm, ...(s().reactive.calm || {}) } };
    applyCss();
    if (!s().enabled) { layerStyle(); onVisibility(); return; }
    if (!layer) { if (adapter.ready()) mount(); return; }
    layerStyle();
    pushAll();
  }

  function stop() {
    timers.forEach(clearInterval); timers = [];
    document.removeEventListener('visibilitychange', onVisibility);
    unmount();
    const html = document.documentElement;
    ['data-tvsuite-mode', 'data-tvsuite-clear', 'data-tvsuite-clear-exclude'].forEach((a) => html.removeAttribute(a));
    document.getElementById(STYLE_ID)?.remove();
  }

  return {
    start, stop, update,
    status: () => status,
    signals: () => tracker.signals(),
    symbol: () => symbol || adapter.readObservation?.()?.symbol || null,
    thumbnail: (skin, width = 384, height = 216) => (transport?.thumbnail ? transport.thumbnail(skin, width, height) : Promise.resolve(null)),
    preview: (skin) => { previewSkin = skin; lastApplied = null; pushAll(); },
    activeSession: () => lastSession,
    builtins,
  };
}
