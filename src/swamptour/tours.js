// The swamp tours there are, and where each really goes: a landing on a real
// place brought in from a photo (world/hikes.js), and the places its boat
// goes by on the way round, by latitude and longitude, as they really are.
// The airboat out of Jean Lafitte, Louisiana, goes where two videos taken on
// one in April were: down Bayou Barataria and into the old oil-field canals
// to the south, then north up a narrow one through the cypress, and back by
// the Barataria Waterway.
//
//   id        what it's known by (saved: don't change it)
//   hike      the real place it's on (its id in world/hikes.js)
//   name      what the landing is called, on the map
//   landing   { lat, lon }: where the boats tie up
//   by        [{ lat, lon, what }]: where it goes, in order; `what` is the
//             guide's word for it as you come up to it
//   guide     who drives the boat, and how they look (towns/people.js)
//   gators    how many it means to show you, and where they lie (spread
//             along the way, round the bends: route.js finds the water)

import { localFrame } from '../core/geo.js';

export const TOURS = [
  {
    id: 'lafitte',
    hike: 'jean-lafitte',
    name: 'Bayou Barataria Airboat Tours',
    landing: { lat: 29.7467, lon: -90.1377 },
    by: [
      { lat: 29.7113, lon: -90.126, what: 'the back canals' },
      { lat: 29.7336, lon: -90.1413, what: 'the old canal' },
    ],
    guide: { name: 'Remy', her: false },
    gators: 4,
  },
];

// Where a real (lat, lon) is in the game, on the real place `card` (its card
// in world/hikes.js: laid out round its middle, at its scale, at `at`).
export function onCard(card, lat, lon) {
  const mid = card.middle || card.photo;
  const [e, n] = localFrame(mid.lat, mid.lon).toEN(lat, lon);
  return [card.at[0] + e * card.scale, card.at[1] - n * card.scale];
}
