// The things that stand, lie and walk on Purgatory's ground, as shapes:
// rushes and flowers, rocks, a burden of stone for the proud, the souls in
// the ways they hold themselves on the mountain; and those who are met
// alone: angels, Cato, the lady on the top, the serpent in the valley. All
// made of simple shapes (render/sculpt.js), standing on the origin and
// facing +z, in metres.
//
// The souls are render/shades.js's, in the poses this mountain asks of
// them (bent double under a stone, sitting against the bank, face down,
// starved), and the colour of them: grey, but not Hell's ash.

import * as THREE from 'three';
import { Sculpt, vary } from '../render/sculpt.js';
import { shade } from '../render/shades.js';
import { mulberry32 } from '../noise.js';

export const SOUL = [0.4, 0.4, 0.42]; // a soul on the mountain: pale grey
const ROCK = [0.17, 0.16, 0.15];
const STEM = [0.07, 0.11, 0.035];
const RUSH = [0.12, 0.15, 0.06];

// ── How the souls hold themselves ───────────────────────────────────────────
// (joints as render/shades.js's POSES have them: what differs from standing)
const POSES = {
  // bent double under a stone, hands up holding it on the back (Canto X:
  // "as to sustain a ceiling or a roof, in place of corbel, oftentimes a
  // figure is seen to join its knees unto its breast")
  stoop: {
    pelvis: [0, 0.8, -0.18],
    hip: [0.09, 0.79, -0.18],
    knee: [0.1, 0.44, 0.06],
    ankle: [0.1, 0.07, -0.06],
    toe: [0.1, 0.03, 0.06],
    chest: [0, 0.98, 0.34],
    neck: [0, 0.95, 0.5],
    head: [0, 0.86, 0.6],
    shoulder: [0.2, 0.99, 0.32],
    elbow: [0.27, 1.16, 0.22],
    wrist: [0.13, 1.24, 0.3],
  },
  // sitting against the bank, shoulder to shoulder, the head leant over
  // onto the next (Canto XIII)
  lean: {
    pelvis: [0, 0.14, 0],
    hip: [0.1, 0.14, 0.02],
    chest: [0, 0.62, -0.06],
    neck: [0, 0.72, -0.05],
    head: [0.07, 0.83, -0.02],
    shoulder: [0.19, 0.6, -0.06],
    elbow: [0.24, 0.36, 0.06],
    wrist: [0.1, 0.3, 0.24],
    knee: [0.12, 0.48, 0.32],
    ankle: [0.12, 0.07, 0.52],
    toe: [0.12, 0.03, 0.64],
  },
  // kneeling, hands together (the valley: "Te lucis ante")
  kneel: {
    pelvis: [0, 0.5, -0.12],
    hip: [0.09, 0.49, -0.12],
    knee: [0.1, 0.06, 0.12],
    ankle: [0.1, 0.07, -0.38],
    toe: [0.1, 0.03, -0.5],
    chest: [0, 0.98, -0.06],
    neck: [0, 1.08, -0.04],
    head: [0, 1.21, -0.02],
    shoulder: [0.19, 1.0, -0.06],
    elbow: [0.16, 0.8, 0.12],
    wrist: [0.03, 0.98, 0.2],
  },
};

// A soul, as it holds itself: a pose of render/shades.js's or of POSES
// above; thin for the starved.
export function soul(pose = 'stand', thin = 1) {
  return shade(POSES[pose] || pose, SOUL, thin);
}

// The stone a proud soul carries on its back, where the stoop holds it.
export function burden(seed = 3) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  s.ball(0, 1.42, 0.28, 0.42, vary([0.36, 0.35, 0.33], rnd()), { sy: 0.75, sx: 1.15, ry: rnd() * 6 });
  s.ball(0.15, 1.5, 0.2, 0.28, vary([0.36, 0.35, 0.33], rnd()), { sy: 0.8, ry: rnd() * 6 });
  return s.build();
}

// ── Plants ──────────────────────────────────────────────────────────────────
// Rushes, where the billow beats the shore: the one plant that grows there,
// "because it yieldeth not unto the shocks".
export function rushes(seed = 7) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  for (let i = 0; i < 14; i++) {
    const x = (rnd() - 0.5) * 0.8;
    const z = (rnd() - 0.5) * 0.8;
    const h = 0.8 + rnd() * 0.9;
    const lean = (rnd() - 0.5) * 0.35;
    s.limb([x, -0.1, z], [x + lean, h, z + (rnd() - 0.5) * 0.35], 0.012, 0.004, vary(RUSH, rnd(), 0.35), { sides: 3, joints: false });
  }
  return s.build();
}

// A clump of flowers in one colour (linear), on their stems, among leaves.
export function flowers(color, seed = 11) {
  const rnd = mulberry32(seed);
  const s = new Sculpt();
  for (let i = 0; i < 10; i++) {
    const x = (rnd() - 0.5) * 0.7;
    const z = (rnd() - 0.5) * 0.7;
    const h = 0.18 + rnd() * 0.32;
    const tip = [x + (rnd() - 0.5) * 0.1, h, z + (rnd() - 0.5) * 0.1];
    s.limb([x, -0.02, z], tip, 0.008, 0.005, vary(STEM, rnd()), { sides: 3, joints: false });
    s.ball(tip[0], tip[1], tip[2], 0.03 + rnd() * 0.025, vary(color, rnd(), 0.25), { sy: 0.55, coarse: true });
    // a leaf or two
    if (rnd() < 0.6) s.ball(x, h * 0.35, z, 0.05, vary(STEM, rnd()), { sy: 0.2, sx: 1.8, ry: rnd() * 6, coarse: true });
  }
  return s.build();
}

// ── Rock ────────────────────────────────────────────────────────────────────
// A boulder about a metre across.
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

// ── Those met alone ─────────────────────────────────────────────────────────
// What shines of itself on them is marked hot (aHot: look.js's figure
// material gives it its light): an angel's face, his hair, a sword.

// An angel, standing, his wings half open: robe, wings, hair in the
// colours given; on the gate's threshold, seated, with a sword (Canto IX);
// in the valley, with "two flaming swords, truncated and deprived of their
// points" (Canto VIII).
export function angel({ robe = [0.9, 0.9, 0.88], wing = [0.92, 0.9, 0.86], seated = false, sword = false, blunt = false } = {}) {
  const s = new Sculpt();
  const face = [0.95, 0.85, 0.7];
  const hair = [0.95, 0.75, 0.3];
  const base = seated ? 0.45 : 0;
  if (seated) {
    // the skirts over the knees, on the threshold
    s.box(0, 0.22, 0.15, 0.6, 0.45, 0.7, robe);
    s.drum(0, 0.4, 0, 0.26, 0.34, 0.75, robe, { sides: 10 });
  } else s.drum(0, 0, 0, 0.24, 0.42, 1.45, robe, { sides: 12 });
  const chest = base + (seated ? 1.05 : 1.45);
  s.drum(0, chest - 0.02, 0, 0.2, 0.25, 0.35, robe, { sides: 10 });
  s.ball(0, chest + 0.5, 0.02, 0.13, face, { sy: 1.15, hot: 1 });
  s.ball(0, chest + 0.58, -0.03, 0.15, hair, { sy: 0.9, hot: 0.6 });
  // arms: one at the side, one raised a little (with the sword, out before him)
  for (const k of [-1, 1]) {
    const sh = [k * 0.24, chest + 0.28, 0];
    const hand = sword && k > 0 ? [k * 0.3, chest - 0.05, 0.42] : [k * 0.3, chest - 0.3, 0.12];
    s.limb(sh, hand, 0.06, 0.045, robe, { sides: 6 });
  }
  if (sword) {
    const tip = blunt ? 0.75 : 1.2;
    s.box(0.3, chest - 0.05 + tip / 2, 0.45, 0.06, tip, 0.02, [0.95, 0.9, 0.7], { hot: blunt ? 1 : 0.5 });
  }
  // the wings: feathered panels, layered, swept back and up
  for (const k of [-1, 1]) {
    for (let f = 0; f < 6; f++) {
      const u = f / 5;
      const root = [k * 0.12, chest + 0.2 - u * 0.1, -0.12];
      const tip = [k * (0.7 + u * 0.55), chest + 0.95 - u * 1.25, -0.45 - u * 0.25];
      const w = 0.16 - u * 0.05;
      s.quad(root, [root[0] + k * 0.02, root[1] - w, root[2]], [tip[0], tip[1] - w * 0.6, tip[2]], tip, vary(wing, (f * 0.37) % 1, 0.12));
    }
  }
  return s.build();
}

// Cato: an old man alone, "a long beard and with white hair intermingled
// he wore", in a plain robe.
export function cato() {
  const s = new Sculpt();
  const robe = [0.32, 0.28, 0.22];
  const skin = [0.55, 0.42, 0.32];
  const white = [0.8, 0.79, 0.76];
  s.drum(0, 0, 0, 0.26, 0.4, 1.4, robe, { sides: 10 });
  s.drum(0, 1.38, 0, 0.21, 0.26, 0.15, robe, { sides: 10 });
  s.ball(0, 1.66, 0.02, 0.12, skin, { sy: 1.15 });
  s.ball(0, 1.72, -0.03, 0.13, white, { sy: 0.85 });
  // the beard, in a double list on his breast
  for (const k of [-1, 1]) s.limb([k * 0.04, 1.6, 0.1], [k * 0.07, 1.25, 0.16], 0.05, 0.02, white, { sides: 5 });
  for (const k of [-1, 1]) s.limb([k * 0.23, 1.45, 0], [k * 0.28, 0.95, 0.08], 0.06, 0.045, robe, { sides: 6 });
  return s.build();
}

// The lady on the far bank of Lethe, "singing and culling floweret after
// floweret": a long dress, and flowers in her hands.
export function lady() {
  const s = new Sculpt();
  const dress = [0.72, 0.62, 0.52];
  const skin = [0.65, 0.5, 0.4];
  const hair = [0.42, 0.24, 0.1];
  s.drum(0, 0, 0, 0.18, 0.44, 1.35, dress, { sides: 12 });
  s.drum(0, 1.33, 0, 0.16, 0.2, 0.15, dress, { sides: 10 });
  s.ball(0, 1.59, 0.02, 0.11, skin, { sy: 1.15 });
  s.ball(0, 1.63, -0.05, 0.12, hair, { sy: 1.1 });
  s.limb([0, 1.6, -0.08], [0, 1.15, -0.14], 0.08, 0.04, hair, { sides: 6 });
  for (const k of [-1, 1]) s.limb([k * 0.18, 1.4, 0], [k * 0.12, 1.0, 0.28], 0.05, 0.04, dress, { sides: 6 });
  for (let i = 0; i < 6; i++) s.ball((i % 3) * 0.05 - 0.05, 1.02 + (i > 2 ? 0.05 : 0), 0.34, 0.035, i % 2 ? [0.85, 0.15, 0.03] : [0.85, 0.75, 0.08], { coarse: true });
  return s.build();
}

// The serpent of the valley, "perchance the same which gave to Eve the
// bitter food": a long body along +z, its head raised a little.
export function serpent() {
  const s = new Sculpt();
  const pts = [];
  const radii = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    pts.push([Math.sin(u * 7) * 0.35 * (1 - u * 0.5), 0.08 + (u > 0.85 ? (u - 0.85) * 2.2 : 0), u * 3.2]);
    radii.push(0.05 + 0.07 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
  }
  s.tube(pts, radii, [0.08, 0.1, 0.05], { sides: 7 });
  return s.build();
}

// The angel's boat (Canto II): "a small vessel, very swift and light, so
// that the water swallowed naught thereof", long and pale.
export function boat() {
  const s = new Sculpt();
  const wood = [0.42, 0.36, 0.28];
  for (let i = 0; i < 8; i++) {
    const z0 = -2.6 + i * 0.65;
    const z1 = z0 + 0.65;
    const w0 = 0.75 * Math.sin((Math.PI * (i + 0.2)) / 8.4);
    const w1 = 0.75 * Math.sin((Math.PI * (i + 1.2)) / 8.4);
    for (const k of [-1, 1]) s.quad([k * w0, 0.15, z0], [k * w1, 0.15, z1], [k * w1 * 0.6, -0.25, z1], [k * w0 * 0.6, -0.25, z0], vary(wood, (i * 0.29) % 1, 0.1));
    s.quad([-w0 * 0.6, -0.25, z0], [w0 * 0.6, -0.25, z0], [w1 * 0.6, -0.25, z1], [-w1 * 0.6, -0.25, z1], vary(wood, 0.3, 0.1));
  }
  return s.build();
}

// What these are drawn with: their own colours, and the light of what
// shines (aHot) in `glow` (linear).
export function createFigureMaterial(glow = [3.2, 2.9, 2.3]) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  const g = glow.map((c) => c.toFixed(3)).join(', ');
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aHot;\nvarying float vHot;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvHot = aHot;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vHot;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(${g}) * vHot;`);
  };
  mat.customProgramCacheKey = () => `figure-${g}`;
  return mat;
}
