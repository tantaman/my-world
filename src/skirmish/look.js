// What the match looks like: a scene of its own, drawn in place of the
// forest while you're in the town.
//
//   the town       townLook.js's, standing still
//   the fighters   figures.js's, each where the match says they are, as
//                  they are; a mark over the heads of your own
//   your hands     hands.js's: what you're holding, and your arms on it
//   what happens   a streak for every shot and a puff of dust where it
//                  lands, a mark left in the wall; smoke that can't be seen
//                  through; the flash and the dust of a grenade; the charge,
//                  its light blinking faster as the fuse runs down, and what
//                  it does to the place when it goes
//   the view       from your own eyes; through the long rifle's sight,
//                  closer; and once you're down, from behind whoever of your
//                  side you're watching
//
//   const look = new SkirmishLook(camera);   look.scene is what to draw
//   look.update(dt, match, watch)            each frame, after the match has moved
//   look.shot(e, match) · look.burst(e) · look.boom(e) · look.landed(speed)

import * as THREE from 'three';
import { BOXES } from './town.js';
import { MOVE, eyeOf, heightOf, aim, rayBoxes } from './mover.js';
import { GUNS } from './arms.js';
import { buildTown } from './townLook.js';
import { gunModel } from './guns.js';
import { makeFigure, setSide, poseFigure, kickFigure, muzzleOf, SIDE_COLOURS } from './figures.js';
import { Hands } from './hands.js';

const FOV = 70; // degrees, top to bottom
const TEAM = 5; // a side
const NADES = { frag: 1, flash: 1, smoke: 1 };
const NADE_SIZE = 1.5; // a grenade in the air is drawn this much bigger than life, to be seen coming
const STREAKS = 48; // shots on show at once
const STREAK_LIFE = 0.07; // s
const PUFFS = 320;
const HOLES = 160;
const FLASHES = 12;
const SMOKE_BALLS = 18;
const CHASE = { back: 3, up: 0.5 }; // m behind and over whoever you're watching

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _d = { x: 0, y: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };

// What's in a fighter's hands, as something to draw.
export const kindOf = (f) => (f.held === 'main' ? f.kit.main : f.held === 'side' ? f.kit.side : f.held) || 'knife';

export class SkirmishLook {
  constructor(camera) {
    this.camera = camera;
    camera.fov = FOV;
    camera.rotation.order = 'YXZ';
    camera.updateProjectionMatrix();
    this.scene = new THREE.Scene();
    this.scene.add(camera);
    const town = buildTown();
    this.scene.add(town.group);
    this.time = 0;
    this.figures = new Map(); // fighter id -> figure
    this.marks = new Map(); // fighter id -> the mark over a team-mate's head
    this.dip = 0; // the view's dip on landing hard (m)
    this.bob = 0;
    this.shake = 0; // the ground shaking (the charge)
    this.sway = { x: 0, y: 0 };
    this.fov = FOV;
    this.first = true; // seeing from your own eyes
    this.hands = new Hands(camera);
    this._effects();
    this._charge();
  }

  // ── Streaks, puffs, marks, smoke ──────────────────────────────────────────
  _effects() {
    const scene = this.scene;
    const streakGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.streaks = [];
    for (let i = 0; i < STREAKS; i++) {
      const mesh = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.streaks.push({ mesh, age: Infinity });
    }
    this._streak = 0;
    this.puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial(), PUFFS);
    this.puffs.count = 0;
    this.puffs.frustumCulled = false;
    this.puffList = []; // { p, v, age, life, size, color, rise }
    scene.add(this.puffs);
    this.holes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshBasicMaterial({ color: 0x1b1712, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), HOLES);
    this.holes.count = 0;
    this.holes.frustumCulled = false;
    this._hole = 0;
    scene.add(this.holes);
    // other people's muzzles, and things going off
    this.flashes = [];
    for (let i = 0; i < FLASHES; i++) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.visible = false;
      scene.add(mesh);
      this.flashes.push({ mesh, age: Infinity, life: 0.05, size: 0.12, grow: 0, color: new THREE.Color() });
    }
    this._flash = 0;
    this.burstLight = new THREE.PointLight(0xffb060, 0, 60, 1.5);
    scene.add(this.burstLight);
    this.burstLeft = 0;
    this.burstPeak = 0;
    this.smokes = new Map(); // where -> { group, balls, seen }
    this.smokeGeo = new THREE.IcosahedronGeometry(1, 2);
    // (unlit: a bank of smoke has no bright side, and from inside it there's nothing to see but grey)
    this.smokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.49, 0.46), side: THREE.DoubleSide });
    this.thrown = new Map(); // grenade id -> what it looks like, in the air
  }

  // ── The charge ────────────────────────────────────────────────────────────
  _charge() {
    this.charge = gunModel('charge');
    this.charge.scale.setScalar(1.25);
    this.charge.visible = false;
    this.scene.add(this.charge);
    this.chargeLight = new THREE.PointLight(0xff3020, 0, 7, 1.8);
    this.charge.add(this.chargeLight);
    this.chargeLight.position.set(0.06, 0.2, 0);
    // a ring on the ground round it, where it lies dropped, so it can be found
    this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 0.3), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.chargeRing.visible = false;
    this.scene.add(this.chargeRing);
  }

  // ── As they happen ────────────────────────────────────────────────────────

  // A shot: a streak from the gun to wherever each of its rounds went, dust
  // where it met a wall and a mark left there.
  shot(e, match) {
    const f = match.fighters[e.by];
    const mine = match.mine;
    const own = !!mine && f === mine && this.first;
    const gun = GUNS[e.gun];
    const figure = this.figures.get(f.id);
    if (figure) kickFigure(figure);
    if (own) this.hands.fired(gun.slot === 'knife');
    if (gun.slot === 'knife') return;
    const from = own ? this.hands.muzzleAt(_v) : this.muzzleOf(f, _v);
    if (!own) this._glow(from.x, from.y, from.z, 0.16, 0.05, 0, _c.setRGB(5, 3.4, 1.2));
    for (const ray of e.rays) {
      const s = this.streaks[this._streak];
      this._streak = (this._streak + 1) % STREAKS;
      _w.set(ray.to[0] - from.x, ray.to[1] - from.y, ray.to[2] - from.z);
      const len = _w.length();
      s.age = 0;
      s.mesh.position.copy(from);
      s.mesh.quaternion.setFromUnitVectors(_up, _w.divideScalar(len || 1));
      s.mesh.scale.set(0.012, len, 0.012);
      s.mesh.visible = true;
      if (ray.n) {
        this._dust(ray.to, ray.n, 5, 0.75, 0.66, 0.5);
        _v.set(ray.to[0] + ray.n[0] * 0.012, ray.to[1] + ray.n[1] * 0.012, ray.to[2] + ray.n[2] * 0.012);
        _m4.lookAt(_w.set(0, 0, 0), _s.set(-ray.n[0], -ray.n[1], -ray.n[2]), Math.abs(ray.n[1]) > 0.9 ? _s.clone().set(1, 0, 0) : _up);
        _m4.setPosition(_v);
        this.holes.setMatrixAt(this._hole, _m4);
        this._hole = (this._hole + 1) % HOLES;
        this.holes.count = Math.min(HOLES, this.holes.count + 1);
        this.holes.instanceMatrix.needsUpdate = true;
      } else if (ray.hit) this._dust(ray.to, [0, 0.4, 0], 4, 0.42, 0.1, 0.08);
    }
  }

  // A grenade going off.
  burst(e) {
    const [x, y, z] = e.at;
    if (e.kind === 'frag') {
      this._glow(x, y + 0.3, z, 0.4, 0.3, 11, _c.setRGB(7, 3.2, 0.9));
      this._light(x, y + 1, z, 90, 0.35, 0xffb060);
      for (let i = 0; i < 26; i++) this._puff(x, y + 0.2, z, (Math.random() - 0.5) * 9, 1 + Math.random() * 6, (Math.random() - 0.5) * 9, 0.8 + Math.random() * 0.7, 0.3 + Math.random() * 0.5, 0.45, 0.4, 0.33, 0.6);
    } else if (e.kind === 'flash') {
      this._glow(x, y, z, 0.3, 0.14, 16, _c.setRGB(14, 14, 13));
      this._light(x, y + 0.5, z, 260, 0.16, 0xffffff);
    }
  }

  // The charge going off.
  boom(e) {
    const [x, y, z] = e.at;
    this._glow(x, y + 1, z, 1, 0.7, 26, _c.setRGB(9, 4, 1));
    this._light(x, y + 3, z, 400, 0.9, 0xffa050);
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 16;
      const dark = Math.random() < 0.5 ? 0.16 : 0.5;
      this._puff(x, y + 0.5, z, Math.cos(a) * s, 2 + Math.random() * 14, Math.sin(a) * s, 2.5 + Math.random() * 3.5, 1 + Math.random() * 2.2, dark, dark * 0.92, dark * 0.8, 1.2);
    }
    this.shake = 1;
  }

  // A hard landing: the view dips.
  landed(speed) {
    this.dip = Math.min(0.2, Math.max(this.dip, (speed - 5) * 0.025));
  }

  _dust(at, n, count, r, g, b) {
    for (let i = 0; i < count; i++) {
      this._puff(at[0], at[1], at[2], n[0] * (0.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.2, n[1] * (0.6 + Math.random() * 1.6) + Math.random() * 0.8, n[2] * (0.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.2, 0.28 + Math.random() * 0.3, 0.05 + Math.random() * 0.07, r, g, b, 0.15);
    }
  }

  _puff(x, y, z, vx, vy, vz, life, size, r, g, b, rise) {
    if (this.puffList.length >= PUFFS) this.puffList.shift();
    this.puffList.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), age: 0, life, size, color: new THREE.Color(r, g, b), rise });
  }

  // Something bright for a moment: `size` m, growing by `grow` m/s.
  _glow(x, y, z, size, life, grow, color) {
    const f = this.flashes[this._flash];
    this._flash = (this._flash + 1) % FLASHES;
    f.age = 0;
    f.life = life;
    f.size = size;
    f.grow = grow;
    f.color.copy(color);
    f.mesh.position.set(x, y, z);
    f.mesh.visible = true;
  }

  _light(x, y, z, peak, life, color) {
    this.burstLight.position.set(x, y, z);
    this.burstLight.color.set(color);
    this.burstPeak = peak;
    this.burstLeft = this.burstLife = life;
  }

  // Where someone's shots come from: the muzzle of what they're seen to hold
  // (or, before they've been seen, about where it would be).
  muzzleOf(f, out) {
    const figure = this.figures.get(f.id);
    if (figure && figure.held) return muzzleOf(figure, out);
    aim(f.yaw, f.pitch, _d);
    const p = f.body.pos;
    return out.set(p.x + Math.cos(f.yaw) * 0.16 + _d.x * 0.8, p.y + eyeOf(f.body) - 0.22 + _d.y * 0.8, p.z - Math.sin(f.yaw) * 0.16 + _d.z * 0.8);
  }

  // ── Each frame ────────────────────────────────────────────────────────────

  // watch: the fighter you're watching, once you're down (or null).
  update(dt, match, watch = null) {
    this.time += dt;
    const me = match.mine;
    const first = !!me && me.alive;
    this.first = first;
    this._view(dt, match, me, first ? null : watch);
    this._inHand(dt, match, me, first);
    this._figures(dt, match, me, first, first ? null : watch);
    this._things(dt, match);
    this._fade(dt);
  }

  _view(dt, match, me, watch) {
    const cam = this.camera;
    this.dip = Math.max(0, this.dip - dt * 0.9);
    this.shake = Math.max(0, this.shake - dt * 0.9);
    let fov = FOV;
    if (me && me.alive) {
      const b = me.body;
      const speed = Math.hypot(b.vel.x, b.vel.z);
      if (b.grounded && speed > 0.8) this.bob += dt * speed * 1.9;
      const bob = b.grounded ? Math.sin(this.bob) * 0.018 * Math.min(1, speed / MOVE.speed) : 0;
      cam.position.set(b.pos.x, b.pos.y + eyeOf(b) + bob - this.dip, b.pos.z);
      cam.rotation.set(me.pitch + me.punch.pitch, me.yaw + me.punch.yaw, 0);
      const gun = match.gunOf(me);
      if (me.sighted && gun && gun.zoom) fov = (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) / gun.zoom) * 180) / Math.PI;
    } else if (watch && watch.alive) {
      // from behind whoever you're watching, nearer if a wall is in the way
      const b = watch.body;
      aim(watch.yaw, watch.pitch * 0.5, _d);
      _o.x = b.pos.x;
      _o.y = b.pos.y + eyeOf(b) + CHASE.up;
      _o.z = b.pos.z;
      const back = { x: -_d.x, y: -_d.y, z: -_d.z };
      const far = Math.min(CHASE.back, rayBoxes(_o, back, BOXES, CHASE.back + 0.3) - 0.3);
      cam.position.set(_o.x + back.x * far, _o.y + back.y * far, _o.z + back.z * far);
      cam.rotation.set(watch.pitch * 0.5, watch.yaw, 0);
    } else if (me) {
      // down: where you fell, low, the world on its side
      const b = me.body;
      cam.position.set(b.pos.x, b.pos.y + 0.45, b.pos.z);
      cam.rotation.set(Math.min(0.3, me.pitch), me.yaw, 0.4);
    } else {
      // nobody to be: the town from over its south wall
      cam.position.set(0, 46, 62);
      cam.rotation.set(-0.75, 0, 0);
    }
    if (this.shake > 0) {
      const k = this.shake * this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
      cam.rotation.z += (Math.random() - 0.5) * k * 0.2;
    }
    this.fov += (fov - this.fov) * Math.min(1, dt * 16);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  // What's in your hands (not through the long rifle's sight, where there's
  // only the sight to see).
  _inHand(dt, match, me, first) {
    if (!first) return this.hands.update(dt, null, '', false, 0);
    const kind = kindOf(me);
    const gun = GUNS[kind];
    this.hands.dress(match.sideOf(me), me.id % TEAM);
    this.hands.update(dt, me, kind, !(me.sighted && gun && gun.zoom), this.bob);
  }

  _figures(dt, match, me, first, watch) {
    let made = false;
    for (const f of match.fighters) {
      let v = this.figures.get(f.id);
      if (!v) {
        // (dressing someone takes a moment: one a frame, as the match is first seen)
        if (made) continue;
        made = true;
        v = makeFigure(f.id % TEAM);
        this.figures.set(f.id, v);
        this.scene.add(v.group);
        const mark = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial());
        this.marks.set(f.id, mark);
        this.scene.add(mark);
      }
      const side = match.sideOf(f);
      setSide(v, side);
      poseFigure(v, f, kindOf(f), dt, match);
      // you don't see yourself, from your own eyes
      v.group.visible = !(first && f === me);
      const mark = this.marks.get(f.id);
      // (not over whoever you're watching from behind: it would be in the way)
      mark.visible = !!me && f !== me && f !== watch && f.alive && f.team === me.team;
      if (mark.visible) {
        mark.material.color.set(SIDE_COLOURS[side].css).multiplyScalar(1.6);
        mark.position.set(f.body.pos.x, f.body.pos.y + heightOf(f.body) + 0.32 + Math.sin(this.time * 3 + f.id) * 0.03, f.body.pos.z);
      }
    }
  }

  // The charge, the grenades in the air, the smoke.
  _things(dt, match) {
    const c = match.charge;
    const lying = c.state === 'dropped' || c.state === 'planted' || c.state === 'defused';
    this.charge.visible = lying;
    this.chargeRing.visible = c.state === 'dropped';
    if (lying) {
      this.charge.position.set(c.x, c.y + 0.06, c.z);
      // its light: slow at first, quicker and quicker as the fuse runs down
      const every = c.state === 'planted' ? 0.12 + 0.9 * Math.min(1, match.rounds.left / match.rounds.rules.fuse) : 1.4;
      const on = c.state !== 'defused' && this.time % every < Math.min(0.09, every / 2);
      this.charge.userData.light.visible = on;
      this.chargeLight.intensity = on && c.state === 'planted' ? 14 : 0;
      this.chargeRing.position.set(c.x, c.y + 0.03, c.z);
      this.chargeRing.scale.setScalar(1 + 0.25 * Math.sin(this.time * 4));
    }
    // grenades
    const seen = new Set();
    for (const n of match.nades) {
      seen.add(n.id);
      let mesh = this.thrown.get(n.id);
      if (!mesh) {
        mesh = gunModel(n.kind in NADES ? n.kind : 'frag');
        mesh.scale.setScalar(NADE_SIZE);
        mesh.position.set(n.p.x, n.p.y, n.p.z);
        this.scene.add(mesh);
        this.thrown.set(n.id, mesh);
      }
      mesh.position.lerp(_v.set(n.p.x, n.p.y, n.p.z), Math.min(1, dt * 30));
      mesh.rotation.x += dt * 9;
      mesh.rotation.z += dt * 4;
    }
    for (const [id, mesh] of this.thrown) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.thrown.delete(id);
    }
    // smoke: a heap of grey balls that swell up, drift a little, and thin away
    for (const s of this.smokes.values()) s.seen = false;
    for (const s of match.smokes) {
      const key = `${s.x}:${s.z}`;
      let cloud = this.smokes.get(key);
      if (!cloud) {
        cloud = { group: new THREE.Group(), balls: [], age: 0, seen: true };
        for (let i = 0; i < SMOKE_BALLS; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * s.r * 0.72;
          const ball = new THREE.Mesh(this.smokeGeo, this.smokeMat);
          ball.userData = { x: Math.cos(a) * r, y: (Math.random() - 0.35) * s.r * 0.55, z: Math.sin(a) * r, size: s.r * (0.4 + Math.random() * 0.25), phase: Math.random() * 6 };
          cloud.group.add(ball);
          cloud.balls.push(ball);
        }
        cloud.group.position.set(s.x, s.y, s.z);
        this.scene.add(cloud.group);
        this.smokes.set(key, cloud);
      }
      cloud.seen = true;
      cloud.age += dt;
      const k = Math.min(1, cloud.age / 1.2) * Math.min(1, Math.max(0, s.left) / 2.5);
      for (const ball of cloud.balls) {
        const u = ball.userData;
        ball.position.set(u.x * k + Math.sin(this.time * 0.4 + u.phase) * 0.15, Math.max(-s.y + 0.3, u.y * k + Math.sin(this.time * 0.3 + u.phase * 2) * 0.1), u.z * k + Math.cos(this.time * 0.35 + u.phase) * 0.15);
        ball.scale.setScalar(Math.max(0.01, u.size * k));
      }
    }
    for (const [key, cloud] of this.smokes) {
      if (cloud.seen) continue;
      this.scene.remove(cloud.group);
      this.smokes.delete(key);
    }
  }

  // Is the eye in smoke? -> 0..1, how thick.
  smoked(match) {
    const p = this.camera.position;
    let most = 0;
    for (const s of match.smokes) {
      const d = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z);
      most = Math.max(most, Math.min(1, Math.max(0, 1 - d / (s.r * 0.95)) * 3) * Math.min(1, s.left / 2));
    }
    return most;
  }

  _fade(dt) {
    for (const s of this.streaks) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      const f = Math.max(0, 1 - s.age / STREAK_LIFE);
      s.mesh.material.color.setRGB(2.6 * f, 2.1 * f, 1.1 * f);
      s.mesh.visible = f > 0;
    }
    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.age += dt;
      const k = Math.max(0, 1 - f.age / f.life);
      f.mesh.material.color.copy(f.color).multiplyScalar(k * k);
      f.mesh.scale.setScalar(f.size + f.grow * f.age);
      f.mesh.visible = k > 0;
    }
    if (this.burstLeft > 0) {
      this.burstLeft -= dt;
      const k = Math.max(0, this.burstLeft / this.burstLife);
      this.burstLight.intensity = this.burstPeak * k * k;
    } else this.burstLight.intensity = 0;
    const list = this.puffList;
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].age += dt) > list[i].life) list.splice(i, 1);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const drag = Math.exp(-dt * 3.2);
      p.v.x *= drag;
      p.v.z *= drag;
      p.v.y = p.v.y * drag + (p.rise - 1.2 * Math.min(1, p.age * 2)) * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.03) p.p.y = 0.03;
      const k = p.age / p.life;
      _m4.compose(p.p, _q.identity(), _s.setScalar(p.size * (0.5 + k * 1.6) * (1 - k * k)));
      this.puffs.setMatrixAt(i, _m4);
      this.puffs.setColorAt(i, p.color);
    }
    this.puffs.count = list.length;
    this.puffs.instanceMatrix.needsUpdate = true;
    if (this.puffs.instanceColor) this.puffs.instanceColor.needsUpdate = true;
  }
}
