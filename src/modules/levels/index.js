// Levels: draws a pasted Ledgeline export onto the chart through the chart's own page API (MAIN world), on
// tradingview.com and on embedded charts (TopstepX/ProjectX, TradeSea). Drawings are kept out of the saved layout,
// so once drawn the levels stay "on" and are redrawn whenever a chart opens, until they're removed.
// TVSuite never touches orders.
import { parseLevels, pickLevels, levelLabel, hexToRgba, templatesFor, templateOverrides, TOOL_FOR_STYLE } from './parse.js';
import { loadSnapshots, invalidateSnapshots } from '../templates/snapshots.js';
import { storage } from '../../core/storage.js';

// Ids of the permanent levels TVSuite saved into each site's layout, so it can remove them later.
// about:blank / srcdoc chart frames have no host of their own, so their parent's is used.
function siteKey() {
  let host = location.hostname;
  if (!host) { try { host = window.parent.location.hostname; } catch (_) { host = ''; } }
  return `levels:perm:${host || 'unknown'}`;
}

export function createLevels(app) {
  const cfg = () => app.getSettings().levels;
  const permIds = async () => (await storage.get(siteKey(), [])) || [];

  // The chart reports the ids of permanent shapes once they exist (they can arrive after the draw answer).
  document.addEventListener('tvsuite:levelsPerm', async (e) => {
    try {
      const { ids } = JSON.parse(e.detail || '{}');
      if (!Array.isArray(ids) || !ids.length) return;
      const prev = await permIds();
      await storage.set(siteKey(), [...new Set([...prev, ...ids.map(String)])].slice(-600));
    } catch (_) { /* malformed event */ }
  });

  // Saved drawing templates for the current draw mode (from Template backups, shared by every TVSuite tab).
  async function templates(style = cfg().style) {
    invalidateSnapshots();
    try { return templatesFor(await loadSnapshots(), TOOL_FOR_STYLE[style]); } catch (_) { return new Map(); }
  }

  async function payload() {
    const s = cfg();
    const tpl = await templates(s.style);
    const levels = pickLevels(parseLevels(s.text), s.types).map((l) => {
      const name = s.templates?.[l.type];
      return {
        type: l.type, top: l.top, bottom: l.bottom,
        label: s.labels ? levelLabel(l) : '',
        color: s.colors[l.type] || '#9696a0',
        fill: hexToRgba(s.colors[l.type], s.fillAlpha),
        overrides: name && tpl.has(name) ? templateOverrides(tpl.get(name)) : null,
      };
    });
    return { levels, opts: { style: s.style, extendHours: s.extendHours, replace: s.replace } };
  }

  async function draw() {
    const { levels, opts } = await payload();
    if (!levels.length) return { ok: false, reason: cfg().text.trim() ? 'No levels of the selected types.' : 'Paste the Ledgeline export first.' };
    const r = await app.queryMain(JSON.stringify({ cmd: 'levelsDraw', levels, opts }), 4000);
    if (r?.ok) {
      if (!cfg().active) app.update((s) => { s.levels.active = true; }, { silent: true });
      app.bus.emit('levels:drawn', r.count);
    }
    return r || { ok: false, reason: 'No answer from the chart.' };
  }

  async function clear() {
    if (cfg().active) app.update((s) => { s.levels.active = false; }, { silent: true });
    return (await app.queryMain(JSON.stringify({ cmd: 'levelsClear' }), 2000)) || { ok: false, reason: 'No answer from the chart.' };
  }

  // Removes the permanent levels TVSuite saved on this site (ones you deleted by hand are simply skipped).
  async function removePermanent() {
    const ids = await permIds();
    if (!ids.length) return { ok: true, count: 0 };
    const r = await app.queryMain(JSON.stringify({ cmd: 'levelsRemoveIds', ids }), 3000);
    if (r?.ok) await storage.set(siteKey(), []);
    return r || { ok: false, reason: 'No answer from the chart.' };
  }

  // Saves the levels into this platform's layout, like hand-drawn ones: they stay without TVSuite. The previous
  // permanent set is replaced, and the auto-redrawn levels are switched off so the two don't double up.
  async function drawPermanent() {
    const { levels, opts } = await payload();
    if (!levels.length) return { ok: false, reason: cfg().text.trim() ? 'No levels of the selected types.' : 'Paste the Ledgeline export first.' };
    if (cfg().replace) await removePermanent();
    if (cfg().active) app.update((s) => { s.levels.active = false; }, { silent: true });
    const r = await app.queryMain(JSON.stringify({ cmd: 'levelsDraw', levels, opts: { ...opts, permanent: true, lock: cfg().lockPermanent } }), 4000);
    return r || { ok: false, reason: 'No answer from the chart.' };
  }

  const permanentCount = async () => (await permIds()).length;
  const snapshotCount = async () => { try { return (await loadSnapshots()).length; } catch (_) { return 0; } };

  const probe = async () => (await app.queryMain(JSON.stringify({ cmd: 'levelsProbe' }), 2000)) || { ok: false, reason: 'No answer from the chart.' };

  // Levels that are on come back on every chart load, once the chart has had time to load its data.
  if (cfg().active && cfg().text.trim()) setTimeout(() => { draw().catch(() => {}); }, 5000);

  return { draw, clear, drawPermanent, removePermanent, permanentCount, snapshotCount, probe, payload, templates };
}
