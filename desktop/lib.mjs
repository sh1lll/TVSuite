// Pure helpers for the TradingView Desktop launcher (unit-tested; no I/O here).
// Discovery and CDP-guard patterns adapted from covaceo/tradingview-local-skins (MIT).
import path from 'node:path';

export const DEFAULT_PORT = 9222;
export const ALLOWED_CDP_METHODS = new Set(['Page.enable', 'Page.addScriptToEvaluateOnNewDocument', 'Page.removeScriptToEvaluateOnNewDocument', 'Runtime.evaluate']);

export function parsePort(value = DEFAULT_PORT) {
  if (!/^[1-9][0-9]{0,4}$/.test(String(value)) || Number(value) > 65535) throw new Error('Port must be an integer from 1 to 65535.');
  return Number(value);
}

export function parseArgs(argv) {
  const out = { command: 'start', port: DEFAULT_PORT, app: null, bundle: null, once: false, verbose: false };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) out.command = rest.shift();
  while (rest.length) {
    const a = rest.shift();
    if (a === '--port') out.port = parsePort(rest.shift());
    else if (a === '--app') out.app = rest.shift();
    else if (a === '--bundle') out.bundle = rest.shift();
    else if (a === '--once') out.once = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (a === '--help' || a === '-h') out.command = 'help';
    else throw new Error(`Unknown option ${a}`);
  }
  if (!['start', 'launch', 'attach', 'doctor', 'help'].includes(out.command)) throw new Error(`Unknown command ${out.command}`);
  return out;
}

// TradingView chart pages only (tradingview.com and regional subdomains).
export function isChartUrl(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\s\\]/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && /(^|\.)tradingview\.com$/.test(u.hostname) && /^\/chart(\/|$)/.test(u.pathname);
  } catch (_) { return false; }
}

// Only accept DevTools sockets on loopback, on our port, for the listed target id.
export function validateSocket(url, port, id) {
  const expected = new Set([`ws://127.0.0.1:${port}/devtools/page/${id}`, `ws://localhost:${port}/devtools/page/${id}`]);
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id) || !expected.has(url)) throw new Error('Refused CDP socket that is not a loopback page socket on the expected port.');
  return url.replace('ws://localhost:', 'ws://127.0.0.1:');
}

export function chartTargets(list, port) {
  if (!Array.isArray(list)) throw new Error('Invalid CDP target list');
  return list.filter((t) => t && t.type === 'page' && isChartUrl(t.url)).map((t) => ({ id: t.id, url: t.url, ws: validateSocket(t.webSocketDebuggerUrl, port, t.id) }));
}

// Electron treats ELECTRON_RUN_AS_NODE=1 as "behave like node", which then rejects Chromium flags with
// "bad option" — editors and agent hosts built on Electron (VS Code and friends) export it to child processes.
// This is the leading hypothesis for reports of TradingView Desktop rejecting --remote-debugging-port.
export function scrubEnv(env) {
  const out = { ...env };
  for (const k of Object.keys(out)) if (/^ELECTRON_(RUN_AS_NODE|NO_ATTACH_CONSOLE|ENABLE_LOGGING|EXTRA_LAUNCH_ARGS)$/.test(k) || k === 'NODE_OPTIONS') delete out[k];
  return out;
}

export function launchArgs(port) {
  return [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'];
}

// Candidate executables per platform (existence is checked by the caller).
export function candidatePaths({ platform, env = {}, home = '' }) {
  if (platform === 'darwin') {
    return ['/Applications/TradingView.app/Contents/MacOS/TradingView', path.posix.join(home, 'Applications/TradingView.app/Contents/MacOS/TradingView')];
  }
  if (platform === 'win32') {
    const w = path.win32;
    const local = env.LOCALAPPDATA && w.isAbsolute(env.LOCALAPPDATA) ? env.LOCALAPPDATA : null;
    const pf = env.ProgramFiles && w.isAbsolute(env.ProgramFiles) ? env.ProgramFiles : null;
    return [
      local && w.join(local, 'Programs', 'TradingView', 'TradingView.exe'),
      local && w.join(local, 'TradingView', 'TradingView.exe'),
      pf && w.join(pf, 'TradingView', 'TradingView.exe'),
    ].filter(Boolean);
  }
  return ['/snap/bin/tradingview', '/opt/TradingView/tradingview', '/opt/tradingview/tradingview', '/usr/bin/tradingview'];
}

// PowerShell that activates the Microsoft Store (MSIX) build through IApplicationActivationManager with arguments.
// Launching the exe inside WindowsApps directly fails with "Access is denied"; activation by AUMID keeps the
// package identity. Community-reported to work on TradingView Desktop 3.3.0 (tradingview-mcp issue #42).
export function msixActivationScript(port) {
  parsePort(port);
  return `
$ErrorActionPreference = 'Stop'
$pkg = Get-AppxPackage -Name 'TradingView.Desktop' | Select-Object -First 1
if (-not $pkg) { Write-Output 'NOT_FOUND'; exit 3 }
$appId = (Get-AppxPackageManifest $pkg).Package.Applications.Application | Select-Object -First 1 -ExpandProperty Id
$aumid = "$($pkg.PackageFamilyName)!$appId"
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IApplicationActivationManager {
  int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, int options, out uint processId);
  int ActivateForFile(IntPtr a, IntPtr b, IntPtr c, out uint d);
  int ActivateForProtocol(IntPtr a, IntPtr b, out uint c);
}
[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")] public class ApplicationActivationManager {}
public static class TvsActivate {
  public static uint Run(string aumid, string args) {
    var mgr = (IApplicationActivationManager)new ApplicationActivationManager();
    uint pid; int hr = mgr.ActivateApplication(aumid, args, 0, out pid);
    if (hr != 0) Marshal.ThrowExceptionForHR(hr);
    return pid;
  }
}
"@
$procId = [TvsActivate]::Run($aumid, '${launchArgs(port).join(' ')}')
Write-Output "PID $procId $aumid"
`;
}
