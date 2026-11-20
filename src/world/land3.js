// The third land: the second (land2.js), and the sea.
//
// Grown from the second, so it has the same country, woods and mountains,
// and then, a walk from the start, the land goes down to the sea (sea.js):
// the hills tilt down under it, so the coast follows them, with coves,
// headlands and islands, a sand beach and a sandy seabed, and rivers running
// out into it. And its lakes go deep: most are tarns, a shelf out from the
// shore and then a steep drop (DEEP in drainage.js).
//
// Like the others, once worlds have been grown on it, what it grows is
// pinned (test/golden/*-land3.json) and must not change.

import { Land2 } from './land2.js';
import { Sea, SEA } from './sea.js';
import { DEEP } from './drainage.js';

export class Land3 extends Land2 {
  constructor(seed, structures = []) {
    super(seed, structures);
    this.land = 3;
  }

  _fields(n) {
    super._fields(n);
    // (fields 40 and on are the sea's)
    this.sea = new Sea(this.seed, n, (x, z) => super.broadHeight(x, z, 0));
  }

  // The second land's hills, laid by the sea. Everything else about the
  // height is built on this (the second land's _baseHeight asks it), so the
  // map, the water's routes and the ground you walk on all go down to it.
  broadHeight(x, z, minWavelength = 0) {
    return this.sea.shape(super.broadHeight(x, z, minWavelength), x, z);
  }

  // A real place out in the sea stands as an island, its trailhead a little
  // over the water, rather than down on the seabed with the sea round it.
  datumLevel(h) {
    return Math.max(h, this.sea.level + SEA.island);
  }

  // The second land's ponds and lakes, the lakes deep.
  stillWater(x, z) {
    const w = super.stillWater(x, z);
    return { pond: w.pond, lake: { ...w.lake, deep: DEEP }, room: w.room };
  }
}
