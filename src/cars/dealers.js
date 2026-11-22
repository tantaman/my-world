// Where the car dealerships are: one beside most of the western towns and
// villages (not the ghost towns, the abandoned villages or the eerie towns)
// that a road comes to (roads/), just out of town along
// that road, its lot fronting it, so a car bought there drives straight off
// the lot onto the road.
//
// Which towns have one is from the seed and the town (hasDealer, cheap), and
// that the town has a road. Where it stands is looked for the first time
// it's wanted, outright (forTown) or a little at a time (peek, then pump), like
// the video store's branches: along each of the town's roads, from a little
// way out of its gate to a few hundred metres on, either side, the flattest
// dry ground a lot will stand on, a little nearer winning over a little
// flatter, clear of everything else (keepOff: what the roads keep clear of,
// and the roads themselves and the towns' gates).
//
// Nothing about the land changes for it. The lot is one slab of tarmac set on
// the ground as it is, its top a little over the highest corner and its sides
// sloping down to the ground; the showroom stands on it.
//
// No three.js in here: the tests read it.
//
// A dealership:
//   id        'dealer:<town id>': a place on the map
//   name      'Pruitt Motors'; town: its town's id; townName
//   x, z, yaw the middle of the lot; its frame's +z points at the road
//   road, s   the road it fronts, and how far along it
//   top       the height of the lot's top; low, the lowest ground under its skirt
//   plan      [LOT]: the lot's top in its own frame (landmarks/sites.js)
//   box       [x0, z0, x1, z1] in the world, round the lot and its skirt
//   door      where `go here` sets you down: on the lot, in front of the
//             cars, facing them ({ x, z, yaw })
//   paints    the colour of each kind of car on its lot (kinds.js)

import { mulberry32 } from '../noise.js';
import { toWorld, onPlan } from '../world/frame.js';
import { SURNAMES } from '../core/names.js';
import { KINDS as TOWN_KINDS } from '../towns/kinds.js';
import { pointAt, nearest, gateOf, WIDE } from '../roads/roads.js';
import { segDist } from '../core/geom.js';
import { KINDS, KIND_IDS } from './kinds.js';
import { PerTown } from '../towns/perTown.ts';

export const DEALER = {
  chance: 0.9, // that a western town or a village, with a road, has one
};
// The lot, in its own frame (m): across, and from the back to the front (+z, the road).
export const LOT = [-21, -18, 21, 18];
export const SKIRT = 2.2; // m the sloping sides run out past the top's edge
export const SLAB_UP = 0.22; // m the top stands over the highest ground under it
const GAP = 1.0; // m between the edge of the road and the front of the lot
const ALONG = [45, 380]; // m along the road from the gate where it may be
const STEP = 10; // m between the spots looked at along a road
const FLAT_MOST = 2.6; // m the ground may rise across the lot and its sides
const DRY = 6; // m from the lot's edge to water, at the least
const NEARER = 0.004; // m of rise a metre nearer the town is worth
const ROAD_KEEP = WIDE + 0.4; // m from the middle of a road to the lot, at the least (but its own, in front)
const SALT = 0x5ca7e;
// Where you're set down from the map: on the lot, in front of the cars.
export const DOOR_AT = { x: 0, z: 13 };
export const NAMES = ['{s} Motors', '{s} Motor Co.', '{s} & Sons Motors', '{s} Auto Sales', '{s} Motors'];
// What a yield says: waiting for something else to be found.
export const WAIT = 'wait'; // (what a search yields while it waits: core/searches.ts goes on with the others)

const lived = (t) => !TOWN_KINDS[t.kind].abandoned && TOWN_KINDS[t.kind].style !== 'creepy';

// Whether town t could have a dealership, from the seed alone: a western
// town or a village, kept up (whether or not anyone's about: the dealership
// has a salesperson of its own). It needs a road too, which takes a survey
// to know.
export function hasDealer(t, seed) {
  if (!t || !lived(t)) return false;
  return mulberry32((t.seed ^ seed ^ SALT) >>> 0)() < DEALER.chance;
}

// Its name, and the colours of the cars on its lot, from the seed and the town.
function namesOf(t, seed) {
  const rng = mulberry32((t.seed ^ seed ^ (SALT * 7)) >>> 0);
  rng();
  const family = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  const name = NAMES[Math.floor(rng() * NAMES.length)].replace('{s}', family);
  const paints = {};
  for (const k of KIND_IDS) paints[k] = KINDS[k].paints[Math.floor(rng() * KINDS[k].paints.length)];
  return { name, paints };
}

// towns: the Towns; roads: the Roads (roads/roads.js); stands(road): whether
// a road is there (roads/index.js); keepOff(x0, z0, x1, z1): whether that
// rectangle is somewhere a lot may not be (what the roads keep clear of);
// ready(x0, z0, x1, z1): whether all of that is known there (asking for what isn't)
export class Dealers extends PerTown {
  constructor(gen, { towns, roads, stands = () => true, keepOff = () => false, ready = () => true }) {
    // What it can be asked is PerTown's (towns/perTown.ts): forTown, peek,
    // pump, prefetch, byId ('dealer:town:<i>:<j>').
    super({
      towns,
      prefix: 'dealer',
      reach: OUT_OF_TOWN,
      has: (t) => hasDealer(t, gen.seed),
      grow: (t) => this._grow(t),
      found: (site) => {
        if (site) for (const fn of this.listeners) fn(site);
      },
    });
    this.gen = gen;
    this.roads = roads;
    this.stands = stands;
    this.keepOff = keepOff;
    this.ready = ready;
    this.listeners = [];
  }

  // A search may wait for the roads and what it keeps clear of (not when a
  // dealership is wanted outright).
  get patient() {
    return this.search.patient;
  }

  // fn(site) whenever a dealership has been found.
  onSite(fn) {
    this.listeners.push(fn);
  }

  // Dealerships whose box overlaps a rectangle of the world. With wait =
  // false, only those already found (and the towns already known); the rest
  // are asked for.
  within(x0, z0, x1, z1, wait = true) {
    const out = [];
    const m = OUT_OF_TOWN;
    for (const t of this.towns.within(x0 - m, z0 - m, x1 + m, z1 + m, wait)) {
      const d = wait ? this.forTown(t) : this.peek(t);
      if (d && d.box[0] <= x1 && d.box[2] >= x0 && d.box[1] <= z1 && d.box[3] >= z0) out.push(d);
    }
    return out;
  }

  *_grow(t) {
    const gen = this.gen;
    // its roads: all of them known first
    let list = this.roads.ofTown(t, false);
    while (list === undefined && this.patient) {
      yield WAIT;
      list = this.roads.ofTown(t, false);
    }
    if (list === undefined) list = this.roads.ofTown(t, true);
    list = list.filter(this.stands).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!list.length) return null;
    // everything near them known too
    const r = ALONG[1] + 80;
    const near = [t.x - r - t.len, t.z - r - t.len, t.x + r + t.len, t.z + r + t.len];
    while (this.patient && !(this.ready(...near) && this.roads.allKnown(...near))) yield WAIT;
    const others = this.roads.within(...near).filter(this.stands);
    yield;

    const found = [];
    const p = {};
    const w = { x: 0, z: 0 };
    let looked = 0;
    for (const road of list) {
      const out = road.from === t.id;
      for (let a = ALONG[0]; a <= Math.min(ALONG[1], road.length / 2); a += STEP) {
        const s = out ? a : road.length - a;
        pointAt(road, s, p);
        for (const side of [1, -1]) {
          if (++looked % 6 === 0) yield;
          // the way from the road to the lot: to the road's right (side 1), or left
          const nx = -p.dz * side;
          const nz = p.dx * side;
          const back = WIDE + GAP + (LOT[3] - LOT[1]) / 2;
          const spot = { x: p.x + nx * back, z: p.z + nz * back, yaw: Math.atan2(-nx, -nz) };
          // flat and dry enough
          let lo = Infinity;
          let hi = -Infinity;
          let wet = false;
          for (const [u, v] of CHECK) {
            toWorld(spot, u, v, w);
            const h = gen.height(w.x, w.z);
            if (gen.water.edge < DRY) wet = true;
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
          }
          if (wet || hi - lo > FLAT_MOST) continue;
          found.push({ ...spot, road, s, lo, hi, score: hi - lo + a * NEARER });
        }
      }
    }
    found.sort((a, b) => a.score - b.score || a.s - b.s);
    // the best of them nothing is in the way of (asked last, and of as few as can be)
    const _n = { d: 0, s: 0, i: 0, t: 0, side: 0 };
    for (const f of found) {
      const site = { x: f.x, z: f.z, yaw: f.yaw, plan: [LOT] };
      site.box = boxOf(site);
      // a closer look at the ground all over it, now it's worth one
      for (const [u, v] of DENSE) {
        toWorld(site, u, v, w);
        const h = gen.height(w.x, w.z);
        f.lo = Math.min(f.lo, h);
        f.hi = Math.max(f.hi, h);
      }
      yield;
      if (f.hi - f.lo > FLAT_MOST + 0.5) continue;
      const [x0, z0, x1, z1] = site.box;
      if (this.keepOff(x0, z0, x1, z1)) continue;
      // no road over it but its own, in front
      let clear = true;
      for (const road of others) {
        for (const [u, v] of EDGE) {
          toWorld(site, u, v, w);
          if (nearest(road, w.x, w.z, _n) && _n.d < ROAD_KEEP) clear = false;
        }
        if (!clear) break;
      }
      yield;
      if (!clear) continue;
      const names = namesOf(t, gen.seed);
      const door = toWorld(site, DOOR_AT.x, DOOR_AT.z);
      return {
        id: `dealer:${t.id}`,
        name: names.name,
        town: t.id,
        townName: t.name,
        x: f.x,
        z: f.z,
        yaw: f.yaw,
        road: f.road.id,
        s: f.s,
        top: f.hi + SLAB_UP,
        low: f.lo,
        plan: [LOT],
        box: site.box,
        door: { x: door.x, z: door.z, yaw: f.yaw + Math.PI },
        paints: names.paints,
      };
    }
    return null;
  }
}

// What a lot keeps clear of: everything the roads keep clear of, the
// railway, the towns, and the rounds where their roads meet. -> keepOff for
// Dealers.
//   gen       the WorldGen
//   reaches(x0, z0, x1, z1)   whether a real place's land reaches there
//   clear     what the roads keep clear of there (roads/clear.js firstThere's)
//   lines     the railway (railway/lines.js Lines); towns: the Towns
const TOWN_KEEP = 4; // m between a lot and a town's lots and street
const GATE_KEEP = WIDE + 4; // m between a lot and the round where a town's roads meet, and the road to it
export function clearOf({ gen, reaches, clear, lines, towns }) {
  const _s = { d: 0, t: 0, nx: 0, nz: 0 };
  return (x0, z0, x1, z1) => {
    if (reaches(x0, z0, x1, z1)) return true;
    const over = (b) => b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0;
    for (const s of clear(x0, z0, x1, z1)) if (s.site ? over(s.site.box) : s.box ? over(s.box) : over([s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r])) return true;
    for (const line of lines.within(x0, z0, x1, z1)) {
      if (!over(line.box)) continue;
      for (let i = 0; i < line.n; i += 2) if (line.x[i] >= x0 - 8 && line.x[i] <= x1 + 8 && line.z[i] >= z0 - 8 && line.z[i] <= z1 + 8) return true;
    }
    for (const t of towns.within(x0 - 150, z0 - 150, x1 + 150, z1 + 150)) {
      for (let x = x0; x <= x1; x += 4) for (let z = z0; z <= z1; z += 4) if (onPlan(t, x, z, TOWN_KEEP)) return true;
      const g = gateOf(gen, t);
      if (g.x > x0 - GATE_KEEP - 6 && g.x < x1 + GATE_KEEP + 6 && g.z > z0 - GATE_KEEP - 6 && g.z < z1 + GATE_KEEP + 6) return true;
      segDist((x0 + x1) / 2, (z0 + z1) / 2, g.ex, g.ez, g.x, g.z, _s);
      if (_s.d < Math.hypot(x1 - x0, z1 - z0) / 2 + GATE_KEEP) return true;
    }
    return false;
  };
}

// How far (m) a dealership can be from its town's middle, at the most: down
// its road, out from the gate.
export const OUT_OF_TOWN = ALONG[1] + 200;

// Where the ground is looked at under a lot: its corners, the middles of its
// sides, and across it, and out at the foot of its sloping sides.
const CHECK = (() => {
  const [x0, z0, x1, z1] = LOT;
  const out = [];
  for (const u of [x0 - SKIRT, x0, (x0 + x1) / 2, x1, x1 + SKIRT]) for (const v of [z0 - SKIRT, z0, (z0 + z1) / 2, z1]) out.push([u, v]);
  return out;
})();
// ...and, for the best of them, all over it
const DENSE = (() => {
  const [x0, z0, x1, z1] = LOT;
  const out = [];
  for (let u = x0; u <= x1 + 0.01; u += (x1 - x0) / 10) for (let v = z0; v <= z1 + 0.01; v += (z1 - z0) / 9) out.push([u, v]);
  return out;
})();
// ...and where it's asked whether a road comes over it: round its edge, and across it.
const EDGE = (() => {
  const [x0, z0, x1, z1] = LOT;
  const out = [];
  for (let k = 0; k <= 6; k++) {
    const u = x0 + ((x1 - x0) * k) / 6;
    out.push([u, z0], [u, (z0 + z1) / 2], [u, z1 - 1.5]);
  }
  return out;
})();

// The box round a lot and its sloping sides, in the world.
function boxOf(s) {
  const [x0, z0, x1, z1] = LOT;
  const w = { x: 0, z: 0 };
  let bx0 = Infinity;
  let bz0 = Infinity;
  let bx1 = -Infinity;
  let bz1 = -Infinity;
  for (const [u, v] of [[x0 - SKIRT, z0 - SKIRT], [x1 + SKIRT, z0 - SKIRT], [x1 + SKIRT, z1 + SKIRT], [x0 - SKIRT, z1 + SKIRT]]) {
    toWorld(s, u, v, w);
    bx0 = Math.min(bx0, w.x);
    bz0 = Math.min(bz0, w.z);
    bx1 = Math.max(bx1, w.x);
    bz1 = Math.max(bz1, w.z);
  }
  return [bx0, bz0, bx1, bz1];
}

// The top of a lot at (x, z) (m), sloping down to the ground over its skirt,
// or null off it. ground(x, z) -> the ground's height.
export function lotTop(site, x, z, ground, local = {}) {
  if (x < site.box[0] || x > site.box[2] || z < site.box[1] || z > site.box[3]) return null;
  const c = Math.cos(site.yaw);
  const n = Math.sin(site.yaw);
  const dx = x - site.x;
  const dz = z - site.z;
  local.x = dx * c - dz * n;
  local.z = dx * n + dz * c;
  const [x0, z0, x1, z1] = LOT;
  const out = Math.max(x0 - local.x, local.x - x1, z0 - local.z, local.z - z1, 0);
  if (out <= 0) return site.top;
  if (out >= SKIRT) return null;
  const g = ground(x, z);
  return Math.max(g, site.top + (g - site.top) * (out / SKIRT));
}

export { onPlan };

// The dealerships, as something to keep clear of (world/claims.ts), for
// what's grown after them: a box holds one if a lot's box overlaps it. Those
// of the towns round it are looked for then and there if they haven't been
// (so ask ready() first).
export const lotsOver = (dealers) => ({
  holds: (x0, z0, x1, z1) => dealers.within(x0, z0, x1, z1).length > 0,
  ready(x0, z0, x1, z1) {
    let known = true;
    for (const t of dealers.towns.within(x0 - OUT_OF_TOWN, z0 - OUT_OF_TOWN, x1 + OUT_OF_TOWN, z1 + OUT_OF_TOWN, false)) if (dealers.peek(t) === undefined) known = false;
    return known;
  },
});
