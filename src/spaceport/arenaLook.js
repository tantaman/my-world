// What the arena looks like: a scene of its own, drawn in place of the
// forest while you're up there.
//
//   the platforms   brushed metal in panels, glowing trim along their edges,
//                   and a glow under each where it holds itself up
//   the jump pads   glowing discs with rings rising off them
//   the sky         stars, the sun, and the world far below: oceans,
//                   continents, cloud and a thin blue rim of air
//   the fighters    armoured figures in their own colours, a visor that
//                   glows, legs that run
//   your railgun    in your hands, at the bottom right of the view: its
//                   coils glow as it charges, and it kicks when it fires
//   the rails       a bright core and a spiral round it, fading; a glowing
//                   mark where each one struck; the fragged go to glowing
//                   shards
//
// The arena is its own little world round its own origin (orrery.js),
// never slid like the forest is (render/origin.js): everything in it is
// within a hundred metres or so of zero, but for the sky, which is only
// ever seen from there.
//
//   const look = new ArenaLook(camera);   look.scene is what to draw
//   look.update(dt, arena)                each frame, after the arena has moved
//   look.rail(shot) · look.frag(fighter) · look.fired()   as they happen

import * as THREE from 'three';
import { BOXES, PADS } from './orrery.js';
import { MOVE } from './mover.js';
import { RELOAD, aim } from './arena.js';
import { Mesher } from '../build/geometry.js';
import { mulberry32 } from '../noise.js';

const SUN_DIR = new THREE.Vector3(0.55, 0.62, -0.56).normalize();
const PLANET = { r: 4000, below: 5200 }; // m: its radius, and how far under the arena its middle is
const STARS = 1800;
const SKY_R = 3000; // m: how far off the stars are drawn
const BEAMS = 16; // rails on show at once, at the most
const HELIX = { r: 0.16, turn: 0.7, most: 1800, fade: 1.1, core: 0.45 }; // m, m a turn, points, s, s
const MARKS = 24; // scorch marks on show at once
const MARK_FADE = 3; // s
const SHARDS = 240; // glowing shards at once, at the most
const SHARDS_EACH = 24;
const SHARD_LIFE = 1.6; // s
const RECOIL = 0.35; // s for the gun to come back after a shot
const TRIM = 0x6fd8ff;
const PAD_GLOW = 0x5cffb0;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _d = { x: 0, y: 0, z: 0 };

export class ArenaLook {
  constructor(camera) {
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.scene.add(camera);
    this.time = 0;
    this._sky();
    this._lights();
    this._platforms();
    this._pads();
    this._gun();
    this._effects();
    this.fighters = new Map(); // id -> { group, legs, arms, visor }
    this.kick = 0; // the gun's recoil, 1 just fired .. 0
    this.dip = 0; // the view's dip on landing hard (m)
    this.bob = 0;
  }

  // ── The sky ───────────────────────────────────────────────────────────────
  _sky() {
    const rng = mulberry32(1969);
    // stars: most anywhere, more along a band across the sky
    const pos = new Float32Array(STARS * 3);
    const colors = new Float32Array(STARS * 3);
    const band = new THREE.Vector3(0.3, 0.5, 0.81).normalize();
    for (let i = 0; i < STARS; i++) {
      _v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
      if (_v.lengthSq() > 1 || _v.lengthSq() < 1e-4) {
        i--;
        continue;
      }
      _v.normalize();
      if (i % 3 === 0) _v.addScaledVector(band, -_v.dot(band) * (0.85 + rng() * 0.15)).normalize();
      pos.set([_v.x * SKY_R, _v.y * SKY_R, _v.z * SKY_R], i * 3);
      const b = 0.08 + Math.pow(rng(), 4) * 2.4; // most faint, a few bright
      const warm = rng();
      colors.set([b * (0.85 + warm * 0.25), b * 0.92, b * (1.15 - warm * 0.3)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    stars.renderOrder = -2;
    stars.frustumCulled = false;
    this.scene.add(stars);
    // the sun: a disc too bright to look at
    const sun = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.2, 7), depthWrite: false }));
    sun.position.copy(SUN_DIR).multiplyScalar(SKY_R * 0.95);
    sun.renderOrder = -1;
    this.scene.add(sun);
    // the world below
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET.r, 96, 64), planetMaterial());
    this.planet.position.set(0, -PLANET.below, 0);
    this.planet.rotation.set(0.5, 0, 0.35);
    this.scene.add(this.planet);
    const air = new THREE.Mesh(new THREE.SphereGeometry(PLANET.r * 1.03, 96, 64), airMaterial());
    air.position.copy(this.planet.position);
    this.scene.add(air);
  }

  _lights() {
    const sun = new THREE.DirectionalLight(0xfff2e0, 2.6);
    sun.position.copy(SUN_DIR).multiplyScalar(120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = c.bottom = -75;
    c.right = c.top = 75;
    c.near = 10;
    c.far = 300;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    // light off the world below, bluish, from the side away from the sun (so
    // a fighter with the sun behind them is still plain to see), and a
    // little from all round
    const fill = new THREE.DirectionalLight(0x9db4e0, 1.1);
    fill.position.set(-SUN_DIR.x, -0.35, -SUN_DIR.z).multiplyScalar(100);
    this.scene.add(fill, fill.target);
    this.scene.add(new THREE.HemisphereLight(0x2a3348, 0x4a7ab8, 1.2));
    this.scene.add(new THREE.AmbientLight(0x4a5468, 0.7));
  }

  // ── The platforms ─────────────────────────────────────────────────────────
  _platforms() {
    const m = new Mesher();
    const glow = new Mesher();
    const SHADE = { deck: 0x8f949c, step: 0x7d838c, wall: 0x6a707a, pillar: 0x5b616b, bridge: 0x868b93 };
    const under = new THREE.Color(0x2b2f36);
    for (const b of BOXES) {
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      const d = b.z1 - b.z0;
      const top = new THREE.Color(SHADE[b.look]);
      _m4.makeTranslation((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      m.add(new THREE.BoxGeometry(w, h, d), _m4, (p, n) => (n.y < -0.5 ? under : n.y > 0.5 ? top : _c.copy(top).multiplyScalar(0.78)));
      // a glowing strip round the top edge of decks and walls, and a band
      // round each pillar
      const t = 0.07;
      if (b.look === 'deck' || b.look === 'bridge' || b.look === 'wall') {
        const y = b.y1 - t / 2 - 0.02;
        strip(glow, b.x0, y, b.z0 - 0.005, b.x1, y, b.z0 - 0.005, t);
        strip(glow, b.x0, y, b.z1 + 0.005, b.x1, y, b.z1 + 0.005, t);
        strip(glow, b.x0 - 0.005, y, b.z0, b.x0 - 0.005, y, b.z1, t);
        strip(glow, b.x1 + 0.005, y, b.z0, b.x1 + 0.005, y, b.z1, t);
      }
      if (b.look === 'pillar') {
        _m4.makeTranslation((b.x0 + b.x1) / 2, b.y1 - 0.6, (b.z0 + b.z1) / 2);
        glow.add(new THREE.BoxGeometry(w + 0.04, 0.12, d + 0.04), _m4, () => _c.set(0xffffff));
      }
      // what holds a deck up: a glow underneath
      if (b.look === 'deck') {
        const n = Math.max(1, Math.round(Math.min(w, d) / 7));
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const x = b.x0 + (w * (i + 0.5)) / n;
            const z = b.z0 + (d * (j + 0.5)) / n;
            _m4.makeRotationX(Math.PI / 2).setPosition(x, b.y0 - 0.02, z);
            glow.add(new THREE.CircleGeometry(Math.min(w, d) / n / 4, 16), _m4, () => _c.set(0xffffff));
          }
        }
      }
    }
    const deck = new THREE.Mesh(m.build(), panelMaterial());
    deck.castShadow = deck.receiveShadow = true;
    this.scene.add(deck);
    const trim = new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ color: new THREE.Color(TRIM).multiplyScalar(2.4), side: THREE.DoubleSide }));
    this.scene.add(trim);
  }

  _pads() {
    this.pads = [];
    const discGeo = new THREE.CylinderGeometry(1, 1, 0.08, 24);
    const ringGeo = new THREE.TorusGeometry(0.85, 0.05, 6, 28);
    const base = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.4 });
    for (const p of PADS) {
      const g = new THREE.Group();
      g.position.set(p.x, p.y, p.z);
      const disc = new THREE.Mesh(discGeo, base);
      disc.position.y = 0.04;
      disc.receiveShadow = true;
      g.add(disc);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(PAD_GLOW).multiplyScalar(1.6) }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.085;
      g.add(face);
      // an arrow on its face, the way it throws you
      const arrow = new THREE.Mesh(arrowGeometry(), new THREE.MeshBasicMaterial({ color: 0x0b2a1c }));
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = Math.atan2(p.to.x - p.x, -(p.to.z - p.z)) * -1;
      arrow.position.y = 0.09;
      g.add(arrow);
      const rings = [];
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PAD_GLOW).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        rings.push(ring);
      }
      this.scene.add(g);
      this.pads.push({ pad: p, group: g, rings, face });
    }
  }

  // ── Your railgun ──────────────────────────────────────────────────────────
  _gun() {
    // built along −z from its grip, nothing of it nearer the eye than about
    // a third of a metre (gunRest)
    const gun = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b4149, roughness: 0.5, metalness: 0.15 });
    const light = new THREE.MeshStandardMaterial({ color: 0x7c848f, roughness: 0.45, metalness: 0.2 });
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      gun.add(mesh);
      return mesh;
    };
    part(new THREE.BoxGeometry(0.055, 0.065, 0.2), dark, 0, 0, -0.12);
    part(new THREE.BoxGeometry(0.04, 0.08, 0.05), dark, 0, -0.065, -0.05).rotation.x = -0.3;
    part(new THREE.CylinderGeometry(0.014, 0.018, 0.36, 10), light, 0, 0.015, -0.4).rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(0.012, 0.012, 0.3), light, 0, -0.018, -0.36);
    this.coilMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
    for (let i = 0; i < 4; i++) part(new THREE.TorusGeometry(0.024, 0.006, 6, 14), this.coilMat, 0, 0.015, -0.28 - i * 0.065);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.015, -0.6);
    gun.add(this.muzzle);
    this.gunRest = new THREE.Vector3(0.13, -0.13, -0.28);
    gun.position.copy(this.gunRest);
    gun.rotation.y = 0.06;
    gun.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
    });
    this.camera.add(gun);
    this.gun = gun;
  }

  // ── Rails, marks and shards ───────────────────────────────────────────────
  _effects() {
    this.beams = [];
    const coreGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    coreGeo.translate(0, 0.5, 0);
    for (let i = 0; i < BEAMS; i++) {
      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      core.frustumCulled = false;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HELIX.most * 3), 3));
      const helix = new THREE.Line(geo, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      helix.frustumCulled = false;
      core.visible = helix.visible = false;
      this.scene.add(core, helix);
      this.beams.push({ core, helix, age: Infinity, color: new THREE.Color() });
    }
    this.marks = [];
    const markGeo = new THREE.CircleGeometry(0.22, 12);
    for (let i = 0; i < MARKS; i++) {
      const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      mark.visible = false;
      this.scene.add(mark);
      this.marks.push({ mark, age: Infinity, color: new THREE.Color() });
    }
    this._nextBeam = 0;
    this._nextMark = 0;
    this.shards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial(), SHARDS);
    this.shards.count = 0;
    this.shards.frustumCulled = false;
    this.shardList = []; // { p, v, spin, age, color }
    this.scene.add(this.shards);
  }

  // A shot: a rail from where it was fired to where it stopped.
  rail(shot, from = shot.from) {
    const b = this.beams[this._nextBeam];
    this._nextBeam = (this._nextBeam + 1) % BEAMS;
    b.age = 0;
    b.color.set(shot.shooter.color);
    const to = shot.to;
    _v.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = _v.length();
    _v.divideScalar(len || 1);
    b.core.position.set(from.x, from.y, from.z);
    b.core.quaternion.setFromUnitVectors(_up, _v);
    b.core.scale.set(0.04, len, 0.04);
    b.core.visible = true;
    // the spiral round it, for as far as it has points for
    const pos = b.helix.geometry.attributes.position;
    const side = _w.set(0, 1, 0).cross(_v);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(_v, side);
    const step = HELIX.turn / 10;
    const n = Math.min(HELIX.most, Math.floor(len / step));
    for (let i = 0; i < n; i++) {
      const t = i * step;
      const a = (t / HELIX.turn) * Math.PI * 2;
      const r = HELIX.r * Math.min(1, t / 0.6);
      pos.setXYZ(i, from.x + _v.x * t + (side.x * Math.cos(a) + up.x * Math.sin(a)) * r, from.y + _v.y * t + (side.y * Math.cos(a) + up.y * Math.sin(a)) * r, from.z + _v.z * t + (side.z * Math.cos(a) + up.z * Math.sin(a)) * r);
    }
    pos.needsUpdate = true;
    b.helix.geometry.setDrawRange(0, n);
    b.helix.geometry.computeBoundingSphere();
    b.helix.visible = n > 1;
    if (shot.wall) this._mark(to, shot.wall, b.color);
  }

  _mark(at, normal, color) {
    const k = this.marks[this._nextMark];
    this._nextMark = (this._nextMark + 1) % MARKS;
    k.age = 0;
    k.color.copy(color);
    k.mark.position.set(at.x + normal.x * 0.01, at.y + normal.y * 0.01, at.z + normal.z * 0.01);
    k.mark.lookAt(at.x + normal.x, at.y + normal.y, at.z + normal.z);
    k.mark.visible = true;
  }

  // A fighter fragged: gone to glowing shards.
  frag(f) {
    const p = f.body.pos;
    const color = new THREE.Color(f.color);
    for (let i = 0; i < SHARDS_EACH; i++) {
      if (this.shardList.length >= SHARDS) this.shardList.shift();
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const s = 2 + Math.random() * 5;
      this.shardList.push({
        p: new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.3 + Math.random() * 1.4, p.z + (Math.random() - 0.5) * 0.6),
        v: new THREE.Vector3(Math.cos(a) * s + f.body.vel.x * 0.5, up * 6 + 1, Math.sin(a) * s + f.body.vel.z * 0.5),
        spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
        age: Math.random() * 0.2,
        color,
      });
    }
  }

  // You fired: the gun kicks.
  fired() {
    this.kick = 1;
  }

  // Where your shots come from: the muzzle of the gun in your hands.
  muzzleAt(out) {
    this.camera.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(out);
  }

  // A hard landing: the view dips.
  landed(speed) {
    this.dip = Math.min(0.25, Math.max(this.dip, (speed - 8) * 0.02));
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  update(dt, arena) {
    this.time += dt;
    const t = this.time;
    const me = arena.me;
    // the view, from your eye; or where you fell, sinking and tipping, looking
    // at whoever fragged you
    const cam = this.camera;
    cam.rotation.order = 'YXZ';
    const p = me.body.pos;
    const speed = Math.hypot(me.body.vel.x, me.body.vel.z);
    this.dip = Math.max(0, this.dip - dt * 0.8);
    if (me.alive) {
      if (me.body.grounded && speed > 1) this.bob += dt * speed * 1.1;
      const bob = me.body.grounded ? Math.sin(this.bob) * 0.025 * Math.min(1, speed / MOVE.speed) : 0;
      cam.position.set(p.x, p.y + MOVE.eye + bob - this.dip, p.z);
      cam.rotation.set(me.pitch, me.yaw, 0);
      this.gun.visible = true;
    } else {
      const since = arena.match.time - me.fragged;
      const k = Math.min(1, since / 0.6);
      cam.position.set(p.x, p.y + MOVE.eye - (MOVE.eye - 0.35) * k, p.z);
      if (me.killer && me.killer !== me) {
        const q = me.killer.body.pos;
        const yaw = Math.atan2(-(q.x - p.x), -(q.z - p.z));
        const pitch = Math.atan2(q.y + 1.2 - cam.position.y, Math.hypot(q.x - p.x, q.z - p.z));
        cam.rotation.set(pitch * k + me.pitch * (1 - k), lerpAngle(me.yaw, yaw, k), 0.35 * k);
      } else cam.rotation.set(me.pitch, me.yaw, 0.35 * k);
      this.gun.visible = false;
    }
    // the gun: kicks back and up, comes back, sways a little as you run;
    // its coils brighten as it charges
    this.kick = Math.max(0, this.kick - dt / RECOIL);
    const kk = this.kick * this.kick;
    this.gun.position.set(this.gunRest.x + Math.cos(this.bob * 0.5) * 0.008 * Math.min(1, speed / 5), this.gunRest.y + Math.abs(Math.sin(this.bob * 0.5)) * 0.006 + kk * 0.02, this.gunRest.z + kk * 0.07);
    this.gun.rotation.x = kk * 0.18;
    const charge = 1 - Math.min(1, me.reload / RELOAD);
    const c2 = charge * charge;
    this.coilMat.color.setRGB(0.1 + 0.5 * c2, 0.25 + 0.85 * c2, 0.4 + 1.1 * c2);

    this._fighters(dt, arena);
    // the pads' rings, rising and fading
    for (const pd of this.pads) {
      pd.rings.forEach((ring, i) => {
        const u = (t * 0.8 + i / 3) % 1;
        ring.position.y = 0.1 + u * 1.6;
        ring.scale.setScalar(1 - u * 0.35);
        ring.material.opacity = (1 - u) * 0.8;
      });
    }
    // rails fading
    for (const b of this.beams) {
      if (!b.core.visible && !b.helix.visible) continue;
      b.age += dt;
      const fc = Math.max(0, 1 - b.age / HELIX.core);
      const fh = Math.max(0, 1 - b.age / HELIX.fade);
      b.core.material.color.copy(b.color).multiplyScalar(4 * fc);
      b.helix.material.color.copy(b.color).multiplyScalar(2.2 * fh);
      b.core.scale.x = b.core.scale.z = 0.04 * (1 + b.age * 2);
      b.core.visible = fc > 0;
      b.helix.visible = fh > 0;
    }
    for (const k of this.marks) {
      if (!k.mark.visible) continue;
      k.age += dt;
      const f = Math.max(0, 1 - k.age / MARK_FADE);
      k.mark.material.color.copy(k.color).multiplyScalar(2.5 * f);
      k.mark.material.opacity = f;
      k.mark.visible = f > 0;
    }
    // shards
    const list = this.shardList;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      s.age += dt;
      if (s.age > SHARD_LIFE) list.splice(i, 1);
    }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      s.v.y -= MOVE.gravity * 0.5 * dt;
      s.p.addScaledVector(s.v, dt);
      const size = Math.max(0.01, 1 - s.age / SHARD_LIFE);
      _q.setFromEuler(new THREE.Euler(s.spin.x * s.age, s.spin.y * s.age, s.spin.z * s.age));
      _m4.compose(s.p, _q, _s.setScalar(size));
      this.shards.setMatrixAt(i, _m4);
      this.shards.setColorAt(i, _c.copy(s.color).multiplyScalar(0.6 + 0.9 * size));
    }
    this.shards.count = list.length;
    this.shards.instanceMatrix.needsUpdate = true;
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
    this.planet.rotation.y += dt * 0.004;
  }

  _fighters(dt, arena) {
    for (const f of arena.fighters) {
      if (f.me) continue;
      let v = this.fighters.get(f.id);
      if (!v) this.fighters.set(f.id, (v = makeFighter(f.color)));
      if (!v.group.parent) this.scene.add(v.group);
      v.group.visible = f.alive;
      if (!f.alive) continue;
      const p = f.body.pos;
      v.group.position.set(p.x, p.y, p.z);
      v.group.rotation.y = f.yaw;
      v.head.rotation.x = f.pitch * 0.6;
      v.arms.rotation.x = f.pitch;
      const speed = Math.hypot(f.body.vel.x, f.body.vel.z);
      v.stride += dt * speed * 1.6;
      const swing = f.body.grounded ? Math.sin(v.stride) * Math.min(0.7, speed * 0.08) : 0.5;
      v.legs[0].rotation.x = swing;
      v.legs[1].rotation.x = f.body.grounded ? -swing : -0.3;
    }
  }

  // Where a fighter's shots come from: the muzzle of their gun.
  muzzleOf(f, out) {
    aim(f.yaw, f.pitch, _d);
    const p = f.body.pos;
    // a little right of the middle, at the gun, and out along the aim
    const rx = Math.cos(f.yaw);
    const rz = -Math.sin(f.yaw);
    out.x = p.x + rx * 0.22 + _d.x * 0.75;
    out.y = p.y + 1.32 + _d.y * 0.75;
    out.z = p.z + rz * 0.22 + _d.z * 0.75;
    return out;
  }
}

function lerpAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}

// A glowing strip from (ax, ay, az) to (bx, by, bz), t thick.
function strip(m, ax, ay, az, bx, by, bz, t) {
  const len = Math.hypot(bx - ax, bz - az);
  _m4.makeRotationY(Math.atan2(bz - az, bx - ax) * -1).setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.add(new THREE.BoxGeometry(len, t, 0.02), _m4, () => _c.set(0xffffff));
}

// An arrow on a jump pad's face, pointing along +y of its plane.
function arrowGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.55);
  s.lineTo(0.32, 0.15);
  s.lineTo(0.12, 0.15);
  s.lineTo(0.12, -0.45);
  s.lineTo(-0.12, -0.45);
  s.lineTo(-0.12, 0.15);
  s.lineTo(-0.32, 0.15);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

// A fighter: armour in their colour, dark joints, a glowing visor, and a
// railgun held out in front. Its feet at 0, facing −z.
function makeFighter(color) {
  const group = new THREE.Group();
  const armour = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6, metalness: 0.1 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5).multiplyScalar(2) });
  const part = (geo, mat, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  part(new THREE.BoxGeometry(0.56, 0.62, 0.32), armour, 0, 1.22, 0);
  part(new THREE.BoxGeometry(0.46, 0.22, 0.28), dark, 0, 0.88, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  group.add(head);
  part(new THREE.BoxGeometry(0.3, 0.3, 0.3), armour, 0, 0.12, 0, head);
  part(new THREE.BoxGeometry(0.24, 0.07, 0.04), glow, 0, 0.14, -0.155, head);
  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.14, 0.86, 0);
    group.add(leg);
    part(new THREE.BoxGeometry(0.18, 0.5, 0.2), dark, 0, -0.25, 0, leg);
    part(new THREE.BoxGeometry(0.2, 0.36, 0.22), armour, 0, -0.66, 0, leg);
    return leg;
  });
  const arms = new THREE.Group();
  arms.position.set(0, 1.36, 0);
  group.add(arms);
  for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.13, 0.13, 0.46), armour, s * 0.3, -0.04, -0.18, arms);
  part(new THREE.BoxGeometry(0.1, 0.12, 0.85), dark, 0.18, -0.04, -0.45, arms);
  part(new THREE.BoxGeometry(0.04, 0.04, 0.6), glow, 0.18, 0.04, -0.5, arms);
  return { group, head, legs, arms, stride: 0 };
}

// Brushed metal in two-metre panels with dark seams, each panel a shade
// different from the next. (The arena sits at its own origin, so position
// is fine to draw patterns from here: see the top of this file.)
function panelMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vArenaPos;\nvarying vec3 vArenaNormal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvArenaPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvArenaNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vArenaPos;\nvarying vec3 vArenaNormal;\nfloat arenaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 an = abs(vArenaNormal);
          vec2 uv = an.y > 0.5 ? vArenaPos.xz : (an.x > 0.5 ? vArenaPos.zy : vArenaPos.xy);
          vec2 cell = floor(uv / 2.0);
          vec2 f = fract(uv / 2.0);
          float seam = step(f.x, 0.025) + step(f.y, 0.025);
          float shade = 0.9 + 0.16 * arenaHash(cell);
          diffuseColor.rgb *= shade * (1.0 - 0.45 * min(seam, 1.0));
        }`,
      );
  };
  return mat;
}

// The world far below: oceans and continents from noise, ice at the poles,
// cloud over it all, lit by the sun with a night side.
function planetMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vLocal;
      varying vec3 vWorldN;
      void main() {
        vLocal = normalize(position);
        vWorldN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vLocal;
      varying vec3 vWorldN;
      float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 6; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 p = vLocal;
        float land = fbm(p * 2.2 + 3.1);
        float lat = abs(p.y);
        vec3 sea = mix(vec3(0.01, 0.05, 0.16), vec3(0.03, 0.14, 0.3), smoothstep(0.35, 0.52, land));
        vec3 green = mix(vec3(0.08, 0.2, 0.06), vec3(0.32, 0.28, 0.14), smoothstep(0.55, 0.75, fbm(p * 6.0)));
        vec3 col = land > 0.53 ? green : sea;
        col = mix(col, vec3(0.85, 0.9, 0.95), smoothstep(0.78, 0.86, lat + fbm(p * 8.0) * 0.08));
        float cloud = smoothstep(0.5, 0.72, fbm(p * 4.0 + vec3(0.0, 5.0, 0.0)) * 0.7 + fbm(p * 13.0) * 0.3);
        col = mix(col, vec3(0.92), cloud * 0.85);
        float lit = dot(normalize(vWorldN), uSun);
        float day = smoothstep(-0.12, 0.25, lit);
        vec3 night = vec3(0.004, 0.006, 0.012) + vec3(0.25, 0.18, 0.08) * step(0.62, fbm(p * 30.0)) * step(0.53, land) * (1.0 - cloud);
        gl_FragColor = vec4(mix(night, col * (0.15 + 1.6 * max(lit, 0.0)), day), 1.0);
      }`,
  });
}

// The thin blue rim of air round its edge, brightest where the sun is.
function airMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(wp.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(vN, -vView)), 3.0);
        float lit = smoothstep(-0.3, 0.4, dot(vN, uSun));
        gl_FragColor = vec4(vec3(0.25, 0.55, 1.4) * rim * (0.15 + 1.4 * lit), 1.0);
      }`,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
