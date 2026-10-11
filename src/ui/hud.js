// Session HUD: a small pill at the top of the chart showing the active session and the next open/close.
import { el, setChildren } from '../core/dom.js';
import { CSS } from './kit.js';
import { activeSession, createNextEventCache, formatCountdown } from '../modules/sessions/sessions.js';

export function createHud({ getSettings, bus }) {
  const host = el('div', { id: 'tvsuite-hud-host' });
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(el('style', {}, CSS));
  const root = el('div', { class: 'root' });
  const pill = el('div', { class: 'hud', title: 'TVSuite session clock — click to open the panel' });
  root.append(pill);
  shadow.append(root);
  pill.addEventListener('click', () => bus.emit('panel:open', 'sessions'));
  let calm = 0, reactive = false;
  const nextEventCached = createNextEventCache(3 * 1440);
  bus.on('skins:signals', (s) => { calm = s.calm; reactive = true; });

  function paint() {
    const cfg = getSettings();
    host.style.display = cfg.sessions.hud ? '' : 'none';
    if (!cfg.sessions.hud) return;
    const now = new Date();
    const list = cfg.sessions.list;
    const act = activeSession(list, now);
    const ev = nextEventCached(list, now);
    setChildren(pill, 
      act ? el('span', {}, el('i', { class: 'dot', style: { background: act.color } }), act.name) : el('span', { class: 'dim' }, 'No major session open'),
      ev ? el('span', { class: 'dim' }, `· ${ev.session.name} ${ev.type}s in ${formatCountdown(ev.at - now)}`) : null,
      reactive && cfg.skins.reactive.enabled && calm > 0.3 ? el('span', { style: { color: '#f7a600' } }, '· calm') : null,
    );
  }
  setInterval(paint, 1000);
  paint();
  document.documentElement.append(host);
  return { paint, el: host };
}
