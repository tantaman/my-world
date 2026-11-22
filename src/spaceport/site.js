// Where the launch sites are.
//
// Skyhook is a few hundred metres from where people first arrive: far
// enough out of the clearing round the start that nobody's cabin is under
// it, near enough to find on a first walk. Where exactly is grown from the
// seed and the land, like the old places (landmarks/sites.js): the flattest
// dry ground in a ring round the start, a little nearer winning over a
// little flatter, so everyone in a world finds it in the same place and
// nothing about it is saved.
//
// The rest are few and far between (LaunchSites, below): the world is cut
// into FAR.cell squares, and some of them have one, each with a name and its
// own colours, looked for the same way round a spot in its square chosen from
// the seed. None is near the start, where Skyhook is, nor near a real place,
// where the airfields are.
//
// Nothing about the land changes for it. The pad is a slab of concrete with
// sloping sides, set on the ground as it is: its top a little over the
// highest corner, its skirt running down to the lowest. The plants under it
// are hidden as it comes into view, as a town's are.
//
// No three.js in here: the tests read it.
//
// A site:
//   id      'spaceport:<x>:<z>': a place on the map
//   x, z    the middle of the pad; yaw, which way its front (+z) faces:
//           towards the start, where people come from
//   top     the height of the top of the pad
//   low     the lowest ground under its skirt
//   plan    [[x0, z0, x1, z1]]: the pad's top in its own frame (landmarks/sites.js's
//           toWorld, onPlan); cleared, the same and its sloping sides
//   box     [x0, z0, x1, z1] in the world, round the pad and its skirt
//   name    what it's called; livery, its colours ({ tower, band }: 0xRRGGBB;
//           Skyhook has none, and its own)
//   seed    for anything else that differs from one to the next

import { samplesNear, CELL as LINE_CELL } from '../railway/lines.js';
import { mulberry32, hash2i } from '../noise.js';

export const PAD = 9; // m from the middle of the pad to its edge (18 m square)
export const SKIRT = 2.2; // m the sloping sides run out past the top's edge
export const PAD_UP = 0.35; // m the top stands over the highest ground under it
// Where it may be: this far from the start (m), the nearest ring first.
const RING = [190, 430];
const STEP = 22; // m between the spots looked at, round a ring and between rings
const FLAT_MOST = 2.6; // m the ground may rise across the pad and its sides
const DRY = 18; // m from the middle of the pad to the nearest water, at the least
const NEARER = 0.004; // m of rise a metre nearer the start is worth
const CLEAR = 24; // m round the pad kept clear of anything else grown from the seed

// The rocket stands in the middle of the pad; the tower beside it on the
// back (−z), so the rocket's door faces the way people come.
export const ROCKET_AT = { x: 0, z: 0 };
export const TOWER_AT = { x: 0, z: -4.6 };
// Where a capsule coming home comes down: on the pad, off to one side.
export const LANDING_AT = { x: 5.2, z: 4.4 };

export const HOME_NAME = 'Skyhook launch site';

// gen: the WorldGen (height(x, z), water.edge after it). start: { x, z }.
// keepOff(x0, z0, x1, z1): whether that square is somewhere it may not be
// (a hike, an old place, a town, a cave's mouth, a railway).
// -> Skyhook, or null where there's nowhere for it.
export function findSite(gen, start, keepOff = () => false) {
  const found = finish(flats(gen, start, RING, STEP));
  const best = choose(found, keepOff);
  if (!best) return null;
  const yaw = Math.atan2(start.x - best.x, start.z - best.z);
  return siteAt(best, yaw, `spaceport:${Math.round(best.x)}:${Math.round(best.z)}`, { name: HOME_NAME, livery: null, seed: 0 });
}

// Every spot flat and dry enough in rings round `at`, from r0 out to r1,
// best first once sorted. A generator, yielding now and then, so a search
// far out can be run a little at a time.
function* flats(gen, at, [r0, r1], step) {
  const found = [];
  let looked = 0;
  for (let r = r0; r <= r1; r += step) {
    const n = Math.max(12, Math.round((Math.PI * 2 * r) / step));
    const turn = r * 0.618; // each ring starts somewhere else round, so the spots don't line up
    for (let k = 0; k < n; k++) {
      if (++looked % YIELD_EVERY === 0) yield;
      const a = turn + (k / n) * Math.PI * 2;
      const x = at.x + Math.cos(a) * r;
      const z = at.z + Math.sin(a) * r;
      const mid = gen.height(x, z);
      if (gen.water.edge < DRY) continue;
      // a quick look at the corners first, and round its sides only if it's worth it
      let lo = mid;
      let hi = mid;
      for (const [u, v] of CORNERS) {
        const h = gen.height(x + u * PAD, z + v * PAD);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > FLAT_MOST) continue;
      for (const [u, v] of EDGES) {
        const h = gen.height(x + u * (PAD + SKIRT), z + v * (PAD + SKIRT));
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > FLAT_MOST) continue;
      found.push({ x, z, lo, hi, score: hi - lo + r * NEARER });
    }
  }
  return found;
}
const YIELD_EVERY = 48; // spots looked at between yields

function finish(run) {
  let r;
  do r = run.next();
  while (!r.done);
  return r.value;
}

// The best of them that nothing else is in the way of (asked last, and of
// as few as can be: it can be dear).
const REACH = PAD + SKIRT + CLEAR;
function choose(found, keepOff) {
  found.sort((a, b) => a.score - b.score);
  return found.find(({ x, z }) => !keepOff(x - REACH, z - REACH, x + REACH, z + REACH)) || null;
}

function siteAt(best, yaw, id, more) {
  const { x, z } = best;
  const out = PAD + SKIRT;
  // (the box is square to the world, round the pad however it's turned)
  const e = out * Math.SQRT2;
  return {
    id,
    x,
    z,
    yaw,
    top: best.hi + PAD_UP,
    low: best.lo,
    plan: [[-PAD, -PAD, PAD, PAD]],
    cleared: [[-out, -out, out, out]],
    box: [x - e, z - e, x + e, z + e],
    ...more,
  };
}

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const EDGES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

// What the launch site keeps clear of, all of it there first: the land of a
// real place (world/landforms.js), the old places (landmarks/sites.js),
// towns (towns/towns.js), the mouths of caves (caves/caves.js) and the
// railway (railway/lines.js). -> keepOff for findSite. Its ready(x0, z0, x1,
// z1) says whether the railway there has been surveyed, and asks for it if
// not, so a search far out can wait for it rather than stall.
const MOUTH_CLEAR = 30; // m from a cave's mouth
export function clearOf({ landforms, sites, towns, caves, lines }) {
  const keepOff = (x0, z0, x1, z1) => {
    if (landforms.reaches(x0, z0, x1, z1)) return true;
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
      samplesNear(line, cx, cz, (x1 - x0) / 2, () => (near = true));
      if (near) return true;
    }
    return false;
  };
  keepOff.ready = (x0, z0, x1, z1) => {
    let known = true;
    for (let j = Math.floor(z0 / LINE_CELL); j <= Math.floor(z1 / LINE_CELL); j++) {
      for (let i = Math.floor(x0 / LINE_CELL); i <= Math.floor(x1 / LINE_CELL); i++) if (lines.peek(i, j) === undefined) known = false;
    }
    return known;
  };
  return keepOff;
}

// ── Further out ──────────────────────────────────────────────────────────────

export const FAR = {
  cell: 30000, // m, the side of a square
  chance: 0.45, // that a square has one, if the land will take it
  inset: 0.2, // the spot it's looked for round keeps this fraction of the square in from its edges
  ring: [40, 1500], // m round that spot it's looked for, nearest first
  step: 50, // m between the spots looked at, round a ring and between rings
  start: 12000, // m the spot keeps from the start, where Skyhook is
  away: 14000, // m it keeps from a real place's reach, where the airfields are
};
// The furthest a far site's pad reaches from its spot.
export const FAR_REACH = FAR.ring[1] + (PAD + SKIRT) * Math.SQRT2;
const FAR_SALT = 0x5ca1e;
export const FAR_NAMES = ['Farpoint', 'Halcyon', 'Meridian', 'Kestrel', 'Polaris', 'Vantage', 'Lodestar', 'Zenith', 'Aurora', 'Perigee', 'Gannet', 'Cirrus', 'Equinox', 'Corona', 'Tern Point', 'Bellwether', 'Apogee', 'Solstice', 'Nimbus', 'Osprey', 'Sextant', 'Skylark', 'Curlew', 'Beacon Hill', 'Longreach'];
const LIVERIES = [
  { tower: 0x2f6db5, band: 0x1f3d6b }, // blue
  { tower: 0xe0a72e, band: 0x3a3836 }, // yellow
  { tower: 0x4f7d3a, band: 0x24331d }, // green
  { tower: 0xd8d4cc, band: 0x9b2c22 }, // white, red bands
  { tower: 0x6b4a8c, band: 0x2b2238 }, // purple
  { tower: 0xb8432d, band: 0xb8432d }, // red, red bands
];

// What square (i, j) is to have, from the seed alone: { i, j, x, z, name,
// livery, yaw, seed }, the spot it's looked for round; or null for none.
export function farSpot(seed, i, j) {
  // (offset, because hash2i gives (x, z) and (-x, -z) the same hash when
  // both are odd, and the squares either side of the middle would match)
  const rng = mulberry32(hash2i(i + 7919, j + 104729, (seed ^ FAR_SALT) >>> 0));
  if (rng() > FAR.chance) return null;
  // drawn first, so that what the search finds can't change them; the name
  // goes round on a lattice (i + 5j, of 25), so no two squares within four
  // of each other either way share one
  const n = FAR_NAMES.length;
  const name = `${FAR_NAMES[(((i + j * 5 + (seed % n)) % n) + n) % n]} launch site`;
  const livery = LIVERIES[Math.floor(rng() * LIVERIES.length)];
  const yaw = rng() * Math.PI * 2;
  const mine = Math.floor(rng() * 1e9);
  const x = (i + FAR.inset + rng() * (1 - 2 * FAR.inset)) * FAR.cell;
  const z = (j + FAR.inset + rng() * (1 - 2 * FAR.inset)) * FAR.cell;
  return { i, j, x, z, name, livery, yaw, seed: mine };
}

// The launch site round a spot, or null: a generator, yielding now and then,
// and, while patient() says it may, until the railway it keeps clear of has
// been surveyed (keepOff.ready) rather than survey it there and then.
export function* farSite(gen, spot, keepOff = () => false, patient = () => false) {
  const found = yield* flats(gen, spot, FAR.ring, FAR.step);
  const r = FAR_REACH + CLEAR;
  while (patient() && keepOff.ready && !keepOff.ready(spot.x - r, spot.z - r, spot.x + r, spot.z + r)) yield;
  const best = choose(found, keepOff);
  if (!best) return null;
  return siteAt(best, spot.yaw, `spaceport:far:${spot.i}:${spot.j}`, { name: spot.name, livery: spot.livery, seed: spot.seed });
}

// Skyhook and the rest. Squares are looked over the first time they're
// asked about, outright (cell), or a little at a time (peek, then pump).
//   start      where people first arrive
//   home       Skyhook (findSite), or null
//   keepOff    as findSite's (clearOf)
//   away(x0, z0, x1, z1)   somewhere none may be near: real places
export class LaunchSites {
  constructor(gen, { start, home = null, keepOff = () => false, away = () => false }) {
    this.gen = gen;
    this.start = start;
    this.home = home;
    this.keepOff = keepOff;
    this.away = away;
    this.cells = new Map(); // "i:j" -> site or null
    this.growing = new Map(); // "i:j" -> a search under way
    this.queue = new Set(); // squares asked about and not yet looked over
    this.patient = true; // a search may wait for the railway (not when one's wanted outright)
  }

  // The spot square (i, j) is looked for round, or null if it has none.
  spot(i, j) {
    const s = farSpot(this.gen.seed, i, j);
    if (!s) return null;
    if (Math.hypot(s.x - this.start.x, s.z - this.start.z) < FAR.start) return null;
    const r = FAR_REACH + FAR.away;
    return this.away(s.x - r, s.z - r, s.x + r, s.z + r) ? null : s;
  }

  // The launch site in square (i, j), or null; looked for now if it hasn't been.
  cell(i, j) {
    const k = `${i}:${j}`;
    const known = this.cells.get(k);
    if (known !== undefined) return known;
    const run = this.growing.get(k) || this._grow(i, j);
    this.patient = false;
    try {
      return this._done(k, finish(run));
    } finally {
      this.patient = true;
    }
  }

  // ...or undefined if it hasn't been, and it's queued for pump().
  peek(i, j) {
    const k = `${i}:${j}`;
    const known = this.cells.get(k);
    if (known !== undefined) return known;
    if (!this.spot(i, j)) return this._done(k, null);
    this.queue.add(k);
    return undefined;
  }

  // Look over queued squares for up to `ms` milliseconds. -> how many are left.
  pump(ms) {
    const t0 = performance.now();
    for (const k of this.queue) {
      let run = this.growing.get(k);
      if (!run) {
        const [i, j] = k.split(':').map(Number);
        this.growing.set(k, (run = this._grow(i, j)));
      }
      for (;;) {
        const r = run.next();
        if (r.done) {
          this._done(k, r.value);
          break;
        }
        if (performance.now() - t0 > ms) return this.queue.size;
      }
    }
    return this.queue.size;
  }

  // Ask for the squares whose sites could be within r of (x, z) to be looked
  // over in the background.
  prefetch(x, z, r) {
    this._squares(x - r, z - r, x + r, z + r, (i, j) => this.peek(i, j));
  }

  // Launch sites whose box overlaps a rectangle of the world, Skyhook among
  // them. With wait = false, only those already found.
  within(x0, z0, x1, z1, wait = true) {
    const out = [];
    const overlaps = (s) => s && s.box[0] <= x1 && s.box[2] >= x0 && s.box[1] <= z1 && s.box[3] >= z0;
    if (overlaps(this.home)) out.push(this.home);
    this._squares(x0, z0, x1, z1, (i, j) => {
      const s = wait ? this.cell(i, j) : this.cells.get(`${i}:${j}`);
      if (overlaps(s)) out.push(s);
    });
    return out;
  }

  // The launch site with this id, or null.
  byId(id) {
    if (this.home && id === this.home.id) return this.home;
    const m = /^spaceport:far:(-?\d+):(-?\d+)$/.exec(String(id));
    const s = m && this.cell(Number(m[1]), Number(m[2]));
    return s && s.id === id ? s : null;
  }

  // The squares with a spot whose search could reach the rectangle.
  _squares(x0, z0, x1, z1, fn) {
    const C = FAR.cell;
    for (let j = Math.floor((z0 - FAR_REACH) / C); j <= Math.floor((z1 + FAR_REACH) / C); j++) {
      for (let i = Math.floor((x0 - FAR_REACH) / C); i <= Math.floor((x1 + FAR_REACH) / C); i++) {
        const s = this.spot(i, j);
        if (s && s.x + FAR_REACH >= x0 && s.x - FAR_REACH <= x1 && s.z + FAR_REACH >= z0 && s.z - FAR_REACH <= z1) fn(i, j);
      }
    }
  }

  *_grow(i, j) {
    const spot = this.spot(i, j);
    return spot ? yield* farSite(this.gen, spot, this.keepOff, () => this.patient) : null;
  }

  _done(k, site) {
    this.growing.delete(k);
    this.queue.delete(k);
    this.cells.set(k, site);
    return site;
  }
}
