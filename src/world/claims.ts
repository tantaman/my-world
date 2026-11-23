// What stands where, for whatever comes after it to keep clear of.
//
// Everything grown from the seed that has a place (an old cabin, a town, the
// railway, a launch site) was there before whatever is grown after it, and
// the later thing is looked for where the earlier ones are not. Each of
// those earlier things is a *claim*: asked about a box of the world, it says
// whether any of it is its own.
//
//   const keepOff = keepClear([
//     landOf(landforms),            // a real place's land (world/landforms.js)
//     placesOf(sites),              // the old places, by their boxes
//     placesOf(towns),
//     caveMouths(caves, 30),        // caves/sites.js: its owner says how it's asked
//     railsNear(lines, REACH.width),   // railway/lines.js
//   ]);
//   keepOff(x0, z0, x1, z1)         // is any of that box somewhere this may not be?
//   keepOff.ready(x0, z0, x1, z1)   // has everything dear to find been found there
//                                   // yet? (asks for it if not: a search far off
//                                   // waits for it, rather than stall)
//
// How a thing is kept clear of is its owner's to say, once, where the thing
// is (the two helpers here are for anything kept in a registry of boxes).
// Which things a search keeps clear of, and how near, is that search's, and
// part of what a seed grows: each search's list is as it has always been,
// because changing one moves what it places.

export type Box = [number, number, number, number];

export interface Claim {
  // Is any of the box (x0, z0)–(x1, z1) this claim's?
  holds(x0: number, z0: number, x1: number, z1: number): boolean;
  // Is what's this claim's there known yet? Asking is what sends for it.
  // (Left out: it always is.)
  ready?(x0: number, z0: number, x1: number, z1: number): boolean;
}

export interface KeepOff {
  (x0: number, z0: number, x1: number, z1: number): boolean;
  ready?: (x0: number, z0: number, x1: number, z1: number) => boolean;
}

// One answer from several claims, asked in the order given. `waits: false`
// leaves `ready` off, for a search that has what it needs found there and
// then rather than wait.
export function keepClear(claims: Claim[], { waits = true }: { waits?: boolean } = {}): KeepOff {
  const keepOff: KeepOff = (x0, z0, x1, z1) => {
    for (const c of claims) if (c.holds(x0, z0, x1, z1)) return true;
    return false;
  };
  const slow = claims.filter((c) => c.ready);
  if (waits && slow.length) {
    keepOff.ready = (x0, z0, x1, z1) => {
      // every one of them asked, so that all of it is sent for at once
      let known = true;
      for (const c of slow) if (!c.ready!(x0, z0, x1, z1)) known = false;
      return known;
    };
  }
  return keepOff;
}

// A real place's land, and all that it can change round it.
export const landOf = (landforms: { reaches(x0: number, z0: number, x1: number, z1: number): unknown }): Claim => ({
  holds: (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1),
});

// Things kept in a registry that answers within(box) with those whose own
// boxes overlap it: the old places, the towns.
export const placesOf = (registry: { within(x0: number, z0: number, x1: number, z1: number): unknown[] }): Claim => ({
  holds: (x0, z0, x1, z1) => registry.within(x0, z0, x1, z1).length > 0,
});

// Boxes ([x0, z0, x1, z1], or nothing where there's none) asked for each
// time: touching counts as overlapping unless `touching` is false.
export const boxesOf = (boxes: (x0: number, z0: number, x1: number, z1: number) => Array<number[] | null | undefined | false>, { touching = true }: { touching?: boolean } = {}): Claim => ({
  holds: (x0, z0, x1, z1) => {
    for (const b of boxes(x0, z0, x1, z1)) {
      if (!b) continue;
      if (touching ? b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0 : b[0] < x1 && b[2] > x0 && b[1] < z1 && b[3] > z0) return true;
    }
    return false;
  },
});

// A keepOff someone already has, as one claim among others.
export const claimOf = (keepOff: KeepOff): Claim => ({ holds: keepOff, ready: keepOff.ready });
