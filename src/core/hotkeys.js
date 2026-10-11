// Parse and match hotkeys like "Alt+Shift+T". Ignores keystrokes typed into inputs.
export function parseHotkey(spec) {
  const parts = String(spec || '').split('+').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return null;
  const key = parts.pop();
  return { key, alt: parts.includes('alt'), shift: parts.includes('shift'), ctrl: parts.includes('ctrl') || parts.includes('control'), meta: parts.includes('meta') || parts.includes('cmd') };
}

export function matchHotkey(e, spec) {
  const h = typeof spec === 'string' ? parseHotkey(spec) : spec;
  if (!h) return false;
  // e.code is layout-independent ("KeyT"); fall back to e.key.
  const code = (e.code || '').toLowerCase();
  const key = h.key.length === 1 ? (code === `key${h.key}` || code === `digit${h.key}` || (e.key || '').toLowerCase() === h.key) : (e.key || '').toLowerCase() === h.key;
  return key && !!e.altKey === h.alt && !!e.shiftKey === h.shift && !!e.ctrlKey === h.ctrl && !!e.metaKey === h.meta;
}

export function isTypingTarget(e) {
  const t = e.composedPath?.()[0] || e.target;
  if (!t || !t.tagName) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}
