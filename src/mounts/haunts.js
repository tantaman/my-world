// Where the wild mounts live, in a world grown from a seed:
//
//   horse   out in the widest meadow within a long walk of the path's start
//   turtle  in a lake (or failing one, a good big pond) not too far off
//   eagle   on a high, open summit, a good way off
//
// and the hints that lead you there: a wide circle on the map to start with,
// a smaller one once you are in it, and the animal itself once you've seen
// it. The circles are off-centre, so the middle of one is not the answer.
//
// Pure and deterministic, like the land (no three.js): the same seed always
// puts them in the same places, so the hints point the same way on every
// visit, and everyone in a shared world goes looking in the same meadow.

import { mulberry32, hash2i } from '../noise.js';
import { NET, basinRadius } from '../world/drainage.js';

const TAU = Math.PI * 2;

export const KINDS = ['horse', 'turtle', 'eagle'];

// How far (m) from where the path starts each one may live: [nearest, furthest].
export const RANGE = {
  horse: [150, 450],
  turtle: [120, 900],
  eagle: [300, 900],
};

// How far (m) each roams from the middle of its haunt.
const ROAM = { horse: 28, eagle: 4 };

// The horse's meadow: candidates this far apart (m), judged by how open the
// land is at the spot and in a ring this far round it (m).
const MEADOW_STEP = 24;
const MEADOW_RING = 22;
// ...and it wants dry ground (m from the nearest water) that isn't steep (m
// of fall across it).
const MEADOW_DRY = 18;
const MEADOW_FALL = 3.5;
// Anything structures have cleared is somebody's: keep this far (m) off a pad.
const PAD_CLEAR = 30;
// A pond smaller than this (m across, at its narrowest) is too small to swim in.
const POND_MIN_R = 8;
// The eagle's summit: candidates this far apart (m), then climbed to the top.
const SUMMIT_STEP = 36;
const CLIMB_STEP = 5;

// ── Where each one lives ────────────────────────────────────────────────────
// gen: the WorldGen; start: { x, z } where the path starts.
// -> { kind, x, z, r, ... } (the turtle's also has its `lake`), or null.
// Each also says how far it is from the start (d).
export function findHaunt(kind, gen, start) {
  let h = null;
  if (kind === 'horse') h = meadow(gen, start, RANGE.horse);
  if (kind === 'turtle') h = lake(gen, start, RANGE.turtle) || lake(gen, start, [RANGE.turtle[0], RANGE.turtle[1] * 2]);
  if (kind === 'eagle') h = summit(gen, start, RANGE.eagle);
  if (h) h.d = Math.hypot(h.x - start.x, h.z - start.z);
  return h;
}

export function findHaunts(gen, start) {
  const out = {};
  for (const kind of KINDS) {
    const h = findHaunt(kind, gen, start);
    if (h) out[kind] = h;
  }
  return out;
}

// Points on a square grid in a ring round (x0, z0).
function* ring(x0, z0, [near, far], step) {
  for (let z = -far; z <= far; z += step) {
    for (let x = -far; x <= far; x += step) {
      const d = Math.hypot(x, z);
      if (d >= near && d <= far) yield { x: x0 + x, z: z0 + z, d };
    }
  }
}

function meadow(gen, start, range) {
  const found = [];
  for (const p of ring(start.x, start.z, range, MEADOW_STEP)) {
    let open = 1 - gen.forest(p.x, p.z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      open += 1 - gen.forest(p.x + Math.cos(a) * MEADOW_RING, p.z + Math.sin(a) * MEADOW_RING);
    }
    // the most open, and of two as open, the nearer
    found.push({ x: p.x, z: p.z, score: open / 7 - (p.d / range[1]) * 0.15 });
  }
  found.sort((a, b) => b.score - a.score);
  for (const c of found.slice(0, 60)) {
    if (gen.padClearance(c.x, c.z) < PAD_CLEAR) continue;
    gen.height(c.x, c.z);
    if (gen.water.edge < MEADOW_DRY) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const h = gen.height(c.x + Math.cos(a) * 10, c.z + Math.sin(a) * 10);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    if (hi - lo > MEADOW_FALL) continue;
    return { kind: 'horse', x: c.x, z: c.z, r: ROAM.horse };
  }
  const c = found[0];
  return c ? { kind: 'horse', x: c.x, z: c.z, r: ROAM.horse } : null;
}

function lake(gen, start, [near, far]) {
  const net = gen.water.net;
  const C = NET.cell;
  let best = null;
  for (let j = Math.floor((start.z - far) / C); j <= Math.floor((start.z + far) / C); j++) {
    for (let i = Math.floor((start.x - far) / C); i <= Math.floor((start.x + far) / C); i++) {
      const n = net.node(i, j);
      if (net.down(n)) continue;
      const b = net.basin(n);
      if (!b || b.R0 < POND_MIN_R) continue;
      const d = Math.hypot(b.x - start.x, b.z - start.z);
      if (d < near || d > far) continue;
      // a lake over a pond, a big one over a small one, a near one over a far one
      const score = (b.kind === 'lake' ? 1.5 : 0) + b.R0 / 40 - d / far;
      if (!best || score > best.score) best = { b, score };
    }
  }
  if (!best) return null;
  const b = best.b;
  return { kind: 'turtle', x: b.x, z: b.z, r: b.R0 * 0.7, lake: b };
}

function summit(gen, start, range) {
  let best = null;
  for (const p of ring(start.x, start.z, range, SUMMIT_STEP)) {
    if (gen.padClearance(p.x, p.z) < PAD_CLEAR) continue;
    // high, and better bare than wooded, and not too far
    const score = gen.broadHeight(p.x, p.z, 30) + (1 - gen.forest(p.x, p.z)) * 12 - p.d * 0.01;
    if (!best || score > best.score) best = { x: p.x, z: p.z, score };
  }
  if (!best) return null;
  // then up to the very top
  let { x, z } = best;
  let h = gen.height(x, z);
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const nx = x + Math.cos(a) * CLIMB_STEP;
      const nz = z + Math.sin(a) * CLIMB_STEP;
      const nh = gen.height(nx, nz);
      if (nh > h + 0.01) {
        x = nx;
        z = nz;
        h = nh;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { kind: 'eagle', x, z, r: ROAM.eagle };
}

// A spot on a lake's shore, just out of the water, facing angle `th`
// (radians, from the lake's middle). -> { x, z }
export function shore(lake, th, out = 1.5) {
  const r = basinRadius(lake, th) + out;
  return { x: lake.x + Math.cos(th) * r, z: lake.z + Math.sin(th) * r };
}

// ── Hints ───────────────────────────────────────────────────────────────────
// What you know of where one is, as it narrows down:
//   0  nothing yet
//   1  a rumour: a wide circle on the map
//   2  signs of it: you are in that circle, and a smaller one shows
//   3  seen: it's on the map where it is
export const STAGE = { NONE: 0, RUMOUR: 1, SIGNS: 2, SEEN: 3 };
// Each circle's radius (m), and how far off-centre the haunt may be in it
// (as a fraction of the radius). The first is smaller for a haunt near the
// start (`near` of the way there, but no less than `min`), so you don't
// start out already in it.
export const HINTS = { 1: { r: 170, off: 0.6, near: 0.4, min: 60 }, 2: { r: 55, off: 0.55 } };

// The circle to look in at a stage of knowing, or null at stages 0 and 3.
// -> { x, z, r }, the same every time for the same seed.
export function hintArea(haunt, stage, seed) {
  const H = HINTS[stage];
  if (!H || !haunt) return null;
  const wide = Math.min(HINTS[1].r, Math.max(HINTS[1].min, (haunt.d ?? Infinity) * HINTS[1].near));
  const r = stage === 1 ? wide : Math.min(H.r, wide * 0.6);
  const rng = mulberry32(hash2i(stage, KINDS.indexOf(haunt.kind) + 1, (seed ^ 0x6d6f756e) >>> 0));
  const a = rng() * TAU;
  const d = r * H.off * Math.sqrt(rng());
  return { x: haunt.x + Math.cos(a) * d, z: haunt.z + Math.sin(a) * d, r };
}

// How far and which way from (x, z) to (tx, tz), in words: "about 300 m to
// the north-east". North is -z, as on the map.
const WAYS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function bearing(x, z, tx, tz) {
  const dx = tx - x;
  const dz = tz - z;
  const d = Math.hypot(dx, dz);
  const a = Math.atan2(dx, -dz);
  const way = WAYS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  const round = d < 200 ? 10 : 50;
  return { d, way, words: `about ${Math.max(round, Math.round(d / round) * round)} m to the ${way}` };
}
