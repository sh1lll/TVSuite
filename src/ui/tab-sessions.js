// Sessions tab: live session clock, per-session skin mapping, custom sessions, HUD toggle.
import { el, setChildren } from '../core/dom.js';
import { section, row, toggle, button, chip, toast } from './kit.js';
import { isOpen, nextEvent, formatCountdown, parseHHMM } from '../modules/sessions/sessions.js';
import { BUILTIN_CANVAS, BUILTIN_SHADERS } from '../modules/skins/builtins.js';

export function sessionsTab(app) {
  const { getSettings, update, root } = app;
  const wrap = el('div');
  let clockEl;

  function skinOptions(current) {
    const lib = getSettings().skins.library;
    const opts = [['', '— keep current skin —'], ...BUILTIN_CANVAS.map((b) => [b.id, b.name]), ...BUILTIN_SHADERS.map((b) => [b.id, b.name]), ...lib.map((s) => [s.id, `★ ${s.name}`])];
    return opts.map(([v, t]) => el('option', { value: v, selected: v === (current || '') }, t));
  }

  function paintClock() {
    if (!clockEl?.isConnected) return;
    const list = getSettings().sessions.list;
    const now = new Date();
    const ev = nextEvent(list, now);
    setChildren(clockEl, 
      ...list.map((s) => {
        let open = false;
        try { open = isOpen(s, now); } catch (_) { /* invalid times are flagged in the editor */ }
        return el('div', { class: 'row' }, el('span', { class: 'chip', style: { background: s.color, color: '#000', opacity: open ? '1' : '.35' } }, s.name), open ? chip('open', 'ok') : chip('closed'),
          el('span', { class: 'note', style: { marginLeft: 'auto' } }, new Intl.DateTimeFormat(undefined, { timeZone: s.tz, hour: '2-digit', minute: '2-digit' }).format(now) + ` ${s.tz.split('/').pop().replace('_', ' ')}`));
      }),
      ev ? el('div', { class: 'note' }, `${ev.session.name} ${ev.type}s in ${formatCountdown(ev.at - now)}`) : null,
    );
  }

  function render() {
    const cfg = getSettings();
    clockEl = el('div');
    const editors = cfg.sessions.list.map((s, i) => {
      const set = (k, v) => update((st) => { st.sessions.list[i][k] = v; });
      const time = (k) => {
        const inp = el('input', { type: 'time', value: s[k] });
        inp.addEventListener('change', () => { try { parseHHMM(inp.value); set(k, inp.value); } catch (err) { toast(root, err.message, 'err'); } });
        return inp;
      };
      const tz = el('input', { type: 'text', value: s.tz });
      tz.addEventListener('change', () => { try { new Intl.DateTimeFormat('en', { timeZone: tz.value }); set('tz', tz.value); } catch (_) { toast(root, `Unknown time zone "${tz.value}"`, 'err'); } });
      const skinSel = el('select', {}, skinOptions(s.skin));
      skinSel.addEventListener('change', () => set('skin', skinSel.value || null));
      const color = el('input', { type: 'color', value: s.color || '#888888' });
      color.addEventListener('input', () => set('color', color.value));
      return el('div', { class: 'sec', style: { borderTop: '1px solid var(--border)', paddingTop: '6px' } },
        el('div', { class: 'row' }, color, el('b', { class: 'grow' }, s.name),
          toggle({ label: 'on', checked: s.enabled !== false, onChange: (v) => set('enabled', v) }),
          s.custom ? button('✕', () => { update((st) => { st.sessions.list.splice(i, 1); }); render(); }, 'sm') : null),
        row('Time zone', tz),
        row('Open → close', time('open'), time('close')),
        row('Skin', skinSel));
    });
    setChildren(wrap, 
      section('Now', clockEl),
      toggle({ label: 'Show session HUD on the chart', checked: cfg.sessions.hud, onChange: (v) => update((st) => { st.sessions.hud = v; }) }),
      toggle({ label: 'Switch skins at session opens', checked: cfg.skins.sessionThemes, onChange: (v) => update((st) => { st.skins.sessionThemes = v; }) }),
      section('Sessions', ...editors,
        button('+ Add session', () => {
          update((st) => { st.sessions.list.push({ id: `custom-${Date.now().toString(36)}`, name: 'Custom', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', open: '09:00', close: '17:00', days: [1, 2, 3, 4, 5], color: '#b4a7d6', skin: null, custom: true }); });
          render();
        })),
      el('div', { class: 'note' }, 'Driven by the clock alone (IANA time zones, DST-aware). Overlaps hand over to the most recently opened session. Holidays are not modelled.'),
    );
    paintClock();
  }

  const timer = setInterval(paintClock, 1000);
  render();
  return { el: wrap, render, dispose: () => clearInterval(timer) };
}
