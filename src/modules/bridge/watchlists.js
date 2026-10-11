// Watchlist import/export between platforms. Reads TradingView .txt exports (with ###sections),
// CSV with a Symbol/Ticker/Instrument column (Finviz, Yahoo, brokers), and one-per-line lists
// (thinkorswim, NinjaTrader, Tradovate, plain text). Writes any of them back out.
import { parseSymbol, formatSymbol } from './symbols.js';

export const WATCHLIST_FORMATS = [
  { id: 'tradingview', name: 'TradingView (.txt, keeps sections)', ext: 'txt', platform: 'tradingview' },
  { id: 'csv', name: 'CSV (Symbol, Section)', ext: 'csv', platform: 'tradingview' },
  { id: 'thinkorswim', name: 'thinkorswim (one per line)', ext: 'txt', platform: 'thinkorswim' },
  { id: 'ninjatrader', name: 'NinjaTrader instrument list', ext: 'txt', platform: 'ninjatrader' },
  { id: 'tradovate', name: 'Tradovate / Rithmic', ext: 'txt', platform: 'tradovate' },
  { id: 'yahoo', name: 'Yahoo Finance (CSV)', ext: 'csv', platform: 'yahoo' },
  { id: 'plain', name: 'Plain tickers', ext: 'txt', platform: 'metatrader' },
];

function csvRows(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

// → { sections: [{ name, symbols: [string] }], source }
export function parseWatchlist(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  const sections = [];
  let cur = { name: '', symbols: [] };
  const push = (sym) => { sym = sym.trim().replace(/^"|"$/g, ''); if (sym && !cur.symbols.includes(sym)) cur.symbols.push(sym); };
  const startSection = (name) => { if (cur.symbols.length || cur.name) sections.push(cur); cur = { name: name.trim(), symbols: [] }; };
  if (!t) return { sections: [], source: 'empty' };
  const lines = t.split(/\r?\n/);
  const header = csvRows(lines[0])[0] || [];
  const col = header.findIndex((h) => /^(symbol|ticker|instrument|contract|name of instrument)s?$/i.test(h));
  let source;
  if (col >= 0 && lines.length > 1) {
    source = 'csv';
    const sec = header.findIndex((h) => /^(section|group|list|watchlist)$/i.test(h));
    for (const r of csvRows(t).slice(1)) {
      if (sec >= 0 && (r[sec] || '') !== cur.name) startSection(r[sec] || '');
      if (r[col]) push(r[col]);
    }
  } else if (t.includes('###') || /^[A-Z0-9_]+:[^,\s]+(,[A-Z0-9_]+:[^,\s]+)+/i.test(t)) {
    source = 'tradingview';
    for (const tok of t.split(/[,\r\n]+/)) {
      if (tok.trim().startsWith('###')) startSection(tok.trim().slice(3));
      else push(tok);
    }
  } else {
    source = 'lines';
    for (const line of lines) {
      const l = line.trim();
      if (!l || l.startsWith('#') || l.startsWith('//')) { if (/^#{1,3}\s*\S/.test(l) && !l.startsWith('###')) startSection(l.replace(/^#+\s*/, '')); continue; }
      if (/[,;\t]/.test(l)) l.split(/[,;\t]/).forEach(push); else push(l);
    }
  }
  if (cur.symbols.length || cur.name) sections.push(cur);
  return { sections: sections.filter((s) => s.symbols.length), source };
}

const csvCell = (v) => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Convert to a target format. → { text, count, skipped: [{ symbol, reason }], droppedSections }
export function convertWatchlist(input, to, opts = {}) {
  const wl = typeof input === 'string' ? parseWatchlist(input) : input;
  const fmt = WATCHLIST_FORMATS.find((f) => f.id === to) || WATCHLIST_FORMATS[0];
  const skipped = [];
  const out = wl.sections.map((sec) => ({ name: sec.name, symbols: sec.symbols.map((raw) => {
    const c = parseSymbol(raw, opts);
    const v = c && formatSymbol(c, fmt.platform, opts);
    if (!v) skipped.push({ symbol: raw, reason: c ? `no ${fmt.name.split(' (')[0]} equivalent` : 'not recognized' });
    return v;
  }).filter(Boolean) })).filter((s) => s.symbols.length);
  const count = out.reduce((n, s) => n + s.symbols.length, 0);
  let text;
  if (fmt.id === 'tradingview') text = out.map((s) => [s.name ? `###${s.name}` : null, ...s.symbols].filter(Boolean).join(',')).join(',');
  else if (fmt.id === 'csv') text = ['Symbol,Section', ...out.flatMap((s) => s.symbols.map((x) => `${csvCell(x)},${csvCell(s.name)}`))].join('\n');
  else if (fmt.id === 'yahoo') text = ['Symbol', ...out.flatMap((s) => s.symbols.map(csvCell))].join('\n');
  else text = [...new Set(out.flatMap((s) => s.symbols))].join('\n');
  const droppedSections = !['tradingview', 'csv'].includes(fmt.id) && out.filter((s) => s.name).length > 0;
  return { text, count, skipped, droppedSections, format: fmt };
}
