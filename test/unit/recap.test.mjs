import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRecap, recapText } from '../../src/modules/risk/recap.js';
import { DEFAULT_RISK } from '../../src/modules/risk/rules.js';

const cfg = { ...structuredClone(DEFAULT_RISK), startBalance: 50000 };
const at = (iso) => +new Date(iso);
// Monday 2026-10-12 (CDT = UTC-5). London 03:00–11:30 London time; NY 09:30–16:00 New York time.
const trades = [
  { at: at('2026-10-12T08:15:00Z'), pnl: 300, symbol: 'ES1!', day: '2026-10-12' },   // 09:15 London → London only
  { at: at('2026-10-12T14:00:00Z'), pnl: -120, symbol: 'NQ1!', day: '2026-10-12' },  // 10:00 NY → London + NY overlap
  { at: at('2026-10-12T16:30:00Z'), pnl: -80, symbol: 'NQ1!', day: '2026-10-12' },   // 12:30 NY → NY only
  { at: at('2026-10-12T17:00:00Z'), pnl: 250, symbol: 'ES1!', day: '2026-10-12' },
  { at: at('2026-10-09T15:00:00Z'), pnl: 999, symbol: 'ES1!', day: '2026-10-09' },   // another day
];
const london = { id: 'london', name: 'London', tz: 'Europe/London', open: '08:00', close: '16:30', days: [1, 2, 3, 4, 5] };
const ny = { id: 'ny', name: 'New York', tz: 'America/New_York', open: '09:30', close: '16:00', days: [1, 2, 3, 4, 5] };

test('day recap: P&L, win rate, profit factor, drawdown, streaks, R, rules', () => {
  const state = { trades, fired: { '2026-10-12': ['pdll:warn'] }, overrides: {} };
  const journal = [{ createdAt: at('2026-10-12T14:01:00Z'), resultR: -1 }, { createdAt: at('2026-10-12T17:01:00Z'), resultR: 2.5 }, { createdAt: at('2026-10-09T15:00:00Z'), resultR: 9 }];
  const r = computeRecap({ day: '2026-10-12', cfg, state, journal, chartTime: { total: 5400, sessions: { ny: 3600 } }, recordings: 2 });
  assert.equal(r.trades, 4);
  assert.equal(r.net, 350);
  assert.equal(r.winRate, 0.5);
  assert.equal(r.profitFactor, 2.75);
  assert.equal(r.maxDrawdown, 200);
  assert.deepEqual(r.curve, [0, 300, 180, 100, 350]);
  assert.equal(r.bestStreak, 1); assert.equal(r.worstStreak, 2);
  assert.equal(r.totalR, 1.5);
  assert.deepEqual(r.topSymbol, { symbol: 'ES1!', pnl: 550 });
  assert.equal(r.chartTime, 5400);
  assert.equal(r.rules.followed, true);
  assert.deepEqual(r.rules.warnings, ['Personal daily loss limit']);
  assert.match(recapText(r), /^Day 2026-10-12: \+\$350 on 4 trades · 50% wins · \+1\.5R · 1h 30m on the chart · rules kept ✓$/);
});

test('session recap includes trades while that session was open (overlaps count for both)', () => {
  const state = { trades };
  const l = computeRecap({ day: '2026-10-12', session: london, cfg, state });
  assert.deepEqual([l.trades, l.net], [2, 180]);
  const n = computeRecap({ day: '2026-10-12', session: ny, cfg, state, chartTime: { total: 5400, sessions: { ny: 3600 } } });
  assert.deepEqual([n.trades, n.net, n.chartTime], [3, 50, 3600]);
});

test('rules broken: loss breach or override; a hit target alone still counts as kept', () => {
  const day = '2026-10-12';
  const broken = computeRecap({ day, cfg, state: { trades, fired: { [day]: ['pdll:warn', 'pdll:breach'] }, overrides: { [day]: { ids: ['pdll'] } } } });
  assert.equal(broken.rules.followed, false);
  assert.deepEqual(broken.rules.breaches, ['Personal daily loss limit']);
  assert.equal(broken.rules.overrides, 1);
  assert.match(recapText(broken), /rules: Personal daily loss limit, 1 override$/);
  const target = computeRecap({ day, cfg, state: { trades, fired: { [day]: ['pdpt:breach'] } } });
  assert.equal(target.rules.followed, true);
  assert.equal(target.rules.targetHit, true);
  const empty = computeRecap({ day: '2026-10-13', cfg, state: { trades } });
  assert.deepEqual([empty.trades, empty.net, empty.winRate, empty.profitFactor], [0, 0, null, null]);
});
