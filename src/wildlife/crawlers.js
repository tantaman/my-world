// Snakes and salamanders: a chain of spine bones whose skin is blended
// between neighbours so the body bends smoothly, and which follows the path
// its head took, the way a real snake's body pours along behind it. The head
// weaves from side to side as it goes; salamanders add four splayed legs.

import * as THREE from 'three';
import { RigBuilder, lin, at, along, ellipsoid, stick } from './rig.js';
import { clamp, lerp } from '../noise.js';
import { wrapAngle as wrap } from '../core/geom.js';

const ss = THREE.MathUtils.smoothstep;
const mix = (a, b, t) => new THREE.Color().copy(a).lerp(b, Math.min(1, Math.max(0, t)));

// A tube from z = 0 back to z = -len with a radius profile r(t), t = 0..1,
// skinned across the spine bones.
function spineTube(r, spine, seg, len, radius, color, { flat = 0.8, radial = 10, rings = 3 } = {}) {
  const n = spine.length;
  const g = new THREE.CylinderGeometry(1, 1, len, radial, (n - 1) * rings, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -len / 2);
  r.part(spine[0], g, {
    deform: (p) => {
      const t = clamp(-p.z / len, 0, 1);
      const rad = radius(t);
      p.x *= rad;
      p.y *= rad * flat;
    },
    color: (p, nn, w) => color(clamp(-p.z / len, 0, 1), Math.atan2(p.x, p.y), p),
    weights: (w) => {
      const f = clamp(-w.z / seg, 0, n - 1 - 1e-4);
      const i = Math.floor(f);
      const t = f - i;
      return [spine[i], 1 - t, spine[i + 1], t];
    },
  });
  // close the tail end
  r.part(spine[n - 1], ellipsoid(radius(1) + 1e-4, (radius(1) + 1e-4) * flat, radius(1) * 2 + 1e-4, 5, 3), { matrix: at(0, 0, 0), color: color(1, 0, { x: 0, y: 0, z: 0 }).clone() });
}

function spineBones(r, n, seg, y) {
  const spine = [];
  let prev = null;
  for (let i = 0; i < n; i++) {
    const b = i === 0 ? r.bone(null, 0, y, 0, 's0') : r.bone(prev, 0, 0, -seg, `s${i}`);
    spine.push(b);
    prev = b;
  }
  return spine;
}

// ── Snakes ─────────────────────────────────────────────────────────────────
// variant: 'garter' (striped, common) or 'rattler' (banded, with a rattle)
export function buildSnake(seed, variant = 'garter') {
  const r = new RigBuilder(seed);
  const rattler = variant === 'rattler';
  const len = rattler ? 1.05 : 0.75;
  const thick = rattler ? 0.034 : 0.022; // a touch thicker than life: they'd vanish otherwise
  const n = 14;
  const seg = len / (n - 1);
  const spine = spineBones(r, n, seg, thick * 0.8);
  const head = r.bone(spine[0], 0, 0, 0, 'head');
  const tongue = r.bone(head, 0, -thick * 0.15, thick * 2.6, 'tongue');
  const radius = (t) => thick * (t < 0.06 ? 0.75 + t * 4 : 1 - ss(t, 0.55, 1) * (rattler ? 0.55 : 0.85));
  const base = lin(rattler ? 0x8a7a5c : 0x2a2e1e);
  const stripe = lin(rattler ? 0x2a2018 : 0xd9c25a);
  const belly = lin(rattler ? 0xd8c9a6 : 0xc8c890);
  const color = (t, a, p) => {
    const aa = Math.abs(a);
    if (aa > 2.3) return belly;
    if (rattler) {
      // dark chevrons, and a black tail
      if (t > 0.86) return stripe;
      const band = ((t * 20 - aa * 0.35) % 1 + 1) % 1;
      return band < 0.3 ? stripe : mix(base, lin(0x6a6050), aa / 3);
    }
    if (aa < 0.32 || Math.abs(aa - 1.75) < 0.22) return stripe;
    return base;
  };
  spineTube(r, spine, seg, len, radius, color, { flat: 0.75 });
  // head: wedge-shaped, the rattler's broad behind the eyes
  r.part(head, ellipsoid(thick * (rattler ? 1.35 : 1.0), thick * 0.65, thick * 2.0, 8, 5), { matrix: at(0, 0, thick * 1.2), color: (p, nn) => (nn.y < -0.3 ? belly : rattler ? mix(base, stripe, 0.2) : base) });
  r.mirror((side) => [head, ellipsoid(thick * 0.22, thick * 0.22, thick * 0.22, 5, 3), { matrix: at(side * thick * 0.75, thick * 0.25, thick * 1.8), color: lin(0x0a0806), grain: 0 }]);
  r.part(tongue, stick(thick * 0.08, thick * 0.06, 3), { matrix: along(0, 0, 0, 0, 0, thick * 1.6, 1, 1), color: lin(0xb02020), grain: 0 });
  if (rattler) {
    for (let i = 0; i < 4; i++) {
      r.part(spine[n - 1], ellipsoid(thick * 0.42, thick * 0.32, thick * 0.3, 6, 4), { matrix: at(0, 0, -thick * (0.3 + i * 0.5)), color: lin(0xc9b48a) });
    }
  }
  const mesh = r.build({ shadow: false });
  return { mesh, spine, head, tongue, seg, len, thick, rattler };
}

// ── Salamanders ────────────────────────────────────────────────────────────
// variant: 'spotted' (black with yellow spots) or 'eft' (a bright orange newt)
export function buildSalamander(seed, variant = 'spotted') {
  const r = new RigBuilder(seed);
  const eft = variant === 'eft';
  const len = eft ? 0.085 : 0.17;
  const thick = eft ? 0.006 : 0.012;
  const n = 7;
  const seg = len / (n - 1);
  const spine = spineBones(r, n, seg, thick * 1.4);
  const head = r.bone(spine[0], 0, 0, 0, 'head');
  const radius = (t) => thick * (t < 0.08 ? 0.85 : t < 0.45 ? 1.0 : 1 - ss(t, 0.45, 1) * 0.85);
  const base = lin(eft ? 0xd2541c : 0x1c1d22);
  const spot = lin(eft ? 0xb02810 : 0xe8c21e);
  const belly = lin(eft ? 0xe07a3a : 0x55565c);
  const color = (t, a, p) => {
    const aa = Math.abs(a);
    if (aa > 2.2) return belly;
    // two rows of spots along the back
    const row = Math.abs(aa - 0.7) < 0.35;
    const k = Math.floor(t * 9 + (a > 0 ? 0.5 : 0));
    if (row && (k % 2 === 0) && t > 0.04 && t < 0.88) return spot;
    return base;
  };
  spineTube(r, spine, seg, len, radius, color, { flat: 0.7, radial: 10, rings: 2 });
  r.part(head, ellipsoid(thick * 1.05, thick * 0.65, thick * 1.5, 8, 5), { matrix: at(0, 0, thick * 0.9), color: (p, nn) => (nn.y < -0.3 ? belly : base) });
  r.mirror((side) => [head, ellipsoid(thick * 0.3, thick * 0.3, thick * 0.3, 5, 3), { matrix: at(side * thick * 0.7, thick * 0.3, thick * 1.2), color: lin(0x050404), grain: 0 }]);
  // splayed legs at the shoulders and hips
  const legs = [];
  for (const [si, front] of [[1, true], [3, false]]) {
    for (const side of [1, -1]) {
      const leg = r.bone(spine[si], side * thick * 0.8, -thick * 0.2, front ? seg * 0.3 : -seg * 0.1, 'leg');
      r.part(leg, stick(thick * 0.32, thick * 0.25, 4), { matrix: along(0, 0, 0, side * thick * 2.2, -thick * 1.4, front ? thick * 0.5 : -thick * 0.3, 1, 1), color: base });
      r.part(leg, ellipsoid(thick * 0.4, thick * 0.15, thick * 0.4, 5, 3), { matrix: at(side * thick * 2.2, -thick * 1.4, front ? thick * 0.5 : -thick * 0.3), color: belly });
      legs.push({ bone: leg, side, front });
    }
  }
  const mesh = r.build({ shadow: false });
  return { mesh, spine, head, legs, seg, len, thick };
}

// Drives a crawler along the ground. The brain sets speed and moves the mesh
// (with `meander` added to its heading); this keeps the trail and bends the
// spine to lie along it, flat on the terrain.
export class Crawler {
  constructor(rig) {
    this.rig = rig;
    this.mesh = rig.mesh;
    this.speed = 0;
    this.wave = Math.random() * 6;
    this.meander = 0;
    this.time = 0;
    this.raise = 0; // 0..1 head and neck lifted (a snake on guard)
    this.rattle = 0; // 0..1
    this.trail = []; // [x, z, ...] most recent first
    this.legPhase = 0;
  }

  // Lay the body out straight behind the head (on spawn).
  reset() {
    const m = this.mesh;
    const s = Math.sin(m.rotation.y);
    const c = Math.cos(m.rotation.y);
    this.trail.length = 0;
    const L = this.rig.len * 1.3;
    for (let d = 0; d <= L; d += this.rig.seg * 0.5) this.trail.push(m.position.x - s * d, m.position.z - c * d);
  }

  update(dt, ground) {
    const rig = this.rig;
    const m = this.mesh;
    this.time += dt;
    // the head weaves: a wave travelling down the body at the speed it moves
    const wl = rig.len * 0.55;
    this.wave += (this.speed / wl) * Math.PI * 2 * dt;
    this.meander = Math.sin(this.wave) * (rig.legs ? 0.35 : 0.6) * clamp(this.speed * 8, 0, 1);

    const tr = this.trail;
    const step = rig.seg * 0.5;
    if (!tr.length) this.reset();
    if (Math.hypot(m.position.x - tr[0], m.position.z - tr[1]) > step) {
      tr.unshift(m.position.x, m.position.z);
      const maxPts = Math.ceil((rig.len * 1.4) / step) * 2;
      if (tr.length > maxPts) tr.length = maxPts;
    }
    const hy = ground(m.position.x, m.position.z);
    m.position.y = hy;

    // walk the trail: bone i sits i·seg behind the head along it
    const n = rig.spine.length;
    let prevYaw = m.rotation.y;
    let prevPitch = 0;
    let px = m.position.x;
    let pz = m.position.z;
    let py = hy;
    let ti = 0; // trail point we're heading toward
    let left = 0;
    for (let i = 0; i < n; i++) {
      // find the point seg further along the trail
      let need = rig.seg;
      let qx = px;
      let qz = pz;
      while (need > 0 && ti < tr.length) {
        const ax = tr[ti];
        const az = tr[ti + 1];
        const d = Math.hypot(ax - qx, az - qz);
        if (d >= need) {
          qx += ((ax - qx) / d) * need;
          qz += ((az - qz) / d) * need;
          need = 0;
        } else {
          qx = ax;
          qz = az;
          need -= d;
          ti += 2;
        }
      }
      left = need;
      if (left > 0) {
        // ran off the end of the trail: carry straight on
        qx -= Math.sin(prevYaw) * left;
        qz -= Math.cos(prevYaw) * left;
      }
      const yaw = Math.atan2(px - qx, pz - qz);
      const qy = ground(qx, qz);
      const pitch = -Math.atan2(py - qy, rig.seg);
      const b = rig.spine[i];
      b.rotation.y = i === 0 ? wrap(yaw - m.rotation.y) : wrap(yaw - prevYaw);
      b.rotation.x = i === 0 ? pitch : pitch - prevPitch;
      prevYaw = yaw;
      prevPitch = pitch;
      px = qx;
      pz = qz;
      py = qy;
    }

    // the head looks where it's going, not along the neck
    rig.head.rotation.y = -rig.spine[0].rotation.y * 0.7;
    // on guard: the front of the body lifts into an S, head level
    if (this.raise > 0.001) {
      const s = rig.spine;
      s[0].rotation.x += -0.9 * this.raise;
      s[1].rotation.x += 0.5 * this.raise;
      s[2].rotation.x += 0.4 * this.raise;
      rig.head.rotation.x = 0.85 * this.raise;
    } else rig.head.rotation.x = 0;
    if (rig.tongue) {
      const flick = Math.sin(this.time * 1.7) > 0.6 ? 1 : 0.001;
      rig.tongue.scale.setScalar(lerp(rig.tongue.scale.x, flick, 1 - Math.exp(-dt * 30)));
      rig.tongue.rotation.x = Math.sin(this.time * 40) * 0.25;
    }
    if (rig.rattler) {
      const tail = rig.spine[n - 1];
      tail.rotation.x += -0.9 * this.rattle;
      tail.rotation.y += Math.sin(this.time * 90) * 0.25 * this.rattle;
    }
    if (rig.legs) {
      this.legPhase += (this.speed / (rig.len * 0.3)) * dt;
      for (const leg of rig.legs) {
        const diag = (leg.side > 0) === leg.front ? 0 : 0.5;
        const p = (this.legPhase + diag) * Math.PI * 2;
        const swing = Math.sin(p) * 0.6 * clamp(this.speed * 30, 0, 1);
        leg.bone.rotation.y = leg.side * swing;
        leg.bone.rotation.z = leg.side * Math.max(0, Math.cos(p)) * 0.4 * clamp(this.speed * 30, 0, 1);
      }
    }
  }
}
