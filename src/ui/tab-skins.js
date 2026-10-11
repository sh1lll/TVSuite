// Skins tab: "now playing" hero, then four views — Library, Studio (make custom skins), Look, Smart.
import { el, downloadJson, pickFile, setChildren } from '../core/dom.js';
import { section, row, slider, toggle, select, segmented, button, chip, modal, prompt, toast, copyText, icon, range } from './kit.js';
import { BUILTIN_CANVAS, BUILTIN_SHADERS } from '../modules/skins/builtins.js';
import { GALLERY } from '../../gallery/skins.mjs';
import { validateSkin, decodeSkin, skinShareLink, encodeSkin, hasCode, slugify } from '../modules/skins/packs.js';
import { paintPreview, animateOn, trustedSpec } from './previews.js';

const ALL_BUILTINS = [...BUILTIN_CANVAS.map((b) => ({ ...b, kind: 'canvas' })), ...BUILTIN_SHADERS.map((b) => ({ ...b, kind: 'shader' }))];

const CODE_TEMPLATES = {
  particles: { label: 'Canvas · particles', kind: 'canvas', code: `// draw(ctx, api) runs every frame. api: w, h, t, dt, s (chart signals 0..1), p (params), state, lib
function setup(api) {
  const r = api.lib.rng(1);
  api.state.dots = Array.from({ length: 160 }, () => ({ x: r(), y: r(), v: 0.2 + r() }));
}
function draw(ctx, api) {
  const { w, h, dt, s, lib, state } = api;
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = lib.hsl(200 + s.dist * 60, 80, 65, 0.7);
  for (const d of state.dots) {
    d.y -= dt * 0.05 * d.v * (1 + s.velocity * 3);
    if (d.y < 0) d.y += 1;
    ctx.fillRect(d.x * w, d.y * h, 2 * api.dpr, 2 * api.dpr);
  }
}` },
  gradient: { label: 'Canvas · gradient', kind: 'canvas', code: `function draw(ctx, api) {
  const { w, h, t, s, lib } = api;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, lib.hsl(230 + Math.sin(t * 0.1) * 30, 60, 10));
  g.addColorStop(1, lib.hsl(290 + s.dist * 40, 60, 18 + 10 * s.intensity));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}` },
  shader: { label: 'Shader · waves', kind: 'shader', code: `// Shadertoy-style. Extra uniforms: iSignal = (intensity, range, velocity, dist), iCalm, iPulse
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float t = iTime * (0.3 + iSignal.z);
  float wave = sin(uv.x * 8.0 + t) * 0.05 + sin(uv.x * 3.0 - t * 0.7) * 0.08;
  float band = smoothstep(0.02, 0.0, abs(uv.y - 0.5 - wave));
  vec3 col = mix(vec3(0.02, 0.03, 0.07), vec3(0.2, 0.5, 1.0), band * (0.4 + 0.6 * iSignal.x));
  fragColor = vec4(col, 1.0);
}` },
};

export function skinsTab(app) {
  const { getSettings, update, root, bus, skins } = app;
  const s = () => getSettings().skins;
  const wrap = el('div');
  let statusEl, signalsEl, stops = [];
  const studio = { mode: 'remix', base: 'aurora', name: '', params: null, editing: null, codeKind: 'canvas', code: CODE_TEMPLATES.particles.code, template: 'particles' };

  const activeId = () => { const a = s().active; return a ? (a.id || a.base) : null; };
  const builtinRecord = (b) => ({ kind: 'builtin', base: b.id, id: b.id, name: b.name, description: b.description });
  const view = () => getSettings().ui.skinsView || 'library';
  const setView = (v) => { update((st) => { st.ui.skinsView = v; }, { silent: true }); if (v !== 'studio') skins.preview(null); render(); };

  function setActive(skin) {
    update((st) => { st.skins.active = skin; st.skins.enabled = true; });
    render();
  }

  // A skin card: live still thumbnail, animated on hover for trusted skins.
  function card(record, { menu, live } = {}) {
    const on = activeId() === record.id;
    const canvas = el('canvas');
    const thumb = el('div', { class: 'thumb', style: { position: 'relative' } }, canvas);
    const kind = record.kind === 'builtin' ? (ALL_BUILTINS.find((b) => b.id === record.base)?.kind === 'shader' ? 'shader' : 'remix') : record.kind;
    const label = record.kind === 'builtin' && record.id === record.base ? (kind === 'shader' ? 'shader' : 'canvas') : kind === 'canvas' ? 'code' : kind;
    const c = el('div', { class: `card${on ? ' on' : ''}`, title: record.description || record.name, dataset: { skin: record.id }, tabindex: '0' },
      thumb,
      on ? el('span', { class: 'live' }, 'LIVE') : null,
      el('div', { class: 'meta' }, el('span', { class: 'n' }, record.name), el('span', { class: 'k' }, label)));
    paintPreview(canvas, record, { thumbnail: skins.thumbnail });
    let stop = null;
    c.addEventListener('mouseenter', () => { stop = animateOn(thumb, record); });
    c.addEventListener('mouseleave', () => { stop?.(); stop = null; });
    stops.push(() => stop?.());
    c.addEventListener('click', () => setActive(record));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') setActive(record); });
    if (menu) {
      const m = el('span', { class: 'menu', title: 'More', role: 'button', tabindex: '0' }, icon('more'));
      m.addEventListener('click', (e) => { e.stopPropagation(); menu(); });
      c.append(m);
    }
    return c;
  }

  function addCard() {
    const c = el('div', { class: 'card add', role: 'button', tabindex: '0', dataset: { action: 'new-skin' } }, icon('plus'), 'New skin');
    c.addEventListener('click', () => { Object.assign(studio, { mode: 'remix', editing: null, name: '', base: 'aurora', params: null }); setView('studio'); });
    return c;
  }

  async function libraryMenu(skin) {
    const choice = await modal(root, {
      title: skin.name,
      body: el('p', {}, `${skin.kind === 'builtin' ? `Remix of ${skin.base}` : `${skin.kind} skin`}${skin.author ? ` · by ${skin.author}` : ''}. ${skin.description || ''}`),
      actions: [
        { label: 'Delete', value: 'delete', variant: 'danger' },
        { label: 'Export', value: 'json' },
        { label: 'Copy link', value: 'link' },
        { label: 'Duplicate', value: 'dup' },
        ...(skin.kind === 'builtin' || skin.kind === 'canvas' || skin.kind === 'shader' ? [{ label: 'Edit in Studio', value: 'edit', variant: 'primary' }] : []),
      ],
    });
    if (choice === 'delete') {
      update((st) => {
        st.skins.library = st.skins.library.filter((x) => x.id !== skin.id);
        if (activeId() === skin.id) st.skins.active = builtinRecord(BUILTIN_CANVAS[0]);
      });
      render();
    } else if (choice === 'json') downloadJson(`${skin.id}.tvskin.json`, skin);
    else if (choice === 'link') { await copyText(await skinShareLink(skin)); toast(root, 'Share link copied'); }
    else if (choice === 'dup') addToLibrary({ ...structuredClone(skin), id: `${skin.id.replace(/-[a-z0-9]{4}$/, '')}-${Date.now().toString(36).slice(-4)}`, name: `${skin.name} copy` }, { activate: false });
    else if (choice === 'edit') openInStudio(skin);
  }

  function openInStudio(skin) {
    if (skin.kind === 'builtin') Object.assign(studio, { mode: 'remix', base: skin.base, name: skin.name, params: { ...(skin.params || {}) }, editing: skin.id });
    else Object.assign(studio, { mode: 'code', codeKind: skin.kind, code: skin.code || skin.glsl, name: skin.name, editing: skin.id, template: null });
    setView('studio');
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

  function addToLibrary(skin, { activate = true, quiet = false } = {}) {
    update((st) => {
      const lib = st.skins.library.filter((x) => x.id !== skin.id);
      lib.unshift(skin);
      st.skins.library = lib.slice(0, 150);
      if (activate) { st.skins.active = skin; st.skins.enabled = true; }
    });
    if (!quiet) toast(root, `Saved "${skin.name}" to My skins`);
    render();
  }

  // ---- Studio ---------------------------------------------------------------------------------
  function studioRemix() {
    const b = ALL_BUILTINS.find((x) => x.id === studio.base) || ALL_BUILTINS[0];
    if (!studio.params) studio.params = { ...(b.params || {}) };
    const record = () => ({ kind: 'builtin', base: b.id, id: studio.editing || 'studio-preview', name: studio.name || `${b.name} remix`, params: { ...studio.params } });
    const preview = el('div', { class: 'hero', style: { margin: '0 0 10px' } }, el('div', { class: 'thumb', style: { position: 'relative' } }));
    const restart = () => { stops.forEach((f) => f()); stops = []; preview.firstChild.replaceChildren(); stops.push(animateOn(preview.firstChild, record())); };
    const nameInput = el('input', { type: 'text', value: studio.name, placeholder: `${b.name} remix`, maxlength: 60 });
    nameInput.addEventListener('input', () => { studio.name = nameInput.value; });
    const baseSel = el('select', {}, ALL_BUILTINS.map((x) => el('option', { value: x.id, selected: x.id === b.id }, `${x.name}${x.kind === 'shader' ? ' · shader' : ''}`)));
    baseSel.addEventListener('change', () => { studio.base = baseSel.value; studio.params = null; render(); });
    const controls = Object.entries(studio.params).filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v))).map(([k, v]) => {
      if (typeof v === 'string') {
        const inp = el('input', { type: 'color', value: v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v.slice(0, 7) });
        inp.addEventListener('input', () => { studio.params[k] = inp.value; restart(); });
        return row(k, inp);
      }
      const [min, max, step] = b.spec?.[k] || [0, Math.max(1, Math.abs(v) * 3), Math.abs(v) >= 10 ? 1 : 0.05];
      return slider({ label: k, value: v, min, max, step, fmt: (x) => (step < 1 ? (+x).toFixed(2) : x), onInput: (x) => { studio.params[k] = x; clearTimeout(studio.t); studio.t = setTimeout(restart, 120); } });
    });
    setTimeout(restart, 0);
    const save = () => {
      const name = (studio.name || `${b.name} remix`).trim();
      const id = studio.editing || `custom-${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
      const { ok, errors, skin } = validateSkin({ kind: 'builtin', base: b.id, id, name, params: studio.params, tags: ['custom'], author: 'me', description: `Remix of ${b.name}` });
      if (!ok) { toast(root, errors.join('; '), 'err', 4000); return; }
      skins.preview(null);
      studio.editing = skin.id;
      addToLibrary(skin);
    };
    return [
      preview,
      section('Remix a built-in',
        row('Name', nameInput),
        row('Based on', baseSel),
        ...controls,
        el('div', { class: 'btns' },
          button('Try on chart', () => { skins.preview(record()); toast(root, 'Previewing on the chart — save to keep it', 'warn'); }, '', { icon: 'play' }),
          button(studio.editing ? 'Update skin' : 'Save to My skins', save, 'primary', { icon: 'check' }),
          button('Reset', () => { studio.params = null; render(); }, 'ghost'))),
    ];
  }

  function studioCode() {
    const ta = el('textarea', { class: 'code', spellcheck: 'false' });
    ta.value = studio.code;
    ta.addEventListener('input', () => { studio.code = ta.value; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const p = ta.selectionStart; ta.setRangeText('  ', p, ta.selectionEnd, 'end'); studio.code = ta.value; } e.stopPropagation(); });
    const nameInput = el('input', { type: 'text', value: studio.name, placeholder: 'My skin', maxlength: 60 });
    nameInput.addEventListener('input', () => { studio.name = nameInput.value; });
    const tplSel = el('select', {}, el('option', { value: '' }, 'Start from a template…'), Object.entries(CODE_TEMPLATES).map(([k, t]) => el('option', { value: k, selected: k === studio.template }, t.label)));
    tplSel.addEventListener('change', () => { const t = CODE_TEMPLATES[tplSel.value]; if (!t) return; Object.assign(studio, { template: tplSel.value, codeKind: t.kind, code: t.code }); render(); });
    const errBox = el('div', { class: 'note err' });
    const build = () => {
      const name = (studio.name || 'My skin').trim();
      const input = { kind: studio.codeKind, name, id: studio.editing || `custom-${slugify(name)}-${Date.now().toString(36).slice(-4)}`, author: 'me', tags: ['custom'], ...(studio.codeKind === 'shader' ? { glsl: studio.code } : { code: studio.code }) };
      const res = validateSkin(input);
      errBox.textContent = res.ok ? '' : res.errors.join('; ');
      return res.ok ? res.skin : null;
    };
    return [
      section('Write a skin',
        el('div', { class: 'note' }, 'Canvas skins define draw(ctx, api); shaders define mainImage(). Your code runs only in the sandboxed worker — errors show in the status chip above.'),
        row('Name', nameInput),
        row('Template', tplSel),
        segmented({ value: studio.codeKind, options: [['canvas', 'Canvas (JS)', 'code'], ['shader', 'Shader (GLSL)', 'sparkle']], onChange: (v) => { studio.codeKind = v; } }),
        el('div', { style: { height: '8px' } }),
        ta,
        errBox,
        el('div', { class: 'btns' },
          button('Try on chart', () => { const sk = build(); if (sk) { skins.preview(sk); toast(root, 'Running in the sandbox on your chart', 'warn'); } }, '', { icon: 'play' }),
          button(studio.editing ? 'Update skin' : 'Save to My skins', () => { const sk = build(); if (sk) { skins.preview(null); studio.editing = sk.id; addToLibrary(sk); } }, 'primary', { icon: 'check' }))),
    ];
  }

  function studioView() {
    return [
      segmented({ value: studio.mode, cls: 'subnav', options: [['remix', 'Remix', 'wand'], ['code', 'Code', 'code'], ['generate', 'AI', 'sparkle']], onChange: (v) => { Object.assign(studio, { mode: v, editing: null, name: '' }); skins.preview(null); render(); } }),
      studio.mode === 'remix' ? studioRemix() : studio.mode === 'code' ? studioCode() : generateView(),
    ];
  }

  function generateView() {
    const ta = el('textarea', { placeholder: 'rainy neon street · slow ocean at dusk · calm green matrix', rows: 3 });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    return section('Generate with AI',
      el('div', { class: 'note' }, app.ai ? 'Describe a scene. Your connected model (Options → AI provider) writes a small canvas program that runs only in the sandbox.' : 'Generation needs the browser extension with an AI provider set in Options. You can still build skins with Remix or Code.'),
      ta,
      el('div', { class: 'btns' }, button('Generate', () => generate(ta.value), 'primary', { icon: 'sparkle', disabled: !app.ai }),
        app.openOptions ? button('AI settings', () => app.openOptions(''), 'ghost') : null));
  }

  async function generate(text) {
    const promptText = (text || '').trim();
    if (!promptText) { toast(root, 'Describe the skin first', 'warn'); return; }
    if (!app.ai) { toast(root, 'Generation needs the browser extension (Options → AI provider).', 'warn', 4000); return; }
    toast(root, 'Generating… (this can take ~20s)', 'warn', 25000);
    try {
      const res = await app.ai.generate(promptText);
      const { ok, errors, skin } = validateSkin({ ...res, kind: 'canvas', name: res.name || promptText.slice(0, 40), author: res.author || 'generated', tags: ['generated'] });
      if (!ok) throw new Error(errors.join('; '));
      skin.id = `gen-${slugify(skin.name)}-${Date.now().toString(36).slice(-4)}`;
      addToLibrary(skin);
    } catch (err) {
      toast(root, `Generation failed: ${err.message}`, 'err', 6000);
    }
  }

  // ---- Library --------------------------------------------------------------------------------
  // Community gallery: bundled seed skins plus, in the extension, the latest index from GitHub.
  // Remote entries go through the same trust prompt as shared links.
  async function browseGallery() {
    const bundled = GALLERY.map((g) => validateSkin(g).skin).filter(Boolean);
    let remote = [];
    if (app.fetchGallery) { try { remote = (await app.fetchGallery()).filter((r) => !bundled.some((b) => b.id === r.id)); } catch (_) { /* offline: bundled only */ } }
    const grid = el('div', { class: 'grid' });
    const close = () => bg.remove();
    for (const [skin, trusted] of [...bundled.map((x) => [x, true]), ...remote.map((x) => [x, false])]) {
      const c = card(skin);
      c.classList.remove('on');
      c.querySelector('.live')?.remove();
      const btn = button(s().library.some((x) => x.id === skin.id) ? 'Use' : trusted ? 'Add' : 'Add (review)', () => { close(); if (trusted) addToLibrary(skin); else importSkin(JSON.stringify(skin)); }, 'sm primary');
      const cell = el('div', { class: 'row', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px', margin: 0 } }, c, el('div', { class: 'row', style: { margin: 0 } }, el('span', { class: 'note grow', style: { margin: 0 } }, skin.description || ''), btn));
      c.addEventListener('click', (e) => { e.stopPropagation(); btn.click(); }, { capture: true });
      grid.append(cell);
    }
    const bg = el('div', { class: 'modal-bg' }, el('div', { class: 'modal wide' }, el('h3', {}, 'Skin gallery'),
      el('p', {}, 'Community skins shared as JSON. Add yours with a pull request to gallery/ in the TVSuite repo.'), grid,
      el('div', { class: 'btns', style: { justifyContent: 'flex-end' } }, button('Close', close))));
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    root.append(bg);
  }

  function libraryView(cfg) {
    return [
      section(el('span', { class: 'grow' }, `My skins · ${cfg.library.length}`),
        el('div', { class: 'grid', dataset: { lib: 'mine' } }, addCard(), ...cfg.library.map((sk) => card(sk, { menu: () => libraryMenu(sk) }))),
        el('div', { class: 'btns' },
          button('Gallery', browseGallery, '', { icon: 'grid' }),
          button('Import', async () => {
            const choice = await modal(root, { title: 'Import a skin', body: el('p', {}, 'Paste a shared TVSKIN1 link or skin JSON, or pick a .json file.'), actions: [{ label: 'Cancel', value: null }, { label: 'From file', value: 'file' }, { label: 'Paste link/JSON', value: 'paste', variant: 'primary' }] });
            if (choice === 'paste') { const t = await prompt(root, { title: 'Import skin', text: 'Paste a TVSKIN1 link or skin JSON.', multiline: true }); if (t) importSkin(t); }
            else if (choice === 'file') { const f = await pickFile('.json,application/json'); if (f) importSkin(f.text); }
          }, '', { icon: 'upload' }),
          app.openOptions ? button('My media', () => app.openOptions('media'), '', { icon: 'film', title: 'Use your own video, GIF or image (stored locally)' }) : null,
          button('Share current', async () => {
            const a = cfg.active; if (!a) return;
            const rec = a.kind === 'builtin' ? { ...a, params: { ...(a.params || {}), ...(cfg.params[a.id || a.base] || {}) } } : a;
            try { await copyText(await skinShareLink(rec)); toast(root, 'Link copied — paste it anywhere'); } catch (err) { toast(root, err.message, 'err'); }
          }, '', { icon: 'share' }))),
      section('Built-in',
        el('div', { class: 'grid', dataset: { lib: 'builtin' } }, ALL_BUILTINS.map((b) => card(builtinRecord(b))))),
    ];
  }

  // ---- Look -------------------------------------------------------------------------------------
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
    return section(el('span', { class: 'grow' }, `Skin parameters · ${a.name || id}`), ...controls,
      el('div', { class: 'btns' }, button('Reset', () => { update((st) => { delete st.skins.params[id]; }); render(); }, 'sm'),
        button('Save as custom skin', () => { Object.assign(studio, { mode: 'remix', base: a.base || id, params: { ...current }, name: `${a.name || id} remix`, editing: null }); setView('studio'); }, 'sm', { icon: 'wand' })));
  }

  function lookView(cfg) {
    return [
      section('Look',
        segmented({ value: cfg.mode, options: [['under', 'Under the candles'], ['overlay', 'Overlay blend']], onChange: (v) => { update((st) => { st.skins.mode = v; }); render(); }, cls: 'mode' }),
        cfg.mode === 'overlay' ? select({ label: 'Blend', value: cfg.blend, options: [['screen', 'Screen'], ['soft-light', 'Soft light'], ['overlay', 'Overlay'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge']], onChange: (v) => update((st) => { st.skins.blend = v; }) }) : null,
        slider({ label: 'Opacity', value: cfg.opacity, min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.skins.opacity = v; }) }),
        slider({ label: 'Dim', value: cfg.dim, min: 0, max: 0.9, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.skins.dim = v; }) }),
        slider({ label: 'Blur', value: cfg.blur, min: 0, max: 20, step: 0.5, fmt: (v) => `${v}px`, onInput: (v) => update((st) => { st.skins.blur = v; }) }),
        slider({ label: 'Saturation', value: cfg.saturate, min: 0, max: 2, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.skins.saturate = v; }) }),
        toggle({ label: 'Black & white', checked: cfg.grayscale, onChange: (v) => update((st) => { st.skins.grayscale = v; }) }),
        cfg.mode === 'under' ? toggle({ label: 'Show under price/time axes', checked: cfg.includeAxes, onChange: (v) => update((st) => { st.skins.includeAxes = v; }) }) : null),
      section('Performance',
        row('Frame rate', segmented({ value: String(cfg.fps), options: [['15', '15'], ['30', '30'], ['60', '60 fps']], onChange: (v) => update((st) => { st.skins.fps = +v; }), cls: 'grow' })),
        slider({ label: 'Resolution', value: cfg.scale, min: 0.25, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, onInput: (v) => update((st) => { st.skins.scale = v; }) })),
      paramControls(),
    ];
  }

  // ---- Smart ------------------------------------------------------------------------------------
  function smartView(cfg) {
    const sym = skins.symbol();
    const pinned = sym && cfg.perSymbol?.[sym];
    return [
      section('React to the chart',
        toggle({ label: 'Reactive', hint: 'Reads the price already on screen, locally — nothing leaves your browser', checked: cfg.reactive.enabled, onChange: (v) => { update((st) => { st.skins.reactive.enabled = v; }); render(); } }),
        cfg.reactive.enabled ? [
          slider({ label: 'Range → energy', value: cfg.reactive.rangeGain, min: 0, max: 3, step: 0.1, onInput: (v) => update((st) => { st.skins.reactive.rangeGain = v; }) }),
          slider({ label: 'Speed → motion', value: cfg.reactive.velocityGain, min: 0, max: 3, step: 0.1, onInput: (v) => update((st) => { st.skins.reactive.velocityGain = v; }) }),
          toggle({ label: 'Adaptive calm mode', hint: 'Quiets the background when candles get large or fast', checked: cfg.reactive.calm.enabled, onChange: (v) => update((st) => { st.skins.reactive.calm.enabled = v; }) }),
          cfg.reactive.calm.enabled ? slider({ label: 'Calm starts at', value: cfg.reactive.calm.threshold, min: 1, max: 4, step: 0.1, fmt: (v) => `${(+v).toFixed(1)}×`, onInput: (v) => update((st) => { st.skins.reactive.calm.threshold = v; st.skins.reactive.calm.full = Math.max(v + 0.5, st.skins.reactive.calm.full); }) }) : null,
          select({ label: 'Day starts', value: cfg.dayStartTz, options: [['UTC', 'UTC midnight'], ['America/New_York', 'New York midnight'], ['Europe/London', 'London midnight'], ['Asia/Tokyo', 'Tokyo midnight']], onChange: (v) => update((st) => { st.skins.dayStartTz = v; }) }),
          signalsEl,
        ] : null),
      section('Session themes',
        toggle({ label: 'Switch skins at session opens', hint: 'Tokyo / London / New York, by the clock — set each session\'s skin in the Sessions tab', checked: cfg.sessionThemes, onChange: (v) => update((st) => { st.skins.sessionThemes = v; }) })),
      section('Rotation',
        toggle({ label: 'Rotate through selected skins', checked: cfg.playlist.enabled, onChange: (v) => { update((st) => { st.skins.playlist.enabled = v; }); render(); } }),
        cfg.playlist.enabled ? [
          row('Every', segmented({ value: String(cfg.playlist.minutes), options: [['5', '5m'], ['15', '15m'], ['30', '30m'], ['60', '1h'], ['240', '4h']], onChange: (v) => update((st) => { st.skins.playlist.minutes = +v; }), cls: 'grow' })),
          el('div', { class: 'list', style: { maxHeight: '160px' } }, [...ALL_BUILTINS, ...cfg.library].map((sk) => {
            const cb = el('input', { type: 'checkbox', checked: cfg.playlist.ids.includes(sk.id) });
            cb.addEventListener('change', () => update((st) => { const ids = new Set(st.skins.playlist.ids); if (cb.checked) ids.add(sk.id); else ids.delete(sk.id); st.skins.playlist.ids = [...ids]; }));
            return el('label', {}, cb, el('span', { class: 'nm' }, sk.name));
          })),
          el('div', { class: 'note' }, 'Priority: pinned symbol skin › session theme › rotation › selected skin.'),
        ] : null),
      sym ? section(`This symbol · ${sym}`,
        el('div', { class: 'note' }, pinned ? `Always uses "${pinned.name || pinned.id}" on ${sym}.` : `Pin a skin to ${sym}; it overrides session themes and rotation.`),
        el('div', { class: 'btns' },
          button(`Use current skin on ${sym}`, () => { update((st) => { st.skins.perSymbol[sym] = st.skins.active; }); render(); }, 'sm'),
          pinned ? button('Unpin', () => { update((st) => { delete st.skins.perSymbol[sym]; }); render(); }, 'sm') : null)) : null,
    ];
  }

  // ---- Hero + render ------------------------------------------------------------------------
  function hero(cfg) {
    const a = cfg.active;
    const canvas = el('canvas');
    const thumb = el('div', { class: 'thumb', style: { position: 'relative' } }, canvas);
    if (a) {
      paintPreview(canvas, a, { thumbnail: skins.thumbnail });
      if (trustedSpec(a) && cfg.enabled) setTimeout(() => { if (thumb.isConnected) stops.push(animateOn(thumb, a)); }, 0);
    }
    statusEl = el('span');
    const power = el('input', { type: 'checkbox', class: 'sw', checked: cfg.enabled, title: `Skin on/off (${getSettings().ui.skinHotkey})`, dataset: { power: '1' } });
    power.addEventListener('change', () => { update((st) => { st.skins.enabled = power.checked; }); render(); });
    return el('div', { class: 'hero', dataset: { hero: '1' } }, thumb,
      el('div', { class: 'over' },
        el('div', { class: 'ttl' }, el('div', { class: 'eyebrow' }, cfg.enabled ? 'Now playing' : 'Skins off'), el('div', { class: 'name' }, a?.name || '—')),
        statusEl, power));
  }

  function render() {
    stops.forEach((f) => f()); stops = [];
    const cfg = s();
    signalsEl = el('div');
    const v = view();
    setChildren(wrap,
      hero(cfg),
      segmented({ value: v, cls: 'subnav', options: [['library', 'Library', 'library'], ['studio', 'Studio', 'wand'], ['look', 'Look', 'sliders'], ['smart', 'Smart', 'bolt']], onChange: setView }),
      v === 'studio' ? studioView() : v === 'look' ? lookView(cfg) : v === 'smart' ? smartView(cfg) : libraryView(cfg));
    paintStatus(skins.status());
    if (cfg.reactive.enabled && v === 'smart') paintSignals(skins.signals());
  }

  function paintStatus(st) {
    if (!statusEl) return;
    const kind = st.state === 'error' ? 'err' : st.state === 'running' ? 'ok' : st.state === 'starting' ? 'warn' : '';
    const label = st.state === 'running' ? `${st.fps ? `${st.fps} fps` : 'live'}` : st.state === 'error' ? 'error' : st.state || 'off';
    setChildren(statusEl, chip(label, kind));
    statusEl.title = st.message || (st.frameMs ? `${st.mode} · ${st.frameMs} ms/frame` : '');
    const old = wrap.querySelector('[data-skin-error]');
    if (st.state === 'error' && st.message) {
      const n = el('div', { class: 'note err', dataset: { skinError: '1' } }, st.message);
      if (old) old.replaceWith(n); else wrap.querySelector('[data-hero]')?.after(n);
    } else old?.remove();
  }

  function paintSignals(sig) {
    if (!signalsEl || !signalsEl.isConnected) return;
    const meter = (label, value, color) => row(label, el('div', { class: 'meter grow' }, el('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color || '' } })));
    setChildren(signalsEl,
      meter('Intensity', sig.intensity), meter('Candle range', sig.range), meter('Velocity', sig.velocity),
      meter('vs daily open', (sig.dist + 1) / 2, sig.dist >= 0 ? 'linear-gradient(90deg,#1fbf8f,#4fe0b2)' : 'linear-gradient(90deg,#ff5468,#ff8594)'), meter('Calm', sig.calm, 'linear-gradient(90deg,#ffb020,#ffd27a)'));
  }

  const unsubs = [bus.on('skins:import', (text) => { setView('library'); importSkin(text); }), bus.on('skins:status', paintStatus), bus.on('skins:signals', paintSignals)];
  render();
  return { el: wrap, render, dispose: () => { unsubs.forEach((u) => u()); stops.forEach((f) => f()); skins.preview(null); } };
}

export { encodeSkin, range };
