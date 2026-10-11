import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, checkGenerated, SKIN_SCHEMA } from '../../src/ai/prompt.js';
import { validateSkin } from '../../src/modules/skins/packs.js';
import { compileProgram } from '../../src/modules/skins/runner.js';

test('extractJson tolerates fences and prose', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Here:\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('Sure! {"a":3} hope it helps'), { a: 3 });
  assert.throws(() => extractJson('nope'));
});

test('checkGenerated rejects code that reaches for page or network APIs', () => {
  const ok = checkGenerated({ name: 'x', code: 'function draw(ctx, api){ ctx.fillRect(0,0,api.w,api.h); }', params: { speed: 1, 'bad key': 2 } });
  assert.deepEqual(ok.params, { speed: 1 });
  assert.throws(() => checkGenerated({ code: 'function draw(){ fetch("x") }' }), /fetch/);
  assert.throws(() => checkGenerated({ code: 'function paint(){}' }), /draw/);
});

test('a generated program validates as a pack and compiles with shadowed globals', () => {
  const gen = checkGenerated({ name: 'Rainy', description: 'd', params: { n: 50 }, code: 'function setup(api){ api.state.k = 1; }\nfunction draw(ctx, api){ ctx.fillStyle = api.lib ? "#000" : "#fff"; ctx.fillRect(0,0,api.w,api.h); }' });
  const { ok, errors } = validateSkin({ ...gen, kind: 'canvas' });
  assert.ok(ok, errors.join());
  const prog = compileProgram(gen.code);
  assert.equal(typeof prog.draw, 'function');
  assert.equal(typeof prog.setup, 'function');
  const shadow = compileProgram('function draw(){ return typeof fetch + typeof self + typeof globalThis; }');
  assert.equal(shadow.draw(), 'undefinedundefinedundefined');
  assert.deepEqual(SKIN_SCHEMA.required, ['name', 'description', 'params', 'code']);
});
