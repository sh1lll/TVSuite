import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToXy, hueRequest, huePairRequest, haRequest, wledRequest, goveeRequests, sceneState } from '../../src/lights/drivers.js';

const red = { on: true, rgb: [255, 0, 0], bri: 0.5 };

test('colour helpers', () => {
  assert.deepEqual(hexToRgb('#22c55e'), [34, 197, 94]);
  const [x, y] = rgbToXy([255, 0, 0]);
  assert.ok(x > 0.6 && y < 0.35, `red xy ${x},${y}`);
  assert.deepEqual(rgbToXy([0, 0, 0]), [0.3227, 0.329]);
});

test('Hue: group action over https, flash = alert select; pairing request', () => {
  const r = hueRequest({ bridge: 'https://192.168.1.20/', username: 'abc', group: '1' }, { ...red, flash: true });
  assert.equal(r.method, 'PUT');
  assert.equal(r.url, 'https://192.168.1.20/api/abc/groups/1/action');
  const b = JSON.parse(r.body);
  assert.equal(b.bri, 127); assert.equal(b.alert, 'select'); assert.equal(b.xy.length, 2);
  assert.equal(hueRequest({ bridge: 'https://h', username: 'u', light: 3 }, { on: false }).url, 'https://h/api/u/lights/3/state');
  assert.deepEqual(JSON.parse(huePairRequest({ bridge: 'https://h' }).body), { devicetype: 'tvsuite#chrome' });
});

test('Home Assistant, WLED and Govee bodies', () => {
  const ha = haRequest({ base: 'http://ha.local:8123', token: 'T', entities: 'light.desk, light.strip' }, { ...red, flash: true });
  assert.equal(ha.url, 'http://ha.local:8123/api/services/light/turn_on');
  assert.equal(ha.headers.Authorization, 'Bearer T');
  assert.deepEqual(JSON.parse(ha.body), { entity_id: ['light.desk', 'light.strip'], rgb_color: [255, 0, 0], brightness: 128, flash: 'short' });
  assert.match(haRequest({ base: 'http://ha', token: 'T', entities: 'light.x' }, { on: false }).url, /turn_off$/);
  assert.deepEqual(JSON.parse(wledRequest({ base: 'http://10.0.0.5' }, red).body).seg, [{ col: [[255, 0, 0]], fx: 0 }]);
  const g = goveeRequests({ apiKey: 'K', devices: 'H6159/AB:CD:EF:12:34:56:78:90' }, red, { requestId: 'x' });
  assert.equal(g.length, 2);
  assert.equal(g[0].headers['Govee-API-Key'], 'K');
  assert.deepEqual(JSON.parse(g[0].body).payload, { sku: 'H6159', device: 'AB:CD:EF:12:34:56:78:90', capability: { type: 'devices.capabilities.color_setting', instance: 'colorRgb', value: 0xff0000 } });
  assert.equal(JSON.parse(g[1].body).payload.capability.value, 50);
});

test('scene priority: breach > warn > calm > session > fixed', () => {
  const cfg = { brightness: 0.8, base: 'session', fixedColor: '#5b8cff', offOutside: false, events: { riskBreach: { on: true, color: '#f23645' }, riskWarn: { on: true, color: '#f7a600' }, calm: { on: true, color: '#f7a600' } } };
  const ny = { color: '#2962ff' };
  assert.equal(sceneState(cfg, { session: ny, risk: { status: 'breach' }, calm: 1 }).why, 'riskBreach');
  assert.equal(sceneState(cfg, { session: ny, risk: { status: 'warn' }, calm: 1 }).why, 'riskWarn');
  assert.equal(sceneState(cfg, { session: ny, risk: { status: 'ok' }, calm: 0.9 }).why, 'calm');
  assert.deepEqual(sceneState(cfg, { session: ny, calm: 0 }).rgb, [41, 98, 255]);
  assert.equal(sceneState({ ...cfg, offOutside: true }, { session: null }).on, false);
  assert.equal(sceneState({ ...cfg, base: 'none' }, { session: ny }), null);
});
