// What the roads keep clear of: everything grown from the seed that was there
// before them, which a road goes round rather than the other way about. The
// dealerships (cars/) keep clear of all of it too, and of the roads.
//
//   firstThere({ ... }) -> { clear(x0, z0, x1, z1), ready(x0, z0, x1, z1) }
//
// clear gives the shapes in a rectangle of the world, as Roads wants them
// (roads.js): { site, rects } for something laid out in its own frame (its
// plan), { box } for a rectangle of the world, { x, z, r } for a disc. ready
// says whether they're all known there yet, asking for any that aren't:
// several are found a little at a time after the world opens (the airfields,
// the video store's branches, the hunt clubs, the race tracks, the cruise
// ship's pier), and a road surveyed in the background waits for them rather
// than find them all at once. Asked outright, clear finds them there and then.
//
// Each of these is what its own feature made (or, in the tests, made the
// same way), so a road keeps clear of exactly what the game has:
//   sites      the old places (landmarks/sites.js)
//   caves      the caves (caves/caves.js inBox): their mouths
//   towns      the towns (towns/towns.js): for which villages have a branch
//   pads       the launch sites (spaceport/site.js LaunchSites)
//   store      Rewind Video by the start (videostore/site.js), or null
//   branches   its branches (videostore/branches.js)
//   airports   the airfields (airports/airports.js Airports)
//   abandoned  (x0, z0, x1, z1) -> the abandoned buildings there (abandoned/sites.js)
//   clubs      the hunt clubs: within(x0, z0, x1, z1) -> those there,
//              known(x0, z0, x1, z1) -> whether they've all been found there
//              (huntclub/index.js)
//   tracks     the race tracks (racetrack/tracks.js Tracks)
//   berth      (wait) -> the cruise ship's pier by the start, null if there's
//              none; with wait = false, undefined until it's been found
//              (cruise/index.js berth(0)); berthReach: how far from the start
//              it can reach (m), past which it isn't asked
//   lines      the railway (railway/lines.js Lines): asked only whether it's
//              been surveyed (the roads cross it, so Roads looks at it itself)
//   start      where people first arrive

import { mayReach } from '../airports/airports.js';
import { CELL as LINE_CELL } from '../railway/lines.js';
import { BRANCH_OUT } from '../videostore/branches.js';

const MOUTH = 14; // m kept clear round a cave's mouth, past its rim

// A site's shape: its plan, in its own frame, if it has one; else its box.
const shapeOf = (s) => (s.plan && typeof s.yaw === 'number' ? { site: s, rects: s.plan } : { box: s.box });

export function firstThere({ sites, caves, towns, pads = null, store = null, branches = null, airports = null, abandoned = () => [], clubs = null, tracks = null, berth = () => null, berthReach = 0, lines = null, start }) {
  const fieldsIn = (x0, z0, x1, z1) => {
    if (!airports) return [];
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    const half = Math.hypot(x1 - x0, z1 - z0) / 2;
    return airports.regions.filter((g) => mayReach(g, Math.hypot(x - g.x, z - g.z), half));
  };
  const berthNear = (x0, z0, x1, z1) => {
    const dx = Math.max(x0 - start.x, 0, start.x - x1);
    const dz = Math.max(z0 - start.z, 0, start.z - z1);
    return Math.hypot(dx, dz) <= berthReach;
  };

  function clear(x0, z0, x1, z1) {
    const out = [];
    for (const s of sites.within(x0, z0, x1, z1)) out.push(shapeOf(s));
    for (const c of caves.inBox(x0, z0, x1, z1)) {
      const m = c.mouth;
      const half = m.portal / 2 + 3;
      out.push({ x: m.x + m.ux * (half - 3), z: m.z + m.uz * (half - 3), r: half + m.w + MOUTH });
    }
    if (pads) for (const s of pads.within(x0, z0, x1, z1)) out.push(shapeOf(s));
    if (store) out.push(shapeOf(store));
    if (branches) for (const b of branches.within(x0, z0, x1, z1)) out.push(shapeOf(b));
    for (const g of fieldsIn(x0, z0, x1, z1)) {
      const f = airports.site(g.id);
      if (f) out.push(shapeOf(f));
    }
    for (const s of abandoned(x0, z0, x1, z1)) out.push(shapeOf(s));
    if (clubs) for (const s of clubs.within(x0, z0, x1, z1)) out.push(shapeOf(s));
    if (tracks) for (const s of tracks.within(x0, z0, x1, z1)) out.push(shapeOf(s));
    if (berthNear(x0, z0, x1, z1)) {
      const s = berth(true);
      if (s) out.push(shapeOf(s));
    }
    return out;
  }

  function ready(x0, z0, x1, z1) {
    let known = true;
    // the towns (for their branches), and the railway
    for (let j = Math.floor(z0 / towns.size) - 1; j <= Math.floor(z1 / towns.size) + 1; j++) {
      for (let i = Math.floor(x0 / towns.size) - 1; i <= Math.floor(x1 / towns.size) + 1; i++) if (towns.peek(i, j) === undefined) known = false;
    }
    if (lines) {
      for (let j = Math.floor(z0 / LINE_CELL); j <= Math.floor(z1 / LINE_CELL); j++) {
        for (let i = Math.floor(x0 / LINE_CELL); i <= Math.floor(x1 / LINE_CELL); i++) if (lines.peek(i, j) === undefined) known = false;
      }
    }
    if (!known) return false;
    if (branches) for (const t of towns.within(x0 - BRANCH_OUT, z0 - BRANCH_OUT, x1 + BRANCH_OUT, z1 + BRANCH_OUT, false)) if (branches.peek(t) === undefined) known = false;
    // (a track is inside its town's square)
    if (tracks) {
      for (let j = Math.floor(z0 / towns.size); j <= Math.floor(z1 / towns.size); j++) {
        for (let i = Math.floor(x0 / towns.size); i <= Math.floor(x1 / towns.size); i++) {
          const t = towns.peek(i, j);
          if (t && tracks.peek(t) === undefined) known = false;
        }
      }
    }
    for (const g of fieldsIn(x0, z0, x1, z1)) if (airports.site(g.id, false) === undefined) known = false;
    if (clubs && !clubs.known(x0, z0, x1, z1)) known = false;
    if (berthNear(x0, z0, x1, z1) && berth(false) === undefined) known = false;
    return known;
  }

  return { clear, ready };
}

// All of that, as one thing to keep clear of (world/claims.ts), for what's
// grown after the roads and keeps clear of whatever they do: a box holds
// some of it if the box of any of those shapes overlaps it.
//   there   firstThere()'s
export const thereFirst = (there) => ({
  holds(x0, z0, x1, z1) {
    for (const s of there.clear(x0, z0, x1, z1)) {
      const b = s.site ? s.site.box : s.box || [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
      if (b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0) return true;
    }
    return false;
  },
  ready: there.ready,
});
