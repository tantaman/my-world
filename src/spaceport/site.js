// Where the launch site is.
//
// There is one, a few hundred metres from where people first arrive: far
// enough out of the clearing round the start that nobody's cabin is under
// it, near enough to find on a first walk. Where exactly is grown from the
// seed and the land, like the old places (landmarks/sites.js): the flattest
// dry ground in a ring round the start, a little nearer winning over a
// little flatter, so everyone in a world finds it in the same place and
// nothing about it is saved.
//
// Nothing about the land changes for it. The pad is a slab of concrete with
// sloping sides, set on the ground as it is: its top a little over the
// highest corner, its skirt running down to the lowest. The plants under it
// are hidden as it comes into view, as a town's are.
//
// No three.js in here: the tests read it.
//
// A site:
//   id      'spaceport:<x>:<z>': a place on the map
//   x, z    the middle of the pad; yaw, which way its front (+z) faces:
//           towards the start, where people come from
//   top     the height of the top of the pad
//   low     the lowest ground under its skirt
//   plan    [[x0, z0, x1, z1]]: the pad's top in its own frame (landmarks/sites.js's
//           toWorld, onPlan); cleared, the same and its sloping sides
//   box     [x0, z0, x1, z1] in the world, round the pad and its skirt
//   rocket  where the rocket stands, in its own frame: { x, z }

import { samplesNear } from '../railway/lines.js';

export const PAD = 9; // m from the middle of the pad to its edge (18 m square)
export const SKIRT = 2.2; // m the sloping sides run out past the top's edge
export const PAD_UP = 0.35; // m the top stands over the highest ground under it
// Where it may be: this far from the start (m), the nearest ring first.
const RING = [190, 430];
const STEP = 22; // m between the spots looked at, round a ring and between rings
const FLAT_MOST = 2.6; // m the ground may rise across the pad and its sides
const DRY = 18; // m from the middle of the pad to the nearest water, at the least
const NEARER = 0.004; // m of rise a metre nearer the start is worth
const CLEAR = 24; // m round the pad kept clear of anything else grown from the seed

// The rocket stands in the middle of the pad; the tower beside it on the
// back (−z), so the rocket's door faces the way people come.
export const ROCKET_AT = { x: 0, z: 0 };
export const TOWER_AT = { x: 0, z: -4.6 };
// Where a capsule coming home comes down: on the pad, off to one side.
export const LANDING_AT = { x: 5.2, z: 4.4 };

// gen: the WorldGen (height(x, z), water.edge after it). start: { x, z }.
// keepOff(x0, z0, x1, z1): whether that square is somewhere it may not be
// (a hike, an old place, a town, a cave's mouth, a railway).
// -> a site, or null where there's nowhere for one.
export function findSite(gen, start, keepOff = () => false) {
  // every spot flat and dry enough, then the best of them that nothing else
  // is in the way of (asked last, and of as few as can be: it can be dear)
  const found = [];
  for (let r = RING[0]; r <= RING[1]; r += STEP) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / STEP));
    const turn = r * 0.618; // each ring starts somewhere else round, so the spots don't line up
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2;
      const x = start.x + Math.cos(a) * r;
      const z = start.z + Math.sin(a) * r;
      const mid = gen.height(x, z);
      if (gen.water.edge < DRY) continue;
      // a quick look at the corners first, and round its sides only if it's worth it
      let lo = mid;
      let hi = mid;
      for (const [u, v] of CORNERS) {
        const h = gen.height(x + u * PAD, z + v * PAD);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > FLAT_MOST) continue;
      for (const [u, v] of EDGES) {
        const h = gen.height(x + u * (PAD + SKIRT), z + v * (PAD + SKIRT));
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > FLAT_MOST) continue;
      found.push({ x, z, lo, hi, score: hi - lo + r * NEARER });
    }
  }
  found.sort((a, b) => a.score - b.score);
  const reach = PAD + SKIRT + CLEAR;
  const best = found.find(({ x, z }) => !keepOff(x - reach, z - reach, x + reach, z + reach));
  if (!best) return null;
  const { x, z } = best;
  const yaw = Math.atan2(start.x - x, start.z - z);
  const out = PAD + SKIRT;
  // (the box is square to the world, round the pad however it's turned)
  const e = out * Math.SQRT2;
  return {
    id: `spaceport:${Math.round(x)}:${Math.round(z)}`,
    x,
    z,
    yaw,
    top: best.hi + PAD_UP,
    low: best.lo,
    plan: [[-PAD, -PAD, PAD, PAD]],
    cleared: [[-out, -out, out, out]],
    box: [x - e, z - e, x + e, z + e],
  };
}

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const EDGES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

// What the launch site keeps clear of, all of it there first: the land of a
// real place (world/landforms.js), the old places (landmarks/sites.js),
// towns (towns/towns.js), the mouths of caves (caves/caves.js) and the
// railway (railway/lines.js). -> keepOff for findSite.
const MOUTH_CLEAR = 30; // m from a cave's mouth
export function clearOf({ landforms, sites, towns, caves, lines }) {
  return (x0, z0, x1, z1) => {
    if (landforms.reaches(x0, z0, x1, z1)) return true;
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
      samplesNear(line, cx, cz, (x1 - x0) / 2, () => (near = true));
      if (near) return true;
    }
    return false;
  };
}
