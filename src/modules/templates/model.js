// Template backup model: format, diff and restore planning. Pure logic (unit-tested).
// The on-disk format is the one used by victornpb/tradingview-backup and vngbh/tradingview-template-manager,
// so backups move freely between those tools and TVSuite:
//   { "_": { INFO, USER, DATE }, "THEMES": { name: content }, "TOOLS": { LineToolX: { name: content } } }

import { stableStringify } from '../../core/storage.js';

export const FORMAT_INFO = 'https://github.com/victornpb/tradingview-backup (compatible) · TVSuite';

export { stableStringify };

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

// Accept a parsed backup file; returns { meta, THEMES, TOOLS } or throws with a helpful message.
export function normalizeBackup(json) {
  if (!isObj(json)) throw new Error('Backup must be a JSON object');
  const THEMES = isObj(json.THEMES) ? json.THEMES : {};
  const TOOLS = {};
  if (json.TOOLS != null && !isObj(json.TOOLS)) throw new Error('"TOOLS" must be an object');
  for (const [tool, set] of Object.entries(json.TOOLS || {})) {
    if (!/^LineTool[A-Za-z0-9]+$/.test(tool)) continue;       // ignore unknown keys rather than failing the import
    if (!isObj(set)) continue;
    TOOLS[tool] = { ...set };
  }
  if (!Object.keys(THEMES).length && !Object.keys(TOOLS).length) throw new Error('Backup contains no themes or drawing templates');
  const meta = isObj(json._) ? { user: json._.USER ?? null, date: json._.DATE ?? null, info: json._.INFO ?? null } : { user: null, date: null, info: null };
  return { meta, THEMES: { ...THEMES }, TOOLS };
}

export function makeBackup({ THEMES = {}, TOOLS = {} }, user = 'user', date = new Date()) {
  return { _: { INFO: FORMAT_INFO, USER: user, DATE: date.toISOString() }, THEMES, TOOLS };
}

export function backupFilename(user, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}.${p(date.getMinutes())}.${p(date.getSeconds())}`;
  return `TradingView ${user} (${ts}).backup.json`.replace(/[^a-z0-9\-_.() ]/gi, '_');
}

// Flatten to a list of entries for UI and diffing.
export function entries(data) {
  const out = [];
  for (const [name, content] of Object.entries(data.THEMES || {})) out.push({ kind: 'theme', tool: 'THEMES', name, content });
  for (const [tool, set] of Object.entries(data.TOOLS || {})) for (const [name, content] of Object.entries(set)) out.push({ kind: 'tool', tool, name, content });
  return out;
}

export function countEntries(data) {
  const themes = Object.keys(data.THEMES || {}).length;
  let templates = 0;
  for (const set of Object.values(data.TOOLS || {})) templates += Object.keys(set).length;
  return { themes, templates, total: themes + templates };
}

const key = (e) => `${e.tool}\u0000${e.name}`;

// Compare `source` (e.g. a snapshot) against `target` (e.g. live account).
// status: 'added' (only in source), 'removed' (only in target), 'changed', 'same'.
export function diff(source, target) {
  const a = new Map(entries(source).map((e) => [key(e), e]));
  const b = new Map(entries(target).map((e) => [key(e), e]));
  const out = [];
  for (const [k, e] of a) {
    const t = b.get(k);
    if (!t) out.push({ tool: e.tool, name: e.name, status: 'added' });
    else out.push({ tool: e.tool, name: e.name, status: stableStringify(e.content) === stableStringify(t.content) ? 'same' : 'changed' });
  }
  for (const [k, e] of b) if (!a.has(k)) out.push({ tool: e.tool, name: e.name, status: 'removed' });
  const order = { added: 0, changed: 1, removed: 2, same: 3 };
  return out.sort((x, y) => order[x.status] - order[y.status] || x.tool.localeCompare(y.tool) || x.name.localeCompare(y.name));
}

// Plan which saves to perform when restoring `selection` ([{tool, name}]) from `source` onto `live`.
// strategy: 'overwrite' | 'skip' (keep existing) | 'rename' (save as "name (restored)", "name (restored 2)", ...)
export function planRestore(source, live, selection, strategy = 'overwrite') {
  const liveNames = new Map();
  for (const e of entries(live)) {
    if (!liveNames.has(e.tool)) liveNames.set(e.tool, new Map());
    liveNames.get(e.tool).set(e.name, e.content);
  }
  const ops = [];
  for (const { tool, name } of selection) {
    const content = tool === 'THEMES' ? source.THEMES?.[name] : source.TOOLS?.[tool]?.[name];
    if (content === undefined) { ops.push({ op: 'missing', tool, name }); continue; }
    const existing = liveNames.get(tool) || new Map();
    if (!existing.has(name)) { ops.push({ op: 'save', tool, name, target: name, content }); existing.set(name, content); liveNames.set(tool, existing); continue; }
    if (stableStringify(existing.get(name)) === stableStringify(content)) { ops.push({ op: 'unchanged', tool, name }); continue; }
    if (strategy === 'skip') { ops.push({ op: 'skip', tool, name }); continue; }
    if (strategy === 'rename') {
      let target = `${name} (restored)`, i = 2;
      while (existing.has(target)) target = `${name} (restored ${i++})`;
      existing.set(target, content);
      ops.push({ op: 'save', tool, name, target, content, renamed: true });
      continue;
    }
    ops.push({ op: 'save', tool, name, target: name, content, overwrite: true });
  }
  return ops;
}

export function summarizePlan(ops) {
  const s = { save: 0, overwrite: 0, renamed: 0, skip: 0, unchanged: 0, missing: 0 };
  for (const o of ops) {
    if (o.op === 'save') { s.save++; if (o.overwrite) s.overwrite++; if (o.renamed) s.renamed++; }
    else s[o.op]++;
  }
  return s;
}

// Keep the newest `keep` snapshots.
export function pruneSnapshots(list, keep) {
  return [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.max(1, keep));
}
