// Records a narrated demo video of TVSuite against the mock TradingView chart.
// Usage: npm run build && node test/e2e/demo.mjs  → test/e2e/out/demo/*.webm + stills
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EXT, CHROME, ROOT, routeTradingView, makeBackend, panel } from './harness.mjs';

const OUT = path.join(ROOT, 'test/e2e/out/demo');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const size = { width: 1280, height: 760 };

const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'tvsuite-demo-')), {
  executablePath: CHROME, headless: true, viewport: size,
  recordVideo: { dir: OUT, size },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');
const extensionId = new URL(sw.url()).host;
const backend = makeBackend();
await routeTradingView(context, backend);

const page = await context.newPage();
await page.goto('https://www.tradingview.com/chart/demo/');
const p = panel(page);
let still = 0;

// Caption bar drawn into the page so the video explains itself.
async function caption(text, ms = 2600) {
  await page.evaluate((t) => {
    let el = document.getElementById('demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-caption';
      Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', zIndex: 2147483647, background: 'rgba(8,10,16,.88)', color: '#fff', font: '600 17px -apple-system, Segoe UI, Roboto, sans-serif', padding: '10px 18px', borderRadius: '10px', border: '1px solid #2962ff', maxWidth: '86vw', textAlign: 'center', pointerEvents: 'none' });
      document.documentElement.append(el);
    }
    el.textContent = t;
  }, text);
  await sleep(ms);
}
async function shot(name) { await page.screenshot({ path: path.join(OUT, `${String(++still).padStart(2, '0')}-${name}.png`) }); }
async function openTab(tab) {
  if (await p.locator('.panel').isHidden()) await p.locator('.fab').click();
  await p.locator(`.tab[data-tab="${tab}"]`).click();
}
const closePanel = async () => { if (!(await p.locator('.panel').isHidden())) await p.locator('.x').click(); };

// 1 — plain chart
await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {})));
await page.keyboard.press('Alt+Shift+K'); // skins on by default; turn off to show the "before"
await caption('A TradingView chart, as it normally looks', 2600);
await shot('before');
// 2 — skin on
await page.keyboard.press('Alt+Shift+K');
await caption('Alt+Shift+K: TVSuite slides a live skin UNDER the candles — no TradingView setting is changed', 3600);
await shot('aurora-under');
// 3 — library with live previews
const sub = async (v) => { if (await p.locator('.panel').isHidden()) await p.locator('.fab').click(); await p.locator('.tab[data-tab="skins"]').click(); await p.locator(`.subnav button[data-value="${v}"]`).first().click(); };
await sub('library');
await caption('Skins library: every card is a live preview — hover to animate', 2400);
await sleep(2500);
await shot('library');
await p.locator('.card[data-skin="custom-tokyo-rain"]').hover();
await caption('Starter custom skins ship ready to use — remixes and community gallery skins', 2600);
await shot('library-hover');
for (const [id, label] of [['custom-tokyo-rain', 'Tokyo Rain — a custom remix'], ['synthwave', 'Synthwave Grid'], ['silk', 'Silk (GPU shader)'], ['fireflies', 'Fireflies — a community code skin, sandboxed']]) {
  await sub('library');
  await p.locator(`.card[data-skin="${id}"]`).click();
  await closePanel();
  await caption(label, 2600);
  await shot(id);
}
// 4 — studio
await sub('library');
await p.locator('.card.add').click();
const remix = p.locator('.sec', { hasText: 'Remix a built-in' });
await remix.locator('select').selectOption('aurora');
await remix.locator('input[type=text]').fill('Violet Hour');
await caption('Skin Studio: remix any built-in with your own colours and motion — no AI or code needed', 2400);
for (const v of [200, 240, 280, 300]) { await remix.locator('input[type=range]').nth(0).fill(String(v)); await sleep(350); }
await remix.locator('input[type=range]').nth(1).fill('70');
await sleep(1200);
await shot('studio-remix');
await remix.getByRole('button', { name: 'Save to My skins' }).click();
await caption('Saved to My skins — and it is now the live skin on the chart', 2600);
await closePanel();
await sleep(1500);
await shot('custom-skin-live');
await sub('studio');
await p.locator('.seg.subnav').nth(1).locator('button[data-value="code"]').click();
await caption('Or write your own canvas/GLSL skin — it runs in a sandboxed worker, never in the page', 3000);
await shot('studio-code');
// 5 — look + smart
await sub('look');
await caption('Look: under-candles or overlay, opacity, dim, blur, frame rate, resolution', 2600);
await shot('look');
await sub('smart');
await p.locator('label.switch', { hasText: /^Reactive/ }).click();
await caption('Smart: opt-in reactive mode reads the price on screen — locally, nothing leaves the browser', 3000);
await page.evaluate(() => window.mockTV.setVolatility(45));
await caption('Market goes wild → adaptive calm mode quiets the background automatically', 5500);
await shot('calm-mode');
await page.evaluate(() => window.mockTV.setVolatility(1));
// 7 — templates
await openTab('templates');
await caption('Templates tab: back up drawing templates and themes from your account', 1800);
await p.getByRole('button', { name: 'Fetch from TradingView' }).click();
await sleep(2200);
await p.getByRole('button', { name: 'Snapshot now' }).click();
await sleep(900);
backend.TOOLS.LineToolTrendLine['Blue thick'].linewidth = 1;
delete backend.THEMES.Paper;
await p.getByRole('button', { name: 'Load' }).first().click();
await p.getByRole('button', { name: 'Compare with live' }).click();
await caption('Snapshot vs live account: added / changed badges before you restore anything', 3000);
await shot('templates-diff');
await p.locator('select').first().selectOption('rename');
await p.getByRole('button', { name: 'Restore to TradingView…' }).click();
await caption('Restore asks first — conflicts saved as "name (restored)", a safety snapshot is taken', 3000);
await shot('restore-confirm');
await p.getByRole('button', { name: /Write \d+ items/ }).click();
await sleep(1600);
// 8 — sessions + tools
await openTab('sessions');
await caption('Session clock: Tokyo / London / New York, DST-aware — each can switch to its own skin', 3000);
await shot('sessions');
await openTab('tools');
const nums = p.locator('input[type=number]');
await nums.nth(0).fill('25000'); await nums.nth(1).fill('1'); await nums.nth(2).fill('100'); await nums.nth(3).fill('98');
await caption('Position-size calculator: stocks, futures (point value), forex lots, crypto', 3000);
await shot('position-size');
await closePanel();
// 9 — journal
await page.mouse.click(640, 380);
await page.keyboard.press('Alt+Shift+J');
await p.locator('.modal-bg[data-journal] .modal').waitFor();
await p.locator('.modal-bg[data-journal] select').selectOption('long');
await p.locator('.modal-bg[data-journal] input[type=text]').fill('#breakout #aplus');
await p.locator('.modal-bg[data-journal] textarea').fill('Opening drive, took the retest.');
await caption('Alt+Shift+J: capture the chart (clean, without the skin) + context into a local trade journal', 3400);
await shot('journal-capture');
await p.locator('.modal-bg[data-journal]').getByRole('button', { name: 'Save' }).click();
await sleep(800);
const j = await context.newPage();
await j.goto(`chrome-extension://${extensionId}/journal.html`);
await j.locator('.entry input[type=number]').fill('2.5');
await j.locator('.entry input[type=number]').blur();
await sleep(1500);
await j.screenshot({ path: path.join(OUT, `${String(++still).padStart(2, '0')}-journal-page.png`) });
await j.close();
await page.bringToFront();
await caption('TVSuite — live skins, templates, sessions, journal, tools. Local-only, open source.', 3000);
await shot('end');

const video = page.video();
await context.close();
const src = await video.path();
const dest = path.join(OUT, 'tvsuite-demo.webm');
renameSync(src, dest);
for (const f of readdirSync(OUT)) if (f.endsWith('.webm') && f !== 'tvsuite-demo.webm') renameSync(path.join(OUT, f), path.join(OUT, `extra-${f}`));
console.log('demo written:', dest);
