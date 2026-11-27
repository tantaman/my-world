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
import { terrainTriangles } from '../world/terrainGrid.ts';

// What each kind of paving looks like: its colour, its surface, how far over
// the ground it's laid (m) — a road's, a little; a sidewalk's, a curb's
// height; a curb drops to the road's — and what it is underfoot (`made`:
// one of the surfaces footsteps and wheels know, world/paved.ts; the city is
// asphalt where cars go and concrete, brick or stone where they don't).
export const LOOKS = {
  road: { col: 0x494b4d, surf: SURF.asphalt, lift: 0.09, made: 'tarmac' },
  alley: { col: 0x625f5a, surf: SURF.asphalt, lift: 0.095, made: 'tarmac' },
  drive: { col: 0x515052, surf: SURF.asphalt, lift: 0.10, made: 'tarmac' },
  parking: { col: 0x555456, surf: SURF.asphalt, lift: 0.095, made: 'tarmac' },
  island: { col: 0x8c8880, surf: SURF.concrete, lift: 0.17, curb: true, made: 'stone' },
  sidewalk: { col: 0xaba69d, surf: SURF.concrete, lift: 0.17, curb: true, made: 'stone' },
  stairs: { col: 0x8e8a82, surf: SURF.stone, lift: 0.16, made: 'stone' },
  bridge: { col: 0x7a7874, surf: SURF.clay, lift: 0.02, made: 'stone' },
  footbridge: { col: 0x7a7874, surf: SURF.clay, lift: 0.02, made: 'stone' },
};
// …and a sidewalk of brick pavers, as so many of Washington's are, this
// often (but not a plaza: a polygon of sidewalk bigger than `most` m²)
const BRICK = { col: 0x76463c, surf: SURF.pavers, share: 0.3, most: 3000 };
const ROAD_LIFT = LOOKS.road.lift;
// m: the longest side a triangle laid on the ground is left with
const FINE = 6;
// A bridge: how deep its deck (m), how high the parapet over it, how far
// apart its piers and how wide, and how much room there must be under it
// (m) for a pier to stand; its deck cut into pieces this long (m) to stand
// on, each as high as it is there; and how far in from either end (m) an
// edge of its outline is across its end, with no parapet.
const DECK = { deep: 1.2, parapet: 0.9, wall: 0.3, pier: 36, pierWide: 1.6, under: 3, piece: 20, end: 3 };
const DECK_COL = 0x8c8a84;
const PER_STEP = 30; // polygons laid between one step and the next

const _c = new THREE.Color();
const hash = (n) => {
  let h = Math.imul(n ^ 0x2545f491, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

// Where a deck is at (x, z) (tile metres), of those in `decks`: its height
// there (game m), or NaN off them all. (A point on its outline is on it:
// the sidewalks along a bridge end exactly at its edge, and one of their
// corners taken to be off it would hang from the deck down to the creek.)
const ON_EDGE = 0.05; // m
export function deckAt(decks, x, z) {
  let y = NaN;
  for (const d of decks) {
    if (x < d.box[0] - ON_EDGE || x > d.box[2] + ON_EDGE || z < d.box[1] - ON_EDGE || z > d.box[3] + ON_EDGE) continue;
    if (!inside(d.outline, x, z) && edgeDistance(d.outline, x, z) > ON_EDGE) continue;
    const [ax, az, ay] = d.a;
    const [bx, bz, by] = d.b;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    const h = ay + (by - ay) * t;
    if (!(h <= y)) y = h;
  }
  return y;
}

export function* buildPaving(tile, { ground, offset, seed = 0, detail = true, ownsDeck = (x, z) => true, terrainGrid = null, coarse = [] }) {
  const paving = new Batch(detail ? 1 << 15 : 1 << 12, !!terrainGrid);
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
    const pl = lookOf(p, k, seed);
    if (!pl) continue;
    const { look, r, g, b } = pl;
    for (const poly of polygonsOf(p.rings)) {
      const stripe = detail && p.kind === 'road' ? stripeOf(poly) : null;
      const grid = look.surf === SURF.asphalt ? terrainGrid : null;
      yield* lay(paving, poly, under, look.lift, r, g, b, look.surf, fine, false, stripe, grid, grid ? coarse : []);
      if (detail && look.curb) for (const ring of [poly.outer, ...poly.holes]) curb(paving, ring, under, look.lift, r * 0.85, g * 0.85, b * 0.85);
    }
  }

  // ── the seams: where the survey left a sliver of lawn between one piece
  // of paving and the next, or between paving and a wall
  if (detail) yield* seams(tile, paving, under, seed);

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
    // its sides, and a parapet along them: along every edge but those across
    // its ends (a deck's outline zigzags where it widens, and an edge of it
    // that runs across the deck in the middle is still its side)
    const O = d.outline;
    const atEnd = (x, z) => {
      const t = (x - ax) * ux + (z - az) * uz;
      return t < DECK.end || t > len - DECK.end;
    };
    for (let i = 0; i < O.length; i++) {
      const [px, pz] = O[i];
      const [qx, qz] = O[(i + 1) % O.length];
      const el = Math.hypot(qx - px, qz - pz);
      if (el < 0.05) continue;
      const along = Math.abs(((qx - px) * ux + (qz - pz) * uz) / el) > 0.7 || !(atEnd(px, pz) && atEnd(qx, qz));
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

// What the k-th piece of paving of a tile looks like: { look, r, g, b }
// (LOOKS', or brick, and its own tone of it), or null if it isn't drawn.
function lookOf(p, k, seed) {
  let look = LOOKS[p.kind];
  if (!look) return null;
  if (p.kind === 'sidewalk' && hash(seed * 31 + k) < BRICK.share && ringArea(p.rings[0]) < BRICK.most) look = { ...look, ...BRICK };
  const col = _c.set(look.col);
  const tone = 0.94 + hash(seed + k * 7) * 0.1;
  return { look, r: col.r * tone, g: col.g * tone, b: col.b * tone };
}

// The seams. The survey drew each piece of paving on its own, and where two
// meet it often left a sliver of ground between them, or between a sidewalk
// and the wall it runs up to: a line of lawn down the middle of an avenue,
// along a curb, at the foot of a building. Each piece is carried on over a
// sliver no wider than SEAM.most to what's on its far side: halfway, to
// another piece laid at its own height (a street to a street, a sidewalk to
// a sidewalk); all the way to a wall, or under a raised sidewalk's curb. A
// tree's box, or a strip of lawn wider than that, is left as it is. What's
// where is looked at on squares SEAM.cell m across; a step between yields
// looks across at SEAM.perStep points along the edges.
const SEAM = { most: 1.6, cell: 0.25, step: 0.5, even: 0.12, over: 0.06, under: 0.004, perStep: 1500 };
const WALL = 0xffff; // (on the squares: a building)
function* seams(tile, batch, height, seed) {
  // the squares: which piece of paving (k + 1) or a building is on each
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of tile.paving) {
    for (const r of p.rings) {
      for (let i = 0; i < r.length; i += 2) [x0, z0, x1, z1] = [Math.min(x0, r[i]), Math.min(z0, r[i + 1]), Math.max(x1, r[i]), Math.max(z1, r[i + 1])];
    }
  }
  if (!(x1 > x0)) return;
  [x0, z0] = [x0 - SEAM.most - 1, z0 - SEAM.most - 1];
  const C = SEAM.cell;
  const w = Math.ceil((x1 - x0 + SEAM.most + 1) / C) + 1;
  const h = Math.ceil((z1 - z0 + SEAM.most + 1) / C) + 1;
  const on = new Uint16Array(w * h);
  yield;
  // (each edge looked at only on the rows it crosses)
  const fill = (rings, v) => {
    const rows = new Map();
    let [j0, j1] = [Infinity, -Infinity];
    for (const r of rings) {
      for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) {
        const [za, zb] = [r[b + 1], r[a + 1]];
        if (za === zb) continue;
        // the rows whose middles it spans
        const ja = Math.max(0, Math.ceil((Math.min(za, zb) - z0) / C - 0.5));
        const jb = Math.min(h - 1, Math.ceil((Math.max(za, zb) - z0) / C - 0.5) - 1);
        if (jb < ja) continue;
        const e = { ja, jb, x: r[b], z: za, slope: (r[a] - r[b]) / (zb - za) };
        if (!rows.has(ja)) rows.set(ja, []);
        rows.get(ja).push(e);
        [j0, j1] = [Math.min(j0, ja), Math.max(j1, jb)];
      }
    }
    let active = [];
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * C;
      active = active.filter((e) => e.jb >= j);
      const starting = rows.get(j);
      if (starting) active.push(...starting);
      xs.length = 0;
      for (const e of active) xs.push(e.x + (z - e.z) * e.slope);
      xs.sort((p, q) => p - q);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i1 = Math.min(w - 1, Math.floor((xs[n + 1] - x0) / C - 0.5));
        for (let i = Math.max(0, Math.ceil((xs[n] - x0) / C - 0.5)); i <= i1; i++) on[j * w + i] = v;
      }
    }
  };
  // (a building's roof, all its faces at once: they lie side by side)
  let edges = 0;
  for (const b of tile.buildings) {
    fill(b.faces.map((f) => f[0].flatMap((q) => [b.pts[q * 3], b.pts[q * 3 + 1]])), WALL);
    edges += b.pts.length;
    if (edges > SEAM.perStep * 3) {
      edges = 0;
      yield;
    }
  }
  yield;
  const looks = tile.paving.map((p, k) => lookOf(p, k, seed));
  for (let k = 0; k < tile.paving.length; k++) {
    if (looks[k]) fill(tile.paving[k].rings, k + 1);
    if (k % 4 === 3) yield;
  }
  const at = (x, z) => {
    const i = Math.floor((x - x0) / C);
    const j = Math.floor((z - z0) / C);
    return i < 0 || j < 0 || i >= w || j >= h ? 0 : on[j * w + i];
  };
  // How far out from (x, z), along (nx, nz), the sliver of ground goes
  // before what's on its far side (0 if it's no sliver); and what that is.
  // (paving straight on past the edge is no sliver)
  const across = (x, z, nx, nz, k) => {
    let open = false;
    for (let d = C / 2; d <= SEAM.most; d += C / 2) {
      const v = at(x + nx * d, z + nz * d);
      // (its own square, still: a slanting edge cuts across squares)
      if (v === k + 1 && !open && d < C * 1.5) continue;
      if (v === k + 1) return [0, 0];
      if (v) return open ? [d, v] : [0, 0];
      open = true;
    }
    return [0, 0];
  };
  let work = 0;
  for (let k = 0; k < tile.paving.length; k++) {
    const mine = looks[k];
    if (!mine) continue;
    const { look, r, g, b } = mine;
    for (const ring of tile.paving[k].rings) {
      const n = ring.length / 2;
      for (let e = 0; e < n; e++) {
        const [ax, az] = [ring[e * 2], ring[e * 2 + 1]];
        const [bx, bz] = [ring[((e + 1) % n) * 2], ring[((e + 1) % n) * 2 + 1]];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
        // which side is out: the one this piece isn't on
        const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
        let [nx, nz] = [-uz, ux];
        const left = at(mx + nx * C, mz + nz * C) === k + 1;
        const right = at(mx - nx * C, mz - nz * C) === k + 1;
        if (left === right) continue;
        if (left) [nx, nz] = [-nx, -nz];
        // along the edge, how far over the sliver each point is carried;
        // a strip laid over it from one point to the next, or on to the
        // one after while it's as wide (SEAM.even) and not too long to lie
        // on the ground (FINE)
        const steps = Math.max(1, Math.ceil(len / SEAM.step));
        let from = null;
        let last = null;
        const lay = (a, z) => {
          const [px, pz, pr] = a;
          const [x, zz, reach] = z;
          const lift = look.lift - SEAM.under;
          const corner = (cx, cz) => [cx, height(cx, cz) + lift, cz];
          const q = [corner(px, pz), corner(x, zz), corner(x + nx * reach, zz + nz * reach), corner(px + nx * pr, pz + nz * pr)];
          const run = Math.hypot(x - px, zz - pz);
          // (wound to face up)
          if (ux * nz - uz * nx > 0) batch.quad(q[0], q[3], q[2], q[1], r, g, b, look.surf, [0, 0, 0, pr, run, reach, run, 0]);
          else batch.quad(q[0], q[1], q[2], q[3], r, g, b, look.surf, [0, 0, run, 0, run, reach, 0, pr]);
        };
        for (let s = 0; s <= steps; s++) {
          if (++work % SEAM.perStep === 0) yield;
          const t = (len * s) / steps;
          const [x, z] = [ax + ux * t, az + uz * t];
          const [d, v] = across(x, z, nx, nz, k);
          let reach = 0;
          if (d > 0) {
            const theirs = v === WALL ? null : looks[v - 1]?.look;
            // halfway to paving laid at its own height; under a curb, or to a wall, all the way
            const level = theirs && Math.abs(theirs.lift - look.lift) < 0.03;
            const below = theirs && theirs.lift > look.lift;
            if (level) reach = d / 2 + SEAM.over;
            else if (below || v === WALL) reach = d + SEAM.over;
          }
          const here = reach > 0 ? [x, z, reach] : null;
          if (here && from && Math.abs(here[2] - from[2]) < SEAM.even && Math.hypot(x - from[0], z - from[1]) < FINE && s < steps) {
            last = here;
            continue;
          }
          if (from && last) lay(from, last);
          if (from && here) lay(last || from, here);
          from = here;
          last = null;
        }
      }
    }
  }
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
function* lay(batch, { outer, holes }, height, lift, r, g, b, surf, fine, down = false, stripe = null, grid = null, coarse = []) {
  const stack = [];
  const vertices = grid && new Map();
  let work = 0;
  for (const [x0, z0, x1, z1, x2, z2] of trianglesOf(outer, holes)) {
    if (grid) {
      for (const [a, b, c] of terrainTriangles([[x0, z0], [x1, z1], [x2, z2]], grid)) {
        add(...a, ...b, ...c);
        if (++work % 500 === 0) yield;
      }
      continue;
    }
    stack.push(x0, z0, x1, z1, x2, z2);
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
      add(ax, az, bx, bz, cx, cz);
    }
  }

  function add(ax, az, bx, bz, cx, cz) {
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (Math.abs(ny) < 1e-6) return;
    const flip = (ny > 0) === down;
    const [ay, by, cy] = [height(ax, az), height(bx, bz), height(cx, cz)];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const scale = (flip ? -1 : 1) / Math.hypot(nx, ny, nz);
    const corner = (x, y, z) => {
      const key = Math.round(x * 1e4) * 1e8 + Math.round(z * 1e4);
      const prior = vertices?.get(key);
      if (prior !== undefined) return prior;
      const u = stripe ? x * stripe.ux + z * stripe.uz - stripe.start : x;
      const across = stripe ? z * stripe.ux - x * stripe.uz - stripe.center : z;
      let normalX = nx * scale, normalY = ny * scale, normalZ = nz * scale;
      if (vertices) {
        // The road follows the ground without inheriting the little dips'
        // sharp lighting changes. Shade it by the slope across its width.
        const dx = height(x - 4, z) - height(x + 4, z);
        const dz = height(x, z - 4) - height(x, z + 4);
        const length = Math.hypot(dx, 8, dz);
        [normalX, normalY, normalZ] = [dx / length, 8 / length, dz / length];
      }
      const k = batch.vertex(x, y + lift, z, normalX, normalY, normalZ, r, g, b, stripe?.surface ?? surf, u, across);
      if (batch.grade) {
        for (let j = 0; j < coarse.length; j++) batch.grade[k * 2 + j] = Math.max(0, coarse[j](x, z) - y);
      }
      vertices?.set(key, k);
      return k;
    };
    const ia = corner(ax, ay, az);
    const ib = corner(bx, by, bz);
    const ic = corner(cx, cy, cz);
    if (flip) batch.tri(ia, ic, ib);
    else batch.tri(ia, ib, ic);
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
