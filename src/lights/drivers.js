// Smart-light drivers, called from the background worker (it can reach your network without CORS issues).
// Each driver turns a light state { on, rgb: [r,g,b], bri: 0..1, flash } into HTTP requests. Builders are pure.
//   Philips Hue  — bridge v1 resource API over HTTPS (new bridge firmware drops plain HTTP)
//   Home Assistant — REST light.turn_on with a long-lived token (covers Govee LAN, LIFX, Nanoleaf, Zigbee…)
//   WLED — JSON API on the controller
//   Govee — cloud OpenAPI (the Govee LAN API is UDP-only, which browsers can't send)
export const SECRETS_KEY = 'lights:secrets';

export function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex).trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}

// sRGB → CIE xy (Wide gamut D65), as Hue expects.
export function rgbToXy([r, g, b]) {
  const lin = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
  const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
  const Z = R * 0.000088 + G * 0.07231 + B * 0.986039;
  const s = X + Y + Z;
  return s === 0 ? [0.3227, 0.329] : [+(X / s).toFixed(4), +(Y / s).toFixed(4)];
}

const clampBri = (b) => Math.max(0, Math.min(1, Number.isFinite(+b) ? +b : 1));
const base = (u) => String(u || '').trim().replace(/\/+$/, '');

export function hueRequest(dev, st) {
  const path = dev.group != null && dev.group !== '' ? `groups/${encodeURIComponent(dev.group)}/action` : `lights/${encodeURIComponent(dev.light || 1)}/state`;
  const body = st.on === false ? { on: false } : { on: true, bri: Math.max(1, Math.round(clampBri(st.bri) * 254)), xy: rgbToXy(st.rgb), transitiontime: st.flash ? 0 : 4, ...(st.flash ? { alert: 'select' } : {}) };
  return { method: 'PUT', url: `${base(dev.bridge)}/api/${encodeURIComponent(dev.username)}/${path}`, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
export function huePairRequest(dev) {
  return { method: 'POST', url: `${base(dev.bridge)}/api`, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ devicetype: 'tvsuite#chrome' }) };
}

export function haRequest(dev, st) {
  const entity = String(dev.entities || '').split(/[\s,]+/).filter(Boolean);
  const off = st.on === false;
  const body = off ? { entity_id: entity } : { entity_id: entity, rgb_color: st.rgb.map((v) => Math.round(v)), brightness: Math.max(1, Math.round(clampBri(st.bri) * 255)), ...(st.flash ? { flash: 'short' } : { transition: 0.4 }) };
  return { method: 'POST', url: `${base(dev.base)}/api/services/light/${off ? 'turn_off' : 'turn_on'}`, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dev.token}` }, body: JSON.stringify(body) };
}

export function wledRequest(dev, st) {
  const body = st.on === false ? { on: false } : { on: true, bri: Math.max(1, Math.round(clampBri(st.bri) * 255)), transition: st.flash ? 0 : 4, seg: [{ col: [st.rgb.map((v) => Math.round(v))], fx: 0 }] };
  return { method: 'POST', url: `${base(dev.base)}/json/state`, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export function goveeRequests(dev, st, { base: apiBase = 'https://openapi.api.govee.com', requestId = `tvs-${Date.now()}` } = {}) {
  const devices = String(dev.devices || '').split(/[\s,]+/).filter(Boolean).map((d) => { const [sku, ...rest] = d.split('/'); return { sku, device: rest.join('/') }; }).filter((d) => d.sku && d.device);
  const mk = (d, capability) => ({ method: 'POST', url: `${apiBase}/router/api/v1/device/control`, headers: { 'Content-Type': 'application/json', 'Govee-API-Key': dev.apiKey }, body: JSON.stringify({ requestId, payload: { sku: d.sku, device: d.device, capability } }) });
  return devices.flatMap((d) => (st.on === false
    ? [mk(d, { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: 0 })]
    : [mk(d, { type: 'devices.capabilities.color_setting', instance: 'colorRgb', value: (Math.round(st.rgb[0]) << 16) | (Math.round(st.rgb[1]) << 8) | Math.round(st.rgb[2]) }),
      mk(d, { type: 'devices.capabilities.range', instance: 'brightness', value: Math.max(1, Math.round(clampBri(st.bri) * 100)) })]));
}

export function requestsFor(dev, st, opts) {
  if (dev.type === 'hue') return [hueRequest(dev, st)];
  if (dev.type === 'ha') return [haRequest(dev, st)];
  if (dev.type === 'wled') return [wledRequest(dev, st)];
  if (dev.type === 'govee') return goveeRequests(dev, st, opts);
  return [];
}

// Scene logic (content side): what colour the room should be right now. Priority: risk breach > risk warning >
// calm > session colour > fixed colour. Events (entry/exit/alerts) flash on top and fall back.
export function sceneState(cfg, { session, risk, calm }) {
  const bri = cfg.brightness;
  const ev = cfg.events;
  if (risk?.status === 'breach' && ev.riskBreach.on) return { on: true, rgb: hexToRgb(ev.riskBreach.color), bri, why: 'riskBreach' };
  if (risk?.status === 'warn' && ev.riskWarn.on) return { on: true, rgb: hexToRgb(ev.riskWarn.color), bri, why: 'riskWarn' };
  if (calm > 0.5 && ev.calm.on) return { on: true, rgb: hexToRgb(ev.calm.color), bri: bri * 0.6, why: 'calm' };
  if (cfg.base === 'session') return session ? { on: true, rgb: hexToRgb(session.color), bri, why: 'session' } : cfg.offOutside ? { on: false, why: 'no session' } : { on: true, rgb: hexToRgb(cfg.fixedColor), bri: bri * 0.5, why: 'no session' };
  if (cfg.base === 'fixed') return { on: true, rgb: hexToRgb(cfg.fixedColor), bri, why: 'fixed' };
  return null; // base 'none': only events change the lights
}
