import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, toCsv, plannedR, parseTags } from '../../src/modules/journal/stats.js';

const day = (d, h = 14) => new Date(Date.UTC(2026, 9, d, h)).getTime();
const E = [
  { id: 'a', createdAt: day(5), symbol: 'NQ1!', session: 'New York', side: 'long', entry: 100, stop: 98, target: 106, resultR: 3, tags: ['breakout'] },
  { id: 'b', createdAt: day(6), symbol: 'NQ1!', session: 'London', side: 'short', resultR: -1, tags: ['fade', 'breakout'] },
  { id: 'c', createdAt: day(7), symbol: 'ES1!', session: 'New York', side: 'long', resultR: -1, tags: [] },
  { id: 'd', createdAt: day(8), symbol: 'ES1!', session: 'New York', side: 'none', resultR: null, tags: ['idea'], note: '=HYPERLINK("x")' },
  { id: 'e', createdAt: day(9), symbol: 'NQ1!', session: 'New York', side: 'long', resultR: 2, tags: ['breakout'] },
];

test('summary stats', () => {
  const s = summarize(E);
  assert.equal(s.count, 5);
  assert.equal(s.scored, 4);
  assert.equal(s.winRate, 0.5);
  assert.equal(s.totalR, 3);
  assert.equal(s.avgR, 0.75);
  assert.equal(s.profitFactor, 2.5);
  assert.equal(s.maxDrawdownR, 2);
  assert.equal(s.worstStreak, 2);
  assert.equal(s.bySession['New York'].count, 4);
  assert.equal(s.bySession['New York'].totalR, 4);
  assert.equal(s.byTag.breakout.count, 3);
  assert.equal(s.bySide.long.wins, 2);
  assert.equal(s.bySide.none, undefined);
  assert.deepEqual(s.curve.map((p) => p.r), [3, 2, 1, 3]);
});

test('planned R and tags', () => {
  assert.equal(plannedR(E[0]), 3);
  assert.equal(plannedR({}), null);
  assert.deepEqual(parseTags('#Breakout, fade  FADE a/b'), ['breakout', 'fade', 'ab']);
});

test('CSV export escapes quotes/commas and neutralizes formulas', () => {
  const csv = toCsv([...E, { id: 'f', createdAt: day(10), symbol: 'X', note: 'said "hi", then left', resultR: -0.5 }]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0].split(',')[0], 'id');
  assert.equal(lines.length, 7);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'formula neutralized and quoted');
  assert.ok(csv.includes('"said ""hi"", then left"'));
  assert.ok(lines[6].includes(',-0.5,'), 'negative numbers are not mangled');
});
