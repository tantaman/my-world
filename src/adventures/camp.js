// The outlaws' stronghold: a ring of sharpened logs stood on end with a gate
// in it, a watchtower either side at the back, tents, crates and barrels, a
// fire in the middle and a flag over it all. Made from primitives like
// everything else, merged into one mesh, built round its own middle (the
// mesh is put there; render/origin.js), and stood on the ground as it is:
// nothing is levelled for it, and nothing about it is saved.
//
//   buildCamp(site, ground, rnd) -> {
//     object    the camp, a THREE.Group, placed where it stands
//     flag      the flag, to wave
//     solids    capsules for the world's Solids (the stockade, towers, tents, crates)
//     walls     what stops a shot or a line of sight: [{ ax, az, bx, bz, bottom, top }]
//     towers    [{ x, z, y }]: where a man stands on each, up on its platform
//     posts     [{ x, z, yaw }]: where men stand guard on the ground
//     inside    [{ x, z }]: a round to walk inside the stockade
//     outside   [{ x, z }]: ...and one outside it
//     gate      { x, z, out: { x, z }, in: { x, z } }: the gate, and either side of it
//     fire      { x, y, z }
//     r         m from the middle to the stockade
//   }
//   site: { x, z, yaw } (the gate faces along yaw); ground(x, z) -> height

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';

export const CAMP = { r: 17, sides: 18, gate: 4.2, log: 0.17, high: 3.3, tower: 4.6 };
const COL = {
  bark: new THREE.Color(0x5a4430),
  barkDark: new THREE.Color(0x3e2e20),
  cut: new THREE.Color(0xb89a6a),
  canvas: new THREE.Color(0x8a7f62),
  canvasDark: new THREE.Color(0x6a604a),
  plank: new THREE.Color(0x7a5e40),
  iron: new THREE.Color(0x2a2624),
  stone: new THREE.Color(0x6a665e),
  flag: new THREE.Color(0x7a1a14),
  black: new THREE.Color(0x141210),
};
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function buildCamp(site, ground, rnd = Math.random) {
  const cos = Math.cos(site.yaw);
  const sin = Math.sin(site.yaw);
  // the camp's own frame (the gate along +z) to the world's, and back
  const toWorld = (lx, lz) => ({ x: site.x + lx * cos + lz * sin, z: site.z - lx * sin + lz * cos });
  const y0 = ground(site.x, site.z);
  const g = (lx, lz) => {
    const w = toWorld(lx, lz);
    return ground(w.x, w.z) - y0;
  };
  const m = new Mesher();
  const solids = [];
  const walls = [];
  const color = (c, spread = 0.12) => {
    const k = 1 - spread / 2 + rnd() * spread;
    return (p, n, out) => out.copy(c).multiplyScalar(k);
  };
  // a piece from local a to b ([x, y, z]), round, of radius r
  const rod = (a, b, r, c, sides = 6) => {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _v.length();
    _q.setFromUnitVectors(_up, _v.normalize());
    _m.compose(_s.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, new THREE.Vector3(1, 1, 1));
    m.add(new THREE.CylinderGeometry(r * 0.92, r, len, sides, 1), _m.clone(), typeof c === 'function' ? c : color(c));
  };
  const box = (x, y, z, w, h, d, c, ry = 0) => {
    _q.setFromAxisAngle(_up, ry);
    _m.compose(_s.set(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    m.add(new THREE.BoxGeometry(w, h, d), _m.clone(), typeof c === 'function' ? c : color(c));
  };
  const solid = (la, lb, r, top, bottom = 0) => {
    const a = toWorld(la[0], la[1]);
    const b = toWorld(lb[0], lb[1]);
    const ya = y0 + g(la[0], la[1]);
    const yb = y0 + g(lb[0], lb[1]);
    solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r, bottom: Math.min(ya, yb) - 0.5 + bottom, topA: ya + top, topB: yb + top });
    walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, bottom: Math.min(ya, yb) - 0.5 + bottom, top: Math.min(ya, yb) + top });
  };

  // ── The stockade ──────────────────────────────────────────────────────────
  const R = CAMP.r;
  const N = CAMP.sides;
  const corner = (i) => {
    const a = (i / N) * Math.PI * 2;
    return [Math.sin(a) * R, Math.cos(a) * R];
  };
  // the gate is in the side that faces along +z: side 0 runs from corner 0
  // round to corner 1, so start half a side back
  const turn = -Math.PI / N;
  const rot = (p) => [p[0] * Math.cos(turn) + p[1] * Math.sin(turn), -p[0] * Math.sin(turn) + p[1] * Math.cos(turn)];
  const gateHalf = CAMP.gate / 2;
  for (let i = 0; i < N; i++) {
    const a = rot(corner(i));
    const b = rot(corner(i + 1));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.round(len / (CAMP.log * 2));
    const pieces = [];
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      // the gate: a gap in the side facing out along +z
      if (i === 0 && Math.abs(x) < gateHalf) {
        pieces.push(null);
        continue;
      }
      const h = CAMP.high + (rnd() - 0.5) * 0.5;
      const base = g(x, z) - 0.4;
      const r = CAMP.log * (0.85 + rnd() * 0.3);
      rod([x, base, z], [x, base + h, z], r, rnd() < 0.3 ? COL.barkDark : COL.bark);
      // sharpened
      _m.compose(_s.set(x, base + h + 0.22, z), _q.identity(), new THREE.Vector3(1, 1, 1));
      m.add(new THREE.ConeGeometry(r, 0.44, 6), _m.clone(), color(COL.cut));
      pieces.push([x, z]);
    }
    // its solid and its wall, a run at a time (either side of the gate)
    let run = [];
    const flush = () => {
      if (run.length > 1) solid(run[0], run[run.length - 1], CAMP.log + 0.05, CAMP.high);
      run = [];
    };
    for (const p of pieces) {
      if (p) run.push(p);
      else flush();
    }
    flush();
    // a rail along the inside, holding them together
    if (i !== 0) {
      const ia = [a[0] * 0.985, a[1] * 0.985];
      const ib = [b[0] * 0.985, b[1] * 0.985];
      rod([ia[0], g(ia[0], ia[1]) + 2.2, ia[1]], [ib[0], g(ib[0], ib[1]) + 2.2, ib[1]], 0.07, COL.barkDark, 5);
    }
  }
  // gate posts, taller, either side
  for (const s of [-1, 1]) {
    const x = s * (gateHalf + 0.2);
    const z = R * Math.cos(Math.PI / N);
    rod([x, g(x, z) - 0.4, z], [x, g(x, z) + CAMP.high + 0.9, z], 0.22, COL.barkDark);
  }

  // ── Watchtowers, at the back either side ──────────────────────────────────
  const towers = [];
  for (const s of [-1, 1]) {
    const a = Math.PI + s * 0.85;
    const cx = Math.sin(a) * (R - 3.2);
    const cz = Math.cos(a) * (R - 3.2);
    const top = Math.max(g(cx, cz), g(cx + 1.2, cz + 1.2), g(cx - 1.2, cz - 1.2)) + CAMP.tower;
    for (const [px, pz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
      rod([cx + px, g(cx + px, cz + pz) - 0.3, cz + pz], [cx + px * 0.85, top + 2.3, cz + pz * 0.85], 0.12, COL.bark);
      solid([cx + px, cz + pz], [cx + px, cz + pz], 0.16, top + 2.3 - g(cx + px, cz + pz));
    }
    box(cx, top - 0.06, cz, 2.6, 0.12, 2.6, COL.plank);
    // railings, chest high, with gaps to shoot through
    for (const [ox, oz, w, d] of [[0, -1.25, 2.6, 0.08], [0, 1.25, 2.6, 0.08], [-1.25, 0, 0.08, 2.6], [1.25, 0, 0.08, 2.6]]) {
      box(cx + ox, top + 0.5, cz + oz, w, 0.1, d, COL.plank);
      box(cx + ox, top + 0.95, cz + oz, w, 0.1, d, COL.plank);
    }
    // a roof of boards, pitched
    _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
    _m.compose(_s.set(cx, top + 2.45, cz - 0.7), _q, new THREE.Vector3(1, 1, 1));
    m.add(new THREE.BoxGeometry(3, 0.08, 1.7), _m.clone(), color(COL.plank));
    _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35);
    _m.compose(_s.set(cx, top + 2.45, cz + 0.7), _q, new THREE.Vector3(1, 1, 1));
    m.add(new THREE.BoxGeometry(3, 0.08, 1.7), _m.clone(), color(COL.plank));
    // a ladder up the side facing in
    const lx = cx - Math.sin(a) * 1.25;
    const lz = cz - Math.cos(a) * 1.25;
    for (const o of [-0.25, 0.25]) rod([lx + Math.cos(a) * o, g(lx, lz), lz - Math.sin(a) * o], [lx + Math.cos(a) * o, top, lz - Math.sin(a) * o], 0.04, COL.barkDark, 4);
    for (let y = 0.4; y < top - g(lx, lz); y += 0.4) rod([lx - Math.cos(a) * 0.25, g(lx, lz) + y, lz + Math.sin(a) * 0.25], [lx + Math.cos(a) * 0.25, g(lx, lz) + y, lz - Math.sin(a) * 0.25], 0.03, COL.barkDark, 4);
    const w = toWorld(cx, cz);
    towers.push({ x: w.x, z: w.z, y: y0 + top });
  }

  // ── Tents ─────────────────────────────────────────────────────────────────
  const tents = [[-8, -4, 0.5], [7.5, -5, -0.4], [-6, 6.5, 1.9]];
  for (const [tx, tz, ry] of tents) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const L = 1.6; // half its length
    const W = 1.2; // half its width at the foot
    const H = 1.7;
    const P = (a, b, h) => new THREE.Vector3(tx + a * c + b * s, g(tx, tz) + h, tz - a * s + b * c);
    const ridgeA = P(0, -L, H);
    const ridgeB = P(0, L, H);
    const lA = P(-W, -L, 0);
    const lB = P(-W, L, 0);
    const rA = P(W, -L, 0);
    const rB = P(W, L, 0);
    const cnv = (p, n, out) => out.copy(n.y > 0.3 ? COL.canvas : COL.canvasDark);
    m.tris([ridgeA, lA, lB, ridgeA, lB, ridgeB, ridgeA, rB, rA, ridgeA, ridgeB, rB, ridgeA, rA, lA], cnv);
    m.tris([ridgeB, lB, rB], (p, n, out) => out.copy(COL.black));
    solid([tx + -L * s, tz + -L * c], [tx + L * s, tz + L * c], W * 0.85, H);
  }

  // ── Crates and barrels ────────────────────────────────────────────────────
  const stacks = [[3.5, 6, 0.3], [-3, -9, 0.9], [9.5, 3, -0.2], [-11, 1, 0.5], [2.5, -10.5, 0.1]];
  for (const [sx, sz, ry] of stacks) {
    const gy = g(sx, sz);
    box(sx, gy + 0.4, sz, 0.8, 0.8, 0.8, COL.plank, ry);
    box(sx + 0.85, gy + 0.4, sz + 0.1, 0.8, 0.8, 0.8, COL.plank, ry + 0.2);
    box(sx + 0.4, gy + 1.15, sz, 0.75, 0.7, 0.75, COL.plank, ry - 0.3);
    rod([sx - 0.8, gy, sz + 0.6], [sx - 0.8, gy + 0.95, sz + 0.6], 0.32, COL.barkDark, 8);
    solid([sx - 0.8, sz], [sx + 1.2, sz + 0.2], 0.62, 1.1);
  }

  // ── The fire, ringed with stones, and the flag ────────────────────────────
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    _m.compose(_s.set(Math.sin(a) * 0.7, g(0, 0) + 0.08, Math.cos(a) * 0.7), _q.identity(), new THREE.Vector3(0.28, 0.18, 0.24));
    m.add(new THREE.IcosahedronGeometry(1, 0), _m.clone(), color(COL.stone, 0.3));
  }
  rod([0.3, g(0, 0) + 0.1, -0.3], [-0.3, g(0, 0) + 0.25, 0.3], 0.06, COL.barkDark, 5);
  const fireAt = toWorld(0, 0);
  const pole = [0, -6];
  rod([pole[0], g(...pole) - 0.3, pole[1]], [pole[0], g(...pole) + 7.5, pole[1]], 0.07, COL.barkDark, 5);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(m.build(), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const object = new THREE.Group();
  object.name = 'stronghold';
  object.position.set(site.x, y0, site.z);
  object.rotation.y = site.yaw;
  object.add(mesh);

  // the flag, a plane of its own so it can wave
  const flagGeo = new THREE.PlaneGeometry(1.6, 1, 8, 1).translate(0.8, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: COL.flag, roughness: 1, side: THREE.DoubleSide }));
  flag.position.set(pole[0], g(...pole) + 6.9, pole[1]);
  flag.userData.rest = flagGeo.attributes.position.array.slice();
  object.add(flag);

  // where men stand and walk
  const posts = [];
  const gz = R * Math.cos(Math.PI / N);
  for (const s of [-1, 1]) {
    const w = toWorld(s * (gateHalf + 1.2), gz + 1.6);
    posts.push({ x: w.x, z: w.z, yaw: site.yaw });
  }
  const round = (r, n) => Array.from({ length: n }, (_, i) => toWorld(Math.sin((i / n) * Math.PI * 2) * r, Math.cos((i / n) * Math.PI * 2) * r));
  return {
    object,
    flag,
    solids,
    walls,
    towers,
    posts,
    inside: round(R * 0.62, 7),
    outside: round(R + 6, 10),
    gate: { ...toWorld(0, gz), out: toWorld(0, gz + 3.5), in: toWorld(0, gz - 3.5) },
    fire: { x: fireAt.x, y: y0 + g(0, 0), z: fireAt.z },
    r: R,
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      flag.geometry.dispose();
      flag.material.dispose();
    },
  };
}

// Wave the flag in the wind (t: seconds, wind: how hard it blows).
export function waveFlag(flag, t, wind) {
  const P = flag.geometry.attributes.position;
  const rest = flag.userData.rest;
  for (let i = 0; i < P.count; i++) {
    const x = rest[i * 3];
    P.setZ(i, Math.sin(x * 3 - t * (4 + wind * 2)) * 0.12 * x * (0.6 + wind * 0.4));
  }
  P.needsUpdate = true;
}

// Where a ray from o along d (unit) first meets one of the walls, within
// far: -> t or null. The walls are upright: met in plan, then held to their
// height where it crosses.
export function rayWalls(walls, o, d, far = Infinity, near = 0) {
  let best = null;
  const dl = Math.hypot(d.x, d.z);
  if (dl < 1e-6) return null;
  for (const w of walls) {
    const ex = w.bx - w.ax;
    const ez = w.bz - w.az;
    const den = d.x * ez - d.z * ex;
    if (Math.abs(den) < 1e-9) continue;
    const fx = w.ax - o.x;
    const fz = w.az - o.z;
    const t = (fx * ez - fz * ex) / den;
    const u = (fx * d.z - fz * d.x) / den;
    if (t < near || t > (best ?? far) || u < -0.02 || u > 1.02) continue;
    const y = o.y + d.y * t;
    if (y < w.bottom || y > w.top) continue;
    best = t;
  }
  return best;
}
