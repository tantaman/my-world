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
//   ground          { n, cell, heights }: an n × n grid of heights `cell`
//                   apart, centred on `at`, packed by packHeights()
//   lakes           [{ name, level, box: [i0, j0, w, h], shore, sea? }]: the
//                   water level, and the signed distance to the shore
//                   (negative in the water) over part of the same grid, packed
//                   by packShore(). The sea is one of them, marked `sea`: it
//                   breaks along its shore and nothing grows in it
//   paths           [[x, z, x, z, ...], ...]: the footpaths, relative to `at`
//   view            { x, z, bearing, hour }: where the photo was taken from,
//                   which way it looked (degrees clockwise from north) and when
//   trailhead       { x, z, yaw }: where the walk to the view begins
//   trees           { cover, species }: how thickly it is wooded (0..1; at 0
//                   nothing stands on it at all, as above the tree line) and
//                   with what (-1 broadleaf .. 1 conifers), before slope and
//                   clearings thin it out
//   base            the real height (m) the heights are measured up from
//   datum           { at, outer, anchor, base }: what sets its heights in the
//                   world. The first hike in a part of the world is its own
//                   datum: its trailhead (`anchor`, a height of its own) stands
//                   at the level of the forest round it (`at`, `outer`). A hike
//                   that overlaps it shares that datum, so where the two meet
//                   the same real mountain stands at the same height.
//
// WorldGen settles it (`offset`) by its datum.

import { smoothstep } from '../noise.js';

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
// What forest() says of land with no trees: low enough that the odd tree the
// forest plants even in its barest meadows isn't planted either.
const TREELESS = -0.05;

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

export function packHeights(h, n) {
  const out = [];
  let rowFirst = 0;
  let prev = 0;
  for (let j = 0; j < n; j++) {
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

export function unpackHeights(s, n) {
  const b = fromB64(s);
  const h = new Float32Array(n * n);
  let p = 0;
  let rowFirst = 0;
  let prev = 0;
  for (let k = 0; k < n * n; k++) {
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

// ── The land ─────────────────────────────────────────────────────────────────
const cr = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));

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
    this.lakes = (def.lakes || []).map((l) => ({ name: l.name, sea: !!l.sea, level: l.level, box: l.box, d: unpackShore(l.shore) }));
    this.view = def.view;
    this.trailhead = def.trailhead;
    this.trees = { cover: 0.85, species: 0.6, ...def.trees };
    this._bucketPaths(def.paths || []);
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
  // interpolated (Catmull-Rom) between the grid's heights.
  raw(x, z) {
    const n = this.n;
    const fx = Math.min(n - 1.001, Math.max(0, (x - this.cx + this.half) / this.cell));
    const fz = Math.min(n - 1.001, Math.max(0, (z - this.cz + this.half) / this.cell));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const H = this.h;
    const row = (jj) => {
      const r = Math.min(n - 1, Math.max(0, jj)) * n;
      return cr(H[r + Math.max(0, i - 1)], H[r + i], H[r + i + 1], H[r + Math.min(n - 1, i + 2)], u);
    };
    return cr(row(j - 1), row(j), row(j + 1), row(j + 2), v);
  }

  // Rise over run of the real ground.
  slope(x, z) {
    const e = this.cell * 0.5;
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

  // How churned up the sea is u metres from its shore (negative in the
  // water): white where it breaks, a chop further out.
  surf(u) {
    return CHOP + (SURF - CHOP) * smoothstep(-SURF_REACH, -1, u);
  }

  // The ground near a lake whose shore is u metres away (negative in the
  // water), given the ground h there and the lake's level (both absolute).
  lakeBed(u, h, level) {
    if (u < 0) {
      const T = level - LAKE_DEPTH * (1 - Math.exp(-(-u + 0.15) / LAKE_SHELF));
      return Math.min(h, T) + (T - Math.min(h, T)) * smoothstep(-LAKE_SHELF, 0, u);
    }
    // a beach that rises gently, then meets the land
    const T = level + 0.22 * smoothstep(0, 2, u) + 0.07 * u;
    let out = T + (h - T) * smoothstep(0, BEACH, u);
    if (u < LAKE_REGION + 2) {
      const floor = level + 0.2 * smoothstep(0, 1.2, u) - 0.3 * Math.max(0, u - LAKE_REGION) ** 2;
      if (out < floor) out = floor;
    }
    return out;
  }

  // ── What grows ─────────────────────────────────────────────────────────────
  // How thickly wooded (0..1): the land's own cover, thinning to bare rock on
  // steep ground.
  forest(x, z) {
    if (this.trees.cover <= 0) return TREELESS;
    return this.trees.cover * (1 - smoothstep(ROCK_SLOPE[0], ROCK_SLOPE[1], this.slope(x, z)));
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
