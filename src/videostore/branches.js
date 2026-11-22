// Rewind Video's branches: one beside some of the villages people live in,
// just past the last houses, facing the town (site.js branchSite). Which
// villages have one is from the seed and the town alone (hasBranch, cheap);
// where it stands is looked for the first time it's wanted, outright
// (forTown) or a little at a time (peek, then pump), like the railway.
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
export class Branches {
  constructor(gen, { towns, keepOff = () => false, also = () => false }) {
    this.gen = gen;
    this.towns = towns;
    this.keepOff = (...box) => also(...box) || keepOff(...box);
    this.keepOff.ready = keepOff.ready;
    this.sites = new Map(); // town id -> branch, or null
    this.growing = new Map(); // town id -> a search under way
    this.queue = new Map(); // town id -> town, asked about and not yet looked for
    this.patient = true; // a search may wait for the railway (not when one's wanted outright)
  }

  // The branch beside town t, or null; looked for now if it hasn't been.
  forTown(t) {
    const known = this.peek(t, false);
    if (known !== undefined) return known;
    const run = this.growing.get(t.id) || this._grow(t);
    this.patient = false;
    try {
      let r;
      do r = run.next();
      while (!r.done);
      return this._done(t, r.value);
    } finally {
      this.patient = true;
    }
  }

  // ...or undefined if it hasn't been, and then (if ask) it's queued for pump().
  peek(t, ask = true) {
    const known = this.sites.get(t.id);
    if (known !== undefined) return known;
    if (!hasBranch(t, this.gen.seed)) return this._done(t, null);
    if (ask) this.queue.set(t.id, t);
    return undefined;
  }

  // Look for queued branches for up to `ms` milliseconds. -> how many are left.
  pump(ms) {
    const t0 = performance.now();
    for (const [id, t] of this.queue) {
      let run = this.growing.get(id);
      if (!run) this.growing.set(id, (run = this._grow(t)));
      for (;;) {
        const r = run.next();
        if (r.done) {
          this._done(t, r.value);
          break;
        }
        if (performance.now() - t0 > ms) return this.queue.size;
      }
    }
    return this.queue.size;
  }

  // Branches whose box overlaps a rectangle of the world. With wait = false,
  // only those already found (and the towns already known).
  within(x0, z0, x1, z1, wait = true) {
    const out = [];
    const m = BRANCH_OUT;
    for (const t of this.towns.within(x0 - m, z0 - m, x1 + m, z1 + m, wait)) {
      const b = wait ? this.forTown(t) : this.sites.get(t.id);
      if (b && b.box[0] <= x1 && b.box[2] >= x0 && b.box[1] <= z1 && b.box[3] >= z0) out.push(b);
    }
    return out;
  }

  // Ask for the branches of the towns known within r of (x, z) to be looked
  // for in the background.
  prefetch(x, z, r) {
    for (const t of this.towns.within(x - r, z - r, x + r, z + r, false)) this.peek(t);
  }

  // The branch with this id ('videostore:town:<i>:<j>'), or null.
  byId(id) {
    const m = /^videostore:(town:-?\d+:-?\d+)$/.exec(String(id));
    const t = m && this.towns.byId(m[1]);
    return t ? this.forTown(t) : null;
  }

  *_grow(t) {
    const S = this.towns.size;
    const ci = Math.floor(t.x / S);
    const cj = Math.floor(t.z / S);
    return yield* branchSite(this.gen, t, [ci * S, cj * S, (ci + 1) * S, (cj + 1) * S], this.keepOff, () => this.patient);
  }

  _done(t, site) {
    this.growing.delete(t.id);
    this.queue.delete(t.id);
    this.sites.set(t.id, site);
    return site;
  }
}
