// What Purgatory is drawn with: its ground (one material for all of it: the
// beach, the grass of Ante-Purgatory and the meadow on the top, bare rock
// where it's steep, and the stone of the terraces, white marble on the
// first), its worked stone, and what lies on it: the sea, and Lethe, Eunoë
// and the spring they rise from (render/liquid.js, by what each does to
// light).
//
// The land (land.js) says, vertex by vertex, what colour the ground is
// (color) and how wet it is, how polished, whether it is bare stone, and
// how deep it lies under a liquid (aFx: wet, polish, stone, depth), and
// which liquid (aKind). The rest is worked out here, pixel by pixel: grit
// and lumps, grass mottled and tufted where it's green, rock in beds where
// it's steep, a marble's veins and shine, the shore wet and dark.
//
// Patterns are drawn from where a pixel is in the world (worldXZ), so they
// stay put when the picture's origin moves (render/origin.js). Heights are
// never slid, so the beds in a cliff go by height as it is.

import * as THREE from 'three';
import { SHARED, SKY } from '../render/uniforms.js';
import { NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, RELIEF_GLSL } from '../render/glsl.js';
import { createLiquidMaterial } from '../render/liquid.js';
import { LIQUID } from './plan.js';

// What lies on the land (plan.LIQUID), as liquids are (render/liquid.js).
export const LIQUIDS = [];
LIQUIDS[LIQUID.none] = {};
// the southern ocean: clear, green-blue in its depth, with a long swell
LIQUIDS[LIQUID.sea] = { absorb: [0.36, 0.075, 0.045], murk: 0.12, tint: [0.008, 0.028, 0.036], rough: 0.1, slow: 1.6 };
// Lethe: limpid as no water on earth is, and yet "a brown, brown current
// under the shade perpetual"
LIQUIDS[LIQUID.lethe] = { absorb: [0.55, 0.85, 1.4], murk: 0.04, tint: [0.018, 0.012, 0.006], rough: 0.05, slow: 0.8 };
// Eunoë: as clear, and bright
LIQUIDS[LIQUID.eunoe] = { absorb: [0.22, 0.07, 0.05], murk: 0.03, tint: [0.006, 0.014, 0.014], rough: 0.05, slow: 0.8 };
// the fountain they both rise from, welling up
LIQUIDS[LIQUID.spring] = { absorb: [0.22, 0.07, 0.05], murk: 0.03, tint: [0.006, 0.014, 0.014], rough: 0.08, slow: 0.7, boil: 0.35 };

export function createMountLiquid() {
  return createLiquidMaterial(LIQUIDS);
}

export function createMountGround() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uOrigin = SHARED.uOrigin;
    shader.uniforms.uHorizon = SKY.uHorizon;
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
        uniform float uTime;
        uniform vec3 uHorizon;
        varying vec4 vFx;
        varying vec3 vDrawn;
        varying vec3 vUp;
        ${NOISE_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${RELIEF_GLSL}
        float gRough;
        float gH; // the ground's small shape: how far this pixel stands up from the mesh, m`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 wp = worldXZ(vDrawn);
          float far = length(vViewPosition);
          float near = 1.0 - smoothstep(50.0, 200.0, far);
          float n1 = wnoise(wp, 0.27);
          float n2 = mix(0.5, wnoise(wp, 2.1, vec2(5.0)), near);
          float n3 = wnoise(wp, 0.06, vec2(-9.0));
          float slope = 1.0 - normalize(vUp).y;
          float stone = vFx.z;
          vec3 base = diffuseColor.rgb * (0.82 + 0.26 * n2 + 0.14 * (n3 - 0.5));
          gRough = 0.95;
          float grit = wnoise(wp, 9.0, vec2(-3.0, 7.0));
          gH = (n1 - 0.5) * 0.05 + (n2 - 0.5) * 0.02 * near + (grit - 0.5) * 0.006 * near;

          // grass, where the ground is green and not stone: mottled, tufted
          float green = (1.0 - stone) * smoothstep(0.02, 0.08, diffuseColor.g - max(diffuseColor.r, diffuseColor.b) * 0.8);
          if (green > 0.01) {
            float tuft = wnoise(wp, 3.7, vec2(11.0)) * 0.6 + wnoise(wp, 11.0, vec2(-4.0)) * 0.4;
            vec3 grass = base * mix(vec3(0.85, 0.92, 0.8), vec3(1.15, 1.08, 0.85), tuft) * (0.8 + 0.4 * n1);
            // a little sun-browned here and there
            grass = mix(grass, base * vec3(1.5, 1.2, 0.7), smoothstep(0.65, 0.9, n3) * 0.35);
            base = mix(base, grass, green);
            gH += green * (tuft - 0.5) * 0.035 * near;
          }

          // bare rock where it's steep, in beds (or the stone itself, worked)
          float rocky = max(smoothstep(0.32, 0.55, slope + (n1 - 0.5) * 0.12) * (1.0 - stone), 0.0);
          float bed = vnoise(vec2(vDrawn.y * 0.42 + n3 * 3.0, 3.7)) * 0.6 + vnoise(vec2(vDrawn.y * 1.9 + n1 * 1.5, 9.1)) * 0.4;
          vec3 rock = mix(vec3(0.12, 0.11, 0.1), vec3(0.24, 0.22, 0.2), bed) * (0.8 + 0.4 * n2);
          base = mix(base, rock, rocky);
          float ledge = fract(vDrawn.y * 0.42 + n3 * 3.0);
          float cliff = max(rocky, stone * smoothstep(0.35, 0.6, slope));
          gH += cliff * ((smoothstep(0.0, 0.15, ledge) - ledge) * 0.1 + (bed - 0.5) * 0.05) * (0.4 + 0.6 * near);
          base *= mix(1.0, 0.85 + 0.3 * bed, stone * smoothstep(0.35, 0.6, slope));

          // stone that is polished (the marble of the first terrace, the
          // white step and the red): smooth, veined, shining
          float polish = vFx.y;
          if (polish > 0.01) {
            float vein = abs(wnoise(wp + vec2(vDrawn.y * 0.7), 0.35, vec2(13.0)) - 0.5) * 2.0;
            float hair = abs(wnoise(wp + vec2(vDrawn.y * 1.3), 1.4, vec2(-2.0)) - 0.5) * 2.0;
            base *= 1.0 - polish * (0.25 * (1.0 - smoothstep(0.0, 0.05, vein)) + 0.1 * (1.0 - smoothstep(0.0, 0.04, hair)) * near);
            gRough = mix(gRough, 0.12, polish);
            gH *= 1.0 - 0.85 * polish;
          }

          // wet ground (the shore, the dew, a stream's banks) is dark and shines
          gRough = mix(gRough, 0.35, vFx.x * (0.6 + 0.4 * n1));
          base *= 1.0 - 0.35 * vFx.x;

          // what lies on it
          float depth = vFx.w;
          float shore = smoothstep(-0.3, 0.0, depth);
          base *= 1.0 - 0.3 * shore;
          gRough = mix(gRough, 0.3, shore * 0.7);
          if (depth > 0.0) {
            float bedWet = smoothstep(0.0, 0.3, depth);
            base *= 1.0 - 0.35 * bedWet;
            gRough = mix(gRough, 0.4, bedWet);
            gH *= 1.0 - 0.6 * bedWet;
          }
          diffuseColor.rgb = base;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = gRough;`)
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = relief(normal, -vViewPosition, gH);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // polished stone mirrors the sky, at a low angle
        {
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
          totalEmissiveRadiance += uHorizon * fres * vFx.y * 0.35;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'mount-ground-1';
  return mat;
}

// Stone that has been worked: the gate and its door, the carvings in the
// bank, a pedestal. Vertex colours say what kind (and in aHot, how polished:
// a carving's marble shines); the grain is drawn from where each point is
// in its own mesh, which never moves. { glow } is for what shines of
// itself (an angel's face, the threshold of diamond): aHot says how much.
export function createMountStone({ glow = null } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aHot;
        varying float vHot;
        varying vec3 vAt;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vHot = aHot;
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
        varying float vHot;
        varying vec3 vAt;
        ${NOISE_GLSL}
        ${RELIEF_GLSL}
        float gH;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sg = vnoise(vAt.xz * 1.7 + vAt.y * 1.3) * 0.55 + vnoise(vAt.zy * 5.1 - vAt.x * 2.3) * 0.45;
        ${glow ? '' : 'diffuseColor.rgb *= 0.86 + 0.28 * sg;'}
        {
          float grain = vnoise(vAt.xz * 31.0 + vAt.y * 23.0) * 0.5 + vnoise(vAt.zy * 37.0 - vAt.x * 29.0) * 0.5;
          float pit = smoothstep(0.82, 0.95, vnoise(vAt.xy * 9.0 + vAt.z * 7.0));
          gH = ((sg - 0.5) * 0.012 + (grain - 0.5) * 0.002 * fine(vAt, 0.03) - pit * 0.003 * fine(vAt, 0.06)) * (1.0 - vHot);
        }`,
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = ${glow ? '0.5' : 'mix(0.7, 0.18, vHot)'};`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = relief(normal, -vViewPosition, gH);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${glow ? `totalEmissiveRadiance += vec3(${glow.map((c) => c.toFixed(3)).join(', ')}) * vHot * (0.9 + 0.1 * sin(uTime * 1.3 + vAt.y * 2.0));` : ''}`,
      );
  };
  mat.customProgramCacheKey = () => `mount-stone-${glow ? glow.join(',') : 'plain'}`;
  return mat;
}
