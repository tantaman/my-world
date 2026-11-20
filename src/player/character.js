// A small procedurally-built hiker with a procedural gait. No assets, just
// capsules, a little trigonometry and a two-bone IK for each leg.
//
// The walk is built the way a real one works rather than from sines on the
// joints: each foot follows a path on the ground, planted while it carries
// the weight (rolling heel → flat → toe) and swinging forward in an arc, and
// the legs are solved to reach it. Stride length, cadence and how long a foot
// stays down all change with speed, so walking speeds up into a run without
// the feet ever skating. With a ground function the feet also find the slope
// and the hips drop to let the lower leg reach.

import * as THREE from 'three';
import { smoothstep, lerp, clamp } from '../noise.js';
import { buildHead } from './head.js';

// Work poses as keyframes over one swing (p = 0..1). Angles in radians:
//   sh = shoulder pitch (negative raises the arm forward), el = elbow,
//   tool = wrist (how the tool sits relative to the forearm),
//   sp = spine lean, inw = arms brought together, drop = crouch,
//   and, left out where they stay 0:
//   tw = shoulders turned (positive to the left),
//   roll = the tool turned about its handle (positive brings what faces
//     forward round to the left), cock = the wrist cocked within that turned
//     tool's swing (negative lets the head trail to the right).
// A quarter turn on the handle that brings a tool's edge (which faces the back
// of the hand, see build/geometry.js) round to the left, for a level swing.
const ROLL_LEVEL = -Math.PI / 2;
const POSES = {
  chop: [
    [0, { sh: -0.5, el: -0.6, tool: -0.2, sp: 0.05, inw: 0.3, drop: 0 }],
    [0.45, { sh: -2.9, el: -0.75, tool: 0.05, sp: -0.14, inw: 0.36, drop: 0 }],
    [0.6, { sh: -1.5, el: -0.08, tool: 0.0, sp: 0.22, inw: 0.42, drop: 0.04 }],
    [0.75, { sh: -1.35, el: -0.12, tool: 0.0, sp: 0.24, inw: 0.42, drop: 0.04 }],
    [1, { sh: -0.5, el: -0.6, tool: -0.2, sp: 0.05, inw: 0.3, drop: 0 }],
  ],
  // (the shoulder angle is relative to the spine, so leaning forward needs
  // a bigger reach to keep the tool out in front)
  chopLow: [
    [0, { sh: -0.6, el: -0.6, tool: -0.2, sp: 0.15, inw: 0.3, drop: 0.04 }],
    [0.45, { sh: -2.75, el: -0.8, tool: 0.05, sp: 0.0, inw: 0.36, drop: 0.02 }],
    [0.6, { sh: -1.42, el: -0.05, tool: -0.22, sp: 0.62, inw: 0.42, drop: 0.16 }],
    [0.75, { sh: -1.36, el: -0.08, tool: -0.22, sp: 0.62, inw: 0.42, drop: 0.16 }],
    [1, { sh: -0.6, el: -0.6, tool: -0.2, sp: 0.15, inw: 0.3, drop: 0.04 }],
  ],
  // Felling a standing tree: a level swing from the right, the shoulders
  // winding up and turning through, with the axe turned on its handle so the
  // bit leads into the trunk at about waist height.
  fell: [
    [0, { sh: -0.9, el: -0.6, tool: -0.1, sp: 0.08, inw: 0.34, roll: ROLL_LEVEL }],
    [0.45, { sh: -1.3, el: -0.6, tool: 0.0, sp: 0.04, inw: 0.4, tw: -1.25, roll: ROLL_LEVEL, cock: -1.1, drop: 0.02 }],
    [0.6, { sh: -1.3, el: -0.08, tool: -0.02, sp: 0.12, inw: 0.3, tw: -0.12, roll: ROLL_LEVEL, cock: 0.0, drop: 0.07 }],
    [0.75, { sh: -1.28, el: -0.1, tool: -0.02, sp: 0.13, inw: 0.3, tw: -0.08, roll: ROLL_LEVEL, cock: 0.0, drop: 0.07 }],
    [1, { sh: -0.9, el: -0.6, tool: -0.1, sp: 0.08, inw: 0.34, roll: ROLL_LEVEL }],
  ],
  dig: [
    [0, { sh: -0.95, el: -0.5, tool: 0.6, sp: 0.25, inw: 0.38, drop: 0.04 }],
    [0.35, { sh: -1.05, el: -0.2, tool: 0.25, sp: 0.5, inw: 0.4, drop: 0.14 }],
    [0.6, { sh: -1.25, el: -0.8, tool: 0.6, sp: 0.35, inw: 0.4, drop: 0.08 }],
    [0.85, { sh: -1.5, el: -0.6, tool: 0.3, sp: 0.1, inw: 0.38, drop: 0.02 }],
    [1, { sh: -0.95, el: -0.5, tool: 0.6, sp: 0.25, inw: 0.38, drop: 0.04 }],
  ],
  bend: [
    [0, { sh: -0.2, el: -0.3, tool: 0, sp: 0.1, inw: 0.1, drop: 0 }],
    [0.5, { sh: -1.15, el: -0.25, tool: 0, sp: 0.75, inw: 0.22, drop: 0.26 }],
    [1, { sh: -0.2, el: -0.3, tool: 0, sp: 0.1, inw: 0.1, drop: 0 }],
  ],
  // one hand held out, slow and low, to something wary of you
  reach: [
    [0, { sh: -1.15, el: -0.2, tool: 0, sp: 0.1, inw: 0.2, drop: 0.03 }],
    [0.5, { sh: -1.25, el: -0.15, tool: 0, sp: 0.14, inw: 0.18, drop: 0.04 }],
    [1, { sh: -1.15, el: -0.2, tool: 0, sp: 0.1, inw: 0.2, drop: 0.03 }],
  ],
};
const _pose = { sh: 0, el: 0, tool: 0, sp: 0, inw: 0, drop: 0, tw: 0, roll: 0, cock: 0 };

// A work pose of a feature's own (a rifle brought up to the shoulder), as
// keyframes like the ones above, for Character.play(kind). The left arm
// mirrors the right whenever a tool is in hand, as it does for the axe.
export function definePose(kind, keys) {
  if (POSES[kind]) throw new Error(`pose "${kind}" is already defined`);
  if (!Array.isArray(keys) || keys.length < 2) throw new Error(`pose "${kind}" needs at least two keyframes`);
  POSES[kind] = keys;
}

// The left arm holding something up to the mouth (Character.addRaised): the
// shoulder's pitch (sh), twist (tw) and swing inward (inw), the elbow, and the
// wrist (bent, and rolled so what is held stands upright). In the chest's frame, which the head rides on too, so the hand stays
// at the mouth however the body leans.
const RAISED = { sh: -1.02, tw: -0.82, inw: -0.06, el: -2.105, wrist: -0.05, roll: 0.68 };
const IN_HAND = 0.35; // how far up the arm is when the hand has hold of it
// Swimming: the body turns about this point (m above the feet) to lie flat;
// strokes a second, still and going full tilt.
const SWIM_PIVOT = 1.1;
const STROKES = [0.45, 0.95];
// Breaststroke over one stroke (u = 0..1): sh shoulder pitch, ab arm out to
// the side, el elbow. Pull out and back, bring the hands in under the chest,
// reach forward and glide.
const BREAST = [
  [0, { sh: -2.9, ab: 0.25, el: -0.15 }],
  [0.32, { sh: -1.35, ab: 1.1, el: -0.85 }],
  [0.5, { sh: -1.55, ab: 0.35, el: -2.0 }],
  [0.72, { sh: -2.85, ab: 0.22, el: -0.2 }],
  [1, { sh: -2.9, ab: 0.25, el: -0.15 }],
];
const _stroke = { sh: 0, ab: 0, el: 0 };
function sampleStroke(u, out) {
  let i = 0;
  while (i < BREAST.length - 2 && u > BREAST[i + 1][0]) i++;
  const [ua, a] = BREAST[i];
  const [ub, b] = BREAST[i + 1];
  const t = smoothstep(0, 1, (u - ua) / (ub - ua));
  out.sh = lerp(a.sh, b.sh, t);
  out.ab = lerp(a.ab, b.ab, t);
  out.el = lerp(a.el, b.el, t);
  return out;
}
function samplePose(keys, p, out) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [pa, a] = keys[i];
  const [pb, b] = keys[i + 1];
  const t = smoothstep(0, 1, (p - pa) / Math.max(1e-4, pb - pa));
  for (const k in out) {
    const ak = a[k] ?? 0;
    out[k] = ak + ((b[k] ?? 0) - ak) * t;
  }
  return out;
}

// ── Body measurements (metres) ──────────────────────────────────────────────
const HIPS_Y = 0.94; // pelvis height standing
// Sitting astride something (Character.seat), the hips stay this far above
// the root: whatever carries the hiker puts the root this far under the seat.
export const SEAT_HIPS = HIPS_Y;
const HIP_X = 0.095; // hip joints either side of the pelvis
const HIP_Y = -0.04;
const NECK = 0.145; // centre of the head above the base of the neck
const THIGH = 0.42;
const SHIN = 0.43;
const REACH = (THIGH + SHIN) * 0.985; // a planted leg never quite locks straight
// The boot, from the ankle joint: sole below, heel behind, toe ahead. A boot
// sole hardly bends, so it rolls up onto the tip of the toe.
const ANKLE_H = 0.07;
const HEEL_B = 0.075;
const TOE_F = 0.165;

const TAU = Math.PI * 2;
const fract = (x) => x - Math.floor(x);
const ease = (t) => smoothstep(0, 1, t);

function hermite(p0, p1, m0, m1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}

// Where the ankle sits for a foot whose heel would touch the ground at z = zh
// when flat, pitched by p (positive = toe down). Toe-up rocks on the heel,
// toe-down rolls onto the toe, so whichever part is on the ground stays put.
function plant(zh, p, out) {
  const c = Math.cos(p);
  const s = Math.sin(p);
  if (p <= 0) {
    out.y = ANKLE_H * c - HEEL_B * s;
    out.z = zh + ANKLE_H * s + HEEL_B * c;
  } else {
    out.y = ANKLE_H * c + TOE_F * s;
    out.z = zh + HEEL_B + TOE_F + ANKLE_H * s - TOE_F * c;
  }
  return out;
}

const _a = { y: 0, z: 0 };
const _b = { y: 0, z: 0 };
const _t = new THREE.Vector3();
const _inv = new THREE.Matrix4();

const M = (hex, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, ...extra });

export class Character {
  constructor() {
    this.root = new THREE.Group();
    // yaw last, so the body can be pitched about its own axis (on a horse's back)
    this.root.rotation.order = 'YXZ';
    this.phase = 0; // gait cycles; the left heel strikes on whole numbers
    this.moveBlend = 0;
    this.runBlend = 0;
    this.airBlend = 0;
    this.time = 0;
    this.stepIndex = 0;
    this.vSmooth = 0;
    this.acc = 0;
    this.land = 0; // landing squash (hips drop), a damped spring
    this.landV = 0;
    this.fallV = 0;
    this.wasGrounded = true;
    this.glance = 0;
    this.glanceTo = 0;
    this.glanceAt = 2;
    this.hill = 0; // rise per metre ahead, smoothed
    // swimming (see swim()): how far into it, what it was asked, the stroke
    this.swimBlend = 0;
    this.swimTo = { amount: 0, prone: 0, pitch: 0, under: false };
    this.stroke = 0;
    // called as onFootstep(run 0..1) each time a heel comes down
    this.onFootstep = null;
    // Optional (x, z) -> ground height in world space, so feet meet the slope.
    this.groundAt = null;

    this.#build();

    this.tool = null;
    this.action = null; // { kind, t, dur, loop }
    this.work = 0; // blend into the work pose
    this.raised = null; // what the left hand holds up to the face, by name
    this.lift = 0; // blend into holding it there
    this._lastRaised = null;
    this.seated = null; // what the hiker sits astride (seat())
    this._seat = null; // ...or last sat on, while getting down
    this.sit = 0; // blend into sitting

    // Per-foot state: target ankle position (root space), foot pitch, toe-out,
    // whether it's carrying weight, and the smoothed ground height under it.
    const foot = (side) => ({ side, x: 0, y: 0, z: 0, p: 0, out: 0, load: 1, g: null });
    this.footL = foot(1);
    this.footR = foot(-1);

    this.root.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });
  }

  // ── The model ─────────────────────────────────────────────────────────────
  // An orange rain shell with the grey hood rolled at the collar, tan hiking
  // trousers and brown boots, a black daypack with a hydration hose over the
  // left shoulder, a brown snapback with a maroon flat brim, white sunglasses
  // and a full dark beard.
  #build() {
    const skin = M(0xc68c6c, 0.7);
    const shell = M(0xd65a20, 0.6);
    const shellDark = M(0xa8431a, 0.65);
    const hood = M(0xa9aba8, 0.75);
    const pants = M(0xa47836);
    const pantsDark = M(0x86602b);
    const boot = M(0x5b3a26, 0.8);
    const sole = M(0x2a211b, 0.95);
    const pack = M(0x1d1d20, 0.75);
    const packDark = M(0x111113, 0.8);
    const logo = M(0x9a9a9a, 0.7);
    const hose = M(0x74b8dc, 0.4);
    const tag = M(0xe0662a, 0.7);

    const cast = (m) => {
      m.castShadow = true;
      return m;
    };
    const cap = (r, len, mat, segs = 8) => cast(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, segs), mat));
    const box = (x, y, z, mat) => cast(new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat));
    const ball = (r, mat, ws = 10, hs = 8) => cast(new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat));
    const cyl = (rt, rb, h, mat, segs = 12, open = false) =>
      cast(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs, 1, open), mat));
    const group = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    // pelvis / torso
    this.hips = group(this.root, 0, HIPS_Y, 0);
    const pelvis = cap(0.15, 0.1, pants);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.scale.set(1, 1, 0.8);
    this.hips.add(pelvis);

    this.spine = group(this.hips, 0, 0.06, 0);
    this.chest = group(this.spine, 0, 0.0, 0);
    const torso = cap(0.185, 0.26, shell, 12);
    torso.position.y = 0.26;
    torso.scale.set(1.1, 1, 0.8);
    this.chest.add(torso);
    // the shell hangs loose over the hips
    const hem = cyl(0.2, 0.214, 0.16, shell, 14);
    hem.position.y = 0.04;
    hem.scale.z = 0.82;
    this.chest.add(hem);
    // the storm flap over the front zip
    const placket = box(0.022, 0.42, 0.012, shellDark);
    placket.position.set(0, 0.25, 0.149);
    this.chest.add(placket);

    // high zipped collar, with the hood rolled up behind it
    const collar = cyl(0.1, 0.122, 0.12, shell, 14, true);
    collar.material = shell.clone();
    collar.material.side = THREE.DoubleSide;
    collar.position.y = 0.5;
    this.chest.add(collar);
    const hoodRoll = new THREE.TorusGeometry(0.118, 0.048, 6, 14, Math.PI * 1.25);
    hoodRoll.rotateZ(Math.PI * 1.5 - Math.PI * 0.625);
    hoodRoll.rotateX(Math.PI / 2);
    const hoodM = cast(new THREE.Mesh(hoodRoll, hood));
    hoodM.position.set(0, 0.53, -0.012);
    hoodM.scale.set(1.05, 1.2, 1);
    this.chest.add(hoodM);
    const hoodBulk = ball(0.075, hood, 10, 6);
    hoodBulk.scale.set(1.5, 0.85, 0.75);
    hoodBulk.position.set(0, 0.52, -0.13);
    this.chest.add(hoodBulk);

    // black daypack
    const bp = group(this.chest, 0, 0.27, -0.232);
    const bag = cap(0.13, 0.2, pack, 10);
    bag.scale.set(1.25, 1, 0.62);
    bp.add(bag);
    const front = cap(0.1, 0.06, packDark, 10);
    front.scale.set(1.15, 1, 0.32);
    front.position.set(0, -0.1, -0.075);
    bp.add(front);
    const mark = box(0.07, 0.014, 0.006, logo);
    mark.position.set(0, -0.035, -0.11);
    bp.add(mark);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 4, 8, Math.PI), packDark);
    handle.position.set(0, 0.24, -0.01);
    bp.add(handle);
    const tagM = box(0.018, 0.07, 0.035, tag);
    tagM.position.set(0.15, -0.02, -0.01);
    tagM.rotation.z = 0.12;
    bp.add(tagM);
    // shoulder straps: down the chest, and over the top of each shoulder
    const strapPath = (sx) =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.1, 0.4, -0.16),
        new THREE.Vector3(sx * 0.11, 0.535, -0.09),
        new THREE.Vector3(sx * 0.115, 0.56, 0.0),
        new THREE.Vector3(sx * 0.11, 0.5, 0.11),
        new THREE.Vector3(sx * 0.1, 0.38, 0.14),
        new THREE.Vector3(sx * 0.1, 0.2, 0.142),
      ]);
    for (const sx of [-1, 1]) {
      const strap = cast(new THREE.Mesh(new THREE.TubeGeometry(strapPath(sx), 14, 0.018, 4), packDark));
      strap.scale.x = 1.4;
      this.chest.add(strap);
    }
    // hydration hose: out of the top of the pack, over the left shoulder and
    // down the front of the strap
    const hosePath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 0.5, -0.17),
      new THREE.Vector3(0.1, 0.585, -0.08),
      new THREE.Vector3(0.13, 0.585, 0.01),
      new THREE.Vector3(0.13, 0.52, 0.12),
      new THREE.Vector3(0.125, 0.4, 0.162),
      new THREE.Vector3(0.12, 0.33, 0.165),
    ]);
    this.chest.add(cast(new THREE.Mesh(new THREE.TubeGeometry(hosePath, 18, 0.0095, 5), hose)));

    // head: raised clear of the collar so the chin and beard show
    this.neck = group(this.chest, 0, 0.5, 0);
    const neckM = cyl(0.058, 0.065, 0.13, skin, 8);
    neckM.position.y = 0.055;
    this.neck.add(neckM);
    this.head = group(this.neck, 0, NECK, 0);
    // what is worn on the head goes on the cap (addWorn)
    this.cap = buildHead(this.head, skin);

    // arms
    const arm = (side) => {
      const shoulder = group(this.chest, side * 0.235, 0.42, 0);
      const delt = ball(0.072, shell, 10, 8);
      delt.position.set(-side * 0.008, -0.01, 0);
      shoulder.add(delt);
      const upper = cap(0.062, 0.2, shell);
      upper.position.y = -0.14;
      shoulder.add(upper);
      const elbow = group(shoulder, 0, -0.28, 0);
      const fore = cap(0.054, 0.18, shell);
      fore.position.y = -0.12;
      elbow.add(fore);
      const cuff = cyl(0.058, 0.058, 0.045, shellDark, 8);
      cuff.position.y = -0.22;
      elbow.add(cuff);
      const hand = ball(0.048, skin, 8, 6);
      hand.position.y = -0.27;
      hand.scale.set(0.85, 1.1, 0.95);
      elbow.add(hand);
      return { shoulder, elbow };
    };
    this.armL = arm(1);
    this.armR = arm(-1);

    // Tools are gripped in the right hand; the business end points along -y.
    // What can be held is handed in from outside (addHeld): the hiker doesn't
    // know an axe from a fishing rod.
    this.hand = group(this.armR.elbow, 0, -0.27, 0);
    // turn the tool on its handle (y) first, then cock it within that turn's
    // swing (z), then bend the wrist (x)
    this.hand.rotation.order = 'XZY';
    this.tools = {}; // name -> { object, rest, elbow }
    // The left hand can bring something up to the face, whatever the right
    // is doing (addRaised).
    this.handL = group(this.armL.elbow, 0, -0.27, 0);
    this.raisable = {}; // name -> { object, stowed }

    // legs
    const leg = (side) => {
      const hip = group(this.hips, side * HIP_X, HIP_Y, 0);
      hip.rotation.order = 'ZXY'; // roll the leg's plane, then swing within it
      const thigh = cap(0.082, 0.27, pants);
      thigh.position.y = -0.2;
      hip.add(thigh);
      const knee = group(hip, 0, -THIGH, 0);
      const shin = cap(0.068, 0.27, pants);
      shin.position.y = -0.19;
      knee.add(shin);
      const hemM = cyl(0.074, 0.076, 0.05, pantsDark, 8);
      hemM.position.y = -0.36;
      knee.add(hemM);
      const ankle = group(knee, 0, -SHIN, 0);
      const cuff = cyl(0.068, 0.066, 0.1, boot, 8);
      cuff.position.y = 0.035;
      ankle.add(cuff);
      const upperB = box(0.104, 0.06, 0.2, boot);
      upperB.position.set(0, -0.03, 0.035);
      ankle.add(upperB);
      const toe = ball(0.052, boot, 8, 5);
      toe.scale.set(1, 0.62, 1);
      toe.position.set(0, -0.04, 0.12);
      ankle.add(toe);
      const soleM = box(0.114, 0.024, 0.245, sole);
      soleM.position.set(0, -ANKLE_H + 0.012, 0.045);
      ankle.add(soleM);
      return { side, hip, knee, ankle };
    };
    this.legL = leg(1);
    this.legR = leg(-1);
  }

  // Something the hiker can carry in the right hand.
  //   object  a three.js object, gripped at its origin, business end along -y
  //   rest    how the arm hangs with it when not working (radians at the shoulder)
  //   elbow   and how far the elbow is bent, if it should be
  addHeld(name, object, { rest = 0, elbow } = {}) {
    if (this.tools[name]) return;
    object.visible = false;
    this.hand.add(object);
    this.tools[name] = { object, rest, elbow };
  }

  setTool(name) {
    this.tool = this.tools[name] ? name : null;
    for (const k in this.tools) this.tools[k].object.visible = k === this.tool;
  }

  // Something the hiker wears on the front of the cap (a headlamp), placed in
  // that spot's frame: +z out of the front panel, y up it. `band`, if given,
  // is put round the crown at the same height, in the cap's frame (a strap):
  // see head.js for its size (character.cap.crown).
  addWorn(object, { band = null } = {}) {
    this.cap.brow.add(object);
    if (band) this.cap.brow.parent.add(band);
  }

  // Something the hiker can raise to the face in the left hand, whatever the
  // right is doing: a radio to talk into.
  //   object  a three.js object, gripped at its origin, its top along -y
  //           (which points up past the hand once it is raised)
  //   stowed  where it rides when it is down, if anywhere: an object placed
  //           in the chest's frame (clipped to a strap, say), shown whenever
  //           the hand isn't holding it
  addRaised(name, object, { stowed = null } = {}) {
    if (this.raisable[name]) return;
    object.visible = false;
    this.handL.add(object);
    if (stowed) this.chest.add(stowed);
    this.raisable[name] = { object, stowed };
  }

  // Bring it up to the face, or with null, put it away again.
  raise(name) {
    this.raised = name && this.raisable[name] ? name : null;
  }

  // Sit astride something (a mount), or with null, get down. The hips stay
  // SEAT_HIPS above the root; whatever carries the hiker moves the root, and
  // should hand update() no speed of its own, since the legs aren't walking.
  //   spread  half the width of what is between the knees (m)
  //   hang    how far below the hips the feet hang (m)
  //   fwd     how far ahead of the hips the feet are (m)
  //   lean    how far forward the body leans (radians)
  //   reins   0..1 how much the hands are held out in front
  seat(s) {
    this.seated = s || null;
    if (s) this._seat = s;
  }

  // Start a work animation: 'chop' | 'chopLow' | 'fell' | 'dig' | 'bend' |
  // 'reach', or one a feature defined (definePose).
  play(kind, dur, loop = false) {
    if (this.action && this.action.kind === kind && this.action.loop && loop) {
      this.action.dur = dur;
      return;
    }
    this.action = { kind, t: 0, dur, loop };
  }

  stop() {
    if (this.action) this.action.loop = false;
  }

  get acting() {
    return !!this.action;
  }

  // In deep water: amount 0..1, how flat the body lies (prone 0..1), how far
  // it's pitched head down besides (radians), and whether it's under the
  // surface. Say so every frame, before update().
  swim(amount, prone = 0, pitch = 0, under = false) {
    const s = this.swimTo;
    s.amount = amount;
    s.prone = prone;
    s.pitch = pitch;
    s.under = under;
  }

  // speed: horizontal m/s, grounded: bool, vy: vertical velocity, turn: rad/s
  update(dt, speed, grounded, vy, turn) {
    dt = Math.min(dt, 1 / 15);
    this.time += dt;
    const v = speed;
    const k = 1 - Math.exp(-dt * 8);

    // Smoothed speed and acceleration, to lean into starts and stops.
    const vs = lerp(this.vSmooth, v, 1 - Math.exp(-dt * 10));
    this.acc = lerp(this.acc, (vs - this.vSmooth) / Math.max(dt, 1e-4), 1 - Math.exp(-dt * 5));
    this.vSmooth = vs;

    // Turning on the spot shuffles the feet round.
    const turning = grounded ? smoothstep(1.2, 3.0, Math.abs(turn)) * (1 - smoothstep(0.2, 0.8, v)) : 0;
    this.moveBlend = lerp(this.moveBlend, Math.max(smoothstep(0.08, 0.8, v), turning * 0.7), k);
    this.runBlend = lerp(this.runBlend, smoothstep(3.6, 6.0, v), 1 - Math.exp(-dt * 5));
    this.airBlend = lerp(this.airBlend, grounded ? 0 : 1, 1 - Math.exp(-dt * (grounded ? 20 : 10)));
    const mb = this.moveBlend;
    const rb = this.runBlend;
    const ab = this.airBlend;
    const walkW = mb * (1 - rb);
    const runW = mb * rb;
    const idle = 1 - mb;

    // Landing: the legs take the fall, then spring back.
    if (grounded && !this.wasGrounded && this.fallV < -2) this.landV -= Math.min(2.4, -this.fallV * 0.22);
    if (!grounded) this.fallV = vy;
    else this.fallV = 0;
    this.wasGrounded = grounded;
    this.landV += (-170 * this.land - 20 * this.landV) * dt;
    this.land = Math.max(-0.22, this.land + this.landV * dt);

    // ── Cadence and stride ──────────────────────────────────────────────────
    // Strides lengthen with speed up to what the legs can reach; past that,
    // the feet just turn over faster. Running takes longer strides with a
    // flight phase, and each foot is down for a shorter part of the cycle.
    const stepW = clamp(0.32 + 0.26 * v, 0.32, 0.9);
    const fWalk = v / (2 * stepW);
    const fRun = v / (2 * (0.35 + 0.27 * v));
    let f = Math.max(lerp(fWalk, fRun, rb), turning * 1.2, mb * 0.6);
    f *= 1 - ab; // hold the stride in the air
    this.phase += f * dt;
    const stride = f > 1e-3 ? v / f : 0;
    const betaWalk = clamp(0.62 - 0.03 * v, 0.52, 0.62);
    const betaRun = clamp((0.9 * Math.max(fRun, 0.5)) / Math.max(v, 0.5), 0.22, 0.4);
    const beta = lerp(betaWalk, betaRun, rb); // fraction of the cycle a foot is down
    const sweep = beta * stride; // how far a planted foot travels back under you
    const roll = smoothstep(0, 1.4, v); // slow steps barely roll heel to toe

    // A heel comes down every half cycle.
    const step = Math.floor(this.phase * 2);
    if (step > this.stepIndex && grounded && mb > 0.3 && this.onFootstep) this.onFootstep(rb);
    this.stepIndex = step;

    const uL = fract(this.phase);
    const uR = fract(this.phase + 0.5);
    const side1 = Math.cos(TAU * (uL - beta / 2)); // +1 with all weight on the left foot
    const twice = Math.cos(2 * TAU * (uL - beta / 2)); // +1 at each mid-stance
    const swingL = Math.cos(TAU * uL); // +1 when the left foot is out in front

    // ── Pelvis ─────────────────────────────────────────────────────────────
    // Walking vaults over a stiff leg (highest mid-stance); running bounces
    // on a springy one (lowest mid-stance). The hips shift over the loaded
    // foot, the free side dips, and the pelvis turns with the swinging leg.
    let hy = HIPS_Y - walkW * (0.012 + 0.01 * v) - runW * 0.06;
    hy += twice * (walkW * 0.022 - runW * 0.04);
    const shift = Math.sin(this.time * 0.55) * 0.6 + Math.sin(this.time * 0.23 + 1) * 0.4; // idle weight shift
    let hx = side1 * (walkW * 0.028 + runW * 0.012) + idle * shift * 0.022;
    let hRoll = side1 * (walkW * 0.07 + runW * 0.035) + idle * shift * 0.04;
    let hYaw = -swingL * (walkW * (0.05 + 0.02 * v) + runW * 0.13);
    let hz = 0;
    const accLean = clamp(this.acc * 0.022, -0.16, 0.22) * (1 - ab);
    let hPitch = runW * 0.08 + accLean * 0.3;
    hy += this.land;

    // ── Feet ───────────────────────────────────────────────────────────────
    const g = {
      beta,
      sweep,
      zc: lerp(-0.07, -0.1, rb),
      strike: lerp(-0.32, -0.12, rb) * roll,
      off: lerp(0.7, 0.75, rb) * Math.max(0.35, roll),
      heelEnd: lerp(0.14, 0.12, rb),
      toeStart: lerp(0.55, 0.36, rb),
      lift: lerp(0.06 + 0.025 * v, 0.1 + 0.05 * v, rb),
      liftPow: lerp(0.8, 0.75, rb),
      trail: lerp(0.55, 0.15, rb), // how long the foot keeps going back after toe-off
      pitchT: lerp(0.6, 0.85, rb),
      width: lerp(0.095, 0.06, rb),
    };
    this.#gaitFoot(this.footL, uL, g);
    this.#gaitFoot(this.footR, uR, g);

    // Standing: feet a little apart and turned out, one slightly ahead.
    const up = smoothstep(-2, 3, vy); // rising vs falling, in the air
    for (const F of [this.footL, this.footR]) {
      const s = F.side;
      F.x = lerp(s * 0.11, F.x, mb);
      F.y = lerp(ANKLE_H, F.y, mb);
      F.z = lerp(s * 0.035 + HEEL_B - 0.06, F.z, mb);
      F.p *= mb;
      F.out = s * lerp(0.17, lerp(0.1, 0.04, rb), mb);
      F.load = lerp(1, F.load, mb);
      // In the air the leading leg tucks up in front, the other trails.
      if (ab > 0.001) {
        const lead = 0.5 + 0.5 * Math.cos(TAU * (s > 0 ? uL : uR));
        const ay = lerp(lerp(0.2, 0.42, up), lerp(0.16, 0.36, up), lead);
        const az = lerp(lerp(-0.12, -0.28, up), lerp(0.16, 0.2, up), lead);
        const ap = lerp(lerp(0.15, 0.6, up), lerp(-0.15, 0.1, up), lead);
        F.x = lerp(F.x, s * 0.1, ab);
        F.y = lerp(F.y, ay, ab);
        F.z = lerp(F.z, az, ab);
        F.p = lerp(F.p, ap, ab);
        F.load *= 1 - ab;
      }
    }

    // ── Torso, head and arms ───────────────────────────────────────────────
    // Lean into a climb, sit back a little going down.
    if (this.groundAt && grounded) {
      const r = this.root;
      const fx = Math.sin(r.rotation.y) * 0.5;
      const fz = Math.cos(r.rotation.y) * 0.5;
      const rise = this.groundAt(r.position.x + fx, r.position.z + fz) - this.groundAt(r.position.x - fx, r.position.z - fz);
      if (Number.isFinite(rise)) this.hill = lerp(this.hill, clamp(rise, -0.8, 0.8), 1 - Math.exp(-dt * 4));
    }
    const hill = this.hill * (this.hill > 0 ? 0.35 : 0.15) * mb;
    const lean = 0.03 + walkW * 0.05 + runW * 0.2 + accLean - ab * 0.05 + hill;
    const twist = swingL * (walkW * 0.07 + runW * 0.2); // shoulders counter the hips
    const breathe = Math.sin(this.time * 1.8) * idle;

    this.spine.rotation.x = lean;
    this.spine.rotation.y = twist - hYaw;
    this.spine.rotation.z = -hRoll * 0.8;
    this.chest.scale.y = 1 + breathe * 0.012;

    // An idle look around now and then.
    this.glanceAt -= dt;
    if (this.glanceAt <= 0) {
      this.glanceTo = Math.random() < 0.45 ? 0 : (Math.random() * 2 - 1) * 0.55;
      this.glanceAt = 2.5 + Math.random() * 4;
    }
    this.glance = lerp(this.glance, this.glanceTo * idle * (1 - this.work), 1 - Math.exp(-dt * 3));
    this.head.rotation.y = -twist * 0.85 + this.glance;
    this.head.rotation.x = -(lean + hPitch) * 0.75;
    this.head.rotation.z = -hRoll * 0.2;

    // Arms swing against the legs, a beat behind them; running pumps them
    // bent at the elbow and across the body.
    const swing = Math.cos(TAU * (uL - 0.035)); // +1: left arm back
    const amp = walkW * (0.1 + 0.12 * v) + runW * 0.7;
    const bias = -(walkW * 0.04 + runW * 0.15) - (lean + hPitch) * 0.85;
    const carry = this.tool ? 0.35 : 1;
    const armPose = (A, s, sw, scale) => {
      const fwd = -sw; // +1 with this arm forward
      A.shoulder.rotation.x = sw * amp * scale + bias - ab * lerp(0.3, 0.9, up);
      A.shoulder.rotation.z = s * (0.1 - runW * 0.1 * Math.max(0, fwd) + runW * 0.05 + ab * 0.5 + breathe * 0.02);
      const bend = 0.18 + walkW * 0.1 + runW * 1.3 + Math.max(0, fwd) * (walkW * 0.3 + runW * 0.35) * scale;
      A.elbow.rotation.x = -(bend - Math.max(0, -fwd) * runW * 0.2) - ab * 0.4;
    };
    armPose(this.armL, 1, swing, 1);
    armPose(this.armR, -1, -swing, carry);

    // Lean into the turn.
    const turnLean = clamp(-turn * v * 0.018, -0.2, 0.2) * (1 - ab * 0.5);
    this.root.rotation.z = lerp(this.root.rotation.z, turnLean, k);

    // How the tool rides when you're just carrying it.
    const held = this.tool ? this.tools[this.tool] : null;
    const toolRest = held ? held.rest : 0;
    if (held && held.elbow !== undefined) this.armR.elbow.rotation.x = held.elbow;
    this.hand.rotation.set(toolRest, 0, 0);

    // ── Work poses blend over the walk ─────────────────────────────────────
    const a = this.action;
    if (a) {
      a.t += dt;
      if (a.t >= a.dur) {
        if (a.loop) a.t -= a.dur;
        else this.action = null;
      }
    }
    this.work = lerp(this.work, a ? 1 : 0, 1 - Math.exp(-dt * (a ? 18 : 8)));
    if (this.work >= 0.01) {
      const pose = samplePose(POSES[a ? a.kind : this._lastKind || 'chop'], a ? Math.min(1, a.t / a.dur) : 0, _pose);
      if (a) this._lastKind = a.kind;
      const w = this.work;
      const kind = a ? a.kind : this._lastKind;
      const two = kind === 'bend' || (this.tool !== null && kind !== 'reach');
      const blend = (cur, val) => cur + (val - cur) * w;
      this.armR.shoulder.rotation.x = blend(this.armR.shoulder.rotation.x, pose.sh);
      this.armR.elbow.rotation.x = blend(this.armR.elbow.rotation.x, pose.el);
      this.armR.shoulder.rotation.z = blend(this.armR.shoulder.rotation.z, pose.inw);
      if (two) {
        this.armL.shoulder.rotation.x = blend(this.armL.shoulder.rotation.x, pose.sh * 0.96);
        this.armL.elbow.rotation.x = blend(this.armL.elbow.rotation.x, pose.el - 0.2);
        this.armL.shoulder.rotation.z = blend(this.armL.shoulder.rotation.z, -pose.inw);
      }
      this.hand.rotation.set(blend(toolRest, pose.tool), pose.roll * w, pose.cock * w);
      this.spine.rotation.x = blend(this.spine.rotation.x, pose.sp);
      this.spine.rotation.y = blend(this.spine.rotation.y, pose.tw);
      // keep the eyes on the work while the shoulders turn
      this.head.rotation.y = blend(this.head.rotation.y, -pose.tw * 0.85);
      this.head.rotation.x = -this.spine.rotation.x * 0.5;
      // Crouch into it, and sit the hips back to balance a forward bend.
      hy -= pose.drop * w;
      hz -= Math.max(0, pose.sp) * 0.12 * w;
    }

    // ── Sitting astride something ──────────────────────────────────────────
    // The legs straddle its back, knees out and feet hanging; the body sits
    // up, leaning a little into the ride, and the hands are held out in front.
    this.sit = lerp(this.sit, this.seated ? 1 : 0, 1 - Math.exp(-dt * (this.seated ? 10 : 6)));
    const sit = this._seat && this.sit > 0.001 ? ease(this.sit) : 0;
    if (sit) {
      const S = this._seat;
      const lean = S.lean ?? 0.1;
      hx *= 1 - sit;
      hz *= 1 - sit;
      hy = lerp(hy, HIPS_Y, sit);
      hPitch *= 1 - sit;
      hYaw *= 1 - sit;
      hRoll *= 1 - sit;
      for (const F of [this.footL, this.footR]) {
        F.x = lerp(F.x, F.side * (S.spread + 0.05), sit);
        F.y = lerp(F.y, HIPS_Y - S.hang, sit);
        F.z = lerp(F.z, S.fwd ?? 0.1, sit);
        F.p = lerp(F.p, 0.35, sit);
        F.out = lerp(F.out, F.side * 0.22, sit);
        F.load *= 1 - sit;
      }
      this.spine.rotation.x = lerp(this.spine.rotation.x, lean, sit);
      this.spine.rotation.y *= 1 - sit;
      this.spine.rotation.z *= 1 - sit;
      this.head.rotation.x = lerp(this.head.rotation.x, -lean * 0.8, sit);
      const reins = (S.reins ?? 1) * sit;
      for (const [A, s] of [[this.armL, 1], [this.armR, -1]]) {
        A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, -0.5 - lean, reins);
        A.shoulder.rotation.z = lerp(A.shoulder.rotation.z, -s * 0.16, reins);
        A.elbow.rotation.x = lerp(A.elbow.rotation.x, -1.1, reins);
      }
      this.hand.rotation.x = lerp(this.hand.rotation.x, 0, reins);
    }

    // ── Something held up to the face, in the left hand ────────────────────
    const raising = this.raised !== null;
    this.lift = lerp(this.lift, raising ? 1 : 0, 1 - Math.exp(-dt * (raising ? 9 : 5)));
    if (raising) this._lastRaised = this.raised;
    const r = this._lastRaised ? this.raisable[this._lastRaised] : null;
    if (r) {
      // the hand takes it off the strap on the way up
      const inHand = this.lift > IN_HAND;
      r.object.visible = inHand;
      if (r.stowed) r.stowed.visible = !inHand;
    }
    if (this.lift > 0.001) {
      const w = ease(this.lift);
      const L = this.armL;
      L.shoulder.rotation.x += (RAISED.sh - L.shoulder.rotation.x) * w;
      L.shoulder.rotation.y += (RAISED.tw - L.shoulder.rotation.y) * w;
      L.shoulder.rotation.z += (RAISED.inw - L.shoulder.rotation.z) * w;
      L.elbow.rotation.x += (RAISED.el - L.elbow.rotation.x) * w;
      this.handL.rotation.set(RAISED.wrist * w, 0, RAISED.roll * w);
      // and the head tips toward it a little
      this.head.rotation.z += 0.12 * w;
    }

    // ── Swimming ───────────────────────────────────────────────────────────
    this.swimBlend = lerp(this.swimBlend, this.swimTo.amount, 1 - Math.exp(-dt * 4));
    const swim = this.swimBlend;
    if (swim > 0.001) this.#swimPose(dt, swim);
    else if (this.root.rotation.x) this.root.rotation.x = 0;

    // ── Meet the ground ────────────────────────────────────────────────────
    if (this.groundAt && ab < 0.999 && sit < 0.999 && swim < 0.5) this.#feelGround(dt, (1 - ab) * (1 - sit) * (1 - swim * 2));

    // The body banks into turns about the feet; keep the feet on the ground.
    const bank = this.root.rotation.z;
    if (bank) {
      const cb = Math.cos(bank);
      const sb = Math.sin(bank);
      for (const F of [this.footL, this.footR]) {
        const x = F.x;
        F.x = x * cb + F.y * sb;
        F.y = -x * sb + F.y * cb;
      }
    }

    // Drop the hips if a loaded foot is out of reach (long strides, the
    // downhill foot, a step down), so planted feet stay planted.
    let drop = 0;
    for (const F of [this.footL, this.footR]) {
      if (F.load <= 0) continue;
      const jx = hx + F.side * HIP_X - F.x;
      const jz = hz - F.z;
      const h2 = jx * jx + jz * jz;
      const dy = hy + HIP_Y - F.y;
      const need = dy - Math.sqrt(Math.max(0, REACH * REACH - h2));
      if (need > 0) drop = Math.max(drop, need * F.load);
    }
    hy -= Math.min(drop, 0.4);

    this.hips.position.set(hx, hy, hz);
    this.hips.rotation.set(hPitch, hYaw, hRoll);
    this.hips.updateMatrix();
    _inv.copy(this.hips.matrix).invert();
    this.#reach(this.legL, this.footL, hPitch, hYaw, hRoll + bank);
    this.#reach(this.legR, this.footR, hPitch, hYaw, hRoll + bank);
  }

  // Kick and stroke, blended in by w over whatever the walk made of the legs
  // and arms, and lie the body along the way it's swimming.
  #swimPose(dt, w) {
    const { prone, pitch, under } = this.swimTo;
    const going = smoothstep(0.05, 0.6, prone);
    this.stroke += dt * lerp(STROKES[0], STROKES[1], going);
    const ph = this.stroke * TAU;
    const mix = (cur, val) => cur + (val - cur) * w;

    // legs: treading water under you, or long behind in a flutter kick
    for (const F of [this.footL, this.footR]) {
      const s = F.side;
      const off = s > 0 ? 0 : Math.PI;
      const kick = Math.sin(ph * 2 + off);
      F.x = mix(F.x, s * 0.1);
      F.y = mix(F.y, lerp(0.2 + 0.08 * Math.cos(ph + off), 0.1 + 0.03 * Math.abs(kick), prone));
      F.z = mix(F.z, lerp(0.02 + 0.1 * Math.sin(ph + off), 0.17 * kick, prone));
      F.p = mix(F.p, lerp(0.35, 1.15, prone));
      F.out = mix(F.out, s * 0.06);
      F.load = mix(F.load, 0);
    }

    // arms: sculling while treading water, breaststroke while swimming
    sampleStroke(this.stroke % 1, _stroke);
    for (const [A, s] of [[this.armL, 1], [this.armR, -1]]) {
      const scull = Math.sin(ph * 1.6 + (s > 0 ? 0 : 0.6));
      A.shoulder.rotation.x = mix(A.shoulder.rotation.x, lerp(-0.55 + 0.15 * scull, _stroke.sh, going));
      A.shoulder.rotation.y = mix(A.shoulder.rotation.y, 0);
      A.shoulder.rotation.z = mix(A.shoulder.rotation.z, s * lerp(0.8 + 0.25 * scull, _stroke.ab, going));
      A.elbow.rotation.x = mix(A.elbow.rotation.x, lerp(-0.9, _stroke.el, going));
    }

    // lie along the way you swim, turning about the chest; the head up to
    // see where you're going (and out of the water, at the surface)
    const r = this.root;
    if (r.rotation.order !== 'YXZ') r.rotation.order = 'YXZ'; // pitch in the body's own frame
    const tilt = clamp((prone * 1.4 + pitch) * w, -0.3, 2.6);
    r.rotation.x = tilt;
    const back = SWIM_PIVOT * Math.sin(tilt);
    r.position.y += SWIM_PIVOT * (1 - Math.cos(tilt));
    r.position.x -= Math.sin(r.rotation.y) * back;
    r.position.z -= Math.cos(r.rotation.y) * back;
    this.spine.rotation.x = mix(this.spine.rotation.x, -0.12 * prone);
    this.spine.rotation.y = mix(this.spine.rotation.y, 0);
    this.head.rotation.x = mix(this.head.rotation.x, -clamp(tilt, 0, 1.6) * (under ? 0.6 : 0.8));
    this.head.rotation.y = mix(this.head.rotation.y, 0);
  }

  // Ankle target and foot pitch for one foot at gait phase u.
  #gaitFoot(F, u, g) {
    F.x = F.side * g.width;
    if (u < g.beta) {
      // Planted: the heel touches down, the foot settles flat, then the heel
      // peels up and it rolls onto the toe, all while staying put on the
      // ground (sliding back under the body at exactly walking speed).
      const s = u / g.beta;
      const p = s < g.heelEnd ? lerp(g.strike, 0, ease(s / g.heelEnd)) : s < g.toeStart ? 0 : g.off * ease((s - g.toeStart) / (1 - g.toeStart));
      plant(g.zc + g.sweep * (0.5 - s), p, F);
      F.p = p;
      F.load = 1;
      return;
    }
    // Swinging: from toe-off to the next heel strike, in an arc. The path
    // leaves and arrives moving back with the ground, so there's no snap.
    // Running, the heel folds up under the hip rather than trailing out.
    const s = (u - g.beta) / (1 - g.beta);
    plant(g.zc - g.sweep * 0.5, g.off, _a);
    plant(g.zc + g.sweep * 0.5, g.strike, _b);
    const m = ((-g.sweep * (1 - g.beta)) / Math.max(g.beta, 0.05)) * g.trail;
    F.z = hermite(_a.z, _b.z, m, m, s);
    F.y = lerp(_a.y, _b.y, ease(s)) + g.lift * Math.sin(Math.PI * Math.pow(s, g.liftPow));
    F.p = lerp(g.off, g.strike, ease(Math.min(1, s / g.pitchT)));
    // still bearing a little weight just after toe-off and just before strike
    F.load = Math.max(0, 1 - s * 6, (s - 0.85) * 6);
  }

  // Raise each foot to the ground under it and tip it to the slope.
  #feelGround(dt, w) {
    const r = this.root;
    const yaw = r.rotation.y;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const ks = 1 - Math.exp(-dt * 30);
    for (const F of [this.footL, this.footR]) {
      const wx = r.position.x + F.x * cy + F.z * sy;
      const wz = r.position.z - F.x * sy + F.z * cy;
      const gh = this.groundAt(wx, wz);
      if (!Number.isFinite(gh)) continue;
      F.g = F.g === null ? gh : lerp(F.g, gh, ks);
      const ahead = this.groundAt(wx + sy * 0.12, wz + cy * 0.12);
      const behind = this.groundAt(wx - sy * 0.12, wz - cy * 0.12);
      const slope = Number.isFinite(ahead) && Number.isFinite(behind) ? -Math.atan2(ahead - behind, 0.24) : 0;
      F.y += clamp(F.g - r.position.y, -0.45, 0.45) * w;
      F.p += clamp(slope, -0.5, 0.5) * w;
    }
  }

  // Two-bone IK: bend hip and knee so the ankle lands on the target, then
  // set the ankle so the foot has the pitch we want in body space.
  // (tilt: everything rolling the leg's frame — the pelvis and the bank — to
  // take back out at the ankle so the sole stays level)
  #reach(leg, F, hPitch, hYaw, tilt) {
    _t.set(F.x, F.y, F.z).applyMatrix4(_inv).sub(leg.hip.position);
    const roll = Math.atan2(_t.x, -_t.y);
    const down = _t.x * Math.sin(roll) - _t.y * Math.cos(roll);
    const fwd = _t.z;
    const d = clamp(Math.hypot(down, fwd), 0.2, (THIGH + SHIN) * 0.9995);
    const kneeIn = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
    const lift = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
    const aim = Math.atan2(fwd, down);
    leg.hip.rotation.set(-(aim + lift), 0, roll);
    leg.knee.rotation.x = Math.PI - kneeIn;
    leg.ankle.rotation.set(F.p - hPitch - leg.hip.rotation.x - leg.knee.rotation.x, F.out - hYaw, -(roll + tilt));
  }
}
