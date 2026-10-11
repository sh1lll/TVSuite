// End-of-session recap: what happened today (or in one session) — trades, P&L, R, chart time and whether
// you kept your rules — as numbers (pure, tested) and as a shareable card.
import { tradingDay, money, formatDuration } from './rules.js';
import { isOpen } from '../sessions/sessions.js';
import { CARD_THEMES } from '../capture/card.js';

const LIMIT_NAMES = { pdll: 'Personal daily loss limit', dll: 'Daily loss limit', mll: 'Max loss', pdpt: 'Daily target', consistency: 'Consistency', contracts: 'Max contracts', bracketRisk: 'Risk bracket', bracketProfit: 'Profit bracket' };

// input: { day, session?: {id,name,...}, cfg (risk settings), state (risk state), journal: [entries], chartTime: {total, sessions, symbols}, recordings: n }
export function computeRecap({ day, session = null, cfg, state = {}, journal = [], chartTime = null, recordings = 0 }) {
  const inScope = (at) => (tradingDay(new Date(at), cfg.tz, cfg.reset) === day) && (!session || isOpen(session, new Date(at)));
  const trades = (state.trades || []).filter((t) => Number.isFinite(t.pnl) && (t.day ? t.day === day : true) && inScope(t.at)).sort((a, b) => a.at - b.at);
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl < 0);
  const sum = (a) => a.reduce((x, t) => x + t.pnl, 0);
  const net = Math.round(sum(trades) * 100) / 100;
  const grossWin = sum(wins), grossLoss = -sum(losses);
  let cum = 0, peak = 0, maxDd = 0;
  const curve = [0];
  for (const t of trades) { cum += t.pnl; curve.push(Math.round(cum * 100) / 100); peak = Math.max(peak, cum); maxDd = Math.max(maxDd, peak - cum); }
  let streak = 0, bestStreak = 0, worstStreak = 0;
  for (const t of trades) { streak = t.pnl > 0 ? (streak > 0 ? streak + 1 : 1) : t.pnl < 0 ? (streak < 0 ? streak - 1 : -1) : 0; bestStreak = Math.max(bestStreak, streak); worstStreak = Math.min(worstStreak, streak); }
  const js = journal.filter((e) => inScope(e.createdAt));
  const rs = js.map((e) => e.resultR).filter(Number.isFinite);
  const bySym = {};
  for (const t of trades) if (t.symbol) bySym[t.symbol] = (bySym[t.symbol] || 0) + t.pnl;
  const topSymbol = Object.entries(bySym).sort((a, b) => b[1] - a[1])[0] || null;
  // Rules: anything that reached "breach" today, warnings, and overrides of your own rules.
  const fired = state.fired?.[day] || [];
  const breaches = [...new Set(fired.filter((k) => k.endsWith(':breach')).map((k) => k.split(':')[0]))];
  const warnings = [...new Set(fired.filter((k) => k.endsWith(':warn')).map((k) => k.split(':')[0]))].filter((id) => !breaches.includes(id));
  const overrides = state.overrides?.[day]?.ids || [];
  const lossBreaches = breaches.filter((id) => id !== 'pdpt');
  const time = chartTime ? (session ? chartTime.sessions?.[session.id] || 0 : chartTime.total || 0) : 0;
  return {
    day, session: session ? { id: session.id, name: session.name, color: session.color } : null,
    trades: trades.length, wins: wins.length, losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : null,
    net, grossWin: Math.round(grossWin * 100) / 100, grossLoss: Math.round(grossLoss * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? Infinity : null,
    avgWin: wins.length ? Math.round((grossWin / wins.length) * 100) / 100 : null,
    avgLoss: losses.length ? Math.round((grossLoss / losses.length) * 100) / 100 : null,
    best: trades.length ? Math.max(...trades.map((t) => t.pnl)) : null,
    worst: trades.length ? Math.min(...trades.map((t) => t.pnl)) : null,
    maxDrawdown: Math.round(maxDd * 100) / 100,
    bestStreak, worstStreak: -worstStreak,
    curve,
    totalR: rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) * 100) / 100 : null,
    journaled: js.length,
    topSymbol: topSymbol ? { symbol: topSymbol[0], pnl: Math.round(topSymbol[1] * 100) / 100 } : null,
    chartTime: time,
    recordings,
    rules: {
      followed: !lossBreaches.length && !overrides.length,
      breaches: breaches.map((id) => LIMIT_NAMES[id] || id),
      targetHit: breaches.includes('pdpt'),
      warnings: warnings.map((id) => LIMIT_NAMES[id] || id),
      overrides: overrides.length,
    },
  };
}

// One-line summary for Discord/Telegram text and voice.
export function recapText(r) {
  const parts = [`${r.session ? `${r.session.name} session` : 'Day'} ${r.day}: ${money(r.net)} on ${r.trades} trade${r.trades === 1 ? '' : 's'}`];
  if (r.winRate != null) parts.push(`${Math.round(r.winRate * 100)}% wins`);
  if (r.totalR != null) parts.push(`${r.totalR > 0 ? '+' : ''}${r.totalR}R`);
  if (r.chartTime) parts.push(`${formatDuration(r.chartTime)} on the chart`);
  parts.push(r.rules.followed ? 'rules kept ✓' : `rules: ${[...r.rules.breaches.filter((b) => b !== 'Daily target'), r.rules.overrides ? `${r.rules.overrides} override${r.rules.overrides > 1 ? 's' : ''}` : null].filter(Boolean).join(', ')}`);
  return parts.join(' · ');
}

// Card canvas (1600×900).
export function drawRecap(r, { theme = 'midnight', watermark = '', brand = true } = {}) {
  const W = 1600, H = 900, t = CARD_THEMES[theme] || CARD_THEMES.midnight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  t.stops.forEach((s, i) => g.addColorStop(i / (t.stops.length - 1), s));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const font = (w, px) => `${w} ${px}px -apple-system, "Segoe UI", Inter, Roboto, sans-serif`;
  const pos = '#5ee39b', neg = '#ff6b78';
  // header
  x.fillStyle = t.sub; x.font = font(700, 26); x.fillText(r.session ? 'SESSION RECAP' : 'DAY RECAP', 80, 92);
  const when = new Date(`${r.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  x.fillStyle = t.text; x.font = font(800, 54); x.fillText(`${r.session ? `${r.session.name} · ` : ''}${when}`, 80, 160);
  // big P&L
  x.font = font(800, 150); x.fillStyle = r.net > 0 ? pos : r.net < 0 ? neg : t.text;
  x.fillText(money(r.net), 72, 330);
  x.fillStyle = t.sub; x.font = font(600, 28);
  x.fillText(`${r.trades} trade${r.trades === 1 ? '' : 's'} · ${r.wins} win${r.wins === 1 ? '' : 's'} · ${r.losses} loss${r.losses === 1 ? '' : 'es'}`, 82, 380);
  // equity curve
  const cx = 900, cy = 200, cw = 620, ch = 200;
  x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(cx, cy, cw, ch);
  if (r.curve.length > 1) {
    const lo = Math.min(0, ...r.curve), hi = Math.max(0, ...r.curve), span = hi - lo || 1;
    const py = (v) => cy + ch - 16 - ((v - lo) / span) * (ch - 32);
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(cx, py(0)); x.lineTo(cx + cw, py(0)); x.stroke(); x.setLineDash([]);
    x.beginPath();
    r.curve.forEach((v, i) => { const px = cx + 16 + (i / (r.curve.length - 1)) * (cw - 32); i ? x.lineTo(px, py(v)) : x.moveTo(px, py(v)); });
    x.strokeStyle = r.net >= 0 ? pos : neg; x.lineWidth = 5; x.lineJoin = 'round'; x.stroke();
  } else { x.fillStyle = t.sub; x.font = font(600, 24); x.fillText('No trades logged', cx + 200, cy + ch / 2); }
  x.fillStyle = t.sub; x.font = font(600, 20); x.fillText(`P&L through the ${r.session ? 'session' : 'day'}`, cx, cy - 14);
  // stat tiles
  const tiles = [
    ['Win rate', r.winRate == null ? '—' : `${Math.round(r.winRate * 100)}%`],
    ['Profit factor', r.profitFactor == null ? '—' : r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2)],
    ['Best / worst', r.best == null ? '—' : `${money(r.best)} / ${money(r.worst)}`],
    ['Max drawdown', r.maxDrawdown ? money(-r.maxDrawdown) : '—'],
    ['Total R', r.totalR == null ? '—' : `${r.totalR > 0 ? '+' : ''}${r.totalR}R`],
    ['Chart time', r.chartTime ? formatDuration(r.chartTime) : '—'],
  ];
  tiles.forEach(([k, v], i) => {
    const tx = 80 + (i % 3) * 490, ty = 460 + Math.floor(i / 3) * 150;
    x.fillStyle = t.chip; x.beginPath(); x.roundRect(tx, ty, 460, 126, 18); x.fill();
    x.fillStyle = t.sub; x.font = font(600, 24); x.fillText(k, tx + 28, ty + 46);
    x.fillStyle = t.text; x.font = font(800, v.length > 16 ? 34 : 46); x.fillText(v, tx + 28, ty + 100);
  });
  // rules line
  const ok = r.rules.followed;
  const rule = ok ? `✓ Rules kept${r.rules.targetHit ? ' · daily target hit' : ''}` : `✕ ${[...r.rules.breaches.filter((b) => b !== 'Daily target'), r.rules.overrides ? `${r.rules.overrides} override${r.rules.overrides > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}`;
  x.font = font(700, 28);
  const rw = x.measureText(rule).width + 48;
  x.fillStyle = ok ? 'rgba(34,197,94,.22)' : 'rgba(242,54,69,.25)'; x.beginPath(); x.roundRect(80, 790, rw, 56, 28); x.fill();
  x.fillStyle = ok ? pos : neg; x.fillText(rule, 104, 828);
  x.textAlign = 'right'; x.fillStyle = t.sub; x.font = font(600, 24);
  x.fillText([watermark, brand ? 'TVSuite' : ''].filter(Boolean).join('  ·  '), W - 80, 828);
  x.textAlign = 'left';
  return c;
}
