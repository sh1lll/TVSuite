// Journal statistics and CSV export. Pure logic (unit-tested).
// An entry: { id, createdAt, symbol, price, session, side: 'long'|'short'|'none', entry, stop, target,
//             resultR (number|null), tags: [], note, image (data URL) }

export function plannedR(e) {
  const risk = Math.abs((e.entry ?? NaN) - (e.stop ?? NaN));
  const reward = Math.abs((e.target ?? NaN) - (e.entry ?? NaN));
  return risk > 0 && Number.isFinite(reward) ? reward / risk : null;
}

function group(entries, keyFn) {
  const out = {};
  for (const e of entries) for (const k of [].concat(keyFn(e) ?? [])) {
    if (k == null || k === '') continue;
    (out[k] ??= []).push(e);
  }
  return Object.fromEntries(Object.entries(out).map(([k, list]) => [k, summarizeList(list)]));
}

function summarizeList(list) {
  const scored = list.filter((e) => Number.isFinite(e.resultR));
  const wins = scored.filter((e) => e.resultR > 0).length;
  const losses = scored.filter((e) => e.resultR < 0).length;
  const totalR = scored.reduce((a, e) => a + e.resultR, 0);
  const grossWin = scored.filter((e) => e.resultR > 0).reduce((a, e) => a + e.resultR, 0);
  const grossLoss = -scored.filter((e) => e.resultR < 0).reduce((a, e) => a + e.resultR, 0);
  return {
    count: list.length,
    scored: scored.length,
    wins, losses,
    winRate: scored.length ? wins / scored.length : null,
    avgR: scored.length ? totalR / scored.length : null,
    totalR,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
  };
}

export function summarize(entries) {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  // Equity curve in R and max drawdown in R.
  let eq = 0, peak = 0, maxDD = 0, streak = 0, bestStreak = 0, worstStreak = 0;
  const curve = [];
  for (const e of sorted) {
    if (!Number.isFinite(e.resultR)) continue;
    eq += e.resultR; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq);
    curve.push({ t: e.createdAt, r: +eq.toFixed(4) });
    if (e.resultR > 0) streak = streak > 0 ? streak + 1 : 1; else if (e.resultR < 0) streak = streak < 0 ? streak - 1 : -1;
    bestStreak = Math.max(bestStreak, streak); worstStreak = Math.min(worstStreak, streak);
  }
  return {
    ...summarizeList(entries),
    maxDrawdownR: maxDD, bestStreak, worstStreak: -worstStreak, curve,
    bySession: group(entries, (e) => e.session),
    bySymbol: group(entries, (e) => e.symbol),
    bySide: group(entries, (e) => (e.side && e.side !== 'none' ? e.side : null)),
    byTag: group(entries, (e) => e.tags || []),
    byWeekday: group(entries, (e) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(e.createdAt).getDay()]),
  };
}

const CSV_COLUMNS = ['id', 'createdAt', 'symbol', 'price', 'session', 'side', 'entry', 'stop', 'target', 'plannedR', 'resultR', 'tags', 'note'];

function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  // Neutralize spreadsheet formula injection from free-text fields.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(entries) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const e of [...entries].sort((a, b) => a.createdAt - b.createdAt)) {
    const pr = plannedR(e);
    rows.push([e.id, new Date(e.createdAt).toISOString(), e.symbol, e.price, e.session, e.side, e.entry, e.stop, e.target, pr == null ? '' : pr.toFixed(2), e.resultR, (e.tags || []).join(' '), e.note].map(csvCell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

export function parseTags(text) {
  return [...new Set(String(text || '').split(/[\s,]+/).map((t) => t.replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(Boolean))].slice(0, 12);
}
