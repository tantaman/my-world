// The rock of a cave, as a field: < 0 in its air, > 0 in the rock, roughly in
// metres from the wall.
//
// Each passage is an arch swept along a segment (the same arch the hillside
// is cut with at the mouth: world/cuts.js), and each room a domed hall with a
// flat floor. The cave is their union, blended where they meet so a passage
// opens into a room rather than butting against it, then roughened with
// noise so the walls bulge and the roofs hang in folds like rock and not like
// pipes. The floor is left nearly flat, to walk on, and the way in is left
// smooth, so the hole cut in the hillside fits it.
//
// The field is sampled on a grid RES apart (CaveGrid). Only the columns near
// a passage or a room hold samples, and only over the few metres of height
// they span; everywhere else is rock.

import { cutField } from '../world/cuts.js';
import { smoothstep, hash2i } from '../noise.js';

export const RES = 0.5; // m between samples
export const OUT = 1; // the field in rock nobody sampled
const MARGIN = 1.6; // m of rock sampled round each shape (noise reaches about half that)
const BLEND = 1; // m over which shapes melt into each other where they meet
const UNSET = 1e9;

// The shapes a cave is made of, from its layout (sites.js).
//   { kind: 'pass', ax, az, bx, bz, fa, fb, w, h, da, db }
//   { kind: 'room', x, z, floor, rx, rz, ry, c, s, d }   (c, s: cos and sin of its yaw)
export function shapesOf(cave) {
  const out = [];
  const N = cave.nodes;
  const ways = new Array(N.length).fill(0);
  const widest = new Array(N.length).fill(0);
  const tallest = new Array(N.length).fill(0);
  for (const p of cave.passages) {
    const a = N[p.a];
    const b = N[p.b];
    out.push({ kind: 'pass', ax: a.x, az: a.z, bx: b.x, bz: b.z, fa: a.floor, fb: b.floor, w: p.w, h: p.h, da: a.d, db: b.d });
    for (const i of [p.a, p.b]) {
      ways[i]++;
      widest[i] = Math.max(widest[i], p.w);
      tallest[i] = Math.max(tallest[i], p.h);
    }
  }
  const roomAt = new Set(cave.rooms.map((r) => r.node));
  for (const r of cave.rooms) {
    const n = N[r.node];
    out.push({ kind: 'room', x: n.x, z: n.z, floor: n.floor, rx: r.rx, rz: r.rz, ry: r.ry, c: Math.cos(r.yaw), s: Math.sin(r.yaw), d: n.d });
  }
  // a bend or a fork gets a little round chamber of its own, so passages
  // turn through it instead of meeting at a crease
  for (let i = 1; i < N.length; i++) {
    if (ways[i] < 2 || roomAt.has(i)) continue;
    const r = widest[i] * 1.15;
    out.push({ kind: 'room', x: N[i].x, z: N[i].z, floor: N[i].floor, rx: r, rz: r, ry: tallest[i] * 1.05, c: 1, s: 0, d: N[i].d });
  }
  return out;
}

// One shape's field at (x, y, z); `at` gets the floor under it and how far
// along the passages that is (d).
const _t = { t: 0 };
export function shapeField(sh, x, y, z, at) {
  if (sh.kind === 'pass') {
    const f = cutField(x, y, z, sh, _t);
    at.floor = sh.fa + (sh.fb - sh.fa) * _t.t;
    at.d = sh.da + (sh.db - sh.da) * _t.t;
    return f;
  }
  const dx = x - sh.x;
  const dz = z - sh.z;
  const lx = dx * sh.c + dz * sh.s;
  const lz = -dx * sh.s + dz * sh.c;
  const v = y - sh.floor;
  const hc = sh.ry * 0.35;
  const ey = v > hc ? (v - hc) / (sh.ry - hc) : (v - hc) / (hc * 1.4);
  const e = Math.sqrt((lx / sh.rx) ** 2 + (lz / sh.rz) ** 2 + ey * ey) - 1;
  at.floor = sh.floor;
  at.d = sh.d + Math.hypot(dx, dz) * 0.5;
  const f = e * Math.min(sh.rx, sh.rz, sh.ry - hc);
  return f > -v ? f : -v;
}

// Where a shape's samples go: its plan box, and in a column (x, z) whether
// it reaches there and over what heights.
function planBox(sh) {
  if (sh.kind === 'pass') {
    const r = sh.w + MARGIN;
    return [Math.min(sh.ax, sh.bx) - r, Math.min(sh.az, sh.bz) - r, Math.max(sh.ax, sh.bx) + r, Math.max(sh.az, sh.bz) + r];
  }
  const r = Math.max(sh.rx, sh.rz) + MARGIN;
  return [sh.x - r, sh.z - r, sh.x + r, sh.z + r];
}

const _span = [0, 0];
function columnSpan(sh, x, z) {
  if (sh.kind === 'pass') {
    const ex = sh.bx - sh.ax;
    const ez = sh.bz - sh.az;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 1e-9 ? ((x - sh.ax) * ex + (z - sh.az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(x - sh.ax - ex * t, z - sh.az - ez * t) > sh.w + MARGIN) return null;
    const f = sh.fa + (sh.fb - sh.fa) * t;
    _span[0] = f - MARGIN;
    _span[1] = f + sh.h + MARGIN;
    return _span;
  }
  const dx = x - sh.x;
  const dz = z - sh.z;
  const lx = dx * sh.c + dz * sh.s;
  const lz = -dx * sh.s + dz * sh.c;
  if ((lx / (sh.rx + MARGIN)) ** 2 + (lz / (sh.rz + MARGIN)) ** 2 > 1) return null;
  _span[0] = sh.floor - MARGIN;
  _span[1] = sh.floor + sh.ry + MARGIN;
  return _span;
}

// ── The grid ────────────────────────────────────────────────────────────────
// Samples at (x0 + i·RES, y0 + j·RES, z0 + k·RES). Column c = i + k·nx holds
// samples j0[c] .. j0[c] + jn[c] - 1, packed from start[c]; jn 0: all rock.
export class CaveGrid {
  constructor(shapes) {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const sh of shapes) {
      const b = planBox(sh);
      x0 = Math.min(x0, b[0]);
      z0 = Math.min(z0, b[1]);
      x1 = Math.max(x1, b[2]);
      z1 = Math.max(z1, b[3]);
      const lo = sh.kind === 'pass' ? Math.min(sh.fa, sh.fb) : sh.floor;
      const hi = sh.kind === 'pass' ? Math.max(sh.fa, sh.fb) + sh.h : sh.floor + sh.ry;
      y0 = Math.min(y0, lo - MARGIN);
      y1 = Math.max(y1, hi + MARGIN);
    }
    this.res = RES;
    this.x0 = Math.floor(x0 / RES) * RES - RES;
    this.z0 = Math.floor(z0 / RES) * RES - RES;
    this.y0 = Math.floor(y0 / RES) * RES - RES;
    this.nx = Math.ceil((x1 - this.x0) / RES) + 2;
    this.nz = Math.ceil((z1 - this.z0) / RES) + 2;
    this.ny = Math.ceil((y1 - this.y0) / RES) + 2;
    const cols = this.nx * this.nz;
    // which heights each column needs
    const lo = new Float32Array(cols).fill(Infinity);
    const hi = new Float32Array(cols).fill(-Infinity);
    for (const sh of shapes) {
      this.eachColumn(sh, (c, span) => {
        if (span[0] < lo[c]) lo[c] = span[0];
        if (span[1] > hi[c]) hi[c] = span[1];
      });
    }
    this.j0 = new Int16Array(cols);
    this.jn = new Int16Array(cols);
    this.start = new Int32Array(cols);
    let total = 0;
    for (let c = 0; c < cols; c++) {
      if (lo[c] > hi[c]) continue;
      const a = Math.max(0, Math.floor((lo[c] - this.y0) / RES));
      const b = Math.min(this.ny - 1, Math.ceil((hi[c] - this.y0) / RES));
      this.j0[c] = a;
      this.jn[c] = b - a + 1;
      this.start[c] = total;
      total += b - a + 1;
    }
    this.count = total;
    this.f = new Float32Array(total).fill(UNSET);
    this.floor = new Float32Array(total); // the floor under each sample, of the shape nearest it
    this.d = new Float32Array(total); // ...and how far along the passages that is
  }

  // fn(c, span) for each column a shape reaches.
  eachColumn(sh, fn) {
    const b = planBox(sh);
    const i0 = Math.max(0, Math.floor((b[0] - this.x0) / RES));
    const i1 = Math.min(this.nx - 1, Math.ceil((b[2] - this.x0) / RES));
    const k0 = Math.max(0, Math.floor((b[1] - this.z0) / RES));
    const k1 = Math.min(this.nz - 1, Math.ceil((b[3] - this.z0) / RES));
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        const span = columnSpan(sh, this.x0 + i * RES, this.z0 + k * RES);
        if (span) fn(i + k * this.nx, span, i, k);
      }
    }
  }

  // Packed index of sample (i, j, k), or -1 where nothing was sampled.
  index(i, j, k) {
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return -1;
    const c = i + k * this.nx;
    const dj = j - this.j0[c];
    return dj >= 0 && dj < this.jn[c] ? this.start[c] + dj : -1;
  }

  get(i, j, k) {
    const n = this.index(i, j, k);
    return n < 0 ? OUT : this.f[n];
  }

  // The field anywhere, from the samples round it (trilinear).
  sample(x, y, z) {
    const fx = (x - this.x0) / RES;
    const fy = (y - this.y0) / RES;
    const fz = (z - this.z0) / RES;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const k = Math.floor(fz);
    const u = fx - i;
    const v = fy - j;
    const w = fz - k;
    const g = (a, b, c) => this.get(i + a, j + b, k + c);
    const x00 = g(0, 0, 0) + (g(1, 0, 0) - g(0, 0, 0)) * u;
    const x10 = g(0, 1, 0) + (g(1, 1, 0) - g(0, 1, 0)) * u;
    const x01 = g(0, 0, 1) + (g(1, 0, 1) - g(0, 0, 1)) * u;
    const x11 = g(0, 1, 1) + (g(1, 1, 1) - g(0, 1, 1)) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }
}

// ── Filling it in ───────────────────────────────────────────────────────────
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Lay one shape into the grid, blending it with what is there.
const _at = { floor: 0, d: 0 };
export function addShape(grid, sh) {
  const { f, floor, d } = grid;
  const best = grid._raw || (grid._raw = new Float32Array(grid.count).fill(UNSET));
  grid.eachColumn(sh, (c, span, i, k) => {
    const x = grid.x0 + i * RES;
    const z = grid.z0 + k * RES;
    const ja = Math.max(grid.j0[c], Math.floor((span[0] - grid.y0) / RES));
    const jb = Math.min(grid.j0[c] + grid.jn[c] - 1, Math.ceil((span[1] - grid.y0) / RES));
    for (let j = ja; j <= jb; j++) {
      const n = grid.start[c] + j - grid.j0[c];
      const v = shapeField(sh, x, grid.y0 + j * RES, z, _at);
      f[n] = f[n] === UNSET ? v : smin(f[n], v, BLEND);
      if (v < best[n]) {
        best[n] = v;
        floor[n] = _at.floor;
        d[n] = _at.d;
      }
    }
  });
}

// Roughen the rock (call once every shape is in). `quiet` is how far along
// the passages the noise starts: the way in is left smooth.
export function roughen(grid, seed, quiet) {
  const noise = noise3(seed);
  const { f, floor, d } = grid;
  for (let k = 0; k < grid.nz; k++) {
    for (let i = 0; i < grid.nx; i++) {
      const c = i + k * grid.nx;
      const x = grid.x0 + i * RES;
      const z = grid.z0 + k * RES;
      for (let dj = 0; dj < grid.jn[c]; dj++) {
        const n = grid.start[c] + dj;
        if (f[n] === UNSET) {
          f[n] = OUT;
          continue;
        }
        if (f[n] > 1.3) continue; // too deep in the rock for noise to matter
        const y = grid.y0 + (grid.j0[c] + dj) * RES;
        const q = smoothstep(quiet - 3, quiet + 2, d[n]);
        if (q <= 0) continue;
        const v = y - floor[n];
        // walls and roofs: broad bulges, knobbly rock, and hanging folds overhead
        const wall = smoothstep(0.15, 1.1, v);
        let r = noise(x * 0.17, y * 0.17, z * 0.17) * 0.5 + noise(x * 0.55 + 31, y * 0.55, z * 0.55) * 0.22 + noise(x * 1.5 - 17, y * 1.5, z * 1.5) * 0.08;
        r += noise(x * 0.9 + 7, y * 0.16, z * 0.9 - 3) * 0.3 * smoothstep(1.6, 2.8, v);
        // the floor: only uneven
        f[n] += q * (r * wall + noise(x * 0.8, 3.3, z * 0.8) * 0.05);
      }
    }
  }
}

// Smooth 3D value noise, -1..1.
export function noise3(seed) {
  const s = seed | 0;
  const h = (x, y, z) => (hash2i(x, (y * 73856093) ^ z, s) & 0xffff) / 32767.5 - 1;
  return (x, y, z) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    let u = x - ix;
    let v = y - iy;
    let w = z - iz;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    w = w * w * (3 - 2 * w);
    const a = h(ix, iy, iz);
    const b = h(ix + 1, iy, iz);
    const c = h(ix, iy + 1, iz);
    const e = h(ix + 1, iy + 1, iz);
    const a1 = h(ix, iy, iz + 1);
    const b1 = h(ix + 1, iy, iz + 1);
    const c1 = h(ix, iy + 1, iz + 1);
    const e1 = h(ix + 1, iy + 1, iz + 1);
    const p0 = a + (b - a) * u;
    const p1 = c + (e - c) * u;
    const p2 = a1 + (b1 - a1) * u;
    const p3 = c1 + (e1 - c1) * u;
    const q0 = p0 + (p1 - p0) * v;
    const q1 = p2 + (p3 - p2) * v;
    return q0 + (q1 - q0) * w;
  };
}
