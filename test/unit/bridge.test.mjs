import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSymbol, formatSymbol, translateAll, frontMonth, describe, selectionToTradingView } from '../../src/modules/bridge/symbols.js';
import { parseWatchlist, convertWatchlist } from '../../src/modules/bridge/watchlists.js';
import { openLinks } from '../../src/modules/bridge/links.js';

const now = new Date('2026-10-11T12:00:00Z');
const all = (s) => Object.fromEntries(translateAll(s, { now }).rows.map((r) => [r.id, r.value]));

test('one ES contract, every platform spelling, round-trips', () => {
  const t = all('CME_MINI:ESZ2026');
  assert.deepEqual(t, {
    tradingview: 'CME_MINI:ESZ2026', ninjatrader: 'ES 12-26', tradovate: 'ESZ6', projectx: 'CON.F.US.EP.Z26', thinkorswim: '/ESZ26',
    sierra: 'ESZ26-CME', rithmic: 'ESZ6', ibkr: 'ESZ6', metatrader: null, yahoo: 'ES=F', binance: null, coinbase: null,
  });
  for (const [platform, v] of Object.entries(t)) {
    if (!v || platform === 'yahoo') continue;
    const c = parseSymbol(v, { now });
    assert.equal(formatSymbol(c, 'tradingview'), 'CME_MINI:ESZ2026', `${platform} ${v}`);
  }
});

test('futures parsing across platforms and edge roots', () => {
  assert.deepEqual(parseSymbol('NQ 03-27', { now }), { kind: 'future', root: 'NQ', month: 'H', year: 2027, continuous: 0, from: 'ninjatrader' });
  assert.equal(formatSymbol(parseSymbol('CON.F.US.ENQ.H27'), 'tradingview'), 'CME_MINI:NQH2027');
  assert.equal(formatSymbol(parseSymbol('MNQZ6', { now }), 'ninjatrader'), 'MNQ 12-26');
  assert.equal(formatSymbol(parseSymbol('6EZ6', { now }), 'tradingview'), 'CME:6EZ2026');
  assert.equal(formatSymbol(parseSymbol('M2KH7', { now }), 'thinkorswim'), '/M2KH27');
  assert.equal(formatSymbol(parseSymbol('GCZ26-COMEX'), 'tradovate'), 'GCZ6');
  assert.equal(formatSymbol(parseSymbol('/CLX26'), 'sierra'), 'CLX26-NYMEX');
  assert.equal(formatSymbol(parseSymbol('YM1!'), 'tradingview'), 'CBOT_MINI:YM1!');
  assert.equal(formatSymbol(parseSymbol('NQ=F'), 'thinkorswim'), '/NQ');
  assert.equal(formatSymbol(parseSymbol('ES1!'), 'tradovate'), null, 'continuous has no Tradovate spelling');
  assert.equal(formatSymbol(parseSymbol('ES ##-##'), 'tradingview'), 'CME_MINI:ES1!');
  assert.equal(parseSymbol('ESZ6', { now: new Date('2029-03-01Z') }).year, 2036, 'single-digit year never resolves into the past');
  assert.equal(parseSymbol('ESH9', { now }).year, 2029);
  assert.equal(describe(parseSymbol('ESZ2026')), 'E-mini S&P 500 · Dec 2026');
});

test('ProjectX: unknown roots are flagged unverified; user overrides apply both ways', () => {
  const r = translateAll('CLZ2026').rows.find((x) => x.id === 'projectx');
  assert.equal(r.value, 'CON.F.US.CL.Z26');
  assert.equal(r.unverified, true);
  assert.equal(translateAll('NQZ2026').rows.find((x) => x.id === 'projectx').unverified, false);
  assert.equal(translateAll('ESZ2026').rows.find((x) => x.id === 'projectx').unverified, true, 'EP not confirmed from a published source');
  const opts = { projectxRoots: { CL: 'CLE' } };
  assert.equal(formatSymbol(parseSymbol('CLZ2026'), 'projectx', opts), 'CON.F.US.CLE.Z26');
  assert.equal(parseSymbol('CON.F.US.CLE.Z26', opts).root, 'CL');
});

test('stocks, crypto, forex, indexes', () => {
  assert.deepEqual(all('NASDAQ:AAPL'), { tradingview: 'NASDAQ:AAPL', ninjatrader: 'AAPL', tradovate: null, projectx: null, thinkorswim: 'AAPL', sierra: null, rithmic: null, ibkr: 'AAPL', metatrader: 'AAPL', yahoo: 'AAPL', binance: null, coinbase: null });
  assert.equal(formatSymbol(parseSymbol('BRK-B'), 'tradingview'), 'BRK.B');
  assert.equal(formatSymbol(parseSymbol('NYSE:BRK.B'), 'yahoo'), 'BRK-B');
  const btc = parseSymbol('BINANCE:BTCUSDT');
  assert.deepEqual([formatSymbol(btc, 'coinbase'), formatSymbol(btc, 'yahoo'), formatSymbol(btc, 'binance')], ['BTC-USD', 'BTC-USD', 'BTCUSDT']);
  assert.equal(formatSymbol(parseSymbol('BTC-USD'), 'tradingview'), 'COINBASE:BTCUSD');
  assert.equal(formatSymbol(parseSymbol('ETHUSDT'), 'tradingview'), 'BINANCE:ETHUSDT');
  assert.equal(parseSymbol('BYBIT:SOLUSDT.P').perp, true);
  assert.equal(formatSymbol(parseSymbol('XBT-USD'), 'binance'), 'BTCUSDT');
  const eu = parseSymbol('OANDA:EURUSD');
  assert.deepEqual(['yahoo', 'thinkorswim', 'ibkr', 'metatrader'].map((p) => formatSymbol(eu, p)), ['EURUSD=X', 'EUR/USD', 'EUR.USD', 'EURUSD']);
  assert.equal(formatSymbol(parseSymbol('EURUSD=X'), 'tradingview'), 'FX:EURUSD');
  assert.equal(formatSymbol(parseSymbol('^GSPC'), 'tradingview'), 'SP:SPX');
  assert.equal(formatSymbol(parseSymbol('SP:SPX'), 'thinkorswim'), '$SPX');
  assert.equal(parseSymbol(''), null);
  assert.equal(parseSymbol('hello world this is not a symbol'), null);
});

test('front month estimate for quarterly roots; monthly products left to the user', () => {
  assert.equal(formatSymbol(frontMonth(parseSymbol('ES1!'), now), 'tradovate'), 'ESZ6');
  assert.equal(formatSymbol(frontMonth(parseSymbol('ES1!'), new Date('2026-12-15Z')), 'tradovate'), 'ESH7');
  assert.equal(formatSymbol(frontMonth(parseSymbol('NQ1!'), new Date('2026-12-03Z')), 'tradovate'), 'NQZ6');
  assert.equal(frontMonth(parseSymbol('CL1!'), now).continuous, 1);
});

test('watchlists: TradingView export with sections → other platforms and back', () => {
  const tv = '###FUTURES,CME_MINI:ESZ2026,CME_MINI:NQZ2026,###TECH,NASDAQ:AAPL,NASDAQ:MSFT,###CRYPTO,BINANCE:BTCUSDT';
  const wl = parseWatchlist(tv);
  assert.equal(wl.source, 'tradingview');
  assert.deepEqual(wl.sections.map((s) => [s.name, s.symbols.length]), [['FUTURES', 2], ['TECH', 2], ['CRYPTO', 1]]);
  const nt = convertWatchlist(tv, 'ninjatrader');
  assert.equal(nt.text, 'ES 12-26\nNQ 12-26\nAAPL\nMSFT');
  assert.deepEqual(nt.skipped.map((s) => s.symbol), ['BINANCE:BTCUSDT']);
  assert.equal(nt.droppedSections, true);
  const back = convertWatchlist(convertWatchlist(tv, 'csv').text, 'tradingview');
  assert.equal(back.text, tv);
  assert.equal(convertWatchlist(tv, 'tradovate').text, 'ESZ6\nNQZ6');
});

test('watchlists: Finviz/Yahoo CSV, quoted cells, plain lines, injection-safe CSV', () => {
  const finviz = 'No.,Ticker,Company,Sector\n1,AAPL,"Apple Inc.","Technology"\n2,"MSFT","Microsoft, Corp",Technology\n';
  assert.deepEqual(parseWatchlist(finviz).sections[0].symbols, ['AAPL', 'MSFT']);
  assert.equal(convertWatchlist(finviz, 'tradingview').text, 'AAPL,MSFT');
  assert.deepEqual(parseWatchlist('/ESZ26\n/NQZ26\n\n# metals\n/GCZ26\n').sections.map((s) => s.symbols), [['/ESZ26', '/NQZ26'], ['/GCZ26']]);
  assert.equal(convertWatchlist('/ESZ26\n/ESZ26\nESZ6', 'thinkorswim', { now }).text, '/ESZ26', 'duplicates collapse');
  const evil = convertWatchlist({ sections: [{ name: '=cmd()', symbols: ['AAPL'] }] }, 'csv');
  assert.equal(evil.text, "Symbol,Section\nAAPL,'=cmd()");
  assert.equal(parseWatchlist('').sections.length, 0);
});

test('open-in links per asset class', () => {
  assert.deepEqual(openLinks(parseSymbol('NASDAQ:AAPL')).map((l) => l.id), ['tradingview', 'yahoo', 'finviz', 'stocktwits', 'edgar']);
  assert.equal(openLinks(parseSymbol('NASDAQ:AAPL'))[0].url, 'https://www.tradingview.com/chart/?symbol=NASDAQ%3AAAPL');
  assert.ok(openLinks(parseSymbol('BTC-USD')).some((l) => l.url === 'https://www.binance.com/en/trade/BTC_USDT'));
  assert.equal(openLinks(parseSymbol('ES 12-26'))[0].url, 'https://www.tradingview.com/chart/?symbol=CME_MINI%3AESZ2026');
  assert.deepEqual(openLinks(null), []);
});

test('context menu selection → TradingView symbol', () => {
  assert.equal(selectionToTradingView('$NVDA,'), 'NVDA');
  assert.equal(selectionToTradingView('ES 12-26 long here'), 'CME_MINI:ESZ2026');
  assert.equal(selectionToTradingView('(BTC-USD)'), 'COINBASE:BTCUSD');
  assert.equal(selectionToTradingView('/NQ'), 'CME_MINI:NQ1!');
  assert.equal(selectionToTradingView('   '), null);
});
