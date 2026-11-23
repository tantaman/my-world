// Pure, deterministic description of the world: height, footpaths, the
// country the land changes into over a few kilometres, the sea a walk from
// the start, and where the forest is thick and where it opens into meadows.
// No three.js in here so it can be reused anywhere (workers, tools, tests).
//
// This is the *land*: the one way a forest is grown from a seed. A world
// keeps the land it was grown on, because a save is only what was changed
// from it — so once worlds have been grown on a land, what it grows is
// pinned (test/golden/) and must not change. Whether that has happened yet
// is FROZEN in lands.js: while the land is still a draft it may be reshaped
// freely, and its golden files re-recorded.
//
// Over a few kilometres the land changes country:
//
//   lake country   low ground in broad, smooth hollows, each gathering enough
//                  water for a pond or a lake (the biggest anywhere), birch
//                  and broadleaf woods, wet meadows
//   hill country   rolling hills and mixed woods
//   mountains      ridges and peaks a hundred metres and more over the
//                  valleys, rock on the steep faces, the trees thinning out
//                  to a treeline, alpine meadows and boulders above it, and
//                  snow lying on the tops
//   benches        the land stepped into level shelves with rock along each
//                  riser, here and there in the hills and mountains
//   high country   massifs a kilometre and a half over their valleys, and a
//                  long walk apart: a bare, snowy cap, and under it the snow
//                  line comes *below* the treeline, so the way down runs out
//                  of the open and on through snowy woods before the snow
//                  gives out. That is where there is a run worth the name —
//                  the forest's own tops hold fifty metres of it
//
// and the woods change over a kilometre or so, whatever the country: dark
// conifer forest, birch groves, and open parkland where the meadows run
// together and a lone tree stands here and there. A walk from the start the
// land goes down to the sea (sea.js): the hills tilt down under it, so the
// coast follows them, with coves, headlands and islands, a sand beach and a
// sandy seabed, and rivers running out into it. Its lakes go deep: most are
// tarns, a shelf out from the shore and then a steep drop (DEEP in
// drainage.js).
//
// Real places can be set into the land (realPlaces.js, which grows from it).
// The land knows nothing of them, but for the few things marked "real places"
// below, which answer for a land that has none.

import { createSimplex2, fbm, smoothstep } from '../noise.js';
import { Water } from './water.js';
import { POND, LAKE, DEEP } from './drainage.js';
import { Sea, SEA } from './sea.js';

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
// What the ridging (_ridges, to the 1.25) comes to on average, and how high
// (m) the land strays from its average in lake country, the hills and the
// mountains, one standard deviation (measured over a few hundred thousand
// points: they're for whoever reshapes the land, realPlaces.js).
const RIDGE_MEAN = 0.2495;
const SPREAD = { low: 6.2, hills: 17.1, mtn: 34.5 };
// The chance of a tree out in the open, on a jittered grid 4.2 m apart
// (chunkGen.js), where the forest itself is none.
const LONE_TREES = 0.02;
// The high country: whole massifs, a thousand metres and more over the
// valleys, far enough apart that one is a day's walk from the next. Over this
// many metres, and where on its own field the forest gives way to them.
const ALPINE_WAVE = 26000;
const ALPINE = [0.42, 0.78];
// A massif stands this high (m) over the valleys round it, with ridges and
// the valleys between them this far apart (m) at their broadest — kilometres,
// so that a fall line runs for kilometres rather than the few hundred metres
// a forest ridge gives.
const ALPINE_HIGH = 2000;
const ALPINE_RIDGE = 34000;
// and built from this many octaves (see _ridges): few, so a massif is one big
// form rather than a flank that is steep at every scale at once.
const ALPINE_OCTAVES = 2;
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
// Up a massif both lines are far higher, and they swap over: the snow line
// lies *below* the treeline (m), so a descent comes down out of the open,
// through snowy woods, and only then runs out of snow. That is what makes a
// run long; above the forest's own tops there is nothing but the bare cap.
const ALPINE_TREELINE = 900;
const ALPINE_SNOWLINE = 600;
// and the trees take longer to thin out, on that scale (m).
const ALPINE_FADE = 160;
// The steepest ground (rise over run) you start out on.
const START_SLOPE = 0.2;
// The woods: kinds of woodland, over this many metres.
const WOODS_WAVE = 1500;

// Ponds and lakes where the land is not low (see stillWater, drainage.js).
const STILL = Object.freeze({ pond: POND, lake: Object.freeze({ ...LAKE, deep: DEEP }), room: 1.4 });

export class WorldGen {
  constructor(seed, structures = []) {
    const n = (k) => createSimplex2((seed * 131 + k * 7919) >>> 0);
    this.seed = seed;
    this.land = 1;
    // The sea: set by _fields, which is where the fields it needs are laid.
    this.sea = null;
    this._fields(n);
    // The real places set into this land, each a Landform (landform.js):
    // none, unless realPlaces.js is grown from it.
    this.landforms = [];

    // Structures carve flat clearings. Their pad height is the natural
    // ground height at their centre.
    this.pads = structures.map((s) => ({
      x: s.x,
      z: s.z,
      r: s.radius ?? 8,
      y: this.naturalHeight(s.x, s.z),
    }));

    // Ponds, lakes, streams and rivers (see water.js). After each height()
    // this.water describes the water at that spot: its level, which way it
    // runs, how far it is to the shore.
    this.water = new Water(this, seed);
  }

  // The noise fields the land is made of. n(k) is the k-th field of this
  // seed. The numbers are the land's own spelling: water.js takes 26 for
  // itself, and the sea takes 40 and on, so leave those be.
  _fields(n) {
    this.nHills = n(1);
    this.nBig = n(2);
    this.nWarpA = n(3);
    this.nWarpB = n(4);
    this.nDetail = n(5);
    this.nPathA = n(6);
    this.nPathB = n(7);
    this.nPathMask = n(8);
    this.nForest = n(9);
    this.nForest2 = n(10);
    this.nSpecies = n(11);
    this.nPathWarpA = n(12);
    this.nPathWarpB = n(13);
    this.nMoist = n(14);
    this.nCountry = n(30);
    this.nRidge = n(31);
    this.nBench = n(32);
    this.nTreeline = n(33);
    this.nWoods = n(34);
    this.nGroves = n(35);
    this.nAlpine = n(36);
    // the last height asked for, and the last country: both asked for over
    // and over at the same spot
    this._at = { x: NaN, z: NaN, h: 0 };
    this._c = { x: NaN, z: NaN, low: 0, mtn: 0, alp: 0, bench: 0 };
    // The sea lies over the land's own shape, so it is given that shape
    // rather than broadHeight(), which is the land with the sea already in it.
    this.sea = new Sea(this.seed, n, (x, z) => this._landHeight(x, z, 0));
  }

  // ── Country ───────────────────────────────────────────────────────────────
  // How much of each kind of country (x, z) is in: this._c.low (lake
  // country), .mtn (mountains), .alp (the high country), .bench (stepped into
  // shelves); hill country is what is left. The high country has a field of
  // its own, on a far broader scale than the rest, so a massif stands wherever
  // the land is not low — in the hills or over the forest's own mountains.
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
    const fa = 1 / ALPINE_WAVE;
    const a = (this.nAlpine(wx * fa, wz * fa) + 0.35 * this.nAlpine(wx * fa * 2.7 - 11.3, wz * fa * 2.7 + 5.9)) / 1.2;
    c.alp = smoothstep(ALPINE[0], ALPINE[1], a) * (1 - c.low);
    return c;
  }

  // ── Footpaths ─────────────────────────────────────────────────────────────
  // Paths follow the zero-isolines of two warped noise fields. Isolines of
  // smooth noise form a natural meandering network of loops and long trails.
  // Distance to the line is |v| / |∇v|, which keeps the path width even.
  _pathFields(x, z, out) {
    const wa = this.nPathWarpA(x * 0.005, z * 0.005) * 16;
    const wb = this.nPathWarpB(x * 0.005, z * 0.005) * 16;
    const wx = x + wa;
    const wz = z + wb;
    out[0] = this.nPathA(wx * (1 / 230), wz * (1 / 230));
    out[1] = this.nPathB(wx * (1 / 105) + 40.0, wz * (1 / 105) - 13.0);
  }

  // 0..1: whether there are trails here at all. They give out on the way up a
  // mountain, about where the trees do. (Judged from the broadest ridges
  // alone: the trails are worked out before the height.)
  _trailsHere(x, z) {
    const c = this.country(x, z);
    if (c.mtn <= 0 && c.alp <= 0) return 1;
    const wx = x + this.nWarpA(x * 0.0016, z * 0.0016) * 70;
    const wz = z + this.nWarpB(x * 0.0016, z * 0.0016) * 70;
    let high = this.nBig(x * 0.0007, z * 0.0007) * 36;
    if (c.mtn > 0) high += c.mtn * (c.mtn * MASSIF + Math.pow(this._ridges(wx, wz, 500), 1.25) * RIDGE_HIGH - 12);
    if (c.alp > 0) high += c.alp * c.alp * Math.pow(this._ridges(wx, wz, 1500, ALPINE_RIDGE, ALPINE_OCTAVES), 1.15) * ALPINE_HIGH;
    // on a massif the trees, and the trails with them, go far higher
    const line = TREELINE + c.alp * (ALPINE_TREELINE - TREELINE);
    const fade = 40 + c.alp * (ALPINE_FADE * 1.5 - 40);
    return 1 - smoothstep(line - fade, line - 5, high);
  }

  // 0..1: how much there is of a side trail here, where there is one. Fewer
  // of them in the mountains.
  _sideTrails(x, z) {
    return smoothstep(-0.15, 0.25, this.nPathMask(x * 0.0035, z * 0.0035)) * (1 - this.country(x, z).mtn * 0.7);
  }

  // Returns a mask in [0,1] (1 = middle of a path). Also fills this.pathEdge
  // with the signed distance in meters to the nearest path edge (negative
  // when on the path).
  pathMask(x, z) {
    const f0 = this._f0 || (this._f0 = new Float64Array(2));
    const fx = this._fx || (this._fx = new Float64Array(2));
    const fz = this._fz || (this._fz = new Float64Array(2));
    this._pathFields(x, z, f0);
    this._pathFields(x + 0.75, z, fx);
    this._pathFields(x, z + 0.75, fz);

    const gA = Math.hypot(fx[0] - f0[0], fz[0] - f0[0]) / 0.75 + 1e-6;
    const gB = Math.hypot(fx[1] - f0[1], fz[1] - f0[1]) / 0.75 + 1e-6;
    const dA = Math.abs(f0[0]) / gA;
    const dB = Math.abs(f0[1]) / gB;

    // Main trails are ~2.4m wide, side trails narrower and they fade in/out,
    // like deer paths that come and go.
    const here = this._trailsHere(x, z);
    const wA = 1.2 * here;
    const side = this._sideTrails(x, z) * here;
    const wB = 0.75 * side;

    const mA = wA > 0.08 ? 1 - smoothstep(0.5, 1.0, dA / wA) : 0;
    const mB = wB > 0.08 ? 1 - smoothstep(0.45, 1.0, dB / wB) : 0;

    // The map draws main and side trails separately when zoomed out.
    this.pathEdgeMain = dA - wA;
    this.pathEdgeSide = wB > 0.08 ? dB - wB : 1e9;
    this.pathSide = side;
    this.pathEdge = Math.min(this.pathEdgeMain, this.pathEdgeSide);
    return mA > mB ? mA : mB;
  }

  // ── Height ────────────────────────────────────────────────────────────────
  // The land's own shape, without the sea: every part of the height is built
  // here, so the map's far-off relief and the land the water runs over (both
  // of which leave the small octaves out) are the same hills you walk on.
  _landHeight(x, z, minWavelength = 0) {
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

    // the high country: the same ridging, kilometres across and a thousand
    // metres high. Squared, so a massif comes up out of the forest rather
    // than ending at a wall, and its valley floors stay down at forest height
    // where the ridged field is near nothing — which is what gives a descent
    // its whole drop.
    if (c.alp > 0) h += c.alp * c.alp * Math.pow(this._ridges(wx, wz, minWavelength, ALPINE_RIDGE, ALPINE_OCTAVES), 1.15) * ALPINE_HIGH;

    // benches: level shelves, and a riser of rock up to the next
    if (c.bench > 0) {
      const f = h / BENCH_STEP;
      const i = Math.floor(f);
      const shelf = (i + smoothstep(1 - BENCH_RISER, 1, f - i)) * BENCH_STEP;
      h += (shelf - h) * c.bench * 0.92;
    }
    return h;
  }

  // The land laid by the sea. Everything else about the height is built on
  // this (_baseHeight asks it), so the map, the water's routes and the ground
  // you walk on all go down to it.
  //
  // The hills without the small bumps, and without any octave shorter than
  // minWavelength metres: for drawing relief from far away (the map), where
  // finer detail would only alias into noise.
  broadHeight(x, z, minWavelength = 0) {
    return this.sea.shape(this.ownLand(x, z, minWavelength), x, z);
  }

  // 0..~1: ridged noise, sharp along the crests (rounded off just enough to
  // walk along), its finer octaves only where there is a ridge to put them on.
  // Each octave is half the height of the last but a little over twice as
  // close together, so each adds about as much *slope* as the one before. Over
  // a forest ridge, where they are all a few hundred metres and less, that is
  // the roughness you walk over. Over a massif kilometres across it would make
  // the whole flank that steep, so the high country asks for fewer of them and
  // gets one clean form, its small roughness coming from the hills and the
  // detail as everywhere else does.
  _ridges(x, z, minWavelength, wave = RIDGE_WAVE, octaves = 4) {
    let sum = 0;
    let amp = 1;
    let freq = 1 / wave;
    let w = 1;
    for (let o = 0; o < octaves && 1 / freq >= minWavelength; o++) {
      const n = this.nRidge(x * freq + o * 31.1, z * freq - o * 11.7);
      let r = 1 - Math.sqrt(n * n + CREST);
      r *= r * w;
      w = Math.min(1, r * 1.8);
      sum += r * amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    // what the amplitudes come to for this many octaves, whatever was reached
    return sum / (2 - Math.pow(0.5, octaves - 1));
  }

  _baseHeight(x, z) {
    const a = this._at;
    if (a.x !== x || a.z !== z) {
      // (worked out before it's kept: something it asks may not be here yet)
      const h = this.forestHeight(x, z, 0);
      a.x = x;
      a.z = z;
      a.h = h;
    }
    return a.h;
  }

  // the small bumps: rougher in the mountains
  _detailHeight(x, z) {
    const d = this.nDetail(x * 0.09, z * 0.09) * 0.45 + this.nDetail(x * 0.31 + 50, z * 0.31 - 20) * 0.1;
    return d * (1 + this.country(x, z).mtn * 0.8);
  }

  naturalHeight(x, z, pm = this.pathMask(x, z)) {
    // Paths are a touch sunken and smoothed, like trodden earth.
    return this._baseHeight(x, z) + this._detailHeight(x, z) * (1 - pm * 0.9) - pm * 0.14;
  }

  height(x, z, pm = this.pathMask(x, z)) {
    let h = this.water.shape(x, z, this.naturalHeight(x, z, pm), pm);
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 1.8) {
        const t = 1 - smoothstep(p.r * 0.85, p.r * 1.8, d);
        h += (p.y - h) * t;
      }
    }
    return h;
  }

  // 0 = how far from any structure pad (meters past its radius). Large if none.
  padClearance(x, z) {
    let best = 1e9;
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      const d = Math.hypot(x - p.x, z - p.z) - p.r;
      if (d < best) best = d;
    }
    return best;
  }

  // ── Real places ───────────────────────────────────────────────────────────
  // What the water asks, which is routed over the forest's own land so that a
  // real place can't send a river somewhere else (drainage.js). Here there
  // are no real places, and the forest's land is all there is.
  //   forestHeight()         broadHeight() of the forest's own land. A land's
  //                          own workings ask this, never broadHeight(), which
  //                          real places change
  //   forestNaturalHeight()  naturalHeight() likewise
  //   landformClearance(x, z)  m past the edge of the nearest real place
  // And what whoever draws the ground asks: what it is made of where a real
  // place has its own kind of country (country.js).
  //   surface(x, z, out)     fills out.bare, out.sand and out.land (0..1 each)
  //                          and out.country (its id), and returns the
  //                          country: here nothing, and null
  //   countryAt(x, z)        the country a plant there grows in, or null in
  //                          the forest
  //   countryIn(x0, z0, x1, z1)  whether surface() or countryAt() may say
  //                          anything but the forest anywhere in that square
  //   earthAt(x, z)          the kind of country the real Earth is there, where
  //                          it's under the land (earth.js); here, null
  //   thicket(x, z)          0..1 how much of a thicket of shrubs it is (a
  //                          real place's willows): here none
  //   talus(x, z)            0..1 how thickly strewn with boulders (a real
  //                          place's screes): here none
  // And what a real place that reshapes the land itself (the real Earth:
  // realPlaces.js) asks of a land, to lay its own over the land's:
  //   ownLand(x, z, mw)      the land's own shape, before the sea is laid over it
  //   bySea(h, D, floor, soft)  land h, falling away D, as it lies by the
  //                          sea; with its floor inland that high over the sea
  //                          (m), eased in over `soft` m, if not the sea's own
  //   ownMean(c), ownSpread(c)  how high the land stands on average where the
  //                          country (as country() says) is c, and how far
  //                          (m, one standard deviation) it strays from that
  ownLand(x, z, minWavelength = 0) {
    return this._landHeight(x, z, minWavelength);
  }
  bySea(h, D, floor, soft) {
    return this.sea.shapeBy(h, D, floor, soft);
  }
  ownMean(c) {
    return -c.low * 6 + c.mtn * (c.mtn * MASSIF + RIDGE_MEAN * RIDGE_HIGH - 12);
  }
  ownSpread(c) {
    const hills = SPREAD.hills + (SPREAD.low - SPREAD.hills) * c.low;
    return hills + (SPREAD.mtn - hills) * c.mtn;
  }
  forestHeight(x, z, minWavelength = 0) {
    return this.broadHeight(x, z, minWavelength);
  }
  forestNaturalHeight(x, z) {
    return this.naturalHeight(x, z);
  }
  landformClearance() {
    return 1e9;
  }
  surface(x, z, out) {
    out.bare = 0;
    out.sand = 0;
    out.land = 0;
    out.country = 0;
    return null;
  }
  countryAt() {
    return null;
  }
  countryIn() {
    return false;
  }
  earthAt() {
    return null;
  }
  thicket() {
    return 0;
  }
  talus() {
    return 0;
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  // Lake country holds bigger lakes, and from less water (see drainage.js),
  // and the lakes go deep.
  stillWater(x, z) {
    const l = this.country(x, z).low;
    if (l <= 0) return STILL;
    return {
      pond: POND,
      lake: { acc: LAKE.acc - 16 * l, accFull: LAKE.accFull - 140 * l, r: [LAKE.r[0] + 20 * l, LAKE.r[1] + 40 * l], depth: [LAKE.depth[0], LAKE.depth[1] + 1.5 * l], deep: DEEP },
      room: STILL.room + 1.2 * l,
    };
  }

  // ── Ecology ───────────────────────────────────────────────────────────────
  // The kind of woods (x, z) is in, about −1..1: low is open parkland, high is
  // deep, dark forest.
  woods(x, z) {
    const f = 1 / WOODS_WAVE;
    return this.nWoods(x * f, z * f) + this.nWoods(x * f * 4 + 5.3, z * f * 4 - 2.9) * 0.25;
  }

  treeline(x, z) {
    const line = TREELINE + this.nTreeline(x * 0.004, z * 0.004) * 10;
    const { alp } = this.country(x, z);
    return alp > 0 ? line + alp * (ALPINE_TREELINE - TREELINE) : line;
  }

  // (the snow line wanders with the treeline's field, on a finer scale)
  snowline(x, z) {
    const line = SNOWLINE + this.nTreeline(x * 0.011 + 40, z * 0.011) * 9;
    const { alp } = this.country(x, z);
    return alp > 0 ? line + alp * (ALPINE_SNOWLINE - SNOWLINE) : line;
  }

  // 0 = open meadow, 1 = dense forest
  forest(x, z) {
    const c = this.country(x, z);
    const wd = this.woods(x, z);
    let v = fbm(this.nForest, x * 0.0042, z * 0.0042, 3) + this.nForest2(x * 0.021, z * 0.021) * 0.14;
    // parkland opens right up; deep forest closes in
    v += smoothstep(0.1, 0.45, wd) * 0.3 - smoothstep(-0.3, -0.62, wd) * 0.6;
    // lake country is wetter and a little more open
    v -= c.low * 0.06;
    let f = smoothstep(-0.34, 0.1, v);
    // thinning out to the treeline (which only the mountains and the high
    // country reach)
    if (c.mtn > 0 || c.alp > 0) f *= 1 - this.above(x, z, this._baseHeight(x, z));
    return f;
  }

  // The chance of a lone tree out in the open, where the forest is none
  // (chunkGen.js adds it to the forest's own): one here and there.
  loneTrees(x, z) {
    return LONE_TREES;
  }

  // −1..1: low = broadleaf woods, high = conifers. Conifers up the mountains
  // and in the deep forest; broadleaf down in lake country.
  species(x, z) {
    const c = this.country(x, z);
    let sp = this.nSpecies(x * 0.0033, z * 0.0033) + this.nSpecies(x * 0.02 + 9, z * 0.02 - 4) * 0.15;
    sp += smoothstep(0.15, 0.55, this.woods(x, z)) * 0.6 - c.low * 0.35;
    if (c.mtn > 0) sp += c.mtn * smoothstep(10, 70, this._baseHeight(x, z)) * 1.2;
    if (c.alp > 0) sp += c.alp * smoothstep(80, 600, this._baseHeight(x, z)) * 1.2;
    return sp;
  }

  // 0..1 moisture, used for ferns/moss
  moisture(x, z) {
    return Math.min(1, this.nMoist(x * 0.006, z * 0.006) * 0.5 + 0.5 + this.country(x, z).low * 0.18);
  }

  // What the land has high up, and what the woods are made of, for whoever
  // draws it (the map, the ground):
  //   groves(x, z)     0..1 how much more of the woods is birch than usual
  //   above(x, z, h)   0..1 how far above the trees: alpine ground
  //   snow(x, z, h)    0..1 snow lying on the ground
  //   highGround       whether above() and snow() are ever more than 0
  //   highIn(x0, z0, x1, z1)  whether they may be anywhere in that square (a
  //                    real place can have high ground of its own)

  // Birch groves: whole stands of them, some way from any mountain.
  groves(x, z) {
    const c = this.country(x, z);
    return smoothstep(0.2, 0.5, this.nGroves(x * 0.0011, z * 0.0011)) * (1 - c.mtn) * (1 - c.alp) * 0.85;
  }

  above(x, z, h) {
    const line = this.treeline(x, z);
    const fade = TREE_FADE + this.country(x, z).alp * (ALPINE_FADE - TREE_FADE);
    return smoothstep(line - fade, line + 6, h);
  }

  snow(x, z, h) {
    const line = this.snowline(x, z);
    return smoothstep(line - 4, line + 6, h);
  }

  get highGround() {
    return true;
  }
  highIn() {
    return this.highGround;
  }

  // How high a real place set into this land stands (realPlaces.js), given
  // the forest's height round it (m). One that would be under the sea is
  // raised into an island, its trailhead a little over the water, rather than
  // left down on the seabed with the sea round it.
  datumLevel(h) {
    return Math.max(h, this.sea.level + SEA.island);
  }

  // Start on level ground, down among the trees: not on a mountainside, and
  // out of the water, which findSpawn asks anyway.
  _fineStart(x, z) {
    const dx = this.broadHeight(x + 3, z, 0) - this.broadHeight(x - 3, z, 0);
    const dz = this.broadHeight(x, z + 3, 0) - this.broadHeight(x, z - 3, 0);
    return Math.hypot(dx, dz) / 6 < START_SLOPE && this.above(x, z, this._baseHeight(x, z)) === 0;
  }

  // Find a nice spot on a footpath near (x0, z0) to start from.
  findSpawn(x0 = 0, z0 = 0) {
    for (let r = 0; r < 600; r += 3) {
      const steps = Math.max(1, Math.floor((Math.PI * 2 * r) / 3));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = x0 + Math.cos(a) * r;
        const z = z0 + Math.sin(a) * r;
        if (this.pathMask(x, z) > 0.97 && this.forest(x, z) > 0.45 && this._fineStart(x, z)) {
          this.height(x, z);
          if (this.water.edge < 6) continue; // not with your feet in a stream
          // path direction: the direction around us that stays on the path
          let bestA = 0;
          let best = -1;
          for (let k = 0; k < 48; k++) {
            const aa = (k / 48) * Math.PI * 2;
            const m = this.pathMask(x + Math.sin(aa) * 4, z + Math.cos(aa) * 4);
            if (m > best) {
              best = m;
              bestA = aa;
            }
          }
          return { x, z, yaw: bestA };
        }
      }
    }
    return { x: x0, z: z0, yaw: 0 };
  }
}
