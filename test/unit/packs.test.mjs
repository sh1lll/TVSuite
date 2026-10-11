import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSkin, encodeSkin, decodeSkin, skinShareLink, hasCode, slugify } from '../../src/modules/skins/packs.js';

const canvasSkin = {
  name: 'Rainy Neon Street', kind: 'canvas', author: 'me', tags: ['rain', 'neon'],
  params: { density: 120, hue: 300, glow: true },
  code: 'function draw(ctx, api) { ctx.fillStyle = "#123"; ctx.fillRect(0, 0, api.w, api.h); }',
};

test('validateSkin normalizes a canvas skin', () => {
  const { ok, skin, errors } = validateSkin(canvasSkin);
  assert.ok(ok, errors.join());
  assert.equal(skin.id, 'rainy-neon-street');
  assert.equal(skin.schema, 'tvsuite.skin/1');
  assert.ok(hasCode(skin));
});

test('validateSkin rejects bad input', () => {
  assert.equal(validateSkin(null).ok, false);
  assert.equal(validateSkin({ kind: 'nope' }).ok, false);
  assert.equal(validateSkin({ kind: 'canvas', code: 'alert(1)' }).ok, false, 'needs draw()');
  assert.equal(validateSkin({ kind: 'shader', glsl: 'void main(){}' }).ok, false, 'needs mainImage');
  assert.equal(validateSkin({ kind: 'media', url: 'javascript:alert(1)' }).ok, false);
  assert.equal(validateSkin({ kind: 'builtin', base: 'aurora', params: { 'bad-name': 1 } }).ok, false);
  assert.equal(validateSkin({ kind: 'builtin', base: 'aurora', params: { x: { nested: 1 } } }).ok, false);
});

test('encode/decode round trip and link format', async () => {
  const code = await encodeSkin(canvasSkin);
  assert.match(code, /^TVSKIN1\.[A-Za-z0-9_-]+$/);
  const back = await decodeSkin(code);
  assert.equal(back.code, canvasSkin.code);
  assert.deepEqual(back.params, canvasSkin.params);
  const link = await skinShareLink(canvasSkin);
  assert.ok(link.startsWith('https://www.tradingview.com/chart/#tvskin=TVSKIN1.'));
  assert.equal((await decodeSkin(link)).name, 'Rainy Neon Street');
  assert.equal((await decodeSkin(JSON.stringify(canvasSkin))).name, 'Rainy Neon Street');
  await assert.rejects(decodeSkin('hello'));
});

test('slugify', () => {
  assert.equal(slugify('  Ünïcode Skin!! '), 'unicode-skin');
  assert.equal(slugify(''), 'skin');
});
