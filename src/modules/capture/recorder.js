// Smart recorder: records the chart (its own canvases, no screen-capture prompt) when you enter a trade and
// stops a few seconds after you're flat. Overlays: symbol/price, REC timer, day P&L, trade banners, watermark.
import { IS_EXTENSION, resourceUrl } from '../../core/env.js';
import { chartHost, drawChart } from '../journal/capture.js';
import { money } from '../risk/rules.js';

export const RECORDER_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export function pickMime() { return RECORDER_TYPES.find((t) => globalThis.MediaRecorder?.isTypeSupported?.(t)) || ''; }
const BITRATE = { low: 1.5e6, medium: 3e6, high: 6e6 };
const BANNERS = { tradeEntry: ['ENTRY', '#22c55e'], tradeExit: ['EXIT', '#5b8cff'], tvAlert: ['ALERT', '#f7a600'], priceAlert: ['LEVEL', '#f7a600'], riskWarn: ['RISK', '#f7a600'], riskBreach: ['LIMIT', '#f23645'], riskTarget: ['TARGET', '#22c55e'], manual: ['REC', '#f23645'] };

// Hidden extension frame that writes recordings into the extension's IndexedDB.
class Vault {
  constructor() {
    this.token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.seq = 0; this.wait = new Map(); this.ready = false; this.queue = [];
    this.frame = document.createElement('iframe');
    this.frame.src = `${resourceUrl('vault.html')}#token=${this.token}`;
    Object.assign(this.frame.style, { position: 'fixed', width: '1px', height: '1px', left: '-10px', top: '-10px', border: '0', opacity: '0', pointerEvents: 'none' });
    this.frame.setAttribute('aria-hidden', 'true');
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (e.source !== this.frame.contentWindow || m?.tvsuite !== 'vault' || m.token !== this.token) return;
      if (m.type === 'hello') { this.ready = true; for (const q of this.queue.splice(0)) this.frame.contentWindow.postMessage(q, '*'); return; }
      const w = this.wait.get(m.seq); if (!w) return;
      this.wait.delete(m.seq);
      if (m.type === 'error') w.reject(new Error(m.message)); else w.resolve(m.id);
    });
    document.documentElement.append(this.frame);
  }
  put(blob, meta, keep) {
    const seq = ++this.seq;
    const msg = { tvsuite: 'vault-cmd', token: this.token, type: 'put', seq, blob, meta, keep };
    return new Promise((resolve, reject) => {
      this.wait.set(seq, { resolve, reject });
      if (this.ready) this.frame.contentWindow.postMessage(msg, '*'); else this.queue.push(msg);
      setTimeout(() => { if (this.wait.delete(seq)) reject(new Error('Saving the recording timed out')); }, 30000);
    });
  }
}

export function createRecorder({ adapter, getSettings, bus, risk, symbol }) {
  const cfg = () => getSettings().capture.recorder;
  let rec = null, vault = null, stopTimer = null;

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  function start(reason = 'manual') {
    clearTimeout(stopTimer); stopTimer = null;
    if (rec) { banner(reason); return rec; }
    const c = cfg();
    const mime = pickMime();
    if (!mime) throw new Error('This browser can’t record video');
    const host = chartHost(adapter.layoutHost?.());
    const box = host.getBoundingClientRect();
    if (box.width < 10) throw new Error('Chart area not found');
    const H = c.height === 'native' ? Math.round(box.height * (window.devicePixelRatio || 1)) : Math.min(+c.height || 720, Math.round(box.height * (window.devicePixelRatio || 1)) || 720);
    const scale = H / box.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(box.width * scale) & ~1; canvas.height = Math.round(H) & ~1;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(c.fps);
    const startedAt = Date.now();
    const state = { reason, startedAt, events: [], banners: [], mime, chunks: [], canvas, mic: null, symbol: symbol?.() || '' };
    const go = (s) => {
      const mr = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: BITRATE[c.quality] || BITRATE.medium });
      mr.ondataavailable = (e) => { if (e.data?.size) state.chunks.push(e.data); };
      mr.onstop = () => finish(state);
      mr.start(1000);
      state.mr = mr;
    };
    const draw = () => {
      try { drawChart(ctx, host, { scale, box: host.getBoundingClientRect() }); } catch (_) { /* keep last frame */ }
      overlay(ctx, canvas, state);
    };
    draw();
    state.timer = setInterval(draw, 1000 / c.fps);
    state.maxTimer = setTimeout(() => stop('max length'), c.maxMin * 60000);
    rec = state;
    if (c.mic && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((m) => { state.mic = m; go(new MediaStream([...stream.getVideoTracks(), ...m.getAudioTracks()])); }, () => go(stream));
    } else go(stream);
    banner(reason);
    bus.emit('recorder:state', { recording: true, reason, startedAt });
    return state;
  }

  function banner(type) {
    if (!rec) return;
    rec.events.push({ t: (Date.now() - rec.startedAt) / 1000, type });
    if (cfg().overlays.events && BANNERS[type]) rec.banners.push({ type, at: Date.now() });
  }

  function overlay(ctx, canvas, st) {
    const o = cfg().overlays, w = canvas.width, h = canvas.height, u = Math.max(12, h / 40);
    ctx.save();
    ctx.font = `700 ${u}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'middle';
    const obs = adapter.readObservation?.() || {};
    if (o.symbol) {
      const txt = `${obs.symbol || st.symbol || ''}${Number.isFinite(obs.price ?? obs.close) ? `  ${(obs.price ?? obs.close).toLocaleString('en-US', { maximumFractionDigits: 5 })}` : ''}`;
      if (txt.trim()) { ctx.fillStyle = 'rgba(0,0,0,.55)'; const tw = ctx.measureText(txt).width; ctx.fillRect(u * 0.6, u * 0.6, tw + u * 1.2, u * 1.9); ctx.fillStyle = '#fff'; ctx.fillText(txt, u * 1.2, u * 1.55); }
    }
    if (o.timer) {
      const s = Math.floor((Date.now() - st.startedAt) / 1000);
      const txt = `REC ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(w - tw - u * 3.2, u * 0.6, tw + u * 2.6, u * 1.9);
      ctx.fillStyle = s % 2 ? '#f23645' : '#ff7a85'; ctx.beginPath(); ctx.arc(w - tw - u * 2.3, u * 1.55, u * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, w - tw - u * 1.6, u * 1.55);
    }
    const r = risk?.last?.();
    if (o.pnl && r) {
      const txt = `Day ${money(r.dayTotal)}${r.lossLimit ? ` / −${money(r.lossLimit.amount, false)}` : ''}`;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(u * 0.6, h - u * 2.5, tw + u * 1.2, u * 1.9);
      ctx.fillStyle = r.dayTotal < 0 ? '#ff6b78' : '#5ee39b'; ctx.fillText(txt, u * 1.2, h - u * 1.55);
    }
    if (o.watermark && cfg().watermark) {
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(cfg().watermark, w - u, h - u * 1.55); ctx.textAlign = 'left';
    }
    st.banners = st.banners.filter((b) => Date.now() - b.at < 2500);
    for (const b of st.banners.slice(-1)) {
      const [label, color] = BANNERS[b.type];
      const a = Math.min(1, (2500 - (Date.now() - b.at)) / 600);
      ctx.globalAlpha = a; ctx.font = `800 ${u * 2.4}px -apple-system, "Segoe UI", Roboto, sans-serif`; ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(w / 2 - tw / 2 - u * 1.2, h * 0.14 - u * 1.8, tw + u * 2.4, u * 3.6);
      ctx.fillStyle = color; ctx.fillText(label, w / 2, h * 0.14);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function stop(why = 'stopped') {
    clearTimeout(stopTimer); stopTimer = null;
    if (!rec) return false;
    const st = rec; rec = null;
    clearInterval(st.timer); clearTimeout(st.maxTimer);
    st.why = why;
    try { st.mr?.state !== 'inactive' ? st.mr.stop() : finish(st); } catch (_) { finish(st); }
    st.mic?.getTracks().forEach((t) => t.stop());
    bus.emit('recorder:state', { recording: false });
    return true;
  }

  async function finish(st) {
    const c = cfg();
    const blob = new Blob(st.chunks, { type: st.mime.split(';')[0] });
    const ext = st.mime.includes('mp4') ? 'mp4' : 'webm';
    const stamp = new Date(st.startedAt).toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const name = `${st.symbol || 'chart'}-${stamp}.${ext}`;
    const meta = { name, duration: (Date.now() - st.startedAt) / 1000, symbol: st.symbol, reason: st.reason, events: st.events };
    let id = null, error = null;
    if (!blob.size) error = 'Nothing was recorded';
    else {
      if ((c.save === 'library' || c.save === 'both') && IS_EXTENSION) {
        try { vault ||= new Vault(); id = await vault.put(blob, meta, c.keep); } catch (err) { error = err.message; }
      }
      if (c.save === 'download' || c.save === 'both' || !IS_EXTENSION || error) download(blob, name);
    }
    bus.emit('recorder:saved', { id, name, size: blob.size, mime: blob.type, duration: meta.duration, error, blob });
  }

  // Smart triggers
  function onTrade(type) {
    const c = cfg();
    if (type === 'tradeEntry' && c.auto) { try { start('tradeEntry'); } catch (err) { bus.emit('recorder:saved', { error: err.message }); } return; }
    if (!rec) { if (c.alsoOn?.[type]) { try { start(type); } catch (_) { /* no chart */ } scheduleStop(c.postRollSec + 20); } return; }
    banner(type);
    if (type === 'tradeExit' && c.stopOnExit && rec.reason !== 'manual') scheduleStop(c.postRollSec);
  }
  function scheduleStop(sec) { clearTimeout(stopTimer); stopTimer = setTimeout(() => stop('flat'), sec * 1000); }
  bus.on('trade:event', (e) => onTrade(e.type));
  bus.on('sound:fired', (e) => { if (rec && ['priceAlert', 'riskWarn', 'riskBreach', 'riskTarget'].includes(e.type)) banner(e.type); });
  bus.on('risk:alert', (a) => { if (rec) banner(a.event); });
  // Open P&L read from the screen doubles as "in a position" (≠ 0) for the smart trigger.
  let wasOpen = false;
  setInterval(() => {
    const c = cfg();
    if (!c.auto || !c.useOpenPnl) return;
    const u = risk?.last?.()?.live?.unrealized;
    const open = Number.isFinite(u) && u !== 0;
    if (open && !wasOpen) onTrade('tradeEntry');
    if (!open && wasOpen) onTrade('tradeExit');
    wasOpen = open;
  }, 1000);

  return {
    start: (reason = 'manual') => start(reason),
    stop: () => stop('manual'),
    toggle: () => (rec ? (stop('manual'), false) : (start('manual'), true)),
    recording: () => !!rec,
    elapsed: () => (rec ? (Date.now() - rec.startedAt) / 1000 : 0),
  };
}
