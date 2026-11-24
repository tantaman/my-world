// The animals in their pens, and what they do there. Each exhibit with a pen
// and a kind (species.js) has as many of them as its kind says, the same ones
// each time you come (the exhibit's id is their seed), and they go about
// their day inside it: amble from one spot to another, stand, graze, sit,
// lie down, and look round at you when you're near. The seals and sea lions
// swim laps of their pools, otters and ducks take to the water, the birds of
// prey sit on their perches, and the reptiles bask.
//
// Only those near you are moved (UPDATE), and only those you could see are
// drawn (SHOW): the zoo has a couple of hundred animals in it.

import * as THREE from 'three';
import { Quad } from '../wildlife/quadruped.js';
import { disposeAnimal } from '../render/rig.js';
import { mulberry32, clamp, lerp } from '../noise.js';
import { wrapAngle } from '../core/geom.js';
import { makeBody } from './bodies.js';
import { inside, edgeDistance } from './shapes.js';
import { USE } from './site.js';

const UPDATE = 140; // m from the eye: nearer than this, they move
const SHOW = 240; // m: nearer than this, they're drawn
const IDLE = [6, 22]; // s an animal stands, sits or lies before moving on
const TURN = 1.6; // rad/s, how fast they turn walking
const ARRIVE = 0.6; // m from where it's going that counts as there
const NOTICE = 14; // m: a visitor nearer than this is looked at
const PERCH = { h: [1.3, 2.2], post: 0x5a4430 };

const hashOf = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const _seen = new Set();

export class Residents {
  // site: site.js's; ground(x, z); water(x, z) → the level of the water
  // there, or NaN where there's none
  constructor(site, { ground, water = () => NaN }) {
    this.site = site;
    this.ground = ground;
    this.water = water;
    this.group = new THREE.Group();
    this.group.name = 'zoo animals';
    this.list = [];
    this.perches = [];
  }

  // Into their pens, an exhibit a step (a generator).
  *populate() {
    const totals = new Map();
    for (const e of this.site.exhibits) {
      if (!e.pen || !e.kind) continue;
      yield;
      const k = e.kind;
      const rnd = mulberry32(hashOf(e.id));
      let n = k.count[0] + Math.floor(rnd() * (k.count[1] - k.count[0] + 1));
      if (k.total) {
        const had = totals.get(k) || 0;
        n = Math.min(n, k.total - had);
        totals.set(k, had + Math.max(0, n));
      }
      for (let i = 0; i < n; i++) {
        const a = this._make(e, k, i, rnd);
        if (a) this.list.push(a);
      }
    }
  }

  // ── Making one ────────────────────────────────────────────────────────────
  _make(e, kind, i, rnd) {
    const body = makeBody(kind, hashOf(`${e.id}:${i}`), { male: i === 0 && rnd() < 0.7 });
    const swims = kind.swims || body.form === 'seal';
    const spot = (swims && this._wetSpot(e.pen, rnd)) || this.site.spotIn(e.pen, rnd, this._clear(kind));
    if (!spot) {
      body.mesh.traverse((o) => o.isSkinnedMesh && disposeAnimal(o));
      return null;
    }
    const a = { kind, exhibit: e, body, x: spot[0], z: spot[1], yaw: rnd() * Math.PI * 2, speed: 0, state: 'idle', timer: rnd() * IDLE[1], target: null, rnd, look: 0, phase: rnd() * 10, swimming: false, pose: 'stand' };
    body.mesh.position.set(a.x, this.ground(a.x, a.z), a.z);
    body.mesh.rotation.y = a.yaw;
    if (body.form === 'quad') a.quad = new Quad(body.mesh, body.quad.sk, body.quad.dims);
    if (body.form === 'perch') {
      // a post to sit on, with a crossbar
      const h = PERCH.h[0] + rnd() * (PERCH.h[1] - PERCH.h[0]);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), perchMaterial());
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), post.material);
      const y = this.ground(a.x, a.z);
      post.position.set(a.x, y + h / 2, a.z);
      bar.rotation.z = Math.PI / 2;
      bar.rotation.y = a.yaw;
      bar.position.set(a.x, y + h, a.z);
      post.castShadow = bar.castShadow = true;
      this.group.add(post, bar);
      this.perches.push(post, bar);
      a.perchY = y + h + 0.05;
    }
    this.group.add(body.mesh);
    this._pose(a, rnd);
    return a;
  }
  // m it keeps from its pen's fence
  _clear(kind) {
    return clamp((kind.look.size || 0.5) * 0.6, 0.4, 2.5);
  }
  // a spot in the water of a pen, or null
  _wetSpot(pen, rnd) {
    for (let k = 0; k < 40; k++) {
      const s = this.site.spotIn(pen, rnd, 0.3);
      if (!s) continue;
      // (spotIn keeps to dry ground: look about it for water)
      for (let j = 0; j < 12; j++) {
        const x = s[0] + (rnd() - 0.5) * 12;
        const z = s[1] + (rnd() - 0.5) * 12;
        if (inside(pen, x, z) && Number.isFinite(this.water(x, z)) && this.water(x, z) - this.ground(x, z) > 0.3) return [x, z];
      }
    }
    // a pen that's all water (a pool the map draws as the exhibit)
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of pen) [x0, z0, x1, z1] = [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)];
    for (let k = 0; k < 60; k++) {
      const x = x0 + rnd() * (x1 - x0);
      const z = z0 + rnd() * (z1 - z0);
      if (inside(pen, x, z) && Number.isFinite(this.water(x, z)) && this.water(x, z) - this.ground(x, z) > 0.3) return [x, z];
    }
    return null;
  }

  // ── What it does ──────────────────────────────────────────────────────────
  // Stand, graze, sit or lie a while.
  _pose(a, rnd) {
    a.state = 'idle';
    a.timer = IDLE[0] + rnd() * (IDLE[1] - IDLE[0]);
    const body = a.kind.body;
    const r = rnd();
    a.pose = body === 'hoof' || body === 'elephant' ? (r < 0.55 ? 'graze' : 'stand') : body === 'cat' || body === 'small' || body === 'ape' || body === 'monkey' || body === 'bear' ? (r < 0.35 ? 'lie' : r < 0.6 ? 'sit' : 'stand') : body === 'bird' ? (r < 0.4 ? 'peck' : 'stand') : 'stand';
  }
  // Somewhere else in its pen it can walk to in a straight line.
  _wander(a) {
    const pen = a.exhibit.pen;
    const swims = a.kind.swims || a.body.form === 'seal';
    for (let k = 0; k < 6; k++) {
      const s = swims && (a.body.form === 'seal' || a.rnd() < 0.5) ? this._wetSpot(pen, a.rnd) : this.site.spotIn(pen, a.rnd, this._clear(a.kind));
      if (!s) continue;
      let ok = true;
      for (let t = 0.2; t < 1 && ok; t += 0.2) {
        const x = a.x + (s[0] - a.x) * t;
        const z = a.z + (s[1] - a.z) * t;
        if (!inside(pen, x, z) || this.site.use(x, z) & USE.building) ok = false;
        if (a.body.form === 'seal' && !Number.isFinite(this.water(x, z))) ok = false;
      }
      if (!ok) continue;
      a.target = s;
      a.state = 'walk';
      a.timer = 60;
      return;
    }
    this._pose(a, a.rnd);
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  update(dt, eye) {
    for (const a of this.list) {
      const d = Math.hypot(a.x - eye.x, a.z - eye.z);
      a.body.mesh.visible = d < SHOW;
      if (d > UPDATE) continue;
      this._step(a, dt, eye);
    }
  }

  _step(a, dt, eye) {
    a.timer -= dt;
    const form = a.body.form;
    if (form === 'perch') return this._perch(a, dt, eye);
    if (a.state === 'idle' && a.timer <= 0 && (a.kind.pace || 0) > 0) this._wander(a);
    let want = 0;
    if (a.state === 'walk') {
      const [tx, tz] = a.target;
      const dx = tx - a.x;
      const dz = tz - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist < ARRIVE || a.timer <= 0) this._pose(a, a.rnd);
      else {
        const turn = wrapAngle(Math.atan2(dx, dz) - a.yaw);
        const rate = clamp(turn, -TURN * dt, TURN * dt);
        a.yaw += rate;
        a.turn = rate / Math.max(dt, 1e-3);
        // slow round a tight turn, and coming in to stop
        want = a.kind.pace * clamp(1 - Math.abs(turn) / 2, 0.2, 1) * clamp(dist / 1.5, 0.3, 1);
      }
    }
    a.speed = lerp(a.speed, want, 1 - Math.exp(-dt * 3));
    const nx = a.x + Math.sin(a.yaw) * a.speed * dt;
    const nz = a.z + Math.cos(a.yaw) * a.speed * dt;
    // (never out of its pen)
    if (inside(a.exhibit.pen, nx, nz) && edgeDistance(a.exhibit.pen, nx, nz) > 0.25) {
      a.x = nx;
      a.z = nz;
    } else if (a.state === 'walk') this._pose(a, a.rnd);
    // a visitor near: look round at them
    const vx = eye.x - a.x;
    const vz = eye.z - a.z;
    const near = Math.hypot(vx, vz) < NOTICE && a.state === 'idle';
    a.look = lerp(a.look, near ? clamp(wrapAngle(Math.atan2(vx, vz) - a.yaw), -1.1, 1.1) : 0, 1 - Math.exp(-dt * 2));
    const m = a.body.mesh;
    m.position.x = a.x;
    m.position.z = a.z;
    m.rotation.y = a.yaw;
    const level = this.water(a.x, a.z);
    const g = this.ground(a.x, a.z);
    const afloat = Number.isFinite(level) && level - g > 0.25;
    if (form === 'quad') this._quad(a, dt, afloat ? level : NaN);
    else if (form === 'bird') this._bird(a, dt, afloat ? level : NaN, g);
    else if (form === 'seal') this._seal(a, dt, afloat ? level : NaN, g);
    else m.position.y = afloat ? level - 0.15 : g;
  }

  _quad(a, dt, level) {
    const q = a.quad;
    q.speed = a.speed;
    q.turn = a.turn || 0;
    q.lookYaw = a.look;
    const p = a.state === 'idle' ? a.pose : 'walk';
    q.graze = lerp(q.graze, p === 'graze' ? 1 : 0, 1 - Math.exp(-dt * 1.5));
    q.crouch = lerp(q.crouch, p === 'lie' ? 1 : p === 'sit' ? 0.5 : 0, 1 - Math.exp(-dt * 1.2));
    q.rear = lerp(q.rear, p === 'sit' && (a.kind.look.upright || a.kind.body === 'ape' || a.kind.body === 'monkey') ? 0.8 : 0, 1 - Math.exp(-dt * 1.5));
    q.alert = lerp(q.alert, Math.abs(a.look) > 0.1 ? 1 : 0, 1 - Math.exp(-dt * 2));
    // swimming: low in the water, its legs paddling under it
    if (Number.isFinite(level)) {
      q.flat = true;
      q.update(dt, () => level);
      a.body.mesh.position.y = level - a.kind.look.size * 0.8;
    } else {
      q.flat = false;
      q.update(dt, this.ground);
    }
  }

  _bird(a, dt, level, g) {
    const P = a.body.parts;
    const m = a.body.mesh;
    const walking = a.speed > 0.05;
    a.phase += dt * (walking ? (a.speed / Math.max(0.15, P.legH * 0.9)) * Math.PI : 0);
    const s = Math.sin(a.phase);
    for (const [i, leg] of P.legs.entries()) {
      const k = i ? -s : s;
      leg.hip.rotation.x = walking ? k * 0.45 : a.pose === 'stand' && a.kind.look.form === 'flamingo' && i ? -0.4 : 0;
      leg.knee.rotation.x = walking ? Math.max(0, -k) * 0.7 : a.pose === 'stand' && a.kind.look.form === 'flamingo' && i ? 1.9 : 0;
    }
    P.body.position.y = P.restY + (walking ? Math.abs(Math.cos(a.phase)) * P.legH * 0.03 : 0);
    // the neck: down to peck, bobbing as it walks, round to look at you
    const peck = a.state === 'idle' && a.pose === 'peck' ? 0.5 + 0.5 * Math.sin(a.timer * 3) : 0;
    P.neck.rotation.x = lerp(P.neck.rotation.x, peck * 1.1 + (walking ? Math.sin(a.phase * 2) * 0.08 : 0), 1 - Math.exp(-dt * 6));
    P.neck.rotation.y = a.look * 0.7;
    m.position.y = Number.isFinite(level) ? level - P.legH * 1.05 : g;
  }

  _seal(a, dt, level, g) {
    const P = a.body.parts;
    const m = a.body.mesh;
    a.phase += dt * (1 + a.speed * 2);
    // in the water: swimming laps, just under, the back and head showing;
    // a moment floating at the end of each. On land: lying out.
    if (Number.isFinite(level)) {
      m.position.y = level - P.len * 0.07 + Math.sin(a.phase * 0.7) * 0.03;
      m.rotation.z = Math.sin(a.phase * 0.9) * (a.speed > 0.5 ? 0.25 : 0.05);
      P.tail.rotation.y = Math.sin(a.phase * 4) * 0.3 * clamp(a.speed, 0, 1);
      for (const [i, f] of P.flippers.entries()) f.rotation.z = (i ? -1 : 1) * Math.sin(a.phase * 2.5) * 0.4 * clamp(a.speed, 0.2, 1);
      if (a.state === 'idle' && a.timer > 3) a.timer = 3; // seals don't stand about in the water
    } else {
      m.position.y = g + P.len * 0.06;
      m.rotation.z = 0;
    }
    P.head.rotation.y = a.look;
  }

  _perch(a, dt, eye) {
    const rig = a.body.parts.rig;
    const m = a.body.mesh;
    m.position.set(a.x, a.perchY, a.z);
    m.rotation.y = a.yaw;
    // now and then a look about, and at you when you're near
    if (a.timer <= 0) {
      a.timer = 1.5 + a.rnd() * 5;
      a.glance = (a.rnd() - 0.5) * 2.2;
    }
    const vx = eye.x - a.x;
    const vz = eye.z - a.z;
    const at = Math.hypot(vx, vz) < NOTICE ? clamp(wrapAngle(Math.atan2(vx, vz) - a.yaw), -1.6, 1.6) : a.glance || 0;
    rig.head.rotation.y = lerp(rig.head.rotation.y, at, 1 - Math.exp(-dt * 5));
  }

  // The animals within r of (x, z), each kind once.
  near(x, z, r) {
    _seen.clear();
    const out = [];
    for (const a of this.list) {
      if (_seen.has(a.kind) || Math.hypot(a.x - x, a.z - z) > r || !a.body.mesh.visible) continue;
      _seen.add(a.kind);
      out.push(a);
    }
    return out;
  }

  dispose() {
    for (const a of this.list) a.body.mesh.traverse((o) => (o.isSkinnedMesh ? disposeAnimal(o) : o.isMesh && o.geometry.dispose()));
    for (const p of this.perches) p.geometry.dispose();
    this.list = [];
  }
}

let _perchMat = null;
const perchMaterial = () => (_perchMat ||= new THREE.MeshStandardMaterial({ color: PERCH.post, roughness: 0.9 }));
