// What a dealership looks like, made in code like everything else.
//
// A slab of tarmac by the road, its sides sloping down to the ground, painted
// with bays; at the back, a showroom: a long low building of white panels
// with a glass front the length of it, a flat roof, and the dealership's name
// in red letters along a fascia over the glass, lit at night; inside, a car
// on the shining floor. Out on the lot, one of each kind of car the
// dealership sells stands in a row angled to the road, each with its price
// on a card in the windscreen (the cars themselves are models.js's, put
// there by index.js). Along the front, poles strung with bunting; by the
// road, a tall sign with the name on it.
//
// Its frame is the lot's (dealers.js): +z points at the road.
//
//   buildLot(site, ground, materials) -> { object, solids, blockers, bays }
//     bays     where the cars on the lot stand, in its frame: [{ x, z, yaw }],
//              one for each kind (kinds.js KIND_IDS), and inside: the
//              showroom's own
//   ground(x, z) -> the ground's height in the world

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF } from '../build/surfaces.js';
import { toWorld } from '../world/frame.js';
import { layout } from '../build/font.js';
import { LOT, SKIRT } from './dealers.js';
import { KIND_IDS } from './kinds.js';

// The showroom, in the lot's frame (m): from x0 to x1 across, z0 (its back)
// to z1 (its glass front); how high its walls stand, and its fascia over
// the glass.
export const SHOWROOM = { x0: -14, x1: 14, z0: -17.4, z1: -7, h: 4.6, fascia: 1.3 };
// Where the cars stand on the lot: a row across it, each turned toward the road.
const ROW = { z: 1.5, every: 9.6, turn: 0.42 };
const BUNTING = { poles: 6, h: 4.2, flags: 9 };
const SIGN = { x: 17.5, z: 15.5, h: 7.5, w: 5.4, board: 1.6 };
const LIFT = 0.04; // m the letters stand off what they're on, so they're never lost in it

const col = (hex) => new THREE.Color(hex);
const PAL = {
  tarmac: col(0x3a3b3d),
  bay: col(0xe6e4dc),
  skirt: col(0x5c5448),
  wall: col(0xeceae4),
  wallShade: col(0xc8c6c0),
  roof: col(0x8a8c8e),
  glass: col(0x34505e),
  frame: col(0x3a3d40),
  floor: col(0xd9d8d2),
  fascia: col(0x1f3550),
  letters: col(0xe83b2e),
  pole: col(0xb7b9bb),
  flags: [col(0xd93b2b), col(0xf2c230), col(0x2f6fb5), col(0xf3f1ea), col(0x3b9a4b)],
  sign: col(0x1f3550),
};

const _c = new THREE.Color();

function vert(m, p, n, c) {
  m.pos.push(p[0], p[1], p[2]);
  m.nor.push(n[0], n[1], n[2]);
  m.col.push(c.r, c.g, c.b);
  m.kind.push(SURF.plain);
  m.uv.push(0, 0);
  return m.n++;
}

// A flat face through corners [x, y, z], in order round it.
function face(m, pts, color) {
  const [a, b, c] = pts;
  let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const base = vert(m, pts[0], [nx, ny, nz], color);
  for (let i = 1; i < pts.length; i++) vert(m, pts[i], [nx, ny, nz], color);
  for (let i = 1; i < pts.length - 1; i++) m.idx.push(base, base + i, base + i + 1);
}

export function buildLot(site, ground, materials) {
  const m = new Mesher();
  const glow = new Mesher();
  const solids = [];
  const blockers = [];
  const top = site.top;
  // everything is made in the lot's frame, then the object is put in the world
  const g = (u, v) => {
    const w = toWorld(site, u, v);
    return ground(w.x, w.z);
  };
  const block = (mm, x0, y0, z0, x1, y1, z1, color) => {
    const s = (k) => _c.copy(color).multiplyScalar(k).clone();
    face(mm, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], s(1.04));
    face(mm, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], s(0.6));
    face(mm, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], s(0.96));
    face(mm, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], s(0.9));
    face(mm, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], s(0.84));
    face(mm, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], s(0.84));
  };

  // ── the slab, and its sloping sides ──
  const [x0, z0, x1, z1] = LOT;
  face(m, [[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], PAL.tarmac);
  const ring = [];
  const N = 10;
  for (let k = 0; k < N; k++) ring.push([x0 + ((x1 - x0) * k) / N, z0, 0, -1]);
  for (let k = 0; k < N; k++) ring.push([x1, z0 + ((z1 - z0) * k) / N, 1, 0]);
  for (let k = 0; k < N; k++) ring.push([x1 - ((x1 - x0) * k) / N, z1, 0, 1]);
  for (let k = 0; k < N; k++) ring.push([x0, z1 - ((z1 - z0) * k) / N, -1, 0]);
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const foot = (p) => {
      const ox = p[2] || (p[0] === x0 ? -1 : p[0] === x1 ? 1 : 0);
      const oz = p[3] || (p[1] === z0 ? -1 : p[1] === z1 ? 1 : 0);
      const u = p[0] + ox * SKIRT;
      const v = p[1] + oz * SKIRT;
      return [u, Math.min(g(u, v), top) - 0.2 - top, v];
    };
    face(m, [[a[0], 0, a[1]], foot(a), foot(b), [b[0], 0, b[1]]], PAL.skirt);
  }
  // the bays, painted: a line between each car's place
  const bayLine = (u, v0, v1) => face(m, [[u - 0.06, 0.01, v0], [u - 0.06, 0.01, v1], [u + 0.06, 0.01, v1], [u + 0.06, 0.01, v0]], PAL.bay);
  for (let k = 0; k <= KIND_IDS.length; k++) bayLine((k - KIND_IDS.length / 2) * ROW.every, ROW.z - 3.4, ROW.z + 3.4);

  // ── the showroom ──
  const S = SHOWROOM;
  const H = S.h;
  // the floor, a little up, and its step down at the front
  block(m, S.x0, 0, S.z0, S.x1, 0.15, S.z1, PAL.floor);
  // the back and the ends, and the roof
  block(m, S.x0, 0.15, S.z0, S.x1, H, S.z0 + 0.3, PAL.wall);
  block(m, S.x0, 0.15, S.z0, S.x0 + 0.3, H, S.z1, PAL.wallShade);
  block(m, S.x1 - 0.3, 0.15, S.z0, S.x1, H, S.z1, PAL.wallShade);
  block(m, S.x0 - 0.4, H, S.z0 - 0.4, S.x1 + 0.4, H + 0.35, S.z1 + 0.9, PAL.roof);
  // the glass front, in a dark frame, with a pair of doors in the middle
  face(m, [[S.x0 + 0.3, 0.15, S.z1 - 0.05], [S.x1 - 0.3, 0.15, S.z1 - 0.05], [S.x1 - 0.3, H - S.fascia, S.z1 - 0.05], [S.x0 + 0.3, H - S.fascia, S.z1 - 0.05]], PAL.glass);
  face(m, [[S.x1 - 0.3, 0.15, S.z1 - 0.07], [S.x0 + 0.3, 0.15, S.z1 - 0.07], [S.x0 + 0.3, H - S.fascia, S.z1 - 0.07], [S.x1 - 0.3, H - S.fascia, S.z1 - 0.07]], PAL.glass);
  for (let u = S.x0 + 0.3; u <= S.x1 - 0.29; u += (S.x1 - S.x0 - 0.6) / 7) block(m, u - 0.06, 0.15, S.z1 - 0.12, u + 0.06, H - S.fascia, S.z1 + 0.02, PAL.frame);
  block(m, S.x0 + 0.3, 0.15, S.z1 - 0.12, S.x1 - 0.3, 0.3, S.z1 + 0.02, PAL.frame);
  block(m, -1.2, 0.15, S.z1 - 0.1, -1.1, 2.4, S.z1 + 0.04, PAL.frame);
  block(m, 1.1, 0.15, S.z1 - 0.1, 1.2, 2.4, S.z1 + 0.04, PAL.frame);
  block(m, -1.2, 2.3, S.z1 - 0.1, 1.2, 2.4, S.z1 + 0.04, PAL.frame);
  // the fascia, and the name on it in letters that glow after dark
  block(m, S.x0 - 0.1, H - S.fascia, S.z1 - 0.1, S.x1 + 0.1, H, S.z1 + 0.25, PAL.fascia);
  letters(glow, site.name.toUpperCase(), 0, H - S.fascia / 2, S.z1 + 0.25 + LIFT, Math.min(0.13, (S.x1 - S.x0 - 1.5) / (site.name.length * 6)), PAL.letters);
  solids.push(...wallSolids(S, top));
  solids.push(...slabSolids(site, g, top));
  blockers.push({ x: 0, y: H / 2, z: (S.z0 + S.z1) / 2, half: [(S.x1 - S.x0) / 2, H / 2, (S.z1 - S.z0) / 2], yaw: 0 });

  // ── bunting along the front ──
  const poles = [];
  for (let k = 0; k < BUNTING.poles; k++) {
    const u = x0 + 1 + ((x1 - x0 - 2) * k) / (BUNTING.poles - 1);
    const v = z1 - 0.6;
    block(m, u - 0.06, 0, v - 0.06, u + 0.06, BUNTING.h, v + 0.06, PAL.pole);
    poles.push([u, v]);
  }
  for (let k = 0; k < poles.length - 1; k++) {
    const [ua, va] = poles[k];
    const [ub] = poles[k + 1];
    for (let f = 0; f < BUNTING.flags; f++) {
      const t0 = (f + 0.1) / BUNTING.flags;
      const t1 = (f + 0.9) / BUNTING.flags;
      const sag = (t) => BUNTING.h - 0.05 - Math.sin(t * Math.PI) * 0.7;
      const a = [ua + (ub - ua) * t0, sag(t0), va];
      const b = [ua + (ub - ua) * t1, sag(t1), va];
      const tip = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.45, va];
      const c = PAL.flags[(k * BUNTING.flags + f) % PAL.flags.length];
      face(m, [a, b, tip], c);
      face(m, [b, a, tip], c);
    }
  }

  // ── the sign by the road ──
  const sg = Math.min(g(SIGN.x, SIGN.z), top) - top;
  block(m, SIGN.x - 0.12, sg, SIGN.z - 0.12, SIGN.x + 0.12, SIGN.h, SIGN.z + 0.12, PAL.pole);
  const by = SIGN.h - SIGN.board / 2;
  block(m, SIGN.x - SIGN.w / 2, by - SIGN.board / 2, SIGN.z - 0.12, SIGN.x + SIGN.w / 2, by + SIGN.board / 2, SIGN.z + 0.12, PAL.sign);
  const words = site.name.toUpperCase();
  const size = Math.min(0.1, (SIGN.w - 0.4) / (words.length * 6));
  letters(glow, words, SIGN.x, by, SIGN.z + 0.12 + LIFT, size, PAL.letters);
  letters(glow, words, SIGN.x, by, SIGN.z - 0.12 - LIFT, size, PAL.letters, true);
  solids.push({ ax: SIGN.x, az: SIGN.z, bx: SIGN.x, bz: SIGN.z + 0.01, r: 0.2, topA: SIGN.h, topB: SIGN.h, bottom: sg });

  // ── where the cars stand ──
  const bays = KIND_IDS.map((kind, k) => ({ kind, x: (k - (KIND_IDS.length - 1) / 2) * ROW.every, z: ROW.z, yaw: (k < KIND_IDS.length / 2 ? -1 : 1) * ROW.turn }));
  const inside = { x: 0, z: (S.z0 + S.z1) / 2 + 0.6, yaw: 0.5, y: 0.15 };

  const object = new THREE.Group();
  object.position.set(site.x, top, site.z);
  object.rotation.y = site.yaw;
  const body = new THREE.Mesh(m.build(), materials.lot);
  body.castShadow = true;
  body.receiveShadow = true;
  object.add(body);
  const lit = new THREE.Mesh(glow.build(), materials.glow);
  object.add(lit);
  object.updateMatrixWorld(true);
  // the solids and blockers, from the lot's frame into the world
  const w = { x: 0, z: 0 };
  for (const s of solids) {
    toWorld(site, s.ax, s.az, w);
    const ax = w.x;
    const az = w.z;
    toWorld(site, s.bx, s.bz, w);
    Object.assign(s, { ax, az, bx: w.x, bz: w.z, topA: s.topA + top, topB: s.topB + top, bottom: s.bottom + top });
  }
  for (const b of blockers) {
    toWorld(site, b.x, b.z, w);
    Object.assign(b, { x: w.x, z: w.z, y: b.y + top, yaw: site.yaw });
  }
  return { object, solids, blockers, bays, inside, lit };
}

// The slab as solids you stand on: its top, as wide capsules across it, and
// its sloping sides down to the ground (as the video store's). In the lot's
// frame, measured from its top. g(u, v) -> the ground there, in the world.
function slabSolids(site, g, top) {
  const out = [];
  const [x0, z0, x1, z1] = LOT;
  const rise = top - site.low;
  const rows = Math.round((x1 - x0) / 3.6);
  const R = (x1 - x0) / rows / 2;
  for (let i = 0; i < rows; i++) out.push({ ax: x0 + R * (2 * i + 1), az: z0 + R, bx: x0 + R * (2 * i + 1), bz: z1 - R, r: R + 0.05, topA: 0, topB: 0, bottom: -rise - 1, surface: 'tarmac' });
  for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const along = u ? [z0, z1] : [x0, x1];
    for (let t = along[0] + 0.6; t <= along[1] - 0.6; t += 1.2) {
      const ax = u ? (u > 0 ? x1 : x0) - u * 0.3 : t;
      const az = v ? (v > 0 ? z1 : z0) - v * 0.3 : t;
      const bx = u ? ax + u * (SKIRT + 0.3) : t;
      const bz = v ? az + v * (SKIRT + 0.3) : t;
      out.push({ ax, az, bx, bz, r: 0.6, topA: 0, topB: Math.min(0, g(bx, bz) - top), bottom: -rise - 1, surface: 'tarmac' });
    }
  }
  return out;
}

// The showroom's walls, as solids: its back, its ends, and its glass front
// (you can't walk in: the car inside is for looking at).
function wallSolids(S, top) {
  const out = [];
  const seg = (ax, az, bx, bz) => out.push({ ax, az, bx, bz, r: 0.22, topA: S.h + 0.35, topB: S.h + 0.35, bottom: 0, surface: 'tarmac' });
  seg(S.x0, S.z0, S.x1, S.z0);
  seg(S.x0, S.z0, S.x0, S.z1);
  seg(S.x1, S.z0, S.x1, S.z1);
  seg(S.x0, S.z1, S.x1, S.z1);
  void top;
  return out;
}

// Letters made of little squares, centred on (cx, cy) on a face at z, each
// square `size` m; back: written to be read from -z.
function letters(m, text, cx, cy, z, size, color, back = false) {
  const { width, height, dots } = layout(text);
  const sx = back ? -1 : 1;
  for (const [i, j] of dots) {
    const u = cx + sx * (i - width / 2) * size;
    const v = cy + (height / 2 - j) * size;
    const q = [
      [u, v - size, z],
      [u + sx * size, v - size, z],
      [u + sx * size, v, z],
      [u, v, z],
    ];
    face(m, back ? [...q].reverse() : q, color);
  }
}
