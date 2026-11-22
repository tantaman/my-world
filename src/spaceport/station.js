// A flight past the station and a walk round its Promenade. The camera and
// both decks live here so a visit can never move the forest's hiker or gun.
import * as THREE from 'three';
import { makeStars } from './stars.js';
import { NOISE_GLSL } from '../render/glsl.js';
import { buildStationHull } from './stationHull.js';
import { buildPromenade, WALK } from './promenade.js';

const SPEED = 3.9; // m/s walking
const EYE = 1.65;
const clamp = THREE.MathUtils.clamp;

function wormhole() {
  // Streaks of ionised gas wind into the dark throat. The orange inner
  // filaments and blue outer petals turn slowly against the fixed stars.
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      uniform float time;
      ${NOISE_GLSL}
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float twist = 1.9 * log(max(r, 0.08)) - time * 0.06;
        vec2 gas = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * p;
        float turbulence = fbm4(gas * 7.0 + 31.0);
        float spiral = a + twist + (turbulence - 0.5) * 1.25;
        float waves = sin(spiral * 5.0 + 0.8 * sin(spiral * 3.0) + r * 9.0);
        float dust = fbm4(gas * vec2(10.0, 27.0) + 9.0 * turbulence);
        float rim = 0.47 + 0.13 * waves + 0.05 * sin(spiral * 9.0);
        float cloud = exp(-8.0 * abs(r - rim)) * smoothstep(0.09, 0.24, r);
        float core = exp(-13.0 * abs(r - 0.24 - 0.045 * sin(spiral * 3.0)));
        vec3 blue = mix(vec3(0.07, 0.20, 0.58), vec3(0.30, 0.84, 1.22), dust * dust);
        vec3 rgb = blue * cloud * (0.12 + 2.6 * dust * dust) + vec3(1.4, 0.63, 0.32) * core * dust;
        rgb += vec3(0.07, 0.08, 0.25) * turbulence * exp(-4.0 * r);
        gl_FragColor = vec4(rgb * (1.0 - smoothstep(0.72, 0.98, r)), 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(610, 435), mat);
  mesh.position.set(1190, -130, -1630);
  mesh.lookAt(0, 0, 0);
  mesh.rotateZ(0.30);
  return mesh;
}

export class StationVisit {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(43, aspect, 0.1, 5000);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080b18);
    this.hull = buildStationHull();
    this.rift = wormhole();
    const stars = makeStars();
    stars.material.size = 1.5;
    this.scene.add(stars, this.rift, this.hull.core, this.hull.rings);
    const sun = new THREE.DirectionalLight(0xffead6, 3.0);
    sun.position.set(-1.1, 1.5, 1.2);
    const rim = new THREE.DirectionalLight(0xadceff, 2.0);
    rim.position.set(1, 0.5, -1.3);
    this.scene.add(sun, rim, new THREE.HemisphereLight(0xc8d1e0, 0x9791ac, 1.25));
    this.pos = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.bearing = -0.32;
    this.elevation = 0.35;
    this.range = 298; // m from the core, easing in on arrival
    this.targetRange = 252;
    this.time = 0;
    this.setDeck(false);
  }

  setDeck(inside) {
    if (inside && !this.promenade) {
      this.promenade = buildPromenade();
      this.promenade.object.position.y = 4.8;
      this.scene.add(this.promenade.object);
    }
    this.inside = inside;
    this.hull.core.visible = !inside;
    if (this.promenade) this.promenade.object.visible = inside;
    this.camera.fov = inside ? 68 : 43;
    this.camera.updateProjectionMatrix();
    if (inside) {
      this.pos.set(0.7, this.promenade.object.position.y + EYE, 19.4);
      this.yaw = -0.76;
      this.pitch = 0.05;
    }
    this.placeCamera();
  }

  update(dt, controls, zoom, running) {
    this.time += dt;
    this.rift.material.uniforms.time.value = this.time;
    const { turn, move } = controls;
    if (this.inside) {
      this.yaw += turn.yaw;
      this.pitch = clamp(this.pitch + turn.pitch, -1.35, 1.35);
      const distance = SPEED * (running ? 1.7 : 1) * dt / Math.max(1, Math.hypot(move.x, move.y));
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.pos.x += (move.x * cos - move.y * sin) * distance;
      this.pos.z -= (move.x * sin + move.y * cos) * distance;
      // Project onto the annulus, so walking into a counter slides along it.
      const r = Math.hypot(this.pos.x, this.pos.z);
      const k = clamp(r, WALK.inner, WALK.outer) / r;
      this.pos.x *= k;
      this.pos.z *= k;
      this.promenade.update(dt, this.pos);
    } else {
      this.bearing += turn.yaw - (move.x * 0.8 + 0.025) * dt;
      this.elevation = clamp(this.elevation + turn.pitch, -1.1, 1.1);
      this.targetRange = clamp(this.targetRange - move.y * 80 * dt + zoom * 10, 145, 360);
      this.range += (this.targetRange - this.range) * (1 - Math.exp(-dt * 1.2));
    }
    this.placeCamera();
  }

  placeCamera() {
    const cam = this.camera;
    if (this.inside) {
      cam.position.copy(this.pos);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else {
      // Keep the two pylons at the sides in frame on a tall screen too.
      const r = this.range * Math.max(1, 1.35 / cam.aspect);
      const flat = r * Math.cos(this.elevation);
      cam.position.set(flat * Math.sin(this.bearing), r * Math.sin(this.elevation), flat * Math.cos(this.bearing));
      cam.lookAt(0, -3, 0);
    }
  }
}
