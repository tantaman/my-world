// The fighters, as you see them: each is the hikers' own body
// (player/character.js) dressed as a Raider or a Warden (outfits.js), with
// what they're holding (guns.js) in their hands.
//
// The legs are the hiker's walk: feet that plant and roll, a run with a
// flight in it, knees that take a landing. They go the way the fighter is
// *moving*; the body above them is turned to where the fighter is *aiming*,
// so someone stepping sideways round a corner steps sideways. Crouched, the
// hips come down and the walk goes on under them.
//
// The gun is put where it would be (a long one in the shoulder, a pistol out
// in front of the eyes in both hands) and pointed exactly where the fighter
// is aiming, up or down; then each arm is bent to bring its hand to it. So a
// shot leaves the muzzle you see. It comes down a little on the run, kicks
// when it fires, and is tipped over to be loaded.
//
// Someone hit falls where they stand, backwards or on their face, and lies
// there with what they were carrying beside them.
//
//   const v = makeFigure(n)          n: which of their side they are (0..4)
//   poseFigure(v, f, kind, dt, m)    stand it where fighter f is, as it is
//                                    (kind: what's in its hands; m: the match)
//   kickFigure(v)                    it has just fired
//   muzzleOf(v, out)                 where its shots leave it, in the world
//   v.group                          what to put in the scene
//   reach(arm, to, pole)             an arm bent to bring its hand somewhere
//                                    (your own, too: hands.js)

import * as THREE from 'three';
import { Character, definePose } from '../player/character.js';
import { MOVE } from './mover.js';
import { floorAt } from './town.js';
import { GUNS } from './arms.js';
import { gunModel, holdOf } from './guns.js';
import { outfit, SIDE_COLOURS } from './outfits.js';

export { SIDE_COLOURS };

// ── The body's own measurements (player/character.js), in its metres ────────
const UPPER = 0.28; // shoulder to elbow
const FORE = 0.265; // elbow to the middle of the hand
const SHOULDER = { x: 0.201, y: 0.42 }; // the shoulder joints, in the chest's frame

// Crouched: how far the hips come down (m) and the back leans (radians).
const DUCK = { drop: 0.4, lean: 0.3 };
definePose('skirmish-ready', [
  [0, { sh: 0, el: 0, tool: 0, sp: 0.02, inw: 0, drop: 0 }],
  [1, { sh: 0, el: 0, tool: 0, sp: DUCK.lean, inw: 0, drop: DUCK.drop }],
]);

// How each kind of thing is held: where it is (`at`, from `pivot` in the
// chest's frame, in the frame of the aim: x to the left, y up, z ahead), how
// far the chest is turned from the aim to hold it (`blade`: negative, the
// right shoulder back), which way each elbow goes, and how far it comes down
// on the run (`low`: m, and radians of muzzle).
const P = (x, y, z) => new THREE.Vector3(x, y, z);
const HOLD = {
  long: { pivot: P(-0.13, 0.405, 0.04), at: P(0.02, -0.035, 0), blade: -0.72, tilt: -0.1, low: [0.06, 0.32], poleR: P(-0.75, -0.65, -0.1), poleL: P(0.35, -0.9, 0.1) },
  short: { pivot: P(0, 0.44, 0.02), at: P(0, 0.075, 0.46), blade: 0, tilt: 0, low: [0.16, 0.5], poleR: P(-0.6, -0.75, 0), poleL: P(0.6, -0.75, 0) },
  knife: { pivot: P(-0.2, 0.3, 0.04), at: P(0, -0.06, 0.34), blade: -0.2, tilt: 0, low: [0.06, 0.2], poleR: P(-0.5, -0.8, -0.2), poleL: null },
  thrown: { pivot: P(-0.2, 0.42, 0.02), at: P(-0.03, 0.02, 0.2), blade: -0.25, tilt: 0, low: [0.1, 0], poleR: P(-0.7, -0.6, -0.2), poleL: null },
  charge: { pivot: P(0, 0.2, 0.06), at: P(0.06, -0.02, 0.3), blade: 0, tilt: 0, low: [0, 0], poleR: P(-0.7, -0.6, 0), poleL: P(0.7, -0.6, 0) },
};
const FEND = { at: P(0.16, 0.2, 0.3), pole: P(0.5, -0.8, 0) }; // the free hand, with a knife in the other: up in front
// How far ahead of the shoulder each long gun's grip is (m): its stock, less
// what of the butt is tucked in under the arm.
const STOCK = { rifle: 0.335, shotgun: 0.365, longrifle: 0.36, smg: 0.335 };
// Standing still, a fighter stands to shoot: the left foot forward, the
// right back and turned out, the knees a little bent (Character.stance takes
// it: feet [x to the left, z ahead], and how far each toe turns out).
const STAND = { feet: [[0.12, 0.04], [-0.13, -0.13]], out: [0.06, -0.42], crouch: -0.09 };
// ...and crouched still, down over the right heel, the left knee up.
const SQUAT = { feet: [[0.14, 0.15], [-0.14, -0.24]], crouch: 1.25 };
const STILL = 0.35; // m/s: slower than this is standing still
const LEGS_TURN = 1.15; // radians the legs turn from the aim, at the most, to go the way they're going
const BACKWARDS = 1.9; // ...and past this far from it, they walk backwards instead
const FALL = 0.6; // s to fall
const KICK = 9; // 1/s the kick dies away

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _e = new THREE.Vector3();
const _U = new THREE.Vector3();
const _F = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _eu = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => t * t * (3 - 2 * t);
const wrap = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

// Bend an arm (A: { shoulder, elbow }, bones as the body's are) so its hand
// is at `to`, the elbow going the way of `pole` as near as it can: both in
// the frame the shoulder is in (the chest's).
export function reach(A, to, pole) {
  _n.subVectors(to, A.shoulder.position);
  const d = clamp(_n.length(), Math.abs(UPPER - FORE) + 0.03, UPPER + FORE - 0.003);
  _n.normalize();
  const along = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
  _u.copy(pole).addScaledVector(_n, -pole.dot(_n));
  if (_u.lengthSq() < 1e-6) _u.set(0, -1, 0.01).addScaledVector(_n, _n.y);
  _u.normalize();
  _e.copy(_n).multiplyScalar(along).addScaledVector(_u, out); // the elbow, from the shoulder
  _U.copy(_e).normalize();
  _F.copy(_n).multiplyScalar(d).sub(_e).normalize();
  // the upper arm lies along the bone's −y; the forearm bends from it towards its +z
  _y.copy(_U).negate();
  _z.copy(_F).addScaledVector(_U, -_F.dot(_U));
  if (_z.lengthSq() < 1e-8) _z.copy(_u).negate();
  _z.normalize();
  _x.crossVectors(_y, _z);
  A.shoulder.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  A.elbow.rotation.set(-Math.acos(clamp(_U.dot(_F), -1, 1)), 0, 0);
}

// The bones a fall moves, and how they lie at the end of it: on the back,
// and on the face. [x, y, z] of each bone's own turn (radians).
const LIMBS = (c) => [c.spine, c.head, c.armL.shoulder, c.armL.elbow, c.armR.shoulder, c.armR.elbow, c.legL.hip, c.legL.knee, c.legR.hip, c.legR.knee, c.hips];
const LAID = {
  back: [[-0.06, 0.08, 0.04], [-0.1, 0.55, 0.12], [-0.25, 0, 1.15], [-0.45, 0, 0], [-0.1, 0, -0.75], [-1.0, 0, 0], [-0.12, 0, 0.2], [0.3, 0, 0], [0.04, 0, -0.26], [0.1, 0, 0], [0, 0, 0]],
  face: [[0.05, -0.1, 0.03], [-0.25, -0.95, 0], [-2.5, 0, 0.5], [-0.6, 0, 0], [-0.5, 0, -0.9], [-1.3, 0, 0], [0.06, 0, 0.16], [0.12, 0, 0], [0.12, 0, -0.3], [0.5, 0, 0], [0, 0, 0]],
};
// ...how far over the body goes, how high off the ground its feet end up, and where what it held lies (in its own frame).
const LIE = { back: { turn: -Math.PI / 2 + 0.03, up: 0.14, gun: P(-0.5, 1.08, -0.1) }, face: { turn: Math.PI / 2 - 0.03, up: 0.17, gun: P(-0.55, 1.2, 0.13) } };

// A fighter to draw: the nth of whichever side it turns out to be on.
export function makeFigure(n = 0) {
  const c = new Character(outfit('attack', n));
  const mount = new THREE.Group(); // what's in their hands: placed in the body's own frame
  c.root.add(mount);
  // (how they stand while they're still: said to the body, and changed as they crouch)
  const stand = { feet: [[0, 0], [0, 0]], out: STAND.out, crouch: 0, lean: 0, arms: 'out' };
  const v = { group: c.root, c, n, side: 'attack', mount, models: new Map(), held: null, heldKind: '', carried: null, kick: 0, twist: 0, kneel: 0, low: 0, yaw: null, feet: 0, fell: null, from: null, parts: null, stand, limbs: LIMBS(c) };
  // (their feet find the town's floor: a step up, a crate's edge)
  c.groundAt = (x, z) => floorAt(x, z, v.feet + MOVE.step + 0.1, 0.02);
  parts(v);
  return v;
}

// (the things that are put on and taken off, found again each time they're dressed)
function parts(v) {
  const find = (name) => v.c.root.getObjectByName(name);
  v.parts = { armour: find('armour'), rig: find('rig'), helmet: find('helmet'), hat: find('hat') };
  // the charge, on the back of whoever carries it
  if (!v.carried) {
    v.carried = gunModel('charge');
    v.carried.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    v.carried.position.set(0, 0.02, -0.03);
    v.carried.visible = false;
    v.c.addOnBack(v.carried);
  }
}

// Raiders or Wardens: the sides change over at half time, and the fighters
// change their clothes.
export function setSide(v, side) {
  if (v.side === side) return;
  v.side = side;
  v.c.dress(outfit(side, v.n));
  parts(v);
}

function setHeld(v, kind) {
  if (v.heldKind === kind) return;
  if (v.held) v.held.visible = false;
  v.heldKind = kind;
  let model = v.models.get(kind);
  if (!model) {
    model = gunModel(kind);
    v.models.set(kind, model);
    v.mount.add(model);
  }
  model.visible = true;
  v.held = model;
}

// It has just fired.
export function kickFigure(v) {
  v.kick = 1;
}

// Where its shots leave it, in the world.
export function muzzleOf(v, out) {
  if (!v.held) return v.group.getWorldPosition(out);
  v.group.updateWorldMatrix(true, false);
  v.mount.updateWorldMatrix(false, true);
  return v.held.localToWorld(out.copy(v.held.userData.muzzle));
}

// Stand a figure where its fighter is, as it is. kind: what's in its hands.
// match: the match (for where the charge is, to someone pulling its fuse).
export function poseFigure(v, f, kind, dt, match = null) {
  const c = v.c;
  const b = f.body;
  setHeld(v, kind);
  const P = v.parts;
  if (P.armour) P.armour.visible = f.kit.armor > 0;
  if (P.rig) P.rig.visible = !(f.kit.armor > 0);
  if (P.helmet) P.helmet.visible = !!f.kit.helmet;
  if (P.hat) P.hat.visible = !f.kit.helmet;
  v.carried.visible = !!f.charge && f.held !== 'charge';
  if (!f.alive) return lie(v, f, dt);
  if (v.fell) rise(v);

  // ── The legs: the way they're going ──
  const facing = f.yaw + Math.PI; // (the body looks along +z, a fighter along −z)
  const speed = Math.hypot(b.vel.x, b.vel.z);
  let twist = 0;
  let ahead = 1;
  if (speed > 0.3) {
    const going = wrap(Math.atan2(b.vel.x, b.vel.z) - facing);
    if (Math.abs(going) > BACKWARDS) {
      ahead = -1;
      twist = wrap(going - Math.PI);
    } else twist = going;
    twist = clamp(twist, -LEGS_TURN, LEGS_TURN) * Math.min(1, (speed - 0.3) / 1.2);
  }
  v.twist += wrap(twist - v.twist) * (1 - Math.exp(-dt * 10));
  const turn = v.yaw === null ? 0 : wrap(facing - v.yaw) / Math.max(dt, 1e-3);
  v.yaw = facing;
  // down on one knee to set the charge, or to pull its fuse
  const busy = f.planting > 0 || f.defusing > 0;
  v.kneel += ((busy ? 1 : 0) - v.kneel) * (1 - Math.exp(-dt * 9));
  const duck = Math.max(b.crouch, v.kneel);
  c.hold('skirmish-ready', duck);
  // (still, and on the ground: feet planted to shoot from; else the walk)
  if (speed < STILL && b.grounded && Math.abs(turn) < 2.5) {
    const S = v.stand;
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) S.feet[i][k] = STAND.feet[i][k] + (SQUAT.feet[i][k] - STAND.feet[i][k]) * duck;
    S.crouch = STAND.crouch + (SQUAT.crouch - STAND.crouch) * duck;
    c.stance(S);
  } else c.stance(null);
  v.feet = b.pos.y;
  c.root.position.set(b.pos.x, b.pos.y, b.pos.z);
  c.root.rotation.y = facing + v.twist;
  c.update(dt, ahead * speed, b.grounded, b.vel.y, clamp(turn, -6, 6));

  // ── The body above them: turned to the aim ──
  const hold = HOLD[holdOf(kind)];
  const gun = GUNS[kind];
  v.kick = Math.max(0, v.kick - dt * KICK);
  const kick = v.kick * v.kick;
  // (on the run, and not shooting, what's held comes down a little)
  const hurry = !f.sighted && f.reloading <= 0 && speed > MOVE.speed * 0.72 && b.grounded ? 1 : 0;
  v.low += ((kick > 0.01 ? 0 : hurry) - v.low) * (1 - Math.exp(-dt * (hurry ? 5 : 12)));
  const loading = gun && f.reloading > 0 ? Math.sin(clamp(1 - f.reloading / gun.reload, 0, 1) * Math.PI) : 0;
  const pitch = clamp(f.pitch + f.punch.pitch, -1.35, 1.35) * (1 - v.kneel) - hold.low[1] * v.low - loading * 0.3 - v.kneel * 0.5;
  // (into the gun a little, always)
  const lean = 0.3 + c.spine.rotation.x * 0.4 + duck * DUCK.lean * 0.4 - pitch * 0.32 + v.kneel * 0.35;
  c.spine.rotation.set(lean, hold.blade - v.twist - c.hips.rotation.y, c.spine.rotation.z * 0.5);
  c.head.rotation.set(-pitch * 0.68 - lean + (hold.blade ? 0.08 : 0), -hold.blade * 0.92, hold.tilt);

  // ── What's in their hands: where it would be, pointing where they aim ──
  c.root.updateMatrixWorld(true);
  const aim = _q.setFromAxisAngle(Y, -v.twist).multiply(_q2.setFromAxisAngle(X, -pitch - kick * 0.05));
  // (the chest's frame in the body's: the gun hangs from a place on the chest)
  _v.copy(hold.pivot);
  c.chest.localToWorld(_v);
  c.root.worldToLocal(_v);
  const stock = STOCK[kind] || 0;
  _w.set(hold.at.x, hold.at.y - hold.low[0] * v.low, hold.at.z + stock - kick * 0.03 - loading * 0.04).applyQuaternion(aim);
  v.mount.position.copy(_v).add(_w);
  // (a model points along its −z; tipped over on its side to be loaded)
  v.mount.quaternion.copy(aim).multiply(_q2.setFromEuler(_eu.set(0, Math.PI, loading * 0.5 + (kind === 'knife' ? 0.5 : 0), 'XYZ')));
  const model = v.held;
  model.visible = !(f.defusing > 0);
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  if (holdOf(kind) === 'thrown') model.rotation.set(0.3, 0, 0);
  if (kind === 'charge') model.rotation.set(0, Math.PI / 2, 0);
  if (busy) {
    // set down in front of them, or reaching down to where it lies
    if (f.defusing > 0 && match) c.root.worldToLocal(_v.set(match.charge.x, match.charge.y + 0.1, match.charge.z));
    else _v.set(0, 0.1, 0.42).applyAxisAngle(Y, -v.twist);
    v.mount.position.lerp(_v, v.kneel);
  }
  v.mount.updateWorldMatrix(false, true);

  // ── The arms: a hand to each place it's held by ──
  const at = model.userData;
  _v.set(0, 0, 0);
  if (kind === 'charge') _v.set(0.11, 0, 0);
  if (busy && f.defusing > 0) _v.set(0.07, 0, 0);
  c.chest.worldToLocal(model.localToWorld(_v));
  reach(c.armR, _v, hold.poleR);
  if (hold.poleL && (at.fore || busy)) {
    // the other hand: where it holds the gun, or at the magazine while it's changed
    if (busy && f.defusing > 0) _v.set(-0.07, 0, 0);
    else {
      _v.copy(at.fore);
      if (loading && gun) _v.lerp(_w.set(0, -0.14, _v.z * 0.4), loading);
    }
    c.chest.worldToLocal(model.localToWorld(_v));
    reach(c.armL, _v, hold.poleL);
  } else if (kind === 'knife') {
    // the free hand up in front, to fend with
    reach(c.armL, FEND.at, FEND.pole);
  }
}

// Down: falling, and then lying there.
function lie(v, f, dt) {
  const c = v.c;
  if (!v.fell) {
    c.stance(null);
    // which way: shot from in front they go over backwards, more often than not
    const how = (f.id * 7 + Math.floor(f.body.pos.x * 3)) % 3 === 0 ? 'face' : 'back';
    v.fell = { how, t: 0, yaw: c.root.rotation.y };
    v.from = { bones: v.limbs.map((bone) => bone.quaternion.clone()), hips: c.hips.position.clone(), gun: v.mount.position.clone(), gunQ: v.mount.quaternion.clone() };
    c.stop();
  }
  const F = v.fell;
  F.t += dt;
  const k = ease(Math.min(1, F.t / FALL));
  const L = LIE[F.how];
  const b = f.body;
  c.root.position.set(b.pos.x, b.pos.y + L.up * k, b.pos.z);
  // (knees first, then over)
  c.root.rotation.set(L.turn * k * k, F.yaw, 0);
  const laid = LAID[F.how];
  for (let i = 0; i < v.limbs.length; i++) {
    const bone = v.limbs[i];
    bone.quaternion.copy(v.from.bones[i]).slerp(_q.setFromEuler(_eu.set(laid[i][0], laid[i][1], laid[i][2], bone.rotation.order)), k);
  }
  c.hips.position.lerpVectors(v.from.hips, _v.set(0, 0.94, 0), k);
  // what they held, dropped beside them, flat on the ground
  v.mount.position.lerpVectors(v.from.gun, L.gun, k);
  v.mount.quaternion.copy(v.from.gunQ).slerp(_q.setFromEuler(_eu.set(0, Math.PI / 2, F.how === 'back' ? 0.7 : -0.7, 'ZYX')), k);
  if (v.held) v.held.visible = holdOf(v.heldKind) !== 'thrown';
}

// Up again, for the next round.
function rise(v) {
  const c = v.c;
  v.fell = null;
  v.from = null;
  v.kneel = v.low = v.kick = v.twist = 0;
  v.yaw = null;
  c.root.rotation.set(0, 0, 0);
  for (const bone of v.limbs) bone.quaternion.identity();
  c.hips.position.set(0, 0.94, 0);
}
