// Chart-time tracker: how long you actually spend on the chart, per trading day, per session and symbol.
// Counts only while this tab is visible (and focused, by default) and you were active recently. One tab
// at a time holds a short lease so two open chart tabs never double-count.
import { storage } from '../../core/storage.js';
import { activeSession } from '../sessions/sessions.js';
import { chartTimeTick, tradingDay, formatDuration } from './rules.js';

const KEY = 'charttime:days';
const LEASE = 'charttime:lease';
const STEP = 5;

export function createChartTime({ getSettings, bus, symbol }) {
  const me = Math.random().toString(36).slice(2);
  let lastActive = Date.now(), streak = 0, gap = 0, days = {}, limitFired = '';
  const mark = () => { lastActive = Date.now(); };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, mark, { passive: true, capture: true });
  storage.get(KEY, {}).then((v) => { days = v || {}; });
  storage.watch(KEY, (v) => { if (v) days = v; });

  async function tick() {
    const c = getSettings().chartTime;
    if (!c.enabled) return;
    const visible = document.visibilityState === 'visible' && (c.countWhen === 'visible' || document.hasFocus());
    const active = visible && Date.now() - lastActive < c.idleMin * 60000;
    if (!active) { gap += STEP; if (gap >= c.breakLenMin * 60) streak = 0; return; }
    const lease = await storage.get(LEASE, null);
    if (lease && lease.id !== me && Date.now() - lease.at < 15000) return;
    storage.set(LEASE, { id: me, at: Date.now() });
    const now = new Date(), s = getSettings();
    const sess = activeSession(s.sessions.list, now);
    if (Array.isArray(c.sessions) && c.sessions.length && !c.sessions.includes(sess?.id || 'none')) return;
    const day = tradingDay(now, s.risk.tz, s.risk.reset);
    days = (await storage.get(KEY, {})) || {};
    days[day] = chartTimeTick(days[day], { seconds: STEP, session: sess?.id || 'none', symbol: symbol?.() || '' });
    const keys = Object.keys(days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 90))) delete days[k];
    await storage.set(KEY, days);
    gap = 0; streak += STEP;
    if (c.breakEveryMin > 0 && streak >= c.breakEveryMin * 60) {
      streak = 0;
      bus.emit('sound:manual', { type: 'breakReminder', vars: { text: `You've been on the chart for ${formatDuration(c.breakEveryMin * 60)}. Take a ${c.breakLenMin} minute break.` } });
    }
    if (c.dailyLimitMin > 0 && days[day].total >= c.dailyLimitMin * 60 && limitFired !== day) {
      limitFired = day;
      bus.emit('sound:manual', { type: 'chartTimeLimit', vars: { text: `Daily chart time limit reached: ${formatDuration(days[day].total)}.` } });
    }
    bus.emit('charttime:tick', days[day]);
  }
  const timer = setInterval(() => { tick().catch(() => {}); }, STEP * 1000);
  return { days: () => days, tick, stop: () => clearInterval(timer), _active: (t) => { lastActive = t; } };
}
