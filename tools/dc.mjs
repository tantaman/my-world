#!/usr/bin/env node
// Brings Washington, DC into the game, life size, on its real ground (the
// real place `washington-dc` in src/world/hikes.js, imported by `npm run hike
// -- … --map dc`: see src/washington/README.md): every building in the
// District with the roof the city's lidar survey traced for it, every road,
// alley, car park and sidewalk as the city surveyed it from the air, its
// bridges, and its street trees.
//
//   npm run dc
//
// Writes src/washington/tiles/<i>_<j>.js, a tile 500 m square each (fetched
// in the game as you come near it), and src/washington/city.js, which tiles
// there are and the city's landmarks (what the map knows of it from
// anywhere). Re-run it to bring them up to date; nothing moves.
//
// All of it is the District's own (Open Data DC, DC GIS, CC BY 4.0):
//   Buildings (Detailed Roof)    every roof, each slope at its real height
//   Buildings - 3D               the buildings as blocks (2017): those the
//                                roofs' survey hasn't (built since it flew)
//   Planimetrics 2023            roads, sidewalks, bridges
//   UFA Street Trees             the street trees, where each is planted
//
// Downloads are kept in node_modules/.cache/dc.

import fs from 'node:fs';
import path from 'node:path';
import { inflateSync, deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { localFrame } from './hike/geo.js';
import { decodePatches } from './zoo/plan.js';
import { inside, edgeDistance, area } from '../src/core/rings.js';
import { buildingOf, blockOf, roofArea, middleOf, pavingKind, treeKind, treeHeight, deckOf, encodeTile } from './dc/encode.js';
import { LANDMARKS } from './dc/landmarks.js';
import { TILE } from '../src/washington/codec.js';
import { HIKES } from '../src/world/hikes.js';
import ZOO from '../src/zoo/plan.js';
import { loadHike } from '../src/world/landforms.js';
import { Landform } from '../src/world/landform.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'node_modules/.cache/dc');
const OUT = path.join(ROOT, 'src/washington');
const AGENT = 'my-world city importer (a three.js game; occasional one-off imports)';
const PLACE = 'washington-dc';

const GIS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA';
const LAYERS = {
  roofs: { url: `${GIS}/Facility_and_Structure/MapServer/13`, fields: 'ROOF_TYPE', patches: true },
  blocks: { url: `${GIS}/Facility_and_Structure/MapServer/2`, fields: 'MAX_Z', patches: true },
  roads: { url: `${GIS}/Planimetrics_2023/MapServer/10`, fields: 'DESCRIPTION' },
  sidewalks: { url: `${GIS}/Planimetrics_2023/MapServer/11`, fields: 'DESCRIPTION' },
  bridges: { url: `${GIS}/Planimetrics_2023/MapServer/2`, fields: 'DESCRIPTION' },
  trees: { url: `${GIS}/Urban_Tree_Canopy/MapServer/23`, fields: 'GENUS_NAME,DBH,MAX_CROWN_HEIGHT,DTM_MEAN', where: "TBOX_STAT='Plant'" },
};
const PAGE = 1000;
const AT_ONCE = 4; // pages asked for at a time
// The outlines simplified to this (degrees: about 40 cm) by the server.
const SIMPLE = 0.000004;
// Where a landmark is arrived at: the nearest spot, out from a building as far
// as it's big (but not further than `back`), and within `far` (m) of that,
// that isn't under a roof and is `clear` of one; on the pavement if there's
// any within `paved`.
const STAND = { far: 160, clear: 2.5, paved: 70, back: 180 };
// m: a landmark that isn't in a building is the nearest one this near
const NAME_NEAR = 35;
// m: the squares buildings are looked up by; and the least roof (m²) a
// building only the blocks have is kept with (not a shed)
const COVER = 25;
const BLOCK_LEAST = 12;
// m past the zoo's fence that's still the zoo's (its own plan keeps this much)
const ZOO_MARGIN = 8;

const card = HIKES.find((h) => h.id === PLACE);
// The zoo stands up its own buildings and paths (src/zoo/): inside its fence
// the city leaves it be.
const zooCard = HIKES.find((h) => h.id === ZOO.hike);
if (!card) {
  console.error(`There's no real place called ${PLACE} for the city to stand on: import its ground first (see src/washington/README.md).`);
  process.exit(1);
}
const def = await loadHike(card);
const land = new Landform(def);
// the ground under (x, z) (game m from the place's middle), over its base:
// what a height in a tile is measured as
const ground = (x, z) => land.raw(card.at[0] + x, card.at[1] + z);
const frame = localFrame(card.middle.lat, card.middle.lon);
const s = card.scale;
const toGame = (lat, lon, h = card.base) => {
  const [e, n] = frame.toEN(lat, lon);
  return [e * s, -n * s, (h - card.base) * s];
};

// ── Fetching, kept ───────────────────────────────────────────────────────────
fs.mkdirSync(CACHE, { recursive: true });
async function cached(name, url) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (res.status !== 200) throw Object.assign(new Error(`${res.status} from ${url}`), { status: res.status });
      const text = await res.text();
      const page = JSON.parse(text);
      if (page.error) throw Object.assign(new Error(`${page.error.message} from ${url}`), { status: 500 });
      fs.writeFileSync(file, text);
      return page;
    } catch (err) {
      const busy = !err.status || err.status === 429 || err.status >= 500;
      if (!busy || attempt >= 5) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}
// Every feature of a layer, a page at a time, a few pages at once.
async function layer(name) {
  const L = LAYERS[name];
  const q = (offset) =>
    new URLSearchParams({
      where: L.where || '1=1',
      outFields: L.fields,
      returnGeometry: 'true',
      outSR: '4326',
      ...(L.patches ? {} : { maxAllowableOffset: String(SIMPLE) }),
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      orderByFields: 'OBJECTID',
      f: 'json',
    });
  const count = (await cached(`${name}-count.json`, `${L.url}/query?${new URLSearchParams({ where: L.where || '1=1', returnCountOnly: 'true', f: 'json' })}`)).count;
  process.stdout.write(`${name}: ${count} `);
  const offsets = [];
  for (let o = 0; o < count; o += PAGE) offsets.push(o);
  const pages = new Array(offsets.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < offsets.length) {
        const k = next++;
        pages[k] = await cached(`${name}-${offsets[k]}.json`, `${L.url}/query?${q(offsets[k])}`);
        if (k % 10 === 0) process.stdout.write('.');
      }
    }),
  );
  console.log();
  return pages.flatMap((p) => p.features);
}

// ── The tiles ────────────────────────────────────────────────────────────────
// (the zoo's fence, in this place's own metres)
const zooFence = zooCard ? ZOO.outline.map(([x, z]) => [x + zooCard.at[0] - card.at[0], z + zooCard.at[1] - card.at[1]]) : null;
const inZoo = (x, z) => !!zooFence && (inside(zooFence, x, z) || edgeDistance(zooFence, x, z) < ZOO_MARGIN);
let leftToZoo = 0;
const tiles = new Map(); // "i,j" -> { i, j, buildings, paving, bridges, trees, names }
const tileOf = (i, j) => {
  const key = `${i},${j}`;
  if (!tiles.has(key)) tiles.set(key, { i, j, at: [i * TILE, j * TILE], buildings: [], paving: [], bridges: [], trees: [], names: [] });
  return tiles.get(key);
};
// the tile what's at (x, z) is kept in (or, in the zoo, a tile kept nowhere)
const tileAt = (x, z) => {
  if (inZoo(x, z)) {
    leftToZoo++;
    return { buildings: [], paving: [], bridges: [], trees: [], names: [] };
  }
  return tileOf(Math.floor(x / TILE), Math.floor(z / TILE));
};
const g2 = ([lon, lat]) => {
  const [x, z] = toGame(lat, lon);
  return [x, z];
};
const ringsOf = (geometry) => ((geometry && geometry.rings) || []).map((r) => r.map(g2)).filter((r) => r.length >= 3);

// buildings, from their roofs
let roofCount = 0;
for (const f of await layer('roofs')) {
  if (!f.geometry || !f.geometry.binaryPatches) continue;
  const { parts } = decodePatches(f.geometry.binaryPatches, inflateSync);
  const b = buildingOf(parts, ([lon, lat, h]) => toGame(lat, lon, h), f.attributes.ROOF_TYPE);
  if (!b) continue;
  tileAt(...middleOf(b)).buildings.push(b);
  roofCount++;
}

// and those only the blocks have: where no surveyed roof covers its middle
const covers = new Map(); // a square of COVER m -> the surveyed buildings over it
const coverKey = (x, z) => `${Math.floor(x / COVER)},${Math.floor(z / COVER)}`;
for (const t of tiles.values()) {
  for (const b of t.buildings) {
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of b.pts) [x0, z0, x1, z1] = [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)];
    for (let i = Math.floor(x0 / COVER); i <= Math.floor(x1 / COVER); i++) {
      for (let j = Math.floor(z0 / COVER); j <= Math.floor(z1 / COVER); j++) {
        const k = `${i},${j}`;
        if (!covers.has(k)) covers.set(k, []);
        covers.get(k).push(b);
      }
    }
  }
}
const surveyed = (x, z) => (covers.get(coverKey(x, z)) || []).some((b) => b.faces.some((f) => inside(f[0].map((k) => b.pts[k]), x, z)));
let blockCount = 0;
for (const f of await layer('blocks')) {
  if (!f.geometry || !f.geometry.binaryPatches) continue;
  const b = blockOf(decodePatches(f.geometry.binaryPatches, inflateSync).parts, ([lon, lat, h]) => toGame(lat, lon, h));
  if (!b || roofArea(b) < BLOCK_LEAST) continue;
  const [x, z] = middleOf(b);
  // (its middle, and the middle of its biggest face, may be in a courtyard)
  const big = b.faces.reduce((a, f) => (Math.abs(area(f[0].map((k) => b.pts[k]))) > Math.abs(area(a[0].map((k) => b.pts[k]))) ? f : a));
  const [bx, bz] = big[0].reduce((a, k) => [a[0] + b.pts[k][0] / big[0].length, a[1] + b.pts[k][1] / big[0].length], [0, 0]);
  if (surveyed(x, z) || surveyed(bx, bz)) continue;
  tileAt(x, z).buildings.push(b);
  blockCount++;
}

// roads, sidewalks and bridges
const paved = {};
for (const name of ['roads', 'sidewalks']) {
  for (const f of await layer(name)) {
    const kind = pavingKind(f.attributes.DESCRIPTION);
    if (!kind) continue;
    const rings = ringsOf(f.geometry);
    if (!rings.length) continue;
    const [x, z] = rings[0].reduce((a, p) => [a[0] + p[0] / rings[0].length, a[1] + p[1] / rings[0].length], [0, 0]);
    tileAt(x, z).paving.push({ kind, rings });
    paved[kind] = (paved[kind] || 0) + 1;
  }
}
let bridgeCount = 0;
for (const f of await layer('bridges')) {
  const kind = pavingKind(f.attributes.DESCRIPTION);
  if (kind !== 'bridge' && kind !== 'footbridge') continue;
  for (const ring of ringsOf(f.geometry)) {
    const deck = { ...deckOf(ring, ground), ring, kind };
    if (deck.half < 1 || inZoo((deck.a[0] + deck.b[0]) / 2, (deck.a[1] + deck.b[1]) / 2)) continue;
    bridgeCount++;
    // (in each tile it reaches: the roads on it are in whichever)
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of ring) [x0, z0, x1, z1] = [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)];
    const M = 20;
    for (let i = Math.floor((x0 - M) / TILE); i <= Math.floor((x1 + M) / TILE); i++) for (let j = Math.floor((z0 - M) / TILE); j <= Math.floor((z1 + M) / TILE); j++) tileOf(i, j).bridges.push(deck);
  }
}

// street trees
let treeCount = 0;
for (const f of await layer('trees')) {
  const g = f.geometry;
  if (!g || !Number.isFinite(g.x)) continue;
  const [x, z] = toGame(g.y, g.x);
  const a = f.attributes;
  tileAt(x, z).trees.push({ x, z, height: treeHeight({ top: a.MAX_CROWN_HEIGHT, ground: a.DTM_MEAN, dbh: a.DBH }), kind: treeKind(a.GENUS_NAME) });
  treeCount++;
}
// (tiles of nothing but a bridge's end reaching over from the next are none)
for (const [k, t] of tiles) if (!t.buildings.length && !t.paving.length && !t.trees.length) tiles.delete(k);

// ── The landmarks ────────────────────────────────────────────────────────────
// Each named on the building it's in (where it's a building), and where it's
// arrived at: the nearest spot on the pavement, out from under any roof.
const near = (x, z, r) => {
  const out = [];
  for (let i = Math.floor((x - r) / TILE); i <= Math.floor((x + r) / TILE); i++) for (let j = Math.floor((z - r) / TILE); j <= Math.floor((z + r) / TILE); j++) {
    const t = tiles.get(`${i},${j}`);
    if (t) out.push(t);
  }
  return out;
};
const outline = (b) => b.faces.map((f) => f[0].map((k) => b.pts[k]));
// (what's where, looked up by the square COVER m it's in)
const grid = (things, ringsOf) => {
  const g = new Map();
  for (const it of things) {
    const rings = ringsOf(it);
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings) for (const [x, z] of r) [x0, z0, x1, z1] = [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)];
    for (let i = Math.floor(x0 / COVER); i <= Math.floor(x1 / COVER); i++) {
      for (let j = Math.floor(z0 / COVER); j <= Math.floor(z1 / COVER); j++) {
        const k = `${i},${j}`;
        if (!g.has(k)) g.set(k, []);
        g.get(k).push(rings);
      }
    }
  }
  return (x, z) => g.get(coverKey(x, z)) || [];
};
const allTiles = [...tiles.values()];
const roofsAt = grid(allTiles.flatMap((t) => t.buildings), outline);
const pavingAt = grid(allTiles.flatMap((t) => t.paving.filter((p) => p.kind !== 'stairs')), (p) => p.rings);
const underRoof = (x, z) => roofsAt(x, z).some((rings) => rings.some((r) => inside(r, x, z)));
const onPaving = (x, z) => pavingAt(x, z).some((rings) => rings.filter((r) => inside(r, x, z)).length % 2 === 1);
const names = [];
const landmarks = [];
for (const m of LANDMARKS) {
  const [x, z] = toGame(m.lat, m.lon);
  const ts = near(x, z, STAND.far + STAND.back + 20);
  let building = null;
  if (!m.open) {
    for (const t of ts) {
      t.buildings.forEach((b, k) => {
        if (!building && outline(b).some((r) => inside(r, x, z))) building = { t, k };
      });
    }
    // (or the one nearest it, where the point is in a courtyard: the
    // Hirshhorn is a ring round one)
    let best = NAME_NEAR;
    if (!building) {
      for (const t of ts) {
        t.buildings.forEach((b, k) => {
          for (const r of outline(b)) {
            const d = edgeDistance(r, x, z);
            if (d < best) [best, building] = [d, { t, k }];
          }
        });
      }
    }
    if (building) {
      names.push(m.name);
      building.t.names.push([building.k, names.length - 1]);
    } else console.log(`  note: no building under ${m.name}`);
  }
  // where it's arrived at: back from a building as far as it's big, to see
  // the whole of it (the Capitol from across its plaza, the Monument from
  // round its foot), on the pavement if there's any
  let r0 = 0;
  if (building) {
    const b = building.t.buildings[building.k];
    for (const [px, pz] of b.pts) r0 = Math.max(r0, Math.hypot(px - x, pz - z));
    r0 = Math.min(STAND.back, r0 * 0.8 + STAND.clear * 4);
  }
  let stand = null;
  for (const want of ['paved', 'open']) {
    for (let r = r0; r <= r0 + (want === 'paved' ? STAND.paved : STAND.far) && !stand; r += 3) {
      const n = Math.max(1, Math.round((r * Math.PI * 2) / 4));
      for (let k = 0; k < n && !stand; k++) {
        const a = (k / n) * Math.PI * 2;
        const [px, pz] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
        const clear = [[0, 0], [STAND.clear, 0], [-STAND.clear, 0], [0, STAND.clear], [0, -STAND.clear]].every(([dx, dz]) => !underRoof(px + dx, pz + dz));
        if (clear && (want === 'open' || onPaving(px, pz))) stand = [px, pz];
      }
    }
    if (stand) break;
  }
  if (!stand) stand = [x, z];
  const r1 = (v) => Math.round(v * 10) / 10 + 0;
  landmarks.push({ id: m.id, name: m.name, words: m.words, x: r1(x), z: r1(z), at: [r1(stand[0]), r1(stand[1])], yaw: Math.round(Math.atan2(x - stand[0], z - stand[1]) * 1000) / 1000, ...(building ? {} : { open: true }) });
}

// ── Writing it ───────────────────────────────────────────────────────────────
const TILES_DIR = path.join(OUT, 'tiles');
fs.rmSync(TILES_DIR, { recursive: true, force: true });
fs.mkdirSync(TILES_DIR, { recursive: true });
let bytes = 0;
const list = [];
for (const t of [...tiles.values()].sort((a, b) => a.j - b.j || a.i - b.i)) {
  const packed = deflateRawSync(encodeTile(t), { level: 9 });
  const text = `// A tile of Washington, ${TILE} m square from (${t.i * TILE}, ${t.j * TILE}): written by \`npm run dc\` (tools/dc.mjs), read by src/washington/codec.js.\n// Open Data DC (DC GIS), CC BY 4.0.\nexport default '${packed.toString('base64')}';\n`;
  fs.writeFileSync(path.join(TILES_DIR, `${t.i}_${t.j}.js`), text);
  bytes += text.length;
  list.push([t.i, t.j]);
}
const cityText = `// Washington, DC: which of its tiles there are (each fetched as you come
// near it: tiles/<i>_<j>.js, read by codec.js), what its landmarks are
// called, and where each is and is arrived at (game m from the middle of
// its real place, ${PLACE} in src/world/hikes.js). Written by \`npm run dc\`
// (tools/dc.mjs). Open Data DC (DC GIS), CC BY 4.0.

export const CITY = ${JSON.stringify({ place: PLACE, tile: TILE, tiles: list.map(([i, j]) => `${i}_${j}`).join(' '), names, landmarks })};
`;
fs.writeFileSync(path.join(OUT, 'city.js'), cityText);

const MB = (n) => `${(n / 1048576).toFixed(1)} MB`;
console.log(`\nWashington, DC → src/washington/tiles/ (${list.length} tiles, ${MB(bytes)}, each fetched as you come near) and src/washington/city.js (${Math.round(cityText.length / 1024)} kB)`);
console.log(`  ${roofCount} buildings with their surveyed roofs and ${blockCount} only as blocks, ${Object.entries(paved).map(([k, n]) => `${n} ${k}`).join(', ')}, ${bridgeCount} bridges, ${treeCount} street trees`);
console.log(`  ${landmarks.length} landmarks, ${names.length} of them buildings; ${leftToZoo} things inside the zoo's fence left to the zoo`);
