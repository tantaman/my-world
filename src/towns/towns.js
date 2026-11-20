// Where the towns are, and how each one is laid out.
//
// The world is cut into CELL-metre squares, and each has one chance (CHANCE)
// of a town. Which kind, where, and what stands along its street all come
// from the seed and the land, so everyone in a world finds the same town with
// the same saloon in the same place, and nothing about it is saved.
//
// Like the old places (landmarks/sites.js), a town changes nothing about what
// a seed grows: no ground is levelled and no tree is moved. A town is looked
// for where a street will lie fairly level and dry, its main street along the
// lie of the land, and each building is put where the ground under it is
// level enough to stand it on a foundation; a lot that isn't is left empty.
// The trees and stones in its way are hidden as it comes into view, the way
// a felled tree is (see index.js). A town keeps clear of the old places, of
// the mouths of the caves (where the hillside is cut open), of where people
// first arrive, and of the hand-placed structures. No town grows in a square
// a real place reaches, or near enough to it to reach it (keepOff:
// world/landforms.js reaches): the land there isn't the forest's alone, and
// until it's fetched it isn't even known. That is told from the hikes'
// cards, so a town never waits on, or changes with, a hike's land arriving.
//
// No three.js in here: the tests read it, and the map asks it what to label.
//
// A town is laid out in its own frame, like an old place: its origin is the
// middle of its main street, the street runs along x, and the lots face it
// from either side (u along the street, v across it).
//
//   id        `town:${ci}:${cj}`: the cell it's in
//   kind      a key of KINDS; style: a key of STYLES (kinds.js)
//   name      what it's called ('Copper Gulch')
//   seed      for everything that differs from one town to the next
//   x, z, yaw where the middle of its street is, and how it runs: along
//             (cos yaw, -sin yaw)
//   len, half how long its street is, and half how wide (m)
//   people    how many live there (0: nobody)
//   lots      what stands there: { type, u, v, r, w, d, front, seed, decay,
//             ruin, x, z, yaw }, where (u, v) is its middle in the town's
//             frame and r how it's turned in it (its front faces (sin r,
//             cos r)); x, z, yaw are the same in the world, so a lot can be
//             built like an old place
//   street    the street's rectangle, in the town's frame
//   plan      rectangles [u0, v0, u1, v1] it stands on: the street and every
//             lot. Building goes round them, and plants are kept off them
//   bare      ...where no grass grows: the street and under the floors
//   clear     ...where no tree grows: the whole town, or just its plan
//   shape     ...and what the map draws close up: its roofs
//   box       [x0, z0, x1, z1] in the world, round all of that

import { mulberry32, hash2i } from '../noise.js';
import { Sites, toWorld } from '../landmarks/sites.js';
import { SURNAMES } from '../landmarks/kinds.js';
import { layoutCave, cellOf } from '../caves/sites.js';
import { segDist } from '../core/geom.js';
import { KINDS, KIND_IDS, STYLES, BUILDINGS, NAMES } from './kinds.js';

export const CELL = 1000; // m, the side of the square each town has to itself
const CHANCE = 0.8; // that a cell has a town at all
const INSET = 0.16; // a town's middle keeps this fraction of a cell in from its edges...
const SPILL = 110; // ...so nothing of it reaches more than this far (m) out of its cell
const START_CLEAR = 260; // m between where people first arrive and the edge of a town
const PAD_CLEAR = 40; // m kept clear round a hand-placed structure
const TRIES = 6; // spots tried for each kind of town in a cell, flattest first
const FLATS = 16; // spots looked at across a cell, each way
const FLAT_LONG = 45; // m along a street and...
const FLAT_WIDE = 25; // ...across it, over which a spot is judged for how flat it is
const FLAT_MOST = 9; // m: the most the hills may rise over that before it isn't tried
const STEP = 6; // m between looks along the street
const STREET_RISE = 8; // m: the most a street may climb from one end to the other
const STREET_GRADE = 0.24; // ...and the steepest stretch of it, rise over run
const STREET_DRY = 5; // m from water the street keeps
const LOT_DRY = 4; // ...and a building
const OLD_PLACES = 4; // m between a lot and an old place (landmarks)
const CAVE_MOUTH = 8; // m between a town and the cutting at a cave's mouth
const MIN_LOTS = { western: 6, village: 5, creepy: 4 }; // lots along the street a town needs
const CLEAR_ROUND = 7; // m of woods cleared round a town that clears it all
const SALT = 0x7041e;
const _seg = { d: 0, t: 0, nx: 0, nz: 0 };

// Where a person stands to talk to a building (in its own frame): out in front
// of the steps or the gate.
export const FRONT_STEP = 0.9;

export class Towns extends Sites {
  // start: where people first arrive (kept clear)
  // sites: the old places (landmarks), which towns keep clear of
  // keepOff(x0, z0, x1, z1): is any of that somewhere no town may be?
  constructor(gen, { start = gen.findSpawn(0, 0), sites = null, keepOff = () => false } = {}) {
    super(gen, { start });
    this.size = CELL;
    this.spill = SPILL;
    this.keepOff = keepOff;
    this.sites = sites || new Sites(gen, { start });
    this.caves = new Map(); // "cx:cz" -> the mouth of the cave in that square, or null
  }

  // The town with this id, or null.
  byId(id) {
    const m = /^town:(-?\d+):(-?\d+)$/.exec(String(id));
    if (!m) return null;
    const t = this.cell(Number(m[1]), Number(m[2]));
    return t && t.id === id ? t : null;
  }

  // ── Growing a cell ─────────────────────────────────────────────────────────
  _grow(ci, cj) {
    // (as far out as anything of a town in this square can reach)
    if (this.keepOff(ci * CELL - SPILL, cj * CELL - SPILL, (ci + 1) * CELL + SPILL, (cj + 1) * CELL + SPILL)) return null;
    const rng = mulberry32(hash2i(ci, cj, (this.gen.seed ^ SALT) >>> 0));
    if (rng() > CHANCE) return null;
    // drawn first, so that how long the search below takes can't change them
    const naming = [rng(), rng(), rng(), rng()];
    const seed = Math.floor(rng() * 1e9);
    const crowd = rng();
    const many = rng();
    const spots = this._flats(ci, cj, rng);
    for (const kind of weightedOrder(KIND_IDS, (k) => KINDS[k].weight, rng)) {
      const K = KINDS[kind];
      let tried = 0;
      for (const s of spots) {
        if (s.f < K.forest[0] || s.f > K.forest[1]) continue;
        if (tried++ >= TRIES) break;
        const turn = (rng() - 0.5) * 0.3;
        const lay = Math.floor(rng() * 1e9);
        if (!this._suits(s.x, s.z)) continue;
        const town = this._layout(kind, s.x, s.z, s.yaw + turn, mulberry32(lay));
        if (!town) continue;
        const [chance, few, most] = K.people;
        town.id = `town:${ci}:${cj}`;
        town.name = nameOf(K.style, naming);
        town.seed = seed;
        town.people = crowd < chance ? few + Math.floor(many * (most - few + 1)) : 0;
        return town;
      }
    }
    return null;
  }

  // The flattest spots in a cell, flattest first: a grid of them, each a
  // little off its node, judged on the hills without their small bumps (which
  // is quick), with which way a street would run there and how wooded it is.
  _flats(ci, cj, rng) {
    const gen = this.gen;
    const out = [];
    const p = {};
    for (let j = 0; j < FLATS; j++) {
      for (let i = 0; i < FLATS; i++) {
        const x = (ci + INSET + ((i + rng()) / FLATS) * (1 - 2 * INSET)) * CELL;
        const z = (cj + INSET + ((j + rng()) / FLATS) * (1 - 2 * INSET)) * CELL;
        const yaw = contour(gen, x, z);
        const t = { x, z, yaw };
        let lo = Infinity;
        let hi = -Infinity;
        for (const u of [-FLAT_LONG, 0, FLAT_LONG]) {
          for (const v of [-FLAT_WIDE, 0, FLAT_WIDE]) {
            toWorld(t, u, v, p);
            const h = gen.broadHeight(p.x, p.z);
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
          }
        }
        if (hi - lo < FLAT_MOST) out.push({ x, z, yaw, rise: hi - lo, f: gen.forest(x, z) });
      }
    }
    return out.sort((a, b) => a.rise - b.rise);
  }

  // What every town needs of its middle: away from where people arrive and
  // from the hand-placed structures, dry, and below the treeline.
  _suits(x, z) {
    const gen = this.gen;
    if (Math.hypot(x - this.start.x, z - this.start.z) < START_CLEAR + 70) return false;
    if (gen.padClearance(x, z) < PAD_CLEAR + 70) return false;
    const h = gen.height(x, z);
    return gen.water.edge > 20 && gen.above(x, z, h) === 0;
  }

  // Lay a town out along a street through (x, z), or null if it won't go.
  _layout(kind, x, z, yaw, rng) {
    const K = KINDS[kind];
    const S = STYLES[K.style];
    const len = S.street[0] + rng() * (S.street[1] - S.street[0]);
    const town = { id: '', kind, style: K.style, name: '', seed: 0, x, z, yaw, len, half: S.half, people: 0, lots: [] };
    if (!this._street(town)) return null;
    if (Math.hypot(x - this.start.x, z - this.start.z) < START_CLEAR + len / 2 + 30) return null;
    if (this.gen.padClearance(x, z) < PAD_CLEAR + len / 2 + 30) return null;

    const lots = town.lots;
    const span = (r) => r[0] + rng() * (r[1] - r[0]);
    const make = (type, u, v, r) => {
      const B = BUILDINGS[type];
      return { type, u, v, r, w: span(B.w), d: span(B.d), front: B.front, seed: 0, decay: 0, ruin: false };
    };
    const room = (lot) => this._fits(town, lot);

    // ── Along the street ─────────────────────────────────────────────────
    // Lots on both sides, each side from the near end of the street to the
    // far one, the one further behind taking the next lot. What must be
    // there comes first, in a random order; the rest are filled in.
    const queue = shuffle([...S.must], rng);
    const next = () => (queue.length ? queue[0] : S.fill[Math.floor(rng() * S.fill.length)]);
    const cursor = { [-1]: -len / 2, [1]: -len / 2 };
    const done = { [-1]: false, [1]: false };
    // a village's green, kept near the middle of one side
    let green = null;
    if (S.green) {
      const side = rng() < 0.5 ? -1 : 1;
      const g = make(S.green, (rng() - 0.5) * len * 0.2, 0, side < 0 ? 0 : Math.PI);
      g.v = side * (S.half + S.setback + g.d / 2);
      if (room(g)) {
        green = { side, from: g.u - g.w / 2, to: g.u + g.w / 2 };
        lots.push(g);
      }
    }
    let street = 0;
    let guard = 0;
    while ((!done[-1] || !done[1]) && guard++ < 80) {
      const side = done[-1] ? 1 : done[1] ? -1 : cursor[-1] <= cursor[1] ? -1 : 1;
      const type = next();
      const lot = make(type, 0, 0, side < 0 ? 0 : Math.PI);
      const from = cursor[side];
      if (green && green.side === side && from + lot.w > green.from && from < green.to) {
        cursor[side] = green.to + span(S.gap);
        continue;
      }
      if (from + lot.w > len / 2) {
        done[side] = true;
        continue;
      }
      lot.u = from + lot.w / 2;
      lot.v = side * (S.half + S.setback + lot.d / 2);
      if (S.lean) {
        // the houses of a dark town stand at odds with each other
        lot.v += side * rng() * 3;
        lot.r += (rng() - 0.5) * 0.16;
      }
      if (room(lot)) {
        lots.push(lot);
        street++;
        if (queue.length && queue[0] === type) queue.shift();
        cursor[side] = from + lot.w + span(S.gap);
      } else {
        // leave a gap, and try what was to go here a little further on
        cursor[side] = from + Math.max(2.5, lot.w / 2);
      }
    }
    if (street < MIN_LOTS[K.style]) return null;

    // ── Past the far end, and where the road comes in ─────────────────────
    // A church closes the view down the street; the graveyard is beside it.
    const far = len / 2 + 3.5;
    let church = null;
    for (const [type, chance] of S.ends) {
      if (rng() > chance) continue;
      if (type === 'church') {
        const c = make('church', 0, 0, -Math.PI / 2);
        c.u = far + c.d / 2;
        if (room(c)) lots.push((church = c));
      } else {
        const g = make(type, 0, 0, -Math.PI / 2);
        g.u = far + g.d / 2;
        const sides = rng() < 0.5 ? [-1, 1] : [1, -1];
        const tries = church ? sides.map((s) => s * (church.w / 2 + 3 + g.w / 2)) : [0, ...sides.map((s) => s * (g.w / 2 + 4))];
        for (const v of tries) {
          g.v = v;
          if (room(g)) {
            lots.push(g);
            break;
          }
        }
      }
    }
    // a water tower and a windpump beside the road into a western town,
    // a well into the others
    let side = rng() < 0.5 ? -1 : 1;
    for (const [type, chance] of S.edges) {
      if (rng() > chance) continue;
      const e = make(type, 0, 0, side < 0 ? 0 : Math.PI);
      e.u = -len / 2 - 2.5 - e.w / 2;
      e.v = side * (S.half + 1.2 + e.d / 2);
      if (room(e)) lots.push(e);
      side = -side;
    }

    // ── What each lot is like ─────────────────────────────────────────────
    const open = { green: true, graveyard: true, tower: true, windpump: true, well: true, church: true };
    for (const lot of lots) {
      lot.seed = Math.floor(rng() * 1e9);
      if (K.abandoned) {
        lot.decay = 0.45 + rng() * 0.5;
        lot.ruin = !open[lot.type] && rng() < 0.22;
      } else {
        lot.decay = K.style === 'creepy' ? 0.2 + rng() * 0.2 : K.people[0] > 0 ? rng() * 0.08 : 0;
      }
      place(town, lot);
    }
    lots.sort((a, b) => a.u - b.u || a.v - b.v);
    rectsOf(town, S);
    return town;
  }

  // The street: dry from end to end, and not too steep along it.
  _street(t) {
    const gen = this.gen;
    let lo = Infinity;
    let hi = -Infinity;
    let prev = null;
    const p = {};
    for (let u = -t.len / 2 - 4; u <= t.len / 2 + 4.01; u += STEP) {
      let mid = 0;
      for (const v of [-t.half * 0.8, 0, t.half * 0.8]) {
        toWorld(t, u, v, p);
        const h = gen.height(p.x, p.z);
        if (gen.water.edge < STREET_DRY || gen.above(p.x, p.z, h) > 0) return false;
        if (v === 0) mid = h;
      }
      if (prev !== null && Math.abs(mid - prev) > STREET_GRADE * STEP) return false;
      toWorld(t, u, 0, p);
      if (this._nearMouth(p.x, p.z, t.half)) return false;
      prev = mid;
      lo = Math.min(lo, mid);
      hi = Math.max(hi, mid);
    }
    return hi - lo <= STREET_RISE;
  }

  // Whether a lot can stand where it is: the ground under it level enough,
  // dry, not on a footpath (under its walls), and clear of the old places.
  _fits(t, lot) {
    const gen = this.gen;
    const B = BUILDINGS[lot.type];
    const { w, d, front } = lot;
    const body = d / 2 - front;
    const p = {};
    let lo = Infinity;
    let hi = -Infinity;
    const at = (lx, lz) => {
      const c = Math.cos(lot.r);
      const n = Math.sin(lot.r);
      return toWorld(t, lot.u + lx * c + lz * n, lot.v - lx * n + lz * c, p);
    };
    for (const [lx, lz, walls] of [[-w / 2, -d / 2, 1], [w / 2, -d / 2, 1], [-w / 2, body, 1], [w / 2, body, 1], [0, 0, 1], [-w / 2, d / 2, 0], [w / 2, d / 2, 0]]) {
      at(lx, lz);
      const h = gen.height(p.x, p.z);
      if (gen.water.edge < LOT_DRY || gen.above(p.x, p.z, h) > 0) return false;
      if (walls && gen.pathEdge < 0.4) return false;
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    if (hi - lo > B.slope) return false;
    // nor in the mouth of a cave
    at(0, 0);
    if (this._nearMouth(p.x, p.z, Math.hypot(w, d) / 2)) return false;
    // the old places: none on or right beside it
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
      at(lx, lz);
      x0 = Math.min(x0, p.x);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x);
      z1 = Math.max(z1, p.z);
    }
    const m = OLD_PLACES;
    for (const s of this.sites.within(x0 - m, z0 - m, x1 + m, z1 + m)) {
      if (s.box[0] < x1 + m && s.box[2] > x0 - m && s.box[1] < z1 + m && s.box[3] > z0 - m) return false;
    }
    return true;
  }

  // Whether anything within r of (x, z) comes near the cutting at the mouth
  // of a cave (caves/sites.js): its lip and the way in.
  _nearMouth(x, z, r) {
    const [c0, r0] = cellOf(x - r - 40, z - r - 40);
    const [c1, r1] = cellOf(x + r + 40, z + r + 40);
    for (let cz = r0; cz <= r1; cz++) {
      for (let cx = c0; cx <= c1; cx++) {
        const k = `${cx}:${cz}`;
        let m = this.caves.get(k);
        if (m === undefined) {
          const cave = layoutCave(this.gen, cx, cz);
          this.caves.set(k, (m = cave ? cave.mouth : null));
        }
        if (!m) continue;
        const reach = m.portal + 3;
        segDist(x, z, m.x - m.ux * 3, m.z - m.uz * 3, m.x + m.ux * reach, m.z + m.uz * reach, _seg);
        if (_seg.d < r + m.w + CAVE_MOUTH) return true;
      }
    }
    return false;
  }
}

// ── A town's shapes ──────────────────────────────────────────────────────────

// A lot in the world: where its middle is and how it's turned, so it can be
// built and asked about like an old place (landmarks/sites.js).
function place(town, lot) {
  const p = toWorld(town, lot.u, lot.v);
  lot.x = p.x;
  lot.z = p.z;
  lot.yaw = town.yaw + lot.r;
}

// A rectangle in a lot's own frame, as one in the town's frame round it.
export function lotRect(lot, [x0, z0, x1, z1]) {
  const c = Math.cos(lot.r);
  const n = Math.sin(lot.r);
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  for (const [lx, lz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const u = lot.u + lx * c + lz * n;
    const v = lot.v - lx * n + lz * c;
    u0 = Math.min(u0, u);
    v0 = Math.min(v0, v);
    u1 = Math.max(u1, u);
    v1 = Math.max(v1, v);
  }
  return [u0, v0, u1, v1];
}

// Where in a lot's frame its walls are: everything behind what's in front.
export const bodyOf = (lot) => [-lot.w / 2, -lot.d / 2, lot.w / 2, lot.d / 2 - lot.front];

// The kinds of lot that are open ground rather than a building with a floor.
export const OPEN = { green: true, graveyard: true, well: true, windpump: true, tower: true };

function rectsOf(town, S) {
  const street = [-town.len / 2 - 3, -town.half, town.len / 2 + 3, town.half];
  town.street = street;
  town.plan = [street];
  town.bare = [street];
  town.shape = [];
  for (const lot of town.lots) {
    town.plan.push(lotRect(lot, [-lot.w / 2, -lot.d / 2, lot.w / 2, lot.d / 2]));
    if (OPEN[lot.type]) continue;
    const body = lotRect(lot, bodyOf(lot));
    town.shape.push(body);
    if (!lot.ruin) town.bare.push(body);
  }
  if (S.clearing === 'all') {
    let [u0, v0, u1, v1] = street;
    for (const [a, b, c, d] of town.plan) {
      u0 = Math.min(u0, a);
      v0 = Math.min(v0, b);
      u1 = Math.max(u1, c);
      v1 = Math.max(v1, d);
    }
    town.clear = [[u0 - CLEAR_ROUND, v0 - CLEAR_ROUND, u1 + CLEAR_ROUND, v1 + CLEAR_ROUND]];
  } else town.clear = town.plan;
  town.box = boxOf(town, [...town.plan, ...town.clear]);
}

function boxOf(t, rects) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const p = {};
  for (const [a, b, c, d] of rects) {
    for (const [u, v] of [[a, b], [c, b], [a, d], [c, d]]) {
      toWorld(t, u, v, p);
      x0 = Math.min(x0, p.x);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x);
      z1 = Math.max(z1, p.z);
    }
  }
  return [x0, z0, x1, z1];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Which way a street runs through (x, z): along the lie of the land, so it
// keeps level and the lots either side of it don't. -> a yaw
function contour(gen, x, z) {
  const d = 12;
  const gx = gen.broadHeight(x + d, z) - gen.broadHeight(x - d, z);
  const gz = gen.broadHeight(x, z + d) - gen.broadHeight(x, z - d);
  if (Math.hypot(gx, gz) < 1e-4) return 0;
  return Math.atan2(-gx, -gz);
}

function nameOf(style, [a, b, c, d]) {
  const N = NAMES[style];
  if (style === 'western' && c < 0.25) {
    // ...or after whoever struck it rich there first
    const s = SURNAMES[Math.floor(d * SURNAMES.length)];
    return c < 0.12 ? `${s}ville` : `${s}'s Camp`;
  }
  const name = N.first[Math.floor(a * N.first.length)] + N.last[Math.floor(b * N.last.length)];
  if (style === 'village' && c < 0.18) return `Little ${name}`;
  return name;
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// The ids in a random order, those with more weight more often first.
function weightedOrder(ids, weight, rng) {
  const left = ids.map((id) => [id, weight(id)]).filter(([, w]) => w > 0);
  const out = [];
  while (left.length) {
    let total = 0;
    for (const [, w] of left) total += w;
    let r = rng() * total;
    let i = 0;
    while (i < left.length - 1 && r >= left[i][1]) r -= left[i++][1];
    out.push(left[i][0]);
    left.splice(i, 1);
  }
  return out;
}

