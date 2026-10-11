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

async function openPanel(page, tab) {
  const p = panel(page);
  if (await p.locator('.panel').isHidden()) await p.locator('.fab').click();
  if (tab) await p.locator(`.tab[data-tab="${tab}"]`).click();
  return p;
}

console.log(`Chromium: ${CHROME}`);
const { context, extensionId } = await launchWithExtension();
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

await check('every built-in canvas and shader skin starts without errors', async () => {
  const p = await openPanel(page, 'skins');
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
    if (['synthwave', 'rain-neon', 'silk', 'nebula'].includes(id)) { await p.locator('.x').click(); await sleep(400); await page.screenshot({ path: path.join(OUT, `02-skin-${id}.png`) }); await openPanel(page, 'skins'); }
  }
  assert.deepEqual(failures, []);
});

await check('overlay mode stops patching the page and blends above the chart', async () => {
  const p = await openPanel(page, 'skins');
  await p.locator('select').first().selectOption('overlay');
  const d = await waitFor(async () => { const x = await layerData(page); return x?.z === '3' && x; }, { message: 'overlay layer' });
  assert.equal(d.blend, 'screen');
  const attrs = await html(page);
  assert.equal(attrs['data-tvsuite-clear'], undefined, 'no clear scope in overlay mode');
  await sleep(300);
  const px = await page.evaluate(() => window.mockTV.pixel('main', 0.98, 0.02));
  assert.equal(px[3], 255, 'chart background painted normally again');
  await p.locator('.x').click();
  await page.screenshot({ path: path.join(OUT, '03-overlay.png') });
  await openPanel(page, 'skins');
  await p.locator('select').first().selectOption('under');
  await waitFor(async () => (await layerData(page))?.z === '-1', { message: 'back to under' });
});

await check('look controls apply CSS filters (dim, blur, black & white)', async () => {
  const p = await openPanel(page, 'skins');
  const ranges = p.locator('input[type=range]');
  await ranges.nth(2).fill('6'); // blur
  await p.getByText('Black & white').click();
  const f = await page.evaluate(() => document.getElementById('tvsuite-skin-layer').style.filter);
  assert.match(f, /blur\(6px\)/);
  assert.match(f, /grayscale\(1\)/);
  await ranges.nth(2).fill('0');
  await p.getByText('Black & white').click();
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
  const p = await openPanel(page, 'skins');
  await p.getByText('Reactive (reads visible price text').click();
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
  const p = await openPanel(page, 'skins');
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
