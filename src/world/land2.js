// The second land: the forest grown with more to it.
//
// The first land (worldgen.js) is the same rolling hills and the same mixed
// woods everywhere you go. This one is grown from it, and over a few
// kilometres it changes country:
//
//   lake country   low ground in broad, smooth hollows, each gathering enough
//                  water for a pond or a lake (the biggest anywhere), birch
//                  and broadleaf woods, wet meadows
//   hill country   the rolling hills of the first land
//   mountains      ridges and peaks a hundred metres and more over the
//                  valleys, rock on the steep faces, the trees thinning out
//                  to a treeline, alpine meadows and boulders above it, and
//                  snow lying on the tops
//   benches        the land stepped into level shelves with rock along each
//                  riser, here and there in the hills and mountains
//
// and the woods change over a kilometre or so, whatever the country: dark
// conifer forest, birch groves, and open parkland where the meadows run
// together and a lone tree stands here and there.
//
// Like the first land, this is part of what a save means: once worlds have
// been grown on it, what it grows is pinned (test/golden/*-land2.json) and
// must not change. Something new goes in a land of its own (lands.js).

import { WorldGen } from './worldgen.js';
import { POND, LAKE } from './drainage.js';
import { fbm, smoothstep } from '../noise.js';

// Country, over this many metres: what kind of land it is.
const COUNTRY_WAVE = 3200;
// Where on the country field (about −1..1) lake country gives way to hills,
// and hills to mountains.
const LOWLAND = [-0.5, -0.18];
const MOUNTAINS = [0.12, 0.5];
// Mountains: the whole range raised this much (m), and ridges on it this far
// apart (m) at their broadest, and up to this high (m).
const MASSIF = 45;
const RIDGE_WAVE = 1100;
const RIDGE_HIGH = 170;
// How much the crests are rounded off (on the ridged noise's own scale).
const CREST = 0.012;
// Benches: shelves this high (m) between risers. A riser takes up this much
// of the way from one shelf to the next; the rest is level.
const BENCH_STEP = 10;
const BENCH_RISER = 0.16;
// The trees thin out from here to nothing at the treeline (m, ± a little),
// and snow lies above the snow line.
const TREELINE = 92;
const TREE_FADE = 26;
const SNOWLINE = 122;
// The steepest ground (rise over run) you start out on.
const START_SLOPE = 0.2;
// The woods: kinds of woodland, over this many metres.
const WOODS_WAVE = 1500;

export class Land2 extends WorldGen {
  constructor(seed, structures = []) {
    super(seed, structures);
    this.land = 2;
  }

  _fields(n) {
    super._fields(n);
    // (water.js takes field 26 for itself)
    this.nCountry = n(30);
    this.nRidge = n(31);
    this.nBench = n(32);
    this.nTreeline = n(33);
    this.nWoods = n(34);
    this.nGroves = n(35);
    this._at = { x: NaN, z: NaN, h: 0 };
    this._c = { x: NaN, z: NaN, low: 0, mtn: 0, bench: 0 };
  }

  // ── Country ───────────────────────────────────────────────────────────────
  // How much of each kind of country (x, z) is in: this._c.low (lake
  // country), .mtn (mountains), .bench (stepped into shelves); hill country is
  // what is left.
  country(x, z) {
    const c = this._c;
    if (c.x === x && c.z === z) return c;
    const f = 1 / COUNTRY_WAVE;
    const wx = x + this.nWarpB(x * 0.0005 + 3.1, z * 0.0005) * 260;
    const wz = z + this.nWarpA(x * 0.0005, z * 0.0005 - 7.7) * 260;
    const v = (this.nCountry(wx * f, wz * f) + 0.3 * this.nCountry(wx * f * 3.3 + 31.7, wz * f * 3.3 - 17.3)) / 1.15;
    c.x = x;
    c.z = z;
    c.low = 1 - smoothstep(LOWLAND[0], LOWLAND[1], v);
    c.mtn = smoothstep(MOUNTAINS[0], MOUNTAINS[1], v);
    c.bench = smoothstep(0.32, 0.6, this.nBench(x * 0.00055, z * 0.00055)) * (1 - c.low);
    return c;
  }

  // ── Height ────────────────────────────────────────────────────────────────
  // Every part of the height is built here, so the map's far-off relief and
  // the land the water runs over (both of which leave the small octaves out)
  // are the same hills you walk on.
  broadHeight(x, z, minWavelength = 0) {
    const c = this.country(x, z);
    const wx = x + this.nWarpA(x * 0.0016, z * 0.0016) * 70;
    const wz = z + this.nWarpB(x * 0.0016, z * 0.0016) * 70;

    // the rolling hills; lake country lies lower and flatter, in broad
    // smooth hollows that gather a lot of water each
    let sum = 0;
    let amp = 1;
    let freq = 0.0032;
    const smooth = 1 - c.low * 0.55;
    for (let o = 0; o < 5 && 1 / freq >= minWavelength; o++) {
      sum += amp * (o ? smooth : 1) * this.nHills(wx * freq + o * 17.31, wz * freq - o * 9.13);
      amp *= 0.5;
      freq *= 2;
    }
    let h = (sum / 1.9375) * 24 * (1 - c.low * 0.3) + this.nBig(x * 0.0007, z * 0.0007) * 36 * (1 - c.low * 0.7) - c.low * 6;

    // mountains: the range raised, and ridged, sharp along the crests
    if (c.mtn > 0) h += c.mtn * (c.mtn * MASSIF + Math.pow(this._ridges(wx, wz, minWavelength), 1.25) * RIDGE_HIGH - 12);

    // benches: level shelves, and a riser of rock up to the next
    if (c.bench > 0) {
      const f = h / BENCH_STEP;
      const i = Math.floor(f);
      const shelf = (i + smoothstep(1 - BENCH_RISER, 1, f - i)) * BENCH_STEP;
      h += (shelf - h) * c.bench * 0.92;
    }
    return h;
  }

  // 0..~1: ridged noise, sharp along the crests (rounded off just enough to
  // walk along), its finer octaves only where there is a ridge to put them on.
  _ridges(x, z, minWavelength) {
    let sum = 0;
    let amp = 1;
    let freq = 1 / RIDGE_WAVE;
    let w = 1;
    for (let o = 0; o < 4 && 1 / freq >= minWavelength; o++) {
      const n = this.nRidge(x * freq + o * 31.1, z * freq - o * 11.7);
      let r = 1 - Math.sqrt(n * n + CREST);
      r *= r * w;
      w = Math.min(1, r * 1.8);
      sum += r * amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / 1.875;
  }

  _baseHeight(x, z) {
    const a = this._at;
    if (a.x !== x || a.z !== z) {
      a.x = x;
      a.z = z;
      a.h = this.broadHeight(x, z, 0);
    }
    return a.h;
  }

  // the small bumps: rougher in the mountains
  _detailHeight(x, z) {
    return super._detailHeight(x, z) * (1 + this.country(x, z).mtn * 0.8);
  }

  // Trails give out on the way up a mountain, about where the trees do, and
  // there are fewer side trails in the mountains at all. (Judged from the
  // broadest ridges alone: the trails are worked out before the height.)
  _trailsHere(x, z) {
    const c = this.country(x, z);
    if (c.mtn <= 0) return 1;
    const wx = x + this.nWarpA(x * 0.0016, z * 0.0016) * 70;
    const wz = z + this.nWarpB(x * 0.0016, z * 0.0016) * 70;
    const high = this.nBig(x * 0.0007, z * 0.0007) * 36 + c.mtn * (c.mtn * MASSIF + Math.pow(this._ridges(wx, wz, 500), 1.25) * RIDGE_HIGH - 12);
    return 1 - smoothstep(TREELINE - 40, TREELINE - 5, high);
  }

  _sideTrails(x, z) {
    return super._sideTrails(x, z) * (1 - this.country(x, z).mtn * 0.7);
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  // Lake country holds bigger lakes, and from less water (see drainage.js).
  stillWater(x, z) {
    const l = this.country(x, z).low;
    if (l <= 0) return STILL;
    return {
      pond: POND,
      lake: { acc: LAKE.acc - 16 * l, accFull: LAKE.accFull - 140 * l, r: [LAKE.r[0] + 20 * l, LAKE.r[1] + 40 * l], depth: [LAKE.depth[0], LAKE.depth[1] + 1.5 * l] },
      room: STILL.room + 1.2 * l,
    };
  }

  // Start on level ground, down among the trees: not on a mountainside.
  _fineStart(x, z) {
    const dx = this.broadHeight(x + 3, z, 0) - this.broadHeight(x - 3, z, 0);
    const dz = this.broadHeight(x, z + 3, 0) - this.broadHeight(x, z - 3, 0);
    return Math.hypot(dx, dz) / 6 < START_SLOPE && this.above(x, z, this._baseHeight(x, z)) === 0;
  }

  // ── Ecology ───────────────────────────────────────────────────────────────
  // The kind of woods (x, z) is in, about −1..1: low is open parkland, high is
  // deep, dark forest.
  woods(x, z) {
    const f = 1 / WOODS_WAVE;
    return this.nWoods(x * f, z * f) + this.nWoods(x * f * 4 + 5.3, z * f * 4 - 2.9) * 0.25;
  }

  treeline(x, z) {
    return TREELINE + this.nTreeline(x * 0.004, z * 0.004) * 10;
  }

  forest(x, z) {
    const c = this.country(x, z);
    const wd = this.woods(x, z);
    let v = fbm(this.nForest, x * 0.0042, z * 0.0042, 3) + this.nForest2(x * 0.021, z * 0.021) * 0.14;
    // parkland opens right up; deep forest closes in
    v += smoothstep(0.1, 0.45, wd) * 0.3 - smoothstep(-0.3, -0.62, wd) * 0.6;
    // lake country is wetter and a little more open
    v -= c.low * 0.06;
    let f = smoothstep(-0.34, 0.1, v);
    // thinning out to the treeline (which only the mountains reach)
    if (c.mtn > 0) f *= 1 - this.above(x, z, this._baseHeight(x, z));
    return f;
  }

  // −1..1: low = broadleaf woods, high = conifers. Conifers up the mountains
  // and in the deep forest; broadleaf down in lake country.
  species(x, z) {
    const c = this.country(x, z);
    let sp = super.species(x, z);
    sp += smoothstep(0.15, 0.55, this.woods(x, z)) * 0.6 - c.low * 0.35;
    if (c.mtn > 0) sp += c.mtn * smoothstep(10, 70, this._baseHeight(x, z)) * 1.2;
    return sp;
  }

  moisture(x, z) {
    return Math.min(1, super.moisture(x, z) + this.country(x, z).low * 0.18);
  }

  // Birch groves: whole stands of them, some way from any mountain.
  groves(x, z) {
    const c = this.country(x, z);
    return smoothstep(0.2, 0.5, this.nGroves(x * 0.0011, z * 0.0011)) * (1 - c.mtn) * 0.85;
  }

  above(x, z, h) {
    const line = this.treeline(x, z);
    return smoothstep(line - TREE_FADE, line + 6, h);
  }

  // (the snow line wanders with the treeline's field, on a finer scale)
  snow(x, z, h) {
    const line = SNOWLINE + this.nTreeline(x * 0.011 + 40, z * 0.011) * 9;
    return smoothstep(line - 4, line + 6, h);
  }

  get highGround() {
    return true;
  }
}

const STILL = Object.freeze({ pond: POND, lake: LAKE, room: 1.4 });
