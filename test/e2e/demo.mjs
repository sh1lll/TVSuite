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
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
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
await p.locator('.seg.subnav').nth(1).locator('button[data-value="media"]').click();
await caption('Or use your own image, GIF or video (MP4, WebM, MOV…) — upload it or paste a Giphy/Imgur/Dropbox/Drive link', 3200);
await shot('studio-media');
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
// 8 — sound
await openTab('sound');
await p.locator('input[data-sound-power]').check();
await caption('NEW · Sound: ambient trading beds, event sounds, voice — all local', 2600);
await p.locator('button[data-ambient="gen:rain"]').click();
await caption('Ambient bed: rain (also ocean, noise, lo-fi, drone, or your own loop) — dips when an event plays', 3000);
await shot('sound-tab');
await p.locator('.body').evaluate((b) => { b.scrollTop = 520; });
await caption('A sound per event: trade entered/closed, TradingView alerts, price levels, sessions… built-in, your file or a link', 3400);
await shot('sound-events');
await closePanel();
await page.evaluate(() => window.mockTV.toast('Order filled: Buy 1 BTCUSD at 63,512.00'));
await caption('TradingView says "Order filled" → TVSuite plays your entry sound (cash register). It never touches orders.', 900);
await shot('sound-order-toast');
await sleep(2500);
const played = await page.evaluate(() => document.getElementById('tvsuite-audio-host').dataset);
await caption(`Sounds played so far: ${played.played} · last: ${played.last} · Alt+Shift+E/X manual · Alt+Shift+M mute`, 2800);
await openTab('sound');
await p.locator('button[data-ambient="none"]').click();
// 9 — bridge
await openTab('bridge');
await p.locator('input[data-bridge-input]').fill('ES 12-26');
await caption('NEW · Platform Bridge: one symbol, every platform — NinjaTrader → TradingView, Tradovate, TopstepX, thinkorswim, Sierra…', 3800);
await shot('bridge-symbols');
await p.locator('.subnav button[data-value="watchlists"]').first().click();
await p.locator('textarea[data-wl-in]').fill('###FUTURES,CME_MINI:ESZ2026,CME_MINI:NQZ2026,###TECH,NASDAQ:AAPL,NASDAQ:MSFT,###CRYPTO,BINANCE:BTCUSDT');
await caption('Watchlist converter: a TradingView export (with sections) → NinjaTrader, thinkorswim, Tradovate, CSV… and back', 3600);
await shot('bridge-watchlist');
const [sw0] = context.serviceWorkers();
await sw0.evaluate(() => chrome.storage.local.set({ 'bridge:seen': { 'topstepx.com': { symbol: 'CON.F.US.ENQ.Z26', at: Date.now(), url: 'https://topstepx.com/trade' } } }));
await p.locator('.subnav button[data-value="symbols"]').first().click();
await p.locator('.body').evaluate((b) => { b.scrollTop = 520; });
await caption('Linked tabs: your TopstepX tab is on NQ Dec 26 → "Open here" jumps this TradingView chart to it', 3600);
await shot('bridge-linked');
await caption('Plus: select a ticker on any website → right-click → Open in TradingView', 2800);
// 10 — Risk Guard
await openTab('risk');
await p.locator('button[data-risk-setup]').click();
await p.locator('label.switch', { hasText: 'Risk Guard' }).click();
const nr = (label) => p.locator('.row', { hasText: label }).locator('input[type=number]').first();
for (const [label, v] of [['Starting balance', '50000'], ['Personal Daily Loss Limit', '500'], ['Personal Daily Profit Target', '1000']]) { await nr(label).fill(v); await nr(label).press('Tab'); }
await p.locator('.body').evaluate((b) => { b.scrollTop = 380; });
await caption('NEW · Risk Guard: your prop-firm rules — PDLL, PDPT and the daily action, like your broker’s risk settings', 3800);
await shot('risk-rules');
await p.locator('.subnav button[data-value="today"]').first().click();
for (const v of ['-180', '120', '-230']) { await p.locator('input[data-pnl-input]').fill(v); await p.locator('input[data-pnl-input]').press('Enter'); await sleep(250); }
await caption('Today: day P&L against your limits — warns at 80% (sound, voice, lights). HUD shows it at the top.', 3600);
await shot('risk-today');
await p.locator('input[data-pnl-input]').fill('-300'); await p.locator('input[data-pnl-input]').press('Enter');
await page.locator('#tvsuite-block-host').waitFor({ timeout: 5000 });
await closePanel();
await caption('Daily loss limit hit → the chart is locked until the trading day resets. Override = typed phrase + 30 s, logged.', 4200);
await shot('risk-lock');
// unlock for the rest of the demo (it is the demo's own rule)
const [swr] = context.serviceWorkers();
await swr.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); settings.risk.enabled = false; delete settings._meta; await chrome.storage.local.set({ settings }); });
await sleep(1500);
// 11 — capture
await openTab('capture');
await sleep(1200);
await caption('NEW · Capture: screenshot cards ready for X or Discord — Alt+Shift+S copies one', 3200);
await shot('capture-card');
await p.locator('.subnav button[data-value="recorder"]').first().click();
await p.locator('label.switch', { hasText: 'Record my trades' }).click();
await closePanel();
await page.evaluate(() => window.mockTV.toast('Order filled: Buy 1 BTCUSD at 63,512.00'));
await sleep(800);
await openTab('capture');
await caption('Trade recorder: starts when you enter, stops when you’re flat — MP4 of the chart, no screen-share prompt', 3600);
await shot('recorder-on');
await page.evaluate(() => window.mockTV.toast('Position closed: BTCUSD +120.00 USD'));
await caption('Mini windows: a floating mini chart over your other apps, or your own video/stream over the chart', 3000);
await p.locator('.subnav button[data-value="mini"]').first().click();
await shot('mini');
// 12 — voice + indicators + co-watch
await openTab('sound');
await p.locator('.subnav button[data-value="voice"]').first().click();
await p.locator('input[data-command-box]').fill('show N Q five minute');
await p.locator('input[data-command-box]').press('Enter');
await caption('NEW · Voice (Alt+Shift+V) or type it: “show NQ five minute” switches the chart without a reload', 3600);
await shot('voice');
await p.locator('.subnav button[data-value="lights"]').first().click();
await caption('Room lighting: Hue, Home Assistant, WLED, Govee — session colours, flash on fills, red at your limit', 3200);
await shot('lights');
await openTab('bridge');
await p.locator('.subnav button[data-value="code"]').first().click();
await p.locator('button[data-example="python"]').click();
await p.locator('.body').evaluate((b) => { b.scrollTop = 260; });
await caption('NEW · Write indicators in Python, JavaScript or Java → TVSuite translates them to Pine for TradingView', 4000);
await shot('indicators');
await p.locator('.subnav button[data-value="cowatch"]').first().click();
await caption('Co-watch: a friend’s chart and yours follow each other over a direct peer-to-peer link — no server', 3000);
await shot('cowatch');
await p.locator('.subnav button[data-value="symbols"]').first().click();
// 13 — sessions + tools
await openTab('sessions');
await caption('Session clock: Tokyo / London / New York, DST-aware — each can switch to its own skin', 3000);
await shot('sessions');
await openTab('tools');
const nums = p.locator('input[type=number]');
await nums.nth(0).fill('25000'); await nums.nth(1).fill('1'); await nums.nth(2).fill('100'); await nums.nth(3).fill('98');
await caption('Position-size calculator: stocks, futures (point value), forex lots, crypto', 3000);
await shot('position-size');
await closePanel();
// 14 — journal
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
await j.locator('.entry input[placeholder="Result R"]').fill('2.5');
await j.locator('.entry input[placeholder="Result R"]').blur();
await sleep(1500);
await j.screenshot({ path: path.join(OUT, `${String(++still).padStart(2, '0')}-journal-page.png`) });
await j.close();
await page.bringToFront();
await caption('TVSuite — skins, sound, risk guard, capture, bridge, voice, lights, co-watch, journal. Local-only, open source.', 3200);
await shot('end');

const video = page.video();
await context.close();
const src = await video.path();
const dest = path.join(OUT, 'tvsuite-demo.webm');
renameSync(src, dest);
for (const f of readdirSync(OUT)) if (f.endsWith('.webm') && f !== 'tvsuite-demo.webm') renameSync(path.join(OUT, f), path.join(OUT, `extra-${f}`));
console.log('demo written:', dest);
