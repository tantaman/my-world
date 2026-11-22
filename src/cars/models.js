// The cars, made in code like everything else. Each is a body pressed out
// from its side view (the lower body, from bumper to bumper up to the waist;
// and the cabin over it, narrowing to its roof, glass all round between its
// pillars), on four wheels that turn as it rolls and, at the front, as it
// steers; with lamps at both ends, bumpers, a grille, mirrors and handles.
// A pickup has an open bed behind its cab, and a four-by-four a spare wheel
// on its back door.
//
// It is built round the point on the ground under its middle, which is where
// it is put (place), and it pitches and rolls about it. +z is forward, +x its
// left, +y up. The driver sits on the left.
//
//   new CarModel(kind, paint, materials)   materials: { body, glow }
//     object        the group to put in the scene
//     place(car)    where it is and how it sits ({ x, y, z, yaw, pitch, roll,
//                   steer, spin }: drive.js's Car, or one like it)
//     lit(on)       its lamps on or off
//     seat(out)     where the driver's hips are, in the world
//     door(out)     where you stand to get in, beside the driver's door, in
//                   the world (out.yaw: facing the car)

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF } from '../build/surfaces.js';
import { KINDS } from './kinds.js';

const col = (hex) => new THREE.Color(hex);
export const PAL = {
  glass: col(0x1d2730),
  trim: col(0x2a2b2d),
  chrome: col(0xb9bcbf),
  tyre: col(0x1a1a1b),
  hub: col(0x9a9ea2),
  lamp: col(0xf4efd8),
  tail: col(0xb3241c),
  amber: col(0xe39a2a),
  bed: col(0x2e2f31),
  plate: col(0xe8e4d4),
  under: col(0x232324),
};

// Each shape, as fractions of the car's length (from the back, 0, to the
// front, 1) and of its height:
//   low     the lower body's side view: [along, up], round from the back bumper
//   cabin   the cabin's: [along, up], from the foot of the back window round
//           over the roof to the foot of the windscreen
//   waist   how high the lower body's top is (the cabin stands on it)
//   tuck    how much narrower the roof is than the body, a side
//   bed     a pickup's open bed: [from, to] along
const SHAPES = {
  hatch: {
    low: [[0, 0.2], [0, 0.5], [0.04, 0.56], [0.78, 0.58], [0.97, 0.5], [1, 0.38], [1, 0.2]],
    cabin: [[0.04, 0.56], [0.12, 0.98], [0.6, 1], [0.8, 0.58]],
    waist: 0.57,
    tuck: 0.11,
  },
  sedan: {
    low: [[0, 0.22], [0, 0.52], [0.03, 0.6], [0.24, 0.62], [0.74, 0.63], [0.97, 0.56], [1, 0.42], [1, 0.22]],
    cabin: [[0.17, 0.62], [0.32, 0.99], [0.6, 1], [0.76, 0.63]],
    waist: 0.62,
    tuck: 0.1,
  },
  pickup: {
    low: [[0, 0.22], [0, 0.56], [0.02, 0.58], [0.7, 0.6], [0.97, 0.56], [1, 0.45], [1, 0.22]],
    cabin: [[0.4, 0.6], [0.41, 1], [0.64, 1], [0.76, 0.6]],
    waist: 0.6,
    tuck: 0.06,
    bed: [0.02, 0.39],
  },
  wagon: {
    low: [[0, 0.2], [0, 0.54], [0.02, 0.56], [0.86, 0.58], [0.99, 0.54], [1, 0.4], [1, 0.2]],
    cabin: [[0.03, 0.56], [0.05, 1], [0.7, 1], [0.84, 0.58]],
    waist: 0.57,
    tuck: 0.05,
    spare: true,
  },
};

const _v = new THREE.Vector3();
const _c = new THREE.Color();

// ── Writing geometry ─────────────────────────────────────────────────────────

function vert(m, p, n, c) {
  m.pos.push(p[0], p[1], p[2]);
  m.nor.push(n[0], n[1], n[2]);
  m.col.push(c.r, c.g, c.b);
  m.kind.push(SURF.plain);
  m.uv.push(0, 0);
  return m.n++;
}

// A flat face through corners [x, y, z] in order round it (3 or more), one colour.
function face(m, pts, color) {
  const [a, b, c] = pts;
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  const n = [nx / l, ny / l, nz / l];
  const base = vert(m, pts[0], n, color);
  for (let i = 1; i < pts.length; i++) vert(m, pts[i], n, color);
  for (let i = 1; i < pts.length - 1; i++) m.idx.push(base, base + i, base + i + 1);
}

// A box from (x0, y0, z0) to (x1, y1, z1).
function block(m, x0, y0, z0, x1, y1, z1, color) {
  const shade = (k) => _c.copy(color).multiplyScalar(k).clone();
  face(m, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], shade(1.05));
  face(m, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], shade(0.6));
  face(m, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade(0.95));
  face(m, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], shade(0.9));
  face(m, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], shade(0.85));
  face(m, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], shade(0.85));
}

// A shape pressed out across the car: its side view `prof` ([z, y], round
// it), half as wide as half(y) at each height. Its sides are `side`, the
// skin round it `skin` (or skin(k): the colour of the stretch from point k to
// the next).
function pressed(m, prof, half, side, skin) {
  const L = prof.map(([z, y]) => [half(y), y, z]);
  const R = prof.map(([z, y]) => [-half(y), y, z]);
  face(m, [...L].reverse(), side);
  face(m, R, side);
  for (let k = 0; k < prof.length; k++) {
    const j = (k + 1) % prof.length;
    const c = typeof skin === 'function' ? skin(k) : skin;
    if (c) face(m, [L[k], L[j], R[j], R[k]], c);
  }
}

// ── A car ────────────────────────────────────────────────────────────────────
export class CarModel {
  constructor(kind, paint, materials) {
    const K = KINDS[kind];
    const S = SHAPES[K.body];
    this.kind = kind;
    this.k = K;
    const paintC = new THREE.Color(paint);
    const m = new Mesher();
    const glow = new Mesher();
    const len = K.len;
    const hw = K.wide / 2;
    const H = K.tall;
    const z = (f) => -len / 2 + f * len;
    const y = (f) => f * H;
    const lowY = K.clear;

    // ── the lower body ──
    const low = S.low.map(([f, u]) => [z(f), Math.max(lowY, y(u))]);
    const lowHalf = (yy) => hw - 0.04 * Math.max(0, (yy - y(S.waist) + 0.12) / 0.12);
    pressed(m, low, lowHalf, paintC, (k) => (k === low.length - 1 ? PAL.under : _c.copy(paintC).multiplyScalar(k === 2 || k === 3 ? 1.08 : 0.95).clone()));

    // ── the cabin: glass between pillars, a painted roof ──
    const cab = S.cabin.map(([f, u]) => [z(f), y(u)]);
    const waist = y(S.waist);
    const top = H;
    const tuck = S.tuck;
    const cabHalf = (yy) => (hw - 0.05) * (1 - tuck * Math.max(0, (yy - waist) / (top - waist)));
    const glass = PAL.glass;
    // the skin round it: back window, roof, windscreen; the sides are glass
    pressed(m, cab, cabHalf, glass, (k) => (k === 1 ? _c.copy(paintC).multiplyScalar(1.1).clone() : k === cab.length - 1 ? null : glass));
    // pillars, painted, over the glass at its corners and between the doors
    const pillar = (fz0, fz1, w) => {
      for (const side of [1, -1]) {
        const a = [z(fz0), waist];
        const b = [z(fz1), top - 0.02];
        const xa = side * (cabHalf(a[1]) + 0.012);
        const xb = side * (cabHalf(b[1]) + 0.012);
        face(m, side > 0 ? [[xa, a[1], a[0] - w], [xa, a[1], a[0] + w], [xb, b[1], b[0] + w], [xb, b[1], b[0] - w]] : [[xa, a[1], a[0] + w], [xa, a[1], a[0] - w], [xb, b[1], b[0] - w], [xb, b[1], b[0] + w]], paintC);
      }
    };
    const [c0, c1, c2, c3] = S.cabin;
    pillar(c3[0], c2[0], 0.05); // the windscreen's
    pillar(c0[0], c1[0], 0.06); // the back window's
    pillar((c1[0] + c2[0]) / 2 + 0.04, (c1[0] + c2[0]) / 2, 0.045); // between the doors
    // the windscreen's frame along the roof, the window's along the waist
    for (const side of [1, -1]) {
      const x = side * (cabHalf(waist + 0.02) + 0.01);
      face(m, side > 0 ? [[x, waist, z(c0[0])], [x, waist, z(c3[0])], [x, waist + 0.05, z(c3[0]) - 0.02], [x, waist + 0.05, z(c0[0]) + 0.02]] : [[x, waist, z(c3[0])], [x, waist, z(c0[0])], [x, waist + 0.05, z(c0[0]) + 0.02], [x, waist + 0.05, z(c3[0]) - 0.02]], paintC);
    }

    // ── a pickup's bed ──
    if (S.bed) {
      const [b0, b1] = S.bed.map(z);
      const floor = y(0.36);
      const rim = waist;
      block(m, -hw + 0.05, floor - 0.04, b0, hw - 0.05, floor, b1, PAL.bed);
      for (const side of [1, -1]) block(m, side > 0 ? hw - 0.09 : -hw + 0.02, floor, b0, side > 0 ? hw - 0.02 : -hw + 0.09, rim, b1, paintC);
      block(m, -hw + 0.02, floor, b0, hw - 0.02, rim, b0 + 0.07, paintC);
      block(m, -hw + 0.02, floor, b1 - 0.07, hw - 0.02, rim + 0.04, b1, paintC);
      // the cab's back window over the bed
      block(m, -hw * 0.6, rim + 0.08, b1 - 0.005, hw * 0.6, top - 0.12, b1 + 0.01, glass);
    }

    // ── bumpers, grille, plates, mirrors, handles ──
    const bumperY = [lowY + 0.04, lowY + 0.2];
    block(m, -hw + 0.02, bumperY[0], z(1) - 0.02, hw - 0.02, bumperY[1], z(1) + 0.08, PAL.trim);
    block(m, -hw + 0.02, bumperY[0], z(0) - 0.08, hw - 0.02, bumperY[1], z(0) + 0.02, PAL.trim);
    const front = low.reduce((a, p) => Math.max(a, p[0]), -Infinity);
    block(m, -hw * 0.45, bumperY[1] + 0.04, front - 0.02, hw * 0.45, y(0.45), front + 0.012, PAL.trim);
    block(m, -0.24, bumperY[0] + 0.02, z(0) - 0.095, 0.24, bumperY[1] - 0.02, z(0) - 0.08, PAL.plate);
    for (const side of [1, -1]) {
      const mz = z(c3[0]) - 0.05;
      block(m, side > 0 ? hw - 0.02 : -hw - 0.12, waist + 0.02, mz - 0.1, side > 0 ? hw + 0.12 : -hw + 0.02, waist + 0.14, mz, PAL.trim);
      const hz = (z(c3[0]) + z(c0[0])) / 2 + 0.25;
      block(m, side > 0 ? hw - 0.02 : -hw - 0.025, waist - 0.12, hz - 0.12, side > 0 ? hw + 0.025 : -hw + 0.02, waist - 0.08, hz, PAL.chrome);
    }
    // a spare wheel on a four-by-four's back door
    if (S.spare) {
      const r = K.wheel * 0.95;
      const zz = z(0) - 0.12;
      const yy = y(0.55);
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        face(m, [[0, yy, zz - 0.1], [Math.cos(a1) * r, yy + Math.sin(a1) * r, zz - 0.1], [Math.cos(a0) * r, yy + Math.sin(a0) * r, zz - 0.1]], PAL.tyre);
        face(m, [[Math.cos(a0) * r, yy + Math.sin(a0) * r, zz - 0.1], [Math.cos(a1) * r, yy + Math.sin(a1) * r, zz - 0.1], [Math.cos(a1) * r, yy + Math.sin(a1) * r, zz + 0.1], [Math.cos(a0) * r, yy + Math.sin(a0) * r, zz + 0.1]], PAL.tyre);
      }
    }

    // ── lamps (they glow) ──
    const lampY = [y(0.42), y(0.5)];
    for (const side of [1, -1]) {
      const x0 = side * (hw - 0.12);
      const x1 = side * (hw - 0.42);
      block(glow, Math.min(x0, x1), lampY[0], front - 0.02, Math.max(x0, x1), lampY[1], front + 0.03, PAL.lamp);
      block(glow, Math.min(x0, x1), lampY[0] + 0.02, z(0) - 0.03, Math.max(x0, x1), lampY[1] + 0.04, z(0) + 0.02, PAL.tail);
    }

    this.object = new THREE.Group();
    this.object.rotation.order = 'YXZ';
    const body = new THREE.Mesh(m.build(), materials.body);
    body.castShadow = true;
    body.receiveShadow = true;
    this.object.add(body);
    this.lamps = new THREE.Mesh(glow.build(), materials.glow);
    this.object.add(this.lamps);
    this.glowMat = materials.glow;

    // ── wheels ──
    this.wheels = [];
    const tyre = new THREE.CylinderGeometry(K.wheel, K.wheel, 0.24, 18);
    tyre.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(K.wheel * 0.55, K.wheel * 0.55, 0.26, 10);
    hub.rotateZ(Math.PI / 2);
    for (const [along, side] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (K.track / 2), K.wheel, (along * K.base) / 2);
      const spin = new THREE.Group();
      const t = new THREE.Mesh(tyre, materials.tyre || (materials.tyre = new THREE.MeshStandardMaterial({ color: PAL.tyre, roughness: 0.9 })));
      const h = new THREE.Mesh(hub, materials.hub || (materials.hub = new THREE.MeshStandardMaterial({ color: PAL.hub, roughness: 0.4, metalness: 0.5 })));
      t.castShadow = true;
      spin.add(t, h);
      // a spoke, so it can be seen to turn
      const spoke = new THREE.Mesh(materials.spokeGeo || (materials.spokeGeo = new THREE.BoxGeometry(0.27, K.wheel * 1.0, 0.07)), materials.tyre);
      spin.add(spoke);
      pivot.add(spin);
      this.object.add(pivot);
      this.wheels.push({ pivot, spin, front: along > 0 });
    }
    this.on = false;
    this.lit(false);
  }

  place(car) {
    const o = this.object;
    o.position.set(car.x, car.y, car.z);
    o.rotation.set(-car.pitch, car.yaw, car.roll);
    for (const w of this.wheels) {
      w.spin.rotation.x = car.spin;
      w.pivot.rotation.y = w.front ? -car.steer : 0;
    }
    o.updateMatrixWorld(true);
  }

  lit(on) {
    this.on = on;
    this.lamps.material = on ? this.glowMat : this.dimMat || (this.dimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }));
  }

  // Where the driver's hips are, in the world.
  seat(out) {
    const s = this.k.seat;
    _v.set(s.across, s.up, s.along);
    this.object.localToWorld(_v);
    out.x = _v.x;
    out.y = _v.y;
    out.z = _v.z;
    out.yaw = this.object.rotation.y;
    return out;
  }

  // Where to stand to get in: beside the driver's door, facing the car (or
  // with side -1, the other side; 0: behind it, 2: in front of it).
  door(out, side = 1) {
    const s = this.k.seat;
    if (side === 0 || side === 2) {
      _v.set(0, 0, (side === 2 ? 1 : -1) * (this.k.len / 2 + 0.8));
      this.object.localToWorld(_v);
      out.x = _v.x;
      out.y = _v.y;
      out.z = _v.z;
      out.yaw = this.object.rotation.y + (side === 2 ? Math.PI : 0);
      return out;
    }
    _v.set(side * (this.k.wide / 2 + 0.75), 0, s.along);
    this.object.localToWorld(_v);
    out.x = _v.x;
    out.y = _v.y;
    out.z = _v.z;
    out.yaw = this.object.rotation.y - (side * Math.PI) / 2;
    return out;
  }
}
