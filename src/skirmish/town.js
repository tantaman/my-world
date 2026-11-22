// Dry Wells: the town the match is fought in.
//
// An old caravan town of sandstone blocks behind a wall, about ninety metres
// by ninety. The Raiders come in at the south yard and the Wardens hold the
// north one; between them are three ways through the town:
//
//   the west lane   up the west wall under an arcade, in to the Cistern (B)
//   the middle      two streets into the well court, then on by the north
//                   alley (two staggered walls across it) to the Wardens'
//                   yard, or out of its sides along a passage to either site
//   the east lane   long and open, a couple of low walls and a dead truck
//                   for cover, in to the Granary (A) under its gallery
//
// and two ways between them for whoever changes their mind: the undercroft,
// a tunnel through the south-west block from the well court to the west
// lane, and a crooked alley through the south-east one to the east lane.
// The Granary has a stone floor to set the charge on, crates stacked on it,
// and a gallery up a flight of steps along its east wall; the Cistern is a
// yard with a stone tank in the middle and a wall across its south door.
//
// This is the layout only, as plain numbers: no three.js, so the tests can
// walk it, and the look (look.js), the movement (mover.js) and the bots
// (bots.js) all read the same boxes. Metres, x east, z south, y up; the town
// is its own little world round its own origin, nowhere near the forest.
//
//   BOXES    the solid things: { x0, y0, z0, x1, y1, z1, look }, `look` one
//            of ground, fence (the town wall), block (a building), wall,
//            low (a wall to crouch behind), crate, stone, step, pillar,
//            roof, truck, cart, well, palm
//   SITES    where the charge can be set: { id, name, zone: [x0, z0, x1, z1],
//            spots: where bots set it, posts: where they stand guard }
//   SPAWNS   where each side comes in: { attack: [...], defend: [...] } of
//            { x, z, yaw }
//   NODES    the way about, for the bots: { id, x, z }
//   LINKS    [a, b]: you can walk straight from one to the other, both ways

export { NAME } from './site.js';

// How far the town runs each way from its middle (the inside of its wall).
export const BOUNDS = { x0: -44, z0: -42, x1: 44, z1: 42 };

const boxes = [];
const add = (x0, y0, z0, x1, y1, z1, look) => boxes.push({ x0, y0, z0, x1, y1, z1, look });
// Something standing on the floor at y (0 unless said), h tall.
const stand = (x0, z0, x1, z1, h, look, y = 0) => add(x0, y, z0, x1, y + h, z1, look);

// ── The ground and the town wall ────────────────────────────────────────────
add(-46, -1, -44, 46, 0, 44, 'ground');
const WALL_H = 7;
stand(-46, -44, 46, -42, WALL_H, 'fence');
stand(-46, 42, 46, 44, WALL_H, 'fence');
stand(-46, -44, -44, 44, WALL_H, 'fence');
stand(44, -44, 46, 44, WALL_H, 'fence');

// ── The blocks of buildings the streets run between ─────────────────────────
// south-west, with the undercroft through it
stand(-34, -6, -12, 2, 6.5, 'block');
stand(-34, 6, -12, 28, 7.5, 'block');
add(-34, 3, 2, -12, 6.5, 6, 'roof'); // over the undercroft: 3 m of headroom
// between the two streets up from the Raiders' yard
stand(-6, 14, 6, 28, 6, 'block');
// south-east, with the crooked alley through it
stand(12, 10, 34, 28, 7, 'block');
stand(12, -6, 34, 4, 6, 'block');
stand(22, 4, 22.4, 7.5, 3.2, 'wall');
stand(27, 6.5, 27.4, 10, 3.2, 'wall');
// either side of the north alley
stand(-22, -30, -3, -12, 7, 'block');
stand(3, -30, 22, -12, 6.5, 'block');
// the two walls across the north alley, staggered
stand(-3, -23.2, 0, -22.8, 2.8, 'wall');
stand(0, -18.2, 3, -17.8, 2.8, 'wall');
// the sites' north walls, each with a way through from the Wardens' yard
stand(-44, -31, -37, -30, 5, 'wall');
stand(-32, -31, -22, -30, 5, 'wall');
stand(22, -31, 25, -30, 5, 'wall');
stand(31, -31, 44, -30, 5, 'wall');

// ── The well court ──────────────────────────────────────────────────────────
// (a stub of wall where each street comes in, so nobody sees the length of
// the town from the yard)
stand(-8.8, 13.6, -6, 14, 3, 'wall');
stand(6, 13.6, 8.8, 14, 3, 'wall');
stand(-1.4, -0.4, 1.4, 2.4, 1, 'well');
stand(-11.8, -4.5, -10, -2.7, 1.8, 'crate');
stand(2.6, 9.5, 4.2, 11.1, 0.9, 'crate');
stand(9.6, -3.5, 11.6, -0.5, 1.2, 'cart');

// ── The west lane and its arcade ────────────────────────────────────────────
for (const z of [24, 18, 12, 6, 0]) stand(-39.4, z - 0.4, -38.6, z + 0.4, 3.4, 'pillar');
add(-44, 3.4, -2, -38.6, 3.8, 26, 'roof');
stand(-35.6, 13, -34, 14.6, 0.9, 'crate');
stand(-43.8, 9, -42.2, 10.6, 1.8, 'crate');

// ── The east lane ───────────────────────────────────────────────────────────
stand(38, 12, 44, 12.5, 1.1, 'low');
stand(34, 2, 39, 2.5, 1.1, 'low');
stand(40, 18, 43, 23, 2, 'truck');

// ── The Granary (A) ─────────────────────────────────────────────────────────
const A_FLOOR = 0.45; // m the stone floor stands over the yard
stand(29, -23, 39, -14, A_FLOOR, 'stone');
stand(33, -20, 35.4, -17.6, 1.8, 'crate', A_FLOOR);
stand(30, -15.6, 31.4, -14.2, 0.9, 'crate', A_FLOOR);
stand(23, -22.5, 24.6, -20.9, 0.9, 'crate');
stand(24.6, -13.5, 25, -9.6, 2, 'wall');
// the gallery along its east wall, a parapet along its edge, and the steps up
export const GALLERY = 2.4; // m up
stand(40.5, -30, 44, -12, GALLERY, 'stone');
stand(40.5, -30, 40.8, -14, 0.9, 'low', GALLERY);
const STEPS = 6;
for (let i = 0; i < STEPS; i++) {
  const deep = 4 / STEPS;
  stand(40.5, -8 - deep * (i + 1), 44, -8 - deep * i, (GALLERY * (i + 1)) / STEPS, 'step');
}

// ── The Cistern (B) ─────────────────────────────────────────────────────────
stand(-39, -22, -35, -18, 0.9, 'stone');
stand(-32, -21, -30, -19, 1.8, 'crate');
stand(-41.5, -14.5, -40, -13, 0.9, 'crate');
stand(-40, -10.4, -34, -10, 2.4, 'wall');

// ── The two passages out of the well court ──────────────────────────────────
stand(-18.6, -7.6, -17, -6, 0.9, 'crate');
stand(17.2, -12, 18.8, -10.4, 0.9, 'crate');

// ── The yards ───────────────────────────────────────────────────────────────
stand(-12, -32, -10.4, -30.4, 1.8, 'crate');
stand(11, -33.5, 12.6, -31.9, 0.9, 'crate');
stand(-20, 28.2, -18.4, 29.8, 1.8, 'crate');
stand(17, 37, 18.6, 38.6, 0.9, 'crate');

// ── Palms, in the corners of the yards ──────────────────────────────────────
export const PALMS = [
  [-42, 40],
  [42, 40],
  [-42, -40],
  [41.5, -40.5],
  [-14, 40.5],
  [26, -40.5],
];
for (const [x, z] of PALMS) stand(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 6.5, 'palm');

export const BOXES = boxes;

// ── Where the charge can be set ─────────────────────────────────────────────
// A post is somewhere to stand guard: where, and what to watch from there.
const post = (x, z, lookX, lookZ) => ({ x, z, look: { x: lookX, z: lookZ } });
export const SITES = [
  {
    id: 'A',
    name: 'the Granary',
    zone: [28, -25, 40, -13],
    spots: [
      { x: 32, z: -21.5 },
      { x: 36.8, z: -16 },
      { x: 31.2, z: -17.4 },
    ],
    posts: [post(42.4, -20, 34, -8), post(31.3, -18.8, 24, -9), post(26, -27, 34, -12), post(37, -12.6, 39, 0), post(34, -26, 34, -14)],
  },
  {
    id: 'B',
    name: 'the Cistern',
    zone: [-42, -26, -30, -14],
    spots: [
      { x: -34, z: -23.5 },
      { x: -40.6, z: -20 },
      { x: -33.2, z: -17.4 },
    ],
    posts: [post(-33.5, -24.5, -42, -8), post(-26, -26, -24, -9), post(-42, -17, -42, -6), post(-26, -16, -22, -9), post(-41.7, -26, -34, -12)],
  },
];
export const siteById = new Map(SITES.map((s) => [s.id, s]));
// The site (x, z) is in, or null.
export function siteAt(x, z) {
  for (const s of SITES) if (x >= s.zone[0] && x <= s.zone[2] && z >= s.zone[1] && z <= s.zone[3]) return s;
  return null;
}
// Somewhere to watch the middle from, for a Warden with no site to mind.
export const MID_POSTS = [post(-1.6, -20.5, -1, -6), post(-9, -9, 0, 8), post(9, -9, 0, 8)];

// ── Where each side comes in ────────────────────────────────────────────────
// A yaw of 0 faces −z (north), as a camera does: the way you face is
// (−sin yaw, −cos yaw).
const row = (z, yaw, xs) => xs.map((x) => ({ x, z, yaw }));
export const SPAWNS = {
  attack: [...row(38, 0, [-6, -3, 0, 3, 6]), ...row(35, 0, [-4.5, -1.5, 1.5, 4.5])],
  defend: [...row(-39, Math.PI, [-6, -3, 0, 3, 6]), ...row(-36, Math.PI, [-4.5, -1.5, 1.5, 4.5])],
};
// Buying is done at home: this near (m) where your side comes in.
export const BUY_REACH = 14;

// ── The way about ───────────────────────────────────────────────────────────
const node = (id, x, z) => ({ id, x, z });
export const NODES = [
  // the Raiders' yard
  node('ry-c', 0, 35),
  node('ry-w', -22, 34),
  node('ry-e', 22, 34),
  node('ry-ww', -39, 31),
  node('ry-ee', 39, 31),
  // the two streets up to the well court
  node('st-w-s', -9, 30),
  node('st-w-n', -10.4, 15.5),
  node('st-e-s', 9, 30),
  node('st-e-n', 10.4, 15.5),
  // the well court
  node('mid-sw', -8, 8),
  node('mid-s', 0, 7.5),
  node('mid-se', 8, 9),
  node('mid-cw', -5, 0),
  node('mid-ce', 5, 0),
  node('mid-n', 0, -9),
  node('mid-nw', -9, -9),
  node('mid-ne', 9, -9),
  node('mid-tun', -10.5, 4),
  node('mid-alley', 10.5, 7),
  // the north alley, round its two walls
  node('na-1', -1.6, -18),
  node('na-2', 1.6, -23),
  node('na-n', 0, -29),
  // the Wardens' yard
  node('wy-c', 0, -36),
  node('wy-w', -18, -36),
  node('wy-e', 16, -36),
  node('wy-ww', -34.5, -34),
  node('wy-ee', 28, -34),
  // the west lane and the undercroft
  node('wl-s', -36.5, 25),
  node('wl-m', -36.5, 4),
  node('wl-n', -36.5, -3),
  node('tun-m', -23, 4),
  // the east lane and the crooked alley
  node('el-s', 39, 25),
  node('el-m', 36, 7),
  node('el-z', 41.5, 1),
  node('el-n', 39, -3.5),
  node('ea-1', 20, 8.8),
  node('ea-1b', 23.6, 8.8),
  node('ea-2b', 25.8, 5.2),
  node('ea-3', 30, 5.2),
  // the passages from the well court to the sites
  node('cw', -17, -9.6),
  node('ce', 17, -8.4),
  // the Cistern
  node('b-gate', -34.5, -28),
  node('b-n', -33.5, -24.5),
  node('b-ne', -26, -26),
  node('b-nw', -41.7, -26),
  node('b-w', -42, -17),
  node('b-c', -33.5, -14.5),
  node('b-ee', -26, -16),
  node('b-e', -24, -9),
  node('b-s', -42, -8),
  // the Granary
  node('a-gate', 28, -28),
  node('a-n', 34, -26),
  node('a-w', 23.2, -16),
  node('a-c', 31.3, -18.8),
  node('a-pe', 37.6, -18.8),
  node('a-pn', 34, -21.6),
  node('a-ps', 34, -15.2),
  node('a-s', 33, -10),
  node('a-door', 23, -9),
  node('a-se', 37.5, -8.5),
  node('a-st0', 42.2, -7.2),
  node('a-st1', 42.2, -12.6),
  node('a-gal', 42.4, -22),
];

export const LINKS = [
  // the Raiders' yard
  ['ry-c', 'ry-w'],
  ['ry-c', 'ry-e'],
  ['ry-w', 'ry-ww'],
  ['ry-e', 'ry-ee'],
  ['ry-c', 'st-w-s'],
  ['ry-c', 'st-e-s'],
  ['ry-w', 'st-w-s'],
  ['ry-e', 'st-e-s'],
  ['st-w-s', 'st-w-n'],
  ['st-e-s', 'st-e-n'],
  // the well court
  ['st-w-n', 'mid-sw'],
  ['st-e-n', 'mid-se'],
  ['mid-sw', 'mid-s'],
  ['mid-s', 'mid-se'],
  ['mid-sw', 'mid-tun'],
  ['mid-se', 'mid-alley'],
  ['mid-sw', 'mid-cw'],
  ['mid-se', 'mid-ce'],
  ['mid-cw', 'mid-nw'],
  ['mid-ce', 'mid-ne'],
  ['mid-cw', 'mid-n'],
  ['mid-ce', 'mid-n'],
  ['mid-n', 'mid-nw'],
  ['mid-n', 'mid-ne'],
  ['mid-tun', 'mid-cw'],
  ['mid-alley', 'mid-ce'],
  // the north alley
  ['mid-n', 'na-1'],
  ['na-1', 'na-2'],
  ['na-2', 'na-n'],
  ['na-n', 'wy-c'],
  // the Wardens' yard
  ['wy-c', 'wy-w'],
  ['wy-c', 'wy-e'],
  ['wy-w', 'wy-ww'],
  ['wy-e', 'wy-ee'],
  ['wy-ww', 'b-gate'],
  ['wy-ee', 'a-gate'],
  // the west lane, the undercroft
  ['ry-ww', 'wl-s'],
  ['wl-s', 'wl-m'],
  ['wl-m', 'wl-n'],
  ['wl-n', 'b-s'],
  ['wl-m', 'tun-m'],
  ['tun-m', 'mid-tun'],
  // the east lane, the crooked alley
  ['ry-ee', 'el-s'],
  ['el-s', 'el-m'],
  ['el-m', 'el-z'],
  ['el-z', 'el-n'],
  ['el-n', 'a-se'],
  ['mid-alley', 'ea-1'],
  ['ea-1', 'ea-1b'],
  ['ea-1b', 'ea-2b'],
  ['ea-2b', 'ea-3'],
  ['ea-3', 'el-m'],
  // the passages
  ['mid-nw', 'cw'],
  ['cw', 'b-e'],
  ['mid-ne', 'ce'],
  ['ce', 'a-door'],
  // the Cistern
  ['b-gate', 'b-n'],
  ['b-gate', 'b-ne'],
  ['b-gate', 'b-nw'],
  ['b-n', 'b-ne'],
  ['b-n', 'b-nw'],
  ['b-n', 'b-c'],
  ['b-nw', 'b-w'],
  ['b-w', 'b-s'],
  ['b-w', 'b-c'],
  ['b-c', 'b-e'],
  ['b-c', 'b-ee'],
  ['b-ee', 'b-ne'],
  ['b-ee', 'b-e'],
  // the Granary
  ['a-gate', 'a-n'],
  ['a-gate', 'a-w'],
  ['a-n', 'a-pn'],
  ['a-pn', 'a-c'],
  ['a-pn', 'a-pe'],
  ['a-c', 'a-ps'],
  ['a-pe', 'a-ps'],
  ['a-c', 'a-w'],
  ['a-ps', 'a-s'],
  ['a-s', 'a-door'],
  ['a-s', 'a-se'],
  ['a-w', 'a-door'],
  ['a-se', 'a-st0'],
  ['a-st0', 'a-st1'],
  ['a-st1', 'a-gal'],
];

// The top of whatever is under (x, z), no higher than y (feet height), or
// -Infinity. half: how wide the feet are (m either way).
export function floorAt(x, z, y = Infinity, half = 0) {
  let best = -Infinity;
  for (const b of BOXES) {
    if (x + half <= b.x0 || x - half >= b.x1 || z + half <= b.z0 || z - half >= b.z1) continue;
    if (b.y1 <= y + 1e-6 && b.y1 > best) best = b.y1;
  }
  return best;
}

export const nodeById = new Map(NODES.map((n) => [n.id, n]));
// How high the floor is at each node: the lowest thing to stand on there
// that isn't a roof (nothing in the town is walked on above the gallery).
for (const n of NODES) n.y = floorAt(n.x, n.z, GALLERY + 0.1);

// Who can walk to whom: id -> [{ to, d }], d the metres between them.
export const WAYS = new Map(NODES.map((n) => [n.id, []]));
for (const [a, b] of LINKS) {
  const p = nodeById.get(a);
  const q = nodeById.get(b);
  const d = Math.hypot(q.x - p.x, q.z - p.z);
  WAYS.get(a).push({ to: b, d });
  WAYS.get(b).push({ to: a, d });
}

// The node nearest (x, z) on the same floor as y, or null.
export function nearestNode(x, z, y = 0) {
  let best = null;
  let bestD = Infinity;
  for (const n of NODES) {
    if (Math.abs(n.y - y) > 1.3) continue;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

// The way from one node to another, as the ids to reach in turn (not the
// first), or null: fewest metres, each link costing `cost(a, b, d)` if one
// is given (to keep off somewhere, or go a different way from the others).
export function route(from, to, cost = null) {
  if (from === to) return [];
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const open = new Set([from]);
  while (open.size) {
    let at = null;
    for (const id of open) if (at === null || dist.get(id) < dist.get(at)) at = id;
    open.delete(at);
    if (at === to) break;
    for (const { to: next, d } of WAYS.get(at)) {
      const total = dist.get(at) + (cost ? cost(at, next, d) : d);
      if (total < (dist.get(next) ?? Infinity)) {
        dist.set(next, total);
        prev.set(next, at);
        open.add(next);
      }
    }
  }
  if (!prev.has(to)) return null;
  const out = [];
  for (let id = to; id !== from; id = prev.get(id)) out.unshift(id);
  return out;
}

// How far it is to walk from one node to another (m), or Infinity.
export function walkBetween(from, to) {
  const way = route(from, to);
  if (!way) return Infinity;
  let d = 0;
  let at = from;
  for (const id of way) {
    d += WAYS.get(at).find((w) => w.to === id).d;
    at = id;
  }
  return d;
}
