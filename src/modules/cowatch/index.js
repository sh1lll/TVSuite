// Co-watch: two traders' charts follow each other over a direct WebRTC data channel. The handshake is two
// copy-paste codes (no server). A public STUN server is optional (helps across home routers; it sees your
// IP address, not your data). Messages: symbol/interval changes, chat, and "look here" pings.
import { el, setChildren } from '../../core/dom.js';
import { section, row, toggle, button, chip, toast, copyText } from '../../ui/kit.js';
import { encodeSignal, decodeSignal, validMessage } from './signal.js';

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

export function createCowatch(app) {
  const { bus, getSettings, update, root, skins } = app;
  const cfg = () => getSettings().cowatch;
  let pc = null, ch = null, state = 'idle', myCode = '', partner = '', log = [], lastSent = '', applying = null, viewEl = null;

  function setState(s) { state = s; bus.emit('cowatch:state', s); repaint(); }
  function addLog(entry) { log.push({ at: Date.now(), ...entry }); log = log.slice(-100); repaint(); }

  function newPc() {
    close(false);
    pc = new RTCPeerConnection({ iceServers: cfg().stun ? STUN : [] });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setState('connected');
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState) && state === 'connected') { addLog({ sys: `Connection ${pc.connectionState}` }); setState('idle'); }
    };
    return pc;
  }
  function gathered() {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
      pc.addEventListener('icegatheringstatechange', done);
      setTimeout(resolve, 4000); // use what we have
    });
  }
  function wire(channel) {
    ch = channel;
    ch.onopen = () => { send({ type: 'hello', name: cfg().name || 'Trader', version: app.version }); sendChart(true); };
    ch.onmessage = (e) => { let m; try { m = validMessage(JSON.parse(e.data)); } catch (_) { m = null; } if (m) onMessage(m); };
    ch.onclose = () => { if (state === 'connected') { addLog({ sys: 'Partner left' }); setState('idle'); } };
  }
  function send(m) { if (ch?.readyState === 'open') ch.send(JSON.stringify(m)); }

  async function host() {
    newPc();
    wire(pc.createDataChannel('tvsuite', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await gathered();
    myCode = await encodeSignal({ type: 'offer', sdp: pc.localDescription.sdp, name: cfg().name });
    setState('hosting');
  }
  async function join(code) {
    const offer = await decodeSignal(code);
    if (offer.type !== 'offer') throw new Error('That’s an answer code — paste it on the side that started the session');
    newPc();
    pc.ondatachannel = (e) => wire(e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered();
    partner = offer.name || 'Partner';
    myCode = await encodeSignal({ type: 'answer', sdp: pc.localDescription.sdp, name: cfg().name });
    setState('answering');
  }
  async function accept(code) {
    const ans = await decodeSignal(code);
    if (ans.type !== 'answer') throw new Error('That’s a session code — paste the reply code your partner sent back');
    partner = ans.name || 'Partner';
    await pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
    setState('connecting');
  }
  function close(notify = true) {
    if (notify) send({ type: 'bye' });
    try { ch?.close(); } catch (_) { /* closed */ }
    try { pc?.close(); } catch (_) { /* closed */ }
    pc = null; ch = null; myCode = '';
    if (notify) setState('idle');
  }

  function onMessage(m) {
    if (m.type === 'hello') { partner = m.name || partner; addLog({ sys: `${partner} joined` }); }
    else if (m.type === 'chart') {
      addLog({ sys: `${partner} → ${[m.symbol, m.interval && `${m.interval}`].filter(Boolean).join(' ')}` });
      if (cfg().follow && m.symbol && m.symbol !== skins.symbol()) { applying = m.symbol; app.setChart({ symbol: m.symbol, interval: m.interval }); }
    } else if (m.type === 'chat') { addLog({ from: partner, text: m.text }); bus.emit('cowatch:chat', m); if (!viewEl?.isConnected) toast(root, `${partner}: ${m.text.slice(0, 80)}`, 'ok', 4000); }
    else if (m.type === 'ping') {
      addLog({ from: partner, text: `👀 ${m.note || 'Look at this'}${m.price != null ? ` @ ${m.price}` : ''}`, ping: true });
      bus.emit('sound:manual', { type: 'tvAlert', vars: { symbol: m.symbol } });
      toast(root, `${partner}: 👀 ${m.note || 'look here'}${m.price != null ? ` @ ${m.price}` : ''}`, 'warn', 5000);
    } else if (m.type === 'bye') { addLog({ sys: `${partner} ended the session` }); close(false); setState('idle'); }
  }

  // Share local symbol changes (skip the one we just applied from the partner).
  function sendChart(force = false) {
    if (state !== 'connected' && !force) return;
    const sym = skins.symbol();
    if (!sym || !cfg().share) return;
    if (applying && sym === applying.split(':').pop()) { applying = null; lastSent = sym; return; }
    if (sym === lastSent && !force) return;
    lastSent = sym;
    send({ type: 'chart', symbol: sym });
  }
  setInterval(() => sendChart(false), 1000);
  bus.on('chart:set', (c) => { if (state === 'connected' && cfg().share && c.symbol && c.symbol !== applying) { lastSent = c.symbol; send({ type: 'chart', symbol: c.symbol, interval: c.interval }); } });

  // ---------------- UI (Bridge → Co-watch) ----------------
  function repaint() { if (viewEl?.isConnected) setChildren(viewEl, ...content()); }
  function codeBox(value) {
    const t = el('textarea', { rows: 4, readonly: true, dataset: { cowatchCode: '1' }, style: { fontFamily: 'ui-monospace, monospace', fontSize: '10.5px', wordBreak: 'break-all' } });
    t.value = value;
    t.addEventListener('focus', () => t.select());
    return [t, el('div', { class: 'btns' }, button('Copy code', async () => { await copyText(value); toast(root, 'Code copied — send it to your partner'); }, 'primary sm', { icon: 'copy' }))];
  }
  function pasteBox(label, onGo, data) {
    const t = el('textarea', { rows: 3, placeholder: 'Paste the code here', dataset: data });
    t.addEventListener('keydown', (e) => e.stopPropagation());
    return [t, el('div', { class: 'btns' }, button(label, async () => { try { await onGo(t.value); } catch (err) { toast(root, err.message, 'err', 4500); } }, 'primary sm', { dataset: { cowatchGo: data.cowatchPaste } }))];
  }
  function content() {
    const c = cfg();
    const name = el('input', { type: 'text', value: c.name, placeholder: 'Your name', style: { maxWidth: '160px' } });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    name.addEventListener('change', () => update((s) => { s.cowatch.name = name.value.slice(0, 40); }, { silent: true }));
    const head = el('div', { class: 'hero', style: { padding: '14px', background: 'linear-gradient(135deg, rgba(34,197,94,.14), rgba(91,140,255,.12))' }, dataset: { cowatchState: state } },
      el('div', { class: 'row', style: { margin: 0 } }, el('div', { class: 'grow' }, el('div', { style: { fontWeight: 700, fontSize: '14px' } }, 'Co-watch'),
        el('div', { class: 'note', style: { margin: 0 } }, 'Your charts follow each other over a direct connection — no TVSuite server.')),
        chip(state === 'connected' ? `with ${partner}` : state, state === 'connected' ? 'ok' : '')));
    const parts = [head];
    if (state === 'idle') {
      parts.push(section('Start',
        row('Your name', name),
        el('div', { class: 'btns' }, button('Start a session', () => host().catch((err) => toast(root, err.message, 'err')), 'primary', { dataset: { cowatchHost: '1' } })),
        el('div', { class: 'note' }, 'Or join a friend’s session:'), ...pasteBox('Join', (v) => join(v), { cowatchPaste: 'join' })),
        section('Connection', toggle({ label: 'Use a public STUN server', hint: 'Needed when you’re on different networks. Google’s STUN server sees your IP address, never your chart or chat.', checked: c.stun, onChange: (v) => update((s) => { s.cowatch.stun = v; }, { silent: true }) }),
          el('div', { class: 'note' }, 'Some strict networks (corporate, mobile carriers) can’t connect directly without a relay server; TVSuite doesn’t run one.')));
    } else if (state === 'hosting') {
      parts.push(section('1 · Send this code to your partner', ...codeBox(myCode)), section('2 · Paste their reply code', ...pasteBox('Connect', (v) => accept(v), { cowatchPaste: 'accept' })), el('div', { class: 'btns' }, button('Cancel', () => close())));
    } else if (state === 'answering') {
      parts.push(section(`Send this reply code back to ${partner}`, ...codeBox(myCode), el('div', { class: 'note' }, 'You’re connected as soon as they paste it.')), el('div', { class: 'btns' }, button('Cancel', () => close())));
    } else if (state === 'connecting') {
      parts.push(el('div', { class: 'note' }, 'Connecting…'), el('div', { class: 'btns' }, button('Cancel', () => close())));
    } else if (state === 'connected') {
      const msg = el('input', { type: 'text', placeholder: 'Message', dataset: { cowatchMsg: '1' } });
      const sendMsg = () => { const t = msg.value.trim(); if (!t) return; send({ type: 'chat', text: t }); addLog({ from: 'You', text: t }); msg.value = ''; };
      msg.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') sendMsg(); });
      const logEl = el('div', { class: 'list', style: { maxHeight: '220px', overflow: 'auto', padding: '6px 10px' }, dataset: { cowatchLog: '1' } }, log.map((l) => el('div', { style: { margin: '3px 0', fontSize: '12px', opacity: l.sys ? 0.65 : 1 } }, l.sys ? l.sys : [el('b', {}, `${l.from}: `), l.text])));
      setTimeout(() => { logEl.scrollTop = logEl.scrollHeight; }, 0);
      parts.push(
        section('Sync', toggle({ label: 'Follow my partner’s symbol', checked: c.follow, onChange: (v) => update((s) => { s.cowatch.follow = v; }, { silent: true }) }),
          toggle({ label: 'Share my symbol', checked: c.share, onChange: (v) => update((s) => { s.cowatch.share = v; }, { silent: true }) })),
        section('Chat', logEl, el('div', { class: 'row' }, el('div', { class: 'grow' }, msg), button('Send', sendMsg, 'sm primary')),
          el('div', { class: 'btns' }, button('👀 Look here', () => { const o = app.adapter.readObservation?.() || {}; send({ type: 'ping', note: msg.value.trim() || 'Look at this', price: o.price ?? o.close ?? null, symbol: o.symbol || '' }); addLog({ from: 'You', text: '👀 ping', ping: true }); msg.value = ''; }, 'sm', { dataset: { cowatchPing: '1' } }),
            button('Leave', () => close(), 'sm danger'))));
    }
    return parts;
  }
  return {
    view() { viewEl = el('div'); setChildren(viewEl, ...content()); return viewEl; },
    state: () => state,
    close,
  };
}
