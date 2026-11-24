// What the zoo's animals look like. Each kind (species.js) says which body
// it has and what it's made of (`look`: its size and colours), and this makes
// one: on four legs, on the skeleton and gait engine the forest's animals
// walk with (wildlife/quadruped.js), from the same parts (wildlife/
// mammals.js: a torso lofted along a profile, tapered legs, a neck, ears, a
// tail); or, for a bird on its two legs, a seal in its pool, a bird of prey
// on its perch or a reptile on its bank, a body of its own.
//
// A body is built at the size of an animal of its sort (a cat the size of a
// cougar, a hoofed animal a deer's), and grown to its kind's (look.size, its
// height at the shoulder, m) by its mesh's scale, which the gait engine
// walks it at.
//
// makeBody(kind, seed, variant) → { mesh, form, scale, quad?: { sk, dims },
// parts? }: form says how it moves (residents.js): 'quad' on four legs,
// 'bird' on two, 'seal' swimming, 'perch' sitting, 'still' lying.

import * as THREE from 'three';
import { RigBuilder, lin, at, along, ellipsoid, limb, stick, cone, animalMaterial } from '../render/rig.js';
import { quadSkeleton } from '../wildlife/quadruped.js';
import { torso, legs, hooves, tail, eyes, ears, neck, mix, wolf, fox } from '../wildlife/mammals.js';
import { buildBird } from '../wildlife/birds.js';
import { buildGator } from '../wildlife/gators.js';

const ss = THREE.MathUtils.smoothstep;
const BLACK = lin(0x0e0c0b);
const NOSE = lin(0x2a201c);
function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
const paws = (color, w, h, len) => (r, leg) => r.part(leg.foot, ellipsoid(w, h, len, 7, 5), { matrix: at(0, h * 0.8, len * 0.45), color });
// A coat with a pattern in it wants a body with the vertices to carry it:
// rings round it and along it (wildlife/mammals.js's torso, `segs`).
const segsFor = (look) => (look.stripes !== undefined || look.bands !== undefined ? [18, 48] : look.spots !== undefined || look.blotches !== undefined || look.patches !== undefined ? [26, 40] : [14, 12]);

// ── A coat: a colour over the back fading to the belly, and its pattern ─────
// Patterns are worked out in the animal's own space (w: +z to the nose, y
// up, x to its left), at the size of the body built, so a tiger's stripes
// run round it and a zebra's down its legs.
//   coat, belly     colours over the back and under
//   stripes, dense  dark stripes round the body (a tiger's, a zebra's)
//   spots           small dark spots (a cheetah's); blotches, big ones
//   bands           thin pale stripes down the flank (a kudu's)
//   patches         big patches (a cow's)
function coatOf(look, { freq = 16, legY = 0.4 } = {}) {
  const coat = lin(look.coat);
  const belly = lin(look.belly ?? look.coat);
  const dark = look.stripes ?? look.spots ?? look.blotches ?? look.patches;
  const mark = dark !== undefined ? lin(dark) : null;
  const pale = look.bands !== undefined ? lin(look.bands) : null;
  const f = freq * (look.dense ?? 1);
  return (p, n, w) => {
    const c = mix(belly, coat, ss(n.y, -0.7, -0.1));
    if (look.stripes !== undefined) {
      // round the body, wavering; on the legs, across them
      const onLeg = w.y < legY;
      const s = onLeg ? Math.sin(w.y * f * 2.2 * Math.PI) : Math.sin(w.z * f * Math.PI + Math.sin(w.y * 11 + w.z * 3) * 0.9);
      const t = look.narrow ? 0.15 : 0.45;
      if (s > t && (onLeg || n.y > -0.8)) c.lerp(mark, 0.92);
    }
    if (look.spots !== undefined) {
      const k = 34 * (look.dense ?? 1);
      if (hash3(Math.floor(w.x * k), Math.floor(w.y * k), Math.floor(w.z * k)) > 0.7 && n.y > -0.6) c.lerp(mark, 0.85);
    }
    if (look.blotches !== undefined) {
      const k = 10;
      const h = hash3(Math.floor(w.x * k), Math.floor(w.y * k), Math.floor(w.z * k));
      const fx = (w.x * k) % 1;
      const fz = (w.z * k) % 1;
      if (h > 0.4 && Math.abs(Math.abs(fx) - 0.5) + Math.abs(Math.abs(fz) - 0.5) > 0.55) c.lerp(mark, 0.8);
    }
    if (look.patches !== undefined) {
      const k = 6;
      if (hash3(Math.floor(w.x * k + 0.3), Math.floor(w.y * k), Math.floor(w.z * k - 0.2)) > 0.55) c.lerp(mark, 0.95);
    }
    if (pale && Math.abs(n.x) > 0.5 && n.y > -0.3 && Math.sin(w.z * 40) > 0.85) c.lerp(pale, 0.9);
    return c;
  };
}

// ── Cats ────────────────────────────────────────────────────────────────────
// A cat the size of a cougar, grown to a lion or kept to a fishing cat.
const CAT = {
  hipH: 0.5, shoulderH: 0.5, bodyLen: 0.66, hipW: 0.08, shW: 0.075,
  hindU: 0.28, hindL: 0.26, foreU: 0.25, foreL: 0.28,
  neck: { y: 0.03, z: 0.08, len: 0.18, angle: 1.1 },
  tail: { y: 0.04, z: -0.06, len: 0.66, segs: 5, rest: -1.25, upAngle: 0.4, curl: 0.24, swish: 0.18, swishRate: 1.2, runLift: 0.9 },
  ears: { x: 0.04, y: 0.05, z: -0.02, back: 0.1, droop: 0.3, runBack: 0.6 },
  trotAt: 1.5, runAt: 3.0, run: 'bound', trot: false, gaitRef: { walk: 1.0, bound: 11 },
  foreKneeFwd: false,
  neckGraze: 0.9, headGraze: 0.0, grazePitch: 0.08, neckAlert: 0.35, headRest: 0.1, nod: 0.03,
  rearAngle: 0.8, rearDrop: 0.55, rearChest: 0.1, rearTuck: 0, crouchDrop: 0.4, crouchPitch: 0.05, sitFwd: 0.6, sitBack: 0.15,
};
function cat(look, seed, v) {
  const lean = look.lean ?? 1;
  const d = { ...CAT, hindL: CAT.hindL / Math.sqrt(lean), foreL: CAT.foreL / Math.sqrt(lean), tail: { ...CAT.tail, len: CAT.tail.len * (look.tail ?? 1), segs: look.tail && look.tail < 0.4 ? 1 : 5 } };
  d.hipH = d.hindU + d.hindL - 0.04;
  d.shoulderH = d.foreU + d.foreL - 0.03;
  const r = new RigBuilder(seed);
  const sk = quadSkeleton(r, d);
  const fur = coatOf(look, { freq: 15, legY: d.hipH * 0.55 });
  const w = lean;
  torso(r, sk, d, { z0: -0.51, z1: 0.49, prof: [[0, 0.09 * w, 0.11, 0.02], [0.25, 0.12 * w, 0.14 * (lean < 1 ? 0.85 : 1), 0.0], [0.55, 0.12 * w, 0.13 * (lean < 1 ? 0.8 : 1), -0.02], [0.8, 0.12 * w, 0.16, -0.03], [1, 0.1 * w, 0.13, -0.04]], color: fur, segs: segsFor(look) });
  if (look.fluffy) r.part(sk.body, ellipsoid(0.15, 0.15, 0.32, 8, 6), { matrix: at(0, 0.02, 0.3), color: fur });
  legs(r, sk, {
    color: fur,
    hind: { upper: [0.055 * w, 0.04 * w], lower: [0.035 * w, 0.03 * w], muscle: [0.075 * w, 0.15, 0.11], muscleY: 0.25 },
    fore: { upper: [0.055 * w, 0.038 * w], lower: [0.035 * w, 0.032 * w] },
    foot: paws(lin(look.belly ?? look.coat), 0.04 * w, 0.025, 0.07),
  });
  neck(r, sk, d, 0.085, 0.07, 1.2, fur);
  const head = sk.head;
  const hs = look.fluffy ? 1.1 : lean < 1 ? 0.85 : 1;
  r.part(head, ellipsoid(0.07 * hs, 0.065 * hs, 0.075 * hs), { matrix: at(0, 0.01, 0.0), color: fur });
  r.part(head, stick(0.045 * hs, 0.035 * hs, 7), { matrix: along(0, -0.025, 0.04, 0, -0.01, 0.08 * (lean < 1 ? 0.8 : 1), 1, 1), color: (p, n) => (n.y > 0.5 ? lin(look.coat) : lin(look.belly ?? look.coat)) });
  r.part(head, ellipsoid(0.015, 0.012, 0.012, 5, 4), { matrix: at(0, -0.02, 0.125), color: lin(0x5a3a32), grain: 0 });
  eyes(r, head, 0.045 * hs, 0.025, 0.06, 0.011, lin(0x8a6a22));
  if (look.tears) r.mirror((side) => [head, stick(0.006, 0.006, 3), { matrix: along(side * 0.035, 0.015, 0.065, 0, -0.06, 0.03, 1, 1), color: BLACK, grain: 0 }]);
  ears(r, sk, { w: 0.025, len: look.tufts ? 0.05 : 0.04, thin: 0.5, tilt: -0.2, out: 0.4, color: lin(look.tufts ? 0x3a3028 : look.coat), inner: lin(look.belly ?? look.coat), tuft: look.tufts ? 0.035 : 0 });
  const tip = lin(look.tuft ?? (look.stripes !== undefined ? look.stripes : look.coat));
  tail(r, sk, { r0: 0.03 * (look.fluffy ? 1.6 : 1), r1: 0.024 * (look.fluffy ? 1.6 : 1), tipBall: !!look.tuft, color: (p, n, ww, t) => (t > 0.86 ? tip : look.stripes !== undefined && Math.sin(t * 40) > 0.3 ? lin(look.stripes) : fur(p, n, ww)) });
  // a lion's mane, on the males
  if (look.mane !== undefined && v.male) {
    const m = lin(look.mane);
    const shag = (p, n) => mix(m, lin(look.coat), ss(n.y, 0.6, 1) * 0.3);
    r.part(sk.neck, ellipsoid(0.14, 0.16, 0.13, 9, 7), { matrix: at(0, 0.05, 0.08), color: shag });
    r.part(head, ellipsoid(0.12, 0.12, 0.09, 9, 7), { matrix: at(0, 0.0, -0.03), color: shag });
    r.part(sk.chest, ellipsoid(0.12, 0.14, 0.14, 8, 6), { matrix: at(0, 0.02, 0.1), color: shag });
  }
  return { mesh: r.build(), sk, dims: d };
}

// ── Bears ───────────────────────────────────────────────────────────────────
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
function bear(look, seed) {
  const d = BEAR;
  const r = new RigBuilder(seed);
  const sk = quadSkeleton(r, d);
  const base = lin(look.coat);
  const sheen = mix(base, lin(0xffffff), 0.12);
  const black = lin(look.panda ?? 0x141210);
  // a giant panda: black legs and a band over the shoulders; white elsewhere
  const panda = look.panda !== undefined;
  const fur = (p, n, w) => {
    if (panda) return w.y < 0.42 || (w.z > 0.05 && w.z < 0.42 && w.y > 0.3) ? black : base;
    return mix(base, sheen, ss(n.y, 0.5, 1) * 0.7);
  };
  torso(r, sk, d, { z0: -0.68, z1: 0.62, prof: [[0, 0.2, 0.22, 0.05], [0.25, 0.27, 0.29, 0.03], [0.55, 0.29, 0.3, 0.0], [0.8, 0.27, 0.31, 0.02], [1, 0.2, 0.24, -0.02]], color: fur });
  r.part(sk.chest, ellipsoid(0.18, 0.12, 0.2, 7, 5), { matrix: at(0, 0.22, -0.08), color: fur });
  if (look.shag) {
    // a sloth bear's shaggy mop over its shoulders and neck
    r.part(sk.chest, ellipsoid(0.28, 0.26, 0.26, 8, 6), { matrix: at(0, 0.14, 0.12), color: fur });
    r.part(sk.neck, ellipsoid(0.2, 0.2, 0.17, 8, 6), { matrix: at(0, 0.03, 0.06), color: fur });
  }
  if (look.chest !== undefined) r.part(sk.chest, cone(0.1, 0.18, 5), { matrix: at(0, -0.02, 0.33, -Math.PI / 2 - 0.25), color: lin(look.chest), grain: 0 });
  legs(r, sk, {
    color: (p, n, w) => (panda ? black : fur(p, n, w)),
    hind: { upper: [0.11, 0.08], lower: [0.075, 0.065], muscle: [0.13, 0.22, 0.17], muscleY: 0.2 },
    fore: { upper: [0.1, 0.075], lower: [0.072, 0.065] },
    foot: paws(panda ? black : base, 0.07, 0.04, 0.15),
  });
  neck(r, sk, d, 0.17, 0.14, 1.2, (p, n, w) => (panda ? base : fur(p, n, w)));
  const head = sk.head;
  const face = panda ? base : base;
  r.part(head, ellipsoid(panda ? 0.16 : 0.13, panda ? 0.14 : 0.12, 0.13), { matrix: at(0, 0.02, 0.0), color: face });
  const snout = look.snout !== undefined ? lin(look.snout) : panda ? base : mix(base, lin(0x9a7a56), 0.6);
  r.part(head, stick(0.075, 0.05, 7), { matrix: along(0, -0.02, 0.08, 0, -0.03, panda ? 0.1 : 0.15, 1, 1), color: snout });
  r.part(head, ellipsoid(0.032, 0.025, 0.025, 6, 4), { matrix: at(0, -0.04, panda ? 0.18 : 0.23), color: BLACK, grain: 0 });
  r.mirror((side) => [head, ellipsoid(0.05, 0.05, 0.025, 6, 4), { matrix: at(side * 0.1, 0.13, -0.03), color: panda ? black : fur }]);
  if (panda) r.mirror((side) => [head, ellipsoid(0.04, 0.03, 0.02, 6, 4), { matrix: at(side * 0.06, 0.04, 0.115, 0, 0, side * 0.6), color: black, grain: 0 }]);
  if (look.specs !== undefined) r.mirror((side) => [head, ellipsoid(0.04, 0.03, 0.02, 6, 4), { matrix: at(side * 0.06, 0.04, 0.11, 0, 0, side * 0.4), color: lin(look.specs), grain: 0 }]);
  eyes(r, head, 0.065, 0.04, 0.115, 0.013, lin(0x1a120c));
  tail(r, sk, { r0: 0.04, r1: 0.02, color: () => (panda ? base : black) });
  return { mesh: r.build(), sk, dims: d };
}

// ── Hoofed: horses, antelope, the farm ──────────────────────────────────────
// One body of a deer's size, shaped to each: a horse's long head and mane, an
// antelope's horns, an alpaca's long neck, a cow's bulk, a pig's snout.
const HOOF = {
  horse: { hipH: 0.8, shoulderH: 0.8, bodyLen: 0.86, hipW: 0.1, shW: 0.095, hindU: 0.42, hindL: 0.42, foreU: 0.38, foreL: 0.46, neck: { y: 0.1, z: 0.1, len: 0.42, angle: 0.62 }, girth: 1.15, head: 0.3 },
  antelope: { hipH: 0.8, shoulderH: 0.8, bodyLen: 0.74, hipW: 0.09, shW: 0.085, hindU: 0.42, hindL: 0.44, foreU: 0.38, foreL: 0.46, neck: { y: 0.08, z: 0.1, len: 0.4, angle: 0.75 }, girth: 1, head: 0.17 },
  camelid: { hipH: 0.8, shoulderH: 0.8, bodyLen: 0.62, hipW: 0.09, shW: 0.085, hindU: 0.42, hindL: 0.42, foreU: 0.38, foreL: 0.46, neck: { y: 0.1, z: 0.08, len: 0.6, angle: 0.25 }, girth: 1.1, head: 0.13 },
  goat: { hipH: 0.62, shoulderH: 0.62, bodyLen: 0.62, hipW: 0.09, shW: 0.085, hindU: 0.32, hindL: 0.34, foreU: 0.3, foreL: 0.35, neck: { y: 0.08, z: 0.08, len: 0.26, angle: 0.7 }, girth: 1.05, head: 0.15 },
  cow: { hipH: 0.78, shoulderH: 0.8, bodyLen: 1.0, hipW: 0.15, shW: 0.15, hindU: 0.4, hindL: 0.4, foreU: 0.38, foreL: 0.44, neck: { y: 0.06, z: 0.12, len: 0.28, angle: 1.05 }, girth: 1.7, head: 0.24 },
  pig: { hipH: 0.5, shoulderH: 0.48, bodyLen: 0.78, hipW: 0.13, shW: 0.13, hindU: 0.25, hindL: 0.25, foreU: 0.23, foreL: 0.26, neck: { y: 0.04, z: 0.08, len: 0.12, angle: 1.35 }, girth: 1.9, head: 0.18 },
};
function hoof(look, seed, v) {
  const form = look.form || 'antelope';
  const F = HOOF[form];
  const d = {
    ...F,
    tail: form === 'horse' ? { y: 0.12, z: -0.06, len: 0.42, segs: 3, rest: -1.35, upAngle: 0.5, swish: 0.25, swishRate: 1.5, runLift: 0.4 } : form === 'pig' ? { y: 0.12, z: -0.05, len: 0.12, segs: 2, rest: 0.4, curl: 1.2, swish: 0.4, swishRate: 3 } : { y: 0.1, z: -0.06, len: form === 'cow' ? 0.5 : 0.2, segs: 2, rest: -1.3, upAngle: 0.8, swish: 0.25, swishRate: 2 },
    ears: { x: 0.045, y: 0.07, z: -0.03, back: 0.15, droop: form === 'pig' ? 1.1 : 0.55, runBack: 0.7 },
    trotAt: 1.6, runAt: 3.4, run: 'gallop', gaitRef: { walk: 1.2, trot: 2.2, gallop: 9 },
    neckGraze: form === 'camelid' ? 2.2 : 2.0, headGraze: -0.7, grazePitch: 0.12, neckAlert: 0.25, headRest: 0.25, nod: 0.06,
    rearAngle: 0.4,
  };
  const r = new RigBuilder(seed);
  const sk = quadSkeleton(r, d);
  const fur = coatOf(look, { freq: 12, legY: d.hipH * 0.62 });
  const g = F.girth;
  const L = d.bodyLen;
  torso(r, sk, d, { z0: -L * 0.8, z1: L * 0.7, prof: [[0, 0.11 * g, 0.15 * g, 0.02], [0.2, 0.15 * g, 0.19 * g, 0.0], [0.5, 0.17 * g, 0.2 * g, -0.04], [0.8, 0.15 * g, 0.22 * g, -0.05], [1, 0.11 * g, 0.17 * g, -0.03]], color: fur, segs: segsFor(look) });
  if (look.fluffy) r.part(sk.body, ellipsoid(0.22, 0.24, 0.5, 9, 7), { matrix: at(0, 0.0, L * 0.45), color: fur });
  const legCol = look.legs !== undefined ? (p, n, w) => (w.y < d.hipH * 0.5 ? lin(look.legs) : fur(p, n, w)) : fur;
  const thick = form === 'cow' ? 1.5 : form === 'pig' ? 1.4 : form === 'horse' ? 1.25 : 1;
  legs(r, sk, {
    color: legCol,
    hind: { upper: [0.05 * thick, 0.03 * thick], lower: [0.026 * thick, 0.02 * thick], muscle: [0.075 * thick, 0.2, 0.12], muscleY: 0.28, muscleZ: -0.01, muscleColor: fur },
    fore: { upper: [0.05 * thick, 0.028 * thick], lower: [0.024 * thick, 0.019 * thick], muscle: [0.06 * thick, 0.16, 0.09], muscleY: 0.25, muscleColor: fur },
    foot: hooves(lin(form === 'pig' ? 0x8a6a5a : 0x221d19), 0.024 * thick, 0.05),
  });
  const neckR = form === 'horse' ? 0.12 : form === 'cow' ? 0.15 : form === 'pig' ? 0.16 : form === 'camelid' ? 0.08 : 0.1;
  neck(r, sk, d, neckR, neckR * 0.7, form === 'horse' ? 1.6 : 1.3, fur);
  if (look.fluffy) r.part(sk.neck, ellipsoid(0.1, 0.32, 0.1, 7, 6), { matrix: at(0, 0.3, 0.05, 0.25), color: fur });
  if (look.mane !== undefined) {
    // a mane standing up along the top of the neck
    const m = lin(look.mane);
    const n = d.neck;
    r.part(sk.neck, stick(0.03, 0.025, 4), { matrix: along(0, neckR * 0.8, -0.02, 0, Math.cos(n.angle) * n.len, Math.sin(n.angle) * n.len - 0.06, 1, 2.2), color: (p) => (look.stripes !== undefined && Math.sin(p.y * 40) > 0 ? lin(look.coat) : m) });
  }
  const head = sk.head;
  const hl = F.head;
  const face = look.face !== undefined ? lin(look.face) : null;
  r.part(head, ellipsoid(0.07 * (form === 'pig' ? 1.5 : 1), 0.075 * (form === 'pig' ? 1.3 : 1), 0.09), { matrix: at(0, 0.0, 0.03), color: (p, n, w) => (face && n.z > 0 ? face : fur(p, n, w)) });
  const muz = look.muzzle !== undefined ? lin(look.muzzle) : null;
  r.part(head, stick(form === 'pig' ? 0.07 : 0.05, form === 'pig' ? 0.06 : 0.032, 7), {
    matrix: along(0, -0.02, 0.06, 0, form === 'horse' ? -0.12 : -0.05, hl, 1, form === 'horse' ? 1.15 : 1.05),
    color: (p, n, w) => (p.y > 0.8 && muz ? muz : face && p.y < 0.7 ? face : fur(p, n, w)),
  });
  const tipZ = 0.06 + hl;
  if (form === 'pig') r.part(head, limb(0.055, 0.055, 0.02, 9), { matrix: at(0, -0.05, tipZ + 0.02, Math.PI / 2), color: lin(0xd8988a), grain: 0 });
  else r.part(head, ellipsoid(0.03, 0.022, 0.02, 6, 4), { matrix: at(0, form === 'horse' ? -0.14 : -0.06, tipZ), color: NOSE, grain: 0 });
  eyes(r, head, 0.055, 0.02, 0.07, 0.014);
  ears(r, sk, { w: 0.04 * (look.ears ?? 1) ** 0.5, len: 0.11 * (look.ears ?? 1), thin: 0.35, tilt: -0.1, out: 0.7, color: lin(look.coat), inner: lin(look.belly ?? look.coat) });
  // horns
  const hornLen = look.hornLen ?? 0;
  if (hornLen && (look.horns === 'goat' || v.male !== false)) {
    const hc = lin(look.horns === 'goat' ? 0x8a7a68 : 0x3a3028);
    r.mirror((side) => {
      const pts = [];
      const turns = look.horns === 'spiral' ? 2.2 : look.horns === 'twist' ? 1.2 : 0.4;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const a = t * turns * Math.PI * 2;
        const back = look.horns === 'goat' ? -0.6 : -0.25;
        pts.push([side * (0.03 + Math.sin(a) * 0.03 * t + t * 0.04), 0.07 + t * hornLen * Math.cos(back * t), -0.02 + t * hornLen * Math.sin(back) + Math.cos(a) * 0.02 * t]);
      }
      for (let i = 0; i < 8; i++) {
        const [a, b] = [pts[i], pts[i + 1]];
        if (i < 7) r.part(head, stick(0.018 * (1 - i / 9), 0.016 * (1 - (i + 1) / 9), 4), { matrix: along(a[0], a[1], a[2], b[0] - a[0], b[1] - a[1], b[2] - a[2], 1, 1), color: hc, grain: 0.05 });
      }
      const [a, b] = [pts[7], pts[8]];
      return [head, stick(0.012, 0.004, 4), { matrix: along(a[0], a[1], a[2], b[0] - a[0], b[1] - a[1], b[2] - a[2], 1, 1), color: hc, grain: 0.05 }];
    });
  }
  const tailCol = look.mane !== undefined ? lin(look.mane) : fur;
  tail(r, sk, { r0: form === 'horse' ? 0.04 : 0.03, r1: form === 'horse' ? 0.06 : 0.015, bush: form === 'horse' ? 0.02 : 0, segs: 6, color: (p, n, w, t) => (form === 'horse' && t > 0.25 ? tailCol : typeof tailCol === 'function' ? tailCol(p, n, w) : fur(p, n, w)) });
  return { mesh: r.build(), sk, dims: d };
}

// ── Elephants ───────────────────────────────────────────────────────────────
const ELEPHANT = {
  hipH: 0.95, shoulderH: 1.0, bodyLen: 0.78, hipW: 0.2, shW: 0.2,
  hindU: 0.5, hindL: 0.44, foreU: 0.48, foreL: 0.52,
  neck: { y: 0.1, z: 0.12, len: 0.12, angle: 1.2 },
  tail: { y: 0.18, z: -0.06, len: 0.38, segs: 2, rest: -1.45, upAngle: 0.2, swish: 0.2, swishRate: 1.1 },
  ears: { x: 0.14, y: 0.06, z: -0.04, back: 0.3, droop: 0.2, runBack: 0.6 },
  trotAt: 1.8, runAt: 9, run: 'trot', gaitRef: { walk: 0.9, trot: 2.4 },
  foreKneeFwd: false,
  neckGraze: 0.6, headGraze: 0.2, grazePitch: 0.04, neckAlert: 0.15, headRest: 0.2, nod: 0.04,
  rearAngle: 0.3, crouchDrop: 0.1,
};
function elephant(look, seed, v) {
  const d = ELEPHANT;
  const r = new RigBuilder(seed);
  r.grain = 0.24;
  const sk = quadSkeleton(r, d);
  const skin = lin(look.coat);
  const hide = (p, n) => mix(mix(skin, lin(0x8a7e74), 0.25), skin, ss(n.y, -0.6, 0.4));
  torso(r, sk, d, { z0: -0.6, z1: 0.62, prof: [[0, 0.24, 0.3, 0.08], [0.25, 0.3, 0.36, 0.06], [0.55, 0.32, 0.37, 0.03], [0.8, 0.3, 0.38, 0.05], [1, 0.22, 0.3, 0.02]], color: hide });
  legs(r, sk, {
    color: hide,
    hind: { upper: [0.13, 0.11], lower: [0.1, 0.095], muscle: [0.15, 0.25, 0.18], muscleY: 0.25, muscleColor: hide },
    fore: { upper: [0.13, 0.11], lower: [0.1, 0.1] },
    foot: (rr, leg) => {
      rr.part(leg.foot, limb(0.115, 0.11, 0.06, 9), { matrix: at(0, 0.0, 0.01), color: mix(skin, lin(0x3a342e), 0.4) });
    },
  });
  neck(r, sk, d, 0.2, 0.18, 1.1, hide);
  const head = sk.head;
  r.part(head, ellipsoid(0.2, 0.22, 0.2, 10, 8), { matrix: at(0, 0.04, 0.02), color: hide });
  // the twin domes of an Asian elephant's brow
  r.mirror((side) => [head, ellipsoid(0.1, 0.1, 0.1, 7, 5), { matrix: at(side * 0.07, 0.2, 0.02), color: hide }]);
  // the trunk: hanging from the face, curling a little forward at its tip
  let p = [0, -0.06, 0.18];
  const segs = [[0, -0.14, 0.06], [0, -0.16, 0.02], [0, -0.16, -0.01], [0, -0.14, 0.02], [0, -0.1, 0.06]];
  segs.forEach(([dx, dy, dz], i) => {
    const r0 = 0.085 - i * 0.012;
    r.part(head, stick(r0, r0 - 0.012, 7), { matrix: along(p[0], p[1], p[2], dx, dy, dz, 1, 1), color: hide, grain: 0.3 });
    p = [p[0] + dx, p[1] + dy, p[2] + dz];
  });
  // ears: flat, rounded, folded back against the neck
  r.mirror((side) => [head, ellipsoid(0.02, 0.17, 0.15, 7, 6), { matrix: at(side * 0.19, 0.0, -0.08, 0, side * -0.5, side * 0.12), color: hide }]);
  eyes(r, head, 0.15, 0.06, 0.13, 0.014, lin(0x2a1a10));
  if (v.male) r.mirror((side) => [head, cone(0.025, 0.3, 6), { matrix: at(side * 0.08, -0.12, 0.16, Math.PI / 2 + 0.6), color: lin(0xe8e0cc), grain: 0 }]);
  tail(r, sk, { r0: 0.025, r1: 0.012, color: (pp, n, w, t) => (t > 0.85 ? BLACK : skin) });
  return { mesh: r.build(), sk, dims: d };
}

// ── Apes and monkeys ────────────────────────────────────────────────────────
// A gorilla knuckle-walks: its arms longer than its legs, its chest high.
const APE = {
  hipH: 0.5, shoulderH: 0.7, bodyLen: 0.46, hipW: 0.1, shW: 0.15,
  hindU: 0.27, hindL: 0.25, foreU: 0.36, foreL: 0.36,
  neck: { y: 0.06, z: 0.04, len: 0.06, angle: 0.9 },
  trotAt: 1.4, runAt: 3, run: 'gallop', trot: false, gaitRef: { walk: 0.8, gallop: 6 },
  foreKneeFwd: false,
  neckGraze: 0.6, headGraze: 0.2, grazePitch: 0.05, neckAlert: 0.3, headRest: 0.1, nod: 0.04,
  rearAngle: 1.0, rearDrop: 0.3, rearChest: 0.2, rearTuck: 0.6, crouchDrop: 0.35, sitFwd: 0.5, sitBack: 0.2,
};
function ape(look, seed, v) {
  const d = look.long ? { ...APE, foreU: 0.42, foreL: 0.42, shoulderH: 0.8 } : APE;
  const r = new RigBuilder(seed);
  const sk = quadSkeleton(r, d);
  const hair = lin(look.coat);
  const back = look.back !== undefined && v.male ? lin(look.back) : hair;
  const fur = (p, n, w) => (n.y > 0.5 && w.z < 0.1 ? back : mix(hair, mix(hair, lin(0xffffff), 0.1), ss(n.y, 0.6, 1)));
  torso(r, sk, d, { z0: -0.3, z1: 0.38, prof: [[0, 0.14, 0.15, 0.04], [0.3, 0.17, 0.18, 0.04], [0.6, 0.21, 0.22, 0.06], [0.85, 0.22, 0.24, 0.05], [1, 0.17, 0.18, 0.03]], color: fur });
  legs(r, sk, {
    color: fur,
    hind: { upper: [0.08, 0.06], lower: [0.06, 0.05], muscle: [0.09, 0.14, 0.1], muscleY: 0.3 },
    fore: { upper: [0.09, 0.07], lower: [0.075, 0.06], muscle: [0.1, 0.16, 0.1], muscleY: 0.25 },
    foot: paws(lin(look.face ?? 0x101010), 0.06, 0.04, 0.09),
  });
  neck(r, sk, d, 0.12, 0.1, 1.1, fur);
  const head = sk.head;
  r.part(head, ellipsoid(0.12, 0.13, 0.12, 9, 7), { matrix: at(0, 0.04, 0.0), color: hair });
  if (!look.long && v.male) r.part(head, ellipsoid(0.05, 0.08, 0.09, 6, 5), { matrix: at(0, 0.15, -0.03), color: hair }); // sagittal crest
  const face = lin(look.face ?? 0x101010);
  r.part(head, ellipsoid(0.085, 0.09, 0.06, 8, 6), { matrix: at(0, 0.0, 0.08), color: face });
  r.part(head, ellipsoid(0.09, 0.025, 0.04, 7, 4), { matrix: at(0, 0.07, 0.1), color: face }); // brow
  if (look.long && v.male) r.mirror((side) => [head, ellipsoid(0.02, 0.1, 0.09, 6, 5), { matrix: at(side * 0.12, 0.0, 0.05), color: face }]); // cheek pads
  eyes(r, head, 0.04, 0.04, 0.13, 0.012, lin(0x2a1a10));
  return { mesh: r.build(), sk, dims: d };
}
const MONKEY = {
  hipH: 0.32, shoulderH: 0.3, bodyLen: 0.3, hipW: 0.05, shW: 0.05,
  hindU: 0.17, hindL: 0.17, foreU: 0.15, foreL: 0.16,
  neck: { y: 0.02, z: 0.04, len: 0.06, angle: 0.9 },
  tail: { y: 0.02, z: -0.04, len: 0.6, segs: 6, rest: -0.2, upAngle: 0.9, curl: 0.25, swish: 0.15, swishRate: 1.2, runLift: 0.4 },
  ears: { x: 0.03, y: 0.03, z: -0.01, back: 0, droop: 0.2, runBack: 0.4 },
  trotAt: 1.2, runAt: 2.6, run: 'bound', trot: false, gaitRef: { walk: 0.7, bound: 6 },
  foreKneeFwd: false,
  neckGraze: 0.8, headGraze: 0.1, grazePitch: 0.1, neckAlert: 0.3, headRest: 0.1, nod: 0.05,
  rearAngle: 1.0, rearDrop: 0.4, rearChest: 0.2, rearTuck: 0.7, crouchDrop: 0.3, sitFwd: 0.5, sitBack: 0.2,
};
function monkey(look, seed) {
  const d = { ...MONKEY, tail: { ...MONKEY.tail, len: look.tail ?? 0.6 } };
  const r = new RigBuilder(seed);
  const sk = quadSkeleton(r, d);
  const fur = coatOf(look);
  torso(r, sk, d, { z0: -0.22, z1: 0.24, prof: [[0, 0.06, 0.07, 0.01], [0.3, 0.075, 0.085, 0.0], [0.6, 0.075, 0.085, 0.0], [1, 0.06, 0.07, 0.0]], color: fur });
  legs(r, sk, {
    color: fur,
    hind: { upper: [0.03, 0.022], lower: [0.02, 0.016], muscle: [0.04, 0.08, 0.05], muscleY: 0.3 },
    fore: { upper: [0.025, 0.02], lower: [0.018, 0.015] },
    foot: paws(lin(look.mask ?? look.coat), 0.02, 0.012, 0.035),
  });
  neck(r, sk, d, 0.05, 0.045, 1.1, fur);
  const head = sk.head;
  const face = lin(look.face ?? look.coat);
  r.part(head, ellipsoid(0.055, 0.05, 0.055), { matrix: at(0, 0.01, 0), color: fur });
  r.part(head, stick(0.032, 0.02, 6), { matrix: along(0, -0.01, 0.03, 0, -0.005, look.mask !== undefined ? 0.05 : 0.025, 1, 1), color: look.mask !== undefined ? lin(look.mask) : face });
  if (look.mask !== undefined) r.part(head, ellipsoid(0.045, 0.03, 0.02, 6, 4), { matrix: at(0, 0.005, 0.045), color: face });
  eyes(r, head, 0.022, 0.012, 0.05, 0.01, lin(look.mask !== undefined ? 0xd88a20 : 0x2a1a10));
  ears(r, sk, { w: 0.02, len: 0.03, thin: 0.5, out: 0.6, color: lin(look.coat), inner: face });
  const rings = look.rings !== undefined ? lin(look.rings) : null;
  tail(r, sk, { r0: 0.018, r1: 0.014, bush: look.rings !== undefined ? 0.006 : 0, segs: 6, color: (p, n, w, t) => (rings && Math.sin(t * 13 * Math.PI) > 0.1 ? rings : rings ? lin(0xf0ece6) : fur(p, n, w)) });
  return { mesh: r.build(), sk, dims: d };
}

// ── Small things on four legs ───────────────────────────────────────────────
// Otters, beavers, red pandas, prairie dogs and the like, each from its own
// height at the shoulder and length (look.size, look.len), at life size.
function small(look, seed) {
  if (look.form === 'wolf') return wolf.build(seed);
  if (look.form === 'fox') {
    // a bat-eared fox: a fox's body, grey-fawn, black-legged, all ears
    const b = fox.build(seed);
    const col = b.mesh.geometry.attributes.color;
    const tint = lin(look.coat);
    for (let i = 0; i < col.count; i++) {
      const c = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i));
      if (c.r > c.b * 1.6) c.lerp(tint, 0.85);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    for (const e of b.sk.ears) e.scale.setScalar(2.2);
    return b;
  }
  const S = look.size;
  const Lb = look.len * 0.55;
  const leg = S * 0.55;
  const d = {
    hipH: S, shoulderH: S * 0.95, bodyLen: Lb, hipW: S * 0.25, shW: S * 0.22,
    hindU: leg * 0.5, hindL: leg * 0.5, foreU: leg * 0.46, foreL: leg * 0.5,
    neck: { y: S * 0.1, z: S * 0.2, len: S * 0.3, angle: look.upright ? 0.4 : 1.0 },
    tail: { y: S * 0.1, z: -S * 0.1, len: look.tail, segs: look.tail > 0.2 ? 4 : 1, rest: look.flatTail ? -0.2 : -0.9, upAngle: 0.5, curl: 0.1, swish: 0.15, swishRate: 1.5, runLift: 0.4 },
    ears: { x: S * 0.18, y: S * 0.2, z: -S * 0.05, back: 0.1, droop: 0.2, runBack: 0.5 },
    trotAt: 0.8, runAt: 2.4, run: 'bound', trot: false, gaitRef: { walk: 0.5, bound: 5 },
    foreKneeFwd: false,
    neckGraze: 1.0, headGraze: 0.2, grazePitch: 0.12, neckAlert: 0.3, headRest: 0.15, nod: 0.04,
    rearAngle: 1.1, rearDrop: 0.2, rearChest: 0.2, rearTuck: 0.8, crouchDrop: 0.35, sitFwd: 0.5, sitBack: 0.2,
  };
  d.hipH = d.hindU + d.hindL + S * 0.35;
  d.shoulderH = d.foreU + d.foreL + S * 0.33;
  const r = new RigBuilder(seed);
  const sk = quadSkeleton(r, d);
  const coat = lin(look.coat);
  const fur = (p, n) => mix(look.legs !== undefined ? lin(look.legs) : mix(coat, lin(0x000000), 0.15), coat, ss(n.y, -0.8, -0.2));
  const W = S * 0.5;
  torso(r, sk, d, { z0: -Lb * 0.75, z1: Lb * 0.75, prof: [[0, W * 0.7, W * 0.75, 0], [0.3, W, W, 0], [0.7, W * 0.95, W * 0.95, 0], [1, W * 0.7, W * 0.7, 0]], color: fur });
  if (look.quills !== undefined) {
    const q = lin(look.quills);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 * 3.7;
      const z = -Lb * 0.6 + (i / 26) * Lb * 1.2;
      r.part(sk.body, cone(S * 0.04, S * 0.7, 3), { matrix: at(Math.sin(a) * W * 0.7, d.hipH * 0 + W * 0.6 + Math.cos(a) * W * 0.2, z + Lb * 0.75, -0.9 + Math.cos(a) * 0.3, 0, Math.sin(a) * 0.6), color: (p) => (p.y > 0.5 ? q : coat), grain: 0 });
    }
  }
  legs(r, sk, {
    color: fur,
    hind: { upper: [S * 0.12, S * 0.09], lower: [S * 0.08, S * 0.07] },
    fore: { upper: [S * 0.1, S * 0.08], lower: [S * 0.07, S * 0.06] },
    foot: paws(look.legs !== undefined ? lin(look.legs) : mix(coat, lin(0x000000), 0.3), S * 0.09, S * 0.05, S * 0.18),
  });
  neck(r, sk, d, W * 0.75, W * 0.6, 1.1, fur);
  const head = sk.head;
  const face = look.face !== undefined ? lin(look.face) : coat;
  r.part(head, ellipsoid(W * 0.7, W * 0.62, W * 0.7), { matrix: at(0, 0, 0), color: (p, n) => (n.z > 0.3 ? face : coat) });
  r.part(head, stick(W * 0.38, W * 0.26, 6), { matrix: along(0, -W * 0.15, W * 0.4, 0, -W * 0.05, W * 0.45, 1, 1), color: face });
  r.part(head, ellipsoid(W * 0.12, W * 0.1, W * 0.08, 5, 4), { matrix: at(0, -W * 0.2, W * 0.88), color: BLACK, grain: 0 });
  eyes(r, head, W * 0.35, W * 0.15, W * 0.5, W * 0.08, BLACK);
  ears(r, sk, { w: look.ears * 0.7, len: look.ears, thin: 0.5, out: 0.6, color: coat, inner: face });
  const rings = look.rings !== undefined ? lin(look.rings) : null;
  tail(r, sk, {
    r0: look.flatTail ? S * 0.25 : S * 0.12,
    r1: look.flatTail ? S * 0.25 : S * 0.05,
    flat: look.flatTail ? 0.2 : 1,
    bush: look.rings !== undefined ? S * 0.12 : 0,
    segs: 6,
    color: (p, n, w, t) => (look.flatTail ? lin(0x2a2420) : rings && Math.sin(t * 10 * Math.PI) > 0 ? rings : coat),
  });
  return { mesh: r.build(), sk, dims: d };
}

// ── A wallaby, which bounds ─────────────────────────────────────────────────
const HOP = {
  hipH: 0.42, shoulderH: 0.3, bodyLen: 0.32, hipW: 0.07, shW: 0.05,
  hindU: 0.2, hindL: 0.24, foreU: 0.13, foreL: 0.15,
  neck: { y: 0.04, z: 0.04, len: 0.12, angle: 0.5 },
  tail: { y: 0.0, z: -0.08, len: 0.5, segs: 4, rest: -0.75, upAngle: 0.2, curl: -0.05, swish: 0.05, swishRate: 1, runLift: 0.3 },
  ears: { x: 0.025, y: 0.05, z: -0.02, back: 0.1, droop: 0.05, runBack: 0.6 },
  trotAt: 9, runAt: 9, run: 'bound', gaitLock: 'bound', gaitRef: { bound: 4 },
  foreKneeFwd: false, hindReach: 0.12,
  neckGraze: 1.1, headGraze: 0.2, grazePitch: 0.15, neckAlert: 0.25, headRest: 0.2, nod: 0.02,
  rearAngle: 0.9, rearDrop: 0.1, rearChest: 0.1, rearTuck: 0.6, sitFwd: 0.3,
};
function hop(look, seed) {
  const d = HOP;
  const r = new RigBuilder(seed);
  const sk = quadSkeleton(r, d);
  const fur = coatOf(look);
  torso(r, sk, d, { z0: -0.26, z1: 0.24, prof: [[0, 0.1, 0.11, 0.0], [0.35, 0.1, 0.12, 0.0], [0.75, 0.07, 0.09, 0.02], [1, 0.05, 0.06, 0.02]], color: fur });
  legs(r, sk, {
    color: fur,
    hind: { upper: [0.05, 0.035], lower: [0.03, 0.022], muscle: [0.07, 0.12, 0.09], muscleY: 0.25 },
    fore: { upper: [0.022, 0.016], lower: [0.015, 0.012] },
    foot: (rr, leg) => rr.part(leg.foot, ellipsoid(leg.fore ? 0.015 : 0.025, 0.015, leg.fore ? 0.025 : 0.11, 5, 4), { matrix: at(0, 0.012, leg.fore ? 0.01 : 0.06), color: lin(0x3a3028) }),
  });
  neck(r, sk, d, 0.045, 0.035, 1.1, fur);
  const head = sk.head;
  r.part(head, ellipsoid(0.045, 0.045, 0.05), { color: fur });
  r.part(head, stick(0.03, 0.018, 6), { matrix: along(0, -0.01, 0.03, 0, -0.01, 0.06, 1, 1), color: fur });
  r.part(head, ellipsoid(0.012, 0.01, 0.008, 5, 4), { matrix: at(0, -0.015, 0.1), color: BLACK, grain: 0 });
  eyes(r, head, 0.03, 0.015, 0.035, 0.008);
  ears(r, sk, { w: 0.025, len: 0.08, thin: 0.4, out: 0.3, color: lin(look.coat), inner: lin(look.belly) });
  tail(r, sk, { r0: 0.04, r1: 0.012, segs: 6, color: (p, n, w) => fur(p, n, w) });
  return { mesh: r.build(), sk, dims: d };
}

// ── Birds on two legs ───────────────────────────────────────────────────────
// A body, a neck in a curve, a head and a beak, and two legs, each a thigh
// and a shank hung from a hip so it can swing: built at the bird's height
// (look.size) and walked by residents.js (walkBird).
const BIRD = {
  flamingo: { leg: 0.55, neck: 0.42, body: [0.13, 0.12, 0.2], s: true, beak: 0.09 },
  ratite: { leg: 0.48, neck: 0.4, body: [0.2, 0.17, 0.26], beak: 0.05 },
  stork: { leg: 0.42, neck: 0.25, body: [0.15, 0.14, 0.24], beak: 0.12 },
  fowl: { leg: 0.25, neck: 0.18, body: [0.2, 0.2, 0.28], beak: 0.05, tail: true },
  duck: { leg: 0.12, neck: 0.2, body: [0.22, 0.17, 0.36], beak: 0.12, flat: true },
};
function bird(look, seed) {
  const B = BIRD[look.form] || BIRD.stork;
  const H = look.size; // m, how tall it stands
  const g = new THREE.Group();
  const mat = animalMaterial;
  const col = (hex) => {
    const c = new THREE.Color(hex);
    return c;
  };
  const coloured = (geo, hex) => {
    const c = col(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const j = 0.92 + hash3(i, seed, 1) * 0.16;
      arr[i * 3] = c.r * j;
      arr[i * 3 + 1] = c.g * j;
      arr[i * 3 + 2] = c.b * j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = H > 0.5;
    return m;
  };
  const legH = H * B.leg;
  const [bx, by, bz] = B.body.map((v) => v * H);
  // the body, its back level at the top of the legs
  const body = new THREE.Group();
  body.position.y = legH + by * 0.6;
  g.add(body);
  const torsoM = coloured(new THREE.SphereGeometry(1, 10, 8).scale(bx, by, bz), look.coat);
  body.add(torsoM);
  if (look.wing !== undefined && look.wing !== look.coat) {
    for (const s of [1, -1]) {
      const w = coloured(new THREE.SphereGeometry(1, 8, 6).scale(bx * 0.35, by * 0.7, bz * 0.85), look.wing);
      w.position.set(s * bx * 0.78, by * 0.15, -bz * 0.05);
      body.add(w);
    }
  }
  if (B.tail || look.form === 'ratite') {
    const t = coloured(new THREE.ConeGeometry(bx * 0.6, bz * 0.8, 6), look.form === 'ratite' ? look.wing : look.wing ?? look.coat);
    t.rotation.x = -Math.PI / 2 - 0.7;
    t.position.set(0, by * 0.5, -bz * 1.05);
    body.add(t);
  }
  if (look.belly !== undefined) {
    const u = coloured(new THREE.SphereGeometry(1, 8, 6).scale(bx * 0.8, by * 0.5, bz * 0.6), look.belly);
    u.position.set(0, -by * 0.45, -bz * 0.2);
    body.add(u);
  }
  // the neck, up from the front of the body, then the head
  const neckG = new THREE.Group();
  neckG.position.set(0, by * 0.3, bz * 0.75);
  body.add(neckG);
  const nl = H * B.neck;
  const nr = Math.max(0.015, bx * (look.form === 'fowl' || look.form === 'duck' ? 0.45 : 0.22));
  const segs = B.s ? [[0, 0.35, 0.3], [0, 0.4, -0.25], [0, 0.35, 0.25]] : [[0, 0.7, 0.25], [0, 0.4, 0.1]];
  let p = new THREE.Vector3();
  for (const [x, y, z] of segs) {
    const dv = new THREE.Vector3(x, y, z).normalize().multiplyScalar(nl / segs.length);
    const s = coloured(new THREE.CylinderGeometry(nr * 0.85, nr, dv.length(), 6), look.neck ?? look.coat);
    s.position.copy(p).addScaledVector(dv, 0.5);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.clone().normalize());
    neckG.add(s);
    p = p.clone().add(dv);
  }
  const head = new THREE.Group();
  head.position.copy(p);
  neckG.add(head);
  const hr = Math.max(0.03, nr * 1.5);
  head.add(coloured(new THREE.SphereGeometry(hr, 8, 6), look.neck ?? look.coat));
  const beakL = H * B.beak;
  const beak = coloured(new THREE.ConeGeometry(hr * (B.flat ? 0.7 : 0.45), beakL, 5), look.beak ?? 0x3a3a3a);
  beak.rotation.x = Math.PI / 2 + (look.form === 'flamingo' ? 0.8 : 0.05);
  beak.position.set(0, look.form === 'flamingo' ? -beakL * 0.3 : -hr * 0.1, hr * 0.8 + beakL * 0.4);
  if (B.flat) beak.scale.set(1.4, 0.4, 1);
  head.add(beak);
  for (const s of [1, -1]) {
    const e = coloured(new THREE.SphereGeometry(hr * 0.18, 5, 4), 0x0a0a0a);
    e.position.set(s * hr * 0.75, hr * 0.25, hr * 0.4);
    head.add(e);
  }
  if (look.crown !== undefined) {
    const c = coloured(new THREE.SphereGeometry(hr * 0.6, 6, 4), look.crown);
    c.position.set(0, hr * 0.55, hr * 0.2);
    head.add(c);
  }
  if (look.comb !== undefined) {
    const c = coloured(new THREE.BoxGeometry(hr * 0.25, hr * 0.8, hr * 1.2), look.comb);
    c.position.set(0, hr * 0.95, 0);
    head.add(c);
  }
  if (look.casque !== undefined) {
    const c = coloured(new THREE.ConeGeometry(hr * 0.6, hr * 1.6, 5), look.casque);
    c.position.set(0, hr * 1.0, hr * 0.1);
    head.add(c);
  }
  if (look.wattle !== undefined) {
    const c = coloured(new THREE.SphereGeometry(hr * 0.5, 6, 4).scale(0.6, 1.4, 0.6), look.wattle);
    c.position.set(0, -hr * 1.4, hr * 0.2);
    head.add(c);
  }
  // legs: a hip each side, a thigh and a shank with a knee between
  const legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * bx * 0.4, legH, 0);
    g.add(hip);
    const lr = Math.max(0.008, H * (look.form === 'ratite' ? 0.035 : 0.012));
    const thigh = coloured(new THREE.CylinderGeometry(lr * 1.3, lr, legH * 0.5, 5), look.form === 'ratite' ? look.legs : look.legs);
    thigh.position.y = -legH * 0.25;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -legH * 0.5;
    hip.add(knee);
    const shank = coloured(new THREE.CylinderGeometry(lr, lr * 0.9, legH * 0.5, 5), look.legs);
    shank.position.y = -legH * 0.25;
    knee.add(shank);
    const foot = coloured(new THREE.BoxGeometry(lr * 4, lr * 0.8, lr * 7), look.legs);
    foot.position.set(0, -legH * 0.5 + lr * 0.4, lr * 2.5);
    knee.add(foot);
    legs.push({ hip, knee });
  }
  return { mesh: g, parts: { body, neck: neckG, head, legs, legH, restY: body.position.y } };
}

// ── Seals and sea lions ─────────────────────────────────────────────────────
// A body tapering to the hind flippers, a head and a snout, and fore
// flippers, built at its length (look.size) and swum by residents.js.
function seal(look, seed) {
  const L = look.size;
  const g = new THREE.Group();
  const base = new THREE.Color(look.coat);
  const mottle = look.mottle !== undefined ? new THREE.Color(look.mottle) : null;
  const geo = new THREE.SphereGeometry(1, 14, 10);
  geo.rotateX(Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i); // -1 tail .. 1 head
    const t = (z + 1) / 2;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)) * (0.85 + 0.15 * t);
    pos.setXYZ(i, pos.getX(i) * w * L * 0.14, pos.getY(i) * w * L * 0.13, z * L * 0.42);
    const c = base.clone().multiplyScalar(pos.getY(i) < 0 ? 1.2 : 1);
    if (mottle && hash3(Math.floor(pos.getX(i) * 20), Math.floor(pos.getY(i) * 20), Math.floor(pos.getZ(i) * 20)) > 0.65) c.lerp(mottle, 0.8);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, animalMaterial);
  body.castShadow = true;
  const head = new THREE.Group();
  head.position.set(0, L * 0.05, L * 0.42);
  const paint = (gg, c) => {
    const n = gg.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]] = [c.r, c.g, c.b];
    gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
    const m = new THREE.Mesh(gg, animalMaterial);
    m.castShadow = true;
    return m;
  };
  head.add(paint(new THREE.SphereGeometry(L * 0.075, 9, 7), base));
  const snout = paint(new THREE.SphereGeometry(L * 0.045, 8, 6).scale(1, 0.8, look.seal ? 1.5 : 1.2), base.clone().multiplyScalar(0.85));
  snout.position.set(0, -L * 0.01, L * 0.07);
  head.add(snout);
  for (const s of [1, -1]) {
    const e = paint(new THREE.SphereGeometry(L * 0.012, 5, 4), new THREE.Color(0x050505));
    e.position.set(s * L * 0.04, L * 0.025, L * 0.05);
    head.add(e);
  }
  const flippers = [];
  for (const s of [1, -1]) {
    const f = paint(new THREE.BoxGeometry(L * (look.seal ? 0.08 : 0.16), L * 0.012, L * 0.07), base.clone().multiplyScalar(0.7));
    const pivot = new THREE.Group();
    pivot.position.set(s * L * 0.1, -L * 0.04, L * 0.2);
    f.position.x = s * L * (look.seal ? 0.04 : 0.08);
    pivot.add(f);
    flippers.push(pivot);
    g.add(pivot);
  }
  const tailF = paint(new THREE.BoxGeometry(L * 0.18, L * 0.012, L * 0.1), base.clone().multiplyScalar(0.7));
  tailF.position.set(0, 0, -L * 0.45);
  g.add(body, head, tailF);
  return { mesh: g, parts: { body, head, flippers, tail: tailF, len: L } };
}

// ── A bird of prey on its perch ────────────────────────────────────────────
function perch(look, seed) {
  const rig = buildBird(look.like, seed, look);
  return { mesh: rig.mesh, parts: { rig } };
}

// ── Reptiles ────────────────────────────────────────────────────────────────
// The forest's alligator, lying low: a Komodo dragon is drawn as one, in its
// own dull colours.
function reptile(look, seed) {
  const g = buildGator(seed, look.size);
  if (look.coat !== undefined) {
    const col = g.mesh.geometry.attributes.color;
    const tint = lin(look.coat);
    for (let i = 0; i < col.count; i++) {
      const c = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).lerp(tint, 0.55);
      col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  return { mesh: g.mesh, parts: { gator: g } };
}

const QUADS = { cat, bear, hoof, elephant, ape, monkey, small, hop };

// One of a kind (species.js), different each seed; variant: { male }.
export function makeBody(kind, seed, variant = {}) {
  const look = kind.look;
  if (QUADS[kind.body]) {
    const b = QUADS[kind.body](look, seed, variant);
    const k = look.form === 'wolf' || look.form === 'fox' ? 1 : look.size / (kind.body === 'small' ? b.dims.shoulderH : b.dims.shoulderH);
    const scale = kind.body === 'small' && look.form !== 'wolf' && look.form !== 'fox' ? 1 : k;
    b.mesh.scale.setScalar(scale * (variant.male ? 1.06 : 0.97));
    b.mesh.rotation.order = 'YXZ';
    return { mesh: b.mesh, form: 'quad', scale: b.mesh.scale.x, quad: { sk: b.sk, dims: b.dims } };
  }
  if (kind.body === 'bird') {
    const b = bird(look, seed);
    return { mesh: b.mesh, form: 'bird', scale: 1, parts: b.parts };
  }
  if (kind.body === 'seal') {
    const b = seal(look, seed);
    return { mesh: b.mesh, form: 'seal', scale: 1, parts: b.parts };
  }
  if (kind.body === 'perch') {
    const b = perch(look, seed);
    return { mesh: b.mesh, form: 'perch', scale: 1, parts: b.parts };
  }
  const b = reptile(look, seed);
  return { mesh: b.mesh, form: 'still', scale: 1, parts: b.parts };
}
