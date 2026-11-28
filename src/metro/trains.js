// The Metro's trains: six cars of the newest kind (the 7000 series),
// brushed stainless steel with a band of dark glass along them, three pairs
// of doors a side, each car's line and destination lit on its sides; a cab
// at each end of the train, its front a black mask round the windscreen with
// the sign behind the glass that says what line it is and where it's going,
// and under it the headlights (or, at the back, the red tail lights).
// Between the cars, the barriers that keep anyone from stepping into the gap;
// under them, the trucks on their wheels and the boxes of their equipment.
// Inside, as tall as a real one (2.1 m from the floor to the ceiling, the
// doorways 1.9 m): rows of blue seats, grab poles by the doors and the bars
// along the ceiling, and the two strips of lamps down it; the windows are
// open, so you can look in from the platform and out from your seat. The
// inside is lit by those strips and nothing else (look.js): the light they
// put on each corner of each face, falling off from them and coming back
// off the pale walls, is worked out as it's built (carLight) and carried in
// its colour, as a station's vault carries its coves' (stations.js).
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
//   train.inside(car, from, dir)          m along dir from `from` (in the car) to its walls
//   train.point(car, x, y, z, out)        where (x, y, z) in a car's own frame is, in the world
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

export const CAR = { half: 1.55, floor: 1.12, eaves: 3.08, roof: 3.45, len: CAR_LEN - 0.6 };
// Inside (m across from the middle, and up from the rail): the walls; how
// high they go before they curve in to the ceiling, and how far in that
// curve meets it; the ceiling, 2.1 m over the floor.
const IN = { wall: CAR.half * 0.97, cove: 3.02, edge: 1.1, ceiling: 3.22 };
const TRUCK = 8.0; // m from a car's middle to each truck
const DOORS = [-6.9, 0, 6.9]; // m along a car, the middle of each pair of doors
const DOOR_HALF = 0.66;
const DOOR_TOP = 3.01; // m over the rail: a doorway 1.9 m tall
const DOOR_GLASS = { y0: 2.05, y1: 2.85 }; // the window in each leaf
const WINDOW = { y0: 1.9, y1: 2.86 };
const CAB = 1.3; // m at the front of a cab car that's its nose
const SIDE_SIGN = { y: 2.62, z: 3.45, w: 1.3 }; // a car's sign along its side: how high, where along, how wide
const STRIP = { x: 0.8, half: 0.11, end: 0.8 }; // the lamps along the ceiling: m either side of the middle, half as wide, m short of each end
const BAR = { x: 0.56, y: 3.02 }; // the bars to hold on to along the ceiling: m either side of the middle, and up (1.9 m over the floor)
const END_DOOR = { half: 0.45, top: 2.98, glass: [2.1, 2.82, 0.26] }; // the door at a car's end, into the next: half its width, its top, its window (bottom, top, half its width)
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
  // (inside: what each is made of; the light on it is carLight's)
  floor: lin(0x8f8b84),
  wallIn: lin(0xe6e5e0),
  wallLow: lin(0x9fa3a8),
  ceiling: lin(0xf4f3ee),
  doorIn: lin(0xa9adb1), // (the doors, inside)
  glass: lin(0x1d2124),
  seat: lin(0x26478a),
  seatBack: lin(0x2f5297),
  pole: lin(0xd4d6d7),
  light: lin(0xf2f6ff),
  head: lin(0xffffff),
  tail: lin(0xff2a1a),
};

// How the inside is lit: the two strips of lamps along the ceiling, each
// taken as a lamp every `step` m along it, shining down; how much a face
// turned a little away from them still catches; what comes back off the
// pale walls and seats onto everything, the ceiling too, which the strips
// themselves don't reach; and the most a face gets. Under the seats, the
// floor and the foot of the walls are in their shadow, down to `shadow` of
// what they'd get, `low` m up from the floor and less. (look.js has the
// inside give off `own` of this, and take no other light; it's scaled so
// that the aisle's floor under the lamps gets 1.)
const LIGHT = { step: 0.5, wrap: 0.25, bounce: 0.5, most: 1.3, shadow: 0.5, low: 0.55 };
const LAMP = new THREE.Color(0.94, 0.97, 1.0); // LEDs, a cool white
const BOUNCE = new THREE.Color(0.93, 0.94, 0.96);
const AISLE = { half: 0.78, fade: 0.25 }; // m either side of the middle that's the aisle, out from under the seats; m the seats' shadow comes in over

// How much light the strips (from z0 to z1 along the car) put on a point p
// ([x, y, z] in the car's frame) of a face looking n, unscaled.
function strips(p, n, z0, z1) {
  let sum = 0;
  const y = IN.ceiling - 0.03;
  for (const sx of [-STRIP.x, STRIP.x]) {
    for (let z = z0 + LIGHT.step / 2; z < z1; z += LIGHT.step) {
      const vx = sx - p[0];
      const vy = y - p[1];
      const vz = z - p[2];
      const d2 = vx * vx + vy * vy + vz * vz;
      if (d2 < 1e-4 || vy <= 0) continue;
      const d = Math.sqrt(d2);
      const facing = Math.max(0, ((n[0] * vx + n[1] * vy + n[2] * vz) / d + LIGHT.wrap) / (1 + LIGHT.wrap));
      sum += ((vy / d) * facing) / d2;
    }
  }
  return sum;
}
const UP = [0, 1, 0];
const FULL = strips([0, CAR.floor, 0], UP, -CAR.len / 2 + STRIP.end, CAR.len / 2 - STRIP.end);

// The light on a point p of a face looking n, in a car whose strips run
// from z0 to z1, as a colour to take its own by.
const _bounce = new THREE.Color();
function carLight(p, n, z0, z1, out = new THREE.Color()) {
  const direct = Math.min(LIGHT.most, strips(p, n, z0, z1) / FULL);
  // under the seats, in their shadow
  const low = Math.min(1, Math.max(0, (p[1] - CAR.floor) / LIGHT.low));
  const under = Math.min(1, Math.max(0, (Math.abs(p[0]) - AISLE.half) / AISLE.fade));
  const shade = 1 - (1 - LIGHT.shadow) * under * (1 - low);
  // (and of what comes back off everything, some of that too)
  return out.copy(LAMP).multiplyScalar(direct * shade).add(_bounce.copy(BOUNCE).multiplyScalar(LIGHT.bounce * (0.6 + 0.4 * shade)));
}

// Where a car's side is cut, along it: its end, each doorway's edges, the
// other end (or the back of the cab).
function cutsOf(cab) {
  const cuts = [-CAR.len / 2];
  for (const d of DOORS) cuts.push(d - DOOR_HALF, d + DOOR_HALF);
  cuts.push(CAR.len / 2 - (cab ? CAB : 0));
  return cuts;
}

// One side's wall of a car, outside, x = ±half: panels round its windows
// and doors.
function sideWall(m, x, cab) {
  const facing = Math.sign(x); // which way across this face looks
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
  const cuts = cutsOf(cab);
  for (let k = 0; k + 1 < cuts.length; k++) {
    const za = cuts[k];
    const zb = cuts[k + 1];
    if (k % 2 === 1) {
      // the doors: steel, a window in each leaf (open, as the others are),
      // the floor's edge under
      const zm = (za + zb) / 2;
      const { y0, y1 } = DOOR_GLASS;
      panel(za, zb, 0.85, CAR.floor, COL.under);
      panel(za, zb, CAR.floor, y0, COL.door);
      panel(za, za + 0.12, y0, y1, COL.door);
      panel(zb - 0.12, zb, y0, y1, COL.door);
      panel(zm - 0.02, zm + 0.02, CAR.floor, DOOR_TOP, COL.doorEdge);
      panel(zm - 0.07, zm - 0.02, y0, y1, COL.door);
      panel(zm + 0.02, zm + 0.07, y0, y1, COL.door);
      panel(za, zm - 0.02, y1, DOOR_TOP, COL.door);
      panel(zm + 0.02, zb, y1, DOOR_TOP, COL.door);
      panel(za, zb, DOOR_TOP, CAR.eaves, COL.steel);
      continue;
    }
    panel(za, zb, 0.85, WINDOW.y0, COL.steel);
    panel(za, zb, WINDOW.y1, CAR.eaves, COL.band);
    // the windows, open, between narrow piers of the band
    const n = Math.max(1, Math.round((zb - za) / 1.7));
    const w = (zb - za) / n;
    for (let j = 0; j <= n; j++) {
      const zc = za + j * w;
      panel(Math.max(za, zc - 0.13), Math.min(zb, zc + 0.13), WINDOW.y0, WINDOW.y1, COL.band);
    }
  }
}

// A face inside a car, its corners [x, y, z] in order round it as seen from
// inside, looking n; each corner coloured `col` as the strips (z0 to z1)
// light it there.
function litQuad(m, a, b, c, d, col, n, z0, z1) {
  quad(m, a, b, c, d, [a, b, c, d].map((p) => carLight(p, n, z0, z1).multiply(col)));
}

// A box inside a car, square to it, round (cx, cy, cz), hx, hy, hz either
// way: each face coloured `col` at each corner as the strips light it there.
const FACES = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]; // [axis, way]
function litBox(m, cx, cy, cz, hx, hy, hz, col, z0, z1) {
  const c = [cx, cy, cz];
  const h = [hx, hy, hz];
  for (const [k, w] of FACES) {
    // the face's corners, round it the way it looks
    const i = (k + 1) % 3;
    const j = (k + 2) % 3;
    const at = (u, v) => {
      const p = [0, 0, 0];
      p[k] = c[k] + w * h[k];
      p[i] = c[i] + u * h[i];
      p[j] = c[j] + v * h[j];
      return p;
    };
    const n = [0, 0, 0];
    n[k] = w;
    if (w > 0) litQuad(m, at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), col, n, z0, z1);
    else litQuad(m, at(-1, -1), at(-1, 1), at(1, 1), at(1, -1), col, n, z0, z1);
  }
}

// One side's wall of a car, inside, x = ±IN.wall: panels round its windows
// and doors, up to where it curves in to the ceiling; then that curve.
function innerWall(m, x, cab, z0, z1, za0, zb1) {
  const s = Math.sign(x);
  const n = [-s, 0, 0];
  const panel = (za, zb, ya, yb, col) => {
    za = Math.max(za, za0);
    zb = Math.min(zb, zb1);
    if (zb - za < 0.01 || yb - ya < 0.01) return;
    const a = [x, ya, za];
    const b = [x, ya, zb];
    const c = [x, yb, zb];
    const d = [x, yb, za];
    // (seen from inside, looking -s across)
    if (s < 0) litQuad(m, a, d, c, b, col, n, z0, z1);
    else litQuad(m, a, b, c, d, col, n, z0, z1);
  };
  const cuts = cutsOf(cab);
  for (let k = 0; k + 1 < cuts.length; k++) {
    const za = cuts[k];
    const zb = cuts[k + 1];
    if (k % 2 === 1) {
      // the doors, from inside: a window in each leaf, the wall over them
      const zm = (za + zb) / 2;
      const { y0, y1 } = DOOR_GLASS;
      panel(za, zb, CAR.floor, y0, COL.doorIn);
      panel(za, za + 0.12, y0, y1, COL.doorIn);
      panel(zb - 0.12, zb, y0, y1, COL.doorIn);
      panel(zm - 0.07, zm + 0.07, y0, y1, COL.doorIn);
      panel(za, zb, y1, DOOR_TOP, COL.doorIn);
      panel(za, zb, DOOR_TOP, IN.cove, COL.wallIn);
    } else {
      panel(za, zb, CAR.floor, WINDOW.y0, COL.wallLow);
      panel(za, zb, WINDOW.y1, IN.cove, COL.wallIn);
      const w = (zb - za) / Math.max(1, Math.round((zb - za) / 1.7));
      for (let zc = za; zc <= zb + 1e-6; zc += w) panel(Math.max(za, zc - 0.13), Math.min(zb, zc + 0.13), WINDOW.y0, WINDOW.y1, COL.wallIn);
    }
    // the curve in to the ceiling, over this stretch
    const ea = Math.max(za, za0);
    const eb = Math.min(zb, zb1);
    if (eb - ea < 0.01) continue;
    const e = s * IN.edge;
    const dn = Math.hypot(IN.ceiling - IN.cove, IN.wall - IN.edge);
    const nc = [(-s * (IN.ceiling - IN.cove)) / dn, -(IN.wall - IN.edge) / dn, 0];
    const p = [[x, IN.cove, ea], [x, IN.cove, eb], [e, IN.ceiling, eb], [e, IN.ceiling, ea]];
    if (s < 0) litQuad(m, p[0], p[3], p[2], p[1], COL.ceiling, nc, z0, z1);
    else litQuad(m, p[0], p[1], p[2], p[3], COL.ceiling, nc, z0, z1);
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

// The inside of a car, along it: from the end wall at its back (-z) to the
// one at its front (or the back of the cab).
function insideOf(cab) {
  return { z0: -CAR.len / 2 + 0.2, z1: cab ? CAR.len / 2 - CAB - 0.1 : CAR.len / 2 - 0.2 };
}

// The inside's outline across a car, round from the floor at one side.
const PROFILE = [[-IN.wall, CAR.floor], [IN.wall, CAR.floor], [IN.wall, IN.cove], [IN.edge, IN.ceiling], [-IN.edge, IN.ceiling], [-IN.wall, IN.cove]];

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
  for (const x of [-H, H]) sideWall(outer, x, cab);
  // the roof: rounded at its edges, flat on top
  const roofProf = [[-H, CAR.eaves], [-H * 0.82, CAR.roof - 0.12], [-H * 0.55, CAR.roof], [H * 0.55, CAR.roof], [H * 0.82, CAR.roof - 0.12], [H, CAR.eaves]];
  for (let k = 0; k + 1 < roofProf.length; k++) {
    const [xa, ya] = roofProf[k];
    const [xb, yb] = roofProf[k + 1];
    quad(outer, [xa, ya, z0], [xb, yb, z0], [xb, yb, zf], [xa, ya, zf], k === 2 ? COL.roof : COL.steelDark);
  }
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
  const [gy0, gy1, gw] = END_DOOR.glass;
  for (const [z, s] of cab ? [[z0, -1]] : [[z0, -1], [z1, 1]]) {
    for (const x of [-H + 0.1, H - 0.1]) box(outer, x, 1.65, z + s * 0.16, 0.06, 0.72, 0.15, 0, COL.barrier);
    quad(outer, [-gw, gy0, z + s * 0.01], [gw, gy0, z + s * 0.01], [gw, gy1, z + s * 0.01], [-gw, gy1, z + s * 0.01], COL.band);
    quad(outer, [gw, gy0, z + s * 0.01], [-gw, gy0, z + s * 0.01], [-gw, gy1, z + s * 0.01], [gw, gy1, z + s * 0.01], COL.band);
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
  }

  // ── Inside ──
  const { z0: i0, z1: i1 } = insideOf(cab);
  // the strips of lamps along the ceiling, from end to end
  const s0 = i0 + STRIP.end - 0.2;
  const s1 = i1 - STRIP.end + 0.2;
  for (const x of [-STRIP.x, STRIP.x]) box(glow, x, IN.ceiling - 0.012, (s0 + s1) / 2, STRIP.half, 0.012, (s1 - s0) / 2, 0, COL.light);
  // the walls, and their curve in to the ceiling
  for (const x of [-IN.wall, IN.wall]) innerWall(inner, x, cab, s0, s1, i0, i1);
  // the ceiling and the floor, in stretches along (so that the light falls
  // off towards the ends) and, the floor, across (so that it's darker under
  // the seats than in the aisle)
  const along = [i0, ...cutsOf(cab).slice(1, -1), i1];
  for (let k = 0; k + 1 < along.length; k++) {
    const [za, zb] = [along[k], along[k + 1]];
    litQuad(inner, [-IN.edge, IN.ceiling, za], [IN.edge, IN.ceiling, za], [IN.edge, IN.ceiling, zb], [-IN.edge, IN.ceiling, zb], COL.ceiling, [0, -1, 0], s0, s1);
    const xs = [-IN.wall, -AISLE.half, AISLE.half, IN.wall];
    for (let j = 0; j + 1 < xs.length; j++) litQuad(inner, [xs[j], CAR.floor, za], [xs[j], CAR.floor, zb], [xs[j + 1], CAR.floor, zb], [xs[j + 1], CAR.floor, za], COL.floor, UP, s0, s1);
  }
  // the ends: a wall round the inside's outline, and the door into the next car
  for (const [z, s] of [[i0, 1], [i1, -1]]) {
    const n = [0, 0, s];
    const mid = [0, (CAR.floor + IN.ceiling) / 2, z];
    for (let k = 0; k < PROFILE.length; k++) {
      const [xa, ya] = PROFILE[k];
      const [xb, yb] = PROFILE[(k + 1) % PROFILE.length];
      const a = [xa, ya, z];
      const b = [xb, yb, z];
      // (seen from inside: looking -s along)
      if (s > 0) litQuad(inner, mid, a, b, b, COL.wallIn, n, s0, s1);
      else litQuad(inner, mid, b, a, a, COL.wallIn, n, s0, s1);
    }
    if (cab && s < 0) continue; // (the back of the cab has no door in it)
    const zd = z + s * 0.01;
    const door = (xa, xb, ya, yb, col) => {
      const p = [[xa, ya, zd], [xb, ya, zd], [xb, yb, zd], [xa, yb, zd]];
      if (s > 0) litQuad(inner, p[0], p[1], p[2], p[3], col, n, s0, s1);
      else litQuad(inner, p[0], p[3], p[2], p[1], col, n, s0, s1);
    };
    const { half: dh, top } = END_DOOR;
    door(-dh, dh, CAR.floor, gy0, COL.doorIn);
    door(-dh, -gw, gy0, gy1, COL.doorIn);
    door(gw, dh, gy0, gy1, COL.doorIn);
    door(-gw, gw, gy0, gy1, COL.glass);
    door(-dh, dh, gy1, top, COL.doorIn);
  }
  // the bars along the ceiling, to hold on to, and the poles by the doors
  const solid = (cx, cy, cz, hx, hy, hz, col) => litBox(inner, cx, cy, cz, hx, hy, hz, col, s0, s1);
  for (const x of [-BAR.x, BAR.x]) solid(x, BAR.y, (i0 + i1) / 2, 0.018, 0.018, (i1 - i0) / 2 - 0.8, COL.pole);
  for (const d of DOORS) {
    for (const zz of [d - DOOR_HALF - 0.3, d + DOOR_HALF + 0.3]) {
      if (zz < i1 - 0.3) solid(0, (CAR.floor + IN.ceiling) / 2, zz, 0.025, (IN.ceiling - CAR.floor) / 2, 0.025, COL.pole);
    }
  }
  // the seats: the cushion, its back, the leg under it
  for (const s of SEATS) {
    if (cab && s.z > i1 - 0.6) continue;
    const back = s.yaw ? 1 : -1;
    const top = CAR.floor + SEAT.y;
    solid(s.x, top - 0.06, s.z, 0.22, 0.06, SEAT.depth / 2, COL.seat);
    solid(s.x, top + SEAT.back / 2, s.z + back * (SEAT.depth / 2 - 0.04), 0.22, SEAT.back / 2, 0.05, COL.seatBack);
    solid(s.x, CAR.floor + SEAT.y / 2 - 0.06, s.z, 0.04, SEAT.y / 2 - 0.06, 0.04, COL.pole);
  }
  return { outer: outer.build(), inner: inner.build(), glow: glow.build() };
}

const _a = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
const _q = new THREE.Quaternion();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
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

  // Where (x, y, z) in car `car`'s own frame (x across, y up from the rail,
  // z along) is in the world: out.x, y, z.
  point(car, x, y, z, out) {
    const g = this.cars[car].group;
    _o.set(x, y, z).applyQuaternion(g.quaternion).add(g.position);
    out.x = _o.x;
    out.y = _o.y;
    out.z = _o.z;
    return out;
  }

  // How far (m) along dir from `from` (both in the world, `from` inside car
  // `car`) its walls, floor, ceiling or ends are, kept `clear` m back from
  // them; Infinity if `from` isn't inside it.
  inside(car, from, dir, clear = 0.15) {
    const c = this.cars[car];
    const g = c.group;
    _q.copy(g.quaternion).invert();
    _o.set(from.x, from.y, from.z).sub(g.position).applyQuaternion(_q);
    _d.set(dir.x, dir.y, dir.z).applyQuaternion(_q);
    const { z0, z1 } = insideOf(c.cab);
    const lo = [-IN.wall + clear, CAR.floor + clear, z0 + clear];
    const hi = [IN.wall - clear, IN.ceiling - clear, z1 - clear];
    const o = [_o.x, _o.y, _o.z];
    const d = [_d.x, _d.y, _d.z];
    let t = Infinity;
    for (let k = 0; k < 3; k++) {
      if (o[k] < lo[k] || o[k] > hi[k]) return Infinity;
      if (d[k] > 1e-9) t = Math.min(t, (hi[k] - o[k]) / d[k]);
      else if (d[k] < -1e-9) t = Math.min(t, (lo[k] - o[k]) / d[k]);
    }
    return t;
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
