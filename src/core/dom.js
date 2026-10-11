// DOM helpers. el() builds elements without innerHTML so untrusted strings
// (template names from the account, skin names from shared packs) are never parsed as HTML.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Wait until selector matches (or timeout). Resolves with the element or null.
export function waitFor(selector, { root = document, timeout = 30000 } = {}) {
  const found = root.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      const hit = root.querySelector(selector);
      if (hit) { obs.disconnect(); clearTimeout(timer); resolve(hit); }
    });
    obs.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
    const timer = setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export function pickFile(accept = 'application/json,.json') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      file.text().then((text) => resolve({ name: file.name, text }), () => resolve(null));
    });
    document.body.append(input);
    input.click();
  });
}

// Like node.replaceChildren(), but skips null/false (replaceChildren would insert the text "null").
export function setChildren(node, ...kids) {
  node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}
