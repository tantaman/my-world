// What the water's surface can't show of a breaking wave: the lip.
//
// The water is a sheet that only goes up and down (world/waterSurface.js),
// so it can draw a wave's face rearing up steep, but not the top of it
// throwing forward over the face and falling. That is drawn here: wherever
// a wave of the break is breaking (its lip between 0 and 1, breakers.js), a
// curl of water is thrown off its crest, out over the face and down, its
// edge going white, further out the further it has fallen; and where it
// comes down into the water in front, it bursts up in spray. Being the same
// waves the water is raised by and the surfer rides, the curl peels along
// the crest just as the break does, and a surfer crouched low in the face
// is inside it.
//
// The curl is one mesh rebuilt every frame from the waves, drawn over the
// water (render/pipeline.js OVER), measured from the break's own point
// (render/origin.js). The spray is puffs of spume, the same.

import * as THREE from 'three';
import { OVER } from '../render/pipeline.js';
import { SKY, SHARED } from '../render/uniforms.js';
import { POINT_GLSL, POINT_DISC_GLSL } from '../render/glsl.js';
import { anchor } from '../render/origin.js';
import { BREAKER } from '../world/breakers.js';

const STEP = 1.5; // m along the shore between the curl's slices
const SLICES = 240; // the most slices drawn
const RING = 9; // points across each, from the crest to the edge
// how far forward (of H) the lip throws, how high over the crest it arches,
// how thick it looks where it leaves the crest (m)
const THROW = { far: 1.05, arch: 0.18 };
// the water of the curl: lit through (teal), and white where it breaks up
const GREEN = new THREE.Color(0.1, 0.3, 0.29);
const WHITE = new THREE.Color(0.86, 0.89, 0.87);
// spray where the lip lands: puffs a second for each m of it coming down, and how hard
const SPRAY = { rate: 7, up: 3.2, spread: 1.6 };
const _c = new THREE.Color();
const _w = {};

export class Lip {
  constructor(scene) {
    const n = SLICES * RING;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.index = new Uint16Array((SLICES - 1) * (RING - 1) * 6);
    geo.setIndex(new THREE.BufferAttribute(this.index, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, roughness: 0.12, metalness: 0, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.layers.set(OVER);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.spume = new Spume(scene);
    this._owed = 0;
  }

  // Rebuild the curl from the waves breaking now (breakers: world/breakers.js).
  update(dt, breakers, level) {
    this.spume.update(dt);
    const S = breakers.spot;
    if (!S || !breakers.on) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.position.set(S.x, level, S.z);
    const tx = breakers.tx;
    const tz = breakers.tz;
    let slices = 0;
    let tris = 0;
    const v0 = -S.reach[0] - BREAKER.fade;
    const v1 = S.reach[1] + BREAKER.fade;
    for (let i = 0; i < breakers.waves.length && slices < SLICES; i++) {
      let prev = -1;
      for (let v = v0; v <= v1 && slices < SLICES; v += STEP) {
        const a = breakers.waveAt(i, v, _w);
        const on = a && a.lip >= 0 && a.lip <= 1.05 && a.H > 0.2;
        if (!on) {
          prev = -1;
          continue;
        }
        this._slice(slices, a, v, S, tx, tz, breakers.on);
        if (prev >= 0) {
          for (let j = 0; j < RING - 1; j++) {
            const p = prev * RING + j;
            const q = slices * RING + j;
            this.index.set([p, q, p + 1, p + 1, q, q + 1], tris);
            tris += 6;
          }
        }
        // spray where the lip comes down
        if (a.lip > 0.7) {
          this._owed += dt * SPRAY.rate * STEP * a.H;
          if (this._owed >= 1) {
            const n = Math.floor(this._owed);
            this._owed -= n;
            const ix = (-S.nx + a.dx * tx) / Math.hypot(1, a.dx);
            const iz = (-S.nz + a.dx * tz) / Math.hypot(1, a.dx);
            const at = a.u - a.face - THROW.far * a.H;
            this.spume.burst(S.x + S.nx * at + tx * v, level + 0.2, S.z + S.nz * at + tz * v, level, n, { up: SPRAY.up * Math.min(1.5, a.H), spread: SPRAY.spread, vx: ix * a.c * 0.6, vz: iz * a.c * 0.6 });
          }
        }
        prev = slices++;
      }
    }
    this.mesh.visible = tris > 0;
    if (!tris) return;
    this.geo.setDrawRange(0, tris);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.index.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  // One slice of the curl, across the crest at v: from the crest up and
  // over, out in front of the face, and down to where it has fallen to.
  _slice(k, a, v, S, tx, tz, on) {
    const n = Math.hypot(1, a.dx);
    // the way it's coming in, in the world
    const ix = (-S.nx + a.dx * tx) / n;
    const iz = (-S.nz + a.dx * tz) / n;
    const cx = S.nx * a.u + tx * v;
    const cz = S.nz * a.u + tz * v;
    const H = a.H * on;
    const lam = Math.min(1, a.lip);
    // the edge: thrown out in front, and fallen as far as it has
    const far = H * THROW.far * (0.25 + 0.75 * Math.pow(lam, 0.6));
    const tipA = far + a.face * 0.5 * lam;
    const tipY = H * (1 - lam) * 0.85;
    // ...by way of an arch up over the crest and out
    const midA = tipA * 0.55;
    const midY = H * (1 + THROW.arch * (1 - 0.5 * lam));
    for (let j = 0; j < RING; j++) {
      const s = j / (RING - 1);
      const b0 = (1 - s) * (1 - s);
      const b1 = 2 * (1 - s) * s;
      const b2 = s * s;
      const along = b1 * midA + b2 * tipA;
      const y = b0 * H + b1 * midY + b2 * tipY;
      const o = (k * RING + j) * 3;
      this.pos[o] = cx + ix * along;
      this.pos[o + 1] = y;
      this.pos[o + 2] = cz + iz * along;
      // green where it leaves the crest, white at its edge, whiter as it falls
      const white = Math.min(1, s * s * (0.5 + lam) + lam * 0.35);
      _c.copy(GREEN).lerp(WHITE, white);
      const c = (k * RING + j) * 4;
      this.col[c] = _c.r;
      this.col[c + 1] = _c.g;
      this.col[c + 2] = _c.b;
      this.col[c + 3] = 0.78 + 0.2 * white;
    }
  }
}

// Spume: puffs of spray thrown up where a lip lands, and off a board's rail
// as it carves. Each flies on its own, hangs a moment and falls back, fading.
const POOL = 600;
const GRAVITY = 5; // m/s²: spray is light...
const DRAG = 1.8; // 1/s: ...and the air soon stops it
const LIFE = 1.4; // s: the most a puff lasts
const PUFF = 0.32; // m: a puff of it, as it's seen

export class Spume {
  constructor(scene) {
    this.pos = new Float32Array(POOL * 3);
    this.vel = new Float32Array(POOL * 3);
    this.floor = new Float32Array(POOL);
    this.age = new Float32Array(POOL).fill(-1);
    this.fade = new Float32Array(POOL);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uZenith: SKY.uZenith, uHorizon: SKY.uHorizon, uSunColor: SKY.uSunColor, uSunDir: SKY.uSunDir, uLines: SHARED.uLines },
      vertexShader: /* glsl */ `
        ${POINT_GLSL}
        attribute float aFade;
        varying float vFade;
        varying float vPx;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vFade = aFade;
          // a puff grows as it spreads
          vPx = pointPx(${PUFF} * (1.6 - 0.6 * aFade), -mv.z);
          gl_PointSize = aFade > 0.0 ? vPx : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        varying float vFade;
        varying float vPx;
        ${POINT_DISC_GLSL}
        void main() {
          if (vFade <= 0.0) discard;
          vec3 c = mix(uHorizon, uZenith, 0.3) * 0.95 + uSunColor * 0.7 * clamp(uSunDir.y * 2.5, 0.0, 1.0) + 0.06;
          float r = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(c, 0.55 * vFade * (1.0 - smoothstep(0.2, 1.0, r)));
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.layers.set(OVER);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  // Throw n puffs from about (x, y, z), over water at `floor`: up at about
  // `up` m/s, `spread` m/s every way, carried along at (vx, vz).
  burst(x, y, z, floor, n, { up = 2, spread = 1, vx = 0, vz = 0, from = 0.3 } = {}) {
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
      this.vel[o + 1] = up * (0.5 + 0.7 * Math.random());
      this.vel[o + 2] = vz * (0.6 + 0.5 * Math.random()) + Math.sin(a) * s;
      this.floor[k] = floor - 0.1;
      this.age[k] = Math.random() * 0.2;
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
