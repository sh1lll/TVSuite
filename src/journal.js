// Journal page (extension origin): browse, edit outcomes/notes, stats, export.
import { journalStore, sanitizeEntry } from './modules/journal/store.js';
import { summarize, toCsv, plannedR, parseTags } from './modules/journal/stats.js';

const $ = (id) => document.getElementById(id);
let entries = [];
let groupBy = 'bySession';

const fmtR = (r) => (r == null || !Number.isFinite(r) ? '—' : `${r > 0 ? '+' : ''}${r.toFixed(2)}R`);
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (k === 'class') n.className = v; else n.setAttribute(k, v); } n.append(...kids.flat().filter((k) => k != null)); return n; };

function filtered() {
  const q = $('q').value.trim().toLowerCase(), side = $('side').value;
  return entries.filter((e) => (!side || e.side === side) && (!q || `${e.symbol} ${e.session} ${e.tags.join(' ')} ${e.note}`.toLowerCase().includes(q)));
}

function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function drawCurve(curve) {
  const c = $('curve'), dpr = devicePixelRatio || 1;
  c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (curve.length < 2) { ctx.fillStyle = '#868993'; ctx.font = `${12 * dpr}px sans-serif`; ctx.fillText('Equity curve (R) appears once trades have results.', 12 * dpr, 24 * dpr); return; }
  const vals = [0, ...curve.map((p) => p.r)], min = Math.min(...vals), max = Math.max(...vals), pad = 12 * dpr;
  const x = (i) => pad + (i / (vals.length - 1)) * (c.width - 2 * pad), y = (v) => c.height - pad - ((v - min) / Math.max(1e-9, max - min)) * (c.height - 2 * pad);
  ctx.strokeStyle = '#363a45'; ctx.beginPath(); ctx.moveTo(pad, y(0)); ctx.lineTo(c.width - pad, y(0)); ctx.stroke();
  ctx.strokeStyle = '#2962ff'; ctx.lineWidth = 2 * dpr; ctx.beginPath();
  vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)))); ctx.stroke();
}

function render() {
  const list = filtered();
  const s = summarize(list);
  $('stats').replaceChildren(...[
    ['Entries', s.count], ['With result', s.scored], ['Win rate', pct(s.winRate)], ['Avg', fmtR(s.avgR)], ['Total', fmtR(s.totalR)],
    ['Profit factor', s.profitFactor == null ? '—' : s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)], ['Max DD', fmtR(-s.maxDrawdownR)], ['Best / worst streak', `${s.bestStreak} / ${s.worstStreak}`],
  ].map(([label, value]) => h('div', { class: 'stat' }, h('span', {}, label), h('b', {}, String(value)))));
  drawCurve(s.curve);
  $('groupTabs').replaceChildren(...[['bySession', 'Session'], ['bySymbol', 'Symbol'], ['byTag', 'Tag'], ['bySide', 'Side'], ['byWeekday', 'Weekday']].map(([k, label]) => h('button', { class: k === groupBy ? 'on' : '', onclick: () => { groupBy = k; render(); } }, label)));
  const groups = Object.entries(s[groupBy]).sort((a, b) => b[1].count - a[1].count);
  $('groups').replaceChildren(h('tr', {}, ...['', 'Entries', 'With result', 'Win rate', 'Avg R', 'Total R', 'PF'].map((t) => h('th', {}, t))),
    ...groups.map(([k, g]) => h('tr', {}, h('td', {}, k), h('td', {}, String(g.count)), h('td', {}, String(g.scored)), h('td', {}, pct(g.winRate)), h('td', {}, fmtR(g.avgR)), h('td', { class: g.totalR > 0 ? 'pos' : g.totalR < 0 ? 'neg' : '' }, fmtR(g.totalR)), h('td', {}, g.profitFactor == null ? '—' : g.profitFactor === Infinity ? '∞' : g.profitFactor.toFixed(2)))));
  $('entries').replaceChildren(...list.map(card));
  if (!list.length) $('entries').append(h('p', { class: 'note' }, entries.length ? 'No entries match the filter.' : 'No entries yet. Press Alt+Shift+J on a TradingView chart.'));
}

function card(e) {
  const save = async (patch) => { Object.assign(e, patch); await journalStore.put(e); render(); };
  const result = h('input', { type: 'number', step: '0.1', placeholder: 'Result R', value: e.resultR ?? '' });
  result.addEventListener('change', () => save({ resultR: result.value === '' ? null : +result.value }));
  const note = h('textarea', { placeholder: 'Notes' }); note.value = e.note || '';
  note.addEventListener('change', () => save({ note: note.value }));
  const tags = h('input', { type: 'text', placeholder: 'tags', value: e.tags.join(' ') });
  tags.addEventListener('change', () => save({ tags: parseTags(tags.value) }));
  const pr = plannedR(e);
  return h('div', { class: 'entry', 'data-id': e.id },
    e.image ? h('img', { src: e.image, alt: `${e.symbol} chart`, onclick: () => { $('zoomImg').src = e.image; $('zoom').showModal(); } }) : null,
    h('div', { class: 'meta' },
      h('div', { class: 'row' }, h('b', {}, e.symbol || '—'), h('span', { class: 'note' }, `${new Date(e.createdAt).toLocaleString()} · ${e.session || 'no session'}`)),
      h('div', { class: 'row' }, h('span', { class: e.side === 'long' ? 'pos' : e.side === 'short' ? 'neg' : 'note' }, e.side), e.price != null ? h('span', { class: 'note' }, `@ ${e.price}`) : null,
        pr != null ? h('span', { class: 'note' }, `planned ${pr.toFixed(2)}R`) : null, h('span', { class: e.resultR > 0 ? 'pos' : e.resultR < 0 ? 'neg' : 'note' }, fmtR(e.resultR))),
      h('div', { class: 'row' }, result, tags),
      note,
      h('div', { class: 'row' }, e.url ? h('a', { href: e.url, target: '_blank', rel: 'noopener', class: 'note' }, 'open chart') : null,
        h('button', { onclick: async () => { if (confirm('Delete this journal entry?')) { await journalStore.remove(e.id); entries = entries.filter((x) => x.id !== e.id); render(); } } }, 'Delete'))));
}

$('q').addEventListener('input', render);
$('side').addEventListener('change', render);
$('csv').onclick = () => download('tvsuite-journal.csv', toCsv(filtered()), 'text/csv');
$('json').onclick = () => download('tvsuite-journal.json', JSON.stringify({ schema: 'tvsuite.journal/1', entries: filtered() }), 'application/json');
$('import').onclick = () => {
  const input = h('input', { type: 'file', accept: '.json' });
  input.onchange = async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      const list = Array.isArray(data?.entries) ? data.entries : [];
      for (const e of list) await journalStore.put(sanitizeEntry(e));
      entries = await journalStore.all(); render();
      alert(`Imported ${list.length} entries.`);
    } catch (err) { alert(`Import failed: ${err.message}`); }
  };
  input.click();
};
$('zoom').addEventListener('click', () => $('zoom').close());
window.addEventListener('resize', () => drawCurve(summarize(filtered()).curve));

journalStore.all().then((list) => { entries = list; render(); });
chrome.storage.onChanged.addListener((changes) => { if (changes['journal:rev']) journalStore.all().then((list) => { entries = list; render(); }); });
