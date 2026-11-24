// What act provides to the game, and so what `game.act` is for the features
// that come after it (see the top of game/game.ts). Its index.js is still
// JavaScript, which is why this is said here and not beside it.

import type { Offers } from './offers.js';

// What the act key would do, as an offer's at() says it: how far you are
// from what it would be done to (m; 0 if you're in or on it), what doing it
// is called, doing it, and its picture for your pack.
export interface ActAt {
  d: number;
  word: string;
  run(): unknown;
  hold?(dt: number): unknown;
  icon?: string;
}

// The act key, to the features that offer it something to do.
export interface Act {
  offers: Offers;
  offer(o: { id: string; at(): ActAt | null }): void;
  here(): (ActAt & { id: string }) | null;
  press(): boolean;
  key(word: string): string;
}

declare module '../game/game.ts' {
  interface Services {
    act: Act;
  }
}
