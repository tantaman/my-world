// A small procedurally-built hiker with a procedural gait. No assets, just
// tailored meshes, a little trigonometry and a two-bone IK for each leg.
//
// This is the body anyone has: the bones, the walk, the poses. Who it is
// (their clothes, face and size) is one of the hikers (hikers.js), dressed
// onto it, and it can be someone else at any time (dress()).
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
import { group } from './clothing.js';
import { HIKER } from './hikers/hiker.js';

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
// Standing on skis (Character.stance) unless the stance says otherwise: the
// feet a little apart and parallel, no pole reaching. Tucked up in the air,
// the feet come this far (m) up under the body.
const STANCE_FEET = [[0.11, 0], [-0.11, 0]];
const STANCE_OUT = [0, 0];
const STANCE_PLANT = [0, 0];
const STANCE_TUCK = 0.32;
// Hanging in a harness (Character.hang): where the ankles go and how far the
// toes point (y, z m, and pitch, radians), upright with the knees a little
// bent ready to land, and lying flat with the legs trailing straight behind.
const HANG_FEET = { up: [0.15, 0.07, 0.25], flat: [0.08, -0.03, 1.15] };
// ...lying flat from this tilt of the body to this one (radians)
const HANG_FLAT = [0.35, 1.2];
// Sitting with the arms out over the sides of what you sit in (seat's rest):
// the shoulder's pitch (sh) and how far out to the side it swings (out), and
// the elbow; in a stroke, the shoulder's pitch reaching forward (reach), and
// how far the arm comes in and down as the hand pulls through the water (dip).
const REST = { sh: 0.05, reach: -0.5, out: 0.95, dip: 0.4, el: -0.5 };

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
// The grown-up's. Someone smaller (who.size) is the same body made smaller,
// so these are in metres of the grown-up body; what a body meets in the world
// (the ground, a saddle) is turned into them, and back out.
const HIPS_Y = 0.94; // pelvis height standing
// Sitting astride something (Character.seat), the hips are this far above
// the root (m, in the world, whoever it is): whatever carries the hiker puts
// the root this far under the seat.
export const SEAT_HIPS = HIPS_Y;
const HIP_X = 0.095; // hip joints either side of the pelvis
const HIP_Y = -0.04;
const NECK_Y = 0.5; // the base of the neck above the chest joint
const NECK = 0.145; // centre of the head (eye level) above the base of the neck
const THIGH = 0.42;
const SHIN = 0.43;
const REACH = (THIGH + SHIN) * 0.985; // a planted leg never quite locks straight
// The boot, from the ankle joint: sole below, heel behind, toe ahead. A boot
// sole hardly bends, so it rolls up onto the tip of the toe.
const ANKLE_H = 0.07;
// What is worn under a boot (a ski) goes this far below the ankle joint.
export const SOLE = ANKLE_H;
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
const _m = new THREE.Matrix4();

// Put an object where another is, in its own parent's frame.
function place(object, at) {
  object.parent.updateWorldMatrix(true, false);
  at.updateWorldMatrix(true, false);
  _m.copy(object.parent.matrixWorld).invert().multiply(at.matrixWorld);
  _m.decompose(object.position, object.quaternion, object.scale);
}

// A strap made to go round one crown, let out or taken in to go round
// another: { holder, crown } from addWorn.
function fit(w, crown) {
  const sx = crown.rx / w.crown.rx;
  const sz = crown.rz / w.crown.rz;
  w.holder.scale.set(sx, 1, sz);
  w.holder.position.set(0, crown.y - w.crown.y, crown.z - w.crown.z * sz);
}

// Who a Character is: one of the hikers (hikers.js), dressed onto the bones.
//   id      what they're called in a message to the others here, for good
//   name    ...and on the settings panel
//   size    how tall, as a share of the grown-up body the measurements here
//           are for: the whole body is made that much smaller, and it walks
//           the way a smaller body does, with quicker, shorter steps
//   dress(body)  puts their skin, hair and clothes on the bones (body.chest,
//           body.neck, body.head, body.armL.shoulder and .elbow,
//           body.legL.hip, .knee and .ankle, ...: see #bones), in metres of the
//           grown-up body, with the helpers at the end of clothing.js; and
//           says where three things go -> { brow, crown, back }:
//             brow   an object on the head where something worn there goes
//                    (a headlamp): +z out of the front, y up it
//             crown  { rx, rz, z, y }: the half-width and half-depth of the
//                    head (or what is on it) about that high, its middle, and
//                    that height, in brow's parent's frame: for a strap round it
//             back   an object where something worn on the back goes (a
//                    jetpack): +z into the body, y up the spine
//           and, if anything of theirs moves on its own (hair that swings):
//             swing(dt)  called each frame once the body is posed, to move it
export class Character {
  constructor(who = HIKER) {
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

    this.#bones();

    this.tool = null;
    this.action = null; // { kind, t, dur, loop, still: held where it is (hold()) }
    this.work = 0; // blend into the work pose
    this.raised = null; // what the left hand holds up to the face, by name
    this.lift = 0; // blend into holding it there
    this._lastRaised = null;
    this.seated = null; // what the hiker sits astride (seat())
    this._seat = null; // ...or last sat on, while getting down
    this.sit = 0; // blend into sitting
    this.stood = null; // what the hiker stands on that slides (stance())
    this._stance = null; // ...or last stood on, while stepping off
    this.std = 0; // blend into standing on it
    this.hung = null; // what the hiker hangs from in a harness (hang())
    this._hang = null; // ...or last hung from, while letting go
    this.hng = 0; // blend into hanging

    // Per-foot state: target ankle position (root space), foot pitch, toe-out,
    // whether it's carrying weight, and the smoothed ground height under it.
    const foot = (side) => ({ side, x: 0, y: 0, z: 0, p: 0, out: 0, load: 1, g: null });
    this.footL = foot(1);
    this.footR = foot(-1);

    // Whoever is dressed owns their clothes; what is held, worn or carried
    // on the bones (a peer's borrowed gear, too) stays when someone else is.
    this.who = null;
    this.size = 1; // who.size
    this.outfit = []; // what dress() hung on the bones
    this.resources = new Set(); // ...and what it is made of
    this.worn = []; // straps round the head: { holder, crown } (addWorn)
    this.swing = null; // what of theirs moves on its own (who.dress)
    this.dress(who);
  }

  dispose() {
    this.#undress();
  }

  // ── The body ──────────────────────────────────────────────────────────────
  // The bones everyone has, at the grown-up's measurements. The clothes are
  // whoever is dressed (dress()).
  #bones() {
    const joint = (parent, x, y) => {
      const bone = new THREE.Bone();
      bone.position.set(x, y, 0);
      parent.add(bone);
      return bone;
    };
    this.hips = joint(this.root, 0, HIPS_Y);
    this.spine = group(this.hips, 0, 0.06, 0);
    this.chest = joint(this.spine, 0, 0);
    this.neck = group(this.chest, 0, NECK_Y, 0);
    this.head = group(this.neck, 0, NECK, 0);
    // Where something worn on the head goes, and the frame a strap round it
    // is in; and where something worn on the back goes. Whoever is dressed
    // says where those are (dress()).
    this.capFrame = group(this.head);
    this.brow = group(this.capFrame);
    this.cap = { brow: this.brow, crown: null }; // crown: see who.dress
    this.back = group(this.chest);

    const arm = (side) => {
      const shoulder = joint(this.chest, side * 0.201, 0.420);
      const elbow = joint(shoulder, 0, -0.28);
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

    const leg = (side) => {
      const hip = joint(this.hips, side * HIP_X, HIP_Y);
      hip.rotation.order = 'ZXY';
      const knee = joint(hip, 0, -THIGH);
      const ankle = group(knee, 0, -SHIN, 0);
      return { side, hip, knee, ankle };
    };
    this.legL = leg(1);
    this.legR = leg(-1);
  }

  // Be someone else (one of hikers.js): their clothes, their size. What is
  // held, worn or carried stays, and a strap round the head is let out or
  // taken in to fit.
  dress(who) {
    if (!who || who === this.who) return;
    this.#undress();
    this.who = who;
    this.size = who.size ?? 1;
    this.root.scale.setScalar(this.size);
    // Cloth is bound to the bones as they stand, so straighten the limbs
    // while it is put on.
    const limbs = [this.armL, this.armR, this.legL, this.legR].flatMap((L) => (L.shoulder ? [L.shoulder, L.elbow] : [L.hip, L.knee]));
    const bent = limbs.map((b) => b.rotation.clone());
    for (const b of limbs) b.rotation.set(0, 0, 0);
    const there = new Set();
    this.root.traverse((o) => there.add(o));
    const { brow, crown, back, swing } = who.dress(this);
    this.swing = swing ?? null;
    this.root.traverse((o) => {
      if (there.has(o)) return;
      if (there.has(o.parent)) this.outfit.push(o);
      if (!o.isMesh) return;
      o.receiveShadow = true;
      this.resources.add(o.geometry);
      this.resources.add(o.material);
      if (o.isSkinnedMesh) this.resources.add(o.skeleton);
    });
    limbs.forEach((b, i) => b.rotation.copy(bent[i]));

    place(this.capFrame, brow.parent);
    place(this.brow, brow);
    place(this.back, back);
    for (const w of this.worn) fit(w, crown);
    this.cap.crown = { ...crown };
  }

  #undress() {
    this.swing = null;
    for (const o of this.outfit) o.removeFromParent();
    this.outfit.length = 0;
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
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

  // Something the hiker wears on the front of the head, or of the cap if
  // there is one (a headlamp), placed in that spot's frame: +z out of the
  // front, y up it. `band`, if given, is put round the head at the same
  // height, in the cap's frame (a strap): character.cap.crown says how big
  // it is round there. Dressed as someone else, the band is fitted to them.
  addWorn(object, { band = null } = {}) {
    this.cap.brow.add(object);
    if (!band) return;
    const holder = new THREE.Group();
    holder.add(band);
    this.capFrame.add(holder);
    this.worn.push({ holder, crown: { ...this.cap.crown } });
  }

  // Something the hiker wears on the back (a jetpack), over a pack if there
  // is one, placed in the frame of the back: +z into the body, y up the
  // spine, +x to the hiker's left. It rides with the chest however the body
  // leans. Its owner shows and hides it.
  addOnBack(object) {
    this.back.add(object);
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
  //   lean    how far forward the body leans (radians; back, if negative)
  //   reins   0..1 how much the hands are held out in front
  //   rest    0..1 how much the arms rest out on what you sit in (a tube's
  //           rim), wide to the sides
  //   stroke  null, or how far through a stroke of the hands in the water
  //           over the sides (0..1, read every frame): reaching forward,
  //           pulling back, and lifting out to reach again
  seat(s) {
    this.seated = s || null;
    if (s) this._seat = s;
  }

  // Stand on something that slides (skis, a board), or with null, step off.
  // The feet stay planted where the stance puts them instead of walking, and
  // whatever carries the hiker owns the root's tilt: it pitches and rolls it
  // to the snow (and leans it into a turn), and the body stays over the feet.
  // Read every frame, so its owner can change it as it goes:
  //   feet    [[x, z], [x, z]]  where the left and right feet stand (m, body
  //           frame: +x is the hiker's left, +z ahead)
  //   out     [l, r]  how far each toe turns out (radians; negative turns it in)
  //   crouch  0..1    how far down into the knees
  //   lean    how far the body leans forward over the feet (radians)
  //   pitch, roll     how far the owner has tipped the root forward and to
  //                   the right (radians): the body leans back against most of it
  //   twist   how far the shoulders turn left of the hips (radians)
  //   look    how far the head turns left of the hips (radians)
  //   arms    'poles' (low and forward, a pole in each hand) or 'out' (out to
  //           the sides, for balance)
  //   plant   [l, r]  0..1: a pole reached forward to plant
  //   reach   0..1    a hand down to what is underfoot (a grab)
  //   tuck    0..1    the feet drawn up under the body (in the air)
  // and the gear, put on while the stance lasts:
  //   shod    [left, right]  worn under each boot (skis), in the ankle's
  //           frame: the sole is SOLE below its origin, +z ahead
  //   board   under both feet (a snowboard), in the body's frame, its top
  //           at the soles: it comes up with them when they tuck
  //   hands   [left, right]  held in each hand (poles), gripped at the origin,
  //           pointing along -y
  stance(s) {
    if (s === this.stood) return;
    this.#gear(this.stood, false);
    this.stood = s || null;
    if (s) {
      this._stance = s;
      this.#gear(s, true);
    }
  }

  // Hang in a harness under something (a hang glider), or with null, let
  // go. The legs hang straight from the hips, the hands reach out ahead to a
  // bar, and whatever carries the hiker owns the root: it puts it where the
  // harness holds the body, and pitches it (from upright to lying flat) and
  // rolls it as it banks. Read every frame, so its owner can change it:
  //   tilt    how far the owner has pitched the root forward (radians: 0
  //           upright, about pi/2 lying flat). Lying flat the legs trail
  //           behind, toes pointed, and the head comes up to look ahead
  //   reach   how far below straight ahead the hands reach out (radians, in
  //           the world, whichever way the body lies)
  //   spread  how far out to the sides the arms go to the bar (radians)
  hang(h) {
    this.hung = h || null;
    if (h) this._hang = h;
  }

  #gear(s, on) {
    if (!s) return;
    const put = (parent, o) => {
      if (!o) return;
      if (on) parent.add(o);
      else parent.remove(o);
    };
    if (s.shod) {
      put(this.legL.ankle, s.shod[0]);
      put(this.legR.ankle, s.shod[1]);
    }
    if (s.hands) {
      put(this.handL, s.hands[0]);
      put(this.hand, s.hands[1]);
    }
    put(this.root, s.board);
  }

  // Start a work animation: 'chop' | 'chopLow' | 'fell' | 'dig' | 'bend' |
  // 'reach', or one a feature defined (definePose).
  play(kind, dur, loop = false) {
    if (this.action && this.action.kind === kind && this.action.loop && loop && !this.action.still) {
      this.action.dur = dur;
      return;
    }
    this.action = { kind, t: 0, dur, loop };
  }

  // Hold a pose part-way through it instead of playing it: p, 0 at its start
  // .. 1 at its end. For something that is held as far as it's asked (a bow
  // drawn, a crouch) rather than swung, said again whenever p changes; stop()
  // lets go of it.
  hold(kind, p) {
    const a = this.action;
    const t = clamp(p, 0, 1);
    if (a && a.kind === kind && a.still) a.t = t;
    else this.action = { kind, t, dur: 1, loop: true, still: true };
  }

  stop() {
    if (!this.action) return;
    this.action.loop = false;
    this.action.still = false;
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

  // speed: horizontal m/s (less than 0: walking backwards), grounded: bool,
  // vy: vertical velocity, turn: rad/s
  update(dt, speed, grounded, vy, turn) {
    dt = Math.min(dt, 1 / 15);
    this.time += dt;
    // Walking backwards is the same walk played backwards: each foot goes
    // along its path from the end to the start, so a planted foot slides
    // forward under you, and one coming down lands toe first and rolls back
    // onto the heel. The body leans the other way into starts and stops.
    const ahead = speed < 0 ? -1 : 1;
    speed = Math.abs(speed);
    // Someone smaller walks the way the grown-up body would at a speed scaled
    // down to them (by the root of their size, which keeps the Froude number),
    // and their steps turn over quicker by the same root. The strides come
    // out the right length for how fast they go in the world, so the feet
    // don't skate, and a small child's legs go like the clappers.
    const quick = 1 / Math.sqrt(this.size);
    const v = speed * quick;
    vy *= quick;
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
    this.phase += ahead * f * dt * quick;
    const stride = f > 1e-3 ? v / f : 0;
    const betaWalk = clamp(0.62 - 0.03 * v, 0.52, 0.62);
    const betaRun = clamp((0.9 * Math.max(fRun, 0.5)) / Math.max(v, 0.5), 0.22, 0.4);
    const beta = lerp(betaWalk, betaRun, rb); // fraction of the cycle a foot is down
    const sweep = beta * stride; // how far a planted foot travels back under you
    const roll = smoothstep(0, 1.4, v); // slow steps barely roll heel to toe

    // A heel comes down every half cycle. Walking backwards a toe does, where
    // the foot's path played backwards comes to the ground: at the end of
    // the time it is down going forwards.
    const step = Math.floor((this.phase - (ahead < 0 ? beta : 0)) * 2);
    if (step !== this.stepIndex && grounded && mb > 0.3 && this.onFootstep) this.onFootstep(rb);
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
    const accLean = clamp(this.acc * 0.022, -0.16, 0.22) * (1 - ab) * ahead;
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

    // Lean into the turn (unless standing on something whose owner tilts
    // the root itself).
    const turnLean = clamp(-turn * v * 0.018, -0.2, 0.2) * (1 - ab * 0.5);
    if (!this.stood && !this.hung) this.root.rotation.z = lerp(this.root.rotation.z, turnLean, k);

    // How the tool rides when you're just carrying it.
    const held = this.tool ? this.tools[this.tool] : null;
    const toolRest = held ? held.rest : 0;
    if (held && held.elbow !== undefined) this.armR.elbow.rotation.x = held.elbow;
    this.hand.rotation.set(toolRest, 0, 0);

    // ── Work poses blend over the walk ─────────────────────────────────────
    const a = this.action;
    if (a && !a.still) {
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
      // (the seat is in the world's metres, the body in the grown-up's)
      const sz = this.size;
      hy = lerp(hy, SEAT_HIPS / sz, sit);
      hPitch *= 1 - sit;
      hYaw *= 1 - sit;
      hRoll *= 1 - sit;
      for (const F of [this.footL, this.footR]) {
        F.x = lerp(F.x, F.side * (S.spread / sz + 0.05), sit);
        F.y = lerp(F.y, (SEAT_HIPS - S.hang) / sz, sit);
        F.z = lerp(F.z, (S.fwd ?? 0.1) / sz, sit);
        F.p = lerp(F.p, 0.35, sit);
        F.out = lerp(F.out, F.side * 0.22, sit);
        F.load *= 1 - sit;
      }
      // (unless at work: a stroke of a paddle leans and turns the body itself)
      const free = 1 - this.work;
      this.spine.rotation.x = lerp(this.spine.rotation.x, lean, sit * free);
      this.spine.rotation.y *= 1 - sit * free;
      this.spine.rotation.z *= 1 - sit;
      this.head.rotation.x = lerp(this.head.rotation.x, -lean * 0.8, sit);
      const reins = (S.reins ?? 1) * sit;
      for (const [A, s] of [[this.armL, 1], [this.armR, -1]]) {
        A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, -0.5 - lean, reins);
        A.shoulder.rotation.z = lerp(A.shoulder.rotation.z, -s * 0.16, reins);
        A.elbow.rotation.x = lerp(A.elbow.rotation.x, -1.1, reins);
      }
      this.hand.rotation.x = lerp(this.hand.rotation.x, 0, reins);
      // the arms out over the sides, resting on the rim, or reaching down
      // into the water and pulling back
      const rest = (S.rest ?? 0) * sit;
      if (rest) {
        const st = S.stroke;
        const u = st === null || st === undefined ? null : fract(st);
        // through a stroke: reach forward, pull back down in the water, lift
        // out and come forward again over it
        const reach = u === null ? 0 : u < 0.6 ? 1 - u / 0.6 : (u - 0.6) / 0.4;
        const pull = u === null ? 0 : Math.sin(Math.min(1, u / 0.6) * Math.PI);
        for (const [A, s] of [[this.armL, 1], [this.armR, -1]]) {
          A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, lerp(REST.sh, REST.reach, reach), rest);
          A.shoulder.rotation.y = lerp(A.shoulder.rotation.y, 0, rest);
          A.shoulder.rotation.z = lerp(A.shoulder.rotation.z, s * (REST.out - REST.dip * pull), rest);
          A.elbow.rotation.x = lerp(A.elbow.rotation.x, REST.el * (1 - 0.5 * pull), rest);
        }
      }
    }

    // ── Standing on something that slides ──────────────────────────────────
    // Feet planted where the stance puts them, knees bent and the body over
    // them, leaning back against the slope the root is tipped to; the arms
    // low and forward with the poles, or out for balance.
    this.std = lerp(this.std, this.stood ? 1 : 0, 1 - Math.exp(-dt * (this.stood ? 12 : 6)));
    const std = this._stance && this.std > 0.001 ? ease(this.std) : 0;
    if (std) {
      const S = this._stance;
      const crouch = S.crouch ?? 0.3;
      const tuck = S.tuck ?? 0;
      const reach = S.reach ?? 0;
      hx = lerp(hx, 0, std);
      hz = lerp(hz, -0.04 - crouch * 0.1, std);
      hy = lerp(hy, HIPS_Y - 0.04 - crouch * 0.3 - reach * 0.06 + this.land, std);
      hPitch *= 1 - std;
      hYaw *= 1 - std;
      hRoll *= 1 - std;
      const feet = S.feet || STANCE_FEET;
      const out = S.out || STANCE_OUT;
      for (const F of [this.footL, this.footR]) {
        const i = F.side > 0 ? 0 : 1;
        F.x = lerp(F.x, feet[i][0], std);
        F.y = lerp(F.y, ANKLE_H + tuck * STANCE_TUCK, std);
        F.z = lerp(F.z, feet[i][1], std);
        F.p = lerp(F.p, 0, std);
        F.out = lerp(F.out, out[i], std);
        F.load = lerp(F.load, 1, std);
      }
      // a board comes up with the feet
      if (S.board) S.board.position.y = tuck * STANCE_TUCK * std;
      const lean = (S.lean ?? 0.25) + reach * 0.4 - (S.pitch ?? 0) * 0.7;
      const twist = S.twist ?? 0;
      this.spine.rotation.x = lerp(this.spine.rotation.x, lean, std);
      this.spine.rotation.y = lerp(this.spine.rotation.y, twist, std);
      this.spine.rotation.z = lerp(this.spine.rotation.z, -(S.roll ?? 0) * 0.7, std);
      this.head.rotation.x = lerp(this.head.rotation.x, -lean * 0.8, std);
      this.head.rotation.y = lerp(this.head.rotation.y, (S.look ?? 0) - twist, std);
      this.head.rotation.z = lerp(this.head.rotation.z, 0, std);
      const poles = (S.arms ?? 'poles') === 'poles';
      const plant = S.plant || STANCE_PLANT;
      for (const [A, s, i] of [[this.armL, 1, 0], [this.armR, -1, 1]]) {
        const p = poles ? plant[i] : 0;
        const sh = (poles ? -0.45 : -0.25) - lean * 0.6 - p * 0.55;
        A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, sh, std);
        A.shoulder.rotation.y = lerp(A.shoulder.rotation.y, 0, std);
        A.shoulder.rotation.z = lerp(A.shoulder.rotation.z, s * (poles ? 0.22 : 0.85), std);
        A.elbow.rotation.x = lerp(A.elbow.rotation.x, poles ? -0.95 + p * 0.35 : -0.45, std);
      }
      // a pole in each hand points down and a little back
      const wrist = poles ? 1.75 : 0;
      this.hand.rotation.set(lerp(this.hand.rotation.x, wrist, std), this.hand.rotation.y * (1 - std), this.hand.rotation.z * (1 - std));
      this.handL.rotation.set(wrist * std, 0, 0);
      // a grab: the right hand down to the skis or the board
      if (reach > 0) {
        const A = this.armR;
        const w = reach * std;
        A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, -0.3, w);
        A.shoulder.rotation.z = lerp(A.shoulder.rotation.z, -0.12, w);
        A.elbow.rotation.x = lerp(A.elbow.rotation.x, -0.1, w);
      }
    }

    // ── Hanging in a harness ───────────────────────────────────────────────
    // The legs straight from the hips, trailing behind lying flat; the body
    // straight, the head up to see ahead; the arms out to the bar.
    this.hng = lerp(this.hng, this.hung ? 1 : 0, 1 - Math.exp(-dt * (this.hung ? 8 : 6)));
    const hng = this._hang && this.hng > 0.001 ? ease(this.hng) : 0;
    if (hng) {
      const H = this._hang;
      const tilt = H.tilt ?? 0;
      const flat = smoothstep(HANG_FLAT[0], HANG_FLAT[1], tilt);
      hx *= 1 - hng;
      hz *= 1 - hng;
      hy = lerp(hy, HIPS_Y, hng);
      hPitch *= 1 - hng;
      hYaw *= 1 - hng;
      hRoll *= 1 - hng;
      const [uy, uz, up] = HANG_FEET.up;
      const [fy, fz, fp] = HANG_FEET.flat;
      for (const F of [this.footL, this.footR]) {
        F.x = lerp(F.x, F.side * lerp(0.1, 0.075, flat), hng);
        F.y = lerp(F.y, lerp(uy, fy, flat), hng);
        F.z = lerp(F.z, lerp(uz, fz, flat), hng);
        F.p = lerp(F.p, lerp(up, fp, flat), hng);
        F.out = lerp(F.out, F.side * 0.05, hng);
        F.load *= 1 - hng;
      }
      const arch = -0.1 * flat; // lying flat, the back arches a little
      this.spine.rotation.x = lerp(this.spine.rotation.x, arch, hng);
      this.spine.rotation.y *= 1 - hng;
      this.spine.rotation.z *= 1 - hng;
      this.head.rotation.x = lerp(this.head.rotation.x, -(tilt + arch) * 0.85, hng);
      this.head.rotation.y *= 1 - hng;
      this.head.rotation.z *= 1 - hng;
      // the shoulder's pitch is the body's, so take the tilt back out of it to
      // reach the same way in the world however the body lies
      const sh = -(Math.PI / 2 - (H.reach ?? 0.6)) - tilt - arch;
      const spread = H.spread ?? 0.4;
      for (const [A, s] of [[this.armL, 1], [this.armR, -1]]) {
        A.shoulder.rotation.x = lerp(A.shoulder.rotation.x, sh, hng);
        A.shoulder.rotation.y = lerp(A.shoulder.rotation.y, 0, hng);
        A.shoulder.rotation.z = lerp(A.shoulder.rotation.z, s * spread, hng);
        A.elbow.rotation.x = lerp(A.elbow.rotation.x, -0.3, hng);
      }
      this.hand.rotation.set(this.hand.rotation.x * (1 - hng), this.hand.rotation.y * (1 - hng), this.hand.rotation.z * (1 - hng));
      this.handL.rotation.set(this.handL.rotation.x * (1 - hng), 0, 0);
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
    if (this.groundAt && ab < 0.999 && sit < 0.999 && swim < 0.5 && std < 0.999 && hng < 0.999) this.#feelGround(dt, (1 - ab) * (1 - sit) * (1 - swim * 2) * (1 - std) * (1 - hng));

    // The body banks into turns about the feet; keep the feet on the ground.
    // (Standing on skis, the feet tip with the root: they're on edge. Hanging
    // in a harness, the whole body rolls with what it hangs from.)
    const bank = this.root.rotation.z * (1 - std) * (1 - hng);
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
    this.swing?.(dt);
  }

  // Kick and stroke, blended in by w over whatever the walk made of the legs
  // and arms, and lie the body along the way it's swimming.
  #swimPose(dt, w) {
    const { prone, pitch, under } = this.swimTo;
    const going = smoothstep(0.05, 0.6, prone);
    this.stroke += (dt / Math.sqrt(this.size)) * lerp(STROKES[0], STROKES[1], going);
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
    const pivot = SWIM_PIVOT * this.size;
    const back = pivot * Math.sin(tilt);
    r.position.y += pivot * (1 - Math.cos(tilt));
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
  // (The feet are placed in the body's own metres, the ground is in the
  // world's: a smaller body's are that much smaller.)
  #feelGround(dt, w) {
    const r = this.root;
    const sz = this.size;
    const yaw = r.rotation.y;
    const cy = Math.cos(yaw) * sz;
    const sy = Math.sin(yaw) * sz;
    const ks = 1 - Math.exp(-dt * 30);
    for (const F of [this.footL, this.footR]) {
      const wx = r.position.x + F.x * cy + F.z * sy;
      const wz = r.position.z - F.x * sy + F.z * cy;
      const gh = this.groundAt(wx, wz);
      if (!Number.isFinite(gh)) continue;
      F.g = F.g === null ? gh : lerp(F.g, gh, ks);
      const ahead = this.groundAt(wx + sy * 0.12, wz + cy * 0.12);
      const behind = this.groundAt(wx - sy * 0.12, wz - cy * 0.12);
      const slope = Number.isFinite(ahead) && Number.isFinite(behind) ? -Math.atan2(ahead - behind, 0.24 * sz) : 0;
      F.y += clamp((F.g - r.position.y) / sz, -0.45, 0.45) * w;
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
