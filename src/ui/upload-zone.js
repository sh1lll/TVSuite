// Embeds the extension's upload frame (drag & drop / file picker) inside the panel.
// Files are stored by the frame in extension storage; we only receive their metadata.
import { el } from '../core/dom.js';
import { IS_EXTENSION, resourceUrl } from '../core/env.js';

export function uploadZone({ accept = 'visual', height = 132, onItems }) {
  if (!IS_EXTENSION) return el('div', { class: 'note' }, 'Uploading files needs the browser extension. You can still paste a link.');
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const frame = el('iframe', { src: `${resourceUrl('upload.html')}#token=${token}&accept=${accept}`, title: 'Upload', allow: '', style: { width: '100%', height: `${height}px`, border: '0', display: 'block', colorScheme: 'normal', background: 'transparent' } });
  const onMsg = (e) => {
    const m = e.data;
    if (e.source !== frame.contentWindow || !m || m.tvsuite !== 'upload' || m.token !== token || !Array.isArray(m.items)) return;
    onItems(m.items);
  };
  window.addEventListener('message', onMsg);
  // Clean up the listener when the zone leaves the page.
  const mo = new MutationObserver(() => { if (!frame.isConnected) { window.removeEventListener('message', onMsg); mo.disconnect(); } });
  requestAnimationFrame(() => { const root = frame.getRootNode(); mo.observe(root instanceof ShadowRoot ? root : document.body, { childList: true, subtree: true }); });
  return frame;
}
