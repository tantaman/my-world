// Drops of water thrown up when you go through it: a burst at each step, a
// spray off your shins when you run, a sheet of it when you land in it, and
// what runs off your arms when you swim. Each drop flies on its own, falls
// back, and is gone when it meets the water again.
//
// One THREE.Points of POOL drops, moved here on the CPU: there are never many
// at once, and none lives long. Like the pollen and the fireflies, each is a
// pixel or two in the low-res render, lit by the sky.

import * as THREE from 'three';
import { SKY } from '../render/uniforms.js';

const POOL = 384;
const GRAVITY = 9.8; // m/s²
const DRAG = 1.6; // 1/s: how fast the air slows a drop
const LIFE = 1.4; // s: the most a drop lasts, if it never comes down

export class Splashes {
  constructor(scene) {
    this.pos = new Float32Array(POOL * 3);
    this.vel = new Float32Array(POOL * 3);
    this.floor = new Float32Array(POOL); // the water it falls back into
    this.age = new Float32Array(POOL).fill(-1); // s since thrown; -1: not in use
    this.fade = new Float32Array(POOL); // 0 (gone) .. 1, for the shader
    this.next = 0;
    this.live = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uZenith: SKY.uZenith, uHorizon: SKY.uHorizon, uSunColor: SKY.uSunColor, uSunDir: SKY.uSunDir },
      vertexShader: /* glsl */ `
        attribute float aFade;
        varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vFade = aFade;
          // a pixel or two of the low-res render, bigger close up
          gl_PointSize = aFade > 0.0 ? (-mv.z < 4.5 ? 3.0 : -mv.z < 9.0 ? 2.0 : 1.0) : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        varying float vFade;
        void main() {
          if (vFade <= 0.0) discard;
          // a drop is a little bead of sky, with the sun caught in it
          vec3 c = mix(uHorizon, uZenith, 0.35) * 1.3 + uSunColor * 0.5 * clamp(uSunDir.y * 3.0, 0.0, 1.0);
          gl_FragColor = vec4(c, 0.85 * vFade);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  // Throw n drops from about (x, y, z), into water whose surface is at
  // `level`: up at about `up` m/s, `spread` m/s every way across, and
  // carried along at (vx, vz) on top of that.
  burst(x, y, z, level, n, { up = 2.2, spread = 0.9, vx = 0, vz = 0, from = 0.12 } = {}) {
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % POOL;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const o = k * 3;
      this.pos[o] = x + Math.cos(a) * r * from;
      this.pos[o + 1] = y;
      this.pos[o + 2] = z + Math.sin(a) * r * from;
      const s = spread * (0.3 + 0.7 * Math.random());
      this.vel[o] = vx + Math.cos(a) * s;
      this.vel[o + 1] = up * (0.45 + 0.75 * Math.random());
      this.vel[o + 2] = vz + Math.sin(a) * s;
      this.floor[k] = level;
      this.age[k] = 0;
    }
  }

  update(dt) {
    let live = 0;
    const damp = Math.exp(-DRAG * dt);
    for (let k = 0; k < POOL; k++) {
      if (this.age[k] < 0) {
        this.fade[k] = 0;
        continue;
      }
      const o = k * 3;
      this.age[k] += dt;
      if (this.age[k] >= LIFE) this.age[k] = -1;
      this.vel[o] *= damp;
      this.vel[o + 2] *= damp;
      this.vel[o + 1] -= GRAVITY * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      // back in the water
      if (this.vel[o + 1] < 0 && this.pos[o + 1] < this.floor[k]) this.age[k] = -1;
      this.fade[k] = this.age[k] < 0 ? 0 : 1 - this.age[k] / LIFE;
      if (this.fade[k] > 0) live++;
    }
    this.live = live;
    this.points.visible = live > 0;
    if (live || this._was) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.aFade.needsUpdate = true;
    }
    this._was = live > 0;
  }
}
