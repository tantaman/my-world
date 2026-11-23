// The ground of Purgatory: how high it is anywhere, what lies on it, and
// where the ways up are. Grown from the world's seed and from nothing else,
// so it is the same for everyone in a world; it has no part in what the
// forest grows, being a long way under it and off to one side.
//
// It is laid out round an axis (cx, cz), by plan.js. A place in it is a
// radius and an angle from where the road out of Hell comes up (th,
// radians, wrapped to a half turn either way: the mountain is round, and
// the circles close). Heights are from the sea's surface, `top` m in the
// world.
//
//   land.sample(x, z, ref, out, full)   the ground at a world position:
//     out.h      its height (world m)
//     out.liq    the surface of whatever lies on it, or -Infinity
//     out.kind   which liquid that is (plan.LIQUID)
//     out.r, th  where that is on the island
//     and with `full`, what it looks like: out.cr, cg, cb (its colour),
//     out.wet (0..1), out.glow (how polished: the marble), out.ice (1 where
//     the colour is the stone itself, worked or bare: no grass, no soil)
//   land.height(x, z)                   just out.h
//   land.place(r, th, out)              world x, z of a place on the island
//   land.wayAt(r, th)                   the way up you're in, if any, and how far up it
//   land.stream(r, th, out)             where the stream on the top is from there
//
// (sample takes a `ref` because render/landTiles.js and world/landSpace.js
// ask the same of any land made in code; there are no turns here, and it
// is not used.)

import { createSimplex2, lerp, clamp, smoothstep } from '../noise.js';
import { R, H, TERRACES, TOP, WIDE, RUN, AT, BURROW, CLEFT, VALLEY, GATE, WAYS, STREAM, LIQUID, TAU } from './plan.js';

const SALT = 0x9a7e;
const smooth = (t) => t * t * (3 - 2 * t);
// An angle, to within a half turn either way of 0.
export const wrap = (a) => a - TAU * Math.round(a / TAU);

// How far the drawn sea goes (m from the axis): to where the air hides it.
export const SEA_REACH = 7600;
const SIDE = 0.35; // m: how far a stair's walls take to rise from its tread to the bank either side
const TURN = 1.1; // m wider a way up is cut where its way in turns into its climb, so nobody catches on the corner
const STILL = 26; // m from a way up or the gate: the cliff lines don't wander there
// The gate's door: how far in from the foot of the great cliff it hangs,
// and how thick it is as far as anyone walking into it is concerned (m).
export const DOOR = { at: 0.7, thick: 0.45 };
// How much a bank's face is rounded off at its foot and its top (0: a plain
// slope). Little: a stair cut slantwise into it needs rock on its outer
// side as well as its inner all the way up, which a face rounded at its
// foot hasn't got.
const BANK_ROUND = 0.15;

// Linear colours, by what the ground is.
const SAND = [0.4, 0.34, 0.24];
const SEABED = [0.17, 0.16, 0.12];
const GRASS = [0.075, 0.12, 0.04];
const MEADOW = [0.06, 0.13, 0.035];
const ROCK = [0.2, 0.185, 0.17];
const KNOLL = [0.16, 0.15, 0.14];
// What each terrace is, floor and bank: the first of white marble, "so
// adorned with sculptures"; the second "the livid colour of the stone";
// the rest as they come. [colour, polish]
const STONE = [
  [[0.6, 0.58, 0.54], 0.75], // the proud
  [[0.12, 0.13, 0.16], 0.05], // the envious: livid
  [[0.11, 0.1, 0.095], 0], // the wrathful: smoke-stained
  [[0.21, 0.19, 0.16], 0], // the slothful
  [[0.17, 0.16, 0.15], 0.1], // the avaricious: worn smooth
  [[0.3, 0.26, 0.2], 0], // the gluttonous
  [[0.24, 0.12, 0.075], 0.1], // the lustful: scorched
];
// The three steps: white marble, polished like a mirror; dark, calcined and
// cracked; porphyry, red as blood from a vein.
const STEP = [
  [[0.72, 0.71, 0.68], 1],
  [[0.03, 0.022, 0.035], 0],
  [[0.42, 0.035, 0.025], 0.8],
];

export class MountLand {
  // seed: the world's · cx, cz: the axis · top: the height of the sea's
  // surface (world m) · turn: the world angle the road comes up at from the
  // axis (th = 0)
  constructor({ seed, cx, cz, top, turn }) {
    this.seed = (seed ^ SALT) | 0;
    this.cx = cx;
    this.cz = cz;
    this.top = top;
    this.turn = turn;
    this.reach = SEA_REACH;
    // whether the gate is shut (index.js opens it for whoever the angel has marked)
    this.shut = true;
    this._n1 = createSimplex2(this.seed + 11);
    this._n2 = createSimplex2(this.seed + 23);
    this._n3 = createSimplex2(this.seed + 37);
    this._o = {};
    this._s = { u: 0, a: 0, along: 0, across: 0, level: 0, kind: 0, spring: false };
    // The stream on the top: its line square to where the last stair comes
    // up (e), a little beyond the middle (c), Lethe running left of the
    // spring and Eunoë right (plan.STREAM).
    const aE = WAYS[WAYS.length - 1].a1;
    const ex = Math.cos(aE);
    const ez = Math.sin(aE);
    this.streamAt = {
      ex,
      ez,
      // which way is right, for someone walking in from the stair's head
      rx: Math.sin(aE),
      rz: -Math.cos(aE),
      cx: -ex * STREAM.beyond,
      cz: -ez * STREAM.beyond,
    };
    // how far along its line it can run before it reaches the rim, either way
    const reach = Math.sqrt(Math.max(0, (TOP.r - 18) ** 2 - STREAM.beyond ** 2));
    this.streamAt.ends = [-reach, reach];
    // and where it springs
    this.streamAt.spring = STREAM.spring;
    this.springLevel = this._meadow(Math.hypot(STREAM.beyond, STREAM.spring), 0) - 0.35;
  }

  // Where a world position is: out.r, and out.th.
  polar(x, z, ref, out) {
    const dx = x - this.cx;
    const dz = z - this.cz;
    out.r = Math.hypot(dx, dz);
    out.th = wrap(Math.atan2(dz, dx) - this.turn);
    return out;
  }

  // The world position of a place: out.x, out.z.
  /**
   * @param {number} r
   * @param {number} th
   * @param {{ x?: number, z?: number }} [out]
   * @returns {{ x: number, z: number }}
   */
  place(r, th, out = {}) {
    out.x = this.cx + r * Math.cos(th + this.turn);
    out.z = this.cz + r * Math.sin(th + this.turn);
    return out;
  }

  height(x, z) {
    return this.sample(x, z, 0, this._o, false).h;
  }

  sample(x, z, ref, out, full = false) {
    this.polar(x, z, ref, out);
    this._eval(x, z, out, full);
    out.h += this.top;
    if (out.liq > -1e8) out.liq += this.top;
    return out;
  }

  // ── The ground ────────────────────────────────────────────────────────────
  _eval(x, z, o, full) {
    const r = o.r;
    const th = o.th;
    const lump = this._n2(x / 61, z / 61); // a swell every sixty metres or so
    const fine = this._n3(x / 9.3, z / 9.3); // and what is underfoot
    const big = this._n1(x / 230, z / 230); // the lie of the land
    // the lines of the cliffs wander, but not where a way goes up them
    const still = Math.min(Math.abs(wrap(th - AT.cleft)) * r, Math.abs(wrap(th - AT.burrow)) * r, outside(th, WAYS[0].a1, AT.gate) * r);
    let rr = r + (this._n1(x / 83, z / 83) * 6 + this._n2(x / 23, z / 23) * 1.2) * smoothstep(STILL, STILL * 3, still);
    let h = 0;
    let liq = -Infinity;
    let kind = LIQUID.none;
    let col = GRASS;
    let tint = 0.5 + 0.5 * this._n1(x / 27, z / 27); // how much this patch differs from the next
    let wet = 0;
    let polish = 0;
    let stone = 0;

    if (r >= R.sand) {
      // ── The shore, and the sea ────────────────────────────────────────────
      const t = (r - R.sand) / (R.shore - R.sand);
      if (r < R.shore + 60) h = lerp(H.plain, -2.6, smooth(clamp((r - R.sand) / (R.shore + 60 - R.sand), 0, 1))) + fine * 0.05 + lump * 0.25 * (1 - clamp(t, 0, 1));
      else h = -2.6 - 28 * smoothstep(R.shore + 60, R.shore + 420, r) - 60 * smoothstep(R.shore + 420, R.shore + 2200, r) - 30 * smoothstep(R.shore + 2200, R.shore + 5000, r) + lump * 1.5;
      liq = 0;
      kind = LIQUID.sea;
      col = r < R.shore + 30 ? SAND : SEABED;
      wet = smoothstep(0.9, -0.1, h);
      tint = 0.5 + 0.5 * this._n3(x / 6, z / 6);
    } else if (rr >= R.foot) {
      // ── The solitary plain ───────────────────────────────────────────────
      const t = (r - R.foot) / (R.sand - R.foot);
      h = lerp(H.foot, H.plain, Math.pow(clamp(t, 0, 1), 0.8)) + (lump * 1.3 + fine * 0.12 + big * 2) * smoothstep(0, 0.1, t) * (1 - smoothstep(0.85, 1, t));
      // dew, where the shadow falls and little evaporates (Canto I)
      wet = 0.25 * smoothstep(0.2, 0.7, this._n1(x / 40, z / 40));
      // a little sand blown up from the beach
      col = mixc(GRASS, SAND, smoothstep(0.82, 1, t));
      // the knoll the road comes up in
      h = this._burrow(r, th, h);
      const b = this._burrowNear(r, th);
      if (b < 22) {
        col = mixc(col, KNOLL, 1 - smoothstep(10, 18, b));
        stone = 1 - smoothstep(12, 18, b);
      }
    } else if (rr >= R.brow) {
      // ── The cliff at the foot ────────────────────────────────────────────
      const t = (R.foot - rr) / (R.foot - R.brow);
      h = lerp(H.foot, H.terrace, smooth(clamp(t, 0, 1))) + fine * 0.4;
      col = ROCK;
    } else if (rr >= R.terrace) {
      // ── The terrace above it, where the negligent sit ───────────────────
      h = H.terrace + (lump * 1.1 + fine * 0.15) * smoothstep(R.brow, R.brow - 12, rr);
      col = GRASS;
    } else if (r >= R.ledge) {
      // ── The long slope of Ante-Purgatory ────────────────────────────────
      h = this._slope(r, x, z, lump, fine, big);
      // the valley of the princes: a lap in the hillside
      const v = this._valley(r, th, x, z, h);
      h = v.h;
      col = mixc(GRASS, MEADOW, v.k);
      tint = lerp(tint, 0.5 + 0.5 * this._n3(x / 4, z / 4), v.k);
    } else if (rr >= R.cliff) {
      // ── The ledge before the great cliff, and the gate's three steps ────
      h = H.ledge + (lump * 0.5 + fine * 0.1) * smoothstep(R.cliff, R.cliff + 10, rr) * smoothstep(R.ledge, R.ledge - 8, r);
      col = GRASS;
      const s = this._steps(r, th);
      if (s >= 0) {
        h = H.ledge + this._stepsUp(r - R.cliff);
        col = STEP[s][0];
        polish = STEP[s][1];
        stone = 1;
      }
    } else if (rr >= TERRACES[0].r) {
      // ── The great cliff, that closes it round ───────────────────────────
      const t = (R.cliff - rr) / (R.cliff - TERRACES[0].r);
      h = lerp(H.ledge, TERRACES[0].h, lerp(t, smooth(clamp(t, 0, 1)), BANK_ROUND)) + fine * 0.3;
      col = ROCK;
      stone = 1;
    } else if (r >= TOP.r) {
      // ── The terraces ─────────────────────────────────────────────────────
      const i = clamp(Math.floor((TERRACES[0].r - r) / (WIDE + RUN)), 0, 6);
      const T = TERRACES[i];
      const into = T.r - r; // m in from its edge
      const up = i < 6 ? TERRACES[i + 1].h : TOP.h;
      if (into <= WIDE) h = T.h + fine * 0.03;
      else {
        const t = clamp((into - WIDE) / RUN, 0, 1);
        h = lerp(T.h, up, lerp(t, smooth(t), BANK_ROUND)) + fine * 0.25 * Math.sin(Math.PI * t);
      }
      col = STONE[i][0];
      polish = STONE[i][1];
      stone = 1;
      tint = 0.5 + 0.5 * this._n3(x / 3.1, z / 3.1);
    } else {
      // ── The top: the forest of the Earthly Paradise ─────────────────────
      h = this._meadow(r, lump);
      col = MEADOW;
      const s = this.stream(r, th, this._s);
      if (s.kind) {
        // the stream's bed, and its banks running up to the meadow
        const a = Math.abs(s.across);
        const bed = s.level - (s.spring ? STREAM.deep * 2.6 : s.sink ? 9 : STREAM.deep);
        const inner = s.spring ? STREAM.pool : s.sink ? 6 : STREAM.half;
        const k = 1 - smoothstep(inner, inner + STREAM.bank, a);
        const floor = lerp(bed, s.level, smoothstep(inner * 0.4, inner, a));
        h = lerp(h, Math.min(h, floor), k);
        // (the meadow is level along it, and low enough for its banks)
        h = Math.min(h, lerp(h, s.level + 0.3, 1 - smoothstep(inner + STREAM.bank, inner + STREAM.bank + 6, a)));
        if (a < inner + STREAM.bank) {
          liq = s.level;
          kind = s.kind;
        }
        wet = 0.6 * (1 - smoothstep(inner, inner + STREAM.bank + 1, a));
      }
    }

    // the cleft up through the cliff at the foot, and the stairs up the banks
    h = this._cleft(r, th, h);
    const w = this._ways(r, th, h, o);
    if (o.way >= 0) {
      h = w;
      stone = 1;
    }

    o.rr = rr;
    o.h = h;
    o.liq = liq;
    o.kind = kind;
    if (full) {
      const v = 0.82 + 0.36 * tint;
      o.cr = col[0] * v;
      o.cg = col[1] * v;
      o.cb = col[2] * v;
      o.wet = wet;
      o.glow = polish;
      o.ice = stone;
    }
  }

  // The long slope from the terrace up to the ledge: steeper as it goes,
  // with the swell of the land on it.
  _slope(r, x, z, lump, fine, big) {
    const u = (R.terrace - r) / (R.terrace - R.ledge);
    const base = lerp(H.terrace, H.ledge, Math.pow(clamp(u, 0, 1), 1.15));
    const relief = (big * 9 + lump * 3 + fine * 0.2) * smoothstep(0, 0.04, u) * smoothstep(1, 0.95, u);
    return base + relief;
  }

  // The meadow on the top: a gentle rise to the middle.
  _meadow(r, lump) {
    return TOP.h + TOP.rise * (1 - (r / TOP.r) ** 2) + lump * 0.7 * smoothstep(TOP.r, TOP.r - 30, r);
  }

  // The valley of the princes, carved into the slope at h: { h, k } (k: how
  // far into the valley, 0..1).
  _valley(r, th, x, z, h) {
    const d = Math.hypot(r - VALLEY.r, wrap(th - AT.valley) * r);
    const out = this._v || (this._v = { h: 0, k: 0 });
    out.h = h;
    out.k = 0;
    if (d > VALLEY.rad + VALLEY.edge) return out;
    // its floor is level, a little under where the slope is at its middle
    const mid = H.terrace + (H.ledge - H.terrace) * Math.pow((R.terrace - VALLEY.r) / (R.terrace - R.ledge), 1.15) - VALLEY.sunk;
    const floor = mid + this._n3(x / 14, z / 14) * 0.35 + (d / VALLEY.rad) ** 2 * 1.5;
    const k = 1 - smoothstep(VALLEY.rad, VALLEY.rad + VALLEY.edge, d);
    out.h = lerp(h, floor, smooth(k));
    out.k = 1 - smoothstep(VALLEY.rad * 0.85, VALLEY.rad + VALLEY.edge * 0.5, d);
    return out;
  }

  // How far (m, in plan) a place on the plain is from the knoll the road
  // comes up in.
  _burrowNear(r, th) {
    return Math.hypot(r - BURROW.r, wrap(th - AT.burrow) * r);
  }

  // The knoll, and the mouth in it facing the sea: the ground at h, raised
  // into the knoll, and cut down to the plain along the mouth.
  _burrow(r, th, h) {
    const along = r - BURROW.r; // + toward the sea
    const across = wrap(th - AT.burrow) * r;
    const d = Math.hypot(along, across);
    if (d > 20) return h;
    const knoll = h + 7.5 * (1 - smoothstep(5, 17, d)) + this._n3(along * 0.3, across * 0.3) * 0.6 * (1 - smoothstep(8, 17, d));
    // the mouth: from the middle of the knoll out toward the sea
    const inMouth = (1 - smoothstep(BURROW.half, BURROW.half + 0.6, Math.abs(across))) * smoothstep(BURROW.back - 0.6, BURROW.back + 0.3, along);
    return lerp(knoll, h, inMouth);
  }

  // Which of the gate's three steps (0..2) a place is on, or -1.
  _steps(r, th) {
    const across = wrap(th - AT.gate) * r;
    if (Math.abs(across) > GATE.half) return -1;
    const out = r - R.cliff;
    if (out < 0 || out > GATE.steps * GATE.tread) return -1;
    return GATE.steps - 1 - Math.floor(out / GATE.tread);
  }

  // How high the steps are at `out` m out from the foot of the cliff (over
  // the ledge): each rises at its outer edge, over a little of its tread,
  // so that it can be walked up.
  _stepsUp(out) {
    let h = 0;
    for (let i = 0; i < GATE.steps; i++) {
      const edge = (GATE.steps - i) * GATE.tread;
      h += GATE.rise * smoothstep(edge, edge - GATE.riser, out);
    }
    return h;
  }

  // The cleft at the foot: a slot cut up through the cliff, its floor
  // climbing evenly from the plain to the terrace.
  _cleft(r, th, h) {
    if (r > R.foot + 1 || r < CLEFT.r1 - 2) return h;
    const across = Math.abs(wrap(th - AT.cleft)) * r;
    if (across > CLEFT.half + CLEFT.side) return h;
    const t = clamp((R.foot - r) / (R.foot - CLEFT.r1), 0, 1);
    const tread = lerp(H.foot, H.terrace, lerp(t, smooth(t), 0.25));
    return lerp(h, Math.min(h, tread), 1 - smoothstep(CLEFT.half, CLEFT.half + CLEFT.side, across));
  }

  // The ways up the banks (plan.WAYS): where one is cut through, the
  // ground is its tread; -> the ground at (r, th), cut by any way through it
  // (and in o.way, which: -1 for none).
  _ways(r, th, h, o) {
    o.way = -1;
    if (r > R.cliff + 1 || r < TOP.r - 6) return h;
    for (let k = 0; k < WAYS.length; k++) {
      const w = WAYS[k];
      if (r > w.ra + 1 || r < w.rb - w.lag - 3) continue;
      const at = this._along(w, r, th, this._s);
      if (!at) continue;
      const cut = (1 - smoothstep(at.half, at.half + SIDE, Math.abs(at.across))) * at.on;
      if (cut <= 0) continue;
      // (the needle's eye goes in level with the gate's threshold, over the
      // ledge: there it is the tread, whatever is under it)
      const t = k === 0 && at.inward ? lerp(h, at.tread, cut) : lerp(h, Math.min(h, at.tread), cut);
      if (Math.abs(t - h) > 1e-6) {
        h = t;
        o.way = k;
      }
    }
    return h;
  }

  // Where (r, th) is in way w, which goes in two pieces: straight in from
  // the floor at its foot, level, `lag` m into the bank (inward); then up,
  // slantwise round the mountain to its head. -> out, or null if it's
  // nowhere near:
  //   out.inward   whether it's the way in, not the climb
  //   out.u        how far up the climb (0..1; 0 on the way in)
  //   out.across   m from its line
  //   out.half     m either side of its line it is cut (wider where it turns)
  //   out.tread    its height there (from the sea)
  //   out.on       1 within its length, fading off its ends
  _along(w, r, th, out) {
    const dr = w.ra - w.rb;
    // the way in
    const e = (w.ra - r) / w.lag;
    const acrossIn = wrap(th - w.a0) * r;
    // the climb
    const u = wrap(w.a0 - th) / (w.a0 - w.a1);
    const climbs = u > -0.04 && u < 1.04;
    if (!climbs && (e < -0.15 || e > 1.1 || Math.abs(acrossIn) > w.half + 2)) return null;
    let acrossUp = Infinity;
    if (climbs) {
      // (and winds, if it does, but not where it comes out at its head)
      const wave = w.wave ? w.wave * Math.sin(Math.PI * w.waves * clamp(u, 0, 1)) * (1 - smoothstep(0.6, 0.85, u)) * smoothstep(0, 0.12, u) : 0;
      const line = w.ra - w.lag - dr * u + wave;
      // (it runs slantwise, so a step off its line in r is less than that across it)
      acrossUp = (r - line) * (w.run / Math.hypot(w.run, dr));
    }
    const inward = e > -0.15 && e < 1.1 && Math.abs(acrossIn) < Math.abs(acrossUp);
    out.inward = inward;
    if (inward) {
      out.u = 0;
      out.across = acrossIn;
      out.half = w.half + TURN * smoothstep(0.4, 1, e);
      out.tread = w.h0;
      out.on = smoothstep(-0.15, 0, e) * (1 - smoothstep(1, 1.1, e));
    } else {
      out.u = clamp(u, 0, 1);
      out.across = acrossUp;
      out.half = w.half + TURN * (1 - smoothstep(0, 0.1, u));
      out.tread = w.h0 + (w.h1 - w.h0) * out.u;
      out.on = smoothstep(-0.04, 0, u) * (1 - smoothstep(1, 1.04, u));
    }
    return out;
  }

  // The way up a place is in, if it is in one: { k, up, inward } (up: how
  // far up its climb, 0..1; inward: on the level way in to it), or null.
  wayAt(r, th) {
    for (let k = 0; k < WAYS.length; k++) {
      const w = WAYS[k];
      if (r > w.ra + 1 || r < w.rb - w.lag - 1) continue;
      const at = this._along(w, r, th, this._s);
      if (!at || Math.abs(at.across) > at.half + 0.2 || at.on < 0.5) continue;
      return { k, up: at.u, inward: at.inward };
    }
    return null;
  }

  // ── The stream on the top ─────────────────────────────────────────────────
  // Where (r, th) is to the stream: out.along (m along its line, + to the
  // right of the way in, the spring at STREAM.spring), out.across (m from
  // its line), out.level (its surface there, from the sea), out.kind (Lethe
  // or Eunoë, or none where it doesn't run), out.spring and out.sink (at the
  // fountain, or the hole at the rim it goes down into). -> out.
  stream(r, th, out) {
    const S = this.streamAt;
    const px = r * Math.cos(th) - S.cx;
    const pz = r * Math.sin(th) - S.cz;
    const along = px * S.rx + pz * S.rz;
    // (it wanders a little either side of its line)
    const across = px * S.ex + pz * S.ez + wander(along);
    out.along = along;
    out.across = across;
    out.spring = false;
    out.sink = false;
    out.kind = LIQUID.none;
    const [lo, hi] = S.ends;
    if (along < lo - 8 || along > hi + 8) return out;
    const fromSpring = Math.abs(along - S.spring);
    // its surface: level from the spring as far as the middle, then falling
    // with the meadow toward the rim, either way
    const rc = Math.hypot(STREAM.beyond, along);
    const meadow = this._meadow(rc, 0) - 0.35;
    out.level = Math.min(this.springLevel, meadow) - fromSpring * 0.0005;
    out.kind = along < S.spring ? LIQUID.lethe : LIQUID.eunoe;
    if (fromSpring < STREAM.pool + 2) {
      out.spring = true;
      out.kind = LIQUID.spring;
      out.across = Math.hypot(along - S.spring, px * S.ex + pz * S.ez);
    } else if (along < lo + 6 || along > hi - 6) {
      // the hole at the rim it goes down into
      const end = along < lo + 6 ? lo : hi;
      out.sink = true;
      out.across = Math.hypot(along - end, px * S.ex + pz * S.ez);
    }
    if (along < lo - 6 || along > hi + 6) out.kind = LIQUID.none;
    return out;
  }

  // Where a place `along` m along the stream is, in the middle of it (or
  // `off` m from its middle: + toward where the last stair comes up): world
  // x, z.
  /**
   * @param {number} along
   * @param {{ x?: number, z?: number }} [out]
   * @param {number} [off]
   * @returns {{ x: number, z: number }}
   */
  streamPoint(along, out = {}, off = 0) {
    const S = this.streamAt;
    const k = off - wander(along);
    const lx = S.cx + S.rx * along + S.ex * k;
    const lz = S.cz + S.rz * along + S.ez * k;
    return this.place(Math.hypot(lx, lz), Math.atan2(lz, lx), out);
  }

  // ── What was built ──────────────────────────────────────────────────────
  // How high (m over its ground) something stands at (r, th) that can't be
  // walked through, or 0: the gate's door, while it is shut.
  barrier(r, th) {
    if (!this.shut || r > R.cliff - DOOR.at + DOOR.thick || r < R.cliff - DOOR.at - DOOR.thick) return 0;
    return Math.abs(wrap(th - AT.gate)) * r < WAYS[0].half + 0.4 ? GATE.height : 0;
  }
}

// How far (m) the stream on the top wanders from its line, `along` m along it.
const wander = (along) => 5 * Math.sin(along / 47) + 2 * Math.sin(along / 13 + 1.3);

// How far (rad) an angle is outside the span from a to b (a < b), or 0 in it.
const outside = (th, a, b) => {
  const mid = (a + b) / 2;
  return Math.max(0, Math.abs(wrap(th - mid)) - (b - a) / 2);
};

const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
