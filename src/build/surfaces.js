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
//   clay      chinking, mortar and plaster: sandy, crazed with fine cracks
//   cloth     canvas, a weave
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
import { NOISE_GLSL, WORLD_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { SHARED, SKY } from '../render/uniforms.js';

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
};
// For a flat face (Mesher.tris), its grain runs across it, level, unless it
// is marked as standing upright (an upright board): surf | UPRIGHT.
export const UPRIGHT = 64;

// m: how far each surface stands proud of itself at the most, for the light
const RELIEF = { bark: 0.005, wood: 0.0012, paint: 0.0006, stone: 0.012, shingle: 0.004, slate: 0.0015, tin: 0.009, clay: 0.002, end: 0.0015 };

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

export function createBuildingMaterial({ side = THREE.DoubleSide } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY, { uOrigin: SHARED.uOrigin });
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
        ${SKY_GLSL}
        ${SURF_GLSL}`,
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
        float rough = 0.85;
        float metal = 0.0;
        vec3 col = diffuseColor.rgb;

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
        } else if (kind == S_CLAY) {
          float sand = hash12(floor(uv * 400.0)) * shows(0.0025, fw);
          float crack = (1.0 - smoothstep(0.0, 0.03, abs(vnoise(uv * 14.0) - 0.5))) * shows(0.02, fw);
          col *= (0.88 + 0.2 * sand) * (1.0 - 0.35 * crack);
          relief = (sand * 0.4 - crack) * ${RELIEF.clay};
          rough = 0.97;
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
        if (kind != S_GLASS && kind != S_TIN && kind != S_IRON) {
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
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `if (kind == S_GLASS) {
          // Glass: the sky mirrored in it, more of it the more slanting the
          // look (Fresnel), over the dark of the room behind it.
          vec3 N = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec3 V = normalize(cameraPosition - vWPos);
          vec3 R = reflect(-V, N);
          float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 5.0);
          vec3 env = R.y > 0.0 ? skyGradient(R) : mix(uHorizon * 0.35, vec3(0.03, 0.035, 0.025), smoothstep(0.0, -0.3, R.y));
          outgoingLight = outgoingLight * (1.0 - F) + env * F;
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'building-v2';
  return mat;
}
