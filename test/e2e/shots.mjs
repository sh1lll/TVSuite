// Screenshots of every panel view for visual review. Usage: node test/e2e/shots.mjs
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { launchWithExtension, routeTradingView, makeBackend, panel, ROOT } from './harness.mjs';
const OUT = path.join(ROOT, 'test/e2e/out/shots');
mkdirSync(OUT, { recursive: true });
const { context } = await launchWithExtension();
await routeTradingView(context, makeBackend());
const page = await context.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message));
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto('https://www.tradingview.com/chart/shots/');
await page.waitForTimeout(1500);
const p = panel(page);
await p.locator('.fab').click();
await page.waitForTimeout(2500);
const snap = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: 760, height: 900 } }); };
await snap('skins-library');
await p.locator('.card[data-skin="custom-midnight-aurora"]').hover();
await snap('skins-library-hover');
await p.locator('.body').evaluate((b) => { b.scrollTop = 600; });
await snap('skins-library-scrolled');
for (const v of ['studio', 'look', 'smart']) { await p.locator(`.subnav button[data-value="${v}"]`).click(); await snap(`skins-${v}`); }
await p.locator('.subnav button[data-value="studio"]').click();
await p.locator('.seg.subnav').nth(1).locator('button[data-value="code"]').click();
await snap('skins-studio-code');
await p.locator('.seg.subnav').nth(1).locator('button[data-value="media"]').click();
await page.waitForTimeout(800);
await snap('skins-studio-media');
await p.locator('.tab[data-tab="sound"]').click();
await snap('tab-sound-off');
await p.locator('input[data-sound-power]').check();
await p.locator('label.switch', { hasText: 'Voice announcements' }).click();
await snap('tab-sound');
for (const [i, y] of [[1, 700], [2, 1400], [3, 2100]]) { await p.locator('.body').evaluate((b, v) => { b.scrollTop = v; }, y); await snap(`tab-sound-${i}`); }
await p.locator('.tab[data-tab="bridge"]').click();
await p.locator('input[data-bridge-input]').fill('ES 12-26');
await snap('tab-bridge');
await p.locator('textarea[data-wl-in]').fill('###FUTURES,CME_MINI:ESZ2026,CME_MINI:NQZ2026,###TECH,NASDAQ:AAPL,NASDAQ:MSFT,###CRYPTO,BINANCE:BTCUSDT');
await p.locator('.body').evaluate((b) => { b.scrollTop = 900; });
await snap('tab-bridge-watchlist');
for (const t of ['templates', 'sessions', 'tools', 'about']) { await p.locator(`.tab[data-tab="${t}"]`).click(); await snap(`tab-${t}`); }
console.log('errors:', errs);
await context.close();
