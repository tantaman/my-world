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
import { HEAT } from '../render/pipeline.js';
import { createFlameMaterial as createFlame, flameBox } from '../render/flame.js';
import { createHazeMaterial } from '../render/haze.js';

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

// How a flame (and the shimmer over it) is carried along, if it travels:
// for render/flame.js's `move`.
const CARRIED = `{
  vec4 q = p;
  fade = travel(q);
  carry = q.xyz - p.xyz;
}`;

// A flame: a box the fire burns in, a metre high and as wide
// (render/flame.js). Its instances can travel, like shades (the eighth
// ditch, where every flame is somebody). It is drawn on the OVER layer
// (render/pipeline.js), as a flame must be.
export function flameGeometry() {
  return flameBox();
}

export function createFlameMaterial() {
  return createFlame({
    head: GO_GLSL,
    move: CARRIED,
  });
}

// The shimmer over a flame (render/haze.js), carried with it as it is.
export function createFlameHaze() {
  return createHazeMaterial({ head: GO_GLSL, move: CARRIED });
}

// A flame's shimmer, as a mesh drawn alongside the flames' own `mesh`
// (sharing its shape and where each of them is), on the HEAT layer.
export function hazeOver(mesh, material) {
  const haze = new THREE.InstancedMesh(mesh.geometry, material, mesh.count);
  haze.instanceMatrix = mesh.instanceMatrix;
  haze.count = mesh.count;
  haze.layers.set(HEAT);
  haze.frustumCulled = mesh.frustumCulled;
  haze.matrixAutoUpdate = mesh.matrixAutoUpdate;
  haze.position.copy(mesh.position);
  haze.quaternion.copy(mesh.quaternion);
  haze.scale.copy(mesh.scale);
  haze.updateMatrix();
  if (mesh.boundingSphere) haze.boundingSphere = mesh.boundingSphere.clone();
  return haze;
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
