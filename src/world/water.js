// Ponds, lakes, streams and rivers: where the water is, how high it stands,
// which way it runs, and how it shapes the ground around it.
//
// Pure and deterministic like the rest of WorldGen (no three.js), so the chunk
// workers, the map and the main thread all agree on every drop.
//
// Running water follows the zero-isolines of warped noise, the same trick the
// footpaths use, so it winds about and never dead-ends in a T. A slow mask
// field decides which stretches of each line carry water at all; elsewhere
// the line is simply not there. Rivers are rare and broad, streams are
// narrower and more common.
//
// The hard part of water in a hilly, endless world is its level. A water
// surface has to be flat across the channel and can't tilt much along it, but
// the ground here rises and falls by 20% grades. So:
//
//   - The level is read at the nearest point on the centreline, so it's the
//     same from bank to bank.
//   - It follows a smooth version of the landform (rivers smoother than
//     streams), but never stands higher than the ground at the centreline
//     less a margin, so water is never perched on a ridge. Where the land is
//     higher, the water cuts a valley through it.
//   - It's quantised into steps: still pools joined by short ramps. On a
//     stream those are little cascades; on a river, riffles.
//
// Lakes and ponds sit on a sparse grid. Each settles into a hollow of the
// broad landform and fills it to just under the lowest point of its rim.
// They keep away from running water and from structures, and running water
// fades out before it reaches a structure's clearing.

import { createSimplex2, hash2i, mulberry32, smoothstep } from '../noise.js';

// Level reported where there's no water at all.
export const NO_WATER = -1e4;

const TAU = Math.PI * 2;

// Running water.
//   scale    wavelength (m) of the noise the centrelines follow
//   mask     wavelength of the noise deciding where there's water at all;
//   gate     ... water fades in between gate[0] and gate[1], and is at its
//            widest past gate[2]
//   half     half-width (m) of the channel: base, plus extra where it's widest
//   depth    channel depth (m) in the middle
//   drop     the smooth level sits this far under the landform
//   margin   and at least this far under the ground at the centreline
//   step     height (m) of each step between pools; ramp is the fraction of
//            the run between steps that the cascade takes up
//   valley   width (m) of the valley: at least [0], at most [1], and [2] m of
//            width for each metre the water has cut down
//   region   how far (m) past the bank water may stand (if you dig there)
//   speed    current (m/s): base, plus this much per unit of slope
//   grad     the line's field gradient below which it fades out. Where two
//            branches of a line nearly touch (a saddle in the noise) the
//            nearest-point projection can't tell them apart, so the water
//            bows out there rather than leave a crease between them.
const RIVER = {
  scale: 1500,
  mask: 2600,
  gate: [0.08, 0.3, 0.55],
  half: [3.4, 3.2],
  depth: 1.5,
  drop: 3,
  margin: 1.3,
  step: 0.35,
  ramp: 0.5,
  valley: [16, 80, 3.2],
  region: 2.5,
  speed: [0.35, 6],
  grad: [4e-4, 9e-4],
};
const STREAM = {
  scale: 420,
  mask: 900,
  gate: [0.2, 0.4, 0.62],
  half: [0.65, 0.9],
  depth: 0.45,
  drop: 0.6,
  margin: 0.55,
  step: 0.55,
  ramp: 0.28,
  valley: [5, 28, 3],
  region: 2,
  speed: [0.3, 5],
  grad: [1.3e-3, 3e-3],
};
for (const P of [RIVER, STREAM]) P.reach = P.half[0] + P.half[1] + P.valley[1];

// Still water.
//   cell     one may sit in each square cell this big (m), with this chance
//   r        radius range (m) of the shoreline before it's made irregular
//   depth    range (m) at the deepest point
const LAKE = { cell: 560, chance: 0.5, r: [26, 62], depth: [2.5, 5.5], salt: 0x1a4e };
const POND = { cell: 240, chance: 0.32, r: [6, 13], depth: [1.0, 1.7], salt: 0x90d5 };
const BASIN_REGION = 2.5;

const cellKey = (i, j) => (i + 32768) * 65536 + (j + 32768);
const OPEN = { river: 0.7, stream: 0.15, lake: 1, pond: 0.8 };

// Pools joined by ramps: the level, quantised into steps.
function quantise(w, step, ramp) {
  const f = w / step;
  const i = Math.floor(f);
  return step * (i + smoothstep(1 - ramp, 1, f - i));
}
// Slope of quantise() relative to the slope of w: 0 in a pool, steep on a ramp.
function quantiseSlope(w, step, ramp) {
  const f = w / step;
  const t = (f - Math.floor(f) - (1 - ramp)) / ramp;
  return t <= 0 || t >= 1 ? 0 : (6 * t * (1 - t)) / ramp;
}
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export class Water {
  constructor(gen, seed) {
    this.gen = gen;
    this.seed = seed;
    const n = (k) => createSimplex2((seed * 131 + k * 7919) >>> 0);
    const nRiver = n(15);
    const nRiverWA = n(16);
    const nRiverWB = n(17);
    this.nRiverMask = n(18);
    const nStream = n(19);
    this.nStreamMask = n(20);
    const nMeanderA = n(21);
    const nMeanderB = n(22);
    const nStreamWA = n(23);
    const nStreamWB = n(24);
    this.nShore = n(25);

    // A broad warp swings the lines about; a shorter one makes them meander.
    this.riverField = (x, z) => {
      const wx = x + nRiverWA(x / 900, z / 900) * 110 + nMeanderA(x / 170, z / 170) * 16;
      const wz = z + nRiverWB(x / 900, z / 900) * 110 + nMeanderB(x / 170, z / 170) * 16;
      return nRiver(wx / RIVER.scale, wz / RIVER.scale);
    };
    this.streamField = (x, z) => {
      const wx = x + nStreamWA(x / 400, z / 400) * 45 + nMeanderA(x / 60 + 31.7, z / 60) * 5;
      const wz = z + nStreamWB(x / 400, z / 400) * 45 + nMeanderB(x / 60 + 31.7, z / 60) * 5;
      return nStream(wx / STREAM.scale, wz / STREAM.scale);
    };

    this.lakes = new Map();
    this.ponds = new Map();
    this._river = {};
    this._stream = {};
    this._lv = { big: 0, o0: 0, o1: 0, base: 0 };
    this.clear();
  }

  // ── What the last shape() / probe() found ─────────────────────────────────
  //   level   height of the water surface (NO_WATER if there's none nearby).
  //           Defined a little way past the shore too, so a water mesh can
  //           run up under the bank.
  //   region  1 where water may stand: in it, and just past the bank (a hole
  //           dug there fills up to the level). 0 elsewhere.
  //   edge    metres to the nearest shore; negative in the water
  //   kind    'river' | 'stream' | 'lake' | 'pond' | '' for the nearest water
  //   flowX, flowZ  the current (m/s); 0 in still water
  //   foam    0..1, white water on cascades
  //   open    0..1 how open the sky is over it: a stream in the woods runs
  //           under the leaves, a lake lies in the open
  clear() {
    this.level = NO_WATER;
    this.region = 0;
    this.edge = 1e9;
    this.kind = '';
    this.flowX = 0;
    this.flowZ = 0;
    this.foam = 0;
    this.open = 1;
    this._own = 1e9; // edge of the water that owns `level`
  }

  _offer(level, region, edge, kind, fx, fz, foam) {
    if (edge < this.edge) {
      this.edge = edge;
      this.kind = kind;
    }
    const take = region ? !this.region || level > this.level : !this.region && edge < this._own;
    if (!take) return;
    this.level = level;
    this.region = region;
    this._own = edge;
    this.flowX = fx;
    this.flowZ = fz;
    this.foam = foam;
    this.open = OPEN[kind];
  }

  // ── Running water ─────────────────────────────────────────────────────────
  // Nearest point on a line of running water, or false if it's out of reach.
  _line(field, P, maskNoise, x, z, out) {
    const mask = maskNoise(x / P.mask, z / P.mask);
    let g = smoothstep(P.gate[0], P.gate[1], mask);
    if (g <= 0) return false;
    const v = field(x, z);
    const e = 0.5;
    const gx = (field(x + e, z) - v) / e;
    const gz = (field(x, z + e) - v) / e;
    const g2 = gx * gx + gz * gz + 1e-14;
    const gl = Math.sqrt(g2);
    const d = Math.abs(v) / gl;
    if (d > P.reach) return false;
    g *= smoothstep(P.grad[0], P.grad[1], gl);
    // and gives way to a structure's clearing
    g *= smoothstep(4, 30, this.gen.padClearance(x, z));
    if (g <= 0) return false;
    // one Newton step onto the line; far from it this is only approximate,
    // which is fine, it's only used there to blend the valley sides
    let ox = (-v * gx) / g2;
    let oz = (-v * gz) / g2;
    const ol = Math.hypot(ox, oz);
    if (ol > P.reach) {
      ox *= P.reach / ol;
      oz *= P.reach / ol;
    }
    const wide = smoothstep(P.gate[1], P.gate[2], mask);
    out.d = d;
    out.cx = x + ox;
    out.cz = z + oz;
    out.tx = -gz / gl;
    out.tz = gx / gl;
    out.g = g;
    out.cw = g * (P.half[0] + P.half[1] * wide);
    out.depth = P.depth * (0.65 + 0.35 * wide);
    return true;
  }

  // The landform at (x, z), split up the way the water levels need it.
  _landform(x, z) {
    const g = this.gen;
    const lv = this._lv;
    const wx = x + g.nWarpA(x * 0.0016, z * 0.0016) * 70;
    const wz = z + g.nWarpB(x * 0.0016, z * 0.0016) * 70;
    lv.big = g.nBig(x * 0.0007, z * 0.0007) * 36;
    // the octaves of fbm(nHills, ·, ·, 5) in WorldGen._baseHeight
    let sum = 0;
    let amp = 1;
    let f = 0.0032;
    for (let o = 0; o < 5; o++) {
      sum += amp * g.nHills(wx * f + o * 17.31, wz * f - o * 9.13);
      if (o === 0) lv.o0 = (sum / 1.9375) * 24;
      else if (o === 1) lv.o1 = (sum / 1.9375) * 24 - lv.o0;
      amp *= 0.5;
      f *= 2;
    }
    lv.base = lv.big + (sum / 1.9375) * 24;
    return lv;
  }

  // Smooth (unstepped) water level of a river / stream line at a point on it.
  riverLevel(x, z) {
    const lv = this._landform(x, z);
    return smin(lv.big + 0.5 * lv.o0 - RIVER.drop, lv.base - RIVER.margin, 2);
  }

  streamLevel(x, z) {
    const lv = this._landform(x, z);
    return smin(lv.big + lv.o0 + lv.o1 - STREAM.drop, lv.base - STREAM.margin, 1);
  }

  // The ground near a line of running water. W is the smooth level, Wq the
  // stepped one the water actually stands at.
  _carveLine(L, P, h, pm, W, Wq) {
    const { d, cw, g } = L;
    // fords where a footpath crosses
    const D = L.depth * (1 - 0.65 * pm);
    let near;
    if (d < cw) {
      const t = d / cw;
      near = Wq - D * Math.pow(1 - t * t, 0.7);
    } else {
      // the bank steps down with the pools right at the water, but further
      // up it follows the smooth level, so the valley sides aren't terraced
      const u = d - cw;
      near = Wq + (W - Wq) * smoothstep(0, 2.5, u) + 0.3 * smoothstep(0, 1.5, u) + 0.06 * u;
    }
    // the deeper the cut, the wider the valley, so its sides stay walkable
    const cut = h - W;
    const V = Math.min(P.valley[1], P.valley[0] + Math.max(0, cut) * P.valley[2]);
    const s = smoothstep(cw + 0.8, cw + V, d);
    let out = h + (near + (h - near) * s - h) * g;
    // just past the bank the ground always stands above the water, so the
    // only water you see is in the channel (or in a hole you dig there)
    if (d >= cw && d < cw + P.region + 2) {
      const u = d - cw;
      const floor = Wq + 0.2 * smoothstep(0, 1.2, u) - 0.3 * Math.max(0, u - P.region) ** 2;
      if (out < floor) out = floor;
    }
    return out;
  }

  // Current along a line, from the slope of its level, and white water where
  // it tumbles down a step.
  _flow(L, P, levelFn, W, sign) {
    const e = 2;
    const a = levelFn(L.cx + L.tx * e, L.cz + L.tz * e);
    const b = levelFn(L.cx - L.tx * e, L.cz - L.tz * e);
    const slope = (a - b) / (2 * e);
    const s = Math.abs(slope);
    const surf = s * quantiseSlope(W, P.step, P.ramp);
    const speed = (P.speed[0] + s * P.speed[1] + surf * 3) * L.g;
    const dir = (slope > 0 ? -1 : 1) * sign;
    return { fx: L.tx * dir * speed, fz: L.tz * dir * speed, foam: smoothstep(0.1, 0.45, surf) * L.g };
  }

  // ── Still water ───────────────────────────────────────────────────────────
  _basin(i, j, P, cache) {
    const k = cellKey(i, j);
    let b = cache.get(k);
    if (b !== undefined) return b;
    b = this._makeBasin(i, j, P);
    cache.set(k, b);
    return b;
  }

  _makeBasin(i, j, P) {
    const rng = mulberry32(hash2i(i, j, (this.seed ^ P.salt) >>> 0));
    if (rng() > P.chance) return null;
    const g = this.gen;
    const C = P.cell;
    const R0 = P.r[0] + (P.r[1] - P.r[0]) * rng() ** 1.4;
    const amp = [0.1 + rng() * 0.12, rng() * 0.1, rng() * 0.07];
    const ph = [rng() * TAU, rng() * TAU, rng() * TAU];
    const depth = P.depth[0] + (P.depth[1] - P.depth[0]) * rng();
    const maxR = R0 * (1 + amp[0] + amp[1] + amp[2]);
    // Keep the whole thing, banks and all, inside its own cell.
    const m = Math.min(C * 0.45, maxR + 45);
    const lo = (v0) => v0 + m;
    const hi = (v0) => v0 + C - m;
    let x = lo(i * C) + rng() * (C - 2 * m);
    let z = lo(j * C) + rng() * (C - 2 * m);
    // Roll downhill on the broad landform to settle into a hollow.
    for (let it = 0; it < 28; it++) {
      const h0 = g.broadHeight(x, z, 60);
      const hx = g.broadHeight(x + 3, z, 60) - h0;
      const hz = g.broadHeight(x, z + 3, 60) - h0;
      const gl = Math.hypot(hx, hz);
      if (gl < 0.01) break;
      x = Math.min(hi(i * C), Math.max(lo(i * C), x - (hx / gl) * 7));
      z = Math.min(hi(j * C), Math.max(lo(j * C), z - (hz / gl) * 7));
    }
    const b = { x, z, R0, amp, ph, depth, maxR, level: 0, blend: 0, kind: P === LAKE ? 'lake' : 'pond' };
    if (g.padClearance(x, z) < maxR + 30) return null;
    if (this._flowNear(x, z, maxR + 30)) return null;
    if (P === POND) {
      const L = LAKE.cell;
      const li = Math.floor(x / L);
      const lj = Math.floor(z / L);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const l = this._basin(li + di, lj + dj, LAKE, this.lakes);
          if (l && Math.hypot(l.x - x, l.z - z) < l.maxR + l.blend + maxR + 25) return null;
        }
      }
    }
    // Fill it to just under the lowest point of its rim.
    let rimMin = Infinity;
    let rimMax = -Infinity;
    for (let s = 0; s < 40; s++) {
      const th = (s / 40) * TAU;
      const r = this._radius(b, th) + 1.5;
      const hn = g.naturalHeight(x + Math.cos(th) * r, z + Math.sin(th) * r);
      if (hn < rimMin) rimMin = hn;
      if (hn > rimMax) rimMax = hn;
    }
    b.level = rimMin - 0.25;
    b.blend = Math.min(36, Math.max(7, (rimMax - b.level) * 2.4));
    return b;
  }

  _radius(b, th) {
    const a = b.amp;
    const p = b.ph;
    return b.R0 * (1 + a[0] * Math.sin(2 * th + p[0]) + a[1] * Math.sin(3 * th + p[1]) + a[2] * Math.sin(5 * th + p[2]));
  }

  // Is there running water (or the valley it cuts) within r of (x, z)?
  _flowNear(x, z, r) {
    const tmp = {};
    const n = 5;
    const sp = (2 * r) / (n - 1);
    for (let jj = 0; jj < n; jj++) {
      for (let ii = 0; ii < n; ii++) {
        const px = x - r + ii * sp;
        const pz = z - r + jj * sp;
        if (this._line(this.riverField, RIVER, this.nRiverMask, px, pz, tmp) && tmp.d < tmp.cw + RIVER.valley[1] * 0.6 + sp) return true;
        if (this._line(this.streamField, STREAM, this.nStreamMask, px, pz, tmp) && tmp.d < tmp.cw + STREAM.valley[1] + sp) return true;
      }
    }
    return false;
  }

  // Calls fn(basin) for each lake and pond whose banks might reach (x, z).
  _forBasins(x, z, fn) {
    for (const [P, cache] of [
      [LAKE, this.lakes],
      [POND, this.ponds],
    ]) {
      const i0 = Math.floor(x / P.cell);
      const j0 = Math.floor(z / P.cell);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const b = this._basin(i0 + di, j0 + dj, P, cache);
          if (!b) continue;
          const dx = x - b.x;
          const dz = z - b.z;
          if (dx * dx + dz * dz > (b.maxR + b.blend + 2) ** 2) continue;
          fn(b, dx, dz);
        }
      }
    }
  }

  _carveBasin(b, u, R, h) {
    if (u < 0) {
      // shelving gently from the shore, then down to the deep middle
      const T = b.level - b.depth * (1 - Math.exp(-(-u + 0.15) / (R * 0.28)));
      return Math.min(h, T) + (T - Math.min(h, T)) * smoothstep(-R * 0.3, 0, u);
    }
    // a beach that rises gently, then meets the land
    const T = b.level + 0.22 * smoothstep(0, 2, u) + 0.07 * u;
    let out = T + (h - T) * smoothstep(0, b.blend, u);
    if (u < BASIN_REGION + 2) {
      const floor = b.level + 0.2 * smoothstep(0, 1.2, u) - 0.3 * Math.max(0, u - BASIN_REGION) ** 2;
      if (out < floor) out = floor;
    }
    return out;
  }

  // ── Public ────────────────────────────────────────────────────────────────
  // Shapes ground of natural height h at (x, z) around any water there, and
  // describes that water (see clear()). pm is the footpath mask there.
  shape(x, z, h, pm) {
    this.clear();
    const R = this._river;
    const S = this._stream;

    let riverWq = 0;
    let riverS = 1; // 0 in the river's channel, 1 outside its valley
    if (this._line(this.riverField, RIVER, this.nRiverMask, x, z, R)) {
      const W = this.riverLevel(R.cx, R.cz);
      const Wq = quantise(W, RIVER.step, RIVER.ramp);
      h = this._carveLine(R, RIVER, h, pm, W, Wq);
      riverWq = Wq;
      const V = RIVER.valley[1];
      riverS = 1 - (1 - smoothstep(R.cw + 0.8, R.cw + V * 0.5, R.d)) * R.g;
      const region = R.d < R.cw + RIVER.region && R.cw > 0.05 ? 1 : 0;
      let f = null;
      if (R.d < R.cw + 8) f = this._flow(R, RIVER, (px, pz) => this.riverLevel(px, pz), W, 1);
      this._offer(Wq, region, R.d - R.cw, 'river', f ? f.fx : 0, f ? f.fz : 0, f ? f.foam : 0);
    }

    if (this._line(this.streamField, STREAM, this.nStreamMask, x, z, S)) {
      let W = this.streamLevel(S.cx, S.cz);
      // a stream running into a river comes down to meet it
      if (riverS < 1) W = riverWq + (W - riverWq) * riverS;
      const Wq = quantise(W, STREAM.step, STREAM.ramp);
      h = this._carveLine(S, STREAM, h, pm, W, Wq);
      const region = S.d < S.cw + STREAM.region && S.cw > 0.05 ? 1 : 0;
      let f = null;
      if (S.d < S.cw + 6) f = this._flow(S, STREAM, (px, pz) => this.streamLevel(px, pz), W, 1);
      this._offer(Wq, region, S.d - S.cw, 'stream', f ? f.fx : 0, f ? f.fz : 0, f ? f.foam : 0);
    }

    this._forBasins(x, z, (b, dx, dz) => {
      const R = this._radius(b, Math.atan2(dz, dx));
      const u = Math.hypot(dx, dz) - R;
      if (u > b.blend) return;
      h = this._carveBasin(b, u, R, h);
      this._offer(b.level, u < BASIN_REGION ? 1 : 0, u, b.kind, 0, 0, 0);
    });
    return h;
  }

  // Just where the water is (edge, kind), without levels or shaping: cheap
  // enough for drawing the map zoomed out.
  probe(x, z) {
    this.clear();
    const R = this._river;
    if (this._line(this.riverField, RIVER, this.nRiverMask, x, z, R)) this._offer(NO_WATER, 0, R.d - R.cw, 'river', 0, 0, 0);
    const S = this._stream;
    if (this._line(this.streamField, STREAM, this.nStreamMask, x, z, S)) this._offer(NO_WATER, 0, S.d - S.cw, 'stream', 0, 0, 0);
    this._forBasins(x, z, (b, dx, dz) => {
      const u = Math.hypot(dx, dz) - this._radius(b, Math.atan2(dz, dx));
      this._offer(NO_WATER, 0, u, b.kind, 0, 0, 0);
    });
  }
}
