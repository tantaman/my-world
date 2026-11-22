// Heat haze: the air over something hot shimmers, bending what is seen
// through it this way and that as the hot air rises and churns.
//
// Something hot puts a mesh on the HEAT layer (render/pipeline.js) drawn
// with this material: not drawn into the picture, but into a small buffer
// of how far each pixel's light is bent, which the picture is then drawn
// through (the composite pass). So whatever lies behind the hot air
// shimmers, the water and the flames too, and nothing need know.
//
// The mesh is a box (render/flame.js: flameBox, its foot at y = 0, a unit
// across and high), as a flame's; the shimmer fills it `wide` times as wide
// and `tall` times as tall, strongest low and in the middle and dying out
// toward its top and sides, as the air over a fire does. It reads how far
// off the scene is from the copy of it (BEHIND), and bends nothing in front
// of itself. `head` and `move` carry it about as render/flame.js's are.
//
//   const mat = createHazeMaterial({ tall: 3 });
//   const haze = new THREE.InstancedMesh(flameBox(), mat, n); haze.layers.set(HEAT);
//
// The scene must say it has heat in it (scene.userData.heat = true), or the
// buffer isn't drawn at all.

import * as THREE from 'three';
import { SHARED, BEHIND } from './uniforms.js';
import { NOISE_GLSL, NOISE3_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL } from './glsl.js';

const SHIMMER = 0.035; // m: how far the hottest air bends what is seen through it, about

export function createHazeMaterial({ head = '', move = '', wide = 1.3, tall = 2.8, strength = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.uTime,
      uStrength: { value: strength },
      tBehind: BEHIND.tBehind,
      uProj: BEHIND.uProj,
    },
    vertexShader: /* glsl */ `
      varying vec3 vBox;
      varying vec3 vEye;
      varying float vFade;
      varying float vDepth;
      varying vec4 vClip;
      ${head}
      void main() {
        // the shimmer's box: the flame's, wider and taller
        vec3 scaled = position * vec3(${wide.toFixed(3)}, ${tall.toFixed(3)}, ${wide.toFixed(3)});
        vec4 p = vec4(scaled, 1.0);
        mat4 inst = mat4(1.0);
        #ifdef USE_INSTANCING
          inst = instanceMatrix;
        #endif
        p = inst * p;
        vec3 carry = vec3(0.0);
        float fade = 1.0;
        ${move}
        p.xyz += carry;
        vFade = fade;
        vBox = scaled;
        vec4 eye = inverse(modelMatrix) * vec4(cameraPosition, 1.0);
        eye.xyz -= carry;
        vEye = (inverse(inst) * eye).xyz;
        vec4 mv = modelViewMatrix * p;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
        vClip = gl_Position;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      uniform sampler2D tBehind;
      uniform mat4 uProj;
      varying vec3 vBox;
      varying vec3 vEye;
      varying float vFade;
      varying float vDepth;
      varying vec4 vClip;
      ${NOISE_GLSL}
      ${NOISE3_GLSL}
      const vec3 SIZE = vec3(${wide.toFixed(3)}, ${tall.toFixed(3)}, ${wide.toFixed(3)});
      void main() {
        vec3 dir = vBox - vEye;
        vec3 inv = 1.0 / dir;
        vec3 ta = (vec3(-0.5, 0.0, -0.5) * SIZE - vEye) * inv;
        vec3 tb = (vec3(0.5, 1.0, 0.5) * SIZE - vEye) * inv;
        vec3 lo = min(ta, tb);
        vec3 hi = max(ta, tb);
        float u0 = max(max(max(lo.x, lo.y), lo.z), 0.0);
        float u1 = min(min(hi.x, hi.y), hi.z);
        // (the buffer this is drawn into is smaller than the picture: where
        // in the picture it is, from where it was put)
        vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
        float uScene = texture2D(tBehind, suv).a / max(vDepth, 1.0e-3);
        u1 = min(u1, uScene);
        if (u1 <= u0) discard;
        // how much hot air the ray passes through, and which way it is
        // churning where it does
        vec2 bend = vec2(0.0);
        float du = (u1 - u0) / 4.0;
        float len = length(dir / SIZE) * du;
        for (int i = 0; i < 4; i++) {
          vec3 p = (vEye + dir * (u0 + (float(i) + 0.5) * du)) / SIZE;
          float r = length(p.xz) * 2.0;
          float hot = (1.0 - smoothstep(0.2, 1.0, r)) * smoothstep(0.0, 0.15, p.y) * (1.0 - smoothstep(0.4, 1.0, p.y));
          vec3 q = vec3(p.x * 5.0, p.y * 4.0 - uTime * 2.6, p.z * 5.0);
          bend += (vec2(vnoise3(q), vnoise3(q + 17.3)) - 0.5) * hot * len;
        }
        // in the picture: so far, at that distance
        vec2 shift = bend * ${SHIMMER.toFixed(3)} * 2.0 * vec2(uProj[0][0], uProj[1][1]) * 0.5 / vDepth;
        gl_FragColor = vec4(shift * uStrength * vFade, 0.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  });
}

// The shimmer over a hot surface (a river of blood, lava): the surface's own
// mesh, drawn `lift` m over it on the HEAT layer, bending what is seen
// across it. How hot each kind of it is (aKind, as render/liquid.js reads
// it) is `heat` (0: none); and it fades with distance, where the shimmer is
// finer than a pixel.
export function createSurfaceHaze({ heat = [], lift = 1.2 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.uTime,
      uOrigin: SHARED.uOrigin,
      uHeatOf: { value: Array.from({ length: 8 }, (_, i) => heat[i] || 0) },
      tBehind: BEHIND.tBehind,
      uProj: BEHIND.uProj,
    },
    vertexShader: /* glsl */ `
      attribute float aKind;
      uniform float uHeatOf[8];
      varying vec3 vDrawn;
      varying float vHot;
      varying float vDepth;
      varying vec4 vClip;
      void main() {
        vHot = uHeatOf[int(aKind + 0.5)];
        vec4 p = modelMatrix * vec4(position + vec3(0.0, ${lift.toFixed(2)}, 0.0), 1.0);
        vDrawn = p.xyz;
        vec4 mv = viewMatrix * p;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
        vClip = gl_Position;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D tBehind;
      uniform mat4 uProj;
      varying vec3 vDrawn;
      varying float vHot;
      varying float vDepth;
      varying vec4 vClip;
      ${NOISE_GLSL}
      ${WORLD_GLSL}
      ${WORLD_NOISE_GLSL}
      void main() {
        if (vHot <= 0.0) discard;
        vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
        if (texture2D(tBehind, suv).a < vDepth) discard;
        vec2 wp = worldXZ(vDrawn);
        vec2 rise = vec2(uTime * 0.7, -uTime * 1.1);
        vec2 bend = vec2(wnoise(wp, 1.3, rise), wnoise(wp, 1.3, rise + vec2(0.37, 0.0))) - 0.5;
        bend += (vec2(wnoise(wp, 3.1, -rise * 1.7), wnoise(wp, 3.1, -rise * 1.7 + vec2(0.0, 0.29))) - 0.5) * 0.5;
        float far = 1.0 - smoothstep(40.0, 160.0, vDepth);
        vec2 shift = bend * vHot * far * ${SHIMMER.toFixed(3)} * 2.5 * vec2(uProj[0][0], uProj[1][1]) * 0.5 / max(vDepth, 0.5);
        gl_FragColor = vec4(shift, 0.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
