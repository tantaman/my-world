// Where a hike goes in the game world: where it really is.
//
// The game world is the real world at the hikes' own scale (1:5), so hikes
// lie as far apart, and in the same directions, as they do in real life.
// Its middle, where everyone starts and where the forest is made up, is out
// in the Pacific off the Olympic coast, so no real hike can land on it.
//
// Hikes far apart are placed by an azimuthal equidistant projection about the
// middle: true distance and direction from the middle, and between two hikes
// within a tenth of a percent across a region (a little more across a
// continent). Hikes close enough to overlap must
// line up exactly, since their land is the same land, so one is placed from
// the nearest by the real offset between their photos, and they share that
// one's heights (its datum: see src/world/landform.js), so the same mountain
// stands at the same height in both.

import { localFrame } from './geo.js';

// The real place at the middle of the game world.
export const ORIGIN = { lat: 48.0, lon: -125.6 };
// Game metres kept clear between the middle of the world and a hike's edge.
const CLEAR_OF_MIDDLE = 2000;
// Game metres from the middle past which the ground's finer texture starts
// to blur (the GPU's 32-bit floats)...
export const FAR = 1_000_000;
// ...and past which the world can't go at all (how chunks are numbered).
export const TOO_FAR = 2_000_000;

const round = (v) => Math.round(v * 10) / 10 + 0;
const EARTH = 6371008.8; // m, mean radius
const D = Math.PI / 180;
const outerOf = (h) => h.radius + h.fade;

// Real (lat, lon) → game [x, z] at `scale` game metres per real metre.
export function project(lat, lon, scale) {
  const [p0, p] = [ORIGIN.lat * D, lat * D];
  const dl = (lon - ORIGIN.lon) * D;
  const cosc = Math.max(-1, Math.min(1, Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl)));
  const c = Math.acos(cosc);
  const k = c < 1e-12 ? 1 : c / Math.sin(c);
  const east = EARTH * k * Math.cos(p) * Math.sin(dl);
  const north = EARTH * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl));
  return [east * scale, -north * scale];
}

// photo: { lat, lon }; existing: the cards of the hikes already in the game.
// → { at, datum, near, far, notes }: datum is the datum to share (null: this
// hike sets its own), near the hike it was placed from (or null).
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
    const [e, n] = localFrame(near.photo.lat, near.photo.lon).toEN(photo.lat, photo.lon);
    at = [near.at[0] + e * near.scale, near.at[1] - n * near.scale];
    datum = near.datum || null;
    const key = (h) => JSON.stringify(h.datum && h.datum.at);
    const apart = overlaps.filter((h) => key(h) !== key(near));
    if (apart.length) notes.push(`it also reaches ${apart.map((h) => h.name).join(', ')}, which stand${apart.length === 1 ? 's' : ''} on heights of ${apart.length === 1 ? 'its' : 'their'} own: there'll be a step where they meet`);
  }
  at = at.map(round);

  const fromMiddle = Math.hypot(at[0], at[1]);
  if (fromMiddle - outer < CLEAR_OF_MIDDLE) throw new Error('that is where everyone starts, in the middle of the world (out in the Pacific): pass --at to put it somewhere else');
  if (fromMiddle > TOO_FAR) throw new Error(`that is ${Math.round(fromMiddle / scale / 1000)} km from the middle of the world: further than the game can reach yet`);
  const far = fromMiddle > FAR;
  if (far) notes.push(`it's ${Math.round(fromMiddle / scale / 1000)} km out, far enough that the ground's finer texture is a little blurred`);
  return { at, datum, near, far, notes };
}
