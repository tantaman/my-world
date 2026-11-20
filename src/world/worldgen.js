// Pure, deterministic description of the world: height, footpaths, where the
// forest is thick and where it opens into meadows. No three.js in here so it
// can be reused anywhere (workers, tools, tests).
//
// This is the first *land*: the way every world was grown until the land got
// more to it (land2.js, which grows from this). A world keeps the land it was
// first grown on, because a save is only what was changed from it — so what
// this file grows must never change (see test/golden/). lands.js picks which
// to grow.
//
// Real places can be set into any land (realPlaces.js, which grows from
// whichever it is given). A land knows nothing of them, but for the few
// things marked "real places" below, which answer for a land that has none.

import { createSimplex2, fbm, smoothstep } from '../noise.js';
import { Water } from './water.js';

export class WorldGen {
  constructor(seed, structures = []) {
    const n = (k) => createSimplex2((seed * 131 + k * 7919) >>> 0);
    this.seed = seed;
    this.land = 1;
    this._fields(n);
    // The real places set into this land: none, unless realPlaces.js is
    // grown from it.
    this.lands = [];

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
  // seed; a land grown from this one adds fields of its own here, before
  // anything is asked of it.
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

  // 0..1: whether there are trails here at all (they give out high up, in
  // a land with mountains).
  _trailsHere() {
    return 1;
  }

  // 0..1: how much there is of a side trail here, where there is one.
  _sideTrails(x, z) {
    return smoothstep(-0.15, 0.25, this.nPathMask(x * 0.0035, z * 0.0035));
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
  _baseHeight(x, z) {
    const wx = x + this.nWarpA(x * 0.0016, z * 0.0016) * 70;
    const wz = z + this.nWarpB(x * 0.0016, z * 0.0016) * 70;
    let h = fbm(this.nHills, wx * 0.0032, wz * 0.0032, 5) * 24;
    h += this.nBig(x * 0.0007, z * 0.0007) * 36;
    return h;
  }

  _detailHeight(x, z) {
    return this.nDetail(x * 0.09, z * 0.09) * 0.45 + this.nDetail(x * 0.31 + 50, z * 0.31 - 20) * 0.1;
  }

  // The hills without the small bumps, and without any octave shorter than
  // minWavelength meters: for drawing relief from far away (the map), where
  // finer detail would only alias into noise. With minWavelength = 0 this is
  // exactly _baseHeight.
  broadHeight(x, z, minWavelength = 0) {
    const wx = x + this.nWarpA(x * 0.0016, z * 0.0016) * 70;
    const wz = z + this.nWarpB(x * 0.0016, z * 0.0016) * 70;
    let sum = 0;
    let amp = 1;
    let freq = 0.0032;
    // same octaves as fbm(nHills, ·, ·, 5) in _baseHeight, normalised the same
    for (let o = 0; o < 5 && 1 / freq >= minWavelength; o++) {
      sum += amp * this.nHills(wx * freq + o * 17.31, wz * freq - o * 9.13);
      amp *= 0.5;
      freq *= 2;
    }
    return (sum / 1.9375) * 24 + this.nBig(x * 0.0007, z * 0.0007) * 36;
  }

  naturalHeight(x, z, pm = this.pathMask(x, z)) {
    // Paths are a touch sunken and smoothed, like trodden earth.
    return this._baseHeight(x, z) + this._detailHeight(x, z) * (1 - pm * 0.9) - pm * 0.14;
  }

  // ── Real places ───────────────────────────────────────────────────────────
  // What the water asks, which is routed over the forest's own land so that a
  // real place can't send a river somewhere else (drainage.js). Here there
  // are no real places, and the forest's land is all there is.
  //   forestHeight()         broadHeight() of the forest's own land. A land's
  //                          own workings ask this, never broadHeight(), which
  //                          real places change
  //   forestNaturalHeight()  naturalHeight() likewise
  //   landClearance(x, z)    m past the edge of the nearest real place
  // And what whoever draws the ground asks: what it is made of where a real
  // place has its own kind of country (country.js).
  //   surface(x, z, out)     fills out.bare, out.sand and out.land (0..1 each)
  //                          and returns the country: here nothing, and null
  //   countryAt(x, z)        the country a plant there grows in, or null in
  //                          the forest
  forestHeight(x, z, minWavelength = 0) {
    return this.broadHeight(x, z, minWavelength);
  }
  forestNaturalHeight(x, z) {
    return this.naturalHeight(x, z);
  }
  landClearance() {
    return 1e9;
  }
  surface(x, z, out) {
    out.bare = 0;
    out.sand = 0;
    out.land = 0;
    return null;
  }
  countryAt() {
    return null;
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

  // ── Ecology ───────────────────────────────────────────────────────────────
  // 0 = open meadow, 1 = dense forest
  forest(x, z) {
    const v = fbm(this.nForest, x * 0.0042, z * 0.0042, 3) + this.nForest2(x * 0.021, z * 0.021) * 0.14;
    return smoothstep(-0.34, 0.1, v);
  }

  // -1..1: low = broadleaf woods, high = conifers
  species(x, z) {
    return this.nSpecies(x * 0.0033, z * 0.0033) + this.nSpecies(x * 0.02 + 9, z * 0.02 - 4) * 0.15;
  }

  // 0..1 moisture, used for ferns/moss
  moisture(x, z) {
    return this.nMoist(x * 0.006, z * 0.006) * 0.5 + 0.5;
  }

  // What this land has that the first one didn't, for whoever draws it (the
  // map, the ground). Nothing, here.
  //   groves(x, z)     0..1 how much more of the woods is birch than usual
  //   above(x, z, h)   0..1 how far above the trees: alpine ground
  //   snow(x, z, h)    0..1 snow lying on the ground
  //   highGround       whether above() and snow() are ever more than 0
  groves() {
    return 0;
  }
  above() {
    return 0;
  }
  snow() {
    return 0;
  }
  get highGround() {
    return false;
  }

  // Whatever else a land asks of a place to start from (a path in the woods,
  // out of the water, it always asks).
  _fineStart() {
    return true;
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
