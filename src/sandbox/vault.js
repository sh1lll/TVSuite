// Vault frame (extension origin, invisible): stores recordings sent from the chart tab into the extension's
// IndexedDB. Only accepts messages from its parent with the token in its URL.
import { recordingsStore } from '../core/recordings-store.js';

const token = new URLSearchParams(location.hash.slice(1)).get('token');
const reply = (msg) => parent.postMessage({ tvsuite: 'vault', token, ...msg }, '*');
window.addEventListener('message', async (e) => {
  const m = e.data;
  if (e.source !== parent || !m || m.tvsuite !== 'vault-cmd' || !token || m.token !== token) return;
  try {
    if (m.type === 'put') reply({ type: 'stored', seq: m.seq, id: await recordingsStore.put(m.blob, m.meta, m.keep) });
  } catch (err) { reply({ type: 'error', seq: m.seq, message: String(err.message || err) }); }
});
reply({ type: 'hello' });
