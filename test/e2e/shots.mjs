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
for (const t of ['templates', 'sessions', 'tools', 'about']) { await p.locator(`.tab[data-tab="${t}"]`).click(); await snap(`tab-${t}`); }
console.log('errors:', errs);
await context.close();
