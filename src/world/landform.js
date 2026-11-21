// A piece of real ground set into the forest: the land around a hike someone
// took a photo on, imported by `npm run hike` (tools/hike.mjs) and listed in
// world/hikes.js.
//
// It holds the real shape of the land at game scale (a grid of heights), the
// real footpaths over it, and the real lakes in it. WorldGen blends it into
// the procedural forest: inside `radius` it is the real land; over the next
// `fade` metres it gives way to the forest around it. Pure and deterministic,
// like the rest of the world description: the chunk workers and the map
// workers each build one from the same plain definition.
//
// A definition (all distances in game metres, x east, z south):
//
//   id, name        what it is called
//   at: [x, z]      where its middle sits in the world
//   scale           game metres per real metre
//   radius, fade    real land out to radius, gone by radius + fade
//   ground          { n, cell, heights, fine? }: an n × n grid of heights
//                   `cell` apart, centred on `at`, packed by packHeights().
//                   fine: { x, z, w, h, cell, heights }, a finer w × h grid
//                   over part of it (the walk), from (x, z) relative to `at`:
//                   where it is, it is the ground, giving way to the coarse
//                   grid over FINE_EDGE at its edge
//   lakes           [{ name, level, box: [i0, j0, w, h], shore, sea? }]: the
//                   water level, and the signed distance to the shore
//                   (negative in the water) over part of the same grid, packed
//                   by packShore(). The sea is one of them, marked `sea`: it
//                   breaks along its shore and nothing grows in it. Its shore
//                   is on a finer grid of its own ({ x, z, w, h, cell } in
//                   place of box, as a beach's is)
//   streams         [{ name, big, pts: [x, z, x, z, ...] }]: running water,
//                   relative to `at`, each the way it flows; big for a river
//   beaches         [{ x, z, w, h, cell, shore }]: each beach, as the signed
//                   distance to its edge (negative on it) over a w × h grid
//                   of its own, `cell` apart from (x, z) relative to `at`,
//                   packed by packShore()
//   paths           [[x, z, x, z, ...], ...]: the footpaths, relative to `at`
//   ropes           the same, for stretches of them with chains or a fixed
//                   rope to hold on to (drawn by the hikes feature)
//   cover           { kinds, cells }: what covers the land (woods, scrub,
//                   scree, bare rock, tundra, ice: COVER), one of `kinds` (or
//                   nothing said, 0) at each point of the ground's grid,
//                   packed by packCover(). Where it says nothing, or there is
//                   no cover, the land is wooded by `trees` and steep ground
//                   is rock
//   view            { x, z, bearing, hour }: where the photo was taken from
//                   (relative to `at`: the middle of the land, unless it was
//                   centred somewhere else to take in the whole of a long
//                   trail), which way it looked (degrees clockwise from
//                   north) and when
//   trailhead       { x, z, yaw }: where the walk to the view begins
//   trees           { cover, species }: how thickly it is wooded (0..1; at 0
//                   nothing stands on it at all, as above the tree line) and
//                   with what (-1 broadleaf .. 1 conifers), before slope and
//                   clearings thin it out
//   country         what kind of country it is, by name (country.js): what
//                   its ground is made of, what grows and lives there, what
//                   its sky does. Unsaid, it is forest like the rest
//   photo, middle   { lat, lon }: where the photo was taken, and where the
//                   land is centred if not there (the importer's `--middle`):
//                   what `at` is the real place of
//   snowline        [from, to]: the real heights over which snow comes to lie
//                   on it, where that isn't where its country has it (a photo
//                   taken in winter); null for none whatever its country says
//   base            the real height (m) the heights are measured up from
//   datum           { at, outer, anchor, base }: what sets its heights in the
//                   world. The first hike in a part of the world is its own
//                   datum: its trailhead (`anchor`, a height of its own) stands
//                   at the level of the forest round it (`at`, `outer`). A hike
//                   that overlaps it shares that datum, so where the two meet
//                   the same real mountain stands at the same height.
//
// WorldGen settles it (`offset`) by its datum.

import { smoothstep, createSimplex2 } from '../noise.js';
import { countryOf } from './country.js';
import { NET, channelHalf } from './drainage.js';

// The trodden tread of a trail, and the bench it is cut into the hillside as.
export const TRAIL_HALF = 0.9; // m, half the tread
const BENCH = 1.8; // m past the tread over which the bench meets the slope
const TRAIL_REACH = 24; // m: further from a trail than this, nobody asks exactly
const BUCKET = 16; // m, cells of the trail lookup grid

// Lakes: how the bed shelves away from the shore, and the beach above it.
const LAKE_DEPTH = 9; // m, deepest
const LAKE_SHELF = 14; // m from the shore to reach two thirds of that
const BEACH = 5; // m over which the shore meets the land behind it
export const LAKE_REGION = 2.5; // m past the bank where water may still stand
const SHORE_UNIT = 0.5; // m per step of a packed shore distance
const SHORE_FAR = 60; // m, what a packed shore distance saturates at
// The sea: how churned up it is (0..1, as a river's foam is) where it breaks
// on the shore, and out past the breakers, and how far out they reach (m).
const SURF = 0.85;
const CHOP = 0.3;
const SURF_REACH = 9;

// How churned up a sea is u metres from its shore (negative in the water):
// white where it breaks, a chop further out. Any sea: a real place's, or the
// forest's own (sea.js).
export function seaSurf(u) {
  return CHOP + (SURF - CHOP) * smoothstep(-SURF_REACH, -1, u);
}

// m in from the land's edge that tells whether the sea runs on past it
// (inside the bank the importer leaves round the sea: tools/hike/build.js)
const SEA_EDGE = 40;
// Streams. A real stream is handed to the same code that shapes the forest's
// own (water.js), as pieces of channel; these say how one is made from the
// line on the map.
const STREAM_STEP = 5; // m between the points its fall is worked out at
const STREAM_CUT = 0.3; // m its water lies under the ground the line was drawn over
const STREAM_PIECE = 8; // of those steps to a piece of channel
const STREAM_REACH = 60; // m to either side that a piece may shape the ground
// How much water it carries, in the drainage network's terms (nodes of
// catchment: drainage.js): at a spring; where it comes onto the land already
// running; what it gains for every metre it runs; and the most that one the
// map calls a stream comes to, however far it runs and whatever runs into
// it: a small river's worth.
const STREAM_SPRING = NET.springAcc * 1.2;
const STREAM_ENTERS = 30;
const STREAM_GAIN = 0.2;
const STREAM_MOST = NET.riverAcc * 1.15;
const STREAM_RIVER = NET.riverAcc * 1.2; // what a river carries, all the way
const STREAM_JOIN = 3; // m: a stream that ends this near another's line runs into it
const STREAM_BUCKET = 64; // m, cells of the lookup grid

// m in from the edge of a finer grid over which it gives way to the coarse one
const FINE_EDGE = 8;

// A frozen lake's ice lies this far (m) under its water level, and a frozen
// stream's fills its channel to this far (m) past its banks. Nothing grows on
// a frozen lake, or within ICE_CLEAR (m) of its shore.
export const ICE = { under: 0.05, bank: 0.5 };
const ICE_CLEAR = 1.5;

// What forest() says of land with no trees: low enough that the odd tree the
// forest plants even in its barest meadows isn't planted either.
const TREELESS = -0.05;

// What covers the land, where the map says (tools/hike/osm.js): the kinds a
// hike's cover can be, and what each means for what grows on it.
export const COVER = ['wood', 'scrub', 'meadow', 'tundra', 'scree', 'rock', 'ice'];
//   trees   how thickly wooded (as forest() says), before slope and the
//           treeline thin it; null: as thickly as the land's own `trees`
//   bare    how much of the ground is bare (stone, as the country's bare
//           ground: see surface() in realPlaces.js)
//   thicket how much of it is a thicket of shrubs (willow, alder)
//   talus   how thickly strewn with boulders
//   above   how far it is ground above the trees (thin turf among stones),
//           whatever the height
//   ice     how far it is snow and ice all year
const COVER_IS = {
  wood: { trees: null, bare: 0, thicket: 0, talus: 0, above: 0, ice: 0 },
  scrub: { trees: 0.1, bare: 0, thicket: 1, talus: 0, above: 0, ice: 0 },
  meadow: { trees: 0.02, bare: 0, thicket: 0, talus: 0, above: 0, ice: 0 },
  tundra: { trees: TREELESS, bare: 0.3, thicket: 0, talus: 0.1, above: 1, ice: 0 },
  scree: { trees: 0.06, bare: 1, thicket: 0, talus: 1, above: 0, ice: 0 },
  rock: { trees: TREELESS, bare: 1, thicket: 0, talus: 0.85, above: 0, ice: 0 },
  ice: { trees: TREELESS, bare: 0, thicket: 0, talus: 0, above: 0, ice: 1 },
};
// The edges of the cover are drawn on a grid as coarse as the heights'; they
// wander this far (m) either side of it, over about this many metres, so they
// don't come out as rows of squares.
const COVER_WANDER = 4;
const COVER_WAVE = 22;
// Boulders don't lie on a cliff: they thin out from this slope (rise over
// run) to none by this one, and bare rock that isn't steep is broken rock.
const TALUS_SLOPE = [0.7, 1.15];

// Where the forest gives way: steep ground is rock, and the view is kept open.
const ROCK_SLOPE = [1.0, 1.7]; // rise over run: trees thin from, gone by
const VIEW_CLEAR = 6; // m round the spot the photo was taken from with no trees…
const VIEW_WEDGE = [26, 0.6]; // …nor for this far in front of it, this many radians either side
export const VIEW_WORN = 2.6; // m of bare, trodden ground where people stand to look
const TRAILHEAD_CLEAR = 5; // m
// Where you arrive (at the trailhead, at the view) the camera comes in this
// far behind you (m), and no tree stands within this much of it (m), so the
// first thing you see isn't the inside of one.
const CAMERA_BACK = 6;
const CAMERA_CLEAR = 3.5;

// A number of its own for a hike's id.
function hashId(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

// ── Packing ──────────────────────────────────────────────────────────────────
// Heights go as tenths of a metre, each the difference from the one before
// (along a row; the first of a row from the first of the row before), as
// zig-zag varints, in base64. Real hillsides change slowly at this spacing, so
// most fit in one byte.
const HEIGHT_UNIT = 0.1;

const toB64 = (bytes) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const fromB64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

// (n to a row; as many rows, unless it says)
export function packHeights(h, n, rows = n) {
  const out = [];
  let rowFirst = 0;
  let prev = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < n; i++) {
      const q = Math.round(h[j * n + i] / HEIGHT_UNIT);
      const d = q - (i === 0 ? rowFirst : prev);
      if (i === 0) rowFirst = q;
      prev = q;
      let z = d >= 0 ? d * 2 : -d * 2 - 1;
      while (z >= 128) {
        out.push((z & 127) | 128);
        z = Math.floor(z / 128);
      }
      out.push(z);
    }
  }
  return toB64(Uint8Array.from(out));
}

export function unpackHeights(s, n, rows = n) {
  const b = fromB64(s);
  const h = new Float32Array(n * rows);
  let p = 0;
  let rowFirst = 0;
  let prev = 0;
  for (let k = 0; k < n * rows; k++) {
    let z = 0;
    let mul = 1;
    let byte;
    do {
      byte = b[p++];
      z += (byte & 127) * mul;
      mul *= 128;
    } while (byte & 128);
    const d = z & 1 ? -(z + 1) / 2 : z / 2;
    const q = (k % n === 0 ? rowFirst : prev) + d;
    if (k % n === 0) rowFirst = q;
    prev = q;
    h[k] = q * HEIGHT_UNIT;
  }
  return h;
}

// Shore distances: one signed byte each, half a metre a step.
export function packShore(d) {
  const b = new Uint8Array(d.length);
  for (let k = 0; k < d.length; k++) b[k] = Math.max(-127, Math.min(127, Math.round(d[k] / SHORE_UNIT))) & 255;
  return toB64(b);
}

export function unpackShore(s) {
  const b = fromB64(s);
  const d = new Float32Array(b.length);
  for (let k = 0; k < b.length; k++) d[k] = (b[k] > 127 ? b[k] - 256 : b[k]) * SHORE_UNIT;
  return d;
}

// Cover: one byte a point (0 for nothing said, else 1 + its place in the
// cover's own list of kinds), as runs: the byte, then how many in a row as a
// varint, in base64. Woods and screes are big, so a row is a few runs.
export function packCover(c) {
  const out = [];
  for (let k = 0; k < c.length; ) {
    let run = 1;
    while (k + run < c.length && c[k + run] === c[k]) run++;
    out.push(c[k]);
    let z = run;
    while (z >= 128) {
      out.push((z & 127) | 128);
      z = Math.floor(z / 128);
    }
    out.push(z);
    k += run;
  }
  return toB64(Uint8Array.from(out));
}

export function unpackCover(s, count) {
  const b = fromB64(s);
  const c = new Uint8Array(count);
  let k = 0;
  for (let p = 0; p < b.length && k < count; ) {
    const v = b[p++];
    let run = 0;
    let mul = 1;
    let byte;
    do {
      byte = b[p++];
      run += (byte & 127) * mul;
      mul *= 128;
    } while (byte & 128);
    c.fill(v, k, Math.min(count, k + run));
    k += run;
  }
  return c;
}

// ── The land ─────────────────────────────────────────────────────────────────
const NONE = [];

// A shore kept on a grid of its own, f = { x, z, w, h, cell, d }: the signed
// distance at (lx, lz), measured from the land's middle as x and z are.
// SHORE_FAR off the grid.
function fieldAt(f, lx, lz) {
  const gx = (lx - f.x) / f.cell;
  const gz = (lz - f.z) / f.cell;
  if (gx < 0 || gz < 0 || gx > f.w - 1 || gz > f.h - 1) return SHORE_FAR;
  const i = Math.min(f.w - 2, Math.floor(gx));
  const j = Math.min(f.h - 2, Math.floor(gz));
  const u = gx - i;
  const v = gz - j;
  const k = j * f.w + i;
  const D = f.d;
  return (D[k] * (1 - u) + D[k + 1] * u) * (1 - v) + (D[k + f.w] * (1 - u) + D[k + f.w + 1] * u) * v;
}
const cr = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
// A w × h grid of heights H at (fx, fz) in its own cells, smoothly
// interpolated (Catmull-Rom), and level with its edge past it.
function gridAt(H, w, h, fx, fz) {
  fx = Math.min(w - 1.001, Math.max(0, fx));
  fz = Math.min(h - 1.001, Math.max(0, fz));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const row = (jj) => {
    const r = Math.min(h - 1, Math.max(0, jj)) * w;
    return cr(H[r + Math.max(0, i - 1)], H[r + i], H[r + i + 1], H[r + Math.min(w - 1, i + 2)], u);
  };
  return cr(row(j - 1), row(j), row(j + 1), row(j + 2), v);
}

export class Landform {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.cx = def.at[0];
    this.cz = def.at[1];
    this.radius = def.radius;
    this.fade = def.fade;
    this.outer = def.radius + def.fade;
    const g = def.ground;
    this.n = g.n;
    this.cell = g.cell;
    this.half = ((g.n - 1) / 2) * g.cell;
    this.h = unpackHeights(g.heights, g.n);
    const f = g.fine;
    this.fine = f ? { x: f.x, z: f.z, w: f.w, h: f.h, cell: f.cell, H: unpackHeights(f.heights, f.w, f.h) } : null;
    this.lakes = (def.lakes || []).map((l) => ({ ...l, sea: !!l.sea, d: unpackShore(l.shore) }));
    this.beaches = (def.beaches || []).map((b) => ({ ...b, d: unpackShore(b.shore) }));
    this.view = def.view;
    this.trailhead = def.trailhead;
    this.trees = { cover: 0.85, species: 0.6, ...def.trees };
    this.country = countryOf(def.country);
    // its lakes and streams frozen over, if its country's are (and it has no sea)
    this.frozen = !!this.country.frozen && !this.lakes.some((l) => l.sea);
    this.scale = def.scale || 0.2;
    this.base = def.base || 0;
    // what covers it, as COVER's kinds (1 + index; 0 nothing said), and the
    // last answer coverAt() gave
    this.cover = null;
    if (def.cover) {
      const own = unpackCover(def.cover.cells, g.n * g.n);
      const to = Uint8Array.from([0, ...def.cover.kinds.map((k) => COVER.indexOf(k) + 1)]);
      this.cover = own.map((v) => to[v] || 0);
      this._wander = createSimplex2(hashId(def.id));
    }
    this._cw = new Float64Array(COVER.length + 1);
    this._cqx = NaN;
    this._cqz = NaN;
    // where snow lies on it: where it says (a photo taken in winter), or
    // where its country has it
    const c = this.country;
    this.snowline = 'snowline' in def ? def.snowline : c.snowline;
    // whether it has ground above the trees, or snow: a treeline, a snow
    // line, tundra or ice
    this.high = !!(c.treeline || this.snowline || (this.cover && this.cover.some((v) => v && (COVER_IS[COVER[v - 1]].above || COVER_IS[COVER[v - 1]].ice))));
    this._bucketPaths(def.paths || []);
    // its streams, as pieces of channel: made by settled(), once it's known
    // how high the land stands
    this.segs = [];
    this._streamBuckets = new Map();
    // set by WorldGen.settle(): added to every height
    this.offset = 0;
    // what the last trail() / shore() found
    this.tx = 0;
    this.tz = 0;
    this.level = 0;
    this._qx = NaN;
    this._qz = NaN;
    this._qd = TRAIL_REACH;
  }

  // 1 on the real land, 0 past it, easing between.
  weight(x, z) {
    const dx = x - this.cx;
    const dz = z - this.cz;
    const r2 = dx * dx + dz * dz;
    if (r2 >= this.outer * this.outer) return 0;
    if (r2 <= this.radius * this.radius) return 1;
    return 1 - smoothstep(this.radius, this.outer, Math.sqrt(r2));
  }

  // Metres past the outer edge (negative inside).
  clearance(x, z) {
    return Math.hypot(x - this.cx, z - this.cz) - this.outer;
  }

  // The real ground at (x, z), relative to the land's lowest point, smoothly
  // interpolated (Catmull-Rom) between the grid's heights: the finer grid's,
  // where there is one.
  raw(x, z) {
    const f = this.fine;
    if (f) {
      const fx = (x - this.cx - f.x) / f.cell;
      const fz = (z - this.cz - f.z) / f.cell;
      // metres in from its edge
      const m = Math.min(fx, fz, f.w - 1 - fx, f.h - 1 - fz) * f.cell;
      if (m > 0) {
        const g = gridAt(f.H, f.w, f.h, fx, fz);
        if (m >= FINE_EDGE) return g;
        const h = this._coarse(x, z);
        return h + (g - h) * smoothstep(0, FINE_EDGE, m);
      }
    }
    return this._coarse(x, z);
  }

  _coarse(x, z) {
    return gridAt(this.h, this.n, this.n, (x - this.cx + this.half) / this.cell, (z - this.cz + this.half) / this.cell);
  }

  // The spacing of the heights at (x, z).
  cellAt(x, z) {
    const f = this.fine;
    if (!f) return this.cell;
    const fx = (x - this.cx - f.x) / f.cell;
    const fz = (z - this.cz - f.z) / f.cell;
    return fx > 0 && fz > 0 && fx < f.w - 1 && fz < f.h - 1 ? f.cell : this.cell;
  }

  // Rise over run of the real ground.
  slope(x, z) {
    const e = this.cellAt(x, z) * 0.5;
    return Math.hypot(this.raw(x + e, z) - this.raw(x - e, z), this.raw(x, z + e) - this.raw(x, z - e)) / (2 * e);
  }

  // The ground, with the trails cut into the hillside as level benches: across
  // the tread it stands at the height of the trail's centreline.
  ground(x, z) {
    const h = this.raw(x, z);
    const d = this.trail(x, z);
    if (d >= TRAIL_HALF + BENCH) return h;
    const at = this.raw(this.tx, this.tz);
    return h + (at - h) * (1 - smoothstep(TRAIL_HALF * 0.6, TRAIL_HALF + BENCH, d));
  }

  // ── Trails ─────────────────────────────────────────────────────────────────
  _bucketPaths(paths) {
    const seg = [];
    for (const p of paths) for (let k = 0; k + 3 < p.length; k += 2) seg.push(p[k], p[k + 1], p[k + 2], p[k + 3]);
    this.seg = Float32Array.from(seg);
    this.buckets = new Map();
    const reach = TRAIL_REACH;
    for (let s = 0; s < this.seg.length; s += 4) {
      const [ax, az, bx, bz] = [this.seg[s], this.seg[s + 1], this.seg[s + 2], this.seg[s + 3]];
      const i0 = Math.floor((Math.min(ax, bx) - reach) / BUCKET);
      const i1 = Math.floor((Math.max(ax, bx) + reach) / BUCKET);
      const j0 = Math.floor((Math.min(az, bz) - reach) / BUCKET);
      const j1 = Math.floor((Math.max(az, bz) + reach) / BUCKET);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = i * 65536 + j;
          let list = this.buckets.get(k);
          if (!list) this.buckets.set(k, (list = []));
          list.push(s);
        }
      }
    }
  }

  // Metres to the nearest trail's centreline (TRAIL_REACH if further than
  // that), and its nearest point in this.tx, this.tz. Asked twice running for
  // one spot (the path mask, then the height), so the last answer is kept.
  trail(x, z) {
    if (x === this._qx && z === this._qz) return this._qd;
    this._qx = x;
    this._qz = z;
    const lx = x - this.cx;
    const lz = z - this.cz;
    const list = this.buckets.get(Math.floor(lx / BUCKET) * 65536 + Math.floor(lz / BUCKET));
    let best = TRAIL_REACH * TRAIL_REACH;
    let bx = x;
    let bz = z;
    if (list) {
      const S = this.seg;
      for (let q = 0; q < list.length; q++) {
        const s = list[q];
        const ax = S[s];
        const az = S[s + 1];
        const dx = S[s + 2] - ax;
        const dz = S[s + 3] - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((lx - ax) * dx + (lz - az) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t;
        const pz = az + dz * t;
        const d2 = (lx - px) ** 2 + (lz - pz) ** 2;
        if (d2 < best) {
          best = d2;
          bx = px + this.cx;
          bz = pz + this.cz;
        }
      }
    }
    this.tx = bx;
    this.tz = bz;
    this._qd = Math.sqrt(best);
    return this._qd;
  }

  // ── Streams ────────────────────────────────────────────────────────────────
  // Called once the land's heights are settled in the world. Makes each
  // stream into pieces of channel as water.js wants them (see Water._hit):
  //   pts, count   its points (world x, z), and how many stretches
  //   s            metres along the piece at each point
  //   W            the water's level at each point
  //   acc0, acc1   how much water it carries at each end
  //   w0, w1       its half-width at each end
  //   LB           the level its pools step down to
  // The water never runs uphill: its level is the ground under the line,
  // less a little, and no higher than anywhere upstream. Where the map's line
  // strays up a bank, it cuts through. It comes down to the level of what it
  // runs into: a lake, the sea, or another stream, which carries its water
  // on from there (the map draws one stream as several lines, end to end,
  // as often as not). One that ends on dry land dwindles away.
  settled() {
    this.segs = [];
    this._streamBuckets = new Map();
    // each line, in steps
    const all = [];
    for (const st of this.def.streams || []) {
      if (!st.pts) continue; // only its name: the land isn't here
      const P = [];
      for (let k = 0; k + 3 < st.pts.length; k += 2) {
        const [ax, az, bx, bz] = [st.pts[k] + this.cx, st.pts[k + 1] + this.cz, st.pts[k + 2] + this.cx, st.pts[k + 3] + this.cz];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STREAM_STEP));
        for (let i = k ? 1 : 0; i <= steps; i++) P.push([ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps]);
      }
      if (P.length < 2) continue;
      const last = P.length - 1;
      const along = [0];
      for (let i = 1; i <= last; i++) along.push(along[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      all.push({ big: !!st.big, P, last, along, into: null, at: 0, fed: [], W: null, acc: null });
    }
    // what each runs into: the stream whose line its end is on (anywhere
    // but that one's own end: two that end together both run on into a third)
    for (const a of all) {
      const [ex, ez] = a.P[a.last];
      let best = STREAM_JOIN;
      for (const b of all) {
        if (b === a) continue;
        for (let i = 0; i < b.last; i++) {
          const d = Math.hypot(b.P[i][0] - ex, b.P[i][1] - ez);
          if (d < best) [best, a.into, a.at] = [d, b, i];
        }
      }
      if (a.into) a.into.fed.push(a);
    }
    // How high its water stands: worked out from the bottom up, since each
    // comes down to what it runs into. (W is set before that is asked, so a
    // ring of streams, which the map shouldn't have, ends.)
    const levels = (a) => {
      if (a.W) return;
      a.W = [];
      const [ex, ez] = a.P[a.last];
      let mouth = -Infinity;
      if (a.into) {
        levels(a.into);
        mouth = a.into.W[a.at] ?? -Infinity;
      } else if (this.shore(ex, ez) < 3) mouth = this.level + this.offset;
      a.mouth = mouth > -Infinity;
      let low = Infinity;
      for (let i = 0; i <= a.last; i++) {
        low = Math.min(low, this.raw(a.P[i][0], a.P[i][1]) + this.offset - STREAM_CUT);
        a.W.push(Math.max(low, mouth));
      }
    };
    // How much it carries: worked out from the top down. It gathers as it
    // goes, and takes on what runs into it. One that comes onto the land at
    // its edge is running already.
    const carries = (a) => {
      if (a.acc) return;
      a.acc = [];
      const takes = new Float64Array(a.last + 1);
      for (const f of a.fed) {
        carries(f);
        takes[f.at] += f.acc[f.last] ?? 0;
      }
      const enters = Math.hypot(a.P[0][0] - this.cx, a.P[0][1] - this.cz) > this.radius - SEA_EDGE;
      let got = takes[0] > 0 ? 0 : enters ? STREAM_ENTERS : STREAM_SPRING;
      for (let i = 0; i <= a.last; i++) {
        got += takes[i];
        a.acc.push(a.big ? STREAM_RIVER : Math.min(STREAM_MOST, got + a.along[i] * STREAM_GAIN));
      }
      a.fedAtTop = takes[0] > 0;
    };
    for (const a of all) {
      levels(a);
      carries(a);
    }
    for (const { P, last, along, W, acc, mouth, fedAtTop } of all) {
      const half = acc.map(channelHalf);
      // it rises from nothing, unless another runs into the top of it, and
      // dwindles to nothing unless it has somewhere to run to
      if (!fedAtTop) half[0] = 0;
      if (!mouth) half[last] = 0;
      for (let a = 0; a < last; a += STREAM_PIECE) {
        const b = Math.min(last, a + STREAM_PIECE);
        const seg = {
          real: true,
          frozen: this.frozen,
          count: b - a,
          pts: new Float64Array((b - a + 1) * 2),
          s: new Float64Array(b - a + 1),
          W: new Float64Array(b - a + 1),
          acc0: acc[a],
          acc1: acc[b],
          w0: half[a],
          w1: half[b],
          sa: -1,
          LB: W[last],
          minX: Infinity,
          maxX: -Infinity,
          minZ: Infinity,
          maxZ: -Infinity,
        };
        for (let i = a; i <= b; i++) {
          seg.pts[(i - a) * 2] = P[i][0];
          seg.pts[(i - a) * 2 + 1] = P[i][1];
          seg.s[i - a] = along[i] - along[a];
          seg.W[i - a] = W[i];
          seg.minX = Math.min(seg.minX, P[i][0] - STREAM_REACH);
          seg.maxX = Math.max(seg.maxX, P[i][0] + STREAM_REACH);
          seg.minZ = Math.min(seg.minZ, P[i][1] - STREAM_REACH);
          seg.maxZ = Math.max(seg.maxZ, P[i][1] + STREAM_REACH);
        }
        this.segs.push(seg);
        const B = STREAM_BUCKET;
        for (let j = Math.floor(seg.minZ / B); j <= Math.floor(seg.maxZ / B); j++) {
          for (let i = Math.floor(seg.minX / B); i <= Math.floor(seg.maxX / B); i++) {
            const key = `${i},${j}`;
            if (!this._streamBuckets.has(key)) this._streamBuckets.set(key, []);
            this._streamBuckets.get(key).push(seg);
          }
        }
      }
    }
  }

  // The pieces of stream that could reach (x, z): hand each to Water._hit.
  streamsNear(x, z) {
    return this._streamBuckets.get(`${Math.floor(x / STREAM_BUCKET)},${Math.floor(z / STREAM_BUCKET)}`) || NONE;
  }

  // ── Lakes ──────────────────────────────────────────────────────────────────
  // Signed metres to the nearest lake's shore (negative in the water), that
  // lake's level (relative, like raw()) in this.level, and whether it is the
  // sea in this.sea. SHORE_FAR if there's no lake near.
  shore(x, z) {
    let best = SHORE_FAR;
    this.sea = false;
    const fx = (x - this.cx + this.half) / this.cell;
    const fz = (z - this.cz + this.half) / this.cell;
    for (const l of this.lakes) {
      if (l.cell) {
        // on a grid of its own
        const d = fieldAt(l, x - this.cx, z - this.cz);
        if (d < best) {
          best = d;
          this.level = l.level;
          this.sea = l.sea;
        }
        continue;
      }
      const [i0, j0, w, h] = l.box;
      const gx = fx - i0;
      const gz = fz - j0;
      if (gx < 0 || gz < 0 || gx > w - 1 || gz > h - 1) continue;
      const i = Math.min(w - 2, Math.floor(gx));
      const j = Math.min(h - 2, Math.floor(gz));
      const u = gx - i;
      const v = gz - j;
      const D = l.d;
      const k = j * w + i;
      const d = (D[k] * (1 - u) + D[k + 1] * u) * (1 - v) + (D[k + w] * (1 - u) + D[k + w + 1] * u) * v;
      if (d < best) {
        best = d;
        this.level = l.level;
        this.sea = l.sea;
      }
    }
    return best;
  }

  // Signed metres to the edge of the nearest beach the map has here
  // (negative on it). SHORE_FAR if there's none near.
  strand(x, z) {
    let best = SHORE_FAR;
    for (const b of this.beaches) best = Math.min(best, fieldAt(b, x - this.cx, z - this.cz));
    return best;
  }

  // How far the shore at (x, z) is a beach, 0..1: all of it in country whose
  // land comes down gently to the water; where the land meets the sea as it
  // really does, only where the map has a beach.
  beachy(x, z) {
    if (this.country.shore !== 'rock') return 1;
    return this.beaches.length ? 1 - smoothstep(-1, 3, this.strand(x, z)) : 0;
  }

  // Whether (x, z), out past the edge of the land, is where the real sea
  // runs on: the game's sea stops at a bank just short of the edge, with
  // forest beyond, but seen from on the land it should lie open to the
  // horizon. It does where the edge of the land, in from here, is sea.
  // (For the far view: sets this.level, as shore() does.)
  openSea(x, z) {
    if (!this.lakes.some((l) => l.sea)) return false;
    const dx = x - this.cx;
    const dz = z - this.cz;
    const r = Math.hypot(dx, dz);
    const edge = this.radius - SEA_EDGE;
    if (r < edge) return false;
    return this.shore(this.cx + (dx / r) * edge, this.cz + (dz / r) * edge) < -SEA_EDGE * 0.2 && this.sea;
  }

  // How churned up the sea is u metres from its shore (negative in the
  // water): white where it breaks, a chop further out.
  surf(u) {
    return seaSurf(u);
  }

  // The ground near a lake whose shore is u metres away (negative in the
  // water), given the ground h there and the lake's level (both absolute).
  // beach: 0..1, how far the shore there is a beach (see beachy()); where it
  // isn't, the land is left to meet the water as steeply as it does.
  lakeBed(u, h, level, beach = 1) {
    if (u < 0) {
      const T = level - LAKE_DEPTH * (1 - Math.exp(-(-u + 0.15) / LAKE_SHELF));
      return Math.min(h, T) + (T - Math.min(h, T)) * smoothstep(-LAKE_SHELF, 0, u);
    }
    // a beach that rises gently, then meets the land
    const T = level + 0.22 * smoothstep(0, 2, u) + 0.07 * u;
    let out = T + (h - T) * smoothstep(0, BEACH, u);
    // a rocky shore: the real ground, down to a ledge at the water
    if (beach < 1) out += (Math.max(h, level + 0.3 + 0.5 * smoothstep(0, 1.5, u)) - out) * (1 - beach);
    if (u < LAKE_REGION + 2) {
      const floor = level + 0.2 * smoothstep(0, 1.2, u) - 0.3 * Math.max(0, u - LAKE_REGION) ** 2;
      if (out < floor) out = floor;
    }
    return out;
  }

  // ── What grows ─────────────────────────────────────────────────────────────
  // How thickly wooded (0..1): the land's own cover, thinning to bare rock on
  // steep ground.
  // Where the map says what covers the land, as it says: thick in the woods,
  // the odd tree on a scree, none on bare rock or ice. Above the country's
  // treeline (if it has one) the trees thin out to none.
  forest(x, z) {
    if (this.trees.cover <= 0) return TREELESS;
    if (!this.cover && !this.country.treeline) return this.trees.cover * (1 - this.rocky(x, z));
    let f = this.trees.cover;
    if (this.cover) {
      const w = this.coverAt(x, z);
      f = w[0] * this.trees.cover;
      for (let k = 1; k < w.length; k++) if (w[k] > 0) f += w[k] * (COVER_IS[COVER[k - 1]].trees ?? this.trees.cover);
    }
    const up = this.treeline(x, z);
    if (f <= 0) return f;
    return f * (1 - this.rocky(x, z)) * (1 - up) + TREELESS * up;
  }

  // How far (x, z) is bare rock for being steep, 0..1: where the trees give
  // out, and the grass with them.
  rocky(x, z) {
    return smoothstep(ROCK_SLOPE[0], ROCK_SLOPE[1], this.slope(x, z));
  }

  // ── Cover ──────────────────────────────────────────────────────────────────
  // How much of each kind of cover (x, z) is under: a share for nothing said,
  // then one for each of COVER, adding up to 1, blended between the grid's
  // points (whose edges wander a little). The same array each time: copy it
  // to keep it.
  coverAt(x, z) {
    const w = this._cw;
    if (x === this._cqx && z === this._cqz) return w;
    this._cqx = x;
    this._cqz = z;
    w.fill(0);
    if (!this.cover) {
      w[0] = 1;
      return w;
    }
    const nz = this._wander;
    const f = 1 / COVER_WAVE;
    const wx = x + nz(x * f, z * f) * COVER_WANDER;
    const wz = z + nz(x * f + 31.7, z * f - 12.9) * COVER_WANDER;
    const n = this.n;
    const fx = Math.min(n - 1.001, Math.max(0, (wx - this.cx + this.half) / this.cell));
    const fz = Math.min(n - 1.001, Math.max(0, (wz - this.cz + this.half) / this.cell));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const C = this.cover;
    const k = j * n + i;
    w[C[k]] += (1 - u) * (1 - v);
    w[C[k + 1]] += u * (1 - v);
    w[C[k + n]] += (1 - u) * v;
    w[C[k + n + 1]] += u * v;
    return w;
  }

  // How much the cover at (x, z) is what COVER_IS says `what` is (0..1).
  _covered(x, z, what) {
    if (!this.cover) return 0;
    const w = this.coverAt(x, z);
    let sum = 0;
    for (let k = 1; k < w.length; k++) if (w[k] > 0) sum += w[k] * COVER_IS[COVER[k - 1]][what];
    return sum;
  }

  // How much of the ground is bare stone (a scree, bare rock), 0..1.
  bare(x, z) {
    return this._covered(x, z, 'bare');
  }

  // How much of it is a thicket of shrubs, 0..1.
  thicket(x, z) {
    return this._covered(x, z, 'thicket');
  }

  // How thickly strewn with boulders, 0..1: a scree under a cliff, and bare
  // rock wherever it isn't too steep to lie on.
  talus(x, z) {
    const t = this._covered(x, z, 'talus');
    return t > 0 ? t * (1 - smoothstep(TALUS_SLOPE[0], TALUS_SLOPE[1], this.slope(x, z))) : 0;
  }

  // The real height (m above the sea) of the ground at (x, z).
  realHeight(x, z) {
    return this.base + this.raw(x, z) / this.scale;
  }

  // How far up through the country's treeline (x, z) is, 0..1 (0 with none).
  treeline(x, z) {
    const t = this.country.treeline;
    return t ? smoothstep(t[0], t[1], this.realHeight(x, z)) : 0;
  }

  // How far (x, z) is ground above the trees, 0..1: tundra where the map has
  // it; elsewhere, by the country's treeline, wherever the map says nothing
  // else (a scree is a scree however high).
  above(x, z) {
    if (!this.high) return 0;
    const up = this.treeline(x, z);
    if (!this.cover) return up;
    const w = this.coverAt(x, z);
    let a = (w[0] + w[COVER.indexOf('meadow') + 1] + w[COVER.indexOf('wood') + 1]) * up;
    for (let k = 1; k < w.length; k++) if (w[k] > 0) a += w[k] * COVER_IS[COVER[k - 1]].above;
    return Math.min(1, a);
  }

  // How much snow lies at (x, z), 0..1: all of it on the map's glaciers and
  // snowfields; elsewhere, by its snow line (its own, or its country's), more
  // the higher up (patchy at first: the ground shader lays it in drifts).
  snow(x, z) {
    if (!this.high) return 0;
    const s = this.snowline;
    const ice = this._covered(x, z, 'ice');
    const lying = s ? smoothstep(s[0], s[1], this.realHeight(x, z)) : 0;
    return ice + (1 - ice) * lying;
  }

  // Metres past the edge of the ground kept clear of trees (negative inside):
  // round the spot the photo was taken from and the view in front of it, and
  // where the walk begins, and behind both where the camera comes in. The
  // forest floor is left as it is; only nothing stands on it.
  clearing(x, z) {
    let best = 1e9;
    const lx = x - this.cx;
    const lz = z - this.cz;
    // facing (fx, fz) from (px, pz): how far outside the camera's clearing
    const camera = (px, pz, fx, fz) => Math.hypot(lx - px + fx * CAMERA_BACK, lz - pz + fz * CAMERA_BACK) - CAMERA_CLEAR;
    const v = this.view;
    if (v) {
      const dx = lx - v.x;
      const dz = lz - v.z;
      const d = Math.hypot(dx, dz);
      best = d - VIEW_CLEAR;
      if (v.bearing !== null && v.bearing !== undefined) {
        // the angle off the line the camera looked along, as metres of arc
        const b = (v.bearing * Math.PI) / 180;
        const [fx, fz] = [Math.sin(b), -Math.cos(b)];
        if (d > 0) {
          const off = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
          best = Math.min(best, Math.max(d - VIEW_WEDGE[0], (off - VIEW_WEDGE[1]) * d));
        }
        best = Math.min(best, camera(v.x, v.z, fx, fz));
      }
    }
    const t = this.trailhead;
    if (t) {
      best = Math.min(best, Math.hypot(lx - t.x, lz - t.z) - TRAILHEAD_CLEAR);
      best = Math.min(best, camera(t.x, t.z, Math.sin(t.yaw), Math.cos(t.yaw)));
    }
    // nothing stands on a frozen lake
    if (this.frozen) best = Math.min(best, this.shore(x, z) - ICE_CLEAR);
    return best;
  }

  // Metres from the spot the photo was taken from.
  fromView(x, z) {
    return this.view ? Math.hypot(x - this.cx - this.view.x, z - this.cz - this.view.z) : 1e9;
  }

  // Broadleaf (-1) to conifers (1), with a little of the forest's own variety.
  species(x, z, own) {
    return this.trees.species + own * 0.25;
  }

  // World positions of the spots that matter.
  world(spot) {
    return spot ? { ...spot, x: spot.x + this.cx, z: spot.z + this.cz } : null;
  }
}
