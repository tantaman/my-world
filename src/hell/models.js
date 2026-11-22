// The things that stand, lie and walk on Hell's ground, as shapes: rocks
// and crags, the trees of the wood, tombs, the holes of the simoniacs — and
// the shades themselves, in the few ways they hold themselves. All made of
// simple shapes (sculpt.js), each a geometry to be drawn many times over
// (furnish.js), standing on the origin and facing +z, in metres.
//
// A shade's geometry marks its limbs (aTag: ±1 the legs, ±2 the arms, by
// side), so the material can swing them when it walks (shades.js).

import { Sculpt, vary } from './sculpt.js';
import { mulberry32 } from '../noise.js';

const ROCK = [0.07, 0.066, 0.064];
const BARK = [0.06, 0.048, 0.04];
const THORN = [0.07, 0.055, 0.04];
const LEAF = [0.04, 0.042, 0.03];
const PALE = [0.3, 0.27, 0.25]; // a shade: ashen
const TOMB = [0.11, 0.1, 0.095];

// ── Rock ────────────────────────────────────────────────────────────────────
// A boulder about a metre across: a few squashed balls run together.
export function boulder(seed = 1) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  s.ball(0, 0.32, 0, 0.55, vary(ROCK, rnd()), { sy: 0.7, ry: rnd() * 6 });
  for (let i = 0; i < 3; i++) {
    const a = rnd() * 6.28;
    s.ball(Math.cos(a) * 0.3, 0.22 + rnd() * 0.2, Math.sin(a) * 0.3, 0.3 + rnd() * 0.18, vary(ROCK, rnd()), { sy: 0.75, sx: 1.2, ry: rnd() * 6, rx: rnd() * 0.5 });
  }
  return s.build();
}

// A crag: a broken spire of rock, about 4 m tall.
export function crag(seed = 2) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28;
    const d = i === 0 ? 0 : 0.5 + rnd() * 0.5;
    const h = (i === 0 ? 4 : 1.5 + rnd() * 2.2) * (0.8 + rnd() * 0.4);
    s.drum(Math.cos(a) * d, -0.3, Math.sin(a) * d, 0.12 + rnd() * 0.12, 0.55 + rnd() * 0.3, h, vary(ROCK, rnd()), { sides: 5, rx: (rnd() - 0.5) * 0.3, rz: (rnd() - 0.5) * 0.3, ry: rnd() * 6 });
  }
  return s.build();
}

// ── The wood of the suicides ────────────────────────────────────────────────
// "Not foliage green, but of a dusky colour, not branches smooth, but gnarled
// and intertangled, not apple-trees were there, but thorns with poison."
// A stunted, twisted tree, 4–6 m, its few leaves dark, its twigs thorned.
export function thornTree(seed = 3) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  // a limb, bending as it goes, that forks
  const grow = (from, dir, len, r, depth) => {
    const pts = [from];
    const radii = [r];
    let p = from;
    const d = [...dir];
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      d[0] += (rnd() - 0.5) * 0.9;
      d[2] += (rnd() - 0.5) * 0.9;
      d[1] += (rnd() - 0.45) * 0.5;
      const l = Math.hypot(...d) || 1;
      p = [p[0] + (d[0] / l) * (len / steps), p[1] + (d[1] / l) * (len / steps), p[2] + (d[2] / l) * (len / steps)];
      pts.push(p);
      radii.push(r * (1 - (i / steps) * 0.55));
    }
    s.tube(pts, radii, vary(BARK, rnd(), 0.3), { sides: depth > 1 ? 6 : 4, caps: false });
    const tip = pts[pts.length - 1];
    if (depth > 0) {
      const forks = depth > 1 ? 3 : 2;
      for (let f = 0; f < forks; f++) {
        const a = rnd() * 6.28;
        grow(tip, [Math.cos(a), 0.35 + rnd() * 0.5, Math.sin(a)], len * (0.62 + rnd() * 0.2), radii[steps], depth - 1);
      }
      // a dead stub, broken off
      if (rnd() < 0.6) {
        const a = rnd() * 6.28;
        const m = pts[2];
        s.limb(m, [m[0] + Math.cos(a) * 0.5, m[1] + 0.25, m[2] + Math.sin(a) * 0.5], radii[2] * 0.6, 0.02, vary(THORN, rnd()), { sides: 4, joints: false });
      }
    } else {
      // thorns, and a clot of dusky leaves
      for (let k = 0; k < 3; k++) {
        const m = pts[1 + Math.floor(rnd() * steps)];
        const a = rnd() * 6.28;
        s.limb(m, [m[0] + Math.cos(a) * 0.28, m[1] + (rnd() - 0.3) * 0.3, m[2] + Math.sin(a) * 0.28], 0.025, 0.004, THORN, { sides: 3, joints: false });
      }
      if (rnd() < 0.55) s.ball(tip[0], tip[1], tip[2], 0.3 + rnd() * 0.3, vary(LEAF, rnd(), 0.3), { sy: 0.4, ry: rnd() * 6, coarse: true });
      else s.limb(tip, [tip[0] + (rnd() - 0.5) * 0.7, tip[1] + rnd() * 0.5, tip[2] + (rnd() - 0.5) * 0.7], 0.03, 0.004, THORN, { sides: 3, joints: false });
    }
  };
  const lean = (rnd() - 0.5) * 0.5;
  grow([0, -0.2, 0], [lean, 1, (rnd() - 0.5) * 0.5], 1.9 + rnd() * 0.8, 0.2 + rnd() * 0.08, 2);
  // roots, gripping
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + rnd();
    s.tube([[0, 0.25, 0], [Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4], [Math.cos(a) * 0.9, -0.15, Math.sin(a) * 0.9]], [0.12, 0.08, 0.03], vary(BARK, rnd(), 0.3), { sides: 4, caps: false });
  }
  return s.build();
}

// A leafless tree, pale, for Limbo's meadow and the shores.
export function bareTree(seed = 5) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  const wood = [0.085, 0.08, 0.072];
  const grow = (from, dir, len, r, depth) => {
    const l = Math.hypot(...dir) || 1;
    const to = [from[0] + (dir[0] / l) * len, from[1] + (dir[1] / l) * len, from[2] + (dir[2] / l) * len];
    s.limb(from, to, r, r * 0.6, vary(wood, rnd()), { sides: depth > 1 ? 6 : 4, joints: false });
    if (depth <= 0) return;
    for (let f = 0; f < 3; f++) {
      const a = rnd() * 6.28;
      grow(to, [Math.cos(a) * 0.8, 0.5 + rnd() * 0.7, Math.sin(a) * 0.8], len * (0.6 + rnd() * 0.15), r * 0.6, depth - 1);
    }
  };
  grow([0, -0.2, 0], [(rnd() - 0.5) * 0.2, 1, (rnd() - 0.5) * 0.2], 2.6 + rnd(), 0.2, 3);
  return s.build();
}

// Dead reeds, for the edges of the marsh.
export function reeds(seed = 7) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  for (let i = 0; i < 9; i++) {
    const x = (rnd() - 0.5) * 0.9;
    const z = (rnd() - 0.5) * 0.9;
    const h = 0.9 + rnd() * 1.1;
    s.limb([x, -0.1, z], [x + (rnd() - 0.5) * 0.6, h, z + (rnd() - 0.5) * 0.6], 0.016, 0.006, vary([0.1, 0.09, 0.05], rnd(), 0.3), { sides: 3, joints: false });
  }
  return s.build();
}

// ── Tombs ───────────────────────────────────────────────────────────────────
// A stone chest with its lid lifted and leant against it, and the fire in
// it: "all of their coverings uplifted were". The inside glows (hot).
export function tomb(seed = 11) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  const w = 1.15;
  const l = 2.4;
  const h = 0.95;
  const t = 0.14;
  s.box(0, 0.08, 0, w + 0.3, 0.16, l + 0.3, vary(TOMB, rnd()));
  for (const side of [-1, 1]) {
    s.box(side * (w / 2 - t / 2), 0.16 + h / 2, 0, t, h, l, vary(TOMB, rnd()));
    s.box(0, 0.16 + h / 2, side * (l / 2 - t / 2), w - 2 * t, h, t, vary(TOMB, rnd()));
  }
  // what burns in it: a bed of coals, and the walls lit from inside
  s.box(0, 0.42, 0, w - 2 * t, 0.3, l - 2 * t, [0.3, 0.07, 0.02], { hot: 1 });
  s.box(0, 0.75, 0, w - 2 * t - 0.02, 0.4, l - 2 * t - 0.02, [0.12, 0.04, 0.02], { hot: 0.35 });
  // the lid, shoved off and leaning
  s.box(w / 2 + 0.42, 0.62, (rnd() - 0.5) * 0.3, w + 0.2, 0.16, l + 0.15, vary(TOMB, rnd()), { rz: -1.05 + rnd() * 0.2, ry: (rnd() - 0.5) * 0.15 });
  return s.build();
}

// A hole in the rock of the third ditch, "all of one size, and every one
// was round", with a sinner's legs out of it as far as the calf, and the
// soles of both feet on fire. (The legs kick: aTag marks them.)
export function hole() {
  const s = new Sculpt();
  s.drum(0, -0.05, 0, 0.62, 0.7, 0.2, vary(ROCK, 0.7), { sides: 12 });
  s.drum(0, 0.12, 0, 0.5, 0.5, 0.05, [0.01, 0.01, 0.01], { sides: 12 });
  for (const side of [-1, 1]) {
    s.tag = side;
    s.limb([side * 0.12, 0.05, 0], [side * 0.15, 0.55, 0.04], 0.085, 0.06, PALE);
    s.limb([side * 0.15, 0.55, 0.04], [side * 0.16, 0.98, -0.02], 0.06, 0.045, PALE);
    s.box(side * 0.16, 1.03, 0.05, 0.09, 0.07, 0.24, PALE);
    s.box(side * 0.16, 1.075, 0.05, 0.08, 0.02, 0.22, [0.4, 0.12, 0.03], { hot: 1 });
  }
  s.tag = 0;
  return s.build();
}

// A head and shoulders out of the ice. bow: how far the face is turned down
// (1, the first zone) or back (-1, the third, where their tears freeze).
export function iceHead(bow = 0) {
  const s = new Sculpt();
  s.ball(0, -0.02, 0, 0.3, [0.32, 0.4, 0.46], { sy: 0.4, sx: 1.25 });
  s.limb([0, 0.02, 0], [0, 0.14, bow * 0.04], 0.065, 0.058, PALE, { joints: false });
  s.ball(0, 0.25, bow * 0.1, 0.105, vary(PALE, 0.4), { sy: 1.15, rx: bow * 0.9 });
  return s.build();
}

// ── Shades ──────────────────────────────────────────────────────────────────
// The joints of a body 1.72 m tall, standing, arms hanging: each [x, y, z]
// for the right side (x > 0); the left is its mirror.
const STAND = {
  pelvis: [0, 0.93, 0],
  chest: [0, 1.4, 0],
  neck: [0, 1.5, 0],
  head: [0, 1.63, 0.01],
  hip: [0.09, 0.92, 0],
  knee: [0.1, 0.5, 0.01],
  ankle: [0.1, 0.07, 0],
  toe: [0.1, 0.03, 0.12],
  shoulder: [0.2, 1.42, 0],
  elbow: [0.23, 1.13, -0.02],
  wrist: [0.22, 0.86, 0.04],
};
// How they hold themselves otherwise: whatever differs from standing.
const POSES = {
  stand: {},
  // head down and shoulders in: the weeping, the slow processions
  bowed: { chest: [0, 1.37, 0.08], neck: [0, 1.45, 0.16], head: [0, 1.5, 0.27], elbow: [0.2, 1.1, 0.08], wrist: [0.16, 0.9, 0.2] },
  // leaning into a weight with both arms
  push: { pelvis: [0, 0.86, -0.3], hip: [0.09, 0.85, -0.3], chest: [0, 1.16, 0.06], neck: [0, 1.2, 0.17], head: [0, 1.24, 0.3], shoulder: [0.2, 1.17, 0.08], elbow: [0.22, 1.1, 0.34], wrist: [0.2, 1.08, 0.6], knee: [0.1, 0.46, -0.2], ankle: [0.1, 0.07, -0.55], toe: [0.1, 0.03, -0.43] },
  // arms thrown up: out of the marsh, out of the blood
  raise: { elbow: [0.3, 1.62, 0.06], wrist: [0.24, 1.92, 0.12], head: [0, 1.63, -0.03] },
  // sitting hunched over drawn-up knees
  sit: { pelvis: [0, 0.14, 0], hip: [0.1, 0.14, 0.02], chest: [0, 0.56, 0.14], neck: [0, 0.64, 0.2], head: [0, 0.74, 0.3], shoulder: [0.19, 0.58, 0.14], elbow: [0.24, 0.36, 0.3], wrist: [0.12, 0.44, 0.5], knee: [0.12, 0.5, 0.36], ankle: [0.12, 0.07, 0.55], toe: [0.12, 0.03, 0.67] },
  // lying on the back, arms flung out
  supine: { pelvis: [0, 0.13, 0], hip: [0.09, 0.12, 0], chest: [0, 0.16, 0.46], neck: [0, 0.15, 0.56], head: [0, 0.14, 0.68], shoulder: [0.2, 0.15, 0.47], elbow: [0.46, 0.08, 0.42], wrist: [0.7, 0.06, 0.52], knee: [0.11, 0.14, -0.42], ankle: [0.12, 0.07, -0.84], toe: [0.14, 0.16, -0.86] },
  // face down in the mud
  prone: { pelvis: [0, 0.13, 0], hip: [0.09, 0.12, 0], chest: [0, 0.14, 0.46], neck: [0, 0.12, 0.56], head: [0, 0.1, 0.68], shoulder: [0.2, 0.13, 0.47], elbow: [0.3, 0.07, 0.72], wrist: [0.16, 0.05, 0.9], knee: [0.11, 0.1, -0.42], ankle: [0.11, 0.06, -0.84], toe: [0.11, 0.03, -0.96] },
};

// A shade, as it holds itself in `pose` (a key of POSES).
export function shade(pose = 'stand') {
  const J = { ...STAND, ...POSES[pose] };
  const s = new Sculpt();
  const side = (p, k) => [p[0] * k, p[1], p[2]];
  const flat = pose === 'supine' || pose === 'prone';
  // (a shade is drawn in its hundreds: few sides, coarse joints, one to a bone)
  const B = { sides: 5, joints: 'end', coarse: true };
  // the trunk: hips, belly, chest, shoulders
  s.limb(J.pelvis, J.chest, 0.125, 0.15, PALE, { sides: 6, coarse: true });
  s.ball(J.pelvis[0], J.pelvis[1], J.pelvis[2], 0.15, PALE, { sy: 0.75, sz: flat ? 1 : 0.8, coarse: true });
  s.limb(side(J.shoulder, -0.85), side(J.shoulder, 0.85), 0.085, 0.085, PALE, { sides: 5, coarse: true });
  s.limb(J.chest, J.neck, 0.062, 0.052, PALE, { sides: 5, joints: false });
  s.ball(J.head[0], J.head[1], J.head[2], 0.1, PALE, { sy: 1.18, sz: 1.08 });
  for (const k of [1, -1]) {
    s.tag = k;
    s.limb(side(J.hip, k), side(J.knee, k), 0.078, 0.055, PALE, B);
    s.limb(side(J.knee, k), side(J.ankle, k), 0.052, 0.036, PALE, B);
    s.limb(side(J.ankle, k), side(J.toe, k), 0.04, 0.03, PALE, { sides: 4, joints: false, capped: true });
    s.tag = 2 * k;
    s.limb(side(J.shoulder, k), side(J.elbow, k), 0.05, 0.038, PALE, B);
    s.limb(side(J.elbow, k), side(J.wrist, k), 0.036, 0.03, PALE, B);
  }
  s.tag = 0;
  return s.build();
}

// A hypocrite: hooded, in a cloak "gilded so that it dazzles", and lead
// under the gilt. It walks, slowly; nothing of it swings.
export function cloaked() {
  const s = new Sculpt();
  const gilt = [0.34, 0.25, 0.07];
  s.drum(0, 0, 0, 0.2, 0.42, 1.42, gilt, { sides: 9 });
  s.ball(0, 1.5, 0.05, 0.19, vary(gilt, 0.3), { sy: 1.1 });
  s.drum(0, 1.36, 0.02, 0.17, 0.26, 0.2, vary(gilt, 0.7), { sides: 9 });
  s.ball(0, 1.47, 0.15, 0.1, [0.02, 0.02, 0.02]);
  return s.build();
}

// A great weight, for the fourth circle: a boulder as high as the chest.
export function weight(seed = 13) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  s.ball(0, 0.7, 0, 0.74, vary(ROCK, rnd()), { fine: true, sy: 0.95 });
  for (let i = 0; i < 4; i++) {
    const a = rnd() * 6.28;
    const b = rnd() * 3.14;
    s.ball(Math.cos(a) * Math.sin(b) * 0.5, 0.7 + Math.cos(b) * 0.5, Math.sin(a) * Math.sin(b) * 0.5, 0.34, vary(ROCK, rnd()), { sy: 0.8 });
  }
  return s.build();
}
