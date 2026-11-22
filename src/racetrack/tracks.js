// The race tracks: one beside some of the towns people live in, past their
// last houses (site.js trackSite). Which towns have one, and which circuit
// it is, is from the seed and the town alone (hasTrack, layoutFor: cheap);
// where it stands is looked for the first time it's wanted, outright
// (forTown) or a little at a time (peek, then pump), like the video store's
// branches (videostore/branches.js).
//
// A track stands inside its town's own square, so no two meet, and keeps
// clear of whatever keepOff says (site.js clearOf).
//
// No three.js in here: the tests read it.

import { mulberry32 } from '../noise.js';
import { trackSite } from './site.js';
import { FOR_STYLE } from './layouts.js';

export const TRACK = {
  chance: 0.8, // that a town of a style with a layout (FOR_STYLE), with people in it, has one
};
const SALT = 0x5ace7a;

// Whether town t has a race track beside it, and which layout: from the
// seed, no land looked at. -> a key of LAYOUTS, or null
export function layoutFor(t, seed) {
  if (!t || !t.people || !FOR_STYLE[t.style]) return null;
  const r = mulberry32((t.seed ^ seed ^ SALT) >>> 0);
  if (r() >= TRACK.chance) return null;
  const list = FOR_STYLE[t.style];
  return list[Math.floor(r() * list.length)];
}
export const hasTrack = (t, seed) => layoutFor(t, seed) !== null;

export class Tracks {
  // towns: the Towns (towns/towns.js); keepOff: site.js clearOf's
  constructor(gen, { towns, keepOff = () => false }) {
    this.gen = gen;
    this.towns = towns;
    this.keepOff = keepOff;
    this.sites = new Map(); // town id -> track, or null
    this.growing = new Map(); // town id -> a search under way
    this.queue = new Map(); // town id -> town, asked about and not yet looked for
    this.patient = true; // a search may wait for the railway (not when one's wanted outright)
  }

  // The track beside town t, or null; looked for now if it hasn't been.
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
    if (!hasTrack(t, this.gen.seed)) return this._done(t, null);
    if (ask) this.queue.set(t.id, t);
    return undefined;
  }

  // Look for queued tracks for up to `ms` milliseconds. -> how many are left.
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

  // Tracks whose box overlaps a rectangle of the world. With wait = false,
  // only those already found (and the towns already known). A track is in
  // its town's square, so only the towns of the squares the rectangle
  // touches are asked about.
  within(x0, z0, x1, z1, wait = true) {
    const out = [];
    const S = this.towns.size;
    for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) {
      for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) {
        const t = wait ? this.towns.cell(i, j) : this.towns.peek(i, j);
        if (!t) continue;
        const b = wait ? this.forTown(t) : this.sites.get(t.id);
        if (b && b.box[0] <= x1 && b.box[2] >= x0 && b.box[1] <= z1 && b.box[3] >= z0) out.push(b);
      }
    }
    return out;
  }

  // Ask for the tracks of the towns known within r of (x, z) to be looked
  // for in the background.
  prefetch(x, z, r) {
    for (const t of this.towns.within(x - r, z - r, x + r, z + r, false)) this.peek(t);
  }

  // The track with this id ('racetrack:town:<i>:<j>'), or null.
  byId(id) {
    const m = /^racetrack:(town:-?\d+:-?\d+)$/.exec(String(id));
    const t = m && this.towns.byId(m[1]);
    return t ? this.forTown(t) : null;
  }

  *_grow(t) {
    const S = this.towns.size;
    const ci = Math.floor(t.x / S);
    const cj = Math.floor(t.z / S);
    return yield* trackSite(this.gen, t, layoutFor(t, this.gen.seed), [ci * S, cj * S, (ci + 1) * S, (cj + 1) * S], this.keepOff, () => this.patient);
  }

  _done(t, site) {
    this.growing.delete(t.id);
    this.queue.delete(t.id);
    this.sites.set(t.id, site);
    return site;
  }
}
