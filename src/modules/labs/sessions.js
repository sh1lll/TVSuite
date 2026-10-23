// Labs demo for compute-and-draw: session levels worked out from the chart's own bars, so they need nothing but
// the platform's chart. Futures trading days run 18:00 to 17:00 New York time; RTH is 09:30 to 16:00.
const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

// { day: 'YYYY-MM-DD' of the trading day, mins: minutes since midnight ET } for a bar time in seconds.
export function etParts(sec) {
  const p = Object.fromEntries(ET.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]));
  const mins = +p.hour * 60 + +p.minute;
  let day = `${p.year}-${p.month}-${p.day}`;
  if (mins >= 18 * 60) { // the evening session belongs to the next calendar day's trading day
    const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + 1));
    day = d.toISOString().slice(0, 10);
  }
  return { day, mins };
}

const RTH_OPEN = 9 * 60 + 30, RTH_CLOSE = 16 * 60;

// bars: [time, open, high, low, close, volume?]. Returns levels for the latest trading day on the chart:
// prior day high/low (full session), overnight high/low (before 09:30) and the RTH open once it exists.
export function sessionLevels(bars) {
  const days = new Map();
  for (const b of bars || []) {
    if (!Array.isArray(b) || !Number.isFinite(b[0]) || !Number.isFinite(b[2]) || !Number.isFinite(b[3])) continue;
    const { day, mins } = etParts(b[0]);
    let d = days.get(day);
    if (!d) days.set(day, (d = { day, hi: -Infinity, lo: Infinity, onHi: -Infinity, onLo: Infinity, rthOpen: null, first: b[0] }));
    d.hi = Math.max(d.hi, b[2]); d.lo = Math.min(d.lo, b[3]);
    const overnight = mins >= 18 * 60 || mins < RTH_OPEN;
    if (overnight) { d.onHi = Math.max(d.onHi, b[2]); d.onLo = Math.min(d.onLo, b[3]); }
    else if (mins < RTH_CLOSE && d.rthOpen == null) d.rthOpen = b[1];
  }
  const list = [...days.values()].sort((a, b) => a.first - b.first);
  if (!list.length) return { day: null, levels: [] };
  const cur = list[list.length - 1], prev = list[list.length - 2];
  const lv = (key, label, price) => ({ key, label, top: price, bottom: price });
  const levels = [];
  if (prev) {
    // A prior day that starts after 18:30 ET is cut off by the chart's history, so its high/low may be incomplete.
    const partial = etParts(prev.first).mins < 18 * 60 || etParts(prev.first).mins > 18 * 60 + 30;
    const note = partial ? ' (partial)' : '';
    levels.push(lv('PDH', `PDH${note}`, prev.hi), lv('PDL', `PDL${note}`, prev.lo));
  }
  if (Number.isFinite(cur.onHi)) levels.push(lv('ONH', 'ONH', cur.onHi), lv('ONL', 'ONL', cur.onLo));
  if (cur.rthOpen != null) levels.push(lv('RTHO', 'RTH open', cur.rthOpen));
  return { day: cur.day, levels };
}
