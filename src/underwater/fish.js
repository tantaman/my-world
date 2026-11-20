// Fish: schools of them in the lakes and ponds, and in the sea.
//
// Like the animals on land, nothing here is saved or shared: fish turn up
// around you when you're by deep enough water, go about their business, and
// are let go when you've left them behind. A school wanders the water,
// keeping between the bed and the surface, each fish holding its place in it
// with a little drift of its own and its tail beating; come too close and
// they dart off together, and gather again further on.
//
// Fresh water has perch, minnows in the shallows, brown trout and the odd
// pike; the sea has herring, mackerel and sea bass.

import * as THREE from 'three';
import { SHARED, SKY } from '../render/uniforms.js';
import { rand, waterSample } from '../core/geom.js';
import { clamp, lerp } from '../noise.js';
import { fishShape } from './shapes.js';

// ── Who lives where ─────────────────────────────────────────────────────────
//   sea        lives in the sea (else fresh water)
//   school     how many together, [fewest, most]
//   len        length (m), [shortest, longest]
//   depth      the water it likes (m deep), [shallowest, deepest]
//   speed      cruising (m/s); dart is how many times that when frightened
//   shy        how close (m) you can come before they dart
//   beat       tail beats a second, cruising
//   spread     how far (m) the school spreads, per fish length
//   look       how it's made (see fishShape)
//   abundance  how often it's the one that turns up
const mark = {
  bars: (n, w) => (x, y, z) => (y > -0.02 ? Math.max(0, Math.cos(z * Math.PI * n) - 0.35) * w : 0),
  spots: (k, w) => (x, y, z) => (Math.sin(x * 211 + y * 57) * Math.sin(z * 173 + y * 91) > k ? w : 0),
  waves: (w) => (x, y, z) => (y > 0 && Math.sin(z * 60 + Math.sin(y * 90) * 2.5) > 0.3 ? w : 0),
  line: (w) => (x, y, z) => (Math.abs(y) < 0.008 && z < 0.3 ? w : 0),
};
export const FISH = {
  perch: {
    name: 'yellow perch', many: 'a school of perch', sea: false, school: [5, 12], len: [0.2, 0.32], depth: [1.2, 14],
    speed: 0.45, dart: 4, shy: 2.5, beat: 3, spread: 4, abundance: 1,
    look: { depth: 0.3, width: 0.11, back: 0x5c6a2a, belly: 0xd8c27a, fin: 0xc8602a, dark: 0x262a10, mark: mark.bars(7, 0.75) },
  },
  minnow: {
    name: 'minnows', many: 'a shoal of minnows', sea: false, school: [14, 30], len: [0.06, 0.1], depth: [0.35, 3],
    speed: 0.5, dart: 5, shy: 1.8, beat: 6, spread: 6, abundance: 0.9,
    look: { depth: 0.22, width: 0.09, back: 0x6a7058, belly: 0xd8d8c8, fin: 0xa8a890, mark: mark.line(0.6) },
  },
  trout: {
    name: 'a brown trout', many: 'brown trout', sea: false, school: [1, 2], len: [0.3, 0.5], depth: [1.5, 18],
    speed: 0.5, dart: 5, shy: 3, beat: 2.2, spread: 3, abundance: 0.45,
    look: { depth: 0.24, width: 0.1, back: 0x6a5a30, belly: 0xe8d8a0, fin: 0x8a7040, dark: 0x2a1a10, mark: mark.spots(0.55, 0.8) },
  },
  pike: {
    name: 'a northern pike', many: 'northern pike', sea: false, school: [1, 1], len: [0.6, 0.95], depth: [1.5, 8],
    speed: 0.25, dart: 7, shy: 3.5, beat: 1.4, spread: 1, abundance: 0.2,
    look: { depth: 0.16, width: 0.08, back: 0x3e5a2a, belly: 0xd0d0a8, fin: 0x6a6a3a, dark: 0xb8c890, mark: mark.spots(0.7, 0.55) },
  },
  herring: {
    name: 'herring', many: 'a school of herring', sea: true, school: [24, 48], len: [0.22, 0.32], depth: [3, 80],
    speed: 0.7, dart: 4, shy: 3, beat: 3.5, spread: 4.5, abundance: 1,
    look: { depth: 0.22, width: 0.08, back: 0x3a6a90, belly: 0xf0f4f6, fin: 0xb0bcc4, mark: mark.line(0.3), forked: true },
  },
  mackerel: {
    name: 'mackerel', many: 'a school of mackerel', sea: true, school: [8, 18], len: [0.32, 0.46], depth: [3, 60],
    speed: 0.9, dart: 4, shy: 3.5, beat: 3, spread: 3.5, abundance: 0.7,
    look: { depth: 0.2, width: 0.09, back: 0x2a6a5a, belly: 0xe0e8e8, fin: 0x5a7a70, dark: 0x0c1a18, mark: mark.waves(0.85), forked: true },
  },
  bass: {
    name: 'a sea bass', many: 'sea bass', sea: true, school: [1, 3], len: [0.5, 0.75], depth: [2, 40],
    speed: 0.4, dart: 5, shy: 3.5, beat: 1.8, spread: 2.5, abundance: 0.4,
    look: { depth: 0.27, width: 0.11, back: 0x5e666c, belly: 0xc8ccd0, fin: 0x6a7076, mark: mark.line(0.4) },
  },
};

// How many schools at once, and where they're looked for and let go (m from you).
const SCHOOLS = 5;
const NEAR = [8, 32];
const GONE = 60;
const LOOK_EVERY = 1.2; // s between looks round for somewhere a school might be
const SIGHT = 14; // m: how far off you can tell what they are

const _w = waterSample();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

// One material for every fish: lit, coloured by its vertices, its tail
// swinging (aBend) at a beat and from a phase of its own (aSwim).
function fishMaterial() {
  // (not metallic: there's nothing for metal to mirror, so it would go dark;
  // the silver is in the colours, and the sun's glint off the scales)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uZenith = SKY.uZenith;
    shader.uniforms.uHorizon = SKY.uHorizon;
    // Under water the daylight comes from all round, scattered: a soft sheen
    // on the scales, from whichever way you look at them.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uZenith;
        uniform vec3 uHorizon;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * (uZenith + uHorizon) * 0.38;`,
      );
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aBend;
        attribute vec2 aSwim; // phase, beats a second
        uniform float uTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.x += sin(uTime * aSwim.y * 6.2832 + aSwim.x - position.z * 4.0) * 0.045 * aBend * aBend;`,
      );
  };
  mat.customProgramCacheKey = () => 'fish-v3';
  return mat;
}

// ── A school ────────────────────────────────────────────────────────────────
class School {
  constructor(kind, sp, geo, mat, x, y, z) {
    this.kind = kind;
    this.sp = sp;
    const n = Math.round(rand(sp.school[0], sp.school[1] + 0.99) - 0.49);
    this.label = n === 1 ? sp.name : sp.many;
    const g = geo.clone();
    const swim = new Float32Array(n * 2);
    this.fish = [];
    const len = rand(sp.len[0], sp.len[1]);
    const spread = len * sp.spread * Math.cbrt(n);
    for (let i = 0; i < n; i++) {
      const s = len * rand(0.85, 1.15);
      // its place in the school: flatter than it is wide
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * spread;
      this.fish.push({
        ox: Math.cos(a) * r,
        oy: rand(-0.3, 0.3) * spread,
        oz: Math.sin(a) * r,
        x: x + Math.cos(a) * r,
        y,
        z: z + Math.sin(a) * r,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        s,
        wander: rand(0, 100),
      });
      swim[i * 2] = rand(0, 6.3);
      swim[i * 2 + 1] = sp.beat * rand(0.85, 1.15);
    }
    this.beats = new THREE.InstancedBufferAttribute(swim, 2);
    g.setAttribute('aSwim', this.beats);
    // (put where the school began, and its fish measured from there, so the
    // numbers handed to the card stay small: render/origin.js)
    this.mesh = new THREE.InstancedMesh(g, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.position.set(Math.round(x), 0, Math.round(z));
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = rand(0, Math.PI * 2);
    this.tx = x;
    this.ty = y;
    this.tz = z;
    this.retarget = 0;
    this.fright = 0;
    this.announced = false;
  }

  // Somewhere else in the water to make for, `reach` m or so off; away from
  // (ax, az) if given.
  aim(column, reach, ax = null, az = null) {
    for (let tries = 0; tries < 8; tries++) {
      let a = rand(0, Math.PI * 2);
      if (ax !== null) a = Math.atan2(this.z - az, this.x - ax) + rand(-0.7, 0.7);
      else if (tries < 4) a = this.heading + rand(-1.2, 1.2);
      const d = rand(reach * 0.5, reach);
      const x = this.x + Math.cos(a) * d;
      const z = this.z + Math.sin(a) * d;
      const c = column(x, z);
      if (!c || c.level - c.bed < this.sp.depth[0]) continue;
      this.tx = x;
      this.tz = z;
      this.ty = lerp(c.bed + 0.4, c.level - 0.4, rand(0.15, 0.85));
      return true;
    }
    return false;
  }

  update(dt, eye, column) {
    const sp = this.sp;
    // frightened by you coming close
    const de = Math.hypot(eye.x - this.x, eye.y - this.y, eye.z - this.z);
    if (de < sp.shy + this.fish.length * 0.03 && this.fright <= 0) {
      this.fright = rand(1.5, 2.5);
      this.aim(column, 10, eye.x, eye.z);
    }
    this.fright -= dt;
    this.retarget -= dt;
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dz = this.tz - this.z;
    const d = Math.hypot(dx, dz);
    if ((this.retarget <= 0 || d < 1) && this.fright <= 0) {
      this.retarget = rand(4, 10);
      this.aim(column, 9);
    }
    const speed = sp.speed * (this.fright > 0 ? sp.dart : 1);
    if (d > 0.05) {
      let turn = Math.atan2(dz, dx) - this.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      this.heading += clamp(turn, -dt * 2.5, dt * 2.5);
    }
    const step = Math.min(d, speed * dt);
    const nx = this.x + Math.cos(this.heading) * step;
    const nz = this.z + Math.sin(this.heading) * step;
    const c = column(nx, nz);
    if (c && c.level - c.bed > 0.5) {
      this.x = nx;
      this.z = nz;
      this.y = clamp(this.y + clamp(dy, -1, 1) * speed * 0.4 * dt, c.bed + 0.3, c.level - 0.3);
    } else {
      this.retarget = 0; // ran into the shore: somewhere else
      this.heading += Math.PI * 0.5;
    }

    // each fish holds its place, wandering about it a little
    const ch = Math.cos(this.heading);
    const sh = Math.sin(this.heading);
    const k = 1 - Math.exp(-dt * (this.fright > 0 ? 4 : 1.6));
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      f.wander += dt * 0.4;
      const wx = f.ox * ch - f.oz * sh + Math.sin(f.wander * 1.3) * f.s * 2;
      const wz = f.ox * sh + f.oz * ch + Math.cos(f.wander) * f.s * 2;
      const tx = this.x + wx;
      const ty = this.y + f.oy + Math.sin(f.wander * 0.7) * f.s;
      const tz = this.z + wz;
      f.vx = lerp(f.vx, (tx - f.x) * 1.5 + ch * speed, k);
      f.vy = lerp(f.vy, (ty - f.y) * 1.5, k);
      f.vz = lerp(f.vz, (tz - f.z) * 1.5 + sh * speed, k);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      const cf = column(f.x, f.z);
      if (cf) f.y = clamp(f.y, cf.bed + 0.15, cf.level - 0.12);
      const hs = Math.hypot(f.vx, f.vz);
      if (hs > 0.02) {
        let turn = Math.atan2(f.vx, f.vz) - f.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        f.yaw += turn * Math.min(1, dt * 6);
      }
      f.pitch = lerp(f.pitch, -Math.atan2(f.vy, Math.max(hs, 0.05)) * 0.6, Math.min(1, dt * 4));
      _e.set(f.pitch, f.yaw, 0);
      _q.setFromEuler(_e);
      _p.set(f.x - this.mesh.position.x, f.y, f.z - this.mesh.position.z);
      _s.setScalar(f.s);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // the tail beats faster when they're in a hurry
    const beat = this.fright > 0 ? 2.2 : 1;
    if (beat !== this.beat) {
      this.beat = beat;
      for (let i = 0; i < this.fish.length; i++) this.beats.array[i * 2 + 1] = sp.beat * beat * (0.9 + (i % 5) * 0.05);
      this.beats.needsUpdate = true;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}

// ── All of them ─────────────────────────────────────────────────────────────
// chunks: the ChunkManager (waterAt); salt(sample): whether the water in a
// waterAt() sample is the sea.
export class Fishes {
  constructor({ scene, chunks, salt }) {
    this.scene = scene;
    this.chunks = chunks;
    this.salt = salt;
    this.mat = fishMaterial();
    this.geos = {};
    this.schools = [];
    this.lookIn = 0;
    this.enabled = true;
    this._col = { level: 0, bed: 0 };
    this.column = (x, z) => {
      if (!chunks.waterAt(x, z, _w) || _w.depth <= 0) return null;
      this._col.level = _w.level;
      this._col.bed = _w.level - _w.depth;
      return this._col;
    };
  }

  geo(kind) {
    return this.geos[kind] || (this.geos[kind] = fishShape(FISH[kind].look));
  }

  // Call one up (from the console): near (x, z), or wherever suits it.
  spawn(kind, x, y, z) {
    const sp = FISH[kind];
    if (!sp) return null;
    const s = new School(kind, sp, this.geo(kind), this.mat, x, y, z);
    this.schools.push(s);
    this.scene.add(s.mesh);
    return s;
  }

  // Somewhere near (cx, cz) for a school to be, and who'd be there.
  _place(cx, cz) {
    const a = rand(0, Math.PI * 2);
    const d = rand(NEAR[0], NEAR[1]);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const c = this.column(x, z);
    if (!c) return null;
    const deep = c.level - c.bed;
    const sea = this.salt(_w); // (column() left the water there in _w)
    let total = 0;
    const fits = [];
    for (const [kind, sp] of Object.entries(FISH)) {
      if (sp.sea !== sea || deep < sp.depth[0] || deep > sp.depth[1] * 1.5) continue;
      if (this.schools.some((s) => s.kind === kind && sp.school[1] === 1)) continue;
      total += sp.abundance;
      fits.push([kind, sp]);
    }
    let r = rand(0, total);
    for (const [kind, sp] of fits) {
      r -= sp.abundance;
      if (r <= 0) return { kind, x, z, y: lerp(c.bed + 0.4, c.level - 0.4, rand(0.2, 0.8)) };
    }
    return null;
  }

  // eye: where you're looking from; hud: to say what you're looking at.
  update(dt, eye, camera, hud) {
    if (!this.enabled) return;
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookIn = LOOK_EVERY;
      if (this.schools.length < SCHOOLS) {
        const at = this._place(eye.x, eye.z);
        if (at) this.spawn(at.kind, at.x, at.y, at.z);
      }
    }
    for (let i = this.schools.length - 1; i >= 0; i--) {
      const s = this.schools[i];
      if (Math.hypot(s.x - eye.x, s.z - eye.z) > GONE) {
        this.scene.remove(s.mesh);
        s.dispose();
        this.schools.splice(i, 1);
        continue;
      }
      s.update(dt, eye, this.column);
    }
    if (hud && camera) this._sightings(camera, hud);
  }

  // Looking right at a school, close enough to tell: say what it is.
  _sightings(camera, hud) {
    camera.getWorldDirection(_v);
    const c = camera.position;
    for (const s of this.schools) {
      if (s.announced) continue;
      const dx = s.x - c.x;
      const dy = s.y - c.y;
      const dz = s.z - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > SIGHT || (dx * _v.x + dy * _v.y + dz * _v.z) / d < 0.9) continue;
      s.announced = true;
      hud.flash(s.label);
      return;
    }
  }

  list() {
    return this.schools.map((s) => ({ kind: s.kind, n: s.fish.length, x: Math.round(s.x), y: Math.round(s.y * 10) / 10, z: Math.round(s.z) }));
  }
}
