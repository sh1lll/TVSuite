import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etParts, sessionLevels } from '../../src/modules/labs/sessions.js';

// 2026-10-21 is in EDT (UTC-4): 18:00 ET = 22:00 UTC.
const at = (iso) => Date.parse(iso) / 1000;

test('etParts rolls the evening session into the next trading day', () => {
  assert.deepEqual(etParts(at('2026-10-21T22:00:00Z')), { day: '2026-10-22', mins: 18 * 60 });
  assert.deepEqual(etParts(at('2026-10-22T13:30:00Z')), { day: '2026-10-22', mins: 9 * 60 + 30 });
  assert.equal(etParts(at('2026-10-31T23:30:00Z')).day, '2026-11-01'); // month rollover
});

test('sessionLevels finds prior day, overnight and RTH open', () => {
  const bars = [
    [at('2026-10-20T22:00:00Z'), 100, 105, 99, 101],   // prior day starts 18:00 ET
    [at('2026-10-21T15:00:00Z'), 101, 110, 95, 100],   // prior day RTH
    [at('2026-10-21T22:00:00Z'), 100, 104, 98, 103],   // current day overnight
    [at('2026-10-22T08:00:00Z'), 103, 106, 97, 104],   // overnight (04:00 ET)
    [at('2026-10-22T13:30:00Z'), 104.25, 108, 102, 107], // RTH open
  ];
  const r = sessionLevels(bars);
  assert.equal(r.day, '2026-10-22');
  const by = Object.fromEntries(r.levels.map((l) => [l.key, l]));
  assert.equal(by.PDH.top, 110); assert.equal(by.PDL.top, 95); assert.equal(by.PDH.label, 'PDH');
  assert.equal(by.ONH.top, 106); assert.equal(by.ONL.top, 97);
  assert.equal(by.RTHO.top, 104.25);
});

test('a prior day cut off by the chart history is marked partial; junk is ignored', () => {
  const r = sessionLevels([[at('2026-10-21T15:00:00Z'), 1, 2, 0.5, 1], [at('2026-10-21T23:00:00Z'), 1, 3, 1, 2], ['x']]);
  assert.equal(r.levels.find((l) => l.key === 'PDH').label, 'PDH (partial)');
  assert.deepEqual(sessionLevels([]), { day: null, levels: [] });
});
