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
//   3  all of that, and the sea, a walk from the start, and deep lakes
//      (land3.js, sea.js)
//
// New worlds are grown on the newest. A world saved before lands were
// counted says nothing about it, and is land 1.

import { WorldGen } from './worldgen.js';
import { Land2 } from './land2.js';
import { Land3 } from './land3.js';
import { withRealPlaces } from './realPlaces.js';

const GROWN = { 1: WorldGen, 2: Land2, 3: Land3 };
// Each, with real places set into it (realPlaces.js).
const PLACED = Object.fromEntries(Object.entries(GROWN).map(([n, Land]) => [n, withRealPlaces(Land)]));

// Every land this build can grow, oldest first.
export const LANDS = Object.keys(GROWN).map(Number);
export const NEWEST_LAND = LANDS[LANDS.length - 1];

// -> a land this build can grow, from whatever a save or the address bar
// says; `otherwise` when that is none.
export function landOf(v, otherwise = 1) {
  const n = Math.trunc(Number(v));
  return GROWN[n] ? n : otherwise;
}

// -> the WorldGen for this seed, grown on this land, with these real places
// (hikes: see landform.js) set into it.
export function growWorld(seed, structures = [], land = 1, hikes = []) {
  return new PLACED[landOf(land)](seed, structures, hikes);
}
