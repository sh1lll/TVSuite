// Measures per-frame cost (ms, inside the worker) for every built-in and gallery skin. Usage: node test/e2e/perf.mjs
import { launchWithExtension, routeTradingView, makeBackend, panel } from './harness.mjs';
import { GALLERY } from '../../gallery/skins.mjs';
import { encodeSkin } from '../../src/modules/skins/packs.js';
const { context } = await launchWithExtension();
await routeTradingView(context, makeBackend());
const page = await context.newPage();
await page.goto('https://www.tradingview.com/chart/perf/');
await page.waitForTimeout(2000);
const p = panel(page);
await p.locator('.fab').click();
const ids = await p.locator('.card[data-skin]').evaluateAll((els) => els.map((e) => e.dataset.skin));
const read = () => page.evaluate(() => ({ ...document.getElementById('tvsuite-skin-layer').dataset }));
const rows = [];
async function measure(id) {
  const samples = [];
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(1100); const d = await read(); if (d.skin === id && d.frameMs) samples.push(+d.frameMs); }
  const d = await read();
  rows.push({ id, fps: +d.fps, frameMs: samples.length ? +(samples.reduce((a, b) => a + b) / samples.length).toFixed(2) : null, state: d.state });
}
for (const id of ids) { await p.locator(`.card[data-skin="${id}"]`).click(); await measure(id); }
for (const g of GALLERY) {
  if (g.kind !== 'canvas') continue;
  await page.evaluate(() => { location.hash = ''; });
  await page.goto(`https://www.tradingview.com/chart/perf/#tvskin=${await encodeSkin(g)}`);
  await p.getByRole('button', { name: 'Add & run in sandbox' }).click();
  await measure(g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
}
console.table(rows);
await context.close();
