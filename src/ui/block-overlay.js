// Block overlay: when a loss (or target) rule set to "Block" is hit, the chart page is covered until the
// trading day resets. Overriding takes a typed phrase and a 30-second wait, and is logged.
import { el, setChildren } from '../core/dom.js';
import { CSS, button, icon } from './kit.js';
import { formatCountdown } from '../modules/sessions/sessions.js';

const PHRASE = 'I accept the risk';

export function createBlockOverlay(app) {
  const { bus } = app;
  let host = null, card = null, timer = null, current = null, overriding = false;

  function mount() {
    if (host) return;
    host = el('div', { id: 'tvsuite-block-host' });
    // Below TVSuite's panel, button and HUD (so you can still journal and see your status), above the chart.
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: 2147482900 });
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append(el('style', {}, CSS));
    card = el('div', { class: 'modal', style: { width: '480px', textAlign: 'center' } });
    const bg = el('div', { class: 'root', style: { position: 'fixed', inset: '0', background: 'rgba(6,8,12,.82)', backdropFilter: 'blur(6px) grayscale(.6)', display: 'grid', placeItems: 'center', pointerEvents: 'auto' } }, card);
    for (const ev of ['pointerdown', 'mousedown', 'click', 'wheel', 'contextmenu']) bg.addEventListener(ev, (e) => { if (!card.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } });
    shadow.append(bg);
    document.documentElement.append(host);
    timer = setInterval(second, 1000);
  }
  function unmount() { clearInterval(timer); host?.remove(); host = null; overriding = false; clock = null; go = null; input = null; }

  // Built once per block; the 1 s timer only updates the countdown and the override button, so typing survives.
  let clock = null, reasonsEl = null, untilEl = null, actions = null, input = null, go = null, wait = 0;
  function build() {
    const isTarget = current.reasons.every((r) => r.id === 'pdpt');
    clock = el('div', { style: { fontSize: '26px', fontWeight: 800, margin: '14px 0 2px', fontVariantNumeric: 'tabular-nums' } });
    reasonsEl = el('div', { class: 'note', dataset: { blockReasons: '1' } });
    untilEl = el('div', { class: 'note' });
    actions = el('div');
    setChildren(card,
      el('div', { style: { fontSize: '40px', marginBottom: '4px' } }, isTarget ? '🎯' : '🔒'),
      el('h3', { style: { fontSize: '18px', margin: '0 0 6px' } }, isTarget ? 'Target reached, done for today' : 'Trading blocked for today'),
      reasonsEl, clock, untilEl,
      el('div', { class: 'note', style: { marginTop: '10px' } }, 'TVSuite can’t see or close positions. For real liquidation, set your broker’s own daily loss action (e.g. “Liquidate and Block”).'),
      actions);
    showActions();
  }
  function showActions() {
    overriding = false; input = null; go = null;
    setChildren(actions, el('div', { class: 'btns', style: { justifyContent: 'center', marginTop: '14px' } },
      app.journal ? button('Write in the journal', () => app.journal.open()) : null,
      button('Override…', showOverride, 'sm')));
  }
  function showOverride() {
    overriding = true; wait = 30;
    input = el('input', { type: 'text', placeholder: `Type: ${PHRASE}`, dataset: { overrideInput: '1' } });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    go = button('', async () => {
      if (input.value.trim().toLowerCase() !== PHRASE.toLowerCase()) { input.style.borderColor = '#f23645'; return; }
      if (wait > 0) return;
      await app.risk.override(current.reasons.map((r) => r.id), 'typed override');
    }, 'danger');
    setChildren(actions, el('div', { style: { marginTop: '14px' } }, el('div', { class: 'note' }, 'Overriding your own rule is logged. Take the 30 seconds to decide.'), input,
      el('div', { class: 'btns', style: { justifyContent: 'center' } }, button('Cancel', showActions), go)));
    paint();
    input.focus();
  }
  function paint() {
    if (!current || !card) return;
    if (!clock) build();
    setChildren(reasonsEl, current.reasons.map((r) => el('div', {}, r.text)));
    clock.textContent = formatCountdown(Math.max(0, current.until - Date.now()));
    untilEl.textContent = `Unlocks at the trading-day reset (${new Date(current.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`;
    if (go) { go.disabled = wait > 0; go.textContent = wait > 0 ? `Wait ${wait}s` : 'Unlock for today'; }
  }
  function second() { if (overriding && wait > 0) wait--; paint(); }

  bus.on('risk:eval', (r) => {
    const b = r?.block || null;
    if (b) {
      const changed = !current || current.reasons.map((x) => x.id).join() !== b.reasons.map((x) => x.id).join();
      current = b;
      mount();
      if (changed) { if (clock && !overriding) build(); paint(); }
    } else if (host) { current = null; unmount(); }
  });
  return { visible: () => !!host };
}
