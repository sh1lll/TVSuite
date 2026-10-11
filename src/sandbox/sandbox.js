// Runs inside extension/sandbox.html: a manifest "sandbox" page with an opaque origin.
// It cannot reach the TradingView page DOM, extension APIs, cookies or storage, and its CSP
// blocks all network connections. The content script drives it purely through postMessage.
import { SkinHost } from '../modules/skins/host.js';
import { WORKER_SOURCE } from 'tvsuite:worker-source';

const token = new URLSearchParams(location.hash.slice(1)).get('token');
const root = document.getElementById('root');
let host = null;

function reply(msg) { parent.postMessage({ tvsuite: 'sandbox', token, ...msg }, '*'); }

window.addEventListener('message', (e) => {
  const m = e.data;
  if (e.source !== parent || !m || m.tvsuite !== 'layer' || !token || m.token !== token) return;
  if (!host) host = new SkinHost({ container: root, workerSource: WORKER_SOURCE, allowInlineFallback: true, onStatus: (status) => reply({ type: 'status', status }) });
  switch (m.type) {
    case 'skin': host.setSkin(m.skin); break;
    case 'signals': host.setSignals(m.signals); break;
    case 'params': host.setParams(m.params); break;
    case 'fps': host.setFps(m.fps); break;
    case 'scale': host.setScale(m.scale); break;
    case 'pause': host.setPaused(m.paused); break;
    case 'thumb': host.thumbnail(m.skin, m.width, m.height).then((blob) => parent.postMessage({ tvsuite: 'sandbox', token, type: 'thumb', id: m.id, blob }, '*')); break;
    default: break;
  }
});

document.addEventListener('visibilitychange', () => host?.setPaused(document.hidden));
reply({ type: 'hello' });
