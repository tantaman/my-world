// The world as the game has it for the roads and the dealerships (src/roads/,
// src/cars/): everything they keep clear of, made the way each feature makes
// it, so what the tests pin is where they are in the game.

import { growWorld } from '../../src/world/lands.js';
import { Sites } from '../../src/landmarks/sites.js';
import { Towns } from '../../src/towns/towns.js';
import { Caves } from '../../src/caves/caves.js';
import { Lines, clearOfPlaces, clearOfCaves } from '../../src/railway/lines.js';
import { HIKES } from '../../src/world/hikes.js';
import { Landforms } from '../../src/world/landforms.js';
import { findSite as findPad, clearOf as padClear, LaunchSites } from '../../src/spaceport/site.js';
import { findSite as findStore, clearOf as storeClear } from '../../src/videostore/site.js';
import { Branches } from '../../src/videostore/branches.js';
import { findBuildings, OutlyingBuildings, overlaps, DISTRICT } from '../../src/abandoned/sites.js';
import { Airports } from '../../src/airports/airports.js';
import { findSite as findClub, clearOf as clubClear, HuntClubs, RING as CLUB_RING, PLAN as CLUB_PLAN } from '../../src/huntclub/site.js';
import { Tracks } from '../../src/racetrack/tracks.js';
import { clearOf as trackClear } from '../../src/racetrack/site.js';
import { findBerth, clearOf as berthClear, HOME_REACH as BERTH_REACH } from '../../src/cruise/site.js';
import { Roads } from '../../src/roads/roads.js';
import { firstThere } from '../../src/roads/clear.js';
import { earthAtFirst } from './earth.js';
// The real Earth under the world, as the game has it when it opens (world/earth.js).
const EARTH = await earthAtFirst();

const CARDS = HIKES.map(({ load, ...card }) => card);
const worlds = new Map();

// (fresh: not the one made before for that seed and land)
export function roadsWorld(seed, land = 1, fresh = false) {
  const key = `${seed}:${land}`;
  if (worlds.has(key) && !fresh) return worlds.get(key);
  const gen = growWorld(seed, [], land, [], EARTH);
  const start = gen.findSpawn(0, 0);
  const landforms = new Landforms(HIKES);
  const keepHike = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const sites = new Sites(gen, { start });
  const caves = new Caves({ gen, keepOff: keepHike });
  const lines = new Lines(gen, { start, keepClear: [clearOfPlaces(sites), clearOfCaves((a, b, c, d) => caves.inBox(a, b, c, d))], keepOff: keepHike });
  const towns = new Towns(gen, { start, sites, keepOff: keepHike });
  // the launch sites (spaceport/index.js)
  const padKeep = padClear({ landforms, sites, towns, caves, lines });
  const pads = new LaunchSites(gen, { start, home: findPad(gen, start, padKeep), keepOff: padKeep, away: keepHike });
  // the airfields (airports/index.js)
  const reserved0 = storeClear({ landforms, sites, towns, caves, lines });
  const pad = pads.home;
  const airports = new Airports(gen, { cards: CARDS, start, keepOff: (x0, z0, x1, z1) => reserved0(x0, z0, x1, z1) || !!(pad && overlaps(pad.box, [x0, z0, x1, z1])) });
  // the video stores (videostore/index.js)
  const reserved = storeClear({ landforms, sites, towns, caves, lines, spaceport: pads });
  const store = findStore(gen, start, reserved);
  const onField = (box) => {
    const x = (box[0] + box[2]) / 2;
    const z = (box[1] + box[3]) / 2;
    for (const g of airports.regions) {
      const d = Math.hypot(x - g.x, z - g.z);
      if (d < g.r0 - 170 || d > g.r1 + 4200) continue;
      const f = airports.site(g.id);
      if (f && overlaps(box, f.box)) return true;
    }
    return false;
  };
  const branches = new Branches(gen, { towns, keepOff: reserved, also: (...box) => (store && overlaps(box, store.box)) || onField(box) });
  const stores = (x0, z0, x1, z1) => [...(store && overlaps(store.box, [x0, z0, x1, z1]) ? [store] : []), ...branches.within(x0, z0, x1, z1)];
  // the abandoned buildings (abandoned/index.js)
  const abKeep = (...box) => stores(...box).length > 0 || reserved(...box) || onField(box);
  const home = findBuildings(gen, start, abKeep);
  const districts = new OutlyingBuildings(gen, start, abKeep);
  const abandoned = (x0, z0, x1, z1) => [...home.filter((s) => overlaps(s.box, [x0, z0, x1, z1])), ...districts.within(x0, z0, x1, z1)];
  // the race tracks (racetrack/index.js)
  const tracks = new Tracks(gen, {
    towns,
    keepOff: trackClear({ landforms, sites, towns, caves, lines, spaceport: pads, stores, airfield: onField, buildings: abandoned, start, startClear: CLUB_RING[1] + Math.hypot(...CLUB_PLAN.slice(2)) + 20 }),
  });
  // the hunt clubs (huntclub/index.js): the first, and the rest out in the forest
  const others = (...box) => reserved(...box) || stores(...box).length > 0 || abandoned(...box).length > 0;
  others.ready = reserved.ready;
  const clubKeep = clubClear({ reserved: others, airfields: airports });
  let club;
  const clubSite = () => (club === undefined ? (club = findClub(gen, start, clubKeep)) : club);
  const farKeep = (...box) => clubKeep(...box) || tracks.within(...box).length > 0;
  farKeep.ready = clubKeep.ready;
  const far = new HuntClubs(gen, { start, keepOff: farKeep, away: keepHike });
  const HOME_REACH = CLUB_RING[1] + Math.hypot(CLUB_PLAN[2] - CLUB_PLAN[0], CLUB_PLAN[3] - CLUB_PLAN[1]);
  const nearStart = (r, x0, z0, x1, z1) => x0 <= start.x + r && x1 >= start.x - r && z0 <= start.z + r && z1 >= start.z - r;
  const clubs = {
    within(x0, z0, x1, z1) {
      const first = nearStart(HOME_REACH, x0, z0, x1, z1) ? clubSite() : club;
      return [...(first && overlaps(first.box, [x0, z0, x1, z1]) ? [first] : []), ...far.within(x0, z0, x1, z1)];
    },
    // (the game finds the first once the airfields in its way are known: here, when asked)
    known: (x0, z0, x1, z1) => far.known(x0, z0, x1, z1),
  };
  // the cruise ship's pier by the start (cruise/index.js)
  const berthKeep = berthClear({ landforms, sites, towns, caves, lines, airfields: airports });
  let berth;
  const berthSite = () => (berth === undefined ? (berth = findBerth(gen, start, (...box) => berthKeep(...box) || pads.within(...box).length > 0 || stores(...box).length > 0 || clubs.within(...box).length > 0 || abandoned(...box).length > 0)) : berth);
  // the roads
  const there = firstThere({
    sites,
    caves,
    towns,
    pads,
    store,
    branches,
    airports,
    abandoned,
    clubs,
    tracks,
    berth: () => berthSite(),
    berthReach: BERTH_REACH,
    lines,
    start,
  });
  const roads = new Roads(gen, { towns, start, keepOff: keepHike, lines: (x0, z0, x1, z1) => lines.within(x0, z0, x1, z1), clear: there.clear, ready: there.ready });
  const w = { gen, start, landforms, keepHike, sites, caves, lines, towns, pads, airports, store, branches, abandoned, tracks, clubs, far, clubSite, berthSite, there, roads };
  if (!fresh) worlds.set(key, w);
  return w;
}
