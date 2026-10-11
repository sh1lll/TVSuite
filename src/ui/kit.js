// Small UI kit for the in-page panel. Everything lives in a shadow root so TradingView's CSS
// can't leak in and ours can't leak out. Flat surfaces and colours taken from TradingView's own dark theme.
import { el } from '../core/dom.js';

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #131722; --panel: #1e222d; --raise: #232733; --raise2: #2a2e39; --line: #2a2e39; --line2: #363a45;
  --text: #d1d4dc; --muted: #868993; --faint: #5d606b;
  --accent: #2962ff; --accent2: #2962ff; --grad: #2962ff;
  --green: #089981; --red: #f23645; --orange: #ff9800; --radius: 4px;
  font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif; color: var(--text);
  -webkit-font-smoothing: antialiased;
}
svg.i { width: 14px; height: 14px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }

/* Launcher */
.fab { position: fixed; z-index: 2147483000; width: 34px; height: 34px; border-radius: 6px; cursor: grab; user-select: none; touch-action: none;
  display: flex; align-items: center; justify-content: center; background: var(--panel); border: 1px solid var(--line2); box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.fab:hover { background: var(--raise2); }
.fab.drag { cursor: grabbing; }
.fab.on { border-color: var(--accent); }
.fab .mark { width: 22px; height: 22px; }

/* Panel */
.panel { position: fixed; z-index: 2147483001; width: 484px; max-height: min(82vh, 760px); display: flex; flex-direction: column;
  background: var(--panel); border: 1px solid var(--line2); border-radius: 6px; box-shadow: 0 8px 28px rgba(0,0,0,.5); overflow: hidden; }
.panel[hidden] { display: none; }
.head { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 9px 10px 9px 12px; cursor: move; user-select: none; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; }
.brand .mark { width: 20px; height: 20px; }
.brand small { color: var(--faint); font-weight: 400; font-size: 11px; margin-left: 2px; }
.head .sp { flex: 1; }
.x, .iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 4px; border: 0;
  background: transparent; color: var(--muted); cursor: pointer; }
.x:hover, .iconbtn:hover { background: var(--raise2); color: var(--text); }
.tabs { flex: 0 0 auto; display: flex; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line); padding: 0 6px; }
.tabs::-webkit-scrollbar { display: none; }
.tab { flex: 0 0 auto; display: flex; align-items: center; padding: 9px 8px 8px; border: 0; border-bottom: 2px solid transparent; background: none;
  color: var(--muted); cursor: pointer; font: inherit; font-weight: 500; white-space: nowrap; }
.tab svg { display: none; }
.tab:hover { color: var(--text); }
.tab.on { color: var(--text); border-bottom-color: var(--accent); }
.body { overflow-y: auto; padding: 4px 12px 14px; scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
.body::-webkit-scrollbar { width: 8px; } .body::-webkit-scrollbar-thumb { background: var(--line2); border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }

/* Sections */
.sec { margin: 0; padding: 12px 0; border-top: 1px solid var(--line); }
.body > .sec:first-child, .content > .sec:first-child { border-top: 0; }
.sec > .t { font-size: 12px; font-weight: 600; color: var(--text); margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
.sec > .t .grow { flex: 1; }
.row { display: flex; align-items: center; gap: 10px; margin: 6px 0; min-height: 26px; }
.row > label.l { flex: 0 0 96px; color: var(--muted); }
.wide-labels .row > label.l { flex-basis: 168px; }
.row > .grow { flex: 1; min-width: 0; }
.val { flex: 0 0 46px; text-align: right; color: var(--text); font-variant-numeric: tabular-nums; font-size: 11.5px; }

/* Inputs */
input[type=text], input[type=number], input[type=time], select, textarea { width: 100%; background: var(--bg); color: var(--text);
  border: 1px solid var(--line2); border-radius: 4px; padding: 5px 8px; font: inherit; outline: none; }
input[type=text]:hover, input[type=number]:hover, input[type=time]:hover, select:hover, textarea:hover { border-color: #4a4e5a; }
input[type=text]:focus, input[type=number]:focus, input[type=time]:focus, select:focus, textarea:focus { border-color: var(--accent); }
select { appearance: none; padding-right: 24px; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23868993' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 9px center; }
option { background: #1e222d; }
textarea { resize: vertical; min-height: 54px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11.5px; line-height: 1.5; }
textarea.code { min-height: 220px; tab-size: 2; white-space: pre; }
input[type=color] { width: 28px; height: 28px; padding: 0; border: 1px solid var(--line2); border-radius: 4px; background: none; cursor: pointer; overflow: hidden; }
input[type=color]::-webkit-color-swatch-wrapper { padding: 0; } input[type=color]::-webkit-color-swatch { border: 0; }

/* Range with filled track (--p set from script) */
input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; cursor: pointer; --p: 50%; }
input[type=range]::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(var(--accent), var(--accent)) 0/var(--p) 100% no-repeat, var(--line2); }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4.5px; border-radius: 50%; background: #fff; border: 0; }
input[type=range]::-moz-range-track { height: 3px; border-radius: 2px; background: var(--line2); }
input[type=range]::-moz-range-progress { height: 3px; border-radius: 2px; background: var(--accent); }
input[type=range]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 0; }

/* Switch (checkbox) */
.switch { display: flex; align-items: center; gap: 10px; cursor: pointer; width: 100%; }
.switch .txt { flex: 1; color: var(--text); }
.switch .txt small { display: block; color: var(--muted); font-size: 11px; margin-top: 1px; }
input[type=checkbox].sw { -webkit-appearance: none; appearance: none; flex: 0 0 auto; width: 28px; height: 16px; border-radius: 8px; background: #434651;
  position: relative; cursor: pointer; margin: 0; }
input[type=checkbox].sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: transform .12s; }
input[type=checkbox].sw:checked { background: var(--accent); }
input[type=checkbox].sw:checked::after { transform: translateX(12px); }
input[type=checkbox]:not(.sw) { accent-color: var(--accent); width: 14px; height: 14px; }

/* Segmented control */
.seg { display: flex; border: 1px solid var(--line2); border-radius: 4px; overflow: hidden; }
.seg button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 5px 8px; border: 0; border-left: 1px solid var(--line2); background: none; color: var(--muted);
  font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; }
.seg button:first-child { border-left: 0; }
.seg button:hover { color: var(--text); background: var(--raise); }
.seg button.on { background: var(--raise2); color: #fff; }
.subnav { margin: 10px 0 8px; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 5px 11px; border-radius: 4px; border: 1px solid var(--line2);
  background: var(--raise2); color: var(--text); font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; }
.btn:hover { background: var(--line2); }
.btn:disabled { opacity: .45; cursor: default; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover { background: #1e53e5; border-color: #1e53e5; }
.btn.green { background: var(--green); border-color: var(--green); color: #fff; }
.btn.danger { background: transparent; border-color: var(--red); color: #ff6b78; }
.btn.danger:hover { background: rgba(242,54,69,.14); }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); } .btn.ghost:hover { color: var(--text); background: var(--raise2); }
.btn.sm { padding: 3px 8px; font-size: 11.5px; }
.btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 2px; } .btns.grid2 { display: grid; grid-template-columns: 1fr 1fr; }

/* Skin cards */
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.card { position: relative; border-radius: 4px; background: #0a0c12; border: 1px solid var(--line2); cursor: pointer; overflow: hidden; }
.card:hover { border-color: #5d606b; }
.card.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.card .thumb { display: block; width: 100%; aspect-ratio: 16 / 9; background: #07080c; }
.card .thumb canvas, .card .thumb img { display: block; width: 100%; height: 100%; }
.card .meta { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 8px 6px; background: linear-gradient(transparent, rgba(5,6,10,.9)); display: flex; align-items: flex-end; gap: 6px; }
.card .n { flex: 1; font-weight: 600; font-size: 12px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card .k { font-size: 9.5px; font-weight: 600; text-transform: uppercase; color: rgba(255,255,255,.75); background: rgba(255,255,255,.14); padding: 1px 5px; border-radius: 3px; }
.card .menu { position: absolute; top: 5px; right: 5px; width: 22px; height: 22px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
  background: rgba(10,12,18,.8); color: #fff; opacity: 0; }
.card:hover .menu, .card .menu:focus { opacity: 1; }
.card .live { position: absolute; top: 6px; left: 6px; font-size: 9.5px; font-weight: 600; color: #fff; background: var(--accent); padding: 1px 6px; border-radius: 3px; }
.card.add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; aspect-ratio: 16 / 9; color: var(--muted);
  border: 1px dashed var(--line2); background: transparent; font-weight: 500; }
.card.add:hover { color: var(--text); border-color: var(--accent); }
.card.add svg.i { width: 20px; height: 20px; }

/* Hero (now playing, status blocks) */
.hero { position: relative; border-radius: 4px; overflow: hidden; margin: 8px 0 10px; border: 1px solid var(--line2); background: var(--raise); }
.hero .thumb { display: block; width: 100%; aspect-ratio: 21 / 8; }
.hero .thumb canvas, .hero .thumb img { display: block; width: 100%; height: 100%; }
.hero .over { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 10px; padding: 10px; background: linear-gradient(transparent 35%, rgba(5,6,10,.85)); }
.hero .ttl { flex: 1; min-width: 0; }
.hero .ttl .eyebrow { font-size: 10.5px; color: rgba(255,255,255,.7); }
.hero .ttl .name { font-size: 15px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Chips, notes, lists, meters */
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 7px; border-radius: 3px; background: var(--raise2); color: var(--muted); font-size: 11px; font-weight: 500; white-space: nowrap; }
.chip.ok { background: rgba(8,153,129,.18); color: #3ecfb2; } .chip.err { background: rgba(242,54,69,.18); color: #ff6b78; } .chip.warn { background: rgba(255,152,0,.18); color: var(--orange); }
.note { color: var(--muted); font-size: 11.5px; margin: 6px 0; line-height: 1.5; } .note.err { color: #ff6b78; } .note.ok { color: #3ecfb2; }
.list { max-height: 240px; overflow-y: auto; border: 1px solid var(--line2); border-radius: 4px; background: var(--bg); padding: 4px 0; }
.list .g { font-size: 11px; font-weight: 600; color: var(--muted); padding: 8px 12px 3px; }
.list label { display: flex; align-items: center; gap: 8px; padding: 4px 12px; cursor: pointer; }
.list label:hover { background: var(--raise); } .list label .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meter { height: 5px; background: var(--line2); border-radius: 2px; overflow: hidden; } .meter > i { display: block; height: 100%; background: var(--accent); transition: width .3s; }
.progress { height: 3px; background: var(--line2); border-radius: 2px; overflow: hidden; margin: 8px 0; } .progress > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .2s; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; } .kv > :nth-child(odd) { color: var(--muted); } .kv > :nth-child(even) { font-variant-numeric: tabular-nums; }
.big { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }

/* Modals and toasts */
.modal-bg { position: fixed; inset: 0; z-index: 2147483002; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; }
.modal { width: 400px; max-width: calc(100vw - 32px); max-height: 86vh; overflow: auto; background: var(--panel); border: 1px solid var(--line2); border-radius: 6px; padding: 16px 18px; box-shadow: 0 12px 40px rgba(0,0,0,.6); }
.modal.wide { width: 560px; }
.modal h3 { margin: 0 0 10px; font-size: 14px; font-weight: 600; } .modal p { color: var(--muted); margin: 0 0 12px; }
.modal pre { max-height: 180px; overflow: auto; background: var(--bg); border: 1px solid var(--line2); border-radius: 4px; padding: 8px; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 2147483003; padding: 8px 14px; border-radius: 4px; font-size: 12.5px; font-weight: 500;
  background: var(--panel); border: 1px solid var(--line2); color: var(--text); box-shadow: 0 6px 20px rgba(0,0,0,.5); display: flex; align-items: center; gap: 8px; }
.toast.ok { border-color: var(--green); } .toast.err { border-color: var(--red); } .toast.warn { border-color: var(--orange); }

/* Session HUD */
.hud { position: fixed; z-index: 2147482999; top: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; align-items: center;
  padding: 3px 10px; border-radius: 4px; background: var(--panel); border: 1px solid var(--line2); font-size: 11.5px; color: var(--text);
  pointer-events: auto; user-select: none; cursor: pointer; }
.hud .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; }
.hud .dim { color: var(--muted); }
`;

// Icons (lucide-style paths), built with the SVG namespace — no innerHTML, works under Trusted Types.
const ICONS = {
  skins: ['M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6z', 'M7.5 10.5h.01', 'M10.5 7h.01', 'M15 7.5h.01'],
  templates: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M16.5 13v7', 'M13 16.5h7'],
  sessions: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  tools: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z'],
  about: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16v-4', 'M12 8h.01'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  sparkle: ['M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  grid: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  link: ['M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  film: ['M4 4h16v16H4z', 'M8 4v16', 'M16 4v16', 'M4 9h4', 'M4 15h4', 'M16 9h4', 'M16 15h4'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M15.5 9.5h.01'],
  record: ['M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z'],
  capture: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'],
  pip: ['M3 5h18v14H3z', 'M12 12h7v5h-7z'],
  mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6'],
  share: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M8.6 13.5l6.8 4', 'M15.4 6.5l-6.8 4'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  library: ['M4 5h16', 'M4 12h16', 'M4 19h10'],
  wand: ['M15 4V2', 'M15 10V8', 'M12 6h-2', 'M20 6h-2', 'M17.8 8.2L19 9.4', 'M3 21l9-9', 'M12.2 3.8L11 2.6'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  bolt: ['M13 2L3 14h8l-1 8 10-12h-8z'],
  code: ['M8 6l-6 6 6 6', 'M16 6l6 6-6 6'],
  play: ['M7 4l13 8-13 8z'],
  check: ['M5 12l5 5 9-11'],
  shield: ['M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  risk: ['M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  book: ['M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z', 'M4 16a4 4 0 0 1 4-4h10'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12h.01'],
  power: ['M12 2v10', 'M18.4 6.6a9 9 0 1 1-12.8 0'],
  sound: ['M11 5L6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
  mute: ['M11 5L6 9H2v6h4l5 4z', 'M22 9l-6 6', 'M16 9l6 6'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14'],
  bridge: ['M3 17c3-6 15-6 18 0', 'M3 17v3', 'M21 17v3', 'M8 14v6', 'M16 14v6', 'M12 13v7'],
};
const NS = 'http://www.w3.org/2000/svg';
export function icon(name, cls = 'i') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] || []) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.append(p); }
  return svg;
}

// Brand mark: flat blue tile with three candles.
export function brandMark(cls = 'mark') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); };
  add('rect', { x: '1', y: '1', width: '22', height: '22', rx: '4', fill: '#2962ff' });
  for (const [x, y, h] of [[6.5, 9, 7], [11, 6, 9], [15.5, 10.5, 5]]) {
    add('line', { x1: x + 1, y1: y - 2, x2: x + 1, y2: y + h + 2, stroke: '#fff', 'stroke-width': '1.2', 'stroke-linecap': 'round' });
    add('rect', { x, y, width: '2', height: h, rx: '.4', fill: '#fff' });
  }
  return svg;
}

export function section(title, ...children) {
  return el('div', { class: 'sec' }, el('div', { class: 't' }, title), ...children);
}

export function row(label, ...children) {
  return el('div', { class: 'row' }, label != null ? el('label', { class: 'l' }, label) : null, ...children);
}

// Range input whose track fills up to the thumb (CSS reads --p).
export function range({ value, min, max, step = 1, onInput }) {
  const input = el('input', { type: 'range', min, max, step, value, class: 'grow' });
  const paint = () => input.style.setProperty('--p', `${((+input.value - min) / ((max - min) || 1)) * 100}%`);
  input.addEventListener('input', () => { paint(); onInput?.(+input.value); });
  paint();
  return input;
}

export function slider({ label, value, min, max, step = 1, fmt = (v) => v, onInput }) {
  const out = el('span', { class: 'val' }, fmt(value));
  const input = range({ value, min, max, step, onInput: (v) => { out.textContent = fmt(v); onInput(v); } });
  return row(label, input, out);
}

// Switch row: label (+ optional hint line) on the left, switch on the right.
export function toggle({ label, checked, onChange, hint }) {
  const input = el('input', { type: 'checkbox', class: 'sw', checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('div', { class: 'row' }, el('label', { class: 'switch' }, el('span', { class: 'txt' }, label, hint ? el('small', {}, hint) : null), input));
}

// Segmented control: options = [[value, label, iconName?], ...]
export function segmented({ value, options, onChange, cls = '' }) {
  const wrap = el('div', { class: `seg ${cls}`, role: 'tablist' });
  const paint = (v) => { for (const b of wrap.children) b.classList.toggle('on', b.dataset.value === v); };
  for (const [v, text, ic] of options) {
    const b = el('button', { type: 'button', dataset: { value: v }, role: 'tab' }, ic ? icon(ic) : null, text);
    b.addEventListener('click', () => { paint(v); onChange(v); });
    wrap.append(b);
  }
  paint(value);
  return wrap;
}

export function select({ label, value, options, onChange }) {
  const s = el('select', { class: 'grow' }, options.map(([v, text]) => el('option', { value: v, selected: v === value }, text)));
  s.addEventListener('change', () => onChange(s.value));
  return row(label, s);
}

export function button(text, onClick, variant = '', attrs = {}) {
  const { icon: ic, ...rest } = attrs;
  return el('button', { class: `btn ${variant}`, onclick: onClick, type: 'button', ...rest }, ic ? icon(ic) : null, text);
}

export function chip(text, kind = '') { return el('span', { class: `chip ${kind}` }, text); }

// Promise-based modal living in the panel's shadow root.
export function modal(root, { title, body, actions, wide = false }) {
  return new Promise((resolve) => {
    const bg = el('div', { class: 'modal-bg' });
    const close = (v) => { bg.remove(); resolve(v); };
    const acts = el('div', { class: 'btns', style: { justifyContent: 'flex-end' } }, actions.map((a) => button(a.label, () => close(a.value), a.variant || '')));
    bg.append(el('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog' }, el('h3', {}, title), ...(Array.isArray(body) ? body : [body]), acts));
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
  root.querySelectorAll(':scope > .toast').forEach((x) => x.remove());
  const t = el('div', { class: `toast ${kind}`, role: 'status' }, kind === 'ok' ? icon('check') : null, text);
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

// Two-column key/value grid. Each item gets its own element: bare text nodes would merge into a
// single anonymous grid cell and render as one run-on line.
export function kv(...items) {
  return el('div', { class: 'kv' }, items.flat().map((x) => (x instanceof Node ? x : el('span', {}, x))));
}
