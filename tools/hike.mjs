#!/usr/bin/env node
// Puts a hike you've done into the game, from a photo you took on it.
//
//   npm run hike -- path/to/photo.heic [--name "Mount Storm King"]
//
// The photo says where it was taken (GPS), which way it looked and at what
// hour. From that this fetches the real shape of the land for a few
// kilometres around (AWS Terrain Tiles) and the trails and lakes on it
// (OpenStreetMap), and writes the hike to src/world/hikes/, listed in
// src/world/hikes.js. In the game, K takes you to its trailhead, and the
// walk ends where you stood to take the photo.
//
// Options (real-world metres unless it says otherwise):
//   --name "…"        what to call it (default: the nearest named peak, or the trail)
//   --id slug         its file name (default: from the name)
//   --scale 0.2       game metres per real metre
//   --radius 4000     how much real land around the photo
//   --fade 1000       over how much it gives way to the forest
//   --cell 30         spacing of the heights
//   --cover 0.85      how thickly wooded, 0..1
//   --species 0.6     -1 broadleaf .. 1 conifers
//   --at x,z          where in the game world (game metres; default: a free spot)
//   --lat, --lon, --bearing, --hour   if the photo doesn't say
//   --force           re-import a hike that's already there (it stays put)
//   --preview file    where to write a picture of what was imported
//
// Downloads are kept in node_modules/.cache/hike, so a re-import is quick.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPhoto } from './hike/exif.js';
import { decodePng, encodePng } from './hike/png.js';
import { localFrame, tileXY, terrarium, metresPerDegree } from './hike/geo.js';
import { parseOsm, mergeOsm, trails, waters, peaks, incompleteWaters } from './hike/osm.js';
import { buildHike, splitHike, DEFAULTS } from './hike/build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIKES_DIR = path.join(ROOT, 'src/world/hikes');
const REGISTRY = path.join(ROOT, 'src/world/hikes.js');
const CACHE = path.join(ROOT, 'node_modules/.cache/hike');
const ZOOM = 13; // elevation tiles: about 13 m a pixel at 48° north
const AGENT = 'my-world hike importer (a three.js game; occasional one-off imports)';
// Where hikes go in the world: no nearer the middle than this (game m), so
// the forest people have built in around where they start is left alone…
const FIRST_RING = 3200;
// …and this far apart, edge to edge.
const APART = 400;

// ── Arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = {};
const files = [];
for (let k = 0; k < argv.length; k++) {
  const a = argv[k];
  if (!a.startsWith('--')) files.push(a);
  else if (a === '--force') flags.force = true;
  else flags[a.slice(2)] = argv[++k];
}
if (files.length !== 1) {
  console.log('usage: npm run hike -- <photo.heic|jpg> [--name "…"] [options]   (see tools/hike.mjs)');
  process.exit(1);
}
const num = (k, d) => (flags[k] !== undefined ? Number(flags[k]) : d);

// ── The photo ────────────────────────────────────────────────────────────────
let photo = { lat: null, lon: null, bearing: null, hour: null };
try {
  photo = readPhoto(fs.readFileSync(files[0]));
} catch (err) {
  console.warn(`${files[0]}: ${err.message}`);
}
photo = { ...photo, lat: num('lat', photo.lat), lon: num('lon', photo.lon), bearing: num('bearing', photo.bearing), hour: num('hour', photo.hour) };
if (photo.lat === null || photo.lon === null) {
  console.error("The photo doesn't say where it was taken. Pass --lat and --lon.");
  process.exit(1);
}
console.log(`photo: ${photo.lat.toFixed(5)}, ${photo.lon.toFixed(5)}${photo.bearing !== null ? `, looking ${Math.round(photo.bearing)}°` : ''}${photo.hour !== null ? `, at ${fmtHour(photo.hour)}` : ''}`);

const opt = {
  scale: num('scale', DEFAULTS.scale),
  radius: num('radius', DEFAULTS.radius),
  fade: num('fade', DEFAULTS.fade),
  cell: num('cell', DEFAULTS.cell),
  trees: { cover: num('cover', DEFAULTS.trees.cover), species: num('species', DEFAULTS.trees.species) },
};

// ── Fetching, kept ───────────────────────────────────────────────────────────
fs.mkdirSync(CACHE, { recursive: true });
async function cached(name, url, { text = false, ok = [200] } = {}) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return text ? fs.readFileSync(file, 'utf8') : fs.readFileSync(file);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (!ok.includes(res.status)) {
        const err = new Error(`${res.status} from ${url}`);
        err.status = res.status;
        throw err;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(file, buf);
      return text ? buf.toString('utf8') : buf;
    } catch (err) {
      if (err.status || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

// ── Elevation ────────────────────────────────────────────────────────────────
const frame = localFrame(photo.lat, photo.lon);
const reach = opt.radius + opt.fade + opt.cell * 2;
const [north, west] = frame.toLatLon(-reach, reach);
const [south, east] = frame.toLatLon(reach, -reach);
const [tx0, ty0] = tileXY(north, west, ZOOM).map(Math.floor);
const [tx1, ty1] = tileXY(south, east, ZOOM).map(Math.floor);
const tiles = new Map();
process.stdout.write(`elevation: ${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} tiles`);
for (let ty = ty0; ty <= ty1; ty++) {
  for (let tx = tx0; tx <= tx1; tx++) {
    const png = await cached(`terrarium-${ZOOM}-${tx}-${ty}.png`, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`);
    tiles.set(`${tx}/${ty}`, decodePng(png));
    process.stdout.write('.');
  }
}
console.log();
const px = (X, Y) => {
  const t = tiles.get(`${Math.floor(X / 256)}/${Math.floor(Y / 256)}`);
  if (!t) return NaN;
  const i = ((Y & 255) * 256 + (X & 255)) * t.channels;
  return terrarium(t.data[i], t.data[i + 1], t.data[i + 2]);
};
function elevation(lat, lon) {
  const [x, y] = tileXY(lat, lon, ZOOM);
  const fx = x * 256 - 0.5;
  const fy = y * 256 - 0.5;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const u = fx - i;
  const v = fy - j;
  return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v;
}

// ── OpenStreetMap ────────────────────────────────────────────────────────────
// The API answers a box with up to 50 000 nodes; a busier box is asked for in
// quarters.
async function osmBox(w, s, e, n, depth = 0) {
  const bbox = [w, s, e, n].map((v) => v.toFixed(5)).join(',');
  try {
    return [parseOsm(await cached(`osm-${bbox}.xml`, `https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`, { text: true }))];
  } catch (err) {
    if (err.status !== 400 || depth > 3) throw err;
    const mx = (w + e) / 2;
    const my = (s + n) / 2;
    const parts = [];
    for (const [a, b, c, d] of [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]]) parts.push(...(await osmBox(a, b, c, d, depth + 1)));
    return parts;
  }
}
const inner = opt.radius;
const [oN, oW] = frame.toLatLon(-inner, inner);
const [oS, oE] = frame.toLatLon(inner, -inner);
process.stdout.write('trails and lakes: ');
let osm = mergeOsm(await osmBox(oW, oS, oE, oN));
for (const id of incompleteWaters(osm)) osm = mergeOsm([osm, parseOsm(await cached(`osm-relation-${id}.xml`, `https://api.openstreetmap.org/api/0.6/relation/${id}/full`, { text: true }))]);
const ts = trails(osm);
const ws = waters(osm);
console.log(`${ts.length} paths, ${ws.length} lakes and ponds`);

// ── Its name ─────────────────────────────────────────────────────────────────
// What it's called: as you say, or the nearest named peak, or the trail the
// photo was taken on.
const m = metresPerDegree(photo.lat);
const away = ([lat, lon]) => Math.hypot((lat - photo.lat) * m.lat, (lon - photo.lon) * m.lon);
let name = flags.name;
if (!name) {
  const peak = peaks(osm)
    .map((p) => ({ ...p, d: away([p.lat, p.lon]) }))
    .filter((p) => p.d < 2500)
    .sort((a, b) => a.d - b.d)[0];
  name = peak ? peak.name : null;
}
if (!name) {
  const trail = ts
    .filter((t) => t.name)
    .map((t) => ({ name: t.name, d: Math.min(...t.points.map(away)) }))
    .filter((t) => t.d < 150)
    .sort((a, b) => a.d - b.d)[0];
  name = trail ? trail.name : 'A hike';
}
const id = flags.id || (name || 'hike').toLowerCase().normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');

// ── Where it goes ────────────────────────────────────────────────────────────
fs.mkdirSync(HIKES_DIR, { recursive: true });
const existing = fs.existsSync(REGISTRY) ? (await import(pathToFileURL(REGISTRY).href)).HIKES : [];
const already = existing.find((h) => h.id === id);
if (already && !flags.force) {
  console.error(`There is already a hike called ${id}. Pass --force to import it again (it stays where it is), or --id to keep both.`);
  process.exit(1);
}
const outer = (opt.radius + opt.fade) * opt.scale;
let at;
if (flags.at) at = flags.at.split(',').map(Number);
else if (already) at = already.at;
else at = freeSpot(existing.filter((h) => h.id !== id), outer);

// ── Build it ─────────────────────────────────────────────────────────────────
const { def, preview } = buildHike({ id, name, photo, elevation, trails: ts, waters: ws, at, ...opt });
const { card, land } = splitHike(def);
const module = `// The land of ${def.name}, as \`npm run hike\` imported it from a photo taken
// there: fetched the first time it's needed (src/world/landforms.js). Its card is
// in src/world/hikes.js. Re-import it rather than edit it here (see
// src/world/landform.js for what the parts are).
//
// The shape of the land: AWS Terrain Tiles (USGS 3DEP and others).
// Trails and lakes: © OpenStreetMap contributors, under the ODbL.

export default ${JSON.stringify(land)};
`;
fs.writeFileSync(path.join(HIKES_DIR, `${id}.js`), module);
// the others as they were (read whole, from before cards had a list of
// their own, or as cards), this one new or in its old place
const cards = existing.map(({ load, ...h }) => splitHike(h).card);
if (already) cards[cards.findIndex((c) => c.id === id)] = card;
else cards.push(card);
writeRegistry(cards);

const previewFile = flags.preview || path.join(os.tmpdir(), `hike-${id}.png`);
fs.writeFileSync(previewFile, encodePng(preview.width, preview.height, preview.rgb));

console.log(`\n${def.name} → src/world/hikes/${id}.js (${Math.round(module.length / 1024)} kB, fetched when it's needed)`);
console.log(`  at ${def.at[0]}, ${def.at[1]} in the world: the real land for ${Math.round(def.radius)} m round the photo, at 1 : ${Math.round(1 / def.scale)}`);
if (def.trail) console.log(`  the walk: ${def.trail.name || 'a trail'}, ${def.trail.length} m, climbing ${def.trail.climb} m`);
else console.log("  the photo wasn't taken on a trail; you'll arrive where it was taken");
console.log(`  lakes: ${def.lakes.map((l) => l.name || 'unnamed').join(', ') || 'none'}`);
console.log(`  a picture of it: ${previewFile}`);

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtHour(h) {
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
}

// The first spot, going out ring by ring from the middle of the world, that
// keeps clear of every other hike.
function freeSpot(others, r) {
  for (let d = Math.max(FIRST_RING, r + 2000); ; d += 400) {
    const steps = Math.max(6, Math.floor((2 * Math.PI * d) / 800));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const x = Math.round(Math.sin(a) * d);
      const z = Math.round(-Math.cos(a) * d);
      if (others.every((h) => Math.hypot(h.at[0] - x, h.at[1] - z) > h.radius + h.fade + r + APART)) return [x, z];
    }
  }
}

function writeRegistry(cards) {
  const text = `// Real hikes, set into the forest (see landform.js). Each was imported from a
// photo by \`npm run hike\`, which writes this file. To take one out, delete
// its entry here and its file in hikes/.
//
// Each is here as a card: what it is and where, a few hundred bytes. Its land
// (the heights, the lakes, the trails: about 200 kB) is in hikes/<id>.js,
// fetched the first time it's needed, not when the game starts (landforms.js).
//
// Where a hike sits is part of the world description, like the hills: a
// world someone has built in near one remembers it there. Re-importing keeps
// it where it is.

const hike = (card, load) => ({ ...card, load });

export const HIKES = [
${cards.map((c) => `  hike(${JSON.stringify(c)}, () => import('./hikes/${c.id}.js')),`).join('\n')}
];
`;
  fs.writeFileSync(REGISTRY, text);
}
