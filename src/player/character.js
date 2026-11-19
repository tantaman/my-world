// A small procedurally-built wanderer with a procedural gait. No assets,
// just capsules and a lot of sines.

import * as THREE from 'three';
import { smoothstep, lerp } from '../noise.js';
import { makeAxe, makeShovel } from '../build/geometry.js';

// Work poses as keyframes over one swing (p = 0..1). Angles in radians:
//   sh = shoulder pitch (negative raises the arm forward), el = elbow,
//   tool = wrist (how the tool sits relative to the forearm),
//   sp = spine lean, inw = arms brought together, drop = crouch.
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
};
const _pose = { sh: 0, el: 0, tool: 0, sp: 0, inw: 0, drop: 0 };
function samplePose(keys, p, out) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [pa, a] = keys[i];
  const [pb, b] = keys[i + 1];
  const t = smoothstep(0, 1, (p - pa) / Math.max(1e-4, pb - pa));
  for (const k in out) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

const M = (hex, rough = 0.85) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.phase = 0;
    this.moveBlend = 0;
    this.runBlend = 0;
    this.airBlend = 0;
    this.time = 0;
    this.stepIndex = 0;
    // called as onFootstep(run 0..1) each time a foot plants
    this.onFootstep = null;

    const skin = M(0xd9a383, 0.7);
    const jacket = M(0x3f5a3a);
    const jacketDark = M(0x2c3f2a);
    const pants = M(0x4d3d2f);
    const boots = M(0x2a1e16);
    const scarf = M(0xd1a23e);
    const pack = M(0x8a6a42);
    const packDark = M(0x5c4630);
    const hair = M(0x3a2618);
    const hat = M(0xb8553a, 0.95);
    const hatDark = M(0x8e3f2b, 0.95);
    const roll = M(0x6c7a8a);

    const cap = (r, len, mat, segs = 8) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, segs), mat);
      m.castShadow = true;
      return m;
    };
    const box = (x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat);
      m.castShadow = true;
      return m;
    };
    const ball = (r, mat, ws = 10, hs = 8) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
      m.castShadow = true;
      return m;
    };
    const group = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    // pelvis / torso
    this.hips = group(this.root, 0, 0.94, 0);
    const pelvis = cap(0.15, 0.1, pants);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.scale.set(1, 1, 0.8);
    this.hips.add(pelvis);

    this.spine = group(this.hips, 0, 0.06, 0);
    this.chest = group(this.spine, 0, 0.0, 0);
    const torso = cap(0.18, 0.26, jacket, 10);
    torso.position.y = 0.26;
    torso.scale.set(1.08, 1, 0.78);
    this.chest.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 12), packDark);
    belt.position.y = 0.04;
    belt.scale.z = 0.8;
    this.chest.add(belt);
    // jacket hem
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.12, 12), jacketDark);
    hem.position.y = 0.1;
    hem.scale.z = 0.8;
    hem.castShadow = true;
    this.chest.add(hem);

    // backpack + bedroll
    const bp = box(0.3, 0.36, 0.17, pack);
    bp.position.set(0, 0.3, -0.19);
    this.chest.add(bp);
    const pocket = box(0.2, 0.14, 0.05, packDark);
    pocket.position.set(0, 0.22, -0.29);
    this.chest.add(pocket);
    // shoulder straps + top flap
    for (const sx of [-1, 1]) {
      const strap = box(0.045, 0.34, 0.03, packDark);
      strap.position.set(sx * 0.1, 0.3, 0.135);
      strap.rotation.x = -0.08;
      this.chest.add(strap);
      const over = box(0.045, 0.03, 0.3, packDark);
      over.position.set(sx * 0.1, 0.47, -0.02);
      this.chest.add(over);
    }
    const flap = box(0.31, 0.08, 0.18, packDark);
    flap.position.set(0, 0.46, -0.19);
    this.chest.add(flap);
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.38, 10), roll);
    bed.rotation.z = Math.PI / 2;
    bed.position.set(0, 0.52, -0.2);
    bed.castShadow = true;
    this.chest.add(bed);

    // neck, scarf, head
    this.neck = group(this.chest, 0, 0.5, 0);
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 6, 12), scarf);
    scarfRing.rotation.x = Math.PI / 2;
    scarfRing.position.y = 0.0;
    scarfRing.castShadow = true;
    this.neck.add(scarfRing);
    this.scarfTail = group(this.neck, 0.06, -0.02, -0.08);
    const tail = box(0.07, 0.22, 0.03, scarf);
    tail.position.y = -0.1;
    this.scarfTail.add(tail);

    this.head = group(this.neck, 0, 0.12, 0);
    const face = ball(0.12, skin);
    face.scale.set(0.92, 1.05, 0.95);
    this.head.add(face);
    const hairM = ball(0.122, hair);
    hairM.scale.set(0.95, 0.88, 0.95);
    hairM.position.set(0, 0.0, -0.014);
    this.head.add(hairM);
    // knitted beanie with a folded cuff and a pom-pom
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.129, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hat);
    beanie.scale.set(1, 1.28, 1);
    beanie.position.set(0, 0.0, -0.008);
    beanie.rotation.x = -0.15;
    beanie.castShadow = true;
    this.head.add(beanie);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.131, 0.133, 0.055, 12, 1, true), hatDark);
    cuff.position.set(0, 0.012, -0.006);
    cuff.rotation.x = -0.15;
    this.head.add(cuff);
    const pom = ball(0.04, hatDark, 6, 5);
    pom.position.set(0, 0.17, -0.035);
    this.head.add(pom);
    const nose = ball(0.022, skin, 6, 5);
    nose.position.set(0, -0.01, 0.115);
    this.head.add(nose);

    // arms
    const arm = (side) => {
      const shoulder = group(this.chest, side * 0.23, 0.42, 0);
      const upper = cap(0.058, 0.2, jacket);
      upper.position.y = -0.14;
      shoulder.add(upper);
      const elbow = group(shoulder, 0, -0.28, 0);
      const fore = cap(0.05, 0.18, jacket);
      fore.position.y = -0.12;
      elbow.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8), jacketDark);
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
    this.hand = group(this.armR.elbow, 0, -0.27, 0);
    this.tools = { axe: makeAxe(), shovel: makeShovel() };
    for (const t of Object.values(this.tools)) {
      t.visible = false;
      this.hand.add(t);
    }
    this.tool = null;
    this.action = null; // { kind, t, dur, loop }
    this.work = 0; // blend into the work pose

    // legs
    const leg = (side) => {
      const hip = group(this.hips, side * 0.095, -0.04, 0);
      const thigh = cap(0.078, 0.28, pants);
      thigh.position.y = -0.2;
      hip.add(thigh);
      const knee = group(hip, 0, -0.42, 0);
      const shin = cap(0.064, 0.28, pants);
      shin.position.y = -0.19;
      knee.add(shin);
      const ankle = group(knee, 0, -0.43, 0);
      const bootTop = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.07, 0.12, 8), boots);
      bootTop.position.y = 0.04;
      bootTop.castShadow = true;
      ankle.add(bootTop);
      const foot = box(0.11, 0.08, 0.24, boots);
      foot.position.set(0, -0.03, 0.045);
      ankle.add(foot);
      return { hip, knee, ankle };
    };
    this.legL = leg(1);
    this.legR = leg(-1);

    this.root.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });
  }

  setTool(name) {
    this.tool = this.tools[name] ? name : null;
    for (const k in this.tools) this.tools[k].visible = k === this.tool;
  }

  // Start a work animation: 'chop' | 'chopLow' | 'dig' | 'bend'.
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

  // speed: horizontal m/s, grounded: bool, vy: vertical velocity, turn: rad/s
  update(dt, speed, grounded, vy, turn) {
    this.time += dt;
    const moving = smoothstep(0.15, 1.5, speed);
    const running = smoothstep(4.0, 6.5, speed);
    const k = 1 - Math.exp(-dt * 10);
    this.moveBlend = lerp(this.moveBlend, moving, k);
    this.runBlend = lerp(this.runBlend, running, k);
    this.airBlend = lerp(this.airBlend, grounded ? 0 : 1, 1 - Math.exp(-dt * 12));

    const stride = lerp(1.35, 2.3, this.runBlend);
    this.phase += (speed / stride) * Math.PI * dt;
    if (this.moveBlend < 0.02) this.phase = lerp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, k);

    const mb = this.moveBlend;
    const rb = this.runBlend;
    const ab = this.airBlend;

    // A foot plants each time a leg reaches the front of its swing.
    const step = Math.floor((this.phase - Math.PI / 2) / Math.PI);
    if (step > this.stepIndex && grounded && mb > 0.3 && this.onFootstep) this.onFootstep(rb);
    this.stepIndex = step;

    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    const legAmp = lerp(0.48, 0.82, rb) * mb;
    const kneeAmp = lerp(0.7, 1.4, rb) * mb;
    const armAmp = lerp(0.35, 0.8, rb) * mb;

    // Legs: negative x rotation swings a leg forward.
    const legPose = (legObj, sw, cw) => {
      legObj.hip.rotation.x = -sw * legAmp - ab * 0.55;
      const knee = Math.max(0, cw) * kneeAmp + 0.08 * mb + ab * 0.9;
      legObj.knee.rotation.x = knee;
      legObj.ankle.rotation.x = -knee * 0.25 + sw * 0.15 * mb;
    };
    legPose(this.legL, s, c);
    legPose(this.legR, -s, -c);

    // Arms swing opposite to legs, elbows bend more when running.
    const breathe = Math.sin(this.time * 1.8) * (1 - mb);
    this.armL.shoulder.rotation.x = s * armAmp - ab * 0.9;
    this.armR.shoulder.rotation.x = -s * armAmp - ab * 0.9;
    this.armL.shoulder.rotation.z = 0.08 + ab * 0.5 + breathe * 0.02;
    this.armR.shoulder.rotation.z = -0.08 - ab * 0.5 - breathe * 0.02;
    this.armL.elbow.rotation.x = -(0.15 + rb * 1.05 + mb * 0.15) - ab * 0.4;
    this.armR.elbow.rotation.x = -(0.15 + rb * 1.05 + mb * 0.15) - ab * 0.4;

    // Body bob, lean and twist.
    const bob = lerp(0.035, 0.07, rb) * mb;
    this.hips.position.y = 0.94 - bob * (1 - Math.abs(c)) - rb * 0.04 + breathe * 0.004;
    this.hips.rotation.y = s * 0.12 * mb;
    this.spine.rotation.y = -s * 0.2 * mb;
    this.spine.rotation.x = 0.04 + mb * 0.06 + rb * 0.2 - ab * 0.1;
    this.chest.scale.y = 1 + breathe * 0.012;
    this.head.rotation.x = -this.spine.rotation.x * 0.6;
    this.root.rotation.z = lerp(this.root.rotation.z, THREE.MathUtils.clamp(-turn * 0.06 * speed * 0.2, -0.25, 0.25), k);

    // Scarf tail trails behind.
    this.scarfTail.rotation.x = -0.3 - speed * 0.12 - Math.abs(Math.sin(this.time * 7)) * 0.05 * mb - (vy > 0 ? 0.2 : -0.3) * ab;

    // How the tool rides when you're just carrying it.
    let toolRest = this.tool === 'shovel' ? 2.75 : this.tool === 'axe' ? -0.3 : 0;
    if (this.tool === 'shovel') this.armR.elbow.rotation.x = -0.35;
    this.hand.rotation.x = toolRest;

    // Work poses blend over the walk.
    const a = this.action;
    if (a) {
      a.t += dt;
      if (a.t >= a.dur) {
        if (a.loop) a.t -= a.dur;
        else this.action = null;
      }
    }
    this.work = lerp(this.work, a ? 1 : 0, 1 - Math.exp(-dt * (a ? 18 : 8)));
    if (this.work < 0.01) return;
    const pose = samplePose(POSES[a ? a.kind : this._lastKind || 'chop'], a ? Math.min(1, a.t / a.dur) : 0, _pose);
    if (a) this._lastKind = a.kind;
    const w = this.work;
    const two = this.tool !== null || (a && a.kind === 'bend');
    const blend = (cur, v) => cur + (v - cur) * w;
    this.armR.shoulder.rotation.x = blend(this.armR.shoulder.rotation.x, pose.sh);
    this.armR.elbow.rotation.x = blend(this.armR.elbow.rotation.x, pose.el);
    this.armR.shoulder.rotation.z = blend(this.armR.shoulder.rotation.z, pose.inw);
    if (two) {
      this.armL.shoulder.rotation.x = blend(this.armL.shoulder.rotation.x, pose.sh * 0.96);
      this.armL.elbow.rotation.x = blend(this.armL.elbow.rotation.x, pose.el - 0.2);
      this.armL.shoulder.rotation.z = blend(this.armL.shoulder.rotation.z, -pose.inw);
    }
    this.hand.rotation.x = blend(toolRest, pose.tool);
    this.spine.rotation.x = blend(this.spine.rotation.x, pose.sp);
    this.spine.rotation.y *= 1 - w;
    this.head.rotation.x = -this.spine.rotation.x * 0.5;
    const drop = pose.drop * w;
    this.hips.position.y -= drop;
    for (const leg of [this.legL, this.legR]) {
      leg.hip.rotation.x -= drop * 2.6;
      leg.knee.rotation.x += drop * 5.2;
      leg.ankle.rotation.x -= drop * 2.6;
    }
  }
}
