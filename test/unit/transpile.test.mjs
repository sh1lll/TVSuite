import test from 'node:test';
import assert from 'node:assert/strict';
import { transpile, detectLanguage, EXAMPLES } from '../../src/modules/indicators/transpile.js';

const body = (pine) => pine.split('\n').slice(2).join('\n').trim();

test('Python example → Pine v6', () => {
  const { pine, lang } = transpile(EXAMPLES.python);
  assert.equal(lang, 'python');
  assert.ok(pine.startsWith('//@version=6\n'));
  assert.equal(body(pine), `indicator("EMA cross", overlay=true)

fast_len = input.int(9, "Fast length")
slow_len = input.int(21, "Slow length")
fast = ta.ema(close, fast_len)
slow = ta.ema(close, slow_len)
plot(fast, "Fast", color=#2962ff)
plot(slow, "Slow", color=#f23645)
cross_up = ta.crossover(fast, slow)
cross_down = ta.crossunder(fast, slow)
plotshape(cross_up, "Buy", shape.triangleup, location.belowbar, #22c55e)
plotshape(cross_down, "Sell", shape.triangledown, location.abovebar, #f23645)
bgcolor(fast > slow ? #22c55e22 : na)
alertcondition(cross_up, "Cross up", "Fast EMA crossed above slow")`);
});

test('JavaScript example: pragma header, if/else if, reassignment with :=, === and null', () => {
  const { pine, lang } = transpile(EXAMPLES.js);
  assert.equal(lang, 'js');
  assert.equal(body(pine), `indicator("RSI zones", overlay=false)

len = input.int(14, "RSI length")
r = ta.rsi(close, len)
zone = 0
if r > 70
    zone := 1
else if r < 30
    zone := -1
plot(r, "RSI", #9a6bff)
hline(70, "Overbought", #f23645)
hline(30, "Oversold", #22c55e)
bgcolor(zone == 1 ? #f2364522 : zone == -1 ? #22c55e22 : na)
alertcondition(ta.crossunder(r, 30), "Oversold", "RSI dropped below 30")`);
});

test('Java example: typed declarations, && and history references', () => {
  const { pine, lang } = transpile(EXAMPLES.java);
  assert.equal(lang, 'java');
  assert.match(pine, /indicator\("Volatility bands", overlay=true\)/);
  assert.match(pine, /^mult = input\.float\(2\.0, "Multiplier"\)$/m);
  assert.match(pine, /^breakout = close > upper and close\[1\] <= upper\[1\]$/m);
  assert.match(pine, /plotshape\(breakout, "Breakout", shape\.arrowup, location\.belowbar, #22c55e\)/);
});

test('functions, math mapping, operators', () => {
  const py = transpile(`def hl_range(n):
    hi = ta.highest(high, n)
    lo = ta.lowest(low, n)
    return hi - lo

r = hl_range(20)
x = abs(close - open) ** 2 // 3
ok = not (r > 10) and x != 0
plot(max(r, 1))
`, { lang: 'python' }).pine;
  assert.match(py, /^hl_range\(n\) =>\n    hi = ta\.highest\(high, n\)\n    lo = ta\.lowest\(low, n\)\n    hi - lo$/m);
  assert.match(py, /^x = math\.floor\(math\.pow\(math\.abs\(close - open\), 2\) \/ 3\)$/m);
  assert.match(py, /^ok = not \(r > 10\) and x != 0$/m);
  assert.match(py, /^plot\(math\.max\(r, 1\)\)$/m);
  const js = transpile(`const mid = (a, b) => (a + b) / 2;
function score(x) { return x > 0 ? 1 : -1; }
const m = mid(high, low);
plot(m, "Mid", { color: "#ffffff", linewidth: 2 });
const s = Math.max(score(close - m), 0) || 0;`, { lang: 'js' }).pine;
  assert.match(js, /^mid\(a, b\) => \(a \+ b\) \/ 2$/m);
  assert.match(js, /^score\(x\) => x > 0 \? 1 : -1$/m);
  assert.match(js, /^plot\(m, "Mid", color=#ffffff, linewidth=2\)$/m);
  assert.match(js, /^s = math\.max\(score\(close - m\), 0\) or 0$/m);
  const elif = transpile(`v = 0
if close > open:
    v = 1
elif close < open:
    v = -1
else:
    v = 0
plot(v)`, { lang: 'python' }).pine;
  assert.match(elif, /^if close > open\n    v := 1\nelse if close < open\n    v := -1\nelse\n    v := 0$/m);
});

test('helpful errors with line numbers; imports ignored; language detection', () => {
  assert.throws(() => transpile('x = 0\nfor i in range(10):\n    x = x + i', { lang: 'python' }), /Line 2: Loops aren’t translated/);
  assert.throws(() => transpile('public class Ind { }', { lang: 'java' }), /no class\/method wrapper/);
  assert.throws(() => transpile('let a = [1, 2]', { lang: 'js' }), /Arrays aren’t supported/);
  assert.throws(() => transpile('x++', { lang: 'js' }), /\+\+/);
  assert.throws(() => transpile('print(close)', { lang: 'python' }), /print\(\) has no Pine equivalent/);
  assert.match(transpile('import tvsuite\nplot(close)', { lang: 'python' }).pine, /^plot\(close\)$/m);
  assert.equal(detectLanguage(EXAMPLES.python), 'python');
  assert.equal(detectLanguage(EXAMPLES.js), 'js');
  assert.equal(detectLanguage(EXAMPLES.java), 'java');
});
