// Where the gate to Dry Wells stands.
//
// There is one, a walk from where people first arrive. Where exactly is
// grown from the seed and the land, like the old places (landmarks/sites.js)
// and the launch site: the flattest dry ground in a ring round the start, a
// little nearer winning over a little flatter, clear of everything else that
// was there first. Everyone in a world finds it in the same place, and
// nothing about it is saved.
//
// The spots it could be are read off the land alone (candidates), which is
// quick. Which of them it is depends on what else is there (pickSite), and
// some of that is only found a little at a time after the world opens (the
// airfields, the hunt club, the roads): so the game looks for the spots at
// once and picks among them when all that is known (index.ts).
//
// Nothing about the land changes for it. The gate stands on a slab of paving
// with sloping sides, set on the ground as it is: its top a little over the
// highest corner, its skirt running down to the lowest. The plants under it
// are hidden as it comes into view.
//
// No three.js in here: the tests read it.
//
// A site:
//   id      'skirmish:<x>:<z>': a place on the map
//   x, z    the middle of the slab, and of the gateway; yaw, which way its
//           front (+z) faces: towards the start, where people come from
//   top     the height of the top of the slab
//   low     the lowest ground under its skirt
//   plan    [[x0, z0, x1, z1]]: the slab's top in its own frame
//           (landmarks/sites.js's toWorld, onPlan); cleared, the same and
//           its sloping sides
//   box     [x0, z0, x1, z1] in the world, round the slab and its skirt

import { keepClear, landOf, placesOf, boxesOf } from '../world/claims.ts';
import { railsNear, NEAR } from '../railway/lines.js';
import { roadsNear } from '../roads/roads.js';
import { thereFirst } from '../roads/clear.js';
import { lotsOver } from '../cars/dealers.js';

export const NAME = 'Dry Wells'; // the town the gate leads to
export const HALF = { x: 7, z: 5 }; // m from the middle of the slab to its edges
export const FRONT = 4.2; // m out in front of the archway: where you're set down, and stand while you're in the town
export const SKIRT = 2; // m the sloping sides run out past the top's edge
export const SLAB_UP = 0.3; // m the top stands over the highest ground under it
export const DOOR = { half: 2, tall: 3.9 }; // the gateway: m either side of the middle, and how high
// Where it may be: this far from the start (m), the nearest ring first.
const RING = [130, 470];
const STEP = 19; // m between the spots looked at, round a ring and between rings
const FLAT_MOST = 2.2; // m the ground may rise across the slab and its sides
const DRY = 14; // m from the middle of the slab to the nearest water, at the least
const NEARER = 0.004; // m of rise a metre nearer the start is worth
const CLEAR = 18; // m round the slab kept clear of anything else grown from the seed
// How far (m) the square looked at round a spot is kept from the things
// that are kept clear of by how near they run or stand.
const KEEP = { rails: 8, roads: 12, hell: 40 };
const AROUND = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
// How far the slab and its skirt reach from its middle, however it's turned.
const SLAB_REACH = Math.hypot(HALF.x, HALF.z) + SKIRT;
// How far from the start anything that might be in the gate's way can be (m).
export const REACH = RING[1] + SLAB_REACH + CLEAR;

// What the gate keeps clear of: everything that was there first, each as
// its owner says it's kept clear of (world/claims.ts).
//   landforms   real places' land (world/landforms.js)
//   there       what the roads keep clear of (roads/clear.js firstThere's):
//               the old places, caves, launch sites, stores, airfields,
//               abandoned buildings, hunt clubs, race tracks, the pier
//   towns, lines, roads, dealers   the Towns, the railway's Lines, the Roads,
//               the towns' Dealers
//   hell        the gate under the hill ({ x, z }), where there is one
// Whatever is left out isn't kept clear of. Its `ready(box)` says whether
// all of that has been found there yet, and sends for it if not.
/**
 * @param {{ landforms?: any, there?: any, towns?: any, lines?: any, roads?: any, dealers?: any, hell?: { x: number, z: number } | null }} [things]
 */
export function clearOf({ landforms = null, there = null, towns = null, lines = null, roads = null, dealers = null, hell = null } = {}) {
  return keepClear(
    [
      landforms && landOf(landforms),
      there && thereFirst(there),
      towns && placesOf(towns),
      // (the rails within the square's reach of its middle, and a little over)
      lines && railsNear(lines, (x0, z0, x1, z1) => NEAR.corner(x0, z0, x1, z1) + KEEP.rails),
      roads && roadsNear(roads, KEEP.roads),
      dealers && lotsOver(dealers),
      hell && boxesOf(() => [[hell.x - KEEP.hell, hell.z - KEEP.hell, hell.x + KEEP.hell, hell.z + KEEP.hell]]),
    ].filter(Boolean),
  );
}

// The spots the gate could stand, the best first: flat and dry enough.
// gen: the WorldGen (height(x, z), water.edge after it). start: { x, z }.
// -> [{ x, z, lo, hi }]
export function candidates(gen, start) {
  const found = [];
  for (let r = RING[0]; r <= RING[1]; r += STEP) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / STEP));
    const turn = r * 0.381; // each ring starts somewhere else round, so the spots don't line up
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2;
      const x = start.x + Math.cos(a) * r;
      const z = start.z + Math.sin(a) * r;
      const mid = gen.height(x, z);
      if (gen.water.edge < DRY) continue;
      // however it's turned, it fits in the circle round it: look there
      let lo = mid;
      let hi = mid;
      for (const [u, v] of AROUND) {
        const h = gen.height(x + u * SLAB_REACH * 0.72, z + v * SLAB_REACH * 0.72);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > FLAT_MOST) continue;
      found.push({ x, z, lo, hi, score: hi - lo + r * NEARER });
    }
  }
  return found.sort((a, b) => a.score - b.score);
}

// The best of those spots that nothing else is in the way of, as a site.
// keepOff(x0, z0, x1, z1): whether that square is somewhere it may not be
// (clearOf's).
// -> a site, or null where there's nowhere for one.
/**
 * @param {{ x: number, z: number }} start
 * @param {{ x: number, z: number, lo: number, hi: number }[]} spots
 * @param {(x0: number, z0: number, x1: number, z1: number) => boolean} [keepOff]
 */
export function pickSite(start, spots, keepOff = () => false) {
  const clear = SLAB_REACH + CLEAR;
  const best = spots.find(({ x, z }) => !keepOff(x - clear, z - clear, x + clear, z + clear));
  if (!best) return null;
  const { x, z } = best;
  return {
    id: `skirmish:${Math.round(x)}:${Math.round(z)}`,
    x,
    z,
    yaw: Math.atan2(start.x - x, start.z - z),
    top: best.hi + SLAB_UP,
    low: best.lo,
    plan: [[-HALF.x, -HALF.z, HALF.x, HALF.z]],
    cleared: [[-HALF.x - SKIRT, -HALF.z - SKIRT, HALF.x + SKIRT, HALF.z + SKIRT]],
    box: [x - SLAB_REACH, z - SLAB_REACH, x + SLAB_REACH, z + SLAB_REACH],
  };
}

// Both at once, for whoever has everything that might be in the way to hand.
export const findSite = (gen, start, keepOff) => pickSite(start, candidates(gen, start), keepOff);
