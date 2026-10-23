import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevels, pickLevels, countByType, levelLabel, hexToRgba, templatesFor, templateOverrides, MAX_LEVELS } from '../../src/modules/levels/parse.js';

test('templatesFor collects one tool\'s templates across snapshots, newest first', () => {
  const snaps = [
    { data: { TOOLS: { LineToolRectangle: { Ledge: { color: 'new' } } } } },
    { data: { TOOLS: { LineToolRectangle: { Ledge: { color: 'old' }, Zone: { color: 'z' } }, LineToolHorzLine: { Line: {} } } } },
  ];
  const r = templatesFor(snaps, 'LineToolRectangle');
  assert.deepEqual([...r.keys()].sort(), ['Ledge', 'Zone']);
  assert.equal(r.get('Ledge').color, 'new');
  assert.equal(templatesFor(null, 'LineToolRectangle').size, 0);
});

test('templateOverrides keeps only plain values (and reads a nested properties object)', () => {
  const ov = templateOverrides({ color: '#fff', linewidth: 2, fillBackground: true, nested: { a: 1 }, fn: 'x'.repeat(200), bad: NaN });
  assert.deepEqual(ov, { color: '#fff', linewidth: 2, fillBackground: true });
  assert.deepEqual(templateOverrides({ properties: { color: 'red' } }), { color: 'red' });
  assert.deepEqual(templateOverrides(null), {});
});

test('parses a copied Pine Logs block, ignoring timestamps and the header line', () => {
  const text = [
    '[2026-10-23T06:31:00.000-07:00]: Ledgeline levels · NQ1! · 2026-10-23 09:31 ET · 3 levels · type,top,bottom,note',
    '[2026-10-23T06:31:00.000-07:00]: VL,29512.25,29508.00,rejections 5',
    'RZ,29480.5,29476.5,touches 3',
    'NPOC,29401.75,29401.75,naked POC',
  ].join('\n');
  assert.deepEqual(parseLevels(text), [
    { type: 'VL', top: 29512.25, bottom: 29508, note: 'rejections 5' },
    { type: 'RZ', top: 29480.5, bottom: 29476.5, note: 'touches 3' },
    { type: 'NPOC', top: 29401.75, bottom: 29401.75, note: 'naked POC' },
  ]);
});

test('swapped top/bottom are normalised and duplicates dropped', () => {
  const r = parseLevels('PRINT,100,105,TPO slot 1\nPRINT,105,100,TPO slot 1 again');
  assert.equal(r.length, 1);
  assert.equal(r[0].top, 105);
  assert.equal(r[0].bottom, 100);
});

test('unknown types, junk and empty input are ignored', () => {
  assert.deepEqual(parseLevels(''), []);
  assert.deepEqual(parseLevels(null), []);
  assert.deepEqual(parseLevels('FOO,1,2\nVL,abc,2\nhello'), []);
});

test('levels without a note get an empty note', () => {
  assert.equal(parseLevels('PRIME,10,8')[0].note, '');
});

test('the number of levels is capped', () => {
  const text = Array.from({ length: MAX_LEVELS + 50 }, (_, i) => `VL,${i + 1},${i}`).join('\n');
  assert.equal(parseLevels(text).length, MAX_LEVELS);
});

test('pickLevels keeps only enabled types; missing types count as enabled', () => {
  const all = parseLevels('VL,2,1\nRZ,4,3\nPRINT,6,5');
  assert.deepEqual(pickLevels(all, { RZ: false }).map((l) => l.type), ['VL', 'PRINT']);
});

test('countByType counts every type', () => {
  const n = countByType(parseLevels('VL,2,1\nVL,4,3\nNPOC,6,6'));
  assert.equal(n.VL, 2);
  assert.equal(n.NPOC, 1);
  assert.equal(n.PRIME, 0);
});

test('labels and colors', () => {
  assert.equal(levelLabel({ type: 'PRIME', note: '' }), '★ Prime');
  assert.equal(levelLabel({ type: 'VL', note: 'rejections 5' }), 'VL · rejections 5');
  assert.equal(hexToRgba('#ff9800', 0.2), 'rgba(255,152,0,0.2)');
  assert.equal(hexToRgba('nope', 0.5), 'rgba(150,150,160,0.5)');
});
