// E2E harness: real Chromium + the unpacked extension, with https://www.tradingview.com/ served
// by request interception (mock chart page + an in-memory fake of the template endpoints).
import { chromium } from 'playwright-core';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const EXT = path.join(ROOT, 'dist/extension');
export const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const MOCK = readFileSync(path.join(ROOT, 'test/fixtures/mock-tv.html'), 'utf8');

export function makeBackend() {
  return {
    THEMES: { 'My Dark': { 'paneProperties.background': '#131722' }, 'Paper': { 'paneProperties.background': '#ffffff' } },
    TOOLS: {
      LineToolTrendLine: { 'Blue thick': { linecolor: '#2962ff', linewidth: 3 }, 'Red dashed': { linecolor: '#f23645', linestyle: 2 } },
      LineToolFibRetracement: { 'Golden only': { levels: [0.618] } },
    },
    log: [],
  };
}

export async function routeTradingView(context, backend) {
  await context.route('https://www.tradingview.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname.startsWith('/chart')) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK });
    backend.log.push(`${req.method()} ${u.pathname}`);
    if (u.pathname === '/themes/') return json(Object.keys(backend.THEMES));
    if (u.pathname === '/theme/') return json({ content: JSON.stringify(backend.THEMES[u.searchParams.get('themeName')]) });
    let m = u.pathname.match(/^\/drawing-templates\/(\w+)\/$/);
    if (m) return json(Object.keys(backend.TOOLS[m[1]] || {}));
    m = u.pathname.match(/^\/drawing-template\/(\w+)\/$/);
    if (m) return json({ content: JSON.stringify(backend.TOOLS[m[1]]?.[u.searchParams.get('templateName')]) });
    if (req.method() === 'POST') {
      if (req.headers()['x-csrftoken'] !== 'tok+1') return json({ error: 'csrf' }, 403);
      const body = req.postDataBuffer()?.toString('latin1') || '';
      const field = (n) => { const mm = body.match(new RegExp(`name="${n}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`)); return mm ? Buffer.from(mm[1], 'latin1').toString('utf8') : undefined; };
      const name = field('name'), tool = field('tool'), content = field('content');
      if (u.pathname === '/save-theme/') backend.THEMES[name] = JSON.parse(content);
      else if (u.pathname === '/save-drawing-template/') (backend.TOOLS[tool] ??= {})[name] = JSON.parse(content);
      else if (u.pathname === '/remove-theme/') delete backend.THEMES[name];
      else if (u.pathname === '/remove-drawing-template/') { delete backend.TOOLS[tool]?.[name]; if (backend.TOOLS[tool] && !Object.keys(backend.TOOLS[tool]).length) delete backend.TOOLS[tool]; }
      else return json({}, 404);
      return json({ ok: true });
    }
    return route.fulfill({ status: 404, body: 'not mocked' });
  });
}

export async function launchWithExtension({ args = [] } = {}) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'tvsuite-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: CHROME,
    headless: true,
    viewport: { width: 1400, height: 860 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--enable-unsafe-swiftshader', '--use-angle=swiftshader', ...args],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extensionId = new URL(sw.url()).host;
  return { context, extensionId, sw };
}

// Locators pierce open shadow roots in Playwright, so the panel is reachable with normal CSS.
export const panel = (page) => page.locator('#tvsuite-panel-host');
