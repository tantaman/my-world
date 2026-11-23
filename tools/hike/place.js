// Where a hike goes in the game world: where it really is.
//
// The game world is the real world at the hikes' own scale (1:5), so hikes
// lie as far apart, and in the same directions, as they do in real life.
// Its middle, where everyone starts, is a real place on land: the Hoh rain
// forest, on the wet west side of the Olympic Mountains, which is the kind of
// country the made-up forest is (src/world/country.js). The forest there is
// the game's own, so a hike is kept a few kilometres clear of it
// (CLEAR_OF_MIDDLE).
//
// Hikes far apart are placed by an azimuthal equidistant projection about the
// middle: true distance and direction from the middle, and between two hikes
// within a tenth of a percent across a region (a little more across a
// continent). Hikes close enough to overlap must
// line up exactly, since their land is the same land, so one is placed from
// the nearest by the real offset between their photos, and they share that
// one's heights (its datum: see src/world/landform.js), so the same mountain
// stands at the same height in both.
//
// The whole Earth fits: the far side of it is 4,000 km of game from the
// middle, and the game is as sharp there as anywhere (src/render/origin.js).
// What a flat world can't do is keep a round one's shape. Distances from the
// middle are true everywhere, but the further out, the more the map is
// stretched sideways (round the middle): a tenth at 5,000 km, half as much
// again at 10,000, without limit towards the far side. A hike's own land is
// laid out true wherever it is; it's the gaps between hikes out there that
// are wide.

import { localFrame } from './geo.js';
import { ORIGIN, stretch, project } from '../../src/core/geo.js';

// (the projection is the game's own: src/core/geo.js. The real place at its
// middle is the Hoh rain forest, a little down the valley from the visitor
// centre; from there, Mount Storm King's land stays out of the few
// kilometres round the start, which are the game's own: its first railway
// squares are pinned, test/railway.test.js.)
export { ORIGIN, stretch, project };

// Game metres kept clear between the middle of the world and a hike's edge.
const CLEAR_OF_MIDDLE = 2000;
// How much wider than life the map is, sideways, before it's worth saying.
const STRETCH_WORTH_SAYING = 1.1;

const round = (v) => Math.round(v * 10) / 10 + 0;
const outerOf = (h) => h.radius + h.fade;

// The real place a hike's land is centred on: its photo, unless it says.
export const centreOf = (h) => h.middle || h.photo;

// photo: { lat, lon }, where the land is centred; existing: the cards of the
// hikes already in the game.
// → { at, datum, near, stretch, notes }: datum is the datum to share (null:
// this hike sets its own), near the hike it was placed from (or null),
// stretch how many times wider than life the map is there.
export function placeHike({ photo, scale, radius, fade }, existing = []) {
  const outer = radius + fade;
  const notes = [];
  let at = project(photo.lat, photo.lon, scale);
  let datum = null;
  let near = null;

  // the hikes its land would run into
  const overlaps = existing
    .map((h) => ({ h, d: Math.hypot(h.at[0] - at[0], h.at[1] - at[1]) }))
    .filter(({ h, d }) => d < outerOf(h) + outer)
    .sort((a, b) => a.d - b.d)
    .map(({ h }) => h);
  if (overlaps.length) {
    near = overlaps[0];
    const [e, n] = localFrame(centreOf(near).lat, centreOf(near).lon).toEN(photo.lat, photo.lon);
    at = [near.at[0] + e * near.scale, near.at[1] - n * near.scale];
    datum = near.datum || null;
    const key = (h) => JSON.stringify(h.datum && h.datum.at);
    const apart = overlaps.filter((h) => key(h) !== key(near));
    if (apart.length) notes.push(`it also reaches ${apart.map((h) => h.name).join(', ')}, which stand${apart.length === 1 ? 's' : ''} on heights of ${apart.length === 1 ? 'its' : 'their'} own: there'll be a step where they meet`);
  }
  at = at.map(round);

  const fromMiddle = Math.hypot(at[0], at[1]);
  if (fromMiddle - outer < CLEAR_OF_MIDDLE) throw new Error('that is where everyone starts, in the middle of the world (the Hoh rain forest, whose forest is the game\'s own): pass --at to put it somewhere else');
  const wide = stretch(photo.lat, photo.lon);
  if (wide > STRETCH_WORTH_SAYING) {
    notes.push(`it's ${Math.round(fromMiddle / scale / 1000)} km out, where a flat map of a round world is ${Math.round((wide - 1) * 100)}% wider than life: the hike itself is true, but others near it will lie that much further off to its sides`);
  }
  return { at, datum, near, stretch: wide, notes };
}
