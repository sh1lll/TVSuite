// Ledgeline level exports → level objects.
// Ledgeline writes one level per line as "TYPE,top,bottom,note" (e.g. "VL,29512.25,29508.00,rejections 5") to
// TradingView's Pine Logs. Copied logs carry timestamps and a header line, so lines are matched anywhere in the
// text and everything else is ignored: a whole copied log can be pasted as-is.

export const LEVEL_TYPES = ['PRIME', 'VL', 'RZ', 'PRINT', 'NPOC'];
export const LEVEL_NAMES = { PRIME: 'Prime ledges', VL: 'Volume ledges', RZ: 'Rejection zones', PRINT: 'Single prints', NPOC: 'Naked POCs' };
export const MAX_LEVELS = 300;

const LINE = /\b(PRIME|VL|RZ|PRINT|NPOC)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,([^\r\n]*))?/g;

export function parseLevels(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text ?? '').matchAll(LINE)) {
    const a = Number(m[2]), b = Number(m[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const top = Math.max(a, b), bottom = Math.min(a, b);
    const key = `${m[1]}|${top}|${bottom}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: m[1], top, bottom, note: (m[4] || '').trim().slice(0, 80) });
    if (out.length >= MAX_LEVELS) break;
  }
  return out;
}

// Keeps the enabled types; `types` maps a type to true/false (missing = enabled).
export function pickLevels(levels, types = {}) {
  return levels.filter((l) => types[l.type] !== false);
}

export function countByType(levels) {
  const n = Object.fromEntries(LEVEL_TYPES.map((t) => [t, 0]));
  for (const l of levels) n[l.type] = (n[l.type] || 0) + 1;
  return n;
}

// Short label drawn next to a level.
export function levelLabel(l) {
  const base = { PRIME: '★ Prime', VL: 'VL', RZ: 'RZ', PRINT: 'Print', NPOC: 'nPOC' }[l.type] || l.type;
  return l.note ? `${base} · ${l.note}` : base;
}

// Drawing tool whose saved templates style each draw mode.
export const TOOL_FOR_STYLE = { box: 'LineToolRectangle', line: 'LineToolHorzLine' };

// Saved templates for one drawing tool across backup snapshots (newest first wins on duplicate names).
export function templatesFor(snapshots, tool) {
  const out = new Map();
  for (const s of snapshots || []) {
    for (const [name, content] of Object.entries(s?.data?.TOOLS?.[tool] || {})) if (!out.has(name)) out.set(name, content);
  }
  return out;
}

// A drawing template's content → shape overrides. Only plain values are kept, so a template can restyle a
// level but can't pass anything else to the chart.
export function templateOverrides(content) {
  const src = content && typeof content === 'object' && content.properties && typeof content.properties === 'object' ? content.properties : content;
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const [k, v] of Object.entries(src).slice(0, 80)) {
    if (k.length > 40) continue;
    if ((typeof v === 'string' && v.length <= 80) || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

// "#rrggbb" → "rgba(r,g,b,a)" for shape fills.
export function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return `rgba(150,150,160,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
