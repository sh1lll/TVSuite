// Screenshot cards: the chart (captured from its own canvases) framed on a gradient with symbol, price,
// P&L/R chips and your watermark — ready for X, Discord or the journal.
export const CARD_THEMES = {
  midnight: { name: 'Midnight', stops: ['#0b1020', '#1b2550', '#3a2a6b'], text: '#ffffff', sub: 'rgba(255,255,255,.65)', chip: 'rgba(255,255,255,.10)' },
  aurora: { name: 'Aurora', stops: ['#062a2a', '#0e5c5c', '#3b2a78'], text: '#ffffff', sub: 'rgba(255,255,255,.7)', chip: 'rgba(255,255,255,.12)' },
  sunset: { name: 'Sunset', stops: ['#2b0f2e', '#8a2a4b', '#f08a3c'], text: '#ffffff', sub: 'rgba(255,255,255,.75)', chip: 'rgba(0,0,0,.22)' },
  ocean: { name: 'Ocean', stops: ['#03122b', '#0b4b8a', '#1aa6c9'], text: '#ffffff', sub: 'rgba(255,255,255,.72)', chip: 'rgba(0,0,0,.2)' },
  mono: { name: 'Mono', stops: ['#0d0f14', '#1a1d26', '#262a36'], text: '#e9ecf2', sub: 'rgba(233,236,242,.6)', chip: 'rgba(255,255,255,.08)' },
  paper: { name: 'Paper', stops: ['#f4f1ea', '#e9e4d8', '#dcd5c5'], text: '#14161c', sub: 'rgba(20,22,28,.6)', chip: 'rgba(0,0,0,.06)' },
};
export const CARD_ASPECTS = { auto: null, '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5 };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// chart: an HTMLCanvasElement or ImageBitmap/HTMLImageElement. Returns a canvas.
export function composeCard(chart, { theme = 'midnight', aspect = 'auto', width = 1600, title = '', subtitle = '', chips = [], watermark = '', time = true, brand = true } = {}) {
  const t = CARD_THEMES[theme] || CARD_THEMES.midnight;
  const pad = Math.round(width * 0.045), headH = Math.round(width * 0.075), footH = chips.length || watermark ? Math.round(width * 0.06) : Math.round(width * 0.02);
  const innerW = width - pad * 2;
  const cw = chart.width, ch = chart.height;
  let imgH = Math.round((innerW * ch) / cw);
  let height = pad + headH + imgH + footH + pad;
  const ar = CARD_ASPECTS[aspect];
  if (ar) { height = Math.round(width / ar); imgH = Math.max(80, height - pad * 2 - headH - footH); }
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, width, height);
  t.stops.forEach((s, i) => g.addColorStop(i / (t.stops.length - 1), s));
  x.fillStyle = g; x.fillRect(0, 0, width, height);
  // soft glow
  const rg = x.createRadialGradient(width * 0.85, height * 0.1, 0, width * 0.85, height * 0.1, width * 0.6);
  rg.addColorStop(0, 'rgba(255,255,255,.10)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = rg; x.fillRect(0, 0, width, height);

  const font = (w, px) => `${w} ${Math.round(px)}px -apple-system, "Segoe UI", Inter, Roboto, sans-serif`;
  x.textBaseline = 'alphabetic';
  x.fillStyle = t.text; x.font = font(800, headH * 0.46);
  x.fillText(title || 'Chart', pad, pad + headH * 0.5);
  if (subtitle) { x.fillStyle = t.sub; x.font = font(500, headH * 0.26); x.fillText(subtitle, pad, pad + headH * 0.86); }
  if (time) {
    x.textAlign = 'right'; x.fillStyle = t.sub; x.font = font(500, headH * 0.24);
    x.fillText(new Date().toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }), width - pad, pad + headH * 0.5);
    x.textAlign = 'left';
  }

  // chart image, letterboxed into the frame, rounded with a shadow
  const fy = pad + headH, fh = imgH;
  const s = Math.min(innerW / cw, fh / ch), dw = cw * s, dh = ch * s, dx = pad + (innerW - dw) / 2, dy = fy + (fh - dh) / 2;
  const r = Math.round(width * 0.012);
  x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = width * 0.03; x.shadowOffsetY = width * 0.008;
  roundRect(x, dx, dy, dw, dh, r); x.fillStyle = '#131722'; x.fill(); x.restore();
  x.save(); roundRect(x, dx, dy, dw, dh, r); x.clip(); x.drawImage(chart, dx, dy, dw, dh); x.restore();
  x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = Math.max(1, width / 1200); roundRect(x, dx, dy, dw, dh, r); x.stroke();

  // footer chips
  let cx = pad;
  const cyMid = height - pad - footH * 0.45;
  x.font = font(700, footH * 0.36);
  for (const chip of chips.filter((q) => q && q.text)) {
    const tw = x.measureText(chip.text).width, ph = footH * 0.62, pw = tw + footH * 0.5;
    if (cx + pw > width - pad - (watermark ? width * 0.25 : 0)) break;
    x.fillStyle = t.chip; roundRect(x, cx, cyMid - ph / 2, pw, ph, ph / 2); x.fill();
    x.fillStyle = chip.color || t.text; x.textBaseline = 'middle'; x.fillText(chip.text, cx + footH * 0.25, cyMid + 1);
    cx += pw + footH * 0.22;
  }
  x.textBaseline = 'middle'; x.textAlign = 'right';
  if (watermark || brand) {
    x.fillStyle = t.sub; x.font = font(600, footH * 0.34);
    x.fillText(watermark ? `${watermark}${brand ? '  ·  TVSuite' : ''}` : 'TVSuite', width - pad, cyMid + 1);
  }
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  return c;
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality));
}
