// Risk Guard runtime: keeps the shared P&L log, reads P&L from the screen when asked, evaluates the rules
// every second, announces warnings once, and raises the block overlay. State lives in extension storage so
// every TVSuite tab (TradingView, TopstepX, broker sites) sees the same day.
import { storage } from '../../core/storage.js';
import { evaluate, parseMoney, tradingDay } from './rules.js';

const KEY = 'risk:state';
const empty = () => ({ trades: [], screen: {}, peaks: {}, overrides: {}, fired: {}, log: [] });

export function readSelector(sel) {
  if (!sel) return null;
  try {
    const n = document.querySelector(sel);
    return n ? parseMoney(n.textContent) : null;
  } catch (_) { return null; }
}

export function createRiskGuard({ getSettings, bus, symbol }) {
  let state = empty(), loaded = false, last = null, saveTimer = null, live = { unrealized: null, realized: null };
  const cfg = () => getSettings().risk;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => storage.set(KEY, state), 250); };
  const ready = storage.get(KEY, null).then((v) => { state = { ...empty(), ...(v || {}) }; loaded = true; tick(); });
  storage.watch(KEY, (v) => { if (v) { state = { ...empty(), ...v }; tick(); } });

  function prune(day) {
    // Keep 400 days of trades/screen values; fired/override flags only for the last few days.
    const cutoff = Date.now() - 400 * 86400e3;
    state.trades = state.trades.filter((t) => t.at > cutoff).slice(-5000);
    for (const k of ['fired', 'overrides', 'peaks']) for (const d of Object.keys(state[k])) if (d < day && Object.keys(state[k]).length > 7) delete state[k][d];
  }

  function tick() {
    if (!loaded) return null;
    const c = cfg();
    if (!c.enabled) { if (last?.block) bus.emit('risk:eval', null); last = null; return null; }
    const now = new Date();
    const day = tradingDay(now, c.tz, c.reset);
    if (c.source === 'screen') {
      live.realized = readSelector(c.screen.realized);
      live.unrealized = readSelector(c.screen.unrealized);
      if (live.realized != null && state.screen[day] !== live.realized) { state.screen[day] = live.realized; save(); }
    } else live = { unrealized: null, realized: null };
    const r = evaluate(c, state, now, { unrealized: live.unrealized ?? 0 });
    r.live = { ...live };
    if (c.drawdown?.type === 'intraday' && !(state.peaks[day] >= r.equity)) { state.peaks[day] = r.equity; save(); }
    // Announce each alert once per trading day (shared across tabs through storage).
    const fired = (state.fired[day] ||= []);
    for (const a of r.alerts) {
      const key = `${a.id}:${a.level}`;
      if (fired.includes(key)) continue;
      fired.push(key);
      save();
      const ev = a.level !== 'breach' ? 'riskWarn' : a.id === 'pdpt' ? 'riskTarget' : 'riskBreach';
      bus.emit('sound:manual', { type: ev, vars: { text: a.text } });
      bus.emit('risk:alert', { ...a, event: ev });
    }
    last = r;
    bus.emit('risk:eval', r);
    return r;
  }

  const timer = setInterval(tick, 1000);
  return {
    ready,
    tick,
    last: () => last,
    state: () => state,
    async addTrade({ pnl, contracts = null, symbol: sym = null, note = '', journalId = null, at = Date.now() }) {
      await ready;
      if (!Number.isFinite(+pnl)) throw new Error('Enter a P&L amount');
      const c = cfg();
      state.trades.push({ id: `t${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`, at, day: tradingDay(new Date(at), c.tz, c.reset), pnl: Math.round(+pnl * 100) / 100,
        contracts: Number.isFinite(+contracts) && contracts !== '' && contracts != null ? +contracts : null, symbol: sym || symbol?.() || '', note: String(note).slice(0, 200), journalId });
      prune(tradingDay(new Date(), c.tz, c.reset));
      await storage.set(KEY, state);
      return tick();
    },
    async removeTrade(id) { await ready; state.trades = state.trades.filter((t) => t.id !== id); await storage.set(KEY, state); return tick(); },
    async override(ids, reason = '') {
      await ready;
      const c = cfg(), day = tradingDay(new Date(), c.tz, c.reset);
      const o = (state.overrides[day] ||= { ids: [] });
      o.ids = [...new Set([...o.ids, ...ids])];
      state.log.push({ at: Date.now(), day, type: 'override', ids, reason: String(reason).slice(0, 200) });
      state.log = state.log.slice(-200);
      await storage.set(KEY, state);
      return tick();
    },
    async resetDay() {
      await ready;
      const c = cfg(), day = tradingDay(new Date(), c.tz, c.reset);
      state.trades = state.trades.filter((t) => t.day !== day);
      delete state.screen[day]; delete state.fired[day]; delete state.peaks[day];
      await storage.set(KEY, state);
      return tick();
    },
    stop: () => clearInterval(timer),
  };
}
