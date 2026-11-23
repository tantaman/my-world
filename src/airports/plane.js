// The plane, made in code like everything else: a little high-winged
// airliner for bush strips, two engines with three-bladed propellers slung
// under the wing, fixed wheels, a tail with a tall fin, and a door on the
// left that folds down into a flight of steps. White, with a green band
// along the windows and a red fin.
//
// It is built round the point on the ground between its main wheels, which
// is where it is put (place), and it pitches about that point, as a plane
// rotating off a runway does about its main wheels. +z is forward, +x its
// left, +y up.
//
//   new Plane({ material, glow })
//     object            the group to put in the scene
//     place(pose)       { x, y, z, yaw, pitch (nose up), roll (left wing up) }
//     run(dt, pose, night, time)   spin the propellers, swing the door, the
//                       lights: pose.power (0..1), door (0..1), lit (bool),
//                       aloft (bool)
//     seat(out)         where the passenger sits, in the world
//     door(out)         the foot of the steps, in the world, and which way
//                       they face (out.yaw)

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { quad, beam } from '../build/faces.js';

const col = (hex) => new THREE.Color(hex);
export const PAL = {
  white: col(0xe8e6df),
  shade: col(0xc9c7c0),
  belly: col(0x9fa19f),
  band: col(0x2f6b45),
  fin: col(0xb8432d),
  glass: col(0x1c2833),
  metal: col(0x6b6e72),
  dark: col(0x2a2b2d),
  tyre: col(0x1b1b1c),
  prop: col(0x26272a),
  tip: col(0xe2b13a),
  spinner: col(0xd9d6cf),
  step: col(0x55585c),
};

// Sizes (m).
export const PLANE = {
  length: 16.2,
  span: 19.8,
  wing: 3.05, // the underside of the wing over the ground (the top of the cabin)
  propR: 1.3,
  nose: 8.4, // the nose, ahead of the main wheels
  tail: 7.8, // the tail, behind them
};
const HULL = { bottom: 1.1, top: 3.05, half: 0.9 };
const ENGINES = [3.1, -3.1]; // x of each engine
const PROP_AT = { y: 2.88, z: 4.5 };
const DOOR = { x: HULL.half + 0.02, hinge: 1.12, z0: -2.35, z1: -1.45, h: 1.72, open: 2.29 }; // open: rad it swings down through
const SEAT = { x: 0.45, y: 1.5, z: 1.0 };

// The cross-section of the hull, round from the bottom: [across (-1..1),
// up (0..1)]. The band along the windows is between BAND[0] and BAND[1] up.
const SECTION = [
  [0.55, 0],
  [1, 0.17],
  [1, 0.4],
  [1, 0.5],
  [1, 0.83],
  [0.62, 1],
  [-0.62, 1],
  [-1, 0.83],
  [-1, 0.5],
  [-1, 0.4],
  [-1, 0.17],
  [-0.55, 0],
];
const BAND = [0.4, 0.5];
// Along the hull: [z, half width, bottom, top].
const STATIONS = [
  [8.4, 0.12, 1.78, 2.06],
  [7.85, 0.52, 1.38, 2.42],
  [6.95, 0.84, 1.13, 2.86],
  [6.05, 0.9, 1.1, 3.05],
  [-2.7, 0.9, 1.1, 3.05],
  [-4.9, 0.7, 1.55, 3.0],
  [-7.5, 0.24, 2.46, 2.96],
  [-7.8, 0.05, 2.7, 2.9],
];

const _v = new THREE.Vector3();

export class Plane {
  constructor({ material, glow }) {
    this.object = new THREE.Group();
    this.object.rotation.order = 'YXZ';
    const body = new THREE.Mesh(hull().build(), material);
    body.castShadow = true;
    body.receiveShadow = true;
    this.object.add(body);
    // the propellers, each its own mesh to spin
    const blades = propeller().build();
    this.props = ENGINES.map((x, k) => {
      const p = new THREE.Mesh(blades, material);
      p.position.set(x, PROP_AT.y, PROP_AT.z);
      p.rotation.z = k * 1.1;
      p.castShadow = true;
      this.object.add(p);
      return p;
    });
    // the door, hinged at the sill, with its steps
    this.doorway = new THREE.Group();
    this.doorway.position.set(DOOR.x, DOOR.hinge, (DOOR.z0 + DOOR.z1) / 2);
    const door = new THREE.Mesh(steps().build(), material);
    door.castShadow = true;
    this.doorway.add(door);
    this.object.add(this.doorway);
    // the lights: red on the left wingtip, green on the right, white on the
    // tail, steady while the engines run; a red beacon on the fin that
    // blinks; white strobes on the tips in the air; landing lights
    const lights = new Mesher();
    const lamp = (x, y, z, c, s = 0.13) => lampBox(lights, x, y, z, s, c);
    const tipY = PLANE.wing + 0.42;
    lamp(PLANE.span / 2, tipY, 2.4, col(0xff2a1c));
    lamp(-PLANE.span / 2, tipY, 2.4, col(0x1cff5a));
    lamp(0, 2.85, -7.85, col(0xfff4e0));
    this.navs = new THREE.Mesh(lights.build(), glow);
    this.object.add(this.navs);
    const beacon = new Mesher();
    lampBox(beacon, 0, 5.72, -7.1, 0.16, col(0xff3018));
    lampBox(beacon, 0, HULL.bottom - 0.05, 0.6, 0.14, col(0xff3018));
    this.beacon = new THREE.Mesh(beacon.build(), glow);
    this.object.add(this.beacon);
    const strobe = new Mesher();
    lampBox(strobe, PLANE.span / 2 + 0.05, tipY, 1.9, 0.12, col(0xffffff));
    lampBox(strobe, -PLANE.span / 2 - 0.05, tipY, 1.9, 0.12, col(0xffffff));
    this.strobe = new THREE.Mesh(strobe.build(), glow);
    this.object.add(this.strobe);
    const landing = new Mesher();
    for (const x of [1.6, -1.6]) lampBox(landing, x, PLANE.wing + 0.12, 3.45, 0.16, col(0xfff6d8));
    this.landing = new THREE.Mesh(landing.build(), glow);
    this.object.add(this.landing);
    this.turned = 0;
  }

  place(p) {
    this.object.position.set(p.x, p.y, p.z);
    this.object.rotation.set(-p.pitch, p.yaw, p.roll);
  }

  run(dt, p, time) {
    // two turns a second idling, a blur flat out
    this.turned += dt * Math.PI * 2 * (p.power > 0.01 ? 1.5 + p.power * 30 : 0);
    this.props[0].rotation.z = this.turned;
    this.props[1].rotation.z = -this.turned + 1.1;
    this.doorway.rotation.z = -DOOR.open * p.door;
    const on = p.power > 0.02;
    this.navs.visible = on;
    this.beacon.visible = on && time % 1.2 < 0.15;
    this.strobe.visible = p.aloft && time % 1.5 < 0.06;
    this.landing.visible = !!p.lit;
  }

  // Where the passenger sits, in the world (the plane placed as it is).
  seat(out) {
    this.object.updateMatrixWorld();
    _v.set(SEAT.x, SEAT.y, SEAT.z).applyMatrix4(this.object.matrixWorld);
    out.x = _v.x;
    out.y = _v.y;
    out.z = _v.z;
    return out;
  }
}

// The foot of the steps from a plane at pose p (on the ground), and the way
// you face coming down them: out from the door, a step to the side of it.
export function doorFoot(p, out = {}) {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const lx = DOOR.x + 2.6;
  const lz = (DOOR.z0 + DOOR.z1) / 2;
  out.x = p.x + lx * c + lz * s;
  out.z = p.z - lx * s + lz * c;
  out.yaw = p.yaw + Math.PI / 2;
  return out;
}

// ── Making it ────────────────────────────────────────────────────────────────

function hull() {
  const m = new Mesher();
  // the fuselage, lofted from section to section
  const ring = (st) => SECTION.map(([u, v]) => [u * st[1], st[2] + v * (st[3] - st[2]), st[0]]);
  const rings = STATIONS.map(ring);
  const nose = (k) => k === 1; // between the nose's second and third stations: the windscreen
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k];
    const b = rings[k + 1];
    for (let j = 0; j < SECTION.length; j++) {
      const j1 = (j + 1) % SECTION.length;
      const v = (SECTION[j][1] + SECTION[j1][1]) / 2;
      let c = v < 0.1 ? PAL.belly : v > BAND[0] && v < BAND[1] ? PAL.band : v < 0.3 ? PAL.shade : PAL.white;
      if (nose(k) && v > 0.6) c = PAL.glass;
      if (k === STATIONS.length - 2) c = PAL.shade;
      face(m, a[j], a[j1], b[j1], b[j], c);
    }
  }
  // windows along both sides, and the cockpit's side windows
  for (const side of [1, -1]) {
    const x = side * (HULL.half + 0.012);
    for (let z = 4.4; z > -2.4; z -= 0.92) {
      if (side > 0 && z < DOOR.z1 + 0.5 && z > DOOR.z0 - 0.5) continue;
      sidePanel(m, x, 2.2, 2.62, z - 0.25, z + 0.25, side, PAL.glass);
    }
    sidePanel(m, side * (HULL.half - 0.01), 2.25, 2.75, 5.3, 6.2, side, PAL.glass);
  }
  // the wing: two tapering halves, a little higher at the tips, on top of the cabin
  for (const side of [1, -1]) {
    const root = { x: 0, y: PLANE.wing, z0: 1.15, z1: 3.3, t: 0.34 };
    const tip = { x: (side * PLANE.span) / 2, y: PLANE.wing + 0.32, z0: 1.55, z1: 3.15, t: 0.2 };
    wing(m, root, tip, side, PAL.white, PAL.shade);
    // the strut under it
    beam(m, [side * HULL.half * 0.95, HULL.bottom + 0.35, 2.15], [side * 4.2, PLANE.wing + 0.04, 2.2], 0.09, 0.2, PAL.shade);
  }
  // the engines: a nacelle under the wing at each, its cowling dark at the front
  for (const x of ENGINES) {
    const y0 = 2.5;
    const y1 = PLANE.wing + 0.18;
    boxAt(m, x, (y0 + y1) / 2, 2.3, 0.38, (y1 - y0) / 2, 1.95, PAL.white);
    boxAt(m, x, (y0 + y1) / 2, 4.15, 0.4, (y1 - y0) / 2 + 0.02, 0.18, PAL.dark);
    boxAt(m, x + Math.sign(x) * 0.42, 2.62, 2.9, 0.07, 0.07, 0.35, PAL.metal); // the exhaust stub
    // the spinner
    cone(m, x, PROP_AT.y, PROP_AT.z - 0.05, 0.24, 0.5, PAL.spinner);
  }
  // the tail: a tall swept fin, red at the top, and the tailplane
  fin(m);
  for (const side of [1, -1]) {
    wing(m, { x: 0, y: 2.98, z0: -7.75, z1: -6.1, t: 0.14 }, { x: side * 3.25, y: 3.02, z0: -7.65, z1: -6.6, t: 0.09 }, side, PAL.white, PAL.shade);
  }
  // the wheels: the nose wheel on its leg, the mains on legs out from the hull
  beam(m, [0, HULL.bottom + 0.1, 5.25], [0, 0.4, 5.35], 0.12, 0.12, PAL.metal);
  wheel(m, 0, 0.36, 5.35, 0.36, 0.2);
  for (const side of [1, -1]) {
    beam(m, [side * HULL.half * 0.9, HULL.bottom + 0.15, 0], [side * 1.95, 0.44, 0], 0.18, 0.1, PAL.shade);
    wheel(m, side * 2.0, 0.42, 0, 0.42, 0.24);
  }
  return m;
}

// A quad facing outward from the hull's axis, whichever way its corners go.
function face(m, a, b, c, d, color) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = d[0] - a[0];
  const vy = d[1] - a[1];
  const vz = d[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const mx = (a[0] + b[0] + c[0] + d[0]) / 4;
  const my = (a[1] + b[1] + c[1] + d[1]) / 4 - (HULL.bottom + HULL.top) / 2;
  if (nx * mx + ny * my < 0) quad(m, d, c, b, a, color);
  else quad(m, a, b, c, d, color);
}

// A flat panel on the side of the hull, facing out (side 1: +x).
function sidePanel(m, x, y0, y1, z0, z1, side, color) {
  if (side > 0) quad(m, [x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], color);
  else quad(m, [x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], color);
}

// A box from its middle and half sizes, square to the plane.
function boxAt(m, x, y, z, hx, hy, hz, color) {
  beam(m, [x, y, z - hz], [x, y, z + hz], hx * 2, hy * 2, color);
}

// A wing (or tailplane) half from root to tip: each { x, y, z0 (trailing
// edge), z1 (leading), t (thick) }.
function wing(m, r, t, side, top, under) {
  const P = (s, z, y) => [s.x, s.y + y, z];
  const rt = [P(r, r.z1, r.t), P(r, r.z0, r.t * 0.6), P(r, r.z0, 0), P(r, r.z1, 0.02)];
  const tt = [P(t, t.z1, t.t), P(t, t.z0, t.t * 0.6), P(t, t.z0, 0), P(t, t.z1, 0.02)];
  const go = (a, b, c, d, color) => (side > 0 ? quad(m, a, b, c, d, color) : quad(m, d, c, b, a, color));
  go(rt[0], tt[0], tt[1], rt[1], top); // the top
  go(rt[2], tt[2], tt[3], rt[3], under); // the underside
  go(rt[3], tt[3], tt[0], rt[0], top); // the leading edge
  go(rt[1], tt[1], tt[2], rt[2], under); // the trailing edge
  // the tip, closed
  if (side > 0) quad(m, tt[0], tt[3], tt[2], tt[1], under);
  else quad(m, tt[1], tt[2], tt[3], tt[0], under);
}

// The fin and its rudder, swept back, red over the top half.
function fin(m) {
  const t = 0.1;
  const base = { y: 2.95, z0: -7.85, z1: -4.7 };
  const top = { y: 5.6, z0: -7.95, z1: -6.55 };
  const mid = { y: 4.25, z0: -7.9, z1: -5.62 };
  const panel = (lo, hi, color) => {
    for (const s of [1, -1]) {
      const a = [s * t, lo.y, lo.z1];
      const b = [s * t, lo.y, lo.z0];
      const c = [s * t, hi.y, hi.z0];
      const d = [s * t, hi.y, hi.z1];
      if (s > 0) quad(m, a, b, c, d, color);
      else quad(m, d, c, b, a, color);
    }
    // the leading and trailing edges
    quad(m, [t, lo.y, lo.z1], [t, hi.y, hi.z1], [-t, hi.y, hi.z1], [-t, lo.y, lo.z1], color);
    quad(m, [-t, lo.y, lo.z0], [-t, hi.y, hi.z0], [t, hi.y, hi.z0], [t, lo.y, lo.z0], color);
  };
  panel(base, mid, PAL.white);
  panel(mid, top, PAL.fin);
  quad(m, [t, top.y, top.z1], [t, top.y, top.z0], [-t, top.y, top.z0], [-t, top.y, top.z1], PAL.fin);
}

// A wheel: a short drum across the plane (along x), its tyre dark and its hub pale.
function wheel(m, x, y, z, r, w) {
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const p = (a, s) => [x + s * w * 0.5, y + Math.cos(a) * r, z + Math.sin(a) * r];
    quad(m, p(a0, -1), p(a1, -1), p(a1, 1), p(a0, 1), PAL.tyre);
    for (const s of [1, -1]) {
      const c = [x + s * w * 0.5, y, z];
      const hub = k % 2 ? PAL.metal : PAL.shade;
      if (s > 0) quad(m, c, p(a1, s), p(a0, s), c, hub);
      else quad(m, c, p(a0, s), p(a1, s), c, hub);
    }
  }
}

// A cone pointing forward (+z) from its base at z: the spinner.
function cone(m, x, y, z, r, len, color) {
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const tip = [x, y, z + len];
    quad(m, [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], tip, tip, color);
  }
}

// Three blades round the hub, in the plane's x-y, at z = 0, yellow at the tips.
function propeller() {
  const m = new Mesher();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const bl = (r0, r1, w0, w1, color) => {
      const px = -uy;
      const py = ux;
      const P = (r, w, z) => [ux * r + px * w, uy * r + py * w, z];
      quad(m, P(r0, -w0, 0.03), P(r1, -w1, 0.03), P(r1, w1, -0.03), P(r0, w0, -0.03), color);
      quad(m, P(r0, w0, -0.03), P(r1, w1, -0.03), P(r1, -w1, 0.03), P(r0, -w0, 0.03), color);
    };
    bl(0.15, PLANE.propR - 0.22, 0.1, 0.13, PAL.prop);
    bl(PLANE.propR - 0.22, PLANE.propR, 0.13, 0.1, PAL.tip);
  }
  return m;
}

// The door, closed flush with the hull (its outside white with the band
// across it), and on its inside the steps that it carries, which come out
// level when it's let down. Built round its hinge: up is along it, +x out.
function steps() {
  const m = new Mesher();
  const hz = (DOOR.z1 - DOOR.z0) / 2;
  const h = DOOR.h;
  const t = 0.07;
  // outside
  const bandLo = (HULL.bottom + (HULL.top - HULL.bottom) * BAND[0]) - DOOR.hinge;
  const bandHi = (HULL.bottom + (HULL.top - HULL.bottom) * BAND[1]) - DOOR.hinge;
  const out = (y0, y1, c) => quad(m, [t, y0, -hz], [t, y0, hz], [t, y1, hz], [t, y1, -hz], c);
  out(0, bandLo, PAL.white);
  out(bandLo, bandHi, PAL.band);
  out(bandHi, h, PAL.white);
  quad(m, [t * 0.5, 0.95, -0.2], [t * 0.5, 0.95, 0.2], [t * 1.1, 1.25, 0.2], [t * 1.1, 1.25, -0.2], PAL.glass);
  // inside, and the edges
  quad(m, [0, 0, hz], [0, 0, -hz], [0, h, -hz], [0, h, hz], PAL.step);
  for (const s of [1, -1]) {
    const z = s * hz;
    if (s > 0) quad(m, [0, 0, z], [t, 0, z], [t, h, z], [0, h, z], PAL.shade);
    else quad(m, [t, 0, z], [0, 0, z], [0, h, z], [t, h, z], PAL.shade);
  }
  // the steps, sticking out of its inside, so they're level once it's let
  // down through DOOR.open
  const tilt = DOOR.open - Math.PI / 2; // how far past flat-out it goes
  for (let k = 0; k < 4; k++) {
    const y = 0.3 + k * 0.38;
    const run = 0.26;
    // a tread that, turned with the door, lies flat
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    const a = [0, y, 0];
    const b = [-run * c, y + run * s, 0];
    beam(m, a, b, 0.04, 2 * hz - 0.08, PAL.metal, [0, 0, 1]);
  }
  // the handrail along one side
  beam(m, [-0.02, 0.15, hz - 0.03], [-0.55, h - 0.1, hz - 0.03], 0.04, 0.04, PAL.metal);
  return m;
}

// A little box of light.
function lampBox(m, x, y, z, s, c) {
  beam(m, [x, y, z - s / 2], [x, y, z + s / 2], s, s, c);
}

export { SEAT, DOOR };
