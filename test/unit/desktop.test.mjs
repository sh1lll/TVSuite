import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, parsePort, isChartUrl, validateSocket, chartTargets, scrubEnv, candidatePaths, msixActivationScript, launchArgs } from '../../desktop/lib.mjs';

test('args and ports', () => {
  assert.deepEqual(parseArgs([]), { command: 'start', port: 9222, app: null, bundle: null, once: false, verbose: false });
  assert.equal(parseArgs(['attach', '--port', '9333', '--once']).port, 9333);
  assert.throws(() => parseArgs(['explode']));
  assert.throws(() => parsePort('0'));
  assert.throws(() => parsePort('70000'));
  assert.deepEqual(launchArgs(9222), ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1']);
});

test('only TradingView chart pages are targeted', () => {
  assert.ok(isChartUrl('https://www.tradingview.com/chart/abc/'));
  assert.ok(isChartUrl('https://in.tradingview.com/chart'));
  assert.ok(!isChartUrl('https://www.tradingview.com/ideas/'));
  assert.ok(!isChartUrl('https://evil.com/chart/?x=tradingview.com'));
  assert.ok(!isChartUrl('https://tradingview.com.evil.com/chart/'));
  assert.ok(!isChartUrl('http://www.tradingview.com/chart/'));
});

test('CDP sockets must be loopback on the expected port', () => {
  assert.equal(validateSocket('ws://127.0.0.1:9222/devtools/page/ABC', 9222, 'ABC'), 'ws://127.0.0.1:9222/devtools/page/ABC');
  assert.equal(validateSocket('ws://localhost:9222/devtools/page/ABC', 9222, 'ABC'), 'ws://127.0.0.1:9222/devtools/page/ABC');
  assert.throws(() => validateSocket('ws://10.0.0.5:9222/devtools/page/ABC', 9222, 'ABC'));
  assert.throws(() => validateSocket('ws://127.0.0.1:9333/devtools/page/ABC', 9222, 'ABC'));
  const list = [
    { id: 'A', type: 'page', url: 'https://www.tradingview.com/chart/x/', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/A' },
    { id: 'B', type: 'page', url: 'https://www.tradingview.com/', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/B' },
    { id: 'C', type: 'service_worker', url: 'https://www.tradingview.com/chart/sw.js', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/C' },
  ];
  assert.deepEqual(chartTargets(list, 9222).map((t) => t.id), ['A']);
});

test('environment scrub removes ELECTRON_RUN_AS_NODE and NODE_OPTIONS only', () => {
  const env = scrubEnv({ ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--inspect', PATH: '/bin', ELECTRON_OZONE_PLATFORM_HINT: 'auto' });
  assert.deepEqual(env, { PATH: '/bin', ELECTRON_OZONE_PLATFORM_HINT: 'auto' });
});

test('candidate paths per platform and MSIX script', () => {
  assert.ok(candidatePaths({ platform: 'darwin', home: '/Users/a' }).includes('/Users/a/Applications/TradingView.app/Contents/MacOS/TradingView'));
  const win = candidatePaths({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' } });
  assert.ok(win[0].endsWith('Programs\\TradingView\\TradingView.exe'));
  assert.deepEqual(candidatePaths({ platform: 'win32', env: { LOCALAPPDATA: 'relative' } }), []);
  const ps = msixActivationScript(9222);
  assert.match(ps, /Get-AppxPackage -Name 'TradingView\.Desktop'/);
  assert.match(ps, /--remote-debugging-port=9222 --remote-debugging-address=127\.0\.0\.1/);
  assert.throws(() => msixActivationScript('9222; rm -rf /'));
});
