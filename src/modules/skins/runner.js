// The frame loop shared by the sandboxed worker (OffscreenCanvas) and the inline fallback.
// Knows nothing about where its canvas lives; the host feeds it size, signals and params.
import { lib } from './lib.js';
import { NEUTRAL_SIGNALS } from './signals.js';

const SIGNAL_KEYS = ['intensity', 'range', 'velocity', 'dist', 'calm', 'pulse'];

// Compile a canvas-skin program ("function setup(api){} function draw(ctx, api){}") into callables.
// `shadow` names are bound to undefined inside the program so casual references to
// network/global APIs fail even before the worker's own lockdown and CSP apply.
const SHADOWED = ['self', 'globalThis', 'window', 'postMessage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'EventSource', 'indexedDB', 'caches', 'Worker', 'BroadcastChannel', 'Function'];
export function compileProgram(source) {
  const body = `"use strict";\n${source}\n;return { setup: typeof setup === 'function' ? setup : null, draw: typeof draw === 'function' ? draw : null };`;
  // eslint-disable-next-line no-new-func
  const factory = new Function(...SHADOWED, body);
  const out = factory(...SHADOWED.map(() => undefined));
  if (!out || typeof out.draw !== 'function') throw new Error('Skin program must define draw(ctx, api)');
  return out;
}

export class SkinRunner {
  // opts: { canvas, kind: 'canvas'|'shader', program?, compiled?, glsl?, params, fps, scale, onError, onStats, raf, caf, now }
  constructor(opts) {
    this.o = opts;
    this.canvas = opts.canvas;
    this.params = { ...(opts.params || {}) };
    this.fps = opts.fps || 30;
    this.target = { ...NEUTRAL_SIGNALS };
    this.s = { ...NEUTRAL_SIGNALS };
    this.state = {};
    this.frame = 0;
    this.paused = false;
    this.t0 = null;
    this.lastFrame = 0;
    this.statsAt = 0;
    this.framesSince = 0;
    this.costSum = 0;
    this.raf = opts.raf;
    this.caf = opts.caf;
    this.now = opts.now || (() => performance.now());
    this.needsSetup = true;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.dpr = opts.dpr || 1;

    if (opts.kind === 'shader') {
      this.gl = new ShaderPainter(this.canvas, opts.glsl);
    } else {
      this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!this.ctx) throw new Error('2D canvas is unavailable');
      this.prog = opts.compiled || compileProgram(opts.program);
    }
    this._tick = this._tick.bind(this);
    this.handle = this.raf(this._tick);
  }

  resize(w, h, dpr) {
    const nw = Math.max(1, Math.round(w)), nh = Math.max(1, Math.round(h));
    if (nw === this.w && nh === this.h && (!dpr || dpr === this.dpr) && !this.needsSetup) return;
    this.w = nw;
    this.h = nh;
    if (dpr) this.dpr = dpr;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.needsSetup = true;
  }

  setSignals(s) { for (const k of SIGNAL_KEYS) if (typeof s?.[k] === 'number' && Number.isFinite(s[k])) this.target[k] = s[k]; }
  setParams(p) { this.params = { ...this.params, ...p }; this.needsSetup = true; }
  setFps(fps) { this.fps = Math.max(1, Math.min(120, fps || 30)); }
  setPaused(p) { this.paused = !!p; }

  dispose() {
    this.disposed = true;
    if (this.handle != null) this.caf(this.handle);
    this.gl?.dispose();
  }

  _api(t, dt) {
    return { w: this.w, h: this.h, t, dt, frame: this.frame, dpr: this.dpr, s: this.s, p: this.params, state: this.state, lib };
  }

  _tick(nowArg) {
    if (this.disposed) return;
    this.handle = this.raf(this._tick);
    const now = typeof nowArg === 'number' ? nowArg : this.now();
    if (this.paused) { this.lastFrame = now; return; }
    const minGap = 1000 / this.fps;
    if (this.lastFrame && now - this.lastFrame < minGap - 1) return;
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : 1 / this.fps;
    this.lastFrame = now;
    if (this.t0 == null) this.t0 = now;
    const t = (now - this.t0) / 1000;

    // Ease signals toward their targets so ~4 Hz updates still animate smoothly.
    const k = 1 - Math.exp(-dt * 3);
    for (const key of SIGNAL_KEYS) this.s[key] += (this.target[key] - this.s[key]) * k;
    this.target.pulse *= Math.exp(-dt * 0.8);

    const start = this.now();
    try {
      if (this.gl) {
        this.gl.draw(this.w, this.h, t, dt, this.frame, this.s);
      } else {
        // Reset state *before* building the api object, so setup() and draw() share the same state.
        if (this.needsSetup) this.state = {};
        const api = this._api(t, dt);
        if (this.needsSetup) {
          this.prog.setup?.(api);
          this.needsSetup = false;
        }
        this.ctx.save();
        this.prog.draw(this.ctx, api);
        this.ctx.restore();
      }
    } catch (err) {
      this.dispose();
      this.o.onError?.(String(err && err.message || err));
      return;
    }
    this.frame++;
    this.framesSince++;
    this.costSum += this.now() - start;
    if (now - this.statsAt > 1000) {
      this.o.onStats?.({ fps: Math.round((this.framesSince * 1000) / Math.max(1, now - this.statsAt)), frameMs: +(this.costSum / Math.max(1, this.framesSince)).toFixed(2) });
      this.statsAt = now; this.framesSince = 0; this.costSum = 0;
    }
  }
}

// Shadertoy-compatible fragment shader painter (WebGL2, falling back to WebGL1).
const VERT2 = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const VERT1 = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const UNIFORMS = `
uniform vec3 iResolution; uniform float iTime; uniform float iTimeDelta; uniform int iFrame;
uniform vec4 iMouse; uniform vec4 iDate; uniform vec4 iSignal; uniform float iCalm; uniform float iPulse;
`;

export class ShaderPainter {
  constructor(canvas, glsl) {
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
    let gl = canvas.getContext('webgl2', opts), v2 = true;
    if (!gl) { gl = canvas.getContext('webgl', opts); v2 = false; }
    if (!gl) throw new Error('WebGL is unavailable');
    this.gl = gl;
    const frag = v2
      ? `#version 300 es\nprecision highp float;\n${UNIFORMS}\nout vec4 tvsOut;\n${glsl}\nvoid main(){ vec4 c = vec4(0.0); mainImage(c, gl_FragCoord.xy); tvsOut = vec4(c.rgb, 1.0); }`
      : `precision highp float;\n${UNIFORMS}\n${glsl.replace(/\btexture\s*\(/g, 'texture2D(')}\nvoid main(){ vec4 c = vec4(0.0); mainImage(c, gl_FragCoord.xy); gl_FragColor = vec4(c.rgb, 1.0); }`;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, v2 ? VERT2 : VERT1], [gl.FRAGMENT_SHADER, frag]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader compile error: ' + (gl.getShaderInfoLog(sh) || '').slice(0, 500));
      gl.attachShader(prog, sh);
    }
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Shader link error: ' + (gl.getProgramInfoLog(prog) || '').slice(0, 500));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iMouse', 'iDate', 'iSignal', 'iCalm', 'iPulse']) this.u[n] = gl.getUniformLocation(prog, n);
    this.prog = prog; this.buf = buf;
  }

  draw(w, h, t, dt, frame, s) {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, w, h);
    gl.uniform3f(u.iResolution, w, h, 1);
    gl.uniform1f(u.iTime, t);
    gl.uniform1f(u.iTimeDelta, dt);
    gl.uniform1i(u.iFrame, frame);
    gl.uniform4f(u.iMouse, 0, 0, 0, 0);
    const d = new Date();
    gl.uniform4f(u.iDate, d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
    gl.uniform4f(u.iSignal, s.intensity, s.range, s.velocity, s.dist);
    gl.uniform1f(u.iCalm, s.calm);
    gl.uniform1f(u.iPulse, s.pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    try { this.gl.deleteProgram(this.prog); this.gl.deleteBuffer(this.buf); this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) { /* ignore */ }
  }
}
