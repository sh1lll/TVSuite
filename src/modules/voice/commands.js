// Voice (and typed) commands: free text → an action. Pure, unit-tested.
// "show NQ five minute", "journal this", "log a loss of 200", "alert at 21,500", "what's my P&L", "mute"…

export const ALIASES = {
  'micro nasdaq': 'MNQ1!', 'micro nas': 'MNQ1!', 'micro s and p': 'MES1!', 'micro spoos': 'MES1!', 'micro gold': 'MGC1!', 'micro dow': 'MYM1!', 'micro russell': 'M2K1!',
  'nasdaq': 'NQ1!', 'nas': 'NQ1!', 'naz': 'NQ1!', 'nq': 'NQ1!', 'mnq': 'MNQ1!', 'mes': 'MES1!', 's and p': 'ES1!', 's&p': 'ES1!', 'spoos': 'ES1!', 'es': 'ES1!', 'e mini': 'ES1!',
  'dow': 'YM1!', 'dow jones': 'YM1!', 'russell': 'RTY1!', 'gold': 'GC1!', 'silver': 'SI1!', 'copper': 'HG1!', 'oil': 'CL1!', 'crude': 'CL1!', 'crude oil': 'CL1!',
  'natural gas': 'NG1!', 'nat gas': 'NG1!', 'bonds': 'ZB1!', 'ten year': 'ZN1!', 'bitcoin': 'BTCUSD', 'btc': 'BTCUSD', 'ethereum': 'ETHUSD', 'ether': 'ETHUSD', 'eth': 'ETHUSD',
  'solana': 'SOLUSD', 'sol': 'SOLUSD', 'euro': 'EURUSD', 'euro dollar': 'EURUSD', 'cable': 'GBPUSD', 'pound': 'GBPUSD', 'yen': 'USDJPY', 'dollar yen': 'USDJPY', 'aussie': 'AUDUSD',
  'dxy': 'TVC:DXY', 'dollar index': 'TVC:DXY', 'vix': 'CBOE:VIX', 'spx': 'SP:SPX', 'spy': 'SPY', 'qqq': 'QQQ', 'apple': 'AAPL', 'tesla': 'TSLA', 'nvidia': 'NVDA',
  'microsoft': 'MSFT', 'amazon': 'AMZN', 'meta': 'META', 'google': 'GOOGL', 'netflix': 'NFLX', 'amd': 'AMD',
};
const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, sixty: 60 };
const UNITS = [[/^(s|sec|second|seconds)$/, 'S'], [/^(m|min|mins|minute|minutes)$/, ''], [/^(h|hr|hour|hours)$/, 'H'], [/^(d|day|daily)$/, 'D'], [/^(w|week|weekly)$/, 'W'], [/^(month|monthly)$/, 'M']];

// "five minute" "5 min" "1 hour" "4h" "daily" → TradingView interval ("5", "60", "240", "D") or null
export function parseInterval(text) {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(daily|day chart)\b/.test(t)) return 'D';
  if (/\bweekly\b/.test(t)) return 'W';
  if (/\bmonthly\b/.test(t)) return 'M';
  const m = t.match(/\b(\d+|one|two|three|four|five|ten|fifteen|twenty|thirty|forty five|sixty)\s*-?\s*(s|sec|seconds?|m|mins?|minutes?|h|hr|hours?|d|days?|w|weeks?)\b/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? +m[1] : NUM_WORDS[m[1]];
  const unit = UNITS.find(([re]) => re.test(m[2]))?.[1];
  if (!n || unit == null) return null;
  if (unit === 'H') return String(n * 60);
  if (unit === '') return String(n);
  return n === 1 ? unit : `${n}${unit}`;
}

// Spoken number: "21,500" "twenty one five hundred" isn't attempted — digits only (speech engines emit digits).
const amount = (s) => { const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

// "E S" "n v d a" → "ES" "NVDA"; aliases; "NASDAQ:AAPL" spoken as "aapl"
export function spokenSymbol(text) {
  let t = text.toLowerCase().replace(/[^a-z0-9&!:. ]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(the|chart|please|on|of|to|for|ticker|symbol)\b/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(\d+|one|two|three|four|five|ten|fifteen|twenty|thirty|forty five|sixty)\s*-?\s*(s|sec|seconds?|m|mins?|minutes?|h|hr|hours?|d|days?|w|weeks?)\b.*$/, '').replace(/\b(daily|weekly|monthly)\b.*$/, '').trim();
  if (!t) return null;
  const keys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) if (t === k || t.startsWith(`${k} `)) return ALIASES[k];
  if (/^([a-z] ){1,5}[a-z]$/.test(t)) { const s = t.replace(/ /g, '').toUpperCase(); return ALIASES[s.toLowerCase()] || s; }
  const word = t.split(' ')[0].toUpperCase();
  return /^[A-Z0-9:._!]{1,20}$/.test(word) ? word : null;
}

export const HELP = 'Try: show N Q five minute · journal this · screenshot · start recording · log a loss of 200 · alert at 21500 · what’s my P&L · when does New York open · mute · skin off · mini chart';

export function parseCommand(input) {
  const raw = String(input || '').trim();
  const t = raw.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').replace(/^(hey |ok |okay )?(tv ?suite|suite)[, ]*/, '').trim();
  if (!t) return null;
  let m;
  if (/^(help|what can i say|commands)\b/.test(t)) return { action: 'help' };
  if (/^(un ?mute|sound on)\b/.test(t)) return { action: 'unmute' };
  if (/^(mute|quiet|silence|sound off)\b/.test(t)) return { action: 'mute' };
  if (/\b(journal|log) (this|that|it|trade)\b|^(take a note|capture)\b/.test(t) && !/\b(win|loss|profit)\b/.test(t)) return { action: 'journal' };
  if (/\b(screenshot|screen shot|card|copy (the )?chart)\b/.test(t)) return { action: 'card' };
  if (/\b(stop|end) (the )?recording\b/.test(t)) return { action: 'record', on: false };
  if (/\b(start )?record(ing)?\b/.test(t) && !/\bstop\b/.test(t)) return { action: 'record', on: true };
  if (/\b(mini ?chart|picture in picture|pip|pop out)\b/.test(t)) return { action: 'mini' };
  if (/\b(focus mode|focus)\b/.test(t)) return { action: 'focus' };
  if ((m = t.match(/\bskins? (on|off)\b/))) return { action: 'skin', on: m[1] === 'on' };
  if (/\b(next|change|another) skin\b/.test(t)) return { action: 'nextSkin' };
  if ((m = t.match(/\b(log|add|record)( an?)? (win|profit|gain|loss|losing trade|winning trade)( of)? \$?(-?[\d,]+(\.\d+)?)/))) {
    const v = amount(m[5]);
    return v == null ? null : { action: 'trade', pnl: /loss|losing/.test(m[3]) ? -Math.abs(v) : Math.abs(v) };
  }
  if ((m = t.match(/\b(i )?(made|lost) \$?([\d,]+(\.\d+)?)/))) { const v = amount(m[3]); return v == null ? null : { action: 'trade', pnl: m[2] === 'lost' ? -v : v }; }
  if ((m = t.match(/\b(set )?(an )?alert (at|for|on) \$?([\d,]+(\.\d+)?)/))) return { action: 'alert', level: amount(m[4]) };
  if (/\b(my )?(p ?(and|&|n) ?l|pnl|profit|how am i doing|how much (am i|did i))\b/.test(t)) return { action: 'pnl' };
  if (/\b(what('?s| is) the )?price\b/.test(t) && !/\balert\b/.test(t)) return { action: 'price' };
  if ((m = t.match(/\b(when|how long)\b.*\b(tokyo|london|new york|ny|sydney|asia)\b/))) return { action: 'session', name: m[2] === 'ny' ? 'new york' : m[2] };
  if (/\b(next session|session)\b/.test(t)) return { action: 'session', name: null };
  if ((m = t.match(/^(show( me)?|open|switch( to)?|go( to)?|chart|pull up|load)\s+(.+)$/))) {
    const rest = m[m.length - 1];
    const symbol = spokenSymbol(rest);
    const interval = parseInterval(rest);
    if (symbol || interval) return { action: 'symbol', symbol, interval };
  }
  if ((m = t.match(/^(change|switch)? ?(to )?(the )?(.+ (chart|timeframe))$/)) && parseInterval(m[4])) return { action: 'symbol', symbol: null, interval: parseInterval(m[4]) };
  const iv = parseInterval(t);
  if (iv && t.split(' ').length <= 3) return { action: 'symbol', symbol: null, interval: iv };
  return null;
}
