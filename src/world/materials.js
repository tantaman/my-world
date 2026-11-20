import * as THREE from 'three';
import { NOISE_GLSL, GROUND_GLSL } from '../render/glsl.js';
import { SHARED } from '../render/uniforms.js';

// ── Terrain ────────────────────────────────────────────────────────────────
// The ground colour is computed per pixel from world position: meadow grass,
// leaf litter and moss under the trees, packed dirt on the paths, bare rock on
// steep slopes, and, on a land with high ground, thin turf and stones above
// the trees and snow on the tops. At low resolution this reads as
// hand-placed pixel texture.
// Under water it turns to silt, pebbles and cobbles, darkening (reds first)
// with depth, with the light netted over it by the ripples, and a damp band
// and a little beach along the shore.
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aGround;
        attribute vec2 aWater; // water level, region (1 where water may stand)
        attribute vec2 aHigh; // how far above the trees, snow (0..1 each)
        varying vec2 vGround;
        varying vec2 vWater;
        varying vec2 vHigh;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vGround = aGround;
        vWater = aWater;
        vHigh = aHigh;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        varying vec2 vWater;
        varying vec2 vHigh;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        uniform float uTime;
        ${NOISE_GLSL}
        ${GROUND_GLSL}
        // Above the trees: thin, tawny turf among stones. Snow on top of that
        // where it lies, in drifts, but not on the cliffs.
        vec3 highGround(vec3 col, vec2 wp, vec2 high, float slope) {
          if (high.x + high.y < 0.001) return col;
          float n1 = vnoise(wp * 0.45 + 21.0);
          float n2 = vnoise(wp * 2.3 - 8.0);
          float n3 = vnoise(wp * 0.12 - 3.0);
          float gentle = 1.0 - smoothstep(0.3, 0.45, slope + (n1 - 0.5) * 0.12);
          vec3 turf = mix(vec3(0.085, 0.105, 0.04), vec3(0.15, 0.135, 0.075), smoothstep(0.35, 0.75, n1));
          vec3 stone = vec3(0.17, 0.165, 0.15) * (0.8 + 0.4 * n2);
          turf = mix(turf, stone, smoothstep(0.55, 0.8, n2 + (1.0 - n3) * 0.15) * 0.85);
          col = mix(col, turf, clamp(high.x * 1.3 - 0.15 + (n3 - 0.5) * 0.5, 0.0, 1.0) * gentle);
          float lie = clamp(high.y * 1.6 - 0.3 + (n3 - 0.5) * 0.9 + (n1 - 0.5) * 0.25, 0.0, 1.0);
          lie *= 1.0 - smoothstep(0.26, 0.4, slope + (n2 - 0.5) * 0.08);
          vec3 snow = vec3(0.6, 0.62, 0.66) * (0.93 + 0.1 * n2);
          return mix(col, snow, lie);
        }
        // Round stones, one at most to a cell: how far into the nearest one p
        // is (0 at its middle, 1 at its edge), and a number of its own.
        float pebble(vec2 p, float size, out float id) {
          vec2 c = floor(p);
          vec2 f = fract(p);
          float best = 9.0;
          id = 0.0;
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 o = vec2(float(i), float(j));
              vec2 at = o + 0.2 + 0.6 * vec2(hash12(c + o), hash12(c + o + 17.3));
              vec2 d = (f - at) / (size * (0.7 + 0.5 * hash12(c + o + 5.1)));
              // a little longer one way than the other, like a worn stone
              float a = hash12(c + o + 9.7) * 6.2832;
              d = mat2(cos(a), sin(a), -sin(a), cos(a)) * d * vec2(1.0, 1.35);
              float r = length(d);
              if (r < best) {
                best = r;
                id = hash12(c + o + 3.3);
              }
            }
          }
          return best;
        }
        // Light gathered into a moving net by the ripples overhead.
        float causticAt(vec2 p, float t) {
          vec2 q = p * 1.3 + vec2(vnoise(p * 0.6 + t * 0.21), vnoise(p * 0.6 - t * 0.17 + 4.0)) * 1.4;
          float n = vnoise(q) * 0.6 + vnoise(q * 2.1 + 7.0) * 0.4;
          return pow(1.0 - abs(n * 2.0 - 1.0), 8.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = groundColor(vWorldPos.xz, vGround.x, vGround.y, 1.0 - vWorldNormal.y);
        diffuseColor.rgb = highGround(diffuseColor.rgb, vWorldPos.xz, vHigh, 1.0 - vWorldNormal.y);
        if (vWater.y > 0.01) {
          vec2 wp = vWorldPos.xz;
          float wd = vWater.x - vWorldPos.y; // depth under the water surface
          float n1 = vnoise(wp * 0.7);
          float n2 = vnoise(wp * 2.9 + 5.0);
          // a beach of sand and gravel just above the water, damp at the edge
          vec3 sand = mix(vec3(0.19, 0.16, 0.11), vec3(0.15, 0.135, 0.11), smoothstep(0.35, 0.7, n2));
          float beach = (1.0 - smoothstep(0.08, 0.3 + 0.35 * n1, -wd)) * vWater.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, sand, beach * 0.85);
          diffuseColor.rgb *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.1 + 0.08 * n2, -wd)) * vWater.y;
          if (wd > 0.0) {
            // silt, pebbles and cobbles, rounded so they catch the light on
            // top, and the light dappled by the ripples overhead
            vec3 silt = vec3(0.11, 0.095, 0.065) * (0.8 + 0.4 * n1);
            vec3 bed = silt;
            float cid;
            float cob = pebble(wp * 1.4, 0.55, cid);
            float isCob = step(0.45, fract(cid * 3.7)); // not every cell has one
            vec3 cobC = mix(vec3(0.15, 0.145, 0.13), vec3(0.19, 0.16, 0.11), cid) * (0.75 + 0.5 * fract(cid * 7.3));
            bed = mix(bed, cobC * (0.65 + 0.4 * sqrt(max(0.0, 1.0 - cob * cob))), (1.0 - smoothstep(0.82, 1.0, cob)) * isCob);
            float id;
            float peb = pebble(wp * 4.3, 0.42, id);
            vec3 pebC = mix(vec3(0.13, 0.12, 0.10), vec3(0.2, 0.18, 0.14), id) * (0.8 + 0.4 * fract(id * 5.1));
            float onPeb = (1.0 - smoothstep(0.75, 1.0, peb)) * smoothstep(0.25, 0.55, n2) * (1.0 - isCob * step(cob, 0.82));
            bed = mix(bed, pebC * (0.8 + 0.35 * sqrt(max(0.0, 1.0 - peb * peb))), onPeb);
            // a hairline of shadow round each stone where it sits in the silt
            bed *= 1.0 - 0.35 * (smoothstep(0.85, 1.0, cob) - smoothstep(1.0, 1.15, cob)) * isCob;
            float caustic = causticAt(wp, uTime);
            bed *= 1.0 + caustic * 0.8 * exp(-wd * 1.5);
            diffuseColor.rgb = mix(diffuseColor.rgb, bed, smoothstep(0.0, 0.12, wd));
            diffuseColor.rgb *= exp(-wd * vec3(1.15, 0.6, 0.48));
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-v4';
  return mat;
}

// ── Vegetation (trees, bushes, ferns, rocks, logs) ─────────────────────────
// Vertex coloured, gently swaying in the wind. Foliage uses "spherical"
// normals baked into the geometry so canopies shade as soft volumes.
// Pass { sway: false } for a tree that's been felled (it shouldn't wave about).
export function createVegetationMaterial({ sway = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uWind = sway ? SHARED.uWind : { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSway;
        uniform float uTime;
        uniform float uWind;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 iPos = instanceMatrix[3].xyz;
          #else
            vec3 iPos = vec3(0.0);
          #endif
          vec2 wdir = normalize(vec2(1.0, 0.45));
          float ph = dot(iPos.xz, wdir) * 0.045;
          float gust = 0.55 + 0.45 * sin(uTime * 0.37 + ph * 0.7);
          float bend = sin(uTime * 1.25 + ph + iPos.x * 0.21) * 0.65 + sin(uTime * 2.3 + iPos.z * 0.37) * 0.35;
          vec3 wd = vec3(wdir.x, 0.0, wdir.y) * bend * gust * uWind * aSway;
          // leafy flutter
          wd += vec3(
            sin(uTime * 5.1 + position.y * 2.7 + iPos.x),
            sin(uTime * 4.3 + position.x * 3.1) * 0.5,
            cos(uTime * 4.7 + position.z * 2.9 + iPos.z)
          ) * 0.035 * uWind * step(0.001, aSway) * min(aSway * 4.0, 1.0);
          #ifdef USE_INSTANCING
            mat3 im = mat3(instanceMatrix);
            transformed += (transpose(im) * wd) / max(dot(im[0], im[0]), 1e-4);
          #else
            transformed += wd;
          #endif
        }`,
      );
    // Double sided foliage: keep the baked normal on back faces instead of
    // flipping it, otherwise leaf cards turn black from behind.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      normal = normalize(vNormal);`,
    );
  };
  mat.customProgramCacheKey = () => 'vegetation-v1';
  return mat;
}

// ── Grass ──────────────────────────────────────────────────────────────────
// Real blades near the player. They bend in the wind, part around your feet
// and shrink into the ground at the edge of the grass radius.
export function createGrassMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uWind = SHARED.uWind;
    shader.uniforms.uPlayer = SHARED.uPlayer;
    shader.uniforms.uGrassRadius = SHARED.uGrassRadius;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aBlade; // xyz = root (local), w = height fraction
        attribute vec2 aGround; // x = path (-1 = flower), y = forest
        varying vec2 vGround;
        varying vec2 vRootW;
        uniform float uTime;
        uniform float uWind;
        uniform vec3 uPlayer;
        uniform float uGrassRadius;`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 root = aBlade.xyz;
          float hf = aBlade.w;
          vec3 wroot = (modelMatrix * vec4(root, 1.0)).xyz;
          vGround = aGround;
          vRootW = wroot.xz;
          float dist = distance(wroot.xz, uPlayer.xz);
          float fade = 1.0 - smoothstep(uGrassRadius * 0.6, uGrassRadius, dist);
          transformed = root + (transformed - root) * fade;

          vec2 wdir = normalize(vec2(1.0, 0.45));
          float w = sin(uTime * 1.9 + wroot.x * 0.33 + wroot.z * 0.21) * 0.6
                  + sin(uTime * 0.8 + wroot.x * 0.07 - wroot.z * 0.05) * 0.4;
          float h2 = hf * hf;
          transformed.xz += wdir * (w * 0.5 + 0.35) * 0.16 * uWind * h2;

          vec2 away = wroot.xz - uPlayer.xz;
          float pd = length(away);
          float push = (1.0 - smoothstep(0.25, 1.1, pd)) * hf;
          transformed.xz += (away / max(pd, 1e-3)) * push * 0.42;
          transformed.y -= push * 0.18;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        varying vec2 vRootW;
        ${NOISE_GLSL}
        ${GROUND_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // blades take the colour of the ground they grow from; vertex colour
        // carries root-to-tip shading. Flowers keep their own colour.
        if (vGround.x > -0.5) diffuseColor.rgb *= groundColor(vRootW, 0.0, vGround.y * 0.55, 0.0);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = normalize(vNormal);`,
      );
  };
  mat.customProgramCacheKey = () => 'grass-v2';
  return mat;
}
