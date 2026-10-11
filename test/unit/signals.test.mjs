import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, parseTitle, SignalTracker } from '../../src/modules/skins/signals.js';

test('parsePrice handles TradingView number formats', () => {
  assert.equal(parsePrice('63,123.45'), 63123.45);
  assert.equal(parsePrice('1.0854'), 1.0854);
  assert.equal(parsePrice('−12.5'), -12.5);
  assert.equal(parsePrice('1 234,56'), 1234.56);
  assert.equal(parsePrice('1.234.567'), 1234567);
  assert.equal(parsePrice('1.234,5'), 1234.5);
  assert.equal(parsePrice('1,234'), 1234);
  assert.equal(parsePrice('1234,5'), 1234.5);
  assert.equal(parsePrice('2.31K'), 2310);
  assert.equal(parsePrice('1.5M'), 1500000);
  assert.equal(parsePrice('19 850.25'), 19850.25);
  assert.ok(Number.isNaN(parsePrice('')));
  assert.ok(Number.isNaN(parsePrice('∅')));
  assert.ok(Number.isNaN(parsePrice(null)));
});

test('parseTitle extracts symbol and price from the tab title', () => {
  assert.deepEqual(parseTitle('BTCUSD 63,123.45 ▲ +1.2% Unnamed'), { symbol: 'BTCUSD', price: 63123.45 });
  assert.deepEqual(parseTitle('NQ1! 19,850.25 ▼ −0.4%'), { symbol: 'NQ1!', price: 19850.25 });
  assert.equal(parseTitle('TradingView — Track All Markets'), null);
  assert.equal(parseTitle(''), null);
});

test('SignalTracker: large candles raise range, calm mode suppresses intensity', () => {
  const tr = new SignalTracker({ enabled: true });
  let t = 0;
  for (let i = 0; i < 50; i++) tr.update({ symbol: 'X', open: 100 + i, high: 101 + i, low: 100 + i, close: 100.5 + i, t: (t += 1000) });
  const normal = tr.signals();
  assert.ok(normal.range > 0.2 && normal.range < 0.5, `normal range ${normal.range}`);
  assert.ok(normal.calm < 0.05);
  for (let i = 0; i < 3; i++) tr.update({ symbol: 'X', open: 200 + i, high: 206 + i, low: 200 + i, close: 205 + i, t: (t += 1000) });
  const wild = tr.signals();
  assert.ok(wild.range > normal.range, 'range rises with bigger candles');
  assert.ok(wild.calm > 0.5, `calm engages (${wild.calm})`);
  assert.ok(wild.intensity < normal.intensity, 'calm lowers intensity');
  // Regime adapts: if big candles persist, they become the new normal and calm releases.
  for (let i = 0; i < 60; i++) tr.update({ symbol: 'X', open: 300 + i, high: 306 + i, low: 300 + i, close: 305 + i, t: (t += 1000) });
  assert.ok(tr.signals().calm < 0.2, `calm releases (${tr.signals().calm})`);
});

test('SignalTracker: the forming bar does not pollute the average', () => {
  const tr = new SignalTracker();
  let t = 0;
  for (let i = 0; i < 20; i++) tr.update({ open: 10 + i, high: 11 + i, low: 10 + i, close: 10.5 + i, t: (t += 1000) });
  const avg = tr.avgRange;
  for (let i = 0; i < 100; i++) tr.update({ open: 99, high: 99 + i * 0.1, low: 99, close: 99, t: (t += 250) });
  assert.equal(tr.avgRange, avg, 'average only moves when a bar completes');
});

test('SignalTracker: calm mode can be disabled', () => {
  const tr = new SignalTracker({ calm: { enabled: false } });
  let t = 0;
  for (let i = 0; i < 20; i++) tr.update({ high: 101, low: 100, close: 100, t: (t += 1000) });
  for (let i = 0; i < 10; i++) tr.update({ high: 110, low: 100, close: 105, t: (t += 1000) });
  assert.equal(tr.signals().calm, 0);
});

test('SignalTracker: distance from daily open is signed and bounded', () => {
  const tr = new SignalTracker();
  let t = 0;
  for (let i = 0; i < 30; i++) tr.update({ open: 100, high: 101, low: 100, close: 100, t: (t += 1000), dayKey: 'd1' });
  tr.update({ high: 101, low: 100, close: 105, t: (t += 1000), dayKey: 'd1' });
  assert.ok(tr.signals().dist > 0.3);
  tr.update({ high: 101, low: 100, close: 50, t: (t += 1000), dayKey: 'd1' });
  assert.equal(tr.signals().dist, -1);
  tr.update({ open: 50, high: 51, low: 50, close: 50, t: (t += 1000), dayKey: 'd2' });
  assert.equal(tr.signals().dist, 0, 'new day resets the open');
});

test('SignalTracker: symbol change resets state; pulse decays', () => {
  const tr = new SignalTracker();
  tr.update({ symbol: 'A', high: 2, low: 1, close: 1.5, t: 1000 });
  tr.update({ symbol: 'B', high: 200, low: 100, close: 150, t: 2000 });
  assert.equal(tr.avgRange, 100);
  tr.sessionChanged();
  assert.equal(tr.signals().pulse, 1);
  for (let i = 0; i < 40; i++) tr.tick(3000 + i * 250);
  assert.ok(tr.signals().pulse < 0.1);
});

test('SignalTracker prefers the live price over a (possibly hovered) legend close', () => {
  const tr = new SignalTracker();
  tr.update({ open: 100, high: 101, low: 99, close: 50, price: 100.5, t: 1000 });
  assert.equal(tr.lastPrice, 100.5);
  tr.update({ close: 70, t: 2000 });
  assert.equal(tr.lastPrice, 70, 'falls back to close when no live price');
});
