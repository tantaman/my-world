// Washington's streets as the city surveyed them from the air (codec.js):
// every road, alley, drive and car park, and every sidewalk and traffic
// island, each the shape it is, laid on the ground (cut into triangles small
// enough to lie on it), the sidewalks and islands up on a curb; and its
// bridges, a deck from one bank to the other with a parapet along each side
// and piers under it, the roads on it laid on the deck.
//
// buildPaving(tile, { ground, offset, seed }) is a generator (a step every
// few dozen polygons) that returns { paving: Batch, bridges: Batch, solids,
// decks }:
//   ground(x, z)  the height of the ground (tile metres; game heights)
//   offset        added to every height the tile keeps (the land's)
// solids, for world/solids.js, are the decks to walk over (tile metres);
// decks, each deck's line and heights, for deckAt.

import * as THREE from 'three';
import { Batch } from './batch.js';
import { SURF } from '../build/surfaces.js';
import { inside, area, edgeDistance } from '../core/rings.js';

// What each kind of paving looks like: its colour, its surface, and how far
// over the ground it's laid (m): a road's, a little; a sidewalk's, a curb's
// height; a curb drops to the road's.
export const LOOKS = {
  road: { col: 0x494b4d, surf: SURF.asphalt, lift: 0.09 },
  alley: { col: 0x625f5a, surf: SURF.asphalt, lift: 0.095 },
  drive: { col: 0x515052, surf: SURF.asphalt, lift: 0.10 },
  parking: { col: 0x555456, surf: SURF.asphalt, lift: 0.095 },
  island: { col: 0x8c8880, surf: SURF.concrete, lift: 0.17, curb: true },
  sidewalk: { col: 0xaba69d, surf: SURF.concrete, lift: 0.17, curb: true },
  stairs: { col: 0x8e8a82, surf: SURF.stone, lift: 0.16 },
  bridge: { col: 0x7a7874, surf: SURF.clay, lift: 0.02 },
  footbridge: { col: 0x7a7874, surf: SURF.clay, lift: 0.02 },
};
// …and a sidewalk of brick, as so many of Washington's are, this often (but
// not a plaza: a polygon of sidewalk bigger than `most` m²)
const BRICK = { col: 0x8a4c3e, surf: SURF.stone, share: 0.3, most: 3000 };
const ROAD_LIFT = LOOKS.road.lift;
// m: the longest side a triangle laid on the ground is left with
const FINE = 6;
// A bridge: how deep its deck (m), how high the parapet over it, how far
// apart its piers and how wide, and how much room there must be under it
// (m) for a pier to stand; and its deck cut into pieces this long (m) to
// stand on, each as high as it is there.
const DECK = { deep: 1.2, parapet: 0.9, wall: 0.3, pier: 36, pierWide: 1.6, under: 3, piece: 20 };
const DECK_COL = 0x8c8a84;
const PER_STEP = 30; // polygons laid between one step and the next

const _c = new THREE.Color();
const hash = (n) => {
  let h = Math.imul(n ^ 0x2545f491, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

// Where a deck is at (x, z) (tile metres), of those in `decks`: its height
// there (game m), or NaN off them all.
export function deckAt(decks, x, z) {
  let y = NaN;
  for (const d of decks) {
    if (x < d.box[0] || x > d.box[2] || z < d.box[1] || z > d.box[3]) continue;
    if (!inside(d.outline, x, z)) continue;
    const [ax, az, ay] = d.a;
    const [bx, bz, by] = d.b;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    const h = ay + (by - ay) * t;
    if (!(h <= y)) y = h;
  }
  return y;
}

export function* buildPaving(tile, { ground, offset, seed = 0, detail = true, ownsDeck = (x, z) => true }) {
  const paving = new Batch(detail ? 1 << 15 : 1 << 12);
  const bridges = new Batch(detail ? 1 << 12 : 1 << 9);
  const solids = [];
  const fine = detail ? FINE : 24;
  // the decks, in game heights
  const decks = tile.bridges.map((b) => {
    const outline = [];
    for (let i = 0; i < b.ring.length; i += 2) outline.push([b.ring[i], b.ring[i + 1]]);
    let box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of outline) box = [Math.min(box[0], x), Math.min(box[1], z), Math.max(box[2], x), Math.max(box[3], z)];
    return { a: [b.a[0], b.a[1], b.a[2] + offset], b: [b.b[0], b.b[1], b.b[2] + offset], half: b.half, outline, box };
  });
  // the ground under a point, or the deck over it
  const under = (x, z) => {
    const d = decks.length ? deckAt(decks, x, z) : NaN;
    return Number.isNaN(d) ? ground(x, z) : Math.max(d, ground(x, z));
  };

  // ── the paving
  for (let k = 0; k < tile.paving.length; k++) {
    if (k % PER_STEP === PER_STEP - 1) yield;
    const p = tile.paving[k];
    let look = LOOKS[p.kind];
    if (!look) continue;
    if (p.kind === 'sidewalk' && hash(seed * 31 + k) < BRICK.share && ringArea(p.rings[0]) < BRICK.most) look = { ...look, ...BRICK };
    const col = _c.set(look.col).clone();
    const tone = 0.94 + hash(seed + k * 7) * 0.1;
    for (const poly of polygonsOf(p.rings)) {
      const stripe = detail && p.kind === 'road' ? stripeOf(poly) : null;
      yield* lay(paving, poly, under, look.lift, col.r * tone, col.g * tone, col.b * tone, look.surf, fine, false, stripe);
      if (detail && look.curb) for (const ring of [poly.outer, ...poly.holes]) curb(paving, ring, under, look.lift, col.r * tone * 0.85, col.g * tone * 0.85, col.b * tone * 0.85);
    }
  }

  // ── the bridges: each deck's slab, its parapets and its piers
  const dc = _c.set(DECK_COL).clone();
  for (const d of decks) {
    const [ax, az, ay] = d.a;
    const [bx, bz, by] = d.b;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) continue;
    const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
    const deckY = (x, z) => {
      const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / len));
      return ay + (by - ay) * t;
    };
    // Keep the deck walkable from any detailed tile it crosses, including
    // when the tile that owns its mesh has yet to stream in.
    if (detail) {
      const pieces = Math.max(1, Math.ceil(len / DECK.piece));
      for (let s = 0; s < pieces; s++) {
        const [t0, t1] = [(len * s) / pieces, (len * (s + 1)) / pieces];
        const [x0, z0, x1, z1] = [ax + ux * t0, az + uz * t0, ax + ux * t1, az + uz * t1];
        const [y0, y1] = [deckY(x0, z0) + ROAD_LIFT, deckY(x1, z1) + ROAD_LIFT];
        solids.push({ ax: x0, az: z0, bx: x1, bz: z1, r: d.half, bottom: Math.min(y0, y1) - DECK.deep, topA: y0, topB: y1 });
      }
    }
    if (!ownsDeck((ax + bx) / 2, (az + bz) / 2)) continue;
    // its top, under whatever road is on it, and its underside
    const poly = { outer: d.outline, holes: [] };
    yield* lay(bridges, poly, (x, z) => Math.max(deckY(x, z), ground(x, z)), LOOKS.bridge.lift, dc.r, dc.g, dc.b, SURF.concrete, fine);
    if (!detail) continue;
    yield* lay(bridges, poly, (x, z) => Math.max(deckY(x, z), ground(x, z)) - DECK.deep, 0, dc.r * 0.6, dc.g * 0.6, dc.b * 0.6, SURF.concrete, fine, true);
    // its sides, and a parapet along those that run with it (not across its ends)
    const O = d.outline;
    for (let i = 0; i < O.length; i++) {
      const [px, pz] = O[i];
      const [qx, qz] = O[(i + 1) % O.length];
      const el = Math.hypot(qx - px, qz - pz);
      if (el < 0.05) continue;
      const along = Math.abs(((qx - px) * ux + (qz - pz) * uz) / el) > 0.7;
      const n = Math.max(1, Math.ceil(el / FINE));
      for (let s = 0; s < n; s++) {
        const [x0, z0] = [px + ((qx - px) * s) / n, pz + ((qz - pz) * s) / n];
        const [x1, z1] = [px + ((qx - px) * (s + 1)) / n, pz + ((qz - pz) * (s + 1)) / n];
        const [y0, y1] = [Math.max(deckY(x0, z0), ground(x0, z0)), Math.max(deckY(x1, z1), ground(x1, z1))];
        const h = along ? DECK.parapet : LOOKS.bridge.lift;
        bridges.quad([x0, y0 - DECK.deep, z0], [x1, y1 - DECK.deep, z1], [x1, y1 + h, z1], [x0, y0 + h, z0], dc.r * 0.9, dc.g * 0.9, dc.b * 0.9, SURF.clay, [0, 0, el / n, 0, el / n, 1, 0, 1]);
      }
    }
    // piers, where there's room under it
    for (let t = DECK.pier / 2; t < len - DECK.pier / 2; t += DECK.pier) {
      const [x, z] = [ax + ux * t, az + uz * t];
      const top = deckY(x, z) - DECK.deep;
      const g = ground(x, z);
      if (top - g < DECK.under) continue;
      const w = DECK.pierWide / 2;
      const [vx, vz] = [-uz * d.half * 0.7, ux * d.half * 0.7];
      const c = [
        [x - ux * w - vx, z - uz * w - vz],
        [x + ux * w - vx, z + uz * w - vz],
        [x + ux * w + vx, z + uz * w + vz],
        [x - ux * w + vx, z - uz * w + vz],
      ];
      for (let i = 0; i < 4; i++) {
        const [p0, p1] = [c[i], c[(i + 1) % 4]];
        bridges.quad([p0[0], g - 1, p0[1]], [p1[0], g - 1, p1[1]], [p1[0], top, p1[1]], [p0[0], top, p0[1]], dc.r * 0.8, dc.g * 0.8, dc.b * 0.8, SURF.stone, [0, 0, 1, 0, 1, top - g, 0, top - g]);
      }
    }
  }
  return { paving, bridges, solids, decks };
}

// The outline alone identifies some straight blocks reliably. Curves,
// intersections, plazas and streets of varying width are left unmarked.
function stripeOf({ outer, holes }) {
  if (holes.length) return null;
  let length = 0;
  let ux = 0;
  let uz = 0;
  for (let i = 0; i < outer.length; i++) {
    const [ax, az] = outer[i];
    const [bx, bz] = outer[(i + 1) % outer.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l <= length) continue;
    length = l;
    ux = (bx - ax) / l;
    uz = (bz - az) / l;
  }
  let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, z] of outer) {
    const u = x * ux + z * uz;
    const v = z * ux - x * uz;
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const w = v1 - v0;
  const span = u1 - u0;
  if (w < 8 || w > 24 || span < w * 3.5 || span > 400 || length < span * 0.5 || Math.abs(area(outer)) < w * span * 0.82) return null;
  return { ux, uz, center: (v0 + v1) / 2, start: u0, surface: SURF.asphalt + 0.5 + span / 1000 };
}

// m² inside a ring kept as [x, z, x, z, ...].
function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1];
  return Math.abs(a / 2);
}

// Rings filled even-odd, as polygons: { outer, holes }, each ring [[x, z], ...].
// A ring inside an odd number of others is a hole in the smallest of them.
export function polygonsOf(rings) {
  const rs = rings
    .map((r) => {
      const pts = [];
      let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < r.length; i += 2) {
        const [x, z] = [r[i], r[i + 1]];
        pts.push([x, z]);
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, z);
      }
      return { pts, a: Math.abs(area(pts)), x0, z0, x1, z1 };
    })
    .filter((r) => r.pts.length >= 3 && r.a > 0.01)
    .sort((p, q) => q.a - p.a);
  const out = [];
  const owner = [];
  for (let i = 0; i < rs.length; i++) {
    const child = rs[i];
    // the rings it's in, smallest last
    const ins = [];
    for (let j = 0; j < i; j++) {
      const parent = rs[j];
      if (child.x0 < parent.x0 || child.z0 < parent.z0 || child.x1 > parent.x1 || child.z1 > parent.z1) continue;
      // Skip a shared boundary vertex when deciding which side the ring is on.
      const point = child.pts.find(([x, z]) => edgeDistance(parent.pts, x, z) > 1e-5);
      if (point && inside(parent.pts, point[0], point[1])) ins.push(j);
    }
    if (ins.length % 2 === 0) {
      owner[i] = out.length;
      out.push({ outer: rs[i].pts, holes: [] });
    } else {
      const host = owner[ins[ins.length - 1]];
      if (host !== undefined) out[host].holes.push(rs[i].pts);
    }
  }
  return out;
}

// A polygon laid on the ground: cut into triangles, those cut again until
// no side is longer than FINE, each corner at height(x, z) + lift. down:
// facing down (a deck's underside).
function* lay(batch, { outer, holes }, height, lift, r, g, b, surf, fine, down = false, stripe = null) {
  const stack = [];
  let work = 0;
  for (const tri of trianglesOf(outer, holes)) {
    stack.push(...tri);
    while (stack.length) {
      if (++work % 500 === 0) yield;
      const cz = stack.pop();
      const cx = stack.pop();
      const bz = stack.pop();
      const bx = stack.pop();
      const az = stack.pop();
      const ax = stack.pop();
      const ab = (bx - ax) ** 2 + (bz - az) ** 2;
      const bc = (cx - bx) ** 2 + (cz - bz) ** 2;
      const ca = (ax - cx) ** 2 + (az - cz) ** 2;
      const most = Math.max(ab, bc, ca);
      if (most > fine * fine) {
        // split the longest side
        if (most === ab) {
          const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
          stack.push(ax, az, mx, mz, cx, cz, mx, mz, bx, bz, cx, cz);
        } else if (most === bc) {
          const [mx, mz] = [(bx + cx) / 2, (bz + cz) / 2];
          stack.push(ax, az, bx, bz, mx, mz, ax, az, mx, mz, cx, cz);
        } else {
          const [mx, mz] = [(cx + ax) / 2, (cz + az) / 2];
          stack.push(ax, az, bx, bz, mx, mz, mx, mz, bx, bz, cx, cz);
        }
        continue;
      }
      // (wound to face up, or down)
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (Math.abs(ny) < 1e-6) continue;
      const up = ny > 0;
      const flip = up === down;
      const v = batch.n;
      const [ay, by, cy] = [height(ax, az), height(bx, bz), height(cx, cz)];
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const scale = (flip ? -1 : 1) / (Math.hypot(nx, ny, nz) || 1);
      for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
        const u = stripe ? x * stripe.ux + z * stripe.uz - stripe.start : x;
        const across = stripe ? z * stripe.ux - x * stripe.uz - stripe.center : z;
        batch.vertex(x, y + lift, z, nx * scale, ny * scale, nz * scale, r, g, b, stripe?.surface ?? surf, u, across);
      }
      if (flip) batch.tri(v, v + 2, v + 1);
      else batch.tri(v, v + 1, v + 2);
    }
  }
}

function* trianglesOf(outer, holes) {
  const want = Math.abs(area(outer)) - holes.reduce((sum, h) => sum + Math.abs(area(h)), 0);
  const all = holes.length ? [...outer, ...holes.flat()] : outer;
  const tris = cut(outer, holes);
  if (tris && Math.abs(covered(tris, all) - want) <= Math.max(1, want * 0.02)) {
    for (const [i, j, k] of tris) yield [...all[i], ...all[j], ...all[k]];
    return;
  }

  // Some sidewalk holes share an edge with the outer ring. Sweep between
  // vertex rows and fill paired crossings so the lawn edges stay straight.
  const edges = [];
  const rows = new Set();
  for (const ring of [outer, ...holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [a, b] = ring[j][1] < ring[i][1] ? [ring[j], ring[i]] : [ring[i], ring[j]];
      const [x, z] = a;
      const end = b[1];
      if (end === z) continue;
      edges.push({ x, z, end, slope: (b[0] - x) / (end - z) });
      rows.add(z);
      rows.add(end);
    }
  }
  edges.sort((a, b) => a.z - b.z);
  const cuts = [...rows].sort((a, b) => a - b);
  let active = [];
  let next = 0;
  for (let k = 1; k < cuts.length; k++) {
    const [z0, z1] = [cuts[k - 1], cuts[k]];
    active = active.filter((e) => e.end > z0);
    while (next < edges.length && edges[next].z <= z0) active.push(edges[next++]);
    const crossings = active.map((e) => [e.x + (z0 - e.z) * e.slope, e.x + (z1 - e.z) * e.slope]);
    crossings.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const [a, b] = [crossings[i], crossings[i + 1]];
      yield [a[0], z0, b[0], z0, a[1], z1];
      yield [b[0], z0, b[1], z1, a[1], z1];
    }
  }
}

// A ring and its holes cut into triangles ([i, j, k] into the rings, one
// after the other), or null if it can't be.
function cut(outer, holes) {
  try {
    return THREE.ShapeUtils.triangulateShape(
      outer.map(([x, z]) => new THREE.Vector2(x, z)),
      holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z))),
    );
  } catch {
    return null;
  }
}
// m² the triangles cover, together.
function covered(tris, pts) {
  let sum = 0;
  for (const [i, j, k] of tris) sum += Math.abs((pts[j][0] - pts[i][0]) * (pts[k][1] - pts[i][1]) - (pts[k][0] - pts[i][0]) * (pts[j][1] - pts[i][1])) / 2;
  return sum;
}

// A curb round a raised ring: its face, from the paving's top down to the road's.
function curb(batch, ring, height, lift, r, g, b) {
  for (let i = 0; i < ring.length; i++) {
    const [px, pz] = ring[i];
    const [qx, qz] = ring[(i + 1) % ring.length];
    const el = Math.hypot(qx - px, qz - pz);
    if (el < 0.05) continue;
    const n = 2 ** Math.max(0, Math.ceil(Math.log2(el / FINE)));
    for (let s = 0; s < n; s++) {
      const [x0, z0] = [px + ((qx - px) * s) / n, pz + ((qz - pz) * s) / n];
      const [x1, z1] = [px + ((qx - px) * (s + 1)) / n, pz + ((qz - pz) * (s + 1)) / n];
      const [y0, y1] = [height(x0, z0), height(x1, z1)];
      batch.quad([x0, y0 + ROAD_LIFT - 0.02, z0], [x1, y1 + ROAD_LIFT - 0.02, z1], [x1, y1 + lift, z1], [x0, y0 + lift, z0], r, g, b, SURF.stone, [0, 0, el / n, 0, el / n, 0.12, 0, 0.12]);
    }
  }
}
