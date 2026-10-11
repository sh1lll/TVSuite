// Template snapshot history, shared by the Templates tab and scheduled auto-backup.
import { storage } from '../../core/storage.js';
import { countEntries, pruneSnapshots } from './model.js';

export const SNAP_KEY = 'tm:snapshots';
export const LAST_AUTO_KEY = 'tm:lastAuto';

let cache = null;

export async function loadSnapshots() {
  if (!cache) cache = (await storage.get(SNAP_KEY, [])) || [];
  return cache;
}

export async function writeSnapshots(list) {
  await storage.setStrict(SNAP_KEY, list);
  cache = list;
}

export function invalidateSnapshots() { cache = null; }

// Throws unless the snapshot is verifiably persisted — destructive actions depend on it.
export async function saveSnapshot(data, { reason, user = 'user', keep = 20 }) {
  invalidateSnapshots(); // another tab may have written since we cached
  const list = await loadSnapshots();
  const snap = { id: `s${Date.now().toString(36)}`, createdAt: Date.now(), reason, user, counts: countEntries(data), data: { THEMES: data.THEMES, TOOLS: data.TOOLS } };
  const next = pruneSnapshots([snap, ...list], keep);
  try { await writeSnapshots(next); } catch (err) { throw new Error(`Safety snapshot could not be saved (${err.message}). Nothing was changed.`); }
  const back = (await storage.get(SNAP_KEY, [])) || [];
  if (!back.some((x) => x.id === snap.id)) throw new Error('Safety snapshot could not be verified in storage. Nothing was changed.');
  return snap;
}

// Scheduled backup: runs on a chart page when one is due. Read-only against TradingView.
export async function maybeAutoBackup({ api, settings, user, now = Date.now(), force = false }) {
  const cfg = settings.templates.autoBackup;
  if (!cfg?.enabled && !force) return { skipped: 'disabled' };
  const last = (await storage.get(LAST_AUTO_KEY, 0)) || 0;
  if (!force && now - last < cfg.everyHours * 3600e3) return { skipped: 'not due' };
  await storage.set(LAST_AUTO_KEY, now); // claim the slot first so parallel tabs don't all run it
  const res = await api.fetchAll({ concurrency: 2 });
  if (res.errors.length) return { skipped: 'fetch errors', errors: res.errors.length };
  const list = await loadSnapshots();
  const latest = list[0];
  // Skip identical consecutive backups.
  if (latest && JSON.stringify(latest.data) === JSON.stringify({ THEMES: res.THEMES, TOOLS: res.TOOLS })) return { skipped: 'unchanged' };
  const snap = await saveSnapshot(res, { reason: 'scheduled', user, keep: settings.templates.keepSnapshots });
  return { saved: snap.id, counts: snap.counts };
}
