// SkinHost renders the active skin inside a container element. It is used in two places:
//  - extension: inside the sandboxed iframe page (src/sandbox/sandbox.js)
//  - desktop/userscript: directly inside the TradingView page
// Each skin runs in its own worker with an OffscreenCanvas. Switching skins cross-fades.
import { SkinRunner, compileProgram } from './runner.js';
import { builtinIndex, builtinProgram } from './builtins.js';
import { NEUTRAL_SIGNALS } from './signals.js';

const FADE_MS = 700;
const WATCHDOG_MS = 3000;

export class SkinHost {
  // opts: { container, workerSource: string, allowInlineFallback, onStatus(status) }
  constructor(opts) {
    this.o = opts;
    this.container = opts.container;
    this.layers = [];
    this.signals = { ...NEUTRAL_SIGNALS };
    this.fps = 30;
    this.scale = 1;
    this.paused = false;
    this.builtins = builtinIndex();
    this.workerUrl = opts.workerSource ? URL.createObjectURL(new Blob([opts.workerSource], { type: 'text/javascript' })) : null;
    this.ro = new ResizeObserver(() => this._resizeAll());
    this.ro.observe(this.container);
  }

  status(s) { this.o.onStatus?.(s); }

  _size() {
    const r = this.container.getBoundingClientRect();
    const dpr = (globalThis.devicePixelRatio || 1) * this.scale;
    return { width: Math.max(1, Math.round(r.width * dpr)), height: Math.max(1, Math.round(r.height * dpr)), dpr };
  }

  // Resolve a skin record into something renderable: { kind, program|glsl|url, params }.
  resolve(skin) {
    if (!skin) return null;
    if (skin.kind === 'builtin') {
      const b = this.builtins.get(skin.base || skin.id);
      if (!b) throw new Error(`Unknown builtin skin "${skin.base || skin.id}"`);
      const params = { ...(b.params || {}), ...(skin.params || {}) };
      return b.kind === 'shader'
        ? { kind: 'shader', glsl: b.glsl, params, trusted: true }
        : { kind: 'canvas', program: builtinProgram(b), builtin: b, params, trusted: true };
    }
    if (skin.kind === 'canvas') return { kind: 'canvas', program: skin.code, params: skin.params || {}, trusted: false };
    if (skin.kind === 'shader') return { kind: 'shader', glsl: skin.glsl, params: skin.params || {}, trusted: false };
    if (skin.kind === 'media') return { kind: 'media', url: skin.url, fit: skin.fit || 'cover' };
    throw new Error(`Unsupported skin kind "${skin.kind}"`);
  }

  setSkin(skin) {
    let spec;
    try { spec = this.resolve(skin); } catch (err) { this.status({ state: 'error', message: err.message }); return; }
    const old = this.layers.slice();
    if (!spec) { old.forEach((l) => this._fadeOut(l)); this.status({ state: 'off' }); return; }
    const layer = this._createLayer(spec, skin);
    if (!layer) return;
    this.current = layer;
    this.layers.push(layer);
    requestAnimationFrame(() => { layer.el.style.opacity = '1'; });
    setTimeout(() => old.forEach((l) => this._fadeOut(l)), FADE_MS);
  }

  _createLayer(spec, skin) {
    const base = { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0', transition: `opacity ${FADE_MS}ms ease`, pointerEvents: 'none' };
    if (spec.kind === 'media') {
      const isVideo = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(spec.url) || spec.url.startsWith('data:video/');
      const el = document.createElement(isVideo ? 'video' : 'img');
      Object.assign(el.style, base, { objectFit: spec.fit });
      if (isVideo) Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true });
      el.src = spec.url;
      el.addEventListener('error', () => this.status({ state: 'error', message: 'Media failed to load' }));
      this.container.append(el);
      const layer = { el, kind: 'media', skin };
      this.status({ state: 'running', skin: skin.id, mode: 'media' });
      return layer;
    }
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, base);
    this.container.append(canvas);
    const { width, height, dpr } = this._size();
    const layer = { el: canvas, kind: spec.kind, skin, spec };

    const useWorker = this.workerUrl && typeof canvas.transferControlToOffscreen === 'function';
    if (useWorker) {
      try {
        const worker = new Worker(this.workerUrl);
        const off = canvas.transferControlToOffscreen();
        layer.worker = worker;
        layer.lastBeat = performance.now();
        worker.onmessage = (e) => this._onWorkerMessage(layer, e.data);
        worker.onerror = (e) => { e.preventDefault?.(); this._fail(layer, e.message || 'Worker error'); };
        worker.postMessage({ type: 'init', canvas: off, kind: spec.kind, program: spec.program, glsl: spec.glsl, params: spec.params, fps: this.fps, width, height, dpr, signals: this.signals }, [off]);
        if (this.paused) worker.postMessage({ type: 'pause', paused: true });
        layer.watchdog = setInterval(() => {
          if (!this.paused && document.visibilityState === 'visible' && performance.now() - layer.lastBeat > WATCHDOG_MS) {
            this._fail(layer, 'Skin stopped responding and was stopped');
          }
        }, 1000);
        this.status({ state: 'starting', skin: skin.id, mode: 'worker' });
        return layer;
      } catch (err) {
        if (!spec.trusted) { canvas.remove(); this.status({ state: 'error', message: `Sandboxed worker unavailable: ${err.message}` }); return null; }
        // Built-in skins may fall back to the main thread; generated code never does.
        const fresh = document.createElement('canvas');
        Object.assign(fresh.style, base);
        canvas.replaceWith(fresh);
        layer.el = fresh;
      }
    } else if (!spec.trusted) {
      canvas.remove();
      this.status({ state: 'error', message: 'Generated skins need OffscreenCanvas workers, which are unavailable here' });
      return null;
    }
    try {
      layer.runner = new SkinRunner({
        canvas: layer.el, kind: spec.kind, glsl: spec.glsl,
        compiled: spec.builtin ? { setup: spec.builtin.setup || null, draw: spec.builtin.draw } : compileProgram(spec.program),
        params: spec.params, fps: this.fps, dpr,
        raf: requestAnimationFrame.bind(globalThis), caf: cancelAnimationFrame.bind(globalThis),
        onError: (message) => this._fail(layer, message),
        onStats: (stats) => { if (layer === this.current) this.status({ state: 'running', skin: skin.id, mode: 'inline', ...stats }); },
      });
      layer.runner.resize(width, height, dpr);
      layer.runner.setSignals(this.signals);
      layer.runner.setPaused(this.paused);
      this.status({ state: 'running', skin: skin.id, mode: 'inline' });
    } catch (err) {
      layer.el.remove();
      this.status({ state: 'error', message: err.message });
      return null;
    }
    return layer;
  }

  _onWorkerMessage(layer, m) {
    if (!m || typeof m !== 'object') return;
    layer.lastBeat = performance.now();
    // Layers fading out keep running briefly; only the current layer may report status.
    if (layer !== this.current && m.type !== 'error') return;
    if (m.type === 'error') this._fail(layer, String(m.message).slice(0, 300));
    else if (m.type === 'ready') this.status({ state: 'running', skin: layer.skin.id, mode: 'worker' });
    else if (m.type === 'stats') this.status({ state: 'running', skin: layer.skin.id, mode: 'worker', fps: +m.fps || 0, frameMs: +m.frameMs || 0 });
  }

  _fail(layer, message) {
    this._dispose(layer);
    this.layers = this.layers.filter((l) => l !== layer);
    if (layer !== this.current) return;
    this.status({ state: 'error', skin: layer.skin?.id, message });
  }

  _fadeOut(layer) {
    layer.el.style.opacity = '0';
    setTimeout(() => this._dispose(layer), FADE_MS + 50);
    this.layers = this.layers.filter((l) => l !== layer);
  }

  _dispose(layer) {
    clearInterval(layer.watchdog);
    if (layer.worker) { layer.worker.postMessage({ type: 'dispose' }); setTimeout(() => layer.worker.terminate(), 100); }
    layer.runner?.dispose();
    if (layer.el.tagName === 'VIDEO') { layer.el.pause(); layer.el.removeAttribute('src'); layer.el.load(); }
    layer.el.remove();
  }

  _resizeAll() {
    const { width, height, dpr } = this._size();
    for (const l of this.layers) {
      if (l.worker) l.worker.postMessage({ type: 'resize', width, height, dpr });
      else l.runner?.resize(width, height, dpr);
    }
  }

  _broadcast(msg, inline) {
    for (const l of this.layers) {
      if (l.worker) l.worker.postMessage(msg);
      else if (l.runner) inline(l.runner);
    }
  }

  setSignals(s) { this.signals = { ...this.signals, ...s }; this._broadcast({ type: 'signals', signals: this.signals }, (r) => r.setSignals(this.signals)); }
  setParams(p) { this._broadcast({ type: 'params', params: p }, (r) => r.setParams(p)); }
  setFps(fps) { this.fps = fps; this._broadcast({ type: 'fps', fps }, (r) => r.setFps(fps)); }
  setScale(scale) { this.scale = Math.max(0.25, Math.min(1, scale || 1)); this._resizeAll(); }
  setPaused(paused) {
    this.paused = !!paused;
    for (const l of this.layers) { if (l.lastBeat) l.lastBeat = performance.now(); if (l.el.tagName === 'VIDEO') paused ? l.el.pause() : l.el.play().catch(() => {}); }
    this._broadcast({ type: 'pause', paused: this.paused }, (r) => r.setPaused(this.paused));
  }

  destroy() {
    this.ro.disconnect();
    for (const l of this.layers) this._dispose(l);
    this.layers = [];
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
  }
}
