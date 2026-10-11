// End-to-end suite: the built MV3 extension in real Chromium against the mock TradingView chart page.
// Run: npm run e2e   (screenshots land in test/e2e/out/)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { launchWithExtension, routeTradingView, makeBackend, panel, ROOT, CHROME } from './harness.mjs';
import { encodeSkin } from '../../src/modules/skins/packs.js';

const OUT = path.join(ROOT, 'test/e2e/out');
mkdirSync(OUT, { recursive: true });
const results = [];
const only = process.argv[2];
let page;

async function check(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`  ✔ ${name} (${Date.now() - t0} ms)`); }
  catch (err) {
    try { await page?.screenshot({ path: path.join(OUT, `fail-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`) }); } catch (_) { /* page may be closed */ }
    results.push({ name, ok: false, err }); console.log(`  ✘ ${name}\n      ${String(err.stack || err).split('\n').slice(0, 4).join('\n      ')}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, { timeout = 8000, interval = 150, message = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(interval); }
  throw new Error(`Timed out waiting for ${message} (last: ${JSON.stringify(last)})`);
}

const layerData = (page) => page.evaluate(() => { const l = document.getElementById('tvsuite-skin-layer'); return l ? { ...l.dataset, display: l.style.display, z: l.style.zIndex, blend: l.style.mixBlendMode } : null; });
const html = (page) => page.evaluate(() => Object.fromEntries([...document.documentElement.attributes].map((a) => [a.name, a.value])));
// Average color of a screenshot region (chart area, away from candles) — proves the skin is visible.
async function regionStats(page, clip) {
  const buf = await page.screenshot({ clip });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    let r = 0, g = 0, b = 0, n = d.length / 4, vr = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    r /= n; g /= n; b /= n;
    for (let i = 0; i < d.length; i += 4) vr += (d[i] - r) ** 2 + (d[i + 1] - g) ** 2 + (d[i + 2] - b) ** 2;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), variance: Math.round(vr / n) };
  }, buf.toString('base64'));
}
const CLIP = { x: 700, y: 560, width: 300, height: 200 };

async function skinsView(v) {
  const p = await openPanel(page, 'skins');
  await p.locator(`.subnav button[data-value="${v}"]`).first().click();
  return p;
}

async function openPanel(page, tab) {
  const p = panel(page);
  if (await p.locator('.panel').isHidden()) await p.locator('.fab').click();
  if (tab) await p.locator(`.tab[data-tab="${tab}"]`).click();
  return p;
}

console.log(`Chromium: ${CHROME}`);
const { context, extensionId } = await launchWithExtension({ args: ['--autoplay-policy=no-user-gesture-required'] });
const backend = makeBackend();
await routeTradingView(context, backend);
page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && /TVSuite/.test(m.text())) pageErrors.push(m.text()); });
await page.goto('https://www.tradingview.com/chart/abc123/');

console.log('\nSkins');
await check('skin layer mounts via the sandboxed extension frame and runs', async () => {
  const d = await waitFor(async () => { const x = await layerData(page); return x?.state === 'running' && x; }, { message: 'running skin' });
  assert.equal(d.transport, 'frame');
  assert.equal(d.z, '-1');
});

await check('under mode clears only the chart background fill (axes and snapshots keep theirs)', async () => {
  await waitFor(() => page.evaluate(() => (window.__tvsuiteClears || 0) > 10), { message: 'background clears' });
  const px = await page.evaluate(() => ({ pane: window.mockTV.pixel('main', 0.98, 0.02), axis: window.mockTV.pixel('axis', 0.5, 0.97), snap: window.mockTV.snapshot() }));
  assert.equal(px.pane[3], 0, 'pane background is transparent');
  assert.equal(px.axis[3], 255, 'axis background untouched');
  assert.deepEqual(px.snap, [19, 23, 34, 255], 'detached snapshot canvas keeps the real background');
});

await check('skin is visible behind the chart and animates', async () => {
  const a = await regionStats(page, CLIP);
  await sleep(1500);
  const b = await regionStats(page, CLIP);
  assert.ok(a.variance > 20 || Math.abs(a.g - 23) > 4 || Math.abs(a.b - 34) > 4, `chart area differs from flat #131722: ${JSON.stringify(a)}`);
  assert.notDeepEqual(a, b, 'pixels change over time');
  await page.screenshot({ path: path.join(OUT, '01-under-aurora.png') });
});

await check('every built-in, starter and gallery skin starts without errors', async () => {
  const p = await skinsView('library');
  const ids = await p.locator('.card[data-skin]').evaluateAll((els) => els.map((e) => e.dataset.skin));
  assert.ok(ids.length >= 13, `found ${ids.length} skins`);
  const failures = [];
  for (const id of ids) {
    await p.locator(`.card[data-skin="${id}"]`).first().click();
    try {
      await waitFor(async () => { const d = await layerData(page); return d?.skin === id && (d?.state === 'running' || d?.state === 'error') ? d : null; }, { timeout: 10000, message: `${id} start` });
      await sleep(900);
      const d = await layerData(page);
      if (d.state !== 'running') failures.push(`${id}: ${d.state} ${d.error || ''}`);
    } catch (err) { failures.push(`${id}: ${err.message}`); }
    if (['synthwave', 'rain-neon', 'silk', 'nebula'].includes(id)) { await p.locator('.x').click(); await sleep(400); await page.screenshot({ path: path.join(OUT, `02-skin-${id}.png`) }); await skinsView('library'); }
  }
  assert.deepEqual(failures, []);
});

await check('starter custom skins are installed and every card shows a rendered preview', async () => {
  const p = await skinsView('library');
  const mine = await p.locator('[data-lib="mine"] .card[data-skin]').evaluateAll((els) => els.map((e) => e.dataset.skin));
  for (const id of ['custom-midnight-aurora', 'custom-tokyo-rain', 'fireflies', 'ocean-dusk-shader']) assert.ok(mine.includes(id), `starter ${id} present`);
  // Code skins are previewed by the sandbox worker; wait until their canvases hold real (dark) frames, not the bright placeholder.
  await waitFor(() => page.evaluate(() => {
    const r = document.getElementById('tvsuite-panel-host').shadowRoot;
    return ['fireflies', 'snowfall', 'topo-lines', 'aurora', 'custom-tokyo-rain'].every((id) => {
      const c = r.querySelector(`.card[data-skin="${id}"] canvas`); if (!c || !c.width) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let sum = 0;
      for (let i = 0; i < d.length; i += 64) sum += d[i] + d[i + 1] + d[i + 2];
      return sum / (d.length / 64) < 120;
    });
  }), { timeout: 30000, message: 'rendered previews' });
  await page.screenshot({ path: path.join(OUT, '12-library.png') });
});

await check('studio remix: tweak a built-in, preview on chart, save to My skins', async () => {
  let p = await skinsView('library');
  await p.locator('.card.add').click();
  await p.locator('.sec', { hasText: 'Remix a built-in' }).locator('input[type=text]').fill('E2E Remix');
  await p.locator('.sec', { hasText: 'Remix a built-in' }).locator('select').selectOption('plexus');
  const sec = p.locator('.sec', { hasText: 'Remix a built-in' });
  await sec.locator('input[type=range]').nth(1).fill('300'); // hue
  await sec.getByRole('button', { name: 'Try on chart' }).click();
  await waitFor(async () => (await layerData(page))?.skin === 'studio-preview', { message: 'preview running' });
  await sec.getByRole('button', { name: 'Save to My skins' }).click();
  const d = await waitFor(async () => { const x = await layerData(page); return x?.skin?.startsWith('custom-e2e-remix') && x?.state === 'running' && x; }, { message: 'saved remix active' });
  assert.ok(d);
  p = await skinsView('library');
  assert.equal(await p.locator('[data-lib="mine"] .card', { hasText: 'E2E Remix' }).count(), 1);
});

await check('studio code: write a canvas skin, run it in the sandbox, save it', async () => {
  let p = await skinsView('studio');
  await p.locator('.seg.subnav').nth(1).locator('button[data-value="code"]').click();
  const sec = p.locator('.sec', { hasText: 'Write a skin' });
  await sec.locator('input[type=text]').fill('E2E Code');
  await sec.locator('textarea').fill('function draw(ctx, api) { ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, api.w, api.h); }');
  await sec.getByRole('button', { name: 'Save to My skins' }).click();
  await waitFor(async () => { const x = await layerData(page); return x?.skin?.startsWith('custom-e2e-code') && x?.state === 'running'; }, { message: 'code skin running' });
  await sec.locator('textarea').fill('this is not a skin');
  await sec.getByRole('button', { name: 'Update skin' }).click();
  assert.match(await sec.locator('.note.err').textContent(), /draw/);
  p = await skinsView('library');
  await p.locator('.card[data-skin="aurora"]').click();
});

await check('overlay mode stops patching the page and blends above the chart', async () => {
  let p = await skinsView('look');
  await p.locator('.seg.mode button[data-value="overlay"]').click();
  const d = await waitFor(async () => { const x = await layerData(page); return x?.z === '3' && x; }, { message: 'overlay layer' });
  assert.equal(d.blend, 'screen');
  const attrs = await html(page);
  assert.equal(attrs['data-tvsuite-clear'], undefined, 'no clear scope in overlay mode');
  // The chart repaints on its next animation frame (slow under a software rasterizer), so wait for it.
  await waitFor(async () => (await page.evaluate(() => window.mockTV.pixel('main', 0.98, 0.02)))[3] === 255, { message: 'chart background painted normally again' });
  await p.locator('.x').click();
  await page.screenshot({ path: path.join(OUT, '03-overlay.png') });
  p = await skinsView('look');
  await p.locator('.seg.mode button[data-value="under"]').click();
  await waitFor(async () => (await layerData(page))?.z === '-1', { message: 'back to under' });
});

await check('look controls apply CSS filters (dim, blur, black & white)', async () => {
  const p = await skinsView('look');
  const ranges = p.locator('input[type=range]');
  await ranges.nth(2).fill('6'); // blur
  await p.getByText('Black & white').click();
  const f = await page.evaluate(() => document.getElementById('tvsuite-skin-layer').style.filter);
  assert.match(f, /blur\(6px\)/);
  assert.match(f, /grayscale\(1\)/);
  await ranges.nth(2).fill('0');
  await p.getByText('Black & white').click();
});

await check('skin parameter sliders tweak the live renderer without respawning it', async () => {
  let p = await skinsView('library');
  await p.locator('.card[data-skin="starfield"]').click();
  p = await skinsView('look');
  await waitFor(async () => { const x = await layerData(page); return x?.skin === 'starfield' && x?.state === 'running'; }, { message: 'starfield running' });
  const frames = () => page.evaluate(() => document.getElementById('tvsuite-skin-layer') && 1);
  const statesSeen = [];
  const unsub = setInterval(async () => { try { statesSeen.push((await layerData(page)).state); } catch (_) { /* navigating */ } }, 50);
  const hue = p.locator('.sec', { hasText: 'Skin parameters' }).locator('input[type=range]').nth(2);
  for (const v of [100, 150, 200, 250, 300]) { await hue.fill(String(v)); await sleep(60); }
  await sleep(400);
  clearInterval(unsub);
  assert.ok(await frames());
  assert.ok(!statesSeen.includes('starting'), `no new renderer started while dragging (${[...new Set(statesSeen)]})`);
  await p.getByRole('button', { name: 'Reset' }).click();
  await waitFor(async () => (await layerData(page))?.state === 'running', { message: 'running after reset' });
  p = await skinsView('library');
  await p.locator('.card[data-skin="aurora"]').click();
});

await check('hotkey Alt+Shift+K toggles the skin and restores the chart background', async () => {
  await page.mouse.click(700, 450);
  await page.keyboard.press('Alt+Shift+K');
  await waitFor(async () => (await layerData(page))?.display === 'none', { message: 'layer hidden' });
  const attrs = await html(page);
  assert.equal(attrs['data-tvsuite-mode'], undefined);
  await sleep(200);
  assert.equal((await page.evaluate(() => window.mockTV.pixel('main', 0.98, 0.02)))[3], 255);
  await page.keyboard.press('Alt+Shift+K');
  await waitFor(async () => (await layerData(page))?.display === 'block', { message: 'layer shown' });
});

await check('reactive signals are read from the legend and calm mode engages on volatility', async () => {
  const p = await skinsView('smart');
  await p.locator('label.switch', { hasText: /^Reactive/ }).click();
  await waitFor(async () => (await layerData(page))?.intensity, { message: 'signals flowing' });
  const calm0 = +(await layerData(page)).calm;
  await page.evaluate(() => window.mockTV.setVolatility(40));
  const d = await waitFor(async () => { const x = await layerData(page); return +x.calm > 0.3 && x; }, { timeout: 15000, message: 'calm > 0.3' });
  assert.ok(+d.calm > calm0);
  assert.ok(await p.locator('.meter').count() >= 5, 'signal meters shown');
  await page.evaluate(() => window.mockTV.setVolatility(1));
});

await check('shared skin link imports with a trust prompt and runs in the sandbox', async () => {
  const code = await encodeSkin({ name: 'Link Test', kind: 'canvas', author: 'e2e', params: { hue: 120 }, code: 'function draw(ctx, api){ ctx.fillStyle = api.lib.hsl(api.p.hue, 80, 30); ctx.fillRect(0, 0, api.w, api.h); }' });
  await page.goto(`https://www.tradingview.com/chart/abc123/#tvskin=${code}`);
  const p = panel(page);
  await p.locator('.modal').waitFor();
  assert.match(await p.locator('.modal pre').textContent(), /function draw/);
  await p.getByRole('button', { name: 'Add & run in sandbox' }).click();
  await waitFor(async () => (await layerData(page))?.state === 'running', { message: 'link skin running' });
  assert.equal(await page.evaluate(() => location.hash), '', 'fragment removed after import');
  assert.ok(await p.locator('.card[data-skin="link-test"]').count() === 1, 'added to My skins');
});

await check('sandbox: skin code cannot reach network or page globals, even via constructor escape', async () => {
  // Paints green only if every escape route is closed; red otherwise.
  const probe = `function draw(ctx, api) {
    let g; try { g = (function(){}).constructor('return this')(); } catch (e) { g = null; }
    const open = g && (typeof g.fetch === 'function' || typeof g.XMLHttpRequest === 'function' || typeof g.WebSocket === 'function' || typeof g.importScripts === 'function' || typeof g.document !== 'undefined');
    ctx.fillStyle = open ? '#ff0000' : '#00ff00'; ctx.fillRect(0, 0, api.w, api.h);
  }`;
  const code = await encodeSkin({ name: 'Escape Probe', kind: 'canvas', code: probe });
  await page.goto(`https://www.tradingview.com/chart/abc123/#tvskin=${code}`);
  const p = panel(page);
  await p.getByRole('button', { name: 'Add & run in sandbox' }).click();
  await waitFor(async () => (await layerData(page))?.state === 'running', { message: 'probe running' });
  await p.locator('.x').click();
  await sleep(1500);
  const s = await regionStats(page, CLIP);
  assert.ok(s.g > s.r * 2, `expected green (sealed), got ${JSON.stringify(s)}`);
});

await check('watchdog stops a skin that hangs its worker', async () => {
  const code = await encodeSkin({ name: 'Hang', kind: 'canvas', code: 'function draw(ctx, api){ if (api.frame > 5) { while (true) {} } ctx.fillRect(0,0,1,1); }' });
  await page.goto(`https://www.tradingview.com/chart/abc123/#tvskin=${code}`);
  await panel(page).getByRole('button', { name: 'Add & run in sandbox' }).click();
  const d = await waitFor(async () => { const x = await layerData(page); return x?.state === 'error' && x; }, { timeout: 12000, message: 'watchdog error' });
  assert.equal(d.state, 'error');
  // The TradingView page itself stayed responsive.
  assert.equal(await page.evaluate(() => 1 + 1), 2);
});

await check('throwing skin reports an error instead of breaking the page', async () => {
  const code = await encodeSkin({ name: 'Thrower', kind: 'canvas', code: 'function draw(){ throw new Error("boom"); }' });
  await page.goto(`https://www.tradingview.com/chart/abc123/#tvskin=${code}`);
  await panel(page).getByRole('button', { name: 'Add & run in sandbox' }).click();
  await waitFor(async () => (await layerData(page))?.state === 'error', { message: 'error state' });
  const p = await skinsView('library');
  assert.match(await p.locator('.note.err').first().textContent(), /boom/);
  await p.locator('.card[data-skin="aurora"]').click();
  await waitFor(async () => (await layerData(page))?.state === 'running', { message: 'recovered with aurora' });
});

console.log('\nTemplates');
await check('fetch lists themes and drawing templates from the account', async () => {
  const p = await openPanel(page, 'templates');
  await p.getByRole('button', { name: 'Fetch from TradingView' }).click();
  await waitFor(async () => /Fetched 2 themes and 3 drawing templates/.test(await p.locator('.note').first().textContent()), { message: 'fetch message' });
  assert.equal(await p.locator('.list label').count(), 5);
  assert.ok(backend.log.filter((l) => l.startsWith('GET /drawing-templates/')).length === 52, 'all 52 tool types queried');
});

await check('export writes a victornpb/vngbh-compatible backup file', async () => {
  const p = panel(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), p.getByRole('button', { name: 'Export selected…' }).click()]);
  const file = path.join(OUT, 'backup.json');
  await dl.saveAs(file);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(data._ && data._.DATE);
  assert.deepEqual(Object.keys(data.THEMES).sort(), ['My Dark', 'Paper']);
  assert.equal(data.TOOLS.LineToolTrendLine['Blue thick'].linewidth, 3);
  assert.match(dl.suggestedFilename(), /^TradingView .*\.backup\.json$/);
});

await check('snapshot, diff against live, and restore with rename strategy', async () => {
  const p = panel(page);
  await p.getByRole('button', { name: 'Snapshot now' }).click();
  await waitFor(async () => /Snapshot saved \(5 items\)/.test(await p.locator('.note').first().textContent()), { message: 'snapshot saved' });
  // Change the live account behind TVSuite's back.
  backend.TOOLS.LineToolTrendLine['Blue thick'].linewidth = 1;
  delete backend.THEMES.Paper;
  await p.getByRole('button', { name: 'Load' }).first().click();
  await p.getByRole('button', { name: 'Compare with live' }).click();
  await waitFor(async () => /2 differences vs live/.test(await p.locator('.note').first().textContent()), { message: 'diff result' });
  assert.equal(await p.locator('.list .chip').count(), 2, 'changed + added badges');
  await p.locator('select').first().selectOption('rename');
  await p.getByRole('button', { name: 'Restore to TradingView…' }).click();
  // Summary grid renders as separate label/value cells (regression: run-on text).
  assert.equal(await p.locator('.modal .kv > span').count(), 12);
  await p.getByRole('button', { name: /Write 2 items/ }).click();
  await waitFor(async () => /Restored 2 items/.test(await p.locator('.note').first().textContent()), { message: 'restored' });
  assert.deepEqual(backend.THEMES.Paper, { 'paneProperties.background': '#ffffff' }, 'missing theme restored under its name');
  assert.equal(backend.TOOLS.LineToolTrendLine['Blue thick (restored)'].linewidth, 3, 'conflict saved under a new name');
  assert.equal(backend.TOOLS.LineToolTrendLine['Blue thick'].linewidth, 1, 'existing template not overwritten');
});

await check('import a backup file and restore it (skip strategy)', async () => {
  const file = path.join(OUT, 'import.json');
  writeFileSync(file, JSON.stringify({ _: { USER: 'friend' }, THEMES: {}, TOOLS: { LineToolRectangle: { 'Supply zone': { color: '#f00' } }, LineToolTrendLine: { 'Red dashed': { linecolor: '#000' } } } }));
  const p = panel(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), p.getByRole('button', { name: 'Import file…' }).click()]);
  await chooser.setFiles(file);
  await waitFor(async () => /Loaded 2 items/.test(await p.locator('.note').first().textContent()), { message: 'import loaded' });
  await p.locator('select').first().selectOption('skip');
  await p.getByRole('button', { name: 'Restore to TradingView…' }).click();
  await p.getByRole('button', { name: /Write 1 items/ }).click();
  await waitFor(async () => /Restored 1 items/.test(await p.locator('.note').first().textContent()), { message: 'restored' });
  assert.deepEqual(backend.TOOLS.LineToolRectangle['Supply zone'], { color: '#f00' });
  assert.equal(backend.TOOLS.LineToolTrendLine['Red dashed'].linecolor, '#f23645', 'existing kept with skip');
});

await check('factory reset needs typed confirmation, snapshots first, then deletes everything', async () => {
  const p = panel(page);
  await p.getByRole('button', { name: /Factory reset/ }).click();
  await p.locator('.modal input').fill('nope');
  await p.getByRole('button', { name: 'Confirm' }).click();
  await waitFor(async () => /cancelled/.test(await p.locator('.note').first().textContent()), { message: 'cancel' });
  assert.ok(Object.keys(backend.THEMES).length > 0);
  await p.getByRole('button', { name: /Factory reset/ }).click();
  await p.locator('.modal input').fill('DELETE');
  await p.getByRole('button', { name: 'Confirm' }).click();
  await waitFor(async () => /Deleted \d+ items/.test(await p.locator('.note').first().textContent()), { timeout: 15000, message: 'reset done' });
  assert.equal(Object.keys(backend.THEMES).length, 0);
  assert.equal(Object.keys(backend.TOOLS).length, 0);
  assert.ok(await p.getByText('before factory reset').count() >= 1, 'safety snapshot listed');
  await page.screenshot({ path: path.join(OUT, '04-templates.png') });
});

console.log('\nSessions & tools');
await check('sessions tab shows the clock and HUD; position-size calculator computes', async () => {
  let p = await openPanel(page, 'sessions');
  assert.ok(await p.getByText('New York', { exact: true }).count() >= 1);
  assert.match(await page.locator('#tvsuite-hud-host .hud').textContent(), /(opens|closes) in/);
  p = await openPanel(page, 'tools');
  const inputs = p.locator('input[type=number]');
  await inputs.nth(0).fill('25000'); await inputs.nth(1).fill('1'); await inputs.nth(2).fill('100'); await inputs.nth(3).fill('98');
  await waitFor(async () => /125 shares/.test(await p.locator('.big').textContent()), { message: '125 shares' });
  await page.screenshot({ path: path.join(OUT, '05-tools.png') });
});

await check('focus mode hides TradingView chrome (Alt+Shift+F)', async () => {
  await panel(page).locator('.x').click();
  await page.mouse.click(700, 450);
  await page.keyboard.press('Alt+Shift+F');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.layout__area--left')).display), 'none');
  await page.keyboard.press('Alt+Shift+F');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.layout__area--left')).display), 'none');
});

await check('popup off→on toggle is applied in the tab (no echo suppression of real changes)', async () => {
  const pop = await context.newPage();
  await pop.goto(`chrome-extension://${extensionId}/popup.html`);
  await pop.waitForSelector('#skin option', { state: 'attached' });
  await pop.locator('#enabled').uncheck();
  await waitFor(async () => (await layerData(page))?.display === 'none', { message: 'off' });
  await pop.locator('#enabled').check();
  await waitFor(async () => (await layerData(page))?.display === 'block', { message: 'back on' });
  await pop.close();
});

await check('popup reflects settings and toggles the skin in the open tab', async () => {
  const pop = await context.newPage();
  await pop.goto(`chrome-extension://${extensionId}/popup.html`);
  await pop.waitForSelector('#skin option', { state: 'attached' });
  assert.ok(await pop.locator('#enabled').isChecked());
  await pop.locator('#enabled').uncheck();
  await waitFor(async () => (await layerData(page))?.display === 'none', { message: 'popup disabled skin' });
  await pop.locator('#skin').selectOption('synthwave');
  await waitFor(async () => (await layerData(page))?.display === 'block', { message: 'popup re-enabled skin' });
  await pop.close();
});

await check('options page renders the AI provider form with the default model', async () => {
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extensionId}/options.html`);
  assert.equal(await opt.locator('#model').inputValue(), 'claude-opus-5-5');
  await opt.locator('#testAi').click();
  await opt.waitForFunction(() => /API key/.test(document.getElementById('aiStatus').textContent));
  await opt.screenshot({ path: path.join(OUT, '06-options.png'), fullPage: true });
  await opt.close();
});

await check('my media: an uploaded image becomes a skin via the extension media frame', async () => {
  const { png } = await import('../../scripts/icons.mjs');
  const file = path.join(OUT, 'magenta.png');
  writeFileSync(file, png(64, () => [255, 0, 255, 255]));
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extensionId}/options.html#media`);
  await opt.locator('#mediaFile').setInputFiles(file);
  await opt.getByRole('button', { name: 'Use as skin' }).first().click();
  await opt.waitForFunction(() => /now your skin/.test(document.getElementById('mediaStatus').textContent));
  await opt.close();
  const d = await waitFor(async () => { const x = await layerData(page); return x?.state === 'running' && x?.skin?.startsWith('media-') && x; }, { timeout: 10000, message: 'media skin running' });
  assert.ok(d);
  await sleep(1200);
  const st = await regionStats(page, CLIP);
  assert.ok(st.r > 100 && st.b > 100 && st.g < 60, `expected magenta under candles, got ${JSON.stringify(st)}`);
  await page.screenshot({ path: path.join(OUT, '09-media-skin.png') });
  // Switching back to a code skin swaps to the sandbox frame again.
  const p = await skinsView('library');
  await p.locator('.card[data-skin="plexus"]').click();
  await waitFor(async () => { const x = await layerData(page); return x?.skin === 'plexus' && x?.state === 'running'; }, { message: 'back to sandbox skin' });
  await p.locator('.x').click();
});

await check('gallery adds a community skin that renders within budget', async () => {
  const p = await skinsView('library');
  await p.getByRole('button', { name: 'Gallery' }).click();
  await p.locator('.modal .grid > .row', { hasText: 'Topo Lines' }).getByRole('button', { name: /Add|Use/ }).click();
  const d = await waitFor(async () => { const x = await layerData(page); return x?.skin === 'topo-lines' && x?.state === 'running' && x; }, { timeout: 10000, message: 'gallery skin running' });
  assert.ok(d);
  await sleep(2500);
  const st = await page.evaluate(() => document.getElementById('tvsuite-skin-layer').dataset);
  await p.locator('.x').click();
  await page.screenshot({ path: path.join(OUT, '10-gallery-topo.png') });
  // fps here is bounded by the GPU-less headless rasterizer; the skin's own JS cost is what we control.
  assert.ok(+st.frameMs < 8, `JS frame cost within budget (${st.frameMs} ms)`);
});

await check('per-symbol skin overrides the default and follows symbol changes', async () => {
  let p = await skinsView('library');
  await p.locator('.card[data-skin="embers"]').click();
  await waitFor(async () => (await layerData(page))?.skin === 'embers', { message: 'embers active' });
  p = await skinsView('smart');
  await p.getByRole('button', { name: /Use current skin on BTCUSD/ }).click();
  p = await skinsView('library');
  await p.locator('.card[data-skin="aurora"]').click();
  await waitFor(async () => (await layerData(page))?.skin === 'embers', { message: 'BTCUSD stays pinned to embers' });
  await page.evaluate(() => window.mockTV.setSymbol('ETHUSD'));
  await waitFor(async () => (await layerData(page))?.skin === 'aurora', { timeout: 6000, message: 'ETHUSD uses the default skin' });
  await page.evaluate(() => window.mockTV.setSymbol('BTCUSD'));
  await waitFor(async () => (await layerData(page))?.skin === 'embers', { timeout: 6000, message: 'back to pinned skin' });
  p = await skinsView('smart');
  await p.getByRole('button', { name: 'Unpin' }).click();
  await waitFor(async () => (await layerData(page))?.skin === 'aurora', { message: 'unpinned' });
  await p.locator('.x').click();
});

await check('rotation shows a selected playlist skin, and the selected skin returns when rotation is off', async () => {
  const p = await skinsView('smart');
  await p.getByText('Rotate through selected skins').click();
  await p.locator('.sec', { hasText: 'Rotation' }).locator('label', { hasText: 'Plasma (shader)' }).locator('input').check();
  await waitFor(async () => (await layerData(page))?.skin === 'plasma', { timeout: 8000, message: 'rotation picks plasma' });
  await p.getByText('Rotate through selected skins').click();
  await waitFor(async () => (await layerData(page))?.skin === 'aurora', { timeout: 8000, message: 'back to selected skin' });
  await p.locator('.x').click();
});

await check('stream mode (Alt+Shift+H) hides all TVSuite UI but keeps the skin', async () => {
  await page.mouse.click(700, 450);
  await page.keyboard.press('Alt+Shift+H');
  assert.equal(await page.evaluate(() => document.getElementById('tvsuite-panel-host').style.display), 'none');
  assert.equal(await page.evaluate(() => document.getElementById('tvsuite-hud-host').style.display), 'none');
  assert.equal((await layerData(page)).display, 'block');
  await page.keyboard.press('Alt+Shift+H');
  assert.equal(await page.evaluate(() => document.getElementById('tvsuite-panel-host').style.display), '');
});

await check('journal: Alt+Shift+J captures a clean chart image with context; journal page shows stats and exports CSV', async () => {
  await page.mouse.click(700, 450);
  await page.keyboard.press('Alt+Shift+J');
  const p = panel(page);
  const modal = p.locator('.modal-bg[data-journal] .modal');
  await modal.waitFor();
  const src = await modal.locator('img').getAttribute('src');
  assert.match(src, /^data:image\/jpeg;base64,/);
  // The capture must show the chart, not the skin: mostly the dark chart background.
  const bgShare = await page.evaluate(async (dataUrl) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data; let bg = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 19) < 12 && Math.abs(d[i + 1] - 23) < 12 && Math.abs(d[i + 2] - 34) < 12) bg++;
    return bg / (d.length / 4);
  }, src);
  assert.ok(bgShare > 0.5, `capture is mostly chart background (${bgShare.toFixed(2)})`);
  await modal.locator('select').selectOption('long');
  await modal.locator('input[type=text]').fill('#breakout a-plus');
  await modal.locator('textarea').fill('Opening drive, took the retest.');
  await modal.getByRole('button', { name: 'Save' }).click();
  await p.getByText('Saved to journal').waitFor();
  const j = await context.newPage();
  await j.goto(`chrome-extension://${extensionId}/journal.html`);
  await j.locator('.entry').first().waitFor();
  assert.equal(await j.locator('.entry').count(), 1);
  assert.match(await j.locator('.entry').first().textContent(), /BTCUSD/);
  await j.locator('.entry input[type=number]').fill('2.5');
  await j.locator('.entry input[type=number]').press('Enter');
  await j.locator('.entry input[type=number]').blur();
  await j.waitForFunction(() => /\+2\.50R/.test(document.getElementById('stats').textContent));
  const [dl] = await Promise.all([j.waitForEvent('download'), j.locator('#csv').click()]);
  const file = path.join(OUT, 'journal.csv'); await dl.saveAs(file);
  const csv = readFileSync(file, 'utf8');
  assert.match(csv, /BTCUSD/);
  assert.match(csv, /breakout a-plus/);
  assert.match(csv, /,2\.5,/);
  await j.screenshot({ path: path.join(OUT, '11-journal.png'), fullPage: true });
  await j.close();
});

console.log('\nSound');
const audio = () => page.evaluate(() => { const h = document.getElementById('tvsuite-audio-host'); return h ? { ...h.dataset } : null; });
const soundFrame = () => page.frames().find((f) => f.url().includes('/sound.html'));
await check('sound tab: turning Sound on mounts the extension audio frame', async () => {
  const p = await openPanel(page, 'sound');
  assert.equal(await audio(), null, 'no audio frame while Sound is off');
  await p.locator('input[data-sound-power]').check();
  await waitFor(async () => (await audio())?.state === 'on' && soundFrame(), { message: 'audio frame' });
  await p.locator('.row[data-event="tradeEntry"]').waitFor();
  assert.ok(await p.locator('.row[data-event]').count() >= 12, 'every event has a row');
});
await check('audio engine renders every synth and ambient bed as non-silent audio', async () => {
  const res = await soundFrame().evaluate(() => globalThis.__tvsSoundSelfTest());
  const silent = Object.entries(res).filter(([, v]) => !(v.peak > 0.01)).map(([k]) => k);
  assert.deepEqual(silent, [], `silent sounds: ${silent.join(', ')}`);
  assert.ok(Object.keys(res).length >= 21, `tested ${Object.keys(res).length}`);
});
await check('event test button plays through the audio frame', async () => {
  const p = await openPanel(page, 'sound');
  const before = +(await audio()).played;
  await p.locator('button[data-test="tradeEntry"]').click();
  await waitFor(async () => +(await audio()).played > before, { message: 'played count' });
  assert.equal((await audio()).last, 'tradeEntry');
  assert.equal((await audio()).error, '');
});
await check('TradingView order toast is detected as a trade entry, then an exit', async () => {
  await page.locator('#tvsuite-panel-host .x').click();
  let n = +(await audio()).played;
  await page.evaluate(() => window.mockTV.toast('Order filled: Buy 1 BTCUSD at 63,512.00'));
  await waitFor(async () => { const a = await audio(); return +a.played > n && a.last === 'tradeEntry'; }, { message: 'entry sound' });
  n = +(await audio()).played;
  await page.evaluate(() => window.mockTV.toast('Position closed: BTCUSD +120.00 USD'));
  await waitFor(async () => { const a = await audio(); return +a.played > n && a.last === 'tradeExit'; }, { message: 'exit sound' });
});
await check('manual hotkeys Alt+Shift+E / Alt+Shift+M fire and mute', async () => {
  await page.mouse.click(500, 400);
  let n = +(await audio()).played;
  await page.keyboard.press('Alt+Shift+E');
  await waitFor(async () => +(await audio()).played > n, { message: 'hotkey entry' });
  await page.keyboard.press('Alt+Shift+M');
  n = +(await audio()).played;
  await page.keyboard.press('Alt+Shift+X');
  await sleep(700);
  assert.equal(+(await audio()).played, n, 'muted: nothing plays');
  await page.keyboard.press('Alt+Shift+M');
});
await check('local price alert fires once when price crosses the level, then disarms', async () => {
  const p = await openPanel(page, 'sound');
  const alerts = p.locator('.sec', { hasText: 'Price alerts' });
  const px = await page.evaluate(() => window.mockTV.price());
  const level = Math.round(px + 500);
  await alerts.locator('input[type=number]').fill(String(level));
  await alerts.locator('.seg button[data-value="up"]').click();
  await alerts.getByRole('button', { name: 'Add' }).click();
  await alerts.locator('[data-alert]').waitFor();
  await page.evaluate(() => window.mockTV.setVolatility(0));
  await sleep(700);
  const n = +(await audio()).played;
  await page.evaluate((l) => window.mockTV.setPrice(l + 10), level);
  await waitFor(async () => { const a = await audio(); return +a.played > n && a.last === 'priceAlert'; }, { message: 'price alert sound' });
  await waitFor(async () => (await alerts.locator('[data-alert]').textContent()).includes('Re-arm'), { message: 'alert disarmed' });
  await page.evaluate(() => window.mockTV.setVolatility(1));
});
await check('ambient bed: generated rain runs in the audio frame and switches off', async () => {
  const p = await openPanel(page, 'sound');
  await p.locator('button[data-ambient="gen:rain"]').click();
  await waitFor(() => soundFrame().evaluate(() => !!document.querySelector('body') && globalThis.__tvsAmbient?.() === 'gen:rain'), { message: 'ambient on' });
  await p.locator('button[data-ambient="none"]').click();
  await waitFor(() => soundFrame().evaluate(() => globalThis.__tvsAmbient?.() === null), { message: 'ambient off' });
  assert.equal((await audio()).error, '');
});
await check('my sounds: an uploaded audio file can be assigned to an event and plays', async () => {
  const p = await openPanel(page, 'sound');
  const zone = p.locator('.sec', { hasText: 'My sounds' }).locator('iframe');
  const frame = await (await zone.elementHandle()).contentFrame();
  await frame.locator('input[type=file]').setInputFiles({ name: 'bell.wav', mimeType: 'audio/wav', buffer: wav() });
  await p.locator('.sec', { hasText: 'My sounds · 1' }).waitFor();
  const row = p.locator('.row[data-event="tradeExit"]');
  const val = await row.locator('select').evaluate((s) => [...s.options].find((o) => o.value.startsWith('lib:')).value);
  await row.locator('select').selectOption(val);
  const n = +(await audio()).played;
  await p.locator('button[data-test="tradeExit"]').click();
  await waitFor(async () => +(await audio()).played > n, { message: 'custom sound played' });
  assert.equal((await audio()).error, '');
  await p.locator('input[data-sound-power]').uncheck();
  await waitFor(async () => (await audio()) === null, { message: 'audio frame removed' });
});
function wav() { // 0.3 s 880 Hz PCM tone
  const sr = 8000, n = sr * 0.3, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 880 * i) / sr) * 12000), 44 + i * 2);
  return b;
}

console.log('\nPlatform Bridge');
await check('bridge translates the chart symbol and any typed symbol for every platform', async () => {
  const p = await openPanel(page, 'bridge');
  const input = p.locator('input[data-bridge-input]');
  await waitFor(async () => (await input.inputValue()).length > 0, { message: 'chart symbol prefilled' });
  await input.fill('ES 12-26');
  const val = (id) => p.locator(`.row[data-platform="${id}"] code`).textContent();
  assert.equal(await val('tradingview'), 'CME_MINI:ESZ2026');
  assert.equal(await val('tradovate'), 'ESZ6');
  assert.equal(await val('projectx'), 'CON.F.US.EP.Z26');
  assert.equal(await val('thinkorswim'), '/ESZ26');
  assert.match(await p.locator('[data-bridge-label]').textContent(), /E-mini S&P 500 · Dec 2026/);
  await input.fill('NASDAQ:AAPL');
  assert.ok(await p.locator('button[data-open="finviz"]').isVisible());
});
await check('bridge watchlist converter: TradingView sections → NinjaTrader, skipped items reported', async () => {
  const p = await openPanel(page, 'bridge');
  await p.locator('textarea[data-wl-in]').fill('###FUT,CME_MINI:ESZ2026,CME_MINI:NQZ2026,###CRYPTO,BINANCE:BTCUSDT');
  await p.locator('.sec', { hasText: 'Watchlist converter' }).locator('select').selectOption('ninjatrader');
  assert.equal(await p.locator('textarea[data-wl-out]').inputValue(), 'ES 12-26\nNQ 12-26');
  assert.match(await p.locator('.sec', { hasText: 'Watchlist converter' }).textContent(), /1 skipped: BINANCE:BTCUSDT/);
});
await check('linked tabs: a symbol seen on another platform tab opens on this chart', async () => {
  const [sw] = context.serviceWorkers();
  await sw.evaluate(() => chrome.storage.local.set({ 'bridge:seen': { 'topstepx.com': { symbol: 'CON.F.US.ENQ.Z26', at: Date.now(), url: 'https://topstepx.com/trade' } } }));
  const p = await openPanel(page, 'bridge');
  const row = p.locator('.row[data-linked="topstepx.com"]');
  await row.waitFor();
  const own = await sw.evaluate(() => chrome.storage.local.get('bridge:seen').then((x) => Object.keys(x['bridge:seen'])));
  await Promise.all([page.waitForURL(/symbol=CME_MINI%3ANQZ2026/), row.getByRole('button', { name: 'Open here' }).click()]);
  assert.ok(own.includes('topstepx.com'));
  await page.waitForLoadState('domcontentloaded');
  await waitFor(async () => (await layerData(page))?.state === 'running', { message: 'skin running after reload' });
  const seen = await waitFor(() => sw.evaluate(() => chrome.storage.local.get('bridge:seen').then((x) => x['bridge:seen']['www.tradingview.com'])), { message: 'this tab published its symbol' });
  assert.ok(seen.symbol);
});

await check('no uncaught TVSuite errors on the page', async () => {
  const relevant = pageErrors.filter((e) => !/boom|Hang|stopped responding/.test(e));
  assert.deepEqual(relevant, []);
});
await context.close();

console.log('\nDesktop / userscript bundle (no extension)');
await check('inject bundle runs in-page (desktop mode) with worker rendering', async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  await routeTradingView(ctx, makeBackend());
  await ctx.addInitScript({ content: readFileSync(path.join(ROOT, 'dist/tvsuite-inject.js'), 'utf8') });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('https://www.tradingview.com/chart/xyz/');
  const d = await waitFor(async () => { const x = await layerData(pg); return x?.state === 'running' && x; }, { message: 'desktop skin running' });
  assert.equal(d.transport, 'inline');
  await waitFor(() => pg.evaluate(() => (window.__tvsuiteClears || 0) > 5), { message: 'clears in desktop mode' });
  assert.equal(await pg.evaluate(() => window.__TVSUITE__.host), 'desktop');
  await pg.screenshot({ path: path.join(OUT, '07-desktop-inject.png') });
  assert.deepEqual(errs, []);
  await browser.close();
});

await check('desktop launcher attaches over CDP, injects, and survives a reload', async () => {
  const { spawn } = await import('node:child_process');
  const port = 9339;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await routeTradingView(ctx, makeBackend());
  const pg = await ctx.newPage();
  await pg.goto('https://www.tradingview.com/chart/desk/');
  const proc = spawn(process.execPath, [path.join(ROOT, 'desktop/launcher.mjs'), 'attach', '--port', String(port), '--verbose'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  try {
    await waitFor(() => pg.evaluate(() => !!window.__TVSUITE__), { timeout: 15000, message: `launcher injection (${out})` });
    assert.equal(await pg.evaluate(() => window.__TVSUITE__.host), 'desktop');
    await waitFor(async () => (await layerData(pg))?.state === 'running', { message: 'skin running after launcher injection' });
    await pg.reload();
    await waitFor(() => pg.evaluate(() => !!window.__TVSUITE__ && (window.__tvsuiteClears || 0) > 0), { timeout: 15000, message: 're-injected after reload' });
    assert.match(out, /TVSuite active in chart window/);
    await pg.screenshot({ path: path.join(OUT, '08-desktop-launcher.png') });
  } finally { proc.kill(); await browser.close(); }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results.map(({ name, ok, ms, err }) => ({ name, ok, ms, err: err ? String(err.message || err) : undefined })), null, 2));
process.exit(failed.length ? 1 : 0);
