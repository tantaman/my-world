// Which land a world is grown on.
//
// A world is its seed and its land. The land is the way the forest is grown
// from the seed; when the way changes, the change is a new land, and every
// world keeps the land it was first grown on — a save is only what was
// changed from what its seed grows, so growing it differently would leave
// every cabin floating over, or buried in, somebody's hillside.
//
//   1  the forest: lake country, hills, mountains and benches, the woods
//      changing with the country, the sea a walk from the start, and deep
//      lakes (worldgen.js, sea.js)
//
// FROZEN is how far that promise has actually been made. Lands up to and
// including it are pinned for good: worlds people keep have been grown on
// them, so what they grow must never change, and their golden files
// (test/golden/) cannot be re-recorded — if one fails, fix the code. The
// lands past it are drafts: still being shaped, re-recordable with
// UPDATE_GOLDEN=1, and a world grown on one may be grown again differently
// (a browser keeps what it had under the land it had, and says where: see
// save/worldSave.js).
//
// So while the land is a draft, change it here rather than adding a land.
// Raise FROZEN when worlds grown on it stop being ours to re-grow; from then
// on, something that changes how the forest grows is a land of its own —
// grown from the newest, listed above, with golden files of its own.
//
// New worlds are grown on the newest. A world saved before lands were
// counted says nothing about it, and is land 1.

import { WorldGen } from './worldgen.js';
import { withRealPlaces } from './realPlaces.js';

const GROWN = { 1: WorldGen };
// Each, with real places set into it (realPlaces.js).
const PLACED = Object.fromEntries(Object.entries(GROWN).map(([n, Land]) => [n, withRealPlaces(Land)]));

// Every land this build can grow, oldest first.
export const LANDS = Object.keys(GROWN).map(Number);
export const NEWEST_LAND = LANDS[LANDS.length - 1];

// How far the lands are pinned (see above): none of them yet, so the land is
// still ours to shape.
export const FROZEN = 0;

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
