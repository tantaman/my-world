// What the adventures are drawn with: rain, flames, puffs (smoke, dust, a
// cloud of powder snow), things flying through the air, a bolt of lightning.
// Each is one draw call however many there are, and each is redrawn every
// frame from world positions, so its buffers are written from a spot near
// them that its mesh is kept at (anchor() in render/origin.js), never from
// the middle of the world.
//
//   new Rain(scene)        .update(at, { amount, wind: {x, z}, open }), .dispose()
//   new Flames(scene, n)   .set(i, x, y, z, height, seed, heat), .count = n, .update(), .dispose()
//   new Puffs(scene, n)    .add({ x, y, z, ... }), .update(dt, sky), .dispose()
//   new Flying(scene, n)   .add({ x, y, z, vx, vy, vz, size, color, ... }), .update(dt, ground), .dispose()
//   new Bolt(scene)        .strike(x0, y0, z0, x1, y1, z1, camera), .update(dt), .dispose()

import * as THREE from 'three';
import { SHARED, SKY } from '../render/uniforms.js';
import { anchor } from '../render/origin.js';
import { NOISE_GLSL } from '../render/glsl.js';
import { WIND } from '../fires/look.js';

const mod = (a, n) => ((a % n) + n) % n;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

// ── Rain ────────────────────────────────────────────────────────────────────
// Streaks a pixel wide filling a box that follows you, each wrapping round to
// the far side as it leaves it, like the motes (world/particles.js). They
// slant with the wind and fall fast; `amount` says how many of them fall.
const RAIN = { drops: 4200, box: [44, 22, 44], fall: 16, length: 1.8 };

export class Rain {
  constructor(scene) {
    const n = RAIN.drops;
    const pos = new Float32Array(n * 2 * 3);
    const drop = new Float32Array(n * 2 * 4);
    for (let i = 0; i < n; i++) {
      const x = Math.random();
      const y = Math.random();
      const z = Math.random();
      const seed = Math.random();
      for (let e = 0; e < 2; e++) {
        const k = i * 2 + e;
        pos[k * 3 + 1] = e; // 0 the head of the streak, 1 its tail
        drop.set([x, y, z, seed], k * 4);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDrop', new THREE.BufferAttribute(drop, 4));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: SHARED.uTime,
        uBox: { value: new THREE.Vector3(...RAIN.box) },
        uPhase: { value: new THREE.Vector2() },
        uGround: { value: 0 },
        uSlant: { value: new THREE.Vector2() },
        uAmount: { value: 0 },
        uSunColor: SKY.uSunColor,
        uNight: SKY.uNight,
      },
      vertexShader: /* glsl */ `
        attribute vec4 aDrop;
        uniform float uTime;
        uniform vec3 uBox;
        uniform vec2 uPhase;
        uniform float uGround;
        uniform vec2 uSlant;
        uniform float uAmount;
        varying float vAlpha;
        void main() {
          vec3 p = aDrop.xyz * uBox;
          float fall = ${RAIN.fall.toFixed(1)} * (0.85 + aDrop.w * 0.3);
          p.y -= uTime * fall;
          p.xz += uSlant * (uTime * (0.85 + aDrop.w * 0.3));
          p.xz = mod(p.xz - uPhase + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
          p.y = uGround + mod(p.y - uGround, uBox.y);
          // the tail trails up and back along the way it falls
          vec3 dir = normalize(vec3(uSlant.x, -fall, uSlant.y));
          p -= dir * position.y * ${RAIN.length.toFixed(2)};
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vAlpha = step(aDrop.w, uAmount) * (1.0 - smoothstep(14.0, 24.0, -mv.z));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunColor;
        uniform float uNight;
        varying float vAlpha;
        void main() {
          if (vAlpha < 0.02) discard;
          vec3 col = mix(vec3(0.5, 0.55, 0.62), uSunColor * 0.4 + vec3(0.25), 0.3) * mix(1.0, 0.25, uNight);
          gl_FragColor = vec4(col, vAlpha * 0.32);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.scene = scene;
  }

  // at: where you are; amount 0..1; wind: { x, z } m/s it slants with; open:
  // how much sky there is over you (none in a cave)
  update(at, { amount = 0, wind = { x: 0, z: 0 }, open = 1 }) {
    const a = amount * open;
    this.mesh.visible = a > 0.01;
    if (!this.mesh.visible) return;
    const u = this.mat.uniforms;
    const box = u.uBox.value;
    this.mesh.position.set(Math.round(at.x), 0, Math.round(at.z));
    u.uPhase.value.set(mod(this.mesh.position.x, box.x), mod(this.mesh.position.z, box.z));
    u.uGround.value = at.y - 6;
    u.uSlant.value.set(wind.x, wind.z);
    u.uAmount.value = a;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ── Flames ──────────────────────────────────────────────────────────────────
// The campfire's flame (fires/look.js) many times over: a quad that turns to
// face you, filled with noise that licks up into tongues. Set each one's
// place, height, seed and heat, and how many there are.
export class Flames {
  constructor(scene, max = 400) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(base.index);
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.flame = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFlame', this.flame);
    geo.setAttribute('aLook', this.look);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uWind: SHARED.uWind },
      vertexShader: /* glsl */ `
        attribute vec4 aFlame; // xyz its foot, from where the mesh stands; w how tall
        attribute vec2 aLook;  // x a seed, y how hot
        uniform float uTime;
        uniform float uWind;
        varying vec2 vUv;
        varying vec2 vLook;
        void main() {
          vUv = uv;
          vLook = aLook;
          vec3 c = (modelMatrix * vec4(aFlame.xyz, 1.0)).xyz;
          float sy = aFlame.w;
          float sx = sy * 0.6;
          vec2 toCam = cameraPosition.xz - c.xz;
          toCam /= max(length(toCam), 1e-4);
          vec3 right = vec3(toCam.y, 0.0, -toCam.x);
          float lean = uv.y * uv.y * (0.14 * uWind + 0.07 * sin(uTime * 2.1 + aLook.x));
          vec3 wp = c + right * position.x * sx + vec3(0.0, position.y * sy, 0.0) + vec3(${WIND.x.toFixed(3)}, 0.0, ${WIND.y.toFixed(3)}) * lean * sy;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying vec2 vLook;
        ${NOISE_GLSL}
        void main() {
          float y = vUv.y;
          float s = vLook.x;
          float n1 = fbm4(vec2(vUv.x * 3.1 + s, y * 2.2 - uTime * 2.4));
          float n2 = vnoise(vec2(vUv.x * 7.0 - s, y * 5.5 - uTime * 4.3));
          float x = (vUv.x - 0.5) * 2.0 + (n1 - 0.5) * 0.7 * y;
          float w = mix(0.95, 0.12, pow(y, 0.85));
          float body = 1.0 - smoothstep(0.35, 1.0, abs(x) / w);
          float top = 1.0 - smoothstep(0.25, 0.95, y + (n1 - 0.5) * 0.75 + (n2 - 0.5) * 0.3);
          float base = smoothstep(0.0, 0.08, y);
          float f = body * top * base * (0.55 + 0.75 * n2);
          if (f < 0.03) discard;
          vec3 col = mix(vec3(0.85, 0.16, 0.02), vec3(1.0, 0.46, 0.07), smoothstep(0.1, 0.45, f));
          col = mix(col, vec3(1.0, 0.86, 0.5), smoothstep(0.5, 0.9, f));
          gl_FragColor = vec4(col * f * (1.2 + 2.6 * vLook.y), 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.scene = scene;
    this.count = 0;
    this._at = null;
  }

  // Before setting this frame's flames: where to draw them from (near them).
  from(x, z) {
    this._at = anchor(this.mesh, x, z);
  }

  set(i, x, y, z, height, seed, heat) {
    if (i >= this.max) return;
    const at = this._at || this.mesh.position;
    this.flame.setXYZW(i, x - at.x, y, z - at.z, height);
    this.look.setXY(i, seed, heat);
  }

  update() {
    this.geo.instanceCount = Math.min(this.count, this.max);
    this.flame.needsUpdate = true;
    this.look.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ── Puffs ───────────────────────────────────────────────────────────────────
// Soft round billows that swell, drift and thin out: smoke, dust, powder
// snow, spray. Each has its own colour, lit by the sky's light like the
// campfire's smoke; `warm` adds a glow from below (firelight on smoke).
//
//   puffs.add({ x, y, z, vx, vy, vz, size, grow, life, alpha, color, warm, drag, rise })
export class Puffs {
  constructor(scene, max = 500) {
    this.max = max;
    this.list = [];
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(base.index);
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPuff = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aLook = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPuff', this.aPuff);
    geo.setAttribute('aLook', this.aLook);
    geo.setAttribute('aTint', this.aTint);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) }, uTime: SHARED.uTime },
      vertexShader: /* glsl */ `
        attribute vec4 aPuff; // xyz middle (from where the mesh stands), w size
        attribute vec3 aLook; // x opacity, y seed, z firelight
        attribute vec3 aTint;
        varying vec2 vUv;
        varying vec3 vLook;
        varying vec3 vTint;
        void main() {
          vUv = uv;
          vLook = aLook;
          vTint = aTint;
          vec4 mv = modelViewMatrix * vec4(aPuff.xyz, 1.0);
          mv.xy += position.xy * aPuff.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uAmbient;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vLook;
        varying vec3 vTint;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vUv - 0.5;
          float n = vnoise(vUv * 3.5 + vLook.y * 17.0 + vec2(0.0, -uTime * 0.15));
          float d = length(p) * 2.0 + (n - 0.5) * 0.6;
          float a = pow(1.0 - smoothstep(0.0, 1.0, d), 1.6) * vLook.x;
          if (a < 0.01) discard;
          vec3 col = vTint * uAmbient * (0.85 + 0.3 * n) + vec3(1.0, 0.42, 0.12) * vLook.z;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.scene = scene;
  }

  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    const c = p.color ?? 0x555555;
    _c.set(c);
    this.list.push({
      x: p.x,
      y: p.y,
      z: p.z,
      vx: p.vx ?? 0,
      vy: p.vy ?? 0.5,
      vz: p.vz ?? 0,
      size: p.size ?? 1,
      grow: p.grow ?? 0.3,
      life: p.life ?? 5,
      age: 0,
      alpha: p.alpha ?? 0.5,
      warm: p.warm ?? 0,
      drag: p.drag ?? 0.3,
      rise: p.rise ?? 0,
      seed: Math.random(),
      r: _c.r,
      g: _c.g,
      b: _c.b,
    });
  }

  clear() {
    this.list.length = 0;
  }

  // sky: the Sky (world/sky.js), whose light they take their colour from
  update(dt, sky) {
    const list = this.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k + p.rise * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      list[n++] = p;
    }
    list.length = n;
    const at = n ? anchor(this.mesh, list[0].x, list[0].z) : this.mesh.position;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const k = p.age / p.life;
      const fade = Math.min(1, p.age / 0.5) * (1 - k * k);
      this.aPuff.setXYZW(i, p.x - at.x, p.y, p.z - at.z, p.size + p.grow * p.age);
      this.aLook.setXYZ(i, p.alpha * fade, p.seed, p.warm * (1 - k));
      this.aTint.setXYZ(i, p.r, p.g, p.b);
    }
    this.geo.instanceCount = n;
    this.aPuff.needsUpdate = true;
    this.aLook.needsUpdate = true;
    this.aTint.needsUpdate = true;
    if (sky) {
      const c = this.mat.uniforms.uAmbient.value;
      c.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * 0.55);
      const sun = Math.max(0, sky.sunDir.y);
      c.r += sky.sun.color.r * sky.sun.intensity * 0.09 * (0.3 + sun);
      c.g += sky.sun.color.g * sky.sun.intensity * 0.09 * (0.3 + sun);
      c.b += sky.sun.color.b * sky.sun.intensity * 0.09 * (0.3 + sun);
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ── Things flying through the air ───────────────────────────────────────────
// Branches, boards, leaves, rocks, lumps of snow: little boxes, each its own
// size and colour, thrown, tumbling, falling and coming to rest. Something
// else can steer them as they fly (a twister's winds): `push(p, dt)`.
//
//   flying.add({ x, y, z, vx, vy, vz, size: [w, h, d], color, life, spin })
export class Flying {
  constructor(scene, max = 260) {
    this.max = max;
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.scene = scene;
    this.push = null; // (p, dt) => steer one as it flies
  }

  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    const size = p.size ?? [0.3, 0.3, 0.3];
    this.list.push({
      x: p.x,
      y: p.y,
      z: p.z,
      vx: p.vx ?? 0,
      vy: p.vy ?? 0,
      vz: p.vz ?? 0,
      sx: size[0],
      sy: size[1],
      sz: size[2],
      rx: Math.random() * 6,
      ry: Math.random() * 6,
      rz: Math.random() * 6,
      spin: p.spin ?? 6,
      color: new THREE.Color(p.color ?? 0x6b5a40),
      life: p.life ?? 6,
      age: 0,
      resting: false,
      gravity: p.gravity ?? 9.8,
      drag: p.drag ?? 0.1,
      tag: p.tag ?? null,
    });
  }

  clear() {
    this.list.length = 0;
  }

  // ground: (x, z) -> height of the floor there
  update(dt, ground) {
    const list = this.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      if (!p.resting) {
        if (this.push) this.push(p, dt);
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vz *= k;
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rx += p.spin * dt;
        p.ry += p.spin * 0.7 * dt;
        const g = ground(p.x, p.z) + p.sy * 0.5;
        if (p.y < g) {
          p.y = g;
          if (Math.abs(p.vy) > 2.5) {
            p.vy = -p.vy * 0.3;
            p.vx *= 0.5;
            p.vz *= 0.5;
          } else {
            p.resting = true;
            p.rx = Math.round(p.rx / (Math.PI / 2)) * (Math.PI / 2);
            p.rz = Math.round(p.rz / (Math.PI / 2)) * (Math.PI / 2);
          }
        }
      }
      list[n++] = p;
    }
    list.length = n;
    const at = n ? anchor(this.mesh, list[0].x, list[0].z) : this.mesh.position;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const shrink = Math.min(1, (p.life - p.age) / 0.6);
      _q.setFromEuler(_e.set(p.rx, p.ry, p.rz));
      _m.compose(_p.set(p.x - at.x, p.y, p.z - at.z), _q, _s.set(p.sx * shrink, p.sy * shrink, p.sz * shrink));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}

// ── Lightning ───────────────────────────────────────────────────────────────
// A bolt, for an instant: a jagged ribbon from the cloud to the ground,
// turned to face the camera, with a fork or two off it.
const BOLT = { show: 0.22, segments: 18, width: 0.9 };

export class Bolt {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4.4, 5.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.scene = scene;
    this.t = 0;
  }

  // From high (x0, y0, z0) down to (x1, y1, z1), facing camera.
  strike(x0, y0, z0, x1, y1, z1, camera) {
    const pts = [];
    const paths = [this._path(x0, y0, z0, x1, y1, z1, BOLT.segments, 7)];
    for (let f = 0; f < 2; f++) {
      const from = paths[0][3 + Math.floor(Math.random() * 8)];
      paths.push(this._path(from.x, from.y, from.z, from.x + (Math.random() - 0.5) * 50, from.y - 30 - Math.random() * 40, from.z + (Math.random() - 0.5) * 50, 7, 5));
    }
    const ox = Math.round(x1);
    const oz = Math.round(z1);
    const cam = camera.position;
    paths.forEach((path, j) => {
      const w = BOLT.width * (j ? 0.5 : 1);
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        // a ribbon across the line of sight
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const vx = cam.x - a.x;
        const vy = cam.y - a.y;
        const vz = cam.z - a.z;
        let sx = dy * vz - dz * vy;
        let sy = dz * vx - dx * vz;
        let sz = dx * vy - dy * vx;
        const l = Math.hypot(sx, sy, sz) || 1;
        sx = (sx / l) * w;
        sy = (sy / l) * w;
        sz = (sz / l) * w;
        const A = [a.x - ox, a.y, a.z - oz];
        const B = [b.x - ox, b.y, b.z - oz];
        pts.push(A[0] - sx, A[1] - sy, A[2] - sz, A[0] + sx, A[1] + sy, A[2] + sz, B[0] + sx, B[1] + sy, B[2] + sz);
        pts.push(A[0] - sx, A[1] - sy, A[2] - sz, B[0] + sx, B[1] + sy, B[2] + sz, B[0] - sx, B[1] - sy, B[2] - sz);
      }
    });
    this.mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.mesh.geometry = g;
    this.mesh.position.set(ox, 0, oz);
    this.mesh.visible = true;
    this.t = BOLT.show;
  }

  _path(x0, y0, z0, x1, y1, z1, n, jag) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const j = i === 0 || i === n ? 0 : jag;
      out.push({ x: x0 + (x1 - x0) * k + (Math.random() - 0.5) * j, y: y0 + (y1 - y0) * k, z: z0 + (z1 - z0) * k + (Math.random() - 0.5) * j });
    }
    return out;
  }

  update(dt) {
    if (this.t <= 0) return;
    this.t -= dt;
    // it flickers as it goes
    this.mat.opacity = this.t > 0 ? (Math.sin(this.t * 90) > -0.3 ? 1 : 0.2) : 0;
    if (this.t <= 0) this.mesh.visible = false;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
