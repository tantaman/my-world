// Pure chunk generation (no three.js) so it can run inside Web Workers.
// Produces raw typed arrays: terrain geometry buffers + ground grids, and
// deterministic vegetation placement lists.
//
// Water comes out as two grids over the terrain vertices:
//   wLevel  the water surface height (NO_WATER where there's none nearby)
//   wData   WATER_STRIDE per vertex: region (1 where water may stand),
//           current x, z (m/s), foam (0..1) and how open the sky above it is
//           (0..1: a stream in the woods is roofed by leaves, a lake isn't)
// The water surface itself is meshed on the main thread from these and the
// heights (waterSurface.js), so it can follow the digging.

import { mulberry32, hash2i, smoothstep } from '../noise.js';

export const WATER_STRIDE = 5;

// ── Terrain ────────────────────────────────────────────────────────────────
export function generateTerrain(gen, cx, cz, step, size) {
  const n = Math.round(size / step);
  const N = n + 1;
  const G = N + 2;
  const x0 = cx * size;
  const z0 = cz * size;

  const Hb = new Float32Array(G * G);
  const paths = new Float32Array(N * N);
  const forest = new Float32Array(N * N);
  const wLevel = new Float32Array(N * N);
  const wData = new Float32Array(N * N * WATER_STRIDE);
  const water = gen.water;
  for (let gz = 0; gz < G; gz++) {
    for (let gx = 0; gx < G; gx++) {
      const x = x0 + (gx - 1) * step;
      const z = z0 + (gz - 1) * step;
      const pm = gen.pathMask(x, z);
      Hb[gz * G + gx] = gen.height(x, z, pm);
      if (gx >= 1 && gx <= N && gz >= 1 && gz <= N) {
        const k = (gz - 1) * N + (gx - 1);
        paths[k] = pm;
        forest[k] = gen.forest(x, z);
        wLevel[k] = water.level;
        const o = k * WATER_STRIDE;
        wData[o] = water.region;
        wData[o + 1] = water.flowX;
        wData[o + 2] = water.flowZ;
        wData[o + 3] = water.foam;
        wData[o + 4] = water.open;
      }
    }
  }

  const skirt = step * 1.5 + 1.0;
  const vCount = N * N + 4 * N;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const gnd = new Float32Array(vCount * 2);
  const wat = new Float32Array(vCount * 2); // per vertex: water level, region
  const heights = new Float32Array(N * N);

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const gi = (j + 1) * G + (i + 1);
      const h = Hb[gi];
      heights[k] = h;
      pos[k * 3] = i * step;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = j * step;
      const nx = Hb[gi - 1] - Hb[gi + 1];
      const ny = 2 * step;
      const nz = Hb[gi - G] - Hb[gi + G];
      const l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l;
      nor[k * 3 + 1] = ny / l;
      nor[k * 3 + 2] = nz / l;
      gnd[k * 2] = paths[k];
      gnd[k * 2 + 1] = forest[k];
      wat[k * 2] = wLevel[k];
      wat[k * 2 + 1] = wData[k * WATER_STRIDE];
    }
  }

  const triCount = n * n * 2 + 4 * n * 4;
  const idx = vCount > 65535 ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  let w = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * N + i;
      const b = a + 1;
      const c = a + N;
      const d = c + 1;
      idx[w++] = a;
      idx[w++] = c;
      idx[w++] = b;
      idx[w++] = b;
      idx[w++] = c;
      idx[w++] = d;
    }
  }

  // Skirts hide cracks between neighbouring chunks of different LOD.
  // Both windings are emitted so they show from either side.
  let v = N * N;
  const edges = [(t) => t, (t) => n * N + t, (t) => t * N, (t) => t * N + n];
  for (const e of edges) {
    const start = v;
    for (let t = 0; t < N; t++) {
      const src = e(t);
      pos[v * 3] = pos[src * 3];
      pos[v * 3 + 1] = pos[src * 3 + 1] - skirt;
      pos[v * 3 + 2] = pos[src * 3 + 2];
      nor[v * 3] = nor[src * 3];
      nor[v * 3 + 1] = nor[src * 3 + 1];
      nor[v * 3 + 2] = nor[src * 3 + 2];
      gnd[v * 2] = gnd[src * 2];
      gnd[v * 2 + 1] = gnd[src * 2 + 1];
      wat[v * 2] = wat[src * 2];
      wat[v * 2 + 1] = wat[src * 2 + 1];
      v++;
    }
    for (let t = 0; t < n; t++) {
      const a = e(t);
      const b = e(t + 1);
      const c = start + t;
      const d = start + t + 1;
      idx[w++] = a;
      idx[w++] = c;
      idx[w++] = b;
      idx[w++] = b;
      idx[w++] = c;
      idx[w++] = d;
      idx[w++] = a;
      idx[w++] = b;
      idx[w++] = c;
      idx[w++] = b;
      idx[w++] = d;
      idx[w++] = c;
    }
  }

  return { n, step, pos, nor, gnd, wat, idx, heights, paths, forest, wLevel, wData };
}

// ── Vegetation ─────────────────────────────────────────────────────────────
// Lists are packed as [x, y, z, yaw, scale, tint, extra] per instance.
//
// Plants are known by where they stand (felling one saves its position), so
// every candidate draws its random numbers whether or not it's planted: a
// stream through one corner of a chunk mustn't move every tree after it.
export const VEG_STRIDE = 7;
export const VEG_KINDS = ['pine', 'broad', 'birch', 'bush', 'fern', 'rock', 'log'];

export function generateVegetation(gen, cx, cz, size, trunkRadius) {
  const x0 = cx * size;
  const z0 = cz * size;
  const rng = mulberry32(hash2i(cx, cz, gen.seed));
  const lists = {};
  for (const k of VEG_KINDS) lists[k] = [];
  const colliders = [];

  const water = gen.water;
  // The ground at (x, z), and whether it's at least `clear` m from water.
  let y = 0;
  const dry = (x, z, clear) => {
    y = gen.height(x, z);
    return water.edge >= clear;
  };
  const put = (kind, x, z, yOff, yaw, s, tint, extra = 0) => {
    lists[kind].push(x, y + yOff, z, yaw, s, tint, extra);
  };

  // Trees on a jittered grid
  const cell = 4.2;
  const cells = Math.floor(size / cell);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = x0 + (i + rng()) * cell;
      const z = z0 + (j + rng()) * cell;
      const r1 = rng();
      const r2 = rng();
      const r3 = rng();
      const r4 = rng();
      const r5 = rng();
      const r6 = rng();
      const f = gen.forest(x, z);
      if (r1 > f * 0.8 + 0.02) continue;
      gen.pathMask(x, z);
      if (gen.pathEdge < 1.3 + r5 * 1.8) continue;
      if (gen.padClearance(x, z) < 2.5) continue;

      const sp = gen.species(x, z);
      const pineW = smoothstep(-0.3, 0.3, sp);
      const birchW = Math.max(0, 1 - Math.abs(f - 0.4) * 2.4) * 0.5 + (1 - pineW) * 0.06;
      let kind;
      if (r2 < birchW) kind = 'birch';
      else kind = r3 < pineW ? 'pine' : 'broad';
      const s = kind === 'pine' ? 0.68 + r4 * 0.62 : kind === 'broad' ? 0.75 + r4 * 0.5 : 0.75 + r4 * 0.45;
      const tint = rng();
      if (!dry(x, z, 1.4 + r5 * 1.6)) continue;
      put(kind, x, z, -0.1, r6 * Math.PI * 2, s, tint);
      colliders.push(x, z, trunkRadius[kind] * s + 0.08);
    }
  }

  // Understory: ferns where it's damp and shaded, bushes along edges
  const uc = 2.7;
  const ucells = Math.floor(size / uc);
  for (let j = 0; j < ucells; j++) {
    for (let i = 0; i < ucells; i++) {
      const x = x0 + (i + rng()) * uc;
      const z = z0 + (j + rng()) * uc;
      const r1 = rng();
      const r2 = rng();
      const r3 = rng();
      const r4 = rng();
      const f = gen.forest(x, z);
      const m = gen.moisture(x, z);
      const fernP = f * smoothstep(0.35, 0.75, m) * 0.55;
      const bushP = (0.06 + Math.max(0, 1 - Math.abs(f - 0.45) * 2.5) * 0.22) * (0.5 + f * 0.5);
      if (r1 > fernP + bushP) continue;
      gen.pathMask(x, z);
      if (gen.pathEdge < 0.35 + r4) continue;
      if (gen.padClearance(x, z) < 1) continue;
      const tint = rng();
      // ferns like it damp, right down to the bank
      if (!dry(x, z, r1 < fernP ? 0.45 : 0.9 + r4 * 0.5)) continue;
      if (r1 < fernP) put('fern', x, z, -0.05, r2 * Math.PI * 2, 0.8 + r3 * 0.7, tint);
      else put('bush', x, z, -0.15, r2 * Math.PI * 2, 0.7 + r3 * 0.9, tint);
    }
  }

  // Rocks: mostly small, the odd boulder
  const rc = 10;
  const rcells = Math.floor(size / rc);
  for (let j = 0; j < rcells; j++) {
    for (let i = 0; i < rcells; i++) {
      const x = x0 + (i + rng()) * rc;
      const z = z0 + (j + rng()) * rc;
      const r1 = rng();
      const r2 = rng();
      const r3 = rng();
      const r4 = rng();
      if (r1 > 0.26) continue;
      const s = 0.3 + r2 * r2 * r2 * 2.6;
      gen.pathMask(x, z);
      if (gen.pathEdge < s * 1.1 + 0.2) continue;
      if (gen.padClearance(x, z) < s + 1) continue;
      const tint = rng();
      // Boulders are welcome in streams and rivers (the water runs round
      // them) and along any shore, but not lost in the depths of a lake.
      dry(x, z, 0);
      const still = water.kind === 'lake' || water.kind === 'pond';
      if (water.edge < 0 && water.region && (still ? water.edge < -1.5 : water.level - y > s * 0.9)) continue;
      put('rock', x, z, -0.28 * s, r3 * Math.PI * 2, s, tint, r4);
      if (s > 0.55) colliders.push(x, z, s * 0.85);
    }
  }

  // Fallen logs in the deep woods
  const lc = 16;
  const lcells = Math.floor(size / lc);
  for (let j = 0; j < lcells; j++) {
    for (let i = 0; i < lcells; i++) {
      const x = x0 + (i + rng()) * lc;
      const z = z0 + (j + rng()) * lc;
      const r1 = rng();
      const r2 = rng();
      const r3 = rng();
      const f = gen.forest(x, z);
      if (r1 > f * 0.22) continue;
      gen.pathMask(x, z);
      if (gen.pathEdge < 3) continue;
      if (gen.padClearance(x, z) < 4) continue;
      const tint = rng();
      if (!dry(x, z, 3)) continue;
      put('log', x, z, -0.12, r2 * Math.PI * 2, 0.8 + r3 * 0.5, tint);
    }
  }

  const out = {};
  for (const k of VEG_KINDS) out[k] = new Float32Array(lists[k]);
  return { lists: out, colliders: new Float32Array(colliders) };
}
