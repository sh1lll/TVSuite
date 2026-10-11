import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBackup, makeBackup, diff, planRestore, summarizePlan, countEntries, stableStringify, backupFilename, pruneSnapshots } from '../../src/modules/templates/model.js';
import { createTvApi, readCsrf, mapLimit, TOOL_TYPES, toolLabel } from '../../src/modules/templates/api.js';

const live = { THEMES: { Dark: { a: 1 } }, TOOLS: { LineToolTrendLine: { Blue: { c: 'blue' }, Red: { c: 'red' } } } };
const snap = { THEMES: { Dark: { a: 2 }, Light: { a: 3 } }, TOOLS: { LineToolTrendLine: { Blue: { c: 'blue' } }, LineToolRectangle: { Zone: { f: 1 } } } };

test('normalizeBackup accepts the community format and rejects junk', () => {
  const b = normalizeBackup(makeBackup(snap, 'alice'));
  assert.equal(b.meta.user, 'alice');
  assert.deepEqual(countEntries(b), { themes: 2, templates: 2, total: 4 });
  assert.throws(() => normalizeBackup([]));
  assert.throws(() => normalizeBackup({}), /no themes/);
  const weird = normalizeBackup({ TOOLS: { NotATool: { x: 1 }, LineToolRay: { R: {} } } });
  assert.deepEqual(Object.keys(weird.TOOLS), ['LineToolRay']);
});

test('stableStringify ignores key order', () => {
  assert.equal(stableStringify({ b: 1, a: [1, { y: 2, x: 1 }] }), stableStringify({ a: [1, { x: 1, y: 2 }], b: 1 }));
});

test('diff classifies entries', () => {
  const d = diff(snap, live);
  const s = Object.fromEntries(d.map((e) => [`${e.tool}/${e.name}`, e.status]));
  assert.equal(s['THEMES/Dark'], 'changed');
  assert.equal(s['THEMES/Light'], 'added');
  assert.equal(s['LineToolTrendLine/Blue'], 'same');
  assert.equal(s['LineToolTrendLine/Red'], 'removed');
  assert.equal(s['LineToolRectangle/Zone'], 'added');
  assert.equal(d[0].status, 'added', 'sorted added first');
});

test('planRestore strategies', () => {
  const sel = [{ tool: 'THEMES', name: 'Dark' }, { tool: 'THEMES', name: 'Light' }, { tool: 'LineToolTrendLine', name: 'Blue' }, { tool: 'X', name: 'gone' }];
  const over = summarizePlan(planRestore(snap, live, sel, 'overwrite'));
  assert.deepEqual(over, { save: 2, overwrite: 1, renamed: 0, skip: 0, unchanged: 1, missing: 1 });
  const skip = summarizePlan(planRestore(snap, live, sel, 'skip'));
  assert.equal(skip.skip, 1);
  assert.equal(skip.save, 1);
  const live2 = { THEMES: { Dark: { a: 1 }, 'Dark (restored)': { a: 9 } }, TOOLS: {} };
  const ren = planRestore(snap, live2, [{ tool: 'THEMES', name: 'Dark' }], 'rename');
  assert.equal(ren[0].target, 'Dark (restored 2)');
});

test('filenames, pruning, labels', () => {
  assert.match(backupFilename('a/b', new Date(2026, 0, 2, 3, 4, 5)), /^TradingView a_b \(2026-01-02 03\.04\.05\)\.backup\.json$/);
  const list = [1, 5, 3, 2].map((t) => ({ createdAt: t }));
  assert.deepEqual(pruneSnapshots(list, 2).map((s) => s.createdAt), [5, 3]);
  assert.equal(toolLabel('LineToolFibRetracement'), 'Fib Retracement');
  assert.equal(TOOL_TYPES.length, 52);
});

test('readCsrf decodes the cookie', () => {
  assert.equal(readCsrf('a=1; csrftoken=ab%2Bc; z=2'), 'ab+c');
  assert.equal(readCsrf('a=1'), '');
});

test('mapLimit respects the concurrency bound', async () => {
  let inflight = 0, peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (x) => { inflight++; peak = Math.max(peak, inflight); await new Promise((r) => setTimeout(r, 5)); inflight--; return x * 2; });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
});

// A fake TradingView backend implementing the endpoints the API uses.
function fakeBackend(state, { failOnce = new Set() } = {}) {
  const calls = [];
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(`${init.method || 'GET'} ${u.pathname}`);
    const key = u.pathname + u.search;
    if (failOnce.has(key)) { failOnce.delete(key); return json({}, 503); }
    if (u.pathname === '/themes/') return json(Object.keys(state.THEMES));
    if (u.pathname === '/theme/') return json({ content: JSON.stringify(state.THEMES[u.searchParams.get('themeName')]) });
    let m = u.pathname.match(/^\/drawing-templates\/(\w+)\/$/);
    if (m) return json(Object.keys(state.TOOLS[m[1]] || {}));
    m = u.pathname.match(/^\/drawing-template\/(\w+)\/$/);
    if (m) return json({ content: JSON.stringify(state.TOOLS[m[1]][u.searchParams.get('templateName')]) });
    if (init.method === 'POST') {
      assert.equal(init.headers['X-CSRFToken'], 'tok');
      const f = Object.fromEntries(init.body.entries());
      if (u.pathname === '/save-theme/') state.THEMES[f.name] = JSON.parse(f.content);
      else if (u.pathname === '/save-drawing-template/') (state.TOOLS[f.tool] ??= {})[f.name] = JSON.parse(f.content);
      else if (u.pathname === '/remove-theme/') delete state.THEMES[f.name];
      else if (u.pathname === '/remove-drawing-template/') delete state.TOOLS[f.tool][f.name];
      return json({});
    }
    return json({}, 404);
  };
  return { fetchImpl, calls };
}

test('api.fetchAll retrieves everything and retries transient errors', async () => {
  const state = structuredClone(live);
  const { fetchImpl, calls } = fakeBackend(state, { failOnce: new Set(['/drawing-templates/LineToolTrendLine/']) });
  const api = createTvApi({ origin: 'https://www.tradingview.com', fetchImpl, csrf: () => 'tok' });
  const progress = [];
  const all = await api.fetchAll({ concurrency: 4, onProgress: (p) => progress.push(p) });
  assert.deepEqual(all.THEMES, live.THEMES);
  assert.deepEqual(all.TOOLS, live.TOOLS);
  assert.equal(all.errors.length, 0);
  assert.equal(progress.at(-1).done, 53);
  assert.equal(calls.filter((c) => c === 'GET /drawing-templates/LineToolTrendLine/').length, 2, 'retried once');
});

test('api save/remove round trip and auth errors', async () => {
  const state = structuredClone(live);
  const { fetchImpl } = fakeBackend(state);
  const api = createTvApi({ origin: 'https://www.tradingview.com', fetchImpl, csrf: () => 'tok' });
  await api.saveTemplate('LineToolRay', 'New', { w: 2 });
  await api.saveTheme('Neo', { bg: 1 });
  await api.removeTemplate('LineToolTrendLine', 'Red');
  assert.deepEqual(state.TOOLS.LineToolRay.New, { w: 2 });
  assert.deepEqual(state.THEMES.Neo, { bg: 1 });
  assert.equal(state.TOOLS.LineToolTrendLine.Red, undefined);
  const denied = createTvApi({ origin: 'https://x', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }), retries: 0 });
  await assert.rejects(denied.fetchAll(), /Not signed in/);
});

test('maybeAutoBackup: due/skip/unchanged logic (localStorage host)', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { maybeAutoBackup, loadSnapshots, invalidateSnapshots } = await import('../../src/modules/templates/snapshots.js');
  const data = { THEMES: { A: { x: 1 } }, TOOLS: {} };
  const api = { calls: 0, async fetchAll() { this.calls++; return { ...structuredClone(data), errors: [] }; } };
  const settings = { templates: { autoBackup: { enabled: true, everyHours: 24 }, keepSnapshots: 5 } };
  assert.deepEqual(await maybeAutoBackup({ api, settings: { templates: { autoBackup: { enabled: false } } } }), { skipped: 'disabled' });
  const r1 = await maybeAutoBackup({ api, settings, now: 1e12 });
  assert.ok(r1.saved);
  assert.deepEqual(await maybeAutoBackup({ api, settings, now: 1e12 + 3600e3 }), { skipped: 'not due' });
  assert.deepEqual(await maybeAutoBackup({ api, settings, now: 1e12 + 25 * 3600e3 }), { skipped: 'unchanged' });
  data.THEMES.B = { y: 2 };
  const r2 = await maybeAutoBackup({ api, settings, now: 1e12 + 50 * 3600e3 });
  assert.ok(r2.saved);
  invalidateSnapshots();
  assert.equal((await loadSnapshots()).length, 2);
  delete globalThis.localStorage;
});
