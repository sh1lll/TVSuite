// Capture a clean image of the chart by compositing the chart's own canvases (no screen-capture
// permission needed). The background is filled first, so "under" mode's cleared background and the
// skin itself never appear in journal images.
export function captureChart({ root, background = '#131722', maxWidth = 1600, quality = 0.85 } = {}) {
  const host = root || document.querySelector('.layout__area--center') || document.body;
  const box = host.getBoundingClientRect();
  if (box.width < 10 || box.height < 10) throw new Error('Chart area not found');
  const scale = Math.min(1, maxWidth / box.width) * (window.devicePixelRatio || 1);
  const out = document.createElement('canvas');
  out.width = Math.round(box.width * scale);
  out.height = Math.round(box.height * scale);
  const ctx = out.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  let drawn = 0;
  for (const c of host.querySelectorAll('canvas')) {
    if (c.closest('#tvsuite-skin-layer')) continue;
    const r = c.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || getComputedStyle(c).visibility === 'hidden') continue;
    try {
      ctx.drawImage(c, (r.left - box.left) * scale, (r.top - box.top) * scale, r.width * scale, r.height * scale);
      drawn++;
    } catch (_) { /* a tainted or detached canvas is skipped */ }
  }
  if (!drawn) throw new Error('No chart canvases to capture');
  return out.toDataURL('image/jpeg', quality);
}
