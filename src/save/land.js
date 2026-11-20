// Which land a world is grown on (see world/lands.js), as it is saved: one
// element beside the world's name, `land` -> 2.
//
// Every world saved before lands were counted is land 1 and says nothing
// about it, so land 1 is never written down: a world on it is spelled exactly
// as it always was. The land is settled when a world opens, before anything
// is grown (worldSave.js reads it straight out of the elements), and never
// changes after, so there is nothing to restore.

import { LOOSE } from './regions.js';
import { landOf } from '../world/lands.js';

export const landSave = {
  id: 'land',
  scope: 'world',
  local: false, // a world that is only local is known by its land (see local.js)
  kinds: ['land'],
  encode(land, put) {
    if (land > 1) put(LOOSE, 'land', land);
  },
  decode() {
    let land = 1;
    return { take: (region, kind, rest, v) => void (land = landOf(v)), done: () => land };
  },
};

// The land the elements of a world say it is grown on.
export function landIn(elements) {
  const loose = elements.get(LOOSE);
  return landOf(loose && loose.get('land'));
}
