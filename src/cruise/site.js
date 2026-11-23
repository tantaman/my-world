// Where the ship is: alongside a pier, on the real coast nearest where people
// first arrive (and at Maui).
//
// The sea is wherever the real coast is (world/earth.js): from the start in
// the Hoh, the Pacific a long walk west, the Strait of Juan de Fuca north.
// Where exactly the pier is, is grown from the seed and the land, like the
// old places: along each of a ring of lines out from where it's looked for,
// the first place it reaches the water, and from there,
// straight out to sea, the nearest spot with water deep enough for her all
// the way round, and clear of everything else grown from the seed. The best
// of those is a short walk out along a short pier.
//
// She lies port side to the pier, her bow along the coast. A trestle, a
// road on piles, runs from the land straight out to the pier head beside
// her; on the pier head is the terminal, and the gangway up to the door in
// her side. Nothing about the land changes for any of it: the trestle starts
// where the ground is as high as its deck, and stands on piles over the
// beach and the water from there.
//
// No three.js in here: the tests read it.
//
// Out from each berth runs her lane to the open sea (lane()): deep water
// straight out from the pier, room to swing her round off it, and at its end
// no land within sight. That's the way she sails, out and in (voyage.js).
//
// A berth:
//   id      'cruise:<x>:<z>': a place on the map
//   x, z    the ship's middle; yaw, which way her bow (+z of her frame)
//           points; y, her waterline (the sea's level)
//   top     the height of the pier's deck
//   land    the trestle's landward end, in her frame (x along it, from her
//           middle); the trestle runs from PIER.x1 out to there
//   box     [x0, z0, x1, z1] in the world, round her, the pier and the trestle
//   plan    [[x0, z0, x1, z1]] in her frame: the pier head, the trestle
//   door    where `go here` sets you down: on the pier at the foot of the
//           gangway, facing it ({ x, z, yaw })
//   lane    { swing, jump } (m along her −x, straight out to sea from her
//           middle): where she swings round to head out, and where she's out
//           of sight of land

import { SEA } from '../world/sea.js';
import { toWorld } from '../world/frame.js';
import { railsNear, NEAR } from '../railway/lines.js';
import { caveMouths } from '../caves/sites.js';
import { mayReach, airfieldsOver } from '../airports/airports.js';
import { keepClear, landOf, placesOf, boxesOf } from '../world/claims.ts';
import { HALF_BEAM, BOW, STERN, DRAFT } from './plan.js';

// The pier head, in her frame (m): it runs along her port side, FENDER off
// her plating.
const FENDER = 1.6;
export const PIER = { x0: HALF_BEAM + FENDER, x1: HALF_BEAM + FENDER + 22, z0: -110, z1: 90, up: 3 };
export const TRESTLE = { half: 6 }; // m: half its width
export const TERMINAL = { x0: PIER.x0 + 9, x1: PIER.x1 - 2, z0: 12, z1: 58 };
// The gangway: a ramp along the pier, up to a landing level with deck 4, and
// a short bridge across to the door in her side.
export const GANGWAY = { x0: PIER.x0 + 1.4, x1: PIER.x0 + 3.4, foot: 0, head: -17.5, landing: [-24.6, -17.5], door: [-24, -20] };
const DEEP = DRAFT + 3; // m of water she wants under her and round her
const ROOM = 6; // m of that water past her sides and ends
const LOOK = { near: 150, step: 8 }; // the lines looked along: from (m), and how finely the water's edge is found on one
const ROUND = { steps: 120, far: 14000, step: 40 }; // ...all the way round, how many, out to (m), and how coarsely the land is looked at first
// Her lane out to sea (m): she moves off the pier sideways this far, then
// swings round in water this wide round her (half her length and some);
// the lane runs straight out as far as LANE.most and must reach LANE.least,
// and where she leaves the coast behind there's no land within LANE.clear.
export const LANE = { side: 40, swing: 165, most: 3200, least: 900, clear: 450, wide: 30 };
const OUT = { from: 60, to: 1100, step: 10, keep: 3, apart: 60 }; // m out to sea from the water's edge, to where her middle is; how many spots kept along each line, how far apart
const NORMAL_SPAN = 40; // m: the slope of the land is read across this much of it
const TRESTLE_MOST = 1200; // m: a longer one than this isn't worth it (a real coast's shelf can be shallow a long way out)
const NEARER = 0.2; // how much a metre nearer the start is worth, in metres of pier
const CLEAR = 25; // m round it all kept clear of anything else grown from the seed
const MOUTH_CLEAR = 30; // m from a cave's mouth
// How far (m) a berth can reach from where it's looked for from, the most:
// the farthest shore, out to sea to her middle, and from there the longest
// trestle, the pier and her length. What's grown after her needn't ask about
// her further off than this.
export const HOME_REACH = ROUND.far + OUT.to + TRESTLE_MOST + PIER.x1 + BOW + CLEAR;

const _w = { x: 0, z: 0 };

// gen: the WorldGen. start: { x, z }. keepOff(x0, z0, x1, z1): whether a
// square is somewhere it may not be (a hike, an old place, a town...).
// -> a berth, or null where there's nowhere for one. It's looked for all the
// way round start, out to ROUND.far: the real coast is wherever it is (the
// Pacific's is a long walk west of where people first arrive, and Port
// Angeles' harbour on the strait further north-east).
export function findBerth(gen, start, keepOff = () => false) {
  const steps = berthSearch(gen, start, keepOff);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

// findBerth a step at a time: a generator that yields after each line looked
// along and each candidate tried, and returns the berth (or null), so it can
// be spread over frames.
export function* berthSearch(gen, start, keepOff = () => false) {
  const sea = SEA.level;
  const deep = sea - DEEP;
  const h = (x, z) => gen.height(x, z);
  const found = [];
  const spot = { x: 0, z: 0, yaw: 0 };
  for (let i = 0; i < ROUND.steps; i++) {
    const a = (i / ROUND.steps) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    // the water's edge along this line (coarsely, then to within a step)
    let shore = null;
    const step = ROUND.step;
    for (let t = LOOK.near; t <= ROUND.far; t += step) {
      if (h(start.x + dx * t, start.z + dz * t) < sea - 0.3) {
        let lo = t - step;
        let hi = t;
        while (hi - lo > LOOK.step) {
          const m = (lo + hi) / 2;
          if (h(start.x + dx * m, start.z + dz * m) < sea - 0.3) hi = m;
          else lo = m;
        }
        shore = { x: start.x + dx * hi, z: start.z + dz * hi, t: hi };
        break;
      }
    }
    if (!shore) continue;
    // which way is out to sea there: down the slope of the land
    const s = NORMAL_SPAN / 2;
    let nx = -(h(shore.x + s, shore.z) - h(shore.x - s, shore.z));
    let nz = -(h(shore.x, shore.z + s) - h(shore.x, shore.z - s));
    const l = Math.hypot(nx, nz);
    if (l < 1e-3) {
      nx = dx;
      nz = dz;
    } else {
      nx /= l;
      nz /= l;
    }
    // her frame: +x (port) toward the land, so the bow points along the coast
    spot.yaw = Math.atan2(nz, -nx);
    // the nearest few spots out from it that she'd lie at (the further
    // ones in case the nearest has no way out to sea)
    let kept = 0;
    for (let out = OUT.from; out <= OUT.to && kept < OUT.keep; out += OUT.step) {
      spot.x = shore.x + nx * out;
      spot.z = shore.z + nz * out;
      if (!deepAround(h, spot, deep)) continue;
      if (!pierInWater(h, spot, sea)) continue;
      const land = landward(h, spot, sea + PIER.up - 0.3);
      if (land === null) break;
      found.push({ x: spot.x, z: spot.z, yaw: spot.yaw, land, score: land - PIER.x1 + out + shore.t * NEARER });
      kept++;
      out += OUT.apart - OUT.step;
    }
    yield;
  }
  // the best of them that nothing else is in the way of and that has a way
  // out to sea (asked last, and of as few as can be: they're dear)
  found.sort((a, b) => a.score - b.score);
  for (const f of found) {
    const box = boxOf(f);
    if (keepOff(box[0] - CLEAR, box[1] - CLEAR, box[2] + CLEAR, box[3] + CLEAR)) continue;
    f.lane = laneOf(h, f, deep, sea);
    yield;
    if (!f.lane) continue;
    const door = toWorld(f, (GANGWAY.x0 + GANGWAY.x1) / 2, GANGWAY.foot + 3);
    return {
      id: `cruise:${Math.round(f.x)}:${Math.round(f.z)}`,
      x: f.x,
      z: f.z,
      yaw: f.yaw,
      y: sea,
      top: sea + PIER.up,
      land: f.land,
      box,
      plan: planOf(f),
      door: { x: door.x, z: door.z, yaw: f.yaw + Math.PI },
      lane: f.lane,
    };
  }
  return null;
}

// Water at least `deep` under her and ROOM m round her. The samples nearest
// the land are looked at first: that's where it's shallowest, so the answer
// is quickest no.
function deepAround(h, s, deep) {
  const xs = [HALF_BEAM + ROOM, HALF_BEAM / 2, 0, -HALF_BEAM / 2, -HALF_BEAM - ROOM];
  for (const x of xs) {
    for (let z = STERN - ROOM; z <= BOW + ROOM; z += 10) {
      toWorld(s, x, z, _w);
      if (h(_w.x, _w.z) > deep) return false;
    }
  }
  return true;
}

// Her lane out: room to move off the pier and swing round, then straight out
// along her −x as far as it's deep enough either side of her, and somewhere
// along that, as far out as can be, a spot with no land in sight.
// -> { swing, jump } (m along −x), or null if there's no way out worth having.
function laneOf(h, s, deep, sea) {
  const w = {};
  const at = (x, z) => {
    toWorld(s, x, z, w);
    return h(w.x, w.z);
  };
  const swing = LANE.side;
  // the water she swings round in
  for (const r of [LANE.swing / 2, LANE.swing]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (at(-swing + Math.cos(a) * r, Math.sin(a) * r) > deep) return null;
    }
  }
  // straight out
  let far = swing;
  for (let x = swing + 20; x <= LANE.most; x += 20) {
    if ([-LANE.wide, 0, LANE.wide].some((z) => at(-x, z) > deep)) break;
    far = x;
  }
  // as far out as can be, out of sight of land
  for (let x = far; x >= LANE.least; x -= 50) {
    let clear = true;
    for (const r of [LANE.clear / 2, LANE.clear]) {
      for (let k = 0; k < 16 && clear; k++) {
        const a = (k / 16) * Math.PI * 2;
        if (at(-x + Math.cos(a) * r, Math.sin(a) * r) > sea - 1) clear = false;
      }
    }
    if (clear) return { swing, jump: x };
  }
  return null;
}

// The pier head stands in the water on its piles, not on the land.
function pierInWater(h, s, sea) {
  for (const x of [PIER.x0, PIER.x1]) {
    for (let z = PIER.z0; z <= PIER.z1; z += 20) {
      toWorld(s, x, z, _w);
      if (h(_w.x, _w.z) > sea - 1) return false;
    }
  }
  return true;
}

// How far along her +x, straight out from her middle past the pier head,
// the ground first comes up as high as the trestle's deck (less a little)
// all the way across it: where the trestle meets the land. null if it
// doesn't within reach.
function landward(h, s, top) {
  for (let x = PIER.x1; x <= PIER.x1 + TRESTLE_MOST; x += 4) {
    let low = Infinity;
    for (const z of [-TRESTLE.half, 0, TRESTLE.half]) {
      toWorld(s, x, z, _w);
      low = Math.min(low, h(_w.x, _w.z));
    }
    if (low >= top) return x;
  }
  return null;
}

function planOf(f) {
  return [
    [PIER.x0, PIER.z0, PIER.x1, PIER.z1],
    [PIER.x1, -TRESTLE.half, f.land + 2, TRESTLE.half],
  ];
}

function boxOf(f) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [u, v] of [
    [-HALF_BEAM - 2, STERN - 2],
    [-HALF_BEAM - 2, BOW + 2],
    [f.land + 4, -TRESTLE.half],
    [f.land + 4, TRESTLE.half],
    [PIER.x1, PIER.z0],
    [PIER.x1, PIER.z1],
  ]) {
    toWorld(f, u, v, _w);
    x0 = Math.min(x0, _w.x);
    z0 = Math.min(z0, _w.z);
    x1 = Math.max(x1, _w.x);
    z1 = Math.max(z1, _w.z);
  }
  return [x0, z0, x1, z1];
}

// What a berth keeps clear of, all of it there first: the land of a real
// place (world/landforms.js), the old places, towns, the mouths of caves,
// the railway, other places' boxes (boxes() -> [[x0, z0, x1, z1]]), and
// the airfields (airfields: the Airports, airports/airports.js, whose
// airfields in the way are asked about: so ask once they've been found, as
// fieldsKnown() says, or they're found then and there).
// -> keepOff for findBerth.
export function clearOf({ landforms, sites, towns, caves, lines, boxes = () => [], airfields = null }) {
  const claims = [landOf(landforms), boxesOf(() => boxes()), placesOf(sites), placesOf(towns), caveMouths(caves, MOUTH_CLEAR), railsNear(lines, NEAR.longer)];
  if (airfields) claims.push(airfieldsOver(airfields));
  // (a berth's search doesn't wait for what it keeps clear of: see the top)
  return keepClear(claims, { waits: false });
}

// How far (m) a berth looked for round a point may reach, the most, and so
// how far off what's grown before her is asked about.
export const REACH = ROUND.far + TRESTLE_MOST + 200;

// The airfields' regions whose airfield might be in the way of a berth
// looked for round `from`: the ones clearOf will ask about. (regions: the
// Airports' regions.)
export function regionsInTheWay(regions, from) {
  return regions.filter((g) => mayReach(g, Math.hypot(from.x - g.x, from.z - g.z), REACH));
}
