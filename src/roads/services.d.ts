// What roads provides to the game, and so what `game.<name>` is for the
// features that come after it (see the top of game/game.ts). Its index.js
// is still JavaScript, which is why this is said here and not beside it.
// (So far, only what a typed feature after it has needed of it: the rest of
// what it provides is in its index.js, and goes here as it's wanted.)

import type { Roads } from './roads.js';
import type { firstThere } from './clear.js';

// The roads, and what they keep clear of (clear.js firstThere's).
type RoadsAndWhatWasThere = { roads: Roads; there: ReturnType<typeof firstThere> };

declare module '../game/game.ts' {
  interface Services {
    roads: RoadsAndWhatWasThere;
  }
}
