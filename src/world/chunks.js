// Streams the open world in square chunks around the player. Each chunk owns
// a terrain mesh (rebuilt at a coarser resolution as you walk away from it)
// and instanced vegetation placed deterministically from the seed.
//
// The heavy lifting (noise evaluation, geometry buffers, placement) happens in
// a small pool of Web Workers so walking never stutters. If workers are not
// available it falls back to generating on the main thread within a budget.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { generateTerrain, generateVegetation, VEG_KINDS, VEG_STRIDE } from './chunkGen.js';

const KEY_OFF = 32768;
const chunkKey = (cx, cz) => (cx + KEY_OFF) * 65536 + (cz + KEY_OFF);

const TREE_KINDS = new Set(['pine', 'broad', 'birch']);
// Furthest chunk LOD at which each kind is still drawn.
const MAX_LOD = { pine: 2, broad: 2, birch: 2, rock: 2, bush: 1, log: 1, fern: 0 };

const _m = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.x0 = cx * CONFIG.chunkSize;
    this.z0 = cz * CONFIG.chunkSize;
    this.lod = -1; // lod currently displayed
    this.reqLod = -1; // lod requested from a worker
    this.vegRequested = false;
    this.terrain = null;
    this.heights = null;
    this.paths = null;
    this.forest = null;
    this.step = 1;
    this.n = 0;
    this.veg = []; // { kind, mesh }
    this.vegLists = null; // raw placement lists by kind (see VEG_STRIDE)
    this.vegMesh = {}; // kind -> InstancedMesh
    this.colliders = null; // Float32Array [x, z, r, ...]
    this.pos = null; // terrain vertex buffers, kept for live edits
    this.nor = null;
    this.gnd = null;
    this.disposed = false;
  }

  // Exactly matches the triangulation of the rendered terrain mesh.
  sampleHeight(x, z) {
    const fx = (x - this.x0) / this.step;
    const fz = (z - this.z0) / this.step;
    const N = this.n + 1;
    const i = Math.min(this.n - 1, Math.max(0, Math.floor(fx)));
    const j = Math.min(this.n - 1, Math.max(0, Math.floor(fz)));
    const u = fx - i;
    const v = fz - j;
    const H = this.heights;
    const a = H[j * N + i];
    const b = H[j * N + i + 1];
    const c = H[(j + 1) * N + i];
    const d = H[(j + 1) * N + i + 1];
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  sampleGrid(grid, x, z) {
    const fx = (x - this.x0) / this.step;
    const fz = (z - this.z0) / this.step;
    const N = this.n + 1;
    const i = Math.min(this.n - 1, Math.max(0, Math.floor(fx)));
    const j = Math.min(this.n - 1, Math.max(0, Math.floor(fz)));
    const u = fx - i;
    const v = fz - j;
    const a = grid[j * N + i];
    const b = grid[j * N + i + 1];
    const c = grid[(j + 1) * N + i];
    const d = grid[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
}

export class ChunkManager {
  constructor(scene, gen, materials, models, structures = []) {
    this.scene = scene;
    this.gen = gen;
    this.materials = materials;
    this.models = models;
    this.size = CONFIG.chunkSize;
    this.chunks = new Map();
    this.lastCx = NaN;
    this.lastCz = NaN;
    this.wanted = [];
    this.pending = true;
    // Hooks for the building system (see src/build/):
    //   onTerrainData(ch, t)  patch freshly generated terrain buffers in place
    //   onVegetation(ch)      a chunk's plants were just placed
    //   heightOffset(x, z)    edit offset used when no chunk is loaded
    this.onTerrainData = null;
    this.onVegetation = null;
    this.heightOffset = null;
    this.trunkRadius = {};
    for (const k of VEG_KINDS) this.trunkRadius[k] = models[k].trunkRadius;

    this.workers = [];
    this.jobs = new Map(); // id -> chunk
    this.nextId = 1;
    this.inFlight = 0;
    const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < count; i++) {
        const w = new Worker(new URL('./chunkWorker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this.onWorkerMessage(e.data);
        w.onerror = (e) => {
          console.warn('chunk worker failed, generating on the main thread', e.message);
          this.disableWorkers();
        };
        w.postMessage({
          type: 'init',
          seed: gen.seed,
          chunkSize: this.size,
          structures: structures.map((s) => ({ x: s.x, z: s.z, radius: s.radius })),
          trunkRadius: this.trunkRadius,
        });
        this.workers.push(w);
      }
    } catch (err) {
      console.warn('Web Workers unavailable, generating on the main thread', err);
      this.disableWorkers();
    }
    this.maxInFlight = this.workers.length * 2;
    this.rr = 0;
  }

  disableWorkers() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    // requeue anything in flight
    for (const ch of this.jobs.values()) {
      ch.reqLod = -1;
      if (ch.lod < 0) ch.vegRequested = false;
    }
    this.jobs.clear();
    this.inFlight = 0;
    this.pending = true;
  }

  lodFor(ring) {
    return ring <= 1 ? 0 : ring === 2 ? 1 : 2;
  }

  get(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  chunkAt(x, z) {
    return this.chunks.get(chunkKey(Math.floor(x / this.size), Math.floor(z / this.size)));
  }

  heightAt(x, z) {
    const ch = this.chunkAt(x, z);
    if (ch && ch.heights) return ch.sampleHeight(x, z);
    return this.gen.height(x, z) + (this.heightOffset ? this.heightOffset(x, z) : 0);
  }

  // Ground info for grass placement. Only valid in full-resolution chunks.
  groundAt(x, z, out) {
    const ch = this.chunkAt(x, z);
    if (!ch || ch.lod !== 0) return false;
    out.h = ch.sampleHeight(x, z);
    out.path = ch.sampleGrid(ch.paths, x, z);
    out.forest = ch.sampleGrid(ch.forest, x, z);
    return true;
  }

  // Calls fn(x, z, r) for every tree/rock collider near (x, z).
  forEachCollider(x, z, fn) {
    const cx = Math.floor(x / this.size);
    const cz = Math.floor(z / this.size);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ch = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (!ch || !ch.colliders) continue;
        const c = ch.colliders;
        for (let i = 0; i < c.length; i += 3) {
          if (c[i + 2] <= 0) continue; // removed (felled, cleared)
          const ex = c[i] - x;
          const ez = c[i + 1] - z;
          if (ex * ex + ez * ez < 9) fn(c[i], c[i + 1], c[i + 2]);
        }
      }
    }
  }

  isFullyLoaded() {
    return !this.pending;
  }

  // Fraction of wanted chunks displayed at their wanted LOD.
  progress() {
    if (!this.wanted.length) return 0;
    let ready = 0;
    for (const w of this.wanted) {
      const ch = this.get(w.cx, w.cz);
      if (ch && ch.lod === w.lod) ready++;
    }
    return ready / this.wanted.length;
  }

  update(px, pz, budgetMs = 5) {
    const size = this.size;
    const cx = Math.floor(px / size);
    const cz = Math.floor(pz / size);
    const R = CONFIG.viewRadius;

    if (cx !== this.lastCx || cz !== this.lastCz) {
      this.lastCx = cx;
      this.lastCz = cz;
      this.pending = true;
      const wanted = [];
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dz * dz > (R + 0.6) * (R + 0.6)) continue;
          const ring = Math.max(Math.abs(dx), Math.abs(dz));
          wanted.push({ cx: cx + dx, cz: cz + dz, lod: this.lodFor(ring), d2: dx * dx + dz * dz });
        }
      }
      wanted.sort((a, b) => a.d2 - b.d2);
      this.wanted = wanted;

      for (const [k, ch] of this.chunks) {
        const dx = ch.cx - cx;
        const dz = ch.cz - cz;
        if (dx * dx + dz * dz > (R + 1.6) * (R + 1.6)) {
          this.disposeChunk(ch);
          this.chunks.delete(k);
        }
      }
    }

    if (!this.pending) return;

    let satisfied = true;
    const t0 = performance.now();
    for (const w of this.wanted) {
      let ch = this.chunks.get(chunkKey(w.cx, w.cz));
      if (ch && ch.lod === w.lod) continue;
      satisfied = false;
      if (!ch) {
        ch = new Chunk(w.cx, w.cz);
        this.chunks.set(chunkKey(w.cx, w.cz), ch);
      }
      if (ch.reqLod === w.lod) continue; // already on its way

      if (this.workers.length) {
        if (this.inFlight >= this.maxInFlight) break;
        const id = this.nextId++;
        const veg = !ch.vegRequested;
        ch.vegRequested = true;
        ch.reqLod = w.lod;
        this.jobs.set(id, ch);
        this.inFlight++;
        const worker = this.workers[this.rr++ % this.workers.length];
        worker.postMessage({ type: 'chunk', id, cx: ch.cx, cz: ch.cz, lod: w.lod, step: CONFIG.lodSteps[w.lod], veg });
      } else {
        if (performance.now() - t0 > budgetMs) break;
        const terrain = generateTerrain(this.gen, ch.cx, ch.cz, CONFIG.lodSteps[w.lod], size);
        const veg = ch.vegRequested ? null : generateVegetation(this.gen, ch.cx, ch.cz, size, this.trunkRadius);
        ch.vegRequested = true;
        this.applyChunk(ch, w.lod, terrain, veg);
      }
    }
    if (satisfied) this.pending = false;
  }

  onWorkerMessage(m) {
    if (m.type !== 'chunk') return;
    const ch = this.jobs.get(m.id);
    this.jobs.delete(m.id);
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (!ch || ch.disposed) return;
    if (ch.reqLod === m.lod) ch.reqLod = -1;
    this.applyChunk(ch, m.lod, m.terrain, m.veg);
    this.pending = true;
  }

  applyChunk(ch, lod, terrain, veg) {
    this.applyTerrain(ch, lod, terrain);
    if (veg) this.applyVegetation(ch, veg);
    this.applyVegLod(ch);
  }

  // ── Terrain ──────────────────────────────────────────────────────────────
  applyTerrain(ch, lod, t) {
    if (this.onTerrainData) this.onTerrainData(ch, t);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(t.nor, 3));
    geo.setAttribute('aGround', new THREE.BufferAttribute(t.gnd, 2));
    geo.setIndex(new THREE.BufferAttribute(t.idx, 1));
    geo.computeBoundingSphere();

    if (!ch.terrain) {
      ch.terrain = new THREE.Mesh(geo, this.materials.terrain);
      ch.terrain.position.set(ch.x0, 0, ch.z0);
      ch.terrain.receiveShadow = true;
      ch.terrain.matrixAutoUpdate = false;
      ch.terrain.updateMatrix();
      this.scene.add(ch.terrain);
    } else {
      ch.terrain.geometry.dispose();
      ch.terrain.geometry = geo;
    }
    ch.terrain.castShadow = lod === 0;
    ch.lod = lod;
    ch.step = t.step;
    ch.n = t.n;
    ch.heights = t.heights;
    ch.paths = t.paths;
    ch.forest = t.forest;
    ch.pos = t.pos;
    ch.nor = t.nor;
    ch.gnd = t.gnd;
  }

  // ── Vegetation ───────────────────────────────────────────────────────────
  applyVegetation(ch, veg) {
    ch.colliders = veg.colliders;
    ch.vegLists = veg.lists;
    for (const kind of VEG_KINDS) {
      const list = veg.lists[kind];
      if (!list || !list.length) continue;
      const model = this.models[kind];
      const count = list.length / VEG_STRIDE;
      const mesh = new THREE.InstancedMesh(model.lod0, this.materials.vegetation, count);
      for (let k = 0; k < count; k++) {
        const o = k * VEG_STRIDE;
        const s = list[o + 4];
        const tint = list[o + 5];
        _p.set(list[o], list[o + 1], list[o + 2]);
        _q.setFromAxisAngle(UP, list[o + 3]);
        if (kind === 'rock') {
          const e = list[o + 6];
          _s.set(s * (0.8 + e * 0.6), s * (0.7 + tint * 0.5), s * (1.3 - e * 0.5));
        } else {
          _s.set(s, s, s);
        }
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(k, _m);
        mesh.setColorAt(k, tintFor(kind, tint, _c));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = kind !== 'fern';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      ch.veg.push({ kind, mesh });
      ch.vegMesh[kind] = mesh;
    }
    if (this.onVegetation) this.onVegetation(ch);
  }

  // Hide one plant instance (felled, picked up or cleared) and drop its collider.
  hideInstance(ch, kind, k) {
    const mesh = ch.vegMesh[kind];
    if (mesh) {
      mesh.setMatrixAt(k, _zero);
      mesh.instanceMatrix.needsUpdate = true;
    }
    const list = ch.vegLists && ch.vegLists[kind];
    if (!list) return;
    const x = list[k * VEG_STRIDE];
    const z = list[k * VEG_STRIDE + 2];
    list[k * VEG_STRIDE + 4] = 0; // scale 0 marks it gone for forEachPlant
    const c = ch.colliders;
    if (!c) return;
    for (let i = 0; i < c.length; i += 3) {
      if (Math.abs(c[i] - x) < 1e-3 && Math.abs(c[i + 1] - z) < 1e-3) c[i + 2] = -1;
    }
  }

  // Calls fn(ch, kind, k, x, y, z, scale) for plants of `kinds` within r of (x, z).
  forEachPlant(x, z, r, kinds, fn) {
    const s = this.size;
    for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++) {
      for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++) {
        const ch = this.chunks.get(chunkKey(cx, cz));
        if (!ch || !ch.vegLists) continue;
        for (const kind of kinds) {
          const list = ch.vegLists[kind];
          if (!list) continue;
          for (let o = 0; o < list.length; o += VEG_STRIDE) {
            const dx = list[o] - x;
            const dz = list[o + 2] - z;
            if (dx * dx + dz * dz > r * r) continue;
            if (list[o + 4] <= 0) continue; // removed
            fn(ch, kind, o / VEG_STRIDE, list[o], list[o + 1], list[o + 2], list[o + 4]);
          }
        }
      }
    }
  }

  applyVegLod(ch) {
    for (const { kind, mesh } of ch.veg) {
      const model = this.models[kind];
      mesh.geometry = ch.lod === 0 ? model.lod0 : ch.lod === 1 ? model.lod1 : model.lod2;
      mesh.visible = ch.lod <= MAX_LOD[kind];
      if (TREE_KINDS.has(kind)) mesh.castShadow = ch.lod <= 1;
    }
  }

  disposeChunk(ch) {
    ch.disposed = true;
    if (ch.terrain) {
      this.scene.remove(ch.terrain);
      ch.terrain.geometry.dispose();
    }
    for (const { mesh } of ch.veg) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    ch.veg.length = 0;
  }

  stats() {
    let instances = 0;
    for (const ch of this.chunks.values()) for (const v of ch.veg) instances += v.mesh.count;
    return { chunks: this.chunks.size, instances, workers: this.workers.length };
  }
}

// Per-instance colour variation so no two plants look quite the same.
function tintFor(kind, t, out) {
  const a = (t * 7.31) % 1;
  const b = (t * 13.77) % 1;
  switch (kind) {
    case 'broad': {
      // the odd early-turning tree for a bit of warmth
      if (t > 0.94) return out.setRGB(1.35, 0.95, 0.45);
      const v = 0.82 + a * 0.32;
      return out.setRGB(v * (0.92 + b * 0.18), v, v * (0.85 + b * 0.1));
    }
    case 'pine': {
      const v = 0.8 + a * 0.35;
      return out.setRGB(v * (0.9 + b * 0.12), v, v * (0.95 + b * 0.12));
    }
    case 'birch': {
      const v = 0.85 + a * 0.25;
      return out.setRGB(v * (0.95 + b * 0.12), v, v * 0.9);
    }
    case 'rock': {
      const v = 0.75 + a * 0.4;
      return out.setRGB(v, v * (0.97 + b * 0.05), v * (0.92 + b * 0.06));
    }
    default: {
      const v = 0.8 + a * 0.35;
      return out.setRGB(v * (0.9 + b * 0.15), v, v * 0.9);
    }
  }
}
