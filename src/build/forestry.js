// Felling, limbing and bucking trees; stumps; and remembering which plants
// you've removed from the (otherwise regenerated-from-the-seed) forest.
//
// A tree goes: standing → chopped through → falling (it topples away from
// you, slowly then all at once) → down → limbed (the crown becomes a heap of
// brush and the trunk is bare) → bucked into log lengths until nothing is
// left but the stump. Stumps stay until you grub them out with the shovel.

import * as THREE from 'three';
import { Mesher, addTrunk, addSlash, stumpGeometry } from './geometry.js';
import { phash } from '../noise.js';
import { regionOf } from '../save/regions.js';
import { TREE_KINDS, VEG_STRIDE } from '../world/flora.js';
import { Emitter } from '../core/events.js';

// Per species: swings to fell, metres of usable log, trunk radius, height.
export const SPECIES = {
  pine: { name: 'pine', a: 'a pine', hits: (s) => Math.round(4 + 2.5 * s), meters: (s) => Math.round(11 * s * 2) / 2, r: 0.32, h: 15, bole: 0.62 },
  broad: { name: 'oak', a: 'an oak', hits: (s) => Math.round(6 + 3 * s), meters: (s) => Math.round(6.5 * s * 2) / 2, r: 0.4, h: 11, bole: 0.55 },
  birch: { name: 'birch', a: 'a birch', hits: (s) => Math.round(3 + 1.5 * s), meters: (s) => Math.round(6 * s * 2) / 2, r: 0.2, h: 12, bole: 0.55 },
};
export const BUCK_LEN = 4; // metres per log cut from a felled trunk
export const BUCK_HITS = 2;
export const LIMB_HITS = 2;
const CUT_H = 0.32; // stump height

const posKey = (kind, x, z) => `${kind}@${Math.round(x * 100)},${Math.round(z * 100)}`;
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

// Emits:
//   'crash'  (felled, speed)   a falling tree hit the ground
export class Forestry extends Emitter {
  constructor({ scene, chunks, models, solids, materials }) {
    super();
    this.scene = scene;
    this.chunks = chunks;
    this.models = models;
    this.solids = solids;
    this.mat = materials; // { wood, still }
    this.removed = new Map(); // "cx,cz" -> Set<posKey>
    this.stumps = new Map(); // id -> stump
    this.felled = new Map(); // id -> felled tree
    this.hits = new Map(); // posKey of a standing tree -> swings so far
    this.dirty = false;
    this.nextId = 1;
  }

  // ── Plants removed from the generated forest ──────────────────────────────
  hideRemoved(ch) {
    const set = this.removed.get(`${ch.cx},${ch.cz}`);
    if (!set || !ch.vegLists) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        if (set.has(posKey(kind, list[o], list[o + 2]))) this.chunks.hideInstance(ch, kind, k);
      }
    }
  }

  removePlant(ch, kind, k) {
    const list = ch.vegLists[kind];
    const key = posKey(kind, list[k * VEG_STRIDE], list[k * VEG_STRIDE + 2]);
    const ck = `${ch.cx},${ch.cz}`;
    let set = this.removed.get(ck);
    if (!set) this.removed.set(ck, (set = new Set()));
    set.add(key);
    this.chunks.hideInstance(ch, kind, k);
    this.dirty = true;
  }

  // ── Standing trees ────────────────────────────────────────────────────────
  // The standing tree nearest (x, z) within r, as { ch, kind, k, x, y, z, s }.
  treeNear(x, z, r) {
    let best = null;
    let bd = Infinity;
    this.chunks.forEachPlant(x, z, r, TREE_KINDS, (ch, kind, k, tx, ty, tz, s) => {
      const d = Math.hypot(tx - x, tz - z) - SPECIES[kind].r * s;
      if (d < bd) {
        bd = d;
        best = { ch, kind, k, x: tx, y: ty, z: tz, s, key: posKey(kind, tx, tz) };
      }
    });
    return best;
  }

  hitsNeeded(tree) {
    return SPECIES[tree.kind].hits(tree.s);
  }

  hitsOn(tree) {
    return this.hits.get(tree.key) || 0;
  }

  // One swing at a standing tree. Returns true when it starts to fall.
  chop(tree, fromX, fromZ) {
    const n = this.hitsOn(tree) + 1;
    if (n < this.hitsNeeded(tree)) {
      this.hits.set(tree.key, n);
      return false;
    }
    this.hits.delete(tree.key);
    // It falls away from whoever is chopping, with a little randomness.
    let dir = Math.atan2(tree.x - fromX, tree.z - fromZ);
    dir += (phash(tree.x, tree.z, 3) - 0.5) * 0.5;
    this.removePlant(tree.ch, tree.kind, tree.k);
    const ground = this.chunks.heightAt(tree.x, tree.z);
    this.addStump({ kind: tree.kind, x: tree.x, z: tree.z, y: ground, r: SPECIES[tree.kind].r * tree.s });
    const sp = SPECIES[tree.kind];
    const f = {
      id: this.nextId++,
      kind: tree.kind,
      x: tree.x,
      z: tree.z,
      y: ground + CUT_H,
      s: tree.s,
      yaw: phash(tree.x, tree.z, 9) * Math.PI * 2,
      dir,
      theta: 0.07,
      omega: 0,
      end: this._restAngle(tree.x, tree.z, ground + CUT_H, dir, sp.h * tree.s * 0.55),
      state: 'falling',
      limbHits: 0,
      buckHits: 0,
      total: sp.meters(tree.s),
      left: sp.meters(tree.s),
      r0: sp.r * tree.s * 0.92,
    };
    this.felled.set(f.id, f);
    this._buildFelled(f);
    this.dirty = true;
    return true;
  }

  // Angle from vertical at which a trunk of reach L comes to rest on the slope.
  _restAngle(x, z, y, dir, L) {
    const fx = Math.sin(dir);
    const fz = Math.cos(dir);
    const g = this.chunks.heightAt(x + fx * L, z + fz * L);
    const elev = Math.atan2(g + 0.35 - y, L);
    return Math.min(1.95, Math.max(1.15, Math.PI / 2 - elev));
  }

  // ── Felled trees ──────────────────────────────────────────────────────────
  axisOf(f, out = new THREE.Vector3()) {
    const fx = Math.sin(f.dir);
    const fz = Math.cos(f.dir);
    return out.set(fx * Math.sin(f.theta), Math.cos(f.theta), fz * Math.sin(f.theta));
  }

  // Length of the felled trunk you can work on.
  reach(f) {
    return f.state === 'limbed' ? f.left + 0.4 : SPECIES[f.kind].h * f.s * SPECIES[f.kind].bole;
  }

  _buildFelled(f) {
    if (f.object) {
      this.scene.remove(f.object);
      f.object.traverse((o) => {
        if (o.isMesh && o.userData.own) o.geometry.dispose();
      });
    }
    const g = new THREE.Group();
    if (f.state !== 'limbed') {
      // The whole tree, pivoting at the cut.
      const mesh = new THREE.Mesh(this.models[f.kind].lod0, this.mat.still);
      mesh.position.y = -CUT_H;
      mesh.rotation.y = f.yaw;
      mesh.scale.setScalar(f.s);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const pivot = new THREE.Group();
      pivot.position.set(f.x, f.y, f.z);
      pivot.add(mesh);
      g.add(pivot);
      f.pivot = pivot;
      this._orient(f);
    } else {
      f.pivot = null;
      const m = new Mesher();
      const d = this.axisOf(f);
      const base = new THREE.Vector3(f.x, f.y, f.z).addScaledVector(d, 0.05);
      if (f.left > 0.01) {
        const r1 = f.r0 * (1 - 0.45 * Math.min(1, f.left / f.total));
        addTrunk(m, base, d, f.left, f.r0, r1, f.id);
      }
      // brush heap where the crown came down
      const crown = new THREE.Vector3(f.x, f.y, f.z).addScaledVector(d, f.total + 1.6);
      crown.y = this.chunks.heightAt(crown.x, crown.z);
      const flat = new THREE.Vector3(d.x, 0, d.z).normalize();
      addSlash(m, crown, flat, f.id, f.kind === 'pine');
      const at = m.anchor();
      const mesh = new THREE.Mesh(m.build(at), this.mat.wood);
      mesh.position.copy(at);
      mesh.userData.own = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    f.object = g;
    this.scene.add(g);
    this._solids(f);
  }

  _orient(f) {
    if (!f.pivot) return;
    const fx = Math.sin(f.dir);
    const fz = Math.cos(f.dir);
    _v.set(fz, 0, -fx); // up × fall direction
    _q.setFromAxisAngle(_v, f.theta);
    f.pivot.quaternion.copy(_q);
  }

  _solids(f) {
    if (f.state === 'falling') {
      this.solids.clear(f);
      return;
    }
    const d = this.axisOf(f);
    const len = this.reach(f) * 0.9;
    const r = f.r0;
    const a = new THREE.Vector3(f.x, f.y, f.z);
    const b = a.clone().addScaledVector(d, len);
    this.solids.set(f, [{ ax: a.x, az: a.z, bx: b.x, bz: b.z, r, bottom: Math.min(a.y, b.y) - r - 0.3, topA: a.y + r, topB: b.y + r }]);
  }

  // Swing at a felled tree. Returns { limbed?, meters? } describing what came off.
  buck(f) {
    if (f.state === 'falling') return {};
    if (f.state === 'down') {
      if (++f.limbHits < LIMB_HITS) return {};
      f.state = 'limbed';
      this._buildFelled(f);
      this.dirty = true;
      return { limbed: true };
    }
    if (++f.buckHits < BUCK_HITS) return {};
    f.buckHits = 0;
    const cut = Math.min(BUCK_LEN, f.left);
    f.left = Math.max(0, f.left - cut);
    this.dirty = true;
    if (f.left <= 0.01) this.removeFelled(f);
    else this._buildFelled(f);
    return { meters: cut };
  }

  removeFelled(f) {
    if (f.object) {
      this.scene.remove(f.object);
      f.object.traverse((o) => {
        if (o.isMesh && o.userData.own) o.geometry.dispose();
      });
    }
    this.solids.clear(f);
    this.felled.delete(f.id);
    this.dirty = true;
  }

  // The felled tree whose trunk passes closest to (x, z), within r.
  felledNear(x, z, r) {
    let best = null;
    let bd = r;
    for (const f of this.felled.values()) {
      if (f.state === 'falling') continue;
      const d = this.axisOf(f, _v);
      const len = this.reach(f);
      const ex = d.x * len;
      const ez = d.z * len;
      const l2 = ex * ex + ez * ez;
      let t = l2 > 1e-6 ? ((x - f.x) * ex + (z - f.z) * ez) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dist = Math.hypot(x - (f.x + ex * t), z - (f.z + ez * t)) - f.r0;
      if (dist < bd) {
        bd = dist;
        best = { f, t, x: f.x + ex * t, z: f.z + ez * t, y: f.y + d.y * len * t };
      }
    }
    return best;
  }

  // ── Stumps ────────────────────────────────────────────────────────────────
  addStump(s) {
    s.id = s.id || this.nextId++;
    this.stumps.set(s.id, s);
    const mesh = new THREE.Mesh(stumpGeometry(s.r, s.id), this.mat.wood);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = phash(s.x, s.z, 1) * 6;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    s.mesh = mesh;
    this.solids.set(s, [{ ax: s.x, az: s.z, bx: s.x, bz: s.z, r: s.r * 1.15, bottom: s.y - 0.3, topA: s.y + CUT_H, topB: s.y + CUT_H, step: 0.42 }]);
    this.dirty = true;
    return s;
  }

  stumpNear(x, z, r) {
    let best = null;
    let bd = r;
    for (const s of this.stumps.values()) {
      const d = Math.hypot(s.x - x, s.z - z) - s.r;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  removeStump(s) {
    this.scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    this.solids.clear(s);
    this.stumps.delete(s.id);
    this.dirty = true;
  }

  // ── Per frame ─────────────────────────────────────────────────────────────
  update(dt) {
    for (const f of this.felled.values()) {
      if (f.state !== 'falling') continue;
      // A rod pivoting at its foot: θ'' = (3g / 2L) sin θ.
      const L = SPECIES[f.kind].h * f.s * 0.7;
      const steps = 4;
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        f.omega += ((3 * 9.8) / (2 * L)) * Math.sin(f.theta) * h;
        f.theta += f.omega * h;
        if (f.theta >= f.end) {
          f.theta = f.end;
          if (f.omega > 0.25) {
            if (!f.bounced) {
              f.bounced = true;
              this.emit('crash', f, f.omega);
            }
            f.omega *= -0.16;
          } else {
            f.omega = 0;
            f.state = 'down';
            this._solids(f);
            this.dirty = true;
            break;
          }
        }
      }
      this._orient(f);
    }
  }

  get falling() {
    for (const f of this.felled.values()) if (f.state === 'falling') return true;
    return false;
  }

  // Take someone else's version of the forest: drop what we have standing in
  // for it and build theirs. Plants removed from the generated forest only
  // ever accumulate, so re-hiding is enough — nothing has to come back.
  adopt(data) {
    for (const f of [...this.felled.values()]) this.removeFelled(f);
    for (const s of [...this.stumps.values()]) this.removeStump(s);
    this.removed.clear();
    this.load(data);
    for (const ch of this.chunks.chunks.values()) this.hideRemoved(ch);
    this.dirty = false;
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  serialize() {
    const removed = {};
    for (const [k, set] of this.removed) removed[k] = [...set];
    const stumps = [...this.stumps.values()].map((s) => ({ kind: s.kind, x: s.x, y: s.y, z: s.z, r: s.r }));
    const felled = [...this.felled.values()].map((f) => ({
      kind: f.kind,
      x: f.x,
      y: f.y,
      z: f.z,
      s: f.s,
      yaw: f.yaw,
      dir: f.dir,
      end: f.end,
      state: f.state === 'falling' ? 'down' : f.state,
      total: f.total,
      left: f.left,
      r0: f.r0,
    }));
    return { removed, stumps, felled };
  }

  load(data) {
    if (!data) return;
    for (const k in data.removed || {}) this.removed.set(k, new Set(data.removed[k]));
    for (const s of data.stumps || []) this.addStump({ ...s, id: 0 });
    for (const d of data.felled || []) {
      const f = { ...d, id: this.nextId++, theta: d.end, omega: 0, limbHits: 0, buckHits: 0 };
      this.felled.set(f.id, f);
      this._buildFelled(f);
    }
    this.dirty = false;
  }
}

// How the forest's changes are spelled in a save (see src/save/domains.js):
//
//   r:<kind>@<x>,<z>     a plant taken out of the generated forest      -> 1
//   s:<x>:<z>            a stump                                        -> [kind, y, r]
//   f:<kind>:<x>:<z>     a felled tree, keyed by the tree it came from  -> [y, s, yaw, dir, end, state, total, left, r0]
//
// The data is serialize()'s { removed, stumps, felled }.
export const forestSave = {
  id: 'forest',
  scope: 'world',
  kinds: ['r', 's', 'f'],
  encode(data, put) {
    const forest = data || {};
    // Removed plants are kept by chunk, which is the same grid as a region.
    for (const chunk in forest.removed || {}) {
      for (const plant of forest.removed[chunk] || []) put(chunk, `r:${plant}`, 1);
    }
    for (const st of forest.stumps || []) put(regionOf(st.x, st.z), `s:${st.x}:${st.z}`, [st.kind, st.y, st.r]);
    // A felled tree's id is minted locally and never stored, so it is keyed by
    // the tree it came from instead — which every machine agrees on.
    for (const f of forest.felled || []) {
      put(regionOf(f.x, f.z), `f:${f.kind}:${f.x}:${f.z}`, [f.y, f.s, f.yaw, f.dir, f.end, f.state, f.total, f.left, f.r0]);
    }
  },
  decode() {
    const removed = {};
    const stumps = [];
    const felled = [];
    return {
      take(region, kind, rest, v) {
        if (kind === 'r') (removed[region] || (removed[region] = [])).push(rest);
        else if (kind === 's') {
          const [x, z] = rest.split(':').map(Number);
          stumps.push({ kind: v[0], x, y: v[1], z, r: v[2] });
        } else {
          const at = rest.split(':');
          felled.push({ kind: at[0], x: Number(at[1]), z: Number(at[2]), y: v[0], s: v[1], yaw: v[2], dir: v[3], end: v[4], state: v[5], total: v[6], left: v[7], r0: v[8] });
        }
      },
      done: () => ({ removed, stumps, felled }),
    };
  },
  validate: (raw) => (raw && typeof raw === 'object' ? raw : null),
};
