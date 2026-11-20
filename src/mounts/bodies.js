// What the mounts look like, and how they move. Built from primitives with
// colour baked into the vertices, like the wildlife (and partly from the
// wildlife's own parts), and posed every frame from how they're going.
//
//   HorseBody   the wildlife's four-legged skeleton and gaits (quadruped.js)
//               with a buckskin horse's proportions: walk, trot, gallop, leap
//   TurtleBody  a ridged shell on four broad paddling legs: strokes in the
//               water, a slow rocking crawl on land
//   EagleBody   the hawk's body and wings (birds.js), golden, and big enough
//               to carry someone
//
// Each one has:
//   mesh           add it to the scene
//   seat           how a rider sits on it (Character.seat)
//   saddle(out)    where the rider's hips go, in the world -> out
//   tilt           how far its back is pitched (radians, nose up negative)
//   radius         how far round its middle it takes up (m)
//   place(x, y, z, yaw)    put it somewhere at once, rather than easing there
//   pose(dt, s)    every frame, from s = { x, y, z, yaw, speed, turn, vy,
//                  grounded, flying, climbing, swimming, graze, alert, look,
//                  shy, ridden, ground(x, z) }: where it is and what it is doing
//   onStep         (x, y, z, kind) a hoof, a foot or a stroke ('step',
//                  'stroke', 'wing') — set by whoever wants to hear it
//   dispose()

import * as THREE from 'three';
import { RigBuilder, lin, at, along, ellipsoid, stick, cone, disposeAnimal } from '../wildlife/rig.js';
import { quadSkeleton, Quad } from '../wildlife/quadruped.js';
import { torso, legs, hooves, tail, eyes, ears, neck, mix } from '../wildlife/mammals.js';
import { buildBird, BirdAnim } from '../wildlife/birds.js';
import { clamp, lerp, smoothstep } from '../noise.js';

const ss = THREE.MathUtils.smoothstep;
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

// ── Horse ────────────────────────────────────────────────────────────────────
// Proportions for quadruped.js (see the deer in mammals.js for what each is).
const HORSE = {
  hipH: 1.3, shoulderH: 1.36, bodyLen: 1.25, hipW: 0.15, shW: 0.14,
  hindU: 0.68, hindL: 0.7, foreU: 0.64, foreL: 0.78,
  neck: { y: 0.12, z: 0.06, len: 0.6, angle: 0.88 },
  tail: { y: 0.2, z: -0.02, len: 0.78, segs: 3, rest: -1.05, upAngle: 0.7, curl: 0.22, swish: 0.22, swishRate: 1.5, runLift: 0.9, flutter: 0.14 },
  ears: { x: 0.05, y: 0.08, z: -0.09, back: 0.05, droop: 0.12, runBack: 0.7, alertFwd: 0.25 },
  trotAt: 2.0, runAt: 6.4, run: 'gallop', gaitRef: { walk: 1.6, trot: 4.2, gallop: 11 },
  neckGraze: 1.8, headGraze: -0.85, grazePitch: 0.06, neckAlert: 0.15, headRest: 0.95, nod: 0.08,
};
// Where the rider's hips go, in the body bone's space (hips at the origin):
// a hand's breadth behind the withers and above the back.
const HORSE_SADDLE = { y: 0.42, z: HORSE.bodyLen / 2 - 0.08 };

function buildHorse(seed) {
  const r = new RigBuilder(seed);
  const d = HORSE;
  const sk = quadSkeleton(r, d);
  const coat = lin(0xb98c56); // buckskin
  const belly = lin(0xcaa673);
  const dark = lin(0x241b15); // the black points: mane, tail, lower legs
  const nose = lin(0x3b2d23);
  const white = lin(0xece6da);
  const fur = (p, n, w) => {
    const c = mix(belly, coat, ss(n.y, -0.8, -0.15));
    // a dun's dark stripe down the spine
    if (n.y > 0.8 && Math.abs(w.x) < 0.05) c.lerp(dark, 0.55);
    return c;
  };
  torso(r, sk, d, { z0: -0.92, z1: 0.86, prof: [[0, 0.2, 0.27, 0.05], [0.18, 0.25, 0.31, 0.02], [0.5, 0.28, 0.33, -0.04], [0.8, 0.26, 0.35, -0.02], [1, 0.19, 0.3, 0.02]], color: fur });
  legs(r, sk, {
    color: coat,
    hind: { upper: [0.1, 0.055], lower: [0.05, 0.042], muscle: [0.14, 0.34, 0.2], muscleY: 0.27, muscleColor: fur, lowerColor: dark },
    fore: { upper: [0.09, 0.05], lower: [0.046, 0.04], muscle: [0.11, 0.27, 0.15], muscleY: 0.25, muscleColor: fur, lowerColor: dark },
    foot: hooves(lin(0x18140f), 0.058, 0.09),
  });
  // a deep neck, and a black mane along its crest
  const nk = d.neck;
  neck(r, sk, d, 0.21, 0.13, 1.6, fur, 0.06);
  r.part(sk.neck, ellipsoid(0.22, 0.28, 0.25, 8, 6), { matrix: at(0, -0.04, -0.06), color: fur });
  const cx = Math.sin(nk.angle);
  const cz = -Math.cos(nk.angle);
  r.part(sk.neck, stick(0.075, 0.05, 5), { matrix: along(0, cx * 0.13, cz * 0.13 - 0.04, 0, Math.cos(nk.angle) * nk.len * 1.02, Math.sin(nk.angle) * nk.len * 1.02, 0.28, 1.2), color: dark, grain: 0.25 });
  // the head: cheek and jowl, and a long face down to a dark muzzle, with a
  // white blaze down its front
  const head = sk.head;
  r.part(head, ellipsoid(0.115, 0.15, 0.17), { matrix: at(0, -0.02, 0.0), color: coat });
  r.part(head, stick(0.095, 0.07, 7), {
    matrix: along(0, 0.03, 0.03, 0, -0.04, 0.48, 1.05, 1.25),
    color: (p, n, w) => (p.y > 0.85 ? nose : n.y > 0.55 && Math.abs(w.x) < 0.035 && p.y > 0.12 ? white : coat),
  });
  r.part(head, ellipsoid(0.085, 0.08, 0.09, 7, 5), { matrix: at(0, -0.03, 0.51), color: nose });
  r.mirror((side) => [head, ellipsoid(0.016, 0.02, 0.012, 4, 3), { matrix: at(side * 0.045, -0.01, 0.59), color: lin(0x0c0a08), grain: 0 }]);
  eyes(r, head, 0.1, 0.05, 0.06, 0.022);
  ears(r, sk, { w: 0.045, len: 0.15, thin: 0.45, tilt: -0.15, out: 0.22, color: coat, inner: dark });
  // forelock
  r.part(head, ellipsoid(0.05, 0.03, 0.09, 6, 4), { matrix: at(0, 0.11, 0.02, 0.5), color: dark });
  tail(r, sk, { r0: 0.05, r1: 0.085, bush: 0.035, flat: 0.55, color: () => dark });
  return { mesh: r.build(), sk };
}

export class HorseBody {
  constructor(seed = (Math.random() * 1e9) | 0) {
    const { mesh, sk } = buildHorse(seed);
    this.mesh = mesh;
    this.sk = sk;
    mesh.rotation.order = 'YXZ';
    this.quad = new Quad(mesh, sk, HORSE);
    this.quad.onStep = (leg) => {
      if (!this.onStep) return;
      leg.foot.getWorldPosition(_v);
      this.onStep(_v.x, _v.y, _v.z, 'step');
    };
    this.onStep = null;
    this.seat = { spread: 0.27, hang: 0.6, fwd: 0.14, lean: 0.14, reins: 1 };
    this.radius = 0.9;
  }

  place(x, y, z, yaw) {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = yaw;
    this.quad.y = NaN;
  }

  pose(dt, s) {
    const q = this.quad;
    const m = this.mesh;
    m.position.x = s.x;
    m.position.z = s.z;
    m.rotation.y = s.yaw;
    q.speed = s.speed;
    q.turn = s.turn;
    // in the air over a jump: lifted off the ground, legs tucked and stretched
    const lift = s.grounded ? 0 : Math.max(0, s.y - s.ground(s.x, s.z));
    q.lift = lift;
    q.air = lerp(q.air, smoothstep(0.1, 0.5, lift), 1 - Math.exp(-dt * 10));
    q.graze = lerp(q.graze, s.graze ?? 0, 1 - Math.exp(-dt * 2));
    q.alert = lerp(q.alert, s.alert ?? 0, 1 - Math.exp(-dt * 4));
    q.lookYaw = lerp(q.lookYaw, s.look ?? 0, 1 - Math.exp(-dt * 3));
    q.tailUp = lerp(q.tailUp, s.shy ? 1 : 0, 1 - Math.exp(-dt * 3));
    q.update(dt, s.ground);
  }

  saddle(out) {
    this.mesh.updateMatrixWorld(true);
    return this.sk.body.localToWorld(out.set(0, HORSE_SADDLE.y, HORSE_SADDLE.z));
  }

  get tilt() {
    return this.sk.body.rotation.x;
  }

  dispose() {
    disposeAnimal(this.mesh);
  }
}

// ── Turtle ───────────────────────────────────────────────────────────────────
// A snapping turtle as long as a rowing boat: a ridged, mossy shell with a
// saw-toothed back edge, a big blunt head with a hooked beak, broad webbed
// legs, and a long saw-backed tail. Measurements in metres; the feet are at
// the origin.
const SHELL = { len: 0.92, wide: 0.64, high: 0.4, y: 0.34 }; // half-length, half-width, dome height, belly height
const TURTLE_SADDLE = { y: SHELL.high + 0.14, z: -0.06 };
// Legs: where they join the shell (fraction of its half-length, and of its
// half-width), and how they stroke and step. Diagonal pairs move together.
const TLEGS = [
  { id: 'LF', side: 1, fz: 0.58, fore: true, off: 0 },
  { id: 'RF', side: -1, fz: 0.58, fore: true, off: 0.5 },
  { id: 'LH', side: 1, fz: -0.62, fore: false, off: 0.5 },
  { id: 'RH', side: -1, fz: -0.62, fore: false, off: 0 },
];
const STROKE_LEN = 1.6; // m swum per stroke of the front legs
const STEP_LEN = 0.45; // m crawled per step

function buildTurtle(seed) {
  const r = new RigBuilder(seed);
  r.grain = 0.18;
  const S = SHELL;
  const body = r.bone(null, 0, S.y, 0, 'body');
  const neckB = r.bone(body, 0, 0.04, S.len * 0.82, 'neck');
  const head = r.bone(neckB, 0, 0.03, 0.26, 'head');
  const tailB = r.bone(body, 0, 0.0, -S.len * 0.85, 'tail');
  const legBones = TLEGS.map((L) => {
    const b = r.bone(body, L.side * S.wide * 0.74, -0.06, L.fz * S.len, L.id);
    b.rotation.order = 'YZX';
    return { ...L, bone: b };
  });

  const shellC = lin(0x4b4530);
  const seamC = lin(0x24211a);
  const moss = lin(0x56652e);
  const belly = lin(0xc4b386);
  const skin = lin(0x55574a);
  const skinUnder = lin(0xb4a676);
  const beakC = lin(0x262420);

  // The shell: a dome over a flat belly, with three low keels, a flared rim
  // and a saw-toothed back edge, painted in scutes with dark seams.
  const g = new THREE.SphereGeometry(1, 24, 14);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    const rim = 1 - Math.abs(y);
    if (y > 0) {
      const keel = 0.08 * Math.exp(-((x / 0.12) ** 2)) + 0.05 * Math.exp(-(((Math.abs(x) - 0.5) / 0.1) ** 2));
      y = y * S.high * (1 + keel) + rim * rim * 0.03;
    } else y *= 0.14;
    // the back edge is serrated
    const saw = z < -0.4 && rim > 0.85 ? 0.05 * Math.max(0, Math.sin(Math.atan2(x, -z) * 9)) * ss(-z, 0.4, 0.8) : 0;
    const flare = 1 + rim ** 6 * 0.06 + saw;
    pos.setXYZ(i, x * S.wide * flare, y, z * S.len * flare);
  }
  g.computeVertexNormals();
  r.part(body, g, {
    color: (p) => {
      if (p.y < 0.02) return belly;
      // scutes: a row of five down the middle, four either side, and the rim
      const u = p.x / S.wide;
      const v = p.z / S.len;
      const lat = Math.abs(u);
      const row = lat < 0.28 ? 5 : 4;
      const t = (v + 1) * 0.5 * row;
      const seamV = Math.abs(t - Math.round(t)) < 0.06;
      const seamU = Math.abs(lat - 0.28) < 0.025 || Math.abs(lat - 0.78) < 0.025;
      if (lat > 0.8) return Math.abs(((Math.atan2(p.x, p.z) * 12) / TAU) % 1) < 0.08 ? seamC : shellC.clone().lerp(seamC, 0.25);
      if (seamV || seamU) return seamC;
      const m = Math.sin(p.x * 9.1 + p.z * 4.3) * Math.sin(p.x * 3.7 - p.z * 7.9);
      return m > 0.35 ? shellC.clone().lerp(moss, 0.7) : shellC;
    },
  });

  // neck and head: a thick neck, a big blunt head, a hooked beak
  r.part(neckB, stick(0.13, 0.11, 8), { matrix: along(0, 0, -0.12, 0, 0.03, 0.4, 1, 0.85), color: (p, n) => (n.y < -0.2 ? skinUnder : skin) });
  r.part(head, ellipsoid(0.15, 0.12, 0.19, 9, 7), { matrix: at(0, 0.02, 0.08), color: (p, n) => (n.y < -0.3 ? skinUnder : skin) });
  r.part(head, ellipsoid(0.1, 0.08, 0.1, 7, 5), { matrix: at(0, -0.01, 0.22), color: skin });
  r.part(head, cone(0.06, 0.1, 6), { matrix: at(0, -0.02, 0.3, Math.PI / 2 + 0.5), color: beakC, grain: 0.05 });
  r.mirror((side) => [head, ellipsoid(0.026, 0.026, 0.02, 5, 4), { matrix: at(side * 0.1, 0.07, 0.17), color: lin(0x1a1608), grain: 0 }]);
  r.mirror((side) => [head, ellipsoid(0.012, 0.012, 0.01, 4, 3), { matrix: at(side * 0.115, 0.075, 0.185), color: lin(0xb89a3a), grain: 0 }]);

  // legs: a stout limb out and down to a broad webbed foot with claws
  for (const L of legBones) {
    const s = L.side;
    const len = L.fore ? 1.1 : 0.9;
    r.part(L.bone, stick(0.1 * len, 0.075 * len, 6), { matrix: along(0, 0, 0, s * 0.24 * len, -0.27, 0.04, 1, 0.8), color: skin });
    r.part(L.bone, ellipsoid(0.17 * len, 0.035, 0.13 * len, 7, 4), { matrix: at(s * 0.28 * len, -0.27, 0.06), color: (p, n) => (n.y < 0 ? skinUnder : skin) });
    for (let k = -1; k <= 1; k++) r.part(L.bone, cone(0.016, 0.06, 4), { matrix: at(s * (0.28 + k * 0.06) * len, -0.28, 0.06 + 0.12 * len, Math.PI / 2), color: beakC, grain: 0 });
  }
  // the tail, long and saw-backed
  r.part(tailB, stick(0.09, 0.015, 6), { matrix: along(0, 0, 0, 0, -0.1, -0.7, 1, 0.8), color: skin });
  for (let k = 0; k < 6; k++) {
    const t = k / 6;
    r.part(tailB, cone(0.03 * (1 - t * 0.7), 0.06 * (1 - t * 0.6), 3), { matrix: at(0, 0.06 * (1 - t) - t * 0.1, -0.08 - t * 0.6), color: skin, grain: 0.1 });
  }
  const mesh = r.build();
  return { mesh, body, neck: neckB, head, tail: tailB, legs: legBones };
}

export class TurtleBody {
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.rig = buildTurtle(seed);
    this.mesh = this.rig.mesh;
    this.mesh.rotation.order = 'YXZ';
    this.seat = { spread: 0.46, hang: 0.34, fwd: 0.24, lean: 0.08, reins: 0.55 };
    this.radius = 1.0;
    this.onStep = null;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.swim = 0; // blends crawling into swimming strokes
    this.move = 0;
    this.pitch = 0;
    this.roll = 0;
    this.tuck = 0; // head drawn in
    this.y = NaN;
    this.look = 0;
  }

  place(x, y, z, yaw) {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = yaw;
    this.y = y;
  }

  pose(dt, s) {
    const R = this.rig;
    this.time += dt;
    const k = (r) => 1 - Math.exp(-dt * r);
    this.swim = lerp(this.swim, s.swimming ? 1 : 0, k(3));
    const moving = smoothstep(0.05, 0.4, s.speed);
    this.move = lerp(this.move, moving, k(5));
    const before = this.phase;
    this.phase += (s.speed / lerp(STEP_LEN, STROKE_LEN, this.swim)) * dt;
    // a step or a stroke as each half (crawling) or whole (swimming) cycle comes round
    const beats = this.swim > 0.5 ? 1 : 2;
    if (this.onStep && this.move > 0.3 && Math.floor(this.phase * beats) !== Math.floor(before * beats)) {
      this.onStep(s.x, s.y + 0.3, s.z, this.swim > 0.5 ? 'stroke' : 'step');
    }

    // where it lies: on the ground, tipped to its slope, or afloat, bobbing
    this.y = Number.isNaN(this.y) ? s.y : lerp(this.y, s.y, k(10));
    const m = this.mesh;
    m.position.set(s.x, this.y + Math.sin(this.time * 1.7) * 0.03 * this.swim, s.z);
    m.rotation.y = s.yaw;
    let pitch = 0;
    if (!s.swimming) {
      const fx = Math.sin(s.yaw) * SHELL.len;
      const fz = Math.cos(s.yaw) * SHELL.len;
      pitch = -Math.atan2(s.ground(s.x + fx, s.z + fz) - s.ground(s.x - fx, s.z - fz), SHELL.len * 2);
    }
    this.pitch = lerp(this.pitch, clamp(pitch, -0.5, 0.5), k(6));
    const ph = this.phase * TAU;
    // crawling rocks it side to side
    this.roll = lerp(this.roll, Math.sin(ph) * 0.05 * this.move * (1 - this.swim) + clamp(-s.turn * s.speed * 0.05, -0.15, 0.15) * this.swim, k(6));
    R.body.rotation.x = this.pitch;
    R.body.rotation.z = this.roll;

    for (const L of R.legs) {
      const p = ph + L.off * TAU;
      const sw = Math.sin(p);
      const lift = Math.max(0, Math.cos(p));
      // crawling: swing fore and back, lifting on the way forward
      const crawlY = sw * 0.45 * this.move;
      const crawlZ = -lift * 0.35 * this.move;
      // swimming: the front legs sweep back like oars, the back ones kick
      const strokeY = L.fore ? 0.35 + Math.sin(ph) * 0.75 * Math.max(this.move, 0.25) : Math.sin(ph * 2 + L.off * TAU) * 0.4 * Math.max(this.move, 0.2);
      const strokeZ = L.fore ? 0.6 + Math.cos(ph) * 0.35 : 0.35;
      L.bone.rotation.y = L.side * lerp(crawlY, -strokeY, this.swim);
      L.bone.rotation.z = L.side * lerp(crawlZ, strokeZ, this.swim);
    }
    // the head: out and up swimming, looking about, drawn in when it's wary
    this.tuck = lerp(this.tuck, s.shy ? 1 : 0, k(4));
    this.look = lerp(this.look, s.look ?? Math.sin(this.time * 0.4) * 0.4 * (1 - this.move), k(2));
    R.neck.position.z = SHELL.len * (0.82 - 0.22 * this.tuck);
    R.neck.rotation.x = lerp(0.1, -0.25, this.swim) + Math.sin(this.time * 1.3) * 0.03;
    R.neck.rotation.y = this.look * (1 - this.tuck);
    R.head.rotation.x = lerp(0.05, 0.2, this.swim) - (s.alert ?? 0) * 0.2;
    R.tail.rotation.y = Math.sin(this.time * 1.1 + ph * 0.5) * 0.25 * (0.3 + this.swim);
  }

  saddle(out) {
    this.mesh.updateMatrixWorld(true);
    return this.rig.body.localToWorld(out.set(0, TURTLE_SADDLE.y, TURTLE_SADDLE.z));
  }

  get tilt() {
    return this.pitch;
  }

  dispose() {
    disposeAnimal(this.mesh);
  }
}

// ── Eagle ────────────────────────────────────────────────────────────────────
// A golden eagle on the hawk's frame: dark brown, a golden nape, a grey and
// yellow beak, yellow feet. Built at a hawk's size and drawn EAGLE_SCALE
// times bigger: about 2.8 m long and 7 m across the wings.
const EAGLE = {
  len: 0.52,
  span: 1.3,
  like: 'hawk',
  plumage: { back: 0x3d2a1b, wing: 0x392717, wingUnder: 0x4c3828, head: 0xb98b48, breast: 0x45301f, belly: 0x3a2818, tail: 0x2c2117, beak: 0x4a4a52, legs: 0xd8b438, cheek: 0x5e4128 },
};
const EAGLE_SCALE = 5.4;
const FLAP_RATE = 1.5; // wingbeats a second, at full effort
const FOLDED = 0.62; // how much of a folded wing shows along its side

export class EagleBody {
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.rig = buildBird('eagle', seed, EAGLE);
    this.anim = new BirdAnim(this.rig);
    this.anim.flapRate = FLAP_RATE;
    this.mesh = this.rig.mesh;
    this.mesh.scale.setScalar(EAGLE_SCALE);
    this.mesh.rotation.order = 'YXZ';
    this.seat = { spread: 0.34, hang: 0.42, fwd: 0.2, lean: 0.3, reins: 0.7 };
    this.radius = 1.2;
    this.onStep = null;
    this.time = 0;
    this.lastBeat = 0;
    // where the rider sits, in the body bone's own (unscaled) space
    this.saddleY = this.rig.bodyR * 1.15 + 0.12 / EAGLE_SCALE;
    this.upright = 0.6;
  }

  place(x, y, z, yaw) {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = yaw;
    this.anim.flying = 0;
  }

  pose(dt, s) {
    const a = this.anim;
    this.time += dt;
    a.wantFly = !!s.flying;
    // beat hard climbing or slow, glide along, hardly a beat in a stoop
    a.flap = !s.flying ? 0 : s.climbing || s.speed < 5 ? 1 : s.vy < -4 ? 0.05 : 0.3;
    a.climb = clamp(s.vy, -6, 6) * 0.6;
    a.bank = s.flying ? clamp(-s.turn * 0.35, -0.7, 0.7) : 0;
    // walking, it hops along
    a.hop = s.flying ? 0 : Math.abs(Math.sin(this.time * Math.max(2, s.speed * 4))) * smoothstep(0.1, 0.6, s.speed);
    a.lookYaw = s.look ?? 0;
    a.peck = 0;
    const before = Math.sin(a.phase);
    a.update(dt);
    // standing, it sits up (less so with someone on its back), and its
    // folded wings lie along its sides rather than vanishing into them
    const stand = 1 - a.flying;
    this.upright = lerp(this.upright, s.ridden ? 0.15 : 0.6, 1 - Math.exp(-dt * 3));
    this.rig.body.rotation.x -= this.upright * stand;
    for (const w of this.rig.wing) w.scale.setScalar(Math.max(w.scale.x, FOLDED * stand));
    // a wingbeat as the wings come down through the level
    if (this.onStep && a.flap > 0.2 && before > 0 && Math.sin(a.phase) <= 0) this.onStep(s.x, s.y, s.z, 'wing');
    this.mesh.position.set(s.x, s.y, s.z);
    this.mesh.rotation.y = s.yaw;
  }

  saddle(out) {
    this.mesh.updateMatrixWorld(true);
    return this.rig.body.localToWorld(out.set(0, this.saddleY, -0.01));
  }

  get tilt() {
    return this.rig.body.rotation.x;
  }

  dispose() {
    disposeAnimal(this.mesh);
  }
}

export const BODIES = { horse: HorseBody, turtle: TurtleBody, eagle: EagleBody };
