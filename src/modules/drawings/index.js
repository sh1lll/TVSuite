// Drawings: copy the drawings on a TradingView chart and paste them onto another platform's embedded chart
// (TopstepX/ProjectX, TradeSea). Copies live in the extension's storage, so a copy made on tradingview.com is
// waiting on every other site, one per market. TVSuite never touches orders.
import { storage } from '../../core/storage.js';
import { COPIES_KEY, addCopy, pickCopy, exportCopy, parseExport } from './model.js';

// about:blank / srcdoc chart frames have no host of their own, so their parent's is used.
function permKey() {
  let host = location.hostname;
  if (!host) { try { host = window.parent.location.hostname; } catch (_) { host = ''; } }
  return `drawings:perm:${host || 'unknown'}`;
}

const noAnswer = { ok: false, reason: 'No answer from the chart.' };

export function createDrawings(app) {
  const cfg = () => app.getSettings().drawings;
  const copies = async () => (await storage.get(COPIES_KEY, {})) || {};
  const permIds = async () => (await storage.get(permKey(), [])) || [];
  let lastDone = null;

  // The chart reports what it actually made a moment after pasting; permanent ids are kept for Remove.
  document.addEventListener('tvsuite:drawingsDone', async (e) => {
    try {
      const r = JSON.parse(e.detail || '{}');
      lastDone = { made: (r.ids || []).length, skipped: r.skipped || [] };
      if (r.permanent && Array.isArray(r.ids) && r.ids.length) {
        await storage.set(permKey(), [...new Set([...(await permIds()), ...r.ids.map(String)])].slice(-2000));
      }
      app.bus.emit('drawings:done', lastDone);
    } catch (_) { /* malformed event */ }
  });

  async function copy() {
    const r = await app.queryMain(JSON.stringify({ cmd: 'drawingsCopy' }), 4000);
    if (!r?.ok) return r || noAnswer;
    if (!r.items.length) return { ok: false, reason: 'This chart has no drawings to copy.' };
    const res = addCopy(await copies(), { symbol: r.symbol, items: r.items });
    await storage.setStrict(COPIES_KEY, res.copies);
    return { ok: true, count: res.count, key: res.key, failed: r.failed };
  }

  async function removePermanent() {
    const ids = await permIds();
    if (!ids.length) return { ok: true, count: 0 };
    const r = await app.queryMain(JSON.stringify({ cmd: 'levelsRemoveIds', ids }), 3000);
    if (r?.ok) await storage.set(permKey(), []);
    return r || noAnswer;
  }

  // key: which copy (market) to paste; defaults to the one matching this chart's symbol, else the newest.
  async function paste({ key = null, permanent = true } = {}) {
    const all = await copies();
    const probe = await app.queryMain(JSON.stringify({ cmd: 'levelsProbe' }), 2000);
    if (!probe?.ok) return probe || noAnswer;
    const k = key && all[key] ? key : pickCopy(all, probe.symbol);
    if (!k) return { ok: false, reason: 'Nothing copied yet. Open the chart on tradingview.com and press Copy drawings from this chart.' };
    if (permanent && cfg().replace) await removePermanent();
    lastDone = null;
    const r = await app.queryMain(JSON.stringify({ cmd: 'drawingsPaste', items: all[k].items, opts: { permanent, lock: cfg().lock, replace: cfg().replace } }), 6000);
    return r?.ok ? { ...r, key: k } : (r || noAnswer);
  }

  const clear = async () => (await app.queryMain(JSON.stringify({ cmd: 'drawingsClear' }), 2000)) || noAnswer;

  async function deleteCopy(key) {
    const all = await copies();
    delete all[key];
    await storage.set(COPIES_KEY, all);
  }

  // Text of one copy, for the clipboard.
  async function exportText(key) {
    const all = await copies();
    return all[key] ? exportCopy(all[key]) : null;
  }

  // Stores an exported copy as this market's copy (replacing an older one for the same market).
  async function importText(text) {
    const c = parseExport(text);
    const res = addCopy(await copies(), c, c.at);
    await storage.setStrict(COPIES_KEY, res.copies);
    return { ok: true, key: res.key, count: res.count };
  }

  return {
    copy, paste, exportText, importText, clear, removePermanent, deleteCopy, copies,
    permanentCount: async () => (await permIds()).length,
    lastDone: () => lastDone,
  };
}
