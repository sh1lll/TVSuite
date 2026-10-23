// Copying drawings from a TradingView chart to another platform's embedded chart. Pure helpers: which market a
// copy belongs to, and what's safe to carry across (the page script re-checks everything again on its side).
import { parseSymbol } from '../bridge/symbols.js';

export const COPIES_KEY = 'drawings:copies';
export const MAX_DRAWINGS = 500;
export const MAX_COPIES = 30;

// Micros trade at the same price as their full-size contract, so a copy from NQ fits MNQ and the other way round.
const MICRO_OF = { MNQ: 'NQ', MES: 'ES', M2K: 'RTY', MYM: 'YM', MGC: 'GC', MCL: 'CL', SIL: 'SI', MBT: 'BTC', MET: 'ETH' };

// One key per market: NQ1!, CME_MINI:NQZ2026, NQZ6, CON.F.US.ENQ.Z26 and MNQ1! are all "NQ".
export function marketKey(symbol) {
  const raw = String(symbol || '').trim();
  if (!raw) return '';
  const c = parseSymbol(raw);
  if (c?.kind === 'future') return MICRO_OF[c.root] || c.root;
  if (c?.kind === 'stock' || c?.kind === 'index') return c.ticker;
  if (c?.kind === 'forex' || c?.kind === 'crypto') return `${c.base}${c.quote}`;
  return raw.toUpperCase().split(':').pop().slice(0, 40);
}

// Properties that tie a drawing to its source chart, or are bookkeeping, rather than how it looks.
const DROP = new Set(['symbol', 'interval', 'currencyId', 'unitId', 'symbolStateVersion', 'zOrderVersion', 'visibilityVersion', 'frozen', 'title', 'intervalsVisibilities', 'linkKey', 'sharingMode', 'alertId']);

// Plain values only, nested up to three levels (Fib levels, position colors, …); no functions, no huge strings.
export function cleanProps(props, depth = 0) {
  const out = {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n >= 200) break;
    if (k.length > 40 || DROP.has(k)) continue;
    if (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || (typeof v === 'string' && v.length <= 2000)) { out[k] = v; n++; }
    else if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) { const sub = cleanProps(v, depth + 1); if (Object.keys(sub).length) { out[k] = sub; n++; } }
  }
  return out;
}

// A drawing as stored: tool name, anchor points and its look. Anything malformed is dropped.
export function cleanDrawing(d) {
  if (!d || typeof d.name !== 'string' || !/^[a-z0-9_]{1,40}$/.test(d.name)) return null;
  const points = (Array.isArray(d.points) ? d.points : []).slice(0, 20)
    .map((p) => ({ time: +p?.time, price: +p?.price }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.price) && p.time > 0);
  if (!points.length) return null;
  const props = cleanProps(d.props);
  const text = typeof d.text === 'string' ? d.text.slice(0, 2000) : (typeof props.text === 'string' ? props.text : '');
  return { name: d.name, points, props, text };
}

// Adds (or replaces) the copy for one market, newest first, keeping at most MAX_COPIES markets.
export function addCopy(copies, { symbol, items }, now = Date.now()) {
  const key = marketKey(symbol);
  const clean = (items || []).map(cleanDrawing).filter(Boolean).slice(0, MAX_DRAWINGS);
  const rest = Object.entries(copies || {}).filter(([k]) => k !== key).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_COPIES - 1);
  return { key, count: clean.length, copies: Object.fromEntries([[key, { symbol: String(symbol || ''), at: now, items: clean }], ...rest]) };
}

// The copy to paste on a chart: the same market if there is one, otherwise the most recent.
export function pickCopy(copies, symbol) {
  const list = Object.entries(copies || {}).sort((a, b) => b[1].at - a[1].at);
  if (!list.length) return null;
  const key = marketKey(symbol);
  return (list.find(([k]) => k === key) || list[0])[0];
}

// "12 rectangles, 3 horizontal lines" for a copy.
export function describeCopy(items) {
  const n = new Map();
  for (const d of items || []) n.set(d.name, (n.get(d.name) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([name, c]) => `${c} ${name.replace(/_/g, ' ')}${c === 1 ? '' : 's'}`).join(', ');
}

// A copy as a block of text, for moving it where the extension's storage doesn't reach (TradingView Desktop, the
// userscript, another person). The first line is for people; the JSON after it is what's read back.
export function exportCopy(copy) {
  const items = (copy?.items || []).map(cleanDrawing).filter(Boolean);
  const day = new Date(copy?.at || Date.now()).toISOString().slice(0, 10);
  const head = `TVSuite drawings · ${marketKey(copy?.symbol) || '?'} · ${items.length} drawing${items.length === 1 ? '' : 's'} · ${day}`;
  return `${head}\n${JSON.stringify({ v: 1, symbol: String(copy?.symbol || ''), at: copy?.at || Date.now(), items })}`;
}

// Reads an exported block back. Throws a readable error when the text isn't one.
export function parseExport(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('That isn\'t an exported TVSuite drawings copy.');
  let data;
  try { data = JSON.parse(s.slice(a, b + 1)); } catch (_) { throw new Error('The copy is incomplete. Copy the whole block, including the last line.'); }
  if (data?.v !== 1 || !Array.isArray(data.items)) throw new Error('That isn\'t an exported TVSuite drawings copy.');
  const items = data.items.map(cleanDrawing).filter(Boolean).slice(0, MAX_DRAWINGS);
  if (!items.length) throw new Error('The exported copy has no drawings.');
  return { symbol: String(data.symbol || '').slice(0, 60), at: Number.isFinite(+data.at) ? +data.at : Date.now(), items };
}
