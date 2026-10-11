// Helper library handed to every canvas skin as api.lib (built-in and generated alike).
// Must stay dependency-free: it is bundled into the sandboxed skin worker.

export function clamp(x, a = 0, b = 1) { return x < a ? a : x > b ? b : x; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
export function fract(x) { return x - Math.floor(x); }

// Deterministic PRNG (mulberry32) so skins can be reproducible from a seed.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D/3D value noise in [0,1], cheap enough for per-particle use (not per-pixel).
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function noise2(x, y) { return noise3(x, y, 0); }
export function fbm(x, y, z = 0, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += amp * noise3(x * freq, y * freq, z * freq); norm += amp; amp *= 0.5; freq *= 2; }
  return sum / norm;
}

export function hsl(h, s = 70, l = 50, a = 1) { return `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`; }
export function rgba(r, g, b, a = 1) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }

// Parse "#rrggbb"/"#rgb" into [r,g,b].
export function hex(c) {
  const s = String(c).replace('#', '');
  const f = s.length === 3 ? s.split('').map((x) => x + x).join('') : s.padEnd(6, '0');
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

// Map the signed distance from the daily open (-1..1) to a bearish→neutral→bullish hue.
export function trendHue(dist, bull = 150, bear = 355, neutral = 220) {
  return dist >= 0 ? lerp(neutral, bull, clamp(dist)) : lerp(neutral, bear - 360, clamp(-dist));
}

export const lib = { clamp, lerp, smoothstep, fract, rng, noise2, noise3, fbm, hsl, rgba, hex, trendHue, TAU: Math.PI * 2 };
