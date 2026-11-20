// The skin of a cave's rock: a mesh of the surface where its field (shape.js)
// crosses zero, facing into the air, since you see it from inside.
//
// Surface nets: every grid cell the surface passes through gets one vertex,
// at the average of where the surface crosses the cell's edges, and every
// grid edge it crosses gets a quad joining the four cells round that edge.
// That gives a closed, smooth skin with no special cases where passages meet.
//
// Each vertex also carries
//   color   the rock: limestone in beds, pale calcite overhead, mud
//           underfoot, rust in streaks, moss where daylight reaches, all of
//           it darker down in the cracks
//   aSky    how much daylight gets there (0..1), for the skylight
//   aGround the height of the land over it, so what pokes out of the
//           hillside at the mouth isn't drawn (the cutting is open to the sky)

import { RES } from './shape.js';
import { noise3 } from './shape.js';
import { smoothstep } from '../noise.js';

// Corners of a cell as bits (dx + 2·dy + 4·dz), and its 12 edges.
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7], // along x
  [0, 2], [1, 3], [4, 6], [5, 7], // along y
  [0, 4], [1, 5], [2, 6], [3, 7], // along z
];

// -> { position, normal, color, sky, ground, index, origin, count }
//   terrain(x, z)  the land's height    light(d)  daylight d m along the passages
export function meshGrid(grid, { terrain, light, seed }) {
  const { nx, ny, nz, x0, y0, z0 } = grid;
  const cellKey = (i, j, k) => i + nx * (j + ny * k);
  const verts = new Map();
  const pos = [];
  const nor = [];
  const col = [];
  const sky = [];
  const gnd = [];
  const idx = [];
  const tint = noise3(seed ^ 0x51ed);
  const v = new Float32Array(8);
  const cn = new Int32Array(8);

  // ── A vertex in every cell the surface goes through ─────────────────────
  // The cells to look at: those next to any column that was sampled.
  const cells = new Set();
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      if (!grid.jn[i + k * nx]) continue;
      for (let dk = -1; dk <= 0; dk++) for (let di = -1; di <= 0; di++) if (i + di >= 0 && k + dk >= 0) cells.add(i + di + (k + dk) * nx);
    }
  }
  for (const cc of cells) {
    const i = cc % nx;
    const k = (cc - i) / nx;
    let jlo = Infinity;
    let jhi = -Infinity;
    for (let n = 0; n < 4; n++) {
      const c = i + (n & 1) + (k + (n >> 1)) * nx;
      if (i + (n & 1) >= nx || k + (n >> 1) >= nz || !grid.jn[c]) continue;
      jlo = Math.min(jlo, grid.j0[c] - 1);
      jhi = Math.max(jhi, grid.j0[c] + grid.jn[c]);
    }
    for (let j = Math.max(0, jlo); j <= jhi; j++) {
      let mask = 0;
      for (let n = 0; n < 8; n++) {
        const a = n & 1;
        const b = (n >> 1) & 1;
        const c = n >> 2;
        cn[n] = grid.index(i + a, j + b, k + c);
        v[n] = cn[n] < 0 ? 1 : grid.f[cn[n]];
        if (v[n] < 0) mask |= 1 << n;
      }
      if (mask === 0 || mask === 255) continue;
      // where the surface crosses the cell's edges, averaged
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let m = 0;
      for (const [a, b] of EDGES) {
        if (v[a] < 0 === v[b] < 0) continue;
        const t = v[a] / (v[a] - v[b]);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t;
        sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
        sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
        m++;
      }
      const x = x0 + (i + sx / m) * RES;
      const y = y0 + (j + sy / m) * RES;
      const z = z0 + (k + sz / m) * RES;
      // the way to the air: down the field
      let gx = v[1] - v[0] + v[3] - v[2] + v[5] - v[4] + v[7] - v[6];
      let gy = v[2] - v[0] + v[3] - v[1] + v[6] - v[4] + v[7] - v[5];
      let gz = v[4] - v[0] + v[5] - v[1] + v[6] - v[2] + v[7] - v[3];
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx = -gx / gl;
      gy = -gy / gl;
      gz = -gz / gl;
      // the floor and the way along the passages, from the airiest corner
      let air = -1;
      for (let n = 0; n < 8; n++) if (cn[n] >= 0 && (air < 0 || v[n] < v[air])) air = n;
      const floor = air >= 0 ? grid.floor[cn[air]] : y;
      const d = air >= 0 ? grid.d[cn[air]] : 0;
      const lit = light(d);
      // how open it is out in front of the rock: crannies are darker
      const open = smoothstep(0.05, 0.6, -grid.sample(x + gx * 0.75, y + gy * 0.75, z + gz * 0.75));
      rockColour(tint, x, y, z, gy, y - floor, lit, 0.5 + 0.5 * open, col);
      verts.set(cellKey(i, j, k), pos.length / 3);
      pos.push(x, y, z);
      nor.push(gx, gy, gz);
      sky.push(lit);
      gnd.push(terrain(x, z));
    }
  }

  // ── A quad across every grid edge the surface crosses ────────────────────
  const quad = (a, b, c, d, flip) => {
    const A = verts.get(a);
    const B = verts.get(b);
    const C = verts.get(c);
    const D = verts.get(d);
    if (A === undefined || B === undefined || C === undefined || D === undefined) return;
    const q = flip ? [A, D, C, B] : [A, B, C, D];
    // split along the shorter diagonal
    const d02 = dist2(pos, q[0], q[2]);
    const d13 = dist2(pos, q[1], q[3]);
    if (d02 <= d13) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    else idx.push(q[1], q[2], q[3], q[1], q[3], q[0]);
  };
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      for (let dj = 0; dj < grid.jn[c]; dj++) {
        const j = grid.j0[c] + dj;
        const a = grid.f[grid.start[c] + dj];
        const inAir = a < 0;
        // along x: the cells round the edge, in (y, z)
        if (inAir !== grid.get(i + 1, j, k) < 0 && j > 0 && k > 0) {
          quad(cellKey(i, j - 1, k - 1), cellKey(i, j, k - 1), cellKey(i, j, k), cellKey(i, j - 1, k), inAir);
        }
        // along y: in (z, x)
        if (inAir !== grid.get(i, j + 1, k) < 0 && i > 0 && k > 0) {
          quad(cellKey(i - 1, j, k - 1), cellKey(i - 1, j, k), cellKey(i, j, k), cellKey(i, j, k - 1), inAir);
        }
        // along z: in (x, y)
        if (inAir !== grid.get(i, j, k + 1) < 0 && i > 0 && j > 0) {
          quad(cellKey(i - 1, j - 1, k), cellKey(i, j - 1, k), cellKey(i, j, k), cellKey(i - 1, j, k), inAir);
        }
      }
    }
  }
  // edges from a sampled column into one that wasn't (rock either side, so
  // only where air reaches a column's last sample — never, with the margin)

  // Positions relative to the cave's corner, to keep float32 precise.
  const position = new Float32Array(pos.length);
  for (let n = 0; n < pos.length; n += 3) {
    position[n] = pos[n] - x0;
    position[n + 1] = pos[n + 1];
    position[n + 2] = pos[n + 2] - z0;
  }
  return {
    origin: [x0, 0, z0],
    position,
    normal: Float32Array.from(nor),
    color: Float32Array.from(col),
    sky: Float32Array.from(sky),
    ground: Float32Array.from(gnd),
    index: Uint32Array.from(idx),
    count: pos.length / 3,
  };
}

function dist2(p, a, b) {
  const dx = p[a * 3] - p[b * 3];
  const dy = p[a * 3 + 1] - p[b * 3 + 1];
  const dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

// ── The rock's colours (linear) ─────────────────────────────────────────────
const LIME = [0.26, 0.24, 0.205];
const BED = [0.165, 0.15, 0.13];
const CALCITE = [0.37, 0.35, 0.305];
const MUD = [0.12, 0.094, 0.068];
const RUST = [0.24, 0.13, 0.065];
const MOSS = [0.06, 0.11, 0.03];

// up: the normal's y; v: height above the floor; lit: daylight; ao: 0..1
export function rockColour(n, x, y, z, up, v, lit, ao, out) {
  const mix = (c, to, t) => {
    c[0] += (to[0] - c[0]) * t;
    c[1] += (to[1] - c[1]) * t;
    c[2] += (to[2] - c[2]) * t;
  };
  const c = [LIME[0], LIME[1], LIME[2]];
  // beds of harder and softer stone, a few tens of centimetres thick, wavering
  const bed = n(x * 0.04, y * 1.7 + n(x * 0.1, 0, z * 0.1) * 1.3, z * 0.04);
  mix(c, BED, smoothstep(0.05, 0.45, bed) * 0.8);
  // calcite flowing down from the roof, in streaks
  const flow = n(x * 0.8, y * 0.12, z * 0.8) * 0.5 + 0.5;
  mix(c, CALCITE, smoothstep(0.2, -0.7, up) * smoothstep(0.35, 0.75, flow) * 0.85 + smoothstep(1.4, 3.2, v) * 0.15);
  // the odd rusty seep
  mix(c, RUST, smoothstep(0.55, 0.85, n(x * 0.25 + 40, y * 0.06, z * 0.25)) * 0.7);
  // mud underfoot, darkest in the dips
  const floor = smoothstep(0.45, 0.8, up) * (1 - smoothstep(0.3, 0.9, v));
  mix(c, MUD, floor * (0.75 + 0.25 * n(x * 1.3, 7, z * 1.3)));
  // moss, where there's daylight
  mix(c, MOSS, smoothstep(0.3, 0.85, lit) * smoothstep(-0.3, 0.4, up) * (0.55 + 0.45 * n(x * 0.9, y * 0.9, z * 0.9)));
  const grain = 0.88 + 0.24 * (n(x * 3.1, y * 3.1, z * 3.1) * 0.5 + 0.5);
  out.push(c[0] * ao * grain, c[1] * ao * grain, c[2] * ao * grain);
}
