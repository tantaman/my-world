// Levelling a site: a level pad under the building, so that every footing
// comes up to one level and no ground stands above the sills.
//
// The pad is the footprint and a metre round it, on the 1 m vertex grid the
// shovel works. Its level (the grade) is a pier's height under the footings:
// the footings already in say what that is; otherwise it's where the cut and
// the fill balance, with a little more cut than fill when the soil to fill
// with has to be dug first. It has to stay within DIG.maxCut of the natural
// ground at every footing, and nothing in the way (roots, a boulder, water)
// may stop a footing reaching it; if any does, that is the trouble to report.
//
// Like plan.js this is plain arithmetic. It is handed the ground as
// functions (siteGround() makes them from the game's services) so it can be
// tested in Node.
//
//   ground = {
//     height(ix, iz)    the ground at a grid vertex now, edits and all
//     delta(ix, iz)     how far it has been dug (-) or filled (+) already
//     blocker(ix, iz)   what stops a spade there ({ what }), or null
//     water(ix, iz)     the surface of the water there, or null
//   }

import { PIER, DIG } from '../build/constants.js';
import { survey, grow } from './plan.js';

export const PAD = 1; // m of level ground round the footprint
export const TOL = 0.03; // m from grade that counts as on grade (as the shovel's prompt says)
const SILL_CLEAR = 0.08; // m: inside the footprint, ground must stay this far below the footing tops
const EARN = { more: 1.2, spare: 0.2 }; // when soil must be dug first: cut this much more than fill, plus m³
// Where a footing's ground may end up, from grade: the piers' range about PIER.first.
const BELOW = PIER.max - PIER.first;
const ABOVE = PIER.first - PIER.min;

// The pad's grid vertices: [[ix, iz], …]
export function padNodes(rect, margin = PAD) {
  const R = grow(rect, margin);
  const out = [];
  for (let iz = Math.ceil(R.z0); iz <= Math.floor(R.z1); iz++) for (let ix = Math.ceil(R.x0); ix <= Math.floor(R.x1); ix++) out.push([ix, iz]);
  return out;
}

// Everything about levelling a placed plan, from the ground as it is now.
//   y0      the footings' level, if a building has set it
//   level   the grade levelling already began to, if it did
//   built   'x,z' of footings already in
//   earn    soil must be dug before it can be filled (not creative)
// -> {
//      need     the footings can't all reach one level, or ground stands above the sills
//      level    the grade (when needed, or already begun)
//      trouble  why it can't be levelled, in words, or null
//      work     [{ ix, iz, mode: 'dig' | 'fill', dev }]  pad vertices a spade can still bring to grade
//      cut, fill   m³ still to move, roughly
//    }
export function levelling(placed, ground, { y0 = null, level = null, built = new Set(), earn = false } = {}) {
  const pending = placed.footings.filter((f) => !built.has(`${f.x},${f.z}`));
  const nodes = padNodes(placed.rect);
  const top = y0 !== null ? y0 : level !== null ? level + PIER.first : null;
  const s = survey(placed, (x, z) => ground.height(x, z), top);
  const offLevel = s.footings.some((f) => !f.ok && !built.has(`${f.x},${f.z}`));
  const r = placed.rect;
  const high = nodes.some(([ix, iz]) => ix >= r.x0 && ix <= r.x1 && iz >= r.z0 && iz <= r.z1 && !ground.blocker(ix, iz) && ground.height(ix, iz) > s.y0 - SILL_CLEAR);
  const need = pending.length > 0 && (offLevel || high);
  if (!need && level === null) return { need: false, level: null, trouble: null, work: [], cut: 0, fill: 0 };

  // the grade
  let grade = y0 !== null ? y0 - PIER.first : level;
  if (grade === null) {
    const hs = nodes.filter(([ix, iz]) => !ground.blocker(ix, iz)).map(([ix, iz]) => ground.height(ix, iz));
    grade = balance(hs, earn);
    // ...within reach of every footing still to go in
    let lo = -Infinity;
    let hi = Infinity;
    for (const f of pending) {
      const [a, b] = reach(ground, f.x, f.z);
      lo = Math.max(lo, a - ABOVE);
      hi = Math.min(hi, b + BELOW);
    }
    if (lo <= hi) grade = Math.min(hi, Math.max(lo, grade));
  }

  // can every footing get there?
  let trouble = null;
  for (const f of pending) {
    const [a, b] = reach(ground, f.x, f.z);
    if (a <= grade + ABOVE && b >= grade - BELOW) {
      const w = ground.water(f.x, f.z);
      if (w === null || w - grade <= -0.05) continue;
      trouble = 'levelled, a footing would be under water';
      break;
    }
    const o = ground.blocker(f.x, f.z);
    trouble = o ? `${o.what} is in the way of levelling for a footing: clear it first` : `too steep to level here: a footing would need more than ${DIG.maxCut} m of cut or fill`;
    break;
  }

  const work = [];
  let cut = 0;
  let fill = 0;
  for (const [ix, iz] of nodes) {
    if (ground.blocker(ix, iz)) continue;
    const h = ground.height(ix, iz);
    const d = ground.delta(ix, iz);
    if (h > grade + TOL && d > -DIG.maxCut + 0.005) work.push({ ix, iz, mode: 'dig', dev: h - grade });
    else if (h < grade - TOL && d < DIG.maxCut - 0.005) work.push({ ix, iz, mode: 'fill', dev: grade - h });
    else continue;
    if (h > grade) cut += h - grade;
    else fill += grade - h;
  }
  return { need, level: grade, trouble, work, cut, fill };
}

// Where a spade can take the ground at a vertex: [lowest, highest].
function reach(ground, ix, iz) {
  const h = ground.height(ix, iz);
  if (ground.blocker(ix, iz)) return [h, h];
  const natural = h - ground.delta(ix, iz);
  return [Math.min(h, natural - DIG.maxCut), Math.max(h, natural + DIG.maxCut)];
}

// The level at which the cut pays for the fill (1 m² a vertex). With soil
// to earn, a little lower, so there's more cut than fill.
export function balance(hs, earn = false) {
  if (!hs.length) return 0;
  let lo = Math.min(...hs);
  let hi = Math.max(...hs);
  const short = (g) => {
    let cut = 0;
    let fill = 0;
    for (const h of hs) {
      if (h > g) cut += h - g;
      else fill += g - h;
    }
    return earn ? cut - (fill * EARN.more + EARN.spare) : cut - fill;
  };
  if (short(lo) <= 0) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (short(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Which vertex to work next: cut before fill (the fill comes out of the
// cut), the furthest off grade first, the nearer ones a little sooner.
// skip: 'ix,iz' of vertices that wouldn't move. -> a vertex of work, or null
export function nextSpot(work, near, skip = new Set()) {
  const open = work.filter((v) => !skip.has(`${v.ix},${v.iz}`));
  const digs = open.filter((v) => v.mode === 'dig');
  const pool = digs.length ? digs : open;
  let best = null;
  let score = -Infinity;
  for (const v of pool) {
    const s = v.dev - 0.08 * Math.hypot(v.ix - near.x, v.iz - near.z);
    if (s > score) {
      score = s;
      best = v;
    }
  }
  return best;
}

// The ground of the game, as levelling() wants it, for the pad round `rect`.
// terrain: TerrainEdits · obstacles: Obstacles · chunks: the ChunkManager
export function siteGround({ terrain, obstacles, chunks }, rect) {
  const R = grow(rect, PAD);
  const cx = (R.x0 + R.x1) / 2;
  const cz = (R.z0 + R.z1) / 2;
  const near = obstacles.near(cx, cz, Math.hypot(R.x1 - cx, R.z1 - cz) + 1).filter((o) => o.dig);
  const wet = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
  return {
    height: (ix, iz) => terrain.vertexHeight(ix, iz),
    delta: (ix, iz) => terrain.delta(ix, iz),
    blocker: (ix, iz) => near.find((o) => (ix - o.x) ** 2 + (iz - o.z) ** 2 < o.dig * o.dig) || null,
    water: (ix, iz) => (chunks.waterAt(ix, iz, wet) ? wet.level : null),
  };
}
