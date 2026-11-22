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
//   - Where a channel big enough to float a raft falls steeply from one node
//     to the next, most of that fall is gathered into a rapid: a pool above,
//     the water sliding away over the lip into a run of fast white water,
//     and out into a pool below (RAPID, and rapid() below). The segment still
//     begins and ends at the same levels, so nothing else moves.
//   - Where the land is higher than the water, the water cuts a valley through
//     it, wider the deeper it cuts. Just past the bank the ground always
//     stands above the water, so the only water you see is in the channel.
//   - A pond or lake fills its hollow to just under the lowest point of its
//     rim, with a beach that rises gently to meet the land. Streams come down
//     to its level at the shore, and its outflow leaves at that level.
//   - Up in the high country's snow (worldgen.js) there is ice instead of
//     water: a channel is filled to its level and snowed over, a hollow holds
//     a snowfield rather than a tarn, and a channel carrying enough of it is
//     cut into a glacial trough — a floor below the stream's own bed and
//     walls rising hundreds of metres out. Because the network only ever runs
//     downhill and the ice cuts deeper the more of it there is, a trough falls
//     from its head to its foot without a counter-slope: which is what you
//     ski down (TROUGH in drainage.js, _carveTrough below).
//
// They keep away from structures: a basin isn't put near one, and running
// water fades out before it reaches a structure's clearing.
//
// Real places set into the world (landform.js) bring their own lakes, and the
// forest's own water keeps out of them: the drainage network is worked out
// over the forest's land alone, so it is the same with or without them, and
// its channels and basins give way where real land begins. Where a real
// place is frozen (a country in winter), its lakes are flat ice at their
// level and its streams are filled to theirs between their banks, all
// snowed over: the ground is there, and no water is.
//
// In a land with a sea (sea.js) the sea stands wherever the land lies below
// its level. Rivers run out into it, and only ever deepen its bed.

import { createSimplex2, hash2i, mulberry32, smoothstep } from '../noise.js';
import { Drainage, NET, basinRadius, channelSize, TROUGH, troughFlow, troughReach } from './drainage.js';
import { LAKE_REGION, ICE, seaSurf } from './landform.js';
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
// Above the snow line a channel is not a stream cutting a notch: it is where
// the ice went, and what it leaves is a glacial trough — a floor cut below
// the stream's own bed, walls rising as a parabola to the rim. The drainage
// network only ever runs downhill, all the way down, and a trough's floor
// falls faster still, because the ice cuts deeper the more of it there is:
// so a trough descends from its head to its foot without a counter-slope
// anywhere, which is what makes a run of it rather than a slope that points
// downhill and then doesn't. Its shape is TROUGH, in drainage.js.
// Height (m) of each step between pools. One for all running water, so a
// stream and the river it joins step at the same heights.
export const STEP = 0.45;
// A channel is up to this much wider or narrower than its flow alone would
// make it, over stretches about WIDTH_WAVE m long: pools and narrows.
const WIDTH_VARY = 0.22;
const WIDTH_WAVE = 14;
// A real place's stream (landform.js) steeper than this, rise over run, is
// falling rather than running: white all over between the two, as a
// waterfall is (falls/ draws the falling water on it). The forest's own never
// is that steep.
const FALLING = [0.7, 1.5];
// White water churned up in the pool at the foot of a cascade dies away over
// about this many metres.
const PLUNGE = 1.6;
// Rapids: where one segment of a channel (node to node, see drainage.js)
// gathers most of its fall into one stretch. The stretch below the lip
// falls steadily and fast, the pools above and below it hardly at all, and
// the whole of it still falls from the level at one node to the level at
// the next.
//   acc      nodes of catchment a channel needs: about four metres across,
//            room for a raft
//   run      the least running length (m) a segment needs, out of its lakes
//   grade    the segment's fall over its running length (rise per m) at which
//            a rapid begins to be likely, and is as likely as it gets...
//   chance   ...which is this likely
//   steep    a segment steeper than this (rise per m) is left a staircase of
//            cascades: a mountain creek, not a river you'd run
//   lip      [least, most] of the running length down from the node above
//            at which the lip is
//   share    [least, most] of the fall still to come below the lip that the
//            rapid takes
//   length   [least, most] of the running length it takes...
//   most     ...longer if it would otherwise be steeper than this (rise per m)
//   shortest the shortest a rapid is (m)
//   over     m the smooth level may fall below the rapid's own fall, looked
//            at every `check` m down it, before the land is too steep for one
//   tries    how many places along the segment a lip is tried
//   ease     0..1 how much the run steepens through its middle, rather than
//            falling evenly lip to foot
//   entry    the share of it from the lip in which the current gathers pace
//   speed    current (m/s) in it per square root of its gradient: smallest
//            channel, biggest river
//   runout   m below its foot over which its current and white water die away
//   white    [gradient at which it starts to break white, and is white through]
const RAPID = {
  acc: 24,
  run: 30,
  grade: [0.004, 0.018],
  chance: 0.85,
  steep: 0.1,
  lip: [0.04, 0.4],
  share: [0.5, 0.95],
  length: [0.25, 0.5],
  most: 0.07,
  shortest: 12,
  over: 0.25,
  check: 2,
  tries: 3,
  ease: 0.5,
  entry: 0.15,
  speed: [15, 20],
  runout: 9,
  white: [0.012, 0.045],
};
// The fastest any running water goes (m/s): a real stream falling off a
// cliff would otherwise run at the speed of a car.
export const FASTEST = 6.5;
const BASIN_REGION = 2.5;
const OPEN = { lake: 1, pond: 0.8 };
// Running water fades out over this many metres before real land.
export const LANDFORM_DRY = 80;
// How far (m) past a real place's outer edge it can still change the ground:
// a pond or lake of the forest's gives way when its middle is within its
// size, its beach and LANDFORM_DRY of the edge, and shapes the ground for its
// size and beach again beyond that. On the land with the biggest lakes
// (worldgen.js) the drainage network gives a basin at most 90 m and a beach of
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

// Less than this (m) of fall is none at all.
const FLAT = 1e-3;
// A segment's level with its rapid in it (r, from Water.rapid), at s m
// along its centreline where the smooth level stands w m over its lower
// end, into out:
//   Q     m over the lower end. In the rapid, the level itself: from the
//         lip it falls away, steepest through the middle, but never stands
//         over the smooth level. Above and below it, where the level is put
//         before it's quantised into pools and steps as anywhere: the pool
//         below sits a little lower than the smooth level, the one above
//         falls to the lip.
//   dq    dQ/dw there: how much faster than the smooth level it falls
//   t     0..1 how far down the rapid, from its lip to its foot; -1 above
//         it (upstream), 2 below it
// Lip and foot stand at whole steps, so it meets the pools and steps either
// side without a seam; and it is the same as w at both ends of the
// segment, so the level still only falls, from the same level to the same.
function warp(r, s, w, out) {
  if (s <= r.s0) {
    // (where the lip is in a stretch the smooth level doesn't fall at all,
    // the pool above stands at the lip's level all the way up)
    const k = r.D - r.wb > FLAT ? (r.D - r.Qb) / (r.D - r.wb) : 0;
    out.Q = r.Qb + Math.max(0, w - r.wb) * k;
    out.dq = k;
    out.t = -1;
  } else if (s >= r.s1) {
    const k = r.wa > 0 ? r.Qa / r.wa : 0;
    out.Q = Math.min(w, r.wa) * k;
    out.dq = k;
    out.t = 2;
  } else {
    const t = (s - r.s0) / (r.s1 - r.s0);
    const e = t + RAPID.ease * (t * t * (3 - 2 * t) - t);
    out.Q = Math.min(r.Qb - (r.Qb - r.Qa) * e, Math.max(w, r.Qa));
    out.dq = 0;
    out.t = t;
  }
  return out;
}
const _q = { Q: 0, dq: 1, t: -1 };

// One channel near the point being shaped (see _hit()).
function makeHit() {
  return { d: 0, cw: 0, g: 0, keep: 1, W: 0, Wq: 0, bank: 0, above: 0, slope: 0, tx: 0, tz: 0, size: 0, river: false, real: false, depth: 0, ramp: 0, v0: 0, v1: 0, v2: 0, region: 0, rapid: null, s: 0, Q: 0, dq: 1, rt: -1 };
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
    if (d > cw * (1 + WIDTH_VARY) + v1 + troughReach(acc, s.W[bq]) + 2) return false;
    // wider here, narrower there (read on the centreline, so it's the same
    // from bank to bank), and giving way to a structure's clearing
    const px = P[bq * 2] + (P[bq * 2 + 2] - P[bq * 2]) * bt;
    const pz = P[bq * 2 + 1] + (P[bq * 2 + 3] - P[bq * 2 + 1]) * bt;
    cw *= 1 + WIDTH_VARY * this.nWidth(px / WIDTH_WAVE, pz / WIDTH_WAVE);
    // (a structure's: not the clearing kept round where a hike's photo was
    // taken, which is for trees, and may be on the bank of the very stream)
    cw *= smoothstep(4, 30, this.gen.padClearance(x, z, false));
    // (a real place's own streams run on it; the forest's give way to it,
    // banks and all)
    let keep = 1;
    if (!s.real && this.gen.landforms.length) cw *= keep = smoothstep(0, LANDFORM_DRY, this.gen.landformClearance(x, z));
    // (and where it has given way altogether it isn't there: not its water,
    // its level or its banks, however near its line runs)
    if (keep <= 0) return false;
    hit.keep = keep;
    hit.d = d;
    hit.cw = cw;
    hit.frozen = !!s.frozen;
    hit.real = !!s.real;
    // Up above the snow line it is ice, not water: the channel is filled to
    // its level and snowed over, and its valley becomes a trough. The snow
    // line is read at the point being shaped, not on the centreline, because
    // it is already worked out there and moves by metres over a channel's
    // width. A real place brings its own weather, and is left alone.
    // Up in the high country's snow a channel is ice, not water: filled to
    // its level and snowed over, and where it carries enough of it, cut into
    // a trough. It takes the high country for that — snow that lies deep and
    // lies all year. The forest's own tops hold fifty metres of it and keep
    // their streams, and a real place brings its own weather and is left
    // alone.
    hit.trough = 0;
    hit.flow = 0;
    if (!s.real) {
      const alp = this.gen.country ? this.gen.country(x, z).alp : 0;
      const over = alp > 0 ? s.W[bq] - this.gen.snowline(x, z) : -1;
      if (over > 0) {
        hit.frozen = true;
        // how much of a trough: how far above the snow line the channel runs,
        // and how much ice it carries. A small channel up there is still
        // frozen, but no trough is cut from it.
        hit.flow = troughFlow(s.acc1);
        hit.trough = smoothstep(0, TROUGH.from, over) * hit.flow * alp;
      }
    }
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
    // pools and steps; and where the segment has a rapid, the fall gathered
    // into it (in the rapid itself, not quantised: it falls all the way)
    const r = (hit.rapid = this.rapid(s));
    hit.Q = hit.W - s.LB;
    hit.dq = 1;
    hit.rt = -1;
    hit.s = S[bq] + (S[bq + 1] - S[bq]) * bt;
    if (r && hit.above !== NO_WATER) {
      warp(r, hit.s, hit.Q, _q);
      hit.Q = _q.Q;
      hit.dq = _q.dq;
      hit.rt = _q.t;
    }
    hit.Wq = hit.above === NO_WATER ? hit.W : s.LB + (hit.rt >= 0 && hit.rt <= 1 ? hit.Q : quantise(hit.Q, STEP, hit.ramp));
    // what the bank follows a little way back from the water: the smooth
    // level, or the water's where a rapid holds it higher
    hit.bank = r ? Math.max(hit.W, hit.Wq) : hit.W;
    hit.depth = mix(SMALL.depth, BIG.depth, size);
    hit.v0 = mix(SMALL.valley[0], BIG.valley[0], size);
    hit.v1 = v1;
    hit.v2 = mix(SMALL.valley[2], BIG.valley[2], size);
    const tl = Math.hypot(P[bq * 2 + 2] - P[bq * 2], P[bq * 2 + 3] - P[bq * 2 + 1]) || 1;
    hit.tx = (P[bq * 2 + 2] - P[bq * 2]) / tl;
    hit.tz = (P[bq * 2 + 3] - P[bq * 2 + 1]) / tl;
    return true;
  }

  // The rapid on segment s (drainage.js), or null; the same for anyone who
  // asks, kept on the segment once worked out. Grown from the seed and the
  // segment's own node, its fall and its running length:
  //   D        m the segment falls, from node to node
  //   wa, wb   how high the smooth level stands over the segment's lower
  //            end at the rapid's foot and its lip (m)
  //   Qa, Qb   where the water stands at them, over the lower end (m): whole
  //            steps, and no higher than the smooth level
  //   drop     m the rapid falls
  //   s0, s1   m along the segment's centreline of its lip and its foot
  //   grade    its fall over its length (rise per m)
  //   acc      nodes of catchment the segment carries
  rapid(s) {
    if (s.rapid !== undefined) return s.rapid;
    s.rapid = null;
    // (only on the main stem: a side stream coming into a bigger one runs
    // alongside it for a way, and two rivers side by side at different
    // levels is a wall of water)
    if (s.real || s.acc0 < RAPID.acc || s.acc1 === s.acc0) return null;
    // (nor where it runs out into the sea: a river comes down to the sea
    // over its own flats, and what's steep there is the coast)
    if (this.net.isSea(s.b) || s.b.toSea) return null;
    const run = s.sb - s.sa;
    const D = s.LA - s.LB;
    if (run < RAPID.run || D < STEP) return null;
    const G = D / run;
    if (G > RAPID.steep) return null;
    // (and not up in the snow, where it's ice: see _hit)
    const g = this.gen;
    if (g.country) {
      for (const q of [0, s.count]) {
        const x = s.pts[q * 2];
        const z = s.pts[q * 2 + 1];
        if (g.country(x, z).alp > 0 && s.W[q] > g.snowline(x, z)) return null;
      }
    }
    const rng = mulberry32(hash2i(s.a.i, s.a.j, (this.seed ^ 0x7a91d3) >>> 0));
    const chance = rng();
    const share = mix(RAPID.share[0], RAPID.share[1], rng());
    const long = mix(RAPID.length[0], RAPID.length[1], rng());
    const at = mix(RAPID.lip[0], RAPID.lip[1], rng());
    if (chance > RAPID.chance * smoothstep(RAPID.grade[0], RAPID.grade[1], G)) return null;
    // the smooth level over the lower end, m along the centreline
    const level = (x) => {
      const S = s.s;
      let q = 0;
      while (q < s.count - 1 && S[q + 1] < x) q++;
      const t = Math.max(0, Math.min(1, (x - S[q]) / Math.max(1e-6, S[q + 1] - S[q])));
      return s.W[q] + (s.W[q + 1] - s.W[q]) * t - s.LB;
    };
    const whole = (w) => Math.floor(w / STEP + 1e-9) * STEP;
    // The lip: a whole step under the smooth level there. From it, a share
    // of what's left of the fall, over a share of the running length, or
    // longer if it would be steeper than `most`; and the foot a whole step
    // under the smooth level where it ends, so the pool below never stands
    // over it. Where the land falls away faster than the rapid would, the
    // water, kept under it, would fall with it, steeper than any rapid: so
    // the lip is tried in a few places (the first at `at`), and if it fits
    // in none of them the segment is left as it was.
    for (let k = 0; k < RAPID.tries; k++) {
      const s0 = s.sa + (k ? mix(RAPID.lip[0], RAPID.lip[1], rng()) : at) * run;
      const wb = level(s0);
      const Qb = whole(wb);
      let Qa = Qb - Math.max(1, Math.round((Qb * share) / STEP)) * STEP;
      let s1 = s0;
      for (let i = 0; i < 3; i++) {
        s1 = Math.min(s.sb, s0 + Math.max(long * run, (Qb - Qa) / RAPID.most));
        Qa = Math.min(Qa, whole(level(s1)));
      }
      Qa = Math.max(0, Qa);
      const drop = Qb - Qa;
      const len = s1 - s0;
      if (drop < STEP - 1e-9 || len < RAPID.shortest || drop / len < RAPID.white[0]) continue;
      let fits = true;
      for (let x = s0; x <= s1 && fits; x += RAPID.check) {
        const t = (x - s0) / len;
        fits = Qb - drop * (t + RAPID.ease * (t * t * (3 - 2 * t) - t)) <= level(x) + RAPID.over;
      }
      if (!fits) continue;
      s.rapid = { D, s0, s1, wa: level(s1), wb, Qa, Qb, drop, grade: drop / len, acc: s.acc0 };
      break;
    }
    return s.rapid;
  }

  // The ground near a channel: what the stream cuts, and over it what the ice
  // left, by how far above the snow line the channel runs. Blended rather
  // than chosen between, so a channel coming down off a massif loses its
  // trough and finds its notch without a seam where the two meet.
  _carveLine(L, h, pm, lake) {
    const stream = this._carveStream(L, h, pm, lake);
    if (L.trough <= 0) return stream;
    return stream + (this._carveTrough(L, h) - stream) * L.trough;
  }

  // A U-section: a floor cut below the stream's own bed, deeper and wider the
  // more ice the channel carries, rising as a parabola to meet the land at the
  // rim. It only ever cuts down — a trough never stands the ground higher than
  // it found it.
  _carveTrough(L, h) {
    const V = mix(TROUGH.wide[0], TROUGH.wide[1], L.flow);
    if (L.d >= V) return h;
    const floor = L.Wq - TROUGH.deep * L.flow;
    // The rim is the land, or the channel's own level where the land is below
    // it: so the floor is where the ice put it however the ground happens to
    // dip, and the walls still rise to meet whatever is standing there.
    const rim = Math.max(h, L.Wq);
    const t = L.d / V;
    const u = floor + (rim - floor) * t * t;
    return h + Math.min(0, u - h) * L.g;
  }

  // The ground near a channel. lake: how far (m) the point is from the
  // shore of any pond or lake around it (negative in it).
  _carveStream(L, h, pm, lake) {
    const { d, cw, g, W, Wq, bank } = L;
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
      near = Wq + (bank - Wq) * smoothstep(0, 2.5, u) + 0.3 * smoothstep(0, 1.5, u) + 0.06 * u;
    }
    // the deeper the cut, the wider the valley, so its sides stay walkable
    const cut = h - W;
    const V = Math.min(L.v1, L.v0 + Math.max(0, cut) * L.v2);
    const s = smoothstep(cw + 0.8, cw + V, d);
    let out = h + (near + (h - near) * s - h) * g;
    // just past the bank the ground always stands above the water, so the
    // only water you see is in the channel (or in a hole you dig there);
    // as far as the channel is there at all (keep: one of the forest's gives
    // way on real land, which may lie far below its water: a canyon)
    if (d >= cw && d < cw + L.region + 2) {
      const u = d - cw;
      const floor = Wq + 0.2 * smoothstep(0, 1.2, u) - 0.3 * Math.max(0, u - L.region) ** 2;
      if (out < floor) out += (floor - out) * L.keep;
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
      // A hollow up above the snow line holds no tarn: it is a snowfield,
      // flat at its level and snowed over, which is what a cirque at the head
      // of a trough comes out as. (Read at its middle, so the whole of it
      // decides together.) The drainage leaves a deep hollow without an
      // outlet (drainage.js); up there that is the right answer.
      if (this.gen.country && this.gen.country(b.x, b.z).alp > 0 && b.level > this.gen.snowline(b.x, b.z)) {
        h = Math.max(h, b.level - ICE.under);
        continue;
      }
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
      // frozen: the channel filled to its water's level between its banks,
      // and no water in it
      if (L.frozen) {
        // A trough's floor is the ground, cut below the channel's level on
        // purpose; anything else frozen is filled up to its level and snowed
        // over, with no water in it.
        if (L.trough <= 0 && L.d < L.cw + ICE.bank) h = Math.max(h, L.Wq - ICE.under);
        continue;
      }
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
        // how fast it falls through the pools and steps here (rise per m)
        const slope = L.slope * L.dq;
        if (L.above !== NO_WATER && !(L.rt >= 0 && L.rt <= 1)) {
          const w = L.Q;
          surf = slope * quantiseSlope(w, STEP, L.ramp);
          // how far below the foot of the last cascade this is (m)
          const f = w / STEP - Math.floor(w / STEP);
          const below = ((1 - L.ramp - f) * STEP) / Math.max(slope, 1e-3);
          if (below >= 0) plunge = smoothstep(0.06, 0.25, slope) * Math.exp(-below / PLUNGE);
        }
        let speed = mix(SMALL.speed[0], BIG.speed[0], L.size) + slope * mix(SMALL.speed[1], BIG.speed[1], L.size) + surf * 3;
        foam = Math.max(smoothstep(0.1, 0.45, surf), 0.6 * plunge);
        // a rapid: the current gathering pace over the lip and running fast
        // and white all the way down, dying away in the pool below
        const r = L.rapid;
        if (r && L.above !== NO_WATER && L.rt >= 0) {
          let k;
          let white;
          if (L.rt <= 1) {
            k = smoothstep(0, RAPID.entry, L.rt);
            white = smoothstep(0, RAPID.entry * 2, L.rt);
          } else {
            k = Math.exp(-(L.s - r.s1) / RAPID.runout);
            white = k * k;
          }
          const fast = Math.min(FASTEST, mix(RAPID.speed[0], RAPID.speed[1], L.size) * Math.sqrt(r.grade));
          speed = mix(speed, Math.max(speed, fast), k);
          foam = Math.max(foam, white * smoothstep(RAPID.white[0], RAPID.white[1], r.grade));
        }
        speed = Math.min(FASTEST, speed) * L.g;
        fx = L.tx * speed;
        fz = L.tz * speed;
        foam *= L.g;
        // a real stream going over a cliff is white all the way down
        if (L.real) foam = Math.max(foam, smoothstep(FALLING[0], FALLING[1], L.slope) * L.g);
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
      if (L.frozen) {
        h = Math.max(h, level - ICE.under);
        continue;
      }
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
      if (L.weight(x, z) <= 0 || L.frozen) continue;
      const u = L.shore(x, z);
      if (u < LAKE_BLEND) this._offer(NO_WATER, 0, u, 'lake', 0, 0, 0, 1);
      for (const s of L.streamsNear(x, z)) {
        if (!this._hit(s, x, z, hit, false) || hit.cw <= 0.05) continue;
        this._offer(NO_WATER, 0, hit.d - hit.cw, hit.river ? 'river' : 'stream', 0, 0, 0, 1);
      }
    }
  }
}
