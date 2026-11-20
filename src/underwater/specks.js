// Things that hang and rise in the water, seen only from under it: a slow
// drift of specks (silt, plankton, the odd bit of leaf) that shows you're
// moving through something, and bubbles — your breath now and then, a gush
// as you go under — wobbling up to burst at the surface.
//
// One-pixel points in the low-res render, like the pollen in the air. Like
// the pollen, the specks fill a box that is put where you are, each worked
// out from the middle of it; and the bubbles are measured from a spot near
// them (anchor()): so the numbers handed to the card stay small wherever you
// are (render/origin.js).

import * as THREE from 'three';
import { SHARED, SKY, UNDER } from '../render/uniforms.js';
import { anchor } from '../render/origin.js';
import { rand } from '../core/geom.js';

const mod = (a, n) => ((a % n) + n) % n;

const SPECKS = 700;
const BOX = new THREE.Vector3(18, 12, 18); // m, around the camera
const MAX_BUBBLES = 96;
// m/s a bubble rises at, and how far (m) it wobbles from side to side
const RISE = [0.45, 0.85];
const WOBBLE = 0.05;

export function createSpecks() {
  const pos = new Float32Array(SPECKS * 3);
  const seed = new Float32Array(SPECKS);
  for (let i = 0; i < SPECKS; i++) {
    pos[i * 3] = Math.random();
    pos[i * 3 + 1] = Math.random();
    pos[i * 3 + 2] = Math.random();
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    // uPhase: where the middle is within the box's own repeat (x, z); uEye:
    // how high it is
    uniforms: { uTime: SHARED.uTime, uPhase: { value: new THREE.Vector2() }, uEye: { value: 0 }, uBox: { value: BOX }, ...UNDER, ...SKY },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec2 uPhase;
      uniform float uEye;
      uniform vec3 uBox;
      uniform float uUnder;
      uniform float uUnderLevel;
      varying float vSeed;
      void main() {
        vec3 p = position * uBox;
        float t = uTime * (0.05 + aSeed * 0.07);
        p += vec3(sin(t + aSeed * 31.0) * 0.8, sin(t * 0.7 + aSeed * 17.0) * 0.5 - uTime * 0.02, cos(t * 0.9 + aSeed * 23.0) * 0.8);
        // each speck keeps its place in the water as the box moves through it
        p.xz = mod(p.xz - uPhase + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
        p.y = mod(p.y - uEye + uBox.y * 0.5, uBox.y) - uBox.y * 0.5 + uEye;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // only under water, and never above the surface
        if (uUnder < 0.5 || p.y > uUnderLevel) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        vSeed = aSeed;
        gl_PointSize = -mv.z < 3.0 ? 2.0 : 1.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunColor;
      uniform vec3 uZenith;
      uniform float uUnderSea;
      varying float vSeed;
      void main() {
        vec3 c = mix(vec3(0.55, 0.6, 0.45), vec3(0.6, 0.7, 0.75), uUnderSea) * (uZenith * 2.0 + uSunColor * 0.6);
        if (vSeed > 0.93) c *= vec3(0.6, 0.45, 0.3); // a scrap of leaf
        gl_FragColor = vec4(c * (0.5 + vSeed * 0.6), 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    object: points,
    update(center) {
      points.position.set(center.x, 0, center.z);
      mat.uniforms.uPhase.value.set(mod(center.x, BOX.x), mod(center.z, BOX.z));
      mat.uniforms.uEye.value = center.y;
    },
  };
}

// Bubbles: let(x, y, z, n) lets n go from about there; update(dt, surfaceAt)
// lifts them, and surfaceAt(x, z) says where each bursts (the water's level,
// or null for no water).
export function createBubbles() {
  const pos = new Float32Array(MAX_BUBBLES * 3).fill(-1e5);
  const size = new Float32Array(MAX_BUBBLES);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...SKY },
    vertexShader: /* glsl */ `
      attribute float aSize;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * 60.0 / -mv.z, 1.0, 4.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uSunColor;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float r = length(q);
        if (r > 0.5) discard;
        // a bright rim and a glint, dark in the middle
        float rim = smoothstep(0.25, 0.45, r) + step(length(q - vec2(-0.15, -0.15)), 0.1);
        gl_FragColor = vec4((uZenith * 2.5 + uSunColor) * (0.35 + 0.9 * rim), 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const list = []; // { x, y, z, vy, ph, s }
  return {
    object: points,
    get count() {
      return list.length;
    },
    let(x, y, z, n, spread = 0.12) {
      for (let i = 0; i < n && list.length < MAX_BUBBLES; i++) {
        const s = rand(0.02, 0.06);
        list.push({ x: x + rand(-spread, spread), y: y + rand(-spread, spread), z: z + rand(-spread, spread), vy: rand(RISE[0], RISE[1]) * (0.6 + s * 8), ph: rand(0, 6.3), s });
      }
    },
    update(dt, surfaceAt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.y += b.vy * dt;
        b.ph += dt * 9;
        b.x += Math.cos(b.ph) * WOBBLE * dt * 6;
        b.z += Math.sin(b.ph * 0.8) * WOBBLE * dt * 6;
        const top = surfaceAt(b.x, b.z);
        if (top === null || b.y >= top - 0.03) list.splice(i, 1);
      }
      const at = list.length ? anchor(points, list[0].x, list[0].z) : points.position;
      for (let i = 0; i < MAX_BUBBLES; i++) {
        const b = list[i];
        pos[i * 3] = b ? b.x - at.x : 0;
        pos[i * 3 + 1] = b ? b.y : -1e5;
        pos[i * 3 + 2] = b ? b.z - at.z : 0;
        size[i] = b ? b.s : 0;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    },
  };
}
