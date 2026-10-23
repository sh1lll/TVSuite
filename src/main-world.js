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

  // Labs: TVSuite's own indicators inside embedded charts (TradeSea, TopstepX). The Charting Library only takes custom
  // indicators when the chart is created, through the widget's custom_indicators_getter option, so TradingView.widget
  // is wrapped as soon as the library script has run. The wrapper always passes the platform's own indicators through
  // and only adds TVSuite's when Labs → indicators is on for this site (a localStorage flag the content script sets).
  const IND_FLAG = 'tvsuite:labs:indicators';
  function tvsuiteIndicators(PineJS) {
    const Std = PineJS.Std;
    return [{
      name: 'TVSuite Demo MA',
      metainfo: {
        _metainfoVersion: 53,
        id: 'TVSuiteDemoMA@tv-basicstudies-1',
        name: 'TVSuite Demo MA',
        description: 'TVSuite Demo MA',
        shortDescription: 'TVSuite MA',
        is_price_study: true,
        isCustomIndicator: true,
        format: { type: 'inherit' },
        plots: [{ id: 'plot_0', type: 'line' }, { id: 'plot_1', type: 'line' }],
        defaults: {
          styles: {
            plot_0: { linestyle: 0, visible: true, linewidth: 2, plottype: 0, trackPrice: false, transparency: 0, color: '#f5be28' },
            plot_1: { linestyle: 0, visible: true, linewidth: 2, plottype: 0, trackPrice: false, transparency: 0, color: '#2962ff' },
          },
          inputs: { in_0: 20 },
        },
        styles: { plot_0: { title: 'SMA', histogramBase: 0 }, plot_1: { title: 'VWMA (uses volume)', histogramBase: 0 } },
        inputs: [{ id: 'in_0', name: 'Length', defval: 20, type: 'integer', min: 1, max: 500 }],
      },
      constructor: function () {
        this.main = function (context, inputCallback) {
          this._context = context;
          this._input = inputCallback;
          const len = this._input(0);
          const c = Std.close(this._context), v = Std.volume(this._context);
          const sma = Std.sma(this._context.new_var(c), len, this._context);
          const cv = Std.sum(this._context.new_var(c * v), len, this._context), vv = Std.sum(this._context.new_var(v), len, this._context);
          return [sma, vv ? cv / vv : NaN];
        };
      },
    }];
  }
  function indicatorsOn() { try { return localStorage.getItem(IND_FLAG) === '1'; } catch (_) { return false; } }
  function wrapWidget() {
    const TV = window.TradingView;
    const Orig = TV && TV.widget;
    if (typeof Orig !== 'function' || Orig.__tvsuite) return;
    const Wrapped = function (opts) {
      try {
        if (opts && typeof opts === 'object' && indicatorsOn()) {
          const theirs = opts.custom_indicators_getter;
          opts.custom_indicators_getter = function (PineJS) {
            const own = Promise.resolve(typeof theirs === 'function' ? theirs.call(this, PineJS) : []).catch(() => []);
            return own.then((list) => {
              let mine = [];
              try { mine = tvsuiteIndicators(PineJS); } catch (_) { /* never break the platform's chart */ }
              window.__tvsuiteIndicators = mine.map((x) => x.name);
              return [...(Array.isArray(list) ? list : []), ...mine];
            });
          };
          window.__tvsuiteWidgetWrapped = (window.__tvsuiteWidgetWrapped || 0) + 1;
        }
      } catch (_) { /* fall through to the platform's own options */ }
      return new Orig(opts);
    };
    Wrapped.prototype = Orig.prototype;
    Wrapped.__tvsuite = true;
    try { TV.widget = Wrapped; } catch (_) { try { Object.defineProperty(TV, 'widget', { value: Wrapped, configurable: true, writable: true }); } catch (__) { /* frozen */ } }
  }
  // A classic script's load event fires right after it runs and before the next one, so the platform can't create
  // its chart in between. Checked on every script load (cheap) and once now in case the library is already there.
  document.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'SCRIPT') wrapWidget(); }, true);
  wrapWidget();

  // Shapes drawn by the Levels tab, so they can be cleared without touching the user's own drawings.
  const levelIds = (window.__tvsuiteLevelIds = window.__tvsuiteLevelIds || []);
  // Labs demo levels are kept apart, so drawing or clearing them never touches the pasted Ledgeline levels.
  const demoIds = (window.__tvsuiteDemoIds = window.__tvsuiteDemoIds || []);
  function clearLevels(chart, ids = levelIds) {
    let n = 0;
    for (const id of ids.splice(0)) {
      try { chart.removeEntity(id); n++; } catch (_) { /* already removed by the user */ }
    }
    return n;
  }
  // Temporary levels: kept out of the saved layout and the undo history, locked so a stray click doesn't move them.
  // Permanent levels: saved into the platform's layout like hand-drawn ones (so they stay without TVSuite); their
  // ids are reported back with a 'tvsuite:levelsPerm' event so TVSuite can remove them later.
  function drawLevels(chart, levels, opts) {
    const permanent = !!opts.permanent;
    const bucket = opts.bucket === 'demo' ? demoIds : levelIds;
    if (permanent || opts.replace !== false) clearLevels(chart, bucket);
    const now = Math.floor(Date.now() / 1000);
    const span = Math.max(1, Math.min(24 * 14, +opts.extendHours || 24)) * 3600;
    const base = permanent ? { lock: !!opts.lock, disableSave: false, disableUndo: true, zOrder: 'bottom' } : { lock: true, disableSave: true, disableUndo: true, zOrder: 'bottom' };
    const made = [];
    const keep = (r) => made.push(Promise.resolve(r).then((id) => { if (id != null && !permanent) bucket.push(id); return id; }).catch(() => null));
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
    const own = new Set([...levelIds, ...demoIds, ...drawingIds].map(String));
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

  // The chart's loaded bars (time in seconds, OHLC, and volume when a Volume indicator is on the chart). exportData is
  // async, so this one answers a moment later instead of inline.
  function chartBars(chart) {
    if (typeof chart.exportData !== 'function') return Promise.resolve({ ok: false, reason: 'This chart doesn\'t let pages read its bars.' });
    const studies = typeof chart.getAllStudies === 'function' ? chart.getAllStudies() : [];
    const vol = studies.find((s) => /^volume$/i.test(String(s.name || '')));
    return chart.exportData({ includeTime: true, includeSeries: true, includedStudies: vol ? [vol.id] : [] }).then((d) => {
      const col = (pred) => d.schema.findIndex(pred);
      const iT = col((s) => s.type === 'time');
      const iO = col((s) => s.sourceType === 'series' && s.plotTitle === 'open'), iH = col((s) => s.sourceType === 'series' && s.plotTitle === 'high');
      const iL = col((s) => s.sourceType === 'series' && s.plotTitle === 'low'), iC = col((s) => s.sourceType === 'series' && s.plotTitle === 'close');
      const iV = col((s) => s.sourceType === 'study' && /vol/i.test(String(s.plotTitle || '')));
      const bars = d.data.slice(-20000).map((r) => [r[iT], r[iO], r[iH], r[iL], r[iC], iV >= 0 ? r[iV] : null]);
      return { ok: true, symbol: typeof chart.symbol === 'function' ? chart.symbol() : null, resolution: typeof chart.resolution === 'function' ? chart.resolution() : null, volume: iV >= 0, bars };
    }).catch((err) => ({ ok: false, reason: `The chart wouldn't export its bars (${String(err && err.message || err).slice(0, 80)}).` }));
  }

  // Answer small, explicit queries from the isolated-world content script.
  document.addEventListener('tvsuite:query', (e) => {
    try {
      const q = String(e.detail || '');
      if (q.startsWith('{') && JSON.parse(q).cmd === 'chartBars') {
        const found = chartApi();
        const lc = found && found.api.activeChart();
        const answer = (r) => document.dispatchEvent(new CustomEvent('tvsuite:answer', { detail: JSON.stringify(r) }));
        if (!lc) answer({ ok: false, reason: 'This frame has no TradingView chart API.' });
        else chartBars(lc).then(answer);
        return;
      }
    } catch (_) { /* handled below like any other query */ }
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
            detail = JSON.stringify({ ok: true, via: found.via, symbol: typeof lc.symbol === 'function' ? lc.symbol() : null, rectangles: typeof lc.createMultipointShape === 'function', lines: typeof lc.createShape === 'function', drawn: levelIds.length, indicators: (() => { try { return window.top.__tvsuiteIndicators || window.__tvsuiteIndicators || null; } catch (_) { return window.__tvsuiteIndicators || null; } })() });
          } else if (cmd.cmd === 'levelsClear') detail = JSON.stringify({ ok: true, count: clearLevels(lc, cmd.bucket === 'demo' ? demoIds : levelIds) });
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
