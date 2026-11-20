// Cuts in the ground: a stretch where something else stands in for the
// terrain, and the terrain has to get out of its way — the mouth of a cave,
// where a passage runs into the hillside and the hillside is opened up to let
// it in.
//
// A cut is a passage: a tunnel along a segment a→b in plan, with a floor that
// slopes from fa to fb, w its half-width and h its height, in the shape of an
// arch (archField). Terrain inside one isn't drawn, and nor is grass rooted in
// it; whatever owns the cut draws what is there instead. The terrain is cut a
// little short of the passage's own walls (SHRINK), so that where the two
// meet, the ground overlaps the rock rather than leaving a crack of sky.
// Round the hole, within RIM, the ground is broken rock and no grass grows:
// a brow over the opening, banks either side, an apron in front.
//
//   setCuts([{ ax, az, bx, bz, fa, fb, w, h }, …])   up to MAX_CUTS, nearest first
//
// The same arch is what a cave's passages are carved with (src/caves/), so
// the hole in the hillside and the tunnel behind it are one shape.

import * as THREE from 'three';

export const MAX_CUTS = 4;
export const SHRINK = 0.15; // m: the ground stops this far inside the passage
export const RIM = 2.4; // m round the hole that is bare rock

// The cross-section of a passage: a flat floor, walls that bow out to their
// widest a little above it (SPRING of the height), and a rounded roof.
export const ARCH = { spring: 0.4, below: 1.35 };

// How far outside an arch a point is, roughly in metres: < 0 inside.
//   dl  distance across, from the middle of the passage
//   v   height above its floor
export function archField(dl, v, w, h) {
  const hc = h * ARCH.spring;
  const ey = v > hc ? (v - hc) / (h - hc) : (v - hc) / (hc * ARCH.below);
  const ex = dl / w;
  const e = Math.sqrt(ex * ex + ey * ey) - 1;
  const f = e * Math.min(w, h - hc);
  return f > -v ? f : -v;
}

// archField for a passage { ax, az, bx, bz, fa, fb, w, h } at (x, y, z).
// out (optional) gets t, how far along it the nearest point is (0..1).
export function cutField(x, y, z, c, out = null) {
  const ex = c.bx - c.ax;
  const ez = c.bz - c.az;
  const l2 = ex * ex + ez * ez;
  let t = l2 > 1e-9 ? ((x - c.ax) * ex + (z - c.az) * ez) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (out) out.t = t;
  const dl = Math.hypot(x - c.ax - ex * t, z - c.az - ez * t);
  return archField(dl, y - (c.fa + (c.fb - c.fa) * t), c.w, c.h);
}

// Shared by every material that has to keep out of a cut (see
// world/materials.js): .value is set in place, so one setCuts reaches them all.
// Where a cut starts is a place, so uCutAt is slid with the scene while a
// frame is drawn (world/index.js registers it with game.origin); the rest
// are lengths and heights, which the slide doesn't touch.
export const CUTS = {
  uCutAt: { value: Array.from({ length: MAX_CUTS }, () => new THREE.Vector2()) }, // ax, az
  uCutRun: { value: Array.from({ length: MAX_CUTS }, () => new THREE.Vector2()) }, // bx - ax, bz - az
  uCutB: { value: Array.from({ length: MAX_CUTS }, () => new THREE.Vector4()) }, // fa, fb, w, h (h 0: none)
};

export function setCuts(list) {
  for (let i = 0; i < MAX_CUTS; i++) {
    const c = list[i];
    if (c) {
      CUTS.uCutAt.value[i].set(c.ax, c.az);
      CUTS.uCutRun.value[i].set(c.bx - c.ax, c.bz - c.az);
      CUTS.uCutB.value[i].set(c.fa, c.fb, c.w, c.h);
    } else CUTS.uCutB.value[i].set(0, 0, 1, 0);
  }
}

// groundCut(p): how far drawn point p (modelMatrix * position, which is
// where uCutAt is drawn too) is outside the nearest cut (about m; < 0 inside
// one). inCut(p): is it inside one, SHRINK in from its walls?
// cutRim(f): 0..1, how much of the rock round a hole there is at groundCut f.
export const CUT_GLSL = /* glsl */ `
uniform vec2 uCutAt[${MAX_CUTS}];
uniform vec2 uCutRun[${MAX_CUTS}];
uniform vec4 uCutB[${MAX_CUTS}];
float archField(float dl, float v, float w, float h) {
  float hc = h * ${ARCH.spring.toFixed(3)};
  float ey = v > hc ? (v - hc) / (h - hc) : (v - hc) / (hc * ${ARCH.below.toFixed(3)});
  float f = (length(vec2(dl / w, ey)) - 1.0) * min(w, h - hc);
  return max(f, -v);
}
float groundCut(vec3 p) {
  float best = 1e9;
  for (int i = 0; i < ${MAX_CUTS}; i++) {
    vec4 b = uCutB[i];
    if (b.w <= 0.0) continue;
    vec2 e = uCutRun[i];
    vec2 d = p.xz - uCutAt[i];
    float t = clamp(dot(d, e) / max(dot(e, e), 1e-9), 0.0, 1.0);
    float dl = length(d - e * t);
    best = min(best, archField(dl, p.y - mix(b.x, b.y, t), b.z, b.w));
  }
  return best;
}
bool inCut(vec3 p) {
  return groundCut(p) < -${SHRINK.toFixed(3)};
}
float cutRim(float f) {
  return 1.0 - smoothstep(${(RIM * 0.25).toFixed(3)}, ${RIM.toFixed(3)}, f);
}
`;
