// A cave as somewhere to be: for every column of its grid, the floor and the
// roof, the land over it, how much daylight gets there, and how far it is
// from the walls. Worked out from the same field the rock is drawn from
// (shape.js), so what you stand on is what you see.
//
// CaveSpace answers what world/spaces.js asks of a space: are you in it, and
// where are its floor, roof and walls. The terrain still holds everywhere
// else, including the hill on top of the cave.
//
// The rock's field itself (shape.js's CaveGrid) is kept too, for the camera,
// which has to know exactly where the walls are and not just roughly.
//
// There are two kinds of column in a cave. Under its roof, the cave is a
// room you are in or not, depending on whether you are below the roof or
// up on the hill above it. In the cutting at its mouth, where the hillside is
// opened up for the way in (world/cuts.js), there is no ground but the
// cave's floor, so anyone there is in the cave, unless they're flying high
// over it.

import { RES } from './shape.js';

export const WALK = {
  clear: 1.65, // m of headroom to walk through
  slope: 1.3, // steepest floor you can walk up (rise per metre): walls are far steeper
  walls: 0.9, // m: a cutting shallower than this is stepped out of, not walled in
  cut: 0.05, // m: land this far under the roof is cut away
  over: 3, // m over the land in the cutting that still counts as in it (higher, you're flying over)
};

// The columns of a cave from its sampled field.
//   terrain(x, z)  the height of the land, as the finest terrain mesh has it
//   light(d)       how much daylight gets d metres along the passages
export function columnsOf(grid, terrain, light) {
  const { nx, nz, f } = grid;
  const n = nx * nz;
  const F = new Float32Array(n).fill(NaN);
  const C = new Float32Array(n).fill(NaN);
  const T = new Float32Array(n).fill(NaN);
  const S = new Float32Array(n).fill(NaN);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      const jn = grid.jn[c];
      if (!jn) continue;
      const s0 = grid.start[c];
      const y0 = grid.y0 + grid.j0[c] * RES;
      T[c] = terrain(grid.x0 + i * RES, grid.z0 + k * RES);
      // the tallest stretch of air in the column
      let best = 0;
      let lo = NaN;
      for (let j = 0; j < jn - 1; j++) {
        if (!(f[s0 + j] > 0 && f[s0 + j + 1] <= 0)) continue;
        const a = y0 + (j + f[s0 + j] / (f[s0 + j] - f[s0 + j + 1])) * RES;
        let top = NaN;
        for (let q = j + 1; q < jn - 1; q++) {
          if (f[s0 + q] <= 0 && f[s0 + q + 1] > 0) {
            top = y0 + (q + f[s0 + q] / (f[s0 + q] - f[s0 + q + 1])) * RES;
            break;
          }
        }
        if (Number.isFinite(top) && top - a > best) {
          best = top - a;
          lo = a;
        }
      }
      if (!Number.isFinite(lo)) continue;
      F[c] = lo;
      C[c] = lo + best;
      // daylight a little above the floor
      const j = Math.min(jn - 1, Math.max(0, Math.round((lo + 1.2 - y0) / RES)));
      S[c] = light(grid.d[s0 + j]);
    }
  }
  return { x0: grid.x0, z0: grid.z0, nx, nz, res: RES, F, C, T, S, W: null, blocked: new Uint8Array(n) };
}

// Where you can walk, and how far each column is from the nearest place you
// can't (W: m, < 0 in the walls). Call again after anything is put on the floor.
export function walkOf(cols) {
  const { nx, nz, F, C, T, blocked } = cols;
  const n = nx * nz;
  const walk = new Uint8Array(n);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      const f = F[c];
      if (!Number.isFinite(f) || blocked[c] || T[c] < f - 0.02) continue;
      let steep = 0;
      for (const o of [c - 1, c + 1, c - nx, c + nx]) {
        if (o < 0 || o >= n || !Number.isFinite(F[o])) continue;
        steep = Math.max(steep, Math.abs(F[o] - f) / RES);
      }
      if (steep > WALK.slope) continue;
      const cut = T[c] < C[c] - WALK.cut;
      if (cut || C[c] - f >= WALK.clear) walk[c] = 1;
    }
  }
  cols.walk = walk;
  const inside = chamfer(walk, nx, nz, 1);
  const outside = chamfer(walk, nx, nz, 0);
  const W = new Float32Array(n);
  for (let c = 0; c < n; c++) W[c] = walk[c] ? inside[c] - RES * 0.5 : -(outside[c] - RES * 0.5);
  cols.W = W;
  return cols;
}

// Distance (m) from each cell whose mask is `from` to the nearest cell whose
// mask isn't; 0 for those. Two passes, in steps of 1 and √2 cells.
function chamfer(mask, nx, nz, from) {
  const BIG = 1e6;
  const D = new Float32Array(nx * nz);
  for (let c = 0; c < D.length; c++) D[c] = mask[c] === from ? BIG : 0;
  const a = RES;
  const b = RES * Math.SQRT2;
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      if (!D[c]) continue;
      let d = D[c];
      if (i > 0) d = Math.min(d, D[c - 1] + a);
      if (k > 0) {
        d = Math.min(d, D[c - nx] + a);
        if (i > 0) d = Math.min(d, D[c - nx - 1] + b);
        if (i < nx - 1) d = Math.min(d, D[c - nx + 1] + b);
      }
      D[c] = d;
    }
  }
  for (let k = nz - 1; k >= 0; k--) {
    for (let i = nx - 1; i >= 0; i--) {
      const c = i + k * nx;
      if (!D[c]) continue;
      let d = D[c];
      if (i < nx - 1) d = Math.min(d, D[c + 1] + a);
      if (k < nz - 1) {
        d = Math.min(d, D[c + nx] + a);
        if (i < nx - 1) d = Math.min(d, D[c + nx + 1] + b);
        if (i > 0) d = Math.min(d, D[c + nx - 1] + b);
      }
      D[c] = d;
    }
  }
  return D;
}

// ── Being in it ─────────────────────────────────────────────────────────────
export class CaveSpace {
  // grid: the rock's sampled field (shape.js), for air()
  constructor(cave, cols, grid) {
    this.cave = cave;
    this.id = cave.id;
    this.surface = 'rock'; // what footsteps sound like in it
    this.cols = cols;
    this.grid = grid;
    this.x0 = cols.x0;
    this.z0 = cols.z0;
    this.x1 = cols.x0 + (cols.nx - 1) * cols.res;
    this.z1 = cols.z0 + (cols.nz - 1) * cols.res;
    this._q = { F: NaN, C: NaN, T: NaN, S: NaN, W: NaN };
  }

  // The column values at (x, z), from the corners round it that have one.
  // -> false outside the grid or where no corner has a floor.
  _at(x, z) {
    const g = this.cols;
    const fx = (x - g.x0) / g.res;
    const fz = (z - g.z0) / g.res;
    const i = Math.floor(fx);
    const k = Math.floor(fz);
    if (i < 0 || k < 0 || i >= g.nx - 1 || k >= g.nz - 1) return false;
    const u = fx - i;
    const v = fz - k;
    const c = i + k * g.nx;
    const q = this._q;
    let wsum = 0;
    let F = 0;
    let C = 0;
    let T = 0;
    let S = 0;
    let W = 0;
    for (let n = 0; n < 4; n++) {
      const cc = c + (n & 1) + (n >> 1) * g.nx;
      const w = ((n & 1) ? u : 1 - u) * ((n >> 1) ? v : 1 - v);
      W += g.W ? g.W[cc] * w : 0;
      if (!Number.isFinite(g.F[cc])) continue;
      wsum += w;
      F += g.F[cc] * w;
      C += g.C[cc] * w;
      T += g.T[cc] * w;
      S += g.S[cc] * w;
    }
    q.W = W;
    if (wsum < 1e-4) return false;
    q.F = F / wsum;
    q.C = C / wsum;
    q.T = T / wsum;
    q.S = S / wsum;
    return true;
  }

  // Is a body at (x, z), with its feet about y, in the cave? If so out.floor
  // is what it stands on and out.roof what's over its head (Infinity in the
  // open cutting at the mouth).
  inside(x, z, y, out) {
    if (x < this.x0 || z < this.z0 || x > this.x1 || z > this.z1 || !this._at(x, z)) return false;
    const q = this._q;
    if (q.T < q.F - 0.02) return false; // past the lip: the land is lower than the cave here
    const cut = q.T < q.C - WALK.cut;
    if (cut ? y > q.T + WALK.over : y > q.C - 0.1) return false; // up on the hill over it, or flying over the cutting
    out.floor = q.F;
    out.roof = cut ? Infinity : q.C;
    return true;
  }

  // How far (x, z) is from the walls, for someone in the cave: out.d (m, < 0
  // in them) and out.nx, out.nz (the way out of them). Where the cave is no
  // deeper than a step, d is Infinity: you can step up out of the cutting.
  walls(x, z, out) {
    out.d = Infinity;
    out.nx = 0;
    out.nz = 0;
    if (!this._at(x, z) || this._q.T - this._q.F < WALK.walls) return out;
    const e = 0.2;
    const d = this._q.W;
    this._at(x + e, z);
    const dx = this._q.W;
    this._at(x - e, z);
    const gx = dx - this._q.W;
    this._at(x, z + e);
    const dz = this._q.W;
    this._at(x, z - e);
    const gz = dz - this._q.W;
    const l = Math.hypot(gx, gz);
    out.d = d;
    if (l > 1e-6) {
      out.nx = gx / l;
      out.nz = gz / l;
    }
    return out;
  }

  // Is (x, y, z) open air in the cave, at least about m clear of its rock?
  // Up in the open cutting at the mouth, over the land, counts.
  air(x, y, z, m = 0) {
    if (x < this.x0 || z < this.z0 || x > this.x1 || z > this.z1 || !this._at(x, z)) return false;
    const q = this._q;
    if (q.T < q.F - 0.02) return false;
    if (q.T < q.C - WALK.cut && y > q.T + m) return true;
    return this.grid.sample(x, y, z) < -m;
  }

  // How much daylight reaches (x, z): 1 at the mouth, falling to nothing
  // deep inside. 1 outside the cave.
  light(x, z) {
    return this._at(x, z) ? this._q.S : 1;
  }
}
