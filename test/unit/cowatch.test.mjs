import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSignal, decodeSignal, slimSdp, validMessage } from '../../src/modules/cowatch/signal.js';

const SDP = 'v=0\r\no=- 46117 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate:1 1 udp 2122260223 192.168.1.20 54400 typ host\r\na=ice-ufrag:abcd\r\na=ice-pwd:0123456789abcdefghijklmn\r\na=fingerprint:sha-256 AA:BB\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=extmap:1 urn:x\r\n';

test('handshake codes round-trip and stay compact', async () => {
  const code = await encodeSignal({ type: 'offer', sdp: SDP, name: 'Alex' });
  assert.match(code, /^TVSC1\.[\w-]+$/);
  const back = await decodeSignal(`  ${code.slice(0, 20)}\n${code.slice(20)} `);
  assert.equal(back.type, 'offer');
  assert.equal(back.name, 'Alex');
  assert.equal(back.sdp, slimSdp(SDP));
  assert.ok(!back.sdp.includes('extmap'));
  await assert.rejects(decodeSignal('hello'), /isn’t a TVSuite co-watch code/);
  await assert.rejects(decodeSignal('TVSC1.AAAA'), /damaged/);
});

test('data-channel messages are validated', () => {
  assert.deepEqual(validMessage({ type: 'chart', symbol: 'CME_MINI:NQ1!', interval: '5' }), { type: 'chart', symbol: 'CME_MINI:NQ1!', interval: '5' });
  assert.equal(validMessage({ type: 'chart', symbol: '<script>' }), null);
  assert.equal(validMessage({ type: 'chat', text: '   ' }), null);
  assert.equal(validMessage({ type: 'chat', text: 'x'.repeat(900) }).text.length, 500);
  assert.equal(validMessage({ type: 'eval', code: 'alert(1)' }), null);
  assert.deepEqual(validMessage({ type: 'ping', note: 'look', price: 21500, symbol: 'NQ1!' }), { type: 'ping', note: 'look', price: 21500, symbol: 'NQ1!' });
});
