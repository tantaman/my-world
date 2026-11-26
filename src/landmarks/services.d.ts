// What landmarks provides to the game, and so what `game.<name>` is for the
// features that come after it (see the top of game/game.ts). Its index.js
// is still JavaScript, which is why this is said here and not beside it.

import type { Sites } from './sites.js';

// An old place as the console lists it: what it is, what it's called, where
// it stands, how far off, and whether you've been.
export interface OldPlace {
  id: string;
  kind: string;
  name: string;
  x: number;
  z: number;
  dist: number;
  visited: boolean;
}

// The old places, as the features after this one see them.
export interface Landmarks {
  sites: Sites;
  visited: Set<string>;
  // what's within r of you, nearest first (only those that stand)
  list(r?: number): OldPlace[];
  nearest(kind?: string | null, r?: number): OldPlace | null;
}

declare module '../game/game.ts' {
  interface Services {
    landmarks: Landmarks;
  }
}
