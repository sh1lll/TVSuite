// The user's own media for skins (video, GIF, images), kept in the extension origin's IndexedDB.
// Only extension pages (options page, media frame) open this store; files never leave the computer.
const DB = 'tvsuite-media';
const STORE = 'files';
export const MAX_BYTES = 300 * 1024 * 1024;
export const ACCEPT = 'video/mp4,video/webm,video/quicktime,image/gif,image/png,image/jpeg,image/webp,image/avif';

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

export async function addMedia(file) {
  if (!file || !ACCEPT.split(',').includes(file.type)) throw new Error(`Unsupported file type ${file?.type || ''}. Use MP4, WebM, MOV, GIF, PNG, JPG, WebP or AVIF.`);
  if (file.size > MAX_BYTES) throw new Error(`File is larger than ${MAX_BYTES / 1024 / 1024} MB`);
  const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rec = { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'My media', type: file.type, size: file.size, created: Date.now(), blob: file };
  await tx('readwrite', (s) => s.put(rec));
  return { id: rec.id, name: rec.name, type: rec.type, size: rec.size, created: rec.created };
}

export async function getMedia(id) { return tx('readonly', (s) => s.get(id)); }

export async function listMedia() {
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).map(({ blob, ...meta }) => meta).sort((a, b) => b.created - a.created);
}

export async function removeMedia(id) { return tx('readwrite', (s) => s.delete(id)); }

export function mediaSkin(meta, fit = 'cover') {
  return { schema: 'tvsuite.skin/1', kind: 'media', id: `media-${meta.id}`, name: meta.name, url: `local:${meta.id}`, fit, params: {}, tags: ['my media'], author: '', description: `${meta.type} · ${(meta.size / 1048576).toFixed(1)} MB` };
}
