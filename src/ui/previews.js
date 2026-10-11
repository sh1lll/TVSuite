// Skin previews for the panel: still thumbnails and an animated hover preview.
// Trusted skins (built-ins, remixes of them, gallery skins bundled with TVSuite) render right here;
// any other code skin is rendered inside the sandbox worker and comes back as an image.
import { el } from '../core/dom.js';
import { SkinRunner } from '../modules/skins/runner.js';
import { builtinIndex, builtinProgram } from '../modules/skins/builtins.js';
import { GALLERY } from '../../gallery/skins.mjs';
import { NEUTRAL_SIGNALS } from '../modules/skins/signals.js';

const W = 384, H = 216;
const builtins = builtinIndex();
const bundledCode = new Set(GALLERY.map((g) => g.code || g.glsl));
const cache = new Map(); // key -> ImageBitmap | 'none'
const pending = new Map();

const keyOf = (skin) => JSON.stringify([skin.kind, skin.base || skin.id, skin.params || null, (skin.code || skin.glsl || '').length, skin.url || '', (skin.thumb || '').length]);

// Trusted skins → { kind, program|glsl, compiled?, params } runnable in this context; null otherwise.
export function trustedSpec(skin) {
  if (!skin) return null;
  if (skin.kind === 'builtin') {
    const b = builtins.get(skin.base || skin.id);
    if (!b) return null;
    const params = { ...(b.params || {}), ...(skin.params || {}) };
    return b.kind === 'shader' ? { kind: 'shader', glsl: b.glsl, params } : { kind: 'canvas', compiled: { setup: b.setup || null, draw: b.draw }, params };
  }
  // Bundled shaders are safe to compile here; bundled canvas code would need eval, which MV3 forbids in
  // content scripts, so it (like any other code skin) is previewed through the sandbox.
  if (skin.kind === 'shader' && bundledCode.has(skin.glsl)) return { kind: 'shader', glsl: skin.glsl, params: skin.params || {} };
  return null;
}

function renderStill(spec, frames = 45) {
  const canvas = new OffscreenCanvas(W, H);
  let queued = null, now = 0;
  const r = new SkinRunner({ canvas, kind: spec.kind, glsl: spec.glsl, program: spec.program, compiled: spec.compiled, params: spec.params, fps: 30, dpr: 1,
    raf: (fn) => { queued = fn; return 1; }, caf: () => {}, now: () => now });
  r.resize(W, H, 1);
  r.setSignals(NEUTRAL_SIGNALS);
  for (let i = 0; i < frames; i++) { now += 34; const f = queued; queued = null; f?.(now); }
  const bmp = canvas.transferToImageBitmap();
  r.dispose();
  return bmp;
}

function hashHue(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 360; }

// Decode a data: URL without the network (page CSP may forbid data: images).
async function bitmapFromDataUrl(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: dataUrl.slice(5, dataUrl.indexOf(';')) }));
}

function paintPlaceholder(canvas, skin) {
  const ctx = canvas.getContext('2d');
  const h = hashHue(skin.id || skin.name);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, `hsl(${h},55%,16%)`); g.addColorStop(1, `hsl(${(h + 60) % 360},60%,28%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '600 34px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(skin.kind === 'media' ? '▶' : skin.kind === 'shader' ? '◆' : '</>', W / 2, H / 2 - 6);
  if (skin.kind === 'media' && /^https:/.test(skin.url || '')) {
    ctx.font = '600 17px ui-sans-serif, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)';
    try { ctx.fillText(new URL(skin.url).hostname.replace(/^www\./, ''), W / 2, H / 2 + 36); } catch (_) { /* ignore */ }
  }
}

// Fills `canvas` (a 2D canvas element) with the skin's still preview.
export async function paintPreview(canvas, skin, { thumbnail } = {}) {
  canvas.width = W; canvas.height = H;
  const key = keyOf(skin);
  let bmp = cache.get(key);
  if (!bmp) {
    if (!pending.has(key)) {
      pending.set(key, (async () => {
        const spec = trustedSpec(skin);
        let out = null;
        if (skin.kind === 'media' && skin.thumb) { try { out = await bitmapFromDataUrl(skin.thumb); } catch (_) { out = null; } }
        if (!out && skin.kind !== 'media') { try { out = spec ? renderStill(spec) : null; } catch (_) { out = null; } }
        if (!out && thumbnail && skin.kind !== 'media') { try { out = await thumbnail(skin, W, H); } catch (_) { out = null; } }
        if (out) cache.set(key, out); // failures aren't cached: the sandbox may simply not be ready yet
        pending.delete(key);
        return out || 'none';
      })());
    }
    bmp = await pending.get(key);
  }
  if (!canvas.isConnected && !canvas.parentNode) return;
  const ctx = canvas.getContext('2d');
  if (bmp && bmp !== 'none') ctx.drawImage(bmp, 0, 0, W, H); else paintPlaceholder(canvas, skin);
}

// Animated preview on hover (trusted skins only). Returns a stop function.
export function animateOn(container, skin) {
  const spec = trustedSpec(skin);
  if (!spec) return () => {};
  const canvas = el('canvas', { width: W, height: H, style: { position: 'absolute', inset: '0', width: '100%', height: '100%' } });
  container.append(canvas);
  let runner, stopped = false;
  const stop = () => { if (stopped) return; stopped = true; runner?.dispose(); canvas.remove(); };
  try {
    runner = new SkinRunner({ canvas, kind: spec.kind, glsl: spec.glsl, program: spec.program, compiled: spec.compiled, params: spec.params, fps: 30, dpr: 1,
      // Stops by itself once the preview leaves the page (panel closed, tab switched, re-render).
      raf: (fn) => requestAnimationFrame((t) => { if (!container.isConnected) stop(); else fn(t); }),
      caf: cancelAnimationFrame.bind(globalThis) });
    runner.resize(W, H, 1);
    runner.setSignals(NEUTRAL_SIGNALS);
  } catch (_) { canvas.remove(); return () => {}; }
  return stop;
}

export function invalidatePreview(skin) { cache.delete(keyOf(skin)); }
export const PREVIEW_SIZE = { W, H };
