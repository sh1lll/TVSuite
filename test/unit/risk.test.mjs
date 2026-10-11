import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionSize } from '../../src/modules/tools/risk.js';

test('stock sizing rounds down to whole shares', () => {
  const r = positionSize({ account: 10000, riskPct: 1, entry: 50, stop: 48.5 });
  assert.equal(r.riskAmount, 100);
  assert.equal(r.size, 66);
  assert.equal(r.side, 'long');
  assert.ok(r.actualRisk <= 100);
  assert.deepEqual(r.targets.map((t) => t.price), [51.5, 53, 54.5]);
});

test('futures sizing uses point value (ES = $50/pt)', () => {
  const r = positionSize({ account: 50000, riskPct: 1, entry: 5000, stop: 4995, market: 'futures', pointValue: 50 });
  assert.equal(r.size, 2); // $500 risk / ($5 * 50) = 2
  assert.equal(r.actualRisk, 500);
});

test('forex sizing in lots with pips', () => {
  const r = positionSize({ account: 10000, riskPct: 1, entry: 1.1, stop: 1.098, market: 'forex', lotSize: 100000, pipSize: 0.0001 });
  assert.ok(Math.abs(r.pips - 20) < 1e-9);
  assert.equal(r.size, 0.5); // $100 / (20 pips * $10) = 0.5 lots
  assert.equal(r.side, 'long');
});

test('short side and invalid input', () => {
  assert.equal(positionSize({ account: 1000, riskPct: 2, entry: 10, stop: 11 }).side, 'short');
  assert.equal(positionSize({ account: 1000, riskPct: 2, entry: 10, stop: 10 }).ok, false);
});
