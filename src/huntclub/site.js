// Where the hunt club is.
//
// There is one, a longer walk out from where people first arrive than the
// video store: a timber clubhouse with a porch, and in front of it a skeet
// field. Where exactly is grown from the seed and the land, like the video
// store (videostore/site.js): the flattest dry ground in a ring round the
// start, a little nearer winning over a little flatter, so everyone in a
// world finds it in the same place and nothing about it is saved. Its name is
// grown from the seed too.
//
// Nothing about the land changes for it. The clubhouse stands on a deck on
// posts, the houses and the station pads on the ground as it is, and the
// walks between them follow it; the trees, bushes and stones on the field are
// hidden as it comes into view.
//
// The club's frame (m) is the skeet field's (skeet.js): station 8 at the
// origin, the stations round towards +z, and the clubhouse behind them, its
// porch facing the field. +z points to the start, so you come to the
// clubhouse first, and the shooting is away from where people come from.
//
// No three.js in here: the tests read it.
//
// A site:
//   id      'huntclub:<x>:<z>': a place on the map
//   name    'Grouse Creek Hunt Club'
//   x, z    station 8; yaw: which way +z of the club's frame faces
//   base    the height of the ground at station 8
//   lo, hi  the lowest and highest ground looked at over the plan
//   plan    [[x0, z0, x1, z1]]: the field and the clubhouse, in the club's
//           frame (landmarks/sites.js's toWorld, onPlan); all of it cleared
//   box     [x0, z0, x1, z1] in the world, round the plan
//   door    where `go here` sets you down: at the foot of the porch steps,
//           facing the clubhouse ({ x, z, yaw })

import { toWorld, boxOf } from '../landmarks/sites.js';
import { hash2i, mulberry32 } from '../noise.js';
import { STATIONS, HOUSES, FIELD } from './skeet.js';

// The field and the clubhouse behind it, in the club's frame: the houses,
// the stations, where the targets come down (about 55 m from each house,
// out to the sides), and the clubhouse.
export const PLAN = [-40, -8, 40, 40];
// The clubhouse: its walls (x0, z0, x1, z1), the porch along its front
// (porch: how deep, m), and the steps down from the porch's edge, in the
// middle (steps: their half width).
export const CLUB = { x0: -7, z0: 28, x1: 7, z1: 36, porch: 3, steps: 1.3 };
export const EDGE = CLUB.z0 - CLUB.porch; // the porch's front edge
const DECK_UP = 0.45; // m the porch and the floor stand over the highest ground under them
export const TREAD = 0.3; // m, each step's depth
const RISE = 0.19; // m, each step's rise at the most
// Where you're set down from the map: this far out past the foot of the steps.
export const DOOR_OUT = 2.2;
const PAD_UP = 0.08; // m a station's pad stands over the highest ground under it
// Where it may be: this far from the start (m), the nearest ring first.
export const RING = [450, 1000];
const STEP = 30; // m between the spots looked at, round a ring and between rings
const FLAT_MOST = 3.2; // m the ground may rise across the field and the clubhouse
const DRY = 40; // m from station 8 to the nearest water, at the least
const NEARER = 0.003; // m of rise a metre nearer the start is worth
const CLEAR = 15; // m round the plan kept clear of anything else grown from the seed
// The ground is looked at over the plan on a grid this many across and deep
// (the corners and the middle first).
const GRID = [9, 6];

const FIRST = ['Grouse', 'Cedar', 'Elk', 'Tamarack', 'Bear', 'Timber', 'Antler', 'Black Spruce', 'Wapiti', 'Hemlock', 'Partridge', 'Stag'];
const SECOND = ['Creek', 'Ridge', 'Hollow', 'Point', 'Run', 'Lake', 'Valley', 'Flats', 'Hill', 'Brook'];

// The club's name, grown from the seed: 'Grouse Creek Hunt Club'.
export function clubName(seed) {
  const r = mulberry32(hash2i(31, 77, seed));
  return `${FIRST[Math.floor(r() * FIRST.length)]} ${SECOND[Math.floor(r() * SECOND.length)]} Hunt Club`;
}

// gen: the WorldGen (height(x, z), water.edge after it). start: { x, z }.
// keepOff(x0, z0, x1, z1): whether that square is somewhere it may not be.
// -> a site, or null where there's nowhere for one.
export function findSite(gen, start, keepOff = () => false) {
  return pickSite(gen, candidates(gen, start), keepOff);
}

// It's found in two goes, so the first, the dear one, can be done before
// what it has to keep clear of is all known (the airfields are found a little
// at a time, after the world opens):
//
// candidates(gen, start) -> the spots flat and dry enough, best first: the
//   ground looked at all over each (the dear part), nothing else asked
// pickSite(gen, found, keepOff) -> the best of them nothing is in the way of,
//   as a site
export function candidates(gen, start) {
  const [x0, z0, x1, z1] = PLAN;
  const quick = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
    [0, 0],
    [0, (CLUB.z0 + CLUB.z1) / 2],
  ];
  const grid = [];
  for (let j = 0; j <= GRID[1]; j++) for (let i = 0; i <= GRID[0]; i++) grid.push([x0 + ((x1 - x0) * i) / GRID[0], z0 + ((z1 - z0) * j) / GRID[1]]);
  const found = [];
  const spot = { x: 0, z: 0, yaw: 0 };
  const _w = { x: 0, z: 0 };
  for (let r = RING[0]; r <= RING[1]; r += STEP) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / STEP));
    const turn = r * 0.618 + 2.3; // each ring starts somewhere else round, so the spots don't line up
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2;
      spot.x = start.x + Math.cos(a) * r;
      spot.z = start.z + Math.sin(a) * r;
      spot.yaw = Math.atan2(start.x - spot.x, start.z - spot.z);
      const base = gen.height(spot.x, spot.z);
      if (gen.water.edge < DRY) continue;
      let lo = base;
      let hi = base;
      let ok = true;
      // a quick look first, and over the whole of it only if it's worth it
      for (const pts of [quick, grid]) {
        for (const [u, v] of pts) {
          toWorld(spot, u, v, _w);
          const h = gen.height(_w.x, _w.z);
          if (gen.water.edge < 4) ok = false;
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          if (!ok || hi - lo > FLAT_MOST) break;
        }
        if (!ok || hi - lo > FLAT_MOST) break;
      }
      if (!ok || hi - lo > FLAT_MOST) continue;
      found.push({ x: spot.x, z: spot.z, yaw: spot.yaw, base, lo, hi, score: hi - lo + r * NEARER });
    }
  }
  found.sort((a, b) => a.score - b.score);
  return found;
}

export function pickSite(gen, found, keepOff = () => false) {
  // the best of them that nothing else is in the way of (asked last, and of
  // as few as can be: it can be dear)
  for (const s of found) {
    const site = { ...s, plan: [PLAN] };
    const box = boxOf(site);
    if (keepOff(box[0] - CLEAR, box[1] - CLEAR, box[2] + CLEAR, box[3] + CLEAR)) continue;
    const { x, z, yaw } = s;
    const steps = layout(site, (wx, wz) => gen.height(wx, wz)).steps;
    const door = toWorld(site, 0, EDGE - steps.length * TREAD - DOOR_OUT);
    return {
      id: `huntclub:${Math.round(x)}:${Math.round(z)}`,
      name: clubName(gen.seed),
      x,
      z,
      yaw,
      base: s.base,
      lo: s.lo,
      hi: s.hi,
      plan: [PLAN],
      box,
      door: { x: door.x, z: door.z, yaw },
    };
  }
  return null;
}

// How high everything stands, on the ground as it is: all of it in the
// world, but for where the steps are (in the club's frame).
//   deck     the height of the porch and the clubhouse floor
//   steps    [{ z0, z1, top }]: each step down from the porch's edge, outwards
//            (z0 < z1, the club's frame), the last one a step above the ground
//   pads     [{ n, x, z, top, low }]: each station's pad (its middle, and how
//            high its top is and how low the ground under it goes)
//   houses   { H, L }: { floor, low }: the floor of each house and the lowest
//            ground under it
//   mouths   { H, L }: { x, y, z }: where each house throws from
//   cross    { x, y, z }: the spot the targets are thrown over
//   low      the lowest ground under the clubhouse
// site: the site (x, z, yaw); ground(x, z) -> the height of the ground.
export function layout(site, ground) {
  const _w = { x: 0, z: 0 };
  const g = (u, v) => {
    toWorld(site, u, v, _w);
    return ground(_w.x, _w.z);
  };
  // the clubhouse and its porch
  let top = -Infinity;
  let low = Infinity;
  for (let j = 0; j <= 4; j++) {
    for (let i = 0; i <= 6; i++) {
      const h = g(CLUB.x0 - 0.5 + ((CLUB.x1 - CLUB.x0 + 1) * i) / 6, EDGE + ((CLUB.z1 - EDGE) * j) / 4);
      top = Math.max(top, h);
      low = Math.min(low, h);
    }
  }
  const deck = top + DECK_UP;
  // the steps down to the ground in front of the porch, as many as it takes
  const foot = Math.min(g(0, EDGE - 1), g(-CLUB.steps, EDGE - 1), g(CLUB.steps, EDGE - 1));
  const n = Math.max(1, Math.ceil((deck - foot) / RISE));
  const rise = (deck - foot) / n;
  const steps = [];
  for (let i = 1; i < n; i++) steps.push({ z0: EDGE - i * TREAD, z1: EDGE - (i - 1) * TREAD, top: deck - i * rise });
  // the stations' pads
  const pads = STATIONS.map((s) => {
    let hi = -Infinity;
    let lo = Infinity;
    for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const h = g(s.x + u * FIELD.pad, s.z + v * FIELD.pad);
      hi = Math.max(hi, h);
      lo = Math.min(lo, h);
    }
    const p = toWorld(site, s.x, s.z);
    return { n: s.n, x: p.x, z: p.z, top: hi + PAD_UP, low: lo };
  });
  // the houses, and their traps
  const houses = {};
  const mouths = {};
  for (const [k, h] of Object.entries(HOUSES)) {
    const [x0, z0, x1, z1] = h.box;
    let hi = -Infinity;
    let lo = Infinity;
    for (const [u, v] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
      const y = g(u, v);
      hi = Math.max(hi, y);
      lo = Math.min(lo, y);
    }
    houses[k] = { floor: hi + 0.05, low: lo };
    const m = toWorld(site, h.mouth.x, h.mouth.z);
    mouths[k] = { x: m.x, y: hi + 0.05 + h.mouth.up, z: m.z };
  }
  const c = toWorld(site, 0, FIELD.cross);
  const cross = { x: c.x, y: g(0, FIELD.cross) + FIELD.crossUp, z: c.z };
  return { deck, low, steps, pads, houses, mouths, cross };
}

// Whether a region's airfield (airports/airports.js) might reach somewhere
// `d` metres from the middle of the region and `half` metres across either
// way: an airfield stands in its region's ring (r0 to r1 from its middle),
// and its box reaches this far further in, or out.
const FIELD_REACH = { inside: 170, outside: 4200 };
export function mayReach(g, d, half) {
  return d + half >= g.r0 - FIELD_REACH.inside && d - half <= g.r1 + FIELD_REACH.outside;
}

// The airfields' regions whose airfield might be in the way of a club
// anywhere it may be (from `start`): the ones whose airfield findSite will ask
// about. (regions: the Airports' regions.)
export function regionsInTheWay(regions, start) {
  const far = RING[1] + Math.hypot(PLAN[2] - PLAN[0], PLAN[3] - PLAN[1]) / 2 + Math.max(Math.abs(PLAN[1]), Math.abs(PLAN[3])) + CLEAR;
  return regions.filter((g) => mayReach(g, Math.hypot(start.x - g.x, start.z - g.z), far));
}

// What the club keeps clear of, all of it there first:
//   reserved   what the video store keeps clear of (videostore/site.js clearOf:
//              real places, old places, towns, caves' mouths, the railway,
//              the launch sites), and the store's branches
//   boxes      () -> [[x0, z0, x1, z1]]: other places' boxes in the world (the
//              first video store, the abandoned buildings)
//   airfields  the Airports (airports/airports.js: regions, site(id)), or null:
//              the airfields of regionsInTheWay are asked about, and found
//              then and there if they haven't been
// -> keepOff for findSite.
export function clearOf({ reserved = () => false, boxes = () => [], airfields = null }) {
  const over = (b, x0, z0, x1, z1) => b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0;
  return (x0, z0, x1, z1) => {
    if (reserved(x0, z0, x1, z1)) return true;
    for (const b of boxes()) if (over(b, x0, z0, x1, z1)) return true;
    if (airfields) {
      const x = (x0 + x1) / 2;
      const z = (z0 + z1) / 2;
      const half = Math.hypot(x1 - x0, z1 - z0) / 2;
      for (const g of airfields.regions) {
        if (!mayReach(g, Math.hypot(x - g.x, z - g.z), half)) continue;
        const field = airfields.site(g.id);
        if (field && over(field.box, x0, z0, x1, z1)) return true;
      }
    }
    return false;
  };
}
