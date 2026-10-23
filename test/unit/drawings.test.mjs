import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketKey, cleanProps, cleanDrawing, addCopy, pickCopy, describeCopy, exportCopy, parseExport, MAX_COPIES } from '../../src/modules/drawings/model.js';

test('marketKey groups every spelling of a market, micros with their full-size contract', () => {
  for (const s of ['NQ1!', 'CME_MINI:NQ1!', 'NQZ2026', 'NQZ6', 'CON.F.US.ENQ.Z26', 'MNQ1!', '/NQZ26']) assert.equal(marketKey(s), 'NQ', s);
  assert.equal(marketKey('MES1!'), 'ES');
  assert.equal(marketKey('NASDAQ:AAPL'), 'AAPL');
  assert.equal(marketKey(''), '');
});

test('cleanProps keeps the look and drops what ties a drawing to its source chart', () => {
  const p = cleanProps({ color: '#fff', linewidth: 2, fillBackground: true, symbol: 'NQ1!', interval: '1', intervalsVisibilities: { minutes: true },
    level1: { coeff: 0.5, color: 'red', visible: true }, fn: () => 1, bad: NaN, list: [1, 2], deep: { a: { b: { c: 1 } } } });
  assert.deepEqual(p, { color: '#fff', linewidth: 2, fillBackground: true, level1: { coeff: 0.5, color: 'red', visible: true } });
});

test('cleanDrawing validates the tool name and points and keeps the text', () => {
  const d = cleanDrawing({ name: 'rectangle', points: [{ time: 1700000000, price: 100 }, { time: 1700003600, price: 90 }, { time: 'x', price: 1 }], props: { color: 'red', text: 'Ledge' } });
  assert.equal(d.points.length, 2);
  assert.equal(d.text, 'Ledge');
  assert.equal(cleanDrawing({ name: 'Bad Name', points: [{ time: 1, price: 1 }] }), null);
  assert.equal(cleanDrawing({ name: 'horizontal_line', points: [] }), null);
});

test('addCopy keeps one copy per market, newest first, capped', () => {
  let copies = {};
  copies = addCopy(copies, { symbol: 'NQ1!', items: [{ name: 'rectangle', points: [{ time: 1, price: 1 }] }] }, 1).copies;
  copies = addCopy(copies, { symbol: 'MNQZ2026', items: [] }, 2).copies;
  assert.deepEqual(Object.keys(copies), ['NQ']);
  assert.equal(copies.NQ.items.length, 0);
  for (let i = 0; i < MAX_COPIES + 5; i++) copies = addCopy(copies, { symbol: `T${i}`, items: [] }, 10 + i).copies;
  assert.equal(Object.keys(copies).length, MAX_COPIES);
});

test('pickCopy prefers the chart\'s market, else the newest copy', () => {
  const copies = { NQ: { at: 1, items: [] }, ES: { at: 5, items: [] } };
  assert.equal(pickCopy(copies, 'CON.F.US.ENQ.Z26'), 'NQ');
  assert.equal(pickCopy(copies, 'CL1!'), 'ES');
  assert.equal(pickCopy({}, 'NQ1!'), null);
});

test('describeCopy counts tools', () => {
  assert.equal(describeCopy([{ name: 'rectangle' }, { name: 'rectangle' }, { name: 'horizontal_line' }]), '2 rectangles, 1 horizontal line');
});

test('an exported copy reads back the same, and junk gives a readable error', () => {
  const copy = { symbol: 'CME_MINI:NQ1!', at: Date.UTC(2026, 9, 22), items: [{ name: 'rectangle', points: [{ time: 1700000000, price: 29500 }, { time: 1700003600, price: 29490 }], props: { color: '#f00' }, text: '' }] };
  const text = exportCopy(copy);
  assert.match(text.split('\n')[0], /^TVSuite drawings · NQ · 1 drawing · 2026-10-22$/);
  const back = parseExport(`  some chat text before\n${text}\n`);
  assert.equal(back.symbol, 'CME_MINI:NQ1!');
  assert.deepEqual(back.items, copy.items);
  assert.throws(() => parseExport('hello'), /isn't an exported/);
  assert.throws(() => parseExport(text.slice(0, -20)), /incomplete/);
  assert.throws(() => parseExport('{"v":1,"items":[]}'), /no drawings/);
});
