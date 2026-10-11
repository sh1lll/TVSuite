// Put a script into TradingView's Pine Editor. TradingView's editor is Monaco, but Monaco isn't exposed as a
// page global, so after trying the page API we drive the editor the way a person would: open the Pine Editor
// if it's closed, focus it, select all, paste — then read the editor back to verify before saying it worked.
// If anything fails, the caller falls back to the clipboard.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Monaco renders on animation frames; give a busy page up to ~2 s to show what we typed.
async function poll(check, ms = 2000) { const end = Date.now() + ms; do { if (check()) return true; await sleep(100); } while (Date.now() < end); return false; }
const visible = (n) => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function findPineEditor(root = document) {
  const eds = [...root.querySelectorAll('.monaco-editor')].filter(visible);
  // Prefer an editor inside something Pine-ish; otherwise the largest visible Monaco editor.
  const pine = eds.find((e) => e.closest('[data-name*="pine" i], [class*="pine" i], [id*="pine" i]'));
  return pine || eds.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
}

function label(n) {
  return [n.getAttribute('aria-label'), n.getAttribute('title'), n.getAttribute('data-name'), n.getAttribute('data-tooltip'), (n.textContent || '').trim().slice(0, 40)].filter(Boolean).join(' | ');
}
export function findPineButton(root = document) {
  const cands = [...root.querySelectorAll('button, [role="button"], [role="tab"], [data-name]')].filter((n) => visible(n) && !n.closest('[id^="tvsuite-"]'));
  return cands.find((n) => /^pine( script)?( editor)?$/i.test((n.textContent || '').trim()) || /\bpine\b/i.test(n.getAttribute('aria-label') || '') || /\bpine\b/i.test(n.getAttribute('title') || '') || /pine/i.test(n.getAttribute('data-name') || '')) || null;
}
export function findAddToChart(editor, root = document) {
  const match = (n) => visible(n) && /add to chart|add indicator to chart|update on chart|save and add/i.test(label(n));
  // Search outward from the editor (its toolbar is usually a few levels up), then the whole page.
  for (let scope = editor?.parentElement, i = 0; scope && i < 8; scope = scope.parentElement, i++) {
    const hit = [...scope.querySelectorAll('button, [role="button"], [data-name]')].find(match);
    if (hit) return hit;
  }
  return [...root.querySelectorAll('button, [role="button"], [data-name]')].find(match) || null;
}

// Text Monaco currently renders (visible lines only) and the highest visible line number.
export function readEditor(editor) {
  // Text of each rendered line, skipping Monaco's inline decorations (e.g. the colour swatch before #hex values).
  const lineText = (l) => {
    let t = '';
    const walk = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!n.parentElement?.closest('[class*="decoration"], [class*="inlay"]')) t += n.nodeValue;
    return t.replace(/\u00a0/g, ' ');
  };
  const lines = [...editor.querySelectorAll('.view-lines .view-line')].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top)).map(lineText);
  const nums = [...editor.querySelectorAll('.line-numbers')].map((n) => parseInt(n.textContent, 10)).filter(Number.isFinite);
  return { text: lines.join('\n'), maxLine: nums.length ? Math.max(...nums) : null };
}
// Indentation must match exactly (Pine is indentation-sensitive); spacing inside a line is compared loosely.
const canon = (l) => { const ind = l.match(/^[ \t]*/)[0]; return ind + l.slice(ind.length).replace(/\s+/g, ' ').trim(); };

// After an insert the cursor (and view) sits at the end of the script: its last line must be visible.
export function looksPasted(editor, code) {
  // The last few lines must be on screen exactly, indentation included (Pine is indentation-sensitive).
  const want = code.replace(/\s+$/, '').split('\n').map(canon);
  const shown = readEditor(editor).text.split('\n').map(canon);
  const tail = want.slice(-4);
  for (let i = 0; i + tail.length <= shown.length; i++) if (tail.every((l, k) => shown[i + k] === l)) return true;
  return false;
}
// After jumping to the top, the first lines must match too — together that confirms the whole script went in.
export function startsWith(editor, code) {
  const head = code.split('\n').slice(0, 6).map(canon);
  const shown = readEditor(editor).text.split('\n').map(canon);
  return head.every((l, i) => shown[i] === l);
}

// Key presses must be created in the page's own world for Monaco to see keyCode; queryMain does that when
// TVSuite runs as an extension (in the desktop/userscript build this code already runs in the page).
let mainKeys = null;
function key(target, k, keyCode, mods = {}) {
  if (mainKeys) return mainKeys([{ key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, keyCode, ctrl: !!mods.ctrlKey, meta: !!mods.metaKey, shift: !!mods.shiftKey }]);
  localKey(target, k, keyCode, mods);
}
function localKey(target, k, keyCode, mods = {}) {
  for (const type of ['keydown', 'keyup']) {
    const e = new KeyboardEvent(type, { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, bubbles: true, cancelable: true, composed: true, ...mods });
    Object.defineProperty(e, 'keyCode', { get: () => keyCode });
    Object.defineProperty(e, 'which', { get: () => keyCode });
    target.dispatchEvent(e);
  }
}
const primary = () => (isMac() ? { metaKey: true } : { ctrlKey: true });

// Types the script line by line. Monaco treats inserted text as keyboard typing, so a newline would copy the
// previous line's indentation (and language rules may add more); after each newline we select whatever
// indentation it added (Shift+Home) and replace it with the exact line. Works for textarea-based Monaco and
// for EditContext-based Monaco (where we update the EditContext the way the browser does before its event).
async function viaDom(editor, code) {
  const input = editor.querySelector('.native-edit-context') || editor.querySelector('textarea.inputarea') || editor.querySelector('textarea');
  if (!input) return null;
  const lines = editor.querySelector('.view-lines') || editor;
  const r = lines.getBoundingClientRect();
  for (const type of ['mousedown', 'mouseup']) lines.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 8, button: 0 }));
  input.focus();
  await sleep(50);
  const ec = input.editContext && typeof TextUpdateEvent === 'function' ? input.editContext : null;
  const frame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  const insert = (text) => {
    if (ec) {
      const st = Math.min(ec.selectionStart, ec.text.length), en = Math.min(ec.selectionEnd, ec.text.length);
      ec.updateText(st, en, text);
      ec.updateSelection(st + text.length, st + text.length);
      ec.dispatchEvent(new TextUpdateEvent('textupdate', { text, updateRangeStart: st, updateRangeEnd: en, selectionStart: st + text.length, selectionEnd: st + text.length }));
      return true;
    }
    return document.execCommand('insertText', false, text);
  };
  const src = code.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  // EditContext mode: Monaco syncs the EditContext (text window + selection) on later frames. After each step,
  // wait until that state has stopped changing for two frames, so a busy page can't make us use stale ranges.
  const settled = async () => {
    if (!ec) return;
    let last = '', same = 0;
    for (let i = 0; i < 30 && same < 1; i++) {
      await frame();
      const now = `${ec.text.length}|${ec.selectionStart}|${ec.selectionEnd}|${ec.text.slice(-40)}`;
      same = now === last ? same + 1 : 0;
      last = now;
    }
  };
  await key(input, 'a', 65, primary()); await settled();
  if (!insert(src[0] || ' ')) return null;
  await settled();
  if (!src[0]) { await key(input, 'Backspace', 8); await settled(); }
  for (const line of src.slice(1)) {
    insert('\n'); await settled();
    await key(input, 'Home', 36, { shiftKey: true }); await settled();
    if (line) insert(line);
    else { insert(' '); await settled(); await key(input, 'Backspace', 8); }
    await settled();
  }
  return (await poll(() => looksPasted(editor, src.join('\n')))) ? 'typed' : null;
}

// queryMain: (string) → Promise<answer> into the page's MAIN world (Monaco API there if TradingView exposes it).
export async function sendToPineEditor(code, { queryMain, addToChart = false, openTimeout = 6000 } = {}) {
  mainKeys = null;
  if (queryMain && (await queryMain(JSON.stringify({ cmd: 'keys', keys: [] })).catch(() => null))?.ok) mainKeys = (keys) => queryMain(JSON.stringify({ cmd: 'keys', keys }));
  let editor = findPineEditor();
  let opened = false;
  if (!editor) {
    const btn = findPineButton();
    if (!btn) return { ok: false, reason: 'no-editor', message: 'Open the Pine Editor first (bottom panel of the chart)' };
    btn.click();
    opened = true;
    const end = Date.now() + openTimeout;
    while (!editor && Date.now() < end) { await sleep(150); editor = findPineEditor(); }
    if (!editor) return { ok: false, reason: 'no-editor', message: 'The Pine Editor didn’t open in time — open it, then try again' };
    await sleep(400); // let Monaco finish its first layout
  }
  let method = null;
  const api = queryMain ? await queryMain(JSON.stringify({ cmd: 'pineSet', code })).catch(() => null) : null;
  if (api?.ok) { await sleep(150); if (looksPasted(editor, code)) method = 'api'; }
  if (!method) method = await viaDom(editor, code);
  if (!method) return { ok: false, reason: 'not-verified', opened, message: 'Couldn’t confirm the paste — the script is on your clipboard instead' };
  // Put the cursor back at the top so the user sees the start of the script — and check the start matches.
  const input = editor.querySelector('.native-edit-context, textarea.inputarea, textarea');
  if (input && method !== 'api') { input.focus(); await key(input, 'Home', 36, primary()); }
  if (!(await poll(() => startsWith(editor, code)))) return { ok: false, reason: 'not-verified', opened, message: 'The editor’s first lines don’t match — the script is on your clipboard instead' };
  let added = false;
  if (addToChart) {
    const b = findAddToChart(editor);
    if (b) { b.click(); added = true; }
  }
  return { ok: true, method, opened, added, addMissing: addToChart && !added };
}
