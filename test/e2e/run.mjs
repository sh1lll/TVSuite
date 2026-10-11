// End-to-end suite: the built MV3 extension in real Chromium against the mock TradingView chart page.
// Run: npm run e2e   (screenshots land in test/e2e/out/)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { launchWithExtension, routeTradingView, makeBackend, panel, ROOT, CHROME } from './harness.mjs';
import { encodeSkin } from '../../src/modules/skins/packs.js';
import { startMockServices } from './mock-services.mjs';

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
const { context, extensionId } = await launchWithExtension({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
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
  assert.match(await page.locator('#tvsuite-hud-host .hud:not([data-sound-flash])').textContent(), /(opens|closes) in/);
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
  assert.equal(await opt.locator('#notifyOn').isChecked(), false, 'notifications off until the user grants the optional permission');
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
  await j.locator('.entry input[placeholder="Result R"]').fill('2.5');
  await j.locator('.entry input[placeholder="Result R"]').press('Enter');
  await j.locator('.entry input[placeholder="Result R"]').blur();
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
  assert.match(await page.locator('#tvsuite-hud-host [data-sound-flash]').textContent(), /Trade entered/, 'visual flash shows what played');
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
  await p.locator('.subnav button[data-value="watchlists"]').first().click();
  await p.locator('textarea[data-wl-in]').fill('###FUT,CME_MINI:ESZ2026,CME_MINI:NQZ2026,###CRYPTO,BINANCE:BTCUSDT');
  await p.locator('.sec', { hasText: 'Watchlist converter' }).locator('select').selectOption('ninjatrader');
  assert.equal(await p.locator('textarea[data-wl-out]').inputValue(), 'ES 12-26\nNQ 12-26');
  assert.match(await p.locator('.sec', { hasText: 'Watchlist converter' }).textContent(), /1 skipped: BINANCE:BTCUSDT/);
});
await check('indicators: Python/JavaScript/Java examples translate to Pine v6; errors point at the line', async () => {
  const p = await openPanel(page, 'bridge');
  await p.locator('.subnav button[data-value="code"]').first().click();
  for (const k of ['python', 'js', 'java']) {
    await p.locator(`button[data-example="${k}"]`).click();
    const pine = await p.locator('textarea[data-ind-out]').inputValue();
    assert.match(pine, /^\/\/@version=6\n/, k);
    assert.match(pine, /^indicator\(/m, k);
  }
  await p.locator('textarea[data-ind-src]').fill('x = 0\nwhile x < 3:\n    x = x + 1');
  await p.locator('button[data-translate]').click();
  assert.match(await p.locator('[data-ind-status]').textContent(), /Line 2: Loops aren’t translated/);
  await p.locator('.subnav button[data-value="symbols"]').first().click();
});
// The real Monaco editor, served for the Pine Editor stand-in on the mock page.
const MONACO = path.join(ROOT, 'node_modules/monaco-editor/min');
await context.route('https://www.tradingview.com/test-monaco/**', (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace('/test-monaco/', ''));
  const file = path.join(MONACO, rel);
  if (!file.startsWith(MONACO)) return route.fulfill({ status: 403 });
  try { return route.fulfill({ status: 200, contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: readFileSync(file) }); }
  catch (_) { return route.fulfill({ status: 404 }); }
});
for (const editContext of [false, true]) {
  await check(`indicators: Send to Pine Editor opens it, replaces the script in real Monaco${editContext ? ' (EditContext mode)' : ''} and adds it to the chart`, async () => {
    await page.reload();
    await page.waitForFunction(() => !!window.mockTV);
    await page.evaluate((ec) => { window.mockTV.pine.editContext = ec; }, editContext);
    const p = await openPanel(page, 'bridge');
    await p.locator('.subnav button[data-value="code"]').first().click();
    await p.locator('button[data-example="js"]').click();
    const pine = await p.locator('textarea[data-ind-out]').inputValue();
    await p.locator('button[data-send-pine-add]').click();
    await waitFor(() => page.evaluate(() => window.mockTV.pine.ready === true), { message: 'Pine Editor opened by TVSuite', timeout: 15000 });
    await waitFor(() => page.evaluate(() => window.mockTV.pine.added), { message: 'Add to chart clicked', timeout: 10000 }).catch(async (e) => { throw new Error(`${e.message}; status: ${await p.locator('[data-ind-status]').textContent()}; editor: ${JSON.stringify((await page.evaluate(() => window.mockTV.pine.value())).slice(0, 160))}; lines: ${await page.evaluate(() => [...document.querySelectorAll('#mock-pine .line-numbers')].map((n) => n.textContent).join(','))}`); });
    assert.equal(await page.evaluate(() => typeof window.monaco), 'undefined', 'no Monaco global (like TradingView)');
    const got = (await page.evaluate(() => window.mockTV.pine.value())).trim();
    if (got !== pine.trim()) { const a = got.split('\n'), b = pine.trim().split('\n'); const i = a.findIndex((l, k) => l !== b[k]); throw new Error(`editor differs at line ${i + 1}: got ${JSON.stringify(a[i])} want ${JSON.stringify(b[i])} (lines ${a.length} vs ${b.length})`); }
    assert.equal((await page.evaluate(() => window.mockTV.pine.added)).trim(), pine.trim());
    assert.match(await p.locator('[data-ind-status]').textContent(), /In the Pine Editor \((pasted|typed), added to chart\)/);
  });
}
await check('linked tabs: a symbol seen on another platform tab opens on this chart', async () => {
  const [sw] = context.serviceWorkers();
  await sw.evaluate(() => chrome.storage.local.set({ 'bridge:seen': { 'topstepx.com': { symbol: 'CON.F.US.ENQ.Z26', at: Date.now(), url: 'https://topstepx.com/trade' } } }));
  const p = await openPanel(page, 'bridge');
  const row = p.locator('.row[data-linked="topstepx.com"]');
  await row.waitFor();
  const own = await sw.evaluate(() => chrome.storage.local.get('bridge:seen').then((x) => Object.keys(x['bridge:seen'])));
  await row.getByRole('button', { name: 'Open here' }).click();
  assert.ok(own.includes('topstepx.com'));
  // TradingView's chart API switches the symbol in place (no reload).
  await waitFor(async () => (await page.locator('[data-name="legend-source-title"]').textContent()) === 'NQZ2026', { message: 'chart switched to NQZ2026' });
  await waitFor(() => sw.evaluate(() => chrome.storage.local.get('bridge:seen').then((x) => x['bridge:seen']['www.tradingview.com']?.symbol === 'NQZ2026')), { message: 'this tab published its new symbol' });
});

console.log('\nRisk Guard');
const riskTab = async (v) => { const p = await openPanel(page, 'risk'); if (v) await p.locator(`.subnav button[data-value="${v}"]`).first().click(); return p; };
const numRow = (p, label) => p.locator('.row', { hasText: label }).locator('input[type=number]').first();
await check('risk guard: set up PDLL/PDPT like a broker, add trades, warn at 80%', async () => {
  let p = await riskTab('today');
  await p.locator('button[data-risk-setup]').click();
  await p.locator('label.switch', { hasText: 'Risk Guard' }).click();
  for (const [label, v] of [['Starting balance', '50000'], ['Personal Daily Loss Limit', '500'], ['Personal Daily Profit Target', '1000']]) { await numRow(p, label).fill(v); await numRow(p, label).press('Tab'); }
  p = await riskTab('today');
  const pnl = p.locator('input[data-pnl-input]');
  await pnl.fill('-300'); await pnl.press('Enter');
  await waitFor(async () => (await p.locator('[data-risk-status]').getAttribute('data-risk-status')) === 'ok', { message: 'ok status' });
  await pnl.fill('-150'); await pnl.press('Enter');
  await waitFor(async () => (await p.locator('[data-risk-status]').getAttribute('data-risk-status')) === 'warn', { message: 'warn status' });
  assert.match(await p.locator('[data-alert="pdll"]').textContent(), /90% of your personal daily loss limit/);
  assert.equal(await p.locator('[data-day-pnl]').getAttribute('data-day-pnl'), '-450');
  await waitFor(() => page.evaluate(() => document.querySelector('#tvsuite-hud-host')?.shadowRoot.querySelector('[data-hud-risk]')?.dataset.hudRisk === 'warn'), { message: 'HUD shows warning' });
});
await check('risk guard: hitting the PDLL blocks the chart until reset; rules lock; typed override unlocks', async () => {
  const p = await riskTab('today');
  const pnl = p.locator('input[data-pnl-input]');
  await pnl.fill('-75'); await pnl.press('Enter');
  const block = page.locator('#tvsuite-block-host');
  await block.waitFor({ timeout: 5000 });
  assert.match(await block.locator('[data-block-reasons]').textContent(), /Personal daily loss limit hit: −\$525/);
  // Clicks on the chart are swallowed by the overlay.
  const before = await page.evaluate(() => window.__chartClicks = 0);
  await page.evaluate(() => document.querySelector('.chart-markup-table').addEventListener('click', () => window.__chartClicks++));
  await page.mouse.click(700, 400);
  assert.equal(await page.evaluate(() => window.__chartClicks), before);
  await (await riskTab('rules')).locator('[data-rules-locked]').waitFor();
  await page.locator('#tvsuite-panel-host .x').click();
  await block.getByRole('button', { name: 'Override…' }).click();
  await block.locator('input[data-override-input]').fill('I accept the risk');
  assert.ok(await block.getByRole('button', { name: /Wait \d+s/ }).isDisabled());
  await sleep(30500);
  assert.equal(await block.locator('input[data-override-input]').inputValue(), 'I accept the risk', 'typing survives the countdown');
  await waitFor(async () => (await block.getByRole('button', { name: 'Unlock for today' }).count()) > 0, { message: 'unlock enabled', timeout: 4000 });
  await block.getByRole('button', { name: 'Unlock for today' }).click();
  await waitFor(async () => (await block.count()) === 0, { message: 'overlay removed after override' });
});
await check('risk guard: reads P&L from the screen via the element picker', async () => {
  let p = await riskTab('today');
  page.once('dialog', (d) => d.accept());
  await p.getByRole('button', { name: 'Reset today' }).click();
  await waitFor(async () => (await p.locator('[data-day-pnl]').getAttribute('data-day-pnl')) === '0', { message: 'day reset' });
  p = await riskTab('rules');
  await p.locator('.seg button', { hasText: 'Read from screen' }).click();
  await p.locator('button[data-pick="realized"]').click();
  await page.locator('[data-field=realized]').click();
  p = await riskTab('rules');
  const sel = await p.locator('.sec', { hasText: 'P&L source' }).locator('code').textContent();
  assert.ok(sel.length > 3, `selector ${sel}`);
  await page.evaluate(() => window.mockTV.setPnl('-$120.00'));
  p = await riskTab('today');
  await waitFor(async () => (await p.locator('[data-day-pnl]').getAttribute('data-day-pnl')) === '-120', { message: 'screen P&L read' });
  await page.evaluate(() => window.mockTV.setPnl('-$650.00'));
  // Today was reset (fired alerts cleared) but the override for the PDLL stands, so: breach shown, no new block.
  await waitFor(async () => (await p.locator('[data-risk-status]').getAttribute('data-risk-status')) === 'breach', { message: 'breach from screen value' });
  // Back to manual for the following checks.
  p = await riskTab('rules');
});
await check('journal capture with a P&L adds the trade to Risk Guard', async () => {
  const [sw] = context.serviceWorkers();
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.risk.source = 'manual'; settings.risk.pdll = 0; delete settings._meta; await chrome.storage.local.set({ settings }); });
  await sleep(600);
  await page.mouse.click(640, 380);
  await page.keyboard.press('Alt+Shift+J');
  const m = panel(page).locator('.modal-bg[data-journal] .modal');
  await m.waitFor();
  await m.locator('input[data-journal-pnl]').fill('275');
  await m.getByRole('button', { name: 'Save' }).click();
  await waitFor(() => sw.evaluate(() => chrome.storage.local.get('risk:state').then((x) => x['risk:state'].trades.some((t) => t.pnl === 275 && t.journalId))), { message: 'trade from journal' });
  const p = await riskTab('journal');
  await waitFor(async () => /\+\$275/.test(await p.locator('.list').first().textContent().catch(() => '')), { message: 'journal list in Risk tab' });
});
await check('chart time counts active time on the chart', async () => {
  await page.bringToFront();
  for (let i = 0; i < 4; i++) { await page.mouse.move(300 + i * 20, 300); await sleep(1600); }
  const p = await riskTab('time');
  await waitFor(async () => +(await p.locator('[data-chart-time]').getAttribute('data-chart-time')) >= 5, { message: 'chart time > 0', timeout: 12000 });
});

console.log('\nCapture & share');
const mock = await startMockServices();
const capTab = async (v) => { const p = await openPanel(page, 'capture'); if (v) await p.locator(`.subnav button[data-value="${v}"]`).first().click(); return p; };
const swk = () => context.serviceWorkers()[0];
await swk().evaluate((base) => chrome.storage.local.set({ 'share:secrets': {
  discord: { webhook: `${base}/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz0123` },
  telegram: { token: '123456789:AAEhBP0av28aZ7z-kVxIl1g3bW6jK9yDmQs', chatId: '4242', base },
} }), mock.base);
await check('screenshot card: 16:9 framed chart preview, sent to Discord as an attached PNG', async () => {
  const p = await capTab('card');
  const prev = p.locator('[data-card-preview]');
  await waitFor(async () => (await prev.getAttribute('data-w')) === '1600', { message: 'card rendered' });
  assert.equal(await prev.getAttribute('data-h'), '900');
  await p.locator('[data-theme="sunset"]').click();
  await p.locator('button[data-send="discord"]').click();
  const req = await waitFor(() => mock.requests.find((r) => r.url.startsWith('/api/webhooks/')), { message: 'discord request' });
  assert.match(req.headers['content-type'], /multipart\/form-data/);
  assert.match(req.text, /name="payload_json"/);
  assert.match(req.text, /name="files\[0\]"; filename="chart.png"\r\nContent-Type: image\/png/);
  assert.ok(req.size > 20000, `image attached (${req.size} bytes)`);
});
await check('recorder: a trade entry starts recording, the exit stops it, the clip is saved and sent to Telegram', async () => {
  // Turn on auto-recording with no post-roll, and auto-send recordings to Telegram.
  let p = await capTab('recorder');
  await p.locator('label.switch', { hasText: 'Record my trades' }).click();
  await p.locator('.row', { hasText: 'Keep recording' }).locator('input[type=range]').fill('0');
  p = await capTab('share');
  await p.locator('label.switch', { hasText: 'Send to Telegram' }).click();
  await p.locator('.sec', { hasText: 'Telegram' }).locator('label.switch', { hasText: 'Trade recordings' }).click();
  await page.locator('#tvsuite-panel-host .x').click();
  mock.requests.length = 0;
  await page.evaluate(() => window.mockTV.toast('Order filled: Buy 1 BTCUSD at 63,512.00'));
  p = await capTab('recorder');
  await waitFor(async () => (await p.locator('[data-rec-state]').getAttribute('data-rec-state')) === 'on', { message: 'recording started' });
  await sleep(3000);
  await page.evaluate(() => window.mockTV.toast('Position closed: BTCUSD +120.00 USD'));
  const clip = await waitFor(() => swk().evaluate(() => new Promise((res) => {
    const r = indexedDB.open('tvsuite-recordings', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips', { keyPath: 'id' });
    r.onsuccess = () => { const db = r.result; const g = db.transaction('clips').objectStore('clips').getAll(); g.onsuccess = () => { db.close(); const c = g.result[0]; res(c ? { size: c.size, mime: c.mime, duration: c.duration, events: c.events.map((e) => e.type), name: c.name } : null); }; };
  })), { message: 'clip saved', timeout: 15000 });
  assert.ok(clip.size > 10000, `clip size ${clip.size}`);
  assert.match(clip.mime, /^video\/(mp4|webm)/);
  assert.ok(clip.duration >= 2.5, `duration ${clip.duration}`);
  assert.deepEqual(clip.events.slice(0, 2), ['tradeEntry', 'tradeExit']);
  const tg = await waitFor(() => mock.requests.find((r) => /\/send(Video|Document)$/.test(r.url)), { message: 'telegram upload', timeout: 15000 });
  assert.match(tg.text, /name="chat_id"\r\n\r\n4242/);
  assert.match(tg.text, /Content-Type: video\//);
  // The recordings page plays it back.
  const rp = await context.newPage();
  await rp.goto(`chrome-extension://${extensionId}/recordings.html`);
  const d = await waitFor(() => rp.evaluate(() => { const v = document.querySelector('.clip video'); return v && v.readyState >= 1 ? v.duration : 0; }), { message: 'video metadata' });
  assert.ok(d > 1 || d === Infinity, `playable duration ${d}`);
  await rp.close();
  await page.bringToFront();
  p = await capTab('recorder');
  await p.locator('label.switch', { hasText: 'Record my trades' }).click();
});

await check('session recap: card with today’s numbers from the Risk tab, sent to Discord', async () => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); Object.assign(settings.risk, { enabled: true, startBalance: 50000, source: 'manual' }); delete settings._meta; await chrome.storage.local.set({ settings }); });
  await sleep(800);
  let p = await openPanel(page, 'risk');
  await p.locator('.subnav button[data-value="today"]').first().click();
  for (const v of ['200', '-50']) { await p.locator('input[data-pnl-input]').fill(v); await p.locator('input[data-pnl-input]').press('Enter'); await sleep(300); }
  p = await openPanel(page, 'risk');
  await p.locator('button[data-make-recap]').click();
  const text = await waitFor(async () => (await p.locator('.modal [data-recap-text]').textContent().catch(() => '')) || null, { message: 'recap modal' });
  assert.match(text, /^Day \d{4}-\d{2}-\d{2}: [−+]?\$[\d,.]+ on \d+ trades? · \d+% wins/);
  const size = await p.locator('.modal img[data-recap-img]').evaluate((i) => [i.naturalWidth, i.naturalHeight]);
  assert.deepEqual(size, [1600, 900]);
  mock.requests.length = 0;
  await p.locator('.modal').getByRole('button', { name: 'Discord' }).click();
  const req = await waitFor(() => mock.requests.find((r) => r.url.startsWith('/api/webhooks/')), { message: 'recap to discord' });
  assert.match(req.text, /filename="recap\.png"/);
  assert.match(req.text, /Day recap/);
  await p.locator('.modal').getByRole('button', { name: 'Close' }).click();
});

console.log('\nMini windows');
async function miniDoc(kind) {
  // Document Picture-in-Picture window if the browser supports it here, otherwise the pop-up fallback.
  const viaPip = await page.evaluate((k) => globalThis.documentPictureInPicture?.window?.document.body.dataset.tvsMini === k, kind);
  if (viaPip) return { pip: true, read: (fn) => page.evaluate(`(${fn})(documentPictureInPicture.window.document)`) };
  const pop = context.pages().find((pg) => pg !== page && pg.url() === 'about:blank');
  if (!pop) return null;
  const k = await pop.evaluate(() => document.body.dataset.tvsMini).catch(() => null);
  return k === kind ? { pip: false, read: (fn) => pop.evaluate(`(${fn})(document)`) } : null;
}
await check('mini chart window mirrors the chart, price and session, and keeps updating', async () => {
  const p = await capTab('mini');
  await p.locator('button[data-mini-chart]').click();
  const w = await waitFor(() => miniDoc('chart'), { message: 'mini chart window' });
  console.log(`      (opened as ${w.pip ? 'Document Picture-in-Picture' : 'pop-up fallback'})`);
  const a = await w.read((d) => ({ frames: +d.body.dataset.frames, sym: d.querySelector('.sym').textContent, px: d.querySelector('.px').textContent, foot: d.querySelector('.foot').textContent }));
  assert.equal(a.sym, await page.locator('[data-name="legend-source-title"]').textContent(), 'mini window shows the chart symbol');
  assert.match(a.px, /\d/);
  assert.match(a.foot, /session|opens|closes/i);
  await sleep(1200);
  const b = await w.read((d) => ({ frames: +d.body.dataset.frames, ink: (() => { const c = d.querySelector('canvas'); const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < x.length; i += 400) if (x[i] + x[i + 1] + x[i + 2] > 60) n++; return n; })() }));
  assert.ok(b.frames > a.frames + 2, `repainting (${a.frames} → ${b.frames})`);
  assert.ok(b.ink > 50, 'chart pixels mirrored');
  await w.read((d) => d.defaultView.close());
});
await check('mini player plays an image from my media library in a floating window', async () => {
  // (Link playback is unit-tested: PiP windows bypass Playwright's request routing, so mocked URLs can't load there.)
  const p = await capTab('mini');
  const opts = await p.locator('.sec', { hasText: 'Player' }).locator('select option').allTextContents();
  assert.ok(opts.length && !/No media yet/.test(opts[0]), `library has media (${opts})`);
  await p.locator('.sec', { hasText: 'Player' }).getByRole('button', { name: 'Play', exact: true }).click();
  const w = await waitFor(() => miniDoc('player'), { message: 'player window' });
  await waitFor(() => w.read((d) => d.body.dataset.state === 'running'), { message: 'library media running in the player frame' });
  await w.read((d) => d.defaultView.close());
});

console.log('\nLights & voice');
await check('room lighting: devices get the session colour, a flash on a fill, and red on a risk breach', async () => {
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extensionId}/options.html#lights`);
  await opt.selectOption('#lightType', 'wled');
  await opt.fill('#lf-base', mock.base);
  await opt.click('#addLight');
  await opt.selectOption('#lightType', 'ha');
  await opt.fill('#lf-base', mock.base); await opt.fill('#lf-token', 'test-token'); await opt.fill('#lf-entities', 'light.desk');
  await opt.click('#addLight');
  await opt.waitForFunction(() => document.querySelectorAll('#lightDevices .site').length === 2);
  await opt.close();
  await page.bringToFront();
  mock.requests.length = 0;
  const p = await openPanel(page, 'sound');
  await p.locator('.subnav button[data-value="lights"]').first().click();
  await p.locator('label.switch', { hasText: 'Room lighting' }).click();
  // Base scene: session colour, or the fixed colour outside sessions.
  const wled = await waitFor(() => mock.requests.find((r) => r.url === '/json/state'), { message: 'WLED scene' });
  assert.equal(JSON.parse(wled.text).on, true);
  const ha = mock.requests.find((r) => r.url === '/api/services/light/turn_on');
  assert.equal(ha.headers.authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(ha.text).entity_id, ['light.desk']);
  mock.requests.length = 0;
  await page.evaluate(() => window.mockTV.toast('Order filled: Buy 1 BTCUSD at 63,512.00'));
  const flash = await waitFor(() => mock.requests.find((r) => r.url === '/json/state' && /"col":\[\[34,197,94\]\]/.test(r.text)), { message: 'green flash on entry' });
  assert.equal(JSON.parse(flash.text).transition, 0);
  // Risk breach holds red (Risk Guard was set up earlier; a big loss trips the daily limit).
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); Object.assign(settings.risk, { enabled: true, startBalance: 50000, pdll: 100, onLoss: 'warn', source: 'manual' }); delete settings._meta; await chrome.storage.local.set({ settings }); });
  await sleep(700);
  const rp = await openPanel(page, 'risk');
  await rp.locator('.subnav button[data-value="today"]').first().click();
  await rp.locator('input[data-pnl-input]').fill('-500'); await rp.locator('input[data-pnl-input]').press('Enter');
  await waitFor(() => mock.requests.find((r) => r.url === '/json/state' && /"col":\[\[242,54,69\]\]/.test(r.text)), { message: 'red on breach', timeout: 8000 });
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.risk.pdll = 0; settings.lights.enabled = false; delete settings._meta; await chrome.storage.local.set({ settings }); });
});
await check('voice/typed commands: switch symbol + interval via the chart API, log a trade, answer P&L', async () => {
  const p = await openPanel(page, 'sound');
  await p.locator('.subnav button[data-value="voice"]').first().click();
  const box = p.locator('input[data-command-box]');
  await box.fill('show N Q five minute'); await box.press('Enter');
  await waitFor(async () => (await page.locator('[data-name="legend-source-title"]').textContent()) === 'NQ1!', { message: 'symbol changed' });
  assert.equal(await page.evaluate(() => window.TradingViewApi.activeChart().resolution()), '5');
  await box.fill('log a loss of 120'); await box.press('Enter');
  const sw = context.serviceWorkers()[0];
  await waitFor(() => sw.evaluate(() => chrome.storage.local.get('risk:state').then((x) => x['risk:state'].trades.some((t) => t.pnl === -120))), { message: 'trade logged by voice' });
  await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.risk.enabled = true; delete settings._meta; await chrome.storage.local.set({ settings }); });
  await sleep(1500);
  await (await openPanel(page, 'sound')).locator('.subnav button[data-value="voice"]').first().click();
  await box.fill("what's my P&L"); await box.press('Enter');
  await waitFor(async () => /^Today [−+]?\$/.test(await p.locator('[data-voice-reply]').textContent()), { message: 'P&L reply' }).catch(async (e) => { throw new Error(`${e.message}: reply was “${await p.locator('[data-voice-reply]').textContent()}”`); });
  await box.fill('banana phone'); await box.press('Enter');
  await waitFor(async () => /didn’t catch a command/.test(await p.locator('[data-voice-reply]').textContent()), { message: 'unknown command reply' });
  await p.locator('.subnav button[data-value="sound"]').first().click();
});

console.log('\nCo-watch');
await check('two chart tabs with panels open on different tabs don’t keep re-saving settings at each other', async () => {
  const b = await context.newPage();
  await b.goto('https://www.tradingview.com/chart/second/');
  try { await openPanel(b, 'risk'); }
  catch (err) {
    const info = await b.evaluate(() => { const host = document.getElementById('tvsuite-panel-host'); const t = host?.shadowRoot?.querySelector('.tab[data-tab="risk"]'); const r = t?.getBoundingClientRect(); const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null; return { r: r && [r.x, r.y, r.width, r.height], hit: hit && `${hit.tagName}#${hit.id}`, block: !!document.getElementById('tvsuite-block-host'), vis: document.visibilityState }; });
    throw new Error(`${err.message.split('\n')[0]} :: ${JSON.stringify(info)}`);
  }
  await page.bringToFront();
  await openPanel(page, 'capture');
  const sw = context.serviceWorkers()[0];
  await sleep(1500);
  const writes = await sw.evaluate(() => new Promise((res) => { let n = 0; const f = (c) => { if (c.settings) n++; }; chrome.storage.onChanged.addListener(f); setTimeout(() => { chrome.storage.onChanged.removeListener(f); res(n); }, 4000); }));
  assert.ok(writes <= 1, `${writes} settings writes in 4 s while idle`);
  assert.equal(await panel(b).locator('.tab.on').getAttribute('data-tab'), 'risk', 'each tab keeps its own panel tab');
  await b.close();
});
await check('co-watch: two charts connect by copy-paste codes, follow symbols, chat and ping', async () => {
  const b = await context.newPage();
  await b.goto('https://www.tradingview.com/chart/partner/');
  const cw = async (pg) => {
    const p = await openPanel(pg, 'bridge');
    for (let i = 0; i < 3 && !(await p.locator('[data-cowatch-state]').count()); i++) { await p.locator('.subnav button[data-value="cowatch"]').first().click(); await sleep(150); }
    return p;
  };
  let pa = await cw(page);
  await pa.locator('label.switch', { hasText: 'Use a public STUN server' }).click(); // loopback test: no STUN
  await sleep(500);
  await pa.locator('button[data-cowatch-host]').click();
  const offer = await waitFor(async () => (await pa.locator('textarea[data-cowatch-code]').inputValue().catch(() => '')) || null, { message: 'offer code', timeout: 10000 });
  assert.match(offer, /^TVSC1\./);
  await b.bringToFront();
  const pb = await cw(b);
  await pb.locator('textarea[data-cowatch-paste="join"]').fill(offer);
  await pb.locator('button[data-cowatch-go="join"]').click();
  const answer = await waitFor(async () => (await pb.locator('textarea[data-cowatch-code]').inputValue().catch(() => '')) || null, { message: 'answer code', timeout: 10000 });
  await page.bringToFront();
  pa = await cw(page);
  await pa.locator('textarea[data-cowatch-paste="accept"]').fill(answer);
  await pa.locator('button[data-cowatch-go="accept"]').click();
  await waitFor(async () => (await pa.locator('[data-cowatch-state]').getAttribute('data-cowatch-state')) === 'connected', { message: 'A connected', timeout: 10000 });
  await waitFor(async () => (await (await cw(b)).locator('[data-cowatch-state]').getAttribute('data-cowatch-state')) === 'connected', { message: 'B connected', timeout: 10000 });
  // A switches symbol → B follows through the chart API.
  await page.evaluate(() => window.mockTV.setSymbol('ETHUSD'));
  await waitFor(async () => (await b.locator('[data-name="legend-source-title"]').textContent()) === 'ETHUSD', { message: 'B followed A to ETHUSD', timeout: 8000 });
  // Chat B → A
  const pb2 = await cw(b);
  await pb2.locator('input[data-cowatch-msg]').fill('hi from B');
  await pb2.locator('input[data-cowatch-msg]').press('Enter');
  pa = await cw(page);
  await waitFor(async () => /hi from B/.test(await pa.locator('[data-cowatch-log]').textContent()), { message: 'chat arrives' });
  // Ping A → B
  await pa.locator('button[data-cowatch-ping]').click();
  await waitFor(async () => /👀/.test(await (await cw(b)).locator('[data-cowatch-log]').textContent()), { message: 'ping arrives' });
  await pa.getByRole('button', { name: 'Leave' }).click();
  await waitFor(async () => (await (await cw(b)).locator('[data-cowatch-state]').getAttribute('data-cowatch-state')) === 'idle', { message: 'B sees the session end' });
  await b.close();
  await page.bringToFront();
});

await check('no uncaught TVSuite errors on the page', async () => {
  const relevant = pageErrors.filter((e) => !/boom|Hang|stopped responding/.test(e));
  assert.deepEqual(relevant, []);
});
await context.close();

console.log('\nDesktop / userscript bundle (no extension)');
await check('inject bundle runs in-page (desktop mode) with worker rendering', async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
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
  // Sound in desktop mode: the in-page engine (no extension frame) plays synth events.
  const dp = panel(pg);
  await dp.locator('.fab').click();
  await dp.locator('.tab[data-tab="sound"]').click();
  await dp.locator('input[data-sound-power]').check();
  await waitFor(() => pg.evaluate(() => document.getElementById('tvsuite-audio-host')?.dataset.state === 'on'), { message: 'inline audio on' });
  await dp.locator('button[data-test="tvAlert"]').click();
  await waitFor(() => pg.evaluate(() => +document.getElementById('tvsuite-audio-host').dataset.played > 0), { message: 'inline sound played' });
  assert.equal(await pg.evaluate(() => document.getElementById('tvsuite-audio-host').dataset.error), '');
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

await mock.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results.map(({ name, ok, ms, err }) => ({ name, ok, ms, err: err ? String(err.message || err) : undefined })), null, 2));
process.exit(failed.length ? 1 : 0);
