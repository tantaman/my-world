// What a treasure hunt puts in the world while it's on, and takes away
// after: the mark on the way (a cairn, a post with a cross cut in it, a
// rusted pick left in the ground), the patch of turned earth over where it's
// buried, the holes you dig, and the chest. Fetched when the first hunt is
// begun (core/lazy.ts): nobody needs it before.
//
// Each is built round its own origin, on the ground there, and put in the
// world as a mesh (render/origin.js). Draped things (the earth, a hole) are
// handed the ground and follow it.
//
//   marker(kind, seed)        -> Object3D, its foot at its origin
//   patch(ground, x, z)       -> Object3D at (x, ground, z)
//   hole(ground, x, z, side)  -> Object3D: the hole, and the heap thrown up beside it (side: radians)
//   chest()                   -> { object, lid }: open it by turning lid.rotation.x down to OPEN
//   dispose(object)

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF, createBuildingMaterial } from '../build/surfaces.js';
import { mulberry32 } from '../noise.js';

const MAT = createBuildingMaterial();
export const OPEN = -1.95; // radians: the lid thrown back
const EARTH = new THREE.Color(0x4a3524);
const LOOSE = new THREE.Color(0x5e4430);
const DARK = new THREE.Color(0x150d07);
const STONE = new THREE.Color(0x8a857a);
const STONE_DARK = new THREE.Color(0x5d5951);
const OAK = new THREE.Color(0x5a3a22);
const OAK_DARK = new THREE.Color(0x3a2414);
const IRON = new THREE.Color(0x2a2624);
const BRASS = new THREE.Color(0xb08a3a);
const GOLD = new THREE.Color(0xe2b443);
const RUST = new THREE.Color(0x6b3a1f);
const HAFT = new THREE.Color(0x8c6b45);
const PATCH_R = 1.4; // m across the turned earth over the spot
const HOLE_R = 0.55; // m, a hole's mouth
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

const paint = (c) => (p, n, out) => out.copy(c);
// A box w × h × d, its middle at (x, y, z), turned by (rx, ry, rz).
function box(m, w, h, d, x, y, z, color, surf, rx = 0, ry = 0, rz = 0) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1));
  m.add(new THREE.BoxGeometry(w, h, d), _m, paint(color), null, surf);
}
// A stone: a lump, squashed and turned.
function stone(m, r, x, y, z, sx, sy, sz, rnd) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rnd() * 0.4, rnd() * 6.3, rnd() * 0.4)), _s.set(sx, sy, sz));
  const c = STONE.clone().lerp(STONE_DARK, rnd() * 0.6);
  m.add(new THREE.DodecahedronGeometry(r, 0), _m, paint(c), null, SURF.stone);
}
function mesh(m, name) {
  const out = new THREE.Mesh(m.build(), MAT);
  out.castShadow = true;
  out.receiveShadow = true;
  out.name = name;
  return out;
}

// ── The mark on the way ─────────────────────────────────────────────────────
export function marker(kind, seed = 1) {
  const rnd = mulberry32(seed);
  const m = new Mesher();
  if (kind === 'cairn') {
    // stones piled up, each smaller than the one under it
    let y = 0;
    for (const r of [0.34, 0.28, 0.22, 0.16, 0.11]) {
      const h = r * 0.62;
      stone(m, r, (rnd() - 0.5) * 0.06, y + h * 0.75, (rnd() - 0.5) * 0.06, 1.1, 0.62, 1, rnd);
      y += h * 1.35;
    }
  } else if (kind === 'post') {
    // a weathered post, leaning a little, with a cross cut into its face
    m.wear = 0.8;
    box(m, 0.16, 1.3, 0.16, 0, 0.6, 0, HAFT.clone().multiplyScalar(0.75), SURF.wood, 0.03, 0, -0.04);
    m.wear = 0;
    box(m, 0.03, 0.26, 0.012, 0.0, 0.95, 0.081, OAK_DARK, SURF.plain, 0, 0, 0.8);
    box(m, 0.03, 0.26, 0.012, 0.0, 0.95, 0.081, OAK_DARK, SURF.plain, 0, 0, -0.8);
    stone(m, 0.13, 0.16, 0.04, 0.05, 1, 0.6, 1, rnd);
    stone(m, 0.11, -0.12, 0.03, -0.13, 1, 0.6, 1, rnd);
  } else {
    // a pick, its point driven into the ground and its haft leaning
    _m.compose(_p.set(0.12, 0.42, 0), _q.setFromEuler(_e.set(0, 0, 0.35)), _s.set(1, 1, 1));
    m.add(new THREE.CylinderGeometry(0.025, 0.03, 0.9, 7), _m, paint(HAFT), null, SURF.wood);
    box(m, 0.62, 0.05, 0.05, -0.02, 0.05, 0, RUST, SURF.iron, 0, 0, 0.35 - 0.25);
    box(m, 0.07, 0.08, 0.07, 0.0, 0.07, 0, RUST, SURF.iron, 0, 0, 0.35);
  }
  return mesh(m, 'treasure-mark');
}

// ── The ground ──────────────────────────────────────────────────────────────
// A flat thing laid on the ground round (x, z) and following it, lift m over.
function drape(m, geo, color, ground, x, z, lift, y0) {
  geo.rotateX(-Math.PI / 2);
  m.add(geo, _m.identity(), color, (p) => (p.y += ground(x + p.x, z + p.z) - y0 + lift), SURF.plain);
}

// The turned earth over the spot: a bare patch, darker, a few stones kicked up.
export function patch(ground, x, z) {
  const y0 = ground(x, z);
  const m = new Mesher();
  const rnd = mulberry32(Math.floor(x * 7 + z * 13) | 0);
  const shade = (p, n, out) => out.copy(EARTH).lerp(LOOSE, Math.min(1, Math.hypot(p.x, p.z) / PATCH_R));
  drape(m, new THREE.CircleGeometry(PATCH_R, 20), shade, ground, x, z, 0.025, y0);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    const r = PATCH_R * (0.4 + rnd() * 0.6);
    const sx = Math.cos(a) * r;
    const sz = Math.sin(a) * r;
    stone(m, 0.06 + rnd() * 0.05, sx, ground(x + sx, z + sz) - y0 + 0.02, sz, 1, 0.6, 1, rnd);
  }
  const out = mesh(m, 'treasure-patch');
  out.castShadow = false;
  out.position.set(x, y0, z);
  return out;
}

// A hole: dark in the middle, a lip of loose earth round it, and the heap of
// what came out of it thrown to one side.
export function hole(ground, x, z, side = 0) {
  const y0 = ground(x, z);
  const m = new Mesher();
  const deep = (p, n, out) => out.copy(DARK).lerp(EARTH, Math.min(1, (Math.hypot(p.x, p.z) / HOLE_R) ** 2));
  drape(m, new THREE.CircleGeometry(HOLE_R, 16), deep, ground, x, z, 0.035, y0);
  // the lip
  const lip = new THREE.TorusGeometry(HOLE_R + 0.05, 0.07, 5, 18);
  drape(m, lip, paint(LOOSE), ground, x, z, 0.03, y0);
  // the heap
  const hx = Math.sin(side) * 1.0;
  const hz = Math.cos(side) * 1.0;
  _m.compose(_p.set(hx, ground(x + hx, z + hz) - y0, hz), _q.setFromEuler(_e.set(0, side, 0)), _s.set(0.75, 0.32, 0.55));
  m.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), _m, paint(LOOSE), null, SURF.plain);
  const out = mesh(m, 'treasure-hole');
  out.position.set(x, y0, z);
  return out;
}

// ── The chest ───────────────────────────────────────────────────────────────
// Oak bound with iron, a brass lock; inside, gold. The lid turns on its back
// edge.
export function chest() {
  const W = 0.78;
  const H = 0.4;
  const D = 0.5;
  const body = new Mesher();
  body.wear = 0.7;
  box(body, W, 0.04, D, 0, 0.02, 0, OAK_DARK, SURF.wood);
  box(body, W, H, 0.04, 0, H / 2, D / 2 - 0.02, OAK, SURF.wood);
  box(body, W, H, 0.04, 0, H / 2, -D / 2 + 0.02, OAK, SURF.wood);
  box(body, 0.04, H, D - 0.08, W / 2 - 0.02, H / 2, 0, OAK, SURF.wood);
  box(body, 0.04, H, D - 0.08, -W / 2 + 0.02, H / 2, 0, OAK, SURF.wood);
  body.wear = 0.4;
  for (const x of [-0.27, 0.27]) box(body, 0.05, H + 0.01, D + 0.02, x, H / 2, 0, IRON, SURF.iron);
  box(body, 0.1, 0.12, 0.03, 0, H - 0.08, D / 2 + 0.01, BRASS, SURF.plain);
  // the gold, heaped up inside
  _m.compose(_p.set(0, H - 0.1, 0), _q.identity(), _s.set(W / 2 - 0.05, 0.14, D / 2 - 0.05));
  body.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), _m, (p, n, out) => out.copy(GOLD).multiplyScalar(0.85 + 0.3 * Math.abs(Math.sin(p.x * 40 + p.z * 31))), null, SURF.plain);

  const lid = new Mesher();
  lid.wear = 0.7;
  // (built round its hinge, along the back edge at the top)
  box(lid, W + 0.02, 0.1, D + 0.02, 0, 0.05, D / 2, OAK, SURF.wood);
  lid.wear = 0.4;
  for (const x of [-0.27, 0.27]) box(lid, 0.05, 0.11, D + 0.04, x, 0.05, D / 2, IRON, SURF.iron);
  const lidMesh = mesh(lid, 'treasure-lid');
  const hinge = new THREE.Group();
  hinge.position.set(0, H, -D / 2);
  hinge.add(lidMesh);

  const object = new THREE.Group();
  object.name = 'treasure-chest';
  object.add(mesh(body, 'treasure-chest-body'), hinge);
  return { object, lid: hinge, height: H + 0.1 };
}

export function dispose(object) {
  object.traverse((o) => o.isMesh && o.geometry.dispose());
}
