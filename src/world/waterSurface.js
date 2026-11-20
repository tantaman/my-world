// The surface of ponds, lakes, streams and rivers.
//
// Each chunk gets one water mesh, built from its height grid and the water
// grids the chunk worker produced (see chunkGen.js). A cell of the grid gets
// water if any of its corners is under the water level where water may stand,
// so the surface runs a little way up under the banks and the terrain hides
// the rest. Built on the main thread from the live heights, it's rebuilt when
// you dig: cut a hole beside a lake or a stream and it fills to their level.
//
// The material is see-through and writes depth (so fog and outlines treat it
// as the surface it is). It reflects the sky, with a dark band where the
// reflection would catch the treeline, glints in the sun, ripples in the
// wind, runs with the current, and turns white on cascades, along the shore
// and around your legs. The bed beneath is darkened with depth by the terrain
// shader (materials.js), so shallow water shows its stones.

import * as THREE from 'three';
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { SHARED } from './materials.js';
import { SKY } from './sky.js';
import { NO_WATER } from './water.js';
import { WATER_STRIDE as WS } from './chunkGen.js';

// How deep the explorer is standing in water (0 = dry, 1 = up to the waist);
// set each frame, drives the ripples and foam around them.
export const WADE = { uWade: { value: 0 } };

const UNSET = NO_WATER * 0.5;

// Water geometry for a chunk, or null if it has none. Positions are local to
// the chunk, like its terrain mesh.
export function buildWaterGeometry(ch) {
  const { n, step, heights: H, wLevel: L, wData: D } = ch;
  if (!ch.hasWater) return null;
  const N = n + 1;
  const wet = (k) => D[k * WS] > 0.5 && H[k] < L[k] - 0.002;
  const map = new Int32Array(N * N).fill(-1);
  const cells = [];
  let count = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * N + i;
      if (!(wet(a) || wet(a + 1) || wet(a + N) || wet(a + N + 1))) continue;
      cells.push(a);
      for (const k of [a, a + 1, a + N, a + N + 1]) if (map[k] < 0) map[k] = count++;
    }
  }
  if (!count) return null;

  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const flow = new Float32Array(count * 2);
  const foam = new Float32Array(count);
  const depth = new Float32Array(count);
  const sky = new Float32Array(count * 2); // leaves overhead, how open it is
  // A corner with no water level of its own (rare: a coarse cell straddling
  // the edge of a stream's valley) borrows the highest one around it.
  const level = (i, j) => {
    i = Math.min(n, Math.max(0, i));
    j = Math.min(n, Math.max(0, j));
    const k = j * N + i;
    if (L[k] > UNSET) return L[k];
    let best = UNSET;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii > n || jj > n) continue;
        const l = L[jj * N + ii];
        if (l > best) best = l;
      }
    }
    return best > UNSET ? best : H[k];
  };
  for (let k = 0; k < N * N; k++) {
    const m = map[k];
    if (m < 0) continue;
    const i = k % N;
    const j = (k - i) / N;
    const y = level(i, j);
    pos[m * 3] = i * step;
    pos[m * 3 + 1] = y;
    pos[m * 3 + 2] = j * step;
    // the surface tilts where it runs down a step
    const nx = level(i - 1, j) - level(i + 1, j);
    const nz = level(i, j - 1) - level(i, j + 1);
    const l = Math.hypot(nx, 2 * step, nz);
    nor[m * 3] = nx / l;
    nor[m * 3 + 1] = (2 * step) / l;
    nor[m * 3 + 2] = nz / l;
    flow[m * 2] = D[k * WS + 1];
    flow[m * 2 + 1] = D[k * WS + 2];
    foam[m] = D[k * WS + 3];
    depth[m] = y - H[k];
    // leaves overhead, where the woods close in over narrow water
    sky[m * 2] = ch.forest[k] * (1 - D[k * WS + 4]);
    sky[m * 2 + 1] = D[k * WS + 4];
  }
  const idx = new Uint16Array(cells.length * 6);
  let w = 0;
  for (const a of cells) {
    const A = map[a];
    const B = map[a + 1];
    const C = map[a + N];
    const Dd = map[a + N + 1];
    idx[w++] = A;
    idx[w++] = C;
    idx[w++] = B;
    idx[w++] = B;
    idx[w++] = C;
    idx[w++] = Dd;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
  geo.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
  geo.setAttribute('aSky', new THREE.BufferAttribute(sky, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function createWaterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    depthWrite: true,
    // The shader works out what light the water itself sends back (scatter,
    // glints, reflected sky) and how much of the bed it hides (alpha):
    // out = water + bed × (1 − alpha).
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY, WADE, { uPlayer: SHARED.uPlayer, uWind: SHARED.uWind });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aFlow;
        attribute float aFoam;
        attribute float aDepth;
        attribute vec2 aSky;
        varying vec2 vFlow;
        varying float vFoam;
        varying float vDepth;
        varying vec2 vSky;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vFlow = aFlow;
        vFoam = aFoam;
        vDepth = aDepth;
        vSky = aSky;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${SKY_UNIFORMS_GLSL}
        uniform vec3 uPlayer;
        uniform float uWade;
        uniform float uWind;
        varying vec2 vFlow;
        varying float vFoam;
        varying float vDepth;
        varying vec2 vSky; // x: leaves overhead, y: how open it is
        varying vec3 vWPos;
        ${NOISE_GLSL}
        ${SKY_GLSL}
        float ripple(vec2 p) { return vnoise(p) * 0.65 + vnoise(p * 2.3 + 7.1) * 0.35; }
        // gradient of the ripple field (per unit of p)
        vec2 rippleGrad(vec2 p) {
          float c = ripple(p);
          return vec2(ripple(p + vec2(0.06, 0.0)) - c, ripple(p + vec2(0.0, 0.06)) - c) / 0.06;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 wp = vWPos.xz;
        float depth = max(vDepth, 0.0);
        float speed = length(vFlow);
        float still = 1.0 - smoothstep(0.06, 0.3, speed);

        // Running water: ripples carried along by the current. Two copies of
        // the pattern, half a cycle apart, fade in and out so it never smears.
        const float CYC = 1.6;
        float ph0 = fract(uTime / CYC);
        float ph1 = fract(uTime / CYC + 0.5);
        float wt0 = 1.0 - abs(2.0 * ph0 - 1.0);
        vec2 gRun = rippleGrad((wp - vFlow * ph0 * CYC) * 1.1) * wt0
                  + rippleGrad((wp - vFlow * ph1 * CYC) * 1.1 + 0.37) * (1.0 - wt0);
        gRun *= 1.1 * (0.05 + 0.035 * min(speed, 2.5));
        // Still water: the wind ruffles it in two drifting layers.
        vec2 gStill = rippleGrad(wp * 0.9 + vec2(uTime * 0.21, uTime * 0.08)) * 0.9 * 0.03
                    + rippleGrad(wp * 0.37 - vec2(uTime * 0.05, -uTime * 0.09)) * 0.37 * 0.04;
        gStill *= 0.6 + 0.5 * uWind;
        vec2 g = mix(gRun, gStill, still);

        // rings spreading out from your legs as you wade
        vec2 toMe = wp - uPlayer.xz;
        float rMe = length(toMe);
        float ring = cos(rMe * 8.0 - uTime * 6.5) * exp(-rMe * 0.9) * uWade;
        g += toMe / max(rMe, 1e-3) * ring * 0.35;

        vec3 waterN = vec3(0.0, 1.0, 0.0); // world space; set with the normal below

        // White water on cascades and riffles, a lacy line along the shore,
        // and a froth around your legs.
        float churn = vnoise((wp - vFlow * ph0 * CYC) * 2.6) * wt0 + vnoise((wp - vFlow * ph1 * CYC) * 2.6 + 3.1) * (1.0 - wt0);
        float foam = smoothstep(0.35, 0.75, vFoam * (0.55 + 0.9 * churn));
        float lace = vnoise(wp * 3.1 + vec2(uTime * 0.3, 0.0));
        foam = max(foam, (1.0 - smoothstep(0.0, 0.07 + 0.05 * lace, depth)) * smoothstep(0.4, 0.7, lace) * 0.8);
        foam = max(foam, (1.0 - smoothstep(0.3, 0.75, rMe)) * smoothstep(0.35, 0.65, churn) * uWade * 0.9);

        // How much the water itself scatters back, from shallow to deep.
        float murk = 1.0 - exp(-depth * 0.75);
        vec3 body = mix(vec3(0.05, 0.085, 0.06), vec3(0.012, 0.04, 0.045), smoothstep(0.3, 3.0, depth));
        float scatter = mix(0.1, 0.8, murk);
        diffuseColor.rgb = mix(body * scatter, vec3(0.78, 0.8, 0.78), foam);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.9, foam);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // tilt with the surface on cascades, then add the ripples
          vec3 base = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          waterN = normalize(base + vec3(-g.x, 0.0, -g.y));
          normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // Reflection: the sky, except low down, where it would be the trees
          // across the water. The narrower the water, the higher its banks
          // and the trees on them stand in the reflection.
          vec3 V = normalize(cameraPosition - vWPos);
          vec3 R = reflect(-V, waterN);
          R.y = abs(R.y);
          float az = atan(R.z, R.x);
          float tree = 0.06 + 0.07 * vnoise(vec2(az * 9.0, 1.7)) + 0.04 * vnoise(vec2(az * 31.0, 5.3)) + (1.0 - vSky.y) * 0.45;
          vec3 sky = skyGradient(R);
          vec3 trees = (uHorizon * 0.5 + uZenith * 0.5) * vec3(0.09, 0.13, 0.08);
          vec3 refl = mix(trees, sky, smoothstep(tree - 0.015, tree + 0.015, R.y));
          // under the trees, mostly leaves with the odd bright gap
          vec2 leafUV = wp * 0.35 + R.xz / max(R.y, 0.15) * 1.5;
          float leaves = vSky.x * smoothstep(0.25, 0.55, vnoise(leafUV) * 0.7 + vnoise(leafUV * 3.1) * 0.3 + 0.12);
          refl = mix(refl, trees * 1.3, leaves);
          float cosV = clamp(dot(V, waterN), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
          outgoingLight += refl * F * (1.0 - foam);
          diffuseColor.a = clamp(scatter + F * (1.0 - scatter) + foam, 0.0, 1.0);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'water-v3';
  return mat;
}
