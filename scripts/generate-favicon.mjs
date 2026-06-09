#!/usr/bin/env node
/**
 * Generates public/favicon.ico (32x32, BMP-in-ICO) with the site logo:
 * an orange double circle (ring + dot) on a dark rounded background.
 * Dependency-free; run with `node scripts/generate-favicon.mjs`.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SIZE = 32;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'favicon.ico');

// Colors (B, G, R, A)
const BG = [23, 15, 12, 255]; // #0c0f17
const ORANGE = [71, 179, 255, 255]; // #ffb347

const cx = (SIZE - 1) / 2;
const cy = (SIZE - 1) / 2;
const ringOuter = 9.5;
const ringInner = 7.0;
const dot = 4.2;
const cornerRadius = 7;

/** Coverage-based anti-aliasing via 4x4 supersampling per pixel. */
function pixel(x, y) {
  let bgHits = 0;
  let fgHits = 0;
  const S = 4;
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      const px = x + (sx + 0.5) / S - 0.5;
      const py = y + (sy + 0.5) / S - 0.5;

      // Rounded-rect background test
      const rx = Math.max(Math.abs(px - cx) - (SIZE / 2 - cornerRadius), 0);
      const ry = Math.max(Math.abs(py - cy) - (SIZE / 2 - cornerRadius), 0);
      const inRect = Math.hypot(rx, ry) <= cornerRadius;
      if (!inRect) continue;
      bgHits++;

      const d = Math.hypot(px - cx, py - cy);
      if ((d <= ringOuter && d >= ringInner) || d <= dot) fgHits++;
    }
  }
  const total = S * S;
  if (bgHits === 0) return [0, 0, 0, 0];
  const fg = fgHits / total;
  const bgAlpha = bgHits / total;
  return [
    Math.round(ORANGE[0] * fg + BG[0] * (1 - fg)),
    Math.round(ORANGE[1] * fg + BG[1] * (1 - fg)),
    Math.round(ORANGE[2] * fg + BG[2] * (1 - fg)),
    Math.round(255 * bgAlpha),
  ];
}

// Build BMP (BITMAPINFOHEADER + 32bpp BGRA rows bottom-up + AND mask)
const headerSize = 40;
const pixelBytes = SIZE * SIZE * 4;
const maskRowBytes = Math.ceil(SIZE / 32) * 4;
const maskBytes = maskRowBytes * SIZE;
const bmp = Buffer.alloc(headerSize + pixelBytes + maskBytes);
bmp.writeUInt32LE(headerSize, 0);
bmp.writeInt32LE(SIZE, 4);
bmp.writeInt32LE(SIZE * 2, 8); // height doubled for ICO (XOR + AND masks)
bmp.writeUInt16LE(1, 12);
bmp.writeUInt16LE(32, 14);
bmp.writeUInt32LE(0, 16);
bmp.writeUInt32LE(pixelBytes + maskBytes, 20);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const [b, g, r, a] = pixel(x, y);
    const off = headerSize + ((SIZE - 1 - y) * SIZE + x) * 4;
    bmp[off] = b;
    bmp[off + 1] = g;
    bmp[off + 2] = r;
    bmp[off + 3] = a;
  }
}
// AND mask left all-zero (fully opaque where alpha says so).

// ICO container
const ico = Buffer.alloc(6 + 16 + bmp.length);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // count
ico.writeUInt8(SIZE, 6); // width
ico.writeUInt8(SIZE, 7); // height
ico.writeUInt8(0, 8); // palette
ico.writeUInt8(0, 9); // reserved
ico.writeUInt16LE(1, 10); // planes
ico.writeUInt16LE(32, 12); // bpp
ico.writeUInt32LE(bmp.length, 14); // data size
ico.writeUInt32LE(22, 18); // data offset
bmp.copy(ico, 22);

await writeFile(OUT, ico);
console.log(`Wrote ${OUT} (${ico.length} bytes)`);
