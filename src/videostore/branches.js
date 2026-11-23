// Rewind Video's branches: one beside some of the villages people live in,
// just past the last houses, facing the town (site.js branchSite). Which
// villages have one is from the seed and the town alone (hasBranch, cheap);
// where it stands is looked for the first time it's wanted, outright
// (forTown) or a little at a time (peek, then pump): towns/perTown.ts.
//
// A branch stands inside its town's own square, so no two meet; it keeps
// clear of whatever else keepOff says (the store's clearOf: real places, the
// old places, towns, caves, the railway, the launch sites), and of `also`
// (Rewind Video by the start, the airfields). Everything a branch carries is
// the chain's: its shelves, its staff, its rules; tapes rented at one can go
// back at any.
//
// No three.js in here: the tests read it.

import { mulberry32 } from '../noise.js';
import { PerTown } from '../towns/perTown.ts';
import { branchSite, BRANCH_RING } from './site.js';

export const BRANCH = {
  kinds: ['village'], // the kinds of town that have one (towns/kinds.js), if people live there
  chance: 0.85, // that one of those has one
};
const SALT = 0x2e7a1d;
// The furthest (m) a branch's slab reaches past its town's box.
export const BRANCH_OUT = BRANCH_RING[1] + 60;

// Whether town t has a branch beside it, from the seed: no land looked at.
export function hasBranch(t, seed) {
  if (!t || !t.people || !BRANCH.kinds.includes(t.kind)) return false;
  return mulberry32((t.seed ^ seed ^ SALT) >>> 0)() < BRANCH.chance;
}

// towns: the Towns (towns/towns.js); keepOff: as findSite's (clearOf);
// also(x0, z0, x1, z1): somewhere else a branch may not be.
// What it can be asked is PerTown's (towns/perTown.ts): forTown, peek, pump,
// within, prefetch, byId ('videostore:town:<i>:<j>').
export class Branches extends PerTown {
  constructor(gen, { towns, keepOff = () => false, also = () => false }) {
    const off = (...box) => also(...box) || keepOff(...box);
    off.ready = keepOff.ready;
    super({
      towns,
      prefix: 'videostore',
      reach: BRANCH_OUT,
      has: (t) => hasBranch(t, gen.seed),
      grow: (t, square, patient) => branchSite(gen, t, square, off, patient),
    });
    this.gen = gen;
    this.keepOff = off;
  }
}
