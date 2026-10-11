// Room lighting (content side): decides the scene and asks the background worker to set your lights.
// Only the visible chart tab drives the lights (a short shared lease), so several tabs never fight.
import { storage } from '../../core/storage.js';
import { sceneState, hexToRgb } from '../../lights/drivers.js';
import { activeSession } from '../sessions/sessions.js';

const LEASE = 'lights:lease';

export function createLights({ getSettings, bus, risk, send }) {
  const me = Math.random().toString(36).slice(2);
  let calm = 0, last = '', flashing = null;
  const cfg = () => getSettings().lights;
  bus.on('skins:signals', (s) => { calm = s.calm || 0; });

  async function lead() {
    if (document.visibilityState !== 'visible') return false;
    const l = await storage.get(LEASE, null);
    if (l && l.id !== me && Date.now() - l.at < 8000) return false;
    await storage.set(LEASE, { id: me, at: Date.now() });
    return true;
  }
  async function apply(state, force = false) {
    if (!send || !state) return null;
    const key = JSON.stringify(state);
    if (!force && key === last) return null;
    last = key;
    bus.emit('lights:state', state);
    try { return await send({ type: 'lights.apply', state }); } catch (_) { return null; }
  }
  function scene() {
    const s = getSettings();
    return sceneState(cfg(), { session: activeSession(s.sessions.list, new Date()), risk: s.risk.enabled ? risk?.last?.() : null, calm });
  }
  async function tick() {
    if (!cfg().enabled || flashing || !(await lead())) return;
    apply(scene());
  }
  async function flash(id) {
    const c = cfg();
    const ev = c.events[id];
    if (!c.enabled || !ev?.on || !(await lead())) return;
    clearTimeout(flashing);
    await apply({ on: true, rgb: hexToRgb(ev.color), bri: Math.min(1, c.brightness + 0.2), flash: true }, true);
    flashing = setTimeout(() => { flashing = null; last = ''; tick(); }, 1800);
  }
  bus.on('trade:event', (e) => flash(e.type === 'tvAlert' ? 'alert' : e.type));
  bus.on('sound:fired', (e) => { if (e.type === 'priceAlert') flash('alert'); });
  bus.on('risk:alert', (a) => { if (a.event === 'riskTarget') flash('riskTarget'); else last = ''; });
  setInterval(() => { tick().catch(() => {}); }, 2000);
  return {
    tick,
    test: async (hex) => send?.({ type: 'lights.apply', state: { on: true, rgb: hexToRgb(hex || '#5b8cff'), bri: cfg().brightness, flash: true }, test: true }),
    off: () => send?.({ type: 'lights.apply', state: { on: false }, test: true }),
    scene,
  };
}
