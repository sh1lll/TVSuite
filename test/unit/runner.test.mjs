import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkinRunner } from '../../src/modules/skins/runner.js';
import { BUILTIN_CANVAS, builtinProgram } from '../../src/modules/skins/builtins.js';

// A recording 2D context stub: accepts every call and property so built-in skins can run headless in Node.
function fakeCanvas(w = 320, h = 180) {
  const calls = { fill: 0 };
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createImageData') return (W, H) => ({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return (...a) => { if (['fillRect', 'fill', 'stroke', 'drawImage', 'fillText'].includes(k)) calls.fill++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { canvas: { width: w, height: h, getContext: () => ctx }, calls };
}

globalThis.OffscreenCanvas ??= class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return fakeCanvas(this.width, this.height).canvas.getContext(); } };

function runFrames(prog, frames, resizeAt = -1) {
  const { canvas, calls } = fakeCanvas();
  let cb = null, now = 0;
  const errors = [];
  const r = new SkinRunner({ canvas, kind: 'canvas', program: prog, params: {}, fps: 60, raf: (fn) => { cb = fn; return 1; }, caf: () => {}, now: () => now, onError: (m) => errors.push(m) });
  for (let i = 0; i < frames; i++) {
    if (i === resizeAt) r.resize(640, 360, 1);
    now += 17;
    const f = cb; cb = null; f(now);
  }
  return { r, calls, errors };
}

for (const b of BUILTIN_CANVAS) {
  test(`builtin "${b.id}" runs 30 frames, survives a resize, keeps setup state`, () => {
    const prog = builtinProgram({ ...b });
    const { errors, calls, r } = runFrames(prog.replace(/api\.p\./g, 'api.p.'), 30, 10);
    assert.deepEqual(errors, []);
    assert.ok(calls.fill > 0, 'painted something');
    assert.ok(r.frame >= 29);
  });
}

test('state written in setup is visible in draw after a resize (regression)', () => {
  const { errors } = runFrames('function setup(api){ api.state.list = [1,2,3]; }\nfunction draw(ctx, api){ if (!api.state.list) throw new Error("lost state"); }', 10, 3);
  assert.deepEqual(errors, []);
});

test('fps cap skips frames', () => {
  const { canvas } = fakeCanvas();
  let cb, now = 0, draws = 0;
  const r = new SkinRunner({ canvas, kind: 'canvas', program: 'function draw(){ }', fps: 15, raf: (fn) => { cb = fn; return 1; }, caf: () => {}, now: () => now });
  r.prog.draw = () => { draws++; };
  for (let i = 0; i < 60; i++) { now += 1000 / 60; const f = cb; f(now); }
  assert.ok(draws >= 14 && draws <= 16, `~15 draws in 1s at 15fps, got ${draws}`);
});
