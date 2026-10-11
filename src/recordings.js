// Recordings page (extension origin): watch, download, share and delete chart recordings.
import { recordingsStore } from './core/recordings-store.js';

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (k === 'class') n.className = v; else n.setAttribute(k, v); } n.append(...kids.flat().filter((x) => x != null)); return n; };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const dur = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
const urls = [];

async function render() {
  for (const u of urls.splice(0)) URL.revokeObjectURL(u);
  const list = await recordingsStore.list();
  $('empty').hidden = list.length > 0;
  const focus = decodeURIComponent(location.hash.slice(1));
  $('list').replaceChildren(...await Promise.all(list.map(async (meta) => {
    const rec = await recordingsStore.get(meta.id);
    const url = URL.createObjectURL(rec.blob); urls.push(url);
    const video = h('video', { src: url, controls: '', preload: 'metadata', playsinline: '' });
    const send = (target) => async () => {
      $('status').textContent = `Sending to ${target}…`;
      const r = await chrome.runtime.sendMessage({ type: 'share.send', payload: { kind: 'recordings', targets: [target], recordingId: meta.id, title: meta.name, text: `${meta.symbol || 'Chart'} · ${dur(meta.duration)}` } });
      const res = r?.results?.[target];
      $('status').textContent = res?.ok ? `Sent to ${target}${res.skipped ? ` (file too large — sent the text only)` : ''}.` : `Couldn’t send: ${res?.error || r?.error || 'unknown error'}`;
    };
    const card = h('div', { class: 'clip', 'data-id': meta.id },
      video,
      h('div', { class: 'meta' },
        h('b', {}, meta.name),
        h('span', { class: 'note' }, `${new Date(meta.createdAt).toLocaleString()} · ${dur(meta.duration)} · ${mb(meta.size)} · ${meta.reason || ''}${meta.preRoll ? ` · includes ${Math.round(meta.preRoll)}s before entry` : ''}`),
        meta.events?.length ? h('div', { class: 'ev' }, meta.events.map((e) => h('button', { onclick: () => { video.currentTime = Math.max(0, e.t - 1); video.play(); } }, `${dur(e.t)} ${e.type}`))) : null,
        h('div', { class: 'btns' },
          h('a', { href: url, download: meta.name, class: 'btn' }, 'Download'),
          h('button', { onclick: send('discord') }, 'Send to Discord'),
          h('button', { onclick: send('telegram') }, 'Send to Telegram'),
          h('button', { onclick: async () => { if (confirm('Delete this recording?')) { await recordingsStore.remove(meta.id); render(); } } }, 'Delete'))));
    if (focus === meta.id) setTimeout(() => card.scrollIntoView({ behavior: 'smooth' }), 100);
    return card;
  })));
}
render();
