// Drifting pollen / dust motes by day, fireflies by night. One-pixel points
// in the low-res render, which is exactly what you'd hand-place in pixel art.

import * as THREE from 'three';
import { SHARED, SKY } from '../render/uniforms.js';

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
      uCenter: { value: new THREE.Vector3() },
      uGround: { value: 0 },
      uBox: { value: new THREE.Vector3(46, 9, 46) },
      uNight: SKY.uNight,
      uSunColor: SKY.uSunColor,
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uCenter;
      uniform float uGround;
      uniform vec3 uBox;
      uniform float uNight;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vec3 p = position * uBox;
        float t = uTime * (0.15 + aSeed * 0.2);
        p += vec3(sin(t + aSeed * 31.0) * 1.6, sin(t * 0.7 + aSeed * 17.0) * 0.8 + uTime * 0.05, cos(t * 0.9 + aSeed * 23.0) * 1.6);
        vec3 c = vec3(uCenter.x, uGround, uCenter.z);
        p = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5 + c;
        p.y = uGround + mod(p.y - uGround, uBox.y) + 0.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        float blink = mix(1.0, pow(max(0.0, sin(uTime * (0.8 + aSeed) + aSeed * 40.0)), 6.0), uNight);
        vAlpha = (1.0 - smoothstep(10.0, 23.0, dist)) * blink;
        vSeed = aSeed;
        gl_PointSize = dist < 6.0 ? 2.0 : 1.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      uniform vec3 uSunColor;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vec3 day = mix(vec3(1.0, 0.95, 0.75), uSunColor, 0.4) * 0.9;
        vec3 night = vec3(0.75, 1.0, 0.25) * 4.0;
        float a = vAlpha * mix(0.45, 1.0, uNight) * mix(step(0.55, vSeed), 1.0, uNight);
        if (a < 0.02) discard;
        gl_FragColor = vec4(mix(day, night, uNight), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    object: points,
    update(center, groundY) {
      mat.uniforms.uCenter.value.copy(center);
      mat.uniforms.uGround.value = groundY - 1;
    },
  };
}
