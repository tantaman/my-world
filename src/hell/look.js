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
import { NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, RELIEF_GLSL } from '../render/glsl.js';
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
LIQUIDS[LIQUID.styx] = { absorb: [3, 2.6, 3.2], murk: 4, tint: [0.03, 0.03, 0.015], rough: 0.22, slow: 1.6, boil: 0.6 };
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
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uOrigin = SHARED.uOrigin;
    shader.uniforms.uHorizon = SKY.uHorizon;
    shader.uniforms.uSeeFar = SEEN.uSeeFar;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aFx;
        attribute float aKind;
        varying vec4 vFx;
        varying float vKind;
        varying vec3 vDrawn;
        varying vec3 vUp;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vFx = aFx;
        vKind = aKind;
        vDrawn = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vUp = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uHorizon;
        uniform float uSeeFar;
        varying vec4 vFx;
        varying float vKind;
        varying vec3 vDrawn;
        varying vec3 vUp;
        ${NOISE_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${RELIEF_GLSL}
        float gRough;
        vec3 gEmit;
        vec2 gTilt;
        float gH; // the ground's small shape: how far this pixel stands up from the mesh, m`,
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
          vec3 base = diffuseColor.rgb * (0.78 + 0.3 * n2 + 0.16 * (n3 - 0.5));
          gRough = 1.0;
          gEmit = vec3(0.0);
          gTilt = vec2(0.0);
          // lumps and grit underfoot
          float grit = wnoise(wp, 9.0, vec2(-3.0, 7.0));
          gH = (n1 - 0.5) * 0.05 + (n2 - 0.5) * 0.02 * near + (grit - 0.5) * 0.006 * near;

          // bare rock where it's steep, in beds
          float rocky = smoothstep(0.2, 0.42, slope + (n1 - 0.5) * 0.12);
          float bed = vnoise(vec2(vDrawn.y * 0.45 + n3 * 3.0, 3.7)) * 0.6 + vnoise(vec2(vDrawn.y * 2.1 + n1 * 1.5, 9.1)) * 0.4;
          vec3 rock = mix(vec3(0.036, 0.034, 0.034), vec3(0.085, 0.076, 0.07), bed) * (0.75 + 0.5 * n2);
          rock = mix(rock, diffuseColor.rgb * 0.8, 0.3);
          base = mix(base, rock, rocky * (1.0 - vFx.z));
          // the beds stand out in ledges, each a little proud of the one under it
          float ledge = fract(vDrawn.y * 0.45 + n3 * 3.0);
          gH += rocky * (1.0 - vFx.z) * ((smoothstep(0.0, 0.15, ledge) - ledge) * 0.12 + (bed - 0.5) * 0.05) * (0.4 + 0.6 * near);

          // ice: hard and blue, cracked, with the dark of what is frozen under it
          if (vFx.z > 0.01) {
            float crack = abs(wnoise(wp, 0.22, vec2(3.0)) - 0.5) * 2.0;
            float hair = abs(wnoise(wp, 0.9, vec2(-6.0)) - 0.5) * 2.0;
            float under = smoothstep(0.52, 0.8, wnoise(wp, 0.45, vec2(31.0)));
            vec3 ice = base * (0.75 + 0.35 * n1);
            ice = mix(ice, vec3(0.03, 0.045, 0.07), under * 0.6);
            ice = mix(ice, vec3(0.55, 0.66, 0.74), (1.0 - smoothstep(0.0, 0.035, crack)) * 0.7 + (1.0 - smoothstep(0.0, 0.04, hair)) * 0.3 * near);
            base = mix(base, ice, vFx.z);
            gRough = mix(gRough, 0.16 + 0.2 * n2, vFx.z);
            // smooth ice, cut by its cracks
            gH = mix(gH, -(1.0 - smoothstep(0.0, 0.04, crack)) * 0.01 - (1.0 - smoothstep(0.0, 0.05, hair)) * 0.003 * near, vFx.z);
          }

          // wet ground shines
          gRough = mix(gRough, 0.5, vFx.x * (0.6 + 0.4 * n1));
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
        normal = relief(normal, -vViewPosition, gH);
        // what moves on a liquid tips its light about
        normal = normalize(normal + (viewMatrix * vec4(gTilt.x, 0.0, gTilt.y, 0.0)).xyz * 0.22);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmit;
        // smooth things mirror the murk they lie under
        {
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
          totalEmissiveRadiance += uHorizon * fres * (1.0 - gRough) * 0.9;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'hell-ground-2';
  return mat;
}

// Stone that has been worked, or broken off and stood up: walls, towers,
// tombs, bridges, crags. Vertex colours say what kind (and how hot it is, in
// their alpha where the geometry has one); the grain is drawn from where
// each point is in its own mesh, which never moves.
//
// { flesh: true } is for what is alive, or was: smoother, with only a little
// mottle, and a slow breath in it (the whole body swells and settles).
export function createHellStone({ hot = false, flesh = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: flesh ? 0.78 : 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uSeeFar = SEEN.uSeeFar;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${hot ? 'attribute float aHot; varying float vHot;' : ''}
        varying vec3 vAt;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        ${hot ? 'vHot = aHot;' : ''}
        #ifdef USE_INSTANCING
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
        varying vec3 vAt;
        ${NOISE_GLSL}
        ${RELIEF_GLSL}
        float gH;`,
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
        diffuseColor.rgb *= ${flesh ? '0.88 + 0.24 * sg' : '0.72 + 0.56 * sg'};
        // its grain and its pits, and the odd chip out of it
        {
          float grain = vnoise(vAt.xz * 31.0 + vAt.y * 23.0) * 0.5 + vnoise(vAt.zy * 37.0 - vAt.x * 29.0) * 0.5;
          float pit = smoothstep(0.8, 0.95, vnoise(vAt.xy * 9.0 + vAt.z * 7.0));
          gH = (sg - 0.5) * 0.02 + (grain - 0.5) * 0.003 * fine(vAt, 0.03) - pit * 0.004 * fine(vAt, 0.06);
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
          totalEmissiveRadiance += vec3(1.0, 0.16, 0.03) * vHot * flick * (0.5 + sg);
        }`
            : ''
        }`,
      );
  };
  mat.customProgramCacheKey = () => `hell-stone-${hot ? 1 : 0}${flesh ? 1 : 0}`;
  return mat;
}
