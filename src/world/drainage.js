// The drainage network: which way water runs, how much of it there is, and
// where it gathers.
//
// Pure and deterministic like the rest of WorldGen (no three.js), so the
// chunk workers, the map and the main thread all agree on every drop, and each
// of them can work out any part of an endless world on its own.
//
// Rain falls everywhere, so the question is only where it goes. The land is
// sampled at nodes, one to a square cell, jittered so the grid doesn't show.
// Each node drains to the neighbour that falls away from it most steeply. A
// node with no lower neighbour is a *sink*: the bottom of a hollow. Water
// gathers there in a pond or a lake, rises to the lowest point of the
// hollow's rim, and spills over it — so a sink drains too, to the first node
// past its rim that leads somewhere lower still (see outlet()). Because each
// spill leads to a lower sink, water never goes round in a circle, and chains
// of lakes are strung along rivers. A hollow too big to look over is left
// as a lake with no outlet.
//
// How much water a node carries is how many nodes drain through it (its
// catchment), so streams start small high up, join, and grow into rivers as
// they go down. A stream shows only once enough of the land drains through it.
//
// Every channel's water level runs downhill along it, all the way: a node
// stands its water just under the land, and no higher than any node upstream
// of it. So where a lake spills over a rise, or the land between two nodes
// rises and falls again, the water keeps its level and cuts a valley through
// the rise rather than climbing it.
//
// Water.shape() (water.js) turns this into channels, pools and cascades, and
// carves the land around them.

import { hash2i, mulberry32, smoothstep } from '../noise.js';

export const NET = {
  cell: 96, // m between nodes
  jitter: 0.7, // how much of its cell a node may wander over
  routeWave: 40, // the land water is routed over leaves out bumps shorter than this (m)
  flood: 3, // a sink looks this many cells around for a way out
  spill: 5, // ... and over a rim at most this high above its bottom (m)
  springAcc: 8, // nodes of catchment before a channel carries water
  riverAcc: 60, // ... before it's a river
  bigAcc: 160, // ... before it's as big as a channel gets in shape (depth, valley)
};

// Still water, where a sink gathers enough of it.
//   acc     catchment (nodes) from which a sink holds this kind of water
//   r       radius range (m) of the shoreline, before it's made irregular,
//           by catchment: r[0] at acc, r[1] at accFull
//   depth   range (m) at the deepest point, likewise
export const POND = { acc: 3, accFull: 30, r: [6, 14], depth: [1.0, 1.7] };
export const LAKE = { acc: 30, accFull: 260, r: [22, 60], depth: [2.5, 5.5] };
// Chance a sink with too little catchment for a pond holds one anyway: a
// spring in a hollow.
const SPRING_POND = 0.35;

const TAU = Math.PI * 2;
const OFFS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
const keyOf = (i, j) => (i + 32768) * 65536 + (j + 32768);
// a strict order on nodes: by height, then by key, so ties can't make cycles
const below = (a, b) => a.e < b.e || (a.e === b.e && a.k < b.k);

// How wide (half-width, m) a channel is for the water it carries.
export function channelHalf(acc) {
  if (acc < NET.springAcc) return 0;
  const l = Math.log2(acc / NET.springAcc);
  return 0.4 + 0.5 * l + 0.12 * l * l;
}
// 0 for a fresh stream, 1 for a big river: what the channel's shape follows.
export function channelSize(acc) {
  return Math.max(0, Math.min(1, Math.log2(Math.max(1, acc) / NET.springAcc) / Math.log2(NET.bigAcc / NET.springAcc)));
}
// How far (m) below the land at a node its water stands.
export function channelMargin(acc) {
  return 0.5 + 0.8 * channelSize(acc);
}

export class Drainage {
  // gen: the WorldGen (broadHeight, naturalHeight, padClearance).
  constructor(gen, seed) {
    this.gen = gen;
    this.seed = seed;
    this.reset();
  }

  reset() {
    this.nodes = new Map();
    this.scanned = new Set();
    this.segs = new Map();
    this.cells = new Map();
  }

  // The land water is routed over: the hills without the smallest bumps.
  elev(x, z) {
    return this.gen.broadHeight(x, z, NET.routeWave);
  }

  node(i, j) {
    const k = keyOf(i, j);
    let n = this.nodes.get(k);
    if (n) return n;
    const C = NET.cell;
    const rng = mulberry32(hash2i(i, j, (this.seed ^ 0x5eed) >>> 0));
    const lo = (1 - NET.jitter) / 2;
    const x = (i + lo + NET.jitter * rng()) * C;
    const z = (j + lo + NET.jitter * rng()) * C;
    n = {
      i,
      j,
      k,
      x,
      z,
      e: this.elev(x, z),
      r: rng(), // a die of its own, for whatever needs one
      // where its channel starts and ends (a lake's middle, for a sink with one)
      gx: x,
      gz: z,
      down: undefined, // steepest neighbour downhill, or null
      out: undefined, // a sink's way out over its rim, or null
      bottom: undefined, // the sink its steepest path ends in
      over: null, // sinks that spill into this node
      up: null, // nodes that drain into this one
      acc: 0,
      lvl: undefined,
      basin: undefined,
    };
    this.nodes.set(k, n);
    return n;
  }

  // The neighbour that falls away most steeply, or null for a sink.
  down(n) {
    if (n.down !== undefined) return n.down;
    let best = null;
    let bs = 0;
    for (const [di, dj] of OFFS) {
      const m = this.node(n.i + di, n.j + dj);
      if (!below(m, n)) continue;
      const s = (n.e - m.e) / Math.hypot(m.x - n.x, m.z - n.z);
      if (!best || s > bs) {
        best = m;
        bs = s;
      }
    }
    n.down = best;
    return best;
  }

  // The sink at the end of n's steepest path down.
  bottom(n) {
    if (n.bottom !== undefined) return n.bottom;
    const path = [];
    let m = n;
    while (m.bottom === undefined) {
      const d = this.down(m);
      if (!d) {
        m.bottom = m;
        break;
      }
      path.push(m);
      m = d;
    }
    for (const p of path) p.bottom = m.bottom;
    return n.bottom;
  }

  // Where a sink spills: fill its hollow from the bottom up (lowest node
  // first), and the first node reached that drains to a lower sink is the way
  // out. Only looks `flood` cells around, and only so high: a hollow bigger
  // or deeper than that keeps its water (the lake it holds is smaller than
  // the hollow, and it would have to stand far above its shores to spill).
  outlet(s) {
    if (s.out !== undefined) return s.out;
    s.out = null;
    if (this.down(s)) return null;
    const R = NET.flood;
    const seen = new Set([s.k]);
    const heap = [];
    const push = (m) => {
      if (seen.has(m.k) || Math.abs(m.i - s.i) > R || Math.abs(m.j - s.j) > R) return;
      seen.add(m.k);
      heap.push(m);
    };
    for (const [di, dj] of OFFS) push(this.node(s.i + di, s.j + dj));
    while (heap.length) {
      let bi = 0;
      for (let q = 1; q < heap.length; q++) if (below(heap[q], heap[bi])) bi = q;
      const m = heap[bi];
      heap[bi] = heap[heap.length - 1];
      heap.pop();
      if (m.e - s.e > NET.spill) return null;
      const b = this.bottom(m);
      if (b !== s && below(b, s)) {
        s.out = m;
        return m;
      }
      for (const [di, dj] of OFFS) push(this.node(m.i + di, m.j + dj));
    }
    return null;
  }

  // Where n's water goes next: downhill, or over a sink's rim; null if it
  // stays.
  next(n) {
    return this.down(n) || this.outlet(n);
  }

  // The nodes that drain into n (its own neighbours, and sinks spilling into
  // it), in a fixed order.
  upstream(n) {
    if (n.up) return n.up;
    // a sink spilling into n lies within flood + 1 cells of it
    const R = NET.flood + 1;
    for (let j = n.j - R; j <= n.j + R; j++) {
      for (let i = n.i - R; i <= n.i + R; i++) {
        const k = keyOf(i, j);
        if (this.scanned.has(k)) continue;
        this.scanned.add(k);
        const m = this.node(i, j);
        if (this.down(m)) continue;
        const o = this.outlet(m);
        if (o) (o.over || (o.over = [])).push(m);
      }
    }
    const up = [];
    for (const [di, dj] of OFFS) {
      const m = this.node(n.i + di, n.j + dj);
      if (this.down(m) === n) up.push(m);
    }
    if (n.over) for (const m of n.over) up.push(m);
    up.sort((a, b) => a.k - b.k);
    n.up = up;
    return up;
  }

  // How many nodes drain through n, itself included.
  acc(n) {
    if (!n.acc) this._settle(n);
    return n.acc;
  }

  // The water level at n: where it would stand its water left to itself (a
  // lake's level, or just under the land), and no higher than anything
  // upstream, so it never runs uphill.
  level(n) {
    if (!n.acc) this._settle(n);
    return n.lvl;
  }

  // Works out acc and lvl for n and everything upstream of it that hasn't
  // been already, upstream first.
  _settle(root) {
    const stack = [root];
    while (stack.length) {
      const n = stack[stack.length - 1];
      if (n.acc) {
        stack.pop();
        continue;
      }
      const up = this.upstream(n);
      let ready = true;
      for (const u of up) {
        if (!u.acc) {
          stack.push(u);
          ready = false;
        }
      }
      if (!ready) continue;
      stack.pop();
      let a = 1;
      let low = Infinity;
      for (const u of up) {
        a += u.acc;
        if (u.lvl < low) low = u.lvl;
      }
      n.acc = a;
      const b = this.down(n) ? null : this.basin(n, low);
      const own = b ? b.level : n.e - channelMargin(a);
      n.lvl = Math.min(own, low);
    }
  }

  // The upstream node that brings the most water: the channel carries on
  // from it, where the others join.
  main(n) {
    let best = null;
    for (const u of this.upstream(n)) if (!best || this.acc(u) > this.acc(best)) best = u;
    return best;
  }

  // ── Ponds and lakes ───────────────────────────────────────────────────────
  // The still water a sink holds, or null. (Worked out as the sink settles:
  // lowUp is the lowest level of anything draining into it.)
  basin(s, lowUp) {
    if (s.basin !== undefined) return s.basin;
    if (!s.acc) {
      this._settle(s);
      return s.basin;
    }
    s.basin = null;
    if (this.down(s)) return null;
    const acc = s.acc;
    if (acc < POND.acc && s.r > SPRING_POND) return null;
    const g = this.gen;
    const P = acc >= LAKE.acc ? LAKE : POND;
    const rng = mulberry32(hash2i(s.i, s.j, (this.seed ^ 0xba51) >>> 0));
    const f = smoothstep(P.acc, P.accFull, acc);
    let R0 = P.r[0] + (P.r[1] - P.r[0]) * f * (0.75 + 0.25 * rng());
    // room for the land round it, and for any other sink's water
    const C = NET.cell;
    let room = 1.4 * C;
    for (let dj = -3; dj <= 3; dj++) {
      for (let di = -3; di <= 3; di++) {
        if (!di && !dj) continue;
        const m = this.node(s.i + di, s.j + dj);
        if (this.down(m)) continue;
        room = Math.min(room, Math.hypot(m.x - s.x, m.z - s.z));
      }
    }
    const amp = [0.1 + rng() * 0.12, rng() * 0.1, rng() * 0.07];
    const ph = [rng() * TAU, rng() * TAU, rng() * TAU];
    const k = 1 + amp[0] + amp[1] + amp[2];
    R0 = Math.min(R0, (room * 0.36) / k);
    const maxR = R0 * k;
    // settle into the hollow of the actual ground, near the node
    let x = s.x;
    let z = s.z;
    const reach = C * 0.3;
    for (let it = 0; it < 16; it++) {
      const h0 = g.broadHeight(x, z, 30);
      const hx = g.broadHeight(x + 2, z, 30) - h0;
      const hz = g.broadHeight(x, z + 2, 30) - h0;
      const gl = Math.hypot(hx, hz);
      if (gl < 0.005) break;
      x -= (hx / gl) * 3;
      z -= (hz / gl) * 3;
      const dx = x - s.x;
      const dz = z - s.z;
      const dl = Math.hypot(dx, dz);
      if (dl > reach) {
        x = s.x + (dx / dl) * reach;
        z = s.z + (dz / dl) * reach;
      }
    }
    if (g.padClearance(x, z) < maxR + 30) return null;
    const depth = P.depth[0] + (P.depth[1] - P.depth[0]) * f;
    const b = { x, z, R0, amp, ph, depth, maxR, level: 0, blend: 0, kind: P === LAKE ? 'lake' : 'pond', node: s };
    // Fill it to just under the lowest point of its rim, and no higher than
    // the streams running into it.
    let rimMin = Infinity;
    let rimMax = -Infinity;
    for (let q = 0; q < 40; q++) {
      const th = (q / 40) * TAU;
      const r = basinRadius(b, th) + 1.5;
      const hn = g.naturalHeight(x + Math.cos(th) * r, z + Math.sin(th) * r);
      if (hn < rimMin) rimMin = hn;
      if (hn > rimMax) rimMax = hn;
    }
    const level = Math.min(rimMin - 0.25, lowUp - 0.05);
    b.level = level;
    b.blend = Math.min(36, Math.max(7, (rimMax - level) * 2.4));
    s.basin = b;
    s.gx = x;
    s.gz = z;
    return b;
  }

  // ── Channels ──────────────────────────────────────────────────────────────
  // The channel from n to where its water goes next, or null if no water
  // runs there. See makeSegment().
  segment(n) {
    let s = this.segs.get(n.k);
    if (s === undefined) {
      s = this._makeSegment(n);
      this.segs.set(n.k, s);
    }
    return s;
  }

  _makeSegment(a) {
    const b = this.next(a);
    if (!b) return null;
    const accA = this.acc(a);
    const mainB = this.main(b) === a;
    const w0 = channelHalf(accA);
    const w1 = mainB ? channelHalf(this.acc(b)) : w0;
    if (w0 <= 0 && w1 <= 0) return null;
    const ba = this.down(a) ? null : this.basin(a);
    const bb = this.down(b) ? null : this.basin(b);
    // the four points the curve passes through
    const up = this.main(a);
    if (up && !this.down(up)) this.basin(up);
    const nb = this.next(b);
    if (nb && !this.down(nb)) this.basin(nb);
    const p1x = a.gx;
    const p1z = a.gz;
    const p2x = b.gx;
    const p2z = b.gz;
    const p0x = up ? up.gx : 2 * p1x - p2x;
    const p0z = up ? up.gz : 2 * p1z - p2z;
    const p3x = nb ? nb.gx : 2 * p2x - p1x;
    const p3z = nb ? nb.gz : 2 * p2z - p1z;
    const len = Math.hypot(p2x - p1x, p2z - p1z);
    // a bend or two of its own (at most BEND m out of line), flattening out
    // towards the ends so the channel runs smoothly on through each node
    const rng = mulberry32(hash2i(a.i, a.j, (this.seed ^ 0xbe4d) >>> 0));
    const bend = Math.min(1, BEND / (0.34 * len));
    const a1 = (rng() * 2 - 1) * 0.22 * bend;
    const a2 = (rng() * 2 - 1) * 0.12 * bend;
    const ph = rng() * TAU;
    const nx = -(p2z - p1z) / len;
    const nz = (p2x - p1x) / len;
    const count = Math.max(8, Math.ceil(len / 4));
    const pts = new Float64Array((count + 1) * 2);
    for (let q = 0; q <= count; q++) {
      const t = q / count;
      catmullRom(p0x, p0z, p1x, p1z, p2x, p2z, p3x, p3z, t, _p);
      const sn = Math.sin(Math.PI * t);
      const off = len * sn * sn * (a1 + a2 * Math.sin(TAU * t + ph));
      pts[q * 2] = _p.x + nx * off;
      pts[q * 2 + 1] = _p.z + nz * off;
    }
    // distance along it, and the land under it
    const s = new Float64Array(count + 1);
    const ground = new Float64Array(count + 1);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let q = 0; q <= count; q++) {
      const x = pts[q * 2];
      const z = pts[q * 2 + 1];
      if (q) s[q] = s[q - 1] + Math.hypot(x - pts[q * 2 - 2], z - pts[q * 2 - 1]);
      ground[q] = this.gen.broadHeight(x, z, 0);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    // The level: from a's down to b's, never rising, and keeping under the
    // land where it can. In a lake it's the lake's level, from its shore.
    const LA = this.level(a);
    const LB = this.level(b);
    let qa = 0;
    let qb = count;
    if (ba) while (qa < count && insideBasin(ba, pts[qa * 2 + 2], pts[qa * 2 + 3])) qa++;
    if (bb) while (qb > qa && insideBasin(bb, pts[qb * 2 - 2], pts[qb * 2 - 1])) qb--;
    const margin = channelMargin(accA);
    const W = new Float64Array(count + 1);
    const span = Math.max(1e-6, s[qb] - s[qa]);
    let U = LA;
    for (let q = 0; q <= count; q++) {
      if (q <= qa) W[q] = LA;
      else if (q >= qb) W[q] = LB;
      else {
        U = Math.min(U, ground[q] - margin);
        const tau = (s[q] - s[qa]) / span;
        const lin = LA + (LB - LA) * tau + SLACK * (1 - tau);
        W[q] = Math.max(LB, Math.min(U, lin));
      }
    }
    const reach = Math.max(w0, w1) + 90;
    return {
      a,
      b,
      pts,
      s,
      W,
      count,
      // levels at its ends, and how far along it leaves a's lake and reaches
      // b's (0 and its length if there are none)
      LA,
      LB,
      sa: s[qa],
      sb: s[qb],
      w0,
      w1,
      acc0: accA,
      acc1: mainB ? this.acc(b) : accA,
      minX: minX - reach,
      maxX: maxX + reach,
      minZ: minZ - reach,
      maxZ: maxZ + reach,
    };
  }

  // Channels and basins that might reach into the cell (ci, cj) of the node
  // grid: { segs, basins }.
  near(ci, cj) {
    const k = keyOf(ci, cj);
    let c = this.cells.get(k);
    if (c) return c;
    // an explorer's worth of land; past that, start again rather than grow
    if (this.nodes.size > 60000) this.reset();
    const C = NET.cell;
    const x0 = ci * C;
    const z0 = cj * C;
    const x1 = x0 + C;
    const z1 = z0 + C;
    const segs = [];
    const basins = [];
    // A channel runs to a neighbour, bends at most BEND m out of line, and
    // its valley reaches at most ~100 m past that: from three cells away it
    // can't reach this one. A sink's spills a further flood + 1 cells.
    const NEAR = 3;
    const R = NEAR + NET.flood + 1;
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        const n = this.node(i, j);
        const sink = !this.down(n);
        const far = Math.max(Math.abs(i - ci), Math.abs(j - cj)) > NEAR;
        if (far && !sink) continue;
        if (sink && !far) {
          const b = this.basin(n);
          if (b) {
            const r = b.maxR + b.blend + 2;
            if (b.x + r > x0 && b.x - r < x1 && b.z + r > z0 && b.z - r < z1) basins.push(b);
          }
        }
        const s = this.segment(n);
        if (s && s.maxX > x0 && s.minX < x1 && s.maxZ > z0 && s.minZ < z1) segs.push(s);
      }
    }
    c = { segs, basins };
    this.cells.set(k, c);
    return c;
  }
}

// How far above the straight line between its ends a channel's level may
// keep up with the land (m).
const SLACK = 1.5;
// The furthest (m) a channel's own bends take it from the curve through its
// nodes.
const BEND = 30;

export function basinRadius(b, th) {
  const a = b.amp;
  const p = b.ph;
  return b.R0 * (1 + a[0] * Math.sin(2 * th + p[0]) + a[1] * Math.sin(3 * th + p[1]) + a[2] * Math.sin(5 * th + p[2]));
}

function insideBasin(b, x, z) {
  const dx = x - b.x;
  const dz = z - b.z;
  return Math.hypot(dx, dz) < basinRadius(b, Math.atan2(dz, dx));
}

// Centripetal Catmull-Rom through p1..p2, with p0 and p3 either side.
const _p = { x: 0, z: 0 };
function catmullRom(x0, z0, x1, z1, x2, z2, x3, z3, t, out) {
  const d01 = Math.max(1e-3, Math.sqrt(Math.hypot(x1 - x0, z1 - z0)));
  const d12 = Math.max(1e-3, Math.sqrt(Math.hypot(x2 - x1, z2 - z1)));
  const d23 = Math.max(1e-3, Math.sqrt(Math.hypot(x3 - x2, z3 - z2)));
  // tangents at p1 and p2, scaled to the p1..p2 span
  const m1x = (x1 - x0) / d01 - (x2 - x0) / (d01 + d12) + (x2 - x1) / d12;
  const m1z = (z1 - z0) / d01 - (z2 - z0) / (d01 + d12) + (z2 - z1) / d12;
  const m2x = (x2 - x1) / d12 - (x3 - x1) / (d12 + d23) + (x3 - x2) / d23;
  const m2z = (z2 - z1) / d12 - (z3 - z1) / (d12 + d23) + (z3 - z2) / d23;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  out.x = h00 * x1 + h10 * m1x * d12 + h01 * x2 + h11 * m2x * d12;
  out.z = h00 * z1 + h10 * m1z * d12 + h01 * z2 + h11 * m2z * d12;
  return out;
}
