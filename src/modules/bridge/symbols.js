// Platform Bridge: one canonical instrument, many platform spellings.
// parseSymbol(text) understands TradingView, NinjaTrader, Tradovate/Rithmic/IBKR, ProjectX/TopstepX,
// thinkorswim, Sierra Chart, Yahoo, Binance, Coinbase and plain tickers; formatSymbol(canon, platform)
// writes it back out. Pure functions, unit-tested.

export const MONTH_CODES = 'FGHJKMNQUVXZ'; // Jan..Dec
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Futures roots → TradingView exchange prefix, Sierra Chart exchange suffix, ProjectX root.
// `px` is the ProjectX/TopstepX contract root. `pxOk` marks roots confirmed from published contract ids
// (CON.F.US.ENQ.U25, CON.F.US.MNQ.Z26); everything else is flagged "unverified" in the UI and can be
// overridden per root in Bridge settings.
export const FUTURES = {
  ES: { ex: 'CME_MINI', sc: 'CME', px: 'EP', name: 'E-mini S&P 500' },
  MES: { ex: 'CME_MINI', sc: 'CME', px: 'MES', name: 'Micro E-mini S&P 500' },
  NQ: { ex: 'CME_MINI', sc: 'CME', px: 'ENQ', pxOk: true, name: 'E-mini Nasdaq-100' },
  MNQ: { ex: 'CME_MINI', sc: 'CME', px: 'MNQ', pxOk: true, name: 'Micro E-mini Nasdaq-100' },
  RTY: { ex: 'CME_MINI', sc: 'CME', name: 'E-mini Russell 2000' },
  M2K: { ex: 'CME_MINI', sc: 'CME', name: 'Micro E-mini Russell 2000' },
  YM: { ex: 'CBOT_MINI', sc: 'CBOT', name: 'E-mini Dow' },
  MYM: { ex: 'CBOT_MINI', sc: 'CBOT', name: 'Micro E-mini Dow' },
  CL: { ex: 'NYMEX', sc: 'NYMEX', name: 'Crude Oil' },
  MCL: { ex: 'NYMEX', sc: 'NYMEX', name: 'Micro Crude Oil' },
  NG: { ex: 'NYMEX', sc: 'NYMEX', name: 'Natural Gas' },
  RB: { ex: 'NYMEX', sc: 'NYMEX', name: 'RBOB Gasoline' },
  HO: { ex: 'NYMEX', sc: 'NYMEX', name: 'Heating Oil' },
  GC: { ex: 'COMEX', sc: 'COMEX', name: 'Gold' },
  MGC: { ex: 'COMEX', sc: 'COMEX', name: 'Micro Gold' },
  SI: { ex: 'COMEX', sc: 'COMEX', name: 'Silver' },
  HG: { ex: 'COMEX', sc: 'COMEX', name: 'Copper' },
  ZB: { ex: 'CBOT', sc: 'CBOT', name: '30-Year T-Bond' },
  ZN: { ex: 'CBOT', sc: 'CBOT', name: '10-Year T-Note' },
  ZF: { ex: 'CBOT', sc: 'CBOT', name: '5-Year T-Note' },
  ZT: { ex: 'CBOT', sc: 'CBOT', name: '2-Year T-Note' },
  ZC: { ex: 'CBOT', sc: 'CBOT', name: 'Corn' },
  ZS: { ex: 'CBOT', sc: 'CBOT', name: 'Soybeans' },
  ZW: { ex: 'CBOT', sc: 'CBOT', name: 'Wheat' },
  '6E': { ex: 'CME', sc: 'CME', name: 'Euro FX' },
  '6J': { ex: 'CME', sc: 'CME', name: 'Japanese Yen' },
  '6B': { ex: 'CME', sc: 'CME', name: 'British Pound' },
  '6A': { ex: 'CME', sc: 'CME', name: 'Australian Dollar' },
  '6C': { ex: 'CME', sc: 'CME', name: 'Canadian Dollar' },
  BTC: { ex: 'CME', sc: 'CME', name: 'Bitcoin futures' },
  MBT: { ex: 'CME', sc: 'CME', name: 'Micro Bitcoin futures' },
  HE: { ex: 'CME', sc: 'CME', name: 'Lean Hogs' },
  LE: { ex: 'CME', sc: 'CME', name: 'Live Cattle' },
};
const PX_TO_ROOT = Object.fromEntries(Object.entries(FUTURES).filter(([, v]) => v.px).map(([k, v]) => [v.px, k]));
const FUT_EXCHANGES = new Set(['CME', 'CME_MINI', 'CBOT', 'CBOT_MINI', 'NYMEX', 'COMEX', 'ICEUS', 'ICEEUR', 'EUREX']);
const CRYPTO_EXCHANGES = new Set(['BINANCE', 'BINANCEUS', 'COINBASE', 'BYBIT', 'KRAKEN', 'BITSTAMP', 'OKX', 'BITGET', 'BITFINEX', 'GEMINI', 'KUCOIN', 'MEXC', 'CRYPTO', 'CRYPTOCAP', 'BITMEX', 'DERIBIT', 'HTX', 'GATEIO']);
const FX_EXCHANGES = new Set(['FX', 'FX_IDC', 'OANDA', 'FOREXCOM', 'FXCM', 'PEPPERSTONE', 'ICMARKETS', 'SAXO', 'CAPITALCOM', 'EIGHTCAP', 'BLACKBULL']);
const FIAT = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'SEK', 'NOK', 'DKK', 'SGD', 'HKD', 'MXN', 'ZAR', 'TRY', 'PLN', 'CNH', 'HUF', 'CZK']);
const QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'BNB', 'TRY', 'JPY'];
const CRYPTO_BASES = new Set(['BTC', 'XBT', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX', 'LINK', 'LTC', 'DOT', 'MATIC', 'POL', 'TRX', 'TON', 'SHIB', 'BCH', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'PEPE', 'ATOM', 'UNI', 'FIL', 'INJ', 'TIA', 'SEI', 'WIF', 'HBAR', 'XLM', 'ETC', 'AAVE', 'RNDR', 'FET', 'ENA', 'JUP', 'BONK', 'HYPE']);
// Yahoo index tickers ↔ TradingView symbols.
const INDEXES = [['^GSPC', 'SP:SPX', '$SPX', 'SPX'], ['^DJI', 'DJ:DJI', '$DJI', 'DJI'], ['^IXIC', 'NASDAQ:IXIC', '$COMPX', 'IXIC'], ['^NDX', 'NASDAQ:NDX', '$NDX', 'NDX'],
  ['^RUT', 'TVC:RUT', '$RUT', 'RUT'], ['^VIX', 'CBOE:VIX', '$VIX', 'VIX'], ['DX-Y.NYB', 'TVC:DXY', '$DXY', 'DXY'], ['^N225', 'TVC:NI225', null, 'NI225'], ['^GDAXI', 'XETR:DAX', null, 'DAX'], ['^FTSE', 'TVC:UKX', null, 'UKX']];

export const PLATFORMS = [
  { id: 'tradingview', name: 'TradingView' },
  { id: 'ninjatrader', name: 'NinjaTrader' },
  { id: 'tradovate', name: 'Tradovate' },
  { id: 'projectx', name: 'ProjectX / TopstepX', note: 'Contract id. Confirmed for NQ (ENQ) and MNQ; other roots are a best guess — override in Bridge settings' },
  { id: 'thinkorswim', name: 'thinkorswim' },
  { id: 'sierra', name: 'Sierra Chart', note: 'Denali/CME data feed style' },
  { id: 'rithmic', name: 'Rithmic / R|Trader' },
  { id: 'ibkr', name: 'Interactive Brokers', note: 'Local symbol' },
  { id: 'metatrader', name: 'MetaTrader 4/5', note: 'Brokers often add a suffix (EURUSD.a, US500)' },
  { id: 'yahoo', name: 'Yahoo Finance' },
  { id: 'binance', name: 'Binance' },
  { id: 'coinbase', name: 'Coinbase' },
];

const yr4 = (y) => (y < 100 ? 2000 + y : y);
const fut = (root, month, year, extra = {}) => ({ kind: 'future', root, month, year: year == null ? null : yr4(+year), continuous: year == null ? (extra.continuous || 1) : 0, ...extra });
function splitPair(s) {
  for (const q of QUOTES) if (s.length > q.length && s.endsWith(q)) return { base: s.slice(0, -q.length), quote: q };
  return null;
}
// Single-digit years (ESZ6) resolve to the nearest year that isn't in the past decade: 6 → 2026 in 2026..2035.
function yearFromDigit(d, now = new Date()) {
  const y = now.getUTCFullYear(), base = y - (y % 10);
  let c = base + d;
  if (c < y - 1) c += 10;
  return c;
}

export function parseSymbol(input, { now = new Date(), projectxRoots = {} } = {}) {
  let s = String(input || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s || s.length > 40) return null;
  const pxMap = { ...PX_TO_ROOT, ...Object.fromEntries(Object.entries(projectxRoots).map(([root, px]) => [String(px).toUpperCase(), root])) };
  let m;
  // ProjectX / TopstepX contract id: CON.F.US.EP.Z26
  if ((m = s.match(/^CON\.F\.US\.([A-Z0-9]+)\.([FGHJKMNQUVXZ])(\d{2})$/))) return fut(pxMap[m[1]] || m[1], m[2], m[3], { from: 'projectx' });
  // NinjaTrader: "ES 12-26", continuous "ES ##-##"
  if ((m = s.match(/^([A-Z0-9]{1,5}) (\d{2})-(\d{2})$/))) { const mo = +m[2]; if (mo >= 1 && mo <= 12) return fut(m[1], MONTH_CODES[mo - 1], m[3], { from: 'ninjatrader' }); }
  if ((m = s.match(/^([A-Z0-9]{1,5}) ##-##$/))) return fut(m[1], null, null, { from: 'ninjatrader' });
  // thinkorswim: /ESZ26, /ES, /ESZ26:XCME
  if ((m = s.match(/^\/([A-Z0-9]{1,4}?)([FGHJKMNQUVXZ])(\d{2})(?::[A-Z]+)?$/))) return fut(m[1], m[2], m[3], { from: 'thinkorswim' });
  if ((m = s.match(/^\/([A-Z0-9]{1,4})$/))) return fut(m[1], null, null, { from: 'thinkorswim' });
  // Sierra Chart: ESZ26-CME, ESZ6.CME
  if ((m = s.match(/^([A-Z0-9]{1,4}?)([FGHJKMNQUVXZ])(\d{1,2})[-.](CME|CBOT|NYMEX|COMEX|CFE|ICE[A-Z]*|EUREX)$/))) return fut(m[1], m[2], m[3].length === 1 ? yearFromDigit(+m[3], now) : m[3], { from: 'sierra' });
  // Yahoo: ES=F, EURUSD=X, ^GSPC, BTC-USD
  if ((m = s.match(/^([A-Z0-9]{1,4})=F$/))) return fut(m[1], null, null, { from: 'yahoo' });
  if ((m = s.match(/^([A-Z]{3})([A-Z]{3})=X$/))) return { kind: 'forex', base: m[1], quote: m[2], from: 'yahoo' };
  const idx = INDEXES.find((r) => r.slice(0, 3).includes(s));
  if (idx) return { kind: 'index', ticker: idx[3], from: idx[0] === s ? 'yahoo' : 'tradingview' };
  if ((m = s.match(/^([A-Z0-9]{2,10})-(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/)) && !FIAT.has(m[1])) return { kind: 'crypto', base: m[1] === 'XBT' ? 'BTC' : m[1], quote: m[2], from: 'coinbase' };
  // FX with a slash or IBKR dot: EUR/USD, EUR.USD
  if ((m = s.match(/^([A-Z]{3})[/.]([A-Z]{3})$/)) && FIAT.has(m[1]) && FIAT.has(m[2])) return { kind: 'forex', base: m[1], quote: m[2] };
  // TradingView with exchange prefix
  let exchange = null;
  if ((m = s.match(/^([A-Z0-9_]{2,20}):(.+)$/))) { exchange = m[1]; s = m[2]; }
  // Continuous future: ES1!, CME_MINI:NQ2!
  if ((m = s.match(/^([A-Z0-9]{1,5})([12])!$/))) return fut(m[1], null, null, { continuous: +m[2], exchange, from: 'tradingview' });
  // Dated contract: ESZ2026 (TradingView), ESZ26, ESZ6 (Tradovate/Rithmic/IBKR)
  if ((m = s.match(/^([A-Z0-9]{1,4}?)([FGHJKMNQUVXZ])(\d{4}|\d{2}|\d)$/)) && (FUTURES[m[1]] || (exchange && FUT_EXCHANGES.has(exchange)) || m[3].length === 4)) {
    const y = m[3].length === 1 ? yearFromDigit(+m[3], now) : m[3];
    return fut(m[1], m[2], y, { exchange, from: m[3].length === 4 ? 'tradingview' : 'tradovate' });
  }
  if (exchange && CRYPTO_EXCHANGES.has(exchange)) {
    const p = splitPair(s.replace(/\.P$|PERP$/, ''));
    if (p) return { kind: 'crypto', ...p, base: p.base === 'XBT' ? 'BTC' : p.base, exchange, perp: /\.P$|PERP$/.test(s) };
  }
  if ((exchange && FX_EXCHANGES.has(exchange)) || (!exchange && /^[A-Z]{6}$/.test(s) && FIAT.has(s.slice(0, 3)) && FIAT.has(s.slice(3)))) {
    if (/^[A-Z]{6}$/.test(s)) return { kind: 'forex', base: s.slice(0, 3), quote: s.slice(3), exchange };
  }
  if (!exchange) { const p = splitPair(s); if (p && CRYPTO_BASES.has(p.base)) return { kind: 'crypto', ...p, base: p.base === 'XBT' ? 'BTC' : p.base }; }
  if (/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(s)) return { kind: 'stock', ticker: s.replace(/-(?=[A-Z]$)/, '.'), exchange };
  return null;
}

const MM = (code) => String(MONTH_CODES.indexOf(code) + 1).padStart(2, '0');
const YY = (y) => String(y % 100).padStart(2, '0');
const usd = (q) => (q === 'USDT' || q === 'USDC' || q === 'FDUSD' ? 'USD' : q);

// Returns the platform's spelling, or null when the platform has no equivalent.
export function formatSymbol(c, platform, { projectxRoots = {} } = {}) {
  if (!c) return null;
  if (c.kind === 'future') {
    const info = FUTURES[c.root] || {};
    const dated = !c.continuous && c.month && c.year;
    switch (platform) {
      case 'tradingview': return `${c.exchange || info.ex || 'CME'}:${c.root}${dated ? `${c.month}${c.year}` : `${c.continuous || 1}!`}`;
      case 'ninjatrader': return dated ? `${c.root} ${MM(c.month)}-${YY(c.year)}` : `${c.root} ##-##`;
      case 'tradovate': case 'rithmic': case 'ibkr': return dated ? `${c.root}${c.month}${c.year % 10}` : null;
      case 'projectx': return dated ? `CON.F.US.${projectxRoots[c.root] || info.px || c.root}.${c.month}${YY(c.year)}` : null;
      case 'thinkorswim': return dated ? `/${c.root}${c.month}${YY(c.year)}` : `/${c.root}`;
      case 'sierra': return dated ? `${c.root}${c.month}${YY(c.year)}-${info.sc || 'CME'}` : null;
      case 'yahoo': return `${c.root}=F`;
      default: return null;
    }
  }
  if (c.kind === 'stock') {
    switch (platform) {
      case 'tradingview': return c.exchange ? `${c.exchange}:${c.ticker}` : c.ticker;
      case 'yahoo': return c.ticker.replace('.', '-');
      case 'binance': case 'coinbase': case 'projectx': case 'sierra': return null;
      case 'ibkr': case 'tradovate': case 'rithmic': return platform === 'ibkr' ? c.ticker.replace('.', ' ') : null;
      default: return c.ticker;
    }
  }
  if (c.kind === 'crypto') {
    switch (platform) {
      case 'tradingview': { const ex = c.exchange || (c.quote === 'USD' ? 'COINBASE' : 'BINANCE'); return `${ex}:${c.base}${c.quote}${c.perp ? '.P' : ''}`; }
      case 'binance': return `${c.base}${c.quote === 'USD' ? 'USDT' : c.quote}`;
      case 'coinbase': case 'yahoo': return `${c.base}-${usd(c.quote)}`;
      case 'metatrader': return `${c.base}${usd(c.quote)}`;
      default: return null;
    }
  }
  if (c.kind === 'forex') {
    switch (platform) {
      case 'tradingview': return `${c.exchange || 'FX'}:${c.base}${c.quote}`;
      case 'yahoo': return `${c.base}${c.quote}=X`;
      case 'thinkorswim': return `${c.base}/${c.quote}`;
      case 'ibkr': return `${c.base}.${c.quote}`;
      case 'ninjatrader': case 'metatrader': return `${c.base}${c.quote}`;
      default: return null;
    }
  }
  if (c.kind === 'index') {
    const r = INDEXES.find((x) => x[3] === c.ticker);
    switch (platform) {
      case 'tradingview': return r ? r[1] : c.ticker;
      case 'yahoo': return r ? r[0] : null;
      case 'thinkorswim': return r?.[2] || null;
      default: return null;
    }
  }
  return null;
}

export function describe(c) {
  if (!c) return 'Unrecognized';
  if (c.kind === 'future') {
    const name = FUTURES[c.root]?.name || `${c.root} futures`;
    return c.continuous ? `${name} · continuous` : `${name} · ${MONTH_NAMES[MONTH_CODES.indexOf(c.month)]} ${c.year}`;
  }
  if (c.kind === 'crypto') return `${c.base}/${c.quote}${c.perp ? ' perpetual' : ''}`;
  if (c.kind === 'forex') return `${c.base}/${c.quote}`;
  if (c.kind === 'index') return `${c.ticker} index`;
  return `${c.ticker}${c.exchange ? ` · ${c.exchange}` : ''}`;
}

// Translate one symbol to every platform: [{ id, name, value|null, note }].
export function translateAll(input, opts = {}) {
  const c = typeof input === 'string' ? parseSymbol(input, opts) : input;
  return { canon: c, label: describe(c), rows: PLATFORMS.map((p) => ({ ...p, value: formatSymbol(c, p.id, opts), unverified: p.id === 'projectx' && c?.kind === 'future' && !FUTURES[c.root]?.pxOk && !opts.projectxRoots?.[c.root] })) };
}

// Front-month contract for a continuous root, for platforms that need a dated contract.
// Quarterly (H M U Z) equity index/FX/rates only, rolling around the 8th of the expiry month (an estimate).
const QUARTERLY = new Set(['ES', 'MES', 'NQ', 'MNQ', 'RTY', 'M2K', 'YM', 'MYM', '6E', '6J', '6B', '6A', '6C', 'ZB', 'ZN', 'ZF', 'ZT']);
export function frontMonth(c, now = new Date()) {
  if (!c || c.kind !== 'future' || !c.continuous) return c;
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate();
  if (QUARTERLY.has(c.root)) {
    for (let k = 0; k < 6; k++) {
      const m = mo + k, yy = y + Math.floor(m / 12), mm = m % 12;
      if (mm % 3 !== 2) continue;
      if (k === 0 && d > 8) continue; // equity index roll week ≈ 2nd week of the expiry month
      return { ...c, continuous: 0, month: MONTH_CODES[mm], year: yy, estimated: true };
    }
  }
  return c; // monthly/irregular cycles (CL, GC, ags…) differ per product: the user picks the contract
}

// Context-menu helper: "$NVDA," "/ESZ26 long" "(BTC-USD)" → TradingView symbol, or null.
export function selectionToTradingView(text, projectxRoots = {}) {
  const words = String(text || '').trim().split(/\s+/).slice(0, 3);
  for (const cand of [words.join(' '), words.slice(0, 2).join(' '), words[0]]) {
    const clean = String(cand || '').replace(/^[(\[]+/, '').replace(/^\$(?=[A-Za-z])/, '').replace(/[.,;:!?)\]]+$/, '');
    const c = parseSymbol(clean, { projectxRoots });
    if (c) return formatSymbol(c, 'tradingview', { projectxRoots });
  }
  return null;
}
