// Mini windows: an always-on-top Document Picture-in-Picture window (Chrome 116+), falling back to a small
// popup window. Two kinds:
//  • Mini chart — follows the chart while you work in other apps: a live mirror of the chart canvases, price,
//    a TVSuite tick line, session countdown, day P&L vs limit, recorder and mute buttons.
//  • Player — your media (TVSuite library, a direct video/image link, a YouTube or Twitch link) floating above
//    the chart while you trade.
import { resourceUrl, IS_EXTENSION } from '../../core/env.js';
import { chartHost, drawChart } from '../journal/capture.js';
import { activeSession, createNextEventCache, formatCountdown } from '../sessions/sessions.js';
import { money } from '../risk/rules.js';

const CSS = `
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0b0e14;color:#e9ecf2;font:12px -apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}
.top{display:flex;align-items:baseline;gap:8px;padding:6px 10px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.06)}
.sym{font-weight:800;font-size:14px}.px{font-weight:700;font-variant-numeric:tabular-nums}.chg{font-size:11px}
.sp{flex:1}.btn{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:inherit;border-radius:7px;padding:2px 8px;font:inherit;cursor:pointer}
.btn.on{background:#f23645;border-color:#f23645;color:#fff}
.stage{position:relative;height:calc(100% - 64px)}canvas{display:block;width:100%;height:100%}
.spark{position:absolute;left:0;right:0;bottom:0;height:34px;pointer-events:none}
.foot{display:flex;gap:10px;align-items:center;padding:5px 10px;height:30px;border-top:1px solid rgba(255,255,255,.06);white-space:nowrap;overflow:hidden}
.dim{opacity:.65}.pos{color:#5ee39b}.neg{color:#ff6b78}.warn{color:#f7a600}
.player{position:fixed;inset:0;background:#000}.player iframe,.player video,.player img{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:contain}
`;

// YouTube / Twitch links → their official embed players; anything else is played directly.
export function embedFor(url, host = globalThis.location?.hostname || 'www.tradingview.com') {
  let u;
  try { u = new URL(String(url).trim()); } catch (_) { return null; }
  const yt = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (yt === 'youtu.be') id = u.pathname.slice(1);
  else if (yt === 'youtube.com' || yt === 'youtube-nocookie.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/) || [])[1];
  if (id && /^[\w-]{6,20}$/.test(id)) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
  if (/(^|\.)twitch\.tv$/.test(u.hostname)) {
    const ch = u.pathname.split('/').filter(Boolean)[0];
    if (ch && /^\w{3,25}$/.test(ch)) return { kind: 'iframe', src: `https://player.twitch.tv/?channel=${ch}&parent=${host}&autoplay=true` };
  }
  if (u.protocol !== 'https:') return null;
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u.pathname)) return { kind: 'video', src: u.href };
  if (/\.(gif|png|jpe?g|webp|avif|svg)(\?|#|$)/i.test(u.pathname)) return { kind: 'img', src: u.href };
  return { kind: 'video', src: u.href };
}

async function openWindow(w, h, title) {
  let win = null, pip = false;
  if (globalThis.documentPictureInPicture?.requestWindow) {
    try { win = await documentPictureInPicture.requestWindow({ width: w, height: h }); pip = true; } catch (_) { win = null; }
  }
  if (!win) win = window.open('', `tvsuite-${title.replace(/\W+/g, '-').toLowerCase()}`, `popup,width=${w},height=${h}`);
  if (!win) throw new Error('The browser blocked the mini window — allow pop-ups for this site, or use Chrome 116+');
  win.document.title = title;
  win.document.head.replaceChildren();
  const st = win.document.createElement('style'); st.textContent = CSS;
  win.document.head.append(st);
  win.document.body.replaceChildren();
  return { win, pip };
}

export function createMini({ adapter, getSettings, bus, risk, recorder, sound, symbol }) {
  let chartWin = null, playerWin = null;
  const prices = [];
  // The tick line keeps working from the legend price even when the browser stops repainting a hidden chart.
  setInterval(() => {
    const o = adapter.readObservation?.();
    const p = o?.price ?? o?.close;
    if (Number.isFinite(p)) { prices.push({ t: Date.now(), p }); if (prices.length > 900) prices.shift(); }
  }, 1000);

  async function openChart() {
    if (chartWin && !chartWin.win.closed) { chartWin.win.focus?.(); return chartWin; }
    const { win, pip } = await openWindow(420, 300, 'TVSuite mini chart');
    const d = win.document;
    const mk = (tag, cls, text) => { const n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const sym = mk('span', 'sym'), px = mk('span', 'px'), chg = mk('span', 'chg'), sp = mk('span', 'sp');
    const rec = mk('button', 'btn', '● Rec'), mute = mk('button', 'btn', '🔊');
    rec.title = 'Start/stop recording'; mute.title = 'Mute TVSuite sounds';
    rec.onclick = () => { try { recorder.toggle(); } catch (err) { rec.title = err.message; } paintFoot(); };
    mute.onclick = () => { sound?.toggleMute(); paintFoot(); };
    const top = mk('div', 'top'); top.append(sym, px, chg, sp, rec, mute);
    const stage = mk('div', 'stage'); const cv = mk('canvas'); const spark = mk('canvas', 'spark'); stage.append(cv, spark);
    const sess = mk('span', 'dim'), pnl = mk('span'), foot = mk('div', 'foot'); foot.append(sess, mk('span', 'sp'), pnl);
    d.body.append(top, stage, foot);
    d.body.dataset.tvsMini = 'chart';
    const nextEv = createNextEventCache(2 * 1440);
    let first = null;
    function paintFoot() {
      const s = getSettings(), now = new Date();
      const act = activeSession(s.sessions.list, now), ev = nextEv(s.sessions.list, now);
      sess.textContent = `${act ? act.name : 'No session'}${ev ? ` · ${ev.session.name} ${ev.type}s in ${formatCountdown(ev.at - now)}` : ''}`;
      const r = s.risk.enabled ? risk?.last?.() : null;
      pnl.textContent = r ? `Day ${money(r.dayTotal)}${r.lossLimit ? ` / −${money(r.lossLimit.amount, false)}` : ''}` : '';
      pnl.className = r ? (r.status === 'breach' ? 'neg' : r.status === 'warn' ? 'warn' : r.dayTotal < 0 ? 'neg' : 'pos') : '';
      rec.className = `btn${recorder.recording() ? ' on' : ''}`;
      mute.textContent = sound?.muted?.() ? '🔇' : '🔊';
    }
    function paint() {
      if (win.closed) return;
      const o = adapter.readObservation?.() || {};
      const p = o.price ?? o.close;
      sym.textContent = o.symbol || symbol?.() || '';
      if (Number.isFinite(p)) {
        first ??= p;
        px.textContent = p.toLocaleString('en-US', { maximumFractionDigits: 5 });
        const ch = ((p - (o.open ?? first)) / (o.open ?? first)) * 100;
        chg.textContent = Number.isFinite(ch) ? `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}% bar` : '';
        chg.className = `chg ${ch >= 0 ? 'pos' : 'neg'}`;
      }
      // Mirror the chart canvases.
      const host = chartHost(adapter.layoutHost?.());
      const box = host.getBoundingClientRect();
      const W = Math.max(1, Math.round(stage.clientWidth * (win.devicePixelRatio || 1))), H = Math.max(1, Math.round(stage.clientHeight * (win.devicePixelRatio || 1)));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const ctx = cv.getContext('2d');
      if (box.width > 10) {
        const tmp = document.createElement('canvas');
        const sc = Math.min(1, 900 / box.width);
        tmp.width = Math.round(box.width * sc); tmp.height = Math.round(box.height * sc);
        let n = 0;
        try { n = drawChart(tmp.getContext('2d'), host, { scale: sc, box }); } catch (_) { n = 0; }
        if (n) { const s = Math.max(W / tmp.width, H / tmp.height); ctx.drawImage(tmp, (W - tmp.width * s) / 2, (H - tmp.height * s) / 2, tmp.width * s, tmp.height * s); }
      }
      // Tick line (last 5 minutes of prices TVSuite saw)
      const sw = Math.round(stage.clientWidth * (win.devicePixelRatio || 1)), sh = Math.round(34 * (win.devicePixelRatio || 1));
      if (spark.width !== sw || spark.height !== sh) { spark.width = sw; spark.height = sh; }
      const sx = spark.getContext('2d'); sx.clearRect(0, 0, sw, sh);
      const pts = prices.filter((q) => Date.now() - q.t < 300000);
      if (pts.length > 1) {
        const lo = Math.min(...pts.map((q) => q.p)), hi = Math.max(...pts.map((q) => q.p)), t0 = pts[0].t, t1 = pts[pts.length - 1].t;
        const grad = sx.createLinearGradient(0, 0, 0, sh); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.55)');
        sx.fillStyle = grad; sx.fillRect(0, 0, sw, sh);
        sx.beginPath();
        pts.forEach((q, i) => { const x = ((q.t - t0) / Math.max(1, t1 - t0)) * sw, y = sh - 4 - ((q.p - lo) / Math.max(1e-9, hi - lo)) * (sh - 8); i ? sx.lineTo(x, y) : sx.moveTo(x, y); });
        sx.strokeStyle = pts[pts.length - 1].p >= pts[0].p ? '#5ee39b' : '#ff6b78'; sx.lineWidth = 1.5 * (win.devicePixelRatio || 1); sx.stroke();
      }
      d.body.dataset.frames = String((+d.body.dataset.frames || 0) + 1);
    }
    const timer = setInterval(() => { paint(); }, 250), footTimer = setInterval(paintFoot, 1000);
    paint(); paintFoot();
    win.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(footTimer); chartWin = null; bus.emit('mini:state', { chart: false }); });
    chartWin = { win, pip };
    bus.emit('mini:state', { chart: true, pip });
    return chartWin;
  }

  // source: { kind: 'library', url: 'local:<id>' } | { kind: 'link', url }
  async function openPlayer(source) {
    const { win, pip } = await openWindow(480, 270, 'TVSuite player');
    const d = win.document;
    const box = d.createElement('div'); box.className = 'player';
    d.body.append(box);
    d.body.dataset.tvsMini = 'player';
    if (source.kind === 'library') {
      if (!IS_EXTENSION) throw new Error('Library media needs the browser extension');
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const f = d.createElement('iframe');
      f.src = `${resourceUrl('media.html')}#token=${token}&player=1`;
      f.allow = 'autoplay; fullscreen';
      const onMsg = (e) => { if (e.source === f.contentWindow && e.data?.tvsuite === 'sandbox' && e.data.token === token) { if (e.data.type === 'hello') f.contentWindow.postMessage({ tvsuite: 'layer', token, type: 'skin', skin: { id: 'player', kind: 'media', url: source.url, fit: 'contain' } }, '*'); else if (e.data.type === 'status') d.body.dataset.state = e.data.status.state; } };
      win.addEventListener('message', onMsg);
      box.append(f);
    } else {
      const em = embedFor(source.url);
      if (!em) throw new Error('Paste an https link to a video, image, YouTube or Twitch');
      const n = d.createElement(em.kind);
      n.src = em.src;
      if (em.kind === 'iframe') { n.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; n.referrerPolicy = 'strict-origin-when-cross-origin'; }
      if (em.kind === 'video') Object.assign(n, { controls: true, autoplay: true, loop: true, playsInline: true });
      n.addEventListener?.(em.kind === 'video' ? 'loadeddata' : 'load', () => { d.body.dataset.state = 'running'; });
      box.append(n);
    }
    playerWin = { win, pip };
    win.addEventListener('pagehide', () => { playerWin = null; bus.emit('mini:state', { player: false }); });
    bus.emit('mini:state', { player: true, pip });
    return playerWin;
  }

  return {
    openChart, openPlayer,
    close: () => { chartWin?.win.close(); playerWin?.win.close(); },
    state: () => ({ chart: !!chartWin && !chartWin.win.closed, player: !!playerWin && !playerWin.win.closed, pipSupported: !!globalThis.documentPictureInPicture }),
  };
}
