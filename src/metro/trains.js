// The Metro's trains: six cars of the newest kind (the 7000 series),
// brushed stainless steel with a band of dark glass along them, three pairs
// of doors a side, each car's line and destination lit on its sides; a cab
// at each end of the train, its front a black mask round the windscreen with
// the sign behind the glass that says what line it is and where it's going,
// and under it the headlights (or, at the back, the red tail lights).
// Between the cars, the barriers that keep anyone from stepping into the gap;
// under them, the trucks on their wheels and the boxes of their equipment.
// Inside, rows of blue seats, grab poles and the bars along the ceiling, and
// the light strips down it; the windows are open, so you can look in from
// the platform and out from your seat. The inside is lit by its own lamps
// (look.js): how lit each face is, ceiling to floor, is in its colour.
//
// Each kind of car (a cab car, a car between) is built once, round itself,
// and every car of every train is that geometry put where it is: so a train
// is drawn as sharply a long way out as in the middle (render/origin.js).
//
//   const train = new MetroTrain(kit);
//   scene.add(train.object);
//   train.show(route, colour, line, to)   what it is now
//   train.place(route, sFront)            its front at sFront m along a route
//   train.seat(car, k, out)               where someone sits in seat k of a car:
//                                         out.x, y (the hips), z, yaw
//   train.doors(car, out)                 the doors of a car, each side: [{ x, z, side }]
//
// A car rests on two trucks TRUCK m either side of its middle; each sits on
// the rail where it is, so a car rides round a curve with its ends over the
// outside of the bend and tips up or down a grade.

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF } from '../build/surfaces.js';
import { quad, box } from '../build/faces.js';
import { pointAt } from './network.js';
import { CARS, CAR_LEN } from './timetable.js';
import { destination } from './signs.js';

export const CAR = { half: 1.55, floor: 1.12, eaves: 3.0, roof: 3.45, len: CAR_LEN - 0.6 };
const TRUCK = 8.0; // m from a car's middle to each truck
const DOORS = [-6.9, 0, 6.9]; // m along a car, the middle of each pair of doors
const DOOR_HALF = 0.66;
const WINDOW = { y0: 1.92, y1: 2.72 };
const CAB = 1.3; // m at the front of a cab car that's its nose
const SIDE_SIGN = { y: 2.62, z: 3.45, w: 1.3 }; // a car's sign along its side: how high, where along, how wide
// The seats: rows across, facing along, two either side of the aisle, in the
// bays between the doors.
const SEAT = { y: 0.46, depth: 0.46, back: 0.62, w: 0.92, row: 0.86 };
export const SEATS = (() => {
  const out = [];
  const bays = [[-CAR.len / 2 + 1.3, DOORS[0] - DOOR_HALF - 0.5], [DOORS[0] + DOOR_HALF + 0.5, DOORS[1] - DOOR_HALF - 0.5], [DOORS[1] + DOOR_HALF + 0.5, DOORS[2] - DOOR_HALF - 0.5], [DOORS[2] + DOOR_HALF + 0.5, CAR.len / 2 - 1.3]];
  for (const [z0, z1] of bays) {
    for (let z = z0 + SEAT.row / 2; z < z1; z += SEAT.row) {
      for (const x of [-1.05, -0.5, 0.5, 1.05]) out.push({ x, z, yaw: ((Math.round((z - z0) / SEAT.row) % 2) ? Math.PI : 0) });
    }
  }
  return out;
})();

const lin = (hex) => new THREE.Color(hex);
// (inside, each scaled by how lit it is: the ceiling's strips light the
// ceiling least, the walls more, the floor in the seats' shadow less)
const lit = (hex, k) => lin(hex).multiplyScalar(k);
const COL = {
  steel: lin(0xc6c9cb),
  steelDark: lin(0x9ea1a4),
  band: lin(0x121417),
  door: lin(0xb9bcbf),
  doorEdge: lin(0x1a1a1a),
  roof: lin(0x86898c),
  under: lin(0x2a2a2a),
  kit: lin(0x34363a),
  truck: lin(0x1e1e1e),
  wheel: lin(0x3a3633),
  nose: lin(0x0b0d0f),
  barrier: lin(0x141414),
  floor: lit(0x6b6a66, 0.6),
  wallIn: lit(0xe6e5e0, 0.78),
  wallLow: lit(0x9fa3a8, 0.7),
  ceiling: lit(0xf4f3ee, 0.68),
  endDoor: lit(0x2a2d31, 0.8),
  seat: lit(0x26478a, 0.75),
  seatBack: lit(0x2f5297, 0.8),
  pole: lit(0xd4d6d7, 0.85),
  light: lin(0xfff8ec),
  head: lin(0xffffff),
  tail: lin(0xff2a1a),
};

// One side's wall of a car, x = ±half, as panels round its windows and
// doors: `out` its outside face (+1) or inside (-1).
function sideWall(m, x, out, cab, colours) {
  const facing = Math.sign(x) * out; // which way across this face looks
  const z0 = -CAR.len / 2;
  const z1 = CAR.len / 2 - (cab ? CAB : 0);
  const panel = (za, zb, ya, yb, col) => {
    if (zb - za < 0.01 || yb - ya < 0.01) return;
    const a = [x, ya, za];
    const b = [x, ya, zb];
    const c = [x, yb, zb];
    const d = [x, yb, za];
    // (facing +x: a, d, c, b go round it as seen from +x)
    if (facing > 0) quad(m, a, d, c, b, col);
    else quad(m, a, b, c, d, col);
  };
  // along the car: doors, and the window bays between them
  const cuts = [z0];
  for (const d of DOORS) cuts.push(d - DOOR_HALF, d + DOOR_HALF);
  cuts.push(z1);
  for (let k = 0; k + 1 < cuts.length; k++) {
    const za = cuts[k];
    const zb = cuts[k + 1];
    const door = k % 2 === 1;
    if (door) {
      // the doors: steel, a window in each leaf, the floor's edge under
      panel(za, zb, 0.85, CAR.floor, colours.under);
      panel(za, zb, CAR.floor, 1.95, colours.door);
      panel(za, za + 0.12, 1.95, 2.6, colours.door);
      panel(zb - 0.12, zb, 1.95, 2.6, colours.door);
      panel((za + zb) / 2 - 0.02, (za + zb) / 2 + 0.02, CAR.floor, 2.6, colours.doorEdge);
      panel((za + zb) / 2 - 0.07, (za + zb) / 2 - 0.02, 1.95, 2.6, colours.door);
      panel((za + zb) / 2 + 0.02, (za + zb) / 2 + 0.07, 1.95, 2.6, colours.door);
      panel(za + 0.12, (za + zb) / 2 - 0.05, 1.95, 2.6, colours.band);
      panel((za + zb) / 2 + 0.05, zb - 0.12, 1.95, 2.6, colours.band);
      panel(za, zb, 2.6, CAR.eaves, colours.door);
      continue;
    }
    panel(za, zb, 0.85, WINDOW.y0, colours.steel);
    panel(za, zb, WINDOW.y1, CAR.eaves, colours.band);
    // the windows, open, between narrow piers of the band
    const n = Math.max(1, Math.round((zb - za) / 1.7));
    const w = (zb - za) / n;
    for (let j = 0; j <= n; j++) {
      const zc = za + j * w;
      panel(Math.max(za, zc - 0.13), Math.min(zb, zc + 0.13), WINDOW.y0, WINDOW.y1, colours.band);
    }
  }
}

// A wheel at (x, z), standing on the rail: an octagon each face of it.
function wheel(m, x, z, col) {
  const r = 0.42;
  const n = 8;
  for (const s of [-1, 1]) {
    const xs = x + s * 0.05;
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * Math.PI * 2;
      const t1 = ((k + 1) / n) * Math.PI * 2;
      const a = [xs, r, z];
      const b = [xs, r + Math.sin(t0) * r, z + Math.cos(t0) * r];
      const c = [xs, r + Math.sin(t1) * r, z + Math.cos(t1) * r];
      if (s > 0) quad(m, a, b, c, c, col);
      else quad(m, a, c, b, b, col);
    }
  }
}

// A car's shell, round its middle: x across, y up from the rail, z along
// (+z forward). A cab car has its cab at +z.
function carGeometry(cab) {
  const outer = new Mesher();
  const inner = new Mesher();
  const glow = new Mesher();
  outer.surf = SURF.plain;
  inner.surf = SURF.plain;
  const H = CAR.half;
  const z0 = -CAR.len / 2;
  const z1 = CAR.len / 2;
  const zf = z1 - (cab ? CAB : 0);
  for (const x of [-H, H]) {
    sideWall(outer, x, 1, cab, COL);
    sideWall(inner, x * 0.97, -1, cab, { steel: COL.wallLow, band: COL.wallIn, door: COL.wallIn, under: COL.wallLow, doorEdge: COL.wallIn });
  }
  // the roof: rounded at its edges, flat on top
  const roofProf = [[-H, CAR.eaves], [-H * 0.82, CAR.roof - 0.12], [-H * 0.55, CAR.roof], [H * 0.55, CAR.roof], [H * 0.82, CAR.roof - 0.12], [H, CAR.eaves]];
  for (let k = 0; k + 1 < roofProf.length; k++) {
    const [xa, ya] = roofProf[k];
    const [xb, yb] = roofProf[k + 1];
    quad(outer, [xa, ya, z0], [xb, yb, z0], [xb, yb, zf], [xa, ya, zf], k === 2 ? COL.roof : COL.steelDark);
  }
  // the ceiling inside, and its light strips; the floor
  quad(inner, [-H * 0.97, 2.62, z0 + 0.2], [-H * 0.97, 2.62, zf - 0.2], [H * 0.97, 2.62, zf - 0.2], [H * 0.97, 2.62, z0 + 0.2], COL.ceiling);
  for (const x of [-0.55, 0.55]) box(glow, x, 2.6, (z0 + zf) / 2, 0.12, 0.02, (zf - z0) / 2 - 0.8, 0, COL.light);
  quad(inner, [-H * 0.97, CAR.floor, z0 + 0.2], [H * 0.97, CAR.floor, z0 + 0.2], [H * 0.97, CAR.floor, zf - 0.2], [-H * 0.97, CAR.floor, zf - 0.2], COL.floor);
  // under the floor: the frame's skirt, the boxes of its equipment between
  // the trucks, and the trucks on their wheels
  box(outer, 0, 0.78, 0, H - 0.08, 0.1, CAR.len / 2 - 0.4, 0, COL.under);
  for (const [z, len, w] of [[-3.6, 2.4, 1.15], [-0.4, 1.6, 1.25], [2.9, 2.8, 1.1], [5.6, 1.2, 0.9]]) box(outer, 0, 0.5, z, w, 0.22, len / 2, 0, COL.kit);
  for (const zt of [-TRUCK, TRUCK]) {
    box(outer, 0, 0.5, zt, 1.12, 0.16, 1.5, 0, COL.truck);
    for (const xs of [-1.0, 1.0]) box(outer, xs, 0.46, zt, 0.08, 0.2, 1.3, 0, COL.truck);
    for (const za of [-1.05, 1.05]) {
      for (const xs of [-0.72, 0.72]) {
        // a wheel: an octagon, edge on to the rail
        wheel(outer, xs, zt + za, COL.wheel);
      }
    }
  }
  // the bars along the ceiling, to hold on to
  for (const x of [-0.62, 0.62]) box(inner, x, 2.22, (z0 + zf) / 2, 0.018, 0.018, (zf - z0) / 2 - 1.0, 0, COL.pole);
  // the ends: a plain end with its gangway door; or the cab
  const end = (z, facing) => {
    const pts = [[-H, 0.85], [H, 0.85], [H, CAR.eaves], [H * 0.82, CAR.roof - 0.12], [H * 0.55, CAR.roof], [-H * 0.55, CAR.roof], [-H * 0.82, CAR.roof - 0.12], [-H, CAR.eaves]];
    // a fan of triangles from the middle of the end
    const mid = [0, (0.85 + CAR.roof) / 2, z];
    for (let k = 0; k < pts.length; k++) {
      const [xa, ya] = pts[k];
      const [xb, yb] = pts[(k + 1) % pts.length];
      const a = [xa, ya, z];
      const b = [xb, yb, z];
      if (facing > 0) quad(outer, mid, a, b, b, COL.steel);
      else quad(outer, mid, b, a, a, COL.steel);
    }
  };
  // the barriers either side of the gap to the next car, and the end door's
  // window, at each end that meets another car
  for (const [z, s] of cab ? [[z0, -1]] : [[z0, -1], [z1, 1]]) {
    for (const x of [-H + 0.1, H - 0.1]) box(outer, x, 1.65, z + s * 0.16, 0.06, 0.72, 0.15, 0, COL.barrier);
    quad(outer, [-0.36, 1.55, z + s * 0.01], [0.36, 1.55, z + s * 0.01], [0.36, 2.45, z + s * 0.01], [-0.36, 2.45, z + s * 0.01], COL.band);
    quad(outer, [0.36, 1.55, z + s * 0.01], [-0.36, 1.55, z + s * 0.01], [-0.36, 2.45, z + s * 0.01], [0.36, 2.45, z + s * 0.01], COL.band);
  }
  end(z0, -1);
  if (!cab) end(z1, 1);
  else {
    // the nose: the steel round its edges sloping in to a dark windscreen
    const n0 = zf;
    const n1 = z1;
    const ring = [[-H, 0.85], [H, 0.85], [H, CAR.eaves], [H * 0.55, CAR.roof], [-H * 0.55, CAR.roof], [-H, CAR.eaves]];
    const inset = ring.map(([x, y]) => [x * 0.9, 0.85 + (y - 0.85) * 0.96]);
    for (let k = 0; k < ring.length; k++) {
      const [xa, ya] = ring[k];
      const [xb, yb] = ring[(k + 1) % ring.length];
      const [xc, yc] = inset[(k + 1) % ring.length];
      const [xd, yd] = inset[k];
      quad(outer, [xa, ya, n0], [xb, yb, n0], [xc, yc, n1], [xd, yd, n1], COL.steel);
    }
    // its face: stainless low down, where the lights are; over that the
    // black mask round the windscreen, the sign behind its glass at the top
    const face = (ya, yb, col) => quad(outer, [-H * 0.9, ya, n1], [H * 0.9, ya, n1], [H * 0.9, yb, n1], [-H * 0.9, yb, n1], col);
    face(0.85, 1.05, COL.under);
    face(1.05, 1.5, COL.steel);
    face(1.5, 3.12, COL.nose);
    face(3.12, CAR.roof * 0.96 + 0.03, COL.steel);
    // and inside, the cab's back wall
    quad(inner, [-H * 0.97, CAR.floor, n0 - 0.1], [H * 0.97, CAR.floor, n0 - 0.1], [H * 0.97, CAR.eaves, n0 - 0.1], [-H * 0.97, CAR.eaves, n0 - 0.1], COL.wallIn);
  }
  quad(inner, [H * 0.97, CAR.floor, z0 + 0.2], [-H * 0.97, CAR.floor, z0 + 0.2], [-H * 0.97, CAR.eaves, z0 + 0.2], [H * 0.97, CAR.eaves, z0 + 0.2], COL.wallIn);
  if (!cab) quad(inner, [-H * 0.97, CAR.floor, z1 - 0.2], [H * 0.97, CAR.floor, z1 - 0.2], [H * 0.97, CAR.eaves, z1 - 0.2], [-H * 0.97, CAR.eaves, z1 - 0.2], COL.wallIn);
  // the seats, and the poles by the doors
  for (const s of SEATS) {
    if (cab && s.z > zf - 0.6) continue;
    const back = s.yaw ? 1 : -1;
    box(inner, s.x, CAR.floor + SEAT.y - 0.06, s.z, 0.22, 0.06, SEAT.depth / 2, 0, COL.seat);
    box(inner, s.x, CAR.floor + SEAT.y + SEAT.back / 2, s.z + back * (SEAT.depth / 2 - 0.04), 0.22, SEAT.back / 2, 0.05, 0, COL.seat);
    box(inner, s.x, CAR.floor + SEAT.y / 2 - 0.06, s.z, 0.04, SEAT.y / 2 - 0.06, 0.04, 0, COL.pole);
  }
  for (const d of DOORS) for (const zz of [d - DOOR_HALF - 0.3, d + DOOR_HALF + 0.3]) box(inner, 0, (CAR.floor + 2.62) / 2, zz, 0.025, (2.62 - CAR.floor) / 2, 0.025, 0, COL.pole);
  return { outer: outer.build(), inner: inner.build(), glow: glow.build() };
}

const _a = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
const _b = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };

// What all trains share: the cars' geometry and materials.
export class TrainKit {
  constructor(mats) {
    this.mats = mats;
    this.cab = carGeometry(true);
    this.mid = carGeometry(false);
    this.signPlane = new THREE.PlaneGeometry(1, 1);
    // (until a train says what it is)
    this.sideSign = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const lamp = (col) => {
      const m = new Mesher();
      for (const x of [-1.05, 1.05]) box(m, x, 1.25, 0, 0.13, 0.07, 0.02, 0, col);
      return m.build();
    };
    this.head = lamp(COL.head);
    this.tail = lamp(COL.tail);
  }
}

export class MetroTrain {
  constructor(kit) {
    this.kit = kit;
    this.object = new THREE.Group();
    this.object.name = 'metro train';
    this.cars = [];
    const { mats } = kit;
    for (let k = 0; k < CARS; k++) {
      const cab = k === 0 || k === CARS - 1;
      const g = cab ? kit.cab : kit.mid;
      const group = new THREE.Group();
      group.rotation.order = 'YXZ';
      group.add(new THREE.Mesh(g.outer, mats.solid), new THREE.Mesh(g.inner, mats.carInside), new THREE.Mesh(g.glow, mats.glow));
      const car = { group, cab, sign: null, head: null, tail: null, sides: [] };
      // its line and where it's going, lit along each side
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(kit.signPlane, kit.sideSign);
        side.position.set(s * (CAR.half + 0.01), SIDE_SIGN.y, SIDE_SIGN.z);
        side.rotation.y = (s * Math.PI) / 2;
        side.scale.set(SIDE_SIGN.w, SIDE_SIGN.w / 8, 1);
        group.add(side);
        car.sides.push(side);
      }
      if (cab) {
        car.sign = new THREE.Mesh(kit.signPlane, new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false }));
        car.sign.position.set(0, 2.9, CAR.len / 2 + 0.02);
        car.sign.scale.set(1.9, 0.24, 1);
        car.head = new THREE.Mesh(kit.head, mats.glow);
        car.tail = new THREE.Mesh(kit.tail, mats.glow);
        car.head.position.z = car.tail.position.z = CAR.len / 2 + 0.03;
        group.add(car.sign, car.head, car.tail);
      }
      this.cars.push(car);
      this.object.add(group);
    }
    this.key = '';
    this.sideMat = null;
  }

  // What it's running as: its line's colour, its line's name and where it's going.
  show(colour, line, to) {
    const key = `${line}:${to}`;
    if (key === this.key) return;
    this.key = key;
    const tex = destination(colour, line, to);
    if (!this.sideMat) this.sideMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.sideMat.map = tex;
    this.sideMat.color.set(tex ? 0xd0d0d0 : colour);
    this.sideMat.needsUpdate = true;
    for (const car of this.cars) {
      for (const side of car.sides) side.material = this.sideMat;
      if (!car.sign) continue;
      car.sign.material.map = tex;
      car.sign.material.color.set(tex ? 0xffffff : colour);
      car.sign.material.needsUpdate = true;
    }
  }

  // Its front at sFront m along the route: each car on its trucks. Cars off
  // either end of the track there is aren't drawn.
  place(route, sFront) {
    for (let k = 0; k < CARS; k++) {
      const car = this.cars[k];
      const mid = sFront - CAR_LEN * (k + 0.5);
      const g = car.group;
      if (mid + TRUCK < 0 || mid - TRUCK > route.length) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      pointAt(route, mid + TRUCK, _a);
      pointAt(route, mid - TRUCK, _b);
      const dx = _a.x - _b.x;
      const dz = _a.z - _b.z;
      const dy = _a.y - _b.y;
      const run = Math.hypot(dx, dz) || 1;
      g.position.set((_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2);
      // the first car faces forward; the last, its cab at the back, faces back
      const back = k === CARS - 1 ? Math.PI : 0;
      g.rotation.y = Math.atan2(dx, dz) + back;
      g.rotation.x = (back ? 1 : -1) * Math.atan2(dy, run);
      if (car.cab) {
        car.head.visible = k === 0;
        car.tail.visible = k !== 0;
      }
    }
  }

  // Where someone sits in seat k of a car: their hips, and the way they face.
  seat(car, k, out) {
    const g = this.cars[car].group;
    const s = SEATS[k % SEATS.length];
    const v = new THREE.Vector3(s.x, CAR.floor + SEAT.y, s.z).applyEuler(g.rotation).add(g.position);
    out.x = v.x;
    out.y = v.y;
    out.z = v.z;
    out.yaw = g.rotation.y + s.yaw;
    return out;
  }

  // Where a car's doors are, in the world, on its right side (+1) and left (-1).
  doors(car, out = []) {
    out.length = 0;
    const g = this.cars[car].group;
    const v = new THREE.Vector3();
    for (const side of [-1, 1]) {
      for (const d of DOORS) {
        v.set(side * (CAR.half + 0.6), 0, d).applyEuler(g.rotation).add(g.position);
        out.push({ x: v.x, z: v.z, side });
      }
    }
    return out;
  }
}
