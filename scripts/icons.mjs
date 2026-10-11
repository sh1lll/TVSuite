// Generates the extension icons (no binary assets in the repo). Minimal PNG encoder via zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x, y, size); const i = y * (size * 4 + 1) + 1 + x * 4; raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Flat blue tile with three candles (TradingView green and red would clash with the brand colour, so they are white).
function pixel(x, y, n) {
  const u = (x + 0.5) / n, v = (y + 0.5) / n, r = 0.16, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
  const d = Math.hypot(u - cx, v - cy);
  if (d > r) return [0, 0, 0, 0];
  const edge = Math.max(0, Math.min(1, (r - d) * n));
  let col = [41, 98, 255];
  const candles = [[0.3, 0.42, 0.74], [0.5, 0.28, 0.72], [0.7, 0.2, 0.6]];
  for (const [cx2, top, bot] of candles) {
    if (Math.abs(u - cx2) < 0.065 && v > top && v < bot) col = [255, 255, 255];
    else if (Math.abs(u - cx2) < 0.018 && v > top - 0.09 && v < bot + 0.09) col = [255, 255, 255];
  }
  return [...col, Math.round(255 * edge)];
}
export function writeIcons(dir) {
  mkdirSync(dir, { recursive: true });
  for (const s of [16, 32, 48, 128]) writeFileSync(`${dir}/${s}.png`, png(s, pixel));
}
if (import.meta.url === `file://${process.argv[1]}`) writeIcons(process.argv[2] || 'dist/extension/icons');
