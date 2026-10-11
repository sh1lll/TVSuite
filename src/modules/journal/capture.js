// Capture a clean image of the chart by compositing the chart's own canvases (no screen-capture
// permission needed). The background is filled first, so "under" mode's cleared background and the
// skin itself never appear in captures. Shared by the journal, screenshot cards and the recorder.
export function chartHost(root) {
  return root || document.querySelector('.layout__area--center') || document.body;
}

// Draw every visible chart canvas under `host` into ctx (already sized). Returns how many were drawn.
export function drawChart(ctx, host, { scale = 1, background = '#131722', box = host.getBoundingClientRect() } = {}) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
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
  return drawn;
}

export function captureChartCanvas({ root, background = '#131722', maxWidth = 1600 } = {}) {
  const host = chartHost(root);
  const box = host.getBoundingClientRect();
  if (box.width < 10 || box.height < 10) throw new Error('Chart area not found');
  const scale = Math.min(1, maxWidth / box.width) * (window.devicePixelRatio || 1);
  const out = document.createElement('canvas');
  out.width = Math.round(box.width * scale);
  out.height = Math.round(box.height * scale);
  if (!drawChart(out.getContext('2d'), host, { scale, background, box })) throw new Error('No chart canvases to capture');
  return out;
}

export function captureChart({ quality = 0.85, ...opts } = {}) {
  return captureChartCanvas(opts).toDataURL('image/jpeg', quality);
}
