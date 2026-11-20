// Gathering for a blueprint: what the rest of a plan still takes, and where
// round the site to get it. The foreman (foreman.js) does the work with the
// tools' own swings: it fells and bucks trees for logs, hews logs into
// timber, picks up stones, and digs soil to level with.
//
// Like plan.js this is plain arithmetic, handed what is about (trees,
// stones) as plain lists, so it can be tested in Node.

import { ROOF } from '../build/constants.js';
import { remaining, grow, inside } from './plan.js';
import { PAD } from './grade.js';

export const RANGE = 40; // m from the middle of the site the foreman goes for wood and stone
export const CLEAR = 3; // m round the levelled pad left alone: no felling there, no borrow pits
const FELL_FROM = 1.1; // m from the bark to stand and swing at a standing tree
const BUCK_OFF = 1.6; // m to the side of a felled trunk to stand and swing at it
const NEAR_FOOT = 2.5; // m up a felled trunk, at most, to swing at it
const BORROW_EVERY = 2; // m between the spots soil is dug from, round the site

export const middle = (rect) => ({ x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// What the rest of the plan takes: { stone, log, timber } (stones, metres).
// b: the site's building, or null.
export function stillNeeded(placed, b) {
  const left = remaining(placed, b);
  const out = { stone: left.footings.length * 2, log: 0, timber: 0 };
  for (const L of left.logs) out[L.kind] += L.s1 - L.s0;
  for (const r of left.roofs) out.timber += Math.ceil((r.x1 - r.x0) * (r.z1 - r.z0) * ROOF.cost);
  return out;
}

// Which standing tree to fell. trees: [{ x, z, r: trunk radius, meters: of
// log in it }]. Within RANGE of the site and clear of it, the most wood for
// the walk from `near`. -> one of trees, or null.
export function pickTree(trees, rect, near) {
  const keep = grow(rect, PAD + CLEAR);
  const c = middle(rect);
  let best = null;
  let score = -Infinity;
  for (const t of trees) {
    if (inside(t, keep) || dist(t, c) > RANGE) continue;
    const s = t.meters / (dist(t, near) + 8);
    if (s > score) {
      score = s;
      best = t;
    }
  }
  return best;
}

// Where to stand to fell a tree: between it and the site, so that it falls
// away from the site (a tree falls away from whoever cuts it).
export function fellingSpot(tree, rect) {
  const c = middle(rect);
  const d = dist(tree, c) || 1;
  const k = tree.r + FELL_FROM;
  return { x: tree.x + ((c.x - tree.x) / d) * k, z: tree.z + ((c.z - tree.z) / d) * k };
}

// Where to work a felled trunk lying from (x, z) along (dx, dz) (flat, unit
// length) for `length` metres: a point near its foot to swing at, and where
// to stand, beside it on the side nearer `near`. -> { work, stand }
export function trunkSpot(x, z, dx, dz, length, near) {
  const along = Math.max(0.5, Math.min(NEAR_FOOT, length * 0.3));
  const work = { x: x + dx * along, z: z + dz * along };
  let px = -dz;
  let pz = dx;
  if ((near.x - work.x) * px + (near.z - work.z) * pz < 0) {
    px = -px;
    pz = -pz;
  }
  return { work, stand: { x: work.x + px * BUCK_OFF, z: work.z + pz * BUCK_OFF } };
}

// Which stone to pick up: the nearest to `near` within RANGE of the site.
// stones: [{ x, z }]. -> one of them, or null.
export function pickStone(stones, rect, near) {
  const c = middle(rect);
  let best = null;
  for (const s of stones) {
    if (dist(s, c) > RANGE) continue;
    if (!best || dist(s, near) < dist(best, near)) best = s;
  }
  return best;
}

// Where soil can be dug: spots round the site, clear of the levelled pad,
// nearest `near` first. -> [{ x, z }]
export function borrowSpots(rect, near) {
  const R = grow(rect, PAD + CLEAR);
  const out = [];
  for (let x = R.x0; x <= R.x1; x += BORROW_EVERY) out.push({ x, z: R.z0 }, { x, z: R.z1 });
  for (let z = R.z0 + BORROW_EVERY; z < R.z1; z += BORROW_EVERY) out.push({ x: R.x0, z }, { x: R.x1, z });
  return out.sort((a, b) => dist(a, near) - dist(b, near));
}
