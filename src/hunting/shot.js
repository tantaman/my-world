// What a shot hits: the first thing along the ray from the crosshair —
// an animal, the ground, a trunk, a boulder, a wall — out to the range a
// rifle is worth anything at.
//
// It is handed what it looks at, so it can be tried without a browser:
//   chunks     the land (heightAt, forEachPlant)
//   buildings  what has been built (raycast), or null
//   wildlife   the animals (aimed), or null
//   which      (animal) -> whether a shot can hit it (what is game)
//   targets    anything else a shot can hit (Targets, below), or null

import { groundRay, rayCircle } from '../build/aim.js';
import { SPECIES } from '../build/forestry.js';
import { TREE_KINDS } from '../world/flora.js';

export const RANGE = 250; // metres
// Trunks and boulders are looked for this many metres of the ray at a time.
const STRETCH = 8;
// A boulder, in plan and in height, for its size (as rocks are grown, s).
const ROCK = { r: 0.6, h: 0.8 };
const PLANTS = [...TREE_KINDS, 'rock'];

// Things other than the animals that a shot can hit, from whatever feature
// put them in the world: a man on a watchtower, a bear that is hunting you,
// the stockade he stands behind. Each is a source:
//
//   {
//     aimed(o, d, far, near) -> { t, label?, hit?, solid? } or null
//                       the first of its things along the ray, between near
//                       and far metres. label: what the prompt calls it when
//                       the crosshair is on it; solid: it only stops the shot
//                       (a wall), with nothing to be hit
//     struck?(hit, at) -> a word for the HUD, or nothing
//                       the shot hit it (hit as aimed gave it; at: where)
//     heard?(x, z)      a shot was fired from (x, z), whatever it hit
//   }
//
//   const off = hunting.targets.add(source);   ...   off();
export class Targets {
  constructor() {
    this.list = [];
  }

  add(source) {
    this.list.push(source);
    return () => this.remove(source);
  }

  remove(source) {
    const i = this.list.indexOf(source);
    if (i >= 0) this.list.splice(i, 1);
  }

  // The nearest thing of any source along the ray. -> { t, label, hit, solid, source } or null
  aimed(o, d, far, near = 0) {
    let best = null;
    for (const source of this.list) {
      const a = source.aimed(o, d, best ? best.t : far, near);
      if (a && a.t >= near && a.t < (best ? best.t : far)) best = { ...a, source };
    }
    return best;
  }

  heard(x, z) {
    for (const source of [...this.list]) if (source.heard) source.heard(x, z);
  }
}

// The first thing between `near` and `far` metres along the ray from o in
// direction d (unit).
// -> { t, what, hit }: what is 'animal' | 'ground' | 'tree' | 'rock' |
//    'building' | 'target' | 'wall', or null if nothing is in range; hit is
//    the animal's (for wildlife.kill), when it was one, or a target's (for
//    its source's struck, which is `source`).
export function traceShot({ chunks, buildings = null, wildlife = null, which = null, targets = null }, o, d, near = 0, far = RANGE) {
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
  if (targets) {
    const a = targets.aimed(o, d, best.t, near);
    if (a) best = { t: a.t, what: a.solid ? 'wall' : 'target', hit: a.hit ?? null, source: a.source, label: a.label ?? null };
  }
  return best;
}
