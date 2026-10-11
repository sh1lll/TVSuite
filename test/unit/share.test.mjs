import test from 'node:test';
import assert from 'node:assert/strict';
import { validWebhook, validTelegram, discordPayload, telegramMethod, DISCORD_MAX } from '../../src/share/send.js';

const file = (type, size, name = 'f') => ({ type, size, name });

test('webhook and bot validation', () => {
  assert.ok(validWebhook('https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz_-123'));
  assert.ok(validWebhook('https://discordapp.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz'));
  assert.ok(!validWebhook('https://evil.example/api/webhooks/1/abc'));
  assert.ok(!validWebhook('http://127.0.0.1:8080/api/webhooks/1/abcdefghijklmnopqrstuvwxyz'));
  assert.ok(validWebhook('http://127.0.0.1:8080/api/webhooks/1/abcdefghijklmnopqrstuvwxyz', { allowLoopback: true }));
  assert.ok(validTelegram({ token: '123456789:AAEhBP0av28aZ7z-kVxIl1g3bW6jK9yDmQs', chatId: '-1001234567890' }));
  assert.ok(validTelegram({ token: '123456789:AAEhBP0av28aZ7z-kVxIl1g3bW6jK9yDmQs', chatId: '@mychannel' }));
  assert.ok(!validTelegram({ token: 'nope', chatId: '1' }));
});

test('discord payload: embed with attached image, 10 MB cap', () => {
  const p = discordPayload({ text: 'hi', title: 'ES card', fields: [{ name: 'P&L', value: '+$250' }], file: file('image/png', 1000, 'chart.png') });
  assert.equal(p.json.embeds[0].image.url, 'attachment://chart.png');
  assert.deepEqual(p.json.attachments, [{ id: 0, filename: 'chart.png' }]);
  assert.ok(p.file);
  const big = discordPayload({ text: 'clip', file: file('video/webm', DISCORD_MAX + 1, 'trade.webm') });
  assert.equal(big.file, undefined);
  assert.match(big.json.content, /over Discord’s 10 MB limit/);
  assert.equal(discordPayload({ text: 'x'.repeat(3000) }).json.content.length, 2000);
});

test('telegram picks photo / video / document by type and size', () => {
  assert.equal(telegramMethod(null).method, 'sendMessage');
  assert.equal(telegramMethod(file('image/png', 5e6)).method, 'sendPhoto');
  assert.equal(telegramMethod(file('image/png', 20e6)).method, 'sendDocument');
  assert.equal(telegramMethod(file('video/mp4', 30e6)).method, 'sendVideo');
  assert.equal(telegramMethod(file('video/mp4', 60e6)).skipped, 'f');
});
