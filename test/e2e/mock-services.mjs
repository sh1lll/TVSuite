// Local stand-ins for Discord webhooks, the Telegram Bot API and smart-light APIs (Hue, Home Assistant,
// WLED, Govee) — records every request so the e2e suite can assert on what TVSuite sent.
import http from 'node:http';

export async function startMockServices() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const rec = { method: req.method, url: req.url, headers: req.headers, size: body.length, text: body.toString('latin1') };
      requests.push(rec);
      const json = (o, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
      if (/^\/api\/webhooks\//.test(req.url)) return json({ id: '1', channel_id: '2' });
      let m = req.url.match(/^\/bot[^/]+\/(\w+)/);
      if (m) return json(m[1] === 'getUpdates' ? { ok: true, result: [{ message: { chat: { id: 4242, first_name: 'Test' } } }] } : { ok: true, result: { message_id: 1 } });
      if (/^\/api\/services\/light\//.test(req.url)) return json([]);                     // Home Assistant
      if (req.url === '/json/state') return json({ success: true });                         // WLED
      if (/^\/router\/api\/v1\/device\/control/.test(req.url)) return json({ code: 200, msg: 'success' }); // Govee
      if (req.url === '/api' && req.method === 'POST') return json([{ success: { username: 'testuser1234567890' } }]); // Hue pairing
      if (/^\/api\/[^/]+\/(lights|groups)\//.test(req.url)) return json([{ success: {} }]); // Hue v1
      res.writeHead(404); res.end('not mocked');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { port, base: `http://127.0.0.1:${port}`, requests, close: () => new Promise((r) => server.close(r)) };
}
