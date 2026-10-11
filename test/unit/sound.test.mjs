import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyToast, crossings, fill, createMarketWatcher, EVENTS, DEFAULT_SOUND } from '../../src/modules/sound/events.js';

test('toast classification by keywords', () => {
  assert.equal(classifyToast('Order filled: Buy 2 NQ1! @ 19,850.25'), 'tradeEntry');
  assert.equal(classifyToast('Position closed on ES1!, P&L +$312'), 'tradeExit');
  assert.equal(classifyToast('Alert triggered: BTCUSD crossing 64,000'), 'tvAlert');
  assert.equal(classifyToast('Chart saved'), null);
  assert.equal(classifyToast('x'.repeat(500) + ' order filled'), null, 'ignores huge text blocks');
  assert.equal(classifyToast('Trade done', { entryWords: ['trade done'], exitWords: [], alertWords: [] }), 'tradeEntry');
});

test('level crossings respect direction', () => {
  const lv = [{ id: 'a', level: 100, dir: 'any' }, { id: 'b', level: 105, dir: 'up' }, { id: 'c', level: 95, dir: 'down' }];
  assert.deepEqual(crossings(99, 101, lv).map((x) => x.id), ['a']);
  assert.deepEqual(crossings(104, 106, lv).map((x) => [x.id, x.crossed]), [['b', 'up']]);
  assert.deepEqual(crossings(106, 104, lv).map((x) => x.id), [], 'up-only level ignores down crosses');
  assert.deepEqual(crossings(96, 95, lv).map((x) => x.id), ['c'], 'touching counts');
  assert.deepEqual(crossings(100, 100, lv), []);
});

test('market watcher: bar close, big candle once per bar, daily open cross, alerts', () => {
  const w = createMarketWatcher({ bigMultiple: 2 });
  const all = [];
  let open = 100;
  for (let i = 0; i < 12; i++) { open += 1; all.push(...w.update({ symbol: 'X', open, high: open + 1, low: open, price: open + 0.5 })); }
  assert.ok(all.filter((e) => e.type === 'barClose').length >= 10);
  const big = [...w.update({ symbol: 'X', open: 200, high: 205, low: 200, price: 204 }), ...w.update({ symbol: 'X', open: 200, high: 206, low: 200, price: 205 })];
  assert.equal(big.filter((e) => e.type === 'bigCandle').length, 1, 'fires once for the bar');
  const w2 = createMarketWatcher();
  w2.update({ symbol: 'Y', open: 50, high: 51, low: 49, price: 50.5 });
  const cross = w2.update({ symbol: 'Y', open: 50, high: 51, low: 49, price: 49.5 }, [{ id: 'l', level: 50, dir: 'any' }]);
  assert.ok(cross.some((e) => e.type === 'dailyOpenCross' && e.dir === 'down'));
  assert.ok(cross.some((e) => e.type === 'priceAlert' && e.level === 50));
  assert.deepEqual(w2.update({ symbol: 'Y', price: 48 }, [{ id: 'other', symbol: 'Z', level: 49, dir: 'any' }]), [], 'alerts for other symbols are ignored');
});

test('voice templates and defaults cover every event', () => {
  assert.equal(fill('{symbol} crossed {level}', { symbol: 'NQ1!', level: 19850 }), 'NQ1! crossed 19850');
  assert.equal(fill('{session} is open', {}), 'is open');
  for (const e of EVENTS) assert.ok(DEFAULT_SOUND.events[e.id], `default for ${e.id}`);
});
