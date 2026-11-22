// Where the roads run: two-lane country roads between neighbouring towns,
// grown from the seed like the railway and the towns themselves.
//
// The towns are on a grid of CELL-metre squares (towns/towns.js). Each town
// may have a road east and a road south, to the town in the next square that
// way, or, if that square has none, the one beyond it: a chance (CHANCE) for
// each, kept only if the land will take a road there. So the roads make a
// network that runs on from town to town as far as the land allows, with
// gaps where it doesn't, or where the chance said no: an occasional network,
// thicker in the lowlands and hills and thin in the mountains, where few
// roads can climb, and none at all near the real places brought in from
// photos (world/landforms.js), whose land isn't the forest's.
//
// Every road comes into a town at the near end of its main street, where the
// town already has its water tower or its well "where the road comes in":
// along the street's line out to the town's gate (APPROACH), where the
// roads meet, and from there each sets out the way it is going (within
// FAN_MOST of straight on). Between the gates a road is found the way a
// surveyor would: the least costly way over the land on a grid (A*, over
// where and which way it's heading), where climbing hard, turning, crossing
// a hillside, a stream or the railway all cost, and lakes, the old places,
// the towns' lots and whatever else was there first can't be crossed at all.
// Then a smooth curve through it, no bend tighter than MIN_RADIUS, and the
// road's height along it: never steeper than GRADE (a little more for a
// short way out of a gate), never under the ground or in the water. A road that would need a bridge higher than BRIDGE_MOST,
// or too much of it on bridges or over water, isn't there.
//
// The railway is crossed on the level, where its rail is low enough over the
// ground (a level crossing): the road comes up to the top of the rail there.
// Where the rail is high on a bank or a trestle a road goes round, or isn't
// there.
//
// Nothing here changes what a seed grows (a save is the diff from it): the
// road lies on the land as it is, on a low bank where the ground falls away
// and a bridge where it falls away a long way, and the plants in its way are
// hidden as their chunk grows (index.js). Everyone in a world finds the same
// roads.
//
// Surveying a road takes 30 to 120 ms, so it is a generator that can be run
// a little at a time (pump), like the railway's lines. Asking for one
// outright (link, within) finishes it there and then.
//
// No three.js in here: the tests read it, and the map asks it what to draw.
//
// A road:
//   id        `road:${ci}:${cj}:${dir}`: its town's square, and which way
//             it goes from there ('e' or 's')
//   from, to  the towns at its ends (their ids), fromName, toName
//   surface   'paved' between western towns and villages that are lived in,
//             else 'gravel' (to a ghost town, an abandoned village, an eerie town)
//   n, ds     samples along it, ds metres apart, from the gate of `from` to
//             the gate of `to`
//   length    (m)
//   x, z      where each sample is (Float64Array)
//   h         the top of the road there (m)
//   g         the ground under its middle; gl, gr the ground WIDE m out to
//             its left and right (looking along it)
//   wet       1 where it crosses water
//   cross     1 where it crosses the railway (a level crossing)
//   box       [x0, z0, x1, z1] round it, and its banks
//
// A town's gate (gateOf): where its roads meet, out past the end of its
// street. { x, z, ax, az (the way out of town, a unit vector), ex, ez (the
// end of the street), h (the top of the road at the gate), approach: { n,
// ds, h } (the road from the street to the gate) }

import { mulberry32, hash2i } from '../noise.js';
import { toWorld, onPlan } from '../landmarks/sites.js';
import { CELL } from '../towns/towns.js';
import { KINDS } from '../towns/kinds.js';
import { nearest as railNearest } from '../railway/lines.js';

export { CELL };
export const DS = 4; // m between samples along a road
export const HALF = 3.1; // m from the middle of the road to the edge of the tarmac (two lanes)
export const SHOULDER = 1.0; // m of gravel shoulder beyond it
export const WIDE = HALF + SHOULDER; // m from the middle to the edge of what is level
export const GRADE = 0.1; // the steepest a road climbs (rise over run)
export const BED = 0.14; // m the top of the road stands over the highest ground under it, at the least
const CLEAR = 1.8; // m a road keeps above water it crosses
export const BRIDGE_FROM = 2.6; // m over the ground from which a road is on a bridge, not a bank
const BRIDGE_MOST = 12; // m: no road needs a bridge higher than this...
const BRIDGE_SHARE = 0.18; // ...nor more than this much of its length on bridges
const WET_SHARE = 0.06; // ...nor more than this much of it over water
const MIN_RADIUS = 26; // m: the tightest bend...
const GATE_BEND = 24; // ...but for this far out of a gate, where it may be half that
export const APPROACH = 18; // m from the end of a town's street out to its gate
const FAN_MOST = 1.45; // radians off the line of the street that a road may leave its gate
const GATE_KEEP = 30; // m from a gate within which a road may come near its own town's lots
const CHANCE = 0.85; // that a town has a road each way (east, south), if the land takes one
const DETOUR = [1.7, 300]; // a road no longer than this many times the straight way between its gates, and this many m
const GRID = 12; // m between the points of the survey's grid
const MARGIN = 300; // m the survey looks round the straight way between the gates
export const OUT = 480; // m: the furthest a road strays out of its towns' squares
const START_CLEAR = 140; // m between a road and where people first arrive
const PAD_CLEAR = 30; // m between a road and a hand-placed structure
const KEEP = 6; // m between a road's edge and anything it keeps clear of
const LAKE_KEEP = 12; // m between a road and the shore of a lake or pond
const SLOPE_FROM = 0.12; // a hillside steeper than this (rise over run) across the road costs...
const SLOPE_COST = 6; // ...this, for each metre and each unit of slope over it
const GRADE_COST = 1.4; // what climbing at GRADE costs for each metre, over the metre itself
const HUG = 3; // points of the grid next to what's in the way that cost more...
const HUG_COST = 3; // ...this much more for each metre, nearest it
const TURN_COST = 90; // what turning a step costs, for each radian squared
const TURN_MOST = 2; // the most a step may turn from the last (moves round the compass: 2 is 45 degrees)
const STREAM_COST = 5; // for each metre over a stream...
const RIVER_COST = 20; // ...and a river
const RAIL_COST = 26; // for each metre over the railway, crossed on the level
export const CROSS_UP = 1.2; // m: a rail no higher than this over the ground is crossed level
const SMOOTH = [40, 6]; // passes of smoothing the surveyed way gets, and how many more rounds if it bends too tightly
const RAMP = [24, 0.17]; // m out of a gate (and either side of a level crossing) where a road may climb more steeply, and how steeply
const SOFT = 4; // samples either side over which the road's height is rounded off
const SALT = 0x40ad5;
const OFFSET = [3571, -7121];

const DIRS = { e: [1, 0], s: [0, 1] };
// The steps the survey takes from a point of its grid, in order round the
// compass, so that turning by one is the gentlest turn there is.
const MOVES = [
  [1, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 1],
  [-1, 2],
  [-1, 1],
  [-2, 1],
  [-1, 0],
  [-2, -1],
  [-1, -1],
  [-1, -2],
  [0, -1],
  [1, -2],
  [1, -1],
  [2, -1],
];
const key = (ci, cj, dir) => `${ci}:${cj}:${dir}`;
// What a survey yields while it waits for what it keeps clear of to be found.
const WAIT = Symbol('wait');
const _r = { d: 0, s: 0, i: 0, side: 0 };

// ── A town's gate ────────────────────────────────────────────────────────────
// Out along the line of the street from its near end (u = -len/2, where the
// road comes in), APPROACH m; the road between is the town's, whichever
// roads meet at the gate, so its height is worked out from the town alone.
const gates = new WeakMap();
export function gateOf(gen, t) {
  let g = gates.get(t);
  if (g) return g;
  const e = toWorld(t, -t.len / 2 - 3, 0);
  const o = toWorld(t, -t.len / 2 - 4, 0);
  const ax = o.x - e.x;
  const az = o.z - e.z;
  const n = Math.round(APPROACH / DS) + 1;
  const ds = APPROACH / (n - 1);
  const floor = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = e.x + ax * ds * i;
    const z = e.z + az * ds * i;
    floor[i] = Math.max(gen.height(x, z), gen.height(x + az * WIDE * 0.85, z - ax * WIDE * 0.85), gen.height(x - az * WIDE * 0.85, z + ax * WIDE * 0.85)) + BED;
  }
  const h = envelope(floor, ds);
  g = { x: e.x + ax * APPROACH, z: e.z + az * APPROACH, ax, az, ex: e.x, ez: e.z, h: h[n - 1], approach: { n, ds, h } };
  gates.set(t, g);
  return g;
}

// ── Along a road ─────────────────────────────────────────────────────────────

// Where a road is, s metres along it (clamped to its ends). Fills out.x,
// out.y (the top of the road), out.z, out.dx, out.dz (the way along, a unit
// vector) and out.grade (rise over run).
export function pointAt(road, s, out = {}) {
  const { n, ds } = road;
  const f = Math.max(0, Math.min(n - 1.000001, s / ds));
  const i = Math.floor(f);
  const j = i + 1;
  const t = f - i;
  out.x = road.x[i] + (road.x[j] - road.x[i]) * t;
  out.z = road.z[i] + (road.z[j] - road.z[i]) * t;
  out.y = road.h[i] + (road.h[j] - road.h[i]) * t;
  const dx = road.x[j] - road.x[i];
  const dz = road.z[j] - road.z[i];
  const l = Math.hypot(dx, dz) || 1;
  out.dx = dx / l;
  out.dz = dz / l;
  out.grade = (road.h[j] - road.h[i]) / l;
  return out;
}

// The way along at sample i (radians, as a yaw: (sin, cos) is the way).
export function headingAt(road, i) {
  const a = Math.max(0, i - 1);
  const b = Math.min(road.n - 1, i + 1);
  return Math.atan2(road.x[b] - road.x[a], road.z[b] - road.z[a]);
}

// ── The roads ────────────────────────────────────────────────────────────────
export class Roads {
  // gen: the WorldGen; towns: the Towns (towns/towns.js)
  // start: where people first arrive, kept clear
  // keepOff(x0, z0, x1, z1): is any of that square somewhere no road may be?
  // lines(x0, z0, x1, z1): the railway lines there (railway/lines.js Lines.within)
  // clear(x0, z0, x1, z1): what else to keep clear of there: [{ box }] (a
  //   rectangle of the world), [{ site, rects }] (rectangles in a site's own
  //   frame: landmarks/sites.js onPlan) or [{ x, z, r }] (a disc)
  // ready(x0, z0, x1, z1): whether what's to be kept clear of there is all
  //   known yet (asking for what isn't): a survey run a little at a time waits
  //   for it rather than stall finding it all at once
  constructor(gen, { towns, start = gen.findSpawn(0, 0), keepOff = () => false, lines = () => [], clear = () => [], ready = () => true } = {}) {
    this.gen = gen;
    this.towns = towns;
    this.start = start;
    this.keepOff = keepOff;
    this.lines = lines;
    this.clear = clear;
    this.ready = ready;
    this.links = new Map(); // "ci:cj:dir" -> road, or null
    this.growing = new Map(); // "ci:cj:dir" -> a survey under way
    this.queue = new Set(); // links asked about and not yet surveyed
    this.patient = true; // a survey may wait for what it keeps clear of (not when one's wanted outright)
    this.listeners = [];
  }

  // fn(road) whenever a road has been surveyed (and is there).
  onRoad(fn) {
    this.listeners.push(fn);
  }

  // The road from square (ci, cj) the way `dir` ('e', 's'), or null.
  // Surveyed now if it hasn't been.
  link(ci, cj, dir) {
    const k = key(ci, cj, dir);
    const known = this.links.get(k);
    if (known !== undefined) return known;
    const run = this.growing.get(k) || this._grow(ci, cj, dir);
    this.growing.set(k, run);
    const was = this.patient;
    this.patient = false;
    try {
      let r;
      do r = run.next();
      while (!r.done);
      return this._done(k, r.value);
    } finally {
      this.patient = was;
    }
  }

  // ...or undefined if it hasn't been surveyed yet, and then it's queued for pump().
  peek(ci, cj, dir) {
    const k = key(ci, cj, dir);
    const known = this.links.get(k);
    if (known === undefined) this.queue.add(k);
    return known;
  }

  _done(k, road) {
    this.growing.delete(k);
    this.queue.delete(k);
    this.links.set(k, road);
    if (road) for (const fn of this.listeners) fn(road);
    return road;
  }

  // The links that could come within a rectangle of the world: [ci, cj, dir].
  _candidates(x0, z0, x1, z1) {
    const out = [];
    const C = CELL;
    for (const dir of ['e', 's']) {
      const [di, dj] = DIRS[dir];
      for (let cj = Math.floor((z0 - OUT) / C) - 2 * dj; cj <= Math.floor((z1 + OUT) / C); cj++) {
        for (let ci = Math.floor((x0 - OUT) / C) - 2 * di; ci <= Math.floor((x1 + OUT) / C); ci++) out.push([ci, cj, dir]);
      }
    }
    return out;
  }

  // Roads whose box overlaps a rectangle of the world. With wait = false,
  // links not surveyed yet are left out and queued for pump().
  within(x0, z0, x1, z1, wait = true) {
    const out = [];
    for (const [ci, cj, dir] of this._candidates(x0, z0, x1, z1)) {
      const road = wait ? this.link(ci, cj, dir) : this.peek(ci, cj, dir);
      if (road && road.box[0] <= x1 && road.box[2] >= x0 && road.box[1] <= z1 && road.box[3] >= z0) out.push(road);
    }
    return out;
  }

  // Whether every road that could come within a rectangle of the world has
  // been surveyed (asking for any that haven't).
  allKnown(x0, z0, x1, z1) {
    let all = true;
    for (const [ci, cj, dir] of this._candidates(x0, z0, x1, z1)) if (this.peek(ci, cj, dir) === undefined) all = false;
    return all;
  }

  // Roads known so far within r of (x, z); the rest are queued.
  known(x, z, r) {
    return this.within(x - r, z - r, x + r, z + r, false);
  }

  // Ask for the roads within r of (x, z) to be surveyed in the background,
  // nearest first.
  prefetch(x, z, r) {
    const want = [];
    for (const [ci, cj, dir] of this._candidates(x - r, z - r, x + r, z + r)) {
      const k = key(ci, cj, dir);
      if (this.links.has(k) || this.queue.has(k)) continue;
      const [di, dj] = DIRS[dir];
      const mx = (ci + 0.5 + di * 0.75) * CELL;
      const mz = (cj + 0.5 + dj * 0.75) * CELL;
      want.push([Math.hypot(mx - x, mz - z), k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, k] of want) this.queue.add(k);
  }

  // Survey queued links for up to `ms` milliseconds. -> how many are left.
  pump(ms) {
    const t0 = performance.now();
    for (const k of this.queue) {
      let run = this.growing.get(k);
      if (!run) {
        const [ci, cj, dir] = k.split(':');
        run = this._grow(Number(ci), Number(cj), dir);
        this.growing.set(k, run);
      }
      for (;;) {
        const r = run.next();
        if (r.done) {
          this._done(k, r.value);
          break;
        }
        if (performance.now() - t0 > ms) return this.queue.size;
        // waiting for what it keeps clear of to be found: on to the next
        if (r.value === WAIT) break;
      }
      if (performance.now() - t0 > ms) break;
    }
    return this.queue.size;
  }

  // The road with this id, or null.
  byId(id) {
    const m = /^road:(-?\d+):(-?\d+):([es])$/.exec(String(id));
    return m ? this.link(Number(m[1]), Number(m[2]), m[3]) : null;
  }

  // The roads that come into town t. With wait = false, those surveyed so
  // far (the rest queued), and `undefined` in place of the list if any of
  // its links isn't known yet.
  ofTown(t, wait = true) {
    const ci = Math.floor(t.x / CELL);
    const cj = Math.floor(t.z / CELL);
    const asks = [
      [ci, cj, 'e'],
      [ci, cj, 's'],
    ];
    for (const dir of ['e', 's']) {
      const [di, dj] = DIRS[dir];
      // from the square before it, or the one before that if that has no town
      asks.push([ci - di, cj - dj, dir]);
      const before = wait ? this.towns.cell(ci - di, cj - dj) : this.towns.peek(ci - di, cj - dj);
      if (before === undefined) return wait ? [] : undefined;
      if (!before) asks.push([ci - 2 * di, cj - 2 * dj, dir]);
    }
    const out = [];
    let all = true;
    for (const [i, j, dir] of asks) {
      const road = wait ? this.link(i, j, dir) : this.peek(i, j, dir);
      if (road === undefined) all = false;
      else if (road && (road.from === t.id || road.to === t.id)) out.push(road);
    }
    return all ? out : wait ? out : undefined;
  }

  // The town in square (i, j), or null: waited for while the towns grow it
  // themselves (a little at a time), or grown now when a road is wanted outright.
  *_town(i, j) {
    let t = this.towns.peek(i, j);
    while (t === undefined && this.patient) {
      yield WAIT;
      t = this.towns.peek(i, j);
    }
    return t === undefined ? this.towns.cell(i, j) : t;
  }

  // ── Surveying a link ───────────────────────────────────────────────────────
  // A generator: it yields now and then so it can be run a little at a
  // time, and returns the road (or null). What it finds depends only on the
  // seed and the link, never on how it was run.
  *_grow(ci, cj, dir) {
    const gen = this.gen;
    const rng = mulberry32(hash2i(ci + OFFSET[0], cj + OFFSET[1], (gen.seed ^ SALT ^ (dir === 's' ? 0x9e3779 : 0)) >>> 0));
    if (rng() > CHANCE) return null;
    const [di, dj] = DIRS[dir];
    const A = yield* this._town(ci, cj);
    if (!A) return null;
    let B = yield* this._town(ci + di, cj + dj);
    if (!B) B = yield* this._town(ci + 2 * di, cj + 2 * dj);
    if (!B) return null;

    // ── The ends ──
    const gA = gateOf(gen, A);
    const gB = gateOf(gen, B);
    yield;
    const x0 = Math.min(gA.x, gB.x) - MARGIN;
    const z0 = Math.min(gA.z, gB.z) - MARGIN;
    const x1 = Math.max(gA.x, gB.x) + MARGIN;
    const z1 = Math.max(gA.z, gB.z) + MARGIN;
    if (this.keepOff(x0, z0, x1, z1)) return null;

    // ── What it keeps clear of ──
    while (this.patient && !this.ready(x0, z0, x1, z1)) yield WAIT;
    const shapes = [{ x: this.start.x, z: this.start.z, r: START_CLEAR }];
    for (const p of gen.pads) shapes.push({ x: p.x, z: p.z, r: p.r + PAD_CLEAR });
    // every town's lots and street, these two among them
    for (let j = Math.floor(z0 / CELL) - 1; j <= Math.floor(z1 / CELL) + 1; j++) {
      for (let i = Math.floor(x0 / CELL) - 1; i <= Math.floor(x1 / CELL) + 1; i++) {
        const t = this.towns.cell(i, j);
        if (t && t.box[0] <= x1 && t.box[2] >= x0 && t.box[1] <= z1 && t.box[3] >= z0) shapes.push({ site: t, rects: t.plan });
        yield;
      }
    }
    for (const s of this.clear(x0, z0, x1, z1)) shapes.push(s);
    yield;
    const lines = this.lines(x0, z0, x1, z1);
    yield;

    // ── The grid ──
    const nx = Math.ceil((x1 - x0) / GRID) + 1;
    const nz = Math.ceil((z1 - z0) / GRID) + 1;
    const N = nx * nz;
    const hg = new Float32Array(N); // the lie of the land
    const extra = new Float32Array(N); // what each metre through a point costs, over the metre
    const blocked = new Uint8Array(N);
    const w = gen.water;
    for (let j = 0; j < nz; j++) {
      const z = z0 + j * GRID;
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * GRID;
        const k = j * nx + i;
        hg[k] = gen.broadHeight(x, z, 0);
        w.probe(x, z);
        if ((w.kind === 'lake' || w.kind === 'pond' || w.kind === 'sea') && w.edge < LAKE_KEEP) blocked[k] = 1;
        else if (w.edge < 0) extra[k] += w.kind === 'river' ? RIVER_COST : STREAM_COST;
      }
      if (j % 2 === 1) yield;
    }
    const nodeX = (i) => x0 + i * GRID;
    const nodeZ = (j) => z0 + j * GRID;
    const range = (a0, a1, b0, b1) => [Math.max(0, Math.floor((a0 - x0) / GRID)), Math.min(nx - 1, Math.ceil((a1 - x0) / GRID)), Math.max(0, Math.floor((b0 - z0) / GRID)), Math.min(nz - 1, Math.ceil((b1 - z0) / GRID))];
    const m = WIDE + KEEP;
    for (const s of shapes) {
      let r;
      if (s.site) r = range(s.site.box[0] - m, s.site.box[2] + m, s.site.box[1] - m, s.site.box[3] + m);
      else if (s.box) r = range(s.box[0] - m, s.box[2] + m, s.box[1] - m, s.box[3] + m);
      else r = range(s.x - s.r - m, s.x + s.r + m, s.z - s.r - m, s.z + s.r + m);
      const [i0, i1, j0, j1] = r;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = j * nx + i;
          if (blocked[k]) continue;
          if (inShape(s, nodeX(i), nodeZ(j), m)) blocked[k] = 1;
        }
      }
      yield;
    }
    // the railway: crossed on the level where its rail is low, gone round elsewhere
    for (const line of lines) {
      for (let q = 0; q < line.n; q++) {
        if (q % 200 === 199) yield;
        const lx = line.x[q];
        const lz = line.z[q];
        if (lx < x0 - 20 || lx > x1 + 20 || lz < z0 - 20 || lz > z1 + 20) continue;
        const up = line.h[q] - line.g[q];
        const reach = railReach(line, q) + WIDE + 1;
        const [i0, i1, j0, j1] = range(lx - reach, lx + reach, lz - reach, lz + reach);
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            if (Math.hypot(nodeX(i) - lx, nodeZ(j) - lz) > reach) continue;
            const k = j * nx + i;
            if (up > CROSS_UP) blocked[k] = 1;
            else extra[k] = Math.max(extra[k], RAIL_COST);
          }
        }
      }
      for (const st of line.stations) {
        const [i0, i1, j0, j1] = range(st.box[0] - m, st.box[2] + m, st.box[1] - m, st.box[3] + m);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (onPlan(st, nodeX(i), nodeZ(j), m)) blocked[j * nx + i] = 1;
      }
      yield;
    }
    // keeping off what's in the way by a little more costs less, so the way
    // found doesn't hug it and can be eased into a smooth curve
    {
      const near = new Uint8Array(N).fill(HUG);
      for (let k = 0; k < N; k++) if (blocked[k]) near[k] = 0;
      for (let pass = 0; pass < HUG; pass++) {
        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            const k = j * nx + i;
            let d = near[k];
            if (i > 0) d = Math.min(d, near[k - 1] + 1);
            if (i < nx - 1) d = Math.min(d, near[k + 1] + 1);
            if (j > 0) d = Math.min(d, near[k - nx] + 1);
            if (j < nz - 1) d = Math.min(d, near[k + nx] + 1);
            near[k] = d;
          }
        }
      }
      for (let k = 0; k < N; k++) if (!blocked[k] && near[k] < HUG) extra[k] += (HUG_COST * (HUG - near[k])) / HUG;
      yield;
    }
    yield;
    // a hillside across the way costs: the road would need a bank down one side
    for (let j = 1; j < nz - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        const sx = (hg[k + 1] - hg[k - 1]) / (2 * GRID);
        const sz = (hg[k + nx] - hg[k - nx]) / (2 * GRID);
        const s = Math.hypot(sx, sz);
        if (s > SLOPE_FROM) extra[k] += (s - SLOPE_FROM) * SLOPE_COST * 10;
      }
    }
    yield;

    // ── The least costly way between the gates ──
    const snap = (p) => {
      const i = Math.round((p.x - x0) / GRID);
      const j = Math.round((p.z - z0) / GRID);
      return j * nx + i;
    };
    const from = snap(gA);
    const to = snap(gB);
    if (blocked[from] || blocked[to]) return null;
    const path = yield* astar({ nx, nz, hg, extra, blocked }, from, to, Math.atan2(gA.az, gA.ax), Math.atan2(-gB.az, -gB.ax));
    if (!path) return null;

    // ── A smooth curve through it ──
    const way = [[gA.x, gA.z]];
    for (let q = 1; q < path.length - 1; q++) way.push([nodeX(path[q] % nx), nodeZ(Math.floor(path[q] / nx))]);
    way.push([gB.x, gB.z]);
    const pts = resampleOpen(way, 9);
    let curve = null;
    // (the gates' own towns don't count near the gates, where the grid lets them in)
    const free = (x, z) => {
      const i = Math.round((x - x0) / GRID);
      const j = Math.round((z - z0) / GRID);
      return i >= 0 && j >= 0 && i < nx && j < nz && !blocked[j * nx + i];
    };
    for (let round = 0; round <= SMOOTH[1]; round++) {
      smooth(pts, SMOOTH[0], free);
      yield;
      curve = sampleCurve(pts, DS);
      if (tightest(curve, Math.ceil(GATE_BEND / DS)) >= MIN_RADIUS && tightest(curve) >= MIN_RADIUS / 2) break;
      curve = null;
    }
    yield;
    if (!curve || (curve.n - 1) * curve.ds > DETOUR[0] * Math.hypot(gB.x - gA.x, gB.z - gA.z) + DETOUR[1]) return null;
    // none of it may stray onto what the grid kept it off (the gates and
    // their leads are allowed in by their own towns)
    {
      const { n, x, z } = curve;
      const lead = Math.ceil(GATE_KEEP / curve.ds);
      for (let i = 0; i < n; i++) {
        const nearEnd = i < lead || i > n - 1 - lead;
        for (const s of shapes) {
          if (nearEnd && s.site && (s.site === A || s.site === B)) continue;
          if (inShape(s, x[i], z[i], WIDE + 1)) return null;
        }
      }
    }
    yield;

    // ── How high it runs ──
    const { n, ds, x, z } = curve;
    const g = new Float64Array(n);
    const gl = new Float64Array(n);
    const gr = new Float64Array(n);
    const wet = new Uint8Array(n);
    const cross = new Uint8Array(n);
    const floor = new Float64Array(n);
    const pin = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let tx = x[b] - x[a];
      let tz = z[b] - z[a];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      // (looking along the way (tx, tz), the right hand is (-tz, tx))
      gr[i] = gen.height(x[i] - tz * WIDE * 0.85, z[i] + tx * WIDE * 0.85);
      gl[i] = gen.height(x[i] + tz * WIDE * 0.85, z[i] - tx * WIDE * 0.85);
      const hc = gen.height(x[i], z[i]);
      const level = w.region > 0.5 ? w.level : -Infinity;
      g[i] = hc;
      const water = level > hc + 0.02 ? level : -Infinity;
      wet[i] = water > -Infinity ? 1 : 0;
      floor[i] = Math.max(hc, gl[i], gr[i]) + BED;
      if (wet[i]) floor[i] = Math.max(floor[i], water + CLEAR);
      if (i % 12 === 11) yield;
    }
    // over the railway, at the top of its rail
    for (const line of lines) {
      for (let i = 0; i < n; i++) {
        if (!railNearest(line, x[i], z[i], _r) || _r.d > railReach(line, _r.i) * 0.5 + 1.2) continue;
        cross[i] = 1;
        pin[i] = 1;
        floor[i] = line.h[_r.i] - 0.02;
      }
      yield;
    }
    // the ends meet their gates
    floor[0] = gA.h;
    floor[n - 1] = gB.h;
    pin[0] = pin[n - 1] = 1;
    // steeper for a short way out of a gate and up to a level crossing
    const steep = new Float64Array(n).fill(GRADE);
    const ramp = Math.ceil(RAMP[0] / ds);
    for (let i = 0; i < n; i++) {
      if (i < ramp || i >= n - 1 - ramp) steep[i] = RAMP[1];
      if (pin[i] && i > 0 && i < n - 1) for (let o = -ramp; o < ramp; o++) if (i + o >= 0 && i + o < n) steep[i + o] = Math.max(steep[i + o], RAMP[1]);
    }
    let h = envelope(floor, ds, GRADE, steep);
    // round off the tops and bottoms of the grades, but not up to the ends
    // or the railway, which stay where they are
    const soft = smoothOpen(h, SOFT);
    let since = SOFT + 1;
    const nearPin = new Uint8Array(n);
    for (let i = 0; i < n; i++) since = pin[i] ? 0 : since + 1, (nearPin[i] = since <= SOFT ? 1 : 0);
    since = SOFT + 1;
    for (let i = n - 1; i >= 0; i--) since = pin[i] ? 0 : since + 1, (nearPin[i] |= since <= SOFT ? 1 : 0);
    for (let i = 0; i < n; i++) if (!nearPin[i]) floor[i] = Math.max(soft[i], floor[i]);
    h = envelope(floor, ds, GRADE, steep);
    for (let i = 0; i < n; i++) if (pin[i] && h[i] > floor[i] + 0.05) return null;

    // ── Whether it is worth building ──
    let high = 0;
    let bridges = 0;
    let wetN = 0;
    for (let i = 0; i < n; i++) {
      const up = h[i] - g[i];
      if (up > high) high = up;
      if (up > BRIDGE_FROM) bridges++;
      wetN += wet[i];
    }
    if (high > BRIDGE_MOST || bridges > BRIDGE_SHARE * n || wetN > WET_SHARE * n) return null;

    // ── Writing it down ──
    const road = {
      id: `road:${ci}:${cj}:${dir}`,
      ci,
      cj,
      dir,
      from: A.id,
      to: B.id,
      fromName: A.name,
      toName: B.name,
      surface: lived(A) && lived(B) ? 'paved' : 'gravel',
      n,
      ds,
      length: (n - 1) * ds,
      x,
      z,
      h,
      g,
      gl,
      gr,
      wet,
      cross,
      high,
      box: null,
    };
    road.box = boxOf(road);
    road.index = indexOf(road);
    return road;
  }
}

// Whether a town is lived in, and kept up (a paved road goes there).
const lived = (t) => !KINDS[t.kind].abandoned && KINDS[t.kind].style !== 'creepy';

// Whether (x, z) is within m of a shape ({ box }, { site, rects }, { x, z, r }).
function inShape(s, x, z, m) {
  if (s.site) return onPlan(s.site, x, z, m, s.rects);
  if (s.box) return x >= s.box[0] - m && x <= s.box[2] + m && z >= s.box[1] - m && z <= s.box[3] + m;
  return Math.hypot(x - s.x, z - s.z) < s.r + m;
}

// How far out (m) from its middle the railway takes up the ground at sample
// q: to the foot of its bank, or the feet of its trestle (railway/track.js).
function railReach(line, q) {
  const up = line.h[q] - line.g[q];
  if (up > 4) return 1.3 + 0.14 * up;
  return Math.min(9, 1.25 + Math.max(0.15, up - 0.2) * 1.5);
}

// ── Surveying, by hand ───────────────────────────────────────────────────────

// The least costly way across the grid from node `from` to node `to` (A*,
// over where and which way). It sets out within FAN_MOST of the way `out`
// (radians, as atan2(dz, dx)) and comes in within FAN_MOST of `in`, the
// straighter the better. Each step costs its length, more for every metre
// through a costly point (extra), more again for climbing (GRADE_COST, and a
// great deal past GRADE), and for turning (TURN_COST); no step turns more
// than TURN_MOST from the last, so the way can be eased into bends a car can
// take. A generator (it yields now and then). -> [node, ...] or null.
function* astar({ nx, nz, hg, extra, blocked }, from, to, out, inn) {
  const N = nx * nz;
  const D = MOVES.length;
  const gs = new Float64Array(N * D).fill(Infinity);
  const came = new Int32Array(N * D).fill(-1);
  const closed = new Uint8Array(N * D);
  const heap = new Heap();
  const tx = to % nx;
  const tz = Math.floor(to / nx);
  const guess = (k) => Math.hypot((k % nx) - tx, Math.floor(k / nx) - tz) * GRID;
  const off = (d, a) => Math.abs(Math.atan2(Math.sin(ANGLES[d] - a), Math.cos(ANGLES[d] - a)));
  for (let d = 0; d < D; d++) {
    const dev = off(d, out);
    if (dev > FAN_MOST) continue;
    const st = from * D + d;
    gs[st] = TURN_COST * dev * dev;
    heap.push(st, gs[st] + guess(from));
  }
  let best = Infinity;
  let end = -1;
  let steps = 0;
  while (heap.size) {
    if (heap.peekPriority() >= best) break;
    const st = heap.pop();
    if (closed[st]) continue;
    closed[st] = 1;
    if (++steps % 1500 === 0) yield;
    const k = Math.floor(st / D);
    const d = st % D;
    const i = k % nx;
    const j = Math.floor(k / nx);
    for (let e = -TURN_MOST; e <= TURN_MOST; e++) {
      const dn = (d + e + D) % D;
      const [di, dj] = MOVES[dn];
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const q = b * nx + a;
      const sq = q * D + dn;
      if (blocked[q] || closed[sq]) continue;
      // a long step mustn't jump over what's in the way
      if (Math.abs(di) + Math.abs(dj) === 3) {
        const mi = i + Math.trunc(di / 2);
        const mj = j + Math.trunc(dj / 2);
        if (blocked[mj * nx + mi] || blocked[j * nx + a] || blocked[b * nx + i]) continue;
      } else if (di && dj && (blocked[j * nx + a] || blocked[b * nx + i])) continue;
      const len = Math.hypot(di, dj) * GRID;
      const grade = Math.abs(hg[q] - hg[k]) / len;
      let c = len * (1 + (extra[k] + extra[q]) / 2 + GRADE_COST * (grade / GRADE) ** 2);
      if (grade > GRADE * 0.8) c += len * 300 * (grade - GRADE * 0.8);
      c += TURN_COST * turnOf(d, dn) ** 2;
      const gq = gs[st] + c;
      if (gq >= gs[sq]) continue;
      gs[sq] = gq;
      came[sq] = st;
      if (q === to) {
        const dev = off(dn, inn);
        if (dev <= FAN_MOST && gq + TURN_COST * dev * dev < best) {
          best = gq + TURN_COST * dev * dev;
          end = sq;
        }
        continue;
      }
      heap.push(sq, gq + guess(q));
    }
  }
  if (end < 0) return null;
  const path = [];
  for (let st = end; st >= 0; st = came[st]) path.push(Math.floor(st / D));
  return path.reverse();
}

// How far (radians) a step along MOVES[b] turns from one along MOVES[a].
const ANGLES = MOVES.map(([di, dj]) => Math.atan2(dj, di));
function turnOf(a, b) {
  return Math.abs(Math.atan2(Math.sin(ANGLES[b] - ANGLES[a]), Math.cos(ANGLES[b] - ANGLES[a])));
}

// A binary heap of node numbers by a priority, the lowest first (ties go to
// the lower number, so the way found never depends on anything but the land).
class Heap {
  constructor() {
    this.k = [];
    this.p = [];
  }
  get size() {
    return this.k.length;
  }
  peekPriority() {
    return this.p[0];
  }
  _less(a, b) {
    return this.p[a] < this.p[b] || (this.p[a] === this.p[b] && this.k[a] < this.k[b]);
  }
  _swap(a, b) {
    [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
    [this.p[a], this.p[b]] = [this.p[b], this.p[a]];
  }
  push(k, p) {
    this.k.push(k);
    this.p.push(p);
    let i = this.k.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!this._less(i, up)) break;
      this._swap(i, up);
      i = up;
    }
  }
  pop() {
    const top = this.k[0];
    const lk = this.k.pop();
    const lp = this.p.pop();
    if (this.k.length) {
      this.k[0] = lk;
      this.p[0] = lp;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const b = a + 1;
        let m = i;
        if (a < this.k.length && this._less(a, m)) m = a;
        if (b < this.k.length && this._less(b, m)) m = b;
        if (m === i) break;
        this._swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

// A polyline ([[x, z], ...]) at even spacing, about `step` m, ends kept.
function resampleOpen(poly, step) {
  const m = poly.length;
  if (m < 2) return poly.map((p) => [...p]);
  const cum = [0];
  for (let k = 1; k < m; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
  const L = cum[m - 1];
  const n = Math.max(2, Math.round(L / step) + 1);
  const out = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1);
    while (k < m - 2 && cum[k + 1] < s) k++;
    const t = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    out.push([poly[k][0] + (poly[k + 1][0] - poly[k][0]) * t, poly[k][1] + (poly[k + 1][1] - poly[k][1]) * t]);
  }
  return out;
}

// Ease each point toward its neighbours', `passes` times: the ends (the
// gates) stay where they are.
// A point that would be eased onto somewhere the way may not go (free(x, z)
// says no) stays where it was.
function smooth(pts, passes, free = () => true) {
  const n = pts.length;
  for (let p = 0; p < passes; p++) {
    const was = pts.map((q) => [q[0], q[1]]);
    for (let k = 1; k < n - 1; k++) {
      const x = was[k][0] * 0.5 + (was[k - 1][0] + was[k + 1][0]) * 0.25;
      const z = was[k][1] * 0.5 + (was[k - 1][1] + was[k + 1][1]) * 0.25;
      if (!free(x, z)) continue;
      pts[k][0] = x;
      pts[k][1] = z;
    }
  }
}

// An open centripetal Catmull-Rom curve through pts, sampled every `step`
// m or so. -> { n, ds, x, z }
function sampleCurve(pts, step) {
  const n = pts.length;
  const dense = [];
  const P = (k) => pts[Math.max(0, Math.min(n - 1, k))];
  const knot = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6;
  for (let k = 0; k < n - 1; k++) {
    let p0 = P(k - 1);
    const p1 = P(k);
    const p2 = P(k + 1);
    let p3 = P(k + 2);
    // past the ends, carry straight on
    if (k === 0) p0 = [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    if (k === n - 2) p3 = [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const per = 6;
    for (let e = 0; e < per; e++) {
      const t = t1 + ((t2 - t1) * e) / per;
      const p = [0, 0];
      for (let c = 0; c < 2; c++) {
        const a1 = ((t1 - t) * p0[c] + t * p1[c]) / t1;
        const a2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1);
        const a3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
        const b1 = ((t2 - t) * a1 + t * a2) / t2;
        const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
        p[c] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
      }
      dense.push(p);
    }
  }
  dense.push([...pts[n - 1]]);
  const even = resampleOpen(dense, step);
  const m = even.length;
  let L = 0;
  for (let k = 1; k < m; k++) L += Math.hypot(even[k][0] - even[k - 1][0], even[k][1] - even[k - 1][1]);
  return { n: m, ds: L / (m - 1), x: Float64Array.from(even, (p) => p[0]), z: Float64Array.from(even, (p) => p[1]) };
}

// The tightest bend on a sampled curve: its radius (m).
// `skip` samples at each end are left out (a road turns out of its gate
// more tightly: it's slow there, by the junction).
export function tightest({ n, ds, x, z }, skip = 0) {
  let worst = 0;
  const span = 3;
  for (let i = Math.max(span, skip); i < n - Math.max(span, skip); i++) {
    const ha = Math.atan2(x[i] - x[i - span], z[i] - z[i - span]);
    const hb = Math.atan2(x[i + span] - x[i], z[i + span] - z[i]);
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha))) / (span * ds));
  }
  return worst > 0 ? 1 / worst : Infinity;
}

// The lowest road at least as high as `floor` everywhere that never climbs
// more steeply than GRADE (or, between samples i and i+1, steep[i] if given):
// a ramp down from every high point, both ways.
export function envelope(floor, ds, grade = GRADE, steep = null) {
  const n = floor.length;
  const h = Float64Array.from(floor);
  const fall = (i) => (steep ? steep[i] : grade) * ds;
  for (let i = 1; i < n; i++) if (h[i - 1] - fall(i - 1) > h[i]) h[i] = h[i - 1] - fall(i - 1);
  for (let i = n - 2; i >= 0; i--) if (h[i + 1] - fall(i) > h[i]) h[i] = h[i + 1] - fall(i);
  return h;
}

// A moving average along an open run, `half` samples either side (fewer at the ends).
function smoothOpen(v, half) {
  const n = v.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let c = 0;
    for (let o = -half; o <= half; o++) {
      const k = i + o;
      if (k < 0 || k >= n) continue;
      sum += v[k];
      c++;
    }
    out[i] = sum / c;
  }
  return out;
}

function boxOf(road) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < road.n; i++) {
    x0 = Math.min(x0, road.x[i]);
    z0 = Math.min(z0, road.z[i]);
    x1 = Math.max(x1, road.x[i]);
    z1 = Math.max(z1, road.z[i]);
  }
  const pad = 20;
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}

// ── How far a point is from a road ───────────────────────────────────────────
// A grid of the stretches between samples, so that "how far is (x, z) from
// the road" is a handful of sums, not a walk along it.
const INDEX = 32; // m
export const REACH = 18; // m: the furthest from the road that nearest() answers

function indexOf(road) {
  const cells = new Map();
  const { n, x, z } = road;
  for (let i = 0; i < n - 1; i++) {
    const j = i + 1;
    const gx0 = Math.floor((Math.min(x[i], x[j]) - REACH) / INDEX);
    const gx1 = Math.floor((Math.max(x[i], x[j]) + REACH) / INDEX);
    const gz0 = Math.floor((Math.min(z[i], z[j]) - REACH) / INDEX);
    const gz1 = Math.floor((Math.max(z[i], z[j]) + REACH) / INDEX);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const k = gx * 100003 + gz;
        let list = cells.get(k);
        if (!list) cells.set(k, (list = []));
        list.push(i);
      }
    }
  }
  return cells;
}

// The nearest point on a road to (x, z), if within REACH. Fills out.d (m),
// out.s (how far along), out.i (the sample before it), out.t (how far on to
// the next, 0..1), out.side (1 to the right of the way along, -1 to the
// left) and returns true.
export function nearest(road, x, z, out) {
  if (x < road.box[0] || x > road.box[2] || z < road.box[1] || z > road.box[3]) return false;
  const list = road.index.get(Math.floor(x / INDEX) * 100003 + Math.floor(z / INDEX));
  if (!list) return false;
  let best = Infinity;
  for (const i of list) {
    const ax = road.x[i];
    const az = road.z[i];
    const ex = road.x[i + 1] - ax;
    const ez = road.z[i + 1] - az;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 1e-9 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + ex * t);
    const dz = z - (az + ez * t);
    const d = Math.hypot(dx, dz);
    if (d < best) {
      best = d;
      out.d = d;
      out.i = i;
      out.t = t;
      out.s = (i + t) * road.ds;
      // (looking along (ex, ez), the right hand is (-ez, ex))
      out.side = dz * ex - dx * ez > 0 ? 1 : -1;
    }
  }
  return best <= REACH;
}

// The top of the road at the point nearest() found (m).
export const topAt = (road, at) => road.h[at.i] + (road.h[at.i + 1] - road.h[at.i]) * at.t;

// fn(i, d) for each sample i of the road within r of (x, z), d its distance.
export function samplesNear(road, x, z, r, fn) {
  if (x + r < road.box[0] || x - r > road.box[2] || z + r < road.box[1] || z - r > road.box[3]) return;
  const seen = new Set();
  for (let gz = Math.floor((z - r) / INDEX); gz <= Math.floor((z + r) / INDEX); gz++) {
    for (let gx = Math.floor((x - r) / INDEX); gx <= Math.floor((x + r) / INDEX); gx++) {
      const list = road.index.get(gx * 100003 + gz);
      if (!list) continue;
      for (const i of list) {
        for (const k of [i, i + 1]) {
          if (seen.has(k)) continue;
          seen.add(k);
          const d = Math.hypot(road.x[k] - x, road.z[k] - z);
          if (d <= r) fn(k, d);
        }
      }
    }
  }
}
