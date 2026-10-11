// Content-side sound module: decides WHEN to make a sound (price, sessions, toasts, hotkeys) and sends
// the request to the audio frame (extension) or the in-page engine (TradingView Desktop / userscript).
import { IS_EXTENSION, resourceUrl } from '../../core/env.js';
import { createMarketWatcher, classifyToast, fill, EVENTS } from './events.js';
import { isOpen, createNextEventCache, zonedParts } from '../sessions/sessions.js';
import { SoundEngine } from './engine.js';

const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
const TOAST_SEL = '[class*="toast" i], [class*="notification" i], [class*="snackbar" i], [role="alert"], [role="status"], [data-name*="toast" i], [data-name*="alert" i], [data-name*="notification" i]';

class FrameAudio {
  constructor(hostRoot, onEvent) {
    this.token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.ready = false; this.queue = [];
    this.frame = document.createElement('iframe');
    this.frame.src = `${resourceUrl('sound.html')}#token=${this.token}`;
    this.frame.setAttribute('allow', 'autoplay');
    this.frame.setAttribute('aria-hidden', 'true');
    this.frame.tabIndex = -1;
    Object.assign(this.frame.style, { position: 'fixed', width: '1px', height: '1px', left: '-10px', top: '-10px', border: '0', opacity: '0', pointerEvents: 'none' });
    this.onMsg = (e) => {
      const m = e.data;
      if (e.source !== this.frame.contentWindow || !m || m.tvsuite !== 'audio' || m.token !== this.token) return;
      if (m.type === 'hello') { this.ready = true; for (const q of this.queue.splice(0)) this._post(q); }
      else onEvent(m);
    };
    window.addEventListener('message', this.onMsg);
    hostRoot.append(this.frame);
  }
  _post(msg) { this.frame.contentWindow?.postMessage({ tvsuite: 'audio-cmd', token: this.token, ...msg }, '*'); }
  send(msg) { if (this.ready) this._post(msg); else { if (msg.type === 'config') this.queue = this.queue.filter((q) => q.type !== 'config'); this.queue.push(msg); } }
  destroy() { window.removeEventListener('message', this.onMsg); this.frame.remove(); }
}

class InlineAudio {
  constructor(onEvent) { this.engine = new SoundEngine(); this.onEvent = onEvent; }
  async send(m) {
    try {
      if (m.type === 'config') { this.engine.setVolume(m.volume); this.engine.setAmbientVolume(m.ambientVolume); await this.engine.setAmbient(m.ambient?.kind === 'local' ? null : m.ambient); }
      else if (m.type === 'play') { if (m.sound?.kind === 'local') throw new Error('Local sound files need the browser extension'); await this.engine.play(m.sound, { volume: m.volume }); this.onEvent({ type: 'played', event: m.event }); }
      else if (m.type === 'speak') { this.engine.speak(m.text, { rate: m.rate, voice: m.voice }); this.onEvent({ type: 'spoke', text: m.text }); }
      else if (m.type === 'pause') this.engine.pauseAll(m.paused);
    } catch (err) { this.onEvent({ type: 'error', message: err.message }); }
  }
  destroy() { this.engine.setAmbient(null); }
}

export function createSoundModule(ctx) {
  const { adapter, getSettings, bus } = ctx;
  const cfg = () => getSettings().sound;
  let host = null, shadow = null, out = null, timers = [], observer = null;
  const watcher = createMarketWatcher();
  const lastFired = new Map();
  const recentToasts = new Map();
  let openSessions = null, soonFired = new Set(), lastCalm = 0, muted = false;
  const nextEv = createNextEventCache(2 * 1440);
  const stats = { played: 0, last: '', error: '' };

  function diag() { if (host) { host.dataset.played = String(stats.played); host.dataset.last = stats.last; host.dataset.error = stats.error; host.dataset.state = out ? 'on' : 'off'; } }

  function onFrameEvent(m) {
    if (m.type === 'played' || m.type === 'spoke') { stats.played++; stats.last = m.event || 'voice'; stats.error = ''; }
    else if (m.type === 'error') stats.error = m.message;
    else if (m.type === 'voices') bus.emit('sound:voices', m.voices);
    diag();
    bus.emit('sound:status', { ...stats });
  }

  function mount() {
    if (out) return;
    host = document.createElement('div');
    host.id = 'tvsuite-audio-host';
    Object.assign(host.style, { position: 'fixed', width: '0', height: '0', overflow: 'hidden' });
    shadow = host.attachShadow({ mode: 'closed' });
    document.documentElement.append(host);
    out = IS_EXTENSION && !ctx.forceInline ? new FrameAudio(shadow, onFrameEvent) : new InlineAudio(onFrameEvent);
    pushConfig();
    diag();
  }
  function unmount() { out?.destroy(); out = null; host?.remove(); host = null; }

  function pushConfig() {
    if (!out) return;
    const c = cfg();
    out.send({ type: 'config', volume: muted ? 0 : c.volume, ambientVolume: c.ambient.volume, ambient: muted ? null : c.ambient.source });
  }

  // Play one event's sound (+ voice). vars feed the voice template.
  function fire(type, vars = {}, { force = false } = {}) {
    const c = cfg();
    if (!c.enabled || !out || muted) return false;
    const e = c.events[type];
    if (!e || (!e.on && !force)) return false;
    const now = Date.now();
    if (!force) { // rate limit detected events; manual and test plays never block the next real one
      if (now - (lastFired.get(type) || 0) < 1000) return false;
      lastFired.set(type, now);
    }
    if (e.sound && e.sound.kind !== 'none') out.send({ type: 'play', sound: e.sound, volume: e.volume ?? 1, event: type });
    if (c.voice.enabled && e.voice) {
      const text = fill(EVENT_BY_ID[type]?.voice, { symbol: vars.symbol || adapter.readObservation?.()?.symbol || '', ...vars });
      if (text) setTimeout(() => out?.send({ type: 'speak', text, rate: c.voice.rate, voice: c.voice.name }), e.sound?.kind === 'none' ? 0 : 450);
    }
    if (c.notify && ctx.notify && document.visibilityState === 'hidden') {
      const meta = EVENT_BY_ID[type];
      const body = fill(meta?.voice, { symbol: vars.symbol || adapter.readObservation?.()?.symbol || '', ...vars }) || meta?.name || type;
      ctx.notify({ title: `TVSuite · ${meta?.name || type}`, body, tag: type });
    }
    bus.emit('sound:fired', { type, vars });
    return true;
  }

  function needsPrice() {
    const c = cfg();
    return c.enabled && (c.alerts.some((a) => a.armed !== false) || ['priceAlert', 'dailyOpenCross', 'bigCandle', 'barClose'].some((k) => c.events[k]?.on));
  }

  function priceTick() {
    if (!out || !needsPrice()) return;
    const obs = adapter.readObservation?.();
    if (!obs) return;
    const c = cfg();
    watcher.setBigMultiple(c.bigCandleMultiple);
    const events = watcher.update({ ...obs, dayKey: zonedParts(new Date(), getSettings().skins.dayStartTz || 'UTC').dateKey }, c.alerts);
    for (const ev of events) {
      if (ev.type === 'priceAlert') {
        fire('priceAlert', { symbol: ev.symbol, level: ev.level }, { force: true });
        if (ev.once) ctx.update((st) => { const a = st.sound.alerts.find((x) => x.id === ev.alertId); if (a) a.armed = false; });
      } else fire(ev.type, { symbol: ev.symbol });
    }
  }

  function sessionTick() {
    if (!out) return;
    const list = getSettings().sessions.list.filter((s) => s.enabled !== false);
    const now = new Date();
    const nowOpen = new Set(list.filter((s) => { try { return isOpen(s, now); } catch (_) { return false; } }).map((s) => s.id));
    if (openSessions) {
      for (const s of list) {
        if (nowOpen.has(s.id) && !openSessions.has(s.id)) fire('sessionOpen', { session: s.name });
        if (!nowOpen.has(s.id) && openSessions.has(s.id)) fire('sessionClose', { session: s.name });
      }
    }
    openSessions = nowOpen;
    const ev = nextEv(list, now);
    if (ev && ev.type === 'open') {
      const ms = ev.at - now, key = `${ev.session.id}@${ev.at.getTime()}`;
      if (ms <= 60000 && ms > 0 && !soonFired.has(key)) { soonFired.add(key); fire('sessionSoon', { session: ev.session.name }); }
    }
  }

  // Watch TradingView's toasts/popups for order fills and alerts (keyword-based, best effort).
  function scanNode(node) {
    if (!(node instanceof Element) || node.closest('#tvsuite-panel-host, #tvsuite-hud-host')) return;
    const box = node.matches(TOAST_SEL) ? node : node.closest(TOAST_SEL) || node.querySelector?.(TOAST_SEL);
    if (!box) return;
    const text = (box.textContent || '').trim();
    if (!text || text.length > 400) return;
    const now = Date.now();
    for (const [t, at] of recentToasts) if (now - at > 5000) recentToasts.delete(t);
    if (recentToasts.has(text)) return;
    recentToasts.set(text, now);
    const type = classifyToast(text, cfg().detect);
    if (type) bus.emit('trade:event', { type, source: 'toast', text });
  }
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      const c = cfg();
      // Detection runs whenever anything listens (sound, recorder, lights, risk); it only reads text.
      if (!ctx.wantsTradeEvents?.() && !(c.enabled && (c.events.tradeEntry.on || c.events.tradeExit.on || c.events.tvAlert.on))) return;
      for (const r of records) for (const n of r.addedNodes) scanNode(n.nodeType === 3 ? n.parentElement : n);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  bus.on('trade:event', (e) => fire(e.type, e.vars || {}, { force: e.source === 'hotkey' }));
  bus.on('journal:capture', () => fire('journal'));
  bus.on('skins:signals', (sig) => { if (sig.calm > 0.5 && lastCalm <= 0.5) fire('calm'); lastCalm = sig.calm; });
  bus.on('sound:manual', (x) => (typeof x === 'string' ? fire(x, {}, { force: true }) : fire(x.type, x.vars || {}, { force: !!x.force })));

  function update() {
    if (cfg().enabled) { mount(); pushConfig(); } else unmount();
  }

  function start() {
    update();
    timers.push(setInterval(priceTick, 300));
    timers.push(setInterval(sessionTick, 2000));
    startObserver();
    document.addEventListener('visibilitychange', () => out?.send({ type: 'pause', paused: false }));
  }

  return {
    start, update,
    fire,
    test: (sound, volume = 1) => { mount(); out?.send({ type: 'play', sound, volume, event: 'test' }); },
    speak: (text) => { mount(); const c = cfg(); out?.send({ type: 'speak', text, rate: c.voice.rate, voice: c.voice.name }); },
    requestVoices: () => { mount(); out?.send?.({ type: 'voices' }); },
    toggleMute: () => { muted = !muted; pushConfig(); bus.emit('sound:muted', muted); return muted; },
    muted: () => muted,
    stats: () => ({ ...stats }),
  };
}
