// What the shades, and the fires, are drawn with.
//
// Both are drawn many at once (instances), and either can be going
// somewhere: each instance says which way, how fast and over how long a
// stretch (aGo), and where in that stretch it starts, how the ground rises
// along it, how deep it stands in whatever it's in, and how much it strides
// (aHow). One that travels goes the length of its stretch, fading out at the
// end and in again at the start, as shades may; a file of them, each on its
// own stretch, is a procession without end.
//
//   aGo    dirX, dirZ, speed (m/s), span (m; 0: it stays where it is)
//   aHow   phase (0..1), rise (m, from one end of the span to the other),
//          sink (m), stride (0..1)
//
// A shade's limbs are marked in its geometry (aTag: ±1 a leg, ±2 an arm,
// models.js), and swing from the hip and the shoulder as it goes.

import * as THREE from 'three';
import { SHARED } from '../render/uniforms.js';
import { NOISE_GLSL } from '../render/glsl.js';

// The travel of an instance, for a vertex shader: moves `p` (the vertex,
// already placed by its instance) and gives how much of it is there (0..1).
const GO_GLSL = /* glsl */ `
attribute vec4 aGo;
attribute vec4 aHow;
uniform float uTime;
float travel(inout vec4 p) {
  float fade = 1.0;
  p.y -= aHow.z;
  if (aGo.w > 0.0) {
    float s = mod(uTime * aGo.z + aHow.x * aGo.w, aGo.w) - 0.5 * aGo.w;
    p.xz += aGo.xy * s;
    p.y += aHow.y * (s / aGo.w);
    fade = smoothstep(0.0, 3.0, 0.5 * aGo.w - abs(s));
  }
  return fade;
}`;

// hip, shoulder: how high the legs and the arms swing from (m)
export function createShadeMaterial({ hip = 0.92, shoulder = 1.42 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aTag;
        attribute float aHot;
        varying float vHot;
        varying float vFade;
        ${GO_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vHot = aHot;
        if (abs(aTag) > 0.5 && aHow.w > 0.0) {
          bool leg = abs(aTag) < 1.5;
          float gait = 6.2832 * (uTime * max(aGo.z, 0.4) / 1.5 + aHow.x * 7.0);
          float swing = (leg ? 1.0 : -0.8) * sign(aTag) * sin(gait) * aHow.w * (0.22 + 0.3 * min(1.0, aGo.z / 2.5));
          vec2 pivot = vec2(leg ? ${hip.toFixed(3)} : ${shoulder.toFixed(3)}, 0.0);
          vec2 q = transformed.yz - pivot;
          float c = cos(swing);
          float s = sin(swing);
          transformed.yz = pivot + vec2(q.x * c + q.y * s, -q.x * s + q.y * c);
        }`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vFade = travel(mvPosition);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vHot;
        varying float vFade;
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vFade < 0.995 && vFade <= hash12(gl_FragCoord.xy)) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * vHot * 1.6;`,
      );
  };
  mat.customProgramCacheKey = () => `hell-shade-${hip}-${shoulder}`;
  return mat;
}

// A flame: two upright cards crossed, a metre high and half as wide, the
// fire drawn on them. Its instances can travel, like shades (the eighth
// ditch, where every flame is somebody).
export function flameGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  const idx = [];
  for (let k = 0; k < 2; k++) {
    const c = k ? 0 : 0.5;
    const s = k ? 0.5 : 0;
    const b = pos.length / 3;
    pos.push(-c, 0, -s, c, 0, s, c, 1, s, -c, 1, -s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 0.8);
  return g;
}

export function createFlameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime },
    vertexShader: /* glsl */ `
      ${GO_GLSL}
      varying vec2 vUv;
      varying float vSeed;
      varying float vFade;
      void main() {
        vUv = uv;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          vSeed = fract(instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71);
        #else
          vSeed = 0.0;
        #endif
        // it leans and licks about, more at the top
        float t = uTime * 2.3 + vSeed * 40.0;
        p.x += sin(t + p.y * 1.7) * 0.07 * uv.y * uv.y;
        p.z += cos(t * 1.3 + p.y) * 0.07 * uv.y * uv.y;
        vFade = travel(p);
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      varying float vFade;
      void main() {
        float x = abs(vUv.x - 0.5) * 2.0;
        float n = fbm4(vec2(vUv.x * 2.6 + vSeed * 31.0, vUv.y * 2.2 - uTime * 1.9 - vSeed * 7.0));
        // wide at the foot, drawn to a point, eaten into by the noise
        float body = 1.0 - x / max(0.05, 1.0 - vUv.y * 0.95);
        float f = body * (1.0 - vUv.y * 0.6) + (n - 0.55) * (0.5 + vUv.y);
        f = smoothstep(0.05, 0.6, f) * smoothstep(0.0, 0.08, vUv.y);
        if (f < 0.01) discard;
        vec3 col = mix(vec3(0.85, 0.12, 0.015), vec3(1.0, 0.5, 0.12), smoothstep(0.35, 1.0, f));
        gl_FragColor = vec4(col * f * 2.6 * vFade, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// The flame's geometry for n fires that stay where they are: its own, sharing
// the shape's buffers, with the "going nowhere" every instance has to say.
export function stillFlames(shape, n) {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(shape.attributes)) g.setAttribute(name, shape.attributes[name]);
  g.setIndex(shape.index);
  g.setAttribute('aGo', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('aHow', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
  g.boundingSphere = shape.boundingSphere;
  return g;
}
