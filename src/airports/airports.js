// Where the airfields are.
//
// The hikes lie where they really are, so the world is as wide as the Earth
// (world/hikes.js): Maui is 835 km from where you start, the Alps nearly
// 2,000. So there is an airfield a walk from where people first arrive, and
// one a few kilometres from each part of the world where there are hikes,
// and a little plane flies from any of them to any other.
//
// Which parts of the world have one: home (round the start), and then each
// hike in the order they were brought in, unless it's within SHARE of a part
// that has one already, in which case that one is its airfield too. So the
// four hikes on Maui share one, and adding a hike never moves an airfield
// that was there: it joins one, or has one of its own.
//
// Where in that part: grown from the seed and the land, like the old places
// and the launch site, so everyone in a world finds it in the same place and
// nothing about it is saved. It's a bush strip, STRIP long, with an apron
// beside its middle for the plane, a terminal, a tower and a hangar. It goes
// where the ground will take one with the least bank under it, dry, with
// clear air off at least one end to climb out and come in over, a little
// nearer the start (or the hikes) winning over a little flatter, and clear of
// everything that was there first: real land, the old places, towns, the
// mouths of caves, the railway and the launch site.
//
// Nothing about the land changes for it. The strip's top is a smooth line
// along it, never under the ground, no steeper than GRADE and bending no
// more sharply than BEND, and where that is over the ground, the strip is on
// a bank of earth, grassed at the sides, whose foot is wherever it meets the
// hillside. The plants under it are hidden as it comes into view.
//
// Looking takes a while (a few hundred milliseconds), so it's a generator
// that can be run a little at a time (Airports.pump), as the railway is
// surveyed. Asking for an airfield outright (site) finishes it there and
// then. It is looked for in three passes: the land on a coarse lattice once,
// every spot and heading judged on that, and then the best few looked at
// closely on the land itself.
//
// No three.js in here: the tests read it, and the map asks it what to draw.
//
// A region:
//   id        'home', or the id of the hike it was first made for
//   x, z      where it's measured from: the start, or that hike's middle
//   r0, r1    how near and far from there its airfield may be (m)
//   hikes     the ids of the hikes it serves
//   scale     game metres to a real metre there (a hike's: 1:5)
//
// An airfield (a site, laid out in its own frame as an old place is:
// world/frame.js's toWorld, toLocal, onPlan):
//   id        `airfield:<x>:<z>`: a place on the map
//   region    its region's id; name: 'Hollis Field'
//   x, z, yaw the middle of the strip; its frame's +z runs along the strip,
//             +x across it, towards the apron
//   ds, h     the top of the strip every ds metres along it, from -HALF to
//             HALF (Float64Array); low: the lowest ground across it there
//   fill      the most bank there is under it (m)
//   clear     [toward -z, toward +z]: whether the air is clear off that end
//             to climb out over (and so to come in over)
//   plan      [strip, apron] rectangles in its frame; box, round all of it
//             and its banks in the world
//   toe       how far (m) the banks can run out past the plan, at the most

import { hash2i } from '../noise.js';
import { Emitter } from '../core/events.js';
import { Searches } from '../core/searches.ts';
import { SURNAMES } from '../core/names.js';
import { reachOf } from '../world/landforms.js';

export const STRIP = { length: 240, width: 16 }; // m
export const HALF = STRIP.length / 2;
const W2 = STRIP.width / 2;
// The apron, beside the middle of the strip on its +x side: the plane stands
// there, and the terminal, the tower and the hangar along its back.
export const APRON = [W2, -26, 40, 26]; // x0, z0, x1, z1 in the field's frame (m)
export const PLAN = [[-W2, -HALF, W2, HALF], APRON];
export const GRADE = 0.06; // the steepest the strip may climb (a bush strip's)
const BEND = 900; // m: the gentlest crest or dip it has, as a radius
const BED = 0.3; // m the strip's top stands over the highest ground under it
export const BANK = 0.55; // m the bank's sides fall for each metre out
const FILL_MOST = 8; // m of bank at the most anywhere under it
const DRY = 14; // m from the nearest water, everywhere on it
// Off the ends: the plane climbs out at better than this (rise over run),
// keeping this far over the ground, for this far out (m).
const OUT = { grade: 0.14, over: 12, far: 1500, step: 50 };
// Which parts of the world have their own: a hike this far (m) from where an
// earlier part is measured from shares its airfield.
export const SHARE = 60000;
const HOME_RING = [700, 4000]; // m from the start
const HIKE_RING = [250, 4000]; // m out past a hike's reach (world/landforms.js)
const WIDER = 4000; // m further out to look, where there's nowhere in the ring
const NEARER = 0.0004; // m of bank a metre nearer is worth
const ONE_WAY = 2.5; // m of bank that being able to use both ends is worth
// Looking: the land on a lattice this fine (m); a spot every so many of its
// points, at each of HEADINGS; the best LOOKS of them looked at closely.
const LAT = 60;
const EVERY = 2;
const HEADINGS = 12;
const LOOKS = 40;
const APART = { d: 100, a: 0.35 }; // closer than this (m, rad) to one already looked at is the same spot
const ROUGH = { ds: 24, wet: 46 }; // judged on the lattice: m between samples; edge (m) the lattice must show
const CLOSE = { ds: 10, across: [-W2 - 1, -4, 0, 4, W2 + 1], apron: [15, 22, 29, 35, APRON[2] + 1] };
const FINE = { ds: 4, step: 2 }; // the airfield's own heights: m along, m across
const SALT = 0xa1f1e1d;
const FORMS = ['{s} Field', '{s} Airfield', '{s} Field', '{s} Strip', '{s} Airstrip'];

// ── The parts of the world that have an airfield ────────────────────────────

// cards: the hikes' cards (world/hikes.js), in the order they were brought
// in; start: where people first arrive.
// seed: the world's, for the airfields' names, which are each region's: no
// two the same, in the order the regions came.
export function regionsOf(cards, start, seed = 0) {
  const regions = [{ id: 'home', x: start.x, z: start.z, r0: HOME_RING[0], r1: HOME_RING[1], hikes: [], scale: cards[0] ? cards[0].scale : 0.2 }];
  for (const c of cards) {
    const near = regions.find((g) => Math.hypot(c.at[0] - g.x, c.at[1] - g.z) < SHARE);
    if (near) {
      near.hikes.push(c.id);
      continue;
    }
    const r0 = reachOf(c) + HIKE_RING[0];
    regions.push({ id: c.id, x: c.at[0], z: c.at[1], r0, r1: r0 + HIKE_RING[1], hikes: [c.id], scale: c.scale });
  }
  // a surname each, stepping through the list from somewhere of the seed's
  // own (by a step that has no factor in common with its length, so none
  // comes round twice), and a form of the name
  const N = SURNAMES.length;
  const first = hash2i(seed, 0, SALT) % N;
  let step = 1 + (hash2i(seed, 1, SALT) % (N - 1));
  while (gcd(step, N) !== 1) step++;
  regions.forEach((g, k) => {
    const form = FORMS[hash2i(seed, k + 2, SALT) % FORMS.length];
    g.name = form.replace('{s}', SURNAMES[(first + k * step) % N]);
  });
  return regions;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// ── An airfield's own frame ──────────────────────────────────────────────────

// The top of the strip (and the apron beside it) at lz along it.
export function topAt(site, lz) {
  const n = site.h.length - 1;
  const u = Math.max(0, Math.min(n, (lz + HALF) / site.ds));
  const i = Math.min(n - 1, Math.floor(u));
  return site.h[i] + (site.h[i + 1] - site.h[i]) * (u - i);
}

// How far (m) the point (lx, lz) of the frame is outside the plan (0 on
// it), and the nearest point of the plan to it, in out.
export function outside(lx, lz, out) {
  let best = Infinity;
  for (const [x0, z0, x1, z1] of PLAN) {
    const nx = Math.max(x0, Math.min(x1, lx));
    const nz = Math.max(z0, Math.min(z1, lz));
    const d = Math.hypot(lx - nx, lz - nz);
    if (d < best) {
      best = d;
      out.x = nx;
      out.z = nz;
    }
  }
  return best;
}

const _o = { x: 0, z: 0 };
// The top of the earthwork at (lx, lz) in the frame: the strip or the apron
// on the plan, and off it, its bank falling away (which is under the ground
// by its foot). -Infinity far off it.
export function earthAt(site, lx, lz) {
  const d = outside(lx, lz, _o);
  if (d > site.toe + 1) return -Infinity;
  return topAt(site, _o.z) - d * BANK;
}

// ── Looking for one ──────────────────────────────────────────────────────────

// A line along the strip that's over every height in g (one every ds
// metres) by BED, climbs no steeper than GRADE and bends no sharper than
// BEND over a crest or through a dip: raised where it has to be, and nowhere
// else. In turn: no steeper than GRADE (each point at least as high as its
// neighbour less GRADE); every crest rounded (the highest of the parabolas
// bending down at BEND from each point); every dip filled (the least bowl
// bending up at BEND over all of it, a hull); and no steeper again.
export function profile(g, ds) {
  const n = g.length;
  const h = Float64Array.from(g, (v) => v + BED);
  const rise = GRADE * ds;
  const steady = () => {
    for (let i = 1; i < n; i++) if (h[i] < h[i - 1] - rise) h[i] = h[i - 1] - rise;
    for (let i = n - 2; i >= 0; i--) if (h[i] < h[i + 1] - rise) h[i] = h[i + 1] - rise;
  };
  steady();
  const k = 1 / BEND;
  // crests: (no parabola from further off than this can be the highest, on a
  // line no steeper than GRADE)
  const reach = Math.ceil((2 * GRADE) / k / ds);
  const c = Float64Array.from(h);
  for (let i = 0; i < n; i++) {
    for (let j = Math.max(0, i - reach); j <= Math.min(n - 1, i + reach); j++) {
      const d = (i - j) * ds;
      const v = h[j] - (k * d * d) / 2;
      if (v > c[i]) c[i] = v;
    }
  }
  // dips: with the bowl taken off, the line's upper hull, then the bowl put back
  const bowl = (i) => (k * (i * ds) ** 2) / 2;
  const hull = [];
  for (let i = 0; i < n; i++) {
    const w = c[i] - bowl(i);
    while (hull.length >= 2) {
      const [ia, wa] = hull[hull.length - 2];
      const [ib, wb] = hull[hull.length - 1];
      // the last point is under the line from the one before it to this: drop it
      if ((wb - wa) * (i - ia) <= (w - wa) * (ib - ia)) hull.pop();
      else break;
    }
    hull.push([i, w]);
  }
  for (let s = 0; s < hull.length - 1; s++) {
    const [ia, wa] = hull[s];
    const [ib, wb] = hull[s + 1];
    for (let i = ia; i <= ib; i++) h[i] = Math.max(c[i], wa + ((wb - wa) * (i - ia)) / (ib - ia) + bowl(i));
  }
  steady();
  return h;
}

// Judge a strip whose highest ground across it is g and lowest lo, every ds
// metres: -> { h, max, mean } (m of bank), or null if it would need too much.
function judge(g, lo, ds) {
  const h = profile(g, ds);
  let max = 0;
  let sum = 0;
  for (let i = 0; i < h.length; i++) {
    const f = h[i] - lo[i];
    if (f > max) max = f;
    sum += f;
  }
  return max > FILL_MOST ? null : { h, max, mean: sum / h.length };
}

// The land on a lattice, LAT apart, over the ring a region's airfield may
// be in: heights, and how far each point is from the nearest water.
function* lattice(gen, region, r0, r1) {
  const R = r1 + HALF + LAT * 2;
  const n = Math.ceil((2 * R) / LAT) + 1;
  const x0 = region.x - R;
  const z0 = region.z - R;
  const H = new Float32Array(n * n).fill(NaN);
  const E = new Float32Array(n * n);
  const inner = Math.max(0, r0 - HALF - LAT * 2);
  for (let j = 0; j < n; j++) {
    const z = z0 + j * LAT;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * LAT;
      const r = Math.hypot(x - region.x, z - region.z);
      if (r > R || r < inner) continue;
      H[j * n + i] = gen.height(x, z);
      E[j * n + i] = gen.water.edge;
    }
    yield;
  }
  return { n, x0, z0, H, E };
}

// Bilinear height off the lattice (NaN off it), and the nearest point's
// distance to water.
function latH(L, x, z) {
  const u = (x - L.x0) / LAT;
  const v = (z - L.z0) / LAT;
  const i = Math.floor(u);
  const j = Math.floor(v);
  if (i < 0 || j < 0 || i >= L.n - 1 || j >= L.n - 1) return NaN;
  const k = j * L.n + i;
  const fu = u - i;
  const fv = v - j;
  const a = L.H[k] + (L.H[k + 1] - L.H[k]) * fu;
  const b = L.H[k + L.n] + (L.H[k + L.n + 1] - L.H[k + L.n]) * fu;
  return a + (b - a) * fv;
}
function latE(L, x, z) {
  const i = Math.round((x - L.x0) / LAT);
  const j = Math.round((z - L.z0) / LAT);
  if (i < 0 || j < 0 || i >= L.n || j >= L.n) return 0;
  return L.E[j * L.n + i];
}

// Where the samples across the strip (and the apron, by its middle) go, for
// a strip whose middle is (x, z), turned to yaw, at lz along it.
function samplesAt(lz, across, apron) {
  return lz >= APRON[1] - 1 && lz <= APRON[3] + 1 ? across.concat(apron) : across;
}

// A spot and heading judged roughly, on the lattice.
function rough(L, x, z, yaw) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const n = Math.round(STRIP.length / ROUGH.ds) + 1;
  const ds = STRIP.length / (n - 1);
  const g = new Float64Array(n);
  const lo = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lz = -HALF + i * ds;
    let hi = -Infinity;
    let low = Infinity;
    for (const lx of samplesAt(lz, [-W2, 0, W2], [24, APRON[2]])) {
      const px = x + lx * fz + lz * fx;
      const pz = z - lx * fx + lz * fz;
      const h = latH(L, px, pz);
      if (!(h === h) || latE(L, px, pz) < ROUGH.wet) return null;
      if (h > hi) hi = h;
      if (h < low) low = h;
    }
    g[i] = hi;
    lo[i] = low;
  }
  return judge(g, lo, ds);
}

// A spot and heading looked at closely, on the land itself.
function close(gen, x, z, yaw, ds = CLOSE.ds, across = CLOSE.across, apron = CLOSE.apron) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const n = Math.round(STRIP.length / ds) + 1;
  const step = STRIP.length / (n - 1);
  const g = new Float64Array(n);
  const lo = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lz = -HALF + i * step;
    let hi = -Infinity;
    let low = Infinity;
    for (const lx of samplesAt(lz, across, apron)) {
      const h = gen.height(x + lx * fz + lz * fx, z - lx * fx + lz * fz);
      if (gen.water.edge < DRY) return null;
      if (h > hi) hi = h;
      if (h < low) low = h;
    }
    g[i] = hi;
    lo[i] = low;
  }
  const j = judge(g, lo, step);
  if (!j) return null;
  // the air off each end: clear of the ground, climbing out at OUT.grade
  const clear = [-1, 1].map((end) => {
    const top = j.h[end < 0 ? 0 : n - 1];
    for (let t = OUT.step; t <= OUT.far; t += OUT.step) {
      const d = HALF + t;
      if (gen.height(x + fx * d * end, z + fz * d * end) + OUT.over > top + t * OUT.grade) return false;
    }
    return true;
  });
  if (!clear[0] && !clear[1]) return null;
  return { ...j, ds: step, lo, clear };
}

// The boxes in the world that a strip at (x, z, yaw) and its banks cover, a
// few along it rather than one round it all, so what's near it but not
// under it doesn't count.
function boxesOf(x, z, yaw, margin) {
  const out = [];
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const pieces = 5;
  const box = (lx0, lz0, lx1, lz1) => {
    let a = Infinity;
    let b = Infinity;
    let c = -Infinity;
    let d = -Infinity;
    for (const [lx, lz] of [
      [lx0 - margin, lz0 - margin],
      [lx1 + margin, lz0 - margin],
      [lx1 + margin, lz1 + margin],
      [lx0 - margin, lz1 + margin],
    ]) {
      const px = x + lx * fz + lz * fx;
      const pz = z - lx * fx + lz * fz;
      a = Math.min(a, px);
      b = Math.min(b, pz);
      c = Math.max(c, px);
      d = Math.max(d, pz);
    }
    out.push([a, b, c, d]);
  };
  for (let k = 0; k < pieces; k++) box(-W2, -HALF + (k * STRIP.length) / pieces, W2, -HALF + ((k + 1) * STRIP.length) / pieces);
  box(...APRON);
  return out;
}

// Look for a region's airfield, a little at a time: yields as it goes, and
// returns the airfield, or null where there's nowhere for one. In its ring
// first, and if there's nowhere in that, further out (the oldest land is
// all rolling hills).
// keepOff(x0, z0, x1, z1): whether that square is somewhere it may not be.
export function* survey(gen, region, keepOff = () => false) {
  for (const [r0, r1] of [
    [region.r0, region.r1],
    [region.r1, region.r1 + WIDER],
  ]) {
    const site = yield* ring(gen, region, r0, r1, keepOff);
    if (site) return site;
  }
  return null;
}

function* ring(gen, region, r0, r1, keepOff) {
  const L = yield* lattice(gen, region, r0, r1);
  // every spot on the lattice, every heading, judged roughly
  const found = [];
  let since = 0;
  for (let j = 0; j < L.n; j += EVERY) {
    for (let i = 0; i < L.n; i += EVERY) {
      const x = L.x0 + i * LAT;
      const z = L.z0 + j * LAT;
      const r = Math.hypot(x - region.x, z - region.z);
      if (r < r0 || r > r1) continue;
      for (let k = 0; k < HEADINGS; k++) {
        const yaw = (k / HEADINGS) * Math.PI;
        const e = rough(L, x, z, yaw);
        if (e) found.push({ x, z, yaw, r, score: e.max + e.mean + r * NEARER });
      }
      if (++since > 400) {
        since = 0;
        yield;
      }
    }
  }
  found.sort((a, b) => a.score - b.score);
  // the best few, looked at closely
  const looked = [];
  for (const f of found) {
    if (looked.length >= LOOKS) break;
    if (looked.some((l) => Math.hypot(l.x - f.x, l.z - f.z) < APART.d && Math.abs(Math.atan2(Math.sin(2 * (l.yaw - f.yaw)), Math.cos(2 * (l.yaw - f.yaw)))) < APART.a * 2)) continue;
    const e = close(gen, f.x, f.z, f.yaw);
    looked.push(f);
    yield;
    if (e) f.close = { ...e, score: e.max + e.mean + f.r * NEARER + (e.clear[0] && e.clear[1] ? 0 : ONE_WAY) };
  }
  const best = looked.filter((f) => f.close).sort((a, b) => a.close.score - b.close.score);
  // ...and of those, the best that nothing else was there first
  for (const f of best) {
    const free = boxesOf(f.x, f.z, f.yaw, f.close.max / BANK + 4).every((b) => !keepOff(...b));
    yield;
    if (free) return makeSite(gen, region, f);
  }
  return null;
}

// The airfield at the spot chosen: its own heights, finer.
function makeSite(gen, region, f) {
  const across = [];
  for (let lx = -W2 - 1; lx <= W2 + 1 + 1e-6; lx += FINE.step) across.push(lx);
  const apron = [];
  for (let lx = W2 + FINE.step; lx <= APRON[2] + 1 + 1e-6; lx += FINE.step) apron.push(lx);
  // (the spot passed with coarser samples; finer ones can only find it needs a little more bank)
  const e = close(gen, f.x, f.z, f.yaw, FINE.ds, across, apron) || f.close;
  const { x, z, yaw } = f;
  const toe = Math.ceil(e.max / BANK + 2);
  const boxes = boxesOf(x, z, yaw, toe);
  const box = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
  const rx = Math.round(x);
  const rz = Math.round(z);
  return {
    id: `airfield:${rx}:${rz}`,
    region: region.id,
    name: region.name,
    x,
    z,
    yaw,
    ds: e.ds,
    h: e.h,
    low: e.lo,
    fill: e.max,
    clear: e.clear,
    plan: PLAN,
    toe,
    box,
    shape: PLAN,
  };
}

// ── The airfields ────────────────────────────────────────────────────────────

// Emits:
//   'site'  (site)   a region's airfield has been found (not for one with none)
export class Airports extends Emitter {
  // gen: the WorldGen; cards: the hikes' cards; start: where people first
  // arrive; keepOff(x0, z0, x1, z1): whether that square is somewhere no
  // airfield may be.
  constructor(gen, { cards = [], start = gen.findSpawn(0, 0), keepOff = () => false } = {}) {
    super();
    this.gen = gen;
    this.keepOff = keepOff;
    this.regions = regionsOf(cards, start, gen.seed);
    // surveyed outright or a little at a time (site, pump): core/searches.ts
    this.search = new Searches({
      grow: (id) => survey(this.gen, this.region(id), this.keepOff),
      found: (id, site) => site && this.emit('site', site),
    });
    this.sites = this.search.known; // region id -> airfield, or null where there's none
  }

  // Region ids asked about and not yet surveyed.
  get queue() {
    return this.search.queue;
  }

  region(id) {
    return this.regions.find((g) => g.id === id) || null;
  }

  // The region whose airfield is the one to fly from, from (x, z): the
  // nearest whose ring you're within (SHARE of where it's measured from).
  regionAt(x, z) {
    let best = null;
    let bd = Infinity;
    for (const g of this.regions) {
      const d = Math.hypot(x - g.x, z - g.z);
      if (d < SHARE && d < bd) {
        best = g;
        bd = d;
      }
    }
    return best;
  }

  // A region's airfield (null where it has none). Found now if it hasn't
  // been; with wait = false, undefined until it has, and queued for pump().
  site(id, wait = true) {
    if (this.sites.has(id)) return this.sites.get(id);
    if (!this.region(id)) return wait ? null : undefined;
    return wait ? this.search.get(id) : this.search.peek(id);
  }

  // The airfields found so far.
  known() {
    return [...this.sites.values()].filter(Boolean);
  }

  // The airfield with this id, if it's been found.
  byId(id) {
    for (const s of this.sites.values()) if (s && s.id === id) return s;
    return null;
  }

  // Airfields found so far whose box overlaps a rectangle of the world.
  within(x0, z0, x1, z1) {
    return this.known().filter((s) => s.box[0] <= x1 && s.box[2] >= x0 && s.box[1] <= z1 && s.box[3] >= z0);
  }

  // Survey queued regions for up to `ms` milliseconds. -> how many are left.
  pump(ms) {
    return this.search.pump(ms);
  }
}

// The way (rad, as a yaw) from one point to another, and the compass bearing
// (degrees from north, which is -z) of a yaw.
export const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
export const bearingOf = (yaw) => ((((180 - (yaw * 180) / Math.PI) % 360) + 360) % 360);

// ── For what's grown after the airfields ────────────────────────────────────
// Whether a region's airfield might reach somewhere `d` metres from the
// middle of the region and `half` metres across either way: an airfield
// stands in its region's ring (r0 to r1 from its middle), and its box
// reaches this far further in, or out.
const FIELD_REACH = { inside: 170, outside: 4200 };
export function mayReach(g, d, half) {
  return d + half >= g.r0 - FIELD_REACH.inside && d - half <= g.r1 + FIELD_REACH.outside;
}

// The airfields, as something to keep clear of (world/claims.ts): a box
// holds one if the airfield of a region that might reach it overlaps it.
// Those airfields are found then and there if they haven't been (dear: so
// ask ready() first, which says whether they have and sends for them if
// not). `wide: false` asks only about regions that might reach the box's
// middle, not any of it: what the first searches to ask did, and still do.
export const airfieldsOver = (airfields, { wide = true } = {}) => {
  const reaching = (x0, z0, x1, z1) => {
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    const half = wide ? Math.hypot(x1 - x0, z1 - z0) / 2 : 0;
    return airfields.regions.filter((g) => mayReach(g, Math.hypot(x - g.x, z - g.z), half));
  };
  return {
    holds(x0, z0, x1, z1) {
      for (const g of reaching(x0, z0, x1, z1)) {
        const b = airfields.site(g.id)?.box;
        if (b && b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0) return true;
      }
      return false;
    },
    ready(x0, z0, x1, z1) {
      let known = true;
      for (const g of reaching(x0, z0, x1, z1)) if (airfields.site(g.id, false) === undefined) known = false;
      return known;
    },
  };
};
