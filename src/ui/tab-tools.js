// Tools tab: position-size calculator and focus mode.
import { el, setChildren } from '../core/dom.js';
import { section, row, select, toggle, button, copyText, toast } from './kit.js';
import { positionSize } from '../modules/tools/risk.js';

export function toolsTab(app) {
  const { getSettings, update, root } = app;
  const wrap = el('div');
  let out;

  function num(label, key, step = 'any') {
    const r = getSettings().tools.risk;
    const inp = el('input', { type: 'number', step, value: r[key] });
    inp.addEventListener('input', () => { update((st) => { st.tools.risk[key] = +inp.value; }); paint(); });
    return row(label, inp);
  }

  function fmt(n, d = 2) { return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '—'; }

  function paint() {
    if (!out) return;
    const r = positionSize(getSettings().tools.risk);
    if (!r.ok) { setChildren(out, el('div', { class: 'note' }, r.reason)); return; }
    setChildren(out, 
      el('div', { class: 'row' }, el('span', { class: 'big' }, `${fmt(r.size, 6)} ${r.unitLabel}`), el('span', { class: 'chip ' + (r.side === 'long' ? 'ok' : 'err') }, r.side),
        button('Copy', async () => { await copyText(String(r.size)); toast(root, 'Size copied'); }, 'sm')),
      el('div', { class: 'kv' },
        'Risk budget', fmt(r.riskAmount), 'Actual risk', fmt(r.actualRisk), 'Stop distance', `${fmt(r.distance, 6)}${r.pips != null ? ` (${fmt(r.pips, 1)} pips)` : ''}`,
        'Notional', fmt(r.notional), 'Leverage', `${fmt(r.leverage, 2)}×`,
        ...r.targets.flatMap((t) => [`${t.r}R target`, fmt(t.price, 6)])));
  }

  function render() {
    const r = getSettings().tools.risk;
    out = el('div');
    setChildren(wrap, 
      section('Position size',
        select({ label: 'Market', value: r.market, options: [['stock', 'Stocks / ETFs'], ['futures', 'Futures'], ['forex', 'Forex'], ['crypto', 'Crypto']], onChange: (v) => { update((st) => { st.tools.risk.market = v; }); render(); } }),
        num('Account', 'account'), num('Risk %', 'riskPct'), num('Entry', 'entry'), num('Stop', 'stop'),
        r.market === 'futures' ? [num('$ per point', 'pointValue'), el('div', { class: 'note' }, 'ES 50 · MES 5 · NQ 20 · MNQ 2 · CL 1000 · GC 100')] : null,
        r.market === 'forex' ? [num('Units per lot', 'lotSize'), num('Pip size', 'pipSize')] : null,
        out),
      section('Journal',
        el('div', { class: 'note' }, `Capture the chart with context and notes (${getSettings().tools.journalHotkey}). Stored locally; stats by session, tag and symbol.`),
        el('div', { class: 'btns' }, button('📸 Capture to journal', () => app.bus.emit('journal:capture'), 'primary'), app.journal ? button('Open journal', () => app.journal.open()) : null)),
      section('Focus',
        toggle({ label: `Focus mode — hide TradingView toolbars (${getSettings().tools.focusHotkey})`, checked: app.focus.active(), onChange: (v) => app.focus.set(v) })),
    );
    paint();
  }

  render();
  return { el: wrap, render };
}
