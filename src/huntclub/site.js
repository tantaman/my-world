// Where the hunt clubs are.
//
// The first is a longer walk out from where people first arrive than the
// video store: a timber clubhouse with a porch, and in front of it a skeet
// field. Where exactly is grown from the seed and the land, like the video
// store (videostore/site.js): the flattest dry ground in a ring round the
// start, a little nearer winning over a little flatter, so everyone in a
// world finds it in the same place and nothing about it is saved. Its name is
// grown from the seed too.
//
// The rest are out in the forest (HuntClubs, below): the world is cut into
// FAR.cell squares, and a little under half of them have one, looked for the
// same way round a spot in its square chosen from the seed, each with a name
// of its own and its own steward. A club stays inside its square, so no two meet,
// and none is near the start, where the first one is.
//
// Nothing about the land changes for it. The clubhouse stands on a deck on
// posts, the houses and the station pads on the ground as it is, and the
// walks between them follow it; the trees, bushes and stones on the field are
// hidden as it comes into view.
//
// The club's frame (m) is the skeet field's (skeet.js): station 8 at the
// origin, the stations round towards +z, and the clubhouse behind them, its
// porch facing the field. For the first club, +z points to the start, so you
// come to the clubhouse first, and the shooting is away from where people
// come from; for the rest, it's the way the club's square says.
//
// No three.js in here: the tests read it.
//
// A site:
//   id      'huntclub:<x>:<z>' (the first), 'huntclub:far:<i>:<j>' (the rest):
//           a place on the map
//   name    'Grouse Creek Hunt Club'
//   seed    for what differs from one club to the next (its steward)
//   x, z    station 8; yaw: which way +z of the club's frame faces
//   base    the height of the ground at station 8
//   lo, hi  the lowest and highest ground looked at over the plan
//   plan    [[x0, z0, x1, z1]]: the field and the clubhouse, in the club's
//           frame (world/frame.js's toWorld, onPlan); all of it cleared
//   box     [x0, z0, x1, z1] in the world, round the plan
//   door    where `go here` sets you down: at the foot of the porch steps,
//           facing the clubhouse ({ x, z, yaw })

import { toWorld, boxOf } from '../world/frame.js';
import { hash2i, mulberry32 } from '../noise.js';
import { Searches } from '../core/searches.ts';
import { mayReach, airfieldsOver } from '../airports/airports.js';
import { keepClear, claimOf, boxesOf } from '../world/claims.ts';
import { STATIONS, HOUSES, FIELD } from './skeet.js';

// The field and the clubhouse behind it, in the club's frame: the houses,
// the stations, where the targets come down (about 55 m from each house,
// out to the sides), and the clubhouse.
export const PLAN = [-40, -8, 40, 40];
// The clubhouse: its walls (x0, z0, x1, z1), the porch along its front
// (porch: how deep, m), and the steps down from the porch's edge, in the
// middle (steps: their half width).
export const CLUB = { x0: -7, z0: 28, x1: 7, z1: 36, porch: 3, steps: 1.3 };
export const EDGE = CLUB.z0 - CLUB.porch; // the porch's front edge
const DECK_UP = 0.45; // m the porch and the floor stand over the highest ground under them
export const TREAD = 0.3; // m, each step's depth
const RISE = 0.19; // m, each step's rise at the most
// Where you're set down from the map: this far out past the foot of the steps.
export const DOOR_OUT = 2.2;
const PAD_UP = 0.08; // m a station's pad stands over the highest ground under it
// Where it may be: this far from the start (m), the nearest ring first.
export const RING = [450, 1000];
const STEP = 30; // m between the spots looked at, round a ring and between rings
const FLAT_MOST = 3.2; // m the ground may rise across the field and the clubhouse
const DRY = 40; // m from station 8 to the nearest water, at the least
const NEARER = 0.003; // m of rise a metre nearer the start is worth
const CLEAR = 15; // m round the plan kept clear of anything else grown from the seed
// The ground is looked at over the plan on a grid this many across and deep
// (the corners and the middle first).
const GRID = [9, 6];

const FIRST = ['Grouse', 'Cedar', 'Elk', 'Tamarack', 'Bear', 'Timber', 'Antler', 'Black Spruce', 'Wapiti', 'Hemlock', 'Partridge', 'Stag'];
const SECOND = ['Creek', 'Ridge', 'Hollow', 'Point', 'Run', 'Lake', 'Valley', 'Flats', 'Hill', 'Brook'];

// The club's name, grown from the seed: 'Grouse Creek Hunt Club'.
export function clubName(seed) {
  const r = mulberry32(hash2i(31, 77, seed));
  return `${FIRST[Math.floor(r() * FIRST.length)]} ${SECOND[Math.floor(r() * SECOND.length)]} Hunt Club`;
}

// A far club's name: its first word goes round on a lattice (i + 4j, of 16),
// so no two squares within three of each other either way share one; its
// second, on another, for variety. Never the first club's name.
const FAR_FIRST = [...FIRST, 'Woodcock', 'Moose', 'Whitetail', 'Pheasant'];
const wrap = (k, n) => ((k % n) + n) % n;
export function farName(seed, i, j) {
  const first = FAR_FIRST[wrap(i + j * 4 + seed, FAR_FIRST.length)];
  const k = wrap(i * 3 + j * 7 + (seed >> 4), SECOND.length);
  const name = `${first} ${SECOND[k]} Hunt Club`;
  return name === clubName(seed) ? `${first} ${SECOND[(k + 1) % SECOND.length]} Hunt Club` : name;
}

// gen: the WorldGen (height(x, z), water.edge after it). start: { x, z }.
// keepOff(x0, z0, x1, z1): whether that square is somewhere it may not be.
// -> the first club, or null where there's nowhere for one.
export function findSite(gen, start, keepOff = () => false) {
  return pickSite(gen, candidates(gen, start), keepOff);
}

// The first is found in two goes, so the first, the dear one, can be done
// before what it has to keep clear of is all known (the airfields are found
// a little at a time, after the world opens):
//
// candidates(gen, start) -> the spots flat and dry enough, best first: the
//   ground looked at all over each (the dear part), nothing else asked
// pickSite(gen, found, keepOff) -> the best of them nothing is in the way of,
//   as a site
export function candidates(gen, start) {
  return finish(flats(gen, start, RING, STEP, (spot) => Math.atan2(start.x - spot.x, start.z - spot.z), NEARER));
}

export function pickSite(gen, found, keepOff = () => false) {
  const s = choose(found, keepOff);
  return s && siteOf(gen, s, `huntclub:${Math.round(s.x)}:${Math.round(s.z)}`, clubName(gen.seed), gen.seed);
}

// Every spot flat and dry enough in rings round `at`, from r0 out to r1, best
// first: face(spot) says which way +z of the club's frame faces there (and
// with `turns` more than 1, it's tried turned that many ways round), and a
// metre nearer `at` is worth `nearer` m of rise. A generator, yielding now
// and then, so a search far out can be run a little at a time.
const YIELD_EVERY = 40; // spots looked at between yields
function* flats(gen, at, [r0, r1], step, face, nearer, turns = 1) {
  const [x0, z0, x1, z1] = PLAN;
  const quick = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
    [0, 0],
    [0, (CLUB.z0 + CLUB.z1) / 2],
  ];
  const grid = [];
  for (let j = 0; j <= GRID[1]; j++) for (let i = 0; i <= GRID[0]; i++) grid.push([x0 + ((x1 - x0) * i) / GRID[0], z0 + ((z1 - z0) * j) / GRID[1]]);
  const found = [];
  const spot = { x: 0, z: 0, yaw: 0 };
  const _w = { x: 0, z: 0 };
  let looked = 0;
  for (let r = r0; r <= r1; r += step) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / step));
    const turn = r * 0.618 + 2.3; // each ring starts somewhere else round, so the spots don't line up
    for (let k = 0; k < n; k++) {
      if (++looked % YIELD_EVERY === 0) yield;
      const a = turn + (k / n) * Math.PI * 2;
      spot.x = at.x + Math.cos(a) * r;
      spot.z = at.z + Math.sin(a) * r;
      const facing = face(spot);
      const base = gen.height(spot.x, spot.z);
      if (gen.water.edge < DRY) continue;
      for (let t = 0; t < turns; t++) {
        spot.yaw = (facing + (t * Math.PI * 2) / turns) % (Math.PI * 2);
        let lo = base;
        let hi = base;
        let ok = true;
        // a quick look first, and over the whole of it only if it's worth it
        for (const pts of [quick, grid]) {
          for (const [u, v] of pts) {
            toWorld(spot, u, v, _w);
            const h = gen.height(_w.x, _w.z);
            if (gen.water.edge < 4) ok = false;
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
            if (!ok || hi - lo > FLAT_MOST) break;
          }
          if (!ok || hi - lo > FLAT_MOST) break;
        }
        if (!ok || hi - lo > FLAT_MOST) continue;
        found.push({ x: spot.x, z: spot.z, yaw: spot.yaw, base, lo, hi, score: hi - lo + r * nearer });
      }
    }
  }
  found.sort((a, b) => a.score - b.score);
  return found;
}

function finish(run) {
  let r;
  do r = run.next();
  while (!r.done);
  return r.value;
}

// The best of them that nothing else is in the way of (asked last, and of
// as few as can be: it can be dear).
function choose(found, keepOff) {
  for (const s of found) {
    const box = boxOf({ ...s, plan: [PLAN] });
    if (!keepOff(box[0] - CLEAR, box[1] - CLEAR, box[2] + CLEAR, box[3] + CLEAR)) return s;
  }
  return null;
}

// A spot chosen, as a site.
function siteOf(gen, s, id, name, seed) {
  const { x, z, yaw } = s;
  const site = { x, z, yaw, plan: [PLAN] };
  const steps = layout(site, (wx, wz) => gen.height(wx, wz)).steps;
  const door = toWorld(site, 0, EDGE - steps.length * TREAD - DOOR_OUT);
  return {
    id,
    name,
    seed,
    x,
    z,
    yaw,
    base: s.base,
    lo: s.lo,
    hi: s.hi,
    plan: [PLAN],
    box: boxOf(site),
    door: { x: door.x, z: door.z, yaw },
  };
}

// How high everything stands, on the ground as it is: all of it in the
// world, but for where the steps are (in the club's frame).
//   deck     the height of the porch and the clubhouse floor
//   steps    [{ z0, z1, top }]: each step down from the porch's edge, outwards
//            (z0 < z1, the club's frame), the last one a step above the ground
//   pads     [{ n, x, z, top, low }]: each station's pad (its middle, and how
//            high its top is and how low the ground under it goes)
//   houses   { H, L }: { floor, low }: the floor of each house and the lowest
//            ground under it
//   mouths   { H, L }: { x, y, z }: where each house throws from
//   cross    { x, y, z }: the spot the targets are thrown over
//   low      the lowest ground under the clubhouse
// site: the site (x, z, yaw); ground(x, z) -> the height of the ground.
export function layout(site, ground) {
  const _w = { x: 0, z: 0 };
  const g = (u, v) => {
    toWorld(site, u, v, _w);
    return ground(_w.x, _w.z);
  };
  // the clubhouse and its porch
  let top = -Infinity;
  let low = Infinity;
  for (let j = 0; j <= 4; j++) {
    for (let i = 0; i <= 6; i++) {
      const h = g(CLUB.x0 - 0.5 + ((CLUB.x1 - CLUB.x0 + 1) * i) / 6, EDGE + ((CLUB.z1 - EDGE) * j) / 4);
      top = Math.max(top, h);
      low = Math.min(low, h);
    }
  }
  const deck = top + DECK_UP;
  // the steps down to the ground in front of the porch, as many as it takes
  const foot = Math.min(g(0, EDGE - 1), g(-CLUB.steps, EDGE - 1), g(CLUB.steps, EDGE - 1));
  const n = Math.max(1, Math.ceil((deck - foot) / RISE));
  const rise = (deck - foot) / n;
  const steps = [];
  for (let i = 1; i < n; i++) steps.push({ z0: EDGE - i * TREAD, z1: EDGE - (i - 1) * TREAD, top: deck - i * rise });
  // the stations' pads
  const pads = STATIONS.map((s) => {
    let hi = -Infinity;
    let lo = Infinity;
    for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const h = g(s.x + u * FIELD.pad, s.z + v * FIELD.pad);
      hi = Math.max(hi, h);
      lo = Math.min(lo, h);
    }
    const p = toWorld(site, s.x, s.z);
    return { n: s.n, x: p.x, z: p.z, top: hi + PAD_UP, low: lo };
  });
  // the houses, and their traps
  const houses = {};
  const mouths = {};
  for (const [k, h] of Object.entries(HOUSES)) {
    const [x0, z0, x1, z1] = h.box;
    let hi = -Infinity;
    let lo = Infinity;
    for (const [u, v] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
      const y = g(u, v);
      hi = Math.max(hi, y);
      lo = Math.min(lo, y);
    }
    houses[k] = { floor: hi + 0.05, low: lo };
    const m = toWorld(site, h.mouth.x, h.mouth.z);
    mouths[k] = { x: m.x, y: hi + 0.05 + h.mouth.up, z: m.z };
  }
  const c = toWorld(site, 0, FIELD.cross);
  const cross = { x: c.x, y: g(0, FIELD.cross) + FIELD.crossUp, z: c.z };
  return { deck, low, steps, pads, houses, mouths, cross };
}

// The airfields' regions whose airfield might be in the way of a club
// anywhere it may be (from `start`): the ones whose airfield findSite will ask
// about. (regions: the Airports' regions.)
export function regionsInTheWay(regions, start) {
  const far = RING[1] + Math.hypot(PLAN[2] - PLAN[0], PLAN[3] - PLAN[1]) / 2 + Math.max(Math.abs(PLAN[1]), Math.abs(PLAN[3])) + CLEAR;
  return regions.filter((g) => mayReach(g, Math.hypot(start.x - g.x, start.z - g.z), far));
}

// What a club keeps clear of, all of it there first:
//   reserved   what the video store keeps clear of (videostore/site.js clearOf:
//              real places, old places, towns, caves' mouths, the railway,
//              the launch sites), and the stores and the abandoned buildings;
//              its ready(x0, z0, x1, z1), if it has one, says whether the
//              railway there has been surveyed
//   boxes      () -> [[x0, z0, x1, z1]]: other places' boxes in the world
//   airfields  the Airports (airports/airports.js: regions, site(id)), or null:
//              those whose airfield might reach a square are asked about, and
//              found then and there if they haven't been
// -> keepOff for findSite and HuntClubs. Its ready(x0, z0, x1, z1) says
// whether all that's dear to know there is known (the railway, the
// airfields), and asks for what isn't, so a search far out can wait for it
// rather than stall.
export function clearOf({ reserved = () => false, boxes = () => [], airfields = null }) {
  const claims = [claimOf(reserved), boxesOf(() => boxes())];
  if (airfields) claims.push(airfieldsOver(airfields));
  const keepOff = keepClear(claims);
  // (always there to ask, though with nothing dear to know it only says yes)
  keepOff.ready ??= () => true;
  return keepOff;
}

// ── Further out ──────────────────────────────────────────────────────────────

export const FAR = {
  cell: 10000, // m, the side of a square
  chance: 0.5, // that a square has one, if the land will take it
  inset: 0.25, // the spot it's looked for round keeps this fraction of the square in from its edges
  ring: [40, 1400], // m round that spot it's looked for, nearest first
  step: 40, // m between the spots looked at, round a ring and between rings
  turns: 4, // ways round its clubhouse is tried at each, a quarter turn apart
  start: 3000, // m the spot keeps from the start, so none comes near the first club
};
const FAR_NEARER = 0.002; // m of rise a metre nearer the spot is worth
const FAR_SALT = 0x6c1ab;
// How far (m) the plan reaches from station 8, the most; and so how far a far
// club's box reaches from its spot. (A spot keeps FAR.inset of its square in
// from the edges, more than this and CLEAR, so a club is inside its square.)
const PLAN_REACH = Math.max(...[[0, 1], [2, 1], [2, 3], [0, 3]].map(([a, b]) => Math.hypot(PLAN[a], PLAN[b])));
export const FAR_REACH = FAR.ring[1] + PLAN_REACH;

// What square (i, j) is to have, from the seed alone: { i, j, x, z, yaw,
// name, seed }, the spot it's looked for round; or null for none.
export function farSpot(seed, i, j) {
  // (offset, because hash2i gives (x, z) and (-x, -z) the same hash when
  // both are odd, and the squares either side of the middle would match)
  const rng = mulberry32(hash2i(i + 7919, j + 104729, (seed ^ FAR_SALT) >>> 0));
  if (rng() > FAR.chance) return null;
  // drawn first, so that what the search finds can't change them
  const yaw = rng() * Math.PI * 2;
  const mine = Math.floor(rng() * 1e9);
  const x = (i + FAR.inset + rng() * (1 - 2 * FAR.inset)) * FAR.cell;
  const z = (j + FAR.inset + rng() * (1 - 2 * FAR.inset)) * FAR.cell;
  return { i, j, x, z, yaw, name: farName(seed, i, j), seed: mine };
}

// The club round a spot, or null: a generator, yielding now and then, and,
// while patient() says it may, until what's dear to know round it is known
// (keepOff.ready) rather than find it there and then. Its clubhouse faces the
// way the spot says, or a quarter turn round from it.
export function* farSite(gen, spot, keepOff = () => false, patient = () => false) {
  const found = yield* flats(gen, spot, FAR.ring, FAR.step, () => spot.yaw, FAR_NEARER, FAR.turns);
  const r = FAR_REACH + CLEAR;
  while (patient() && keepOff.ready && !keepOff.ready(spot.x - r, spot.z - r, spot.x + r, spot.z + r)) yield 'wait'; // (not gone round and round on: core/searches.ts)
  const s = choose(found, keepOff);
  return s && siteOf(gen, s, `huntclub:far:${spot.i}:${spot.j}`, spot.name, spot.seed);
}

// The clubs out in the forest (not the first: index.js has that). Squares are
// looked over the first time they're asked about, outright (cell), or a
// little at a time (peek, then pump).
//   start      where people first arrive
//   keepOff    as findSite's (clearOf)
//   away(x0, z0, x1, z1)   somewhere none may be looked for: real places
export class HuntClubs {
  constructor(gen, { start, keepOff = () => false, away = () => false }) {
    this.gen = gen;
    this.start = start;
    this.keepOff = keepOff;
    this.away = away;
    // looked for outright (cell) or a little at a time (peek, then pump): core/searches.ts
    this.search = new Searches({
      grow: (k) => {
        const [i, j] = k.split(':').map(Number);
        return this._grow(i, j);
      },
    });
    this.cells = this.search.known; // "i:j" -> site or null
  }

  // Squares asked about and not yet looked over.
  get queue() {
    return this.search.queue;
  }

  // A search may wait for what's dear to know (not when one's wanted outright).
  get patient() {
    return this.search.patient;
  }

  // The spot square (i, j) is looked for round, or null if it has none.
  spot(i, j) {
    const s = farSpot(this.gen.seed, i, j);
    if (!s) return null;
    if (Math.hypot(s.x - this.start.x, s.z - this.start.z) < FAR.start) return null;
    const r = FAR_REACH + CLEAR;
    return this.away(s.x - r, s.z - r, s.x + r, s.z + r) ? null : s;
  }

  // The club in square (i, j), or null; looked for now if it hasn't been.
  cell(i, j) {
    return this.search.get(`${i}:${j}`);
  }

  // ...or undefined if it hasn't been, and it's queued for pump().
  peek(i, j) {
    const k = `${i}:${j}`;
    const known = this.cells.get(k);
    if (known !== undefined) return known;
    if (!this.spot(i, j)) return this.search.set(k, null);
    return this.search.peek(k);
  }

  // Look over queued squares for up to `ms` milliseconds. -> how many are left.
  pump(ms) {
    return this.search.pump(ms);
  }

  // Ask for the squares whose clubs could be within r of (x, z) to be looked
  // over in the background.
  prefetch(x, z, r) {
    this._squares(x - r, z - r, x + r, z + r, (i, j) => this.peek(i, j));
  }

  // Clubs whose box overlaps a rectangle of the world. With wait = false,
  // only those already found.
  within(x0, z0, x1, z1, wait = true) {
    const out = [];
    this._squares(x0, z0, x1, z1, (i, j) => {
      const s = wait ? this.cell(i, j) : this.cells.get(`${i}:${j}`);
      if (s && s.box[0] <= x1 && s.box[2] >= x0 && s.box[1] <= z1 && s.box[3] >= z0) out.push(s);
    });
    return out;
  }

  // Whether every club that could overlap a rectangle has been looked for,
  // queueing for pump() the squares that haven't.
  known(x0, z0, x1, z1) {
    let all = true;
    this._squares(x0, z0, x1, z1, (i, j) => {
      if (this.peek(i, j) === undefined) all = false;
    });
    return all;
  }

  // The club with this id, or null.
  byId(id) {
    const m = /^huntclub:far:(-?\d+):(-?\d+)$/.exec(String(id));
    const s = m && this.cell(Number(m[1]), Number(m[2]));
    return s && s.id === id ? s : null;
  }

  // The squares with a spot whose club could reach the rectangle (a club is
  // inside its own square).
  _squares(x0, z0, x1, z1, fn) {
    const C = FAR.cell;
    for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) {
        const s = this.spot(i, j);
        if (s && s.x + FAR_REACH >= x0 && s.x - FAR_REACH <= x1 && s.z + FAR_REACH >= z0 && s.z - FAR_REACH <= z1) fn(i, j);
      }
    }
  }

  *_grow(i, j) {
    const spot = this.spot(i, j);
    return spot ? yield* farSite(this.gen, spot, this.keepOff, () => this.patient) : null;
  }
}
