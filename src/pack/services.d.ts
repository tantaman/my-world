// What pack provides to the game, and so what `game.<name>` is for the
// features that come after it (see the top of game/game.ts). Its index.js
// is still JavaScript, which is why this is said here and not beside it.

// Something of yours, as the pack lists it (things.js).
export interface Thing {
  label: string;
  note?: string;
  icon?: string;
  empty?: boolean;
}

// Your pack, as the features after this one see it.
export interface Pack {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  list(): { hand: unknown[]; rest: unknown[]; yours: Array<{ label: string; note: string }> };
  do(id: string): unknown;
  // something you have, listed under what's yours
  have(source: () => Thing[] | null | undefined): void;
}

declare module '../game/game.ts' {
  interface Services {
    pack: Pack;
  }
}
