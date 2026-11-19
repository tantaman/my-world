import * as THREE from 'three';
import { NOISE_GLSL, GROUND_GLSL } from '../render/glsl.js';

// Uniforms shared by every material that animates or reacts to the player.
export const SHARED = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uPlayer: { value: new THREE.Vector3() },
  uGrassRadius: { value: 40 },
};

// ── Terrain ────────────────────────────────────────────────────────────────
// The ground colour is computed per pixel from world position: meadow grass,
// leaf litter and moss under the trees, packed dirt on the paths, bare rock on
// steep slopes. At low resolution this reads as hand-placed pixel texture.
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aGround;
        varying vec2 vGround;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vGround = aGround;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        ${NOISE_GLSL}
        ${GROUND_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = groundColor(vWorldPos.xz, vGround.x, vGround.y, 1.0 - vWorldNormal.y);`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
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
