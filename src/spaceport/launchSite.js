// What the launch site looks like, made in code like everything else:
// vertex-coloured primitives merged into a few meshes.
//
//   the pad      a slab of concrete with sloping sides, set on the ground as
//                it is (site.js), a blast plate in the middle, a yellow ring
//                round it and hazard stripes along the edges
//   the tower    a red lattice gantry beside the rocket, with a walkway out
//                to the capsule and a beacon on top
//   the rocket   two white stages, fins, an engine bell, and the capsule on
//                top with its window and escape tower: its own group, so it
//                can fly
//   and round    a fuel tank, a blockhouse, two floodlights
//
// Everything is built round the site's own origin (x, z, at the height of
// the top of the pad) and that group is what's put in the world, so nothing
// big goes to the graphics card (render/origin.js).
//
//   buildLaunchSite(site, ground, materials) -> {
//     object    the group, placed and turned where the site is
//     rocket    the rocket's group (in object), standing on the pad
//     beacons   meshes that blink: the tower's light, the pad's lamps
//     solids    capsules for the world's Solids
//   }
//   makeCapsule(materials) -> { object, chute }   the capsule coming home
//   makeExhaust() -> { object, flame, smoke }     the flame and the smoke
//   ground(x, z) -> height of the ground in the world

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { toWorld } from '../landmarks/sites.js';
import { PAD, SKIRT, ROCKET_AT, TOWER_AT } from './site.js';

const col = (hex) => new THREE.Color(hex);
const PAL = {
  concrete: col(0x9a978f),
  concreteDark: col(0x6d6a64),
  skirt: col(0x86837b),
  blast: col(0x3b3835),
  yellow: col(0xe2b13a),
  black: col(0x1d1c1b),
  white: col(0xe9e7e1),
  offWhite: col(0xcfcdc6),
  band: col(0x26282c),
  metal: col(0x55575c),
  steel: col(0x8a8d92),
  red: col(0xb8432d),
  glass: col(0x1a2733),
  tank: col(0xdedbd2),
  orange: col(0xe0662c),
  chute: col(0xe8eef2),
  chuteRed: col(0xd2492e),
};
export const ROCKET = {
  height: 17.6, // m, engine bell to the tip of the escape tower
  radius: 1.2, // m, the stages
  seat: 14.6, // m up: where you sit in the capsule
};
const TOWER = { half: 1.1, height: 20, arm: 14.2 }; // m
const LAMP = 0xffd9a0;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _w = { x: 0, z: 0 };

// A box w × h × d with its bottom middle at (x, y, z), turned yaw about y.
function box(m, w, h, d, x, y, z, color, yaw = 0) {
  _q.setFromAxisAngle(_Y, yaw);
  _m.compose(_p.set(x, y + h / 2, z), _q, _s);
  m.add(new THREE.BoxGeometry(w, h, d), _m, () => color);
}
const _Y = new THREE.Vector3(0, 1, 0);

// A thin strut from a to b (Vector3s), w across.
function strut(m, a, b, w, color) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  _q.setFromUnitVectors(_Y, dir.normalize());
  _m.compose(_p.addVectors(a, b).multiplyScalar(0.5), _q, _s);
  m.add(new THREE.BoxGeometry(w, len, w), _m, () => color);
}

// A solid of revolution round y from [radius, height] pairs, coloured by
// height (paint(y) -> colour).
function lathe(m, profile, segments, x, y, z, paint) {
  const pts = profile.map(([r, h]) => new THREE.Vector2(r, h));
  const geo = new THREE.LatheGeometry(pts, segments);
  _m.compose(_p.set(x, y, z), _q.identity(), _s);
  m.add(geo, _m, (p) => paint(p.y, p));
}

export function buildLaunchSite(site, ground, materials) {
  const object = new THREE.Group();
  object.position.set(site.x, site.top, site.z);
  object.rotation.y = site.yaw;
  // the ground under a point of the site's frame, measured from the pad's top
  const g = (lx, lz) => {
    toWorld(site, lx, lz, _w);
    return ground(_w.x, _w.z) - site.top;
  };
  const m = new Mesher();
  const solids = [];

  // ── The pad ──
  // its top, and its sloping sides down to below the ground all round
  const out = PAD + SKIRT;
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const top = corners.map(([u, v]) => new THREE.Vector3(u * PAD, 0, v * PAD));
  const foot = corners.map(([u, v]) => new THREE.Vector3(u * out, Math.min(-0.3, g(u * out, v * out) - 0.4), v * out));
  m.tris([top[0], top[2], top[1], top[0], top[3], top[2]], () => PAL.concrete);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    // the side, in strips so its foot follows the ground
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a = k / n;
      const b = (k + 1) / n;
      const ta = top[i].clone().lerp(top[j], a);
      const tb = top[i].clone().lerp(top[j], b);
      const fa = foot[i].clone().lerp(foot[j], a);
      const fb = foot[i].clone().lerp(foot[j], b);
      fa.y = Math.min(-0.3, g(fa.x, fa.z) - 0.4);
      fb.y = Math.min(-0.3, g(fb.x, fb.z) - 0.4);
      m.tris([ta, fa, tb, tb, fa, fb], () => PAL.skirt);
    }
  }
  // the blast plate, a ring round it, and stripes along the edges
  box(m, 4.2, 0.03, 4.2, ROCKET_AT.x, 0, ROCKET_AT.z, PAL.blast);
  const RING = 3.6;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    box(m, 0.82, 0.035, 0.22, ROCKET_AT.x + Math.cos(a) * RING, 0, ROCKET_AT.z + Math.sin(a) * RING, PAL.yellow, -a + Math.PI / 2);
  }
  const STRIPE = 1.2;
  for (let i = 0; i < Math.round((PAD * 2) / STRIPE); i++) {
    const t = -PAD + STRIPE * (i + 0.5);
    const c = i % 2 ? PAL.black : PAL.yellow;
    box(m, STRIPE, 0.03, 0.35, t, 0, PAD - 0.25, c);
    box(m, STRIPE, 0.03, 0.35, t, 0, -PAD + 0.25, c);
    box(m, 0.35, 0.03, STRIPE, PAD - 0.25, 0, t, c);
    box(m, 0.35, 0.03, STRIPE, -PAD + 0.25, 0, t, c);
  }
  // the pad's own solids: its top (walked onto from its sloping sides) and
  // the sides themselves, sloping from its edge down to the ground
  const rise = site.top - site.low;
  for (let k = -2; k <= 2; k++) solids.push(capsule(site, -PAD + 1.8, k * 3.6, PAD - 1.8, k * 3.6, 1.8, 0, 0, -rise - 1, rise + 0.4));
  for (let i = 0; i < 4; i++) {
    const [u, v] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][i];
    for (let t = -PAD + 0.6; t <= PAD - 0.6; t += 1.2) {
      const ax = u ? u * (PAD - 0.3) : t;
      const az = v ? v * (PAD - 0.3) : t;
      const bx = u ? u * out : t;
      const bz = v ? v * out : t;
      solids.push(capsule(site, ax, az, bx, bz, 0.6, 0, Math.min(0, g(bx, bz)), -rise - 1));
    }
  }

  // ── The tower ──
  const T = TOWER;
  const tx = TOWER_AT.x;
  const tz = TOWER_AT.z - 0.6;
  const posts = corners.map(([u, v]) => [tx + u * T.half, tz + v * T.half]);
  for (const [x, z] of posts) box(m, 0.22, T.height, 0.22, x, 0, z, PAL.red);
  for (let y = 0; y < T.height - 0.1; y += 2.5) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = posts[i];
      const [bx, bz] = posts[(i + 1) % 4];
      strut(m, new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y + 2.5, bz), 0.1, PAL.red);
      strut(m, new THREE.Vector3(ax, y + 2.5, az), new THREE.Vector3(bx, y + 2.5, bz), 0.12, PAL.red);
    }
  }
  box(m, T.half * 2 + 0.6, 0.15, T.half * 2 + 0.6, tx, T.height, tz, PAL.metal);
  box(m, 0.3, 1.2, 0.3, tx, T.height + 0.15, tz, PAL.metal);
  // the walkway out to the capsule, and the white room at its end
  box(m, 0.9, 0.12, 3.2, tx, T.arm, tz + T.half + 1.4, PAL.metal);
  box(m, 1.3, 2.2, 1.2, tx, T.arm, ROCKET_AT.z - ROCKET.radius - 0.4, PAL.offWhite);
  for (const s of [-1, 1]) box(m, 0.05, 1, 3.2, tx + s * 0.45, T.arm + 0.12, tz + T.half + 1.4, PAL.steel);
  solids.push(capsule(site, tx, tz, tx, tz, T.half + 0.35, 0, T.height + 1, 0));

  // ── Round about ──
  // a fuel tank on legs
  const tank = { x: -6.2, z: 5.6 };
  for (const [u, v] of corners) strut(m, new THREE.Vector3(tank.x + u * 0.9, 0, tank.z + v * 0.9), new THREE.Vector3(tank.x + u * 0.5, 1.6, tank.z + v * 0.5), 0.14, PAL.metal);
  lathe(m, sphereProfile(1.35, 10), 16, tank.x, 2.9, tank.z, () => PAL.tank);
  solids.push(capsule(site, tank.x, tank.z, tank.x, tank.z, 1.4, 0, 4.3, 0));
  // a blockhouse, with a slit to watch from
  const bh = { x: -5.6, z: -5.8 };
  box(m, 3.4, 2.3, 2.6, bh.x, 0, bh.z, PAL.concreteDark);
  box(m, 2.4, 0.25, 0.06, bh.x, 1.5, bh.z + 1.31, PAL.glass);
  box(m, 3.6, 0.2, 2.8, bh.x, 2.3, bh.z, PAL.concrete);
  solids.push(capsule(site, bh.x - 1, bh.z, bh.x + 1, bh.z, 1.35, 0, 2.5, 0));
  // floodlights at two corners
  const lamps = [];
  for (const [u, v] of [
    [1, -1],
    [1, 1],
  ]) {
    const lx = u * (PAD - 1);
    const lz = v * (PAD - 1);
    box(m, 0.2, 7, 0.2, lx, 0, lz, PAL.steel);
    box(m, 1, 0.6, 0.4, lx, 7, lz, PAL.metal, Math.atan2(-lx, -lz));
    lamps.push({ x: lx, y: 7.3, z: lz });
    solids.push(capsule(site, lx, lz, lx, lz, 0.25, 0, 7.6, 0));
  }

  const body = new THREE.Mesh(m.build(), materials.body);
  body.castShadow = body.receiveShadow = true;
  object.add(body);

  // the lights: a beacon on the tower, a lamp in each floodlight
  const beacons = [];
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), beaconMat);
  beacon.position.set(tx, T.height + 1.5, tz);
  object.add(beacon);
  beacons.push(beacon);
  const lampMat = new THREE.MeshBasicMaterial({ color: LAMP });
  for (const l of lamps) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.1), lampMat);
    lamp.position.set(l.x, l.y, l.z);
    lamp.lookAt(0, 0, 0);
    lamp.translateZ(0.22);
    object.add(lamp);
  }

  // ── The rocket ──
  const rocket = new THREE.Group();
  rocket.position.set(ROCKET_AT.x, 0, ROCKET_AT.z);
  rocket.add(makeRocketMesh(materials));
  object.add(rocket);
  solids.push(capsule(site, ROCKET_AT.x, ROCKET_AT.z, ROCKET_AT.x, ROCKET_AT.z, ROCKET.radius + 0.25, 0, ROCKET.height, 0));

  return { object, rocket, beacons, lampMat, solids };
}

// A solid: a capsule from (ax, az) to (bx, bz) in the site's frame, r
// across, its top `topA`..`topB` and bottom `bottom` m over the pad's top.
function capsule(site, ax, az, bx, bz, r, topA, topB, bottom, step) {
  const a = toWorld(site, ax, az);
  const b = toWorld(site, bx, bz);
  const s = { ax: a.x, az: a.z, bx: b.x, bz: b.z, r, bottom: site.top + bottom, topA: site.top + topA, topB: site.top + topB };
  if (step !== undefined) s.step = step;
  return s;
}

// [radius, height] round a sphere of radius r, bottom to top.
function sphereProfile(r, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    out.push([Math.max(1e-3, Math.cos(a) * r), Math.sin(a) * r]);
  }
  return out;
}

// The rocket itself, its engine bell's mouth at 0.
function makeRocketMesh(materials) {
  const m = new Mesher();
  const R = ROCKET.radius;
  // the engine bell
  lathe(
    m,
    [
      [0.95, 0],
      [0.8, 0.4],
      [0.5, 1],
      [0.4, 1.25],
    ],
    14,
    0,
    0,
    0,
    () => PAL.metal,
  );
  // the first stage: white, a black roll band, a dark interstage
  lathe(
    m,
    [
      [1e-3, 1.2],
      [R, 1.2],
      [R, 9.5],
      [R, 10.1],
      [1e-3, 10.1],
    ],
    20,
    0,
    0,
    0,
    (y, p) => (y > 9.45 ? PAL.band : y > 6.6 && y < 7.4 ? PAL.band : y > 2 && y < 6 && Math.atan2(p.z, p.x) > 0 && Math.atan2(p.z, p.x) < Math.PI / 2 ? PAL.band : PAL.white),
  );
  // four fins
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    _q.setFromAxisAngle(_Y, -a);
    _m.compose(_p.set(Math.cos(a) * (R + 0.45), 2.2, Math.sin(a) * (R + 0.45)), _q, _s);
    m.add(new THREE.BoxGeometry(0.95, 2.4, 0.1), _m, () => PAL.band);
  }
  // the second stage, narrowing to the capsule
  lathe(
    m,
    [
      [1e-3, 10.1],
      [R * 0.98, 10.1],
      [R * 0.98, 13.4],
      [R * 0.86, 14],
      [1e-3, 14],
    ],
    20,
    0,
    0,
    0,
    (y) => (y > 13.2 ? PAL.offWhite : PAL.white),
  );
  // the capsule, its window facing front (+z), and the escape tower on top
  lathe(
    m,
    [
      [1e-3, 14],
      [R * 0.86, 14],
      [0.42, 16],
      [1e-3, 16],
    ],
    18,
    0,
    0,
    0,
    () => PAL.steel,
  );
  box(m, 0.42, 0.34, 0.2, 0, 14.75, 0.7, PAL.glass);
  box(m, 0.08, 1.4, 0.08, 0, 16, 0, PAL.metal);
  lathe(
    m,
    [
      [1e-3, 17.1],
      [0.16, 17.1],
      [1e-3, ROCKET.height],
    ],
    8,
    0,
    0,
    0,
    () => PAL.red,
  );
  const mesh = new THREE.Mesh(m.build(), materials.body);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// The capsule coming home under its parachute: the capsule's middle at 0,
// the chute over it (its own group, to sway and to fold away).
export function makeCapsule(materials) {
  const object = new THREE.Group();
  const m = new Mesher();
  const R = ROCKET.radius * 0.86;
  lathe(
    m,
    [
      [1e-3, 0],
      [R, 0],
      [R * 1.02, 0.25],
      [0.42, 2],
      [1e-3, 2],
    ],
    18,
    0,
    0,
    0,
    (y) => (y < 0.25 ? PAL.blast : PAL.steel),
  );
  box(m, 0.42, 0.34, 0.2, 0, 0.75, 0.7, PAL.glass);
  const body = new THREE.Mesh(m.build(), materials.body);
  body.castShadow = true;
  object.add(body);
  // the chute: a dome of panels, red and white, on lines down to the capsule
  // (built round the top of the capsule, where the lines meet)
  const c = new Mesher();
  const CH = { r: 5.5, up: 9, open: Math.PI * 0.42, squash: 0.6 };
  const rimR = CH.r * Math.sin(CH.open);
  const rimY = CH.up + CH.r * Math.cos(CH.open) * CH.squash;
  _m.compose(_p.set(0, CH.up, 0), _q.identity(), _s.set(1, CH.squash, 1));
  c.add(new THREE.SphereGeometry(CH.r, 16, 6, 0, Math.PI * 2, 0, CH.open), _m, (p) => (Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? PAL.chuteRed : PAL.chute));
  _s.set(1, 1, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    strut(c, new THREE.Vector3(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR), new THREE.Vector3(0, 0, 0), 0.03, PAL.offWhite);
  }
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(c.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.castShadow = true;
  chute.add(canopy);
  chute.position.y = 2.05;
  object.add(chute);
  return { object, chute };
}

// The flame under the engine and the smoke it raises. The flame is a cone
// that flickers; the smoke a pool of puffs, set going from under the rocket
// and left to billow and fade where they are.
export const SMOKE = 140; // puffs at once, at the most
export function makeExhaust() {
  const object = new THREE.Group();
  const flameGeo = new THREE.ConeGeometry(0.85, 1, 12, 1, true);
  flameGeo.rotateX(Math.PI);
  flameGeo.translate(0, -0.5, 0); // wide at the engine (0), its tip 1 below
  const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const core = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.scale.set(0.5, 0.6, 0.5);
  flame.add(core);
  flame.visible = false;
  object.add(flame);
  // (lit a little from within, so a cloud in its own shadow is still pale)
  const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xe4e1db, emissive: 0x6a6662, transparent: true, opacity: 0.9, depthWrite: false }), SMOKE);
  smoke.count = 0;
  smoke.frustumCulled = false;
  object.add(smoke);
  return { object, flame, smoke };
}
