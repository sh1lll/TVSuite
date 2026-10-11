import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, tradingDay, nextReset, evaluate, DEFAULT_RISK, money, chartTimeTick, formatDuration } from '../../src/modules/risk/rules.js';

const cfg = (o = {}) => ({ ...structuredClone(DEFAULT_RISK), startBalance: 50000, ...o });
// Monday 2026-10-12 10:00 CDT = 15:00Z
const MON10 = new Date('2026-10-12T15:00:00Z');
const tr = (pnl, at = MON10, extra = {}) => ({ at: +at, pnl, ...extra });

test('parseMoney handles broker formats', () => {
  const cases = [['$1,234.56', 1234.56], ['-$1,234.56', -1234.56], ['($1,234.56)', -1234.56], ['−12.5', -12.5], ['+$40', 40], ['1 234,56 USD', 1234.56],
    ['1.234,56 €', 1234.56], ['USD -250.00', -250], ['$ -75', -75], ['0.00', 0], ['1,250', 1250], ['P&L: 312.5', 312.5], ['', null], ['n/a', null], ['12 –', -12]];
  for (const [s, v] of cases) assert.equal(parseMoney(s), v, s);
});

test('trading day rolls at 17:00 Chicago, DST-safe', () => {
  assert.equal(tradingDay(MON10), '2026-10-12');
  assert.equal(tradingDay(new Date('2026-10-12T22:30:00Z')), '2026-10-13', '17:30 CDT belongs to Tuesday');
  assert.equal(tradingDay(new Date('2026-10-12T21:59:00Z')), '2026-10-12');
  assert.equal(tradingDay(MON10, 'UTC', '00:00'), '2026-10-12');
  assert.equal(nextReset(MON10).toISOString(), '2026-10-12T22:00:00.000Z');
  // Across the US DST change (2026-11-01): Friday 30 Oct 18:00 CDT → next reset Saturday 17:00 CDT; Sunday 1 Nov 17:00 CST = 23:00Z.
  assert.equal(nextReset(new Date('2026-11-01T12:00:00Z')).toISOString(), '2026-11-01T23:00:00.000Z');
});

test('personal daily loss limit like a broker PDLL: warn at 80%, block on hit', () => {
  const c = cfg({ pdll: 500, onLoss: 'block' });
  let r = evaluate(c, { trades: [tr(-300)] }, MON10);
  assert.equal(r.status, 'ok');
  r = evaluate(c, { trades: [tr(-300), tr(-120)] }, MON10);
  assert.equal(r.status, 'warn');
  assert.match(r.alerts[0].text, /84% of your personal daily loss limit/);
  r = evaluate(c, { trades: [tr(-300), tr(-250)] }, MON10);
  assert.equal(r.status, 'breach');
  assert.equal(r.block.reasons[0].id, 'pdll');
  assert.equal(new Date(r.block.until).toISOString(), '2026-10-12T22:00:00.000Z', 'blocked until the trading day resets');
  // Unrealized counts toward the daily loss.
  r = evaluate(c, { trades: [tr(-300)] }, MON10, { unrealized: -210 });
  assert.equal(r.status, 'breach');
  // Warn-only action never blocks.
  assert.equal(evaluate(cfg({ pdll: 500, onLoss: 'warn' }), { trades: [tr(-600)] }, MON10).block, null);
  // Yesterday's losses don't count today.
  assert.equal(evaluate(c, { trades: [tr(-600, new Date('2026-10-09T15:00:00Z'))] }, MON10).status, 'ok');
});

test('the tighter of firm DLL and PDLL applies; profit target can block like "Liquidate and Block"', () => {
  const r = evaluate(cfg({ firmDailyLoss: 1000, pdll: 400 }), { trades: [tr(-100)] }, MON10);
  assert.deepEqual(r.lossLimit, { id: 'pdll', amount: 400, name: 'Personal daily loss limit' });
  const t = evaluate(cfg({ pdpt: 750, onTarget: 'block' }), { trades: [tr(500), tr(300)] }, MON10);
  assert.equal(t.block.reasons[0].id, 'pdpt');
  assert.match(t.alerts[0].text, /target reached: \+\$800/);
});

test('end-of-day trailing drawdown trails closed days only and locks at the start balance', () => {
  const c = cfg({ drawdown: { type: 'eod', amount: 2000, lockAt: 50000 } });
  const d = (iso, pnl) => tr(pnl, new Date(iso));
  let r = evaluate(c, { trades: [d('2026-10-07T15:00:00Z', 800)] }, MON10);
  assert.equal(r.floor, 48800);
  // Today's intraday gain doesn't move an EOD floor.
  r = evaluate(c, { trades: [d('2026-10-07T15:00:00Z', 800), tr(900)] }, MON10);
  assert.equal(r.floor, 48800);
  // Once closed-day balance passes start + amount, the floor locks at the start balance.
  r = evaluate(c, { trades: [d('2026-10-07T15:00:00Z', 1500), d('2026-10-08T15:00:00Z', 1500)] }, MON10);
  assert.equal(r.floor, 50000);
  r = evaluate(c, { trades: [d('2026-10-07T15:00:00Z', 1500), d('2026-10-08T15:00:00Z', 1500), tr(-3050)] }, MON10);
  assert.equal(r.status, 'breach');
  assert.equal(r.alerts.find((a) => a.id === 'mll').level, 'breach');
});

test('intraday trailing uses observed equity peaks; static never trails', () => {
  const c = cfg({ drawdown: { type: 'intraday', amount: 2000, lockAt: 0 } });
  const r = evaluate(c, { trades: [tr(200)], peaks: { '2026-10-12': 51100 } }, MON10, { unrealized: 0 });
  assert.equal(r.floor, 49100);
  assert.equal(evaluate(cfg({ drawdown: { type: 'static', amount: 2000, lockAt: 0 } }), { trades: [tr(5000)] }, MON10).floor, 48000);
});

test('consistency, contracts, brackets and evaluation target', () => {
  const days = [['2026-10-06', 1200], ['2026-10-07', 300], ['2026-10-08', 500]].map(([dd, p]) => tr(p, new Date(`${dd}T15:00:00Z`)));
  const r = evaluate(cfg({ consistencyPct: 50, profitTarget: 3000, maxContracts: 5, bracket: { risk: 200, profit: 400 } }), { trades: [...days, tr(-50, MON10, { contracts: 8 })] }, MON10, { unrealized: -250 });
  assert.equal(r.consistency.pct, 61.5);
  assert.equal(r.consistency.ok, false);
  assert.equal(Math.round(r.target.pct), 65);
  assert.deepEqual(r.alerts.map((a) => a.id).sort(), ['bracketRisk', 'consistency', 'contracts']);
});

test('screen source replaces manual trades per day; override unblocks a rule for the day only', () => {
  const c = cfg({ pdll: 300, source: 'screen' });
  const st = { trades: [tr(-10)], screen: { '2026-10-12': -320 } };
  assert.equal(evaluate(c, st, MON10).dayPnl, -320);
  assert.ok(evaluate(c, st, MON10).block);
  assert.equal(evaluate(c, { ...st, overrides: { '2026-10-12': { ids: ['pdll'] } } }, MON10).block, null);
});

test('formatting and chart time', () => {
  assert.equal(money(-1234.5), '−$1,234.50');
  assert.equal(money(800), '+$800');
  assert.equal(money(800, false), '$800');
  let rec = chartTimeTick(null, { seconds: 5, session: 'ny', symbol: 'ES1!' });
  rec = chartTimeTick(rec, { seconds: 5, session: 'ny', symbol: 'NQ1!' });
  assert.deepEqual(rec, { total: 10, sessions: { ny: 10 }, symbols: { 'ES1!': 5, 'NQ1!': 5 } });
  assert.equal(formatDuration(3725), '1h 02m');
  assert.equal(formatDuration(90), '1m');
});
