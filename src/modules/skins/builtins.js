// Built-in skins. Every canvas skin uses the same contract a generated skin uses:
//   setup(api)      optional, once per (re)size
//   draw(ctx, api)  every frame
// api = { w, h, t, dt, frame, dpr, s, p, state, lib }
//   s: smoothed chart signals { intensity, range, velocity, dist, calm, pulse } (all 0..1, dist -1..1)
//   p: the skin's params, state: scratch object kept between frames, lib: see lib.js
// The functions must be self-contained (no references to module scope) because they are
// serialized with Function.prototype.toString and re-created inside the sandboxed worker.

export const BUILTIN_CANVAS = [
  {
    id: 'aurora', name: 'Aurora', tags: ['calm', 'gradient'],
    description: 'Slow aurora ribbons. Hue leans green above the daily open and red below it.',
    params: { hue: 165, spread: 38, bands: 4, speed: 1, bg: '#05070d' },
    spec: { hue: [0, 360, 1], spread: [0, 120, 1], bands: [1, 7, 1], speed: [0.1, 3, 0.1] },
    draw: function (ctx, api) {
      const { w, h, t, s, p, lib } = api;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const speed = p.speed * (0.4 + s.velocity * 1.6);
      api.state.phase = (api.state.phase || 0) + api.dt * speed;
      const ph = api.state.phase;
      for (let i = 0; i < p.bands; i++) {
        const hue = p.hue + i * p.spread + s.dist * 45;
        const yBase = h * (0.22 + (0.6 * i) / Math.max(1, p.bands));
        ctx.beginPath();
        ctx.moveTo(0, h);
        const step = w / 40;
        for (let x = 0; x <= w + step; x += step) {
          const nx = x / w;
          const y = yBase + Math.sin(nx * 3.2 + ph * 0.35 + i * 1.7) * h * 0.07 + (lib.noise3(nx * 2.2, i * 3.1, ph * 0.12) - 0.5) * h * 0.3;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        const g = ctx.createLinearGradient(0, yBase - h * 0.25, 0, yBase + h * 0.35);
        const a = 0.12 + 0.22 * s.intensity + 0.15 * s.pulse;
        g.addColorStop(0, lib.hsl(hue, 85, 60, 0));
        g.addColorStop(0.35, lib.hsl(hue, 85, 55, a));
        g.addColorStop(1, lib.hsl(hue + 30, 85, 35, 0));
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'starfield', name: 'Starfield', tags: ['space', 'reactive'],
    description: 'Parallax stars. Warp speed follows how fast price is moving.',
    params: { count: 420, speed: 1, hue: 210, bg: '#020308' },
    spec: { count: [50, 1500, 10], speed: [0.1, 4, 0.1], hue: [0, 360, 1] },
    setup: function (api) {
      const r = api.lib.rng(7);
      api.state.stars = Array.from({ length: api.p.count }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, z: r() }));
    },
    draw: function (ctx, api) {
      const { w, h, dt, s, p, lib, state } = api;
      ctx.fillStyle = p.bg; ctx.globalAlpha = 0.55 + 0.4 * (1 - s.velocity); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      const v = p.speed * (0.05 + s.velocity * 0.9 + s.pulse * 0.6) * dt;
      const cx = w / 2, cy = h / 2, f = Math.min(w, h) * 0.6;
      for (const st of state.stars) {
        const pz = st.z;
        st.z -= v;
        if (st.z <= 0.02) { st.z = 1; st.x = Math.random() * 2 - 1; st.y = Math.random() * 2 - 1; continue; }
        const x = cx + (st.x / st.z) * f, y = cy + (st.y / st.z) * f;
        const px = cx + (st.x / pz) * f, py = cy + (st.y / pz) * f;
        if (x < 0 || x > w || y < 0 || y > h) { st.z = 1; continue; }
        const b = lib.clamp(1 - st.z);
        ctx.strokeStyle = lib.hsl(p.hue + s.dist * 40, 60, 70 + 25 * b, b * (0.35 + 0.65 * s.intensity));
        ctx.lineWidth = Math.max(0.6, b * 2.4 * api.dpr);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      }
    },
  },
  {
    id: 'rain-neon', name: 'Rainy Neon Street', tags: ['city', 'rain', 'neon'],
    description: 'Neon signage bleeding through rain. Heavier rain when candles are large.',
    params: { drops: 260, hueA: 300, hueB: 190, wind: 0.25 },
    spec: { drops: [40, 800, 10], hueA: [0, 360, 1], hueB: [0, 360, 1], wind: [-1, 1, 0.05] },
    setup: function (api) {
      const r = api.lib.rng(3);
      api.state.drops = Array.from({ length: 800 }, () => ({ x: r(), y: r(), l: 0.4 + r() * 0.6, v: 0.6 + r() * 0.8 }));
      api.state.signs = Array.from({ length: 7 }, (_, i) => ({ x: r(), y: 0.15 + r() * 0.5, w: 0.05 + r() * 0.14, h: 0.02 + r() * 0.06, hue: i % 2 ? api.p.hueA : api.p.hueB, ph: r() * 10 }));
    },
    draw: function (ctx, api) {
      const { w, h, t, dt, s, p, lib, state } = api;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#07040f'); g.addColorStop(0.7, '#0b0a1c'); g.addColorStop(1, '#03060a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const sg of state.signs) {
        const flicker = 0.75 + 0.25 * Math.sin(t * 7 + sg.ph) * (Math.sin(t * 0.7 + sg.ph * 3) > 0.92 ? 1 : 0.1);
        const cx = sg.x * w, cy = sg.y * h, rr = Math.max(sg.w * w, 40) * 1.6;
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        const a = (0.18 + 0.22 * s.intensity) * flicker;
        rg.addColorStop(0, lib.hsl(sg.hue, 100, 60, a)); rg.addColorStop(1, lib.hsl(sg.hue, 100, 50, 0));
        ctx.fillStyle = rg; ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
        ctx.fillStyle = lib.hsl(sg.hue, 100, 70, 0.35 * flicker);
        ctx.fillRect(cx - (sg.w * w) / 2, cy - (sg.h * h) / 2, sg.w * w, Math.max(2, sg.h * h * 0.25));
        // reflection on the wet street
        const ry = h - (cy * 0.35);
        const rf = ctx.createRadialGradient(cx, ry, 0, cx, ry, rr * 0.8);
        rf.addColorStop(0, lib.hsl(sg.hue, 100, 55, a * 0.5)); rf.addColorStop(1, lib.hsl(sg.hue, 100, 50, 0));
        ctx.fillStyle = rf; ctx.fillRect(cx - rr, ry - rr * 0.3, rr * 2, rr * 0.6);
      }
      ctx.globalCompositeOperation = 'source-over';
      const n = Math.min(state.drops.length, Math.round(p.drops * (0.5 + s.range)));
      const fall = (1.1 + s.velocity * 1.5) * dt;
      ctx.strokeStyle = `rgba(170,190,255,${0.18 + 0.2 * s.intensity})`;
      ctx.lineWidth = Math.max(1, api.dpr * 0.8);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const d = state.drops[i];
        d.y += fall * d.v; d.x += p.wind * fall * 0.3;
        if (d.y > 1) { d.y -= 1.05; d.x = Math.random(); }
        if (d.x > 1) d.x -= 1; else if (d.x < 0) d.x += 1;
        const x = d.x * w, y = d.y * h, len = d.l * h * 0.035;
        ctx.moveTo(x, y); ctx.lineTo(x - p.wind * len * 0.4, y - len);
      }
      ctx.stroke();
    },
  },
  {
    id: 'synthwave', name: 'Synthwave Grid', tags: ['retro', 'grid'],
    description: 'Retro horizon grid. Scroll speed follows price velocity; the sun pulses on session opens.',
    params: { hue: 300, speed: 1, lines: 16 },
    spec: { hue: [0, 360, 1], speed: [0.1, 4, 0.1], lines: [6, 40, 1] },
    draw: function (ctx, api) {
      const { w, h, dt, s, p, lib, state } = api;
      const horizon = h * 0.55;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#05010d'); sky.addColorStop(1, lib.hsl(p.hue, 70, 14));
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
      ctx.fillStyle = '#040109'; ctx.fillRect(0, horizon, w, h - horizon);
      const sr = Math.min(w, h) * (0.16 + 0.03 * s.pulse);
      const sg = ctx.createLinearGradient(0, horizon - sr * 2, 0, horizon);
      sg.addColorStop(0, lib.hsl(45, 100, 60, 0.85)); sg.addColorStop(1, lib.hsl(p.hue + 20, 100, 55, 0.85));
      ctx.save();
      ctx.beginPath(); ctx.arc(w / 2, horizon, sr * 1.2, Math.PI, 0); ctx.closePath(); ctx.clip();
      ctx.fillStyle = sg; ctx.fillRect(w / 2 - sr * 1.3, horizon - sr * 1.3, sr * 2.6, sr * 1.3);
      // Horizontal gaps in the sun, filled with the sky so they read as cut-outs.
      ctx.fillStyle = sky;
      for (let i = 0; i < 6; i++) { const yy = horizon - sr * 0.1 - i * sr * 0.17; ctx.fillRect(w / 2 - sr * 1.3, yy, sr * 2.6, Math.max(1, sr * 0.03 * (6 - i))); }
      ctx.restore();
      state.off = ((state.off || 0) + dt * p.speed * (0.2 + s.velocity * 1.5)) % 1;
      ctx.strokeStyle = lib.hsl(p.hue, 100, 60, 0.35 + 0.4 * s.intensity);
      ctx.lineWidth = Math.max(1, api.dpr);
      ctx.beginPath();
      for (let i = 0; i < p.lines; i++) {
        const z = (i + state.off) / p.lines;
        const y = horizon + (h - horizon) * z * z;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      for (let i = -p.lines; i <= p.lines; i++) {
        const xb = w / 2 + (i / p.lines) * w * 1.6;
        ctx.moveTo(w / 2 + (i / p.lines) * w * 0.05, horizon); ctx.lineTo(xb, h);
      }
      ctx.stroke();
    },
  },
  {
    id: 'plexus', name: 'Plexus', tags: ['network', 'particles'],
    description: 'Drifting nodes joined by faint links. Link distance grows with candle range.',
    params: { count: 70, hue: 200, link: 0.14, speed: 1 },
    spec: { count: [10, 160, 1], hue: [0, 360, 1], link: [0.05, 0.3, 0.01], speed: [0.1, 3, 0.1] },
    setup: function (api) {
      const r = api.lib.rng(11);
      api.state.pts = Array.from({ length: 160 }, () => ({ x: r(), y: r(), vx: (r() - 0.5) * 0.04, vy: (r() - 0.5) * 0.04 }));
    },
    draw: function (ctx, api) {
      const { w, h, dt, s, p, lib, state } = api;
      ctx.fillStyle = '#04060b'; ctx.fillRect(0, 0, w, h);
      const n = Math.min(p.count, state.pts.length);
      const sp = p.speed * (0.5 + s.velocity * 2);
      for (let i = 0; i < n; i++) {
        const q = state.pts[i];
        q.x += q.vx * dt * sp; q.y += q.vy * dt * sp;
        if (q.x < 0 || q.x > 1) q.vx *= -1;
        if (q.y < 0 || q.y > 1) q.vy *= -1;
      }
      const maxD = p.link * (0.8 + s.range * 0.8);
      const hue = p.hue + s.dist * 50;
      ctx.lineWidth = Math.max(0.7, api.dpr * 0.7);
      for (let i = 0; i < n; i++) {
        const a = state.pts[i];
        for (let j = i + 1; j < n; j++) {
          const b = state.pts[j];
          const dx = (a.x - b.x) * (w / h), dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < maxD) {
            ctx.strokeStyle = lib.hsl(hue, 80, 60, (1 - d / maxD) * (0.15 + 0.35 * s.intensity));
            ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = lib.hsl(hue, 90, 70, 0.7);
      for (let i = 0; i < n; i++) { const q = state.pts[i]; ctx.fillRect(q.x * w - api.dpr, q.y * h - api.dpr, api.dpr * 2, api.dpr * 2); }
    },
  },
  {
    id: 'nebula', name: 'Nebula', tags: ['space', 'calm'],
    description: 'Soft drifting clouds rendered at low resolution and upscaled — very light on CPU.',
    params: { hue: 260, hue2: 190, speed: 1, res: 72 },
    spec: { hue: [0, 360, 1], hue2: [0, 360, 1], speed: [0.1, 3, 0.1], res: [32, 160, 4] },
    setup: function (api) {
      const rw = Math.max(16, Math.round(api.p.res)), rh = Math.max(9, Math.round((rw * api.h) / Math.max(1, api.w)));
      api.state.buf = new OffscreenCanvas(rw, rh);
      api.state.bctx = api.state.buf.getContext('2d');
      api.state.img = api.state.bctx.createImageData(rw, rh);
    },
    draw: function (ctx, api) {
      const { w, h, dt, s, p, lib, state } = api;
      state.z = (state.z || 0) + dt * 0.05 * p.speed * (0.5 + s.velocity);
      const img = state.img, d = img.data, W = img.width, H = img.height;
      const [r1, g1, b1] = hslToRgb(p.hue + s.dist * 40, 0.7, 0.45);
      const [r2, g2, b2] = hslToRgb(p.hue2, 0.8, 0.5);
      const k = 0.35 + 0.65 * s.intensity;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const n1 = lib.fbm(x / W * 2.5, y / H * 2.5, state.z, 4);
          const n2 = lib.fbm(x / W * 4 + 7, y / H * 4, state.z * 1.3, 3);
          const a = lib.smoothstep(0.35, 0.85, n1) * k, b = lib.smoothstep(0.5, 0.9, n2) * k * 0.7;
          const i = (y * W + x) * 4;
          d[i] = 4 + r1 * a + r2 * b; d[i + 1] = 5 + g1 * a + g2 * b; d[i + 2] = 12 + b1 * a + b2 * b; d[i + 3] = 255;
        }
      }
      state.bctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(state.buf, 0, 0, w, h);
      function hslToRgb(hh, ss, ll) {
        hh = ((hh % 360) + 360) % 360 / 360;
        const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss, pp = 2 * ll - q;
        const f = (tt) => { tt = (tt + 1) % 1; return 255 * (tt < 1 / 6 ? pp + (q - pp) * 6 * tt : tt < 0.5 ? q : tt < 2 / 3 ? pp + (q - pp) * (2 / 3 - tt) * 6 : pp); };
        return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
      }
    },
  },
  {
    id: 'digital-rain', name: 'Digital Rain', tags: ['code', 'retro'],
    description: 'Falling glyph columns. Columns speed up with price velocity.',
    params: { size: 16, hue: 135, speed: 1 },
    spec: { size: [8, 32, 1], hue: [0, 360, 1], speed: [0.1, 3, 0.1] },
    setup: function (api) {
      const fs = api.p.size * api.dpr;
      const cols = Math.ceil(api.w / fs);
      api.state.cols = Array.from({ length: cols }, () => Math.random() * -50);
      api.state.fs = fs;
      api.state.glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789$€¥£₿▲▼';
    },
    draw: function (ctx, api) {
      const { w, h, dt, s, p, lib, state } = api;
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, w, h);
      ctx.font = `${state.fs}px monospace`;
      const v = p.speed * (8 + s.velocity * 30) * dt;
      for (let i = 0; i < state.cols.length; i++) {
        const y = state.cols[i];
        const ch = state.glyphs[(Math.random() * state.glyphs.length) | 0];
        ctx.fillStyle = lib.hsl(p.hue + s.dist * 60, 90, 75, 0.9);
        ctx.fillText(ch, i * state.fs, y * state.fs);
        ctx.fillStyle = lib.hsl(p.hue + s.dist * 60, 80, 45, 0.5 * s.intensity);
        ctx.fillText(ch, i * state.fs, (y - 1) * state.fs);
        state.cols[i] = y * state.fs > h && Math.random() > 0.97 ? 0 : y + v * (0.6 + (i % 5) * 0.1);
      }
    },
  },
  {
    id: 'gradient-drift', name: 'Gradient Drift', tags: ['minimal', 'calm', 'low-cpu'],
    description: 'Two soft color pools drifting slowly. The lightest skin; good for laptops.',
    params: { hueA: 230, hueB: 280, speed: 1 },
    spec: { hueA: [0, 360, 1], hueB: [0, 360, 1], speed: [0.1, 3, 0.1] },
    draw: function (ctx, api) {
      const { w, h, t, s, p, lib } = api;
      ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, w, h);
      const tt = t * 0.05 * p.speed;
      const pools = [
        [0.3 + 0.2 * Math.sin(tt * 1.3), 0.4 + 0.2 * Math.cos(tt), p.hueA + s.dist * 40],
        [0.7 + 0.2 * Math.cos(tt * 0.9), 0.6 + 0.2 * Math.sin(tt * 1.1), p.hueB],
      ];
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, hue] of pools) {
        const r = Math.max(w, h) * 0.6;
        const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r);
        g.addColorStop(0, lib.hsl(hue, 70, 40, 0.25 + 0.25 * s.intensity)); g.addColorStop(1, lib.hsl(hue, 70, 30, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'embers', name: 'Embers', tags: ['fire', 'reactive', 'particles'],
    description: 'Rising embers that turn green above the daily open and red below it.',
    params: { count: 180, speed: 1 },
    spec: { count: [20, 500, 5], speed: [0.1, 3, 0.1] },
    setup: function (api) {
      const r = api.lib.rng(5);
      api.state.e = Array.from({ length: 500 }, () => ({ x: r(), y: r(), s: 0.3 + r(), ph: r() * 6.28 }));
    },
    draw: function (ctx, api) {
      const { w, h, t, dt, s, p, lib, state } = api;
      ctx.fillStyle = 'rgba(4,3,6,0.35)'; ctx.fillRect(0, 0, w, h);
      const hue = lib.trendHue(s.dist, 140, 8, 28);
      ctx.globalCompositeOperation = 'lighter';
      const n = Math.min(state.e.length, p.count);
      for (let i = 0; i < n; i++) {
        const e = state.e[i];
        e.y -= dt * 0.06 * e.s * p.speed * (0.6 + s.velocity * 2);
        e.x += Math.sin(t * 0.8 + e.ph) * 0.0006;
        if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); }
        const r = (1.2 + e.s * 2.2) * api.dpr;
        const g = ctx.createRadialGradient(e.x * w, e.y * h, 0, e.x * w, e.y * h, r * 4);
        g.addColorStop(0, lib.hsl(hue, 100, 65, 0.55 * s.intensity * (0.4 + e.y * 0.6)));
        g.addColorStop(1, lib.hsl(hue, 100, 50, 0));
        ctx.fillStyle = g; ctx.fillRect(e.x * w - r * 4, e.y * h - r * 4, r * 8, r * 8);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'sakura-dusk', name: 'Sakura Dusk', tags: ['tokyo', 'calm', 'nature'],
    description: 'Petals drifting through a dusk sky — the default Tokyo-session skin.',
    params: { count: 90, wind: 0.4 },
    spec: { count: [10, 300, 5], wind: [-1, 1, 0.05] },
    setup: function (api) {
      const r = api.lib.rng(9);
      api.state.pt = Array.from({ length: 300 }, () => ({ x: r(), y: r(), r: r() * 6.28, vr: (r() - 0.5) * 2, s: 0.5 + r() }));
    },
    draw: function (ctx, api) {
      const { w, h, t, dt, s, p, lib, state } = api;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a0614'); g.addColorStop(0.6, '#1d0c22'); g.addColorStop(1, '#2b1020');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const n = Math.min(p.count, state.pt.length);
      for (let i = 0; i < n; i++) {
        const q = state.pt[i];
        q.y += dt * 0.03 * q.s * (0.7 + s.velocity);
        q.x += dt * 0.02 * p.wind * q.s + Math.sin(t + i) * 0.0004;
        q.r += dt * q.vr;
        if (q.y > 1.05) { q.y = -0.05; q.x = Math.random(); }
        if (q.x > 1.05) q.x = -0.05; else if (q.x < -0.05) q.x = 1.05;
        const size = (4 + q.s * 5) * api.dpr;
        ctx.save(); ctx.translate(q.x * w, q.y * h); ctx.rotate(q.r);
        ctx.fillStyle = lib.hsl(340 + s.dist * 15, 70, 75, 0.25 + 0.35 * s.intensity);
        ctx.beginPath(); ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },
  },
];

// GLSL skins (Shadertoy-style mainImage). Written for TVSuite; extra uniforms:
//   iSignal = vec4(intensity, range, velocity, dist), iCalm, iPulse
export const BUILTIN_SHADERS = [
  {
    id: 'silk', name: 'Silk (shader)', tags: ['shader', 'calm'],
    description: 'Domain-warped noise folds. GPU-rendered.',
    glsl: `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = fragCoord / iResolution.y;
  float t = iTime * (0.04 + 0.12 * iSignal.z);
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(uv + 3.0*q + vec2(1.7, 9.2) + 0.5*t), fbm(uv + 3.0*q + vec2(8.3, 2.8) - 0.4*t));
  float f = fbm(uv + 3.0*r);
  vec3 bull = vec3(0.10, 0.55, 0.45), bear = vec3(0.65, 0.12, 0.22), mid = vec3(0.25, 0.22, 0.60);
  vec3 tint = iSignal.w >= 0.0 ? mix(mid, bull, iSignal.w) : mix(mid, bear, -iSignal.w);
  vec3 col = mix(vec3(0.02,0.02,0.05), tint, clamp(f*f*1.8, 0.0, 1.0));
  col = mix(col, vec3(0.9, 0.8, 1.0), clamp(length(r)*0.25 - 0.1, 0.0, 1.0) * 0.4);
  col *= 0.45 + 0.55 * iSignal.x;
  col += iPulse * 0.08;
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'plasma', name: 'Plasma (shader)', tags: ['shader', 'retro'],
    description: 'Classic sine plasma with a slow palette cycle.',
    glsl: `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5*iResolution.xy) / iResolution.y;
  float t = iTime * (0.15 + 0.6 * iSignal.z);
  float v = sin(uv.x*6.0 + t) + sin(uv.y*5.0 - t*1.3) + sin((uv.x+uv.y)*4.0 + t*0.7) + sin(length(uv*8.0) - t*1.7);
  vec3 col = 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + v*0.12 + iTime*0.01 + iSignal.w*0.15));
  col *= 0.18 + 0.32 * iSignal.x;
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'tunnel', name: 'Warp Tunnel (shader)', tags: ['shader', 'space', 'reactive'],
    description: 'A ring tunnel whose speed follows price velocity.',
    glsl: `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5*iResolution.xy) / iResolution.y;
  float r = length(uv) + 1e-3, a = atan(uv.y, uv.x);
  float z = 0.25 / r + iTime * (0.3 + 2.5 * iSignal.z);
  float rings = smoothstep(0.85, 1.0, sin(z * 6.2831) * 0.5 + 0.5);
  float spokes = smoothstep(0.92, 1.0, sin(a * 12.0 + z) * 0.5 + 0.5);
  vec3 base = 0.5 + 0.5*cos(6.2831*(vec3(0.6,0.7,0.8) + z*0.03 + iSignal.w*0.2));
  vec3 col = base * (rings + spokes*0.5) * smoothstep(0.0, 0.6, r) * (0.25 + 0.6*iSignal.x);
  col += iPulse * 0.1 * base;
  fragColor = vec4(col, 1.0);
}`,
  },
];

export function builtinIndex() {
  const out = new Map();
  for (const b of BUILTIN_CANVAS) out.set(b.id, { ...b, kind: 'canvas' });
  for (const b of BUILTIN_SHADERS) out.set(b.id, { ...b, kind: 'shader' });
  return out;
}

// Turn a builtin canvas skin into the program text the worker evaluates.
export function builtinProgram(b) {
  const setup = b.setup ? `const setup = (${b.setup.toString()});` : 'const setup = null;';
  return `${setup}\nconst draw = (${b.draw.toString()});`;
}
