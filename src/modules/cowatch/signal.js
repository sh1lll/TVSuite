// Co-watch handshake codes: a WebRTC offer/answer packed into a short copy-paste code (no server).
// "TVSC1." + base64url(deflate(JSON)). Pure (uses CompressionStream, available in browsers and Node 18+).
const PREFIX = 'TVSC1.';

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

// Strip SDP lines a data-channel-only session doesn't need, so codes stay short.
export function slimSdp(sdp) {
  return String(sdp).split(/\r?\n/).filter((l) => l && !/^a=(extmap|rtcp-fb|ssrc|msid)/.test(l)).join('\r\n') + '\r\n';
}

export async function encodeSignal({ type, sdp, name = '' }) {
  if (type !== 'offer' && type !== 'answer') throw new Error('Bad signal type');
  const json = JSON.stringify({ t: type === 'offer' ? 'o' : 'a', s: slimSdp(sdp), n: String(name).slice(0, 40) });
  return PREFIX + b64u(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

export async function decodeSignal(code) {
  const s = String(code || '').trim().replace(/\s+/g, '');
  if (!s.startsWith(PREFIX)) throw new Error('That isn’t a TVSuite co-watch code');
  let o;
  try { o = JSON.parse(new TextDecoder().decode(await pipe(unb64u(s.slice(PREFIX.length)), new DecompressionStream('deflate-raw')))); }
  catch (_) { throw new Error('That code is damaged — copy it again'); }
  if (!['o', 'a'].includes(o.t) || typeof o.s !== 'string' || !o.s.startsWith('v=0')) throw new Error('That code is damaged — copy it again');
  return { type: o.t === 'o' ? 'offer' : 'answer', sdp: o.s, name: String(o.n || '').slice(0, 40) };
}

// Messages on the data channel are validated before anything acts on them.
export function validMessage(m) {
  if (!m || typeof m !== 'object' || typeof m.type !== 'string') return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  switch (m.type) {
    case 'hello': return { type: 'hello', name: str(m.name, 40), version: str(m.version, 20) };
    case 'chart': return /^[\w:.!/-]{1,40}$/.test(m.symbol || '') || /^\w{1,6}$/.test(m.interval || '') ? { type: 'chart', symbol: /^[\w:.!/-]{1,40}$/.test(m.symbol || '') ? m.symbol : null, interval: /^\w{1,6}$/.test(m.interval || '') ? m.interval : null } : null;
    case 'chat': return str(m.text, 500).trim() ? { type: 'chat', text: str(m.text, 500) } : null;
    case 'ping': return { type: 'ping', note: str(m.note, 120), price: Number.isFinite(m.price) ? m.price : null, symbol: str(m.symbol, 40) };
    case 'bye': return { type: 'bye' };
    default: return null;
  }
}
