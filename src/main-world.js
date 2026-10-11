// Runs in the page's MAIN world at document_start (and is bundled into the desktop injection).
// Its single job: when skins run in "under" mode, turn the chart's full-canvas background fill
// into a clear so the skin layer shows through. Candles, grid, text and drawings are untouched,
// and no TradingView setting is changed, so nothing transparent is ever saved into a synced layout.
// Snapshots render on detached canvases, which are out of scope and keep their real background.
(function installTVSuiteMainWorld() {
  if (window.__tvsuiteMainWorld) return;
  window.__tvsuiteMainWorld = true;

  // Scripts injected over CDP (TradingView Desktop) run before <html> exists, so read the root lazily
  // and observe `document` itself rather than documentElement.
  const ATTR = 'data-tvsuite-clear';         // value: CSS selector of the scope whose canvases are cleared
  const EXCL = 'data-tvsuite-clear-exclude'; // optional selector of canvases to leave alone (e.g. axes)
  let scope = null, exclude = null;
  const verdict = new WeakMap();             // canvas -> boolean (in scope), reset when settings change

  let generation = 0;
  function readAttrs() {
    const root = document.documentElement;
    const nextScope = (root && root.getAttribute(ATTR)) || null;
    const nextExclude = (root && root.getAttribute(EXCL)) || null;
    if (nextScope !== scope || nextExclude !== exclude) { scope = nextScope; exclude = nextExclude; generation++; }
  }
  const attrObserver = new MutationObserver(readAttrs);
  function attach() {
    const root = document.documentElement;
    if (!root) return false;
    attrObserver.observe(root, { attributes: true, attributeFilter: [ATTR, EXCL] });
    readAttrs();
    return true;
  }
  if (!attach()) {
    // Only document's direct children are watched (cheap) until <html> appears.
    const boot = new MutationObserver(() => { if (attach()) boot.disconnect(); });
    boot.observe(document, { childList: true });
  }

  function inScope(canvas) {
    if (!canvas || !canvas.isConnected) return false;   // detached = snapshot/export rendering
    const hit = verdict.get(canvas);
    if (hit && hit.g === generation) return hit.v;
    let v = false;
    try { v = !!canvas.closest(scope) && !(exclude && canvas.closest(exclude)); } catch (_) { v = false; }
    verdict.set(canvas, { g: generation, v });
    return v;
  }

  const C2D = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (!C2D) return;
  const fillRect = C2D.fillRect;
  const clearRect = C2D.clearRect;

  function coversCanvas(ctx, x, y, w, h) {
    const c = ctx.canvas;
    const m = ctx.getTransform();
    if (m.b !== 0 || m.c !== 0) return false;
    const x0 = m.a * x + m.e, y0 = m.d * y + m.f, x1 = m.a * (x + w) + m.e, y1 = m.d * (y + h) + m.f;
    const tol = 2;
    return Math.min(x0, x1) <= tol && Math.min(y0, y1) <= tol && Math.max(x0, x1) >= c.width - tol && Math.max(y0, y1) >= c.height - tol;
  }

  C2D.fillRect = function (x, y, w, h) {
    if (scope !== null && w >= 64 && h >= 64 && inScope(this.canvas) && coversCanvas(this, x, y, w, h)) {
      window.__tvsuiteClears = (window.__tvsuiteClears || 0) + 1;
      return clearRect.call(this, x, y, w, h);
    }
    return fillRect.call(this, x, y, w, h);
  };

  // Answer small, explicit queries from the isolated-world content script.
  document.addEventListener('tvsuite:query', (e) => {
    let detail = null;
    try {
      const q = String(e.detail || '');
      if (q === 'user') {
        const md = window.initData && window.initData.metaInfo;
        const u = window.user;
        detail = JSON.stringify({ username: (md && md.username) || (u && u.username) || null });
      } else if (q.startsWith('{')) {
        // Chart commands through TradingView's page API (undocumented; used by public userscripts). The content
        // script falls back to a URL change when this reports ok:false.
        const cmd = JSON.parse(q);
        const api = window.TradingViewApi;
        const chart = api && typeof api.activeChart === 'function' ? api.activeChart() : null;
        if (cmd.cmd === 'setChart' && chart) {
          if (cmd.symbol && typeof chart.setSymbol === 'function') chart.setSymbol(String(cmd.symbol).slice(0, 60));
          if (cmd.interval && typeof chart.setResolution === 'function') chart.setResolution(String(cmd.interval).slice(0, 8));
          detail = JSON.stringify({ ok: true });
        } else if (cmd.cmd === 'keys') {
          // Key presses for the focused element, created here so page code (Monaco) sees keyCode.
          const t = document.activeElement || document.body;
          for (const k of (cmd.keys || []).slice(0, 10)) {
            for (const type of ['keydown', 'keyup']) {
              const e = new KeyboardEvent(type, { key: String(k.key), code: String(k.code), ctrlKey: !!k.ctrl, metaKey: !!k.meta, shiftKey: !!k.shift, bubbles: true, cancelable: true, composed: true });
              Object.defineProperty(e, 'keyCode', { get: () => +k.keyCode || 0 });
              Object.defineProperty(e, 'which', { get: () => +k.keyCode || 0 });
              t.dispatchEvent(e);
            }
          }
          detail = JSON.stringify({ ok: true });
        } else if (cmd.cmd === 'pineSet') {
          // Only if the page exposes Monaco (TradingView normally doesn't; the content script then drives the editor).
          const m = window.monaco;
          const eds = m && m.editor && typeof m.editor.getEditors === 'function' ? m.editor.getEditors() : [];
          const ed = eds.find((e) => { const n = e.getContainerDomNode && e.getContainerDomNode(); return n && n.closest && n.closest('[data-name*="pine" i], [class*="pine" i], [id*="pine" i]'); }) || eds[0];
          if (ed && typeof ed.getModel === 'function' && ed.getModel()) {
            const model = ed.getModel();
            ed.executeEdits('tvsuite', [{ range: model.getFullModelRange(), text: String(cmd.code || '') }]);
            ed.setPosition({ lineNumber: 1, column: 1 });
            detail = JSON.stringify({ ok: true });
          } else detail = JSON.stringify({ ok: false });
        } else if (cmd.cmd === 'chartInfo' && chart) {
          detail = JSON.stringify({ symbol: typeof chart.symbol === 'function' ? chart.symbol() : null, interval: typeof chart.resolution === 'function' ? chart.resolution() : null });
        } else detail = JSON.stringify({ ok: false });
      } else if (q === 'stats') {
        detail = JSON.stringify({ clears: window.__tvsuiteClears || 0, scope });
      }
    } catch (_) { detail = null; }
    document.dispatchEvent(new CustomEvent('tvsuite:answer', { detail }));
  });
})();
