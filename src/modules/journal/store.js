// Journal entries in the extension origin's IndexedDB (background worker + journal page only).
const DB = 'tvsuite-journal';
const STORE = 'entries';

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
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Journal write aborted (storage full?)')); };
  });
}

const num = (v) => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);

export function sanitizeEntry(input) {
  const e = input || {};
  return {
    id: typeof e.id === 'string' && /^[a-z0-9]{6,40}$/.test(e.id) ? e.id : `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Number.isFinite(e.createdAt) ? e.createdAt : Date.now(),
    symbol: String(e.symbol || '').slice(0, 40),
    price: num(e.price),
    ohlc: e.ohlc && typeof e.ohlc === 'object' ? { o: num(e.ohlc.o), h: num(e.ohlc.h), l: num(e.ohlc.l), c: num(e.ohlc.c) } : null,
    session: String(e.session || '').slice(0, 40),
    side: ['long', 'short', 'none'].includes(e.side) ? e.side : 'none',
    entry: num(e.entry), stop: num(e.stop), target: num(e.target), resultR: num(e.resultR),
    tags: Array.isArray(e.tags) ? e.tags.map(String).slice(0, 12) : [],
    note: String(e.note || '').slice(0, 5000),
    url: typeof e.url === 'string' && /^https:\/\//.test(e.url) ? e.url.slice(0, 500) : '',
    image: typeof e.image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(e.image) && e.image.length < 8_000_000 ? e.image : null,
  };
}

export const journalStore = {
  add: (entry) => run('readwrite', (s) => s.put(sanitizeEntry(entry))),
  put: (entry) => run('readwrite', (s) => s.put(sanitizeEntry(entry))),
  get: (id) => run('readonly', (s) => s.get(id)),
  remove: (id) => run('readwrite', (s) => s.delete(id)),
  all: async () => ((await run('readonly', (s) => s.getAll())) || []).sort((a, b) => b.createdAt - a.createdAt),
};
