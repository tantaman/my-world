// What a shot hits: the first thing along the ray from the crosshair —
// an animal, the ground, a trunk, a boulder, a wall — out to the range a
// rifle is worth anything at.
//
// It is handed what it looks at, so it can be tried without a browser:
//   chunks     the land (heightAt, forEachPlant)
//   buildings  what has been built (raycast), or null
//   wildlife   the animals (aimed), or null
//   which      (animal) -> whether a shot can hit it (what is game)

import { groundRay, rayCircle } from '../build/aim.js';
import { SPECIES } from '../build/forestry.js';
import { TREE_KINDS } from '../world/flora.js';

export const RANGE = 250; // metres
// Trunks and boulders are looked for this many metres of the ray at a time.
const STRETCH = 8;
// A boulder, in plan and in height, for its size (as rocks are grown, s).
const ROCK = { r: 0.6, h: 0.8 };
const PLANTS = [...TREE_KINDS, 'rock'];

// The first thing between `near` and `far` metres along the ray from o in
// direction d (unit).
// -> { t, what, hit }: what is 'animal' | 'ground' | 'tree' | 'rock' |
//    'building', or null if nothing is in range; hit is the animal's (for
//    wildlife.kill), when it was one.
export function traceShot({ chunks, buildings = null, wildlife = null, which = null }, o, d, near = 0, far = RANGE) {
  let best = { t: far, what: null, hit: null };
  const g = groundRay(chunks, o, d, far);
  if (g && g.t >= near) best = { t: g.t, what: 'ground', hit: null };
  if (buildings) {
    const b = buildings.raycast(o, d, best.t);
    if (b && b.t >= near && b.t < best.t) best = { t: b.t, what: 'building', hit: null };
  }
  for (let s = near; s < best.t; s += STRETCH) {
    const m = Math.min(s + STRETCH / 2, best.t);
    chunks.forEachPlant(o.x + d.x * m, o.z + d.z * m, STRETCH / 2 + 2, PLANTS, (ch, kind, k, x, y, z, sc) => {
      const rock = kind === 'rock';
      const t = rayCircle(o, d, x, z, rock ? sc * ROCK.r : SPECIES[kind].r * sc);
      if (t === null || t < near || t >= best.t) return;
      const up = o.y + d.y * t - y;
      if (up < -0.3 || up > (rock ? sc * ROCK.h : SPECIES[kind].h * sc)) return;
      best = { t, what: rock ? 'rock' : 'tree', hit: null };
    });
  }
  if (wildlife) {
    const a = wildlife.aimed(o, d, best.t, near, which);
    if (a) best = { t: a.t, what: 'animal', hit: a };
  }
  return best;
}
