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
import { inside, area } from '../core/rings.js';

// What each kind of paving looks like: its colour, its surface, and how far
// over the ground it's laid (m): a road's, a little; a sidewalk's, a curb's
// height; a curb drops to the road's.
export const LOOKS = {
  road: { col: 0x3a3c3e, surf: SURF.clay, lift: 0.04 },
  alley: { col: 0x625f5a, surf: SURF.clay, lift: 0.045 },
  drive: { col: 0x46474a, surf: SURF.clay, lift: 0.05 },
  parking: { col: 0x4c4d4f, surf: SURF.clay, lift: 0.045 },
  island: { col: 0x8c8880, surf: SURF.clay, lift: 0.14, curb: true },
  sidewalk: { col: 0x9e9990, surf: SURF.clay, lift: 0.14, curb: true },
  stairs: { col: 0x8e8a82, surf: SURF.stone, lift: 0.16 },
  bridge: { col: 0x7a7874, surf: SURF.clay, lift: 0.02 },
  footbridge: { col: 0x7a7874, surf: SURF.clay, lift: 0.02 },
};
// …and a sidewalk of brick, as so many of Washington's are, this often (but
// not a plaza: a polygon of sidewalk bigger than `most` m²)
const BRICK = { col: 0x8a4c3e, surf: SURF.stone, share: 0.3, most: 3000 };
const ROAD_LIFT = LOOKS.road.lift;
// m: the longest side a triangle laid on the ground is left with
const FINE = 4;
// A bridge: how deep its deck (m), how high the parapet over it, how far
// apart its piers and how wide, and how much room there must be under it
// (m) for a pier to stand; and its deck cut into pieces this long (m) to
// stand on, each as high as it is there.
const DECK = { deep: 1.2, parapet: 0.9, wall: 0.3, pier: 36, pierWide: 1.6, under: 3, piece: 20 };
const DECK_COL = 0x8c8a84;
const PER_STEP = 30; // polygons laid between one step and the next
// How much more than a polygon's area its triangles may cover before
// they're taken to be wrong.
const OVERFILL = 1.02;

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

export function* buildPaving(tile, { ground, offset, seed = 0 }) {
  const paving = new Batch(1 << 15);
  const bridges = new Batch(1 << 12);
  const solids = [];
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
      lay(paving, poly, under, look.lift, col.r * tone, col.g * tone, col.b * tone, look.surf);
      if (look.curb) for (const ring of [poly.outer, ...poly.holes]) curb(paving, ring, under, look.lift, col.r * tone * 0.85, col.g * tone * 0.85, col.b * tone * 0.85);
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
    // its top, under whatever road is on it, and its underside
    const poly = { outer: d.outline, holes: [] };
    lay(bridges, poly, (x, z) => Math.max(deckY(x, z), ground(x, z)), LOOKS.bridge.lift, dc.r, dc.g, dc.b, SURF.clay);
    lay(bridges, poly, (x, z) => Math.max(deckY(x, z), ground(x, z)) - DECK.deep, 0, dc.r * 0.6, dc.g * 0.6, dc.b * 0.6, SURF.clay, true);
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
    // what's walked on: the deck in pieces, each as high as it is there
    const pieces = Math.max(1, Math.ceil(len / DECK.piece));
    for (let s = 0; s < pieces; s++) {
      const [t0, t1] = [(len * s) / pieces, (len * (s + 1)) / pieces];
      const [x0, z0, x1, z1] = [ax + ux * t0, az + uz * t0, ax + ux * t1, az + uz * t1];
      const [y0, y1] = [deckY(x0, z0) + ROAD_LIFT, deckY(x1, z1) + ROAD_LIFT];
      solids.push({ ax: x0, az: z0, bx: x1, bz: z1, r: d.half, bottom: Math.min(y0, y1) - DECK.deep, topA: y0, topB: y1 });
    }
  }
  return { paving, bridges, solids, decks };
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
      for (let i = 0; i < r.length; i += 2) pts.push([r[i], r[i + 1]]);
      return { pts, a: Math.abs(area(pts)) };
    })
    .filter((r) => r.pts.length >= 3 && r.a > 0.01)
    .sort((p, q) => q.a - p.a);
  const out = [];
  const owner = [];
  for (let i = 0; i < rs.length; i++) {
    const [x, z] = rs[i].pts[0];
    // the rings it's in, smallest last
    const ins = [];
    for (let j = 0; j < i; j++) if (inside(rs[j].pts, x, z)) ins.push(j);
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
function lay(batch, { outer, holes }, height, lift, r, g, b, surf, down = false) {
  // Cut into triangles with its holes; but where a hole touches the edge
  // (the survey's sidewalks round a lawn), that can come out covering far
  // more than the polygon does: then the outline alone is cut, and what
  // lies in a hole is left out, a small triangle at a time.
  const want = Math.abs(area(outer)) - holes.reduce((sum, h) => sum + Math.abs(area(h)), 0);
  let all = holes.length ? [...outer, ...holes.flat()] : outer;
  let tris = cut(outer, holes);
  let inHole = null;
  if (!tris || covered(tris, all) > want * OVERFILL + 1) {
    all = outer;
    tris = cut(outer, []);
    if (!tris || covered(tris, all) > Math.abs(area(outer)) * OVERFILL + 1) return;
    const boxes = holes.map((h) => {
      let q = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, z] of h) q = [Math.min(q[0], x), Math.min(q[1], z), Math.max(q[2], x), Math.max(q[3], z)];
      return q;
    });
    inHole = (x, z) => holes.some((h, k) => x >= boxes[k][0] && x <= boxes[k][2] && z >= boxes[k][1] && z <= boxes[k][3] && inside(h, x, z));
  }
  const stack = [];
  for (const [i, j, k] of tris) {
    stack.push(all[i][0], all[i][1], all[j][0], all[j][1], all[k][0], all[k][1]);
    while (stack.length) {
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
      if (most > FINE * FINE) {
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
      if (inHole && inHole((ax + bx + cx) / 3, (az + bz + cz) / 3)) continue;
      // (wound to face up, or down)
      const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) >= 0;
      const flip = up === down;
      const v = batch.n;
      const ny = down ? -1 : 1;
      batch.vertex(ax, height(ax, az) + lift, az, 0, ny, 0, r, g, b, surf, ax, az);
      batch.vertex(bx, height(bx, bz) + lift, bz, 0, ny, 0, r, g, b, surf, bx, bz);
      batch.vertex(cx, height(cx, cz) + lift, cz, 0, ny, 0, r, g, b, surf, cx, cz);
      if (flip) batch.tri(v, v + 2, v + 1);
      else batch.tri(v, v + 1, v + 2);
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
    const n = Math.max(1, Math.ceil(el / FINE));
    for (let s = 0; s < n; s++) {
      const [x0, z0] = [px + ((qx - px) * s) / n, pz + ((qz - pz) * s) / n];
      const [x1, z1] = [px + ((qx - px) * (s + 1)) / n, pz + ((qz - pz) * (s + 1)) / n];
      const [y0, y1] = [height(x0, z0), height(x1, z1)];
      batch.quad([x0, y0 + ROAD_LIFT - 0.02, z0], [x1, y1 + ROAD_LIFT - 0.02, z1], [x1, y1 + lift, z1], [x0, y0 + lift, z0], r, g, b, SURF.stone, [0, 0, el / n, 0, el / n, 0.12, 0, 0.12]);
    }
  }
}
