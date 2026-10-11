// The user's own media for skins (video, GIF, images), kept in the extension origin's IndexedDB.
// Only extension pages (options page, media frame) open this store; files never leave the computer.
const DB = 'tvsuite-media';
const STORE = 'files';
export const MAX_BYTES = 300 * 1024 * 1024;
export const ACCEPT_VISUAL = 'video/mp4,video/webm,video/quicktime,video/ogg,image/gif,image/png,image/jpeg,image/webp,image/avif,image/svg+xml,image/apng,image/bmp';
export const ACCEPT_AUDIO = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/ogg,audio/webm,audio/mp4,audio/x-m4a,audio/aac,audio/flac,audio/x-flac,audio/opus';
export const ACCEPT = `${ACCEPT_VISUAL},${ACCEPT_AUDIO}`;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out?.result ?? out); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function addMedia(file, { thumb = null } = {}) {
  if (!file || !ACCEPT.split(',').includes(file.type)) throw new Error(`Unsupported file type ${file?.type || 'unknown'}. Use MP4/WebM/MOV, GIF/PNG/JPG/WebP/AVIF/SVG, or MP3/WAV/OGG/M4A/FLAC.`);
  if (file.size > MAX_BYTES) throw new Error(`File is larger than ${MAX_BYTES / 1024 / 1024} MB`);
  const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rec = { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'My media', type: file.type, size: file.size, created: Date.now(), blob: file, thumb };
  await tx('readwrite', (s) => s.put(rec));
  return { id: rec.id, name: rec.name, type: rec.type, size: rec.size, created: rec.created, thumb };
}

export async function getMedia(id) { return tx('readonly', (s) => s.get(id)); }

export async function listMedia() {
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).map(({ blob, ...meta }) => meta).sort((a, b) => b.created - a.created);
}

export async function removeMedia(id) { return tx('readwrite', (s) => s.delete(id)); }

export function mediaSkin(meta, fit = 'cover') {
  return { schema: 'tvsuite.skin/1', kind: 'media', id: `media-${meta.id}`, name: meta.name, url: `local:${meta.id}`, fit, params: {}, tags: ['my media'], author: '', description: `${meta.type} · ${(meta.size / 1048576).toFixed(1)} MB`, ...(meta.thumb ? { thumb: meta.thumb } : {}) };
}

export const isAudio = (type) => /^audio\//.test(type || '');

// A small JPEG thumbnail (data URL) of an image or video file, made in an extension page.
export async function makeThumb(file, w = 320, h = 180) {
  try {
    let source;
    if (/^video\//.test(file.type)) {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(file);
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(rej, 8000); });
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      await new Promise((res) => { v.onseeked = res; setTimeout(res, 2000); });
      source = v;
    } else if (/^image\//.test(file.type)) {
      source = await createImageBitmap(file).catch(async () => {
        const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img;
      });
    } else return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
    const scale = Math.max(w / sw, h / sh);
    ctx.drawImage(source, (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale);
    return c.toDataURL('image/jpeg', 0.78);
  } catch (_) { return null; }
}
