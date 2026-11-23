// The trains: a little wood-burning engine (a 2-6-0, three pairs of driving
// wheels and a pony truck in front of them, a diamond stack, a brass dome),
// its tender stacked with firewood, and two open cars with benches to ride
// on. Made in code like everything else, each car one vertex-coloured mesh,
// with its wheels and the engine's rods moving on their own.
//
// A car rests on two trucks (or, the engine, on its frame) at `pivot` m
// either side of its middle; each truck sits on the rail where it is, so a
// car rides round a curve with its ends over the outside of the bend and
// tips up or down a grade.
//
//   const train = new Train({ material, glow });
//   scene.add(train.object);
//   train.place(line, sFront, dt)   its front at sFront m round the line
//   train.seat(car, k, out)         where someone sits on bench k of car
//                                   `car`: out.x, y (the hips), z, yaw
//   train.stack(out)                the top of the smokestack, in the world
//
// Smoke is one pool for all the trains (Smoke): puffs that rise, swell and
// thin away, thrown up with each beat of the exhaust.
//
// Each car is its own mesh, built round itself and put in the world, and the
// smoke is drawn from a spot kept near it, so a train a long way out is drawn
// as sharply as one in the middle (render/origin.js).

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { anchor } from '../render/origin.js';
import { phash } from '../noise.js';
import { pointAt, ahead } from './lines.js';
import { CONSIST, GAP } from './timetable.js';
import { GAUGE } from './track.js';
import { box, beam } from '../build/faces.js';

const lin = (hex) => new THREE.Color(hex);
const COL = {
  boiler: lin(0x22302a),
  smokebox: lin(0x1a1a19),
  brass: lin(0xc49a42),
  cab: lin(0x6a2a1f),
  cabDark: lin(0x3a1712),
  roof: lin(0x1d1b19),
  frame: lin(0x1f1d1b),
  red: lin(0x8c2c1e),
  tire: lin(0x2d2b29),
  wheel: lin(0x7d2a1c),
  rod: lin(0x9c9890),
  wood: lin(0x7a5a3a),
  woodEnd: lin(0xb08a5a),
  coach: lin(0x6b2c22),
  coachTrim: lin(0xd8c9a2),
  bench: lin(0x8a6a48),
  floor: lin(0x5e4a36),
  glass: lin(0xffe2a0),
};
const DRIVER_R = 0.52; // m, the driving wheels' radius
const DRIVERS = [-0.85, 0.3, 1.45]; // m along the engine from its middle
const PONY = { z: 2.85, r: 0.3 };
const TRUCK_R = 0.3; // m, the cars' and the tender's wheels
const CRANK = 0.24; // m from an axle to its crank pin
const MAIN_ROD = 1.65; // m from the middle driver's pin to the crosshead
const AXLE_Y = DRIVER_R; // the drivers' axles stand this high over the rail
// The benches of a car: rows along it, a seat either side of the aisle.
export const ROWS = [-2.75, -1.65, -0.55, 0.55, 1.65, 2.75];
const SEAT_X = 0.6;
const SEAT_TOP = 1.42; // m over the rail
export const SEATS = ROWS.length * 2;
const STACK = { z: 3.0, y: 3.6 }; // the top of the smokestack, on the engine

const _a = { x: 0, y: 0, z: 0, dx: 0, dz: 0, grade: 0 };
const _b = { x: 0, y: 0, z: 0, dx: 0, dz: 0, grade: 0 };
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);

// ── Parts ────────────────────────────────────────────────────────────────────
// A cylinder `len` long along an axis ('x', 'y' or 'z'), radius r0 at its
// start end and r1 at the other.
function cyl(m, x, y, z, r0, r1, len, axis, color, segs = 10) {
  const g = new THREE.CylinderGeometry(r1, r0, len, segs, 1);
  _e.set(axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? -Math.PI / 2 : 0);
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s);
  m.add(g, _m, typeof color === 'function' ? color : (p, n, out) => out.copy(color));
}

// A wheel in the x = 0 plane, centred on the origin: a dark tyre, a painted
// centre with a crescent counterweight (so you can see it turn) and a hub.
function wheel(m, r, x, counter = true) {
  const side = Math.sign(x) || 1;
  cyl(m, x, 0, 0, r, r, 0.1, 'x', COL.tire, 14);
  const g = new THREE.CylinderGeometry(r * 0.84, r * 0.84, 0.12, 14, 1);
  _m.compose(_v.set(x, 0, 0), _q.setFromEuler(_e.set(0, 0, -Math.PI / 2)), _s);
  m.add(g, _m, (p, n, out) => {
    // p is in the cylinder's own frame: x, z across its face
    const ang = Math.atan2(p.z, p.x);
    const weight = counter && Math.cos(ang) < -0.55 && Math.hypot(p.x, p.z) > r * 0.35;
    return out.copy(weight ? COL.tire : COL.wheel);
  });
  cyl(m, x + side * 0.07, 0, 0, r * 0.18, r * 0.18, 0.1, 'x', COL.rod, 8);
}

// A truck under a car: a side frame each side and two pairs of wheels. Its
// wheels turn with it, so it is a mesh of its own (and so are its wheels).
function truck(material) {
  const g = new THREE.Group();
  const m = new Mesher();
  for (const sx of [-1, 1]) box(m, sx * (GAUGE / 2 + 0.16), TRUCK_R, 0, 0.06, 0.12, 1.0, 0, COL.frame);
  box(m, 0, TRUCK_R + 0.17, 0, 0.9, 0.08, 0.22, 0, COL.frame);
  g.add(mesh(m, material));
  const wheels = [];
  for (const z of [-0.65, 0.65]) {
    const w = new Mesher();
    for (const sx of [-1, 1]) wheel(w, TRUCK_R, (sx * GAUGE) / 2, false);
    cyl(w, 0, 0, 0, 0.05, 0.05, GAUGE, 'x', COL.frame, 6);
    const wm = mesh(w, material);
    wm.position.set(0, TRUCK_R, z);
    g.add(wm);
    wheels.push({ mesh: wm, r: TRUCK_R });
  }
  return { group: g, wheels };
}

function mesh(m, material) {
  const out = new THREE.Mesh(m.build(), material);
  out.castShadow = true;
  out.receiveShadow = true;
  return out;
}

// ── The cars ─────────────────────────────────────────────────────────────────
// Each in its own frame: +z its front, x across, y up from the top of the
// rail. -> { group, wheels: [{ mesh, r }], trucks: [{ group, z }], pivot,
//            rods? }
function engine(material, glow) {
  const g = new THREE.Group();
  const m = new Mesher();
  // frame, buffer beam and the pilot (the cowcatcher)
  box(m, 0, 0.72, 0.1, 0.42, 0.17, 3.45, 0, COL.frame);
  box(m, 0, 0.72, 3.6, 1.0, 0.16, 0.08, 0, COL.red);
  for (let k = -3; k <= 3; k++) beam(m, [k * 0.13, 0.62, 3.66], [k * 0.3, 0.1, 4.15], 0.05, 0.05, COL.red);
  // running boards along each side
  for (const sx of [-1, 1]) box(m, sx * 0.95, 1.18, 0.75, 0.2, 0.025, 2.6, 0, COL.frame);
  // the boiler, its brass bands, the smokebox and its door
  cyl(m, 0, 1.75, 0.4, 0.58, 0.58, 4.6, 'z', COL.boiler, 14);
  for (const z of [-1.2, 0.0, 1.4, 2.4]) cyl(m, 0, 1.75, z, 0.6, 0.6, 0.06, 'z', COL.brass, 14);
  cyl(m, 0, 1.75, 3.05, 0.62, 0.62, 0.7, 'z', COL.smokebox, 14);
  cyl(m, 0, 1.75, 3.42, 0.5, 0.48, 0.06, 'z', lin(0x2b2a28), 14);
  // the diamond stack: a pipe, flaring out to a cone and the cap on it
  cyl(m, 0, 2.55, STACK.z, 0.17, 0.17, 0.5, 'y', COL.smokebox, 10);
  cyl(m, 0, 2.98, STACK.z, 0.2, 0.46, 0.38, 'y', COL.smokebox, 10);
  cyl(m, 0, 3.32, STACK.z, 0.46, 0.3, 0.3, 'y', COL.smokebox, 10);
  // the steam dome (brass), the sand dome and the bell
  cyl(m, 0, 2.48, 1.15, 0.3, 0.27, 0.4, 'y', COL.brass, 12);
  cyl(m, 0, 2.72, 1.15, 0.27, 0.12, 0.12, 'y', COL.brass, 12);
  cyl(m, 0, 2.42, 0.1, 0.24, 0.2, 0.3, 'y', COL.boiler, 12);
  cyl(m, 0, 2.6, 2.2, 0.12, 0.09, 0.2, 'y', COL.brass, 8);
  // the headlamp, a box on the smokebox with its glass to the front
  box(m, 0, 2.62, 3.25, 0.2, 0.2, 0.18, 0, COL.smokebox);
  box(m, 0, 2.85, 3.25, 0.12, 0.04, 0.1, 0, COL.smokebox);
  const lampGlass = new Mesher();
  box(lampGlass, 0, 2.62, 3.44, 0.13, 0.13, 0.02, 0, COL.glass);
  // the cylinders either side at the front
  for (const sx of [-1, 1]) {
    cyl(m, sx * 0.98, 0.95, 2.95, 0.25, 0.25, 0.8, 'z', COL.boiler, 10);
    box(m, sx * 0.98, 0.95, 2.18, 0.05, 0.05, 0.4, 0, COL.rod); // the guides
  }
  // the firebox under the cab, and the cab: walls with windows, a roof
  box(m, 0, 1.05, -2.1, 0.5, 0.4, 0.6, 0, lin(0x2a2522));
  const cabZ = [-3.45, -1.6];
  const cabMid = (cabZ[0] + cabZ[1]) / 2;
  const cabHalf = (cabZ[1] - cabZ[0]) / 2;
  for (const sx of [-1, 1]) {
    box(m, sx * 1.02, 1.62, cabMid, 0.04, 0.45, cabHalf, 0, COL.cab); // below the window
    box(m, sx * 1.02, 2.92, cabMid, 0.04, 0.14, cabHalf, 0, COL.cab); // over it
    box(m, sx * 1.02, 2.43, cabZ[0] + 0.12, 0.04, 0.36, 0.12, 0, COL.cab);
    box(m, sx * 1.02, 2.43, cabZ[1] - 0.12, 0.04, 0.36, 0.12, 0, COL.cab);
    box(m, sx * 1.025, 2.43, cabMid, 0.03, 0.34, cabHalf - 0.25, 0, COL.cabDark); // the window's dark
    box(m, sx * 1.03, 2.08, cabMid, 0.02, 0.03, cabHalf, 0, COL.coachTrim); // a lined stripe
  }
  box(m, 0, 2.15, cabZ[1], 1.02, 0.95, 0.04, 0, COL.cab);
  box(m, 0, 3.12, cabMid, 1.18, 0.05, cabHalf + 0.22, 0, COL.roof);
  box(m, 0, 1.17, cabMid, 1.02, 0.03, cabHalf, 0, lin(0x3a2f26));
  // the axles and pony truck wheels are their own meshes, to turn
  g.add(mesh(m, material));
  const lamp = new THREE.Mesh(lampGlass.build(), glow);
  g.add(lamp);
  const wheels = [];
  for (const z of DRIVERS) {
    const w = new Mesher();
    for (const sx of [-1, 1]) wheel(w, DRIVER_R, (sx * GAUGE) / 2);
    cyl(w, 0, 0, 0, 0.07, 0.07, GAUGE, 'x', COL.frame, 6);
    const wm = mesh(w, material);
    wm.position.set(0, AXLE_Y, z);
    g.add(wm);
    wheels.push({ mesh: wm, r: DRIVER_R });
  }
  {
    const w = new Mesher();
    for (const sx of [-1, 1]) wheel(w, PONY.r, (sx * GAUGE) / 2, false);
    const wm = mesh(w, material);
    wm.position.set(0, PONY.r, PONY.z);
    g.add(wm);
    wheels.push({ mesh: wm, r: PONY.r });
  }
  // the side rods, coupling the drivers' crank pins, and the main rod from
  // the crosshead to the middle pin; the right side a quarter turn ahead
  const rods = [];
  for (const sx of [-1, 1]) {
    const x = sx * (GAUGE / 2 + 0.15);
    const side = new Mesher();
    box(side, 0, 0, 0, 0.03, 0.05, (DRIVERS[2] - DRIVERS[0]) / 2 + 0.12, 0, COL.rod);
    const sm = mesh(side, material);
    sm.position.set(x, AXLE_Y, (DRIVERS[0] + DRIVERS[2]) / 2);
    g.add(sm);
    const main = new Mesher();
    box(main, 0, 0, 0, 0.03, 0.045, MAIN_ROD / 2, 0, COL.rod);
    const mm = mesh(main, material);
    mm.position.set(x + sx * 0.06, AXLE_Y, DRIVERS[1] + MAIN_ROD / 2);
    g.add(mm);
    rods.push({ side: sm, main: mm, phase: sx > 0 ? Math.PI / 2 : 0 });
  }
  return { group: g, wheels, trucks: [], pivot: 1.4, rods };
}

function tender(material) {
  const g = new THREE.Group();
  const m = new Mesher();
  box(m, 0, 0.78, 0, 0.98, 0.1, 2.2, 0, COL.frame);
  // the tank, round three sides of the wood
  for (const sx of [-1, 1]) box(m, sx * 0.88, 1.45, -0.2, 0.15, 0.58, 1.85, 0, COL.boiler);
  box(m, 0, 1.45, -2.0, 1.03, 0.58, 0.08, 0, COL.boiler);
  box(m, 0, 1.25, -0.2, 0.75, 0.38, 1.85, 0, COL.boiler);
  box(m, 0, 2.06, -0.2, 1.06, 0.04, 1.9, 0, COL.brass);
  box(m, 0, 1.4, 1.95, 0.98, 0.5, 0.06, 0, COL.boiler);
  // stacked firewood: rows of log ends
  for (let row = 0; row < 3; row++) {
    for (let k = -2; k <= 2; k++) {
      const x = k * 0.26 + (row % 2) * 0.13;
      if (Math.abs(x) > 0.62) continue;
      const shade = 0.85 + phash(row, k, 3) * 0.3;
      cyl(m, x, 1.74 + row * 0.22, -0.2, 0.12, 0.12, 3.4, 'z', (p, n, out) => (Math.abs(n.y) > 0.7 ? out.copy(COL.woodEnd) : out.copy(COL.wood).multiplyScalar(shade)), 6);
    }
  }
  g.add(mesh(m, material));
  const trucks = [];
  const wheels = [];
  for (const z of [-1.35, 1.35]) {
    const t = truck(material);
    t.group.position.z = z;
    g.add(t.group);
    trucks.push({ group: t.group, z });
    wheels.push(...t.wheels);
  }
  return { group: g, wheels, trucks, pivot: 1.35 };
}

function coach(material) {
  const g = new THREE.Group();
  const m = new Mesher();
  const half = 4.1;
  // the underframe and floor
  box(m, 0, 0.8, 0, 1.05, 0.12, half, 0, COL.frame);
  box(m, 0, 0.94, 0, 1.08, 0.03, half + 0.05, 0, COL.floor);
  for (const sx of [-1, 1]) {
    // a painted panel low along each side, cream posts and a top rail
    box(m, sx * 1.07, 1.13, 0, 0.03, 0.18, half - 0.6, 0, COL.coach);
    box(m, sx * 1.075, 1.31, 0, 0.025, 0.02, half - 0.6, 0, COL.coachTrim);
    box(m, sx * 1.07, 1.86, 0, 0.035, 0.03, half - 0.6, 0, COL.coachTrim);
    for (let z = -half + 0.6; z <= half - 0.6 + 1e-6; z += (2 * half - 1.2) / 7) box(m, sx * 1.07, 1.4, z, 0.03, 0.46, 0.03, 0, COL.coachTrim);
  }
  // ends: a rail across each, with the gap for the steps
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) box(m, sx * 0.72, 1.4, sz * (half - 0.05), 0.35, 0.03, 0.03, 0, COL.coachTrim);
    for (const sx of [-1, 1]) box(m, sx * 1.0, 0.7, sz * (half - 0.3), 0.12, 0.03, 0.12, 0, COL.frame); // steps
  }
  // benches facing forward, each side of the aisle
  for (const z of ROWS) {
    for (const sx of [-1, 1]) {
      const x = sx * SEAT_X;
      box(m, x, SEAT_TOP - 0.03, z, 0.38, 0.035, 0.2, 0, COL.bench);
      box(m, x, SEAT_TOP + 0.26, z - 0.22, 0.38, 0.2, 0.025, 0, COL.bench);
      box(m, x, (SEAT_TOP + 0.95) / 2, z - 0.05, 0.36, (SEAT_TOP - 0.95) / 2, 0.03, 0, COL.frame);
    }
  }
  g.add(mesh(m, material));
  const trucks = [];
  const wheels = [];
  for (const z of [-3.0, 3.0]) {
    const t = truck(material);
    t.group.position.z = z;
    g.add(t.group);
    trucks.push({ group: t.group, z });
    wheels.push(...t.wheels);
  }
  return { group: g, wheels, trucks, pivot: 3.0 };
}

const MAKE = { engine, tender, coach };

// ── A train ──────────────────────────────────────────────────────────────────
export class Train {
  constructor({ material, glow }) {
    this.object = new THREE.Group();
    this.cars = [];
    let back = 0; // m from the front of the train to the front of this car
    for (const c of CONSIST) {
      const car = MAKE[c.kind](material, glow);
      car.kind = c.kind;
      car.len = c.len;
      car.back = back;
      this.object.add(car.group);
      this.cars.push(car);
      back += c.len + GAP;
    }
    this.s = null; // where its front was last placed
    this.turned = 0; // how far its wheels have rolled (m)
    this.v = 0;
  }

  // Put it on the line with its front at sFront.
  place(line, sFront) {
    const L = line.length;
    if (this.s !== null) this.turned += Math.min(ahead(this.s, sFront, L), 50);
    this.s = sFront;
    for (const car of this.cars) {
      const mid = sFront - car.back - car.len / 2;
      pointAt(line, mid + car.pivot, _a);
      pointAt(line, mid - car.pivot, _b);
      const g = car.group;
      g.position.set((_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2);
      const yaw = Math.atan2(_a.x - _b.x, _a.z - _b.z);
      const run = Math.hypot(_a.x - _b.x, _a.z - _b.z);
      g.rotation.set(-Math.atan2(_a.y - _b.y, run), yaw, 0, 'YXZ');
      // each truck turned to the rail under it
      for (const t of car.trucks) {
        pointAt(line, mid + t.z, _a);
        t.group.rotation.y = Math.atan2(Math.sin(Math.atan2(_a.dx, _a.dz) - yaw), Math.cos(Math.atan2(_a.dx, _a.dz) - yaw));
      }
      for (const w of car.wheels) w.mesh.rotation.x = this.turned / w.r;
      if (car.rods) {
        const a = this.turned / DRIVER_R;
        for (const r of car.rods) {
          const th = a + r.phase;
          const dy = CRANK * Math.cos(th);
          const dz = CRANK * Math.sin(th);
          r.side.position.y = AXLE_Y + dy;
          r.side.position.z = (DRIVERS[0] + DRIVERS[2]) / 2 + dz;
          // the main rod, from the middle pin forward to the crosshead
          const pinZ = DRIVERS[1] + dz;
          const reach = Math.sqrt(MAIN_ROD * MAIN_ROD - dy * dy);
          r.main.position.y = AXLE_Y + dy / 2;
          r.main.position.z = pinZ + reach / 2;
          r.main.rotation.x = Math.atan2(dy, reach);
        }
      }
    }
    this.object.updateMatrixWorld(true);
  }

  // Where someone sits on seat k (0..SEATS-1) of car `car` (an index into
  // the cars): the hips, and the way they face.
  seat(car, k, out) {
    const c = this.cars[car];
    const row = ROWS[Math.floor(k / 2)];
    _v.set(k % 2 ? SEAT_X : -SEAT_X, SEAT_TOP + 0.06, row).applyMatrix4(c.group.matrixWorld);
    out.x = _v.x;
    out.y = _v.y;
    out.z = _v.z;
    out.yaw = c.group.rotation.y;
    return out;
  }

  // The top of the smokestack, in the world.
  stack(out = new THREE.Vector3()) {
    return out.set(0, STACK.y, STACK.z).applyMatrix4(this.cars[0].group.matrixWorld);
  }

  // The engine's headlamp end, and the middle of the train (for sound).
  middle(out = new THREE.Vector3()) {
    const c = this.cars[Math.floor(this.cars.length / 2)];
    return out.setFromMatrixPosition(c.group.matrixWorld);
  }

  dispose() {
    this.object.traverse((o) => o.isMesh && o.geometry.dispose());
  }
}

// Which car index is which kind: the cars you can ride in.
export const COACHES = CONSIST.map((c, i) => (c.kind === 'coach' ? i : -1)).filter((i) => i >= 0);

// How much room a car takes: half its width (m), and how high it stands
// over the rail, for keeping people out of it.
export const CAR_BOX = { half: 1.15, top: 3.4 };

// ── Smoke ────────────────────────────────────────────────────────────────────
const PUFFS = 160;
const PUFF_LIFE = [2.6, 4.2]; // s
const BREEZE = [0.8, 0.45]; // m/s the smoke drifts, at an ordinary wind
const _o = new THREE.Object3D();
const _col = new THREE.Color();

export class Smoke {
  constructor(scene) {
    const geo = new THREE.IcosahedronGeometry(0.5, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, PUFFS);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.list = [];
  }

  // A puff at p, going at (vx, vy, vz), `size` m across at its biggest;
  // grey: 0 white steam .. 1 dark wood smoke.
  puff(p, vx, vy, vz, size, grey) {
    if (this.list.length >= PUFFS) this.list.shift();
    const life = PUFF_LIFE[0] + Math.random() * (PUFF_LIFE[1] - PUFF_LIFE[0]);
    const j = () => (Math.random() - 0.5) * 0.5;
    this.list.push({ x: p.x, y: p.y, z: p.z, vx: vx + j(), vy, vz: vz + j(), age: 0, life, size, grey, spin: Math.random() * 6 });
  }

  // wind: how hard it's blowing (the shared wind's strength, about 0..2)
  update(dt, wind = 1) {
    const out = [];
    const bx = BREEZE[0] * wind;
    const bz = BREEZE[1] * wind;
    for (const q of this.list) {
      q.age += dt;
      if (q.age > q.life) continue;
      // rising, slowing, and carried off on the breeze
      const k = Math.exp(-dt * 1.4);
      q.vx = q.vx * k + bx * (1 - k);
      q.vz = q.vz * k + bz * (1 - k);
      q.vy = q.vy * Math.exp(-dt * 0.9) + 0.35 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      out.push(q);
    }
    this.list = out;
    const n = Math.min(out.length, PUFFS);
    // measured from a spot kept near them, not from the middle of the world
    // (render/origin.js), so they don't jitter a long way out
    const at = n ? anchor(this.mesh, out[0].x, out[0].z) : this.mesh.position;
    for (let i = 0; i < n; i++) {
      const q = out[i];
      const f = q.age / q.life;
      const grow = Math.min(1, f * 4);
      const s = q.size * (0.35 + 0.65 * grow) * (1 - f * f * f) * (0.75 + f * 1.4);
      _o.position.set(q.x - at.x, q.y, q.z - at.z);
      _o.rotation.set(q.spin, q.spin * 0.7, 0);
      _o.scale.setScalar(Math.max(0.001, s));
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      const shade = 0.88 - q.grey * 0.42 + f * 0.1;
      this.mesh.setColorAt(i, _col.setRGB(shade, shade * 0.99, shade * 0.97));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

