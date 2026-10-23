// Runs in the page's MAIN world at document_start (and is bundled into the desktop injection).
// Its single job: when skins run in "under" mode, turn the chart's full-canvas background fill
// into a clear so the skin layer shows through. Candles, grid, text and drawings are untouched,
// and no TradingView setting is changed, so nothing transparent is ever saved into a synced layout.
// Snapshots render on detached canvases, which are out of scope and keep their real background.
(function installTVSuiteMainWorld() {
  if (window.__tvsuiteMainWorld) return;
  window.__tvsuiteMainWorld = true;

  // Keys typed into TVSuite's own text fields must never reach the page's shortcut handlers. This is registered
  // before the page's scripts run, so it sees keys first. Typing itself is unaffected (we don't cancel the key);
  // Enter, Escape and Tab still pass through because the panel's own fields use them.
  const PASS = new Set(['Enter', 'Escape', 'Tab']);
  const keyGuard = (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    const t = path[0];
    if (!t || !t.tagName || PASS.has(e.key)) return;
    if (!(t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!path.some((n) => typeof n.id === 'string' && n.id.startsWith('tvsuite-'))) return;
    e.stopImmediatePropagation();
  };
  for (const type of ['keydown', 'keypress', 'keyup']) window.addEventListener(type, keyGuard, true);

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

  // TradingView's page API: `TradingViewApi` on tradingview.com, `tradingViewApi` inside Charting Library frames
  // (TopstepX/ProjectX, TradeSea, …). Last resort: any global that looks like a chart widget.
  function chartApi() {
    const direct = window.TradingViewApi || window.tradingViewApi;
    if (direct && typeof direct.activeChart === 'function') return { api: direct, via: window.TradingViewApi ? 'TradingViewApi' : 'tradingViewApi' };
    for (const k of Object.keys(window)) {
      try {
        const v = window[k];
        if (v && typeof v === 'object' && typeof v.activeChart === 'function') return { api: v, via: k };
      } catch (_) { /* cross-origin or getter that throws */ }
    }
    return null;
  }

  // Shapes drawn by the Levels tab, so they can be cleared without touching the user's own drawings.
  const levelIds = (window.__tvsuiteLevelIds = window.__tvsuiteLevelIds || []);
  function clearLevels(chart) {
    let n = 0;
    for (const id of levelIds.splice(0)) {
      try { chart.removeEntity(id); n++; } catch (_) { /* already removed by the user */ }
    }
    return n;
  }
  // Temporary levels: kept out of the saved layout and the undo history, locked so a stray click doesn't move them.
  // Permanent levels: saved into the platform's layout like hand-drawn ones (so they stay without TVSuite); their
  // ids are reported back with a 'tvsuite:levelsPerm' event so TVSuite can remove them later.
  function drawLevels(chart, levels, opts) {
    const permanent = !!opts.permanent;
    if (permanent || opts.replace !== false) clearLevels(chart);
    const now = Math.floor(Date.now() / 1000);
    const span = Math.max(1, Math.min(24 * 14, +opts.extendHours || 24)) * 3600;
    const base = permanent ? { lock: !!opts.lock, disableSave: false, disableUndo: true, zOrder: 'bottom' } : { lock: true, disableSave: true, disableUndo: true, zOrder: 'bottom' };
    const made = [];
    const keep = (r) => made.push(Promise.resolve(r).then((id) => { if (id != null && !permanent) levelIds.push(id); return id; }).catch(() => null));
    // Template styles (already filtered to plain values by the content script) win over the default look.
    const tplOf = (l) => {
      const out = {};
      if (l.overrides && typeof l.overrides === 'object') {
        for (const [k, v] of Object.entries(l.overrides).slice(0, 80)) {
          if (k.length <= 40 && (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 80))) out[k] = v;
        }
      }
      return out;
    };
    let n = 0;
    for (const l of levels.slice(0, 300)) {
      const top = +l.top, bottom = +l.bottom;
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
      const color = String(l.color || '#9696a0').slice(0, 32);
      const text = String(l.label || '').slice(0, 80);
      if (opts.style === 'box' && top > bottom && typeof chart.createMultipointShape === 'function') {
        keep(chart.createMultipointShape([{ time: now - span, price: top }, { time: now + span, price: bottom }], {
          ...base, shape: 'rectangle', text,
          overrides: { color, backgroundColor: String(l.fill || color).slice(0, 40), fillBackground: true, linewidth: 1, showLabel: !!text, textColor: color, horzLabelsAlign: 'right', vertLabelsAlign: 'middle', fontSize: 11, ...tplOf(l) },
        }));
      } else {
        keep(chart.createShape({ time: now, price: (top + bottom) / 2 }, {
          ...base, shape: 'horizontal_line', text,
          overrides: { linecolor: color, linewidth: 1, linestyle: 0, showLabel: !!text, textcolor: color, horzLabelsAlign: 'right', vertLabelsAlign: 'top', fontsize: 11, ...tplOf(l) },
        }));
      }
      n++;
    }
    if (permanent) {
      Promise.all(made).then((ids) => {
        document.dispatchEvent(new CustomEvent('tvsuite:levelsPerm', { detail: JSON.stringify({ ids: ids.filter((id) => id != null).map(String) }) }));
      });
    }
    return n;
  }

  // Drawings copied from a TradingView chart. Reading: every shape on the chart except TVSuite's own temporary ones.
  const drawingIds = (window.__tvsuiteDrawingIds = window.__tvsuiteDrawingIds || []);
  function copyDrawings(chart) {
    if (typeof chart.getAllShapes !== 'function' || typeof chart.getShapeById !== 'function') return { ok: false, reason: 'This chart doesn\'t let pages read its drawings.' };
    const own = new Set([...levelIds, ...drawingIds].map(String));
    const items = [];
    let failed = 0;
    for (const s of chart.getAllShapes().slice(0, 1000)) {
      if (!s || own.has(String(s.id))) continue;
      try {
        const shape = chart.getShapeById(s.id);
        const props = typeof shape.getProperties === 'function' ? shape.getProperties() : {};
        items.push({ name: String(s.name || ''), points: typeof shape.getPoints === 'function' ? shape.getPoints() : [], props: JSON.parse(JSON.stringify(props || {})) });
      } catch (_) { failed++; }
    }
    return { ok: true, symbol: typeof chart.symbol === 'function' ? chart.symbol() : null, items, failed };
  }

  const plain = (v) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 2000);
  function deepPlain(o, depth) {
    const out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    for (const [k, v] of Object.entries(o).slice(0, 200)) {
      if (k.length > 40 || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (plain(v)) out[k] = v;
      else if (v && typeof v === 'object' && depth < 2) out[k] = deepPlain(v, depth + 1);
    }
    return out;
  }
  // Writing: each drawing is created with its own tool and points, flat style values as overrides, then the full
  // (nested) style applied on top where the chart allows it. Tools this chart doesn't have are skipped and named.
  function pasteDrawings(chart, items, opts) {
    const permanent = !!opts.permanent;
    if (!permanent || opts.replace !== false) for (const id of drawingIds.splice(0)) { try { chart.removeEntity(id); } catch (_) { /* gone */ } }
    const base = permanent ? { lock: !!opts.lock, disableSave: false, disableUndo: true } : { lock: true, disableSave: true, disableUndo: true };
    const made = [], skipped = [];
    for (const d of items.slice(0, 500)) {
      const name = String(d && d.name || '');
      const pts = (Array.isArray(d && d.points) ? d.points : []).slice(0, 20).map((p) => ({ time: +p.time, price: +p.price })).filter((p) => Number.isFinite(p.time) && Number.isFinite(p.price));
      if (!/^[a-z0-9_]{1,40}$/.test(name) || !pts.length) { skipped.push(name || '?'); continue; }
      const props = deepPlain(d.props, 0);
      const flat = {};
      for (const [k, v] of Object.entries(props)) if (plain(v)) flat[k] = v;
      const o = { ...base, shape: name, overrides: flat };
      if (d.text) o.text = String(d.text).slice(0, 2000);
      try {
        const r = pts.length > 1 && typeof chart.createMultipointShape === 'function' ? chart.createMultipointShape(pts, o) : chart.createShape(pts[0], o);
        made.push(Promise.resolve(r).then((id) => {
          if (id == null) { skipped.push(name); return null; }
          try { const sh = chart.getShapeById(id); if (sh && typeof sh.setProperties === 'function') sh.setProperties(props); } catch (_) { /* flat overrides already applied */ }
          if (!permanent) drawingIds.push(id);
          return id;
        }).catch(() => { skipped.push(name); return null; }));
      } catch (_) { skipped.push(name); }
    }
    Promise.all(made).then((ids) => {
      document.dispatchEvent(new CustomEvent('tvsuite:drawingsDone', { detail: JSON.stringify({ permanent, ids: ids.filter((id) => id != null).map(String), skipped }) }));
    });
    return { attempted: made.length, skipped };
  }

  function removeIds(chart, ids) {
    let n = 0;
    for (const id of ids.slice(0, 600)) {
      try { chart.removeEntity(String(id)); n++; } catch (_) { /* already deleted by hand */ }
    }
    return n;
  }

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
        } else if (/^(levels(Draw|Clear|Probe|RemoveIds)|drawings(Copy|Paste|Clear))$/.test(cmd.cmd)) {
          const found = chartApi();
          const lc = found && found.api.activeChart();
          if (!lc) detail = JSON.stringify({ ok: false, reason: 'This frame has no TradingView chart API.', frames: document.querySelectorAll('iframe').length });
          else if (cmd.cmd === 'drawingsCopy') detail = JSON.stringify(copyDrawings(lc));
          else if (cmd.cmd === 'drawingsPaste') detail = JSON.stringify({ ok: true, symbol: typeof lc.symbol === 'function' ? lc.symbol() : null, ...pasteDrawings(lc, Array.isArray(cmd.items) ? cmd.items : [], cmd.opts || {}) });
          else if (cmd.cmd === 'drawingsClear') detail = JSON.stringify({ ok: true, count: removeIds(lc, drawingIds.splice(0)) });
          else if (cmd.cmd === 'levelsProbe') {
            detail = JSON.stringify({ ok: true, via: found.via, symbol: typeof lc.symbol === 'function' ? lc.symbol() : null, rectangles: typeof lc.createMultipointShape === 'function', lines: typeof lc.createShape === 'function', drawn: levelIds.length });
          } else if (cmd.cmd === 'levelsClear') detail = JSON.stringify({ ok: true, count: clearLevels(lc) });
          else if (cmd.cmd === 'levelsRemoveIds') detail = JSON.stringify({ ok: true, count: removeIds(lc, Array.isArray(cmd.ids) ? cmd.ids : []) });
          else detail = JSON.stringify({ ok: true, count: drawLevels(lc, Array.isArray(cmd.levels) ? cmd.levels : [], cmd.opts || {}) });
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
