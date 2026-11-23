#!/usr/bin/env node
// Writes what the real Earth is like under the whole game world (see
// src/world/earth.js): its land and sea, how high and how deep, where the
// coasts are, how rugged it is, and its climate.
//
//   npm run earth [-- --preview earth.png]
//
// From AWS Terrain Tiles (the whole globe at zoom 5, about 5 km a pixel at the
// equator, the seabed too) and the Köppen-Geiger climate map (Kottek et al.
// 2006, half a degree). Writes src/world/earth/, a file for each tile 15°
// square and one for the climate, listed in src/world/earthTiles.js; the game
// fetches each the first time something near it is grown.
//
// And round the start, and round each hike (src/world/hikes.js), the land
// finer (DETAIL in earth.js: a height every 15" of arc, about 460 m, from
// tiles at zoom 10), DETAIL.start km about the start and DETAIL.reach about a
// hike, where the valleys and the coast are seen close: a box of its own,
// shared by hikes near enough to overlap (and the start's, by those near it).
//
// Like the hikes, the Earth is part of what every world grows: a world built
// in somewhere remembers it as it was there. So once worlds are kept on it,
// don't re-run this to change it: it's for adding to (a finer grid where it's
// wanted), not for reshaping what's there.
//
// Downloads are kept in node_modules/.cache/earth, so running it again is
// quick.

import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './hike/png.js';
import { mosaic, seaMask, cells, parseKoppen, W, H, CLIMATE_W, CLIMATE_H } from './earth/build.js';
import { encodeTile, encodeDetail, tileName, TILE_CELLS, TILE_DEGREES, DETAIL } from '../src/world/earth.js';
import { ORIGIN } from '../src/core/geo.js';
import { HIKES } from '../src/world/hikes.js';
import { tileXY, terrarium } from './hike/geo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/world/earth');
const REGISTRY = path.join(ROOT, 'src/world/earthTiles.js');
const CACHE = path.join(ROOT, 'node_modules/.cache/earth');
const ZOOM = 5;
const KOPPEN = 'http://koeppen-geiger.vu-wien.ac.at/data/Koeppen-Geiger-ASCII.zip';
const AT_ONCE = 16; // downloads at a time

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function fetchTo(file, url) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

// The one file in a zip, stored or deflated (Node only reads deflate raw).
async function unzipOne(buf) {
  const { inflateRawSync } = await import('node:zlib');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x04034b50) throw new Error('not a zip');
  const method = dv.getUint16(8, true);
  const size = dv.getUint32(18, true);
  const nameLen = dv.getUint16(26, true);
  const extra = dv.getUint16(28, true);
  const start = 30 + nameLen + extra;
  const body = buf.subarray(start, start + size);
  return method === 0 ? body : inflateRawSync(body);
}

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// ── Elevation ────────────────────────────────────────────────────────────────
const n = 2 ** ZOOM;
const want = [];
for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) want.push([tx, ty]);
let got = 0;
process.stdout.write(`elevation: ${want.length} tiles at zoom ${ZOOM}`);
for (let i = 0; i < want.length; i += AT_ONCE) {
  await Promise.all(
    want.slice(i, i + AT_ONCE).map(([tx, ty]) => fetchTo(path.join(CACHE, `terrarium-${ZOOM}-${tx}-${ty}.png`), `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`).then(() => got++)),
  );
}
process.stdout.write(` (${got} here)\n`);
const m = mosaic(ZOOM, (tx, ty) => decodePng(fs.readFileSync(path.join(CACHE, `terrarium-${ZOOM}-${tx}-${ty}.png`))));
const sea = seaMask(m);
const grid = cells(m, sea);

// ── Climate ──────────────────────────────────────────────────────────────────
const zipFile = path.join(CACHE, 'koppen-ascii.zip');
await fetchTo(zipFile, KOPPEN);
const climate = parseKoppen(new TextDecoder().decode(await unzipOne(fs.readFileSync(zipFile))));

// ── Writing it ───────────────────────────────────────────────────────────────
const b64 = (bytes) => deflateRawSync(bytes, { level: 9 }).toString('base64');
const where = (ti, tj) => {
  const lat = 90 - tj * TILE_DEGREES;
  const lon = -180 + ti * TILE_DEGREES;
  const ns = (v) => `${Math.abs(v)}° ${v >= 0 ? 'N' : 'S'}`;
  const ew = (v) => `${Math.abs(v)}° ${v >= 0 ? 'E' : 'W'}`;
  return `${ns(lat - TILE_DEGREES)}–${ns(lat)}, ${ew(lon)}–${ew(lon + TILE_DEGREES)}`;
};
const names = [];
let bytes = 0;
for (let tj = 0; tj < H / TILE_CELLS; tj++) {
  for (let ti = 0; ti < W / TILE_CELLS; ti++) {
    const pick = (src) => {
      const a = new Float32Array(TILE_CELLS * TILE_CELLS);
      for (let j = 0; j < TILE_CELLS; j++) for (let i = 0; i < TILE_CELLS; i++) a[j * TILE_CELLS + i] = src[(tj * TILE_CELLS + j) * W + ti * TILE_CELLS + i];
      return a;
    };
    const name = tileName(ti, tj);
    const text = b64(encodeTile({ land: pick(grid.land), sea: pick(grid.sea), coast: pick(grid.coast), relief: pick(grid.relief) }));
    bytes += text.length;
    names.push(name);
    fs.writeFileSync(
      path.join(OUT, `${name}.js`),
      `// One tile of the real Earth under the game world (src/world/earth.js):\n// ${where(ti, tj)}, as \`npm run earth\` wrote it. Fetched the first time\n// something on it is grown.\n//\n// Elevation: AWS Terrain Tiles (ETOPO1, SRTM and others).\n\nexport default ${JSON.stringify(text)};\n`,
    );
  }
}
// ── Finer round the start and the hikes ──────────────────────────────────────
// A box round the start and one for each hike, those that overlap made one
// (named for the first), snapped to the finer grid.
const P = DETAIL.perDegree;
const boxAbout = (name, c, km) => {
  const dlat = km / 111.2;
  const dlon = dlat / Math.cos((c.lat * Math.PI) / 180);
  return { name, s: c.lat - dlat, w: c.lon - dlon, n: c.lat + dlat, e: c.lon + dlon };
};
let boxes = [boxAbout('d-start', ORIGIN, DETAIL.start), ...HIKES.map((h) => boxAbout(`d-${h.id}`, h.middle || h.photo, DETAIL.reach))];
for (let merged = true; merged; ) {
  merged = false;
  for (let a = 0; a < boxes.length && !merged; a++) {
    for (let b = a + 1; b < boxes.length && !merged; b++) {
      const [A, B] = [boxes[a], boxes[b]];
      if (A.s > B.n || B.s > A.n || A.w > B.e || B.w > A.e) continue;
      boxes[a] = { name: A.name, s: Math.min(A.s, B.s), w: Math.min(A.w, B.w), n: Math.max(A.n, B.n), e: Math.max(A.e, B.e) };
      boxes.splice(b, 1);
      merged = true;
    }
  }
}
boxes = boxes.map((b) => ({ ...b, s: Math.floor(b.s * P) / P, w: Math.floor(b.w * P) / P, n: Math.ceil(b.n * P) / P, e: Math.ceil(b.e * P) / P }));
const DZ = DETAIL.zoom;
const detailTiles = new Map();
async function detailTile(tx, ty) {
  const k = `${tx}/${ty}`;
  if (!detailTiles.has(k)) {
    const file = path.join(CACHE, `terrarium-${DZ}-${tx}-${ty}.png`);
    await fetchTo(file, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DZ}/${tx}/${ty}.png`);
    detailTiles.set(k, decodePng(fs.readFileSync(file)));
  }
  return detailTiles.get(k);
}
// Water at or under the sea's level in a patch of fewer than WATER_LEAST
// cells (a few square kilometres) is a low field, not a bay: at 460 m a
// cell, a marsh is a scatter of single cells either side of nothing, and
// each would be a pond. Likewise land in a patch of fewer than LAND_LEAST,
// out in the water, is water. What's left is the real lakes, bays and
// bayous, and the land between them.
const WATER_LEAST = 12;
const LAND_LEAST = 6;
function tidy(elev, w, h) {
  for (const [water, least, to] of [[true, WATER_LEAST, 1], [false, LAND_LEAST, -1]]) {
    const is = (k) => (elev[k] <= 0) === water;
    const seen = new Uint8Array(w * h);
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || !is(start)) continue;
      const patch = [start];
      seen[start] = 1;
      for (let q = 0; q < patch.length; q++) {
        const k = patch[q];
        const i = k % w;
        for (const n of [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k + w < w * h ? k + w : -1]) {
          if (n < 0 || seen[n] || !is(n)) continue;
          seen[n] = 1;
          patch.push(n);
        }
      }
      if (patch.length < least) for (const k of patch) elev[k] = to;
    }
  }
}
const details = [];
for (const b of boxes) {
  const W2 = Math.round((b.e - b.w) * P);
  const H2 = Math.round((b.n - b.s) * P);
  const [tx0, ty0] = tileXY(b.n, b.w, DZ).map(Math.floor);
  const [tx1, ty1] = tileXY(b.s, b.e, DZ).map(Math.floor);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) await detailTile(tx, ty);
  // each cell's height, between the pixels round its middle
  const px = (X, Y) => {
    const tx = Math.floor(X / 256);
    const ty = Math.floor(Y / 256);
    const img = detailTiles.get(`${tx}/${ty}`);
    const o = ((Y - ty * 256) * 256 + (X - tx * 256)) * img.channels;
    return terrarium(img.data[o], img.data[o + 1], img.data[o + 2]);
  };
  const elev = new Float32Array(W2 * H2);
  for (let j = 0; j < H2; j++) {
    for (let i = 0; i < W2; i++) {
      const [fx, fy] = tileXY(b.n - (j + 0.5) / P, b.w + (i + 0.5) / P, DZ).map((v) => v * 256 - 0.5);
      const X = Math.floor(fx);
      const Y = Math.floor(fy);
      const [u, v] = [fx - X, fy - Y];
      elev[j * W2 + i] = (px(X, Y) * (1 - u) + px(X + 1, Y) * u) * (1 - v) + (px(X, Y + 1) * (1 - u) + px(X + 1, Y + 1) * u) * v;
    }
  }
  tidy(elev, W2, H2);
  const text = b64(encodeDetail(elev, W2, H2));
  bytes += text.length;
  details.push({ name: b.name, box: [b.s, b.w, b.n, b.e].map((v) => Math.round(v * P) / P), w: W2, h: H2 });
  const inside = (c) => c.lat >= b.s && c.lat <= b.n && c.lon >= b.w && c.lon <= b.e;
  const where = [...(inside(ORIGIN) ? ['the start, in the Hoh rain forest'] : []), ...HIKES.filter((h) => inside(h.middle || h.photo)).map((h) => h.name)];
  fs.writeFileSync(
    path.join(OUT, `${b.name}.js`),
    `// The real Earth finer, round ${where.join(', ')} (src/world/earth.js):
// a height every ${3600 / P}" of arc, as \`npm run earth\` wrote it. Fetched the first
// time something on it is grown.
//
// Elevation: AWS Terrain Tiles (USGS 3DEP, SRTM and others).

export default ${JSON.stringify(text)};
`,
  );
}

const climateText = b64(climate.grid);
fs.writeFileSync(
  path.join(OUT, 'climate.js'),
  `// The climate of the real Earth (src/world/earth.js), as \`npm run earth\` wrote it:\n// the Köppen-Geiger class of every half degree, ${CLIMATE_W} × ${CLIMATE_H} from the\n// north-west, a byte each (its place in names), deflated.\n//\n// Kottek, M., J. Grieser, C. Beck, B. Rudolf, and F. Rubel, 2006: World Map of\n// the Köppen-Geiger climate classification updated. Meteorol. Z., 15, 259-263.\n\nexport default ${JSON.stringify({ names: climate.names, bytes: climateText })};\n`,
);
fs.writeFileSync(
  REGISTRY,
  `// The real Earth under the game world (world/earth.js), a tile 15° square at a\n// time, each fetched the first time something on it is grown (landforms.js).\n// Written by \`npm run earth\`: don't edit it by hand.\n\nexport const EARTH_TILES = {\n${names.map((nm) => `  ${nm}: () => import('./earth/${nm}.js'),`).join('\n')}\n};\n\nexport const CLIMATE = () => import('./earth/climate.js');\n\n// Finer, round the hikes: box [south, west, north, east] (degrees), w × h\n// heights from the north-west, DETAIL.perDegree to a degree (earth.js).\nexport const EARTH_DETAILS = {\n${details.map((d) => `  '${d.name}': { box: ${JSON.stringify(d.box)}, w: ${d.w}, h: ${d.h}, load: () => import('./earth/${d.name}.js') },`).join('\n')}\n};\n`,
);
console.log(`the Earth → src/world/earth/ (${names.length} tiles and ${details.length} finer round the hikes, ${(bytes / 1e6).toFixed(1)} MB; the climate, ${(climateText.length / 1e3).toFixed(0)} kB)`);

// ── A picture of it ──────────────────────────────────────────────────────────
const preview = opt('preview');
if (preview) {
  const S = 2; // cells to a pixel
  const pw = W / S;
  const ph = H / S;
  const rgb = new Uint8Array(pw * ph * 3);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const k = y * S * W + x * S;
      const d = grid.coast[k];
      const e = d >= 0 ? grid.land[k] : grid.sea[k];
      const o = (y * pw + x) * 3;
      if (d < 0) {
        const t = Math.min(1, -e / 5000);
        rgb.set([20, 60 - 40 * t, 120 - 70 * t], o);
      } else {
        const t = Math.min(1, e / 3500);
        const r = Math.min(1, grid.relief[k] / 600);
        rgb.set([60 + 150 * t + 40 * r, 120 + 60 * t - 30 * r, 50 + 120 * t], o);
      }
    }
  }
  fs.writeFileSync(preview, encodePng(pw, ph, rgb));
  console.log(`a picture of it → ${preview}`);
}
