// Where the railways run: a few narrow-gauge loop lines, grown from the seed
// like the old places, each with three to five stations and trains going
// round and round it.
//
// The world is cut into CELL-metre squares, and each has a chance (CHANCE)
// of a line in it: a loop round the middle of the square, surveyed the way a
// railway is, along the contours. It is first a ring of NODES points, each
// at one of RINGS distances from the middle, chosen all together (dynamic
// programming round the ring) for the least climbing and the least ground
// to bridge, keeping off lakes, the start of the path, and whatever else it
// is told to keep clear of: the old places, the mouths of caves.
// Then a smooth curve through them, the rail's height along it (never
// steeper than GRADE, never under the ground or in the water), and stations
// where the ground suits a platform. A square whose loop would need a
// trestle taller than TRESTLE_MAX, or too much of it on trestles or over
// water, has no line: so there are lines in the hills and the lake country,
// and hardly any in the mountains.
//
// Nor is there a line in a square any of which is real land (a hike brought
// in from photos, world/landforms.js), or near enough that its land isn't
// the forest's alone: what grows there isn't known until it has been
// fetched, and a line surveyed over it would change with whether it had.
//
// Nothing here changes what a seed grows (a save is the diff from it): the
// track stands on the land as it is, on a ballast bank where it is low and a
// timber trestle where it is high, and the plants in its way are hidden as
// their chunk grows (index.js). Everyone in a world finds the same line.
//
// Surveying a line takes 50 to 150 ms, most of it finding the water it
// crosses, so it is a generator that can be run a little at a time (pump),
// like the map fills in with old places. Asking for a line outright (cell,
// within) finishes it there and then.
//
// No three.js in here: the tests read it, and the map asks it what to draw.
//
// A line:
//   id          `line:${ci}:${cj}`
//   name        'the Hollis line'
//   n, ds       samples round the loop, ds metres apart
//   length      once round (m)
//   x, z        where each sample is (Float64Array)
//   h           the top of the rail there (m)
//   g           the highest ground under the track there (m)
//   gp, gm      ...and the ground SIDE m out to its +x and -x sides
//   wet         1 where it crosses water (Uint8Array)
//   stations    [station], in the order the trains come to them
//   trains      how many trains run round it
//   phase       0..1, where in its timetable the line is at time 0
//   box         [x0, z0, x1, z1] round the track and its stations
//
// A station is laid out like an old place (landmarks/sites.js), so the same
// plan helpers serve both:
//   id          `station:${ci}:${cj}:${k}`
//   name        'Pruitt Halt'; line: its line's id
//   s, i        how far round the line its middle is (m), and that sample
//   x, z, yaw   its middle, on the track; its frame's +z is the way the
//               trains go, and +x is to their right
//   side        1 or -1: the side of the track (+x or -x) the platform is on
//   rail        the top of the rail, level along the platform
//   deck        the top of the platform
//   plan, bare, shape, box   as for an old place
//   tower       whether it has a water tower

import { mulberry32, hash2i, lerp } from '../noise.js';
import { Searches } from '../core/searches.ts';
import { SURNAMES } from '../core/names.js';
import { wrapAngle as wrap } from '../core/geom.js';

export const CELL = 3000; // m, the side of the square each line has to itself
const CHANCE = 0.62; // that a square has a line at all (if one can be surveyed)
const JITTER = 0.1; // the loop's middle wanders this fraction of a square from the square's
const RADIUS = [430, 740]; // m from the middle to the loop, before it bends to the land
const SPREAD = [0.55, 1.45]; // the nearest and furthest the loop may go, times that
const MARGIN = 70; // m every line keeps inside its own square
const NODES = 96; // points round the ring, surveyed...
const RINGS = 31; // ...each at one of this many distances out
const SWERVE = 3; // rings the loop may move in or out from one point to the next
export const DS = 4; // m between samples along a line
export const GRADE = 0.06; // the steepest the rail climbs (rise over run): a logging line's, not a main line's
export const BED = 0.38; // m the top of the rail stands over the ground, at the least
const SIDE = 1.3; // m either side of the middle where the ground must be under the bed
const CLEAR = 2.6; // m the rail keeps above water it crosses
export const TRESTLE_FROM = 4; // m of rail over the ground from which the track is on a trestle, not a bank
const TRESTLE_MAX = 22; // m: no line needs a trestle taller than this
const TRESTLE_SHARE = 0.36; // ...nor more than this much of its length on trestles
const WET_SHARE = 0.07; // ...nor more than this much of it over water
const MIN_RADIUS = 50; // m: the tightest curve (a logging line's)
const START_CLEAR = 220; // m between the track and where people first arrive
const PAD_CLEAR = 40; // m between the track and a hand-placed structure
const SITE_CLEAR = 22; // m between the track and an old place
const MOUTH_CLEAR = 10; // m between the track and the rock round a cave's mouth
const MOUTH_RIM = 2.4; // m round a cave's mouth where the hillside is broken rock (world/cuts.js)
const CLEAR_STEP = 330; // m: what to keep clear of is asked for a square this big at a time
const LAKE_KEEP = 14; // m a survey point keeps back from the shore of a pond or lake
const LEVEL = 26; // m along the track either side of a station's middle that is level
export const PLATFORM = 16; // m either side of a station's middle the platform runs
export const PLATFORM_EDGE = 1.32; // m from the middle of the track to the platform's edge
export const PLATFORM_W = 2.7; // m wide
export const PLATFORM_UP = 0.42; // m the platform's deck stands over the rail
export const HOUSE = [5.1, 9.3, 2.4]; // a station house: from, to (m from the track), half its length
const STATIONS_PER = 1000; // m of line for each station...
const STATIONS = [3, 5]; // ...but at least and at most this many
const TRAINS_PER = 1400; // m of line for each train going round, at least two
const SALT = 0x5a11e;
const OFFSET = [7919, -104729];
const TAU = Math.PI * 2;

const FORMS = ['{s} Halt', '{s} Siding', '{s}', '{s} Halt', '{s} Mill', '{s} Flats', '{s} Camp', '{s} Junction'];
const BY_WATER = '{s} Landing';
const LINE_FORMS = ['the {s} line', 'the {s} loop', 'the {s} Valley line', 'the {s} & {t} line'];

const key = (ci, cj) => `${ci}:${cj}`;
const named = (form, s, t = '') => form.replace('{s}', s).replace('{t}', t);

// ── Along a line ─────────────────────────────────────────────────────────────

// Where a line is, s metres round it (any s: it wraps). Fills out.x, out.y
// (the top of the rail), out.z, out.dx, out.dz (the way round, a unit
// vector) and out.grade (rise over run).
export function pointAt(line, s, out = {}) {
  const { n, ds } = line;
  const f = (((s / ds) % n) + n) % n;
  const i = Math.floor(f);
  const j = i + 1 === n ? 0 : i + 1;
  const t = f - i;
  out.x = line.x[i] + (line.x[j] - line.x[i]) * t;
  out.z = line.z[i] + (line.z[j] - line.z[i]) * t;
  out.y = line.h[i] + (line.h[j] - line.h[i]) * t;
  const dx = line.x[j] - line.x[i];
  const dz = line.z[j] - line.z[i];
  const l = Math.hypot(dx, dz) || 1;
  out.dx = dx / l;
  out.dz = dz / l;
  out.grade = (line.h[j] - line.h[i]) / l;
  return out;
}

// The way round at sample i (radians, as a yaw: (sin, cos) is the way).
export function headingAt(line, i) {
  const { n } = line;
  const a = (i - 1 + n) % n;
  const b = (i + 1) % n;
  return Math.atan2(line.x[b] - line.x[a], line.z[b] - line.z[a]);
}

// The shortest way from s0 forward to s1, round a loop of length L.
export const ahead = (s0, s1, L) => (((s1 - s0) % L) + L) % L;

// ── What a line keeps clear of ───────────────────────────────────────────────
// Besides the start of the path and any hand-placed structure: things grown
// from the seed before there were railways, which the lines go round rather
// than the other way about. Each is a source (x0, z0, x1, z1) -> [{ key, x,
// z, r }]: discs a line keeps out of, for the things in a rectangle.

// The old places: sites.within(x0, z0, x1, z1) -> [{ id, box }] (landmarks/sites.js).
export const clearOfPlaces = (sites) => (x0, z0, x1, z1) =>
  sites.within(x0, z0, x1, z1).map((s) => {
    const b = s.box;
    return { key: s.id, x: (b[0] + b[2]) / 2, z: (b[1] + b[3]) / 2, r: Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + SITE_CLEAR };
  });

// The mouths of caves, where the hillside is cut open: caves(x0, z0, x1, z1)
// -> [{ id, mouth: { x, z, ux, uz, portal, w } }] (caves/sites.js). The
// passages behind run on under the hill, deep enough for a line to cross.
export const clearOfCaves = (caves) => (x0, z0, x1, z1) =>
  caves(x0, z0, x1, z1).map((c) => {
    const m = c.mouth;
    const half = m.portal / 2 + 3;
    return { key: c.id, x: m.x + m.ux * (half - 3), z: m.z + m.uz * (half - 3), r: half + m.w + MOUTH_RIM + MOUTH_CLEAR };
  });

// ── The lines ────────────────────────────────────────────────────────────────
export class Lines {
  // gen: the WorldGen; start: where people first arrive, kept clear;
  // keepClear: sources of what else to keep clear of (clearOfPlaces, clearOfCaves)
  // keepOff(x0, z0, x1, z1): is any of that square somewhere no line may be?
  constructor(gen, { start = gen.findSpawn(0, 0), keepClear = [], keepOff = () => false } = {}) {
    this.gen = gen;
    this.start = start;
    this.keepClear = keepClear;
    this.keepOff = keepOff;
    this.ids = new Map(); // station id -> station
    // surveyed outright (cell) or a little at a time (peek, then pump): core/searches.ts
    this.search = new Searches({
      grow: (k) => {
        const [ci, cj] = k.split(':').map(Number);
        return this._grow(ci, cj);
      },
      found: (k, line) => {
        if (line) for (const st of line.stations) this.ids.set(st.id, st);
      },
    });
    this.cells = this.search.known; // "ci:cj" -> line, or null
  }

  // Cells asked about and not yet surveyed.
  get queue() {
    return this.search.queue;
  }

  // The line in square (ci, cj), or null. Surveyed now if it hasn't been.
  cell(ci, cj) {
    return this.search.get(key(ci, cj));
  }

  // Lines whose box overlaps a rectangle of the world. With wait = false,
  // squares not surveyed yet are left out and queued for pump().
  within(x0, z0, x1, z1, wait = true) {
    const out = [];
    for (let cj = Math.floor(z0 / CELL); cj <= Math.floor(z1 / CELL); cj++) {
      for (let ci = Math.floor(x0 / CELL); ci <= Math.floor(x1 / CELL); ci++) {
        let line = this.cells.get(key(ci, cj));
        if (line === undefined) {
          if (!wait) {
            this.queue.add(key(ci, cj));
            continue;
          }
          line = this.cell(ci, cj);
        }
        if (line && line.box[0] <= x1 && line.box[2] >= x0 && line.box[1] <= z1 && line.box[3] >= z0) out.push(line);
      }
    }
    return out;
  }

  // The line in square (ci, cj) if it has been surveyed (null: none), or
  // undefined if not yet, and then it's queued for pump().
  peek(ci, cj) {
    return this.search.peek(key(ci, cj));
  }

  // Lines known so far within r of (x, z); the rest are queued.
  known(x, z, r) {
    return this.within(x - r, z - r, x + r, z + r, false);
  }

  // Squares within r of (x, z) to survey in the background, nearest first.
  prefetch(x, z, r) {
    const ci0 = Math.floor(x / CELL);
    const cj0 = Math.floor(z / CELL);
    const n = Math.ceil(r / CELL);
    const want = [];
    for (let dj = -n; dj <= n; dj++) {
      for (let di = -n; di <= n; di++) {
        const k = key(ci0 + di, cj0 + dj);
        if (!this.cells.has(k)) want.push([Math.hypot((ci0 + di + 0.5) * CELL - x, (cj0 + dj + 0.5) * CELL - z), k]);
      }
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [d, k] of want) if (d < r + CELL * 0.71) this.queue.add(k);
  }

  // Survey queued squares for up to `ms` milliseconds, nearest-asked first.
  // -> how many are left.
  pump(ms) {
    return this.search.pump(ms);
  }

  // The line or station with this id, or null.
  byId(id) {
    const m = /^(line|station):(-?\d+):(-?\d+)(?::(\d+))?$/.exec(String(id));
    if (!m) return null;
    const line = this.cell(Number(m[2]), Number(m[3]));
    if (!line) return null;
    if (m[1] === 'line') return line.id === id ? line : null;
    return line.stations.find((st) => st.id === id) || null;
  }

  // ── Surveying a square ─────────────────────────────────────────────────────
  // A generator: it yields now and then so it can be run a little at a
  // time, and returns the line (or null). What it finds depends only on the
  // seed and the square, never on how it was run.
  *_grow(ci, cj) {
    const gen = this.gen;
    // (offset, because hash2i gives (x, z) and (-x, -z) the same hash when
    // both are odd, and the squares either side of the middle would match)
    const rng = mulberry32(hash2i(ci + OFFSET[0], cj + OFFSET[1], (gen.seed ^ SALT) >>> 0));
    if (rng() > CHANCE) return null;
    if (this.keepOff(ci * CELL, cj * CELL, (ci + 1) * CELL, (cj + 1) * CELL)) return null;
    // drawn first, so that how the survey goes can't change them
    const cx = (ci + 0.5 + (rng() * 2 - 1) * JITTER) * CELL;
    const cz = (cj + 0.5 + (rng() * 2 - 1) * JITTER) * CELL;
    const R0 = lerp(RADIUS[0], RADIUS[1], rng());
    const turn = rng() * TAU;
    const backwards = rng() < 0.5;
    const phase = rng();
    const families = [];
    while (families.length < STATIONS[1] + 2) {
      const f = SURNAMES[Math.floor(rng() * SURNAMES.length)];
      if (!families.includes(f)) families.push(f);
    }
    const forms = Array.from({ length: STATIONS[1] }, () => FORMS[Math.floor(rng() * FORMS.length)]);
    const lineForm = LINE_FORMS[Math.floor(rng() * LINE_FORMS.length)];
    const s0 = rng(); // where round the loop the first station's stretch starts

    const maxR = CELL / 2 - JITTER * CELL - MARGIN;
    const reach = Math.min(maxR, R0 * SPREAD[1]) + 40;
    const avoid = yield* this._avoid(cx - reach, cz - reach, cx + reach, cz + reach);

    // ── The ring ──
    // Each point's distance out is chosen for the least the land rises and
    // falls along the way round (total climb), so the loop keeps to the
    // contours; climbing faster than the line can, crossing a lake and
    // passing an old place all cost a great deal more.
    const radii = Array.from({ length: RINGS }, (_, j) => Math.min(maxR, R0 * lerp(SPREAD[0], SPREAD[1], j / (RINGS - 1))));
    const nodeAt = (k, j, out = {}) => {
      const a = turn + (k / NODES) * TAU;
      out.x = cx + Math.cos(a) * radii[j];
      out.z = cz + Math.sin(a) * radii[j];
      return out;
    };
    const nb = new Float64Array(NODES * RINGS); // the lie of the land at each point
    const nc = new Float64Array(NODES * RINGS); // and what it costs to pass it
    const A = {};
    const B = {};
    for (let k = 0; k < NODES; k++) {
      for (let j = 0; j < RINGS; j++) {
        nodeAt(k, j, A);
        nb[k * RINGS + j] = gen.broadHeight(A.x, A.z, 0);
        nc[k * RINGS + j] = this._spotCost(A.x, A.z, avoid);
      }
      if (k % 8 === 7) yield;
    }
    const W = 2 * SWERVE + 1;
    const ec = new Float64Array(NODES * RINGS * W).fill(Infinity);
    for (let k = 0; k < NODES; k++) {
      const k1 = (k + 1) % NODES;
      for (let i = 0; i < RINGS; i++) {
        nodeAt(k, i, A);
        const ha = nb[k * RINGS + i];
        for (let j = Math.max(0, i - SWERVE); j <= Math.min(RINGS - 1, i + SWERVE); j++) {
          nodeAt(k1, j, B);
          const hb = nb[k1 * RINGS + j];
          const len = Math.hypot(B.x - A.x, B.z - A.z);
          const mx = (A.x + B.x) / 2;
          const mz = (A.z + B.z) / 2;
          const rise = Math.abs(hb - ha);
          let c = rise * 3 + Math.abs(gen.broadHeight(mx, mz, 0) - (ha + hb) / 2) * 2;
          if (rise > GRADE * 0.8 * len) c += (rise - GRADE * 0.8 * len) * 20;
          c += Math.abs(j - i) * 0.3 + this._avoidCost(mx, mz, avoid);
          ec[(k * RINGS + i) * W + (j - i + SWERVE)] = c;
        }
      }
      if (k % 8 === 7) yield;
    }
    const path = bestRing(nc, ec);
    if (!path) return null;

    // ── A smooth curve through it ──
    // eased only where it would bend more tightly than a train can take, so
    // that everywhere else it stays on the contour it was surveyed along
    const r = path.map((j) => radii[j]);
    const ring = () => {
      const pts = r.map((rad, k) => {
        const a = turn + (k / NODES) * TAU;
        return [cx + Math.cos(a) * rad, cz + Math.sin(a) * rad];
      });
      return backwards ? pts.reverse() : pts;
    };
    for (let pass = 0; pass < 40 && easeTight(r, turn, MIN_RADIUS * 1.15); pass++);
    let curve = resample(catmullRom(ring(), 12), DS);
    for (let tries = 0; tries < 6 && tightest(curve) < MIN_RADIUS; tries++) {
      smoothRing(r);
      curve = resample(catmullRom(ring(), 12), DS);
    }
    yield;

    // ── How high the rail runs ──
    const { n, ds, x, z } = curve;
    const g = new Float64Array(n);
    const gp = new Float64Array(n);
    const gm = new Float64Array(n);
    const w = new Float64Array(n);
    const wet = new Uint8Array(n);
    const floor = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      let tx = x[b] - x[a];
      let tz = z[b] - z[a];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const hc = gen.height(x[i], z[i]);
      const water = gen.water;
      const level = water.region > 0.5 ? water.level : -Infinity;
      gp[i] = gen.height(x[i] + tz * SIDE, z[i] - tx * SIDE);
      gm[i] = gen.height(x[i] - tz * SIDE, z[i] + tx * SIDE);
      g[i] = Math.max(hc, gp[i], gm[i]);
      w[i] = level > hc + 0.02 ? level : -Infinity;
      wet[i] = w[i] > -Infinity ? 1 : 0;
      floor[i] = Math.max(g[i] + BED, w[i] + CLEAR);
      if (i % 40 === 39) yield;
    }
    let h = envelope(floor, ds);

    // ── Stations ──
    const L = n * ds;
    const count = Math.max(STATIONS[0], Math.min(STATIONS[1], Math.round(L / STATIONS_PER)));
    const heading = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      heading[i] = Math.atan2(x[b] - x[a], z[b] - z[a]);
    }
    const spots = [];
    for (let m = 0; m < count; m++) {
      const spot = this._stationSpot({ n, ds, x, z, h, wet, heading }, (s0 + (m + 0.5) / count) * L, (0.32 * L) / count, avoid);
      if (spot) spots.push(spot);
      yield;
    }
    if (spots.length < STATIONS[0]) return null;
    spots.sort((a, b) => a.i - b.i);
    // round off the tops and bottoms of the grades a little, then level the
    // track along each platform and a little way either side (raising the
    // rail to the highest it is there, and again if that lifts it more)
    const soft = smoothLoop(h, 4);
    for (let i = 0; i < n; i++) floor[i] = Math.max(soft[i], floor[i]);
    const lv = Math.ceil(LEVEL / ds);
    for (let pass = 0; pass < 3; pass++) {
      h = envelope(floor, ds);
      for (const sp of spots) {
        let top = -Infinity;
        for (let o = -lv; o <= lv; o++) top = Math.max(top, h[(sp.i + o + n) % n]);
        sp.rail = top;
        for (let o = -lv; o <= lv; o++) floor[(sp.i + o + n) % n] = top;
      }
    }
    h = envelope(floor, ds);

    // ── Whether it is worth building ──
    let high = 0;
    let trestle = 0;
    let wetN = 0;
    for (let i = 0; i < n; i++) {
      const up = h[i] - g[i];
      if (up > high) high = up;
      if (up > TRESTLE_FROM) trestle++;
      wetN += wet[i];
    }
    if (high > TRESTLE_MAX || trestle > TRESTLE_SHARE * n || wetN > WET_SHARE * n) return null;

    // ── Writing it down ──
    const id = `line:${ci}:${cj}`;
    const line = {
      id,
      ci,
      cj,
      name: named(lineForm, families[0], families[1]),
      n,
      ds,
      length: L,
      x,
      z,
      h,
      g,
      gp,
      gm,
      wet,
      stations: [],
      trains: Math.max(2, Math.round(L / TRAINS_PER)),
      phase,
      box: null,
      high,
    };
    let lo = Infinity;
    let hi = -Infinity;
    for (const sp of spots) {
      lo = Math.min(lo, sp.rail);
      hi = Math.max(hi, sp.rail);
    }
    line.stations = spots.map((sp, k) => {
      const byWater = this._waterNear(x[sp.i], z[sp.i]);
      const form = byWater ? BY_WATER : forms[k];
      return station(line, k, sp, named(form, families[k + 2] || families[k]), k === 0);
    });
    line.box = boxOf(line);
    line.index = indexOf(line);
    return line;
  }

  // The start, any hand-placed structure and whatever else is to be kept
  // clear of round a rectangle, as discs: [{ x, z, r }].
  *_avoid(x0, z0, x1, z1) {
    const out = [{ x: this.start.x, z: this.start.z, r: START_CLEAR }];
    for (const p of this.gen.pads) out.push({ x: p.x, z: p.z, r: p.r + PAD_CLEAR });
    const seen = new Set();
    for (const source of this.keepClear) {
      for (let z = z0; z < z1; z += CLEAR_STEP) {
        for (let x = x0; x < x1; x += CLEAR_STEP) {
          for (const d of source(x, z, Math.min(x + CLEAR_STEP, x1), Math.min(z + CLEAR_STEP, z1))) {
            if (seen.has(d.key)) continue;
            seen.add(d.key);
            out.push(d);
          }
          yield;
        }
      }
    }
    return out;
  }

  // What it costs for the line to pass (x, z): a great deal by an old place
  // or the start, or in a lake; a little across a stream.
  _spotCost(x, z, avoid) {
    let c = this._avoidCost(x, z, avoid);
    const w = this.gen.water;
    w.probe(x, z);
    if ((w.kind === 'lake' || w.kind === 'pond') && w.edge < LAKE_KEEP) c += 300 * Math.min(1, (LAKE_KEEP - w.edge) / LAKE_KEEP);
    else if (w.edge < 0) c += 3;
    return c;
  }

  _avoidCost(x, z, avoid) {
    let c = 0;
    for (const a of avoid) {
      const d = Math.hypot(x - a.x, z - a.z);
      if (d < a.r + 25) c += 400 * Math.min(1, (a.r + 25 - d) / 25);
    }
    return c;
  }

  _waterNear(x, z) {
    const w = this.gen.water;
    w.probe(x, z);
    return (w.kind === 'lake' || w.kind === 'pond') && w.edge < 70;
  }

  // The best place for a station within `half` m of s round the line: a
  // straight, dry stretch that can be levelled with little lifting, with
  // ground beside it that a platform and a house can stand on.
  // -> { i, s, rail, side } or null
  _stationSpot(c, s, half, avoid) {
    const gen = this.gen;
    const { n, ds, x, z, h, wet, heading } = c;
    const lv = Math.ceil(LEVEL / ds);
    const pw = Math.ceil(PLATFORM / ds);
    const found = [];
    for (let o = -half; o <= half; o += 8) {
      const i = ((Math.round((s + o) / ds) % n) + n) % n;
      let dry = true;
      let rail = -Infinity;
      for (let q = -lv - 2; q <= lv + 2; q++) {
        const k = (i + q + n) % n;
        if (wet[k]) dry = false;
        if (Math.abs(q) <= lv) rail = Math.max(rail, h[k]);
      }
      if (!dry) continue;
      const bend = Math.abs(wrap(heading[(i + pw) % n] - heading[(i - pw + n) % n]));
      if (bend > 0.22) continue;
      let lift = 0;
      for (let q = -lv; q <= lv; q++) lift += rail - h[(i + q + n) % n];
      let clear = true;
      for (const a of avoid) if (Math.hypot(x[i] - a.x, z[i] - a.z) < a.r + 10) clear = false;
      if (!clear) continue;
      found.push({ i, rail, cost: lift * 0.08 + bend * 40 + Math.abs(o) * 0.004 });
    }
    found.sort((a, b) => a.cost - b.cost);
    let best = null;
    for (const f of found.slice(0, 10)) {
      const { i, rail } = f;
      const deck = rail + PLATFORM_UP;
      const tx = Math.sin(heading[i]);
      const tz = Math.cos(heading[i]);
      for (const side of [1, -1]) {
        // +x of the station's frame is to the right of the way round
        const rx = tz * side;
        const rz = -tx * side;
        let cost = f.cost;
        for (let q = -pw; q <= pw; q += 2) {
          const k = (i + q + n) % n;
          const off = PLATFORM_EDGE + PLATFORM_W / 2;
          const under = deck - gen.height(x[k] + rx * off, z[k] + rz * off);
          if (gen.water.region > 0.5 && gen.water.level > deck - 2) cost += 40;
          cost += Math.max(0, under - 0.7) * 1.5 + Math.max(0, 0.05 - under) * 8;
        }
        for (const q of [-HOUSE[2], 0, HOUSE[2]]) {
          const off = (HOUSE[0] + HOUSE[1]) / 2;
          const k = (i + Math.round(q / ds) + n) % n;
          const under = deck - gen.height(x[k] + rx * off, z[k] + rz * off);
          cost += Math.max(0, under - 1.4) * 2 + Math.max(0, -0.1 - under) * 6;
        }
        if (!best || cost < best.cost) best = { i, s: i * ds, rail, side, cost };
      }
    }
    return best;
  }
}

// ── Surveying, by hand ───────────────────────────────────────────────────────

// The cheapest way round the ring: one ring index per point. nc[k*R + j]
// is what point k at ring j costs, ec[(k*R + i)*W + (j - i + SWERVE)] the
// stretch from point k at ring i to point k+1 at ring j. -> [j for each
// point], or null. (Round a loop the last point leads back to the first, so
// the first is tried at every other ring.)
function bestRing(nc, ec) {
  const R = RINGS;
  const W = 2 * SWERVE + 1;
  const e = (k, i, j) => (Math.abs(j - i) > SWERVE ? Infinity : ec[(k * R + i) * W + (j - i + SWERVE)]);
  let best = Infinity;
  let bestPath = null;
  const from = Array.from({ length: NODES }, () => new Int16Array(R));
  let prev = new Float64Array(R);
  let cur = new Float64Array(R);
  for (let j0 = 0; j0 < R; j0 += 2) {
    prev.fill(Infinity);
    prev[j0] = nc[j0];
    for (let k = 1; k < NODES; k++) {
      cur.fill(Infinity);
      for (let j = 0; j < R; j++) {
        for (let i = Math.max(0, j - SWERVE); i <= Math.min(R - 1, j + SWERVE); i++) {
          const c = prev[i] + e(k - 1, i, j) + nc[k * R + j];
          if (c < cur[j]) {
            cur[j] = c;
            from[k][j] = i;
          }
        }
      }
      [prev, cur] = [cur, prev];
    }
    for (let j = Math.max(0, j0 - SWERVE); j <= Math.min(R - 1, j0 + SWERVE); j++) {
      const c = prev[j] + e(NODES - 1, j, j0);
      if (c < best) {
        best = c;
        const path = new Array(NODES);
        path[NODES - 1] = j;
        for (let k = NODES - 1; k > 0; k--) path[k - 1] = from[k][path[k]];
        bestPath = path;
      }
    }
  }
  return best < 1e5 ? bestPath : null;
}

// Ease each distance out toward its neighbours', so the curve bends gently.
function smoothRing(r) {
  const n = r.length;
  const was = r.slice();
  for (let k = 0; k < n; k++) r[k] = (was[(k - 1 + n) % n] + 2 * was[k] + was[(k + 1) % n]) / 4;
}

// Ease the points of a ring of distances out (r, at even angles from
// `turn`) that bend it tighter than `radius` toward their neighbours.
// -> whether any did.
function easeTight(r, turn, radius) {
  const n = r.length;
  const p = r.map((rad, k) => {
    const a = turn + (k / n) * TAU;
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  });
  const tight = [];
  for (let k = 0; k < n; k++) {
    const a = p[(k - 1 + n) % n];
    const b = p[k];
    const c = p[(k + 1) % n];
    const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const h2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
    const len = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2;
    if (Math.abs(wrap(h2 - h1)) / len > 1 / radius) tight.push(k);
  }
  const was = r.slice();
  for (const k of tight) {
    for (const m of [k - 1, k, k + 1]) {
      const q = (m + n) % n;
      r[q] = (was[(q - 1 + n) % n] + 2 * was[q] + was[(q + 1) % n]) / 4;
    }
  }
  return tight.length > 0;
}

// A closed centripetal Catmull-Rom curve through pts ([[x, z], ...]), `per`
// points to a span. -> [[x, z], ...]
function catmullRom(pts, per) {
  const n = pts.length;
  const out = [];
  const knot = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6;
  for (let k = 0; k < n; k++) {
    const p0 = pts[(k - 1 + n) % n];
    const p1 = pts[k];
    const p2 = pts[(k + 1) % n];
    const p3 = pts[(k + 2) % n];
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
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
      out.push(p);
    }
  }
  return out;
}

// A closed polyline at even spacing, about `step` m. -> { n, ds, x, z }
function resample(poly, step) {
  const m = poly.length;
  const cum = new Float64Array(m + 1);
  for (let k = 0; k < m; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % m];
    cum[k + 1] = cum[k] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const L = cum[m];
  const n = Math.max(8, Math.round(L / step));
  const ds = L / n;
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (cum[k + 1] < s) k++;
    const t = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const a = poly[k];
    const b = poly[(k + 1) % m];
    x[i] = a[0] + (b[0] - a[0]) * t;
    z[i] = a[1] + (b[1] - a[1]) * t;
  }
  return { n, ds, x, z };
}

// The tightest curve on a resampled loop: its radius (m).
function tightest({ n, ds, x, z }) {
  let worst = 0;
  const span = 3;
  for (let i = 0; i < n; i++) {
    const a = (i - span + n) % n;
    const b = (i + span) % n;
    const ha = Math.atan2(x[i] - x[a], z[i] - z[a]);
    const hb = Math.atan2(x[b] - x[i], z[b] - z[i]);
    worst = Math.max(worst, Math.abs(wrap(hb - ha)) / (span * ds));
  }
  return worst > 0 ? 1 / worst : Infinity;
}

// The lowest rail at least as high as `floor` everywhere that never climbs
// more steeply than GRADE, round a loop: a ramp down from every high point.
function envelope(floor, ds) {
  const n = floor.length;
  const h = Float64Array.from(floor);
  const fall = GRADE * ds;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k <= n; k++) {
      const i = k % n;
      const p = k - 1;
      if (h[p] - fall > h[i]) h[i] = h[p] - fall;
    }
    for (let k = n - 2; k >= -1; k--) {
      const i = (k + n) % n;
      const p = (k + 1) % n;
      if (h[p] - fall > h[i]) h[i] = h[p] - fall;
    }
  }
  return h;
}

// A moving average round a loop, `half` samples either side.
function smoothLoop(v, half) {
  const n = v.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let o = -half; o <= half; o++) sum += v[(i + o + n) % n];
    out[i] = sum / (2 * half + 1);
  }
  return out;
}

// ── Writing a station down ───────────────────────────────────────────────────
function station(line, k, sp, name, tower) {
  const { i, side, rail } = sp;
  const yaw = headingAt(line, i);
  const e0 = PLATFORM_EDGE;
  const e1 = PLATFORM_EDGE + PLATFORM_W;
  const sx = (a, b) => (side > 0 ? [a, b] : [-b, -a]);
  const [px0, px1] = sx(e0 - 0.1, e1 + 0.3);
  const [hx0, hx1] = sx(HOUSE[0] - 0.4, HOUSE[1] + 0.5);
  const plan = [
    [px0, -PLATFORM - 1.5, px1, PLATFORM + 1.5],
    [hx0, -HOUSE[2] - 0.6, hx1, HOUSE[2] + 0.6],
  ];
  // a water tower stands beyond the far end of the platform
  if (tower) {
    const [tx0, tx1] = sx(e1 - 0.4, e1 + 4.2);
    plan.push([tx0, PLATFORM - 1, tx1, PLATFORM + 4.6]);
  }
  const [bx0, bx1] = sx(e0, e1);
  const [ix0, ix1] = sx(HOUSE[0], HOUSE[1]);
  const st = {
    id: `station:${line.ci}:${line.cj}:${k}`,
    k,
    line: line.id,
    name,
    s: i * line.ds,
    i,
    x: line.x[i],
    z: line.z[i],
    yaw,
    side,
    rail,
    deck: rail + PLATFORM_UP,
    tower,
    plan,
    bare: plan,
    shape: [
      [bx0, -PLATFORM, bx1, PLATFORM],
      [ix0, -HOUSE[2], ix1, HOUSE[2]],
    ],
  };
  st.box = planBox(st);
  return st;
}

function planBox(s) {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [a, b, cc, d] of s.plan) {
    for (const [lx, lz] of [[a, b], [cc, b], [a, d], [cc, d]]) {
      const x = s.x + lx * c + lz * n;
      const z = s.z - lx * n + lz * c;
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
  }
  return [x0, z0, x1, z1];
}

function boxOf(line) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < line.n; i++) {
    x0 = Math.min(x0, line.x[i]);
    z0 = Math.min(z0, line.z[i]);
    x1 = Math.max(x1, line.x[i]);
    z1 = Math.max(z1, line.z[i]);
  }
  for (const st of line.stations) {
    x0 = Math.min(x0, st.box[0]);
    z0 = Math.min(z0, st.box[1]);
    x1 = Math.max(x1, st.box[2]);
    z1 = Math.max(z1, st.box[3]);
  }
  const pad = 24;
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}

// ── How far a point is from a line ───────────────────────────────────────────
// A grid of the stretches between samples, so that "how far is (x, z) from
// the track" is a handful of sums, not a walk round the loop.
const GRID = 32; // m
export const REACH = 16; // m: the furthest from the track that nearest() answers

function indexOf(line) {
  const cells = new Map();
  const { n, x, z } = line;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const gx0 = Math.floor((Math.min(x[i], x[j]) - REACH) / GRID);
    const gx1 = Math.floor((Math.max(x[i], x[j]) + REACH) / GRID);
    const gz0 = Math.floor((Math.min(z[i], z[j]) - REACH) / GRID);
    const gz1 = Math.floor((Math.max(z[i], z[j]) + REACH) / GRID);
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

// The nearest point on the line's track to (x, z), if within REACH. Fills
// out.d (m), out.s (how far round), out.i (the sample before it), out.side
// (1 to the right of the way round, -1 to the left) and returns true.
export function nearest(line, x, z, out) {
  if (x < line.box[0] || x > line.box[2] || z < line.box[1] || z > line.box[3]) return false;
  const list = line.index.get(Math.floor(x / GRID) * 100003 + Math.floor(z / GRID));
  if (!list) return false;
  const { n } = line;
  let best = Infinity;
  for (const i of list) {
    const j = (i + 1) % n;
    const ax = line.x[i];
    const az = line.z[i];
    const ex = line.x[j] - ax;
    const ez = line.z[j] - az;
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
      out.s = (i + t) * line.ds;
      out.side = dx * ez - dz * ex > 0 ? 1 : -1;
    }
  }
  return best <= REACH;
}

// fn(i, d) for each sample i of the line within r of (x, z), d its distance.
export function samplesNear(line, x, z, r, fn) {
  if (x + r < line.box[0] || x - r > line.box[2] || z + r < line.box[1] || z - r > line.box[3]) return;
  const seen = new Set();
  for (let gz = Math.floor((z - r) / GRID); gz <= Math.floor((z + r) / GRID); gz++) {
    for (let gx = Math.floor((x - r) / GRID); gx <= Math.floor((x + r) / GRID); gx++) {
      const list = line.index.get(gx * 100003 + gz);
      if (!list) continue;
      for (const i of list) {
        if (seen.has(i)) continue;
        seen.add(i);
        const d = Math.hypot(line.x[i] - x, line.z[i] - z);
        if (d <= r) fn(i, d);
      }
    }
  }
}

// ── For what's grown after the railway ──────────────────────────────────────
// The rails, as something to keep clear of (world/claims.ts): a box holds
// them if a sample of a line is within `near` of its middle. How far that
// is, each search that keeps clear of the railway has always said for
// itself, and they don't agree: half the box's width, half its longer side,
// or half its diagonal. Which one a search uses is part of what it grows, so
// each keeps its own; a new one wants `corner`, which misses nothing.
export const NEAR = {
  width: (x0, z0, x1, z1) => (x1 - x0) / 2,
  longer: (x0, z0, x1, z1) => Math.max(x1 - x0, z1 - z0) / 2,
  corner: (x0, z0, x1, z1) => Math.hypot(x1 - x0, z1 - z0) / 2,
};

// Whether the railway in a box has been surveyed, asking for it if not: so
// a search far off can wait for it rather than stall.
export const surveyed = (lines) => (x0, z0, x1, z1) => {
  let known = true;
  for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) if (lines.peek(i, j) === undefined) known = false;
  }
  return known;
};

export const railsNear = (lines, near) => ({
  holds(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const r = near(x0, z0, x1, z1);
    for (const line of lines.within(x0, z0, x1, z1)) {
      let found = false;
      samplesNear(line, cx, cz, r, () => (found = true));
      if (found) return true;
    }
    return false;
  },
  ready: surveyed(lines),
});
