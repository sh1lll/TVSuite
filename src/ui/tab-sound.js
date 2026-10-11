// Sound tab: master switch, ambient bed, per-event sounds (+ voice), price alerts, my sounds, detection.
import { el, setChildren } from '../core/dom.js';
import { section, row, slider, toggle, segmented, button, chip, toast, icon } from './kit.js';
import { SYNTHS, AMBIENTS } from '../modules/sound/engine.js';
import { EVENTS, DEFAULT_SOUND } from '../modules/sound/events.js';
import { uploadZone } from './upload-zone.js';
import { normalizeMediaLink } from '../modules/skins/media-links.js';

const encode = (snd) => (!snd || snd.kind === 'none' ? 'none' : snd.kind === 'synth' ? `synth:${snd.id}` : snd.kind === 'gen' ? `gen:${snd.id}` : `lib:${snd.libId || ''}`);

export function soundTab(app) {
  const { getSettings, update, root, bus, sound, skins } = app;
  const c = () => getSettings().sound;
  const wrap = el('div');
  let statusEl;

  // Sound value <-> stored object. Library entries are referenced by their id.
  function decode(v) {
    if (v === 'none') return { kind: 'none' };
    const [k, id] = v.split(':');
    if (k === 'synth') return { kind: 'synth', id };
    if (k === 'gen') return { kind: 'gen', id };
    const lib = c().library.find((x) => x.id === id);
    if (!lib) return { kind: 'none' };
    return lib.kind === 'local' ? { kind: 'local', id: lib.fileId, libId: lib.id } : { kind: 'url', url: lib.url, libId: lib.id };
  }
  function soundSelect(value, onChange, { ambient = false } = {}) {
    const opts = [el('option', { value: 'none' }, ambient ? 'Off' : 'No sound')];
    if (ambient) opts.push(el('optgroup', { label: 'Generated' }, Object.entries(AMBIENTS).map(([id, a]) => el('option', { value: `gen:${id}` }, a.name))));
    else opts.push(el('optgroup', { label: 'Built-in' }, Object.entries(SYNTHS).map(([id, s]) => el('option', { value: `synth:${id}` }, s.name))));
    if (c().library.length) opts.push(el('optgroup', { label: 'My sounds' }, c().library.map((x) => el('option', { value: `lib:${x.id}` }, x.name))));
    const sel = el('select', { class: 'grow' }, opts);
    sel.value = value;
    if (sel.value !== value) sel.value = 'none';
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function master(cfg) {
    statusEl = el('span');
    const power = el('input', { type: 'checkbox', class: 'sw', checked: cfg.enabled, dataset: { soundPower: '1' } });
    power.addEventListener('change', () => { update((st) => { st.sound.enabled = power.checked; }); render(); });
    return el('div', { class: 'hero', style: { padding: '14px', background: 'linear-gradient(135deg, rgba(91,140,255,.18), rgba(154,107,255,.12))' } },
      el('div', { class: 'row', style: { margin: 0 } },
        icon(sound.muted() ? 'mute' : 'sound'),
        el('div', { class: 'grow' }, el('div', { style: { fontWeight: 700, fontSize: '14px' } }, 'Sound'), el('div', { class: 'note', style: { margin: 0 } }, cfg.enabled ? `Ambient, trade and market sounds · mute ${cfg.hotkeys.mute}` : 'Off — turn on for trade, session and price sounds')),
        statusEl, power),
      cfg.enabled ? slider({ label: 'Master volume', value: cfg.volume, min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.sound.volume = v; }) }) : null);
  }

  function ambientSection(cfg) {
    const cur = cfg.ambient.source;
    const chips = el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' } },
      [['none', 'Off'], ...Object.entries(AMBIENTS).map(([id, a]) => [`gen:${id}`, a.name]), ...cfg.library.map((x) => [`lib:${x.id}`, `★ ${x.name}`])].map(([v, label]) => {
        const on = (cur ? (cur.kind === 'gen' ? `gen:${cur.id}` : `lib:${cur.libId}`) : 'none') === v;
        return button(label, () => { update((st) => { st.sound.ambient.source = v === 'none' ? null : decode(v); }); render(); }, `sm${on ? ' primary' : ''}`, { dataset: { ambient: v } });
      }));
    return section('Ambient background', chips,
      slider({ label: 'Ambient volume', value: cfg.ambient.volume, min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.sound.ambient.volume = v; }) }),
      el('div', { class: 'note' }, 'Generated beds run locally and loop seamlessly. Add your own loops below. The background dips automatically when an event sound plays.'));
  }

  function eventsSection(cfg) {
    const groups = [...new Set(EVENTS.map((e) => e.group))];
    return section('Event sounds',
      toggle({ label: 'Show what played', hint: 'A brief “♪ Trade entered” chip at the top of the chart', checked: cfg.flash !== false, onChange: (v) => update((st) => { st.sound.flash = v; }) }),
      toggle({ label: 'Voice announcements', hint: 'Speaks events like “NQ1! crossed 19850” with your system voice', checked: cfg.voice.enabled, onChange: (v) => { update((st) => { st.sound.voice.enabled = v; }); render(); } }),
      cfg.voice.enabled ? voiceControls(cfg) : null,
      groups.map((g) => [
        el('div', { class: 'note', style: { marginTop: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', fontSize: '10.5px' } }, g),
        EVENTS.filter((e) => e.group === g).map((e) => {
          const ev = cfg.events[e.id] || DEFAULT_SOUND.events[e.id];
          const on = el('input', { type: 'checkbox', class: 'sw', checked: ev.on, title: 'On/off', dataset: { eventOn: e.id } });
          on.addEventListener('change', () => update((st) => { st.sound.events[e.id].on = on.checked; }));
          const sel = soundSelect(encode(ev.sound), (v) => update((st) => { st.sound.events[e.id].sound = decode(v); }));
          const test = el('button', { class: 'iconbtn', title: 'Play', type: 'button', dataset: { test: e.id } }, icon('play'));
          test.addEventListener('click', () => { if (!c().enabled) { toast(root, 'Turn Sound on first', 'warn'); return; } app.sound.fire(e.id, { symbol: skins.symbol() || 'BTCUSD', level: '64,000', session: 'New York' }, { force: true }); });
          const voice = cfg.voice.enabled && e.voice ? el('button', { class: `iconbtn`, title: ev.voice ? 'Voice on' : 'Voice off', type: 'button', style: { opacity: ev.voice ? 1 : 0.35 } }, icon('sound')) : null;
          voice?.addEventListener('click', () => { update((st) => { st.sound.events[e.id].voice = !st.sound.events[e.id].voice; }); render(); });
          const spacer = cfg.voice.enabled && !voice ? el('span', { class: 'iconbtn', 'aria-hidden': 'true', style: { visibility: 'hidden' } }) : null;
          return el('div', { class: 'row', title: e.how, dataset: { event: e.id } },
            el('div', { style: { flex: '0 0 128px', minWidth: 0 } }, el('div', { style: { fontWeight: 600, fontSize: '12px' } }, e.name), el('div', { class: 'note', style: { margin: 0, fontSize: '10.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, e.how)),
            sel, test, voice || spacer, on);
        }),
      ]),
      slider({ label: 'Big candle at', value: cfg.bigCandleMultiple, min: 1.5, max: 5, step: 0.1, fmt: (v) => `${(+v).toFixed(1)}× avg`, onInput: (v) => update((st) => { st.sound.bigCandleMultiple = v; }) }));
  }

  let voices = [];
  function voiceControls(cfg) {
    const sel = el('select', { class: 'grow' }, el('option', { value: '' }, 'System default'), voices.map((v) => el('option', { value: v }, v)));
    sel.value = cfg.voice.name || '';
    sel.addEventListener('change', () => update((st) => { st.sound.voice.name = sel.value; }));
    if (!voices.length) sound.requestVoices();
    return [row('Voice', sel, button('Say it', () => sound.speak('ES crossed 6,500'), 'sm', { icon: 'play' })),
      slider({ label: 'Speaking rate', value: cfg.voice.rate, min: 0.6, max: 1.8, step: 0.05, fmt: (v) => `${(+v).toFixed(2)}×`, onInput: (v) => update((st) => { st.sound.voice.rate = v; }) })];
  }

  function alertsSection(cfg) {
    const sym = skins.symbol() || '';
    const level = el('input', { type: 'number', step: 'any', placeholder: 'Price level' });
    level.addEventListener('keydown', (e) => e.stopPropagation());
    let dir = 'any';
    const dirSeg = segmented({ value: dir, options: [['any', 'Cross'], ['up', 'Above'], ['down', 'Below']], onChange: (v) => { dir = v; } });
    const once = el('input', { type: 'checkbox', class: 'sw', checked: true });
    const add = () => {
      const L = +level.value;
      if (!level.value || !Number.isFinite(L)) { toast(root, 'Enter a price level', 'warn'); return; }
      update((st) => { st.sound.alerts.push({ id: `a${Date.now().toString(36)}`, symbol: sym, level: L, dir, once: once.checked, armed: true }); });
      render();
    };
    return section(`Price alerts${sym ? ` · ${sym}` : ''}`,
      el('div', { class: 'note' }, 'Local alerts read the price on screen; they work while this chart is open — no TradingView alert slots used.'),
      el('div', { class: 'row' }, el('div', { class: 'grow' }, level), button('Add', add, 'primary', { icon: 'plus' })),
      row('Trigger', dirSeg),
      el('div', { class: 'row' }, el('label', { class: 'switch' }, el('span', { class: 'txt' }, 'Fire once, then disarm'), once)),
      cfg.alerts.length ? el('div', { class: 'list' }, cfg.alerts.map((a) => {
        const re = button(a.armed === false ? 'Re-arm' : 'Armed', () => { update((st) => { const x = st.sound.alerts.find((y) => y.id === a.id); if (x) x.armed = x.armed === false; }); render(); }, `sm${a.armed === false ? '' : ' primary'}`);
        const del = el('button', { class: 'iconbtn', title: 'Delete', type: 'button' }, icon('trash'));
        del.addEventListener('click', () => { update((st) => { st.sound.alerts = st.sound.alerts.filter((y) => y.id !== a.id); }); render(); });
        return el('div', { class: 'row', style: { padding: '0 10px' }, dataset: { alert: a.id } }, el('span', { class: 'nm grow' }, `${a.symbol || 'Any symbol'} ${a.dir === 'up' ? '≥' : a.dir === 'down' ? '≤' : '×'} ${a.level}`), chip(a.once ? 'once' : 'every time'), re, del);
      })) : null);
  }

  function librarySection(cfg) {
    const link = el('input', { type: 'text', placeholder: 'Paste a sound link (.mp3 .wav .ogg …)' });
    link.addEventListener('keydown', (e) => e.stopPropagation());
    const addLink = () => {
      let url;
      try { url = normalizeMediaLink(link.value).url; } catch (err) { toast(root, err.message, 'err', 4000); return; }
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Sound').replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Sound';
      update((st) => { st.sound.library.push({ id: `s${Date.now().toString(36)}`, name, kind: 'url', url }); });
      render();
    };
    return section(`My sounds · ${cfg.library.length}`,
      uploadZone({ accept: 'audio', height: 104, onItems: (items) => {
        update((st) => { for (const m of items) st.sound.library.push({ id: `s${m.id}`, name: m.name, kind: 'local', fileId: m.id }); });
        toast(root, `Added ${items.length} sound${items.length > 1 ? 's' : ''}`);
        render();
      } }),
      el('div', { class: 'row' }, el('div', { class: 'grow' }, link), button('Add link', addLink)),
      cfg.library.length ? el('div', { class: 'list' }, cfg.library.map((x) => {
        const play = el('button', { class: 'iconbtn', title: 'Play', type: 'button' }, icon('play'));
        play.addEventListener('click', () => sound.test(decode(`lib:${x.id}`)));
        const del = el('button', { class: 'iconbtn', title: 'Remove', type: 'button' }, icon('trash'));
        del.addEventListener('click', () => { update((st) => { st.sound.library = st.sound.library.filter((y) => y.id !== x.id); }); render(); });
        return el('div', { class: 'row', style: { padding: '0 10px' } }, el('span', { class: 'nm grow' }, x.name), chip(x.kind === 'local' ? 'file' : 'link'), play, del);
      })) : el('div', { class: 'note' }, 'Use your own clips for any event — a bell for entries, a cheer for take-profits, a café loop as ambient.'));
  }

  function detectionSection(cfg) {
    const area = (key, label) => {
      const ta = el('textarea', { rows: 2 });
      ta.value = cfg.detect[key].join(', ');
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      ta.addEventListener('change', () => update((st) => { st.sound.detect[key] = ta.value.split(',').map((w) => w.trim()).filter(Boolean); }));
      return [el('div', { class: 'note', style: { marginBottom: '2px' } }, label), ta];
    };
    return section('Trade & alert detection',
      el('div', { class: 'note' }, `TVSuite listens for TradingView's own pop-ups and matches these words (comma-separated). It never touches orders. Manual: ${cfg.hotkeys.entry} = entered, ${cfg.hotkeys.exit} = closed.`),
      area('entryWords', 'Trade entered when a pop-up says'), area('exitWords', 'Trade closed when a pop-up says'), area('alertWords', 'Alert fired when a pop-up says'));
  }

  function notifySection(cfg) {
    return section('Desktop notifications',
      el('div', { class: 'note' }, cfg.notify ? 'On — events also show a system notification while this tab is in the background.' : 'Get a system notification for these events while the chart tab is in the background.'),
      app.openOptions ? el('div', { class: 'btns' }, button(cfg.notify ? 'Change in Options' : 'Turn on in Options', () => app.openOptions('notify'), 'sm')) : null);
  }

  function render() {
    const cfg = c();
    setChildren(wrap, master(cfg), cfg.enabled ? [ambientSection(cfg), eventsSection(cfg), alertsSection(cfg), librarySection(cfg), notifySection(cfg), detectionSection(cfg)] : null);
    paintStatus(sound.stats());
  }
  function paintStatus(st) {
    if (!statusEl) return;
    setChildren(statusEl, st.error ? chip('error', 'err') : c().enabled ? chip(sound.muted() ? 'muted' : 'on', sound.muted() ? 'warn' : 'ok') : null);
    statusEl.title = st.error || '';
  }
  const unsubs = [bus.on('sound:status', paintStatus), bus.on('sound:fired', (e) => { if (e.type === 'priceAlert') setTimeout(render, 50); }), bus.on('sound:muted', () => render()),
    bus.on('sound:voices', (list) => { const fresh = list.join('|') !== voices.join('|'); voices = list; if (fresh && list.length) render(); })];
  render();
  return { el: wrap, render, dispose: () => unsubs.forEach((u) => u()) };
}
