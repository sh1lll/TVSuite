import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaLink, mediaTypeOf } from '../../src/modules/skins/media-links.js';

test('direct links keep their URL and type', () => {
  assert.deepEqual(normalizeMediaLink('https://cdn.example.com/loop.mp4'), { url: 'https://cdn.example.com/loop.mp4', type: 'video' });
  assert.equal(normalizeMediaLink('https://x.com/a.GIF?v=2').type, 'image');
  assert.equal(normalizeMediaLink('http://x.com/a.webm').url, 'https://x.com/a.webm', 'upgraded to https');
  assert.equal(mediaTypeOf('https://x.com/page'), 'auto');
});

test('share pages become direct media', () => {
  assert.equal(normalizeMediaLink('https://giphy.com/gifs/rain-night-city-3o7btW1Js39uJ23LAA').url, 'https://media.giphy.com/media/3o7btW1Js39uJ23LAA/giphy.mp4');
  assert.equal(normalizeMediaLink('https://i.imgur.com/AbCd123.gifv').url, 'https://i.imgur.com/AbCd123.mp4');
  assert.match(normalizeMediaLink('https://www.dropbox.com/s/xyz/loop.mp4?dl=0').url, /loop\.mp4\?raw=1$/);
  assert.equal(normalizeMediaLink('https://drive.google.com/file/d/1AbC/view?usp=sharing').url, 'https://drive.google.com/uc?export=download&id=1AbC');
  assert.equal(normalizeMediaLink('https://github.com/u/r/blob/main/bg.gif').url, 'https://raw.githubusercontent.com/u/r/main/bg.gif');
});

test('unusable links explain themselves', () => {
  assert.throws(() => normalizeMediaLink('https://www.youtube.com/watch?v=abc'), /YouTube/);
  assert.throws(() => normalizeMediaLink('ftp://x/y.mp4'), /https/);
  assert.throws(() => normalizeMediaLink(''), /Paste/);
});
