// Ponds, lakes, streams and rivers: where the water is, how high it stands,
// which way it runs, and how it shapes the ground around it.
//
// Pure and deterministic like the rest of WorldGen (no three.js), so the chunk
// workers, the map and the main thread all agree on every drop.
//
// Where water runs is the drainage network's business (drainage.js): streams
// run downhill from where enough land drains through them, join, grow into
// rivers, and end in ponds and lakes, which spill on down if their rims are
// low enough. This file is what that looks like on the ground:
//
//   - A channel's level is read at the nearest point on its centreline, so
//     it's the same from bank to bank, and it only ever falls on the way
//     down. It's quantised into steps: still pools joined by short ramps. On
//     a stream those are little cascades; on a river, riffles. The steps are
//     counted up from where the channel ends, so it arrives at exactly the
//     level of the lake or the stream it runs into.
//   - Where the land is higher than the water, the water cuts a valley through
//     it, wider the deeper it cuts. Just past the bank the ground always
//     stands above the water, so the only water you see is in the channel.
//   - A pond or lake fills its hollow to just under the lowest point of its
//     rim, with a beach that rises gently to meet the land. Streams come down
//     to its level at the shore, and its outflow leaves at that level.
//
// They keep away from structures: a basin isn't put near one, and running
// water fades out before it reaches a structure's clearing.
//
// Real places set into the world (landform.js) bring their own lakes, and the
// forest's own water keeps out of them: the drainage network is worked out
// over the forest's land alone, so it is the same with or without them, and
// its channels and basins give way where real land begins.
//
// In a land with a sea (sea.js) the sea stands wherever the land lies below
// its level. Rivers run out into it, and only ever deepen its bed.

import { createSimplex2, smoothstep } from '../noise.js';
import { Drainage, NET, basinRadius, channelSize } from './drainage.js';
import { LAKE_REGION, seaSurf } from './landform.js';
import { SHORE_BAND } from './sea.js';

// Level reported where there's no water at all.
export const NO_WATER = -1e4;

// Running water, from the smallest stream (SMALL) to the biggest river (BIG);
// a channel's shape is in between, by how much water it carries.
//   depth    channel depth (m) in the middle
//   ramp     the fraction of the run between steps that the cascade takes up
//   valley   width (m) of the valley: at least [0], at most [1], and [2] m of
//            width for each metre the water has cut down
//   region   how far (m) past the bank water may stand (if you dig there)
//   speed    current (m/s): base, plus this much per unit of slope
//   open     0..1 how open the sky is over it: a stream in the woods runs
//            under the leaves, a river is wide enough to see the sky
const SMALL = { depth: 0.45, ramp: 0.28, valley: [5, 28, 3], region: 2, speed: [0.3, 5], open: 0.15 };
const BIG = { depth: 1.5, ramp: 0.5, valley: [16, 80, 3.2], region: 2.5, speed: [0.35, 6], open: 0.7 };
// Height (m) of each step between pools. One for all running water, so a
// stream and the river it joins step at the same heights.
const STEP = 0.45;
// A channel is up to this much wider or narrower than its flow alone would
// make it, over stretches about WIDTH_WAVE m long: pools and narrows.
const WIDTH_VARY = 0.22;
const WIDTH_WAVE = 14;
// White water churned up in the pool at the foot of a cascade dies away over
// about this many metres.
const PLUNGE = 1.6;
const BASIN_REGION = 2.5;
const OPEN = { lake: 1, pond: 0.8 };
// Running water fades out over this many metres before real land.
export const LANDFORM_DRY = 80;
// How far (m) past a real place's outer edge it can still change the ground:
// a pond or lake of the forest's gives way when its middle is within its
// size, its beach and LANDFORM_DRY of the edge, and shapes the ground for its
// size and beach again beyond that. On the land with the biggest lakes
// (land2.js) the drainage network gives a basin at most 90 m and a beach of
// 36 m, so 2 × 128 + 80, and a little (test/hikes.test.js checks every land).
export const LANDFORM_REACH = 340;
// How far (m) past a real lake's shore it still shapes the ground.
const LAKE_BLEND = 8;
// The sea may stand (if you dig) where the land is less than this (m) above it.
const SEA_REGION = 1;
// How steep (rise per m) the shore is taken to be where it isn't worked out.
const SEA_SLOPE = 0.12;
// The surf runs this far (m) up the beach from the water's edge.
const SURF_UP = 6;

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
const mix = (a, b, t) => a + (b - a) * t;

// One channel near the point being shaped (see _hit()).
function makeHit() {
  return { d: 0, cw: 0, g: 0, W: 0, Wq: 0, above: 0, slope: 0, tx: 0, tz: 0, size: 0, river: false, depth: 0, ramp: 0, v0: 0, v1: 0, v2: 0, region: 0 };
}
const MAX_HITS = 12;

export class Water {
  constructor(gen, seed) {
    this.gen = gen;
    this.seed = seed;
    this.net = new Drainage(gen, seed);
    this.nWidth = createSimplex2((seed * 131 + 26 * 7919) >>> 0);
    this._hits = Array.from({ length: MAX_HITS }, makeHit);
    this._order = [];
    this.clear();
  }

  // ── What the last shape() / probe() found ─────────────────────────────────
  //   level   height of the water surface (NO_WATER if there's none nearby).
  //           Defined a little way past the shore too, so a water mesh can
  //           run up under the bank.
  //   region  1 where water may stand: in it, and just past the bank (a hole
  //           dug there fills up to the level). 0 elsewhere.
  //   edge    metres to the nearest shore; negative in the water
  //   kind    'river' | 'stream' | 'lake' | 'pond' | 'sea' | '' for the nearest water
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

  // The nearest water with a region owns the level; failing that, the
  // nearest water of all.
  _offer(level, region, edge, kind, fx, fz, foam, open) {
    if (edge < this.edge) {
      this.edge = edge;
      this.kind = kind;
    }
    const take = region ? !this.region || edge < this._own : !this.region && edge < this._own;
    if (!take) return;
    this.level = level;
    this.region = region;
    this._own = edge;
    this.flowX = fx;
    this.flowZ = fz;
    this.foam = foam;
    this.open = open;
  }

  // ── Running water ─────────────────────────────────────────────────────────
  // How the channel s lies at (x, z), into hit; false if it's out of reach.
  _hit(s, x, z, hit, levels) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) return false;
    const P = s.pts;
    let best = Infinity;
    let bq = 0;
    let bt = 0;
    for (let q = 0; q < s.count; q++) {
      const ax = P[q * 2];
      const az = P[q * 2 + 1];
      const dx = P[q * 2 + 2] - ax;
      const dz = P[q * 2 + 3] - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x;
      const ez = az + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2;
        bq = q;
        bt = t;
      }
    }
    const d = Math.sqrt(best);
    const S = s.s;
    const frac = (S[bq] + (S[bq + 1] - S[bq]) * bt) / S[s.count];
    const acc = s.acc0 + (s.acc1 - s.acc0) * frac;
    const size = channelSize(acc);
    const v1 = mix(SMALL.valley[1], BIG.valley[1], size);
    let cw = s.w0 + (s.w1 - s.w0) * frac;
    if (d > cw * (1 + WIDTH_VARY) + v1 + 2) return false;
    // wider here, narrower there (read on the centreline, so it's the same
    // from bank to bank), and giving way to a structure's clearing
    const px = P[bq * 2] + (P[bq * 2 + 2] - P[bq * 2]) * bt;
    const pz = P[bq * 2 + 1] + (P[bq * 2 + 3] - P[bq * 2 + 1]) * bt;
    cw *= 1 + WIDTH_VARY * this.nWidth(px / WIDTH_WAVE, pz / WIDTH_WAVE);
    cw *= smoothstep(4, 30, this.gen.padClearance(x, z));
    // (a real place's own streams run on it; the forest's give way to it)
    if (!s.real && this.gen.landforms.length) cw *= smoothstep(0, LANDFORM_DRY, this.gen.landformClearance(x, z));
    hit.d = d;
    hit.cw = cw;
    // a stream fades in at its spring, valley and all
    hit.g = smoothstep(0, 0.35, cw);
    hit.size = size;
    hit.river = acc >= NET.riverAcc;
    hit.region = mix(SMALL.region, BIG.region, size);
    if (!levels) return true;
    const W = s.W;
    hit.W = W[bq] + (W[bq + 1] - W[bq]) * bt;
    hit.slope = (W[bq] - W[bq + 1]) / Math.max(1e-3, S[bq + 1] - S[bq]);
    hit.ramp = mix(SMALL.ramp, BIG.ramp, size);
    // in the lake it flows out of, it's the lake
    hit.above = S[bq] + (S[bq + 1] - S[bq]) * bt <= s.sa ? NO_WATER : s.LB;
    hit.Wq = hit.above === NO_WATER ? hit.W : s.LB + quantise(hit.W - s.LB, STEP, hit.ramp);
    hit.depth = mix(SMALL.depth, BIG.depth, size);
    hit.v0 = mix(SMALL.valley[0], BIG.valley[0], size);
    hit.v1 = v1;
    hit.v2 = mix(SMALL.valley[2], BIG.valley[2], size);
    const tl = Math.hypot(P[bq * 2 + 2] - P[bq * 2], P[bq * 2 + 3] - P[bq * 2 + 1]) || 1;
    hit.tx = (P[bq * 2 + 2] - P[bq * 2]) / tl;
    hit.tz = (P[bq * 2 + 3] - P[bq * 2 + 1]) / tl;
    return true;
  }

  // The ground near a channel. lake: how far (m) the point is from the
  // shore of any pond or lake around it (negative in it).
  _carveLine(L, h, pm, lake) {
    const { d, cw, g, W, Wq } = L;
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
    const V = Math.min(L.v1, L.v0 + Math.max(0, cut) * L.v2);
    const s = smoothstep(cw + 0.8, cw + V, d);
    let out = h + (near + (h - near) * s - h) * g;
    // just past the bank the ground always stands above the water, so the
    // only water you see is in the channel (or in a hole you dig there)
    if (d >= cw && d < cw + L.region + 2) {
      const u = d - cw;
      const floor = Wq + 0.2 * smoothstep(0, 1.2, u) - 0.3 * Math.max(0, u - L.region) ** 2;
      if (out < floor) out = floor;
    }
    // in a pond or lake a channel only deepens the bed, it doesn't raise banks
    if (lake < 0.5) {
      const k = smoothstep(-1.5, 0.5, lake);
      out = Math.min(h, out) + (out - Math.min(h, out)) * k;
    }
    return out;
  }

  // ── Still water ───────────────────────────────────────────────────────────
  _carveBasin(b, u, R, h) {
    if (u < 0) {
      // shelving gently from the shore, then down to the deep middle; or in
      // a deep lake, out over a shelf and then steeply down to the floor
      const T = b.shelf
        ? b.level - b.shelf * (1 - Math.exp(-(-u + 0.15) / 2.5)) - (b.depth - b.shelf) * smoothstep(R * 0.1, R * 0.75, -u)
        : b.level - b.depth * (1 - Math.exp(-(-u + 0.15) / (R * 0.28)));
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

  // ── The sea ───────────────────────────────────────────────────────────────
  // Does a real place hold the land at (x, z) entirely? Its own lakes and sea
  // are what stand there, not the forest's sea; round its edge, where it
  // fades into the forest, the forest's sea may meet it.
  _realLand(x, z) {
    for (const L of this.gen.landforms) if (L.weight(x, z) >= 1) return true;
    return false;
  }

  // How far (m) it is to the shore from (x, z), where the land is u m above
  // the sea (negative out in it): across the slope of the land, near the
  // shore; further off, near enough.
  _seaEdge(x, z, u) {
    if (u <= -SHORE_BAND || u >= SHORE_BAND) return u / SEA_SLOPE;
    const g = this.gen;
    const h0 = g.forestHeight(x, z, 0);
    const slope = Math.hypot(g.forestHeight(x + 1.5, z, 0) - h0, g.forestHeight(x, z + 1.5, 0) - h0) / 1.5;
    return u / Math.max(slope, 0.02);
  }

  // ── Public ────────────────────────────────────────────────────────────────
  // A pond or lake of the forest's that would reach real land isn't there. It
  // still counts in the drainage network, so the water below it is the same.
  _givesWay(b) {
    return this.gen.landforms.length > 0 && this.gen.landformClearance(b.x, b.z) < b.maxR + b.blend + LANDFORM_DRY;
  }

  // Shapes ground of natural height h at (x, z) around any water there, and
  // describes that water (see clear()). pm is the footpath mask there.
  shape(x, z, h, pm) {
    this.clear();
    const C = NET.cell;
    const near = this.net.near(Math.floor(x / C), Math.floor(z / C));

    let lake = 1e9;
    const sea = this.gen.sea;
    if (sea && h - sea.level < SHORE_BAND && !this._realLand(x, z)) {
      const u = h - sea.level;
      lake = this._seaEdge(x, z, u);
      // (white where it breaks, and a chop further out: the foam that says
      // it's the sea, to whoever hears the surf and draws the water)
      this._offer(sea.level, u < SEA_REGION ? 1 : 0, lake, 'sea', 0, 0, lake < SURF_UP ? seaSurf(lake) : 0, 1);
    }
    for (const b of near.basins) {
      if (this._givesWay(b)) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz > (b.maxR + b.blend + 2) ** 2) continue;
      const R = basinRadius(b, Math.atan2(dz, dx));
      const u = Math.hypot(dx, dz) - R;
      if (u < lake) lake = u;
      if (u > b.blend) continue;
      h = this._carveBasin(b, u, R, h);
      this._offer(b.level, u < BASIN_REGION ? 1 : 0, u, b.kind, 0, 0, 0, OPEN[b.kind]);
    }

    // Each channel in reach carves its valley, the furthest first, so where
    // two meet the nearer one's channel wins.
    const hits = this._hits;
    const order = this._order;
    order.length = 0;
    for (const s of near.segs) {
      if (order.length >= MAX_HITS) break;
      const hit = hits[order.length];
      if (this._hit(s, x, z, hit, true)) order.push(hit);
    }
    // the streams of real places, which run into their lakes and the sea
    for (const L of this.gen.landforms) {
      const real = L.streamsNear(x, z);
      if (!real.length) continue;
      lake = Math.min(lake, L.shore(x, z));
      for (const s of real) {
        if (order.length >= MAX_HITS) break;
        const hit = hits[order.length];
        if (this._hit(s, x, z, hit, true)) order.push(hit);
      }
    }
    order.sort((a, b) => b.d - b.cw - (a.d - a.cw));
    for (const L of order) {
      h = this._carveLine(L, h, pm, lake);
      const edge = L.d - L.cw;
      const region = L.d < L.cw + L.region && L.cw > 0.05 ? 1 : 0;
      const kind = L.river ? 'river' : 'stream';
      let fx = 0;
      let fz = 0;
      let foam = 0;
      if (edge < 8) {
        // the current runs down the channel, faster where it's steep, and
        // turns white where it tumbles down a step
        let surf = 0;
        let plunge = 0;
        if (L.above !== NO_WATER) {
          const w = L.W - L.above;
          surf = L.slope * quantiseSlope(w, STEP, L.ramp);
          // how far below the foot of the last cascade this is (m)
          const f = w / STEP - Math.floor(w / STEP);
          const below = ((1 - L.ramp - f) * STEP) / Math.max(L.slope, 1e-3);
          if (below >= 0) plunge = smoothstep(0.06, 0.25, L.slope) * Math.exp(-below / PLUNGE);
        }
        const speed = (mix(SMALL.speed[0], BIG.speed[0], L.size) + L.slope * mix(SMALL.speed[1], BIG.speed[1], L.size) + surf * 3) * L.g;
        fx = L.tx * speed;
        fz = L.tz * speed;
        foam = Math.max(smoothstep(0.1, 0.45, surf), 0.6 * plunge) * L.g;
      }
      this._offer(L.Wq, region, edge, kind, fx, fz, foam, mix(SMALL.open, BIG.open, L.size));
    }

    // the lakes of real places
    for (const L of this.gen.landforms) {
      if (L.weight(x, z) <= 0) continue;
      const u = L.shore(x, z);
      if (u > LAKE_BLEND) continue;
      const level = L.level + L.offset;
      h = L.lakeBed(u, h, level, L.sea ? L.beachy(x, z) : 1);
      // (the sea is a lake that breaks on its shore)
      this._offer(level, u < LAKE_REGION ? 1 : 0, u, 'lake', 0, 0, L.sea ? L.surf(u) : 0, OPEN.lake);
    }
    return h;
  }

  // Just where the water is (edge, kind), without levels or shaping: cheap
  // enough for drawing the map zoomed out. broad: the land there without its
  // bumps, if the caller has it (gen.forestHeight), for the sea's shore.
  probe(x, z, broad = null) {
    this.clear();
    const C = NET.cell;
    const near = this.net.near(Math.floor(x / C), Math.floor(z / C));
    const sea = this.gen.sea;
    if (sea && !this._realLand(x, z)) {
      const u = (broad ?? this.gen.forestHeight(x, z, NET.routeWave)) - sea.level;
      if (u < SHORE_BAND) this._offer(NO_WATER, 0, u / SEA_SLOPE, 'sea', 0, 0, 0, 1);
    }
    for (const b of near.basins) {
      if (this._givesWay(b)) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz > (b.maxR + b.blend + 2) ** 2) continue;
      this._offer(NO_WATER, 0, Math.hypot(dx, dz) - basinRadius(b, Math.atan2(dz, dx)), b.kind, 0, 0, 0, 1);
    }
    const hit = this._hits[0];
    for (const s of near.segs) {
      if (!this._hit(s, x, z, hit, false) || hit.cw <= 0.05) continue;
      this._offer(NO_WATER, 0, hit.d - hit.cw, hit.river ? 'river' : 'stream', 0, 0, 0, 1);
    }
    for (const L of this.gen.landforms) {
      if (L.weight(x, z) <= 0) continue;
      const u = L.shore(x, z);
      if (u < LAKE_BLEND) this._offer(NO_WATER, 0, u, 'lake', 0, 0, 0, 1);
      for (const s of L.streamsNear(x, z)) {
        if (!this._hit(s, x, z, hit, false) || hit.cw <= 0.05) continue;
        this._offer(NO_WATER, 0, hit.d - hit.cw, hit.river ? 'river' : 'stream', 0, 0, 0, 1);
      }
    }
  }
}
