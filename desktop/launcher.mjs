#!/usr/bin/env node
// TVSuite for TradingView Desktop.
//   node desktop/launcher.mjs            attach if a debug port is open, otherwise launch TradingView Desktop with one
//   node desktop/launcher.mjs attach     only attach to an already-open port
//   node desktop/launcher.mjs launch     only launch (then attach)
//   node desktop/launcher.mjs doctor     report what was found, change nothing
// Options: --port 9222  --app <absolute path to TradingView executable>  --bundle <inject bundle>  --once  --verbose
//
// SECURITY: while TradingView runs with a debugging port, any program on this computer can control the
// logged-in app through it. The port is bound to 127.0.0.1 only. Quit TradingView fully when you're done to close it.
import { spawn, execFile } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, chartTargets, scrubEnv, launchArgs, candidatePaths, msixActivationScript, ALLOWED_CDP_METHODS } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log('[tvsuite]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HELP = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).map((l) => l.replace(/^\/\/ ?/, '')).join('\n');

async function getJson(port, p) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(1500) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function portOpen(port) { try { await getJson(port, '/json/version'); return true; } catch (_) { return false; } }

const isFile = (p) => { try { return statSync(p).isFile(); } catch (_) { return false; } };

function findExecutable(explicit) {
  if (explicit) {
    if (!path.isAbsolute(explicit) || !isFile(explicit)) throw new Error('--app must be the absolute path of the TradingView executable');
    return explicit;
  }
  return candidatePaths({ platform: process.platform, env: process.env, home: homedir() }).find(isFile) || null;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 20000, windowsHide: true, ...opts }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout), stderr: String(stderr) })));
}

async function launch(opts) {
  const env = scrubEnv(process.env);
  const exe = findExecutable(opts.app);
  if (process.platform === 'win32' && !exe) {
    log('Trying the Microsoft Store (MSIX) build via app activation…');
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', msixActivationScript(opts.port)], { env });
    if (/^PID /m.test(r.stdout)) { log(r.stdout.trim()); return; }
    throw new Error(`Could not activate the Store build of TradingView Desktop${r.stdout.includes('NOT_FOUND') ? ' (not installed)' : `: ${(r.stderr || r.err?.message || '').trim().slice(0, 300)}`}. Pass --app <path to TradingView.exe> if it's installed elsewhere.`);
  }
  if (!exe) throw new Error('TradingView Desktop not found. Pass --app <absolute path to the executable>.');
  log(`Launching ${exe}`);
  const child = spawn(exe, launchArgs(opts.port), { env, detached: true, stdio: 'ignore', windowsHide: false });
  child.once('error', (err) => log(`Launch failed: ${err.message}`));
  child.unref();
}

class CdpSession {
  constructor(ws) { this.ws = ws; this.seq = 0; this.pending = new Map(); this.closed = false; }
  static open(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const s = new CdpSession(ws);
      const timer = setTimeout(() => { reject(new Error('CDP connect timeout')); try { ws.close(); } catch (_) { /* ignore */ } }, 4000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(s); });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP socket error')); });
      ws.addEventListener('close', () => { s.closed = true; for (const p of s.pending.values()) p.reject(new Error('CDP socket closed')); s.pending.clear(); s.onclose?.(); });
      ws.addEventListener('message', (e) => {
        let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.id == null) return;
        const p = s.pending.get(m.id); if (!p) return;
        s.pending.delete(m.id);
        if (m.error) p.reject(new Error(`CDP ${m.error.code}: ${m.error.message}`)); else p.resolve(m.result);
      });
    });
  }
  call(method, params = {}) {
    if (!ALLOWED_CDP_METHODS.has(method)) return Promise.reject(new Error(`CDP method ${method} is not allowed`));
    if (this.closed) return Promise.reject(new Error('CDP socket closed'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`CDP ${method} timed out`)); }, 10000);
    });
  }
  close() { try { this.ws.close(); } catch (_) { /* ignore */ } }
}

async function inject(target, bundle, verbose) {
  const s = await CdpSession.open(target.ws);
  // Persist across reloads/navigations for as long as this session stays connected…
  await s.call('Page.enable');
  await s.call('Page.addScriptToEvaluateOnNewDocument', { source: bundle });
  // …and start in the page that is already loaded (the bundle is idempotent).
  const r = await s.call('Runtime.evaluate', { expression: `${bundle}\n;typeof window.__tvsuiteMainWorld`, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`Injection error: ${r.exceptionDetails.text}`);
  if (verbose) log(`injected into ${target.url}`);
  return s;
}

async function attach(opts) {
  const bundlePath = opts.bundle || path.join(here, '..', 'dist', 'tvsuite-inject.js');
  if (!existsSync(bundlePath)) throw new Error(`Bundle not found at ${bundlePath}. Run "npm run build" first.`);
  const bundle = readFileSync(bundlePath, 'utf8');
  const sessions = new Map();
  let warned = false;
  log(`Watching TradingView chart windows on 127.0.0.1:${opts.port} (Ctrl+C to stop; skins stay until the page reloads).`);
  for (;;) {
    let targets = [];
    try { targets = chartTargets(await getJson(opts.port, '/json/list'), opts.port); }
    catch (err) { if (!warned) { log(`Waiting for TradingView (${err.message})…`); warned = true; } }
    for (const t of targets) {
      if (sessions.has(t.id)) continue;
      try {
        const s = await inject(t, bundle, opts.verbose);
        sessions.set(t.id, s);
        s.onclose = () => sessions.delete(t.id);
        log(`TVSuite active in chart window ${t.id.slice(0, 8)}…`);
      } catch (err) { log(`Could not inject into ${t.id.slice(0, 8)}: ${err.message}`); }
    }
    if (opts.once && sessions.size) { for (const s of sessions.values()) s.close(); return sessions.size; }
    await sleep(2000);
  }
}

async function doctor(opts) {
  const exe = (() => { try { return findExecutable(opts.app); } catch (e) { return `invalid: ${e.message}`; } })();
  const open = await portOpen(opts.port);
  let targets = [];
  if (open) { try { targets = chartTargets(await getJson(opts.port, '/json/list'), opts.port); } catch (_) { /* ignore */ } }
  const bundle = opts.bundle || path.join(here, '..', 'dist', 'tvsuite-inject.js');
  console.log(JSON.stringify({
    platform: process.platform, node: process.version, executable: exe || (process.platform === 'win32' ? 'not found (Store build is activated by AUMID)' : 'not found'),
    debugPort: opts.port, portOpen: open, chartWindows: targets.length, bundle: existsSync(bundle) ? bundle : 'missing — run npm run build',
    electronEnvVarsThatWouldBeScrubbed: Object.keys(process.env).filter((k) => /^ELECTRON_/.test(k)),
  }, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === 'help') { console.log(HELP); return; }
  if (opts.command === 'doctor') return doctor(opts);
  console.log('⚠  While TradingView runs with a debugging port, any program on this computer can control it. Bound to 127.0.0.1 only. Fully quit TradingView when done.');
  if (opts.command === 'attach') return attach(opts);
  if (opts.command === 'launch' || !(await portOpen(opts.port))) {
    await launch(opts);
    for (let i = 0; i < 40 && !(await portOpen(opts.port)); i++) await sleep(500);
    if (!(await portOpen(opts.port))) {
      throw new Error('TradingView started but its debugging port did not open. If TradingView was already running, quit it fully (including the tray/menu-bar icon) and run this again.');
    }
  }
  return attach(opts);
}

main().catch((err) => { console.error(`[tvsuite] ${err.message}`); process.exit(1); });
