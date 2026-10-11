import test from 'node:test';
import assert from 'node:assert/strict';
import { embedFor } from '../../src/modules/capture/mini.js';

test('player links: YouTube and Twitch embeds, direct media, rejects non-https', () => {
  assert.deepEqual(embedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { kind: 'iframe', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0' });
  assert.equal(embedFor('https://youtu.be/dQw4w9WgXcQ?t=10').src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0');
  assert.equal(embedFor('https://www.youtube.com/live/abcDEF12345').kind, 'iframe');
  assert.equal(embedFor('https://www.twitch.tv/somechannel', 'www.tradingview.com').src, 'https://player.twitch.tv/?channel=somechannel&parent=www.tradingview.com&autoplay=true');
  assert.deepEqual(embedFor('https://cdn.example.com/a/loop.mp4?x=1'), { kind: 'video', src: 'https://cdn.example.com/a/loop.mp4?x=1' });
  assert.equal(embedFor('https://i.example.com/x.gif').kind, 'img');
  assert.equal(embedFor('http://insecure.example/x.mp4'), null);
  assert.equal(embedFor('javascript:alert(1)'), null);
  assert.equal(embedFor('not a url'), null);
});
