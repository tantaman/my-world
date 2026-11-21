// GLSL snippets shared between materials and post-processing.

import { MAX_COUNTRIES } from './uniforms.js';

// ── Points ─────────────────────────────────────────────────────────────────
// A point sprite (a mote, a spark, a drop) the size it really is: size m
// across, dist m off, in pixels of the picture however finely that's drawn;
// never under one, and never over POINT_MOST of the picture's height, since
// one right at the eye would cover it, and a lot of those would choke the
// card. (The shader needs uLines: SHARED.uLines.)
const POINT_MOST = 0.012;
export const POINT_GLSL = /* glsl */ `
uniform float uLines;
float pointPx(float size, float dist) {
  float px = size * projectionMatrix[1][1] * 0.5 * uLines / max(dist, 1.0e-3);
  return clamp(px, 1.0, max(1.0, uLines * ${POINT_MOST}));
}
`;
// In its fragment shader: 1 inside it, fading to 0 at its round edge. A
// point of a pixel or two is too small to be round, and is all inside.
export const POINT_DISC_GLSL = /* glsl */ `
float pointDisc(float px) {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  return px < 2.5 ? 1.0 : 1.0 - smoothstep(0.55, 1.0, r);
}
`;

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm4(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, -9.7);
    a *= 0.5;
  }
  return s / 0.9375;
}
`;

// Sky colour as a function of view direction. Used by the sky dome AND by the
// fog in post-processing so distant hills melt seamlessly into the sky.
export const SKY_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uNight;
uniform float uTime;
`;

export const SKY_GLSL = /* glsl */ `
vec3 skyGradient(vec3 rd) {
  float y = rd.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.4);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.25, y));
  float sd = max(dot(rd, uSunDir), 0.0);
  float sunUp = clamp(uSunDir.y * 5.0 + 0.5, 0.0, 1.0);
  float glow = pow(sd, 5.0) * 0.32 + pow(sd, 40.0) * 0.55;
  col += uSunColor * glow * sunUp;
  return col;
}
`;

// ── Patterns over the world ────────────────────────────────────────────────
// A shader can't be told where in the world a pixel is: far from the middle
// that number is too big for a 32-bit float to hold to the centimetre, which
// is the whole reason the scene is drawn from an origin near the camera
// (origin.js). What it can be told is where the pixel is within a period of a
// few kilometres, which is all a pattern needs so long as the pattern repeats
// on that period. So:
//
//   worldXZ(drawn)    where a drawn position (modelMatrix * position) is in
//                     the world, give or take whole periods
//   wnoise, wfbm4     noise over the world, by cells to the metre. The number
//                     of cells is rounded so a whole number fit the period,
//                     and the lattice wraps there: no seam anywhere, and
//                     nothing changes when the origin moves
//   wave(k)           (JavaScript, for writing a shader) a wavenumber near k
//                     rad/m that comes round after a period, for sin(x * k)
//
// Noise in a frame that turns from pixel to pixel (water running with its
// current) can't repeat on any period; it jumps, once, when the origin
// crosses a period line. That is rare, and water that runs never holds still
// to be compared.

// m. A power of two, so cells-per-period divides out exactly.
export const PERIOD = 4096;

const TAU = Math.PI * 2;
export const wave = (k) => ((Math.round((k * PERIOD) / TAU) * TAU) / PERIOD).toPrecision(9);

export const WORLD_GLSL = /* glsl */ `
uniform vec2 uOrigin; // the drawing origin, wrapped to the period
const float PERIOD = ${PERIOD.toFixed(1)};
vec2 worldXZ(vec3 drawn) { return drawn.xz + uOrigin; }
`;

// (requires NOISE_GLSL and WORLD_GLSL)
export const WORLD_NOISE_GLSL = /* glsl */ `
// Lattice point i brought into 0 .. m-1. (Not mod(): the half keeps the
// division clear of the whole numbers, where a card may round either way.)
vec2 wrapCell(vec2 i, float m) { return i - m * floor((i + 0.5) / m); }
// Value noise whose lattice repeats every m cells.
float tnoise(vec2 p, float m) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(wrapCell(i, m));
  float b = hash12(wrapCell(i + vec2(1.0, 0.0), m));
  float c = hash12(wrapCell(i + vec2(0.0, 1.0), m));
  float d = hash12(wrapCell(i + vec2(1.0, 1.0), m));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// How many cells of a pattern with about f to the metre fit the period.
float cellsIn(float f) { return floor(f * PERIOD + 0.5); }
// Noise at world place wp, about f cells to the metre, shifted off cells.
float wnoise(vec2 wp, float f, vec2 off) {
  float m = cellsIn(f);
  return tnoise(wp * (m / PERIOD) + off, m);
}
float wnoise(vec2 wp, float f) { return wnoise(wp, f, vec2(0.0)); }
float wfbm4(vec2 wp, float f, vec2 off) {
  float s = 0.0;
  float a = 0.5;
  float m = cellsIn(f);
  for (int i = 0; i < 4; i++) {
    s += a * tnoise(wp * (m / PERIOD) + off, m);
    m = floor(m * 2.03 + 0.5);
    off = off * 2.03 + vec2(17.1, -9.7);
    a *= 0.5;
  }
  return s / 0.9375;
}
`;

// Ground albedo from where it is in the world (worldXZ) + masks. Shared by
// the terrain and the grass so blades grow seamlessly out of the ground they
// stand on. (requires NOISE_GLSL, WORLD_GLSL and WORLD_NOISE_GLSL)
//
// land is what a real place says of its own ground (world/country.js): how
// bare (x) and how sandy (y) it is here, and how far it is that country's
// ground at all (z); which is that country's id. The colours are every
// country's, by id, in the LAND uniforms (uniforms.js). In the forest land
// is zero, and none of them shows. y is the height (game m), for a sandstone
// country's beds (its layers), which go by real height: uRealY says how the
// real place you're on stands in the game.
export const GROUND_GLSL = /* glsl */ `
uniform vec3 uTint[${MAX_COUNTRIES}];
uniform vec3 uDirt[${MAX_COUNTRIES}];
uniform vec3 uRock[${MAX_COUNTRIES}];
uniform vec3 uBareA[${MAX_COUNTRIES}];
uniform vec3 uBareB[${MAX_COUNTRIES}];
uniform vec3 uSand[${MAX_COUNTRIES}];
uniform vec3 uUpper[${MAX_COUNTRIES}];
uniform vec4 uLayers[${MAX_COUNTRIES}];
uniform vec2 uRealY;
uniform float uRubble[${MAX_COUNTRIES}];
// Broken stone: a jumble of blocks, from about a metre across down to a
// hand's breadth, their edges wandering, each lit its own way, dark in the
// gaps between. How lit it is (0 in a gap .. 1 on a lit face), and which
// shade of the stone it is (0..1) in id.
float stones(vec2 p, float m, out float id, out float gap) {
  vec2 c = floor(p);
  vec2 f = fract(p);
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 at1 = vec2(0.0);
  id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 k = wrapCell(c + o, m);
      vec2 at = o + 0.1 + 0.8 * vec2(hash12(k), hash12(k + 23.1));
      float d = length(f - at);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        at1 = at;
        id = hash12(k + 7.7);
      } else if (d < d2) d2 = d;
    }
  }
  gap = smoothstep(0.0, 0.05 + 0.12 * fract(id * 5.3), d2 - d1);
  // a face tipped its own way: lighter on one side of the stone than the other
  float a = id * 6.2832;
  float face = dot(f - at1, vec2(cos(a), sin(a)));
  return clamp(0.35 + 0.6 * fract(id * 3.7) + face * 0.5, 0.0, 1.0);
}
float rubble(vec2 wp, out float id) {
  // the edges wander, so no block is a tidy polygon
  vec2 w = wp + (vec2(wnoise(wp, 1.7), wnoise(wp, 1.7, vec2(9.1))) - 0.5) * 0.7;
  float m = cellsIn(1.2);
  float gap;
  float big = stones(w * (m / PERIOD), m, id, gap);
  float m2 = cellsIn(3.1);
  float id2;
  float gap2;
  float small = stones(w * (m2 / PERIOD) + 3.3, m2, id2, gap2);
  // smaller stones fill the low places between the blocks
  float fill = smoothstep(0.45, 0.75, wnoise(wp, 0.45, vec2(4.0)));
  float lit = mix(big * mix(0.25, 1.0, gap), small * mix(0.35, 1.0, gap2) * 0.85, fill);
  id = mix(id, id2, fill);
  return lit;
}
vec3 groundColor(vec2 wp, float y, float pathM, float forestM, float slope, vec3 land, float which) {
  int c = clamp(int(which + 0.5), 0, ${MAX_COUNTRIES} - 1);
  float n1 = wnoise(wp, 0.33);
  float n2 = wnoise(wp, 1.6, vec2(13.0));
  float n3 = wfbm4(wp, 0.045, vec2(-7.0));
  float n4 = wnoise(wp, 4.1, vec2(-3.0));

  // a sandstone country's layers: how far this is its own (0 anywhere else),
  // the real height, and how far up into the pale upper beds, which come in
  // raggedly over a hundred metres or so
  vec4 lay = uLayers[c];
  float layered = lay.w * land.z;
  float yr = (y - uRealY.x) / uRealY.y;
  float up = layered > 0.0 ? smoothstep(lay.x - 50.0, lay.x + 50.0, yr + (n3 - 0.5) * 110.0) : 0.0;

  // meadow grass: green with drifts of dry, golden grass
  vec3 grassA = vec3(0.090, 0.170, 0.032);
  vec3 grassB = vec3(0.200, 0.215, 0.055);
  vec3 grassC = vec3(0.055, 0.120, 0.030);
  vec3 meadow = mix(grassA, grassB, smoothstep(0.45, 0.8, n3) * 0.75);
  meadow = mix(meadow, grassC, smoothstep(0.55, 0.85, n1) * 0.6);
  meadow *= 0.82 + 0.32 * n2;
  meadow *= mix(vec3(1.0), uTint[c], land.z);

  // forest floor: leaf litter, needles and moss
  vec3 litter = vec3(0.080, 0.056, 0.028);
  vec3 needles = vec3(0.110, 0.070, 0.035);
  vec3 moss = vec3(0.045, 0.085, 0.020);
  vec3 floorc = mix(litter, needles, smoothstep(0.3, 0.7, n2));
  floorc = mix(floorc, moss, smoothstep(0.45, 0.75, n1) * 0.8);
  floorc *= 0.78 + 0.4 * n4;

  float forest = clamp(forestM + (n1 - 0.5) * 0.35, 0.0, 1.0);
  vec3 col = mix(meadow, floorc, smoothstep(0.3, 0.9, forest));

  // footpath: packed earth, the odd pebble, worn grassy edges
  float pm = pathM + (n2 - 0.5) * 0.38 + (n4 - 0.5) * 0.18;
  vec3 dirt = mix(vec3(0.200, 0.135, 0.075), uDirt[c], land.z);
  vec3 dirtDark = dirt * 0.58;
  vec3 dirtc = mix(dirt, dirtDark, smoothstep(0.35, 0.8, n2) * 0.7);
  float pebCells = cellsIn(8.0);
  vec2 pq = wp * (pebCells / PERIOD) + vec2(wnoise(wp, 3.0), wnoise(wp, 3.0, vec2(7.0))) * 2.0;
  float peb = step(0.955, hash12(wrapCell(floor(pq), pebCells)));
  dirtc = mix(dirtc, vec3(0.21, 0.18, 0.14), peb * 0.5);
  float edge = smoothstep(0.30, 0.45, pm) * (1.0 - smoothstep(0.45, 0.62, pm));
  col = mix(col, col * 0.62 + dirtDark * 0.3, edge);
  col = mix(col, dirtc, smoothstep(0.45, 0.6, pm));

  // the country's own bare ground (cinder, lava, clay), in patches where
  // it's only partly bare, speckled, and stony here and there. Where it is
  // all bare it is the first of the country's two colours, with drifts of
  // the second; a patch among the grass is the second
  float bareM = smoothstep(0.34, 0.62, land.x + (n2 - 0.5) * 0.42 * (1.0 - land.x));
  // (a path across broken stone is trodden clear of it)
  bareM *= 1.0 - uRubble[c] * smoothstep(0.45, 0.6, pm);
  float first = smoothstep(0.7, 1.0, land.x) * (1.0 - 0.8 * smoothstep(0.38, 0.68, n3 + (n1 - 0.5) * 0.3));
  vec3 bare = mix(uBareB[c], uBareA[c], first) * (0.72 + 0.4 * n4 + 0.16 * n2);
  bare = mix(bare, bare * 1.5 + 0.02, peb * 0.6);
  // (up in the pale beds, the slickrock is pale too)
  bare = mix(bare, uUpper[c] * (0.78 + 0.3 * n4), up * 0.85 * layered);
  // in a country whose bare ground is broken stone (talus), blocks of it
  if (uRubble[c] > 0.0 && bareM > 0.01) {
    float rid;
    float lit = rubble(wp, rid);
    vec3 block = mix(uBareB[c], uBareA[c], 0.3 + 0.7 * rid) * (0.35 + 0.9 * lit);
    // lichen, pale green and rust, here and there on the stone
    block = mix(block, block * vec3(1.05, 1.15, 0.85), smoothstep(0.6, 0.8, fract(rid * 11.3)) * 0.6);
    bare = mix(bare, block, uRubble[c]);
  }
  col = mix(col, bare, bareM);

  // rock on steep slopes
  vec3 rock = mix(vec3(0.16, 0.155, 0.145), uRock[c], land.z) * (0.75 + 0.5 * n2);
  if (layered > 0.0) {
    // sandstone: in beds, each a shade of its own with a darker line where
    // one was laid on the last, swept and tilted the way the dunes that made
    // them lay; and streaked dark down the faces where water runs off the
    // rim (on a cliff, a pattern across the ground is one down the face)
    float b = yr / lay.y + (n3 - 0.5) * 2.6 + (n1 - 0.5) * 0.6;
    float tone = hash12(vec2(floor(b), 7.0));
    float seam = smoothstep(0.8, 0.94, fract(b)) * (1.0 - smoothstep(0.94, 1.0, fract(b)));
    vec3 stone = mix(uRock[c], uUpper[c], up) * (0.8 + 0.32 * tone - 0.25 * seam);
    float streak = smoothstep(0.52, 0.8, wnoise(wp, 0.7, vec2(31.0)) * 0.65 + wnoise(wp, 2.6, vec2(-17.0)) * 0.35);
    stone *= 1.0 - lay.z * streak * 0.65;
    rock = mix(rock, stone * (0.86 + 0.24 * n2), layered);
  }
  col = mix(col, rock, smoothstep(0.30, 0.45, slope + (n1 - 0.5) * 0.12));

  // a beach
  col = mix(col, uSand[c] * (0.82 + 0.3 * n4), smoothstep(0.25, 0.7, land.y + (n2 - 0.5) * 0.2));

  return col;
}
`;

// The water you are under: what it does to light. k is 0 in fresh water and 1
// in the sea, which is clearer, and bluer. (Needs SKY_UNIFORMS_GLSL.)
export const UNDER_GLSL = /* glsl */ `
// how much of the light it takes per metre, reds first
vec3 waterAbsorb(float k) { return mix(vec3(0.42, 0.11, 0.09), vec3(0.33, 0.08, 0.04), k); }
// how thick it is to see through (per metre)
float waterFog(float k) { return mix(0.085, 0.034, k); }
// the light scattered back out of it toward you, from the daylight over it,
// dimmer the deeper you are (depth: m under the surface)
vec3 waterGlow(float k, float depth) {
  vec3 tint = mix(vec3(0.028, 0.06, 0.042), vec3(0.012, 0.055, 0.095), k);
  vec3 day = (uZenith + uHorizon) * 1.1 + uSunColor * max(uSunDir.y, 0.0) * 1.5;
  return tint * day * exp(-depth * waterAbsorb(k) * 0.8);
}
`;
