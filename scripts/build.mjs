// Build: dist/extension (unpacked MV3 extension), dist/tvsuite-inject.js (desktop/console), dist/tvsuite.user.js (userscript).
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { writeIcons } from './icons.mjs';
import { GALLERY } from '../gallery/skins.mjs';
import { validateSkin } from '../src/modules/skins/packs.js';

const watch = process.argv.includes('--watch');
const out = 'dist/extension';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

async function workerSource() {
  const res = await esbuild.build({ entryPoints: ['src/sandbox/skin-worker.js'], bundle: true, format: 'iife', target: 'chrome116', write: false, legalComments: 'none' });
  return res.outputFiles[0].text;
}

const workerPlugin = (src) => ({
  name: 'tvsuite-worker-source',
  setup(build) {
    build.onResolve({ filter: /^tvsuite:worker-source$/ }, () => ({ path: 'worker-source', namespace: 'tvsuite' }));
    build.onLoad({ filter: /.*/, namespace: 'tvsuite' }, () => ({ contents: `export const WORKER_SOURCE = ${JSON.stringify(src)};`, loader: 'js' }));
  },
});

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         TVSuite
// @namespace    https://github.com/sh1lll/TVSuite
// @version      ${pkg.version}
// @description  Live chart skins, template backup/restore, session clock and tools for TradingView
// @match        https://*.tradingview.com/chart/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
`;

async function buildAll() {
  rmSync('dist', { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const src = await workerSource();
  const common = { bundle: true, target: 'chrome116', legalComments: 'none', plugins: [workerPlugin(src)], define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' };
  await Promise.all([
    esbuild.build({ ...common, entryPoints: { content: 'src/content.js', 'main-world': 'src/main-world.js', sandbox: 'src/sandbox/sandbox.js', media: 'src/sandbox/media.js', popup: 'src/popup.js', options: 'src/options.js' }, outdir: out, format: 'iife' }),
    esbuild.build({ ...common, entryPoints: { background: 'src/background.js' }, outdir: out, format: 'esm', platform: 'browser' }),
    esbuild.build({ ...common, define: { ...common.define, __TVSUITE_DEFAULT_HOST__: '"desktop"' }, entryPoints: ['src/inject.js'], outfile: 'dist/tvsuite-inject.js', format: 'iife' }),
    esbuild.build({ ...common, define: { ...common.define, __TVSUITE_DEFAULT_HOST__: '"userscript"' }, entryPoints: ['src/inject.js'], outfile: 'dist/tvsuite.user.js', format: 'iife', banner: { js: USERSCRIPT_HEADER } }),
  ]);
  for (const f of ['manifest.json', 'sandbox.html', 'media.html', 'popup.html', 'options.html', 'ui.css']) cpSync(`extension/${f}`, `${out}/${f}`);
  writeIcons(`${out}/icons`);
  // Gallery: validate every seed skin, write gallery/index.json (served raw from GitHub) and a bundled copy.
  const gallery = GALLERY.map((g) => { const r = validateSkin(g); if (!r.ok) throw new Error(`gallery skin "${g.name}": ${r.errors.join('; ')}`); return r.skin; });
  const index = JSON.stringify({ schema: 'tvsuite.gallery/1', updated: new Date().toISOString().slice(0, 10), skins: gallery }, null, 2) + '\n';
  writeFileSync('gallery/index.json', index);
  writeFileSync(`${out}/gallery.json`, index);
  console.log(`built ${out}, dist/tvsuite-inject.js, dist/tvsuite.user.js (worker ${Math.round(src.length / 1024)} KB)`);
}

await buildAll();
if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  let t;
  fsWatch('src', { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => buildAll().catch((e) => console.error(e.message)), 150); });
  fsWatch('extension', { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => buildAll().catch((e) => console.error(e.message)), 150); });
  console.log('watching…');
}
