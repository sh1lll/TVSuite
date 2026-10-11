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
  constructor(shadow, onStatus) {
    this.token = randomToken();
    this.queue = [];
    this.ready = false;
    this.onStatus = onStatus;
    this.frame = document.createElement('iframe');
    this.frame.src = `${resourceUrl('sandbox.html')}#token=${this.token}`;
    this.frame.setAttribute('allowtransparency', 'true');
    this.frame.setAttribute('aria-hidden', 'true');
    this.frame.tabIndex = -1;
    Object.assign(this.frame.style, { border: '0', width: '100%', height: '100%', display: 'block', background: 'transparent', pointerEvents: 'none', colorScheme: 'normal' });
    this.onMessage = (e) => {
      const m = e.data;
      if (e.source !== this.frame.contentWindow || !m || m.tvsuite !== 'sandbox' || m.token !== this.token) return;
      if (m.type === 'hello') { this.ready = true; for (const q of this.queue.splice(0)) this._post(q); }
      else if (m.type === 'status') this.onStatus(m.status);
    };
    window.addEventListener('message', this.onMessage);
    shadow.append(this.frame);
  }
  _post(msg) { this.frame.contentWindow?.postMessage({ tvsuite: 'layer', token: this.token, ...msg }, '*'); }
  send(msg) {
    if (!this.ready) {
      // Keep only the latest message of each type while the frame loads.
      this.queue = this.queue.filter((q) => q.type !== msg.type);
      this.queue.push(msg);
    } else this._post(msg);
  }
  destroy() { window.removeEventListener('message', this.onMessage); this.frame.remove(); }
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
  destroy() { this.host.destroy(); this.box.remove(); }
}

export function createSkinsModule(ctx) {
  const { adapter, getSettings, bus } = ctx;
  const builtins = builtinIndex();
  let layer = null, shadow = null, transport = null, status = { state: 'off' };
  let tracker = new SignalTracker(getSettings().skins.reactive);
  let lastSession = undefined, sessionSkin = null;
  let timers = [];
  let lastApplied = null;

  function s() { return getSettings().skins; }

  function setStatus(st) {
    status = { ...status, ...st };
    if (layer) layer.dataset.state = status.state || '';
    if (layer) { if (st.state === 'error') layer.dataset.error = String(st.message || '').slice(0, 200); else if (st.state === 'running') delete layer.dataset.error; }
    if (layer && status.fps != null) layer.dataset.fps = String(status.fps);
    bus.emit('skins:status', status);
  }

  function applyCss() {
    const cfg = s();
    let style = document.getElementById(STYLE_ID);
    if (!style) { style = document.createElement('style'); style.id = STYLE_ID; (document.head || document.documentElement).append(style); }
    const root = 'html[data-tvsuite-mode="under"]';
    const sel = adapter.transparentSelectors.map((x) => `${root} ${x}`).join(',\n');
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
      if (!cfg.includeAxes && adapter.axesSelector) html.setAttribute('data-tvsuite-clear-exclude', adapter.axesSelector);
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
      transport = new FrameTransport(shadow, setStatus);
      // If the sandbox frame never says hello (blocked frame, CSP), fall back to an in-page renderer.
      const t = transport;
      setTimeout(() => { if (transport === t && !t.ready) { console.warn('[TVSuite] sandbox frame unavailable, using in-page renderer'); switchToInline(); } }, 4000);
    } else {
      await switchToInline();
    }
    layer.dataset.transport = preferFrame ? 'frame' : 'inline';
    lastApplied = null;
    pushAll();
    return true;
  }

  async function switchToInline() {
    if (!shadow) return;
    transport?.destroy();
    transport = new InlineTransport(shadow, setStatus, ctx.SkinHost, ctx.workerSource);
    if (layer) layer.dataset.transport = 'inline';
    lastApplied = null;
    pushAll();
  }

  function unmount() {
    transport?.destroy();
    transport = null;
    layer?.remove();
    layer = null; shadow = null;
  }

  function currentSkin() {
    const cfg = s();
    const skin = (cfg.sessionThemes && sessionSkin) ? sessionSkin : cfg.active;
    if (!skin) return null;
    const id = skin.id || skin.base;
    const overrides = cfg.params?.[id];
    return overrides ? { ...skin, params: { ...(skin.params || {}), ...overrides } } : skin;
  }

  function pushAll() {
    if (!transport) return;
    const cfg = s();
    transport.send({ type: 'fps', fps: cfg.fps });
    transport.send({ type: 'scale', scale: cfg.scale });
    const skin = cfg.enabled ? currentSkin() : null;
    const key = JSON.stringify(skin);
    if (key !== lastApplied) { lastApplied = key; transport.send({ type: 'skin', skin }); }
    transport.send({ type: 'pause', paused: !cfg.enabled || document.hidden });
    transport.send({ type: 'signals', signals: cfg.reactive.enabled ? tracker.signals() : NEUTRAL_SIGNALS });
  }

  function signalTick() {
    const cfg = s();
    if (!cfg.enabled || !transport) return;
    if (cfg.reactive.enabled) {
      const obs = adapter.readObservation?.();
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
    const all = getSettings().sessions.list;
    const sess = activeSession(all, new Date());
    const id = sess?.id ?? null;
    if (id !== lastSession) {
      if (lastSession !== undefined) { tracker.sessionChanged(); bus.emit('sessions:change', sess); }
      lastSession = id;
      const skinId = sess?.skin;
      sessionSkin = null;
      if (skinId) {
        const lib = s().library.find((x) => x.id === skinId);
        if (lib) sessionSkin = lib;
        else if (builtins.has(skinId)) { const b = builtins.get(skinId); sessionSkin = { kind: 'builtin', base: b.id, id: b.id, name: b.name }; }
      }
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
    activeSession: () => lastSession,
    builtins,
  };
}
