// Where Rewind Video and its branch are.
//
// The original is a walk out from where people first arrive: past the launch
// site, near enough to find on a first afternoon. Its address is grown from
// the seed and the land, like the old places (landmarks/sites.js): the
// flattest dry ground in a ring round the start, a little nearer winning
// over a little flatter, so everyone in a world finds it in the same place
// and nothing about it is saved.
//
// Nothing about the land changes for it. The store and its car park stand on
// one slab of tarmac with sloping sides, set on the ground as it is: its top
// a little over the highest corner, its skirt running down to the lowest.
// The plants under it are hidden as it comes into view, as a town's are.
//
// No three.js in here: the tests read it.
//
// A site:
//   id      'videostore:<x>:<z>': a place on the map
//   x, z    the middle of the shop floor; yaw, which way its front (+z)
//           faces: towards the start, where people come from
//   top     the height of the slab (the car park and the shop floor)
//   low     the lowest ground under its skirt
//   plan    [[x0, z0, x1, z1]]: the slab's top in its own frame
//           (landmarks/sites.js's toWorld, onPlan); cleared, that and its
//           sloping sides
//   box     [x0, z0, x1, z1] in the world, round the slab and its skirt
//   door    where `go here` sets you down: on the pavement outside the
//           doors, facing them ({ x, z, yaw })

import { samplesNear } from '../railway/lines.js';
import { toWorld } from '../landmarks/sites.js';
import { hash2i } from '../noise.js';

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
export function findSite(gen, start, keepOff = () => false, { ring = RING, step = STEP, turnOffset = 1.1 } = {}) {
  const found = [];
  const [x0, z0, x1, z1] = SLAB;
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const out = SKIRT;
  const sides = [
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
  const spot = { x: 0, z: 0, yaw: 0 };
  const _w = { x: 0, z: 0 };
  for (let r = ring[0]; r <= ring[1]; r += step) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / step));
    const turn = r * 0.618 + turnOffset; // each ring starts somewhere else round, so the spots don't line up
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2;
      spot.x = start.x + Math.cos(a) * r;
      spot.z = start.z + Math.sin(a) * r;
      spot.yaw = Math.atan2(start.x - spot.x, start.z - spot.z);
      const mid = gen.height(spot.x, spot.z);
      if (gen.water.edge < DRY) continue;
      // a quick look at the corners first, and round its sides only if it's worth it
      let lo = mid;
      let hi = mid;
      for (const [u, v] of corners) {
        toWorld(spot, u, v, _w);
        const h = gen.height(_w.x, _w.z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > FLAT_MOST) continue;
      let wet = false;
      for (const [u, v] of sides) {
        toWorld(spot, u, v, _w);
        const h = gen.height(_w.x, _w.z);
        if (gen.water.edge < 4) wet = true;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (wet || hi - lo > FLAT_MOST) continue;
      found.push({ x: spot.x, z: spot.z, yaw: spot.yaw, lo, hi, score: hi - lo + r * NEARER });
    }
  }
  found.sort((a, b) => a.score - b.score);
  const boxOf = (s) => {
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
  };
  // the best of them that nothing else is in the way of (asked last, and of
  // as few as can be: it can be dear)
  let best = null;
  let box = null;
  for (const s of found) {
    box = boxOf(s);
    if (!keepOff(box[0] - CLEAR, box[1] - CLEAR, box[2] + CLEAR, box[3] + CLEAR)) {
      best = s;
      break;
    }
  }
  if (!best) return null;
  const { x, z, yaw } = best;
  const door = toWorld(best, DOOR_STEP.x, DOOR_STEP.z);
  return {
    id: `videostore:${Math.round(x)}:${Math.round(z)}`,
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

const BRANCH_THEMES = [
  { section: 'horror', label: 'Horror', fascia: 0x472052 },
  { section: 'scifi', label: 'Sci-fi', fascia: 0x144753 },
  { section: 'cult', label: 'Cult films', fascia: 0x57302c },
];

export function findBranch(gen, start, towns, keepOff) {
  function reserved(x0, z0, x1, z1) {
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    // Leave room around the Mineral Baths and Furnace Works survey rings.
    const distance = Math.hypot(x - start.x, z - start.z);
    return distance < 2350 || distance > 3340 ||
      gen.padClearance(x, z) < Math.hypot(x1 - x0, z1 - z0) / 2 ||
      keepOff(x0, z0, x1, z1);
  }

  function survey(anchor, ring, step) {
    const seed = hash2i(Math.round(anchor.x), Math.round(anchor.z), gen.seed ^ 0x726577);
    const site = findSite(gen, anchor, reserved, { ring, step, turnOffset: (seed % 360) * Math.PI / 180 });
    return site && { ...site, branch: anchor.name, seed, theme: BRANCH_THEMES[seed % BRANCH_THEMES.length] };
  }

  const reach = 4200;
  const dist = (town) => Math.hypot(town.x - start.x, town.z - start.z);
  const nearby = towns.within(start.x - reach, start.z - reach, start.x + reach, start.z + reach)
    .filter((town) => town.people > 0 && dist(town) >= 2050 && dist(town) <= 3690)
    .sort((a, b) => dist(a) - dist(b));
  for (const town of nearby.slice(0, 5)) {
    const branch = survey(town, [95, 350], 32);
    if (branch) return branch;
  }
  return survey({ ...start, name: 'Outpost' }, [2380, 3310], 120);
}

// What the store keeps clear of, all of it there first: the land of a real
// place (world/landforms.js), the old places (landmarks/sites.js), towns
// (towns/towns.js), the mouths of caves (caves/caves.js), the railway
// (railway/lines.js) and the launch site (spaceport/site.js).
// -> keepOff for findSite.
const MOUTH_CLEAR = 30; // m from a cave's mouth
export function clearOf({ landforms, sites, towns, caves, lines, spaceport = null }) {
  return (x0, z0, x1, z1) => {
    if (landforms.reaches(x0, z0, x1, z1)) return true;
    if (spaceport) {
      const b = spaceport.box;
      if (b[0] < x1 && b[2] > x0 && b[1] < z1 && b[3] > z0) return true;
    }
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
}
