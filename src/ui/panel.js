// Floating panel with tabs, plus the launcher button. Draggable; position remembered.
import { el, setChildren } from '../core/dom.js';
import { storage } from '../core/storage.js';
import { CSS, icon, brandMark } from './kit.js';
import { skinsTab } from './tab-skins.js';
import { templatesTab } from './tab-templates.js';
import { sessionsTab } from './tab-sessions.js';
import { toolsTab } from './tab-tools.js';
import { aboutTab } from './tab-about.js';

const ALL_TABS = [['skins', 'Skins'], ['templates', 'Templates'], ['sessions', 'Sessions'], ['tools', 'Tools'], ['about', 'About']];
const SHORT = { templates: 'Backup' };
const POS_KEY = 'ui:pos';

export async function createPanel(app) {
  const host = el('div', { id: 'tvsuite-panel-host' });
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(el('style', {}, CSS));
  const root = el('div', { class: 'root' });
  shadow.append(root);
  app.root = root;

  const pos = (await storage.get(POS_KEY)) || { x: 52, y: null };
  const fab = el('div', { class: 'fab', title: `TVSuite (${app.getSettings().ui.panelHotkey})`, role: 'button', tabindex: '0', 'aria-label': 'Open TVSuite' }, brandMark());
  const body = el('div', { class: 'body' });
  const tabsBar = el('div', { class: 'tabs' });
  const panel = el('div', { class: 'panel', hidden: true },
    el('div', { class: 'head' }, el('span', { class: 'brand' }, brandMark(), 'TVSuite', el('small', {}, `v${app.version}`)), el('span', { class: 'sp' }),
      el('button', { class: 'x', title: `Close (${app.getSettings().ui.panelHotkey})`, 'aria-label': 'Close', onclick: () => setOpen(false) }, icon('close'))),
    tabsBar, body);
  root.append(fab, panel);

  function place() {
    const y = pos.y ?? window.innerHeight - 110;
    Object.assign(fab.style, { left: '9px', top: `${Math.max(40, Math.min(window.innerHeight - 44, y))}px` });
    const ph = Math.min(window.innerHeight * 0.82, 760);
    Object.assign(panel.style, { left: `${Math.max(4, Math.min(window.innerWidth - 428, pos.x))}px`, top: `${Math.max(4, Math.min(window.innerHeight - ph - 4, (pos.py ?? window.innerHeight - ph - 60)))}px` });
  }
  window.addEventListener('resize', place);

  // Drag the panel by its header.
  const head = panel.querySelector('.head');
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => { pos.x = ev.clientX - dx; pos.py = ev.clientY - dy; place(); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); storage.set(POS_KEY, pos); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  const TABS = ALL_TABS.filter(([id]) => id !== 'templates' || app.adapter.features?.templates);
  const views = {};
  function view(id) {
    if (!views[id]) {
      const make = { skins: skinsTab, templates: templatesTab, sessions: sessionsTab, tools: toolsTab, about: aboutTab }[id];
      views[id] = make(app);
    }
    return views[id];
  }

  let current = TABS.some(([id]) => id === app.getSettings().ui.tab) ? app.getSettings().ui.tab : 'skins';
  function showTab(id) {
    current = id;
    setChildren(tabsBar, ...TABS.map(([tid, label]) => el('button', { class: `tab${tid === id ? ' on' : ''}`, onclick: () => showTab(tid), dataset: { tab: tid }, title: label }, icon(tid), SHORT[tid] || label)));
    const v = view(id);
    if (id === 'about' || id === 'templates') v.render();
    setChildren(body, v.el);
    app.update((s) => { s.ui.tab = id; }, { silent: true });
  }

  function setOpen(open, tab) {
    panel.hidden = !open;
    fab.classList.toggle('on', open);
    if (open) { showTab(tab || current); place(); }
    app.update((s) => { s.ui.panelOpen = open; }, { silent: true });
  }
  fab.addEventListener('click', () => setOpen(panel.hidden));
  fab.addEventListener('keydown', (e) => { if (e.key === 'Enter') setOpen(panel.hidden); });
  app.bus.on('panel:open', (tab) => setOpen(true, tab));

  document.documentElement.append(host);
  place();
  if (app.getSettings().ui.panelOpen) setOpen(true);

  return {
    toggle: () => setOpen(panel.hidden),
    open: (tab) => setOpen(true, tab),
    // Rebuild settings-driven tabs; the Templates tab keeps its state (and any running operation).
    rerender: () => { for (const k of Object.keys(views)) { if (k === 'templates') continue; views[k].dispose?.(); delete views[k]; } if (!panel.hidden) showTab(current); },
    el: host,
  };
}
