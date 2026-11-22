// Water held up in something: a swimming pool, a hot tub, a fountain's bowl.
// The land's own water (chunks.waterAt) lies on the ground, one level to a
// spot; this is water standing above it, in something built, perhaps far
// over the sea (a pool on a ship's top deck), so where it is has a height
// as well as a place: a body is only in it whose feet are about as high as
// its water.
//
// A basin is any object with
//
//   x0, z0, x1, z1      its extent in plan (a box round it, in the world)
//   level               the height of its water
//   contains(x, z)      is (x, z) within its rim? (a turned rectangle, a round tub)
//   bedAt(x, z)         the height of what's under the water there (its floor,
//                       or the steps going down into it)
//
// Whoever builds it adds it, and replaces or clears its own whole list at
// once, as with Solids: basins.set(owner, [basin]).
//
// at(x, z, y, out) is chunks.waterAt for a body with its feet about y: it
// fills out.level, out.depth (level − bed), out.flowX/Z and out.foam (still
// water, both 0) and returns true; false where there's no basin about.
// The player asks it before the land's water (player/player.js).

// How far (m) under a basin's floor, and over its water, a body still counts
// as at it: over, so that someone jumping in comes down into the water
// rather than through it to whatever is underneath.
const UNDER = 0.6;
const OVER = 3;

export class Basins {
  constructor() {
    this.owners = new Map(); // owner -> [basin]
    this.list = [];
  }

  set(owner, list) {
    this.owners.delete(owner);
    if (list && list.length) this.owners.set(owner, list);
    this.list = [...this.owners.values()].flat();
  }

  clear(owner) {
    this.set(owner, null);
  }

  // The basin a body at (x, z), feet about y, is at, or null; out as for
  // chunks.waterAt.
  at(x, z, y, out) {
    if (!Number.isFinite(y)) return null;
    for (const b of this.list) {
      if (x < b.x0 || z < b.z0 || x > b.x1 || z > b.z1) continue;
      if (y > b.level + OVER || !b.contains(x, z)) continue;
      const bed = b.bedAt(x, z);
      if (y < bed - UNDER) continue;
      out.level = b.level;
      out.depth = b.level - bed;
      out.flowX = 0;
      out.flowZ = 0;
      out.foam = 0;
      out.basin = b;
      return b;
    }
    return null;
  }
}
