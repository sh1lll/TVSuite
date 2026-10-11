// Small UI kit for the in-page panel. Everything lives in a shadow root so TradingView's CSS
// can't leak in and ours can't leak out. Colors follow TradingView's dark palette.
import { el } from '../core/dom.js';

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root { --bg:#131722; --surface:#1e222d; --surface2:#2a2e39; --border:#363a45; --text:#d1d4dc; --muted:#868993;
  --accent:#2962ff; --green:#089981; --red:#f23645; --orange:#f7a600; --radius:6px;
  font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif; color: var(--text); }
.fab { position: fixed; z-index: 2147483000; width: 34px; height: 34px; border-radius: 8px; background: var(--surface);
  border: 1px solid var(--border); color: #fff; font-weight: 700; font-size: 11px; letter-spacing: .3px; cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; user-select: none; }
.fab.on { border-color: var(--accent); }
.panel { position: fixed; z-index: 2147483001; width: 400px; max-height: min(78vh, 720px); display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,.7); overflow: hidden; }
.panel[hidden] { display: none; }
.head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--bg); border-bottom: 1px solid var(--border); cursor: move; user-select: none; }
.logo { font-weight: 700; letter-spacing: .4px; } .logo b { color: var(--accent); }
.head .sp { flex: 1; }
.x { background: none; border: 0; color: var(--muted); font-size: 16px; cursor: pointer; padding: 0 4px; }
.x:hover { color: var(--text); }
.tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--bg); }
.tab { flex: 1; padding: 7px 4px; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); cursor: pointer; font: inherit; font-weight: 600; }
.tab.on { color: var(--text); border-bottom-color: var(--accent); }
.body { overflow-y: auto; padding: 10px 12px 14px; }
.body::-webkit-scrollbar { width: 6px; } .body::-webkit-scrollbar-thumb { background: var(--surface2); border-radius: 3px; }
.sec { margin: 4px 0 12px; }
.sec > .t { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--muted); margin: 6px 0 6px; display: flex; align-items: center; gap: 6px; }
.row { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
.row > label.l { flex: 0 0 104px; color: var(--muted); }
.row > .grow { flex: 1; min-width: 0; }
.val { flex: 0 0 44px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
input[type=range] { width: 100%; accent-color: var(--accent); }
input[type=checkbox] { accent-color: var(--accent); }
input[type=text], input[type=number], input[type=time], select, textarea { width: 100%; background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius); padding: 5px 7px; font: inherit; }
textarea { resize: vertical; min-height: 54px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; }
input[type=color] { width: 34px; height: 22px; padding: 0; border: 1px solid var(--border); border-radius: 4px; background: none; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; border-radius: var(--radius);
  border: 1px solid var(--border); background: transparent; color: var(--text); font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn:hover { background: rgba(255,255,255,.05); } .btn:disabled { opacity: .45; cursor: default; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.green { background: var(--green); border-color: var(--green); color: #fff; }
.btn.danger { background: var(--red); border-color: var(--red); color: #fff; }
.btn.sm { padding: 3px 7px; font-size: 11px; }
.btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; } .btns.grid2 { display: grid; grid-template-columns: 1fr 1fr; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.card { position: relative; padding: 7px 7px 6px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); cursor: pointer; min-height: 52px; }
.card:hover { border-color: #4a4f5c; } .card.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.card .n { font-weight: 600; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card .k { color: var(--muted); font-size: 10px; } .card .sw { height: 6px; border-radius: 3px; margin-top: 5px; }
.card .menu { position: absolute; top: 3px; right: 4px; color: var(--muted); font-size: 12px; padding: 0 3px; }
.chip { display: inline-block; padding: 1px 6px; border-radius: 9px; background: var(--surface2); color: var(--muted); font-size: 10.5px; font-weight: 600; }
.chip.ok { background: rgba(8,153,129,.18); color: #3fd3b4; } .chip.err { background: rgba(242,54,69,.18); color: #ff6b78; } .chip.warn { background: rgba(247,166,0,.18); color: var(--orange); }
.note { color: var(--muted); font-size: 11px; margin: 4px 0; } .note.err { color: #ff6b78; } .note.ok { color: #3fd3b4; }
.list { max-height: 240px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); padding: 4px 0; }
.list .g { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); padding: 6px 10px 2px; }
.list label { display: flex; align-items: center; gap: 6px; padding: 2px 10px; cursor: pointer; }
.list label:hover { background: rgba(255,255,255,.04); } .list label .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meter { height: 5px; background: var(--surface2); border-radius: 3px; overflow: hidden; } .meter > i { display: block; height: 100%; background: var(--accent); transition: width .25s; }
.progress { height: 3px; background: var(--surface2); border-radius: 2px; overflow: hidden; margin: 6px 0; } .progress > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .2s; }
.modal-bg { position: fixed; inset: 0; z-index: 2147483002; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; }
.modal { width: 380px; max-width: calc(100vw - 32px); background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; box-shadow: 0 16px 48px rgba(0,0,0,.9); }
.modal h3 { margin: 0 0 8px; font-size: 14px; } .modal p { color: var(--muted); margin: 0 0 10px; }
.modal pre { max-height: 160px; overflow: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 6px; font-size: 10.5px; white-space: pre-wrap; word-break: break-word; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; } .kv > :nth-child(odd) { color: var(--muted); }
.big { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.hud { position: fixed; z-index: 2147482999; top: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; align-items: center;
  padding: 3px 10px; border-radius: 12px; background: rgba(19,23,34,.82); border: 1px solid var(--border); font-size: 11px; color: var(--text);
  pointer-events: auto; backdrop-filter: blur(6px); user-select: none; }
.hud .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 4px; }
.hud .dim { color: var(--muted); }
`;

export function section(title, ...children) {
  return el('div', { class: 'sec' }, el('div', { class: 't' }, title), ...children);
}

export function row(label, ...children) {
  return el('div', { class: 'row' }, label != null ? el('label', { class: 'l' }, label) : null, ...children);
}

export function slider({ label, value, min, max, step = 1, fmt = (v) => v, onInput }) {
  const out = el('span', { class: 'val' }, fmt(value));
  const input = el('input', { type: 'range', min, max, step, value, class: 'grow' });
  input.addEventListener('input', () => { const v = +input.value; out.textContent = fmt(v); onInput(v); });
  return row(label, input, out);
}

export function toggle({ label, checked, onChange, hint }) {
  const input = el('input', { type: 'checkbox', checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('div', { class: 'row' }, el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, input, label), hint ? el('span', { class: 'note', style: { margin: '0 0 0 auto' } }, hint) : null);
}

export function select({ label, value, options, onChange }) {
  const s = el('select', { class: 'grow' }, options.map(([v, text]) => el('option', { value: v, selected: v === value }, text)));
  s.addEventListener('change', () => onChange(s.value));
  return row(label, s);
}

export function button(text, onClick, variant = '', attrs = {}) {
  return el('button', { class: `btn ${variant}`, onclick: onClick, type: 'button', ...attrs }, text);
}

export function chip(text, kind = '') { return el('span', { class: `chip ${kind}` }, text); }

// Promise-based modal living in the panel's shadow root.
export function modal(root, { title, body, actions }) {
  return new Promise((resolve) => {
    const bg = el('div', { class: 'modal-bg' });
    const close = (v) => { bg.remove(); resolve(v); };
    const acts = el('div', { class: 'btns', style: { justifyContent: 'flex-end' } }, actions.map((a) => button(a.label, () => close(a.value), a.variant || '')));
    bg.append(el('div', { class: 'modal', role: 'dialog' }, el('h3', {}, title), ...(Array.isArray(body) ? body : [body]), acts));
    bg.addEventListener('click', (e) => { if (e.target === bg) close(null); });
    root.append(bg);
  });
}

export async function confirmTyped(root, { title, text, word }) {
  const input = el('input', { type: 'text', placeholder: `Type ${word}` });
  const res = await modal(root, { title, body: [el('p', {}, text), input], actions: [{ label: 'Cancel', value: false }, { label: 'Confirm', value: true, variant: 'danger' }] });
  return res && input.value.trim() === word;
}

export async function prompt(root, { title, text, multiline = false, placeholder = '' }) {
  const input = multiline ? el('textarea', { placeholder, rows: 6 }) : el('input', { type: 'text', placeholder });
  const res = await modal(root, { title, body: [text ? el('p', {}, text) : null, input].filter(Boolean), actions: [{ label: 'Cancel', value: false }, { label: 'OK', value: true, variant: 'primary' }] });
  return res ? input.value : null;
}

export function toast(root, text, kind = 'ok', ms = 2600) {
  const t = el('div', { class: `chip ${kind}`, style: { position: 'fixed', bottom: '18px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483003', padding: '6px 12px', fontSize: '12px', boxShadow: '0 4px 16px rgba(0,0,0,.6)', background: '#1e222d' } }, text);
  root.append(t);
  setTimeout(() => t.remove(), ms);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallback());
  return Promise.resolve(fallback());
  function fallback() {
    const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }
}
