// The finer heights where the Earth is a range of mountains (MOUNTAIN in
// src/world/earth.js): which cells of the grid have them, and what they are.
//
// A cell is a range's if it's land at least MOUNTAIN.relief m rugged (the
// grid's relief: build.js). The cells next to those are the ring round it,
// where the finer heights come down to the coarse grid's, the further from
// the range the more, so that where the finer heights end the land is
// already the grid's. A finer height is the real one at its point (from the
// elevation tiles, between their pixels), not a mean; and where it's higher
// than the eight round it, a summit, it's the highest of the ground within
// its own minute of arc, so the peak stands as high as it does, not as high
// as the slope a little way down it where the point happens to fall.

import { MOUNTAIN, PER_DEGREE, TILE_CELLS, storedLand } from '../../src/world/earth.js';
import { W, H } from './build.js';

export const SUB = MOUNTAIN.perDegree / PER_DEGREE; // finer heights along a cell's side
// The elevation tiles (web mercator) go no nearer the poles than this.
const MERCATOR = 85;
const RANGE = 2;
const RING = 1;

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrapI = (i) => ((i % W) + W) % W;
const latOfRow = (j) => 90 - (j + 0.5) / PER_DEGREE;

// The grid ({ land, coast, relief }: W × H each, build.js's cells()) →
// Uint8Array(W × H): RANGE for a range's cell, RING for one round it, 0.
export function mountainCells(grid) {
  const out = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    if (Math.abs(latOfRow(j)) > MERCATOR) continue;
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (grid.coast[k] >= 0 && grid.relief[k] >= MOUNTAIN.relief) out[k] = RANGE;
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (out[j * W + i] !== RANGE) continue;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= H || Math.abs(latOfRow(jj)) > MERCATOR) continue;
        for (let di = -1; di <= 1; di++) {
          const kk = jj * W + wrapI(i + di);
          if (!out[kk]) out[kk] = RING;
        }
      }
    }
  }
  return out;
}

// The land's height at (lat, lon) as the game has it from the coarse grid
// alone: between the four cells round it, each as a tile keeps it (earth.js,
// Earth._cell).
function coarseLand(grid, lat, lon) {
  const fi = (lon + 180) * PER_DEGREE - 0.5;
  const fj = Math.max(0, Math.min(H - 1, (90 - lat) * PER_DEGREE - 0.5));
  const i0 = Math.floor(fi);
  const j0 = Math.min(H - 2, Math.floor(fj));
  const tx = fi - i0;
  const ty = fj - j0;
  let v = 0;
  for (let b = 0; b < 2; b++) {
    for (let a = 0; a < 2; a++) {
      const w = (a ? tx : 1 - tx) * (b ? ty : 1 - ty);
      if (w) v += storedLand(grid.land[(j0 + b) * W + wrapI(i0 + a)]) * w;
    }
  }
  return v;
}

// How many finer heights it is from (I, J) (finer heights from the
// north-west of the world) to the nearest range's cell next to cell (i, j).
function toRange(cells, i, j, I, J) {
  let best = Infinity;
  for (let dj = -1; dj <= 1; dj++) {
    const jj = j + dj;
    if (jj < 0 || jj >= H) continue;
    for (let di = -1; di <= 1; di++) {
      if (cells[jj * W + wrapI(i + di)] !== RANGE) continue;
      const x0 = (i + di) * SUB;
      const y0 = jj * SUB;
      const dx = Math.max(0, x0 - I, I - (x0 + SUB - 1));
      const dy = Math.max(0, y0 - J, J - (y0 + SUB - 1));
      best = Math.min(best, Math.max(dx, dy));
    }
  }
  return best;
}

// Where each finer height of a cell is: (cell i, j; s, r its row and column
// in it) → [lat, lon].
export function finerAt(i, j, s, r) {
  const P = MOUNTAIN.perDegree;
  return [90 - (j * SUB + s + 0.5) / P, -180 + (i * SUB + r + 0.5) / P];
}

// Does tile (ti, tj) have any mountains?
export function tileHasMountains(cells, ti, tj) {
  for (let cj = 0; cj < TILE_CELLS; cj++) {
    const row = (tj * TILE_CELLS + cj) * W + ti * TILE_CELLS;
    for (let ci = 0; ci < TILE_CELLS; ci++) if (cells[row + ci]) return true;
  }
  return false;
}

// Tile (ti, tj)'s mountains, as encodeTile wants them: { flags, heights },
// from real(lat, lon) → m, the real height at a point, and highest(lat, lon,
// half) → m, the highest within `half` degrees of it either way.
export function mountainHeights(grid, cells, ti, tj, real, highest) {
  const P = MOUNTAIN.perDegree;
  const summit = (lat, lon, h) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && real(lat + a / P, lon + b / P) > h) return h;
    return Math.max(h, highest(lat, lon, 0.5 / P));
  };
  const flags = new Uint8Array(TILE_CELLS * TILE_CELLS);
  const heights = [];
  for (let cj = 0; cj < TILE_CELLS; cj++) {
    for (let ci = 0; ci < TILE_CELLS; ci++) {
      const i = ti * TILE_CELLS + ci;
      const j = tj * TILE_CELLS + cj;
      const f = cells[j * W + i];
      if (!f) continue;
      flags[cj * TILE_CELLS + ci] = 1;
      for (let s = 0; s < SUB; s++) {
        for (let r = 0; r < SUB; r++) {
          const [lat, lon] = finerAt(i, j, s, r);
          const t = f === RANGE ? 1 : 1 - smoothstep(0, SUB, toRange(cells, i, j, i * SUB + r, j * SUB + s));
          const coarse = coarseLand(grid, lat, lon);
          heights.push(coarse + (Math.max(0, summit(lat, lon, real(lat, lon))) - coarse) * t);
        }
      }
    }
  }
  return { flags, heights: Float32Array.from(heights) };
}
