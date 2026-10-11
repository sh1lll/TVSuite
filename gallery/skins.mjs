// Community gallery seed skins. `npm run build` turns this into gallery/index.json (served raw from GitHub)
// and bundles a copy into the extension so the gallery also works offline. Add yours via pull request.
export const GALLERY = [
  {
    name: 'Fireflies', kind: 'canvas', author: 'TVSuite', tags: ['nature', 'calm'],
    description: 'Soft fireflies drifting over a dark meadow; they gather and brighten when price speeds up.',
    params: { count: 70, hue: 55 },
    code: `function setup(api) {
  const r = api.lib.rng(21);
  api.state.f = Array.from({ length: 200 }, () => ({ x: r(), y: 0.25 + r() * 0.75, ph: r() * 6.28, sp: 0.3 + r() }));
}
function draw(ctx, api) {
  const { w, h, t, dt, s, p, lib, state } = api;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#03050a'); g.addColorStop(1, '#07120c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  const n = Math.min(p.count, state.f.length);
  for (let i = 0; i < n; i++) {
    const f = state.f[i];
    f.x += Math.cos(t * 0.3 * f.sp + f.ph) * dt * 0.01 * (1 + s.velocity * 3);
    f.y += Math.sin(t * 0.4 * f.sp + f.ph * 2) * dt * 0.008;
    if (f.x < 0) f.x += 1; if (f.x > 1) f.x -= 1;
    const blink = 0.5 + 0.5 * Math.sin(t * 2 * f.sp + f.ph);
    const r = (2 + 6 * blink) * api.dpr;
    const rg = ctx.createRadialGradient(f.x * w, f.y * h, 0, f.x * w, f.y * h, r * 3);
    rg.addColorStop(0, lib.hsl(p.hue + s.dist * 30, 100, 70, (0.25 + 0.5 * s.intensity) * blink));
    rg.addColorStop(1, lib.hsl(p.hue, 100, 50, 0));
    ctx.fillStyle = rg; ctx.fillRect(f.x * w - r * 3, f.y * h - r * 3, r * 6, r * 6);
  }
  ctx.globalCompositeOperation = 'source-over';
}`,
  },
  {
    name: 'Snowfall', kind: 'canvas', author: 'TVSuite', tags: ['winter', 'calm'],
    description: 'Gentle snow with depth; flakes fall faster in fast markets.',
    params: { count: 260, wind: 0.15 },
    code: `function setup(api) {
  const r = api.lib.rng(4);
  api.state.f = Array.from({ length: 600 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, ph: r() * 6.28 }));
}
function draw(ctx, api) {
  const { w, h, t, dt, s, p, state } = api;
  ctx.fillStyle = '#060a12'; ctx.fillRect(0, 0, w, h);
  const n = Math.min(p.count, state.f.length);
  ctx.fillStyle = 'rgba(220,230,255,' + (0.35 + 0.4 * s.intensity) + ')';
  for (let i = 0; i < n; i++) {
    const f = state.f[i];
    f.y += dt * 0.04 * f.z * (1 + s.velocity * 2);
    f.x += dt * (p.wind * 0.05 + Math.sin(t + f.ph) * 0.01) * f.z;
    if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
    if (f.x > 1) f.x -= 1; if (f.x < 0) f.x += 1;
    const r = f.z * 2.2 * api.dpr;
    ctx.beginPath(); ctx.arc(f.x * w, f.y * h, r, 0, 6.283); ctx.fill();
  }
}`,
  },
  {
    name: 'Topo Lines', kind: 'canvas', author: 'TVSuite', tags: ['minimal', 'map', 'low-cpu'],
    description: 'Slowly shifting topographic contour lines.',
    params: { lines: 14, hue: 200 },
    code: `function draw(ctx, api) {
  const { w, h, t, s, p, lib, state } = api;
  ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, w, h);
  const cols = 72, rows = Math.max(8, Math.round(cols * h / w));
  // Sample the height field once per frame, then trace every contour level from the grid.
  if (!state.grid || state.grid.length !== (cols + 1) * (rows + 1)) state.grid = new Float32Array((cols + 1) * (rows + 1));
  const g = state.grid, z = t * 0.02 * (1 + s.velocity);
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) g[j * (cols + 1) + i] = lib.fbm(i / cols * 3, j / rows * 3, z, 3);
  ctx.lineWidth = Math.max(1, api.dpr);
  const cw = w / cols, rh = h / rows;
  for (let k = 1; k <= p.lines; k++) {
    const level = k / (p.lines + 1) * 0.6 + 0.2;
    ctx.strokeStyle = lib.hsl(p.hue + s.dist * 40 + k * 3, 50, 40 + k, 0.18 + 0.25 * s.intensity);
    ctx.beginPath();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = g[j * (cols + 1) + i], b = g[j * (cols + 1) + i + 1], c = g[(j + 1) * (cols + 1) + i];
      if ((a - level) * (b - level) < 0) { const x = (i + (level - a) / (b - a)) * cw; ctx.moveTo(x, j * rh); ctx.lineTo(x, (j + 1) * rh); }
      if ((a - level) * (c - level) < 0) { const y = (j + (level - a) / (c - a)) * rh; ctx.moveTo(i * cw, y); ctx.lineTo((i + 1) * cw, y); }
    }
    ctx.stroke();
  }
}`,
  },
  {
    name: 'Ocean Dusk (shader)', kind: 'shader', author: 'TVSuite', tags: ['shader', 'ocean', 'calm'],
    description: 'Layered waves under a dusk sky; swell follows price velocity.',
    glsl: `
float wave(vec2 p, float t, float k){ return sin(p.x * k + t) * 0.5 + sin(p.x * k * 1.7 - t * 1.3) * 0.25; }
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = fragCoord / iResolution.xy;
  float t = iTime * (0.25 + 1.2 * iSignal.z);
  vec3 sky = mix(vec3(0.05, 0.03, 0.10), vec3(0.35, 0.12, 0.20), smoothstep(0.35, 1.0, uv.y));
  vec3 col = sky;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float h = 0.45 - fi * 0.08 + wave(uv, t * (0.6 + fi * 0.2), 6.0 + fi * 3.0) * 0.03;
    vec3 sea = mix(vec3(0.02, 0.06, 0.12), vec3(0.05, 0.18, 0.28), fi / 5.0);
    col = mix(col, sea, smoothstep(h + 0.004, h, uv.y));
  }
  col *= 0.5 + 0.5 * iSignal.x;
  col += vec3(0.25, 0.10, 0.05) * iPulse * 0.3;
  fragColor = vec4(col, 1.0);
}`,
  },
];
