// Small UI kit for the in-page panel. Everything lives in a shadow root so TradingView's CSS
// can't leak in and ours can't leak out. Colors follow TradingView's dark palette.
import { el } from '../core/dom.js';

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #0d1017; --panel: rgba(17, 20, 29, .94); --raise: rgba(255,255,255,.035); --raise2: rgba(255,255,255,.06); --line: rgba(255,255,255,.08); --line2: rgba(255,255,255,.14);
  --text: #e6e9f0; --muted: #8b92a4; --faint: #5d6476;
  --accent: #6c8cff; --accent2: #a777ff; --grad: linear-gradient(135deg, #5b8cff 0%, #9a6bff 100%);
  --green: #1fbf8f; --red: #ff5468; --orange: #ffb020; --radius: 10px;
  font: 12.5px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--text);
  -webkit-font-smoothing: antialiased;
}
svg.i { width: 15px; height: 15px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

/* Launcher */
.fab { position: fixed; z-index: 2147483000; width: 38px; height: 38px; border-radius: 12px; cursor: pointer; user-select: none;
  display: flex; align-items: center; justify-content: center; background: rgba(17,20,29,.9); backdrop-filter: blur(10px);
  border: 1px solid var(--line2); box-shadow: 0 6px 22px rgba(0,0,0,.45); transition: transform .15s, box-shadow .15s, border-color .15s; }
.fab:hover { transform: translateY(-1px); border-color: rgba(108,140,255,.6); box-shadow: 0 8px 26px rgba(91,140,255,.25); }
.fab.on { border-color: transparent; background: var(--grad); }
.fab .mark { width: 20px; height: 20px; }

/* Panel */
.panel { position: fixed; z-index: 2147483001; width: 424px; max-height: min(82vh, 760px); display: flex; flex-direction: column;
  background: var(--panel); backdrop-filter: blur(22px) saturate(140%); border: 1px solid var(--line2); border-radius: 16px;
  box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.4); overflow: hidden; animation: pop .16s ease-out; }
@keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
.panel[hidden] { display: none; }
.head { display: flex; align-items: center; gap: 10px; padding: 12px 14px 10px; cursor: move; user-select: none; }
.brand { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 14px; letter-spacing: .2px; }
.brand .mark { width: 24px; height: 24px; }
.brand small { color: var(--faint); font-weight: 600; font-size: 10.5px; margin-left: 2px; }
.head .sp { flex: 1; }
.x, .iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 0;
  background: transparent; color: var(--muted); cursor: pointer; }
.x:hover, .iconbtn:hover { background: var(--raise2); color: var(--text); }
.tabs { display: flex; gap: 2px; margin: 0 10px; padding: 3px; background: rgba(0,0,0,.28); border: 1px solid var(--line); border-radius: 11px; }
.tab { flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 4px; border: 0; border-radius: 8px; background: none;
  color: var(--muted); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; transition: background .15s, color .15s; }
.tab:hover { color: var(--text); }
.tab .lbl { overflow: hidden; white-space: nowrap; } .tab:not(.on) .lbl { display: none; } .tab.on { flex: 2.2 1 0; }
.tab.on { color: #fff; background: linear-gradient(135deg, rgba(91,140,255,.32), rgba(154,107,255,.28)); box-shadow: inset 0 0 0 1px rgba(140,160,255,.35); }
.body { overflow-y: auto; padding: 12px 14px 16px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.12) transparent; }
.body::-webkit-scrollbar { width: 8px; } .body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }

/* Sections */
.sec { margin: 2px 0 14px; padding: 12px; background: var(--raise); border: 1px solid var(--line); border-radius: 12px; }
.sec > .t { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .9px; color: var(--muted); margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
.sec > .t .grow { flex: 1; }
.row { display: flex; align-items: center; gap: 10px; margin: 7px 0; min-height: 26px; }
.row > label.l { flex: 0 0 96px; color: var(--muted); }
.wide-labels .row > label.l { flex-basis: 168px; font-size: 12px; }
.row > .grow { flex: 1; min-width: 0; }
.val { flex: 0 0 46px; text-align: right; color: var(--text); font-variant-numeric: tabular-nums; font-size: 11.5px; opacity: .85; }

/* Inputs */
input[type=text], input[type=number], input[type=time], select, textarea { width: 100%; background: rgba(0,0,0,.28); color: var(--text);
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; font: inherit; outline: none; transition: border-color .15s, box-shadow .15s; }
input[type=text]:focus, input[type=number]:focus, input[type=time]:focus, select:focus, textarea:focus { border-color: rgba(108,140,255,.7); box-shadow: 0 0 0 3px rgba(108,140,255,.18); }
select { appearance: none; padding-right: 26px; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238b92a4' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center; }
option { background: #151925; }
textarea { resize: vertical; min-height: 54px; font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 11.5px; line-height: 1.5; }
textarea.code { min-height: 220px; tab-size: 2; white-space: pre; }
input[type=color] { width: 30px; height: 30px; padding: 0; border: 1px solid var(--line2); border-radius: 8px; background: none; cursor: pointer; overflow: hidden; }
input[type=color]::-webkit-color-swatch-wrapper { padding: 0; } input[type=color]::-webkit-color-swatch { border: 0; border-radius: 7px; }

/* Range with filled track (--p set from script) */
input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; cursor: pointer; --p: 50%; }
input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, #5b8cff, #9a6bff) 0/var(--p) 100% no-repeat, rgba(255,255,255,.1); }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #fff; border: 0;
  box-shadow: 0 0 0 4px rgba(108,140,255,.25), 0 1px 3px rgba(0,0,0,.5); transition: box-shadow .15s; }
input[type=range]:hover::-webkit-slider-thumb { box-shadow: 0 0 0 6px rgba(108,140,255,.28), 0 1px 3px rgba(0,0,0,.5); }
input[type=range]::-moz-range-track { height: 4px; border-radius: 4px; background: rgba(255,255,255,.1); }
input[type=range]::-moz-range-progress { height: 4px; border-radius: 4px; background: var(--grad); }
input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 0; }

/* Switch (checkbox) */
.switch { display: flex; align-items: center; gap: 10px; cursor: pointer; width: 100%; }
.switch .txt { flex: 1; color: var(--text); }
.switch .txt small { display: block; color: var(--muted); font-size: 11px; margin-top: 1px; }
input[type=checkbox].sw { -webkit-appearance: none; appearance: none; flex: 0 0 auto; width: 32px; height: 18px; border-radius: 18px; background: rgba(255,255,255,.14);
  position: relative; cursor: pointer; transition: background .18s; margin: 0; }
input[type=checkbox].sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.4); transition: transform .18s; }
input[type=checkbox].sw:checked { background: var(--grad); }
input[type=checkbox].sw:checked::after { transform: translateX(14px); }
input[type=checkbox]:not(.sw) { accent-color: var(--accent); width: 14px; height: 14px; }

/* Segmented control */
.seg { display: flex; padding: 3px; gap: 2px; background: rgba(0,0,0,.28); border: 1px solid var(--line); border-radius: 10px; }
.seg button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 8px; border: 0; border-radius: 7px; background: none; color: var(--muted);
  font: inherit; font-weight: 600; font-size: 12px; cursor: pointer; transition: background .15s, color .15s; white-space: nowrap; }
.seg button:hover { color: var(--text); }
.seg button.on { background: rgba(255,255,255,.1); color: #fff; box-shadow: inset 0 0 0 1px var(--line2); }
.subnav { margin: 0 0 12px; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 12px; border-radius: 9px; border: 1px solid var(--line2);
  background: var(--raise2); color: var(--text); font: inherit; font-weight: 600; font-size: 12px; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s, transform .1s; }
.btn:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.22); } .btn:active { transform: translateY(1px); }
.btn:disabled { opacity: .45; cursor: default; }
.btn.primary { background: var(--grad); border-color: transparent; color: #fff; box-shadow: 0 4px 14px rgba(91,140,255,.3); }
.btn.primary:hover { filter: brightness(1.08); }
.btn.green { background: linear-gradient(135deg, #17b88a, #0e9a73); border-color: transparent; color: #fff; }
.btn.danger { background: rgba(255,84,104,.14); border-color: rgba(255,84,104,.45); color: #ff8594; }
.btn.danger:hover { background: rgba(255,84,104,.24); }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); } .btn.ghost:hover { color: var(--text); background: var(--raise2); }
.btn.sm { padding: 4px 9px; font-size: 11.5px; border-radius: 7px; }
.btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 2px; } .btns.grid2 { display: grid; grid-template-columns: 1fr 1fr; }

/* Skin cards */
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.card { position: relative; border-radius: 12px; background: #0a0c12; border: 1px solid var(--line); cursor: pointer; overflow: hidden;
  transition: transform .15s, border-color .15s, box-shadow .15s; }
.card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.2); box-shadow: 0 10px 24px rgba(0,0,0,.4); }
.card.on { border-color: transparent; box-shadow: 0 0 0 2px #7d8bff, 0 10px 28px rgba(91,140,255,.25); }
.card .thumb { display: block; width: 100%; aspect-ratio: 16 / 9; background: #07080c; }
.card .thumb canvas, .card .thumb img { display: block; width: 100%; height: 100%; }
.card .meta { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 9px 7px; background: linear-gradient(transparent, rgba(5,6,10,.92)); display: flex; align-items: flex-end; gap: 6px; }
.card .n { flex: 1; font-weight: 650; font-size: 12px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
.card .k { font-size: 9.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: rgba(255,255,255,.7); background: rgba(255,255,255,.12); padding: 2px 5px; border-radius: 5px; }
.card .menu { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  background: rgba(10,12,18,.7); color: #fff; opacity: 0; transition: opacity .15s; backdrop-filter: blur(6px); }
.card:hover .menu, .card .menu:focus { opacity: 1; }
.card .live { position: absolute; top: 7px; left: 7px; font-size: 9.5px; font-weight: 700; color: #fff; background: var(--grad); padding: 2px 6px; border-radius: 6px; letter-spacing: .4px; }
.card.add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; aspect-ratio: 16 / 9; color: var(--muted);
  border: 1px dashed rgba(255,255,255,.22); background: rgba(255,255,255,.02); font-weight: 600; }
.card.add:hover { color: #fff; border-color: rgba(140,160,255,.7); background: rgba(108,140,255,.08); }
.card.add svg.i { width: 22px; height: 22px; }

/* Hero (now playing) */
.hero { position: relative; border-radius: 14px; overflow: hidden; margin: 0 0 12px; border: 1px solid var(--line2); background: #07080c; }
.hero .thumb { display: block; width: 100%; aspect-ratio: 21 / 8; }
.hero .thumb canvas, .hero .thumb img { display: block; width: 100%; height: 100%; }
.hero .over { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 10px; padding: 12px; background: linear-gradient(transparent 30%, rgba(5,6,10,.9)); }
.hero .ttl { flex: 1; min-width: 0; }
.hero .ttl .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,.65); }
.hero .ttl .name { font-size: 16px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Chips, notes, lists, meters */
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 20px; background: rgba(255,255,255,.08); color: var(--muted); font-size: 10.5px; font-weight: 650; white-space: nowrap; }
.chip.ok { background: rgba(31,191,143,.16); color: #4fe0b2; } .chip.err { background: rgba(255,84,104,.16); color: #ff8594; } .chip.warn { background: rgba(255,176,32,.16); color: var(--orange); }
.chip.ok::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
.note { color: var(--muted); font-size: 11.5px; margin: 6px 0; line-height: 1.5; } .note.err { color: #ff8594; } .note.ok { color: #4fe0b2; }
.list { max-height: 240px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; background: rgba(0,0,0,.22); padding: 4px 0; }
.list .g { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--muted); padding: 8px 12px 3px; }
.list label { display: flex; align-items: center; gap: 8px; padding: 4px 12px; cursor: pointer; }
.list label:hover { background: rgba(255,255,255,.04); } .list label .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meter { height: 6px; background: rgba(255,255,255,.08); border-radius: 4px; overflow: hidden; } .meter > i { display: block; height: 100%; background: var(--grad); border-radius: 4px; transition: width .3s; }
.progress { height: 3px; background: rgba(255,255,255,.08); border-radius: 2px; overflow: hidden; margin: 8px 0; } .progress > i { display: block; height: 100%; width: 0; background: var(--grad); transition: width .2s; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; } .kv > :nth-child(odd) { color: var(--muted); } .kv > :nth-child(even) { font-variant-numeric: tabular-nums; }
.big { font-size: 22px; font-weight: 750; font-variant-numeric: tabular-nums; letter-spacing: -.3px; }

/* Modals and toasts */
.modal-bg { position: fixed; inset: 0; z-index: 2147483002; background: rgba(4,5,9,.55); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; animation: fade .15s; }
@keyframes fade { from { opacity: 0; } }
.modal { width: 400px; max-width: calc(100vw - 32px); max-height: 86vh; overflow: auto; background: rgba(19,22,32,.98); border: 1px solid var(--line2); border-radius: 16px; padding: 18px 20px; box-shadow: 0 30px 80px rgba(0,0,0,.7); animation: pop .16s ease-out; }
.modal.wide { width: 560px; }
.modal h3 { margin: 0 0 10px; font-size: 15px; font-weight: 700; } .modal p { color: var(--muted); margin: 0 0 12px; }
.modal pre { max-height: 180px; overflow: auto; background: rgba(0,0,0,.35); border: 1px solid var(--line); border-radius: 8px; padding: 8px; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 2147483003; padding: 9px 16px; border-radius: 12px; font-size: 12.5px; font-weight: 600;
  background: rgba(19,22,32,.97); border: 1px solid var(--line2); color: var(--text); box-shadow: 0 12px 30px rgba(0,0,0,.6); animation: pop .16s ease-out; display: flex; align-items: center; gap: 8px; }
.toast.ok { border-color: rgba(31,191,143,.5); } .toast.err { border-color: rgba(255,84,104,.55); } .toast.warn { border-color: rgba(255,176,32,.5); }

/* Session HUD */
.hud { position: fixed; z-index: 2147482999; top: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; align-items: center;
  padding: 4px 12px; border-radius: 20px; background: rgba(13,16,23,.78); border: 1px solid var(--line2); font-size: 11.5px; color: var(--text);
  pointer-events: auto; backdrop-filter: blur(10px); user-select: none; box-shadow: 0 4px 16px rgba(0,0,0,.35); cursor: pointer; }
.hud .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; box-shadow: 0 0 8px currentColor; }
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

// Brand mark: gradient tile with three candles.
export function brandMark(cls = 'mark') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', cls); svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(NS, 'defs');
  const g = document.createElementNS(NS, 'linearGradient');
  const gid = `tvs-g-${Math.random().toString(36).slice(2, 7)}`;
  g.setAttribute('id', gid); g.setAttribute('x1', '0'); g.setAttribute('y1', '0'); g.setAttribute('x2', '1'); g.setAttribute('y2', '1');
  for (const [o, c] of [['0', '#5b8cff'], ['1', '#a46bff']]) { const st = document.createElementNS(NS, 'stop'); st.setAttribute('offset', o); st.setAttribute('stop-color', c); g.append(st); }
  defs.append(g); svg.append(defs);
  const add = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); };
  add('rect', { x: '1', y: '1', width: '22', height: '22', rx: '7', fill: `url(#${gid})` });
  for (const [x, y, h] of [[6.5, 9, 7], [11, 6, 9], [15.5, 10.5, 5]]) {
    add('line', { x1: x + 1, y1: y - 2, x2: x + 1, y2: y + h + 2, stroke: '#fff', 'stroke-width': '1.2', 'stroke-linecap': 'round', opacity: '.85' });
    add('rect', { x, y, width: '2', height: h, rx: '.6', fill: '#fff' });
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
