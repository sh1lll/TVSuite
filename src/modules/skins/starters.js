// Starter custom skins installed once into "My skins", so the library is never empty and shows what
// remixes look like. Remixes are built-in skins with custom params (no code to trust).
import { GALLERY } from '../../../gallery/skins.mjs';
import { validateSkin } from './packs.js';

const REMIXES = [
  { id: 'custom-midnight-aurora', name: 'Midnight Aurora', base: 'aurora', params: { hue: 215, spread: 26, bands: 3, speed: 0.6, bg: '#03050c' } },
  { id: 'custom-tokyo-rain', name: 'Tokyo Rain', base: 'rain-neon', params: { drops: 420, hueA: 330, hueB: 205, wind: -0.35 } },
  { id: 'custom-deep-space', name: 'Deep Space', base: 'starfield', params: { count: 900, speed: 0.5, hue: 255, bg: '#010104' } },
  { id: 'custom-mint-network', name: 'Mint Network', base: 'plexus', params: { count: 90, hue: 160, link: 0.17, speed: 0.7 } },
  { id: 'custom-vaporwave', name: 'Vaporwave', base: 'synthwave', params: { hue: 275, speed: 0.6, lines: 22 } },
];

export function starterSkins() {
  const remixes = REMIXES.map((r) => ({ schema: 'tvsuite.skin/1', kind: 'builtin', author: 'TVSuite', tags: ['custom', 'starter'], description: `Remix of ${r.base}`, ...r }));
  const gallery = GALLERY.map((g) => validateSkin(g).skin).filter(Boolean);
  return [...remixes, ...gallery];
}
