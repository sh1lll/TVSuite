// Prompt and response handling for generated skins. Pure logic (unit-tested); the provider
// calls live in src/ai/providers.js and only run in the extension's background worker.

export const SKIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'description', 'params', 'code'],
  properties: {
    name: { type: 'string', description: 'Short display name, at most 40 characters' },
    description: { type: 'string', description: 'One sentence describing the scene' },
    params: {
      type: 'object',
      description: 'Tunable numeric parameters (and #rrggbb color strings) read by the code as api.p.<name>',
      additionalProperties: { type: ['number', 'string'] },
    },
    code: { type: 'string', description: 'JavaScript source defining setup(api) (optional) and draw(ctx, api)' },
  },
};

export const SYSTEM_PROMPT = `You write animated background "skins" that render behind live trading charts.
A skin is a small JavaScript program that draws on a 2D canvas every frame.

Contract (the runtime calls these; define them as function declarations):
  function setup(api) { ... }     // optional, runs once per resize; initialise api.state here
  function draw(ctx, api) { ... }  // required, runs every frame
api fields:
  w, h          canvas size in device pixels (already scaled)
  t, dt         seconds since start, seconds since previous frame
  frame, dpr    frame counter, device pixel ratio (multiply line widths/sizes by it)
  p             the skin's params object (your "params" values, possibly user-tuned)
  state         a plain object that persists between frames
  s             live chart signals, all smoothed: s.intensity 0..1 (overall energy), s.range 0..1 (candle size),
                s.velocity 0..1 (price speed), s.dist -1..1 (below/above the day's open), s.calm 0..1 (calm mode active),
                s.pulse 0..1 (spikes at a market session change, then decays)
  lib           helpers: clamp, lerp, smoothstep, fract, rng(seed) -> () => [0,1), noise2(x,y), noise3(x,y,z), fbm(x,y,z,octaves),
                hsl(h,s,l,a) -> css string, rgba(r,g,b,a), hex('#rrggbb') -> [r,g,b], trendHue(dist), TAU

Rules:
- The canvas is opaque: paint the whole background every frame (or a translucent fill for trails).
- Keep it calm and dark enough that candles drawn on top stay readable; avoid bright full-screen flashes.
- Let the signals subtly modulate the scene (e.g. speed from s.velocity, glow from s.intensity, hue from s.dist).
- Performance: aim for under 4 ms per frame at 1920x1080. Use at most ~600 particles, no per-pixel loops on the
  full canvas (render small offscreen buffers and scale up if you need per-pixel effects).
- The code runs in an isolated worker: no DOM, no window/document, no network, no imports, no timers. Only ctx, api and Math.
- Do not reference variables outside setup/draw except constants you declare at top level.
- Use only the params you declare; give each a sensible default.
Return the result as JSON matching the provided schema.`;

export function userPrompt(description) {
  return `Create a skin for: ${String(description).slice(0, 500)}`;
}

// Extract a JSON object from model text (handles ```json fences and leading prose).
export function extractJson(text) {
  const s = String(text || '').trim();
  try { return JSON.parse(s); } catch (_) { /* fall through */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_) { /* fall through */ } }
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start !== -1 && end > start) return JSON.parse(s.slice(start, end + 1));
  throw new Error('Model response did not contain JSON');
}

// Light checks before the skin is offered to the user (full validation happens in packs.validateSkin).
export function checkGenerated(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Generated skin is not an object');
  if (typeof obj.code !== 'string' || !/\bfunction\s+draw\s*\(/.test(obj.code)) throw new Error('Generated code has no draw(ctx, api) function');
  const forbidden = obj.code.match(/\b(document|window|fetch|XMLHttpRequest|WebSocket|importScripts|localStorage|indexedDB|eval)\b/);
  if (forbidden) throw new Error(`Generated code references "${forbidden[1]}", which is not available to skins`);
  const params = {};
  for (const [k, v] of Object.entries(obj.params || {})) if (/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(k) && (typeof v === 'number' || typeof v === 'string')) params[k] = v;
  return { name: String(obj.name || 'Generated skin').slice(0, 40), description: String(obj.description || '').slice(0, 300), params, code: obj.code };
}
