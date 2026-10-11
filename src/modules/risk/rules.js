// Risk Guard: prop-firm style account rules evaluated from P&L that TVSuite is told about (your entries,
// the journal) or reads from the screen. Pure functions; the module in index.js persists and enforces.
// TVSuite never sees or closes positions: "Block" locks the chart page, liquidation stays with the broker.
import { zonedParts, parseHHMM } from '../sessions/sessions.js';

export const DEFAULT_RISK = {
  enabled: false,
  accountName: '',
  startBalance: 0,
  tz: 'America/Chicago', reset: '17:00',      // trading day rolls over here (CME futures default)
  drawdown: { type: 'none', amount: 0, lockAt: 0 }, // type: none | static | eod | intraday; lockAt: floor stops trailing at this balance (0 = never)
  firmDailyLoss: 0,                            // firm daily loss limit ($), 0 = off
  pdll: 0,                                     // personal daily loss limit ($)
  pdpt: 0,                                     // personal daily profit target ($)
  onLoss: 'block',                             // warn | block — what TVSuite does when a loss rule is hit
  onTarget: 'warn',                            // warn | block — when the daily profit target is hit
  profitTarget: 0,                             // evaluation profit target ($)
  consistencyPct: 0,                           // best day must be ≤ this % of total profit (0 = off)
  maxContracts: 0,                             // per trade (0 = off)
  bracket: { risk: 0, profit: 0 },             // per-position risk/profit brackets ($), like a broker's account-level brackets
  warnAt: 0.8,                                 // warn when this share of a limit is used
  source: 'manual',                            // manual (your entries + journal) | screen (read P&L from the page)
  screen: { realized: '', unrealized: '', mode: 'day' }, // CSS paths picked on screen; mode: day (day P&L) | open (open P&L only)
};

// "$1,234.56" "-$1,234.56" "($1,234.56)" "−12.5" "+$40" "1 234,56 USD" "1.234,56 €" → number, or null.
export function parseMoney(text) {
  let s = String(text ?? '').trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /(^|[\s:$€£¥])[-−–]\s*[$€£¥]?\s*\d/.test(s) || /\d\s*[-−–]$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastComma > lastDot) {
    // European style "1.234,56" or "1 234,56"; a lone comma with exactly 3 trailing digits is a thousands separator.
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && lastDot < 0 && s.indexOf(',') === lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// Trading-day key: the calendar date the session *belongs to*. With a 17:00 Chicago reset, Monday 18:00 CT
// is Tuesday's trading day.
export function tradingDay(now, tz = 'America/Chicago', reset = '17:00') {
  const z = zonedParts(now, tz);
  const r = parseHHMM(reset);
  if (r === 0 || z.minutes < r) return z.dateKey;
  const d = new Date(Date.UTC(z.year, z.month - 1, z.day + 1));
  return d.toISOString().slice(0, 10);
}

// Next instant the trading day rolls over (DST-safe: verified against the zone, adjusted by an hour if needed).
export function nextReset(now, tz = 'America/Chicago', reset = '17:00') {
  const z = zonedParts(now, tz), r = parseHHMM(reset);
  let mins = (r - z.minutes + 1440) % 1440 || 1440;
  let t = new Date(now.getTime() + mins * 60000 - z.seconds * 1000 - now.getMilliseconds());
  for (const adj of [0, -60, 60]) {
    const c = new Date(t.getTime() + adj * 60000);
    if (zonedParts(c, tz).minutes === r && c > now) return c;
  }
  return t;
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const round2 = (n) => Math.round(n * 100) / 100;

// P&L per trading day from manual trades and screen readings. state: { trades: [{at, pnl, contracts?}], screen: {[day]: pnl}, peaks: {[day]: equity} }
export function dailyPnl(cfg, state) {
  const days = {};
  for (const t of state.trades || []) {
    if (!Number.isFinite(t.pnl)) continue;
    const k = t.day || tradingDay(new Date(t.at), cfg.tz, cfg.reset);
    days[k] = (days[k] || 0) + t.pnl;
  }
  if (cfg.source === 'screen') for (const [k, v] of Object.entries(state.screen || {})) if (Number.isFinite(v)) days[k] = v;
  return days;
}

export function evaluate(cfg, state = {}, now = new Date(), live = {}) {
  const day = tradingDay(now, cfg.tz, cfg.reset);
  const days = dailyPnl(cfg, state);
  const keys = Object.keys(days).sort();
  const start = +cfg.startBalance || 0;
  const unrealized = Number.isFinite(live.unrealized) ? live.unrealized : 0;
  const dayPnl = round2(days[day] || 0);
  const dayTotal = round2(dayPnl + unrealized);
  // Balances at each completed day's close, for end-of-day trailing.
  let bal = start, eodHigh = start, best = 0, totalProfit = 0;
  for (const k of keys) {
    bal += days[k];
    if (k < day) eodHigh = Math.max(eodHigh, bal);
    if (days[k] > 0) best = Math.max(best, days[k]);
  }
  const balance = round2(bal);
  const equity = round2(balance + unrealized);
  totalProfit = round2(balance - start);

  // Max-loss floor.
  const dd = cfg.drawdown || {};
  let floor = null;
  if (dd.type !== 'none' && dd.amount > 0 && start > 0) {
    let high = start;
    if (dd.type === 'eod') high = eodHigh;
    else if (dd.type === 'intraday') high = Math.max(eodHigh, equity, ...Object.values(state.peaks || {}).filter(Number.isFinite));
    floor = high - dd.amount;
    if (dd.type !== 'static' && dd.lockAt > 0) floor = Math.min(floor, dd.lockAt);
    floor = round2(floor);
  }

  // Daily loss: the tighter of the firm limit and the personal one.
  const limits = [['dll', +cfg.firmDailyLoss, 'Daily loss limit'], ['pdll', +cfg.pdll, 'Personal daily loss limit']].filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1]);
  const lossLimit = limits[0] ? { id: limits[0][0], amount: limits[0][1], name: limits[0][2] } : null;
  const lossUsed = Math.max(0, -dayTotal);

  const alerts = [];
  const add = (id, level, text, action) => alerts.push({ id, level, text, action: level === 'breach' ? action : 'warn' });
  for (const [id, amount, name] of limits) {
    if (lossUsed >= amount) add(id, 'breach', `${name} hit: ${money(dayTotal)} today (limit −${money(amount, false)})`, cfg.onLoss);
    else if (lossUsed >= amount * cfg.warnAt) add(id, 'warn', `${Math.round((lossUsed / amount) * 100)}% of your ${name.toLowerCase()} used (${money(dayTotal)} of −${money(amount, false)})`);
  }
  if (floor != null) {
    const room = equity - floor;
    if (room <= 0) add('mll', 'breach', `Max loss reached: equity ${money(equity, false)} at or below ${money(floor, false)}`, cfg.onLoss);
    else if (room <= dd.amount * (1 - cfg.warnAt)) add('mll', 'warn', `${money(room, false)} left before max loss (${money(floor, false)})`);
  }
  if (cfg.pdpt > 0 && dayTotal >= cfg.pdpt) add('pdpt', 'breach', `Daily profit target reached: ${money(dayTotal)} (target ${money(cfg.pdpt, false)})`, cfg.onTarget);
  let consistency = null;
  if (cfg.consistencyPct > 0 && totalProfit > 0) {
    const pct = (best / totalProfit) * 100;
    consistency = { best: round2(best), total: totalProfit, pct: Math.round(pct * 10) / 10, ok: pct <= cfg.consistencyPct };
    if (!consistency.ok) add('consistency', 'warn', `Best day is ${consistency.pct}% of total profit (rule: ≤ ${cfg.consistencyPct}%)`);
  }
  if (cfg.maxContracts > 0) {
    const big = (state.trades || []).filter((t) => (t.day || tradingDay(new Date(t.at), cfg.tz, cfg.reset)) === day && t.contracts > cfg.maxContracts);
    if (big.length) add('contracts', 'warn', `${big.length} trade${big.length > 1 ? 's' : ''} today above ${cfg.maxContracts} contracts`);
  }
  if (cfg.bracket?.risk > 0 && unrealized <= -cfg.bracket.risk) add('bracketRisk', 'warn', `Open loss ${money(unrealized)} is past your ${money(cfg.bracket.risk, false)} risk bracket`);
  if (cfg.bracket?.profit > 0 && unrealized >= cfg.bracket.profit) add('bracketProfit', 'warn', `Open profit ${money(unrealized)} reached your ${money(cfg.bracket.profit, false)} profit bracket`);

  const override = state.overrides?.[day];
  const blocking = alerts.filter((a) => a.level === 'breach' && a.action === 'block' && !(override && override.ids?.includes(a.id)));
  const target = cfg.profitTarget > 0 ? { amount: cfg.profitTarget, progress: totalProfit, pct: Math.max(0, Math.min(100, (totalProfit / cfg.profitTarget) * 100)), done: totalProfit >= cfg.profitTarget } : null;
  const status = alerts.some((a) => a.level === 'breach') ? 'breach' : alerts.length ? 'warn' : 'ok';
  return {
    day, dayPnl, unrealized: round2(unrealized), dayTotal, balance, equity, floor, roomToFloor: floor == null ? null : round2(equity - floor),
    lossLimit, lossUsed: round2(lossUsed), lossPct: lossLimit ? Math.min(100, (lossUsed / lossLimit.amount) * 100) : 0,
    target, consistency, alerts, status,
    block: blocking.length ? { reasons: blocking, until: nextReset(now, cfg.tz, cfg.reset).getTime() } : null,
    days: keys.map((k) => ({ day: k, pnl: round2(days[k]) })),
  };
}

export function money(n, signed = true) {
  if (!Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Math.abs(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : signed && n > 0 ? '+' : ''}$${s}`;
}

// Chart time: seconds added for one tick, given what counts as "on the chart".
export function chartTimeTick(rec, { seconds, session, symbol }) {
  const r = rec || { total: 0, sessions: {}, symbols: {} };
  r.total += seconds;
  const s = session || 'none';
  r.sessions[s] = (r.sessions[s] || 0) + seconds;
  if (symbol) r.symbols[symbol] = (r.symbols[symbol] || 0) + seconds;
  return r;
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m` : `${sec}s`;
}
