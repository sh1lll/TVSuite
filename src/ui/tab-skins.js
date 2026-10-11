// Skins tab: gallery, look controls, skin params, reactivity, session themes, sharing, generation.
import { el, downloadJson, pickFile, setChildren } from '../core/dom.js';
import { section, row, slider, toggle, select, button, chip, modal, prompt, toast, copyText } from './kit.js';
import { BUILTIN_CANVAS, BUILTIN_SHADERS } from '../modules/skins/builtins.js';
import { GALLERY } from '../../gallery/skins.mjs';
import { validateSkin, decodeSkin, skinShareLink, encodeSkin, hasCode, slugify } from '../modules/skins/packs.js';

const SWATCH = {
  aurora: 'linear-gradient(90deg,#0b3,#0aa,#63f)', starfield: 'linear-gradient(90deg,#000,#89a,#000)', 'rain-neon': 'linear-gradient(90deg,#f0f,#0cf)',
  synthwave: 'linear-gradient(90deg,#f0a,#fc3)', plexus: 'linear-gradient(90deg,#036,#3af)', nebula: 'linear-gradient(90deg,#408,#0bc)',
  'digital-rain': 'linear-gradient(90deg,#020,#0f6)', 'gradient-drift': 'linear-gradient(90deg,#228,#629)', embers: 'linear-gradient(90deg,#f40,#fc0)',
  'sakura-dusk': 'linear-gradient(90deg,#214,#f8c)', silk: 'linear-gradient(90deg,#163,#326,#622)', plasma: 'linear-gradient(90deg,#f0f,#0ff,#ff0)', tunnel: 'linear-gradient(90deg,#000,#68f,#000)',
};

export function skinsTab(app) {
  const { getSettings, update, root, bus, skins } = app;
  const s = () => getSettings().skins;
  const wrap = el('div');
  let statusEl, signalsEl;

  function activeId() { const a = s().active; return a ? (a.id || a.base) : null; }

  function setActive(skin) {
    update((st) => { st.skins.active = skin; st.skins.enabled = true; });
    render();
  }

  function builtinRecord(b) { return { kind: 'builtin', base: b.id, id: b.id, name: b.name }; }

  function card(record, { kind, swatch, tags = [], menu }) {
    const on = activeId() === record.id;
    const c = el('div', { class: `card${on ? ' on' : ''}`, title: record.description || record.name, dataset: { skin: record.id } },
      el('div', { class: 'n' }, record.name),
      el('div', { class: 'k' }, [kind, ...tags.slice(0, 1)].join(' · ')),
      el('div', { class: 'sw', style: { background: swatch || 'linear-gradient(90deg,#333,#666)' } }));
    c.addEventListener('click', () => setActive(record));
    if (menu) {
      const m = el('span', { class: 'menu', title: 'Share / delete' }, '⋯');
      m.addEventListener('click', (e) => { e.stopPropagation(); menu(); });
      c.append(m);
    }
    return c;
  }

  async function libraryMenu(skin) {
    const choice = await modal(root, {
      title: skin.name,
      body: el('p', {}, `${skin.kind} skin${skin.author ? ` by ${skin.author}` : ''}. ${skin.description || ''}`),
      actions: [{ label: 'Delete', value: 'delete', variant: 'danger' }, { label: 'Export JSON', value: 'json' }, { label: 'Copy link', value: 'link', variant: 'primary' }],
    });
    if (choice === 'delete') {
      update((st) => {
        st.skins.library = st.skins.library.filter((x) => x.id !== skin.id);
        if (activeId() === skin.id) st.skins.active = builtinRecord(BUILTIN_CANVAS[0]);
      });
      render();
    } else if (choice === 'json') downloadJson(`${skin.id}.tvskin.json`, skin);
    else if (choice === 'link') { await copyText(await skinShareLink(skin)); toast(root, 'Share link copied'); }
  }

  // Import flow with a trust prompt for skins that carry code.
  async function importSkin(text) {
    let skin;
    try { skin = await decodeSkin(text); } catch (err) { toast(root, `Import failed: ${err.message}`, 'err', 4000); return; }
    if (hasCode(skin)) {
      const code = skin.code || skin.glsl;
      const ok = await modal(root, {
        title: `Run "${skin.name}"?`,
        body: [el('p', {}, `This ${skin.kind === 'shader' ? 'GLSL shader' : 'canvas program'} skin contains code${skin.author ? ` from ${skin.author}` : ''}. It runs only inside TVSuite's sandbox (an isolated worker with no page, network or storage access).`), el('pre', {}, code.slice(0, 1500) + (code.length > 1500 ? '\n…' : ''))],
        actions: [{ label: 'Cancel', value: false }, { label: 'Add & run in sandbox', value: true, variant: 'primary' }],
      });
      if (!ok) return;
    }
    addToLibrary(skin);
  }

  function addToLibrary(skin) {
    update((st) => {
      const lib = st.skins.library.filter((x) => x.id !== skin.id);
      lib.unshift(skin);
      st.skins.library = lib.slice(0, 100);
      st.skins.active = skin;
      st.skins.enabled = true;
    });
    toast(root, `Added "${skin.name}"`);
    render();
  }

  function paramControls() {
    const a = s().active;
    if (!a) return null;
    const id = a.id || a.base;
    const b = skins.builtins.get(a.base || id);
    const spec = b?.spec || {};
    const defaults = { ...(b?.params || {}), ...(a.params || {}) };
    const current = { ...defaults, ...(s().params?.[id] || {}) };
    const keys = Object.keys(current).filter((k) => typeof current[k] === 'number' || (typeof current[k] === 'string' && /^#[0-9a-f]{3,8}$/i.test(current[k])));
    if (!keys.length) return null;
    const set = (k, v) => update((st) => { st.skins.params[id] = { ...(st.skins.params[id] || {}), [k]: v }; });
    const controls = keys.map((k) => {
      const v = current[k];
      if (typeof v === 'string') {
        const inp = el('input', { type: 'color', value: v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v.slice(0, 7) });
        inp.addEventListener('input', () => set(k, inp.value));
        return row(k, inp);
      }
      const [min, max, step] = spec[k] || [0, Math.max(1, Math.abs(v) * 3), Math.abs(v) >= 10 ? 1 : 0.05];
      return slider({ label: k, value: v, min, max, step, fmt: (x) => (step < 1 ? (+x).toFixed(2) : x), onInput: (x) => set(k, x) });
    });
    return section(el('span', {}, 'Skin parameters ', button('Reset', () => { update((st) => { delete st.skins.params[id]; }); render(); }, 'sm')), ...controls);
  }

  // Community gallery: bundled seed skins (reviewed in this repo) plus, in the extension, the latest
  // index from GitHub. Remote entries go through the same trust prompt as shared links.
  async function browseGallery() {
    const bundled = GALLERY.map((g) => validateSkin(g).skin).filter(Boolean);
    let remote = [];
    if (app.fetchGallery) { try { remote = (await app.fetchGallery()).filter((r) => !bundled.some((b) => b.id === r.id)); } catch (_) { /* offline: bundled only */ } }
    const list = el('div', { class: 'list', style: { maxHeight: '320px' } });
    const close = () => bg.remove();
    const add = async (skin, trusted) => { close(); if (trusted) addToLibrary(skin); else importSkin(JSON.stringify(skin)); };
    for (const [skin, trusted] of [...bundled.map((x) => [x, true]), ...remote.map((x) => [x, false])]) {
      const have = s().library.some((x) => x.id === skin.id);
      list.append(el('div', { class: 'row', style: { padding: '4px 10px' } },
        el('div', { class: 'grow' }, el('b', {}, skin.name), ' ', chip(skin.kind), trusted ? null : chip('community', 'warn'), el('div', { class: 'note' }, skin.description || '')),
        button(have ? 'Use' : 'Add', () => add(skin, trusted), 'sm primary')));
    }
    const bg = el('div', { class: 'modal-bg' }, el('div', { class: 'modal' }, el('h3', {}, 'Skin gallery'),
      el('p', {}, 'Skins shared as JSON. Add yours with a pull request to gallery/ in the TVSuite repo.'), list,
      el('div', { class: 'btns', style: { justifyContent: 'flex-end' } }, button('Close', close))));
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    root.append(bg);
  }

  async function generate() {
    const promptText = await prompt(root, { title: 'Generate a skin', text: 'Describe a scene, e.g. "rainy neon street", "slow ocean at dusk", "calm green matrix". Your connected model writes a small canvas program that runs only in the sandbox.', multiline: true, placeholder: 'rainy neon street' });
    if (!promptText || !promptText.trim()) return;
    if (!app.ai) { toast(root, 'Generation needs the browser extension (Options → AI provider).', 'warn', 4000); return; }
    toast(root, 'Generating… (this can take ~20s)', 'warn', 20000);
    try {
      const res = await app.ai.generate(promptText.trim());
      const { ok, errors, skin } = validateSkin({ ...res, kind: 'canvas', name: res.name || promptText.trim().slice(0, 40), author: res.author || 'generated', tags: ['generated'] });
      if (!ok) throw new Error(errors.join('; '));
      skin.id = `gen-${slugify(skin.name)}-${Date.now().toString(36).slice(-4)}`;
      addToLibrary(skin);
    } catch (err) {
      toast(root, `Generation failed: ${err.message}`, 'err', 6000);
    }
  }

  function render() {
    const cfg = s();
    setChildren(wrap, );
    statusEl = el('span');
    signalsEl = el('div');
    wrap.append(
      el('div', { class: 'row' }, el('div', { class: 'grow' }, toggle({ label: el('b', {}, 'Live skins'), checked: cfg.enabled, onChange: (v) => { update((st) => { st.skins.enabled = v; }); } })), statusEl),
      section('Built-in',
        el('div', { class: 'grid' }, [
          ...BUILTIN_CANVAS.map((b) => card({ ...builtinRecord(b), description: b.description }, { kind: 'canvas', swatch: SWATCH[b.id], tags: b.tags })),
          ...BUILTIN_SHADERS.map((b) => card({ ...builtinRecord(b), description: b.description }, { kind: 'shader', swatch: SWATCH[b.id], tags: b.tags })),
        ])),
      section(el('span', {}, `My skins (${cfg.library.length})`),
        cfg.library.length ? el('div', { class: 'grid' }, cfg.library.map((sk) => card(sk, { kind: sk.kind, swatch: 'linear-gradient(90deg,#2962ff,#089981)', tags: sk.tags, menu: () => libraryMenu(sk) }))) : el('div', { class: 'note' }, 'Generate one, or import a shared link / JSON.'),
        el('div', { class: 'btns' },
          button('✨ Generate…', generate, 'primary'),
          button('Gallery', browseGallery),
          button('Import link/JSON', async () => { const t = await prompt(root, { title: 'Import skin', text: 'Paste a TVSKIN1 link or skin JSON.', multiline: true }); if (t) importSkin(t); }),
          button('Import file', async () => { const f = await pickFile('.json,application/json'); if (f) importSkin(f.text); }),
          app.openOptions ? button('🎞 My media…', () => app.openOptions('media'), '', { title: 'Use your own video, GIF or image (stored locally)' }) : null,
          button('Share current', async () => {
            const a = cfg.active; if (!a) return;
            const rec = a.kind === 'builtin' ? { ...a, params: { ...(a.params || {}), ...(cfg.params[a.id || a.base] || {}) } } : a;
            try { await copyText(await skinShareLink(rec)); toast(root, 'Link copied — paste it anywhere'); } catch (err) { toast(root, err.message, 'err'); }
          }))),
      section('Look',
        select({ label: 'Mode', value: cfg.mode, options: [['under', 'Under the candles'], ['overlay', 'Overlay (blend)']], onChange: (v) => { update((st) => { st.skins.mode = v; }); render(); } }),
        cfg.mode === 'overlay' ? select({ label: 'Blend', value: cfg.blend, options: [['screen', 'Screen'], ['soft-light', 'Soft light'], ['overlay', 'Overlay'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge']], onChange: (v) => update((st) => { st.skins.blend = v; }) }) : null,
        slider({ label: 'Opacity', value: cfg.opacity, min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.skins.opacity = v; }) }),
        slider({ label: 'Dim', value: cfg.dim, min: 0, max: 0.9, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.skins.dim = v; }) }),
        slider({ label: 'Blur', value: cfg.blur, min: 0, max: 20, step: 0.5, fmt: (v) => `${v}px`, onInput: (v) => update((st) => { st.skins.blur = v; }) }),
        slider({ label: 'Saturation', value: cfg.saturate, min: 0, max: 2, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.skins.saturate = v; }) }),
        toggle({ label: 'Black & white', checked: cfg.grayscale, onChange: (v) => update((st) => { st.skins.grayscale = v; }) }),
        select({ label: 'Frame rate', value: String(cfg.fps), options: [['15', '15 fps (battery)'], ['30', '30 fps'], ['60', '60 fps']], onChange: (v) => update((st) => { st.skins.fps = +v; }) }),
        slider({ label: 'Resolution', value: cfg.scale, min: 0.25, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.skins.scale = v; }) }),
        cfg.mode === 'under' ? toggle({ label: 'Also show under price/time axes', checked: cfg.includeAxes, onChange: (v) => update((st) => { st.skins.includeAxes = v; }) }) : null),
      paramControls(),
      section('React to the chart',
        toggle({ label: 'Reactive (reads visible price text locally — nothing leaves your browser)', checked: cfg.reactive.enabled, onChange: (v) => { update((st) => { st.skins.reactive.enabled = v; }); render(); } }),
        cfg.reactive.enabled ? [
          slider({ label: 'Range → energy', value: cfg.reactive.rangeGain, min: 0, max: 3, step: 0.1, onInput: (v) => update((st) => { st.skins.reactive.rangeGain = v; }) }),
          slider({ label: 'Speed → motion', value: cfg.reactive.velocityGain, min: 0, max: 3, step: 0.1, onInput: (v) => update((st) => { st.skins.reactive.velocityGain = v; }) }),
          toggle({ label: 'Adaptive calm mode (quiet the background when candles get large or fast)', checked: cfg.reactive.calm.enabled, onChange: (v) => update((st) => { st.skins.reactive.calm.enabled = v; }) }),
          cfg.reactive.calm.enabled ? slider({ label: 'Calm starts at', value: cfg.reactive.calm.threshold, min: 1, max: 4, step: 0.1, fmt: (v) => `${(+v).toFixed(1)}×`, onInput: (v) => update((st) => { st.skins.reactive.calm.threshold = v; st.skins.reactive.calm.full = Math.max(v + 0.5, st.skins.reactive.calm.full); }) }) : null,
          select({ label: 'Day starts', value: cfg.dayStartTz, options: [['UTC', 'UTC midnight'], ['America/New_York', 'New York midnight'], ['Europe/London', 'London midnight'], ['Asia/Tokyo', 'Tokyo midnight']], onChange: (v) => update((st) => { st.skins.dayStartTz = v; }) }),
          signalsEl,
        ] : null),
      (() => {
        const sym = skins.symbol();
        if (!sym) return null;
        const pinned = cfg.perSymbol?.[sym];
        return section(`This symbol — ${sym}`,
          el('div', { class: 'note' }, pinned ? `Always uses "${pinned.name || pinned.id}" on ${sym}.` : `Pin a skin to ${sym}; it overrides session themes.`),
          el('div', { class: 'btns' },
            button(`Use current skin on ${sym}`, () => { update((st) => { st.skins.perSymbol[sym] = st.skins.active; }); render(); }, 'sm'),
            pinned ? button('Unpin', () => { update((st) => { delete st.skins.perSymbol[sym]; }); render(); }, 'sm') : null));
      })(),
      section('Rotation',
        toggle({ label: 'Rotate through selected skins', checked: cfg.playlist.enabled, onChange: (v) => { update((st) => { st.skins.playlist.enabled = v; }); render(); } }),
        cfg.playlist.enabled ? [
          select({ label: 'Every', value: String(cfg.playlist.minutes), options: [['5', '5 min'], ['15', '15 min'], ['30', '30 min'], ['60', '1 hour'], ['240', '4 hours']], onChange: (v) => update((st) => { st.skins.playlist.minutes = +v; }) }),
          el('div', { class: 'list', style: { maxHeight: '140px' } }, [...BUILTIN_CANVAS, ...BUILTIN_SHADERS, ...cfg.library].map((sk) => {
            const cb = el('input', { type: 'checkbox', checked: cfg.playlist.ids.includes(sk.id) });
            cb.addEventListener('change', () => update((st) => { const ids = new Set(st.skins.playlist.ids); if (cb.checked) ids.add(sk.id); else ids.delete(sk.id); st.skins.playlist.ids = [...ids]; }));
            return el('label', {}, cb, el('span', { class: 'nm' }, sk.name));
          })),
          el('div', { class: 'note' }, 'Order: pinned symbol skin › session theme › rotation › selected skin.'),
        ] : null),
      section('Session themes',
        toggle({ label: 'Switch skins at Tokyo / London / New York opens (clock only)', checked: cfg.sessionThemes, onChange: (v) => update((st) => { st.skins.sessionThemes = v; }) }),
        el('div', { class: 'note' }, 'Pick each session\'s skin in the Sessions tab.')),
    );
    paintStatus(skins.status());
    if (cfg.reactive.enabled) paintSignals(skins.signals());
  }

  function paintStatus(st) {
    if (!statusEl) return;
    const kind = st.state === 'error' ? 'err' : st.state === 'running' ? 'ok' : st.state === 'starting' ? 'warn' : '';
    const label = st.state === 'running' ? `${st.mode || ''}${st.fps ? ` · ${st.fps} fps` : ''}${st.frameMs ? ` · ${st.frameMs} ms` : ''}` : st.state === 'error' ? 'error' : st.state || 'off';
    setChildren(statusEl, chip(label, kind));
    statusEl.title = st.message || '';
    if (st.state === 'error' && st.message) statusEl.append(el('div', { class: 'note err', style: { maxWidth: '200px' } }, st.message));
  }

  function paintSignals(sig) {
    if (!signalsEl || !signalsEl.isConnected) return;
    const meter = (label, v, color) => row(label, el('div', { class: 'meter grow' }, el('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, background: color || '' } })));
    setChildren(signalsEl, 
      meter('Intensity', sig.intensity), meter('Candle range', sig.range), meter('Velocity', sig.velocity),
      meter('vs daily open', (sig.dist + 1) / 2, sig.dist >= 0 ? '#089981' : '#f23645'), meter('Calm', sig.calm, '#f7a600'));
  }

  const unsubs = [bus.on('skins:import', (text) => importSkin(text)), bus.on('skins:status', paintStatus), bus.on('skins:signals', paintSignals)];
  render();
  return { el: wrap, render, dispose: () => unsubs.forEach((u) => u()) };
}

export { encodeSkin };
