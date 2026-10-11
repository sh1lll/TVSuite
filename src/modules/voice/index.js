// Voice commands: push-to-talk (Alt+Shift+V) or a wake word ("suite …"). Chrome's speech recognition is
// cloud-based (audio goes to Google) unless on-device recognition is available and chosen — the UI says so.
// The same commands can be typed into the command box, which is how they're tested.
import { parseCommand, HELP } from './commands.js';
import { money } from '../risk/rules.js';
import { activeSession, createNextEventCache, formatCountdown } from '../sessions/sessions.js';

const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

export function createVoice(app) {
  const { bus, getSettings, update } = app;
  const cfg = () => getSettings().voice;
  let rec = null, listening = false, wakeLoop = false, onDevice = false;
  const nextEv = createNextEventCache(3 * 1440);

  function say(text) {
    bus.emit('voice:reply', text);
    if (cfg().reply && getSettings().sound) app.sound?.speak(text);
  }

  async function run(text) {
    const cmd = parseCommand(text);
    bus.emit('voice:heard', { text, cmd });
    if (!cmd) { say(`Sorry, I didn’t catch a command in “${String(text).slice(0, 60)}”.`); return null; }
    const s = getSettings();
    switch (cmd.action) {
      case 'symbol': {
        const how = await app.setChart({ symbol: cmd.symbol, interval: cmd.interval });
        say(`${cmd.symbol || 'Chart'}${cmd.interval ? `, ${cmd.interval === 'D' ? 'daily' : /^\d+$/.test(cmd.interval) ? `${cmd.interval} minute` : cmd.interval}` : ''}${how === 'url' ? ' — reloading the chart' : ''}`);
        break;
      }
      case 'journal': bus.emit('journal:capture'); break;
      case 'card': app.capture?.quickCard(); break;
      case 'record':
        if (cmd.on && !app.recorder.recording()) { try { app.recorder.start('voice'); say('Recording'); } catch (err) { say(err.message); } }
        else if (!cmd.on && app.recorder.recording()) { app.recorder.stop(); say('Recording stopped'); }
        break;
      case 'mini': say('The mini chart needs a click or keypress — press Alt+Shift+P.'); break;
      case 'focus': app.focus?.toggle(); break;
      case 'skin': update((x) => { x.skins.enabled = cmd.on; }); say(`Skin ${cmd.on ? 'on' : 'off'}`); break;
      case 'nextSkin': {
        const bi = [...(app.skins.builtins?.values?.() || [])];
        const ids = [...bi.map((b) => b.id), ...(s.skins.library || []).map((l) => l.id)];
        const i = ids.indexOf(s.skins.active);
        const next = ids[(i + 1) % ids.length];
        update((x) => { x.skins.active = next; x.skins.enabled = true; });
        say(`Skin: ${bi.find((b) => b.id === next)?.name || s.skins.library.find((l) => l.id === next)?.name || next}`);
        break;
      }
      case 'trade':
        try { await app.risk.addTrade({ pnl: cmd.pnl }); const r = app.risk.last(); say(`Logged ${money(cmd.pnl)}.${r ? ` Day ${money(r.dayTotal)}.` : ''}`); } catch (err) { say(err.message); }
        break;
      case 'alert': {
        const sym = app.skins.symbol() || '';
        update((x) => { x.sound.alerts.push({ id: `a${Date.now().toString(36)}`, symbol: sym, level: cmd.level, dir: 'any', once: true, armed: true }); });
        say(`Alert at ${cmd.level.toLocaleString('en-US')}${sym ? ` on ${sym}` : ''}${s.sound.enabled ? '' : '. Turn Sound on to hear it'}`);
        break;
      }
      case 'pnl': {
        const r = s.risk.enabled ? app.risk.last() : null;
        say(r ? `Today ${money(r.dayTotal)}.${r.lossLimit ? ` ${money(Math.max(0, r.lossLimit.amount - r.lossUsed), false)} left before your daily limit.` : ''}` : 'Risk Guard is off, so I don’t know your P&L. Turn it on in the Risk tab.');
        break;
      }
      case 'price': {
        const o = app.adapter.readObservation?.() || {};
        const p = o.price ?? o.close;
        say(Number.isFinite(p) ? `${o.symbol || ''} ${p.toLocaleString('en-US', { maximumFractionDigits: 5 })}` : 'I can’t read the price right now.');
        break;
      }
      case 'session': {
        const now = new Date(), list = s.sessions.list;
        if (cmd.name) {
          const sess = list.find((x) => x.name.toLowerCase().includes(cmd.name));
          const ev = sess && nextEv([sess], now);
          say(sess ? (activeSession([sess], now) ? `${sess.name} is open${ev ? `, closes in ${formatCountdown(ev.at - now)}` : ''}.` : `${sess.name} opens in ${ev ? formatCountdown(ev.at - now) : 'a while'}.`) : `I don’t have a ${cmd.name} session.`);
        } else { const ev = nextEv(list, now); say(ev ? `${ev.session.name} ${ev.type}s in ${formatCountdown(ev.at - now)}.` : 'No sessions configured.'); }
        break;
      }
      case 'mute': if (!app.sound.muted()) app.sound.toggleMute(); break;
      case 'unmute': if (app.sound.muted()) app.sound.toggleMute(); say('Sound on'); break;
      case 'help': say(HELP); break;
      default: break;
    }
    return cmd;
  }

  async function makeRecognizer(continuous) {
    if (!SR) throw new Error('This browser has no speech recognition');
    const r = new SR();
    r.lang = cfg().lang || 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = continuous;
    onDevice = false;
    if (cfg().onDevice && 'processLocally' in r && typeof SR.available === 'function') {
      try {
        const a = await SR.available({ langs: [r.lang], processLocally: true });
        if (a === 'available') { r.processLocally = true; onDevice = true; }
        else if (a === 'downloadable' && typeof SR.install === 'function') { SR.install({ langs: [r.lang], processLocally: true }).catch(() => {}); }
      } catch (_) { /* fall back to cloud recognition */ }
    }
    if (!onDevice && cfg().onDeviceOnly) throw new Error('On-device recognition isn’t available here (Chrome may still be downloading it). Allow cloud recognition in Sound → Voice, or try later.');
    return r;
  }

  async function listenOnce() {
    if (listening) { rec?.stop(); return; }
    try { rec = await makeRecognizer(false); } catch (err) { say(err.message); return; }
    listening = true; bus.emit('voice:state', { listening: true, onDevice });
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) run(t); };
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') say(e.error === 'not-allowed' ? 'Microphone access was blocked for this site.' : `Speech error: ${e.error}`); };
    rec.onend = () => { listening = false; bus.emit('voice:state', { listening: false, onDevice }); };
    rec.start();
  }

  async function startWake() {
    if (wakeLoop) return;
    try { rec = await makeRecognizer(true); } catch (err) { say(err.message); return; }
    wakeLoop = true; bus.emit('voice:state', { listening: true, wake: true, onDevice });
    const word = (cfg().wakeWord || 'suite').toLowerCase();
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      if (!res?.isFinal) return;
      const t = res[0].transcript.trim();
      const i = t.toLowerCase().indexOf(word);
      if (i >= 0) run(t.slice(i + word.length));
    };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wakeLoop = false; say('Microphone access was blocked for this site.'); } };
    rec.onend = () => { if (wakeLoop && cfg().enabled && cfg().mode === 'wake') setTimeout(() => { try { rec.start(); } catch (_) { wakeLoop = false; } }, 300); else { wakeLoop = false; bus.emit('voice:state', { listening: false }); } };
    rec.start();
  }
  function stopWake() { wakeLoop = false; try { rec?.stop(); } catch (_) { /* already stopped */ } }

  return {
    supported: !!SR,
    run,
    listen: () => (cfg().mode === 'wake' ? (wakeLoop ? stopWake() : startWake()) : listenOnce()),
    stop: () => { stopWake(); try { rec?.stop(); } catch (_) { /* idle */ } },
    state: () => ({ listening: listening || wakeLoop, onDevice }),
  };
}
