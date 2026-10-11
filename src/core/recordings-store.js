// Recordings library in the extension origin's IndexedDB (vault frame writes, background + recordings page read).
const DB = 'tvsuite-recordings';
const STORE = 'clips';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Recording save aborted (storage full?)')); };
  });
}

const META = ['id', 'createdAt', 'name', 'mime', 'size', 'duration', 'symbol', 'reason', 'events'];
export const recordingsStore = {
  async put(blob, meta = {}, keep = 20) {
    if (!(blob instanceof Blob) || !blob.size) throw new Error('Empty recording');
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const rec = { id, createdAt: Date.now(), name: String(meta.name || 'Recording').slice(0, 80), mime: blob.type || 'video/webm', size: blob.size,
      duration: Number.isFinite(meta.duration) ? meta.duration : null, symbol: String(meta.symbol || '').slice(0, 40), reason: String(meta.reason || '').slice(0, 40),
      events: Array.isArray(meta.events) ? meta.events.slice(0, 200).map((e) => ({ t: +e.t || 0, type: String(e.type).slice(0, 30) })) : [], blob };
    await run('readwrite', (s) => s.put(rec));
    const all = await this.list();
    for (const old of all.slice(Math.max(1, keep))) await this.remove(old.id);
    return id;
  },
  async list() { return ((await run('readonly', (s) => s.getAll())) || []).map((r) => Object.fromEntries(META.map((k) => [k, r[k]]))).sort((a, b) => b.createdAt - a.createdAt); },
  get: (id) => run('readonly', (s) => s.get(id)),
  remove: (id) => run('readwrite', (s) => s.delete(id)),
};
