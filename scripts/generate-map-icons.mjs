// Draws the map marker icons used by Petal Maps (HUAWEI Map Kit), which can only show
// image files as markers, into assets/map-icons/*.png. Same shapes as the SVG/View icons
// in src/components/map/MapIcons.tsx. No dependencies: shapes are rasterized here with
// 4×4 supersampling and written with Node's zlib.
//
//   node scripts/generate-map-icons.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'assets', 'map-icons');
const SS = 4;

const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

// ─── Shapes (in the icon's own design units) ───────────────────────────────────

const circle = (cx, cy, r, color) => ({ color, hit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r });
const rrect = (x, y, w, h, r, color) => ({
  color,
  hit: (px, py) => {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    const dx = Math.max(x + r - px, 0, px - (x + w - r));
    const dy = Math.max(y + r - py, 0, py - (y + h - r));
    return dx * dx + dy * dy <= r * r;
  },
});
const tri = (a, b, c) => (px, py) => {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = s([px, py], a, b), d2 = s([px, py], b, c), d3 = s([px, py], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
/** A map pin: round head and a point at the bottom (tip = exact location). */
const drop = (cx, cy, r, tipY, color) => {
  const head = circle(cx, cy, r, color).hit;
  const point = tri([cx - r * 0.8, cy + r * 0.55], [cx + r * 0.8, cy + r * 0.55], [cx, tipY]);
  return { color, hit: (x, y) => head(x, y) || point(x, y) };
};

// ─── Rendering ─────────────────────────────────────────────────────────────────

function render(width, height, units, shapes) {
  const k = units / width; // design units per pixel
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) * k, uy = (y + (sy + 0.5) / SS) * k;
          // Painter's algorithm with "over" compositing, premultiplied.
          let cr = 0, cg = 0, cb = 0, ca = 0;
          for (const s of shapes) {
            if (!s.hit(ux, uy)) continue;
            const [sr, sg, sb, sa] = s.color;
            cr = sr * sa + cr * (1 - sa); cg = sg * sa + cg * (1 - sa); cb = sb * sa + cb * (1 - sa);
            ca = sa + ca * (1 - sa);
          }
          r += cr; g += cg; b += cb; a += ca;
        }
      }
      const n = SS * SS, i = (y * width + x) * 4;
      const alpha = a / n;
      px[i] = alpha ? Math.round(r / n / alpha) : 0;
      px[i + 1] = alpha ? Math.round(g / n / alpha) : 0;
      px[i + 2] = alpha ? Math.round(b / n / alpha) : 0;
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return png(width, height, px);
}

// ─── PNG encoding ──────────────────────────────────────────────────────────────

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

const WHITE = hex('#ffffff');
const truck = () => render(132, 132, 44, [
  circle(22, 22, 20, hex('#0F6E56', 0.18)),
  rrect(13, 5, 18, 13, 5, WHITE), rrect(14, 6, 16, 11, 4, hex('#0F6E56')),
  rrect(16.5, 8, 11, 4, 1.5, hex('#bdf0dd')),
  rrect(12, 15, 20, 24, 4, WHITE), rrect(13, 16, 18, 22, 3, hex('#1D9E75')),
  ...[20.2, 25.2, 30.2].map((y) => rrect(17, y, 10, 1.6, 0.8, hex('#ffffff', 0.7))),
]);
const pin = (color, glow) => render(102, 126, 34, [
  ...(glow ? [circle(17, 17.5, 16, hex(color, 0.22))] : []),
  drop(17, 17.5, 12.5, 41.5, WHITE),
  drop(17, 17.5, 10, 38, hex(color)),
  circle(17, 17.5, 4, WHITE),
]);

const ICONS = {
  'truck.png': truck,
  'pin-critical.png': () => pin('#EF4444', true),
  'pin-high.png': () => pin('#F97316', true),
  'pin-moderate.png': () => pin('#EAB308', false),
  'pin-low.png': () => pin('#22C55E', false),
  'pin-site.png': () => pin('#EF4444', true),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, draw] of Object.entries(ICONS)) {
  fs.writeFileSync(path.join(OUT, name), draw());
  console.log('wrote', path.join('assets', 'map-icons', name));
}
