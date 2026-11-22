// The way a tour boat goes on a real place's water: from the landing, by the
// bayous and canals, past each place it's to go by, and back. Pure: handed
// how far any point is from the shore, it finds the way, and says where on
// it the boat is and how fast it may go there.
//
// The way is looked for on a grid (CELL m), where the water is wide enough
// for the boat (CLEAR m of it either side of its middle line). Wide water is
// cheaper to go by than narrow, so it keeps to the middle of a channel and
// takes the big bayou over a ditch, and water it has been by already costs
// more, so the way back is another way if there is one. Then it's drawn
// straight where it can be, rounded at the corners, and kept off the banks.
//
// How fast: quick in open water, slow in a narrow canal, slower round a
// tight bend, and easing down to nothing at each stop and up again after.

import { smoothstep, lerp } from '../noise.js';

export const CELL = 2; // m: the grid the way is looked for on
export const CLEAR = 0.55; // m of water either side of the boat's middle, at the least: its hull brushes the reeds
const MARGIN = 160; // m round the stops that the way may go
const WIDE = 2.5; // how much more a cell costs on the edge of what's wide enough than in open water
const BEEN = 1.8; // how much more water costs that an earlier leg went by
const BEEN_NEAR = 3; // cells either side of an earlier leg that it counts for
const STEP = 1; // m between the points the way is kept as
const SNAP = 60; // m from a stop that the water for it may be looked for
// m/s: in a narrow canal and out on open water; the clearance (m) each is for
export const PACE = { narrow: 5, open: 13, idle: 1.2 };
const PACE_CLEAR = [1.2, 9];
const SIDEWAYS = 2.2; // m/s² the boat may be pulled round a bend
const SPEED_UP = 1.1; // m/s² it gathers way at
const SLOW_DOWN = 1.6; // m/s² it sheds it at

// shore(x, z): signed m to the nearest shore, negative in the water.
// stops: [[x, z], ...] in order: the landing first (and last, for a loop).
// → { pts: [[x, z], ...] every STEP m, legs: [i of the point nearest each
//   stop], clear: [m of water either side of each point] } or null where
//   there's no way by water
export function findRoute(shore, stops, { cell = CELL, clear = CLEAR, margin = MARGIN } = {}) {
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of stops) {
    x0 = Math.min(x0, x - margin);
    z0 = Math.min(z0, z - margin);
    x1 = Math.max(x1, x + margin);
    z1 = Math.max(z1, z + margin);
  }
  const w = Math.ceil((x1 - x0) / cell) + 1;
  const h = Math.ceil((z1 - z0) / cell) + 1;
  const D = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) D[j * w + i] = shore(x0 + i * cell, z0 + j * cell);
  const at = (k) => [x0 + (k % w) * cell, z0 + Math.floor(k / w) * cell];
  const ok = (k) => D[k] < -clear;
  const been = new Uint8Array(w * h);

  // each stop's water: the nearest wide enough
  const snap = ([x, z]) => {
    const i0 = Math.round((x - x0) / cell);
    const j0 = Math.round((z - z0) / cell);
    let best = -1;
    let bd = Infinity;
    const r = Math.ceil(SNAP / cell);
    for (let j = Math.max(0, j0 - r); j <= Math.min(h - 1, j0 + r); j++) {
      for (let i = Math.max(0, i0 - r); i <= Math.min(w - 1, i0 + r); i++) {
        const k = j * w + i;
        if (!ok(k)) continue;
        const d = (i - i0) ** 2 + (j - j0) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    }
    return best;
  };
  const ends = stops.map(snap);
  if (ends.some((k) => k < 0)) return null;

  const cost = (k) => 1 + WIDE / (1 + Math.max(0, -D[k] - clear)) + (been[k] ? BEEN : 0);
  const cells = [];
  const legs = [];
  for (let l = 1; l < ends.length; l++) {
    const path = astar(ends[l - 1], ends[l], w, h, ok, cost);
    if (!path) return null;
    if (cells.length) path.shift();
    cells.push(...path);
    legs.push(cells.length - 1);
    // what it went by costs more for the legs after
    for (const k of path) {
      const [i, j] = [k % w, Math.floor(k / w)];
      for (let b = -BEEN_NEAR; b <= BEEN_NEAR; b++) for (let a = -BEEN_NEAR; a <= BEEN_NEAR; a++) if (i + a >= 0 && j + b >= 0 && i + a < w && j + b < h) been[(j + b) * w + i + a] = 1;
    }
  }

  // straight where it can be, then rounded, then kept off the banks
  const field = (x, z) => {
    const fi = Math.min(w - 1.001, Math.max(0, (x - x0) / cell));
    const fj = Math.min(h - 1.001, Math.max(0, (z - z0) / cell));
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const u = fi - i;
    const v = fj - j;
    const k = j * w + i;
    return (D[k] * (1 - u) + D[k + 1] * u) * (1 - v) + (D[k + w] * (1 - u) + D[k + w + 1] * u) * v;
  };
  const corners = [0];
  const keep = new Set(legs);
  for (let a = 0; a < cells.length - 1; ) {
    let b = a + 1;
    while (b + 1 < cells.length && !keepBetween(keep, a, b + 1) && seen(at(cells[a]), at(cells[b + 1]), field, clear)) b++;
    corners.push(b);
    a = b;
  }
  let line = corners.map((c) => at(cells[c]));
  for (let pass = 0; pass < 3; pass++) line = chaikin(line, (a, b) => seen(a, b, field, clear * 0.85));
  const pts = resample(line, STEP);
  for (const p of pts) offTheBank(p, field, clear);
  const free = pts.map(([x, z]) => -field(x, z));
  // where each stop is on it
  const stopsOn = ends.map((k) => {
    const [sx, sz] = at(k);
    let best = 0;
    let bd = Infinity;
    pts.forEach(([x, z], i) => {
      const d = (x - sx) ** 2 + (z - sz) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  });
  return { pts, legs: stopsOn, clear: free };
}

// A* over the grid, 8 ways; ok(k) says a cell can be gone through and
// cost(k) what each metre of it costs. → [k, ...] from a to b, or null
function astar(a, b, w, h, ok, cost) {
  const n = w * h;
  const g = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new Heap();
  const [bi, bj] = [b % w, Math.floor(b / w)];
  const guess = (k) => Math.hypot((k % w) - bi, Math.floor(k / w) - bj);
  g[a] = 0;
  heap.push(a, guess(a));
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.size) {
    const k = heap.pop();
    if (closed[k]) continue;
    if (k === b) break;
    closed[k] = 1;
    const [i, j] = [k % w, Math.floor(k / w)];
    for (const [di, dj, len] of DIRS) {
      const a2 = i + di;
      const b2 = j + dj;
      if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) continue;
      const q = b2 * w + a2;
      if (closed[q] || !ok(q)) continue;
      // (no cutting a corner between two banks)
      if (di && dj && (!ok(j * w + a2) || !ok(b2 * w + i))) continue;
      const ng = g[k] + len * (cost(k) + cost(q)) * 0.5;
      if (ng < g[q]) {
        g[q] = ng;
        from[q] = k;
        heap.push(q, ng + guess(q));
      }
    }
  }
  if (from[b] < 0 && a !== b) return null;
  const path = [b];
  for (let k = b; k !== a; ) {
    k = from[k];
    path.push(k);
  }
  return path.reverse();
}

// a binary heap of ints by priority, least first
class Heap {
  constructor() {
    this.k = [];
    this.p = [];
  }
  get size() {
    return this.k.length;
  }
  push(k, p) {
    const K = this.k;
    const P = this.p;
    let i = K.length;
    K.push(k);
    P.push(p);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (P[up] <= p) break;
      K[i] = K[up];
      P[i] = P[up];
      i = up;
    }
    K[i] = k;
    P[i] = p;
  }
  pop() {
    const K = this.k;
    const P = this.p;
    const top = K[0];
    const k = K.pop();
    const p = P.pop();
    if (K.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= K.length) break;
        if (c + 1 < K.length && P[c + 1] < P[c]) c++;
        if (P[c] >= p) break;
        K[i] = K[c];
        P[i] = P[c];
        i = c;
      }
      K[i] = k;
      P[i] = p;
    }
    return top;
  }
}

const keepBetween = (keep, a, b) => {
  for (let c = a + 1; c < b; c++) if (keep.has(c)) return true;
  return false;
};

// Can the boat go straight from a to b, wide water all the way?
function seen([ax, az], [bx, bz], field, clear) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.75);
  for (let s = 1; s < n; s++) if (field(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n) > -clear) return false;
  return true;
}

// Corners cut a quarter of the way along each side, where the cut is in
// open water (ok(a, b)); the ends, and the corners it can't cut, kept.
function chaikin(line, ok) {
  const out = [line[0]];
  const q = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 1; i < line.length - 1; i++) {
    const [a, b, c] = [line[i - 1], line[i], line[i + 1]];
    const p = q(b, a, 0.25);
    const r = q(b, c, 0.25);
    if (ok(p, r)) out.push(p, r);
    else out.push(b);
  }
  out.push(line[line.length - 1]);
  return out;
}

// Points every `step` m along a line.
function resample(line, step) {
  const out = [line[0].slice()];
  let left = step;
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = 0;
    while (len - t >= left) {
      t += left;
      out.push([a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len]);
      left = step;
    }
    left -= len - t;
  }
  const last = line[line.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > step * 0.3) out.push(last.slice());
  return out;
}

// Rounding a corner can bring it near a bank: back out into the water, down
// the slope of the shore distance.
// (in small steps, so as not to step over the middle of a narrow channel
// and out the other side)
function offTheBank(p, field, clear) {
  for (let k = 0; k < 30; k++) {
    const d = field(p[0], p[1]);
    if (d < -clear * 0.85) return;
    const gx = field(p[0] + 0.25, p[1]) - field(p[0] - 0.25, p[1]);
    const gz = field(p[0], p[1] + 0.25) - field(p[0], p[1] - 0.25);
    const g = Math.hypot(gx, gz);
    if (g < 1e-4) return;
    const step = Math.min(0.15, Math.max(0.03, (d + clear) * 0.5));
    p[0] -= (gx / g) * step;
    p[1] -= (gz / g) * step;
    if (field(p[0], p[1]) > d) {
      p[0] += (gx / g) * step;
      p[1] += (gz / g) * step;
      return;
    }
  }
}

// ── Going along it ──────────────────────────────────────────────────────────
// A route laid out for going along: how far each point is from the start,
// where the boat is and which way it heads at any distance along, and the
// fastest it may go there to make each stop (`halts`: distances it comes to
// a stand at) and not fly off a bend.
export class Course {
  constructor(route, halts = []) {
    const P = route.pts;
    this.pts = P;
    this.clear = route.clear;
    this.legs = route.legs;
    const n = P.length;
    this.s = new Float32Array(n);
    for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    this.length = this.s[n - 1];
    // the most it may go at each point: by how wide the water is, and how
    // tight the bend
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const wide = lerp(PACE.narrow, PACE.open, smoothstep(PACE_CLEAR[0], PACE_CLEAR[1], this.clear[i]));
      const a = P[Math.max(0, i - 4)];
      const b = P[i];
      const c = P[Math.min(n - 1, i + 4)];
      const turn = Math.abs(angle(Math.atan2(b[0] - a[0], b[1] - a[1]), Math.atan2(c[0] - b[0], c[1] - b[1])));
      const span = Math.max(1, Math.hypot(c[0] - a[0], c[1] - a[1]));
      const curve = turn / span; // 1/m
      v[i] = Math.min(wide, curve > 1e-4 ? Math.sqrt(SIDEWAYS / curve) : wide);
    }
    // to a stand at each halt, and at the ends
    v[0] = 0;
    v[n - 1] = 0;
    const stand = new Set();
    for (const h of halts) {
      const i = this.index(h);
      stand.add(i);
      stand.add(Math.min(n - 1, i + 1));
    }
    for (const i of stand) v[i] = 0;
    for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * SPEED_UP * (this.s[i] - this.s[i - 1])));
    for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * SLOW_DOWN * (this.s[i + 1] - this.s[i])));
    // (it never quite stops but where it means to: idle on)
    for (let i = 1; i < n - 1; i++) if (!stand.has(i)) v[i] = Math.max(v[i], PACE.idle);
    this.v = v;
  }

  // the point at or before distance s
  index(s) {
    let lo = 0;
    let hi = this.s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid] <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  // Where it is at distance s: { x, z, yaw (the way it heads), v (the most it
  // may go), clear (m of water either side) }
  at(s, out = {}) {
    const S = this.s;
    const i = this.index(Math.max(0, Math.min(this.length, s)));
    const j = Math.min(S.length - 1, i + 1);
    const t = j > i ? Math.max(0, Math.min(1, (s - S[i]) / (S[j] - S[i]))) : 0;
    const [a, b] = [this.pts[i], this.pts[j]];
    out.x = a[0] + (b[0] - a[0]) * t;
    out.z = a[1] + (b[1] - a[1]) * t;
    // heading, looked a few metres ahead so it doesn't twitch
    const c = this.pts[Math.min(S.length - 1, i + 3)];
    const d = this.pts[Math.max(0, i - 2)];
    out.yaw = Math.atan2(c[0] - d[0], c[1] - d[1]);
    out.v = this.v[i] + (this.v[j] - this.v[i]) * t;
    out.clear = this.clear[i];
    return out;
  }
}

const angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
