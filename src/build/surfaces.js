// What the things people build are made of, as the light finds them.
//
// Buildings are made in code from boxes, rods, cylinders and quads, each
// vertex-coloured (geometry.js). What they are made of is said too, vertex by
// vertex: the Mesher records a *surface* for each piece (SURF, below), how
// worn it is, and two numbers that run along the piece's grain and across it
// in metres (aUV). The material here draws each surface from those, with no
// texture anywhere:
//
//   bark      a log's: plates and furrows running its length, lichen here and there
//   end       a cut end: growth rings round the pith, a check or two split in from the bark
//   wood      sawn or hewn: grain along the piece, the odd knot
//   paint     painted boards and trim: brushed, a little glossy, and as it
//             wears, chalky and flaking off to the grey wood under it
//   stone     rough stone: grains and speckles, lumps the light picks out, lichen
//   shingle   wood shingles or shakes: a split every hand's breadth, courses staggered
//   slate     slates: grey, split edges, a sheen
//   tin       corrugated iron: ribs the light runs along, rust coming through and running down
//   glass     smooth, mirroring the sky, dark beyond it
//   iron      dark worked iron
//   steel     galvanized or stainless: smooth and bright, the sky in it, brushed
//             along the sheet; worn (as galvanized is), duller, mottled with
//             its spangle of crystals
//   clay      chinking, mortar and plaster: sandy, crazed with fine cracks
//   cloth     canvas, a weave
//   facade    a building's wall in a city: brick, stone or render, with its
//             windows in rows, storey over storey, lit here and there at
//             night. Its grain runs along the wall, level, and up it from
//             the foot of the building (a city's walls write their own:
//             src/washington/), and its wear is which kind of front it is:
//             FACADE
//   earth     a town's street of packed earth or gravel: ruts where the wheels
//             run, stones pressed in, scuffed, darker where the rain stands.
//             Its grain runs along the street from its end, and across it from
//             its middle; with wear, it's going back to grass
//   pavers    brick laid flat underfoot, in courses: a city's brick sidewalk
//
// A material can also be given photographs of real surfaces (render/photos.ts)
// for some of these, which then take the place of the code's fine pattern
// (a brick wall's courses) or lie over it (a concrete sidewalk's flags keep
// their joints): createBuildingMaterial({ photos: { brick, stone, ... } }),
// each a photo(). As everywhere, the photo is detail round the colour the
// code gave the surface, never the colour itself. Which surface each is for:
//
//   brick     a row house's front (facade, FACADE.row), and masonry of brick
//   stone     the other fronts (stone, and between a glass front's bands),
//             and masonry of stone
//   pavers    pavers
//   asphalt   asphalt, laid from above
//   concrete  concrete, laid from above
//
// Each sets how the surface stands up and down (bumped into its normal), how
// rough and how metallic it is, and what it does to the vertex colour. As
// a pattern gets finer than a pixel or two it fades out rather than shimmer.
// With wear, whatever faces the sky grows moss and lichen and the faces of
// walls streak where the rain runs down them.
//
// A piece's surface is `mesher.surf` while it is added (or one passed for it):
//
//   m.surf = SURF.paint; m.wear = decay;   ...add pieces...
//
// A Mesher's geometry that never said anything is all `plain`: it gets a
// little mottling and nothing else.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { SHARED, SKY } from '../render/uniforms.js';
import { CUTS, CUT_GLSL } from '../world/cuts.js';
import { PHOTO_GLSL } from '../render/photos.ts';

export const SURF = {
  plain: 0,
  bark: 1,
  end: 2,
  wood: 3,
  paint: 4,
  stone: 5,
  shingle: 6,
  slate: 7,
  tin: 8,
  glass: 9,
  iron: 10,
  clay: 11,
  cloth: 12,
  steel: 13,
  facade: 14,
  asphalt: 15,
  concrete: 16,
  masonry: 17,
  earth: 18,
  pavers: 19,
};
// The kinds of front a facade is, as its wear (0..1): a row house's, brick,
// its windows tall and narrow; an older office's or a government building's,
// stone, its windows in a grid; and a newer office's, its floors banded in
// glass.
export const FACADE = { row: 0.1, stone: 0.45, glass: 0.8 };
// For a flat face (Mesher.tris), its grain runs across it, level, unless it
// is marked as standing upright (an upright board): surf | UPRIGHT.
export const UPRIGHT = 64;

// m: how far each surface stands proud of itself at the most, for the light
const RELIEF = { bark: 0.005, wood: 0.0012, paint: 0.0006, stone: 0.012, shingle: 0.004, slate: 0.0015, tin: 0.009, clay: 0.002, end: 0.0015, earth: 0.08 };
// m: how far apart a street's ruts run either side of the middle of a cart's
// track (half its wheels' gauge), and the cells it may have a stone in
const EARTH = { gauge: 0.78, stones: 0.18 };
// m: the side of a concrete sidewalk's flags, between its joints
const CONCRETE = { flag: 1.5 };
// m: a paver's length and width, as it's laid
const PAVER = { long: 0.2, wide: 0.1 };
// How each photograph lies over its surface (the `photos` a material is
// given): how much of the photo's own hue comes through (0..1, the rest the
// code's colour), how much its light and dark are deepened (over 1), how far
// its lumps tip the normal, and whether it's laid twice (`twice`, below).
const PHOTO_LOOK = {
  brick: { sat: 0.55, contrast: 1.1, bump: 0.7 },
  stone: { sat: 0.25, contrast: 1.2, bump: 0.45 },
  pavers: { sat: 0.3, contrast: 1.1, bump: 0.7 },
  asphalt: { sat: 0.15, contrast: 1.15, bump: 0.55, twice: true },
  concrete: { sat: 0.2, contrast: 1.1, bump: 0.45, twice: true },
};
// A photo with something in it the eye can follow (a crack across a street)
// shows it coming round again every few metres, a stripe of them down the
// street. One laid twice is laid again turned (rad) and smaller, and the
// second shows through the first in patches of the world `patch` m across:
// no crack comes round in step. (Not for a photo with courses in it, which
// mustn't turn.)
const TWICE = { turn: 1.13, smaller: 0.79, patch: 5 };
// The rooms seen through a facade's windows: how deep they are at the least
// (m, and up to 2 m more), how much of the storey the floor takes up (m), how
// many bays an open office floor runs before a wall, how far in behind the
// glass the blinds hang (m), how much of the daylight outside comes in at
// the window and how fast it dies away into the room (per m), and the share
// of an office's rooms with the ceiling lights on all day.
const ROOM = { deep: 3.5, slab: 0.35, officeBays: 4, blind: 0.08, daylight: 0.6, fall: 0.26, officeLit: 0.55 };

const SURF_GLSL = /* glsl */ `
${Object.entries(SURF)
  .map(([k, v]) => `const int S_${k.toUpperCase()} = ${v};`)
  .join('\n')}
// How much of a pattern whose features are s m across shows, when a pixel
// covers fw m: all of it at four pixels, none at one and a half.
float shows(float s, float fw) { return smoothstep(1.5, 4.0, s / max(fw, 1e-5)); }
// Value noise stretched along x by k.
float streak(vec2 p, float k) { return vnoise(vec2(p.x / k, p.y)); }
// A cell of a staggered grid: (which, where in it 0..1). Each row of height
// h is shifted by a random amount, and its pieces are w ± a quarter wide.
vec4 courses(vec2 uv, float w, float h) {
  float row = floor(uv.y / h);
  float x = uv.x / w + hash12(vec2(row, 3.7)) * 7.0;
  // each piece its own width: move the joints about within a quarter
  float c = floor(x);
  float j = (hash12(vec2(c, row)) - 0.5) * 0.5;
  float c2 = floor(x - j);
  return vec4(c2, row, fract(x - j), fract(uv.y / h));
}
`;

// The GLSL for a material's photographs: for each it was given (by name, as
// PHOTO_LOOK), its textures, PHOTO_<NAME> defined, and
//   vec3 photo_<name>(at, dx, dy, out tip)
// at a point in metres (dx, dy: its change from pixel to pixel), what to
// multiply the surface's colour by; and tip, which way its lumps lean along
// the two directions `at` runs, as far as they're to tip the normal.
function photoGlsl(photos) {
  const names = Object.keys(photos);
  if (!names.length) return '';
  const one = (n) => {
    const l = PHOTO_LOOK[n];
    const m = photos[n].metres.toFixed(6);
    const [c, sn, k] = [Math.cos(TWICE.turn), Math.sin(TWICE.turn), 1 / TWICE.smaller];
    // (the second lay, its (u, v) turned from the first's, and its lumps
    // turned back into the first's frame)
    const again = l.twice
      ? `
  mat2 R = mat2(${c.toFixed(6)}, ${sn.toFixed(6)}, ${(-sn).toFixed(6)}, ${c.toFixed(6)});
  vec2 uv2 = R * uv * ${k.toFixed(6)} + vec2(0.37, 0.61);
  vec2 dx2 = R * dx * ${k.toFixed(6)}, dy2 = R * dy * ${k.toFixed(6)};
  float w = smoothstep(0.3, 0.7, wnoise(at, ${(1 / TWICE.patch).toFixed(4)}, vec2(${n.length}.3)));
  shade = mix(shade, photoShade(tPhoto_${n}, tPhoto_${n}Arm, uv2, dx2, dy2, ${l.sat.toFixed(3)}), w);
  tip = mix(tip, photoTilt(tPhoto_${n}Nor, uv2, dx2, dy2) * R, w);`
      : '';
    return `#define PHOTO_${n.toUpperCase()}
uniform sampler2D tPhoto_${n};
uniform sampler2D tPhoto_${n}Arm;
uniform sampler2D tPhoto_${n}Nor;
vec3 photo_${n}(vec2 at, vec2 dx, vec2 dy, out vec2 tip) {
  vec2 uv = at / ${m};
  dx /= ${m};
  dy /= ${m};
  tip = photoTilt(tPhoto_${n}Nor, uv, dx, dy);
  vec3 shade = photoShade(tPhoto_${n}, tPhoto_${n}Arm, uv, dx, dy, ${l.sat.toFixed(3)});${again}
  tip *= ${l.bump.toFixed(3)};
  return pow(shade, vec3(${l.contrast.toFixed(3)}));
}`;
  };
  return `#define PHOTOS\n${PHOTO_GLSL}\n${names.map(one).join('\n')}\n`;
}

// cut: whether it gives way, as the ground does, where the ground is cut
// (world/cuts.js): a city's paving, over the well of a Metro entrance.
// photos: { brick, stone, pavers, asphalt, concrete } (any of them), each a
// photo() (render/photos.ts) to lay over that surface; see above.
export function createBuildingMaterial({ side = THREE.DoubleSide, roadGrade = false, cut = false, photos = null } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side });
  const shots = Object.fromEntries(Object.entries(photos || {}).filter(([n, p]) => p && PHOTO_LOOK[n]));
  // (which, by surface: for whoever asks what it's drawn with)
  mat.userData.photos = Object.fromEntries(Object.entries(shots).map(([n, p]) => [n, p.id]));
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY, { uOrigin: SHARED.uOrigin }, cut ? CUTS : {});
    for (const [n, p] of Object.entries(shots)) {
      Object.assign(shader.uniforms, { [`tPhoto_${n}`]: { value: p.map }, [`tPhoto_${n}Arm`]: { value: p.arm }, [`tPhoto_${n}Nor`]: { value: p.normal } });
    }
    if (roadGrade) {
      shader.uniforms.uRoadPlayer = SHARED.uPlayer;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        uniform vec2 uOrigin;
        uniform vec3 uRoadPlayer;
        attribute vec2 aRoadGrade;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 wRoad = (modelMatrix * vec4(transformed, 1.0)).xz + uOrigin;
        vec2 roadRing = abs(floor(wRoad / ${CONFIG.chunkSize.toFixed(1)}) - floor((uRoadPlayer.xz + uOrigin) / ${CONFIG.chunkSize.toFixed(1)}));
        float ring = max(roadRing.x, roadRing.y);
        if (ring >= 2.0) transformed.y += ring < 3.0 ? aRoadGrade.x : aRoadGrade.y;`);
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSurf;
        attribute vec2 aUV;
        flat varying float vSurf;
        varying vec2 vUV;
        varying vec3 vWPos;
        varying vec3 vWNormal;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vSurf = aSurf;
        vUV = aUV;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${SKY_UNIFORMS_GLSL}
        flat varying float vSurf;
        varying vec2 vUV;
        varying vec3 vWPos; // as drawn: see worldXZ
        varying vec3 vWNormal;
        ${NOISE_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${SKY_GLSL}
        ${SURF_GLSL}
        ${photoGlsl(shots)}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        int kind = int(floor(vSurf + 0.001));
        float wear = fract(vSurf + 0.001);
        vec2 uv = vUV;
        float fw = max(length(dFdx(uv)), length(dFdy(uv))); // m a pixel, across the surface
        vec3 wn = normalize(vWNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float relief = 0.0; // how far it stands proud here (m)
        float glazing = 0.0; // how much of it is window glass (a facade's)
        float rough = 0.85;
        float metal = 0.0;
        vec3 col = diffuseColor.rgb;
        #ifdef PHOTOS
        // The photographs: where on each the pixel is and how far a pixel
        // spans, worked out here before any branch (photos.ts). Those laid
        // from above (pg) run u along the world's x and v against its z; the
        // rest (uv) run as the surface's own grain does, whose directions in
        // the world are pT and pB. What their lumps do to the normal is
        // photoBend (in the world), added to it below.
        vec3 photoBend = vec3(0.0);
        vec2 photoTip = vec2(0.0);
        vec2 pgw = worldXZ(vWPos);
        vec2 pg = vec2(pgw.x, -pgw.y);
        vec3 pdx = dFdx(vWPos), pdy = dFdy(vWPos);
        vec2 pgdx = vec2(pdx.x, -pdx.z), pgdy = vec2(pdy.x, -pdy.z);
        vec2 pudx = dFdx(uv), pudy = dFdy(uv);
        vec3 pc1 = cross(pdy, wn), pc0 = cross(wn, pdx);
        vec3 pT = pc1 * pudx.x + pc0 * pudy.x;
        vec3 pB = pc1 * pudx.y + pc0 * pudy.y;
        float pScale = inversesqrt(max(max(dot(pT, pT), dot(pB, pB)), 1e-20));
        pT *= pScale;
        pB *= pScale;
        #endif

        if (kind == S_BARK) {
          // plates and furrows along the log, wandering, broken across
          vec2 q = uv + vec2(0.0, vnoise(uv * vec2(1.3, 9.0)) * 0.03);
          float plates = streak(q * vec2(1.0, 18.0), 0.16);
          float fine = streak(q * vec2(1.0, 55.0) + 11.0, 0.06);
          // the furrows between the plates, dark and deep
          float furrow = 1.0 - smoothstep(0.18, 0.42, plates);
          float h = (plates * 0.75 + fine * 0.25 * shows(0.018, fw)) * shows(0.05, fw);
          col *= mix(1.0, mix(0.5, 1.25, h) * (1.0 - 0.45 * furrow), shows(0.05, fw));
          relief = (h - furrow * 0.6) * ${RELIEF.bark};
          // lichen: grey-green patches
          float li = smoothstep(0.66, 0.8, vnoise(uv * vec2(2.2, 4.0) + 31.0)) * shows(0.08, fw);
          col = mix(col, vec3(0.2, 0.23, 0.17), li * 0.55);
          rough = 0.93;
        } else if (kind == S_END) {
          // the heart, darker and warmer, then rings round the pith, a
          // little out of round; and checks split in from the outside
          vec2 q = uv + (vec2(vnoise(uv * 9.0), vnoise(uv * 9.0 + 5.0)) - 0.5) * 0.02;
          float r = length(q);
          float heart = 1.0 - smoothstep(0.05, 0.1, r + (vnoise(uv * 14.0) - 0.5) * 0.02);
          col = mix(col, col * vec3(0.78, 0.62, 0.5), heart * 0.6);
          float ring = fract(r * 34.0);
          float late = smoothstep(0.6, 0.95, ring) * shows(0.03, fw);
          float fine = smoothstep(0.5, 0.9, fract(r * 120.0)) * shows(0.008, fw);
          col *= (1.0 - 0.2 * late) * (1.0 - 0.1 * fine);
          float a = atan(q.y, q.x);
          float check = smoothstep(0.9, 0.99, vnoise(vec2(a * 3.0, 1.7))) * smoothstep(0.02, 0.09, r) * shows(0.01, fw);
          float saw = streak(vec2(uv.x * 40.0, uv.y * 2.0), 1.0) * shows(0.02, fw);
          col *= (1.0 - 0.6 * check) * (0.92 + 0.12 * saw);
          relief = (late * 0.4 - check * 1.5 + saw * 0.3) * ${RELIEF.end};
          rough = 0.95;
        } else if (kind == S_WOOD || kind == S_PAINT) {
          // the grain along it: long streaks, now and then swirling round a knot
          vec2 kc = floor(uv * vec2(1.2, 4.0));
          vec2 kf = fract(uv * vec2(1.2, 4.0)) - vec2(0.2 + 0.6 * hash12(kc + 1.3), 0.5);
          float hasKnot = step(0.8, hash12(kc));
          float kd = length(kf * vec2(1.0 / 1.2, 1.0 / 4.0) * vec2(1.0, 2.2));
          float swirl = hasKnot * exp(-kd * 25.0);
          vec2 g = uv + vec2(0.0, swirl * 0.04 * sign(kf.y));
          // fine grain, the figure the growth rings make on a sawn face, and
          // long streaks where the weather has got into it
          float grain = streak(vec2(g.x, g.y * 70.0 + vnoise(g * vec2(0.8, 6.0)) * 6.0), 0.35);
          float figure = streak(vec2(g.x, g.y * 16.0 + vnoise(g * vec2(1.5, 3.0)) * 2.5), 0.5);
          float weathered = streak(vec2(g.x, g.y * 5.0 + 3.0), 1.4);
          float knot = hasKnot * (1.0 - smoothstep(0.012, 0.026, kd)) * shows(0.03, fw);
          float knotRing = hasKnot * smoothstep(0.012, 0.02, kd) * (1.0 - smoothstep(0.02, 0.04, kd)) * shows(0.03, fw);
          if (kind == S_WOOD) {
            float f = mix(0.5, figure, shows(0.03, fw)) * 0.7 + mix(0.5, grain, shows(0.007, fw)) * 0.3;
            col *= (0.72 + 0.5 * f) * (0.85 + 0.3 * weathered) * (1.0 - 0.65 * knot) * (1.0 - 0.25 * knotRing);
            relief = (f - knot) * ${RELIEF.wood};
            rough = 0.78;
          } else {
            // paint: brushed along the board, a little sheen; with wear,
            // chalky, then flaking off in patches down to grey wood
            float show = shows(0.006, fw);
            float brush = streak(vec2(uv.x, uv.y * 40.0), 0.25) * shows(0.01, fw);
            col *= 0.96 + 0.06 * brush;
            float chalk = vnoise(uv * vec2(3.0, 6.0) + 17.0);
            col = mix(col, col * 0.88 + 0.03, wear * chalk);
            float flake = smoothstep(0.58, 0.62, vnoise(uv * vec2(4.0, 9.0)) * 0.7 + vnoise(uv * 23.0) * 0.3 + wear * 0.55 - 0.45) * step(0.05, wear);
            vec3 bare = vec3(0.16, 0.15, 0.13) * (0.75 + 0.4 * grain);
            col = mix(col, bare, flake);
            relief = (grain * show * 0.3 + brush * 0.3 + (1.0 - flake) * 0.6) * ${RELIEF.paint};
            rough = mix(mix(0.45, 0.75, wear), 0.85, flake);
          }
        } else if (kind == S_STONE) {
          float big = vnoise(uv * 3.1 + 5.0);
          float mid = vnoise(uv * 11.0 + 9.0);
          float grit = hash12(floor(uv * 300.0)) * shows(0.0035, fw);
          float h = big * 0.6 + mid * 0.3 * shows(0.08, fw) + grit * 0.1;
          col *= 0.72 + 0.5 * h;
          // a speckle of dark and light grains
          col *= 1.0 + (step(0.94, grit) * 0.35 - step(grit, 0.06) * 0.35) * shows(0.0035, fw);
          // lichen, pale grey-green and rust, in rounded patches
          float li = smoothstep(0.62, 0.72, vnoise(uv * 4.3 + 21.0) * 0.7 + mid * 0.3);
          col = mix(col, mix(vec3(0.3, 0.32, 0.24), vec3(0.42, 0.25, 0.1), step(0.5, hash12(floor(uv * 4.3)))), li * 0.45 * shows(0.06, fw));
          relief = h * ${RELIEF.stone};
          rough = 0.92;
        } else if (kind == S_SHINGLE || kind == S_SLATE) {
          bool slate = kind == S_SLATE;
          // u along the course, v up the roof
          vec4 c = courses(uv, slate ? 0.25 : 0.17, slate ? 0.13 : 0.17);
          float id = hash12(c.xy);
          float gap = smoothstep(0.0, 0.05, c.z) * (1.0 - smoothstep(0.95, 1.0, c.z));
          float butt = smoothstep(0.0, 0.08, c.w); // the thick end of each, lowest
          float show = shows(0.05, fw);
          if (slate) {
            col *= mix(1.0, (0.82 + 0.3 * id) * (0.7 + 0.3 * gap), show);
            relief = (gap * 0.6 + butt * 0.4) * ${RELIEF.slate} * show;
            rough = 0.55 + 0.25 * id;
          } else {
            float grain = streak(vec2(uv.y + id * 9.0, uv.x * 60.0), 0.2) * shows(0.008, fw);
            col *= mix(1.0, (0.78 + 0.4 * id) * (0.62 + 0.38 * gap) * (0.85 + 0.2 * grain), show);
            relief = (gap * 0.5 + (1.0 - c.w) * 0.5 + grain * 0.2) * ${RELIEF.shingle} * show;
            rough = 0.88;
          }
        } else if (kind == S_TIN) {
          // ribs across the sheet, every 7.6 cm, and rust come through and
          // running down from the laps
          float rib = sin(uv.x * ${((2 * Math.PI) / 0.076).toFixed(3)});
          relief = rib * ${RELIEF.tin} * shows(0.03, fw);
          float runs = streak(vec2(uv.y, uv.x * 30.0), 0.6);
          float rust = smoothstep(0.45, 0.85, vnoise(uv * vec2(2.0, 3.0)) * 0.6 + runs * 0.4 + wear * 0.4);
          col = mix(col, vec3(0.2, 0.075, 0.03) * (0.7 + 0.5 * runs), rust * (0.3 + 0.7 * wear));
          metal = mix(0.75, 0.1, rust);
          rough = mix(0.42, 0.9, rust);
        } else if (kind == S_GLASS) {
          // old glass is never quite flat
          relief = vnoise(uv * 3.0) * 0.0006;
          col = mix(col, col * 0.7, smoothstep(0.5, 0.9, vnoise(uv * 7.0 + 3.0)) * 0.4); // and never quite clean
          rough = 0.06;
        } else if (kind == S_IRON) {
          float pit = vnoise(uv * 40.0) * shows(0.02, fw);
          col *= 0.8 + 0.35 * pit;
          col = mix(col, vec3(0.16, 0.07, 0.035), smoothstep(0.6, 0.8, vnoise(uv * 5.0)) * 0.6);
          relief = pit * 0.0008;
          metal = 0.55;
          rough = 0.6;
        } else if (kind == S_STEEL) {
          float spangle = vnoise(uv * 9.0) * shows(0.05, fw);
          float brush = streak(vec2(uv.x * 0.6, uv.y * 140.0), 0.8) * shows(0.004, fw);
          col *= mix(0.94 + 0.1 * brush, 0.86 + 0.24 * spangle, wear);
          relief = brush * 0.0002 * (1.0 - wear);
          metal = mix(0.7, 0.3, wear);
          rough = mix(0.26, 0.55, wear);
        } else if (kind == S_CLAY) {
          float sand = hash12(floor(uv * 400.0)) * shows(0.0025, fw);
          float crack = (1.0 - smoothstep(0.0, 0.03, abs(vnoise(uv * 14.0) - 0.5))) * shows(0.02, fw);
          col *= (0.88 + 0.2 * sand) * (1.0 - 0.35 * crack);
          relief = (sand * 0.4 - crack) * ${RELIEF.clay};
          rough = 0.97;
        } else if (kind == S_ASPHALT || kind == S_CONCRETE) {
          vec2 p = worldXZ(vWPos);
          float aggregate = wnoise(p, 24.0) * shows(0.04, fw);
          float wearPattern = wnoise(p, 0.38) * 0.7 + wnoise(p, 1.9) * 0.3;
          col *= 0.87 + 0.23 * wearPattern + 0.12 * aggregate;
          rough = 0.94;
          // (photographed, the grit and the patches between the code's wear)
          #ifdef PHOTO_ASPHALT
          if (kind == S_ASPHALT) {
            col *= photo_asphalt(pg, pgdx, pgdy, photoTip);
            photoBend = vec3(photoTip.x, 0.0, -photoTip.y);
          }
          #endif
          #ifdef PHOTO_CONCRETE
          if (kind == S_CONCRETE) {
            col *= photo_concrete(pg, pgdx, pgdy, photoTip);
            photoBend = vec3(photoTip.x, 0.0, -photoTip.y);
          }
          #endif
          if (kind == S_CONCRETE) {
            // Laid in flags, scored a joint every metre and a half each way:
            // each flag a shade of its own, dirt gathered in the joints, and
            // dark stains here and there (gum, oil, where it stays wet).
            vec2 f = uv / ${CONCRETE.flag.toFixed(2)};
            vec2 cell = floor(f);
            vec2 e = abs(fract(f) - 0.5) * ${CONCRETE.flag.toFixed(2)};
            float edgeIn = ${(CONCRETE.flag / 2).toFixed(3)} - max(e.x, e.y); // m in from the flag's edge
            float joint = (1.0 - smoothstep(0.004, 0.012 + fw, edgeIn)) * shows(0.03, fw);
            col *= mix(1.0, 0.88 + 0.2 * hash12(cell + 0.5), shows(0.5, fw));
            col *= 1.0 - 0.4 * joint;
            float stain = smoothstep(0.6, 0.85, wnoise(p, 0.7) * 0.55 + wnoise(p, 3.1) * 0.45);
            col *= 1.0 - 0.22 * stain;
            relief = -joint * 0.004;
          }
          if (kind == S_ASPHALT && wear > 0.5) {
            // The survey gives the outline. Only straight, regular street blocks carry inferred paint.
            float aa = max(fwidth(uv.y) * 0.5, 0.008);
            float stroke = 1.0 - smoothstep(0.045 - aa, 0.045 + aa, abs(uv.y));
            float dash = min(fract(uv.x / 9.0), 1.0 - fract(uv.x / 9.0));
            float ends = min(uv.x, (wear - 0.501) * 1000.0 - uv.x);
            float paint = stroke * (1.0 - smoothstep(0.17, 0.19, dash)) * smoothstep(4.0, 5.0, ends) * shows(0.12, fw);
            col = mix(col, vec3(0.66, 0.43, 0.085) * (0.8 + wearPattern * 0.3), paint);
          }
        } else if (kind == S_MASONRY) {
          bool brick = wear > 0.2;
          #ifdef PHOTO_BRICK
          if (brick) {
            col *= photo_brick(uv, pudx, pudy, photoTip);
            photoBend = pT * photoTip.x + pB * photoTip.y;
          } else
          #endif
          {
            vec4 course = courses(uv, brick ? 0.22 : 1.05, brick ? 0.076 : 0.47);
            float joint = min(min(course.z, 1.0 - course.z), course.w);
            float seam = (1.0 - smoothstep(0.014, brick ? 0.06 : 0.028, joint)) * shows(brick ? 0.035 : 0.12, fw);
            float shade = mix(1.0, 0.92 + hash12(course.xy) * 0.16, shows(brick ? 0.075 : 0.42, fw));
            col = mix(col * shade, col * (brick ? 1.34 : 0.71), seam * 0.62);
            relief = -seam * (brick ? 0.004 : 0.008);
            #ifdef PHOTO_STONE
            if (!brick) {
              col *= photo_stone(uv, pudx, pudy, photoTip);
              photoBend = pT * photoTip.x + pB * photoTip.y;
            }
            #endif
          }
          rough = 0.92;
        } else if (kind == S_PAVERS) {
          // Brick laid flat in courses, each its own shade, sand in the
          // joints; or a photograph of them, laid from above.
          #ifdef PHOTO_PAVERS
          col *= photo_pavers(pg, pgdx, pgdy, photoTip);
          photoBend = vec3(photoTip.x, 0.0, -photoTip.y);
          #else
          vec4 c = courses(uv, ${PAVER.long.toFixed(2)}, ${PAVER.wide.toFixed(2)});
          float joint = min(min(c.z, 1.0 - c.z) * ${PAVER.long.toFixed(2)}, min(c.w, 1.0 - c.w) * ${PAVER.wide.toFixed(2)}); // m in from the paver's edge
          float sand = (1.0 - smoothstep(0.002, 0.006 + fw, joint)) * shows(0.02, fw);
          col *= mix(1.0, 0.82 + 0.3 * hash12(c.xy), shows(0.1, fw));
          col = mix(col, vec3(0.42, 0.38, 0.32), sand * 0.6);
          relief = -sand * 0.003;
          #endif
          rough = 0.9;
        } else if (kind == S_FACADE) {
          // which kind of front: a row house's, stone, or banded in glass
          float style = wear;
          float storey = style < 0.33 ? 3.3 : style < 0.66 ? 3.9 : 3.7;
          float bay = style < 0.33 ? 2.4 : style < 0.66 ? 2.9 : 1.6;
          vec2 sill = style < 0.33 ? vec2(0.85, 2.55) : style < 0.66 ? vec2(1.0, 2.9) : vec2(0.75, 3.35);
          float wide = style < 0.33 ? 0.95 : style < 0.66 ? 1.35 : 1.5;
          float floorN = floor(uv.y / storey);
          float bayN = floor(uv.x / bay);
          vec2 inCell = vec2(fract(uv.x / bay) * bay, fract(uv.y / storey) * storey);
          float side = wide * 0.5 - abs(inCell.x - bay * 0.5);
          float head = sill.y - inCell.y;
          float bottom = inCell.y - sill.x;
          float opening = min(side, min(head, bottom));
          float aa = max(fw * 0.5, 0.012);
          float detail = shows(0.09, fw);
          float windowShow = step(sill.x, uv.y) * shows(wide, fw);
          float frame = smoothstep(-aa, aa, opening + 0.085) * windowShow;
          float win = smoothstep(-aa, aa, opening - 0.055 * detail) * windowShow;
          // the wall itself: brick in courses, or dressed stone, or render
          // (photographed, where the material has a photo of it)
          vec3 plain = col; // (its trim is painted, not brick)
          if (style < 0.33) {
            #ifdef PHOTO_BRICK
            col *= photo_brick(uv, pudx, pudy, photoTip);
            photoBend = pT * photoTip.x + pB * photoTip.y;
            #else
            vec4 c = courses(uv, 0.215, 0.075);
            float mortar = (1.0 - smoothstep(0.0, 0.06, c.z) * (1.0 - smoothstep(0.94, 1.0, c.z)) * smoothstep(0.0, 0.12, c.w)) * shows(0.03, fw);
            col *= mix(1.0, 0.86 + 0.24 * hash12(c.xy), shows(0.12, fw)) * (1.0 + mortar * 0.15);
            relief = -mortar * 0.004;
            #endif
          } else {
            float block = courses(uv, 1.2, 0.6).z;
            col *= 0.9 + 0.16 * vnoise(uv * 2.0) + 0.06 * (1.0 - smoothstep(0.0, 0.02, block)) * shows(0.05, fw);
            #ifdef PHOTO_STONE
            col *= photo_stone(uv, pudx, pudy, photoTip);
            photoBend = pT * photoTip.x + pB * photoTip.y;
            #endif
          }
          float base = smoothstep(0.08, 0.18, uv.y) * (1.0 - smoothstep(0.42, 0.50, uv.y));
          float band = (1.0 - smoothstep(0.035, 0.085, min(inCell.y, storey - inCell.y))) * detail;
          col *= (1.0 - base * 0.17) * (1.0 - band * (style < 0.33 ? 0.08 : 0.20));
          float ledge = (1.0 - smoothstep(0.025, 0.095, abs(bottom + 0.06))) * step(-0.13, side) * windowShow * detail;
          col = mix(col, col * 1.28 + 0.015, ledge * 0.82);
          // Deep jambs, trim and a sash catch light differently from the glass.
          float pane = hash12(vec2(bayN, floorN) + 7.1);
          float sash = (1.0 - smoothstep(0.015, 0.05, abs(inCell.y - mix(sill.x, sill.y, 0.46)))) * detail;
          float mullion = (1.0 - smoothstep(0.018, 0.045, abs(inCell.x - bay * 0.5))) * detail * step(0.33, style);
          float bar = max(sash * (1.0 - step(0.66, style)), mullion);
          vec3 trim = mix(plain * (1.0 - base * 0.17) * 1.18 + 0.025, vec3(0.08, 0.09, 0.095), step(0.66, style));
          col = mix(col, trim * mix(0.55, 1.0, smoothstep(-0.055, 0.04, head)), frame);
          // The glass itself takes almost no light: what you see in it is the
          // sky it mirrors (below, by the look's slant) and the room behind it.
          col = mix(col, vec3(0.006, 0.008, 0.01), win);
          col = mix(col, trim, win * bar);
          glazing = win * (1.0 - bar);
          relief += (ledge * 0.014 - win * (1.0 - bar) * 0.023) * detail;
          #ifdef PHOTOS
          photoBend *= 1.0 - frame; // (the photo's lumps are the wall's, not the window's)
          #endif
          rough = mix(0.9, 0.14, glazing);
          if (glazing > 0.0) {
            // The room behind: the look followed in through the pane to the
            // first of the room's walls, floor or ceiling it meets, so the
            // window has a room in it that shifts as you go by. A newer
            // office's floor is open, its rooms several bays wide.
            float roomW = style < 0.66 ? bay : bay * ${ROOM.officeBays.toFixed(1)};
            float roomN = floor(uv.x / roomW);
            float roomH = storey - ${ROOM.slab.toFixed(2)};
            vec3 along = normalize(cross(vec3(0.0, 1.0, 0.0), wn) + vec3(1e-5, 0.0, 0.0));
            float runs = dot(dFdx(vWPos), along) * dFdx(uv.x) + dot(dFdy(vWPos), along) * dFdy(uv.x);
            along *= runs < 0.0 ? -1.0 : 1.0;
            vec3 look = normalize(vWPos - cameraPosition);
            // across the room, up it, and into it
            vec3 r = vec3(dot(look, along), look.y, max(-dot(look, wn), 0.02));
            r.x = abs(r.x) < 1e-4 ? 1e-4 : r.x;
            r.y = abs(r.y) < 1e-4 ? 1e-4 : r.y;
            vec3 o = vec3(fract(uv.x / roomW) * roomW - roomW * 0.5, inCell.y, 0.0);
            float deep = ${ROOM.deep.toFixed(1)} + 2.0 * hash12(vec2(roomN, floorN) + 2.3);
            vec3 tt = vec3(((r.x > 0.0 ? 0.5 : -0.5) * roomW - o.x) / r.x, ((r.y > 0.0 ? roomH : 0.0) - o.y) / r.y, deep / r.z);
            float t = max(0.0, min(tt.x, min(tt.y, tt.z)));
            vec3 hit = o + r * t;
            float room = hash12(vec2(roomN * 3.1, floorN * 1.7) + 0.4);
            vec3 wall = mix(vec3(0.62, 0.6, 0.55), vec3(0.5, 0.52, 0.55), room);
            vec3 seen = wall; // what the look meets in there
            if (t == tt.y) seen = r.y > 0.0 ? vec3(0.75) : mix(vec3(0.16, 0.15, 0.14), vec3(0.3, 0.2, 0.12), step(0.5, room));
            else if (t == tt.x) seen = wall * 0.85;
            // blinds let down part way in some, a slat every few centimetres
            float blindAt = sill.y - (sill.y - sill.x) * hash12(vec2(roomN, floorN) + 9.7) * step(0.55, pane);
            vec3 hb = o + r * (${ROOM.blind.toFixed(2)} / r.z);
            float blind = step(blindAt, hb.y) * step(hb.y, sill.y);
            // daylight comes in at the window and dies away into the room,
            // brightest on the ceiling; at night some rooms have a light on
            float day = dot(uHorizon + uZenith, vec3(0.15, 0.3, 0.05)) * (1.0 - uNight);
            float lit = step(0.62, hash12(vec2(bayN * 1.7 + 3.0, floorN * 2.3 - 1.0))) * uNight;
            vec3 lamp = vec3(1.0, 0.78, 0.45) * (0.55 + 0.45 * pane);
            // an office's ceiling lights, on all day in some of its rooms
            float office = step(0.66, style) * step(hash12(vec2(roomN, floorN) + 5.5), ${ROOM.officeLit.toFixed(2)});
            lamp = mix(lamp, vec3(0.85, 0.92, 1.0) * 0.45, office * (1.0 - uNight));
            lit = max(lit, office);
            vec3 light = vec3(day) * ${ROOM.daylight.toFixed(2)} * exp(-hit.z * ${ROOM.fall.toFixed(2)}) + lamp * lit * (0.45 + 0.55 * smoothstep(0.0, roomH, hit.y));
            vec3 inside = seen * light;
            vec3 slats = vec3(0.7, 0.68, 0.62) * (0.8 + 0.2 * step(0.3, fract(hb.y / 0.025))) * (vec3(day) * ${ROOM.daylight.toFixed(2)} * 1.6 + lamp * lit * 0.8);
            totalEmissiveRadiance += mix(inside, slats, blind) * glazing;
          }
        } else if (kind == S_EARTH) {
          // Where the wheels have run: a pair of ruts a cart's width apart,
          // wandering a little along the street, and a fainter pair beside
          // them; damp hollows; pocks and scuffs a hand's breadth across;
          // grit, and a stone pressed in here and there.
          float wob = (vnoise(vec2(uv.x * 0.045, 1.7)) - 0.5) * 1.4;
          // (squared by hand: pow() of a negative number is no number at all)
          float ra = (abs(uv.y - wob) - ${EARTH.gauge.toFixed(2)}) / 0.2;
          float rb = (abs(uv.y - 0.6 * wob + 2.6) - ${EARTH.gauge.toFixed(2)}) / 0.24;
          float rut = exp(-ra * ra) + 0.55 * exp(-rb * rb);
          rut *= 0.6 + 0.4 * vnoise(vec2(uv.x * 0.3, uv.y * 2.0 + 5.0));
          float big = vnoise(uv * 0.11 + 3.0);
          float mid = vnoise(uv * 0.55 + 9.0);
          float damp = smoothstep(0.62, 0.85, rut * 0.35 + (1.0 - big) * 0.55 + mid * 0.25);
          float pock = vnoise(uv * 7.0 + 13.0) * shows(0.08, fw);
          float grit = hash12(floor(uv * 70.0)) * shows(0.015, fw);
          vec2 sc = floor(uv / ${EARTH.stones.toFixed(2)});
          vec2 sf = fract(uv / ${EARTH.stones.toFixed(2)}) - 0.5 - (vec2(hash12(sc + 4.1), hash12(sc + 8.3)) - 0.5) * 0.5;
          float sr = 0.12 + 0.2 * hash12(sc + 2.2);
          float pebble = step(0.86, hash12(sc)) * (1.0 - smoothstep(sr - 0.05, sr, length(sf))) * shows(0.06, fw);
          col *= (0.82 + 0.3 * big) * (0.92 + 0.14 * mid) * (0.94 + 0.1 * pock) * (0.94 + 0.12 * grit);
          col *= (1.0 - 0.09 * rut) * (1.0 - 0.2 * damp);
          col = mix(col, col * mix(1.35, 0.7, hash12(sc + 6.6)), pebble * 0.7);
          relief = (-rut * 0.5 + pock * 0.08 + grit * 0.02 + pebble * 0.12) * ${RELIEF.earth};
          rough = mix(0.97, 0.7, damp);
        } else if (kind == S_CLOTH) {
          vec2 w = fract(uv * 220.0);
          float weave = (step(0.5, w.x) == step(0.5, w.y) ? 1.0 : 0.6) * shows(0.0045, fw);
          col *= 0.94 + 0.08 * weave + 0.06 * vnoise(uv * 3.0);
          rough = 1.0;
        } else {
          col *= 0.92 + 0.14 * vnoise(uv * 6.0);
        }

        // Weather: wherever it isn't glass or metal, streaks down the walls
        // where the rain runs, and moss and lichen on what faces the sky.
        // Asphalt uses the wear field to locate lane paint along a block.
        if (kind != S_GLASS && kind != S_TIN && kind != S_IRON && kind != S_STEEL && kind != S_ASPHALT) {
          vec2 wp = worldXZ(vWPos);
          float up = wn.y;
          if (abs(up) < 0.6) {
            vec2 along = normalize(vec2(-wn.z, wn.x) + 1e-5);
            float h = dot(wp, along);
            float rain = streak(vec2(vWPos.y * 0.25, h * 7.0), 1.0) * vnoise(vec2(h * 1.3, vWPos.y * 0.6 + 4.0));
            col *= 1.0 - smoothstep(0.35, 0.75, rain) * (0.12 + 0.3 * wear);
          }
          if (up > 0.35 && wear > 0.02) {
            float m1 = vnoise(wp * 2.3 + vWPos.y * 1.7);
            float m2 = vnoise(wp * 9.0 + 7.0);
            float moss = (1.0 - smoothstep(0.55, 0.75, m1 * 0.75 + m2 * 0.25 + (1.0 - wear) * 0.55)) * smoothstep(0.35, 0.8, up);
            col = mix(col, vec3(0.05, 0.075, 0.022) * (0.7 + 0.6 * m2), moss * 0.85);
            rough = mix(rough, 1.0, moss);
            relief += moss * m2 * 0.004;
          }
        }
        diffuseColor.rgb = col;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = rough;`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = metal;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // what stands proud, bumped into the normal (from how it changes
          // from pixel to pixel)
          vec3 dpx = dFdx(-vViewPosition);
          vec3 dpy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpy, normal);
          vec3 r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dFdx(relief) * r1 + dFdy(relief) * r2);
          normal = normalize(abs(det) * normal - grad);
          #ifdef PHOTOS
          normal = normalize(normal + (viewMatrix * vec4(photoBend, 0.0)).xyz);
          #endif
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `if (kind == S_GLASS || glazing > 0.0) {
          // Glass: the sky mirrored in it, more of it the more slanting the
          // look (Fresnel), over the dark of the room behind it.
          vec3 N = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec3 V = normalize(cameraPosition - vWPos);
          vec3 R = reflect(-V, N);
          float F = (0.04 + 0.96 * pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 5.0)) * (kind == S_GLASS ? 1.0 : glazing);
          vec3 env = R.y > 0.0 ? skyGradient(R) : mix(uHorizon * 0.35, vec3(0.03, 0.035, 0.025), smoothstep(0.0, -0.3, R.y));
          outgoingLight = outgoingLight * (1.0 - F) + env * F;
        } else if (kind == S_STEEL) {
          // Steel: the sky in it too, in its own colour, more the smoother
          // it is and the more slanting the look.
          vec3 N = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec3 V = normalize(cameraPosition - vWPos);
          vec3 R = reflect(-V, N);
          float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 5.0);
          vec3 env = R.y > 0.0 ? skyGradient(R) : mix(uHorizon * 0.35, vec3(0.03, 0.035, 0.025), smoothstep(0.0, -0.3, R.y));
          outgoingLight += env * diffuseColor.rgb * (0.15 + 0.55 * (1.0 - wear)) * (0.35 + 0.65 * F);
        }
        #include <opaque_fragment>`,
      );
    if (cut) {
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${CUT_GLSL}\nvoid main() {`)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (inCut(vWPos)) discard;');
    }
  };
  const photoKey = Object.entries(shots).map(([n, p]) => `${n}:${p.id}@${p.metres}`).join(',');
  mat.customProgramCacheKey = () => (roadGrade ? 'road-grade-v2' : 'building-v8') + (cut ? '-cut' : '') + (photoKey ? `-photos(${photoKey})` : '');
  return mat;
}
