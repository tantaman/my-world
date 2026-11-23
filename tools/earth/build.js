// What the Earth is like, everywhere, at five minutes of arc (about 9 km): the
// grids `npm run earth` (tools/earth.mjs) writes to src/world/earth/, worked
// out from a global elevation mosaic and a climate map. Pure: hand it the
// heights and the text.
//
// For each cell of the grid (W × H, from the north-west, cell (i, j) centred
// on lon -180 + (i + ½)/12, lat 90 - (j + ½)/12):
//
//   land     m, the mean height of the land in it. Where it has none, the
//            nearest land's, so that the land rises from the shore as high as
//            the land behind it does (and 0 far out at sea)
//   sea      m (≤ 0), the mean depth of the sea in it; where it has none, the
//            nearest sea's (and 0 far inland). Out of sight of land (past
//            OPEN_SEA km) it is smoothed over the cells round it: nobody
//            sees the bed of the open ocean, and smooth it packs down small
//   coast    km, how far it is from the coast: positive on land, negative at
//            sea. A cell part land and part sea has the coast through it, a
//            little to the sea side of its middle if it's mostly land, so the
//            shore lies between cells where it really does
//   relief   m, how rugged the land round it is: the spread of the heights in
//            it and the cells next to it (a plain a few metres, a range of
//            mountains several hundred)
//
// The sea is what is at or below sea level and joined to the ocean (or is as
// big as the Black Sea): a dry hollow below sea level (the Dead Sea, Death
// Valley) is land, and so, for now, are the deep parts of big lakes, which the
// heights have the beds of.

import { terrarium } from '../hike/geo.js';

export const PER_DEGREE = 12; // cells per degree
export const W = 360 * PER_DEGREE;
export const H = 180 * PER_DEGREE;
// km between the rows of cells (5' of latitude)
export const ROW_KM = 9.266;
// How far (km) the coast is worked out from it, either way: further than that
// it's just inland, or out at sea.
export const COAST_FAR = 63;
// A hollow at or under sea level is sea if it's at least this many pixels of
// the mosaic, whether or not it joins the ocean (the Black Sea, the Caspian).
const SEA_SIZE = 8000;
// km off the coast past which the seabed is smoothed, and over how many cells
// either way.
const OPEN_SEA = 30;
const OPEN_SMOOTH = 3;
// Web mercator goes up to this latitude; the cells nearer the poles take the
// nearest row it reaches.
const MERCATOR_MAX = 85.0511;

const D = Math.PI / 180;

// The mosaic of 256 px elevation tiles at zoom z: tile(tx, ty) → the decoded
// PNG ({ data, channels }) → { size, elev: Int16Array (m, rounded) }.
export function mosaic(z, tile) {
  const n = 2 ** z;
  const size = n * 256;
  const elev = new Int16Array(size * size);
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const img = tile(tx, ty);
      const c = img.channels;
      for (let y = 0; y < 256; y++) {
        const row = (ty * 256 + y) * size + tx * 256;
        for (let x = 0; x < 256; x++) {
          const o = (y * 256 + x) * c;
          elev[row + x] = Math.max(-32768, Math.min(32767, Math.round(terrarium(img.data[o], img.data[o + 1], img.data[o + 2]))));
        }
      }
    }
  }
  return { size, elev };
}

// Which pixels of the mosaic are the sea (1) rather than land (0): those at
// or under sea level that join the biggest body of them (the ocean, which
// wraps round east to west), or another as big as SEA_SIZE.
export function seaMask({ size, elev }) {
  const sea = new Uint8Array(size * size);
  const seen = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  const bodies = [];
  for (let p = 0; p < size * size; p++) {
    if (seen[p] || elev[p] > 0) continue;
    // everything joined to it, by the four next to each
    let head = 0;
    let tail = 0;
    queue[tail++] = p;
    seen[p] = 1;
    while (head < tail) {
      const q = queue[head++];
      const x = q % size;
      const y = (q - x) / size;
      const near = [y * size + ((x + 1) % size), y * size + ((x + size - 1) % size), y > 0 ? q - size : -1, y < size - 1 ? q + size : -1];
      for (const r of near) {
        if (r < 0 || seen[r] || elev[r] > 0) continue;
        seen[r] = 1;
        queue[tail++] = r;
      }
    }
    bodies.push({ start: p, count: tail });
  }
  const biggest = bodies.reduce((a, b) => (b.count > a.count ? b : a), { count: 0 });
  // walk each body that counts again, marking it
  seen.fill(0);
  for (const b of bodies) {
    if (b !== biggest && b.count < SEA_SIZE) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = b.start;
    seen[b.start] = 1;
    while (head < tail) {
      const q = queue[head++];
      sea[q] = 1;
      const x = q % size;
      const y = (q - x) / size;
      const near = [y * size + ((x + 1) % size), y * size + ((x + size - 1) % size), y > 0 ? q - size : -1, y < size - 1 ? q + size : -1];
      for (const r of near) {
        if (r < 0 || seen[r] || elev[r] > 0) continue;
        seen[r] = 1;
        queue[tail++] = r;
      }
    }
  }
  return sea;
}

// The latitude of the middle of mosaic row y (of size).
const rowLat = (y, size) => Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / size))) / D;

// Every pixel of the mosaic into the cell it falls in → the grids above.
export function cells({ size, elev }, sea) {
  const N = W * H;
  const landSum = new Float64Array(N);
  const landSq = new Float64Array(N);
  const landN = new Float64Array(N);
  const seaSum = new Float64Array(N);
  const seaN = new Float64Array(N);
  for (let y = 0; y < size; y++) {
    const lat = rowLat(y, size);
    const j = Math.min(H - 1, Math.floor((90 - lat) * PER_DEGREE));
    for (let x = 0; x < size; x++) {
      const i = Math.min(W - 1, Math.floor(((x + 0.5) / size) * W));
      const k = j * W + i;
      const p = y * size + x;
      const e = elev[p];
      if (sea[p]) {
        seaSum[k] += e;
        seaN[k]++;
      } else {
        landSum[k] += e;
        landSq[k] += e * e;
        landN[k]++;
      }
    }
  }
  // the rows nearer the poles than the mosaic reaches take the nearest it does
  const top = Math.ceil((90 - MERCATOR_MAX) * PER_DEGREE);
  const bottom = H - 1 - top;
  for (const [from, to, src] of [
    [0, top - 1, top],
    [bottom + 1, H - 1, bottom],
  ]) {
    for (let j = from; j <= to; j++) {
      for (let i = 0; i < W; i++) {
        const a = j * W + i;
        const b = src * W + i;
        landSum[a] = landSum[b];
        landSq[a] = landSq[b];
        landN[a] = landN[b];
        seaSum[a] = seaSum[b];
        seaN[a] = seaN[b];
      }
    }
  }

  const frac = new Float32Array(N);
  const land = new Float32Array(N);
  const seaD = new Float32Array(N);
  const hasLand = new Uint8Array(N);
  const hasSea = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const n = landN[k] + seaN[k];
    frac[k] = n ? landN[k] / n : 0;
    if (landN[k]) {
      land[k] = Math.max(1, landSum[k] / landN[k]);
      hasLand[k] = 1;
    }
    if (seaN[k]) {
      seaD[k] = Math.min(-1, seaSum[k] / seaN[k]);
      hasSea[k] = 1;
    }
  }
  // how rugged: the spread of the land's heights over the cell and the eight
  // round it
  const relief = new Float32Array(N);
  const hasRelief = new Uint8Array(N);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let s = 0;
      let q = 0;
      let n = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= H) continue;
        for (let di = -1; di <= 1; di++) {
          const k = jj * W + ((i + di + W) % W);
          s += landSum[k];
          q += landSq[k];
          n += landN[k];
        }
      }
      if (n < 2) continue;
      const m = s / n;
      relief[j * W + i] = Math.sqrt(Math.max(0, q / n - m * m));
      hasRelief[j * W + i] = 1;
    }
  }
  // (and evened out over those cells again: it says what kind of land it is,
  // which doesn't change from one cell to the next)
  const even = relief.slice();
  for (let j = 1; j < H - 1; j++) {
    for (let i = 0; i < W; i++) {
      if (!hasRelief[j * W + i]) continue;
      let s = 0;
      let n = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const k = (j + dj) * W + ((i + di + W) % W);
          if (!hasRelief[k]) continue;
          s += relief[k];
          n++;
        }
      }
      even[j * W + i] = s / n;
    }
  }
  relief.set(even);
  const coast = coastDistance(frac);
  return {
    frac,
    coast,
    land: nearest(land, hasLand, 0),
    sea: openSea(nearest(seaD, hasSea, 0), coast),
    relief: nearest(relief, hasRelief, 0),
  };
}

// The seabed smoothed where it's far out at sea (see `sea`, above).
function openSea(sea, coast) {
  const out = sea.slice();
  const R = OPEN_SMOOTH;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const t = Math.min(1, (-coast[k] - OPEN_SEA) / OPEN_SEA);
      if (t <= 0) continue;
      let s = 0;
      let n = 0;
      for (let dj = -R; dj <= R; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= H) continue;
        for (let di = -R; di <= R; di++) {
          s += sea[jj * W + ((i + di + W) % W)];
          n++;
        }
      }
      out[k] = sea[k] + (s / n - sea[k]) * t;
    }
  }
  return out;
}

// km across a cell at row j (east to west), and corner to corner.
const colKm = (j) => ROW_KM * Math.cos((90 - (j + 0.5) / PER_DEGREE) * D);

// Two passes of a chamfer over the grid, each cell taking the best of its
// neighbours already visited plus the step to it (a cell's width shrinks
// toward the poles), and the grid wrapping east to west: twice over, so
// what comes round the back of the world is taken in. visit(k, from, step)
// is handed each cell, a neighbour of it and how far that is.
function chamfer(visit) {
  for (let round = 0; round < 2; round++) {
    for (let j = 0; j < H; j++) {
      const dx = colKm(j);
      const dd = Math.hypot(dx, ROW_KM);
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        visit(k, j * W + ((i + W - 1) % W), dx);
        if (j > 0) {
          visit(k, (j - 1) * W + i, ROW_KM);
          visit(k, (j - 1) * W + ((i + W - 1) % W), dd);
          visit(k, (j - 1) * W + ((i + 1) % W), dd);
        }
      }
    }
    for (let j = H - 1; j >= 0; j--) {
      const dx = colKm(j);
      const dd = Math.hypot(dx, ROW_KM);
      for (let i = W - 1; i >= 0; i--) {
        const k = j * W + i;
        visit(k, j * W + ((i + 1) % W), dx);
        if (j < H - 1) {
          visit(k, (j + 1) * W + i, ROW_KM);
          visit(k, (j + 1) * W + ((i + 1) % W), dd);
          visit(k, (j + 1) * W + ((i + W - 1) % W), dd);
        }
      }
    }
  }
}

// values where has[k], and everywhere else the value of the nearest cell that
// has one (or `none` if there's none within COAST_FAR·4 km).
export function nearest(values, has, none) {
  const N = W * H;
  const out = new Float32Array(N);
  const dist = new Float32Array(N).fill(Infinity);
  for (let k = 0; k < N; k++) {
    if (!has[k]) continue;
    out[k] = values[k];
    dist[k] = 0;
  }
  chamfer((k, from, step) => {
    const d = dist[from] + step;
    if (d < dist[k]) {
      dist[k] = d;
      out[k] = out[from];
    }
  });
  for (let k = 0; k < N; k++) if (dist[k] > COAST_FAR * 4) out[k] = none;
  return out;
}

// The signed distance (km) to the coast from each cell's middle, from how
// much of each cell is land (frac): see `coast` above.
export function coastDistance(frac) {
  const N = W * H;
  const toSea = new Float32Array(N).fill(Infinity);
  const toLand = new Float32Array(N).fill(Infinity);
  for (let k = 0; k < N; k++) (frac[k] >= 0.5 ? toLand : toSea)[k] = 0;
  chamfer((k, from, step) => {
    if (toSea[from] + step < toSea[k]) toSea[k] = toSea[from] + step;
    if (toLand[from] + step < toLand[k]) toLand[k] = toLand[from] + step;
  });
  const out = new Float32Array(N);
  for (let j = 0; j < H; j++) {
    const half = 0.5 * Math.sqrt(colKm(j) * ROW_KM);
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const f = frac[k];
      // half a cell short of the nearest cell of the other kind; and in a
      // cell that is part of each, by how much of it is which
      let d = f >= 0.5 ? toSea[k] - half : -(toLand[k] - half);
      if (f > 0 && f < 1) d = (f - 0.5) * 2 * half;
      out[k] = Math.max(-COAST_FAR, Math.min(COAST_FAR, d));
    }
  }
  return out;
}

// ── Climate ──────────────────────────────────────────────────────────────────
// The Köppen-Geiger map (Kottek et al. 2006, half a degree): a line for each
// cell on land, "lat lon class". → { names: ['', 'Af', ...], grid: Uint8Array
// (720 × 360 from the north-west, 0 where it says nothing) }, filled out
// across the shore and a few cells out to sea, so that a coast or an island
// too small for the map has the climate of the land nearest it.
export const CLIMATE_W = 720;
export const CLIMATE_H = 360;
const CLIMATE_REACH = 6; // cells it is filled out by

export function parseKoppen(text) {
  const names = [''];
  const index = new Map();
  const grid = new Uint8Array(CLIMATE_W * CLIMATE_H);
  for (const line of text.split('\n')) {
    const [a, b, cls] = line.trim().split(/\s+/);
    const lat = Number(a);
    const lon = Number(b);
    if (!cls || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!index.has(cls)) {
      index.set(cls, names.length);
      names.push(cls);
    }
    const i = Math.floor((lon + 180) * 2);
    const j = Math.floor((90 - lat) * 2);
    if (i >= 0 && i < CLIMATE_W && j >= 0 && j < CLIMATE_H) grid[j * CLIMATE_W + i] = index.get(cls);
  }
  // out over the water, a ring at a time
  for (let r = 0; r < CLIMATE_REACH; r++) {
    const next = grid.slice();
    for (let j = 0; j < CLIMATE_H; j++) {
      for (let i = 0; i < CLIMATE_W; i++) {
        if (grid[j * CLIMATE_W + i]) continue;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const jj = j + dj;
          if (jj < 0 || jj >= CLIMATE_H) continue;
          const v = grid[jj * CLIMATE_W + ((i + di + CLIMATE_W) % CLIMATE_W)];
          if (v) {
            next[j * CLIMATE_W + i] = v;
            break;
          }
        }
      }
    }
    grid.set(next);
  }
  return { names, grid };
}
