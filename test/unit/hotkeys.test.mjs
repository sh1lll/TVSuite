import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHotkey, matchHotkey } from '../../src/core/hotkeys.js';

test('hotkeys parse and match by physical key', () => {
  assert.deepEqual(parseHotkey('Alt+Shift+T'), { key: 't', alt: true, shift: true, ctrl: false, meta: false });
  assert.ok(matchHotkey({ code: 'KeyT', key: 'Ŧ', altKey: true, shiftKey: true }, 'Alt+Shift+T'));
  assert.ok(!matchHotkey({ code: 'KeyT', key: 't', altKey: true }, 'Alt+Shift+T'));
  assert.ok(matchHotkey({ key: 'Escape' }, 'Escape'));
  assert.equal(parseHotkey(''), null);
});
