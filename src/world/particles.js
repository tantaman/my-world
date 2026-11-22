// Drifting pollen / dust motes by day, fireflies by night: specks of a few
// millimetres (a firefly's glow is wider), so a pixel or two of pixel art.
// They belong to the open air, and thin out where the sky doesn't reach (a cave).
//
// The motes fill a box that follows you, each wrapping round to the far side
// as it leaves. The box is the object, put where you are; the shader works
// out each mote from the middle of it, so its numbers stay small wherever
// that is (render/origin.js).

import * as THREE from 'three';
import { SHARED, SKY } from '../render/uniforms.js';
import { POINT_GLSL, POINT_DISC_GLSL } from '../render/glsl.js';
import { OVER } from '../render/pipeline.js';

const MOTE = 0.006; // m across (a mote, made a little more of than it is)
const FIREFLY = 0.02; // m: the glow round one

const mod = (a, n) => ((a % n) + n) % n;

export function createParticles(count = 900) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random();
    pos[i * 3 + 1] = Math.random();
    pos[i * 3 + 2] = Math.random();
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.uTime,
      uPhase: { value: new THREE.Vector2() }, // where the middle is within the box's own repeat (x, z)
      uGround: { value: 0 },
      uBox: { value: new THREE.Vector3(46, 9, 46) },
      uOpen: { value: 1 },
      uNight: SKY.uNight,
      uSunColor: SKY.uSunColor,
      uLines: SHARED.uLines,
    },
    vertexShader: /* glsl */ `
      ${POINT_GLSL}
      attribute float aSeed;
      uniform float uTime;
      uniform vec2 uPhase;
      uniform float uGround;
      uniform vec3 uBox;
      uniform float uNight;
      varying float vAlpha;
      varying float vSeed;
      varying float vPx;
      void main() {
        vec3 p = position * uBox;
        float t = uTime * (0.15 + aSeed * 0.2);
        p += vec3(sin(t + aSeed * 31.0) * 1.6, sin(t * 0.7 + aSeed * 17.0) * 0.8 + uTime * 0.05, cos(t * 0.9 + aSeed * 23.0) * 1.6);
        // each mote keeps its place in the world as the box moves over it
        p.xz = mod(p.xz - uPhase + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
        p.y = uGround + mod(p.y - uGround, uBox.y) + 0.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        float blink = mix(1.0, pow(max(0.0, sin(uTime * (0.8 + aSeed) + aSeed * 40.0)), 6.0), uNight);
        vAlpha = smoothstep(0.4, 1.2, dist) * (1.0 - smoothstep(10.0, 23.0, dist)) * blink;
        vSeed = aSeed;
        vPx = pointPx(mix(${MOTE}, ${FIREFLY}, uNight), dist);
        gl_PointSize = vPx;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      uniform vec3 uSunColor;
      uniform float uOpen;
      varying float vAlpha;
      varying float vSeed;
      varying float vPx;
      ${POINT_DISC_GLSL}
      void main() {
        vec3 day = mix(vec3(1.0, 0.95, 0.75), uSunColor, 0.4) * 0.9;
        vec3 night = vec3(0.75, 1.0, 0.25) * 4.0;
        float a = vAlpha * pointDisc(vPx) * mix(0.45, 1.0, uNight) * mix(step(0.55, vSeed), 1.0, uNight) * step(vSeed, uOpen * 1.2 - 0.2);
        if (a < 0.02) discard;
        gl_FragColor = vec4(mix(day, night, uNight), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.layers.set(OVER); // in the air: drawn over the water, not seen through it (render/pipeline.js)
  points.frustumCulled = false;
  return {
    object: points,
    // open: how much of the sky reaches here (Sky.open)
    update(center, groundY, open = 1) {
      const box = mat.uniforms.uBox.value;
      points.position.set(center.x, 0, center.z);
      mat.uniforms.uPhase.value.set(mod(center.x, box.x), mod(center.z, box.z));
      mat.uniforms.uGround.value = groundY - 1;
      mat.uniforms.uOpen.value = open;
    },
  };
}
