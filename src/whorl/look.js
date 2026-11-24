// What the Nautilus Lookout Tower and the Whorl look like, and what they put
// in the world, fetched the first time you come near (index.ts asks for it:
// core/lazy.ts). Nothing here is needed anywhere else.
//
//   new Tower({ at, base, ground, water })
//     at: [x, z] the tower's middle in the world; base: the height of its
//     foot; ground(x, z): the land's height (world); water(x, z): the level
//     of the water there, or NaN.
//   tower.pump(ms)   built a little at a time: → whether there's more to do
//   tower.group      everything in it, once ready
//   tower.solids     { tower, tube, bridge }: capsules in the world (world/solids.js)
//   tower.obstacles  [{ x, z, r, what }]: what a builder's tools go round
//   tower.clears(x, z, small)   whether a plant there is to go
//   tower.bare(x, z)            whether grass grows there
//   tower.mat        the mat you ride down on: put under you while you do
//
// Galvanized steel, the grating of its decks a darker grey, mesh panels in
// its rails; the slide stainless, flanged every metre and a half, open as a
// trough where you get in and along the run-out; a timber footbridge over
// Owls Creek, a gravel path up from it, and a sign at each end of the climb.

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { quad, beam, box } from '../build/faces.js';
import { layout } from '../build/font.js';
import { SURF, createBuildingMaterial } from '../build/surfaces.js';
import { TOWER, SLIDE, LEVEL_AT, MOUTH_BEARING, FOOT, rampAt, rampY, onOctagon, apothemOf, slidePath, tubeFrame, structure, tubeSolids, bridgeLine, pathLine, BRIDGE } from './tower.js';

const C = (hex) => new THREE.Color(hex);
// what it's made of: [colour, surface, wear (for steel, how dull)]
const GALV = [C(0xb8bbb6), SURF.steel, 0.6];
const GRATING = [C(0x8d908b), SURF.steel, 0.85];
const STAINLESS = [C(0xd3d7d9), SURF.steel, 0.02];
const INSIDE = [C(0xaeb2b5), SURF.steel, 0.7];
const NET = C(0x8c9194);
const TIMBER = [C(0x8a6a48), SURF.wood, 0.3];
const GRAVEL = [C(0x9b8f7c), SURF.stone, 0.2];
const BOARD = [C(0x2f4a3a), SURF.paint, 0.1];
const LETTER = C(0xf0e6c8);
const FELT = C(0x2f5f9f);
// how finely the tube goes round (sides), how often it's flanged (points
// of its path), and how wide a flange is (m)
const SIDES = 20;
const FLANGE = { every: 6, w: 0.07, out: 0.03 };
// the open trough: how far up its sides go each way from the bottom (radians)
const TROUGH = (108 * Math.PI) / 180;
// m: posts along a rail at most this far apart; a path's gravel this far
// over the ground; the bar across the slide's mouth this far over the deck
const POSTS = 1.6;
const BAR = 1.6;
const GRAVEL_LIFT = 0.07;
// what a plant keeps from: the tower's faces, the run-out, the path and the bridge (m)
const KEEP = { tower: 1.5, runout: 1.6, path: 1.7, bridge: 2.2 };

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Tower {
  constructor({ at, base, ground, water }) {
    this.at = at;
    this.base = base;
    this.group = new THREE.Group();
    this.group.name = 'whorl';
    this.group.position.set(at[0], base, at[1]);
    this.ready = false;
    this.solids = { tower: [], tube: [], bridge: [] };
    this.obstacles = [];
    this.materials = {
      solid: createBuildingMaterial(),
      net: createBuildingMaterial(),
      gravel: createBuildingMaterial(),
    };
    Object.assign(this.materials.net, { transparent: true, opacity: 0.38, depthWrite: false });
    Object.assign(this.materials.gravel, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    // the land, in the tower's frame
    this.ground = (x, z) => ground(at[0] + x, at[1] + z) - base;
    this.water = (x, z) => water(at[0] + x, at[1] + z) - base;
    this.bridge = bridgeLine();
    this.path = pathLine();
    this.mat = makeMat(this.materials.solid);
    this._steps = this._build();
  }

  // Build up to about ms more of it. → whether there's more to do.
  pump(ms) {
    const end = performance.now() + ms;
    while (!this.ready) {
      if (this._steps.next().done) this.ready = true;
      else if (performance.now() >= end) return true;
    }
    return false;
  }

  *_build() {
    const meshes = [];
    const add = (m, mat, cast = true) => {
      if (m.empty) return;
      const mesh = new THREE.Mesh(m.build(), mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      meshes.push(mesh);
    };
    const steel = new Mesher();
    const net = new Mesher();
    columns(steel);
    yield;
    ramp(steel);
    yield;
    topDeck(steel);
    yield;
    rails(steel, net);
    yield;
    bracing(steel);
    yield;
    add(steel, this.materials.solid);
    add(net, this.materials.net, false);
    yield;
    const tube = new Mesher();
    slide(tube);
    yield;
    supports(tube, this.ground);
    add(tube, this.materials.solid);
    yield;
    const wood = new Mesher();
    const bridgeSolids = footbridge(wood, this.bridge, this.ground, this.water);
    yield;
    const gravel = new Mesher();
    path(gravel, this.path, this.ground);
    yield;
    signs(wood, this.ground);
    mats(wood);
    add(wood, this.materials.solid);
    add(gravel, this.materials.gravel, false);
    yield;

    // what you bump into and stand on, in the world
    const [X, Z, Y] = [this.at[0], this.at[1], this.base];
    const place = (s) => ({ ...s, ax: s.ax + X, az: s.az + Z, bx: s.bx + X, bz: s.bz + Z, bottom: s.bottom + Y, topA: s.topA + Y, topB: s.topB + Y });
    this.solids = { tower: structure().solids.map(place), tube: tubeSolids().map(place), bridge: bridgeSolids.map(place) };
    // and what a builder's tools go round
    this.obstacles = [{ x: X, z: Z, r: TOWER.outside + 1.2, what: 'the Nautilus Lookout Tower' }];
    const p = slidePath();
    for (let i = 0; i < p.pts.length; i += 12) {
      const q = p.pts[i];
      if (apothemOf(q[0], q[2]) > TOWER.outside) this.obstacles.push({ x: X + q[0], z: Z + q[2], r: 0.9, what: 'the Whorl' });
    }
    const [a, b] = this.bridge;
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3);
    for (let i = 0; i <= n; i++) this.obstacles.push({ x: X + a[0] + ((b[0] - a[0]) * i) / n, z: Z + a[1] + ((b[1] - a[1]) * i) / n, r: BRIDGE.width / 2 + 0.3, what: 'the footbridge' });
    for (const m of meshes) this.group.add(m);
  }

  // Whether a plant at (x, z) (world) is to go: anything in or by the
  // tower, on the path or by the bridge, or under the run-out.
  clears(x, z, small = false) {
    const lx = x - this.at[0];
    const lz = z - this.at[1];
    if (Math.abs(lx) > 160 || Math.abs(lz) > 160) return false;
    if (apothemOf(lx, lz) < TOWER.outside + KEEP.tower) return true;
    if (nearLine(lx, lz, runout()) < KEEP.runout) return true;
    if (nearLine(lx, lz, this.path) < KEEP.path * (small ? 0.8 : 1)) return true;
    return nearLine(lx, lz, this.bridge) < KEEP.bridge;
  }
  // Whether grass grows at (x, z) (world): not under the tower (trodden), nor on the gravel.
  bare(x, z) {
    const lx = x - this.at[0];
    const lz = z - this.at[1];
    return apothemOf(lx, lz) < TOWER.outside + 0.3 || nearLine(lx, lz, this.path) < BRIDGE.path / 2 + 0.2;
  }

  dispose() {
    this.group.traverse((o) => o.isMesh && o.geometry.dispose());
    this.mat.geometry.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

// ── The steel ────────────────────────────────────────────────────────────────
function as(m, [, surf, wear]) {
  m.surf = surf;
  m.wear = wear;
}

// A flat face a b c d, turned to face `want` ([x, y, z]).
function face(m, a, b, c, d, color, want) {
  const n = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) quad(m, a, b, c, d, color);
  else quad(m, a, d, c, b, color);
}

// Square hollow columns at the corners, down into the ground.
function columns(m) {
  as(m, GALV);
  for (const c of structure().columns) beam(m, [c.x, -1.5, c.z], [c.x, c.top, c.z], TOWER.columns.r * 2, TOWER.columns.r * 2, GALV[0]);
}

// A slab of deck from u0 to u1 of a band (inner a0, outer a1), at heights
// y(u) along it: its top, underside and edges, and a beam under each edge.
function slab(m, at, u0, u1, y, a0, a1) {
  const [p0, p1, q0, q1] = [at(u0, a0), at(u1, a0), at(u0, a1), at(u1, a1)];
  const [h0, h1] = [y(u0), y(u1)];
  const d = TOWER.deck;
  const P = (p, h) => [p[0], h, p[1]];
  as(m, GRATING);
  face(m, P(p0, h0), P(p1, h1), P(q1, h1), P(q0, h0), GRATING[0], [0, 1, 0]);
  face(m, P(p0, h0 - d), P(p1, h1 - d), P(q1, h1 - d), P(q0, h0 - d), GRATING[0], [0, -1, 0]);
  const mid = [(p0[0] + q1[0]) / 2, (p0[1] + q1[1]) / 2];
  face(m, P(q0, h0), P(q1, h1), P(q1, h1 - d), P(q0, h0 - d), GRATING[0], [q0[0] - mid[0], 0, q0[1] - mid[1]]);
  face(m, P(p0, h0), P(p1, h1), P(p1, h1 - d), P(p0, h0 - d), GRATING[0], [mid[0] - p0[0], 0, mid[1] - p0[1]]);
  as(m, GALV);
  const b = TOWER.beam;
  for (const [s, e] of [[p0, p1], [q0, q1]]) beam(m, [s[0], h0 - d - b / 2, s[1]], [e[0], h1 - d - b / 2, e[1]], 0.12, b, GALV[0]);
  beam(m, [p0[0], h0 - d - b / 2, p0[1]], [q0[0], h0 - d - b / 2, q0[1]], 0.1, b, GALV[0]);
}

// The ramp, half a face at a time, from the ground to the top.
function ramp(m) {
  const steps = [];
  for (let k = 0; k <= TOWER.levels * 16; k++) steps.push(k / 16);
  steps.push(LEVEL_AT);
  steps.sort((a, b) => a - b);
  for (let i = 1; i < steps.length; i++) {
    if (steps[i] - steps[i - 1] < 1e-6) continue;
    slab(m, (u, a) => rampAt(u, a), steps[i - 1], steps[i], rampY, TOWER.rampIn, TOWER.rampOut);
  }
}

// The top deck, round the open middle.
function topDeck(m) {
  const at = (k, a) => onOctagon(k * 22.5, a);
  for (let k = 0; k < 16; k++) slab(m, at, k, k + 1, () => TOWER.top, TOWER.core, TOWER.rampIn);
}

// The rails: posts, a rail along the top, and mesh panels between.
function rails(m, net) {
  as(m, GALV);
  const R = TOWER.rail;
  for (const { a, b } of structure().rails) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(1, Math.ceil(len / POSTS));
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      beam(m, p, [p[0], p[1] + R, p[2]], 0.05, 0.05, GALV[0]);
    }
    beam(m, [a[0], a[1] + R, a[2]], [b[0], b[1] + R, b[2]], 0.06, 0.05, GALV[0]);
    beam(m, [a[0], a[1] + 0.08, a[2]], [b[0], b[1] + 0.08, b[2]], 0.04, 0.04, GALV[0]);
    net.surf = SURF.steel;
    net.wear = 0.5;
    quad(net, [a[0], a[1] + 0.1, a[2]], [b[0], b[1] + 0.1, b[2]], [b[0], b[1] + R - 0.04, b[2]], [a[0], a[1] + R - 0.04, a[2]], NET);
  }
}

// Cross-bracing on each outer face, above the slide's way out.
function bracing(m) {
  as(m, GALV);
  const cols = structure().columns.filter((c, i) => i % 3 === 0);
  const tiers = [3.4, 8.7, 14, TOWER.top];
  for (let k = 0; k < 8; k++) {
    const a = cols[k];
    const b = cols[(k + 1) % 8];
    for (let t = 1; t < tiers.length; t++) {
      const [y0, y1] = [tiers[t - 1], tiers[t]];
      beam(m, [a.x, y0, a.z], [b.x, y1, b.z], 0.09, 0.09, GALV[0]);
      beam(m, [b.x, y0, b.z], [a.x, y1, a.z], 0.09, 0.09, GALV[0]);
      beam(m, [a.x, y0, a.z], [b.x, y0, b.z], 0.1, 0.12, GALV[0]);
    }
  }
}

// ── The slide ────────────────────────────────────────────────────────────────
// The tube, swept along its path: an outside and an inside, smooth, with a
// lip where it's open; flanges round it at the joints.
function slide(m) {
  const p = slidePath();
  const R = [SLIDE.tube + SLIDE.wall, SLIDE.tube];
  const F = { t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0], c: [0, 0, 0] };
  const rings = []; // [i] -> { out: [index], in: [index] }
  const dir = (i, k) => {
    const th = (k / SIDES) * Math.PI * 2;
    const [c, s] = [Math.cos(th), Math.sin(th)];
    return [-c * F.u[0] + s * F.r[0], -c * F.u[1] + s * F.r[1], -c * F.u[2] + s * F.r[2]];
  };
  const open = (i) => p.s[i] < p.open[0] || p.s[i] > p.open[1];
  const every = 2;
  const idx = [];
  for (let i = 0; i < p.pts.length; i += every) idx.push(i);
  if (idx[idx.length - 1] !== p.pts.length - 1) idx.push(p.pts.length - 1);
  for (const i of idx) {
    tubeFrame(p, i, F);
    const ring = { out: [], in: [] };
    for (let k = 0; k < SIDES; k++) {
      const d = dir(i, k);
      for (const [w, r, list, sign, [col, surf, wear]] of [[0, R[0], ring.out, 1, STAINLESS], [1, R[1], ring.in, -1, INSIDE]]) {
        m.wear = wear;
        list.push(m.vertex(F.c[0] + d[0] * r, F.c[1] + d[1] * r, F.c[2] + d[2] * r, d[0] * sign, d[1] * sign, d[2] * sign, col, surf));
      }
    }
    rings.push({ i, ring, F: { c: F.c.slice(), u: F.u.slice(), r: F.r.slice(), t: F.t.slice() } });
  }
  // the skin between each ring and the next: all of it, or the trough
  const half = Math.round((TROUGH / (Math.PI * 2)) * SIDES);
  for (let n = 1; n < rings.length; n++) {
    const [A, B] = [rings[n - 1], rings[n]];
    const lidless = open(A.i) || open(B.i);
    for (let k = 0; k < SIDES; k++) {
      if (lidless && k >= half && k < SIDES - half) continue;
      const k1 = (k + 1) % SIDES;
      m.idx.push(A.ring.out[k], B.ring.out[k], B.ring.out[k1], A.ring.out[k], B.ring.out[k1], A.ring.out[k1]);
      m.idx.push(A.ring.in[k], B.ring.in[k1], B.ring.in[k], A.ring.in[k], A.ring.in[k1], B.ring.in[k1]);
    }
    // the lip along an open trough's edges
    if (lidless) {
      for (const k of [half, SIDES - half]) {
        const [a0, a1, b0, b1] = [A.ring.out[k], A.ring.in[k], B.ring.out[k], B.ring.in[k]];
        m.idx.push(a0, b0, b1, a0, b1, a1);
      }
    }
  }
  // the flanges at the joints, and the ends of the open trough
  as(m, STAINLESS);
  for (let n = 0; n < rings.length; n++) {
    const { i, F: f } = rings[n];
    if (i % FLANGE.every !== 0 || n === 0) continue;
    // (round the trough's sides, where it's open)
    const lidless = open(i);
    const ks = [];
    for (let k = 0; k < SIDES; k++) if (!lidless || k < half || k >= SIDES - half) ks.push(k);
    for (const k of ks) {
      const k1 = (k + 1) % SIDES;
      const pt = (kk, r, sh) => {
        const th = (kk / SIDES) * Math.PI * 2;
        const [c, s] = [Math.cos(th), Math.sin(th)];
        const d = [-c * f.u[0] + s * f.r[0], -c * f.u[1] + s * f.r[1], -c * f.u[2] + s * f.r[2]];
        return [f.c[0] + d[0] * r + f.t[0] * sh, f.c[1] + d[1] * r + f.t[1] * sh, f.c[2] + d[2] * r + f.t[2] * sh];
      };
      const ro = R[0] + FLANGE.out;
      const w = FLANGE.w / 2;
      quad(m, pt(k, ro, -w), pt(k1, ro, -w), pt(k1, ro, w), pt(k, ro, w), STAINLESS[0]);
      quad(m, pt(k, R[0], -w), pt(k1, R[0], -w), pt(k1, ro, -w), pt(k, ro, -w), STAINLESS[0]);
      quad(m, pt(k, ro, w), pt(k1, ro, w), pt(k1, R[0], w), pt(k, R[0], w), STAINLESS[0]);
    }
  }
}

// The run-out: the slide outside the tower, [[x, z], ...].
let out = null;
function runout() {
  if (out) return out;
  const p = slidePath();
  out = p.pts.filter((q) => apothemOf(q[0], q[2]) > TOWER.outside - 1).map((q) => [q[0], q[2]]);
  return out;
}

// What holds it up: brackets to the inner columns down the middle, and legs
// under it where it runs low, on its way out and along the run-out.
function supports(m, ground) {
  as(m, GALV);
  const p = slidePath();
  const inner = structure().columns.filter((c, i) => i % 3 === 2);
  const F = { t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0], c: [0, 0, 0] };
  const R = SLIDE.tube + SLIDE.wall;
  for (let i = 4; i < p.pts.length; i += 8) {
    tubeFrame(p, i, F);
    const [x, y, z] = F.c;
    const near = inner.reduce((best, c) => (Math.hypot(c.x - x, c.z - z) < Math.hypot(best.x - x, best.z - z) ? c : best), inner[0]);
    const d = Math.hypot(near.x - x, near.z - z);
    if (y > 2.2 && d < 3) {
      const [dx, dz] = [(near.x - x) / d, (near.z - z) / d];
      beam(m, [x + dx * R, y, z + dz * R], [near.x, y, near.z], 0.07, 0.07, GALV[0]);
      beam(m, [x + dx * R, y - 0.3, z + dz * R], [near.x, y + 0.5, near.z], 0.05, 0.05, GALV[0]);
    } else if (y < 2.6 && i % 8 === 4) {
      const g = ground(x, z);
      for (const s of [-1, 1]) {
        const fx = x + F.r[0] * s * R * 0.7;
        const fz = z + F.r[2] * s * R * 0.7;
        beam(m, [fx, y - R * 0.7, fz], [fx, g - 0.3, fz], 0.07, 0.07, GALV[0]);
      }
      beam(m, [x - F.r[0] * R, y - R * 0.75, z - F.r[2] * R], [x + F.r[0] * R, y - R * 0.75, z + F.r[2] * R], 0.06, 0.06, GALV[0]);
    }
  }
  // a bar across the mouth to hold on to as you sit in
  const a = onOctagon(MOUTH_BEARING - 7, TOWER.core + 0.05);
  const b = onOctagon(MOUTH_BEARING + 8, TOWER.core + 0.05);
  beam(m, [a[0], TOWER.top + BAR, a[1]], [b[0], TOWER.top + BAR, b[1]], 0.05, 0.05, GALV[0]);
  for (const q of [a, b]) beam(m, [q[0], TOWER.top, q[1]], [q[0], TOWER.top + BAR + 0.55, q[1]], 0.06, 0.06, GALV[0]);
}

// ── Getting there ────────────────────────────────────────────────────────────
// The footbridge: a timber deck on piles, level from bank to bank (or as
// high as it must be over the water), with a rail each side. → its solids.
function footbridge(m, [a, b], ground, water) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.ceil(len / 1.5));
  const [dx, dz] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const [nx, nz] = [-dz, dx];
  const half = BRIDGE.width / 2;
  const ends = [ground(a[0], a[1]) + 0.05, ground(b[0], b[1]) + 0.05];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const [x, z] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const w = water(x, z);
    const over = Math.max(ground(x, z) + 0.25, Number.isFinite(w) ? w + BRIDGE.over : -Infinity);
    pts.push([x, Math.max(ends[0] + (ends[1] - ends[0]) * f, over), z]);
  }
  const solids = [];
  as(m, TIMBER);
  for (let i = 0; i < n; i++) {
    const [p, q] = [pts[i], pts[i + 1]];
    const corner = (r, s, dy = 0) => [r[0] + nx * half * s, r[1] + dy, r[2] + nz * half * s];
    face(m, corner(p, -1), corner(q, -1), corner(q, 1), corner(p, 1), TIMBER[0], [0, 1, 0]);
    face(m, corner(p, -1, -0.12), corner(q, -1, -0.12), corner(q, 1, -0.12), corner(p, 1, -0.12), TIMBER[0], [0, -1, 0]);
    for (const s of [-1, 1]) {
      beam(m, corner(p, s * 0.85, -0.25), corner(q, s * 0.85, -0.25), 0.1, 0.22, TIMBER[0]);
      // a rail each side: a post at each step, a rail along the top and one half way
      const [pa, qa] = [corner(p, s * 0.97), corner(q, s * 0.97)];
      beam(m, pa, [pa[0], pa[1] + BRIDGE.rail, pa[2]], 0.09, 0.09, TIMBER[0]);
      for (const h of [BRIDGE.rail, BRIDGE.rail / 2]) beam(m, [pa[0], pa[1] + h, pa[2]], [qa[0], qa[1] + h, qa[2]], 0.07, 0.09, TIMBER[0]);
      solids.push({ ax: pa[0], az: pa[2], bx: qa[0], bz: qa[2], r: 0.06, bottom: Math.min(p[1], q[1]) - 0.3, topA: p[1] + 1.9, topB: q[1] + 1.9 });
    }
    // piles where it stands over low ground or water, every other step
    if (i % 2 === 0 && p[1] - ground(p[0], p[2]) > 0.5) {
      for (const s of [-1, 1]) {
        const c = corner(p, s * 0.85);
        beam(m, [c[0], c[1] - 0.25, c[2]], [c[0], ground(c[0], c[2]) - 1, c[2]], 0.2, 0.2, TIMBER[0]);
      }
    }
    solids.push({ ax: p[0], az: p[2], bx: q[0], bz: q[2], r: half, bottom: Math.min(p[1], q[1]) - 0.35, topA: p[1], topB: q[1], surface: 'boards' });
  }
  const last = pts[n];
  for (const s of [-1, 1]) {
    const c = [last[0] + nx * half * 0.97 * s, last[1], last[2] + nz * half * 0.97 * s];
    beam(m, c, [c[0], c[1] + BRIDGE.rail, c[2]], 0.09, 0.09, TIMBER[0]);
  }
  return solids;
}

// The path from the bridge to the foot of the ramp: gravel laid over the
// ground, a hand's breadth over it.
function path(m, line, ground) {
  as(m, GRAVEL);
  const half = BRIDGE.path / 2;
  const tri = [];
  for (let k = 1; k < line.length; k++) {
    const [a, b] = [line[k - 1], line[k]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [dx, dz] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const [nx, nz] = [-dz, dx];
    const n = Math.max(1, Math.ceil(len / 0.8));
    const across = 4;
    const row = (f) => {
      const [x, z] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const out = [];
      for (let j = 0; j <= across; j++) {
        const o = -half + (2 * half * j) / across;
        const [px, pz] = [x + nx * o, z + nz * o];
        out.push(V(px, ground(px, pz) + GRAVEL_LIFT, pz));
      }
      return out;
    };
    let prev = row(0);
    for (let i = 1; i <= n; i++) {
      const next = row(i / n);
      for (let j = 0; j < across; j++) tri.push(prev[j], next[j], prev[j + 1], prev[j + 1], next[j], next[j + 1]);
      prev = next;
    }
  }
  // (wound to face up)
  for (let i = 0; i < tri.length; i += 3) {
    const [p, q, r] = [tri[i], tri[i + 1], tri[i + 2]];
    const ny = (q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z);
    if (ny < 0) [tri[i + 1], tri[i + 2]] = [r, q];
  }
  const col = GRAVEL[0];
  m.tris(tri, () => col);
}

// A sign: a board facing (nx, nz), with its words in pale squares on it; on
// two posts standing on `foot`, or (null) hung from what's over it.
function sign(m, text, x, y, z, nx, nz, px, foot) {
  const L = layout(text);
  const w = L.width * px + 0.3;
  const h = L.height * px + 0.24;
  const [ux, uz] = [nz, -nx]; // along the board, left to right as you face it
  as(m, BOARD);
  box(m, x, y, z, w / 2, h / 2, 0.03, Math.atan2(nx, nz), BOARD[0]);
  as(m, TIMBER);
  for (const s of foot === null ? [] : [-1, 1]) {
    const [px0, pz0] = [x + ux * s * (w / 2 - 0.08) - nx * 0.06, z + uz * s * (w / 2 - 0.08) - nz * 0.06];
    beam(m, [px0, foot - 0.4, pz0], [px0, y + h / 2, pz0], 0.08, 0.08, TIMBER[0]);
  }
  m.surf = SURF.paint;
  m.wear = 0;
  const left = -L.width * px / 2;
  const top = y + h / 2 - 0.12;
  const d = 0.035;
  for (const [i, j] of L.dots) {
    const a = left + i * px;
    const v = top - j * px;
    const P = (da, dv) => [x + ux * (a + da) + nx * d, v - dv, z + uz * (a + da) + nz * d];
    quad(m, P(0, 0), P(0, px * 0.94), P(px * 0.94, px * 0.94), P(px * 0.94, 0), LETTER);
  }
}

// One where the climb starts, and one hung over the slide's mouth from the
// bar across it, facing the deck.
function signs(m, ground) {
  const [x, z] = [FOOT.x + 3.2, FOOT.z - 1.2];
  const g = ground(x, z);
  sign(m, 'NAUTILUS LOOKOUT TOWER', x, g + 1.5, z, 0, 1, 0.06, g);
  const at = onOctagon(MOUTH_BEARING + 0.5, TOWER.core + 0.05);
  const l = Math.hypot(at[0], at[1]);
  sign(m, 'THE WHORL', at[0], TOWER.top + BAR + 0.28, at[1], at[0] / l, at[1] / l, 0.032, null);
}

// A pile of mats by the mouth, to take one.
function mats(m) {
  m.surf = SURF.cloth;
  m.wear = 0;
  const at = onOctagon(MOUTH_BEARING - 14, TOWER.core + 0.9);
  for (let i = 0; i < 6; i++) box(m, at[0], TOWER.top + 0.03 + i * 0.035, at[1], 0.32, 0.016, 0.55, 0.4 + i * 0.07, FELT);
}

// The mat you ride on: a felt sack, its middle under your hips.
function makeMat(material) {
  const m = new Mesher();
  m.surf = SURF.cloth;
  box(m, 0, 0.02, 0.1, 0.3, 0.025, 0.62, 0, FELT);
  box(m, 0, 0.08, 0.68, 0.3, 0.06, 0.04, 0, FELT);
  const mesh = new THREE.Mesh(m.build(), material);
  mesh.castShadow = true;
  mesh.name = 'whorl mat';
  return mesh;
}

// Metres from (x, z) to the nearest stretch of a line [[x, z], ...].
function nearLine(x, z, line) {
  let best = Infinity;
  for (let k = 1; k < line.length; k++) {
    const [a, b] = [line[k - 1], line[k]];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}
