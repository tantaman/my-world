#!/usr/bin/env node
// Puts a hike you've done into the game, from a photo you took on it.
//
//   npm run hike -- path/to/photo.heic [--name "Mount Storm King"]
//
// The photo says where it was taken (GPS), which way it looked and at what
// hour. From that this fetches the real shape of the land for a few
// kilometres around (AWS Terrain Tiles, or the USGS's own) and the trails and
// lakes on it, and the shore of the sea if it's by it (OpenStreetMap), and
// writes the hike to src/world/hikes/, listed in src/world/hikes.js. In the
// game, J lists it and takes you to its trailhead, and the walk ends where you
// stood to take the photo.
//
// Options (real-world metres unless it says otherwise):
//   --name "…"        what to call it (default: the nearest named peak, or the trail)
//   --id slug         its file name (default: from the name)
//   --scale 0.2       game metres per real metre
//   --radius 4000     how much real land around the photo
//   --fade 1000       over how much it gives way to the forest
//   --cell 30         spacing of the heights
//   --fine 5          and a finer grid of heights along the walk, this far
//                     apart, where you see the ground close: a narrow ridge
//                     stays narrow (unsaid, none)
//   --fine-margin 400 how far round the walk the finer grid reaches
//   --dem 3dep        heights from the USGS's 3DEP, lidar for most of the
//                     United States, in place of Terrain Tiles (hike/usgs.js)
//   --cover 0.85      how thickly wooded, 0..1
//   --species 0.6     -1 broadleaf .. 1 conifers
//   --country "…"     what kind of country it is (src/world/country.js): what
//                     the ground is made of, what grows and lives there, what
//                     the sky does. Unsaid, it's forest like the rest
//   --at x,z          where in the game world (game metres; default: where it
//                     really is, at the same scale, from the middle of the world
//                     in the Hoh rain forest: see hike/place.js)
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
import { blockOf, blockTiles, missing } from './hike/usgs.js';
import { parseOsm, mergeOsm, trails, waters, coastlines, roads, beaches, streams, peaks, incompleteWaters } from './hike/osm.js';
import { buildHike, splitHike, fineBox, DEFAULTS } from './hike/build.js';
import { placeHike } from './hike/place.js';
import { COUNTRY } from '../src/world/country.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIKES_DIR = path.join(ROOT, 'src/world/hikes');
const REGISTRY = path.join(ROOT, 'src/world/hikes.js');
const CACHE = path.join(ROOT, 'node_modules/.cache/hike');
// Elevation tiles: about 13 m a pixel at 48° north at zoom 13, and half that
// for each zoom more. Finer heights (--cell, --fine) want finer tiles.
const zoomFor = (cell) => (cell >= 25 ? 13 : cell >= 12 ? 14 : cell >= 6 ? 15 : 16);
// Where heights come from: AWS Terrain Tiles anywhere, or the USGS's 3DEP
// in the United States (hike/usgs.js).
const DEMS = ['terrain', '3dep'];
const AGENT = 'my-world hike importer (a three.js game; occasional one-off imports)';

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
if (flags.country !== undefined && !COUNTRY[flags.country]) {
  console.error(`There is no country called "${flags.country}". There is: ${Object.keys(COUNTRY).join(', ')}.`);
  process.exit(1);
}

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

const DEM = flags.dem || 'terrain';
if (!DEMS.includes(DEM)) {
  console.error(`There are heights from ${DEMS.join(' or ')}, not "${DEM}".`);
  process.exit(1);
}
const opt = {
  scale: num('scale', DEFAULTS.scale),
  radius: num('radius', DEFAULTS.radius),
  fade: num('fade', DEFAULTS.fade),
  cell: num('cell', DEFAULTS.cell),
  trees: { cover: num('cover', DEFAULTS.trees.cover), species: num('species', DEFAULTS.trees.species) },
  country: flags.country || null,
  // a finer grid along the walk: real metres between its heights, and how far round the walk
  fine: flags.fine !== undefined ? { cell: num('fine'), margin: num('fine-margin', DEFAULTS.fineMargin) } : null,
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
      // the network, or a busy server, is asked again; a plain no is final
      const busy = !err.status || err.status === 429 || err.status >= 500;
      if (!busy || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

// ── Elevation ────────────────────────────────────────────────────────────────
// Heights come as 256 px web-mercator tiles, Terrarium-coded: AWS Terrain
// Tiles, or with --dem 3dep the USGS's own (hike/usgs.js), fetched a block of
// tiles at a time and kept as tiles. Where 3DEP has nothing, Terrain Tiles
// fill in.
const TERRAIN_MAX = 15; // the finest zoom Terrain Tiles go to
const tileCache = new Map();
async function terrainTile(z, tx, ty) {
  const png = await cached(`terrarium-${z}-${tx}-${ty}.png`, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`);
  return decodePng(png);
}
async function usgsTile(z, tx, ty) {
  const file = path.join(CACHE, `usgs-${z}-${tx}-${ty}.png`);
  if (!fs.existsSync(file)) {
    const { bx, by, url } = blockOf(z, tx, ty);
    const bytes = await cached(`usgs-block-${z}-${bx}-${by}.tif`, url);
    for (const t of blockTiles(bytes, z, bx, by)) fs.writeFileSync(path.join(CACHE, `usgs-${z}-${t.tx}-${t.ty}.png`), encodePng(256, 256, t.rgb));
    // the block itself is 4 MB, and its tiles are kept: it needn't be
    fs.rmSync(path.join(CACHE, `usgs-block-${z}-${bx}-${by}.tif`));
  }
  return decodePng(fs.readFileSync(file));
}
// (lat, lon) -> metres, from the tiles at zoom z over [north, west, south,
// east], fetched first. NaN where the source has nothing.
async function heightsFrom(source, z, [north, west, south, east], what) {
  const [tx0, ty0] = tileXY(north, west, z).map(Math.floor);
  const [tx1, ty1] = tileXY(south, east, z).map(Math.floor);
  process.stdout.write(`${what}: ${(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} tiles${source === '3dep' ? ' from 3DEP' : ''}`);
  const tiles = new Map();
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const key = `${source}/${z}/${tx}/${ty}`;
      if (!tileCache.has(key)) tileCache.set(key, await (source === '3dep' ? usgsTile : terrainTile)(z, tx, ty));
      tiles.set(`${tx}/${ty}`, tileCache.get(key));
      process.stdout.write('.');
    }
  }
  console.log();
  const px = (X, Y) => {
    const t = tiles.get(`${Math.floor(X / 256)}/${Math.floor(Y / 256)}`);
    if (!t) return NaN;
    const i = ((Y & 255) * 256 + (X & 255)) * t.channels;
    const h = terrarium(t.data[i], t.data[i + 1], t.data[i + 2]);
    return missing(h) ? NaN : h;
  };
  return (lat, lon) => {
    const [x, y] = tileXY(lat, lon, z);
    const fx = x * 256 - 0.5;
    const fy = y * 256 - 0.5;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v;
  };
}
// The heights for a grid `cell` real metres apart, over a box (game metres
// round the photo): from 3DEP if asked, with Terrain Tiles where it has none.
async function elevationFor(cell, [x0, z0, x1, z1], what) {
  const pad = cell * 2;
  const [north, west] = frame.toLatLon(x0 / opt.scale - pad, -z0 / opt.scale + pad);
  const [south, east] = frame.toLatLon(x1 / opt.scale + pad, -z1 / opt.scale - pad);
  const box = [north, west, south, east];
  const terrain = await heightsFrom('terrain', Math.min(TERRAIN_MAX, zoomFor(cell)), box, what);
  if (DEM === 'terrain') return terrain;
  const usgs = await heightsFrom('3dep', zoomFor(cell), box, `${what}, finer`);
  return (lat, lon) => {
    const h = usgs(lat, lon);
    return Number.isNaN(h) ? terrain(lat, lon) : h;
  };
}
const frame = localFrame(photo.lat, photo.lon);
const reachG = (opt.radius + opt.fade) * opt.scale;
const elevation = await elevationFor(opt.cell, [-reachG, -reachG, reachG, reachG], 'elevation');

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
const coast = coastlines(osm);
console.log(`${ts.length} paths, ${ws.length} lakes and ponds${coast.length ? ', and the coast' : ''}`);

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
// Where it really is, at the same scale; once placed, it stays put.
const others = existing.filter((h) => h.id !== id).map(({ load, ...h }) => h);
let at;
let datum = null;
let placed = null;
if (already) ({ at, datum } = already);
else if (flags.at) at = flags.at.split(',').map(Number);
else {
  try {
    placed = placeHike({ photo, scale: opt.scale, radius: opt.radius * opt.scale, fade: opt.fade * opt.scale }, others);
  } catch (err) {
    console.error(`Can't put it there: ${err.message}.`);
    process.exit(1);
  }
  ({ at, datum } = placed);
}

// ── Build it ─────────────────────────────────────────────────────────────────
const parts = { id, name, photo, elevation, trails: ts, waters: ws, coast, roads: roads(osm), beaches: beaches(osm), streams: streams(osm), at, datum, ...opt };
let built = buildHike({ ...parts, fine: null });
// The finer grid goes where the walk goes, which is known now: its heights
// are fetched for there, and it is built again with them.
if (opt.fine) {
  const fineElevation = await elevationFor(opt.fine.cell, fineBox(built.walk, opt.fine, opt.scale, opt.radius * opt.scale), 'along the walk');
  built = buildHike({ ...parts, fineElevation });
}
const { def, preview } = built;
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
const F = def.ground.fine;
if (F) console.log(`  along the walk, heights every ${Math.round((F.cell / def.scale) * 10) / 10} m for ${Math.round(((F.w - 1) * F.cell) / def.scale)} × ${Math.round(((F.h - 1) * F.cell) / def.scale)} m${DEM === '3dep' ? ', from 3DEP' : ''}`);
console.log(`  at ${def.at[0]}, ${def.at[1]} in the world, ${Math.round(Math.hypot(...def.at) / def.scale / 1000)} km from the middle as the crow flies: the real land for ${Math.round(def.radius)} m round the photo, at 1 : ${Math.round(1 / def.scale)}`);
if (placed && placed.near) console.log(`  it meets ${placed.near.name}: placed exactly from it, and standing on the same heights`);
for (const note of placed ? placed.notes : []) console.log(`  note: ${note}`);
if (def.trail) console.log(`  the walk: ${def.trail.name || 'a trail'}, ${def.trail.length} m, ${def.trail.climb < 0 ? `going down ${-def.trail.climb}` : `climbing ${def.trail.climb}`} m`);
else console.log("  the photo wasn't taken on a trail; you'll arrive where it was taken");
const flowing = (card.streams || []).map((s) => s.name);
const unnamed = (def.streams || []).filter((s) => !s.name).length;
const running = [...flowing, ...(unnamed ? [`${unnamed} unnamed stream${unnamed > 1 ? 's' : ''}`] : [])];
console.log(`  water: ${[...def.lakes.map((l) => l.name || 'an unnamed lake'), ...running].join(', ') || 'none'}${def.beaches ? `; ${def.beaches.length} beach${def.beaches.length > 1 ? 'es' : ''}` : ''}`);
if (def.country) console.log(`  country: ${def.country}`);
console.log(`  a picture of it: ${previewFile}`);

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtHour(h) {
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
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
