// What roads provides to the game, and so what `game.<name>` is for the
// features that come after it (see the top of game/game.ts). Its index.js
// is still JavaScript, which is why this is said here and not beside it.
// (So far, only what a typed feature after it has needed of it: the rest of
// what it provides is in its index.js, and goes here as it's wanted.)

import type { Roads } from './roads.js';
import type { firstThere } from './clear.js';

// The roads and towns' gates round a spot (around()), to ask under() about
// again and again, a frame at a time.
export interface RoadsAround {
  roads: object[];
  gates: object[];
}
// The road at a spot (under()): the height of its top there, what it's made
// of, whether that's on the road itself rather than its shoulder, and which
// way it runs.
export interface RoadUnder {
  road: object | null; // (null on a town's gate)
  top: number;
  surface: 'paved' | 'gravel';
  on: boolean;
  s: number;
  dx: number;
  dz: number;
}

// The roads, and what they keep clear of (clear.js firstThere's); and for
// anything that rolls along them, what's underfoot on one.
type RoadsAndWhatWasThere = {
  roads: Roads;
  there: ReturnType<typeof firstThere>;
  around(x: number, z: number, r: number): RoadsAround;
  under(x: number, z: number, here?: RoadsAround): RoadUnder | null;
};

declare module '../game/game.ts' {
  interface Services {
    roads: RoadsAndWhatWasThere;
  }
}
