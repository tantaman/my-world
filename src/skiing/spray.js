// Snow thrown up: off the edges of your skis as you carve and skid, a burst
// as you land, and a cloud of it when you fall. Each grain flies on its own,
// hangs a moment in the air (powder is light) and settles.
//
// One THREE.Points of POOL grains moved on the CPU, like the splashes of
// water (splashes/splashes.js), and for the same reason kept from where the
// Points object stands rather than from the middle of the world: it is put
// down again where the snow is flying whenever that has moved away
// (render/origin.js).

import * as THREE from 'three';
import { SKY } from '../render/uniforms.js';
import { anchor } from '../render/origin.js';

const POOL = 512;
const GRAVITY = 6; // m/s²: powder falls slowly...
const DRAG = 2.6; // 1/s: ...and the air soon stops it
const LIFE = 1.6; // s: the most a grain lasts

export class Spray {
  constructor(scene) {
    this.pos = new Float32Array(POOL * 3);
    this.vel = new Float32Array(POOL * 3);
    this.floor = new Float32Array(POOL); // the snow it settles on
    this.age = new Float32Array(POOL).fill(-1); // s since thrown; -1: not in use
    this.fade = new Float32Array(POOL);
    this.next = 0;
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
          gl_PointSize = aFade > 0.0 ? (-mv.z < 5.0 ? 4.0 : -mv.z < 12.0 ? 3.0 : 2.0) : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        varying float vFade;
        void main() {
          if (vFade <= 0.0) discard;
          // white, lit by the sky and the sun
          vec3 c = mix(uHorizon, uZenith, 0.3) * 0.9 + uSunColor * 0.75 * clamp(uSunDir.y * 2.5, 0.0, 1.0) + 0.08;
          gl_FragColor = vec4(c, 0.8 * vFade);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  // Throw n grains from about (x, y, z), onto snow at `floor`: up at about
  // `up` m/s, `spread` m/s every way, carried along at (vx, vz).
  burst(x, y, z, floor, n, { up = 1.5, spread = 1, vx = 0, vz = 0, from = 0.15 } = {}) {
    const { x: wasX, z: wasZ } = this.points.position;
    const at = anchor(this.points, x, z);
    if (at.x !== wasX || at.z !== wasZ) this.age.fill(-1);
    x -= at.x;
    z -= at.z;
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % POOL;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const o = k * 3;
      this.pos[o] = x + Math.cos(a) * r * from;
      this.pos[o + 1] = y;
      this.pos[o + 2] = z + Math.sin(a) * r * from;
      const s = spread * (0.2 + 0.8 * Math.random());
      this.vel[o] = vx * (0.6 + 0.5 * Math.random()) + Math.cos(a) * s;
      this.vel[o + 1] = up * (0.4 + 0.8 * Math.random());
      this.vel[o + 2] = vz * (0.6 + 0.5 * Math.random()) + Math.sin(a) * s;
      this.floor[k] = floor - 0.05;
      this.age[k] = Math.random() * 0.3;
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
      this.vel[o + 1] = this.vel[o + 1] * damp - GRAVITY * dt;
      this.vel[o + 2] *= damp;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.vel[o + 1] < 0 && this.pos[o + 1] < this.floor[k]) this.age[k] = -1;
      this.fade[k] = this.age[k] < 0 ? 0 : 1 - this.age[k] / LIFE;
      if (this.fade[k] > 0) live++;
    }
    this.points.visible = live > 0;
    if (live || this._was) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.aFade.needsUpdate = true;
    }
    this._was = live > 0;
  }
}
