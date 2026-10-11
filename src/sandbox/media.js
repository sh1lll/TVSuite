// Runs in extension/media.html (extension origin, framed under the chart). Plays one media skin:
// a local file from the extension's IndexedDB ("local:<id>") or an https URL. No code from skins runs here.
import { getMedia } from '../core/media-store.js';

const hash = new URLSearchParams(location.hash.slice(1));
const token = hash.get('token');
// Player mode (mini window): sound and controls on, and the sender may be the opener tab rather than our parent;
// the random token in our URL is what authorises it.
const player = hash.get('player') === '1';
const root = document.getElementById('root');
let el = null, paused = false, currentUrl = null, seq = 0;

const rate = (r) => (Number.isFinite(+r) && +r > 0 ? Math.max(0.1, Math.min(4, +r)) : 1);

function reply(msg) { parent.postMessage({ tvsuite: 'sandbox', token, ...msg }, '*'); }

async function show(skin) {
  if (!skin || skin.kind !== 'media') return;
  if (skin.url === currentUrl && el) { el.style.objectFit = skin.fit || 'cover'; if (el.tagName === 'VIDEO') el.playbackRate = rate(skin.params?.rate); return; }
  currentUrl = skin.url;
  const mine = ++seq; // a newer show() supersedes this one if it finishes first
  let src = skin.url, type = '', objectUrl = null;
  try {
    if (skin.url.startsWith('local:')) {
      const rec = await getMedia(skin.url.slice(6));
      if (mine !== seq) return;
      if (!rec) throw new Error('This media file is no longer in TVSuite (it may have been removed in Options).');
      objectUrl = URL.createObjectURL(rec.blob);
      src = objectUrl; type = rec.type;
    }
    const isVideo = type.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(skin.url) || skin.url.startsWith('data:video/');
    const next = document.createElement(isVideo ? 'video' : 'img');
    Object.assign(next.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: skin.fit || 'cover', opacity: '0', transition: 'opacity .7s' });
    if (isVideo) Object.assign(next, { muted: !player, controls: player, loop: true, autoplay: !paused, playsInline: true });
    next.addEventListener(isVideo ? 'loadeddata' : 'load', () => { if (isVideo) next.playbackRate = rate(skin.params?.rate); next.style.opacity = '1'; reply({ type: 'status', status: { state: 'running', skin: skin.id, mode: 'media' } }); }, { once: true });
    next.addEventListener('error', () => reply({ type: 'status', status: { state: 'error', skin: skin.id, message: isVideo ? 'This video can\'t be played here (codec not supported by this browser?)' : 'Image failed to load' } }), { once: true });
    next.src = src;
    if (objectUrl) next.dataset.objectUrl = objectUrl;
    root.append(next);
    const old = el; el = next;
    if (old) setTimeout(() => { old.remove(); if (old.dataset.objectUrl) URL.revokeObjectURL(old.dataset.objectUrl); }, 800);
    reply({ type: 'status', status: { state: 'starting', skin: skin.id, mode: 'media' } });
  } catch (err) {
    reply({ type: 'status', status: { state: 'error', skin: skin.id, message: err.message } });
  }
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if ((!player && e.source !== parent) || !m || m.tvsuite !== 'layer' || !token || m.token !== token) return;
  if (m.type === 'skin') show(m.skin);
  else if (m.type === 'params' && el?.tagName === 'VIDEO' && m.params && 'rate' in m.params) el.playbackRate = rate(m.params.rate);
  else if (m.type === 'pause') { paused = !!m.paused; if (el?.tagName === 'VIDEO') (paused ? el.pause() : el.play().catch(() => {})); }
});
reply({ type: 'hello' });
