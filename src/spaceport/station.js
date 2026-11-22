// The rocket docks on the Promenade. The hiker walks in station coordinates
// while the capsule keeps its place in the forest for the flight home.
import * as THREE from 'three';
import { makeStars } from './stars.js';
import { NOISE_GLSL } from '../render/glsl.js';
import { buildStationHull } from './stationHull.js';
import { buildPromenade, WALK } from './promenade.js';
import { wrapAngle } from '../core/geom.js';

const SPEED = 3.9; // m/s walking
const DECK_Y = 4.8;
const FOLLOW = 3.4; // m behind the hiker
const LOOK_HEIGHT = 1.25; // m above the soles
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
    sun.position.set(-1.1, 1.5, 1.2).multiplyScalar(32);
    // Cover the public deck so the boots cast a shadow as each foot lands.
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 25, far: 110 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = 0.018;
    const rim = new THREE.DirectionalLight(0xadceff, 2.0);
    rim.position.set(1, 0.5, -1.3);
    this.scene.add(sun, rim, new THREE.HemisphereLight(0xc8d1e0, 0x9791ac, 1.25));
    this.promenade = buildPromenade();
    this.promenade.object.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    this.promenade.object.position.y = DECK_Y;
    this.scene.add(this.promenade.object);
    this.pos = new THREE.Vector3();
  }

  arrive(character, footstep) {
    this.character = character;
    this.home = { scene: character.root.parent, ground: character.groundAt, footstep: character.onFootstep, visible: character.root.visible };
    this.scene.add(character.root);
    character.groundAt = null; // the Promenade floor is level
    character.onFootstep = footstep;
    this.pos.set(0.7, DECK_Y, 18.1);
    this.yaw = -1.03;
    this.pitch = -0.18;
    character.root.position.copy(this.pos);
    character.root.rotation.y = this.yaw + Math.PI;
    this.follow = FOLLOW;
    this.bearing = -0.32;
    this.elevation = 0.35;
    this.range = 298; // m from the core, easing in on arrival
    this.targetRange = 252;
    this.time = 0;
    this.setDeck(true);
  }

  depart() {
    const c = this.character;
    this.home.scene.add(c.root);
    c.groundAt = this.home.ground;
    c.onFootstep = this.home.footstep;
    c.root.visible = this.home.visible;
    this.character = null;
    this.home = null;
  }

  setDeck(inside) {
    this.inside = inside;
    this.hull.core.visible = !inside;
    this.promenade.object.visible = inside;
    this.character.root.visible = inside;
    this.camera.fov = inside ? 68 : 43;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  update(dt, controls, zoom, running) {
    this.time += dt;
    this.rift.material.uniforms.time.value = this.time;
    const { turn, move } = controls;
    if (this.inside) {
      this.yaw += turn.yaw;
      this.pitch = clamp(this.pitch + turn.pitch, -0.95, 0.32);
      this.follow = clamp(this.follow + zoom * 0.35, 2, 4.5);
      const wasX = this.pos.x, wasZ = this.pos.z;
      const distance = SPEED * (running ? 1.7 : 1) * dt / Math.max(1, Math.hypot(move.x, move.y));
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.pos.x += (move.x * cos - move.y * sin) * distance;
      this.pos.z -= (move.x * sin + move.y * cos) * distance;
      // Project onto the annulus, so walking into a counter slides along it.
      const r = Math.hypot(this.pos.x, this.pos.z);
      const k = clamp(r, WALK.inner, WALK.outer) / r;
      this.pos.x *= k;
      this.pos.z *= k;
      const dx = this.pos.x - wasX, dz = this.pos.z - wasZ;
      const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      const c = this.character;
      let turnRate = 0;
      if (speed > 0.05) {
        const turn = wrapAngle(Math.atan2(dx, dz) - c.root.rotation.y) * (1 - Math.exp(-12 * dt));
        c.root.rotation.y += turn;
        turnRate = turn / dt;
      }
      c.root.position.copy(this.pos);
      c.update(dt, speed, true, 0, turnRate);
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
      // Stop the camera before the first window or shopfront along its ray.
      // Lift it over the shoulder when a wall is directly behind the hiker.
      const x = Math.sin(this.yaw), z = Math.cos(this.yaw);
      const along = this.pos.x * x + this.pos.z * z;
      const r2 = this.pos.x ** 2 + this.pos.z ** 2;
      const inner = WALK.inner - 0.16, outer = WALK.outer + 0.16;
      const innerHit = along * along + inner * inner - r2;
      const wall = along < 0 && innerHit >= 0
        ? -along - Math.sqrt(innerHit)
        : -along + Math.sqrt(along * along + outer * outer - r2);
      const wanted = this.follow * Math.cos(this.pitch);
      const back = Math.min(wanted, wall);
      const height = Math.max(0.4, LOOK_HEIGHT - this.follow * Math.sin(this.pitch));
      const lift = 1 - Math.min(1, back / 1.6);
      cam.position.set(this.pos.x + x * back, DECK_Y + Math.min(4, height + lift * Math.max(0, 3.2 - height)), this.pos.z + z * back);
      cam.lookAt(this.pos.x, DECK_Y + LOOK_HEIGHT, this.pos.z);
    } else {
      // Keep the two pylons at the sides in frame on a tall screen too.
      const r = this.range * Math.max(1, 1.35 / cam.aspect);
      const flat = r * Math.cos(this.elevation);
      cam.position.set(flat * Math.sin(this.bearing), r * Math.sin(this.elevation), flat * Math.cos(this.bearing));
      cam.lookAt(0, -3, 0);
    }
  }
}
