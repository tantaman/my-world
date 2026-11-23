// What's thrown by whatever is asked about something it has sent for and
// hasn't got yet: the real Earth under a part of the world, say, before its
// tile has come (world/earth.js). It isn't a fault. Whoever asked can try
// again later: a search (core/searches.ts) starts over once it's in, and a
// system that runs every frame (game/game.ts) is simply run again next frame.

export class NotYet extends Error {
  // what it is waiting for, for whoever wants to say
  readonly what: string;

  constructor(what: string) {
    super(`${what} isn't here yet`);
    this.name = 'NotYet';
    this.what = what;
  }
}

// Whether err is one of those.
export const isNotYet = (err: unknown): err is NotYet => err instanceof NotYet;
