// Which land a world is grown on.
//
// A world is its seed and its land. The land is the way the forest is grown
// from the seed; when the way changes, the change is a new land, and every
// world keeps the land it was first grown on — a save is only what was
// changed from what its seed grows, so growing it differently would leave
// every cabin floating over, or buried in, somebody's hillside.
//
//   1  rolling hills and mixed woods everywhere (worldgen.js)
//   2  lake country, hills and mountains, benches, and different woods
//      (land2.js)
//
// New worlds are grown on the newest. A world saved before lands were
// counted says nothing about it, and is land 1.

import { WorldGen } from './worldgen.js';
import { Land2 } from './land2.js';

const GROWN = { 1: WorldGen, 2: Land2 };

// Every land this build can grow, oldest first.
export const LANDS = Object.keys(GROWN).map(Number);
export const NEWEST_LAND = LANDS[LANDS.length - 1];

// -> a land this build can grow, from whatever a save or the address bar
// says; `otherwise` when that is none.
export function landOf(v, otherwise = 1) {
  const n = Math.trunc(Number(v));
  return GROWN[n] ? n : otherwise;
}

// -> the WorldGen for this seed, grown on this land.
export function growWorld(seed, structures = [], land = 1) {
  return new GROWN[landOf(land)](seed, structures);
}
