// Element picker: hover to highlight, click to choose (e.g. the P&L figure in TradingView's account panel or a
// broker's page). Returns a CSS path that survives TradingView's hashed class names where possible.
const HASHED = /-[A-Za-z0-9_]{5,}$/;

function stablePart(n) {
  const tag = n.tagName.toLowerCase();
  for (const a of ['data-name', 'data-testid', 'data-test-id', 'data-qa', 'aria-label', 'name']) {
    const v = n.getAttribute(a);
    if (v && v.length < 60) return `${tag}[${a}="${CSS.escape(v)}"]`;
  }
  const cls = [...n.classList].find((c) => !/^(active|selected|hover|focus|is-|js-)/.test(c));
  if (cls) return HASHED.test(cls) ? `${tag}[class*="${CSS.escape(cls.replace(HASHED, '-'))}"]` : `${tag}.${CSS.escape(cls)}`;
  return tag;
}

export function cssPath(target) {
  const parts = [];
  let n = target;
  while (n && n.nodeType === 1 && n !== document.documentElement && parts.length < 10) {
    if (n.id && /^[A-Za-z][\w-]*$/.test(n.id) && document.querySelectorAll(`#${CSS.escape(n.id)}`).length === 1) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
    let part = stablePart(n);
    const parent = n.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => { try { return c.matches(part); } catch (_) { return false; } });
      if (same.length > 1) part += `:nth-of-type(${[...parent.children].filter((c) => c.tagName === n.tagName).indexOf(n) + 1})`;
    }
    parts.unshift(part);
    const sel = parts.join(' > ');
    try { if (document.querySelector(sel) === target && parts.length >= 2) return sel; } catch (_) { /* keep climbing */ }
    n = parent;
  }
  const sel = parts.join(' > ');
  try { if (document.querySelector(sel) === target) return sel; } catch (_) { /* fall through */ }
  return null;
}

export function pickElement({ hint = 'Click the number to read', ignore = [] } = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'fixed', zIndex: 2147483646, pointerEvents: 'none', border: '2px solid #5b8cff', background: 'rgba(91,140,255,.15)', borderRadius: '4px', transition: 'all .05s' });
    const tip = document.createElement('div');
    Object.assign(tip.style, { position: 'fixed', zIndex: 2147483647, left: '50%', top: '12px', transform: 'translateX(-50%)', background: '#0b0e14', color: '#fff', font: '600 13px -apple-system, Segoe UI, sans-serif', padding: '8px 14px', borderRadius: '8px', border: '1px solid #5b8cff', pointerEvents: 'none' });
    tip.textContent = `${hint} — Esc to cancel`;
    document.documentElement.append(box, tip);
    let cur = null;
    const skip = (n) => !n || n === box || n === tip || ignore.some((h) => h.contains(n)) || n.closest?.('[id^="tvsuite-"]');
    const move = (e) => {
      const n = document.elementFromPoint(e.clientX, e.clientY);
      if (skip(n)) return;
      cur = n;
      const r = n.getBoundingClientRect();
      Object.assign(box.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      tip.textContent = `${(n.textContent || '').trim().slice(0, 40) || n.tagName.toLowerCase()} — click to choose, Esc to cancel`;
    };
    const done = (v) => {
      window.removeEventListener('pointermove', move, true); window.removeEventListener('click', click, true); window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', swallow, true); window.removeEventListener('mousedown', swallow, true);
      box.remove(); tip.remove(); resolve(v);
    };
    const swallow = (e) => { if (!skip(e.target)) { e.preventDefault(); e.stopPropagation(); } };
    const click = (e) => {
      if (skip(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      const n = cur || e.target;
      done({ selector: cssPath(n), text: (n.textContent || '').trim().slice(0, 80) });
    };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerdown', swallow, true);
    window.addEventListener('mousedown', swallow, true);
    window.addEventListener('click', click, true);
    window.addEventListener('keydown', key, true);
  });
}
