// Where the ship is: alongside a pier, on the coast a walk from where people
// first arrive.
//
// The sea is always a walk away from the start, in a direction of the
// seed's own choosing (world/sea.js), and the land goes down into it
// quickly. Where exactly the pier is, is grown from the seed and the land,
// like the old places: along each of a fan of lines out from the start
// toward the sea, the first place it reaches the water, and from there,
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
// Away from the start there's no knowing which way the sea is: the lines are
// looked along all the way round (findBerth's `round`), further.
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
import { toWorld } from '../landmarks/sites.js';
import { samplesNear } from '../railway/lines.js';
import { mayReach } from '../huntclub/site.js';
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
const LOOK = { fan: 1.35, steps: 27, near: 150, far: 2600, step: 8 }; // the lines looked along: how wide a fan (radians each way), how many, from and to (m), how finely
const ROUND = { steps: 40, far: 14000, step: 40 }; // ...or all the way round, further and more coarsely (the edge then found finely)
// Her lane out to sea (m): she moves off the pier sideways this far, then
// swings round in water this wide round her (half her length and some);
// the lane runs straight out as far as LANE.most and must reach LANE.least,
// and where she leaves the coast behind there's no land within LANE.clear.
export const LANE = { side: 40, swing: 165, most: 3200, least: 900, clear: 450, wide: 30 };
const OUT = { from: 60, to: 520, step: 10, keep: 3, apart: 60 }; // m out to sea from the water's edge, to where her middle is; how many spots kept along each line, how far apart
const NORMAL_SPAN = 40; // m: the slope of the land is read across this much of it
const TRESTLE_MOST = 700; // m: a longer one than this isn't worth it
const NEARER = 0.2; // how much a metre nearer the start is worth, in metres of pier
const CLEAR = 25; // m round it all kept clear of anything else grown from the seed
const MOUTH_CLEAR = 30; // m from a cave's mouth

const _w = { x: 0, z: 0 };

// gen: the WorldGen. start: { x, z }. keepOff(x0, z0, x1, z1): whether a
// square is somewhere it may not be (a hike, an old place, a town...).
// -> a berth, or null where there's nowhere for one.
// round: look all the way round start, out to ROUND.far (somewhere other
// than where people arrive, where the sea could be any way).
export function findBerth(gen, start, keepOff = () => false, opts = {}) {
  const steps = berthSearch(gen, start, keepOff, opts);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

// findBerth a step at a time: a generator that yields after each line looked
// along and each candidate tried, and returns the berth (or null), so it can
// be spread over frames.
export function* berthSearch(gen, start, keepOff = () => false, { round = false } = {}) {
  const sea = SEA.level;
  const deep = sea - DEEP;
  const h = (x, z) => gen.height(x, z);
  const base = Math.atan2(gen.sea.dirZ, gen.sea.dirX);
  const found = [];
  const spot = { x: 0, z: 0, yaw: 0 };
  const steps = round ? ROUND.steps : LOOK.steps;
  for (let i = 0; i < steps; i++) {
    const a = round ? (i / steps) * Math.PI * 2 : base + (i / (LOOK.steps - 1) - 0.5) * 2 * LOOK.fan;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    // the water's edge along this line (coarsely, then to within a step)
    let shore = null;
    const step = round ? ROUND.step : LOOK.step;
    for (let t = LOOK.near; t <= (round ? ROUND.far : LOOK.far); t += step) {
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
// the railway, other places' boxes (boxes() -> [[x0, z0, x1, z1]]: the
// launch site, the video store, the abandoned buildings), and
// the airfields (airfields: the Airports, airports/airports.js, whose
// airfields in the way are asked about: so ask once they've been found, as
// fieldsKnown() says, or they're found then and there).
// -> keepOff for findBerth.
export function clearOf({ landforms, sites, towns, caves, lines, boxes = () => [], airfields = null }) {
  const over = (b, x0, z0, x1, z1) => b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0;
  return (x0, z0, x1, z1) => {
    if (landforms.reaches(x0, z0, x1, z1)) return true;
    for (const b of boxes()) if (b && over(b, x0, z0, x1, z1)) return true;
    if (sites.within(x0, z0, x1, z1).length) return true;
    if (towns.within(x0, z0, x1, z1).length) return true;
    for (const c of caves.inBox(x0, z0, x1, z1)) {
      const m = c.mouth;
      if (m.x > x0 - MOUTH_CLEAR && m.x < x1 + MOUTH_CLEAR && m.z > z0 - MOUTH_CLEAR && m.z < z1 + MOUTH_CLEAR) return true;
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const line of lines.within(x0, z0, x1, z1)) {
      let near = false;
      samplesNear(line, cx, cz, Math.max(x1 - x0, z1 - z0) / 2, () => (near = true));
      if (near) return true;
    }
    if (airfields) {
      const half = Math.hypot(x1 - x0, z1 - z0) / 2;
      for (const g of airfields.regions) {
        if (!mayReach(g, Math.hypot(cx - g.x, cz - g.z), half)) continue;
        const field = airfields.site(g.id);
        if (field && over(field.box, x0, z0, x1, z1)) return true;
      }
    }
    return false;
  };
}

// How far from where it's looked for round a berth can reach (m): from the
// start, along its fan; elsewhere, all the way round.
export const REACH = { coast: LOOK.far + TRESTLE_MOST + 200, round: ROUND.far + TRESTLE_MOST + 200 };

// The airfields' regions whose airfield might be in the way of a berth
// looked for round `from` (round, or along the start's fan): the ones
// clearOf will ask about. (regions: the Airports' regions.)
export function regionsInTheWay(regions, from, round = false) {
  const far = round ? REACH.round : REACH.coast;
  return regions.filter((g) => mayReach(g, Math.hypot(from.x - g.x, from.z - g.z), far));
}
