// Sound events: definitions, defaults and the pure detection logic (unit-tested).

export const EVENTS = [
  { id: 'tradeEntry', name: 'Trade entered', group: 'Trading', voice: 'Trade entered on {symbol}', how: 'TradingView order toast (keywords) or Alt+Shift+E' },
  { id: 'tradeExit', name: 'Trade closed', group: 'Trading', voice: 'Position closed on {symbol}', how: 'TradingView order toast (keywords) or Alt+Shift+X' },
  { id: 'tvAlert', name: 'TradingView alert fired', group: 'Trading', voice: 'Alert on {symbol}', how: 'TradingView alert popup (keywords)' },
  { id: 'priceAlert', name: 'TVSuite price level crossed', group: 'Price', voice: '{symbol} crossed {level}', how: 'Your price levels below' },
  { id: 'dailyOpenCross', name: 'Price crossed the daily open', group: 'Price', voice: '{symbol} crossed the daily open', how: 'Price on screen vs. the day\'s open' },
  { id: 'bigCandle', name: 'Big candle', group: 'Price', voice: 'Big candle on {symbol}', how: 'Bar range above your multiple of the average' },
  { id: 'barClose', name: 'Bar close', group: 'Price', voice: '', how: 'A new bar starts' },
  { id: 'sessionOpen', name: 'Session opens', group: 'Sessions', voice: '{session} is open', how: 'Session clock' },
  { id: 'sessionClose', name: 'Session closes', group: 'Sessions', voice: '{session} is closed', how: 'Session clock' },
  { id: 'sessionSoon', name: 'One minute to session open', group: 'Sessions', voice: '{session} opens in one minute', how: 'Session clock' },
  { id: 'calm', name: 'Calm mode engaged', group: 'Skins', voice: '', how: 'Reactive skins (needs Reactive on)' },
  { id: 'journal', name: 'Journal capture', group: 'Tools', voice: '', how: 'Alt+Shift+J' },
  { id: 'riskWarn', name: 'Risk warning', group: 'Risk', voice: '{text}', how: 'Risk Guard: a limit is close' },
  { id: 'riskBreach', name: 'Risk limit hit', group: 'Risk', voice: '{text}', how: 'Risk Guard: a loss rule was hit' },
  { id: 'riskTarget', name: 'Daily target reached', group: 'Risk', voice: '{text}', how: 'Risk Guard: daily profit target' },
  { id: 'breakReminder', name: 'Take a break', group: 'Risk', voice: '{text}', how: 'Chart time: continuous time on the chart' },
  { id: 'chartTimeLimit', name: 'Chart time limit', group: 'Risk', voice: '{text}', how: 'Chart time: daily limit' },
];

const S = (id) => ({ kind: 'synth', id });
export const DEFAULT_SOUND = {
  enabled: false,
  notify: false,
  flash: true,                 // show a brief "♪ event" chip at the top of the chart               // also show a desktop notification while the tab is hidden (optional permission)
  volume: 0.7,
  ambient: { source: null, volume: 0.3 },
  voice: { enabled: false, rate: 1.05, name: '' },
  events: {
    tradeEntry: { sound: S('cash'), volume: 1, voice: false, on: true },
    tradeExit: { sound: S('success'), volume: 1, voice: false, on: true },
    tvAlert: { sound: S('bell'), volume: 1, voice: false, on: true },
    priceAlert: { sound: S('alarm'), volume: 0.9, voice: true, on: true },
    dailyOpenCross: { sound: S('ding'), volume: 0.7, voice: false, on: false },
    bigCandle: { sound: S('whoosh'), volume: 0.7, voice: false, on: false },
    barClose: { sound: S('tick'), volume: 0.4, voice: false, on: false },
    sessionOpen: { sound: S('gong'), volume: 0.8, voice: true, on: true },
    sessionClose: { sound: S('chime'), volume: 0.6, voice: false, on: false },
    sessionSoon: { sound: S('blip'), volume: 0.6, voice: false, on: false },
    calm: { sound: S('pop'), volume: 0.5, voice: false, on: false },
    journal: { sound: S('click'), volume: 0.6, voice: false, on: true },
    riskWarn: { sound: S('alarm'), volume: 0.8, voice: true, on: true },
    riskBreach: { sound: S('fail'), volume: 1, voice: true, on: true },
    riskTarget: { sound: S('levelup'), volume: 0.9, voice: true, on: true },
    breakReminder: { sound: S('chime'), volume: 0.7, voice: true, on: true },
    chartTimeLimit: { sound: S('gong'), volume: 0.7, voice: true, on: true },
  },
  bigCandleMultiple: 2.5,
  alerts: [],                  // { id, symbol, level, dir: 'up'|'down'|'any', once, armed }
  library: [],                 // my sounds: { id, name, kind: 'local'|'url', fileId?, url? }
  detect: {
    entryWords: ['order filled', 'order executed', 'position opened', 'filled at', 'executed at'],
    exitWords: ['position closed', 'closed position', 'stop loss triggered', 'take profit triggered', 'flattened'],
    alertWords: ['alert triggered', 'alert:', 'alert fired'],
  },
  hotkeys: { entry: 'Alt+Shift+E', exit: 'Alt+Shift+X', mute: 'Alt+Shift+M' },
};

// Which event a toast/notification text announces, by keyword lists (case-insensitive).
export function classifyToast(text, words = DEFAULT_SOUND.detect) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t || t.length > 400) return null;
  const has = (list) => (list || []).some((w) => w && t.includes(String(w).toLowerCase()));
  if (has(words.exitWords)) return 'tradeExit';
  if (has(words.entryWords)) return 'tradeEntry';
  if (has(words.alertWords)) return 'tvAlert';
  return null;
}

// Levels crossed when price moves prev → curr. Touching a level counts as crossing it.
export function crossings(prev, curr, levels) {
  if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === curr) return [];
  const out = [];
  for (const lv of levels) {
    const L = +lv.level;
    if (!Number.isFinite(L)) continue;
    const up = prev < L && curr >= L, down = prev > L && curr <= L;
    if ((up && lv.dir !== 'down') || (down && lv.dir !== 'up')) out.push({ ...lv, crossed: up ? 'up' : 'down' });
  }
  return out;
}

export function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k]))).replace(/\s+/g, ' ').trim();
}

// Market watcher: feed observations ({symbol, open, high, low, price|close, dayOpen?}); returns events.
export function createMarketWatcher({ bigMultiple = 2.5 } = {}) {
  let symbol = null, barKey = null, barRange = 0, avg = null, bigFired = false, lastPrice = null, dayOpen = null, dayKey = null;
  return {
    setBigMultiple(m) { bigMultiple = m; },
    update(obs, alerts = []) {
      const ev = [];
      if (!obs) return ev;
      if (obs.symbol && obs.symbol !== symbol) { symbol = obs.symbol; barKey = null; avg = null; lastPrice = null; dayOpen = null; }
      const price = Number.isFinite(obs.price) ? obs.price : obs.close;
      if (Number.isFinite(obs.high) && Number.isFinite(obs.low)) {
        const key = obs.open;
        if (barKey !== null && key !== barKey) {
          if (barRange > 0) avg = avg == null ? barRange : avg + (barRange - avg) * 0.1;
          ev.push({ type: 'barClose', symbol });
          bigFired = false;
        }
        barKey = key;
        barRange = obs.high - obs.low;
        if (avg && !bigFired && barRange >= avg * bigMultiple) { bigFired = true; ev.push({ type: 'bigCandle', symbol, ratio: +(barRange / avg).toFixed(2) }); }
      }
      if (obs.dayKey && obs.dayKey !== dayKey) { dayKey = obs.dayKey; dayOpen = null; }
      if (dayOpen == null && Number.isFinite(obs.open)) dayOpen = obs.open;
      if (Number.isFinite(price)) {
        if (lastPrice != null) {
          if (dayOpen != null && (lastPrice - dayOpen) * (price - dayOpen) < 0) ev.push({ type: 'dailyOpenCross', symbol, dir: price > dayOpen ? 'up' : 'down' });
          const mine = alerts.filter((a) => a.armed !== false && (!a.symbol || a.symbol === symbol));
          for (const c of crossings(lastPrice, price, mine)) ev.push({ type: 'priceAlert', symbol, level: c.level, dir: c.crossed, alertId: c.id, once: c.once });
        }
        lastPrice = price;
      }
      return ev;
    },
  };
}
