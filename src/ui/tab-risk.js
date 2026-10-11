// Risk tab: Risk Guard (prop-firm rules, daily P&L, block), chart time, and today's journal.
import { el, setChildren } from '../core/dom.js';
import { section, row, toggle, segmented, button, chip, toast, icon, slider } from './kit.js';
import { money, formatDuration, tradingDay } from '../modules/risk/rules.js';
import { pickElement } from './picker.js';

const PRESETS = [
  ['custom', 'Custom', {}],
  ['eod', 'EOD trailing (Topstep-style)', { drawdown: { type: 'eod' }, consistencyPct: 0 }],
  ['intraday', 'Intraday trailing (Apex-style)', { drawdown: { type: 'intraday' } }],
  ['static', 'Static max loss', { drawdown: { type: 'static' } }],
];
const COLORS = { ok: '#22c55e', warn: '#f7a600', breach: '#f23645' };
const stop = (n) => { n.addEventListener('keydown', (e) => e.stopPropagation()); return n; };

function meter(pct, color) {
  return el('div', { class: 'meter', style: { height: '8px' } }, el('i', { style: { width: `${Math.max(0, Math.min(100, pct))}%`, background: color } }));
}

export function riskTab(app) {
  const { getSettings, update, root, bus, risk, chartTime } = app;
  const cfg = () => getSettings().risk;
  const wrap = el('div');
  let view = getSettings().ui.riskView || 'today';
  const body = el('div', { class: 'wide-labels' });

  const nav = segmented({ value: view, cls: 'subnav', options: [['today', 'Today', 'shield'], ['rules', 'Rules', 'sliders'], ['time', 'Time', 'sessions'], ['journal', 'Journal', 'book']], onChange: (v) => { view = v; update((s) => { s.ui.riskView = v; }, { silent: true }); render(); } });

  // ---- numeric field bound to a settings path ----
  function money$(label, get, set, { placeholder = '0', hint } = {}) {
    const input = stop(el('input', { type: 'number', step: 'any', min: 0, placeholder, value: get() || '' }));
    input.addEventListener('change', () => { update((s) => set(s.risk, input.value === '' ? 0 : Math.abs(+input.value))); refresh(); });
    return [row(label, el('div', { class: 'grow', style: { position: 'relative' } }, input)), hint ? el('div', { class: 'note', style: { marginTop: '-4px' } }, hint) : null];
  }

  // ---------------- Today ----------------
  function today() {
    const c = cfg();
    if (!c.enabled) {
      return el('div', { class: 'hero', style: { padding: '16px', background: 'linear-gradient(135deg, rgba(34,197,94,.14), rgba(91,140,255,.12))' } },
        el('div', { style: { fontWeight: 700, fontSize: '15px' } }, 'Risk Guard'),
        el('div', { class: 'note' }, 'Your prop-firm or personal rules — daily loss limit, daily profit target, trailing drawdown, consistency — checked every second. Warns before you break one and can block the chart for the rest of the day.'),
        el('div', { class: 'btns' }, button('Set up my rules', () => { view = 'rules'; render(); }, 'primary', { icon: 'shield', dataset: { riskSetup: '1' } })));
    }
    const r = risk.tick() || risk.last();
    if (!r) return el('div', { class: 'note' }, 'Loading…');
    const color = COLORS[r.status];
    const parts = [];
    parts.push(el('div', { class: 'hero', style: { padding: '14px', background: `linear-gradient(135deg, ${color}26, rgba(91,140,255,.08))`, borderColor: `${color}66` }, dataset: { riskStatus: r.status } },
      el('div', { class: 'row', style: { margin: 0, alignItems: 'flex-end' } },
        el('div', { class: 'grow' },
          el('div', { class: 'note', style: { margin: 0, textTransform: 'uppercase', letterSpacing: '.8px', fontSize: '10px', fontWeight: 700 } }, `${c.accountName || 'Account'} · trading day ${r.day}`),
          el('div', { style: { fontSize: '28px', fontWeight: 800, color: r.dayTotal < 0 ? '#f23645' : r.dayTotal > 0 ? '#22c55e' : 'inherit', fontVariantNumeric: 'tabular-nums' }, dataset: { dayPnl: String(r.dayTotal) } }, money(r.dayTotal)),
          el('div', { class: 'note', style: { margin: 0 } }, `Realized ${money(r.dayPnl)}${r.unrealized ? ` · open ${money(r.unrealized)}` : ''} · balance ${money(r.balance, false)}`)),
        chip(r.status === 'ok' ? 'within rules' : r.status === 'warn' ? 'careful' : 'limit hit', r.status === 'ok' ? 'ok' : r.status === 'warn' ? 'warn' : 'err'))));
    const bars = [];
    if (r.lossLimit) bars.push([`${r.lossLimit.name}`, `${money(-r.lossUsed)} of −${money(r.lossLimit.amount, false)}`, r.lossPct, r.lossPct >= 100 ? COLORS.breach : r.lossPct >= c.warnAt * 100 ? COLORS.warn : COLORS.ok]);
    if (c.pdpt > 0) bars.push(['Daily profit target', `${money(r.dayTotal)} of ${money(c.pdpt, false)}`, Math.max(0, (r.dayTotal / c.pdpt) * 100), '#5b8cff']);
    if (r.floor != null) { const used = Math.max(0, Math.min(100, 100 - (r.roomToFloor / c.drawdown.amount) * 100)); bars.push([`Max loss (${c.drawdown.type})`, `${money(r.roomToFloor, false)} above ${money(r.floor, false)}`, used, used >= 100 ? COLORS.breach : used >= c.warnAt * 100 ? COLORS.warn : COLORS.ok]); }
    if (r.target) bars.push(['Profit target', `${money(r.target.progress)} of ${money(r.target.amount, false)}`, r.target.pct, '#9a6bff']);
    if (r.consistency) bars.push([`Consistency (≤ ${c.consistencyPct}%)`, `best day ${r.consistency.pct}%`, (r.consistency.pct / c.consistencyPct) * 100, r.consistency.ok ? COLORS.ok : COLORS.warn]);
    if (bars.length) parts.push(section('Limits', bars.map(([name, txt, pct, col]) => el('div', { style: { margin: '8px 0' } }, el('div', { class: 'row', style: { margin: '0 0 4px' } }, el('span', { class: 'grow', style: { fontSize: '12px', fontWeight: 600 } }, name), el('span', { class: 'note', style: { margin: 0 } }, txt)), meter(pct, col)))));
    if (r.alerts.length) parts.push(section('Alerts', r.alerts.map((a) => el('div', { class: 'row', style: { margin: '6px 0' }, dataset: { alert: a.id } }, chip(a.level === 'breach' ? (a.action === 'block' ? 'blocked' : 'hit') : 'warning', a.level === 'breach' ? 'err' : 'warn'), el('span', { class: 'grow', style: { fontSize: '12px' } }, a.text)))));
    // Quick entry
    if (c.source === 'manual') {
      const amt = stop(el('input', { type: 'number', step: 'any', placeholder: 'P&L $ (e.g. −250 or 400)', dataset: { pnlInput: '1' } }));
      const qty = stop(el('input', { type: 'number', step: 1, min: 0, placeholder: 'Contracts', style: { maxWidth: '96px' } }));
      const add = async () => {
        if (amt.value === '') { toast(root, 'Enter the trade P&L', 'warn'); return; }
        try { await risk.addTrade({ pnl: +amt.value, contracts: qty.value === '' ? null : +qty.value }); amt.value = ''; render(); } catch (err) { toast(root, err.message, 'err'); }
      };
      amt.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const trades = risk.state().trades.filter((t) => t.day === r.day).slice().reverse();
      parts.push(section(`Today's trades · ${trades.length}`,
        el('div', { class: 'row' }, el('div', { class: 'grow' }, amt), qty, button('Add', add, 'primary', { icon: 'plus' })),
        el('div', { class: 'note' }, 'Or fill the P&L field when you journal a trade (Alt+Shift+J). Read it from the screen instead under Rules → P&L source.'),
        trades.length ? el('div', { class: 'list' }, trades.slice(0, 30).map((t) => {
          const del = el('button', { class: 'iconbtn', title: 'Remove', type: 'button' }, icon('trash'));
          del.addEventListener('click', async () => { await risk.removeTrade(t.id); render(); });
          return el('div', { class: 'row', style: { padding: '0 10px' }, dataset: { trade: t.id } },
            el('span', { style: { fontWeight: 700, color: t.pnl < 0 ? '#f23645' : '#22c55e', minWidth: '78px' } }, money(t.pnl)),
            el('span', { class: 'note grow', style: { margin: 0 } }, [t.symbol, t.contracts ? `${t.contracts} ct` : null, new Date(t.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')), del);
        })) : null));
    } else {
      parts.push(section('P&L from screen', el('div', { class: 'note' }, `Day P&L: ${r.live.realized == null ? 'not found — re-pick under Rules' : money(r.live.realized)} · Open P&L: ${r.live.unrealized == null ? (c.screen.unrealized ? 'not found' : 'not set') : money(r.live.unrealized)}`)));
    }
    if (!r.block) parts.push(el('div', { class: 'btns' }, button('Reset today', async () => { if (confirm('Clear today’s trades, screen readings and fired alerts?')) { await risk.resetDay(); render(); } }, 'sm')));
    return parts;
  }

  // ---------------- Rules (shaped like a broker's Risk Settings / Account Settings) ----------------
  function rules() {
    const c = cfg();
    const blocked = c.enabled && risk.last()?.block;
    if (blocked) return el('div', { class: 'hero', style: { padding: '16px' }, dataset: { rulesLocked: '1' } }, el('div', { style: { fontWeight: 700 } }, '🔒 Rules are locked while you’re blocked'),
      el('div', { class: 'note' }, 'Loosening a rule after hitting it defeats the point. They unlock at the trading-day reset, or after an override on the lock screen.'));
    const name = stop(el('input', { type: 'text', placeholder: 'e.g. Lucid 50K Flex — TEST008', value: c.accountName }));
    name.addEventListener('change', () => update((s) => { s.risk.accountName = name.value.slice(0, 60); }));
    const tz = stop(el('input', { type: 'text', value: c.tz, style: { maxWidth: '160px' } }));
    tz.addEventListener('change', () => { try { new Intl.DateTimeFormat('en', { timeZone: tz.value }); update((s) => { s.risk.tz = tz.value; }); } catch (_) { toast(root, 'Unknown time zone', 'err'); tz.value = cfg().tz; } });
    const reset = stop(el('input', { type: 'time', value: c.reset, style: { maxWidth: '110px' } }));
    reset.addEventListener('change', () => update((s) => { s.risk.reset = reset.value || '17:00'; }));
    const preset = el('select', { class: 'grow' }, PRESETS.map(([id, label]) => el('option', { value: id }, label)));
    preset.addEventListener('change', () => { const p = PRESETS.find((x) => x[0] === preset.value)[2]; update((s) => { if (p.drawdown) s.risk.drawdown.type = p.drawdown.type; }); render(); toast(root, 'Rule shape set — fill in your plan’s numbers'); });
    const srcSeg = segmented({ value: c.source, options: [['manual', 'My entries + journal'], ['screen', 'Read from screen']], onChange: (v) => { update((s) => { s.risk.source = v; }); render(); } });
    const pick = (key, label) => button(c.screen[key] ? `Re-pick ${label}` : `Pick ${label} on screen`, async () => {
      app.panel?.hide?.();
      const res = await pickElement({ hint: `Click your ${label}` });
      app.panel?.show?.('risk');
      if (!res?.selector) { if (res) toast(root, 'Could not make a stable selector for that element — try its number directly', 'err', 4000); return; }
      update((s) => { s.risk.screen[key] = res.selector; });
      toast(root, `${label}: “${res.text}”`);
      render();
    }, 'sm', { icon: 'target', dataset: { pick: key } });
    return [
      el('div', { class: 'hero', style: { padding: '14px' } },
        toggle({ label: 'Risk Guard', hint: 'Check these rules every second on every TVSuite tab', checked: c.enabled, onChange: (v) => { update((s) => { s.risk.enabled = v; }); render(); } })),
      section('Account',
        row('Name', el('div', { class: 'grow' }, name)),
        money$('Starting balance $', () => c.startBalance, (r, v) => { r.startBalance = v; }, { placeholder: '50000' }),
        row('Rule shape', preset),
        row('Day resets', reset, tz)),
      section('Risk settings (per position)',
        el('div', { class: 'note' }, 'Like your broker’s account-level brackets: TVSuite warns when the open P&L on screen passes them.'),
        money$('Risk — in $', () => c.bracket.risk, (r, v) => { r.bracket.risk = v; }),
        money$('Profit — in $', () => c.bracket.profit, (r, v) => { r.bracket.profit = v; })),
      section('Account settings (daily)',
        money$('Personal Daily Loss Limit (PDLL) $', () => c.pdll, (r, v) => { r.pdll = v; }),
        money$('Personal Daily Profit Target (PDPT) $', () => c.pdpt, (r, v) => { r.pdpt = v; }),
        row('Personal daily action', segmented({ value: c.onLoss, options: [['block', 'Block'], ['warn', 'Warn only']], onChange: (v) => update((s) => { s.risk.onLoss = v; }) })),
        row('When target is hit', segmented({ value: c.onTarget, options: [['block', 'Block'], ['warn', 'Warn only']], onChange: (v) => update((s) => { s.risk.onTarget = v; }) })),
        el('div', { class: 'note' }, '“Liquidate” isn’t offered: TVSuite can’t see or close positions. Set “Liquidate and Block” in your broker for real enforcement — TVSuite adds the warnings, the lock screen and the record.'),
        money$('Firm daily loss limit $', () => c.firmDailyLoss, (r, v) => { r.firmDailyLoss = v; }, { hint: 'The tighter of this and your PDLL applies.' })),
      section('Max loss / evaluation',
        el('div', { class: 'note', style: { margin: '8px 0 4px' } }, 'Max loss drawdown'),
        (segmented({ value: c.drawdown.type, options: [['none', 'Off'], ['static', 'Static'], ['eod', 'EOD trail'], ['intraday', 'Intraday']], onChange: (v) => { update((s) => { s.risk.drawdown.type = v; }); render(); } })),
        c.drawdown.type !== 'none' ? [money$('Max loss amount $', () => c.drawdown.amount, (r, v) => { r.drawdown.amount = v; }),
          c.drawdown.type !== 'static' ? money$('Stops trailing at balance $', () => c.drawdown.lockAt, (r, v) => { r.drawdown.lockAt = v; }, { hint: 'Often your starting balance. 0 = keeps trailing.' }) : null] : null,
        money$('Profit target $', () => c.profitTarget, (r, v) => { r.profitTarget = v; }),
        money$('Consistency: best day ≤ % of profit', () => c.consistencyPct, (r, v) => { r.consistencyPct = Math.min(100, v); }),
        money$('Max contracts per trade', () => c.maxContracts, (r, v) => { r.maxContracts = Math.round(v); }),
        slider({ label: 'Warn at', value: c.warnAt, min: 0.5, max: 0.95, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((s) => { s.risk.warnAt = v; }) })),
      section('P&L source', srcSeg,
        c.source === 'screen' ? [el('div', { class: 'note' }, 'Point TVSuite at the numbers your platform shows (TradingView’s Account Manager, TopstepX, Tradovate…). It reads them once a second, locally.'),
          el('div', { class: 'btns' }, pick('realized', 'day P&L'), pick('unrealized', 'open P&L')),
          c.screen.realized ? el('div', { class: 'note' }, el('code', {}, c.screen.realized)) : null]
          : el('div', { class: 'note' }, 'Add trades on the Today view, or enter a P&L when you journal a trade.')),
      el('div', { class: 'note' }, 'Use the numbers from your firm’s current rules page — TVSuite doesn’t ship firm numbers, because they change.'),
    ];
  }

  // ---------------- Time ----------------
  function time() {
    const s = getSettings(), c = s.chartTime;
    const days = chartTime.days();
    const dayKey = tradingDay(new Date(), s.risk.tz, s.risk.reset);
    const d = days[dayKey] || { total: 0, sessions: {}, symbols: {} };
    const names = Object.fromEntries(s.sessions.list.map((x) => [x.id, x]));
    const last7 = Object.keys(days).sort().slice(-7);
    const max = Math.max(1, ...last7.map((k) => days[k].total));
    const sessionsList = [...s.sessions.list.map((x) => [x.id, x.name]), ['none', 'Outside sessions']];
    return [
      el('div', { class: 'hero', style: { padding: '14px', background: 'linear-gradient(135deg, rgba(91,140,255,.16), rgba(154,107,255,.1))' } },
        el('div', { class: 'note', style: { margin: 0, textTransform: 'uppercase', letterSpacing: '.8px', fontSize: '10px', fontWeight: 700 } }, 'Chart time today'),
        el('div', { style: { fontSize: '28px', fontWeight: 800 }, dataset: { chartTime: String(d.total) } }, formatDuration(d.total)),
        c.dailyLimitMin ? meter((d.total / (c.dailyLimitMin * 60)) * 100, d.total >= c.dailyLimitMin * 60 ? COLORS.warn : '#5b8cff') : null),
      section('By session', Object.entries(d.sessions).sort((a, b) => b[1] - a[1]).map(([id, sec]) => el('div', { style: { margin: '6px 0' } },
        el('div', { class: 'row', style: { margin: '0 0 3px' } }, el('span', { class: 'grow', style: { fontSize: '12px' } }, names[id]?.name || 'Outside sessions'), el('span', { class: 'note', style: { margin: 0 } }, formatDuration(sec))),
        meter((sec / Math.max(1, d.total)) * 100, names[id]?.color || '#5b8cff'))), d.total ? null : el('div', { class: 'note' }, 'Nothing yet today.')),
      section('Last 7 days', el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' } }, last7.map((k) => el('div', { title: `${k}: ${formatDuration(days[k].total)}`, style: { flex: 1, maxWidth: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', height: '100%', justifyContent: 'flex-end' } },
        el('div', { style: { width: '100%', height: `${Math.max(3, (days[k].total / max) * 62)}px`, background: 'var(--grad)', borderRadius: '4px' } }), el('span', { class: 'note', style: { margin: 0, fontSize: '10px' } }, k.slice(5)))))),
      Object.keys(d.symbols).length ? section('Top symbols today', Object.entries(d.symbols).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([sym, sec]) => el('div', { class: 'row', style: { margin: '4px 0' } }, el('span', { class: 'grow' }, sym), el('span', { class: 'note', style: { margin: 0 } }, formatDuration(sec))))) : null,
      section('Settings',
        toggle({ label: 'Track chart time', hint: 'Local only. Counts while this chart is on screen and you’re active.', checked: c.enabled, onChange: (v) => update((x) => { x.chartTime.enabled = v; }) }),
        row('Count when', segmented({ value: c.countWhen, options: [['focused', 'Tab focused'], ['visible', 'Tab visible']], onChange: (v) => update((x) => { x.chartTime.countWhen = v; }) })),
        slider({ label: 'Idle after', value: c.idleMin, min: 1, max: 30, step: 1, fmt: (v) => `${v} min`, onInput: (v) => update((x) => { x.chartTime.idleMin = v; }) }),
        slider({ label: 'Daily limit', value: c.dailyLimitMin, min: 0, max: 600, step: 15, fmt: (v) => (v ? formatDuration(v * 60) : 'off'), onInput: (v) => update((x) => { x.chartTime.dailyLimitMin = v; }) }),
        slider({ label: 'Break every', value: c.breakEveryMin, min: 0, max: 180, step: 5, fmt: (v) => (v ? `${v} min` : 'off'), onInput: (v) => update((x) => { x.chartTime.breakEveryMin = v; }) }),
        el('div', { class: 'note', style: { marginTop: '10px' } }, 'Count only during:'),
        el('div', { class: 'btns', style: { flexWrap: 'wrap' } }, sessionsList.map(([id, nm]) => {
          const on = !c.sessions.length || c.sessions.includes(id);
          return button(nm, () => { update((x) => { const all = sessionsList.map((q) => q[0]); let cur = x.chartTime.sessions.length ? [...x.chartTime.sessions] : all; cur = cur.includes(id) ? cur.filter((q) => q !== id) : [...cur, id]; x.chartTime.sessions = cur.length === all.length ? [] : cur; }); render(); }, `sm${on ? ' primary' : ''}`);
        }))),
    ];
  }

  // ---------------- Journal ----------------
  let journalCache = null;
  function journal() {
    if (!app.journal) return el('div', { class: 'note' }, 'The journal is available in the browser extension.');
    if (!journalCache) app.journal.list?.({ since: Date.now() - 7 * 86400e3 }).then((list) => { journalCache = list || []; if (view === 'journal') render(); }).catch(() => { journalCache = []; });
    const list = journalCache || [];
    return [
      el('div', { class: 'btns' }, button('Capture trade (Alt+Shift+J)', () => bus.emit('journal:capture'), 'primary', { icon: 'book' }), button('Open journal', () => app.journal.open())),
      section(`Last 7 days · ${list.length}`, list.length ? el('div', { class: 'list' }, list.slice(0, 40).map((e) => el('div', { class: 'row', style: { padding: '6px 10px', alignItems: 'flex-start' } },
        e.thumb ? el('img', { src: e.thumb, style: { width: '64px', height: '40px', objectFit: 'cover', borderRadius: '4px' } }) : null,
        el('div', { class: 'grow', style: { minWidth: 0 } },
          el('div', { style: { fontWeight: 600, fontSize: '12px' } }, `${e.symbol || '—'} · ${e.side}${e.pnl != null ? ` · ${money(e.pnl)}` : ''}${e.resultR != null ? ` · ${e.resultR}R` : ''}`),
          el('div', { class: 'note', style: { margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, `${new Date(e.createdAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${e.tags.map((t) => `#${t}`).join(' ')} ${e.note}`))))) : el('div', { class: 'note' }, journalCache ? 'No journal entries this week.' : 'Loading…')),
    ];
  }

  function refresh() { if (view === 'today') render(); }
  function render() {
    if (view !== 'journal') journalCache = null;
    setChildren(body, view === 'today' ? today() : view === 'rules' ? rules() : view === 'time' ? time() : journal());
    setChildren(wrap, nav, body);
  }
  let lastStatus = '';
  const unsubs = [
    bus.on('risk:eval', (r) => { const k = r ? `${r.status}|${r.dayTotal}|${r.alerts.length}` : ''; if (k !== lastStatus && view === 'today' && wrap.isConnected) { lastStatus = k; render(); } }),
    bus.on('charttime:tick', () => { if (view === 'time' && wrap.isConnected) render(); }),
  ];
  render();
  return { el: wrap, render, dispose: () => unsubs.forEach((u) => u()) };
}
