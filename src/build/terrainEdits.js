// Your changes to the ground: dug out, filled in, cleared of turf.
//
// Edits live on the 1 m vertex grid, the same grid as the finest terrain LOD,
// as a height offset from the natural ground plus a "cleared" amount that
// turns grass into bare earth. They're applied on the main thread on top of
// whatever the chunk workers generate, so the workers never need to know.

import { smoothstep } from '../noise.js';
import { DIG } from './constants.js';

const OFF = 1 << 20;
const K = (ix, iz) => (ix + OFF) * 2097152 + (iz + OFF);

export class TerrainEdits {
  constructor(gen, chunks) {
    this.gen = gen;
    this.chunks = chunks;
    this.map = new Map(); // K -> { x, z, d, c }
    this.dirty = false;
    chunks.onTerrainData = (ch, t) => this.patchFresh(ch, t);
    chunks.heightOffset = (x, z) => this.deltaAt(x, z);
  }

  get(ix, iz) {
    return this.map.get(K(ix, iz));
  }

  delta(ix, iz) {
    const e = this.map.get(K(ix, iz));
    return e ? e.d : 0;
  }

  // Bilinear offset at any point (only used where no chunk is loaded).
  deltaAt(x, z) {
    if (!this.map.size) return 0;
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const u = x - ix;
    const v = z - iz;
    const a = this.delta(ix, iz);
    const b = this.delta(ix + 1, iz);
    const c = this.delta(ix, iz + 1);
    const d = this.delta(ix + 1, iz + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  // Current height of a grid vertex, edits included.
  vertexHeight(ix, iz) {
    const ch = this.chunks.chunkAt(ix + 0.01, iz + 0.01);
    if (ch && ch.heights && ch.step === 1) {
      const i = ix - ch.x0;
      const j = iz - ch.z0;
      return ch.heights[j * (ch.n + 1) + i];
    }
    return this.gen.height(ix, iz) + this.delta(ix, iz);
  }

  // ── Applying to chunks ────────────────────────────────────────────────────
  // A chunk just arrived from a worker: fold the edits into its buffers.
  patchFresh(ch, t) {
    if (!this.map.size) return;
    const size = this.chunks.size;
    const x0 = ch.cx * size;
    const z0 = ch.cz * size;
    const step = t.step;
    const N = t.n + 1;
    const touched = [];
    for (const e of this.map.values()) {
      const i = (e.x - x0) / step;
      const j = (e.z - z0) / step;
      if (i < 0 || j < 0 || i > t.n || j > t.n || i % 1 || j % 1) continue;
      const k = j * N + i;
      t.heights[k] += e.d;
      t.pos[k * 3 + 1] += e.d;
      if (e.c > t.gnd[k * 2]) {
        t.gnd[k * 2] = e.c;
        t.paths[k] = e.c;
      }
      touched.push(i, j);
    }
    if (touched.length) this._fixup(t.heights, t.pos, t.nor, t.gnd, t.n, step, x0, z0, touched, null);
  }

  // Live edit: apply height increments to loaded chunks right away.
  // changes: [{ ix, iz, dd, c }]
  applyLive(changes) {
    const size = this.chunks.size;
    const perChunk = new Map();
    for (const ch of this.chunks.chunks.values()) {
      if (!ch.heights || !ch.pos) continue;
      for (const e of changes) {
        if (e.ix < ch.x0 || e.ix > ch.x0 + size || e.iz < ch.z0 || e.iz > ch.z0 + size) continue;
        const i = (e.ix - ch.x0) / ch.step;
        const j = (e.iz - ch.z0) / ch.step;
        if (i % 1 || j % 1) continue;
        const N = ch.n + 1;
        const k = j * N + i;
        ch.heights[k] += e.dd;
        ch.pos[k * 3 + 1] += e.dd;
        if (e.c > ch.gnd[k * 2]) {
          ch.gnd[k * 2] = e.c;
          ch.paths[k] = e.c;
        }
        let list = perChunk.get(ch);
        if (!list) perChunk.set(ch, (list = []));
        list.push(i, j);
      }
    }
    for (const [ch, touched] of perChunk) {
      this._fixup(ch.heights, ch.pos, ch.nor, ch.gnd, ch.n, ch.step, ch.x0, ch.z0, touched, ch);
    }
  }

  // Recompute normals around touched vertices and drag the skirts along.
  _fixup(H, pos, nor, gnd, n, step, x0, z0, touched, ch) {
    const N = n + 1;
    const skirt = step * 1.5 + 1.0;
    const h = (i, j) => {
      if (i >= 0 && j >= 0 && i <= n && j <= n) return H[j * N + i];
      const x = x0 + i * step;
      const z = z0 + j * step;
      return this.gen.height(x, z) + this.delta(x, z);
    };
    const seen = new Set();
    for (let t = 0; t < touched.length; t += 2) {
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = touched[t] + di;
          const j = touched[t + 1] + dj;
          if (i < 0 || j < 0 || i > n || j > n) continue;
          const k = j * N + i;
          if (seen.has(k)) continue;
          seen.add(k);
          const nx = h(i - 1, j) - h(i + 1, j);
          const ny = 2 * step;
          const nz = h(i, j - 1) - h(i, j + 1);
          const l = Math.hypot(nx, ny, nz);
          nor[k * 3] = nx / l;
          nor[k * 3 + 1] = ny / l;
          nor[k * 3 + 2] = nz / l;
          // skirts: edge rows/columns have a copy hanging below
          const sk = [];
          if (j === 0) sk.push(N * N + i);
          if (j === n) sk.push(N * N + N + i);
          if (i === 0) sk.push(N * N + 2 * N + j);
          if (i === n) sk.push(N * N + 3 * N + j);
          for (const s of sk) {
            pos[s * 3 + 1] = H[k] - skirt;
            nor[s * 3] = nor[k * 3];
            nor[s * 3 + 1] = nor[k * 3 + 1];
            nor[s * 3 + 2] = nor[k * 3 + 2];
            gnd[s * 2] = gnd[k * 2];
          }
        }
      }
    }
    if (ch && ch.terrain) {
      const g = ch.terrain.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.normal.needsUpdate = true;
      g.attributes.aGround.needsUpdate = true;
    }
  }

  // ── Shovel work ───────────────────────────────────────────────────────────
  // One frame of digging ('dig') or filling ('fill') under a round brush.
  // With a grade (datum) set, cuts stop at it and fills rise only to it.
  // blocked(ix, iz) says a vertex can't be touched (roots, stumps, footings).
  // Returns { soil: m³ dug (+) or used (−), moved: bool }.
  stroke({ x, z, mode, dt, datum = null, soil = Infinity, blocked = null, radius = DIG.radius }) {
    const r = radius;
    const want = [];
    let fillNeed = 0;
    for (let iz = Math.ceil(z - r); iz <= Math.floor(z + r); iz++) {
      for (let ix = Math.ceil(x - r); ix <= Math.floor(x + r); ix++) {
        const d = Math.hypot(ix - x, iz - z);
        if (d > r) continue;
        if (blocked && blocked(ix, iz)) continue;
        const w = 1 - smoothstep(r * 0.35, r, d);
        const h = this.vertexHeight(ix, iz);
        const amount = DIG.rate * dt * w;
        const old = this.delta(ix, iz);
        let target;
        if (mode === 'dig') {
          if (datum !== null && h <= datum + 0.002) {
            want.push({ ix, iz, dd: 0, w });
            continue;
          }
          target = h - amount;
          if (datum !== null) target = Math.max(target, datum);
        } else {
          if (datum !== null && h >= datum - 0.002) {
            want.push({ ix, iz, dd: 0, w });
            continue;
          }
          target = h + amount;
          if (datum !== null) target = Math.min(target, datum);
        }
        const nd = Math.max(-DIG.maxCut, Math.min(DIG.maxCut, old + (target - h)));
        const dd = nd - old;
        if (mode === 'fill') fillNeed += Math.max(0, dd);
        want.push({ ix, iz, dd, w });
      }
    }
    const scale = mode === 'fill' && fillNeed > soil ? soil / fillNeed : 1;
    let soilDelta = 0;
    const changes = [];
    for (const wv of want) {
      const dd = wv.dd * scale;
      const key = K(wv.ix, wv.iz);
      let e = this.map.get(key);
      const clear = wv.w > 0.2 ? 1 : 0;
      if (!e) {
        if (Math.abs(dd) < 1e-5 && !clear) continue;
        e = { x: wv.ix, z: wv.iz, d: 0, c: 0 };
        this.map.set(key, e);
      }
      const c = Math.max(e.c, clear);
      if (Math.abs(dd) < 1e-5 && c === e.c) continue;
      e.d += dd;
      e.c = c;
      soilDelta -= dd;
      changes.push({ ix: wv.ix, iz: wv.iz, dd, c });
    }
    if (changes.length) {
      this.applyLive(changes);
      this.dirty = true;
    }
    return { soil: soilDelta, moved: changes.some((c) => Math.abs(c.dd) > 1e-5) };
  }

  // Strip the turf (no height change) in a disc: footings, grubbed stumps.
  clear(x, z, r, sink = 0) {
    const changes = [];
    for (let iz = Math.ceil(z - r); iz <= Math.floor(z + r); iz++) {
      for (let ix = Math.ceil(x - r); ix <= Math.floor(x + r); ix++) {
        const d = Math.hypot(ix - x, iz - z);
        if (d > r) continue;
        const key = K(ix, iz);
        let e = this.map.get(key);
        if (!e) this.map.set(key, (e = { x: ix, z: iz, d: 0, c: 0 }));
        const dd = sink * (1 - d / (r + 1e-6));
        e.d += dd;
        e.c = 1;
        changes.push({ ix, iz, dd, c: 1 });
      }
    }
    if (changes.length) {
      this.applyLive(changes);
      this.dirty = true;
    }
  }

  // Take someone else's version of one vertex. Returns the step the loaded
  // chunks have to take to match it, for applyLive. d = null means the vertex
  // went back to how the ground was grown.
  adopt(ix, iz, d, c) {
    const key = K(ix, iz);
    const e = this.map.get(key);
    const to = d === null ? 0 : d;
    const dd = to - (e ? e.d : 0);
    if (d === null) this.map.delete(key);
    else if (e) {
      e.d = d;
      e.c = c;
    } else this.map.set(key, { x: ix, z: iz, d, c });
    return { ix, iz, dd, c: c || 0 };
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  serialize() {
    const out = [];
    for (const e of this.map.values()) out.push(e.x, e.z, Math.round(e.d * 1000) / 1000, e.c);
    return out;
  }

  load(arr) {
    this.map.clear();
    if (!Array.isArray(arr)) return;
    for (let i = 0; i + 3 < arr.length; i += 4) {
      const e = { x: arr[i], z: arr[i + 1], d: arr[i + 2], c: arr[i + 3] };
      this.map.set(K(e.x, e.z), e);
    }
  }
}
