// What Hell's ground is drawn with: one material for all of it, rock, mud,
// sand, ice and whatever lies in the hollows.
//
// The mesher (terrain.js) says, vertex by vertex, what colour the ground is
// (color) and how wet it is, how hot, how much it is ice, and how deep it
// lies under a liquid (aFx), and which liquid (aKind). The rest is worked
// out here, pixel by pixel: the grain of the ground; bare rock in beds
// wherever it is steep; ice with cracks in it and the dark of things frozen
// under it; and over the hollows the liquid itself — Acheron's black water,
// the marsh, the blood, which boils and gives its own light, the pitch.
//
// Patterns are drawn from where a pixel is in the world (worldXZ), so they
// stay put when the picture's origin moves (render/origin.js). Heights are
// never slid, so the beds in a cliff go by height as it is.

import * as THREE from 'three';
import { SHARED, SKY } from '../render/uniforms.js';
import { NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL } from '../render/glsl.js';
import { LIQUID } from './plan.js';

// How far off anything of Hell is drawn (m), shared by its materials: past
// where the air hides everything (air.js sets it), a thing isn't drawn at
// all. (The picture takes what is right at the far plane for sky, and
// leaves the air off it; so nothing is left out there to be taken for it.)
export const SEEN = { uSeeFar: { value: 1e9 } };

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
        float gRough;
        vec3 gEmit;
        vec2 gTilt;
        // Rings spreading from where things break its surface: bubbles, drops.
        float rings(vec2 wp, float many, float rate) {
          float m = cellsIn(many);
          vec2 p = wp * (m / PERIOD);
          vec2 c = floor(p);
          vec2 id = wrapCell(c, m);
          float t = fract(uTime * rate * (0.6 + 0.8 * hash12(id + 3.0)) + hash12(id));
          vec2 at = c + 0.25 + 0.5 * vec2(hash12(id + 7.0), hash12(id + 11.0));
          float d = length(p - at) * 2.4;
          return smoothstep(0.08, 0.0, abs(d - t)) * (1.0 - t) * step(0.35, hash12(id + 17.0));
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
          vec3 base = diffuseColor.rgb * (0.78 + 0.3 * n2 + 0.16 * (n3 - 0.5));
          gRough = 1.0;
          gEmit = vec3(0.0);
          gTilt = vec2(0.0);

          // bare rock where it's steep, in beds
          float rocky = smoothstep(0.2, 0.42, slope + (n1 - 0.5) * 0.12);
          float bed = vnoise(vec2(vDrawn.y * 0.45 + n3 * 3.0, 3.7)) * 0.6 + vnoise(vec2(vDrawn.y * 2.1 + n1 * 1.5, 9.1)) * 0.4;
          vec3 rock = mix(vec3(0.036, 0.034, 0.034), vec3(0.085, 0.076, 0.07), bed) * (0.75 + 0.5 * n2);
          rock = mix(rock, diffuseColor.rgb * 0.8, 0.3);
          base = mix(base, rock, rocky * (1.0 - vFx.z));

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
          }

          // wet ground shines
          gRough = mix(gRough, 0.5, vFx.x * (0.6 + 0.4 * n1));
          base *= 1.0 - 0.3 * vFx.x;
          // hot ground gives a dull light of its own
          gEmit += vec3(1.0, 0.3, 0.06) * vFx.y * (0.35 + 0.65 * smoothstep(0.35, 0.8, wnoise(wp, 0.6, vec2(uTime * 0.05, 0.0)))) * 0.45;

          // what lies in the hollows
          float depth = vFx.w;
          float shore = smoothstep(-0.35, 0.0, depth);
          base *= 1.0 - 0.35 * shore;
          gRough = mix(gRough, 0.3, shore * 0.7);
          if (depth > 0.0) {
            int kind = int(vKind + 0.5);
            vec3 liq = vec3(0.012, 0.014, 0.018);
            float rough = 0.12;
            float through = 0.25; // m of it you can see the bed through
            vec2 flow = vec2(uTime * 0.03, uTime * 0.011);
            float swell = wnoise(wp, 0.4, flow) - 0.5;
            float ripple = wnoise(wp, 1.7, -flow * 2.3) - 0.5;
            if (kind == ${LIQUID.styx}) {
              liq = vec3(0.028, 0.03, 0.016) * (0.7 + 0.6 * n1);
              rough = 0.3;
              // the sullen, under it, sighing
              float b = rings(wp, 0.5, 0.35) + rings(wp + 13.0, 0.9, 0.5) * 0.6;
              liq += vec3(0.05, 0.055, 0.03) * b;
              gTilt += vec2(b) * 0.5;
            } else if (kind == ${LIQUID.blood}) {
              float boil = smoothstep(0.45, 0.85, wnoise(wp, 0.9, vec2(uTime * 0.35, -uTime * 0.21)));
              float roll = wnoise(wp, 0.22, vec2(uTime * 0.07, uTime * 0.05));
              liq = mix(vec3(0.07, 0.005, 0.004), vec3(0.2, 0.014, 0.008), roll);
              rough = 0.22;
              through = 0.08;
              gEmit += vec3(0.9, 0.05, 0.02) * (0.02 + 0.16 * boil + 0.06 * roll);
              gTilt += vec2(boil - 0.5) * 0.6;
            } else if (kind == ${LIQUID.pitch}) {
              liq = vec3(0.004, 0.004, 0.005);
              rough = 0.07;
              through = 0.03;
              float b = rings(wp, 0.35, 0.18);
              liq += vec3(0.02) * b;
              gTilt += vec2(b) * 0.9 + vec2(swell) * 0.3;
            } else if (kind == ${LIQUID.filth}) {
              liq = vec3(0.06, 0.042, 0.016) * (0.6 + 0.8 * n1);
              rough = 0.55;
              through = 0.05;
            } else if (kind == ${LIQUID.brook}) {
              liq = vec3(0.02, 0.032, 0.036);
              rough = 0.1;
              through = 0.7;
            } else if (kind == ${LIQUID.slush}) {
              liq = vec3(0.04, 0.045, 0.045);
              rough = 0.16;
              through = 0.3;
              float b = rings(wp, 1.3, 1.1) + rings(wp + 5.0, 2.1, 1.6);
              liq += vec3(0.04) * b;
              gTilt += vec2(b) * 0.7;
            }
            gTilt += vec2(swell, ripple) * 0.35;
            float cover = 1.0 - exp(-depth / through);
            // a line of scum where it meets the ground
            liq += vec3(0.02) * (1.0 - smoothstep(0.0, 0.06, depth));
            base = mix(base, liq, cover);
            gRough = mix(gRough, rough, cover);
            gEmit *= cover;
          }
          diffuseColor.rgb = base;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = gRough;`)
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
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
  mat.customProgramCacheKey = () => 'hell-ground';
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
        ${NOISE_GLSL}`,
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
        diffuseColor.rgb *= ${flesh ? '0.88 + 0.24 * sg' : '0.72 + 0.56 * sg'};`,
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
