// Skin packs: a skin is a small JSON document (parameters, palette, optional code) that can be
// shared as a file or as a compact link. Pure logic, no DOM.

export const PACK_SCHEMA = 'tvsuite.skin/1';
export const LINK_PREFIX = 'TVSKIN1.';
export const MAX_CODE_CHARS = 64 * 1024;
export const MAX_PACK_CHARS = 256 * 1024;

export const KINDS = ['builtin', 'canvas', 'shader', 'media'];

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function slugify(name) {
  return String(name || 'skin').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'skin';
}

// Validate and normalize a skin pack. Returns { ok, errors, skin }.
// "canvas" (generated JS) and "shader" (GLSL) skins carry code; it is only ever executed
// inside the sandboxed skin worker, never in the TradingView page.
export function validateSkin(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Skin must be a JSON object'], skin: null };
  const skin = {
    schema: PACK_SCHEMA,
    id: typeof input.id === 'string' && ID_RE.test(input.id) ? input.id : slugify(input.name),
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : 'Untitled skin',
    author: typeof input.author === 'string' ? input.author.slice(0, 80) : '',
    description: typeof input.description === 'string' ? input.description.slice(0, 500) : '',
    kind: input.kind,
    params: {},
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string').map((t) => t.slice(0, 24)).slice(0, 12) : [],
  };
  if (input.schema && input.schema !== PACK_SCHEMA) errors.push(`Unsupported schema "${input.schema}" (expected ${PACK_SCHEMA})`);
  if (!KINDS.includes(input.kind)) errors.push(`kind must be one of ${KINDS.join(', ')}`);

  if (input.params != null) {
    if (typeof input.params !== 'object' || Array.isArray(input.params)) errors.push('params must be an object');
    else {
      for (const [k, v] of Object.entries(input.params)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(k)) { errors.push(`param name "${k}" is invalid`); continue; }
        if (typeof v === 'number' && Number.isFinite(v)) skin.params[k] = v;
        else if (typeof v === 'boolean') skin.params[k] = v;
        else if (typeof v === 'string' && v.length <= 200) skin.params[k] = v;
        else if (Array.isArray(v) && v.length <= 16 && v.every((x) => typeof x === 'string' || typeof x === 'number')) skin.params[k] = v.slice();
        else errors.push(`param "${k}" must be a number, boolean, short string or short array`);
      }
    }
  }

  switch (input.kind) {
    case 'builtin':
      if (typeof input.base !== 'string' || !ID_RE.test(input.base)) errors.push('builtin skins need a "base" builtin id');
      else skin.base = input.base;
      break;
    case 'canvas':
      if (typeof input.code !== 'string' || !input.code.trim()) errors.push('canvas skins need "code" (JavaScript defining draw(ctx, api))');
      else if (input.code.length > MAX_CODE_CHARS) errors.push(`code is larger than ${MAX_CODE_CHARS} characters`);
      else if (!/\bfunction\s+draw\s*\(|\bdraw\s*=\s*(\(|function|async)/.test(input.code)) errors.push('code must define a draw(ctx, api) function');
      else skin.code = input.code;
      break;
    case 'shader':
      if (typeof input.glsl !== 'string' || !/mainImage\s*\(/.test(input.glsl)) errors.push('shader skins need "glsl" defining mainImage(out vec4, in vec2)');
      else if (input.glsl.length > MAX_CODE_CHARS) errors.push(`glsl is larger than ${MAX_CODE_CHARS} characters`);
      else skin.glsl = input.glsl;
      break;
    case 'media':
      if (typeof input.url !== 'string' || !/^(https:\/\/|data:image\/|data:video\/|local:[a-z0-9]{4,40}$)/.test(input.url)) errors.push('media skins need an https:, data:image/video or local: URL');
      else skin.url = input.url;
      skin.fit = ['cover', 'contain', 'fill'].includes(input.fit) ? input.fit : 'cover';
      break;
    default:
      break;
  }

  if (input.reactive && typeof input.reactive === 'object') {
    skin.reactive = {};
    for (const k of ['intensity', 'speed', 'hue']) {
      if (typeof input.reactive[k] === 'number' && Number.isFinite(input.reactive[k])) skin.reactive[k] = Math.max(0, Math.min(2, input.reactive[k]));
    }
  }
  return { ok: errors.length === 0, errors, skin: errors.length ? null : skin };
}

// Does this skin carry executable code (needs a trust prompt before first run)?
export function hasCode(skin) { return skin?.kind === 'canvas' || skin?.kind === 'shader'; }

// ---- Link encoding: "TVSKIN1." + base64url(deflate-raw(JSON)) --------------------------------

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeSkin(skin) {
  const { ok, errors, skin: clean } = validateSkin(skin);
  if (!ok) throw new Error(errors.join('; '));
  const json = new TextEncoder().encode(JSON.stringify(clean));
  return LINK_PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

// Accepts a raw code, a URL containing "#tvskin=<code>", or a pasted JSON document.
export async function decodeSkin(text) {
  const raw = String(text || '').trim();
  if (raw.length > MAX_PACK_CHARS * 2) throw new Error('Skin data is too large');
  let obj;
  if (raw.startsWith('{')) {
    obj = JSON.parse(raw);
  } else {
    const m = raw.match(/TVSKIN1\.([A-Za-z0-9_-]+)/);
    if (!m) throw new Error('Not a TVSuite skin link or JSON');
    const bytes = await pipe(fromBase64Url(m[1]), new DecompressionStream('deflate-raw'));
    if (bytes.length > MAX_PACK_CHARS) throw new Error('Skin data is too large');
    obj = JSON.parse(new TextDecoder().decode(bytes));
  }
  const res = validateSkin(obj);
  if (!res.ok) throw new Error(res.errors.join('; '));
  return res.skin;
}

// Shareable link: the payload lives in the fragment, which browsers never send to the server.
export async function skinShareLink(skin, base = 'https://www.tradingview.com/chart/') {
  return `${base}#tvskin=${await encodeSkin(skin)}`;
}
