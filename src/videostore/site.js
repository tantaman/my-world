// Where the video stores are.
//
// Rewind Video's first, a walk out from where people first arrive: past the
// launch site, near enough to find on a first afternoon. Where exactly is
// grown from the seed and the land, like the old places
// (landmarks/sites.js): the flattest dry ground in a ring round the start, a
// little nearer winning over a little flatter, so everyone in a world finds
// it in the same place and nothing about it is saved. Its branches stand
// beside towns (branchSite, and branches.js for which), found the same way
// round the town.
//
// Nothing about the land changes for it. The store and its car park stand on
// one slab of tarmac with sloping sides, set on the ground as it is: its top
// a little over the highest corner, its skirt running down to the lowest.
// The plants under it are hidden as it comes into view, as a town's are.
//
// No three.js in here: the tests read it.
//
// A site:
//   id      'videostore:<x>:<z>' (a branch: 'videostore:town:<i>:<j>', its
//           town's): a place on the map
//   name    what it's called: 'Rewind Video', 'Rewind Video, Meadowfield'
//   x, z    the middle of the shop floor; yaw, which way its front (+z)
//           faces: towards the start, or its town, where people come from
//   top     the height of the slab (the car park and the shop floor)
//   low     the lowest ground under its skirt
//   plan    [[x0, z0, x1, z1]]: the slab's top in its own frame
//           (landmarks/sites.js's toWorld, onPlan); cleared, that and its
//           sloping sides
//   box     [x0, z0, x1, z1] in the world, round the slab and its skirt
//   door    where `go here` sets you down: on the pavement outside the
//           doors, facing them ({ x, z, yaw })

import { samplesNear, CELL as LINE_CELL } from '../railway/lines.js';
import { toWorld } from '../landmarks/sites.js';
import { STORE } from './catalog.js';

const STORE_NAME = STORE.name;

// The building, in its own frame (m): the shop floor runs from -HALF_W to
// HALF_W across and from BACK to FRONT, its glass front at FRONT. See
// floorplan.js for what's inside.
export const HALF_W = 12;
export const BACK = -9;
export const FRONT = 9;
// The slab: the building, the pavement along its front and the car park.
export const SLAB = [-14.5, -11, 14.5, 25];
export const SKIRT = 2.4; // m the sloping sides run out past the top's edge
export const SLAB_UP = 0.3; // m the top stands over the highest ground under it
// Where it may be: this far from the start (m), the nearest ring first.
const RING = [260, 640];
const STEP = 26; // m between the spots looked at, round a ring and between rings
const FLAT_MOST = 3.2; // m the ground may rise across the slab and its sides
const DRY = 30; // m from the middle of the shop to the nearest water, at the least
const NEARER = 0.004; // m of rise a metre nearer the start is worth
const CLEAR = 20; // m round the slab kept clear of anything else grown from the seed
// Where you're set down from the map: on the pavement, outside the doors.
export const DOOR_STEP = { x: 0, z: FRONT + 3.2 };

// gen: the WorldGen (height(x, z), water.edge after it). start: { x, z }.
// keepOff(x0, z0, x1, z1): whether that square is somewhere it may not be
// (a hike, an old place, a town, a cave's mouth, a railway, the launch site).
// -> a site, or null where there's nowhere for one.
export function findSite(gen, start, keepOff = () => false) {
  const best = choose(finish(flats(gen, start, RING, STEP, NEARER)), keepOff);
  return best && siteAt(best, `videostore:${Math.round(best.x)}:${Math.round(best.z)}`, STORE_NAME);
}

// A branch beside a town (branches.js says which towns have one): the
// flattest dry ground in a ring round the town, just past its last houses,
// facing it, inside the town's own square (so no two branches meet). A
// generator, yielding now and then, and, while patient() says it may, until
// the railway it keeps clear of has been surveyed (keepOff.ready).
//   town     { id, name, x, z, box }; cell: [x0, z0, x1, z1], its square
export function* branchSite(gen, town, cell, keepOff = () => false, patient = () => false) {
  const reach = Math.max(...[[0, 1], [2, 1], [0, 3], [2, 3]].map(([a, b]) => Math.hypot(town.box[a] - town.x, town.box[b] - town.z)));
  const found = yield* flats(gen, town, [reach + BRANCH_RING[0], reach + BRANCH_RING[1]], STEP, BRANCH_NEARER);
  const inside = (b) => b[0] >= cell[0] && b[1] >= cell[1] && b[2] <= cell[2] && b[3] <= cell[3];
  const mine = found.filter((f) => inside(boxOf(f)));
  const r = reach + BRANCH_RING[1] + 60;
  while (patient() && keepOff.ready && !keepOff.ready(town.x - r, town.z - r, town.x + r, town.z + r)) yield;
  const best = choose(mine, keepOff);
  return best && siteAt(best, `videostore:${town.id}`, `${STORE_NAME}, ${town.name}`);
}
// How far past a town's reach (m, from its middle to the corners of its box)
// a branch is looked for, and how much a metre nearer is worth (m of rise).
export const BRANCH_RING = [36, 300];
const BRANCH_NEARER = 0.012;

const CORNERS = [
  [SLAB[0], SLAB[1]],
  [SLAB[2], SLAB[1]],
  [SLAB[2], SLAB[3]],
  [SLAB[0], SLAB[3]],
];
const SIDES = (() => {
  const [x0, z0, x1, z1] = SLAB;
  const out = SKIRT;
  return [
    [x0 - out, z0 - out],
    [x1 + out, z0 - out],
    [x1 + out, z1 + out],
    [x0 - out, z1 + out],
    [(x0 + x1) / 2, z0 - out],
    [(x0 + x1) / 2, z1 + out],
    [x0 - out, (z0 + z1) / 2],
    [x1 + out, (z0 + z1) / 2],
    [0, 0],
    [0, z1 * 0.6],
  ];
})();
const YIELD_EVERY = 40; // spots looked at between yields

// Every spot flat and dry enough in rings round `at`, from r0 out to r1,
// facing it. A generator, yielding now and then.
function* flats(gen, at, [r0, r1], step, nearer) {
  const found = [];
  const spot = { x: 0, z: 0, yaw: 0 };
  const _w = { x: 0, z: 0 };
  let looked = 0;
  for (let r = r0; r <= r1; r += step) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / step));
    const turn = r * 0.618 + 1.1; // each ring starts somewhere else round, so the spots don't line up
    for (let k = 0; k < n; k++) {
      if (++looked % YIELD_EVERY === 0) yield;
      const a = turn + (k / n) * Math.PI * 2;
      spot.x = at.x + Math.cos(a) * r;
      spot.z = at.z + Math.sin(a) * r;
      spot.yaw = Math.atan2(at.x - spot.x, at.z - spot.z);
      const mid = gen.height(spot.x, spot.z);
      if (gen.water.edge < DRY) continue;
      // a quick look at the corners first, and round its sides only if it's worth it
      let lo = mid;
      let hi = mid;
      for (const [u, v] of CORNERS) {
        toWorld(spot, u, v, _w);
        const h = gen.height(_w.x, _w.z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > FLAT_MOST) continue;
      let wet = false;
      for (const [u, v] of SIDES) {
        toWorld(spot, u, v, _w);
        const h = gen.height(_w.x, _w.z);
        if (gen.water.edge < 4) wet = true;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (wet || hi - lo > FLAT_MOST) continue;
      found.push({ x: spot.x, z: spot.z, yaw: spot.yaw, lo, hi, score: hi - lo + r * nearer });
    }
  }
  return found;
}

function finish(run) {
  let r;
  do r = run.next();
  while (!r.done);
  return r.value;
}

// The box round a spot's slab and its sloping sides, in the world.
function boxOf(s) {
  const [x0, z0, x1, z1] = SLAB;
  const out = SKIRT;
  const _w = { x: 0, z: 0 };
  let bx0 = Infinity;
  let bz0 = Infinity;
  let bx1 = -Infinity;
  let bz1 = -Infinity;
  for (const [u, v] of [
    [x0 - out, z0 - out],
    [x1 + out, z0 - out],
    [x1 + out, z1 + out],
    [x0 - out, z1 + out],
  ]) {
    toWorld(s, u, v, _w);
    bx0 = Math.min(bx0, _w.x);
    bz0 = Math.min(bz0, _w.z);
    bx1 = Math.max(bx1, _w.x);
    bz1 = Math.max(bz1, _w.z);
  }
  return [bx0, bz0, bx1, bz1];
}

// The best of them that nothing else is in the way of (asked last, and of
// as few as can be: it can be dear).
function choose(found, keepOff) {
  found.sort((a, b) => a.score - b.score);
  for (const s of found) {
    const box = boxOf(s);
    if (!keepOff(box[0] - CLEAR, box[1] - CLEAR, box[2] + CLEAR, box[3] + CLEAR)) return { ...s, box };
  }
  return null;
}

function siteAt(best, id, name) {
  const { x, z, yaw, box } = best;
  const [x0, z0, x1, z1] = SLAB;
  const out = SKIRT;
  const door = toWorld(best, DOOR_STEP.x, DOOR_STEP.z);
  return {
    id,
    name,
    x,
    z,
    yaw,
    top: best.hi + SLAB_UP,
    low: best.lo,
    plan: [SLAB],
    cleared: [[x0 - out, z0 - out, x1 + out, z1 + out]],
    box,
    door: { x: door.x, z: door.z, yaw: yaw + Math.PI },
  };
}

// What the store keeps clear of, all of it there first: the land of a real
// place (world/landforms.js), the old places (landmarks/sites.js), towns
// (towns/towns.js), the mouths of caves (caves/caves.js), the railway
// (railway/lines.js) and the launch sites (spaceport/site.js: a site, or
// all of them, LaunchSites). -> keepOff for findSite.
const MOUTH_CLEAR = 30; // m from a cave's mouth
export function clearOf({ landforms, sites, towns, caves, lines, spaceport = null }) {
  const keepOff = (x0, z0, x1, z1) => {
    if (landforms.reaches(x0, z0, x1, z1)) return true;
    const pads = !spaceport ? [] : spaceport.within ? spaceport.within(x0, z0, x1, z1) : [spaceport];
    for (const { box: b } of pads) if (b[0] < x1 && b[2] > x0 && b[1] < z1 && b[3] > z0) return true;
    if (sites.within(x0, z0, x1, z1).length) return true;
    if (towns.within(x0, z0, x1, z1).length) return true;
    for (const c of caves.inBox(x0, z0, x1, z1)) {
      const m = c.mouth;
      if (m.x > x0 - MOUTH_CLEAR && m.x < x1 + MOUTH_CLEAR && m.z > z0 - MOUTH_CLEAR && m.z < z1 + MOUTH_CLEAR) return true;
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const line of lines.within(x0, z0, x1, z1)) {
      let near = false;
      samplesNear(line, cx, cz, Math.max(x1 - x0, z1 - z0) / 2, () => (near = true));
      if (near) return true;
    }
    return false;
  };
  // whether the railway there has been surveyed (asking for it if not), so
  // a search can wait for it rather than stall
  keepOff.ready = (x0, z0, x1, z1) => {
    let known = true;
    for (let j = Math.floor(z0 / LINE_CELL); j <= Math.floor(z1 / LINE_CELL); j++) {
      for (let i = Math.floor(x0 / LINE_CELL); i <= Math.floor(x1 / LINE_CELL); i++) if (lines.peek(i, j) === undefined) known = false;
    }
    return known;
  };
  return keepOff;
}
