// What Hell's ground is drawn with: one material for all of it, rock, mud,
// sand, ice and the beds of whatever lies in the hollows; and what lies in
// them: Acheron's black water, the marsh, the blood, which boils and gives
// its own light, the pitch (render/liquid.js, by what each does to light).
//
// The mesher (terrain.js) says, vertex by vertex, what colour the ground is
// (color) and how wet it is, how hot, how much it is ice, and how deep it
// lies under a liquid (aFx), and which liquid (aKind). The rest is worked
// out here, pixel by pixel: the grain of the ground and its small shape
// (render/glsl.js: relief), lumps and grit; bare rock in beds wherever it is
// steep, standing out in ledges; ice with cracks in it and the dark of
// things frozen under it; where the sand burns hottest, a crust of black
// plates with fire in the cracks; and under a liquid, its bed, wet.
//
// Patterns are drawn from where a pixel is in the world (worldXZ), so they
// stay put when the picture's origin moves (render/origin.js). Heights are
// never slid, so the beds in a cliff go by height as it is.

import * as THREE from 'three';
import { SHARED, SKY } from '../render/uniforms.js';
import { NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, RELIEF_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { LIQUID } from './plan.js';
import { createLiquidMaterial } from '../render/liquid.js';
import { createSurfaceHaze } from '../render/haze.js';

// How far off anything of Hell is drawn (m), shared by its materials: past
// where the air hides everything (air.js sets it), a thing isn't drawn at
// all. (The picture takes what is right at the far plane for sky, and
// leaves the air off it; so nothing is left out there to be taken for it.)
export const SEEN = { uSeeFar: { value: 1e9 } };

// What lies in the hollows (plan.js: LIQUID), as liquids are
// (render/liquid.js): what each does to light, and the light of its own.
export const LIQUIDS = [];
LIQUIDS[LIQUID.none] = {};
// Acheron: black, and still
LIQUIDS[LIQUID.acheron] = { absorb: [1.6, 1.2, 1.0], murk: 1.2, tint: [0.012, 0.013, 0.016], rough: 0.05, slow: 1 };
// the marsh of Styx: muddy, slow, the sullen under it sighing up bubbles
LIQUIDS[LIQUID.styx] = { absorb: [3, 2.6, 3.2], murk: 4, tint: [0.024, 0.026, 0.024], rough: 0.12, slow: 1.6, boil: 0.6 };
// Phlegethon: blood, boiling, with a skin on it that the boiling breaks,
// and a dull light of its own, brighter where it heaves
LIQUIDS[LIQUID.blood] = { absorb: [0.9, 25, 30], murk: 6, tint: [0.1, 0.006, 0.004], rough: 0.14, slow: 2.4, boil: 1, glow: [0.32, 0.02, 0.007], crust: 0.3 };
// the fifth ditch's pitch: black, thick, a mirror, a bubble now and then
LIQUIDS[LIQUID.pitch] = { absorb: [60, 60, 60], murk: 0, tint: [0.004, 0.004, 0.005], rough: 0.03, slow: 4, boil: 0.45 };
// the second ditch's filth
LIQUIDS[LIQUID.filth] = { absorb: [20, 25, 30], murk: 10, tint: [0.06, 0.042, 0.016], rough: 0.5, slow: 3, boil: 0.1 };
// the brook across the burning sand: dark, red-stained, steaming
LIQUIDS[LIQUID.brook] = { absorb: [0.7, 1.6, 1.8], murk: 0.8, tint: [0.03, 0.012, 0.01], rough: 0.08, slow: 1, glow: [0.04, 0.004, 0.0] };
// the slush at the edge of the ice
LIQUIDS[LIQUID.slush] = { absorb: [0.5, 0.4, 0.35], murk: 2, tint: [0.05, 0.055, 0.06], rough: 0.2, slow: 1.2, boil: 0.2 };

export function createHellLiquid() {
  return createLiquidMaterial(LIQUIDS);
}

// The air over the hot ones shimmering (render/haze.js): over the blood, and
// a little over the brook that crosses the burning sand.
export function createHellLiquidHaze() {
  const heat = [];
  heat[LIQUID.blood] = 1;
  heat[LIQUID.brook] = 0.4;
  return createSurfaceHaze({ heat });
}

export function createHellGround() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY);
    shader.uniforms.uOrigin = SHARED.uOrigin;
    shader.uniforms.uSeeFar = SEEN.uSeeFar;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aFx;
        varying vec4 vFx;
        varying vec3 vDrawn;
        varying vec3 vUp;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vFx = aFx;
        vDrawn = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vUp = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSeeFar;
        varying vec4 vFx;
        varying vec3 vDrawn;
        varying vec3 vUp;
        ${NOISE_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${RELIEF_GLSL}
        ${SKY_UNIFORMS_GLSL}
        ${SKY_GLSL}
        float gRough;
        vec3 gEmit;
        float gH; // the ground's small shape: how far this pixel stands up from the mesh, m
        float gGlaze;

        float fracture(vec2 p, float scale, float width) {
          vec3 cell = wcells(p, scale);
          float edge = cell.y - cell.x;
          float aa = max(fwidth(edge), 0.002);
          return (1.0 - smoothstep(max(0.0, width - aa), width + aa, edge)) * width / max(aa, width);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 wp = worldXZ(vDrawn);
          float far = length(vViewPosition);
          if (far > uSeeFar) discard;
          float near = 1.0 - smoothstep(60.0, 220.0, far);
          float n1 = wnoise(wp, 0.31);
          float n2 = mix(0.5, wnoise(wp, 2.3, vec2(5.0)), near);
          float n3 = wnoise(wp, 0.07, vec2(-9.0));
          float slope = 1.0 - normalize(vUp).y;
          vec3 base = diffuseColor.rgb * (0.74 + 0.5 * n2 + 0.46 * (n3 - 0.5));
          gRough = 1.0;
          gEmit = vec3(0.0);
          gGlaze = 0.0;
          // lumps and grit underfoot
          float grit = wnoise(wp, 9.0, vec2(-3.0, 7.0));
          float aggregate = smoothstep(0.48, 0.79, grit + (n2 - 0.5) * 0.45);
          gH = (n1 - 0.5) * 0.042 + (n2 - 0.5) * 0.013 * near + aggregate * 0.006 * near;
          base *= mix(1.0, 0.88 + 0.29 * aggregate, near);

          // bare rock where it's steep, in beds
          float rocky = smoothstep(0.2, 0.42, slope + (n1 - 0.5) * 0.12);
          if (rocky > 0.0 && vFx.z < 0.999) {
            float veins = wnoise(wp, 0.16, vec2(7.7, 21.1));
            vec2 strata = vec2(vDrawn.y * 0.38 + n3 * 2.1 + n1 * 0.42, n3 * 6.7 + veins * 0.35);
            float bed = vnoise(strata) * 0.68 + vnoise(strata * vec2(3.6, 1.6) + 8.1) * 0.32;
            float seam = smoothstep(0.62, 0.86, vnoise(strata * vec2(1.13, 0.7) + 2.3));
            float fissure = smoothstep(0.67, 0.94, veins + (bed - 0.5) * 0.26);
            vec3 rock = mix(vec3(0.026, 0.027, 0.029), vec3(0.138, 0.125, 0.11), bed);
            rock *= (0.72 + 0.58 * n2) * (1.0 - 0.4 * fissure - 0.22 * seam);
            rock = mix(rock, diffuseColor.rgb * 0.76, 0.25);
            base = mix(base, rock, rocky * (1.0 - vFx.z));
            gH += rocky * (1.0 - vFx.z) * (bed * 0.15 - seam * 0.06 - fissure * 0.15 + (n1 - 0.5) * 0.16);
          }

          // ice: hard and blue, cracked, with the dark of what is frozen under it
          if (vFx.z > 0.01) {
            vec2 plates = wp + vec2(n1, wnoise(wp, 0.43, vec2(11.2))) * 0.38;
            float crack = fracture(plates, 0.13, 0.025);
            float ghost = fracture(plates + vec2(0.13, 0.21), 0.13, 0.045);
            float hair = fracture(plates + vec2(8.0, -3.0), 0.59, 0.028) * near;
            float snow = smoothstep(0.58, 0.8, 0.55 * n3 + 0.32 * n1 + 0.13 * n2);
            vec3 ice = mix(vec3(0.021, 0.039, 0.064), vec3(0.10, 0.17, 0.23), n3);
            ice += vec3(0.06, 0.12, 0.20) * ghost * (0.4 + 0.6 * n1);
            ice = mix(ice, vec3(0.44, 0.57, 0.64), max(crack * 0.84 + hair * 0.38, snow * 0.75));
            base = mix(base, ice, vFx.z);
            gRough = mix(gRough, 0.08 + 0.13 * n2 + 0.6 * snow, vFx.z);
            gGlaze = vFx.z * (1.0 - snow) * 0.78;
            gH = mix(gH, (n1 - 0.5) * 0.016 - crack * 0.01 - hair * 0.003, vFx.z);
          }

          // Wet ground has patches of standing film between exposed grains.
          float wetFilm = clamp(vFx.x * (0.45 + 0.85 * n1), 0.0, 1.0) * (1.0 - 0.78 * rocky);
          gRough = mix(gRough, mix(0.11, 0.47, n2), wetFilm);
          gGlaze = max(gGlaze, wetFilm * (0.36 + 0.36 * n3));
          base *= 1.0 - 0.3 * vFx.x;
          // hot ground gives a dull light of its own; where it is hottest it
          // has run, and cooled to a crust of black plates with the fire in
          // the cracks between them
          gEmit += vec3(1.0, 0.3, 0.06) * vFx.y * (0.35 + 0.65 * smoothstep(0.35, 0.8, wnoise(wp, 0.6, vec2(uTime * 0.05, 0.0)))) * 0.45;
          if (vFx.y > 0.25) {
            float melt = smoothstep(0.25, 0.7, vFx.y + (n1 - 0.5) * 0.3);
            vec3 c = wcells(wp, 1.1);
            float crack = 1.0 - smoothstep(0.0, 0.06 + 0.06 * melt, c.y - c.x);
            float breathe = 0.6 + 0.4 * sin(uTime * (0.8 + c.z) + c.z * 30.0);
            base = mix(base, vec3(0.025, 0.02, 0.018) * (0.7 + 0.6 * c.z), melt * (1.0 - crack));
            gEmit += (vec3(1.0, 0.28, 0.04) * 2.2 + vec3(1.0, 0.6, 0.2) * crack * melt * 2.0) * crack * melt * breathe;
            gH += melt * ((1.0 - crack) * 0.03 + (c.z - 0.5) * 0.02) * near;
            gRough = mix(gRough, 0.75, melt);
          }

          // what lies in the hollows
          float depth = vFx.w;
          float shore = smoothstep(-0.35, 0.0, depth);
          base *= 1.0 - 0.35 * shore;
          gRough = mix(gRough, 0.3, shore * 0.7);
          if (depth > 0.0) {
            // the bed, under whatever lies in it (drawn as a surface of its
            // own: terrain.js): dark and wet
            float bedWet = smoothstep(0.0, 0.3, depth);
            base *= 1.0 - 0.45 * bedWet;
            gRough = mix(gRough, 0.4, bedWet);
            gEmit *= 1.0 - bedWet;
            gH *= 1.0 - 0.6 * bedWet;
          }
          diffuseColor.rgb = base;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = gRough;`)
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        // its small shape: lumps, grit, the ledges of the beds, cracks in the ice
        normal = relief(normal, -vViewPosition, gH);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmit;
        if (gGlaze > 0.0) {
          vec3 eye = normalize(vViewPosition);
          float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(normal, eye), 0.0, 1.0), 5.0);
          vec3 reflected = reflect(-eye, normal) * mat3(viewMatrix);
          reflected.y = max(reflected.y, 0.0);
          totalEmissiveRadiance += skyGradient(reflected) * fres * gGlaze * (1.0 - gRough);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'hell-ground-3';
  return mat;
}

// Stone that has been worked, or broken off and stood up: walls, towers,
// tombs, bridges, crags. Vertex colours say what kind (and how hot it is, in
// their alpha where the geometry has one); the grain is drawn from where
// each point is in its own mesh, which never moves.
//
// { flesh: true } is for what is alive, or was: smoother, with only a little
// mottle, and a slow breath in it (the whole body swells and settles).
export function createHellStone({ hot = false, flesh = false, masonry = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: flesh ? 0.78 : 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uSeeFar = SEEN.uSeeFar;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${hot ? 'attribute float aHot; varying float vHot;' : ''}
        ${masonry ? 'varying vec3 vFace;' : ''}
        varying vec3 vAt;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        ${hot ? 'vHot = aHot;' : ''}
        ${masonry ? 'vFace = objectNormal;' : ''}
        #if defined(USE_INSTANCING) && ${masonry ? '0' : '1'}
          vAt = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vAt = transformed;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uSeeFar;
        ${hot ? 'varying float vHot;' : ''}
        ${masonry ? 'varying vec3 vFace;' : ''}
        varying vec3 vAt;
        ${NOISE_GLSL}
        ${RELIEF_GLSL}
        float gH;
        ${masonry ? `
        // Staggered courses with eroded joints. Each stone has its own tint.
        vec2 courses(vec2 p, float chip) {
          p.y *= 1.55;
          float row = floor(p.y);
          p.x = p.x * 0.86 + mod(row, 2.0) * 0.5;
          vec2 edge = abs(fract(p) - 0.5);
          float joint = 1.0 - smoothstep(0.012, 0.052 + 0.037 * chip, 0.5 - max(edge.x, edge.y));
          return vec2(joint, hash12(floor(p)));
        }` : ''}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (length(vViewPosition) > uSeeFar) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sg = vnoise(vAt.xz * 2.3 + vAt.y * 1.7) * 0.55 + vnoise(vAt.zy * 7.1 - vAt.x * 3.3) * 0.45;
        float weathered = vnoise(vAt.xz * 0.28 + vAt.y * 0.09) * 0.6 + vnoise(vAt.zy * vec2(1.12, 0.17) - vAt.x * 0.46) * 0.4;
        diffuseColor.rgb *= ${flesh ? '0.88 + 0.24 * sg' : '(0.64 + 0.64 * sg) * (0.68 + 0.60 * weathered)'};
        ${masonry ? `
        vec3 axis = abs(normalize(vFace));
        vec2 blockX = courses(vAt.zy + vec2(13.7, 0.0), sg);
        vec2 blockZ = courses(vAt.xy, sg);
        vec2 block = mix(blockX, blockZ, axis.z / max(axis.x + axis.z, 0.001));
        float masonryMask = (1.0 - smoothstep(0.45, 0.9, axis.y)) * fine(vAt, 0.9);
        diffuseColor.rgb *= mix(1.0, (0.77 + block.y * 0.45) * (1.0 - block.x * 0.48), masonryMask);
        ` : ''}
        // its grain and its pits, and the odd chip out of it
        {
          float grain = vnoise(vAt.xz * 31.0 + vAt.y * 23.0) * 0.5 + vnoise(vAt.zy * 37.0 - vAt.x * 29.0) * 0.5;
          float pit = smoothstep(0.8, 0.95, vnoise(vAt.xy * 9.0 + vAt.z * 7.0));
          gH = (sg - 0.5) * 0.02 + (grain - 0.5) * 0.003 * fine(vAt, 0.03) - pit * 0.004 * fine(vAt, 0.06);
          gH += (weathered - 0.5) * 0.045;
          ${masonry ? 'gH -= block.x * masonryMask * 0.033;' : ''}
          diffuseColor.rgb *= 1.0 - 0.08 * pit;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = relief(normal, -vViewPosition, gH);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${
          hot
            ? `{
          float flick = 0.75 + 0.25 * vnoise(vec2(uTime * 1.7 + vAt.x * 0.3, vAt.z * 0.3 + vAt.y));
          totalEmissiveRadiance += vec3(1.0, 0.23, 0.057) * vHot * flick * (0.36 + 1.25 * smoothstep(0.26, 0.75, weathered));
        }`
            : ''
        }`,
      );
  };
  mat.customProgramCacheKey = () => `hell-stone-${hot ? 1 : 0}${flesh ? 1 : 0}${masonry ? 1 : 0}`;
  return mat;
}
