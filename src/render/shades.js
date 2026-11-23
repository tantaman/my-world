// The shades of the dead, what they and the fires are drawn with, and the
// few ways a shade holds itself. Hell's and Purgatory's are the same people,
// only lit differently and doing other things.
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
// A shade's limbs are marked in its geometry (aTag: ±1 a leg, ±2 an arm:
// shade() below), and swing from the hip and the shoulder as it goes.

import * as THREE from 'three';
import { SHARED } from './uniforms.js';
import { NOISE_GLSL } from './glsl.js';
import { HEAT } from './pipeline.js';
import { createFlameMaterial as createFlame, flameBox } from './flame.js';
import { createHazeMaterial } from './haze.js';
import { Sculpt } from './sculpt.js';

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
// glow: the light of what is hot in it (aHot), linear: a coal's by default,
// or whatever else shines of itself (an angel's face)
export function createShadeMaterial({ hip = 0.92, shoulder = 1.42, glow = [1.6, 0.48, 0.08] } = {}) {
  const g = glow.map((c) => c.toFixed(3)).join(', ');
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
        totalEmissiveRadiance += vec3(${g}) * vHot;`,
      );
  };
  mat.customProgramCacheKey = () => `shade-${hip}-${shoulder}-${g}`;
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

const PALE = [0.3, 0.27, 0.25]; // a shade: ashen

// ── A shade ─────────────────────────────────────────────────────────────────
// The joints of a body 1.72 m tall, standing, arms hanging: each [x, y, z]
// for the right side (x > 0); the left is its mirror.
const STAND = {
  pelvis: [0, 0.93, 0],
  chest: [0, 1.4, 0],
  neck: [0, 1.5, 0],
  head: [0, 1.63, 0.01],
  hip: [0.09, 0.92, 0],
  knee: [0.1, 0.5, 0.01],
  ankle: [0.1, 0.07, 0],
  toe: [0.1, 0.03, 0.12],
  shoulder: [0.2, 1.42, 0],
  elbow: [0.23, 1.13, -0.02],
  wrist: [0.22, 0.86, 0.04],
};
// How they hold themselves otherwise: whatever differs from standing.
const POSES = {
  stand: {},
  // head down and shoulders in: the weeping, the slow processions
  bowed: { chest: [0, 1.37, 0.08], neck: [0, 1.45, 0.16], head: [0, 1.5, 0.27], elbow: [0.2, 1.1, 0.08], wrist: [0.16, 0.9, 0.2] },
  // leaning into a weight with both arms
  push: { pelvis: [0, 0.86, -0.3], hip: [0.09, 0.85, -0.3], chest: [0, 1.16, 0.06], neck: [0, 1.2, 0.17], head: [0, 1.24, 0.3], shoulder: [0.2, 1.17, 0.08], elbow: [0.22, 1.1, 0.34], wrist: [0.2, 1.08, 0.6], knee: [0.1, 0.46, -0.2], ankle: [0.1, 0.07, -0.55], toe: [0.1, 0.03, -0.43] },
  // arms thrown up: out of the marsh, out of the blood
  raise: { elbow: [0.3, 1.62, 0.06], wrist: [0.24, 1.92, 0.12], head: [0, 1.63, -0.03] },
  // sitting hunched over drawn-up knees
  sit: { pelvis: [0, 0.14, 0], hip: [0.1, 0.14, 0.02], chest: [0, 0.56, 0.14], neck: [0, 0.64, 0.2], head: [0, 0.74, 0.3], shoulder: [0.19, 0.58, 0.14], elbow: [0.24, 0.36, 0.3], wrist: [0.12, 0.44, 0.5], knee: [0.12, 0.5, 0.36], ankle: [0.12, 0.07, 0.55], toe: [0.12, 0.03, 0.67] },
  // lying on the back, arms flung out
  supine: { pelvis: [0, 0.13, 0], hip: [0.09, 0.12, 0], chest: [0, 0.16, 0.46], neck: [0, 0.15, 0.56], head: [0, 0.14, 0.68], shoulder: [0.2, 0.15, 0.47], elbow: [0.46, 0.08, 0.42], wrist: [0.7, 0.06, 0.52], knee: [0.11, 0.14, -0.42], ankle: [0.12, 0.07, -0.84], toe: [0.14, 0.16, -0.86] },
  // face down in the mud
  prone: { pelvis: [0, 0.13, 0], hip: [0.09, 0.12, 0], chest: [0, 0.14, 0.46], neck: [0, 0.12, 0.56], head: [0, 0.1, 0.68], shoulder: [0.2, 0.13, 0.47], elbow: [0.3, 0.07, 0.72], wrist: [0.16, 0.05, 0.9], knee: [0.11, 0.1, -0.42], ankle: [0.11, 0.06, -0.84], toe: [0.11, 0.03, -0.96] },
};

// A shade, as it holds itself in `pose`: a key of POSES, or the joints that
// differ from standing, as POSES has them. color: what it is (linear).
// thin: how much of a man's girth it has (1; the starved have less).
export function shade(pose = 'stand', color = PALE, thin = 1) {
  const J = { ...STAND, ...(typeof pose === 'string' ? POSES[pose] : pose) };
  const s = new Sculpt();
  const side = (p, k) => [p[0] * k, p[1], p[2]];
  const flat = J.pelvis[1] < 0.3 && J.head[1] < 0.3; // lying down
  // (a shade is drawn in its hundreds: few sides, coarse joints, one to a bone)
  const B = { sides: 5, joints: 'end', coarse: true };
  const c = color;
  const t = thin;
  // the trunk: hips, belly, chest, shoulders
  s.limb(J.pelvis, J.chest, 0.125 * t, 0.15 * t, c, { sides: 6, coarse: true });
  s.ball(J.pelvis[0], J.pelvis[1], J.pelvis[2], 0.15 * t, c, { sy: 0.75, sz: flat ? 1 : 0.8, coarse: true });
  s.limb(side(J.shoulder, -0.85), side(J.shoulder, 0.85), 0.085 * t, 0.085 * t, c, { sides: 5, coarse: true });
  s.limb(J.chest, J.neck, 0.062 * t, 0.052 * t, c, { sides: 5, joints: false });
  s.ball(J.head[0], J.head[1], J.head[2], 0.1, c, { sy: 1.18, sz: 1.08 });
  for (const k of [1, -1]) {
    s.tag = k;
    s.limb(side(J.hip, k), side(J.knee, k), 0.078 * t, 0.055 * t, c, B);
    s.limb(side(J.knee, k), side(J.ankle, k), 0.052 * t, 0.036 * t, c, B);
    s.limb(side(J.ankle, k), side(J.toe, k), 0.04, 0.03, c, { sides: 4, joints: false, capped: true });
    s.tag = 2 * k;
    s.limb(side(J.shoulder, k), side(J.elbow, k), 0.05 * t, 0.038 * t, c, B);
    s.limb(side(J.elbow, k), side(J.wrist, k), 0.036 * t, 0.03 * t, c, B);
  }
  s.tag = 0;
  return s.build();
}
