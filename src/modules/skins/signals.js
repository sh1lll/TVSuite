// Chart-reactive signals. Everything here is computed locally from price text that is
// already visible on the page; nothing is sent anywhere. Pure logic (no DOM) so it is unit-testable.

// Parse a price string as TradingView renders it in legends / titles.
// Handles thousands separators, unicode minus, non-breaking spaces, comma decimals and K/M/B suffixes.
export function parsePrice(text) {
  if (text == null) return NaN;
  let s = String(text).trim()
    .replace(/[−‒–—]/g, '-')   // unicode minus / dashes
    .replace(/[   \s]/g, '')       // nbsp, thin spaces
    .replace(/[^0-9.,\-+KMBTkmbt%]/g, '');
  if (!s || s === '-' || s === '∅') return NaN;
  let mult = 1;
  const suf = s.slice(-1).toUpperCase();
  if ('KMBT'.includes(suf)) { mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[suf]; s = s.slice(0, -1); }
  s = s.replace(/%$/, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Whichever separator comes last is the decimal point.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // "1,234" (thousands) vs "1234,5" (decimal): a single comma followed by exactly 3 digits is thousands.
    const parts = s.split(',');
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].replace('-', '').length <= 3);
    s = thousands ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, ''); // "1.234.567" European thousands
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n * mult : NaN;
}

// Extract a price from a TradingView document.title such as "BTCUSD 63,123.45 ▲ +1.2% Unnamed".
// Returns { symbol, price } or null. The format is an observed convention, not a documented API.
export function parseTitle(title) {
  if (!title) return null;
  const m = String(title).match(/^\s*([A-Z0-9!:._\-/]{1,40})\s+([\-−]?[\d][\d.,  ]*[KMB]?)\b/);
  if (!m) return null;
  const price = parsePrice(m[2]);
  return Number.isFinite(price) ? { symbol: m[1], price } : null;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (prev, next, alpha) => (prev == null || !Number.isFinite(prev) ? next : prev + (next - prev) * alpha);
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const DEFAULT_REACTIVE = {
  enabled: false,       // opt-in: reading the page's price text
  rangeGain: 1,         // how strongly candle range drives intensity
  velocityGain: 1,      // how strongly price speed drives particle speed
  calm: {
    enabled: true,      // adaptive calm mode
    threshold: 1.8,     // activity (in "normal range" units) where calming starts
    full: 3.5,          // activity where the background is fully calmed
    floor: 0.15,        // intensity never drops below this
  },
};

// Tracks a stream of price observations and turns them into normalized 0..1 signals that skins consume.
export class SignalTracker {
  constructor(opts = {}) {
    this.opts = { ...DEFAULT_REACTIVE, ...opts, calm: { ...DEFAULT_REACTIVE.calm, ...(opts.calm || {}) } };
    this.reset();
  }

  reset() {
    this.symbol = null;
    this.avgRange = null;   // EMA of completed candle ranges (absolute price units), updated once per bar
    this.barKey = null;     // identifies the bar being formed (its open)
    this.barRange = 0;
    this.lastPrice = null;
    this.lastT = null;
    this.velocity = 0;      // EMA of |dPrice|/avgRange per second
    this.dayOpen = null;
    this.dayKey = null;
    this.range = 0;         // latest candle range / avgRange
    this.calm = 0;
    this.pulse = 0;         // decays after a session change
  }

  // obs: { symbol?, open?, high?, low?, close?, price?, t (ms), dayKey?, dayOpen? }
  update(obs) {
    const t = obs.t ?? Date.now();
    if (obs.symbol && this.symbol && obs.symbol !== this.symbol) this.reset();
    if (obs.symbol) this.symbol = obs.symbol;

    const price = Number.isFinite(obs.close) ? obs.close : obs.price;
    if (Number.isFinite(obs.high) && Number.isFinite(obs.low) && obs.high >= obs.low) {
      const key = obs.barKey ?? obs.open;
      if (key !== this.barKey) {
        // A new bar started: fold the finished bar's range into the running average.
        if (this.barKey != null && this.barRange > 0) this.avgRange = smooth(this.avgRange, this.barRange, 0.1);
        this.barKey = key;
      }
      this.barRange = obs.high - obs.low;
      if (this.avgRange == null && this.barRange > 0) this.avgRange = this.barRange; // bootstrap
      this.range = this.avgRange ? this.barRange / this.avgRange : 0;
    }

    if (Number.isFinite(price)) {
      if (this.lastPrice != null && this.lastT != null && t > this.lastT) {
        const dt = Math.min((t - this.lastT) / 1000, 5);
        const unit = this.avgRange || Math.abs(price) * 0.001 || 1;
        const v = Math.abs(price - this.lastPrice) / unit / Math.max(dt, 0.05);
        this.velocity = smooth(this.velocity, v, 0.3);
      }
      this.lastPrice = price;
      this.lastT = t;

      if (obs.dayKey && obs.dayKey !== this.dayKey) { this.dayKey = obs.dayKey; this.dayOpen = null; }
      if (Number.isFinite(obs.dayOpen)) this.dayOpen = obs.dayOpen;
      else if (this.dayOpen == null) this.dayOpen = Number.isFinite(obs.open) ? obs.open : price;
    }
    this._recomputeCalm();
    return this.signals();
  }

  // Called on a clock tick even when no new price arrived, so velocity and pulse decay.
  tick(t = Date.now()) {
    if (this.lastT != null && t - this.lastT > 1000) this.velocity *= 0.9;
    this.pulse *= 0.92;
    this._recomputeCalm();
    return this.signals();
  }

  sessionChanged() { this.pulse = 1; }

  _recomputeCalm() {
    const c = this.opts.calm;
    const activity = Math.max(this.range, this.velocity * 2);
    this.calm = c.enabled ? smooth(this.calm, smoothstep(c.threshold, c.full, activity), 0.2) : 0;
  }

  signals() {
    const o = this.opts;
    const unit = this.avgRange || 0;
    let dist = 0;
    if (unit > 0 && this.lastPrice != null && this.dayOpen != null) {
      dist = Math.max(-1, Math.min(1, (this.lastPrice - this.dayOpen) / (unit * 10)));
    }
    const rangeN = clamp01((this.range / 3) * o.rangeGain);
    const velN = clamp01((this.velocity / 2) * o.velocityGain);
    const calmFactor = 1 - this.calm * (1 - o.calm.floor);
    return {
      intensity: clamp01((0.55 + 0.45 * rangeN) * calmFactor), // overall brightness/energy
      range: rangeN,       // 0..1 relative candle range
      velocity: velN,      // 0..1 price speed
      dist,                // -1..1 distance from the day's open (positive = above)
      calm: this.calm,     // 0..1 how much calm mode is suppressing the skin
      pulse: this.pulse,   // 1 right after a session change, decays to 0
    };
  }
}

export const NEUTRAL_SIGNALS = Object.freeze({ intensity: 0.7, range: 0.3, velocity: 0.2, dist: 0, calm: 0, pulse: 0 });
