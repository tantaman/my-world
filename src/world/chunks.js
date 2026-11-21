// Streams the open world in square chunks around the player. Each chunk owns
// a terrain mesh (rebuilt at a coarser resolution as you walk away from it)
// and instanced vegetation placed deterministically from the seed.
//
// Everything a chunk draws is measured from the chunk's corner, where its
// meshes are put: the ground, the water and each plant. The numbers the
// graphics card is given stay small however far out the chunk is (see
// render/origin.js).
//
// The heavy lifting (noise evaluation, geometry buffers, placement) happens in
// a small pool of Web Workers so walking never stutters. If workers are not
// available it falls back to generating on the main thread within a budget.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { generateTerrain, generateSurface, generateVegetation, VEG_KINDS, VEG_STRIDE, WATER_STRIDE as WS, SURFACE_STRIDE as SS } from './chunkGen.js';
import { buildWaterGeometry } from './waterSurface.js';
import { NO_WATER } from './water.js';
import { FLORA } from './flora.js';
import { Emitter } from '../core/events.js';
import { cellKey as chunkKey } from '../core/geom.js';

const _m = new THREE.Matrix4();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _t = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
// A land with no high ground (see chunkGen.js) draws its terrain with nothing
// above the trees and no snow: one array of zeros per size of chunk.
const NO_HIGH = new Map();
function noHigh(n) {
  if (!NO_HIGH.has(n)) NO_HIGH.set(n, new Float32Array(n));
  return NO_HIGH.get(n);
}

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
    this.wLevel = null; // water grids (see chunkGen.js)
    this.wData = null;
    this.hasWater = false; // any vertex where water may stand
    this.water = null; // water surface mesh
    this.step = 1;
    this.n = 0;
    this.veg = []; // { kind, mesh }
    this.vegLists = null; // raw placement lists by kind (see VEG_STRIDE)
    this.vegMesh = {}; // kind -> InstancedMesh
    this.colliders = null; // Float32Array [x, z, r, ...]
    this.pos = null; // terrain vertex buffers, kept for live edits
    this.nor = null;
    this.gnd = null;
    this.high = null; // above the trees, snow (see chunkGen.js), on a land with high ground
    // what the ground is made of, where a real place says (chunkGen.js); null in the forest
    this.surface = null;
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

  // Bilinear sample of a per-vertex grid (stride values per vertex, from off).
  sampleGrid(grid, x, z, stride = 1, off = 0) {
    const fx = (x - this.x0) / this.step;
    const fz = (z - this.z0) / this.step;
    const N = this.n + 1;
    const i = Math.min(this.n - 1, Math.max(0, Math.floor(fx)));
    const j = Math.min(this.n - 1, Math.max(0, Math.floor(fz)));
    const u = fx - i;
    const v = fz - j;
    const a = grid[(j * N + i) * stride + off];
    const b = grid[(j * N + i + 1) * stride + off];
    const c = grid[((j + 1) * N + i) * stride + off];
    const d = grid[((j + 1) * N + i + 1) * stride + off];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  // Water level at (x, z) from the corners of its cell that have one.
  sampleLevel(x, z) {
    const fx = (x - this.x0) / this.step;
    const fz = (z - this.z0) / this.step;
    const N = this.n + 1;
    const i = Math.min(this.n - 1, Math.max(0, Math.floor(fx)));
    const j = Math.min(this.n - 1, Math.max(0, Math.floor(fz)));
    const u = fx - i;
    const v = fz - j;
    const L = this.wLevel;
    let sum = 0;
    let wsum = 0;
    const add = (k, w) => {
      if (L[k] > NO_WATER * 0.5 && w > 0) {
        sum += L[k] * w;
        wsum += w;
      }
    };
    add(j * N + i, (1 - u) * (1 - v));
    add(j * N + i + 1, u * (1 - v));
    add((j + 1) * N + i, (1 - u) * v);
    add((j + 1) * N + i + 1, u * v);
    return wsum > 1e-6 ? sum / wsum : NO_WATER;
  }
}

// Running water is heard from at most this many places at once, each
// gathering what runs within SOURCE_SPREAD m of its loudest point.
export const WATER_SOURCES = 3;
const SOURCE_SPREAD = 14;

// Emits (synchronously, see core/events.js):
//   'terrain'     (chunk, buffers)   fresh terrain for a chunk, *before* it is
//                                    meshed: a listener may patch the buffers
//   'vegetation'  (chunk)            a chunk's plants were just placed
export class ChunkManager extends Emitter {
  // ready(x0, z0, x1, z1): whether everything that square is grown from is
  // here yet (see landforms.js); a chunk waits until it is.
  constructor(scene, gen, materials, models, structures = [], { ready = () => true } = {}) {
    super();
    this.ready = ready;
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
    // (x, z) -> how far the ground has been moved from where it was grown.
    // Asked only where no chunk is loaded; set by whoever keeps the edits.
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
          land: gen.land,
          chunkSize: this.size,
          structures: structures.map((s) => ({ x: s.x, z: s.z, radius: s.radius })),
          hikes: gen.hikes,
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

  // A hike's land has arrived (landforms.js): the workers grow with it from now on.
  // (The main thread's gen is told by whoever owns it.)
  addHike(def) {
    for (const w of this.workers) w.postMessage({ type: 'hike', def });
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
    out.above = ch.high ? ch.sampleGrid(ch.high, x, z, 2, 0) : 0;
    out.snow = ch.high ? ch.sampleGrid(ch.high, x, z, 2, 1) : 0;
    if (ch.hasWater) {
      out.wRegion = ch.sampleGrid(ch.wData, x, z, WS, 0);
      out.wLevel = ch.sampleLevel(x, z);
      out.wSpeed = Math.hypot(ch.sampleGrid(ch.wData, x, z, WS, 1), ch.sampleGrid(ch.wData, x, z, WS, 2));
      out.wFoam = ch.sampleGrid(ch.wData, x, z, WS, 3);
    } else {
      out.wRegion = 0;
      out.wLevel = NO_WATER;
      out.wSpeed = 0;
      out.wFoam = 0;
    }
    if (ch.surface) {
      out.bare = ch.sampleGrid(ch.surface, x, z, SS, 0);
      out.sand = ch.sampleGrid(ch.surface, x, z, SS, 1);
      out.land = ch.sampleGrid(ch.surface, x, z, SS, 2);
      // (which country isn't a thing to average: the nearest vertex says)
      const N = ch.n + 1;
      const i = Math.min(ch.n, Math.max(0, Math.round((x - ch.x0) / ch.step)));
      const j = Math.min(ch.n, Math.max(0, Math.round((z - ch.z0) / ch.step)));
      out.country = ch.surface[(j * N + i) * SS + 3];
    } else {
      out.bare = 0;
      out.sand = 0;
      out.land = 0;
      out.country = 0;
    }
    return true;
  }

  // The water at (x, z), if any may stand there. Fills out.level, out.depth
  // (level − ground: > 0 in the water, < 0 on the bank), out.flowX/Z and
  // out.foam, and returns true; false where there's no water about.
  waterAt(x, z, out) {
    const ch = this.chunkAt(x, z);
    if (ch && ch.heights) {
      if (!ch.hasWater || ch.sampleGrid(ch.wData, x, z, WS, 0) < 0.5) return false;
      const level = ch.sampleLevel(x, z);
      if (level <= NO_WATER * 0.5) return false;
      out.level = level;
      out.depth = level - ch.sampleHeight(x, z);
      out.flowX = ch.sampleGrid(ch.wData, x, z, WS, 1);
      out.flowZ = ch.sampleGrid(ch.wData, x, z, WS, 2);
      out.foam = ch.sampleGrid(ch.wData, x, z, WS, 3);
      return true;
    }
    const h = this.gen.height(x, z) + (this.heightOffset ? this.heightOffset(x, z) : 0);
    const w = this.gen.water;
    if (!w.region) return false;
    out.level = w.level;
    out.depth = w.level - h;
    out.flowX = w.flowX;
    out.flowZ = w.flowZ;
    out.foam = w.foam;
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
      const x0 = w.cx * size;
      const z0 = w.cz * size;
      if (!this.ready(x0, z0, x0 + size, z0 + size)) continue; // a hike's land is on its way

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
        const surface = generateSurface(this.gen, ch.cx, ch.cz, CONFIG.lodSteps[w.lod], size);
        const veg = ch.vegRequested ? null : generateVegetation(this.gen, ch.cx, ch.cz, size, this.trunkRadius);
        ch.vegRequested = true;
        this.applyChunk(ch, w.lod, terrain, veg, surface);
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
    this.applyChunk(ch, m.lod, m.terrain, m.veg, m.surface);
    this.pending = true;
  }

  applyChunk(ch, lod, terrain, veg, surface = null) {
    this.applyTerrain(ch, lod, terrain, surface);
    if (veg) this.applyVegetation(ch, veg);
    this.applyVegLod(ch);
  }

  // ── Terrain ──────────────────────────────────────────────────────────────
  applyTerrain(ch, lod, t, surface = null) {
    this.emit('terrain', ch, t);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(t.nor, 3));
    geo.setAttribute('aGround', new THREE.BufferAttribute(t.gnd, 2));
    geo.setAttribute('aWater', new THREE.BufferAttribute(t.wat, 2));
    geo.setAttribute('aHigh', new THREE.BufferAttribute(t.hi || noHigh(t.wat.length), 2));
    // (left off in the forest, where the shader reads it as nothing)
    if (surface) geo.setAttribute('aLand', new THREE.BufferAttribute(surface, SS));
    ch.surface = surface;
    geo.setIndex(new THREE.BufferAttribute(t.idx, 1));
    geo.computeBoundingSphere();

    if (!ch.terrain) {
      ch.terrain = new THREE.Mesh(geo, this.materials.terrain);
      if (this.materials.terrainShadow) ch.terrain.customDepthMaterial = this.materials.terrainShadow;
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
    ch.high = t.high || null;
    ch.wLevel = t.wLevel;
    ch.wData = t.wData;
    ch.hasWater = false;
    for (let k = 0; k < t.wData.length; k += WS) {
      if (t.wData[k] > 0.5) {
        ch.hasWater = true;
        break;
      }
    }
    this.updateWater(ch);
  }

  // What water there is within r of (x, z), for the soundscape, read straight
  // off the loaded chunk grids. Running water is gathered into a few sources
  // (the loudest stretch, then the loudest of what's left more than
  // SOURCE_SPREAD m from it, ...), so two streams either side of you are
  // heard either side of you. Fills out with:
  //   sources  up to WATER_SOURCES of { x, y, z, loud 0..1, foam 0..1 (how
  //            much is white water), big 0..1 (stream .. broad river) },
  //            loudest first; count says how many are in use
  //   still    0..1 how much still-water shore is near
  //   sx, sy, sz  where that is
  //   surf     0..1 how much breaking sea is near
  //   ux, uy, uz  where that is
  waterAround(x, z, r, out) {
    const pts = this._waterPts || (this._waterPts = []);
    let n = 0;
    let still = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let surf = 0;
    let ux = 0;
    let uy = 0;
    let uz = 0;
    const s = this.size;
    for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++) {
      for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++) {
        const ch = this.chunks.get(chunkKey(cx, cz));
        if (!ch || !ch.hasWater || !ch.heights) continue;
        const N = ch.n + 1;
        const every = Math.max(1, Math.round(2 / ch.step)); // about every 2 m
        for (let j = 0; j < N; j += every) {
          for (let i = 0; i < N; i += every) {
            const k = j * N + i;
            const D = ch.wData;
            const o = k * WS;
            if (D[o] < 0.5) continue;
            const depth = ch.wLevel[k] - ch.heights[k];
            if (depth <= 0) continue;
            const px = ch.x0 + i * ch.step;
            const pz = ch.z0 + j * ch.step;
            const d2 = (px - x) ** 2 + (pz - z) ** 2;
            if (d2 > r * r) continue;
            const near = 1 / (1 + d2 / 40);
            const speed = Math.hypot(D[o + 1], D[o + 2]);
            if (speed > 0.15) {
              const p = pts[n] || (pts[n] = { x: 0, y: 0, z: 0, w: 0, foam: 0, big: 0 });
              p.x = px;
              p.y = ch.wLevel[k];
              p.z = pz;
              p.w = (0.25 + Math.min(speed, 2) * 0.35 + D[o + 3] * 2) * near;
              p.foam = D[o + 3];
              // how open the sky is over it grows with a channel's breadth
              p.big = Math.max(0, Math.min(1, (D[o + 4] - 0.15) / 0.55));
              n++;
            } else if (D[o + 3] > 0.5) {
              // still water that is white is the sea breaking
              const w = near * D[o + 3];
              surf += w;
              ux += px * w;
              uy += ch.wLevel[k] * w;
              uz += pz * w;
            } else if (depth < 0.35) {
              const w = near;
              still += w;
              sx += px * w;
              sy += ch.wLevel[k] * w;
              sz += pz * w;
            }
          }
        }
      }
    }
    const sources = out.sources || (out.sources = []);
    out.count = 0;
    while (out.count < WATER_SOURCES) {
      let best = null;
      for (let q = 0; q < n; q++) if (pts[q].w > 0 && (!best || pts[q].w > best.w)) best = pts[q];
      if (!best || best.w < 0.02) break;
      const bx = best.x;
      const bz = best.z;
      let W = 0;
      let foam = 0;
      let big = 0;
      let ax = 0;
      let ay = 0;
      let az = 0;
      for (let q = 0; q < n; q++) {
        const p = pts[q];
        if (p.w <= 0 || (p.x - bx) ** 2 + (p.z - bz) ** 2 > SOURCE_SPREAD * SOURCE_SPREAD) continue;
        W += p.w;
        foam += p.foam * p.w;
        big += p.big * p.w;
        ax += p.x * p.w;
        ay += p.y * p.w;
        az += p.z * p.w;
        p.w = 0;
      }
      const src = sources[out.count] || (sources[out.count] = {});
      src.x = ax / W;
      src.y = ay / W;
      src.z = az / W;
      src.loud = 1 - Math.exp(-W * 0.6);
      src.foam = Math.min(1, (foam / W) * 3);
      src.big = big / W;
      out.count++;
    }
    out.still = 1 - Math.exp(-still * 0.5);
    if (still > 0) {
      out.sx = sx / still;
      out.sy = sy / still;
      out.sz = sz / still;
    }
    out.surf = 1 - Math.exp(-surf * 0.12);
    if (surf > 0) {
      out.ux = ux / surf;
      out.uy = uy / surf;
      out.uz = uz / surf;
    }
    return out;
  }

  // (Re)build a chunk's water surface from its current heights: after it
  // streams in, and after digging changes its ground.
  updateWater(ch) {
    const geo = ch.hasWater ? buildWaterGeometry(ch) : null;
    if (!geo) {
      if (ch.water) {
        this.scene.remove(ch.water);
        ch.water.geometry.dispose();
        ch.water = null;
      }
      return;
    }
    if (!ch.water) {
      ch.water = new THREE.Mesh(geo, this.materials.water);
      ch.water.position.set(ch.x0, 0, ch.z0);
      ch.water.receiveShadow = true;
      ch.water.matrixAutoUpdate = false;
      ch.water.updateMatrix();
      this.scene.add(ch.water);
    } else {
      ch.water.geometry.dispose();
      ch.water.geometry = geo;
    }
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
      const tree = FLORA[kind].tree;
      // (only a chunk on a real place can be anything but the forest's colours)
      const tints = this.gen.landformClearance(ch.x0 + this.size / 2, ch.z0 + this.size / 2) < this.size;
      for (let k = 0; k < count; k++) {
        const o = k * VEG_STRIDE;
        const s = list[o + 4];
        const tint = list[o + 5];
        _p.set(list[o] - ch.x0, list[o + 1], list[o + 2] - ch.z0);
        _q.setFromAxisAngle(UP, list[o + 3]);
        if (kind === 'rock') {
          const e = list[o + 6];
          _s.set(s * (0.8 + e * 0.6), s * (0.7 + tint * 0.5), s * (1.3 - e * 0.5));
        } else if (tree) {
          // (a tree's extra is how much slimmer it grows here: chunkGen.js)
          const w = s * (1 - list[o + 6]);
          _s.set(w, s, w);
        } else {
          _s.set(s, s, s);
        }
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(k, _m);
        tintFor(kind, tint, _c);
        // the colour it is in a real place's own country
        const c = tints && this.gen.countryAt(list[o], list[o + 2]);
        if (c && c.tints[kind]) _c.multiply(_t.setRGB(...c.tints[kind]));
        mesh.setColorAt(k, _c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = FLORA[kind].shadow;
      mesh.receiveShadow = true;
      // its shadow has the gaps between its leaves in it
      if (this.materials.vegetationShadow) mesh.customDepthMaterial = this.materials.vegetationShadow;
      mesh.position.set(ch.x0, 0, ch.z0);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      ch.veg.push({ kind, mesh });
      ch.vegMesh[kind] = mesh;
    }
    this.emit('vegetation', ch);
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
      mesh.visible = ch.lod <= FLORA[kind].maxLod;
      if (FLORA[kind].tree) mesh.castShadow = ch.lod <= 1;
    }
  }

  disposeChunk(ch) {
    ch.disposed = true;
    if (ch.terrain) {
      this.scene.remove(ch.terrain);
      ch.terrain.geometry.dispose();
    }
    if (ch.water) {
      this.scene.remove(ch.water);
      ch.water.geometry.dispose();
      ch.water = null;
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
