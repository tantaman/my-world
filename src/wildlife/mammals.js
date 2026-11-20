// What each mammal looks like: its proportions (which the gait engine walks
// with) and the parts hung on its bones. Everything is a handful of
// ellipsoids, tapered limbs and sticks with colour baked in, kept to the
// level of detail that survives a few dozen art pixels: a clear silhouette,
// the right colours in the right places (a deer's white flag, a fox's black
// stockings, the pale rump of an elk), and the odd hero detail like antlers.
//
// Each species exports { dims, build(seed, variant) -> { mesh, sk, dims } }.
// The parts they are made of are exported too, so a four-legged animal that
// lives elsewhere (a horse, src/mounts/) is made the same way.

import * as THREE from 'three';
import { RigBuilder, lin, at, along, ellipsoid, limb, stick, cone } from './rig.js';
import { quadSkeleton } from './quadruped.js';

const ss = THREE.MathUtils.smoothstep;
// (a fresh colour each time, so mixes can nest)
export const mix = (a, b, t) => new THREE.Color().copy(a).lerp(b, Math.min(1, Math.max(0, t)));
function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// ── Shared body parts ──────────────────────────────────────────────────────
// Torso: one smooth body lofted along a profile from the rump to the chest,
// so it reads as a single animal rather than a string of beads.
//   prof: [[t, halfWidth, halfHeight, yCentre], ...] with t = 0 at the rump
//   and 1 at the brisket; z0, z1: where those are, along the body (model z).
// Skinned across the hips and the shoulders so the back flexes in a gallop.
export function torso(r, sk, d, o) {
  const [ws, hs] = o.segs ?? [14, 12];
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.rotateX(Math.PI / 2); // poles along z
  const pos = g.attributes.position;
  const prof = o.prof;
  const sample = (t) => {
    let i = 0;
    while (i < prof.length - 2 && t > prof[i + 1][0]) i++;
    const a = prof[i];
    const b = prof[i + 1];
    const u = ss((t - a[0]) / (b[0] - a[0]), 0, 1);
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
  };
  const z0 = o.z0 + d.bodyLen / 2; // in the body bone's space (pivot at the hips)
  const z1 = o.z1 + d.bodyLen / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (z + 1) / 2;
    // blunt the ends: a stretched sphere is too pointy for a body
    const blunt = Math.pow(Math.max(0.02, 1 - z * z), -0.22);
    const [w, h, yc] = sample(t);
    pos.setXYZ(i, x * w * blunt, y * h * blunt + yc, z0 + t * (z1 - z0));
  }
  g.computeVertexNormals();
  r.part(sk.body, g, {
    color: o.color,
    weights: (w) => {
      const t = ss(w.z, -d.bodyLen * 0.2, d.bodyLen * 0.3); // model z: hips at -L/2, shoulders at +L/2
      return [sk.body, 1 - t, sk.chest, t];
    },
  });
}

// Legs: a muscle and a tapered limb above, a thin limb below, a joint knob,
// and a foot (hoof or paw) on the foot bone.
export function legs(r, sk, o) {
  for (const leg of Object.values(sk.legs)) {
    const s = leg.fore ? o.fore : o.hind;
    const col = s.color ?? o.color;
    if (s.muscle) {
      const [mx, my, mz] = s.muscle;
      r.part(leg.upper, ellipsoid(mx, my, mz, 8, 6), { matrix: at(0, -leg.L1 * (s.muscleY ?? 0.3), s.muscleZ ?? 0), color: s.muscleColor ?? col });
    }
    r.part(leg.upper, limb(s.upper[0], s.upper[1], leg.L1, 6), { color: col });
    r.part(leg.lower, ellipsoid(s.upper[1] * 1.05, s.upper[1] * 1.05, s.upper[1] * 1.05, 6, 4), { color: col });
    r.part(leg.lower, limb(s.lower[0], s.lower[1], leg.L2, 5), { color: s.lowerColor ?? col });
    o.foot(r, leg);
  }
}

export function hooves(color, rad, h) {
  return (r, leg) => {
    const g = new THREE.CylinderGeometry(rad * 0.75, rad, h, 6);
    g.translate(0, h / 2, rad * 0.25);
    r.part(leg.foot, g, { color });
  };
}

function paws(color, w, h, len) {
  return (r, leg) => r.part(leg.foot, ellipsoid(w, h, len, 7, 5), { matrix: at(0, h * 0.8, len * 0.45), color });
}

// A tail along its bones: tapered segments, optionally bushy in the middle.
export function tail(r, sk, o) {
  const n = sk.tail.length;
  const seg = sk.tailSeg;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const rad = (t) => o.r0 + (o.r1 - o.r0) * t + (o.bush ?? 0) * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const g = new THREE.CylinderGeometry(rad(t1), rad(t0), seg * 1.15, o.segs ?? 6, 1);
    g.rotateX(-Math.PI / 2); // along -z
    g.translate(0, 0, -seg / 2);
    if (o.flat || o.flatX) g.scale(o.flatX ?? 1, o.flat ?? 1, 1);
    r.part(sk.tail[i], g, { color: (p, nn, w) => o.color(p, nn, w, t0 + (t1 - t0) * (-p.z / seg)) });
    if (i < n - 1 || o.tipBall) r.part(sk.tail[i], ellipsoid(rad(t1), rad(t1) * (o.flat ?? 1), rad(t1), 6, 4), { matrix: at(0, 0, -seg), color: (p, nn, w) => o.color(p, nn, w, t1) });
  }
}

export function eyes(r, head, x, y, z, rad, color = lin(0x0d0b0a)) {
  r.mirror((side) => [head, ellipsoid(rad, rad, rad * 0.8, 6, 4), { matrix: at(side * x, y, z), color, grain: 0 }]);
}

// Ears on the ear bones: a flattened cone, pale inside.
export function ears(r, sk, o) {
  sk.ears.forEach((ear, i) => {
    const side = i === 0 ? 1 : -1;
    const g = cone(o.w, o.len, 6);
    g.scale(1, 1, o.thin ?? 0.45);
    r.part(ear, g, {
      matrix: at(0, 0, 0, o.tilt ?? -0.2, 0, -side * (o.out ?? 0.5)),
      color: (p, n, w) => (n.z > 0.3 && o.inner ? o.inner : o.color),
    });
    if (o.tuft) r.part(ear, stick(0.006, 0.002, 3), { matrix: along(0, o.len * 0.95, 0, -side * 0.35, 1, 0, 1, 1).multiply(new THREE.Matrix4().makeScale(1, o.tuft, 1)), color: lin(0x111111), grain: 0 });
  });
}

// One antler tine (or beam segment) from a to b.
function tine(r, bone, a, b, r0, r1, color) {
  r.part(bone, stick(r0, r1, 4), { matrix: along(a[0], a[1], a[2], b[0] - a[0], b[1] - a[1], b[2] - a[2], 1, 1), color, grain: 0.1 });
}
// A curving beam through points, with tines sprouting from some of them.
function beam(r, bone, pts, rad, color, tines = []) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / (pts.length - 1);
    tine(r, bone, pts[i], pts[i + 1], rad * (1 - t * 0.55), rad * (1 - (t + 1 / (pts.length - 1)) * 0.55), color);
  }
  for (const [i, dx, dy, dz, tr] of tines) {
    const p = pts[i];
    tine(r, bone, p, [p[0] + dx, p[1] + dy, p[2] + dz], tr ?? rad * 0.6, (tr ?? rad * 0.6) * 0.35, color);
  }
}

// Tapered neck from the neck bone toward the head.
export function neck(r, sk, d, r0, r1, depth, color, extraZ = 0) {
  const n = d.neck;
  r.part(sk.neck, stick(r0, r1, 8), {
    matrix: along(0, -r0 * 0.3, -extraZ, 0, Math.cos(n.angle) * (n.len + r0 * 0.3), Math.sin(n.angle) * (n.len + r0 * 0.3) + extraZ, 1, depth),
    color,
  });
}

// ── White-tailed deer ──────────────────────────────────────────────────────
const DEER = {
  hipH: 0.8, shoulderH: 0.8, bodyLen: 0.74, hipW: 0.09, shW: 0.085,
  hindU: 0.42, hindL: 0.44, foreU: 0.38, foreL: 0.46,
  neck: { y: 0.08, z: 0.1, len: 0.4, angle: 0.75 },
  tail: { y: 0.1, z: -0.06, len: 0.24, segs: 2, rest: -1.15, upAngle: 2.4, curl: -0.1, swish: 0.25, swishRate: 3.0, runLift: 0.2 },
  ears: { x: 0.045, y: 0.07, z: -0.03, back: 0.15, droop: 0.55, runBack: 0.7 },
  trotAt: 1.6, runAt: 3.2, run: 'gallop', gaitRef: { walk: 1.2, trot: 2.2, gallop: 9 },
  neckGraze: 2.05, headGraze: -0.8, grazePitch: 0.13, neckAlert: 0.25, headRest: 0.25, nod: 0.06,
  rearAngle: 0.4,
};

export const deer = {
  dims: DEER,
  build(seed, v = {}) {
    const r = new RigBuilder(seed);
    const d = DEER;
    const sk = quadSkeleton(r, d);
    const coat = lin(v.coat ?? 0x8c6a4a);
    const dark = lin(0x4f4033);
    const white = lin(0xe9e4da);
    const leg = lin(0x8a6c50);
    const hoof = lin(0x221d19);
    const fur = (p, n, w) => {
      const c = mix(white, coat, ss(n.y, -0.75, -0.3));
      if (n.y > 0.65) c.lerp(dark, (n.y - 0.65) * 0.8);
      return c;
    };
    torso(r, sk, d, { z0: -0.6, z1: 0.52, prof: [[0, 0.11, 0.15, 0.02], [0.2, 0.15, 0.19, 0.0], [0.5, 0.17, 0.2, -0.04], [0.8, 0.15, 0.22, -0.05], [1, 0.11, 0.17, -0.03]], color: fur });
    legs(r, sk, {
      color: leg,
      hind: { upper: [0.05, 0.03], lower: [0.026, 0.019], muscle: [0.075, 0.2, 0.12], muscleY: 0.28, muscleZ: -0.01, muscleColor: fur },
      fore: { upper: [0.05, 0.028], lower: [0.024, 0.018], muscle: [0.06, 0.16, 0.09], muscleY: 0.25, muscleColor: fur },
      foot: hooves(hoof, 0.024, 0.05),
    });
    neck(r, sk, d, 0.1, 0.065, 1.4, (p, n, w) => (n.z > 0.5 && p.y > 0.55 && p.y < 0.85 ? white : fur(p, n, w)));
    r.part(sk.neck, ellipsoid(0.11, 0.13, 0.12, 8, 6), { matrix: at(0, -0.02, -0.03), color: fur });
    const head = sk.head;
    r.part(head, ellipsoid(0.07, 0.075, 0.1), { matrix: at(0, 0.0, 0.03), color: (p, n) => mix(coat, dark, n.y * 0.6) });
    r.part(head, stick(0.05, 0.03, 7), {
      matrix: along(0, -0.02, 0.06, 0, -0.04, 0.17, 1, 1.1),
      color: (p, n, w) => (p.y > 0.8 ? lin(0x1a1614) : p.y > 0.55 ? white : mix(coat, dark, 0.3)),
    });
    r.part(head, ellipsoid(0.03, 0.025, 0.02, 6, 4), { matrix: at(0, -0.06, 0.23), color: lin(0x151210), grain: 0 });
    eyes(r, head, 0.055, 0.02, 0.07, 0.014);
    ears(r, sk, { w: 0.045, len: 0.14, thin: 0.35, tilt: -0.1, out: 0.7, color: coat, inner: lin(0xd8cfc2) });
    if (v.buck) {
      const ac = lin(0xc9b48e);
      r.mirror((side) => {
        // (build both beams through mirror's callback, then add nothing more)
        beam(r, head, [[side * 0.035, 0.07, 0.02], [side * 0.1, 0.16, -0.01], [side * 0.15, 0.22, 0.07], [side * 0.13, 0.25, 0.17], [side * 0.07, 0.24, 0.23]], 0.016, ac, [
          [0, 0, 0.09, 0.02, 0.009],
          [1, side * 0.01, 0.13, 0.02],
          [2, 0, 0.12, 0.0],
          [3, -side * 0.01, 0.09, 0.0],
        ]);
        return [head, ellipsoid(0.018, 0.012, 0.018, 5, 3), { matrix: at(side * 0.035, 0.065, 0.02), color: ac }];
      });
    }
    tail(r, sk, { r0: 0.045, r1: 0.025, bush: 0.012, flat: 0.45, segs: 7, color: (p, n, w, t) => (n.y < 0.2 ? white : mix(coat, lin(0x5a3b22), t)) });
    const mesh = r.build();
    return { mesh, sk, dims: d };
  },
};

// ── Elk ────────────────────────────────────────────────────────────────────
const ELK = {
  hipH: 1.14, shoulderH: 1.16, bodyLen: 1.1, hipW: 0.13, shW: 0.12,
  hindU: 0.6, hindL: 0.6, foreU: 0.56, foreL: 0.64,
  neck: { y: 0.1, z: 0.14, len: 0.6, angle: 0.85 },
  tail: { y: 0.16, z: -0.08, len: 0.12, segs: 1, rest: -1.3, upAngle: 0.8, swish: 0.15 },
  ears: { x: 0.06, y: 0.08, z: -0.05, back: 0.2, droop: 0.6, runBack: 0.5 },
  trotAt: 1.7, runAt: 4.2, run: 'gallop', gaitRef: { walk: 1.3, trot: 3, gallop: 10 },
  neckGraze: 2.0, headGraze: -0.65, grazePitch: 0.12, neckAlert: 0.3, headRest: 0.3, nod: 0.05,
};

export const elk = {
  dims: ELK,
  build(seed, v = {}) {
    const r = new RigBuilder(seed);
    const d = ELK;
    const sk = quadSkeleton(r, d);
    const body = lin(0xb38c5e);
    const mane = lin(0x4a3322);
    const rumpC = lin(0xe5cf9c);
    const legC = lin(0x3e2b1d);
    const fur = (p, n, w) => {
      // dark belly, pale rump patch, darker toward the neck
      let c = mix(mix(mane, body, 0.4), body, ss(n.y, -0.8, -0.2));
      if (w.z < -0.6 && n.z < -0.35) c = mix(c, rumpC, ss(-n.z, 0.35, 0.75));
      if (w.z > 0.35) c.lerp(mane, ss(w.z, 0.35, 0.65) * 0.8);
      return c;
    };
    torso(r, sk, d, { z0: -0.85, z1: 0.78, prof: [[0, 0.16, 0.22, 0.03], [0.2, 0.22, 0.27, 0.0], [0.5, 0.26, 0.3, -0.04], [0.8, 0.24, 0.33, -0.04], [1, 0.18, 0.27, -0.04]], color: fur });
    legs(r, sk, {
      color: legC,
      hind: { upper: [0.08, 0.045], lower: [0.04, 0.03], muscle: [0.11, 0.3, 0.17], muscleY: 0.27, muscleColor: fur },
      fore: { upper: [0.075, 0.042], lower: [0.037, 0.028], muscle: [0.09, 0.24, 0.13], muscleY: 0.25, muscleColor: fur },
      foot: hooves(lin(0x1c1814), 0.037, 0.07),
    });
    // a shaggy mane hangs under the neck
    neck(r, sk, d, 0.16, 0.11, 1.45, mane, 0.04);
    r.part(sk.neck, ellipsoid(0.17, 0.2, 0.17, 8, 6), { matrix: at(0, -0.02, -0.04), color: mane });
    r.part(sk.neck, ellipsoid(0.11, 0.22, 0.11, 7, 5), { matrix: at(0, 0.22, 0.3, -0.75), color: mane });
    const head = sk.head;
    r.part(head, ellipsoid(0.1, 0.11, 0.15), { matrix: at(0, 0, 0.04), color: mane });
    r.part(head, stick(0.085, 0.055, 7), { matrix: along(0, -0.02, 0.1, 0, -0.08, 0.3, 1, 1.2), color: (p) => (p.y > 0.85 ? lin(0x1a1410) : mix(mane, body, 0.35)) });
    eyes(r, head, 0.075, 0.03, 0.09, 0.016);
    ears(r, sk, { w: 0.05, len: 0.15, thin: 0.4, tilt: -0.1, out: 0.7, color: mix(mane, body, 0.5), inner: lin(0xcdb894) });
    if (v.bull) {
      const ac = lin(0x8f7558);
      const tipC = lin(0xe6dcc6);
      for (const side of [1, -1]) {
        const s = side;
        const pts = [[s * 0.06, 0.08, -0.02], [s * 0.18, 0.28, -0.2], [s * 0.3, 0.48, -0.42], [s * 0.34, 0.66, -0.62], [s * 0.28, 0.82, -0.8]];
        beam(r, head, pts, 0.036, ac, []);
        // brow, bez, trez, royal (long), sur-royal: forward and up
        const tines = [[0, s * 0.03, 0.12, 0.3], [1, s * 0.04, 0.16, 0.26], [2, s * 0.02, 0.3, 0.2], [3, 0, 0.24, 0.12], [4, -s * 0.02, 0.14, 0.04]];
        tines.forEach(([i, dx, dy, dz]) => {
          const p = pts[i];
          tine(r, head, p, [p[0] + dx, p[1] + dy, p[2] + dz], 0.02, 0.007, (q) => mix(ac, tipC, q.y));
        });
      }
    }
    tail(r, sk, { r0: 0.04, r1: 0.025, color: () => rumpC });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Moose ──────────────────────────────────────────────────────────────────
const MOOSE = {
  hipH: 1.28, shoulderH: 1.42, bodyLen: 1.15, hipW: 0.13, shW: 0.14,
  hindU: 0.68, hindL: 0.66, foreU: 0.7, foreL: 0.78,
  neck: { y: 0.1, z: 0.16, len: 0.52, angle: 1.05 },
  tail: { y: 0.15, z: -0.1, len: 0.08, segs: 1, rest: -1.3, upAngle: 0.5, swish: 0.1 },
  ears: { x: 0.08, y: 0.1, z: -0.08, back: 0.3, droop: 0.9, runBack: 0.4 },
  trotAt: 1.5, runAt: 6, run: 'gallop', gaitRef: { walk: 1.2, trot: 3.5, gallop: 10 },
  neckGraze: 1.4, headGraze: -0.4, grazePitch: 0.08, neckAlert: 0.2, headRest: 0.45, nod: 0.04,
};

export const moose = {
  dims: MOOSE,
  build(seed, v = {}) {
    const r = new RigBuilder(seed);
    const d = MOOSE;
    const sk = quadSkeleton(r, d);
    const coat = lin(0x2f241b);
    const brown = lin(0x4a3a2c);
    const legC = lin(0x8c8070);
    const fur = (p, n) => mix(coat, brown, ss(n.y, 0.4, 0.95) * 0.6);
    // humped shoulders, short deep body
    torso(r, sk, d, { z0: -0.85, z1: 0.85, prof: [[0, 0.17, 0.24, 0.03], [0.2, 0.24, 0.3, 0.0], [0.5, 0.29, 0.34, 0.0], [0.78, 0.27, 0.44, 0.08], [1, 0.2, 0.34, 0.02]], color: fur });
    legs(r, sk, {
      color: legC,
      hind: { upper: [0.09, 0.05], lower: [0.042, 0.032], muscle: [0.12, 0.33, 0.18], muscleY: 0.25, muscleColor: fur },
      fore: { upper: [0.085, 0.048], lower: [0.04, 0.03], muscle: [0.1, 0.26, 0.14], muscleY: 0.22, muscleColor: fur },
      foot: hooves(lin(0x1a1714), 0.045, 0.08),
    });
    neck(r, sk, d, 0.17, 0.12, 1.5, coat);
    const head = sk.head;
    // long head with a heavy overhanging nose, and a bell under the throat
    r.part(head, ellipsoid(0.1, 0.11, 0.14), { matrix: at(0, 0.02, 0.02), color: coat });
    r.part(head, stick(0.075, 0.085, 8), { matrix: along(0, -0.02, 0.06, 0, -0.1, 0.36, 1, 1.25), color: (p) => mix(coat, brown, p.y * 0.8) });
    r.part(head, ellipsoid(0.09, 0.08, 0.1), { matrix: at(0, -0.1, 0.4), color: brown });
    r.part(head, ellipsoid(0.035, 0.14, 0.04, 6, 5), { matrix: at(0, -0.2, 0.0, 0.2), color: coat });
    eyes(r, head, 0.085, 0.04, 0.07, 0.016);
    ears(r, sk, { w: 0.06, len: 0.18, thin: 0.4, tilt: -0.3, out: 0.95, color: brown, inner: lin(0x6b5a48) });
    if (v.bull) {
      const ac = lin(0xb59e7c);
      r.mirror((side) => {
        tine(r, head, [side * 0.06, 0.08, -0.01], [side * 0.22, 0.12, -0.06], 0.035, 0.03, ac);
        for (let i = 0; i < 6; i++) {
          const a = i / 5;
          tine(r, head, [side * (0.32 + a * 0.36), 0.16 + a * 0.1 + Math.sin(a * 3) * 0.08, -0.06 + (a - 0.5) * 0.22], [side * (0.36 + a * 0.4), 0.34 + a * 0.1, -0.06 + (a - 0.5) * 0.3], 0.02, 0.008, ac);
        }
        return [head, ellipsoid(0.28, 0.035, 0.18, 9, 4), { matrix: at(side * 0.46, 0.2, -0.06, 0, side * 0.15, side * 0.35), color: ac }];
      });
    }
    tail(r, sk, { r0: 0.04, r1: 0.02, color: () => coat });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Black bear ─────────────────────────────────────────────────────────────
const BEAR = {
  hipH: 0.62, shoulderH: 0.6, bodyLen: 0.7, hipW: 0.13, shW: 0.13,
  hindU: 0.34, hindL: 0.31, foreU: 0.32, foreL: 0.32,
  neck: { y: 0.08, z: 0.12, len: 0.22, angle: 1.25 },
  tail: { y: 0.12, z: -0.18, len: 0.06, segs: 1, rest: -0.8, swish: 0.05 },
  trotAt: 1.4, runAt: 3.2, run: 'gallop', trot: false, gaitRef: { walk: 1.1, gallop: 8 },
  foreKneeFwd: false,
  neckGraze: 1.0, headGraze: 0.0, grazePitch: 0.12, neckAlert: 0.25, headRest: 0.15, nod: 0.07,
  rearAngle: 1.4, rearDrop: -0.05, rearChest: 0.1, rearTuck: 0.8, tuckA: -0.4, tuckB: -0.9,
  stance: 1.05, crouchDrop: 0.15,
};

export const bear = {
  dims: BEAR,
  build(seed, v = {}) {
    const r = new RigBuilder(seed);
    const d = BEAR;
    const sk = quadSkeleton(r, d);
    const black = lin(v.cinnamon ? 0x5a3420 : 0x161311);
    const sheen = lin(v.cinnamon ? 0x7a4a2c : 0x2a231d);
    const muzzle = lin(0x9a7a56);
    const fur = (p, n) => mix(black, sheen, ss(n.y, 0.5, 1) * 0.7);
    torso(r, sk, d, { z0: -0.68, z1: 0.62, prof: [[0, 0.2, 0.22, 0.05], [0.25, 0.27, 0.29, 0.03], [0.55, 0.29, 0.3, 0.0], [0.8, 0.27, 0.31, 0.02], [1, 0.2, 0.24, -0.02]], color: fur });
    r.part(sk.chest, ellipsoid(0.18, 0.12, 0.2, 7, 5), { matrix: at(0, 0.22, -0.08), color: fur }); // shoulder hump
    legs(r, sk, {
      color: fur,
      hind: { upper: [0.11, 0.08], lower: [0.075, 0.065], muscle: [0.13, 0.22, 0.17], muscleY: 0.2 },
      fore: { upper: [0.1, 0.075], lower: [0.072, 0.065] },
      foot: paws(black, 0.07, 0.04, 0.15),
    });
    neck(r, sk, d, 0.17, 0.14, 1.2, fur);
    const head = sk.head;
    r.part(head, ellipsoid(0.13, 0.12, 0.13), { matrix: at(0, 0.02, 0.0), color: fur });
    r.part(head, stick(0.075, 0.05, 7), { matrix: along(0, -0.02, 0.08, 0, -0.03, 0.15, 1, 1), color: muzzle });
    r.part(head, ellipsoid(0.032, 0.025, 0.025, 6, 4), { matrix: at(0, -0.04, 0.23), color: lin(0x0e0c0b), grain: 0 });
    r.mirror((side) => [head, ellipsoid(0.045, 0.045, 0.025, 6, 4), { matrix: at(side * 0.085, 0.12, -0.03), color: fur }]);
    eyes(r, head, 0.065, 0.04, 0.1, 0.013, lin(0x2a1a10));
    tail(r, sk, { r0: 0.04, r1: 0.02, color: () => black });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Wolf ───────────────────────────────────────────────────────────────────
const WOLF = {
  hipH: 0.6, shoulderH: 0.63, bodyLen: 0.6, hipW: 0.07, shW: 0.065,
  hindU: 0.33, hindL: 0.31, foreU: 0.31, foreL: 0.35,
  neck: { y: 0.04, z: 0.08, len: 0.24, angle: 0.95 },
  tail: { y: 0.06, z: -0.06, len: 0.45, segs: 3, rest: -1.15, upAngle: 0.7, curl: -0.12, swish: 0.12, swishRate: 1.5, runLift: 0.5 },
  ears: { x: 0.045, y: 0.07, z: -0.02, back: -0.1, droop: 0.15, runBack: 0.8 },
  trotAt: 1.3, runAt: 4.5, run: 'gallop', gaitRef: { walk: 1.1, trot: 2.8, gallop: 11 },
  foreKneeFwd: false,
  neckGraze: 1.2, headGraze: 0.2, grazePitch: 0.1, neckAlert: 0.45, headRest: 0.15, nod: 0.06,
  rearAngle: 0.75, rearDrop: 0.45, rearChest: 0.1, rearTuck: 0, crouchDrop: 0.3, sitFwd: 0.55, sitBack: 0.15,
};

export const wolf = {
  dims: WOLF,
  build(seed, v = {}) {
    const r = new RigBuilder(seed);
    const d = WOLF;
    const sk = quadSkeleton(r, d);
    const grey = lin(v.coat ?? 0x7f786d);
    const saddle = lin(v.saddle ?? 0x45403a);
    const pale = lin(v.pale ?? 0xd2c9b8);
    const fur = (p, n) => {
      const c = mix(pale, grey, ss(n.y, -0.6, 0.0));
      if (n.y > 0.55) c.lerp(saddle, (n.y - 0.55) * 1.4);
      return c;
    };
    torso(r, sk, d, { z0: -0.48, z1: 0.5, prof: [[0, 0.08, 0.1, 0.02], [0.25, 0.1, 0.12, 0.0], [0.55, 0.11, 0.14, -0.02], [0.8, 0.12, 0.19, -0.05], [1, 0.1, 0.16, -0.06]], color: fur });
    r.part(sk.chest, ellipsoid(0.13, 0.15, 0.12, 8, 6), { matrix: at(0, 0.06, 0.08), color: fur }); // ruff
    legs(r, sk, {
      color: pale,
      hind: { upper: [0.045, 0.03], lower: [0.026, 0.022], muscle: [0.065, 0.16, 0.1], muscleY: 0.25, muscleColor: fur },
      fore: { upper: [0.04, 0.028], lower: [0.025, 0.022] },
      foot: paws(pale, 0.03, 0.02, 0.06),
    });
    neck(r, sk, d, 0.1, 0.075, 1.25, fur);
    const head = sk.head;
    r.part(head, ellipsoid(0.075, 0.07, 0.085), { matrix: at(0, 0.01, 0.0), color: fur });
    r.mirror((side) => [head, ellipsoid(0.04, 0.045, 0.05, 6, 4), { matrix: at(side * 0.055, -0.02, 0.0), color: pale }]); // cheek fluff
    r.part(head, stick(0.045, 0.024, 7), { matrix: along(0, -0.02, 0.05, 0, -0.01, 0.17, 1, 1), color: (p, n) => (n.y > 0.4 ? grey : pale) });
    r.part(head, ellipsoid(0.02, 0.016, 0.016, 6, 4), { matrix: at(0, -0.025, 0.22), color: lin(0x0e0c0b), grain: 0 });
    eyes(r, head, 0.045, 0.025, 0.065, 0.011, lin(0x6a5212));
    ears(r, sk, { w: 0.032, len: 0.08, thin: 0.5, tilt: -0.1, out: 0.25, color: grey, inner: pale });
    tail(r, sk, { r0: 0.035, r1: 0.02, bush: 0.035, color: (p, n, w, t) => (t > 0.85 ? lin(0x1b1916) : mix(pale, grey, ss(n.y, -0.5, 0.2))) });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Mountain lion ──────────────────────────────────────────────────────────
const COUGAR = {
  hipH: 0.5, shoulderH: 0.5, bodyLen: 0.66, hipW: 0.08, shW: 0.075,
  hindU: 0.28, hindL: 0.26, foreU: 0.25, foreL: 0.28,
  neck: { y: 0.03, z: 0.08, len: 0.18, angle: 1.1 },
  tail: { y: 0.04, z: -0.06, len: 0.72, segs: 5, rest: -1.25, upAngle: 0.4, curl: 0.24, swish: 0.18, swishRate: 1.2, runLift: 0.9 },
  ears: { x: 0.04, y: 0.05, z: -0.02, back: 0.1, droop: 0.3, runBack: 0.6 },
  trotAt: 1.5, runAt: 3.0, run: 'bound', trot: false, gaitRef: { walk: 1.0, bound: 11 },
  foreKneeFwd: false,
  neckGraze: 0.9, headGraze: 0.0, grazePitch: 0.08, neckAlert: 0.35, headRest: 0.1, nod: 0.03,
  rearAngle: 0.8, rearDrop: 0.55, rearChest: 0.1, rearTuck: 0, crouchDrop: 0.4, crouchPitch: 0.05, sitFwd: 0.6, sitBack: 0.15,
};

export const cougar = {
  dims: COUGAR,
  build(seed) {
    const r = new RigBuilder(seed);
    const d = COUGAR;
    const sk = quadSkeleton(r, d);
    const tawny = lin(0xa08464);
    const pale = lin(0xe8dcc8);
    const fur = (p, n) => mix(pale, tawny, ss(n.y, -0.65, -0.1));
    torso(r, sk, d, { z0: -0.51, z1: 0.49, prof: [[0, 0.09, 0.11, 0.02], [0.25, 0.12, 0.14, 0.0], [0.55, 0.12, 0.13, -0.02], [0.8, 0.12, 0.16, -0.03], [1, 0.1, 0.13, -0.04]], color: fur });
    legs(r, sk, {
      color: fur,
      hind: { upper: [0.055, 0.04], lower: [0.035, 0.03], muscle: [0.075, 0.15, 0.11], muscleY: 0.25 },
      fore: { upper: [0.055, 0.038], lower: [0.035, 0.032] },
      foot: paws(tawny, 0.04, 0.025, 0.07),
    });
    neck(r, sk, d, 0.085, 0.07, 1.2, fur);
    const head = sk.head;
    r.part(head, ellipsoid(0.07, 0.065, 0.075), { matrix: at(0, 0.01, 0.0), color: fur });
    r.part(head, stick(0.045, 0.035, 7), { matrix: along(0, -0.025, 0.04, 0, -0.01, 0.08, 1, 1), color: (p, n) => (n.y > 0.5 ? tawny : pale) });
    r.part(head, ellipsoid(0.015, 0.012, 0.012, 5, 4), { matrix: at(0, -0.02, 0.125), color: lin(0x8a5a4a), grain: 0 });
    eyes(r, head, 0.045, 0.025, 0.06, 0.011, lin(0x6a5a22));
    ears(r, sk, { w: 0.025, len: 0.045, thin: 0.5, tilt: -0.2, out: 0.4, color: lin(0x3a2c22), inner: pale });
    tail(r, sk, { r0: 0.03, r1: 0.024, color: (p, n, w, t) => (t > 0.86 ? lin(0x2a2018) : mix(pale, tawny, ss(n.y, -0.5, 0.0))) });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Bobcat ─────────────────────────────────────────────────────────────────
const BOBCAT = {
  hipH: 0.36, shoulderH: 0.34, bodyLen: 0.42, hipW: 0.055, shW: 0.05,
  hindU: 0.2, hindL: 0.19, foreU: 0.17, foreL: 0.19,
  neck: { y: 0.03, z: 0.05, len: 0.1, angle: 1.0 },
  tail: { y: 0.05, z: -0.06, len: 0.13, segs: 1, rest: -0.5, upAngle: 0.6, swish: 0.15 },
  ears: { x: 0.03, y: 0.04, z: -0.015, back: 0.0, droop: 0.15, runBack: 0.6 },
  trotAt: 1.3, runAt: 2.8, run: 'bound', trot: false, gaitRef: { walk: 0.9, bound: 9 },
  foreKneeFwd: false,
  neckGraze: 0.8, headGraze: 0.0, neckAlert: 0.35, headRest: 0.05, nod: 0.03,
  rearAngle: 0.8, rearDrop: 0.55, rearChest: 0.1, rearTuck: 0, crouchDrop: 0.4, sitFwd: 0.6, sitBack: 0.15,
};

export const bobcat = {
  dims: BOBCAT,
  build(seed) {
    const r = new RigBuilder(seed);
    const d = BOBCAT;
    const sk = quadSkeleton(r, d);
    const coat = lin(0x9a8466);
    const pale = lin(0xe6ddcc);
    const spot = lin(0x3b2e22);
    const fur = (p, n, w) => {
      const c = mix(pale, coat, ss(n.y, -0.7, -0.1));
      // spots: a coarse hashed grid over the body
      const h = hash3(Math.floor(w.x * 30), Math.floor(w.y * 30), Math.floor(w.z * 30));
      if (h > 0.72) c.lerp(spot, 0.55);
      return c;
    };
    torso(r, sk, d, { z0: -0.33, z1: 0.32, prof: [[0, 0.06, 0.08, 0.02], [0.25, 0.08, 0.1, 0.0], [0.55, 0.08, 0.095, -0.01], [0.8, 0.08, 0.1, -0.02], [1, 0.065, 0.085, -0.02]], color: fur, segs: [16, 14] });
    legs(r, sk, {
      color: fur,
      hind: { upper: [0.038, 0.027], lower: [0.022, 0.02], muscle: [0.05, 0.1, 0.07], muscleY: 0.25 },
      fore: { upper: [0.034, 0.025], lower: [0.022, 0.02] },
      foot: paws(coat, 0.026, 0.018, 0.045),
    });
    neck(r, sk, d, 0.06, 0.055, 1.2, fur);
    const head = sk.head;
    r.part(head, ellipsoid(0.05, 0.048, 0.05), { matrix: at(0, 0.01, 0.0), color: fur });
    // facial ruff
    r.mirror((side) => [head, ellipsoid(0.03, 0.035, 0.025, 6, 4), { matrix: at(side * 0.045, -0.025, -0.005, 0, 0, side * 0.4), color: (p, n) => mix(pale, coat, 0.3) }]);
    r.part(head, stick(0.03, 0.022, 6), { matrix: along(0, -0.02, 0.03, 0, 0, 0.05, 1, 1), color: pale });
    r.part(head, ellipsoid(0.01, 0.008, 0.008, 5, 4), { matrix: at(0, -0.012, 0.085), color: lin(0x6a4038), grain: 0 });
    eyes(r, head, 0.032, 0.02, 0.04, 0.009, lin(0x7a6420));
    ears(r, sk, { w: 0.02, len: 0.04, thin: 0.5, tilt: -0.1, out: 0.3, color: lin(0x3a3028), inner: pale, tuft: 0.03 });
    tail(r, sk, { r0: 0.022, r1: 0.02, tipBall: true, color: (p, n, w, t) => (t > 0.7 && n.y > -0.2 ? lin(0x15120f) : n.y < -0.2 ? pale : coat) });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Red fox ────────────────────────────────────────────────────────────────
const FOX = {
  hipH: 0.32, shoulderH: 0.32, bodyLen: 0.36, hipW: 0.045, shW: 0.04,
  hindU: 0.17, hindL: 0.17, foreU: 0.16, foreL: 0.18,
  neck: { y: 0.02, z: 0.05, len: 0.12, angle: 0.9 },
  tail: { y: 0.03, z: -0.04, len: 0.4, segs: 3, rest: -0.75, upAngle: 0.5, curl: 0.05, swish: 0.1, swishRate: 1.6, runLift: 0.6 },
  ears: { x: 0.03, y: 0.04, z: -0.01, back: -0.1, droop: 0.1, runBack: 0.6, alertFwd: 0.25 },
  trotAt: 1.0, runAt: 3.4, run: 'gallop', gaitRef: { walk: 0.8, trot: 2.4, gallop: 10 },
  foreKneeFwd: false,
  neckGraze: 1.5, headGraze: -0.3, grazePitch: 0.1, neckAlert: 0.35, headRest: 0.1, nod: 0.05,
  rearAngle: 0.7, rearDrop: 0.45, rearChest: 0.1, rearTuck: 0, crouchDrop: 0.35, sitFwd: 0.55, sitBack: 0.15,
};

export const fox = {
  dims: FOX,
  build(seed) {
    const r = new RigBuilder(seed);
    const d = FOX;
    const sk = quadSkeleton(r, d);
    const red = lin(0xc4581c);
    const white = lin(0xf0e8dc);
    const black = lin(0x1a1310);
    const fur = (p, n) => mix(white, red, ss(n.y, -0.7, -0.25));
    torso(r, sk, d, { z0: -0.27, z1: 0.27, prof: [[0, 0.05, 0.06, 0.01], [0.25, 0.06, 0.07, 0.0], [0.55, 0.06, 0.07, -0.01], [0.8, 0.06, 0.08, -0.02], [1, 0.05, 0.065, -0.02]], color: fur });
    const legCol = (p, n, w) => mix(black, red, ss(w.y, 0.1, 0.24));
    legs(r, sk, {
      color: legCol,
      hind: { upper: [0.03, 0.02], lower: [0.015, 0.013], muscle: [0.04, 0.09, 0.06], muscleY: 0.25, muscleColor: fur },
      fore: { upper: [0.026, 0.018], lower: [0.014, 0.013] },
      foot: paws(black, 0.017, 0.012, 0.035),
    });
    neck(r, sk, d, 0.055, 0.045, 1.25, (p, n) => (n.z > 0.3 && n.y < 0.5 ? white : red));
    const head = sk.head;
    r.part(head, ellipsoid(0.045, 0.04, 0.045), { matrix: at(0, 0.01, 0.0), color: fur });
    r.part(head, stick(0.028, 0.012, 7), { matrix: along(0, -0.012, 0.03, 0, -0.008, 0.09, 1, 1), color: (p, n) => (n.y > 0.3 ? red : white) });
    r.part(head, ellipsoid(0.01, 0.008, 0.008, 5, 4), { matrix: at(0, -0.02, 0.12), color: black, grain: 0 });
    eyes(r, head, 0.028, 0.017, 0.035, 0.007, lin(0x5a4010));
    ears(r, sk, { w: 0.022, len: 0.055, thin: 0.45, tilt: -0.1, out: 0.25, color: black, inner: white });
    tail(r, sk, { r0: 0.022, r1: 0.022, bush: 0.035, color: (p, n, w, t) => (t > 0.86 ? white : red) });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Cottontail rabbit ──────────────────────────────────────────────────────
const RABBIT = {
  hipH: 0.11, shoulderH: 0.085, bodyLen: 0.15, hipW: 0.035, shW: 0.025,
  hindU: 0.07, hindL: 0.065, foreU: 0.045, foreL: 0.05,
  neck: { y: 0.02, z: 0.02, len: 0.04, angle: 0.5 },
  tail: { y: 0.03, z: -0.05, len: 0.03, segs: 1, rest: 0.6, upAngle: 0.4, swish: 0 },
  ears: { x: 0.015, y: 0.02, z: -0.01, back: 0.35, droop: 0.12, runBack: 1.0, alertFwd: -0.05 },
  trotAt: 9, runAt: 9, run: 'bound', gaitLock: 'bound', gaitRef: { bound: 6 },
  neckGraze: 1.2, headGraze: 0.2, grazePitch: 0.15, neckAlert: 0.25, headRest: 0.2, nod: 0.0,
  rearAngle: 0.85, rearDrop: 0.15, rearChest: 0.1, rearTuck: 0.9, tuckA: -0.2, tuckB: 1.0, hindReach: 0.15, sitFwd: 0.3,
};

export const rabbit = {
  dims: RABBIT,
  build(seed) {
    const r = new RigBuilder(seed);
    const d = RABBIT;
    const sk = quadSkeleton(r, d);
    const coat = lin(0x86705a);
    const grey = lin(0x6a6058);
    const white = lin(0xece6dc);
    const fur = (p, n) => mix(white, mix(coat, grey, 0.3), ss(n.y, -0.6, -0.1));
    torso(r, sk, d, { z0: -0.145, z1: 0.115, prof: [[0, 0.045, 0.05, 0.01], [0.3, 0.06, 0.065, 0.0], [0.6, 0.055, 0.06, -0.01], [0.85, 0.045, 0.055, -0.015], [1, 0.035, 0.045, -0.015]], color: fur });
    legs(r, sk, {
      color: fur,
      hind: { upper: [0.022, 0.015], lower: [0.012, 0.01], muscle: [0.03, 0.045, 0.045], muscleY: 0.35 },
      fore: { upper: [0.012, 0.01], lower: [0.01, 0.009] },
      foot: (rr, leg) => rr.part(leg.foot, ellipsoid(0.012, 0.01, leg.fore ? 0.02 : 0.045, 6, 4), { matrix: at(0, 0.008, leg.fore ? 0.01 : 0.025), color: coat }),
    });
    neck(r, sk, d, 0.035, 0.03, 1, fur);
    const head = sk.head;
    r.part(head, ellipsoid(0.034, 0.034, 0.044), { matrix: at(0, 0.0, 0.012), color: fur });
    r.part(head, ellipsoid(0.024, 0.022, 0.022), { matrix: at(0, -0.012, 0.042), color: mix(coat, white, 0.3) });
    eyes(r, head, 0.022, 0.008, 0.02, 0.007, lin(0x140c08));
    ears(r, sk, { w: 0.016, len: 0.085, thin: 0.35, tilt: -0.3, out: 0.2, color: coat, inner: lin(0xc8a898) });
    r.part(sk.tail[0], ellipsoid(0.022, 0.022, 0.022, 6, 4), { matrix: at(0, 0, -0.01), color: white });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Squirrel (grey in the hardwoods, red among the pines) ──────────────────
const SQUIRREL = {
  hipH: 0.075, shoulderH: 0.065, bodyLen: 0.1, hipW: 0.025, shW: 0.02,
  hindU: 0.045, hindL: 0.045, foreU: 0.035, foreL: 0.038,
  neck: { y: 0.015, z: 0.015, len: 0.025, angle: 0.6 },
  tail: { y: 0.025, z: -0.035, len: 0.21, segs: 5, rest: 0.3, upAngle: 0.4, curl: [0, 0.6, 0.5, 0.15, -0.55], swish: 0.15, swishRate: 4, runLift: -0.6, flutter: 0.15 },
  ears: { x: 0.012, y: 0.016, z: -0.004, back: 0.1, droop: 0.15, runBack: 0.4 },
  trotAt: 9, runAt: 9, run: 'bound', gaitLock: 'bound', gaitRef: { bound: 4 },
  neckGraze: 1.3, headGraze: 0.3, grazePitch: 0.2, neckAlert: 0.25, headRest: 0.15, nod: 0,
  rearAngle: 1.05, rearDrop: 0.2, rearChest: 0.15, rearTuck: 1, tuckA: -0.7, tuckB: 1.3, sitFwd: 0.35,
};

export const squirrel = {
  dims: SQUIRREL,
  build(seed, v = {}) {
    const r = new RigBuilder(seed);
    const d = SQUIRREL;
    const sk = quadSkeleton(r, d);
    const coat = lin(v.red ? 0xa04f26 : 0x7e7a72);
    const warm = lin(v.red ? 0xb86a35 : 0x8f7a62);
    const white = lin(0xeee8de);
    const fur = (p, n) => mix(white, mix(coat, warm, 0.35), ss(n.y, -0.6, -0.15));
    torso(r, sk, d, { z0: -0.095, z1: 0.08, prof: [[0, 0.025, 0.03, 0.005], [0.3, 0.034, 0.038, 0.0], [0.6, 0.03, 0.034, -0.003], [0.85, 0.027, 0.033, -0.005], [1, 0.02, 0.025, -0.006]], color: fur });
    legs(r, sk, {
      color: fur,
      hind: { upper: [0.012, 0.009], lower: [0.008, 0.007], muscle: [0.018, 0.028, 0.026], muscleY: 0.35 },
      fore: { upper: [0.008, 0.007], lower: [0.007, 0.006] },
      foot: (rr, leg) => rr.part(leg.foot, ellipsoid(0.008, 0.006, leg.fore ? 0.012 : 0.022, 5, 4), { matrix: at(0, 0.005, 0.008), color: coat }),
    });
    neck(r, sk, d, 0.022, 0.02, 1, fur);
    const head = sk.head;
    r.part(head, ellipsoid(0.02, 0.019, 0.025), { matrix: at(0, 0.0, 0.008), color: fur });
    eyes(r, head, 0.016, 0.006, 0.016, 0.005, lin(0x0c0806));
    ears(r, sk, { w: 0.008, len: 0.016, thin: 0.5, color: coat, tuft: v.red ? 0.01 : 0 });
    tail(r, sk, { r0: 0.009, r1: 0.014, bush: 0.024, flatX: 0.6, segs: 7, color: (p, n, w, t) => mix(mix(coat, warm, 0.3), white, Math.abs(n.y) * 0.25 * t) });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Eastern chipmunk ───────────────────────────────────────────────────────
const CHIPMUNK = {
  hipH: 0.045, shoulderH: 0.04, bodyLen: 0.065, hipW: 0.016, shW: 0.013,
  hindU: 0.027, hindL: 0.026, foreU: 0.021, foreL: 0.023,
  neck: { y: 0.01, z: 0.01, len: 0.015, angle: 0.6 },
  tail: { y: 0.012, z: -0.022, len: 0.08, segs: 2, rest: 0.75, upAngle: 0.3, curl: 0.2, swish: 0.2, swishRate: 6, runLift: -0.3, flutter: 0.2 },
  trotAt: 9, runAt: 9, run: 'bound', gaitLock: 'bound', gaitRef: { bound: 3 },
  neckGraze: 1.3, headGraze: 0.3, grazePitch: 0.2, neckAlert: 0.25, headRest: 0.15, nod: 0,
  rearAngle: 1.05, rearDrop: 0.2, rearChest: 0.15, rearTuck: 1, tuckA: -0.7, tuckB: 1.3, sitFwd: 0.35,
};

export const chipmunk = {
  dims: CHIPMUNK,
  build(seed) {
    const r = new RigBuilder(seed);
    const d = CHIPMUNK;
    const sk = quadSkeleton(r, d);
    const coat = lin(0xa0703f);
    const rump = lin(0xb4683a);
    const dark = lin(0x221810);
    const pale = lin(0xe8dcc6);
    const fur = (p, n, w) => {
      const c = mix(pale, mix(coat, rump, ss(-w.z, 0.0, 0.04)), ss(n.y, -0.55, -0.1));
      // stripes: dark, pale, dark down the back
      const a = Math.atan2(n.x, n.y);
      const ax = Math.abs(a);
      if (n.y > 0) {
        if (ax < 0.12 || (ax > 0.55 && ax < 0.72)) c.lerp(dark, 0.85);
        else if (ax > 0.75 && ax < 0.98) c.lerp(pale, 0.8);
      }
      return c;
    };
    torso(r, sk, d, { z0: -0.062, z1: 0.052, prof: [[0, 0.015, 0.018, 0.003], [0.3, 0.02, 0.023, 0.0], [0.6, 0.019, 0.021, -0.002], [0.85, 0.017, 0.02, -0.003], [1, 0.013, 0.016, -0.004]], color: fur, segs: [20, 12] });
    legs(r, sk, {
      color: coat,
      hind: { upper: [0.007, 0.005], lower: [0.0045, 0.004], muscle: [0.011, 0.016, 0.016], muscleY: 0.35, muscleColor: fur },
      fore: { upper: [0.005, 0.004], lower: [0.004, 0.0035] },
      foot: (rr, leg) => rr.part(leg.foot, ellipsoid(0.005, 0.004, 0.01, 5, 3), { matrix: at(0, 0.003, 0.005), color: coat }),
    });
    neck(r, sk, d, 0.014, 0.012, 1, fur);
    const head = sk.head;
    r.part(head, ellipsoid(0.013, 0.012, 0.016, 10, 6), {
      matrix: at(0, 0.0, 0.006),
      color: (p, n) => {
        const c = mix(pale, coat, ss(n.y, -0.4, 0.1));
        if (Math.abs(n.y - 0.25) < 0.12 && Math.abs(n.x) > 0.5) c.lerp(dark, 0.7); // eye stripe
        return c;
      },
    });
    eyes(r, head, 0.01, 0.004, 0.012, 0.0035, lin(0x0a0605));
    r.mirror((side) => [head, ellipsoid(0.004, 0.006, 0.002, 5, 3), { matrix: at(side * 0.007, 0.012, -0.002), color: coat }]);
    tail(r, sk, { r0: 0.005, r1: 0.006, bush: 0.004, color: (p, n) => mix(coat, dark, 0.3) });
    return { mesh: r.build(), sk, dims: d };
  },
};

// ── Deer mouse ─────────────────────────────────────────────────────────────
const MOUSE = {
  hipH: 0.022, shoulderH: 0.019, bodyLen: 0.04, hipW: 0.009, shW: 0.008,
  hindU: 0.013, hindL: 0.013, foreU: 0.011, foreL: 0.011,
  neck: { y: 0.004, z: 0.006, len: 0.008, angle: 0.9 },
  tail: { y: 0.004, z: -0.012, len: 0.07, segs: 3, rest: -0.35, curl: 0.12, swish: 0.25, swishRate: 3, runLift: 0.3 },
  trotAt: 0.25, runAt: 9, run: 'bound', gaitRef: { walk: 0.15, trot: 1.2 },
  neckGraze: 1.0, headGraze: 0.3, grazePitch: 0.15, neckAlert: 0.2, headRest: 0.15, nod: 0,
  rearAngle: 0.95, rearDrop: 0.2, rearChest: 0.15, rearTuck: 1, tuckA: -0.7, tuckB: 1.3, sitFwd: 0.35,
};

export const mouse = {
  dims: MOUSE,
  build(seed) {
    const r = new RigBuilder(seed);
    const d = MOUSE;
    const sk = quadSkeleton(r, d);
    const coat = lin(0x7a5a3c);
    const white = lin(0xeee9e2);
    const fur = (p, n) => mix(white, coat, ss(n.y, -0.5, -0.05));
    torso(r, sk, d, { z0: -0.038, z1: 0.032, prof: [[0, 0.009, 0.01, 0.0], [0.3, 0.012, 0.012, 0.0], [0.6, 0.011, 0.012, 0.0], [0.85, 0.009, 0.01, -0.002], [1, 0.007, 0.008, -0.002]], color: fur });
    legs(r, sk, {
      color: white,
      hind: { upper: [0.003, 0.0025], lower: [0.002, 0.002] },
      fore: { upper: [0.0025, 0.002], lower: [0.002, 0.002] },
      foot: (rr, leg) => rr.part(leg.foot, ellipsoid(0.0025, 0.002, 0.005, 4, 3), { matrix: at(0, 0.002, 0.002), color: white }),
    });
    neck(r, sk, d, 0.009, 0.008, 1, fur);
    const head = sk.head;
    r.part(head, ellipsoid(0.008, 0.007, 0.011), { matrix: at(0, 0, 0.005), color: fur });
    r.mirror((side) => [head, ellipsoid(0.005, 0.005, 0.0015, 6, 3), { matrix: at(side * 0.006, 0.008, -0.001, 0, side * 0.4, 0), color: lin(0x9a7a6a) }]);
    eyes(r, head, 0.006, 0.003, 0.008, 0.0025, lin(0x050303));
    tail(r, sk, { r0: 0.0018, r1: 0.001, segs: 4, color: (p, n) => (n.y > 0 ? coat : white) });
    return { mesh: r.build(), sk, dims: d };
  },
};

export const MAMMALS = { deer, elk, moose, bear, wolf, cougar, bobcat, fox, rabbit, squirrel, chipmunk, mouse };
