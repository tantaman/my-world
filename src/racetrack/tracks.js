// The race tracks: one beside some of the towns people live in, past their
// last houses (site.js trackSite). Which towns have one, and which circuit
// it is, is from the seed and the town alone (hasTrack, layoutFor: cheap);
// where it stands is looked for the first time it's wanted, outright
// (forTown) or a little at a time (peek, then pump): towns/perTown.ts, as the
// video store's branches are.
//
// A track stands inside its town's own square, so no two meet, and keeps
// clear of whatever keepOff says (site.js clearOf).
//
// No three.js in here: the tests read it.

import { mulberry32 } from '../noise.js';
import { PerTown } from '../towns/perTown.ts';
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

// towns: the Towns (towns/towns.js); keepOff: site.js clearOf's.
// What it can be asked is PerTown's (towns/perTown.ts): forTown, peek, pump,
// within, prefetch, byId ('racetrack:town:<i>:<j>').
export class Tracks extends PerTown {
  constructor(gen, { towns, keepOff = () => false }) {
    super({
      towns,
      prefix: 'racetrack',
      has: (t) => hasTrack(t, gen.seed),
      grow: (t, square, patient) => trackSite(gen, t, layoutFor(t, gen.seed), square, keepOff, patient),
    });
    this.gen = gen;
    this.keepOff = keepOff;
  }
}
