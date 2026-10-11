// Dedicated worker that renders one skin onto an OffscreenCanvas.
// Generated (untrusted) skin code only ever runs here: no DOM, no page, no extension APIs.
// Network and storage globals are removed before any skin code is compiled; the creating
// document's CSP (connect-src 'none') blocks network access as a second layer.
import { SkinRunner } from '../modules/skins/runner.js';

const post = self.postMessage.bind(self);
const send = (msg, transfer) => post(msg, transfer || []);
const raf = (self.requestAnimationFrame || ((fn) => setTimeout(() => fn(performance.now()), 16))).bind(self);
const caf = (self.cancelAnimationFrame || clearTimeout).bind(self);

for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'WebTransport']) {
  try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch (_) { /* not present */ }
}

let runner = null;
let heartbeat = null;

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    switch (m.type) {
      case 'init': {
        runner = new SkinRunner({
          canvas: m.canvas, kind: m.kind, program: m.program, glsl: m.glsl,
          params: m.params, fps: m.fps, dpr: m.dpr, raf, caf,
          onError: (message) => send({ type: 'error', message }),
          onStats: (stats) => send({ type: 'stats', ...stats }),
        });
        runner.resize(m.width, m.height, m.dpr);
        if (m.signals) runner.setSignals(m.signals);
        // Heartbeat comes from the timer queue: if skin code hangs the worker, beats stop and the host terminates us.
        heartbeat = setInterval(() => send({ type: 'beat' }), 500);
        send({ type: 'ready' });
        break;
      }
      case 'resize': runner?.resize(m.width, m.height, m.dpr); break;
      case 'signals': runner?.setSignals(m.signals); break;
      case 'params': runner?.setParams(m.params); break;
      case 'fps': runner?.setFps(m.fps); break;
      case 'pause': runner?.setPaused(m.paused); break;
      case 'dispose': runner?.dispose(); clearInterval(heartbeat); self.close(); break;
      case 'thumb': {
        // Render `frames` frames synchronously on our own OffscreenCanvas and hand back a bitmap.
        const canvas = new OffscreenCanvas(m.width, m.height);
        let queued = null, now = 0;
        const r = new SkinRunner({ canvas, kind: m.kind, program: m.program, glsl: m.glsl, params: m.params, fps: 30, dpr: 1,
          raf: (fn) => { queued = fn; return 1; }, caf: () => {}, now: () => now, onError: (message) => { throw new Error(message); } });
        r.resize(m.width, m.height, 1);
        for (let i = 0; i < (m.frames || 40); i++) { now += 34; const f = queued; queued = null; f?.(now); }
        // A Blob (unlike an ImageBitmap) survives being posted across processes to the TradingView page.
        canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }).then((blob) => { send({ type: 'thumb', blob }); self.close(); });
        break;
      }
      default: break;
    }
  } catch (err) {
    send({ type: 'error', message: String(err && err.message || err) });
  }
};
