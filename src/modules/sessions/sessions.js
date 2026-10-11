// Market-session clock. Driven by the wall clock alone (IANA time zones via Intl), so
// daylight-saving transitions in each market are handled without hard-coded offsets.

export const DEFAULT_SESSIONS = [
  { id: 'sydney', name: 'Sydney', tz: 'Australia/Sydney', open: '07:00', close: '16:00', days: [1, 2, 3, 4, 5], color: '#8e7cc3', skin: null },
  { id: 'tokyo', name: 'Tokyo', tz: 'Asia/Tokyo', open: '09:00', close: '15:00', days: [1, 2, 3, 4, 5], color: '#e06666', skin: 'sakura-dusk' },
  { id: 'london', name: 'London', tz: 'Europe/London', open: '08:00', close: '16:30', days: [1, 2, 3, 4, 5], color: '#6fa8dc', skin: 'rain-neon' },
  { id: 'newyork', name: 'New York', tz: 'America/New_York', open: '09:30', close: '16:00', days: [1, 2, 3, 4, 5], color: '#93c47d', skin: 'aurora' },
];

const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return fmtCache.get(tz);
}

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Wall-clock parts of `date` in time zone `tz`.
export function zonedParts(date, tz) {
  const parts = {};
  for (const p of formatter(tz).formatToParts(date)) parts[p.type] = p.value;
  return {
    weekday: WEEKDAY[parts.weekday],
    year: +parts.year, month: +parts.month, day: +parts.day,
    minutes: (+parts.hour % 24) * 60 + +parts.minute,
    seconds: +parts.second,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) throw new Error(`Invalid time "${s}" (expected HH:MM)`);
  const h = +m[1], min = +m[2];
  if (h > 24 || min > 59 || (h === 24 && min > 0)) throw new Error(`Invalid time "${s}"`);
  return h * 60 + min;
}

// Is the session open at `date`? Supports sessions that cross local midnight (open > close).
export function isOpen(session, date) {
  const z = zonedParts(date, session.tz);
  const open = parseHHMM(session.open), close = parseHHMM(session.close);
  const days = session.days ?? [0, 1, 2, 3, 4, 5, 6];
  if (open < close) return days.includes(z.weekday) && z.minutes >= open && z.minutes < close;
  // Overnight: open part belongs to today's trading day, the after-midnight part to yesterday's.
  if (z.minutes >= open) return days.includes(z.weekday);
  if (z.minutes < close) return days.includes((z.weekday + 6) % 7);
  return false;
}

// Minutes since the session opened (only meaningful when open).
export function minutesSinceOpen(session, date) {
  const z = zonedParts(date, session.tz);
  const open = parseHHMM(session.open);
  const d = z.minutes - open;
  return d >= 0 ? d : d + 1440;
}

// The session that should drive the theme: among open sessions, the most recently opened wins
// (so the London→New York overlap hands over to New York at its open).
export function activeSession(sessions, date = new Date()) {
  let best = null, bestAge = Infinity;
  for (const s of sessions) {
    if (s.enabled === false) continue;
    let open;
    try { open = isOpen(s, date); } catch (_) { continue; }
    if (!open) continue;
    const age = minutesSinceOpen(s, date);
    if (age < bestAge) { best = s; bestAge = age; }
  }
  return best;
}

// Next open/close event across sessions within the next `horizonMin` minutes (minute resolution).
export function nextEvent(sessions, date = new Date(), horizonMin = 7 * 1440) {
  const base = Math.floor(date.getTime() / 60000) * 60000;
  const state = new Map(sessions.map((s) => [s.id, safeOpen(s, new Date(base))]));
  for (let i = 1; i <= horizonMin; i++) {
    const t = new Date(base + i * 60000);
    for (const s of sessions) {
      if (s.enabled === false) continue;
      const now = safeOpen(s, t);
      if (now !== state.get(s.id)) return { session: s, type: now ? 'open' : 'close', at: t };
    }
  }
  return null;
}

function safeOpen(s, d) { try { return isOpen(s, d); } catch (_) { return false; } }

export function formatCountdown(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}
