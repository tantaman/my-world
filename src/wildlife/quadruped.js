// One skeleton and one gait engine for every four-legged animal, from a deer
// mouse to a bull moose. A species is a set of proportions (dims) plus the
// parts it hangs on the bones (see mammals.js).
//
// Skeleton, facing +z, in metres for a scale-1 adult:
//
//   root ─ body (pivot at the hips) ─┬─ hind legs: upper ─ lower ─ foot
//                                    ├─ tail0 ─ tail1 ─ …
//                                    └─ chest (at the shoulders) ─┬─ fore legs
//                                                                 └─ neck ─ head ─ ears
//
// Legs are placed with two-bone IK onto the actual terrain under each foot,
// so animals stand on slopes and their feet don't skate. Gaits are the real
// footfall patterns: a lateral-sequence walk, a diagonal trot, a transverse
// gallop and the half-bound of rabbits and squirrels.

import { smoothstep, clamp, lerp } from '../noise.js';

// Per gait: phase offsets [LF, RF, LH, RH], duty factor (fraction of the
// stride a foot is down), how high feet lift (× leg length), body bob (× hip
// height), how many bobs per stride, pitch rocking and spine flex (radians).
const GAITS = {
  walk: { off: [0.25, 0.75, 0.0, 0.5], duty: 0.64, lift: 0.13, bob: 0.014, bobF: 2, rock: 0.012, flex: 0, stride: 1.25 },
  trot: { off: [0.0, 0.5, 0.5, 0.0], duty: 0.44, lift: 0.2, bob: 0.03, bobF: 2, rock: 0.02, flex: 0, stride: 2.0 },
  gallop: { off: [0.45, 0.55, 0.0, 0.1], duty: 0.3, lift: 0.26, bob: 0.06, bobF: 1, rock: 0.1, flex: 0.14, stride: 3.4 },
  bound: { off: [0.5, 0.56, 0.0, 0.03], duty: 0.26, lift: 0.2, bob: 0.13, bobF: 1, rock: 0.2, flex: 0.32, stride: 2.8 },
};
const LEGS = ['LF', 'RF', 'LH', 'RH'];
const TAU = Math.PI * 2;

// Build the bones for a quadruped. Returns the named bones and leg records.
export function quadSkeleton(r, d) {
  const body = r.bone(null, 0, d.hipH, -d.bodyLen / 2, 'body');
  const chest = r.bone(body, 0, d.shoulderH - d.hipH, d.bodyLen, 'chest');
  const legs = {};
  for (const id of LEGS) {
    const fore = id[1] === 'F';
    const side = id[0] === 'L' ? 1 : -1;
    const parent = fore ? chest : body;
    const L1 = fore ? d.foreU : d.hindU;
    const L2 = fore ? d.foreL : d.hindL;
    const jx = side * (fore ? d.shW : d.hipW);
    const upper = r.bone(parent, jx, 0, 0, `${id}u`);
    const lower = r.bone(upper, 0, -L1, 0, `${id}l`);
    const foot = r.bone(lower, 0, -L2, 0, `${id}f`);
    legs[id] = { id, fore, side, upper, lower, foot, L1, L2, jx, jz: 0, tz: 0, ty: 0, init: false };
  }
  const n = d.neck;
  const neck = r.bone(chest, 0, n.y, n.z, 'neck');
  const head = r.bone(neck, 0, Math.cos(n.angle) * n.len, Math.sin(n.angle) * n.len, 'head');
  const tail = [];
  if (d.tail) {
    let prev = body;
    const seg = d.tail.len / d.tail.segs;
    for (let i = 0; i < d.tail.segs; i++) {
      const b = i === 0 ? r.bone(body, 0, d.tail.y, d.tail.z, 'tail0') : r.bone(prev, 0, 0, -seg, `tail${i}`);
      tail.push(b);
      prev = b;
    }
  }
  const ears = [];
  if (d.ears) {
    for (const side of [1, -1]) {
      const e = d.ears;
      ears.push(r.bone(head, side * e.x, e.y, e.z, side > 0 ? 'earL' : 'earR'));
    }
  }
  return { body, chest, neck, head, tail, legs, ears, tailSeg: d.tail ? d.tail.len / d.tail.segs : 0 };
}

// Rotate (y, z) about x by -a: takes a point into a frame pitched by a.
function unpitch(y, z, a, out) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.y = y * c + z * s;
  out.z = -y * s + z * c;
  return out;
}
const _t = { y: 0, z: 0 };
const _ik = { a: 0, b: 0 };

// Two-bone IK in a leg's sagittal plane. (dy, dz) is the target relative to
// the upper joint, in its parent's frame. kneeFwd: the middle joint points
// forward (a foreleg's carpus) or back (a hind leg's hock).
function solveLeg(dy, dz, L1, L2, kneeFwd, out) {
  let D = Math.hypot(dy, dz);
  D = clamp(D, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.999);
  const phiT = Math.atan2(dz, -dy);
  const A = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const K = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  if (kneeFwd) {
    out.a = -(phiT + A);
    out.b = Math.PI - K;
  } else {
    out.a = -(phiT - A);
    out.b = -(Math.PI - K);
  }
  return out;
}

// Drives a quadruped's bones. The brain moving the animal sets the inputs
// each frame (speed, look, graze, ...) and positions mesh x/z and yaw; this
// works out the height, the body's pitch and every joint.
export class Quad {
  constructor(mesh, sk, d) {
    this.mesh = mesh;
    this.sk = sk;
    this.d = d;
    this.legLen = d.hindU + d.hindL;
    // inputs
    this.speed = 0; // m/s, world
    this.turn = 0; // rad/s
    this.lookYaw = 0; // rad, head turn relative to the body
    this.lookPitch = 0; // rad, + = nose up
    this.graze = 0; // 0..1 head to the ground
    this.alert = 0; // 0..1 head high, ears up
    this.rear = 0; // 0..1 sit up / stand on hind legs
    this.crouch = 0; // 0..1 belly low (stalking, sitting)
    this.tailUp = 0; // 0..1 (a deer's white flag)
    this.air = 0; // 0..1 legs stretched out in a leap
    this.lift = 0; // m, extra height (leaps)
    this.flat = false; // ignore the terrain (climbing a trunk)
    this.gaitLock = d.gaitLock ?? null; // force a gait
    // state
    this.phase = Math.random();
    this.move = 0;
    this.gait = 'walk';
    this.time = Math.random() * 100;
    this.y = NaN;
    this.pitch = 0;
    this.earFlick = 0;
    this.nextFlick = 1 + Math.random() * 4;
    this.onStep = null; // (leg, gait) when a foot lands
  }

  pickGait(vm) {
    const d = this.d;
    if (this.gaitLock) return this.gaitLock;
    const g = this.gait;
    const h = g === 'walk' ? 1.08 : 0.92; // hysteresis
    if (vm > d.runAt * (g === 'gallop' || g === 'bound' ? 0.92 : 1.08)) return d.run || 'gallop';
    if (vm > d.trotAt * h && d.trot !== false) return 'trot';
    return 'walk';
  }

  update(dt, ground) {
    const d = this.d;
    const sk = this.sk;
    const mesh = this.mesh;
    const k = mesh.scale.x;
    this.time += dt;
    const vm = this.speed / k;
    const prevGait = this.gait;
    this.gait = this.pickGait(vm);
    const G = GAITS[this.gait];
    const L = this.legLen;
    const stride = L * G.stride * clamp(0.65 + (0.35 * vm) / Math.max(0.1, d.gaitRef?.[this.gait] ?? vm), 0.65, 1.5);
    const moving = smoothstep(0.03, 0.25 * L, vm);
    this.move = lerp(this.move, moving, 1 - Math.exp(-dt * 6));
    const mv = this.move;
    const prevPhase = this.phase;
    this.phase += (vm / stride) * dt;
    if (mv < 0.02) this.phase = lerp(this.phase, Math.round(this.phase * 2) / 2, 1 - Math.exp(-dt * 4));
    const ph = this.phase;

    // ── Where the body is ──────────────────────────────────────────────────
    const yaw = mesh.rotation.y;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const X = mesh.position.x;
    const Z = mesh.position.z;
    const half = (d.bodyLen / 2) * k;
    let hB = 0;
    let hF = 0;
    let h0 = 0;
    if (!this.flat) {
      hB = ground(X - sy * half, Z - cy * half);
      hF = ground(X + sy * half, Z + cy * half);
      h0 = (hB + hF) / 2;
      this.y = Number.isNaN(this.y) ? h0 : lerp(this.y, h0, 1 - Math.exp(-dt * 14));
      mesh.position.y = this.y + this.lift;
    }
    const baseY = this.flat ? 0 : this.y;
    const slope = this.flat ? 0 : -Math.atan2(hF - hB, d.bodyLen * k);
    this.pitch = lerp(this.pitch, slope, 1 - Math.exp(-dt * 8));

    const cyc = TAU * ph;
    // walk and trot dip twice a stride; gallops and bounds rise once, in the air
    const bobWave = G.bobF === 2 ? -Math.abs(Math.sin(cyc)) : Math.sin(cyc - 0.6);
    const bob = bobWave * G.bob * d.hipH * mv;
    const rock = Math.sin(cyc + 0.9) * G.rock * mv;
    const flex = Math.sin(cyc + 1.6) * G.flex * mv;
    const rearA = this.rear * (d.rearAngle ?? 1.1);
    const crouchY = this.crouch * (d.crouchDrop ?? 0.3) * d.hipH + this.rear * (d.rearDrop ?? 0) * d.hipH;
    const pitchB = this.pitch + rock - rearA + this.crouch * (d.crouchPitch ?? 0) + this.graze * (d.grazePitch ?? 0);
    const bodyY = d.hipH + bob - crouchY + (this.flat ? 0 : (hB - baseY) / k);
    sk.body.position.y = bodyY;
    sk.body.rotation.x = pitchB;
    sk.chest.rotation.x = flex + this.rear * (d.rearChest ?? 0.2) - this.crouch * (d.crouchPitch ?? 0) * 0.5;
    mesh.rotation.z = lerp(mesh.rotation.z, clamp(-this.turn * this.speed * 0.025, -0.2, 0.2), 1 - Math.exp(-dt * 5));

    // ── Legs ───────────────────────────────────────────────────────────────
    const stanceLen = stride * G.duty;
    const lift = G.lift * L * mv;
    const chestY = sk.chest.position.y;
    const chestZ = sk.chest.position.z;
    const ka = 1 - Math.exp(-dt * (prevGait === this.gait ? 30 : 8));
    let li = 0;
    for (const id of LEGS) {
      const leg = sk.legs[id];
      const p = (((ph + G.off[li]) % 1) + 1) % 1;
      const pp = (((prevPhase + G.off[li]) % 1) + 1) % 1;
      li++;
      let fz;
      let fy = 0;
      let swing = 0;
      if (p < G.duty) {
        fz = stanceLen * (0.5 - p / G.duty);
      } else {
        const q = (p - G.duty) / (1 - G.duty);
        const e = q * q * (3 - 2 * q);
        fz = stanceLen * (-0.5 + e);
        swing = Math.sin(Math.PI * q);
        fy = lift * swing;
      }
      if (this.onStep && mv > 0.3 && p < pp - 0.5) this.onStep(leg, this.gait); // phase wrapped: the foot landed
      fz *= mv;
      // home: under the joint
      let homeZ = leg.fore ? d.bodyLen / 2 + (d.foreReach ?? 0.03) * L : -d.bodyLen / 2 - (d.hindReach ?? 0.0) * L;
      // sitting: hind feet drawn up under the haunches, forelegs upright
      if (this.rear > 0) homeZ += this.rear * L * (leg.fore ? -(d.sitBack ?? 0) : d.sitFwd ?? 0);
      const mx = leg.jx * (d.stance ?? 1.0);
      const mz = homeZ + fz;
      let gy = 0;
      if (!this.flat) {
        const wx = X + (mx * cy + mz * sy) * k;
        const wz = Z + (-mx * sy + mz * cy) * k;
        gy = (ground(wx, wz) - baseY - this.lift) / k;
      }
      const ty = gy + fy;
      if (!leg.init) {
        leg.tz = mz;
        leg.ty = ty;
        leg.init = true;
      }
      leg.tz += (mz - leg.tz) * ka;
      leg.ty += (ty - leg.ty) * ka;

      // into the parent's frame (the body, then the chest)
      unpitch(leg.ty - bodyY, leg.tz - (-d.bodyLen / 2), pitchB, _t);
      let parentPitch = pitchB;
      if (leg.fore) {
        unpitch(_t.y - chestY, _t.z - chestZ, sk.chest.rotation.x, _t);
        parentPitch += sk.chest.rotation.x;
      }
      solveLeg(_t.y, _t.z, leg.L1, leg.L2, leg.fore ? d.foreKneeFwd !== false : false, _ik);
      let a = _ik.a;
      let b = _ik.b;
      // tucked: forelegs off the ground when sitting up; all legs stretched in a leap
      const tuck = leg.fore ? Math.max(this.rear * (d.rearTuck ?? 1), this.air) : this.air;
      if (tuck > 0.001) {
        const ta = leg.fore ? (this.air > this.rear ? -1.1 : d.tuckA ?? -0.5) : 0.9;
        const tb = leg.fore ? (this.air > this.rear ? 0.25 : d.tuckB ?? 1.6) : -0.25;
        a = lerp(a, ta - (leg.fore ? 0 : parentPitch), tuck);
        b = lerp(b, tb, tuck);
      }
      leg.upper.rotation.x = a;
      leg.lower.rotation.x = b;
      leg.foot.rotation.x = -(parentPitch + a + b) * (1 - tuck * 0.5) + swing * 0.9 * mv;
    }

    // ── Head, neck, tail, ears ─────────────────────────────────────────────
    const nod = Math.sin(cyc * 2) * (d.nod ?? 0.05) * mv * (this.gait === 'walk' ? 1 : 0.4);
    const chew = Math.sin(this.time * 8) * 0.05 * this.graze;
    const comp = -(pitchB + sk.chest.rotation.x) * 0.7; // keep looking ahead when the body tilts
    sk.neck.rotation.x = (d.neckRest ?? 0) + this.graze * (d.neckGraze ?? 0.9) - this.alert * (d.neckAlert ?? 0.25) + nod + comp * 0.6 - this.lookPitch * 0.4;
    sk.neck.rotation.y = this.lookYaw * 0.45;
    sk.head.rotation.x = (d.headRest ?? 0) + this.graze * (d.headGraze ?? 0.4) - this.alert * 0.1 + chew + comp * 0.4 - this.lookPitch * 0.6;
    sk.head.rotation.y = this.lookYaw * 0.55;
    sk.head.rotation.z = Math.sin(this.time * 0.7) * 0.05 * (1 - mv);

    if (sk.tail.length) {
      const t = d.tail;
      const swish = Math.sin(this.time * (t.swishRate ?? 2.2)) * (t.swish ?? 0.15) * (1 - this.tailUp);
      const run = smoothstep(1.5, 6, this.speed) * (t.runLift ?? 0.4);
      for (let i = 0; i < sk.tail.length; i++) {
        const b = sk.tail[i];
        if (i === 0) b.rotation.x = (t.rest ?? -1.0) + this.tailUp * (t.upAngle ?? 1.9) + run - pitchB * 0.5 + rock * 0.5;
        else b.rotation.x = (Array.isArray(t.curl) ? t.curl[i] : t.curl ?? 0) * (1 - run * 0.8) + Math.sin(this.time * 3 + i) * 0.03;
        b.rotation.y = swish * (i === 0 ? 1 : 0.6) + Math.sin(this.time * 4.3 - i * 0.8) * (t.flutter ?? 0.04) * mv;
      }
    }

    if (sk.ears.length) {
      this.nextFlick -= dt;
      if (this.nextFlick < 0) {
        this.earFlick = 1;
        this.nextFlick = 1.5 + Math.random() * 5;
        this.flickSide = Math.random() < 0.5 ? 0 : 1;
      }
      this.earFlick = Math.max(0, this.earFlick - dt * 5);
      const e = d.ears;
      for (let i = 0; i < 2; i++) {
        const ear = sk.ears[i];
        const side = i === 0 ? 1 : -1;
        const flick = i === this.flickSide ? Math.sin(this.earFlick * Math.PI) * 0.6 : 0;
        ear.rotation.x = (e.back ?? 0.25) * (1 - this.alert) - (e.alertFwd ?? 0.1) * this.alert + smoothstep(3, 9, this.speed) * (e.runBack ?? 0.5);
        ear.rotation.z = side * ((e.droop ?? 0.2) * (1 - this.alert) + flick * 0.4);
        ear.rotation.y = side * flick * 0.3;
      }
    }
  }
}
