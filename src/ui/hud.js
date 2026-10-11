// Session HUD: a small pill at the top of the chart showing the active session and the next open/close.
import { el, setChildren } from '../core/dom.js';
import { CSS } from './kit.js';
import { activeSession, createNextEventCache, formatCountdown } from '../modules/sessions/sessions.js';
import { EVENTS } from '../modules/sound/events.js';
import { money } from '../modules/risk/rules.js';

const EVENT_NAMES = Object.fromEntries(EVENTS.map((e) => [e.id, e.name]));

export function createHud({ getSettings, bus }) {
  const host = el('div', { id: 'tvsuite-hud-host' });
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(el('style', {}, CSS));
  const root = el('div', { class: 'root' });
  const pill = el('div', { class: 'hud', title: 'TVSuite session clock, click to open the panel' });
  // Sound flash: a brief "♪ Trade entered" chip so you can see what fired (muted, or checking detection).
  const flash = el('div', { class: 'hud', role: 'status', dataset: { soundFlash: '1' }, style: { position: 'fixed', top: '44px', left: '50%', transform: 'translateX(-50%)', display: 'none', pointerEvents: 'none', borderColor: 'rgba(91,140,255,.6)' } });
  root.append(pill, flash);
  let flashTimer = null;
  bus.on('sound:fired', ({ type, vars = {} }) => {
    if (streaming || getSettings().sound.flash === false) return;
    setChildren(flash, el('span', {}, `♪ ${EVENT_NAMES[type] || type}${vars.level != null ? ` · ${vars.level}` : vars.session ? ` · ${vars.session}` : ''}`));
    flash.style.display = '';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flash.style.display = 'none'; }, 2400);
  });
  shadow.append(root);
  pill.addEventListener('click', () => bus.emit('panel:open', 'sessions'));
  let calm = 0, reactive = false, streaming = false;
  bus.on('stream:change', (v) => { streaming = v; host.style.display = v ? 'none' : ''; if (!v) paint(); });
  const nextEventCached = createNextEventCache(3 * 1440);
  bus.on('skins:signals', (s) => { calm = s.calm; reactive = true; });
  let riskEval = null;
  bus.on('risk:eval', (r) => { const changed = (riskEval?.dayTotal ?? null) !== (r?.dayTotal ?? null) || riskEval?.status !== r?.status; riskEval = r; if (changed) paint(); });

  function paint() {
    const cfg = getSettings();
    if (streaming) return;
    host.style.display = '';
    pill.style.display = cfg.sessions.hud ? '' : 'none';
    if (!cfg.sessions.hud) return;
    const now = new Date();
    const list = cfg.sessions.list;
    const act = activeSession(list, now);
    const ev = nextEventCached(list, now);
    setChildren(pill, 
      act ? el('span', {}, el('i', { class: 'dot', style: { background: act.color } }), act.name) : el('span', { class: 'dim' }, 'No major session open'),
      ev ? el('span', { class: 'dim' }, `· ${ev.session.name} ${ev.type}s in ${formatCountdown(ev.at - now)}`) : null,
      reactive && cfg.skins.reactive.enabled && calm > 0.3 ? el('span', { style: { color: '#f7a600' } }, '· calm') : null,
      riskEval ? el('span', { dataset: { hudRisk: riskEval.status }, title: riskEval.alerts.map((a) => a.text).join('\n') || 'Within your rules', style: { color: riskEval.status === 'breach' ? '#f23645' : riskEval.status === 'warn' ? '#f7a600' : riskEval.dayTotal < 0 ? '#f7a6a6' : '#7ee2a8', fontWeight: 600 } },
        `· ${money(riskEval.dayTotal)}${riskEval.lossLimit ? ` / −${money(riskEval.lossLimit.amount, false)}` : ''}`) : null,
    );
  }
  setInterval(paint, 1000);
  paint();
  document.documentElement.append(host);
  return { paint, el: host };
}
