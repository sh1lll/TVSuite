// Bridge tab: translate the chart's symbol for other platforms, open it elsewhere, follow symbols from
// other TVSuite tabs, and convert watchlists between platforms.
import { el, setChildren, pickFile, downloadText } from '../core/dom.js';
import { section, row, toggle, button, chip, toast, copyText, icon } from './kit.js';
import { translateAll, parseSymbol, formatSymbol, frontMonth } from '../modules/bridge/symbols.js';
import { openLinks } from '../modules/bridge/links.js';
import { convertWatchlist, parseWatchlist, WATCHLIST_FORMATS } from '../modules/bridge/watchlists.js';
import { IS_EXTENSION } from '../core/env.js';

const stop = (node) => { node.addEventListener('keydown', (e) => e.stopPropagation()); return node; };
const onTradingView = () => /(^|\.)tradingview\.com$/.test(location.hostname);

// Jump this chart (or a new TradingView tab) to a symbol.
export function openOnTradingView(tvSymbol) {
  if (onTradingView() && location.pathname.startsWith('/chart')) {
    const u = new URL(location.href);
    u.searchParams.set('symbol', tvSymbol);
    location.assign(u.toString());
  } else window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`, '_blank', 'noopener');
}

export function bridgeTab(app) {
  const { getSettings, update, root, bus, skins } = app;
  const cfg = () => getSettings().bridge;
  const wrap = el('div');
  const opts = () => ({ projectxRoots: cfg().projectxRoots || {} });
  let query = '', userTyped = false;

  // --- Symbol translator -----------------------------------------------------------------------
  const input = stop(el('input', { type: 'text', placeholder: 'Any symbol: ES 12-26 · /NQZ26 · BTC-USD · NASDAQ:AAPL', dataset: { bridgeInput: '1' } }));
  const table = el('div');
  input.addEventListener('input', () => { userTyped = true; query = input.value; paintTable(); });
  function paintTable() {
    const t = translateAll(query, opts());
    let c = t.canon;
    const front = c?.kind === 'future' && c.continuous ? frontMonth(c) : null;
    const rows = t.rows.map((r) => {
      let value = r.value, est = false;
      if (!value && front && !front.continuous) { value = formatSymbol(front, r.id, opts()); est = !!value; }
      const copy = el('button', { class: 'iconbtn', title: 'Copy', type: 'button', disabled: !value }, icon('copy'));
      copy.addEventListener('click', async () => { await copyText(value); toast(root, `Copied ${value}`); });
      return el('div', { class: 'row', style: { padding: '0 10px', opacity: value ? 1 : 0.45 }, dataset: { platform: r.id }, title: r.note || '' },
        el('span', { style: { flex: '0 0 150px', fontSize: '12px' } }, r.name),
        el('code', { class: 'grow', style: { fontSize: '12.5px', userSelect: 'all' } }, value || '—'),
        est ? chip('front month?', 'warn') : null, r.unverified && value ? chip('unverified', 'warn') : null, copy);
    });
    const links = openLinks(c).map((l) => button(l.label, () => (l.id === 'tradingview' ? openOnTradingView(formatSymbol(c, 'tradingview')) : window.open(l.url, '_blank', 'noopener')), 'sm', { dataset: { open: l.id } }));
    setChildren(table,
      el('div', { class: 'note', style: { margin: '6px 0' }, dataset: { bridgeLabel: '1' } }, c ? t.label : query ? 'Not recognized — try EXCHANGE:SYMBOL, a futures contract like ESZ26, or a pair like BTC-USD' : 'Type a symbol'),
      c ? el('div', { class: 'list' }, rows) : null,
      links.length ? el('div', { class: 'btns', style: { marginTop: '8px', flexWrap: 'wrap' } }, el('span', { class: 'note', style: { margin: '0 4px 0 0', alignSelf: 'center' } }, 'Open in'), links) : null);
  }
  function syncFromChart() {
    if (userTyped && input.value) return;
    const s = skins.symbol();
    if (s && s !== query) { query = s; input.value = s; paintTable(); }
  }

  // --- Linked tabs -------------------------------------------------------------------------------
  const linked = el('div');
  function paintLinked(list = app.link?.others() || []) {
    setChildren(linked, list.length ? el('div', { class: 'list' }, list.map((x) => {
      const c = parseSymbol(x.symbol, opts());
      const tv = c && formatSymbol(c, 'tradingview');
      const ago = Math.max(0, Math.round((Date.now() - x.at) / 60000));
      return el('div', { class: 'row', style: { padding: '0 10px' }, dataset: { linked: x.host } },
        el('div', { class: 'grow', style: { minWidth: 0, padding: '6px 0' } },
          el('div', { style: { fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, x.symbol),
          el('div', { class: 'note', style: { margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `${x.host} · ${ago ? `${ago} min ago` : 'now'}`)),
        tv ? button(onTradingView() ? 'Open here' : 'Open in TradingView', () => (onTradingView() ? app.setChart({ symbol: tv }) : openOnTradingView(tv)), 'sm primary') : chip('unknown symbol'),
        button('Translate', () => { userTyped = true; query = x.symbol; input.value = x.symbol; paintTable(); }, 'sm'));
    })) : el('div', { class: 'note' }, IS_EXTENSION
      ? 'Open TradingView, TopstepX/ProjectX or another site with TVSuite turned on, and the symbol each one shows appears here.'
      : 'Linked tabs need the browser extension (the desktop/userscript build has no shared storage).'));
  }

  // --- Watchlist converter ---------------------------------------------------------------------
  const src = stop(el('textarea', { rows: 4, placeholder: 'Paste a watchlist — TradingView export (###sections), CSV from Finviz/Yahoo/your broker, or one symbol per line', dataset: { wlIn: '1' } }));
  const out = stop(el('textarea', { rows: 4, readonly: true, dataset: { wlOut: '1' } }));
  const report = el('div', { class: 'note' });
  const fmtSel = el('select', { class: 'grow' }, WATCHLIST_FORMATS.map((f) => el('option', { value: f.id }, f.name)));
  let result = null;
  function convert() {
    fmtSel.value = cfg().watchlistTo || 'ninjatrader';
    if (!src.value.trim()) { out.value = ''; setChildren(report); result = null; return; }
    const wl = parseWatchlist(src.value);
    result = convertWatchlist(wl, fmtSel.value, opts());
    out.value = result.text;
    setChildren(report,
      `${result.count} symbol${result.count === 1 ? '' : 's'} from ${wl.sections.length} section${wl.sections.length === 1 ? '' : 's'} (${wl.source})`,
      result.skipped.length ? ` · ${result.skipped.length} skipped: ${result.skipped.slice(0, 6).map((s) => `${s.symbol} (${s.reason})`).join(', ')}${result.skipped.length > 6 ? '…' : ''}` : '',
      result.droppedSections ? ' · this format has no sections, so they were flattened' : '');
  }
  src.addEventListener('input', convert);
  fmtSel.addEventListener('change', () => { update((st) => { st.bridge.watchlistTo = fmtSel.value; }, { silent: true }); convert(); });

  // --- ProjectX overrides ------------------------------------------------------------------------
  const pxIn = stop(el('input', { type: 'text', placeholder: 'e.g. CL=CLE, GC=GCE' }));
  const pxText = () => Object.entries(cfg().projectxRoots || {}).map(([k, v]) => `${k}=${v}`).join(', ');
  pxIn.addEventListener('change', () => {
    const map = {};
    for (const part of pxIn.value.split(/[,\s]+/)) { const m = part.toUpperCase().match(/^([A-Z0-9]{1,5})=([A-Z0-9]{1,8})$/); if (m) map[m[1]] = m[2]; }
    update((st) => { st.bridge.projectxRoots = map; }, { silent: true });
    pxIn.value = pxText();
    paintTable(); convert();
  });

  function render() {
    pxIn.value = pxText();
    setChildren(wrap,
      el('div', { class: 'hero', style: { padding: '14px', background: 'linear-gradient(135deg, rgba(54,197,240,.16), rgba(91,140,255,.12))' } },
        el('div', { class: 'row', style: { margin: 0 } }, icon('bridge'),
          el('div', { class: 'grow' }, el('div', { style: { fontWeight: 700, fontSize: '14px' } }, 'Platform Bridge'),
            el('div', { class: 'note', style: { margin: 0 } }, 'TradingView ⇄ NinjaTrader, Tradovate, TopstepX, thinkorswim, Sierra, IBKR, MT, Yahoo, crypto exchanges')))),
      section('Symbol', input, table),
      section('Linked tabs',
        toggle({ label: 'Share this tab’s symbol', hint: 'Other tabs running TVSuite can jump to it. Stays in this browser.', checked: cfg().share, onChange: (v) => update((st) => { st.bridge.share = v; }, { silent: true }) }),
        linked),
      section('Watchlist converter',
        src,
        el('div', { class: 'btns' }, button('Open file…', async () => { const f = await pickFile('.txt,.csv,.tsv,text/plain,text/csv'); if (f) { src.value = f.text; convert(); } }, 'sm', { icon: 'upload' })),
        row('Convert to', fmtSel), out, report,
        el('div', { class: 'btns' },
          button('Copy', async () => { if (result?.text) { await copyText(result.text); toast(root, 'Watchlist copied'); } }, 'sm primary', { icon: 'copy' }),
          button('Download', () => { if (result?.text) downloadText(`watchlist-${fmtSel.value}.${result.format.ext}`, result.text, result.format.ext === 'csv' ? 'text/csv' : 'text/plain'); }, 'sm', { icon: 'download' }))),
      section('Platform details',
        row('ProjectX roots', pxIn),
        el('div', { class: 'note' }, 'ProjectX/TopstepX contract ids are confirmed for NQ (ENQ) and MNQ. ES (EP) and MES follow the same scheme but are unconfirmed, and other roots default to the CME root — check the id your platform shows and add it here.'),
        el('div', { class: 'note' }, IS_EXTENSION ? 'Anywhere on the web: select a ticker, right-click → “Open in TradingView”.' : '')));
    convert(); paintTable(); paintLinked();
  }
  const unsubs = [bus.on('bridge:seen', paintLinked)];
  const timer = setInterval(() => { if (wrap.isConnected) syncFromChart(); }, 1000);
  render();
  syncFromChart();
  return { el: wrap, render, dispose: () => { unsubs.forEach((u) => u()); clearInterval(timer); } };
}
