// The real Earth, under the whole world.
//
// The game world is the real world at the hikes' own scale, 1 : 5, laid out
// round its middle in the Hoh rain forest (core/geo.js), where everyone
// starts: the oceans are where the oceans are, at the sea's level, and as
// deep as they are; the continents and islands rise out of them where they
// do, as high as they are; plains are flat and mountains rugged; and every
// part of it is the kind of country its climate makes it (country.js:
// EARTH_COUNTRY). The forest the land grows (worldgen.js) is laid over it,
// for the hills, paths and streams you walk on. A hike stands on it at its
// real height, so its land meets the Earth's round it.
//
// What is known about the Earth is a grid of cells five minutes of arc across
// (about 9 km, so 1.85 km in the game), cut into tiles 15° square and
// written by `npm run earth` (tools/earth.mjs) to world/earth/: for each
// cell, the height of its land and the depth of its sea, how far it is from
// the coast, and how rugged the land round it is (tools/earth/build.js says
// exactly); finer where it's a range of mountains, a height every 1' of arc,
// with the tile (MOUNTAIN); and finer still, round the start and round each
// hike (DETAIL). A tile
// is fetched the first time something near it is grown (landforms.js), as a
// hike's land is. The climate is a map of its own, half a degree to a cell
// (Köppen-Geiger), fetched with the first tile.
//
// This file is pure, like the rest of the world description: the chunk
// workers and the map workers each hold an Earth, handed the same tiles and
// the same plain facts (meta) about where the hikes are and where the finer
// boxes round them are. It imports no list of either (hikes.js,
// earthTiles.js): those name every file there is to fetch, and a worker
// built with them would carry all of it.
//
// Elevation: AWS Terrain Tiles (ETOPO1, SRTM and others). Climate: Kottek et
// al. (2006), World Map of the Köppen-Geiger climate classification updated.

import { unproject } from '../core/geo.js';
import { NotYet } from '../core/notYet.ts';
import { smoothstep } from '../noise.js';
import { COUNTRY, EARTH_COUNTRY } from './country.js';

export const EARTH = {
  scale: 0.2, // game metres per real metre: the hikes' own
  // The coast: the land rises from the shore to its own height over this many
  // real km, and the seabed falls away to its depth over `shelf` km.
  rise: 2.5,
  shelf: 6,
  // and stands at least this many real metres above the sea, and the seabed
  // as far below it, within `step` km of the shore: a coast is a shore, not
  // a sieve of puddles where low land and shallow sea meet
  low: 5,
  step: 0.3,
  // The land is inland — no hollow goes below the sea — from this many real
  // km from the coast; nearer, a hollow below the sea's level is the sea.
  inland: 3,
  // How much of the forest's relief is left at the shore (it comes back in
  // over `calm` real km inland, and is gone as far out to sea): a
  // mountainous coast keeps one shore, not a shattering of islands and
  // inlets.
  shore: 0.3,
  calm: 4,
  // and inland no lower than this (game m) over the sea, eased in over
  // `soft` m: lower than the forest's own floor, so a delta stands a metre
  // over its water as a hike there does (sea.js)
  floor: 0.5,
  soft: 0.5,
  // m between the points the Earth is sampled at in the game (and is
  // smooth between), in blocks of `block` × `block` of them.
  node: 32,
  block: 32,
  blocks: 192, // the most blocks kept
};

// The Earth's own treeline and snow line (real m above the sea), where a
// country doesn't say: as high as `at` within `from` degrees of the equator,
// and lower by `perDegree` for every degree further, to the sea. Rough, as
// lines go (a dry interior has them higher, a wet coast lower), but the Alps'
// treeline comes out at about 2,000 m, the tropics' at 3,800, and the snow
// that lies all summer at 2,700 in the Alps and 5,000 under the equator.
// `fade` is how many real metres the trees thin out over below the treeline.
export const LINES = {
  treeline: { at: 3800, from: 22, perDegree: 76, fade: 150 },
  snowline: { at: 5000, from: 22, perDegree: 94 },
};
const lineAt = (L, lat) => Math.max(0, L.at - L.perDegree * Math.max(0, Math.abs(lat) - L.from));
// The real heights [from, to] over which the trees give out, and over which
// the snow comes to lie, at latitude lat in a country: its own if it says,
// else the latitude's, as much higher or lower as the country's climate has
// them (country.js, `lines`).
export function treelineOf(country, lat) {
  if (country.treeline) return country.treeline;
  const at = Math.max(0, lineAt(LINES.treeline, lat) + country.lines.tree);
  return [at - LINES.treeline.fade, at];
}
export function snowlineOf(country, lat) {
  if (country.snowline) return country.snowline;
  const at = Math.max(0, lineAt(LINES.snowline, lat) + country.lines.snow);
  return [at, at + 250];
}

// The kind of country (country.js) a part of the Earth is, from its climate
// class, its latitude, how high it is (real m) and how rugged (real m).
export function earthCountry(climate, lat, height, relief) {
  const T = EARTH_COUNTRY;
  const low = T.lowland.climates[climate];
  if (low && height < T.lowland.below && relief < T.lowland.relief) return COUNTRY[low];
  const far = T.poleward.climates[climate];
  if (far && Math.abs(lat) > T.poleward.from) return COUNTRY[far];
  return COUNTRY[T.climate[climate]] || COUNTRY.forest;
}

// Round a real place (a hike: world/hikes.js) the Earth is that place's own
// country, out to this many game metres past its edge: Zion stands in red
// rock country, not in whatever its half-degree of climate map says, and the
// Alps round a ski resort photographed in winter are under snow too.
export const PLACE_REACH = 2500;

// Round the start and round each hike, the land finer: a box of heights
// perDegree to a degree (15", about 460 m: 92 in the game), from elevation
// tiles at `zoom`, for `reach` real km about each hike (as far as what's
// grown from the seed round a hike is looked for: an airfield, a pier) and
// `start` about the start (what's grown round it: the towns, the railway, the
// coast's pier and its surf, the Olympics' snow). It is the Earth
// there, coming in over the coarse grid across `fade` real km in from the
// box's edge: the valleys are the real valleys and the coast the real coast,
// and the real land of the hike meets it. Its coast is worked out from its
// heights when it comes (`coast` km, either way, at the most).
export const DETAIL = { perDegree: 240, zoom: 10, reach: 35, start: 90, fade: 4, coast: 12 };

// The boxes there are, as a list: from { name: { box: [s, w, n, e], w, h } }
// (earthTiles.js, EARTH_DETAILS), to [{ name, box, w, h }].
export const detailList = (details = {}) => Object.entries(details).map(([name, d]) => ({ name, box: d.box, w: d.w, h: d.h }));

// The grid: cells per degree, and cells along a tile's side.
export const PER_DEGREE = 12;
export const TILE_DEGREES = 15;
export const TILE_CELLS = TILE_DEGREES * PER_DEGREE;
const GRID_W = 360 * PER_DEGREE;
const GRID_H = 180 * PER_DEGREE;

// Where the land is a range of mountains (`relief` real m or more over a cell
// and those next to it), the grid is finer: a height every 1' of arc (about
// 1.85 km: 370 m in the game), `perDegree` to a degree, so a peak stands as
// high as it does and a valley runs where it runs, rather than both being
// worn down to the mean of nine kilometres. In a ring of cells round each
// range the finer heights come down to the coarse grid's, so there's no step
// where they end. Each is kept to `step` m, as the change from its own cell's
// height, with the tile the cell is in (see encodeTile).
export const MOUNTAIN = { perDegree: 60, relief: 200, step: 8 };
const SUB = MOUNTAIN.perDegree / PER_DEGREE; // the finer heights along a cell's side
const SUB2 = SUB * SUB;
// What a cell's numbers are stored as (a tile's bytes: see encodeTile). The
// land's height and the sea's depth each on a curve (asinh) that is fine near
// the sea's level and coarser further from it: half a metre on the shore,
// three at 100 m, thirty at 1,000 and a hundred and twenty-five at 4,000;
// and the seabed two metres near the shore, three hundred at 5,000 m down.
// The coast to the nearest COAST_STEP km, and the relief as the square of a
// byte over RELIEF_ROOT.
const LAND_CODE = { s: 16, k: 32 };
const SEA_CODE = { s: 32, k: 16 };
const code = (c, v) => Math.round(c.k * Math.asinh(v / c.s));
const uncode = (c, q) => c.s * Math.sinh(q / c.k);
const COAST_STEP = 0.5;
const RELIEF_ROOT = 2;
// A land height (m) as a tile keeps it, and gives it back.
export const storedLand = (v) => uncode(LAND_CODE, code(LAND_CODE, v));

// The tile (its name, as its file is called) a cell of the grid is in, by
// its north-west corner: 'n45w135' is 30°–45° N, 135°–120° W.
export function tileName(ti, tj) {
  const lat = 90 - tj * TILE_DEGREES;
  const lon = -180 + ti * TILE_DEGREES;
  const ns = lat >= 0 ? 'n' : 's';
  const ew = lon >= 0 ? 'e' : 'w';
  return `${ns}${String(Math.abs(lat)).padStart(2, '0')}${ew}${String(Math.abs(lon)).padStart(3, '0')}`;
}

// The tiles that (lat, lon) and the cells round it are in, by name, into
// `into`; and the finer box round a hike, if it's in one of `details`
// (detailList's).
export function tilesAt(lat, lon, into, details = []) {
  for (const d of details) if (lat >= d.box[0] && lat <= d.box[2] && lon >= d.box[1] && lon <= d.box[3]) into.add(d.name);
  const fi = (lon + 180) * PER_DEGREE - 0.5;
  const fj = (90 - lat) * PER_DEGREE - 0.5;
  for (const dj of [-1, 2]) {
    for (const di of [-1, 2]) {
      const i = (((Math.floor(fi) + di) % GRID_W) + GRID_W) % GRID_W;
      const j = Math.max(0, Math.min(GRID_H - 1, Math.floor(fj) + dj));
      into.add(tileName(Math.floor(i / TILE_CELLS), Math.floor(j / TILE_CELLS)));
    }
  }
  return into;
}

// ── A tile's bytes ───────────────────────────────────────────────────────────
// Four planes of TILE_CELLS² cells, row by row from the north-west: the
// land's height and the sea's depth (each on its curve), as 16 bits, low
// bytes then high bytes; the coast (COAST_STEP km) and the relief (a byte,
// squared over RELIEF_ROOT), a byte each. Each is the change from the cell
// before it (the first of a row from the first of the row above), which is
// mostly small, so the whole packs down well (the importer deflates it).
//
// Then, if any of it is mountains (MOUNTAIN), which cells are, a bit each
// (the first cell the lowest bit of the first byte), and the finer heights
// of each of those cells in turn, SUB² of them row by row from its
// north-west: each as the change, in MOUNTAIN.step m, from its cell's own
// height as kept here, and that as the change from the one before it, 16
// bits, low bytes then high bytes.
const N2 = TILE_CELLS * TILE_CELLS;
const BITS = Math.ceil(N2 / 8);
const zig = (v) => (v << 1) ^ (v >> 31);
const unzig = (z) => (z >>> 1) ^ -(z & 1);

// { land, sea, coast, relief }: TILE_CELLS² numbers each (m, m, km, m), and
// mountains: { flags (TILE_CELLS² bytes, 1 for a cell that has them), heights
// (SUB² real m for each such cell, in order) }, or none → bytes
export function encodeTile({ land, sea, coast, relief, mountains = null }) {
  const count = mountains ? mountains.flags.reduce((n, f) => n + (f ? 1 : 0), 0) : 0;
  const M = count * SUB2;
  const out = new Uint8Array(N2 * 6 + (count ? BITS + M * 2 : 0));
  const q = [
    (k) => code(LAND_CODE, land[k]),
    (k) => code(SEA_CODE, sea[k]),
    (k) => Math.round(coast[k] / COAST_STEP),
    (k) => Math.min(255, Math.round(Math.sqrt(Math.max(0, relief[k])) * RELIEF_ROOT)),
  ];
  const deltas = (f) => {
    const d = new Int32Array(N2);
    for (let j = 0; j < TILE_CELLS; j++) {
      for (let i = 0; i < TILE_CELLS; i++) {
        const k = j * TILE_CELLS + i;
        const before = i > 0 ? f(k - 1) : j > 0 ? f(k - TILE_CELLS) : 0;
        d[k] = f(k) - before;
      }
    }
    return d;
  };
  for (const [plane, f] of [[0, q[0]], [1, q[1]]]) {
    const d = deltas(f);
    for (let k = 0; k < N2; k++) {
      const z = zig(d[k]) & 0xffff;
      out[plane * 2 * N2 + k] = z & 255;
      out[(plane * 2 + 1) * N2 + k] = z >> 8;
    }
  }
  for (const [plane, f] of [[4, q[2]], [5, q[3]]]) {
    const d = deltas(f);
    for (let k = 0; k < N2; k++) out[plane * N2 + k] = d[k] & 255;
  }
  if (count) {
    const at = N2 * 6;
    let o = 0;
    let before = 0;
    for (let k = 0; k < N2; k++) {
      if (!mountains.flags[k]) continue;
      out[at + (k >> 3)] |= 1 << (k & 7);
      const base = storedLand(land[k]);
      for (let s = 0; s < SUB2; s++, o++) {
        const r = Math.round((mountains.heights[o] - base) / MOUNTAIN.step);
        const z = zig(r - before) & 0xffff;
        before = r;
        out[at + BITS + o] = z & 255;
        out[at + BITS + M + o] = z >> 8;
      }
    }
  }
  return out;
}

// bytes → { land, sea, coast, relief }: Float32Arrays of TILE_CELLS² (m, m,
// km, m); and mountains: { index (TILE_CELLS²: where a cell's finer heights
// start in heights, or -1), heights (real m) }, or null
export function decodeTile(bytes) {
  const undo = (get, wrap) => {
    const v = new Int32Array(N2);
    for (let j = 0; j < TILE_CELLS; j++) {
      for (let i = 0; i < TILE_CELLS; i++) {
        const k = j * TILE_CELLS + i;
        const before = i > 0 ? v[k - 1] : j > 0 ? v[k - TILE_CELLS] : 0;
        v[k] = wrap(before + get(k));
      }
    }
    return v;
  };
  const i16 = (plane) => undo((k) => unzig(bytes[plane * 2 * N2 + k] | (bytes[(plane * 2 + 1) * N2 + k] << 8)), (x) => x);
  const i8 = (plane) => undo((k) => bytes[plane * N2 + k], (x) => (x << 24) >> 24);
  const u8 = (plane) => undo((k) => bytes[plane * N2 + k], (x) => x & 255);
  const land = Float32Array.from(i16(0), (v) => uncode(LAND_CODE, v));
  const sea = Float32Array.from(i16(1), (v) => uncode(SEA_CODE, v));
  const coast = Float32Array.from(i8(4), (v) => v * COAST_STEP);
  const relief = Float32Array.from(u8(5), (v) => (v / RELIEF_ROOT) ** 2);
  let mountains = null;
  if (bytes.length > N2 * 6) {
    const at = N2 * 6;
    const index = new Int32Array(N2).fill(-1);
    let count = 0;
    for (let k = 0; k < N2; k++) if (bytes[at + (k >> 3)] & (1 << (k & 7))) index[k] = count++ * SUB2;
    const M = count * SUB2;
    const heights = new Float32Array(M);
    let o = 0;
    let r = 0;
    for (let k = 0; k < N2; k++) {
      if (index[k] < 0) continue;
      const base = land[k];
      for (let s = 0; s < SUB2; s++, o++) {
        r += unzig(bytes[at + BITS + o] | (bytes[at + BITS + M + o] << 8));
        heights[o] = base + r * MOUNTAIN.step;
      }
    }
    mountains = { index, heights };
  }
  return { land, sea, coast, relief, mountains };
}

// A box of finer heights (DETAIL) packs as the land's plane of a tile does:
// 16 bits a height (real m), each the change from the one before it, low
// bytes then high bytes.
export function encodeDetail(elev, w, h) {
  const N = w * h;
  const out = new Uint8Array(N * 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const before = i > 0 ? Math.round(elev[k - 1]) : j > 0 ? Math.round(elev[k - w]) : 0;
      const d = Math.round(elev[k]) - before;
      const z = ((d << 1) ^ (d >> 31)) & 0xffff;
      out[k] = z & 255;
      out[N + k] = z >> 8;
    }
  }
  return out;
}

// bytes → { elev, coast }: Float32Arrays of w × h, real m and real km (the
// signed distance to the sea's edge, positive on land: worked out here, by a
// chamfer over the box, with the cells narrowing east to west toward the
// poles).
export function decodeDetail(bytes, w, h, south, north) {
  const N = w * h;
  const elev = new Float32Array(N);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const z = bytes[k] | (bytes[N + k] << 8);
      const before = i > 0 ? elev[k - 1] : j > 0 ? elev[k - w] : 0;
      elev[k] = before + ((z >>> 1) ^ -(z & 1));
    }
  }
  const P = DETAIL.perDegree;
  const dy = 111.2 / P;
  const far = DETAIL.coast;
  const toSea = new Float32Array(N).fill(far * 2);
  const toLand = new Float32Array(N).fill(far * 2);
  for (let k = 0; k < N; k++) (elev[k] > 0 ? toLand : toSea)[k] = 0;
  const dxAt = (j) => dy * Math.cos(((north - (j + 0.5) / P) * Math.PI) / 180);
  const pass = (j, i, k, from, step) => {
    if (toSea[from] + step < toSea[k]) toSea[k] = toSea[from] + step;
    if (toLand[from] + step < toLand[k]) toLand[k] = toLand[from] + step;
  };
  for (let j = 0; j < h; j++) {
    const dx = dxAt(j);
    const dd = Math.hypot(dx, dy);
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (i > 0) pass(j, i, k, k - 1, dx);
      if (j > 0) {
        pass(j, i, k, k - w, dy);
        if (i > 0) pass(j, i, k, k - w - 1, dd);
        if (i < w - 1) pass(j, i, k, k - w + 1, dd);
      }
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    const dx = dxAt(j);
    const dd = Math.hypot(dx, dy);
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      if (i < w - 1) pass(j, i, k, k + 1, dx);
      if (j < h - 1) {
        pass(j, i, k, k + w, dy);
        if (i < w - 1) pass(j, i, k, k + w + 1, dd);
        if (i > 0) pass(j, i, k, k + w - 1, dd);
      }
    }
  }
  const coast = new Float32Array(N);
  for (let j = 0; j < h; j++) {
    const half = 0.5 * Math.sqrt(dxAt(j) * dy);
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const d = elev[k] > 0 ? toSea[k] - half : -(toLand[k] - half);
      coast[k] = Math.max(-far, Math.min(far, d));
    }
  }
  return { elev, coast };
}

// The climate map's bytes: one a cell, its class's place in `names`.
export const CLIMATE_W = 720;
export const CLIMATE_H = 360;

// base64 of deflated bytes (as the importer writes them) → the bytes.
export async function inflate(base64) {
  const bin = typeof atob === 'function' ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) : Uint8Array.from(Buffer.from(base64, 'base64'));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── The Earth ────────────────────────────────────────────────────────────────
// The tiles that have come, and the climate, and what they say at any point
// of the game world. What's asked about should have come (the chunks, the map
// and the far view wait for it: landforms.js). Asking about a tile that hasn't
// throws NotYet (core/notYet.ts), and tells `wants`, if it has one, which
// tile it was, so it can be sent for.
//
// Handed, as plain facts that a worker's Earth is handed again (meta):
//   places   the hikes' cards (hikes.js: at, radius, fade, country): round
//            each, its own country
//   details  the finer boxes there are round them (earthTiles.js,
//            EARTH_DETAILS: name -> { box, w, h })
// Every Earth in a world must be handed the same, or they'd grow it apart.
export class Earth {
  constructor({ wants = null, places = [], details = {} } = {}) {
    const own = places.filter((h) => h.country && COUNTRY[h.country]).map((h) => ({ x: h.at[0], z: h.at[1], r: h.radius + h.fade + PLACE_REACH, country: h.country }));
    this.boxes = detailList(details);
    this.meta = { places: own.map((p) => ({ at: [p.x, p.z], radius: p.r - PLACE_REACH, fade: 0, country: p.country })), details: Object.fromEntries(this.boxes.map((d) => [d.name, { box: d.box, w: d.w, h: d.h }])) };
    this.places = own.map((p) => ({ ...p, country: COUNTRY[p.country] }));
    this.tiles = new Map(); // name -> { land, sea, coast, relief }
    this.details = new Map(); // name -> { elev, coast }, finer round a hike
    this._d = { height: 0, coast: 0, w: 0 };
    this.climate = null; // { names, grid }
    this.wants = wants; // (name) => void, or null
    // whether anything has been asked about that wasn't here, since a tile came
    this.missed = false;
    this._blocks = new Map();
    this._last = null;
    this._ll = [0, 0];
    this._c = { land: 0, sea: 0, coast: 0, relief: 0 };
    this._c2 = { land: 0, sea: 0, coast: 0, relief: 0 };
    this._m = { height: 0, w: 0 };
    this._mv = new Float64Array(4); // the finer heights at the four corners round a point
    this._mf = new Uint8Array(4); // and which of them there are
    this._lt = { ti: 0, tj: 0, t: null };
  }

  // A tile: { name, bytes } (bytes as encodeTile makes them, inflated), or
  // a finer box round a hike (encodeDetail's).
  addTile({ name, bytes }) {
    if (this.tiles.has(name) || this.details.has(name)) return;
    const d = this.meta.details[name];
    if (d) this.details.set(name, decodeDetail(bytes, d.w, d.h, d.box[0], d.box[2]));
    else this.tiles.set(name, decodeTile(bytes));
  }

  // The climate: { names, bytes } (CLIMATE_W × CLIMATE_H, from the north-west).
  setClimate({ names, bytes }) {
    this.climate = { names, grid: bytes };
  }

  has(name) {
    return this.tiles.has(name) || this.details.has(name) || (name === 'climate' && !!this.climate);
  }

  // The finer land round a hike at (lat, lon), if it's in a box of it, into
  // this._d: its height (real m, as _height() makes one) and coast (km), and
  // how far it is the box's (w: 0 out past it, 1 well inside).
  _detail(lat, lon) {
    const o = this._d;
    o.w = 0;
    for (const d of this.boxes) {
      const [s, wst, n, e] = d.box;
      if (lat <= s || lat >= n || lon <= wst || lon >= e) continue;
      const kx = 111.2 * Math.cos((lat * Math.PI) / 180);
      const inside = Math.min((lat - s) * 111.2, (n - lat) * 111.2, (lon - wst) * kx, (e - lon) * kx);
      const w = smoothstep(0, DETAIL.fade, inside);
      if (w <= 0) continue;
      const t = this.details.get(d.name);
      if (!t) {
        this.missed = true;
        if (this.wants) this.wants(d.name);
        throw new NotYet(`the Earth round ${d.name.slice(2)}`);
      }
      const P = DETAIL.perDegree;
      const fi = Math.max(0, Math.min(d.w - 1.001, (lon - wst) * P - 0.5));
      const fj = Math.max(0, Math.min(d.h - 1.001, (n - lat) * P - 0.5));
      const i = Math.floor(fi);
      const j = Math.floor(fj);
      const [u, v] = [fi - i, fj - j];
      const k = j * d.w + i;
      const mix = (a) => (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + d.w] * (1 - u) + a[k + d.w + 1] * u) * v;
      o.coast = mix(t.coast);
      // (the same shore as the coarse grid has: no puddles where the land
      // and the sea meet low)
      const e2 = mix(t.elev);
      o.height = o.coast >= 0 ? Math.max(e2, EARTH.low * smoothstep(0, EARTH.step, o.coast)) : Math.min(e2, -EARTH.low * smoothstep(0, EARTH.step, -o.coast));
      o.w = w;
      return o;
    }
    return o;
  }

  // Each of the four numbers of the grid at (lat, lon), between its cells,
  // into c.
  _cell(lat, lon, c = this._c) {
    const fi = (lon + 180) * PER_DEGREE - 0.5;
    const fj = Math.max(0, Math.min(GRID_H - 1, (90 - lat) * PER_DEGREE - 0.5));
    const i0 = Math.floor(fi);
    const j0 = Math.min(GRID_H - 2, Math.floor(fj));
    const tx = fi - i0;
    const ty = fj - j0;
    c.land = c.sea = c.coast = c.relief = 0;
    for (let b = 0; b < 2; b++) {
      for (let a = 0; a < 2; a++) {
        const w = (a ? tx : 1 - tx) * (b ? ty : 1 - ty);
        if (w === 0) continue;
        const i = (((i0 + a) % GRID_W) + GRID_W) % GRID_W;
        const j = j0 + b;
        const ti = Math.floor(i / TILE_CELLS);
        const tj = Math.floor(j / TILE_CELLS);
        const name = tileName(ti, tj);
        const t = this.tiles.get(name);
        if (!t) {
          this.missed = true;
          if (this.wants) this.wants(name);
          throw new NotYet(`the Earth's tile ${name}`);
        }
        const k = (j - tj * TILE_CELLS) * TILE_CELLS + (i - ti * TILE_CELLS);
        c.land += t.land[k] * w;
        c.sea += t.sea[k] * w;
        c.coast += t.coast[k] * w;
        c.relief += t.relief[k] * w;
      }
    }
    return c;
  }

  // The finer heights of a range of mountains (MOUNTAIN) at (lat, lon), into
  // this._m: the land's height there (real m), between the finer heights
  // round it (and the coarse grid's, where one of those isn't a mountain's),
  // and how far it is the finer heights' (w: 0 where none of them is).
  _mid(lat, lon) {
    const o = this._m;
    const P = MOUNTAIN.perDegree;
    const fi = (lon + 180) * P - 0.5;
    const fj = Math.max(0, Math.min(180 * P - 1, (90 - lat) * P - 0.5));
    const i0 = Math.floor(fi);
    const j0 = Math.min(180 * P - 2, Math.floor(fj));
    const tx = fi - i0;
    const ty = fj - j0;
    let any = false;
    for (let n = 0; n < 4; n++) {
      const I = (((i0 + (n & 1)) % (360 * P)) + 360 * P) % (360 * P);
      const J = j0 + (n >> 1);
      const ci = Math.floor(I / SUB);
      const cj = Math.floor(J / SUB);
      const ti = Math.floor(ci / TILE_CELLS);
      const tj = Math.floor(cj / TILE_CELLS);
      const t = this._tile(ti, tj);
      const at = t.mountains ? t.mountains.index[(cj - tj * TILE_CELLS) * TILE_CELLS + (ci - ti * TILE_CELLS)] : -1;
      this._mf[n] = at >= 0 ? 1 : 0;
      if (at >= 0) {
        this._mv[n] = t.mountains.heights[at + (J - cj * SUB) * SUB + (I - ci * SUB)];
        any = true;
      }
    }
    o.w = 0;
    o.height = 0;
    if (!any) return o;
    for (let n = 0; n < 4; n++) {
      const I = i0 + (n & 1);
      const J = j0 + (n >> 1);
      const w = (n & 1 ? tx : 1 - tx) * (n >> 1 ? ty : 1 - ty);
      const h = this._mf[n] ? this._mv[n] : this._cell(90 - (J + 0.5) / P, -180 + (I + 0.5) / P, this._c2).land;
      o.height += h * w;
      o.w += this._mf[n] * w;
    }
    return o;
  }

  // Tile (ti, tj), the last asked kept (it's nearly always the same again).
  _tile(ti, tj) {
    const L = this._lt;
    if (L.t && L.ti === ti && L.tj === tj) return L.t;
    const name = tileName(ti, tj);
    const t = this.tiles.get(name);
    if (!t) {
      this.missed = true;
      if (this.wants) this.wants(name);
      throw new NotYet(`the Earth's tile ${name}`);
    }
    L.ti = ti;
    L.tj = tj;
    L.t = t;
    return t;
  }

  // The real height (m above the sea, negative under it) at (lat, lon): the
  // land's, rising from the shore, or the sea's, falling away from it.
  _height(c) {
    if (c.coast >= 0) return Math.max(c.land * smoothstep(0, EARTH.rise, c.coast), EARTH.low * smoothstep(0, EARTH.step, c.coast));
    return Math.min(c.sea * smoothstep(0, EARTH.shelf, -c.coast), -EARTH.low * smoothstep(0, EARTH.step, -c.coast));
  }

  // What the Earth is at game (x, z), into `out`:
  //   height  game m above the sea (negative under it)
  //   relief  game m: how rugged the land round it is
  //   coast   real km from the coast (positive inland)
  //   lat, lon
  //   fine    0..1, how far it is the finer land round a hike (DETAIL): there
  //           the real valleys and ridges are in its heights already
  //   mid     0..1, how far it is a range of mountains' finer heights
  //           (MOUNTAIN): there the ranges' own ridges and valleys are
  // Worked out on a grid of points EARTH.node m apart, a block of them at a
  // time, and taken between them: it's the same wherever it's asked.
  at(x, z, out) {
    const N = EARTH.node;
    const B = EARTH.block;
    const gx = x / N;
    const gz = z / N;
    const bx = Math.floor(gx / B);
    const bz = Math.floor(gz / B);
    let blk = this._last;
    if (!blk || blk.bx !== bx || blk.bz !== bz) {
      const key = `${bx},${bz}`;
      blk = this._blocks.get(key);
      if (!blk) blk = this._block(bx, bz, key);
      this._last = blk;
    }
    const u = gx - bx * B;
    const v = gz - bz * B;
    const i = Math.min(B - 1, Math.floor(u));
    const j = Math.min(B - 1, Math.floor(v));
    const fx = u - i;
    const fz = v - j;
    const S = B + 1;
    const k = j * S + i;
    const f = blk.f;
    const mix = (o) => {
      const a = f[o][k] + (f[o][k + 1] - f[o][k]) * fx;
      const b = f[o][k + S] + (f[o][k + S + 1] - f[o][k + S]) * fx;
      return a + (b - a) * fz;
    };
    out.height = mix(0);
    out.relief = mix(1);
    out.coast = mix(2);
    out.lat = mix(3);
    // (longitude carried on unwrapped across the block, and wrapped again here)
    const lon = mix(4);
    out.lon = lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon;
    out.fine = mix(5);
    out.mid = mix(6);
    return out;
  }

  _block(bx, bz, key) {
    const B = EARTH.block;
    const N = EARTH.node;
    const S = B + 1;
    const f = [0, 1, 2, 3, 4, 5, 6].map(() => new Float32Array(S * S));
    const ll = this._ll;
    let lon0 = null;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const k = j * S + i;
        unproject((bx * B + i) * N, (bz * B + j) * N, EARTH.scale, ll);
        const c = this._cell(ll[0], ll[1]);
        const m = this._mid(ll[0], ll[1]);
        if (m.w > 0) c.land = m.height;
        const d = this._detail(ll[0], ll[1]);
        const h = this._height(c);
        f[0][k] = (h + (d.w > 0 ? (d.height - h) * d.w : 0)) * EARTH.scale;
        f[1][k] = c.relief * EARTH.scale;
        f[2][k] = d.w > 0 ? c.coast + (d.coast - c.coast) * d.w : c.coast;
        f[5][k] = d.w;
        f[6][k] = m.w;
        f[3][k] = ll[0];
        let lon = ll[1];
        if (lon0 === null) lon0 = lon;
        if (lon - lon0 > 180) lon -= 360;
        else if (lon - lon0 < -180) lon += 360;
        f[4][k] = lon;
      }
    }
    const blk = { bx, bz, f };
    this._blocks.set(key, blk);
    if (this._blocks.size > EARTH.blocks) this._blocks.delete(this._blocks.keys().next().value);
    return blk;
  }

  // The real place whose reach (x, z) is in, into `into`: { country, out }
  // (out: 0 at its edge, 1 at the end of its reach), and `into`; or null.
  placeAt(x, z, into) {
    for (const p of this.places) {
      const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d2 >= p.r * p.r) continue;
      into.country = p.country;
      into.out = Math.max(0, 1 - (p.r - Math.sqrt(d2)) / PLACE_REACH);
      return into;
    }
    return null;
  }

  // The climate's class at (lat, lon) ('Cfa', 'BWh', …), or '' out at sea
  // where the map says nothing.
  climateAt(lat, lon) {
    const c = this.climate;
    if (!c) {
      this.missed = true;
      if (this.wants) this.wants('climate');
      throw new NotYet("the Earth's climate");
    }
    const i = Math.min(CLIMATE_W - 1, Math.floor((lon + 180) * 2));
    const j = Math.max(0, Math.min(CLIMATE_H - 1, Math.floor((90 - lat) * 2)));
    return c.names[c.grid[j * CLIMATE_W + i]];
  }
}

// m round the start, and round each real place, over which what's grown from
// the seed is looked for as the game opens (the towns, the railway, the ski
// run, a launch site; the airfields and the hunt club round a hike): the
// Earth there is fetched before the features that look are installed
// (world/index.js), and a test that grows the world as the game has it
// fetches the same.
export const SEARCHED = { start: 80000, places: 20000 };

// The squares of the world ([x0, z0, x1, z1]) that is: round the start, and
// round each of `cards` (hikes.js).
export function searchedAtFirst(cards) {
  const near = (x, z, r) => [x - r, z - r, x + r, z + r];
  return [near(0, 0, SEARCHED.start), ...cards.map((c) => near(c.at[0], c.at[1], SEARCHED.places))];
}

// The names of the tiles anything in the square (x0, z0)–(x1, z1) of the game
// world is grown from (and of the finer boxes round the hikes, of `details`:
// detailList's), into `into` (a Set): the square and LOOKS_OUT m round
// it, which is as far as anything grown there looks (the water, to see which
// way it runs: drainage.js; the Earth itself, a block at a time). It's walked
// every `step` m, which is fine enough that no tile is missed between (the
// finer boxes round the hikes are fourteen kilometres across, the tiles
// hundreds).
const LOOKS_OUT = 2500;
export function tilesIn(x0, z0, x1, z1, into = new Set(), details = []) {
  x0 -= LOOKS_OUT;
  z0 -= LOOKS_OUT;
  x1 += LOOKS_OUT;
  z1 += LOOKS_OUT;
  const ll = [0, 0];
  const step = 5000;
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  for (let b = 0; b <= nz; b++) {
    for (let a = 0; a <= nx; a++) {
      unproject(x0 + ((x1 - x0) * a) / nx, z0 + ((z1 - z0) * b) / nz, EARTH.scale, ll);
      tilesAt(ll[0], ll[1], into, details);
    }
  }
  return into;
}
