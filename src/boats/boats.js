// The boats people have built: canoes and rafts, wherever they were left,
// afloat or pulled up on a bank.
//
// They're part of the world, like the fires and the cabins: built in a shared
// world, everyone there sees them, and anyone can take one out. Each has an
// id it keeps for good, so it is the same boat wherever it's taken.
//
// A boat out on the water with someone in it isn't drawn where it was left:
// the one in it carries it (the boat you're in follows you, see index.js;
// someone else's, see others.js). Where it was left is only written down
// again when they get out, so while it's out it costs the save nothing.
//
// Emits:
//   'change'   ()   a boat was built, broken up, or left somewhere new, here
//                   (not when someone else's changes arrive: see adopt)

import * as THREE from 'three';
import { Emitter } from '../core/events.js';
import { regionOf } from '../save/regions.js';
import { phash } from '../noise.js';
import { BOATS } from './kinds.js';
import { boatGeometry } from './models.js';
import { rest } from './shore.js';

// How far off (m) boats are kept settled on the land and the water as it is,
// and bob; beyond it they're left as they were.
const SETTLE = 160;
// Bobbing on the water: how far up and down (m) and how far it rolls
// (radians), and how fast (radians a second).
const BOB = { lift: 0.025, roll: 0.025, pitch: 0.012, rate: [1.3, 0.85] };

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
export const newBoatId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);

// A boat's hull as a capsule in plan: its ends along its length, and how far
// out from that line it reaches. -> { ax, az, bx, bz, r }
export function hullOf(b, out = {}) {
  const def = BOATS[b.kind];
  const L = def.len / 2 - Math.min(def.beam, def.len) / 2;
  const dx = Math.sin(b.yaw) * L;
  const dz = Math.cos(b.yaw) * L;
  out.ax = b.x - dx;
  out.az = b.z - dz;
  out.bx = b.x + dx;
  out.bz = b.z + dz;
  out.r = def.beam / 2;
  return out;
}

// How far (x, z) is from the outside of a boat's hull, in plan (m; negative inside).
export function hullDistance(b, x, z) {
  const h = hullOf(b);
  const ex = h.bx - h.ax;
  const ez = h.bz - h.az;
  const l2 = ex * ex + ez * ez;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - h.ax) * ex + (z - h.az) * ez) / l2)) : 0;
  return Math.hypot(x - (h.ax + ex * t), z - (h.az + ez * t)) - h.r;
}

export class Boats extends Emitter {
  // solids: the world's Solids (a boat lying there is something to bump into)
  // world: the land and the water, as shore.js wants it
  constructor({ scene, solids, world }) {
    super();
    this.scene = scene;
    this.solids = solids;
    this.world = world;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    this.list = new Map(); // id -> boat
    this.time = 0;
  }

  get(id) {
    return this.list.get(id) || null;
  }

  // The boat whose hull comes nearest (x, z), within r of it, that's where it
  // was left (not out on the water with someone in it).
  near(x, z, r) {
    let best = null;
    let bd = r;
    for (const b of this.list.values()) {
      if (b.out) continue;
      const d = hullDistance(b, x, z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  // ── Changes ───────────────────────────────────────────────────────────────
  // A new boat, built where it lies.
  add(kind, x, z, yaw, id = newBoatId()) {
    const b = this._add({ id, kind, x: r2(x), z: r2(z), yaw: r3(yaw) });
    this.emit('change');
    return b;
  }

  // Broken up for its logs.
  remove(b) {
    this._dispose(b);
    this.list.delete(b.id);
    this.emit('change');
  }

  // Left somewhere new: where you got out of it.
  leave(b, x, z, yaw) {
    b.x = r2(x);
    b.z = r2(z);
    b.yaw = r3(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
    this.setOut(b, null);
    this.emit('change');
  }

  // Out on the water with someone in it ('you', or someone else's id), or
  // with null, back where it was left. While it's out it isn't solid, and
  // it's drawn where whoever is in it is, not here: by them, for you; by
  // others.js, for someone else.
  setOut(b, who) {
    b.out = who || null;
    if (b.out) {
      this.solids.clear(b);
      b.solidY = null;
      if (b.out !== 'you') b.mesh.visible = false;
    } else {
      b.mesh.visible = true;
      b.solidY = null;
      this._settle(b);
    }
  }

  // ── Per frame ─────────────────────────────────────────────────────────────
  // eye: where the camera is
  update(dt, eye) {
    this.time += dt;
    for (const b of this.list.values()) {
      if (b.out) continue;
      if (Math.hypot(b.x - eye.x, b.z - eye.z) > SETTLE) continue;
      this._settle(b);
      this.pose(b, b.mesh, b.y, b.pitch, b.afloat);
    }
  }

  // Put a boat's mesh where it is, bobbing if it's afloat.
  pose(b, mesh, y, pitch, afloat) {
    const t = this.time;
    const bob = afloat ? 1 : 0;
    mesh.position.set(b.x, y + Math.sin(t * BOB.rate[0] + b.phase) * BOB.lift * bob, b.z);
    mesh.rotation.set(-pitch + Math.sin(t * BOB.rate[1] + b.phase * 2) * BOB.pitch * bob, b.yaw, Math.sin(t * BOB.rate[1] + b.phase) * BOB.roll * bob, 'YXZ');
  }

  // ── Building one ──────────────────────────────────────────────────────────
  _add(d) {
    const seed = Math.floor(phash(d.x, d.z, 61) * 1e6);
    const mesh = new THREE.Mesh(boatGeometry(d.kind, seed), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.order = 'YXZ';
    const b = { ...d, mesh, y: 0, pitch: 0, afloat: false, out: null, solidY: null, phase: phash(d.x, d.z, 67) * Math.PI * 2 };
    this.scene.add(mesh);
    this.list.set(b.id, b);
    this._settle(b);
    this.pose(b, mesh, b.y, b.pitch, b.afloat);
    return b;
  }

  // How it lies on the land and the water as they are now, and solid there.
  // (The land comes in finer as it streams in, so it can settle a little.)
  _settle(b) {
    const r = rest(this.world, BOATS[b.kind], b.x, b.z, b.yaw);
    b.y = r.y;
    b.pitch = r.pitch;
    b.afloat = r.afloat;
    if (b.solidY !== null && Math.abs(b.y - b.solidY) < 0.05) return;
    b.solidY = b.y;
    const def = BOATS[b.kind];
    const h = hullOf(b);
    // a raft is a deck you can step up onto; a canoe, something to go round
    const raft = b.kind === 'raft';
    this.solids.set(b, [{ ...h, r: raft ? h.r * 0.9 : h.r * 0.85, bottom: b.y - 0.3, topA: b.y + def.rim * 0.9, topB: b.y + def.rim * 0.9, ...(raft ? { step: 0.55, surface: 'boards' } : {}) }]);
  }

  _dispose(b) {
    this.scene.remove(b.mesh);
    b.mesh.geometry.dispose();
    this.solids.clear(b);
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  // [id, kind, x, z, yaw]
  serialize() {
    return [...this.list.values()].map((b) => [b.id, b.kind, b.x, b.z, b.yaw]);
  }

  load(arr) {
    for (const d of validateBoats(arr)) {
      const [id, kind, x, z, yaw] = d;
      if (!this.list.has(id)) this._add({ id, kind, x, z, yaw });
    }
  }

  // Someone else's version of the boats: theirs instead of ours. There are
  // only ever a few, so they're all put up again, except whichever is out on
  // the water with someone in it: that stays as it is, wherever it's got to.
  adopt(arr) {
    const out = new Map();
    for (const b of this.list.values()) {
      if (b.out === 'you') out.set(b.id, b);
      else {
        if (b.out) out.set(b.id, b.out);
        this._dispose(b);
      }
    }
    this.list.clear();
    for (const [id, b] of out) if (typeof b === 'object') this.list.set(id, b);
    this.load(arr);
    for (const [id, who] of out) {
      const b = this.list.get(id);
      if (b && typeof who === 'string') this.setOut(b, who);
    }
  }
}

// What a save holds of the boats, made safe: someone else's bytes.
export function validateBoats(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const d of raw) {
    if (!Array.isArray(d)) continue;
    const [id, kind, x, z, yaw] = d;
    if (typeof id !== 'string' || !id || !BOATS[kind] || ![x, z].every(Number.isFinite)) continue;
    out.push([id, kind, x, z, Number.isFinite(yaw) ? yaw : 0]);
  }
  return out;
}

// ── How boats are spelled in a save ─────────────────────────────────────────
// A boat is one element where it was left, under its id:
// b:<id> -> [kind, x, z, yaw]. Moving it to another region moves the element.
export const boatsSave = {
  id: 'boats',
  scope: 'world',
  kinds: ['b'],
  encode(data, put) {
    for (const [id, kind, x, z, yaw] of validateBoats(data)) put(regionOf(x, z), `b:${id}`, [kind, x, z, yaw]);
  },
  decode() {
    const out = [];
    return {
      take(region, kind, rest, v) {
        if (Array.isArray(v)) out.push([rest, v[0], v[1], v[2], v[3]]);
      },
      done: () => validateBoats(out),
    };
  },
  validate: validateBoats,
};
