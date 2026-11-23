// What falls and blows in Hell: the rain, hail and snow of the third
// circle, the flakes of fire over the burning sand, the wind of the second
// and the wind off Lucifer's wings over the ice, sparks among the tombs, ash
// everywhere else.
//
// One cloud of specks in a box round the eye, drawn as points (sized in
// metres: render/glsl.js). They are never moved one by one: each has a place
// in the box and the box's contents slide through it and come round again,
// so what falls falls for ever. What kind of weather it is, is a handful of
// numbers (WEATHER), eased from one region's to the next as you go:
//
//   fall     which way and how fast it goes (m/s; x is on round the circle,
//            z is toward the middle of the pit)
//   sway     how far it wanders off that (m)
//   size     how big a speck is (m), and long: how many times longer than
//            wide it is drawn (rain is a streak)
//   colour   its light (linear; over 1 it glows)
//   much     how much of the cloud is there, 0..1
//   murk     how much it thickens the air, 0..1 (air.js: thick)
//   box      how close about you it all is, 0..1 of the box (thick rain is close)

import * as THREE from 'three';
import { SHARED } from '../render/uniforms.js';
import { POINT_GLSL } from '../render/glsl.js';
import { anchor } from '../render/origin.js';

const COUNT = 5200;
const BOX = [90, 46, 90]; // m: the box round the eye, unless the weather says closer (`box`: 0..1 of it)
const EASE = 0.5; // 1/s

const STILL = { fall: [0.15, -0.12, 0], sway: 1.2, size: 0.03, long: 1, colour: [0.2, 0.19, 0.18], much: 0.12, murk: 0, box: 1 };
export const WEATHER = {
  vestibule: STILL,
  acheron: { ...STILL, much: 0.2, murk: 0.1 },
  limbo: { ...STILL, much: 0.05 },
  // the hurricane: grit, flat out, on round the circle
  lustful: { fall: [26, -1.5, 3], sway: 1.6, size: 0.04, long: 20, colour: [0.11, 0.12, 0.15], much: 1, murk: 0.25, box: 0.7 },
  // "eternal, maledict, and cold, and heavy": rain, with hail and snow in it
  gluttons: { fall: [5, -15, 1.1], sway: 0.12, size: 0.021, long: 28, colour: [0.19, 0.22, 0.27], much: 1, murk: 0.35, box: 0.39 },
  avaricious: STILL,
  styx: { fall: [0.3, 0.1, 0], sway: 2.5, size: 0.06, long: 1, colour: [0.11, 0.12, 0.08], much: 0.5, murk: 0.2, box: 1 },
  // sparks, going up
  heretics: { fall: [0.4, 1.7, 0], sway: 1.4, size: 0.035, long: 1, colour: [5, 1.5, 0.3], much: 0.3, murk: 0, box: 1 },
  blood: { fall: [0.3, 0.7, 0], sway: 1.8, size: 0.05, long: 1, colour: [0.22, 0.1, 0.08], much: 0.35, murk: 0.1, box: 1 },
  wood: { ...STILL, much: 0.08 },
  // "dilated flakes of fire, as of the snow on Alp without a wind"
  sand: { fall: [0.1, -1.5, 0], sway: 0.5, size: 0.085, long: 1, colour: [7, 2, 0.35], much: 1, murk: 0, box: 0.75 },
  brink: { fall: [0.1, -1.5, 0], sway: 0.5, size: 0.085, long: 1, colour: [7, 2, 0.35], much: 0.3, murk: 0, box: 1 },
  malebolge: STILL,
  well: { fall: [0, -0.3, -3], sway: 1, size: 0.035, long: 3, colour: [0.5, 0.56, 0.62], much: 0.3, murk: 0.1, box: 1 },
  // the wind from the middle, and what it carries
  cocytus: { fall: [0, -0.4, -9], sway: 1.2, size: 0.035, long: 9, colour: [0.21, 0.27, 0.34], much: 0.9, murk: 0.2, box: 0.7 },
};

export class HellWeather {
  constructor(scene) {
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = Math.random();
      pos[i * 3 + 1] = Math.random();
      pos[i * 3 + 2] = Math.random();
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      uTime: SHARED.uTime,
      uLines: SHARED.uLines,
      uBox: { value: new THREE.Vector3(...BOX) },
      uEye: { value: new THREE.Vector3() }, // where the eye is, from the mesh
      uSlide: { value: new THREE.Vector3() }, // how far the box's contents have gone
      uVelocity: { value: new THREE.Vector3() },
      uSway: { value: 1 },
      uSize: { value: 0.03 },
      uLong: { value: 1 },
      uColour: { value: new THREE.Color(0.2, 0.2, 0.2) },
      uMuch: { value: 0.1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        ${POINT_GLSL}
        attribute float aSeed;
        uniform float uTime;
        uniform vec3 uBox;
        uniform vec3 uEye;
        uniform vec3 uSlide;
        uniform vec3 uVelocity;
        uniform float uSway;
        uniform float uSize;
        uniform float uLong;
        uniform float uMuch;
        varying float vShow;
        varying float vLong;
        varying vec2 vAlong;
        void main() {
          // where it is in the box, once the box's contents have slid along,
          // and the box has come with the eye
          vec3 q = fract(position + (uSlide - uEye) / uBox + 0.5);
          vec3 p = (q - 0.5) * uBox + uEye;
          float t = uTime * (0.4 + aSeed) + aSeed * 40.0;
          p += vec3(sin(t), sin(t * 0.7 + 2.0) * 0.4, cos(t * 0.9)) * uSway;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          // fewer of them, the less of it there is; and none right at the edge of the box
          vec3 e = abs(q - 0.5) * 2.0;
          vShow = step(aSeed, uMuch) * (1.0 - smoothstep(0.8, 1.0, max(e.x, max(e.y, e.z)))) * smoothstep(0.35, 2.1, dist);
          vec3 velocity = mat3(viewMatrix) * uVelocity;
          vec2 motion = velocity.xy + mv.xy * (velocity.z / max(dist, 0.35));
          float speed = length(motion);
          vAlong = speed > 0.01 ? motion / speed : vec2(0.0, 1.0);
          float stretch = smoothstep(0.05, 0.86, speed / max(length(velocity), 0.01));
          vLong = mix(1.0, uLong, stretch * mix(0.56, 1.0, aSeed));
          gl_PointSize = pointPx(uSize * (0.7 + 0.6 * aSeed) * vLong, dist);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColour;
        varying float vShow;
        varying float vLong;
        varying vec2 vAlong;
        void main() {
          if (vShow < 0.01) discard;
          vec2 p = (gl_PointCoord - 0.5) * vec2(1.0, -1.0);
          vec2 streak = vec2(dot(p, vAlong), dot(p, vec2(-vAlong.y, vAlong.x)) * vLong);
          float a = 1.0 - smoothstep(0.12, 0.5, length(streak));
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColour * a * vShow, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.now = { fall: [0, 0, 0], sway: 1, size: 0.03, long: 1, colour: [0.2, 0.2, 0.2], much: 0, murk: 0, box: 1 };
    this.fresh = true;
    this._slide = new THREE.Vector3();
  }

  // The weather of region `id`, eased into; eye: the camera's position;
  // ax, az: the way to the middle of the pit from there, in plan.
  update(dt, id, eye, ax, az) {
    const want = WEATHER[id] || STILL;
    const k = this.fresh ? 1 : 1 - Math.exp(-dt * EASE);
    this.fresh = false;
    const now = this.now;
    for (let c = 0; c < 3; c++) {
      now.fall[c] += (want.fall[c] - now.fall[c]) * k;
      now.colour[c] += (want.colour[c] - now.colour[c]) * k;
    }
    for (const key of ['sway', 'size', 'long', 'much', 'murk', 'box']) now[key] += (want[key] - now[key]) * k;
    // on round the circle, and inward, as directions in the world
    const l = Math.hypot(ax, az) || 1;
    const ix = ax / l;
    const iz = az / l;
    const u = this.uniforms;
    // (left of inward is on round: land.js)
    u.uVelocity.value.set(-iz * now.fall[0] + ix * now.fall[2], now.fall[1], ix * now.fall[0] + iz * now.fall[2]);
    this._slide.addScaledVector(u.uVelocity.value, dt);
    u.uBox.value.set(BOX[0] * now.box, BOX[1] * now.box, BOX[2] * now.box);
    u.uSlide.value.copy(this._slide);
    // the cloud is its own mesh, kept near the eye, its specks measured from it
    const at = anchor(this.points, eye.x, eye.z);
    u.uEye.value.set(eye.x - at.x, eye.y, eye.z - at.z);
    u.uSway.value = now.sway;
    u.uSize.value = now.size;
    u.uLong.value = now.long;
    u.uColour.value.setRGB(...now.colour);
    u.uMuch.value = now.much;
    return now.murk;
  }
}
