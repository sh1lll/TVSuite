import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseInterval, spokenSymbol } from '../../src/modules/voice/commands.js';

test('intervals', () => {
  assert.equal(parseInterval('five minute'), '5');
  assert.equal(parseInterval('15 min chart'), '15');
  assert.equal(parseInterval('one hour'), '60');
  assert.equal(parseInterval('4h'), '240');
  assert.equal(parseInterval('daily'), 'D');
  assert.equal(parseInterval('30 seconds'), '30S');
  assert.equal(parseInterval('weekly'), 'W');
  assert.equal(parseInterval('nothing'), null);
});

test('symbols: aliases, spelled letters, plain tickers', () => {
  assert.equal(spokenSymbol('nasdaq'), 'NQ1!');
  assert.equal(spokenSymbol('micro nasdaq five minute'), 'MNQ1!');
  assert.equal(spokenSymbol('N V D A'), 'NVDA');
  assert.equal(spokenSymbol('e s'), 'ES1!');
  assert.equal(spokenSymbol('the gold chart'), 'GC1!');
  assert.equal(spokenSymbol('AAPL'), 'AAPL');
  assert.equal(spokenSymbol('bitcoin'), 'BTCUSD');
});

test('commands', () => {
  const cases = [
    ['show N Q five minute', { action: 'symbol', symbol: 'NQ1!', interval: '5' }],
    ['hey TVSuite, switch to gold daily', { action: 'symbol', symbol: 'GC1!', interval: 'D' }],
    ['open tesla', { action: 'symbol', symbol: 'TSLA', interval: null }],
    ['one hour chart', { action: 'symbol', symbol: null, interval: '60' }],
    ['journal this', { action: 'journal' }],
    ['take a screenshot', { action: 'card' }],
    ['start recording', { action: 'record', on: true }],
    ['stop recording', { action: 'record', on: false }],
    ['log a loss of 200', { action: 'trade', pnl: -200 }],
    ['add a win of $350.50', { action: 'trade', pnl: 350.5 }],
    ['I lost 120', { action: 'trade', pnl: -120 }],
    ['set an alert at 21,500', { action: 'alert', level: 21500 }],
    ["what's my P&L", { action: 'pnl' }],
    ['how am I doing', { action: 'pnl' }],
    ['what is the price', { action: 'price' }],
    ['when does New York open', { action: 'session', name: 'new york' }],
    ['mute', { action: 'mute' }],
    ['unmute', { action: 'unmute' }],
    ['skin off', { action: 'skin', on: false }],
    ['next skin', { action: 'nextSkin' }],
    ['mini chart', { action: 'mini' }],
    ['focus mode', { action: 'focus' }],
    ['help', { action: 'help' }],
  ];
  for (const [text, want] of cases) assert.deepEqual(parseCommand(text), want, text);
  assert.equal(parseCommand('the weather is nice today'), null);
  assert.equal(parseCommand(''), null);
});
