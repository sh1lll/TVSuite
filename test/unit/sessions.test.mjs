import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SESSIONS, isOpen, activeSession, nextEvent, parseHHMM, zonedParts, formatCountdown } from '../../src/modules/sessions/sessions.js';

const byId = Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, s]));

test('parseHHMM validates input', () => {
  assert.equal(parseHHMM('09:30'), 570);
  assert.equal(parseHHMM('24:00'), 1440);
  assert.throws(() => parseHHMM('9h30'));
  assert.throws(() => parseHHMM('25:00'));
});

test('New York open respects US daylight saving', () => {
  // Summer (EDT, UTC-4): 09:30 NY = 13:30 UTC
  assert.equal(isOpen(byId.newyork, new Date('2026-07-15T13:29:00Z')), false);
  assert.equal(isOpen(byId.newyork, new Date('2026-07-15T13:30:00Z')), true);
  // Winter (EST, UTC-5): 09:30 NY = 14:30 UTC
  assert.equal(isOpen(byId.newyork, new Date('2026-01-14T14:00:00Z')), false);
  assert.equal(isOpen(byId.newyork, new Date('2026-01-14T14:30:00Z')), true);
});

test('weekends are closed', () => {
  assert.equal(isOpen(byId.london, new Date('2026-07-18T10:00:00Z')), false); // Saturday
});

test('overlap hands over to the most recently opened session', () => {
  // 2026-07-15 14:00 UTC: London (opened 07:00 UTC) and NY (opened 13:30 UTC) both open
  assert.equal(activeSession(DEFAULT_SESSIONS, new Date('2026-07-15T14:00:00Z')).id, 'newyork');
  assert.equal(activeSession(DEFAULT_SESSIONS, new Date('2026-07-15T10:00:00Z')).id, 'london');
  assert.equal(activeSession(DEFAULT_SESSIONS, new Date('2026-07-15T01:00:00Z')).id, 'tokyo');
});

test('overnight sessions crossing midnight', () => {
  const globex = { id: 'globex', tz: 'America/Chicago', open: '17:00', close: '16:00', days: [0, 1, 2, 3, 4] };
  // Sunday 17:00 Chicago -> open
  assert.equal(isOpen(globex, new Date('2026-07-19T22:30:00Z')), true);
  // Monday 03:00 Chicago (belongs to Sunday's session) -> open
  assert.equal(isOpen(globex, new Date('2026-07-20T08:00:00Z')), true);
  // Friday 16:30 Chicago -> closed (maintenance/weekend)
  assert.equal(isOpen(globex, new Date('2026-07-17T21:30:00Z')), false);
  // Saturday 03:00 Chicago (Friday evening session not in days) -> closed
  assert.equal(isOpen(globex, new Date('2026-07-18T08:00:00Z')), false);
});

test('nextEvent finds the upcoming open', () => {
  const ev = nextEvent([byId.newyork], new Date('2026-07-15T12:00:00Z'));
  assert.equal(ev.type, 'open');
  assert.equal(ev.at.toISOString(), '2026-07-15T13:30:00.000Z');
});

test('zonedParts and countdown formatting', () => {
  const z = zonedParts(new Date('2026-07-15T00:30:00Z'), 'Asia/Tokyo');
  assert.equal(z.minutes, 9 * 60 + 30);
  assert.equal(z.dateKey, '2026-07-15');
  assert.equal(formatCountdown(3 * 3600e3 + 5 * 60e3), '3h 05m');
  assert.equal(formatCountdown(65e3), '1m 05s');
});
