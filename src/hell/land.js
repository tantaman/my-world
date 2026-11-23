// The ground of Hell: how high it is anywhere, what lies on it, and where
// the ways down are. Grown from the world's seed and from nothing else, so
// it is the same for everyone in a world; it has no part in what the forest
// grows, being a long way under it.
//
// It is laid out round an axis (cx, cz), by plan.js. A place in it is a
// radius and an angle from the door (th, radians). The angle is not wrapped:
// from the vestibule down to the burning sand a circle does not close, and
// one turn on from a place is another place with the same land under it but
// its own ways down, its own landings and sights (they are dealt out by
// sector, and sectors are numbered without end either way). So to say where
// a world position is, you have to say which turn you mean: polar() takes
// the angle of whoever is asking (`ref`) and answers with the angle nearest
// theirs. Inside the great cliff (plan.ONE) there is one of everything and
// the turn makes no difference.
//
//   land.sample(x, z, ref, out, full)   the ground at a world position:
//     out.h      its height (world m)
//     out.liq    the surface of whatever lies in it, or -Infinity
//     out.kind   which liquid that is (plan.LIQUID)
//     out.r, th  where that is in Hell
//     out.rr     its radius as the circles' wandering edges count it: which
//                circle it is in goes by this
//     and with `full`, what it looks like: out.cr, cg, cb (its colour),
//     out.wet, out.glow, out.ice (0..1 each)
//   land.height(x, z, ref)              just out.h
//   land.sector(k)                      what sector k holds (see sitesOf)
//   land.place(r, th, out)              world x, z of a place in Hell

import { createSimplex2, hash2i, lerp, clamp, smoothstep } from '../noise.js';
import { R, H, STEPS, SECTOR, ONE, BOLGE, LIQUID, TAU, bankTop } from './plan.js';

const SALT = 0x1ef2;
const FALL = 11; // m: how far a way down's sides take to rise to the cliff either side
const LANDING = 16; // m at the foot of a way down over which its level gives way to the ground below
// The door: a passage `half` m either side of th = 0, running `depth` m back
// into the rock, level with the vestibule.
export const DOOR = { half: 2.4, depth: 14 };
// The castle of Limbo: where it stands, and the rings round it.
// (walls: the radii of its seven; thick, h: how thick and high they are;
// gate: how wide the way through each.)
export const CASTLE = { r: 4190, knoll: 6, flat: 124, moat: 108, walls: [38, 46, 54, 62, 70, 78, 86], thick: 1.3, h: 6.5, gate: 3.4 };
// The wall of Dis: its middle line, how thick and how high, and how wide
// its gates are.
export const WALL = { r: R.dis + 2, thick: 3.6, h: 14, gate: 5.2 };
// The brook out of Phlegethon, across the wood and the sand to the brink,
// "its bed and both its sloping banks made of stone, and the margins at the
// side": half its bed's width; how far out its banks have risen to the
// margins, and where the margins end (m from its middle); and how the bed,
// the blood and the margins stand to the sand (m).
export const BROOK = { half: 1.6, bank: 5.4, dyke: 8, bed: -1.9, level: -1.25, top: 0.4 };
// The ford over Phlegethon: half its width along the bank.
export const FORD = { half: 8 };
// Where the stair down a ditch's outer wall starts and how long it is, in m
// along the bank from a bridge, and where across the wall its tread lies.
export const STAIR = { from: 9, run: 40, q0: 2.5, q1: 6.5 };

const smooth = (t) => t * t * (3 - 2 * t);
// How far the lumps of a circle's ground have died away toward the drop at
// its inner edge (step i's): 0 at the edge, 1 a little way back from it.
const edge = (rr, i) => smoothstep(STEPS[i].at + STEPS[i].w / 2, STEPS[i].at + STEPS[i].w / 2 + 14, rr);
const frac = (h) => (h >>> 8) / 16777216;

// Where sector 0's sights are, as fractions of a sector from its middle: the
// way Dante went, bearing always to the left. Elsewhere they are by chance.
const FIRST = { ferry: 0, castle: -0.3, c1: 0.24, c2: 0.06, c3: 0.3, c4: 0.14, ruin: 0.34, ford: 0.42, brook: 0.18 };

export class HellLand {
  // seed: the world's · cx, cz: the axis · top: the height of the
  // vestibule's floor (world m) · turn: the world angle the door is at from
  // the axis (th = 0)
  constructor({ seed, cx, cz, top, turn }) {
    this.seed = (seed ^ SALT) | 0;
    this.cx = cx;
    this.cz = cz;
    this.top = top;
    this.turn = turn;
    this.reach = R.wall + 60; // m from the axis: there is nothing past this
    this._n1 = createSimplex2(this.seed + 11);
    this._n2 = createSimplex2(this.seed + 23);
    this._n3 = createSimplex2(this.seed + 37);
    this._sectors = new Map();
    this._o = {};
    this._c = { x: 0, z: 0 };
    // the bridges of Malebolge: the angles of the spokes they lie along
    this.spokes = [];
    for (let j = 0; j < BOLGE.spokes; j++) this.spokes.push(((j + 0.12 + 0.3 * (frac(hash2i(j, 77, this.seed)) - 0.5)) * TAU) / BOLGE.spokes);
  }

  // Where a world position is in Hell: out.r, and out.th within half a turn
  // of ref.
  polar(x, z, ref, out) {
    const dx = x - this.cx;
    const dz = z - this.cz;
    out.r = Math.hypot(dx, dz);
    const a = Math.atan2(dz, dx) - this.turn;
    out.th = a + TAU * Math.round((ref - a) / TAU);
    return out;
  }

  // The world position of a place in Hell: out.x, out.z.
  place(r, th, out = {}) {
    out.x = this.cx + r * Math.cos(th + this.turn);
    out.z = this.cz + r * Math.sin(th + this.turn);
    return out;
  }

  // The sector an angle is in. Sector k is SECTOR wide, with k * SECTOR at
  // its middle.
  sectorOf(th) {
    return Math.round(th / SECTOR);
  }

  // What sector k holds, as angles:
  //   pass     the way down each of plan.STEPS (NaN where there is none)
  //   ferry    where Charon lands, on both banks of Acheron
  //   castle   a castle in Limbo, or NaN: most sectors have none
  //   quay     the gate of Dis, across the marsh from the way down to it
  //   ford     where Phlegethon can be waded
  //   brook    the brook over the sand, to its fall at the brink
  sector(k) {
    let s = this._sectors.get(k);
    if (s) return s;
    const at = (name, salt, spread = 0.36) => (k + (k === 0 ? FIRST[name] : (frac(hash2i(k, salt, this.seed)) - 0.5) * 2 * spread)) * SECTOR;
    s = {
      k,
      pass: STEPS.map((step, i) => (step.pass ? at(step.id, 100 + i) : NaN)),
      ferry: at('ferry', 1),
      castle: k === 0 || frac(hash2i(k, 2, this.seed)) < 0.14 ? at('castle', 3, 0.2) : NaN,
      quay: 0,
      ford: at('ford', 5),
      brook: at('brook', 6),
    };
    // the gate of Dis is straight across the marsh from the spit the way
    // down to it ends in, so the boat has a clear run
    s.quay = s.pass[3];
    if (this._sectors.size > 400) this._sectors.clear();
    this._sectors.set(k, s);
    return s;
  }

  height(x, z, ref) {
    return this.sample(x, z, ref, this._o, false).h;
  }

  sample(x, z, ref, out, full = false) {
    this.polar(x, z, ref, out);
    this._eval(x, z, out, full);
    out.h += this.top;
    if (out.liq > -1e8) out.liq += this.top;
    return out;
  }

  // The ground at (r, th), which is at world (x, z): heights from the top.
  _eval(x, z, o, full) {
    const r = o.r;
    const th = o.th;
    // the lines of the cliffs wander, out where the circles are wide
    let rr = r;
    // (but not at the wall of Dis, which was built, and built round)
    if (r > ONE + 20) rr += (this._n1(x / 83, z / 83) * 5 + this._n2(x / 29, z / 29) * 0.8) * smoothstep(ONE + 20, ONE + 160, r) * (1 - smoothstep(R.wall - 120, R.wall - 30, r)) * smoothstep(30, 110, Math.abs(r - R.dis));
    const lump = this._n2(x / 47, z / 47); // a swell every fifty metres or so
    const fine = this._n3(x / 9.3, z / 9.3); // and what is underfoot
    let h = 0;
    let liq = -Infinity;
    let kind = LIQUID.none;
    // what it looks like
    let cr = 0.08;
    let cg = 0.075;
    let cb = 0.07;
    let wet = 0;
    let glow = 0;
    let ice = 0;
    const k = this.sectorOf(th);

    if (rr < R.brink + STEPS[5].w / 2) {
      // ── Malebolge, the well, the lake ───────────────────────────────────
      this._pit(r, th, x, z, lump, fine, o, full);
      return;
    }

    if (rr >= R.wall) {
      // the rock that shuts it all in, and the door through it
      // (it rises out of the scree at the vestibule's edge)
      h = 3.5 + lump * 1.1 + fine * 0.22 + Math.min(260, (rr - R.wall) * 2.7) + lump * 2 * smoothstep(0, 12, rr - R.wall);
      const a = Math.abs(th) * r;
      if (a < DOOR.half + 2 && rr < R.wall + DOOR.depth) h = lerp(0, h, smoothstep(DOOR.half, DOOR.half + 1.4, a));
      cr = 0.06;
      cg = 0.056;
      cb = 0.055;
    } else if (rr >= R.acheronOut) {
      // the vestibule: an ashen plain
      // (levelling out to the river's bank)
      h = (lump * 1.1 + fine * 0.1) * smoothstep(R.acheronOut, R.acheronOut + 14, rr) + fine * 0.12 + smoothstep(R.wall - 22, R.wall, rr) * 3.5;
      const a = Math.abs(th) * r;
      if (a < 14) h *= smoothstep(DOOR.half, 12, a + Math.max(0, R.wall - rr) * 0.12);
      const t = 0.5 + 0.5 * this._n1(x / 21, z / 21);
      cr = lerp(0.07, 0.1, t);
      cg = lerp(0.062, 0.088, t);
      cb = lerp(0.058, 0.08, t);
    } else if (rr >= R.acheronIn) {
      // Acheron: a wide, slow river between low banks
      const u = (rr - R.acheronIn) / (R.acheronOut - R.acheronIn);
      h = lerp(-1, 0, u) - 6.8 * Math.pow(Math.sin(Math.PI * u), 0.7) + fine * 0.12;
      liq = H.acheron;
      kind = LIQUID.acheron;
      cr = 0.05;
      cg = 0.05;
      cb = 0.052;
      wet = smoothstep(H.acheron + 1.2, H.acheron + 0.1, h);
    } else if (rr >= R.c1 + STEPS[0].w / 2) {
      // Limbo: down a long bank from the river, then a dim meadow
      const bank = smooth(clamp((R.acheronIn - rr) / (R.acheronIn - R.limboFoot), 0, 1));
      let relief = (lump * 1.5 + fine * 0.2) * edge(rr, 0);
      let green = 0.35 + 0.25 * this._n1(x / 33, z / 33);
      const s = this.sector(k);
      if (s.castle === s.castle) {
        // a castle's knoll, levelled ground and the brook round it
        this.place(CASTLE.r, s.castle, this._c);
        const d = Math.hypot(x - this._c.x, z - this._c.z);
        if (d < CASTLE.flat + 40) {
          const flat = 1 - smoothstep(CASTLE.flat, CASTLE.flat + 40, d);
          relief = relief * (1 - flat) + CASTLE.knoll * (1 - smoothstep(18, CASTLE.moat - 10, d));
          const m = Math.abs(d - CASTLE.moat);
          if (m < 9) {
            relief -= 1.15 * (1 - smoothstep(2.2, 4.6, m));
            liq = H.limbo - 0.45;
            kind = LIQUID.brook;
          }
          green = lerp(green, 1, flat * (1 - smoothstep(CASTLE.moat - 6, CASTLE.moat, d)));
        }
      }
      const off = smoothstep(0, 0.2, bank); // (the bank's lumps begin a little way up from the water)
      h = lerp(-1, H.limbo, bank) + relief * off * (0.4 + 0.6 * bank) + fine * 0.12 * (1 - off);
      green *= bank;
      cr = lerp(0.07, 0.05, green);
      cg = lerp(0.066, 0.1, green);
      cb = lerp(0.06, 0.04, green);
    } else if (rr >= R.c2 + STEPS[1].w / 2) {
      h = this._face(0, rr, H.c2 + (lump * 1.1 + Math.abs(fine) * 0.5) * edge(rr, 1));
      // the second circle: rock the wind has scoured bare
      const t = 0.5 + 0.5 * this._n1(x / 17, z / 17);
      cr = lerp(0.062, 0.085, t);
      cg = lerp(0.06, 0.08, t);
      cb = lerp(0.066, 0.09, t);
    } else if (rr >= R.c3 + STEPS[2].w / 2) {
      h = this._face(1, rr, H.c3 + (lump * 0.55 + fine * 0.3) * edge(rr, 2));
      // the third: mud, and standing water in every hollow
      if (rr < R.c2 - 18 && rr > R.c3 + 18) {
        liq = H.c3 - 0.16;
        kind = LIQUID.slush;
      }
      cr = 0.058;
      cg = 0.05;
      cb = 0.04;
      wet = 0.75;
    } else if (rr >= R.c4 + STEPS[3].w / 2) {
      h = this._face(2, rr, H.c4 + (lump * 0.4 + fine * 0.12) * edge(rr, 3));
      // the fourth: a floor of grey stone, worn in rings
      const t = 0.5 + 0.5 * Math.sin(rr * 0.9 + lump * 2);
      cr = lerp(0.08, 0.095, t);
      cg = lerp(0.075, 0.088, t);
      cb = lerp(0.068, 0.078, t);
    } else if (rr >= R.dis) {
      // Styx: the marsh, deepening from the shore, a moat under the wall
      const shore = STEPS[3].lo;
      const d1 = R.c4 - STEPS[3].w / 2 - rr;
      const d2 = rr - R.dis;
      const flats = this._n1(x / 39, z / 39);
      // (a channel is kept clear of mud flats from the spit to the gate)
      const lane = smoothstep(9, 24, Math.abs(th - this.sector(k).quay) * r);
      let bed = shore - smoothstep(0, 55, d1) * 3.4 + (flats * 1.1 + Math.max(0, flats - 0.42) * 6.5) * smoothstep(20, 70, d1) * smoothstep(50, 90, d2) * lane + fine * 0.1;
      bed -= (1 - lane) * 1.2 * smoothstep(40, 60, d1);
      bed = lerp(H.dis, Math.min(bed, lerp(H.styx - 3.2, bed, smoothstep(40, 70, d2))), smoothstep(1.5, 9, d2));
      h = this._face(3, rr, bed);
      liq = H.styx;
      kind = LIQUID.styx;
      cr = 0.045;
      cg = 0.046;
      cb = 0.034;
      wet = 0.8;
    } else if (rr >= R.c6 + STEPS[4].w / 2) {
      // the sixth, inside the wall: scorched ground among the tombs
      h = H.dis + (lump * 0.7 + fine * 0.15) * edge(rr, 4) * smoothstep(0, 12, R.dis - rr);
      const t = 0.5 + 0.5 * this._n1(x / 14, z / 14);
      cr = lerp(0.075, 0.1, t);
      cg = lerp(0.056, 0.066, t);
      cb = lerp(0.046, 0.05, t);
      glow = 0.05 * t;
    } else {
      // ── The seventh circle ──────────────────────────────────────────────
      const s = this.sector(k);
      let base;
      if (rr >= R.bloodOut) {
        // under the ruin: broken rock down to the river
        base = H.c7 + (lump * 0.8 + Math.abs(fine) * 0.7) * smoothstep(R.bloodOut, R.bloodOut + 24, rr);
        cr = 0.09;
        cg = 0.058;
        cb = 0.05;
      } else if (rr >= R.bloodIn) {
        // Phlegethon: the river of blood, and its ford
        const u = (rr - R.bloodIn) / (R.bloodOut - R.bloodIn);
        base = H.c7 - 5.6 * Math.pow(Math.sin(Math.PI * u), 0.6);
        const a = Math.abs(th - s.ford) * r;
        // (the ford: knee deep right across, its banks worn down to a slope)
        if (a < FORD.half + 7) base = lerp(Math.max(base, H.c7 - (H.c7 - H.blood + 0.4) * smoothstep(0, 0.1, Math.min(u, 1 - u)) + fine * 0.05), base, smoothstep(FORD.half, FORD.half + 6, a));
        cr = 0.1;
        cg = 0.04;
        cb = 0.035;
        wet = 0.6;
      } else {
        // the wood: black litter over roots; then the sand, in low dunes, hot
        const dune = Math.sin((x + z) * 0.11 + lump * 3) * 0.5 + 0.5;
        const wood = H.c7 + (0.3 + lump * 1.3 + fine * 0.3) * (1 - smoothstep(R.bloodIn - 12, R.bloodIn, rr));
        const sand = H.c7 + (0.2 + lump * 0.5 + dune * 0.35) * edge(rr, 5);
        // (one runs out into the other over a few metres)
        const t = smoothstep(R.wood - 7, R.wood + 7, rr);
        base = lerp(sand, wood, t);
        const n = 0.5 + 0.5 * this._n1(x / 26, z / 26);
        cr = lerp(lerp(0.26, 0.34, n), 0.042, t);
        cg = lerp(lerp(0.16, 0.2, n), 0.036, t);
        cb = lerp(lerp(0.075, 0.09, n), 0.03, t);
        glow = (0.16 + 0.1 * n) * (1 - t);
      }
      if (rr >= R.bloodIn - 8 && rr < R.bloodOut + 8) {
        liq = H.blood;
        kind = LIQUID.blood;
      }
      // the brook: out of the river, through the wood, over the sand
      if (rr < R.bloodIn + 6) {
        const a = Math.abs(th - s.brook) * r;
        if (a < BROOK.dyke + 3) {
          const flat = H.c7 + 0.2 * edge(rr, 5);
          // (banks you can walk up: whoever steps into it can step out)
          const inn = 1 - smoothstep(BROOK.half, BROOK.bank, a);
          const dyke = (1 - smoothstep(BROOK.dyke, BROOK.dyke + 2.4, a)) * (1 - inn);
          const join = smoothstep(R.bloodIn - 4, R.bloodIn + 6, rr); // it opens into the river
          base = lerp(lerp(base, flat + BROOK.top, dyke * (1 - join)), flat + BROOK.bed, inn);
          if (a < BROOK.dyke) {
            liq = lerp(flat + BROOK.level, H.blood, join);
            kind = LIQUID.blood;
          }
          // its margins are stone, and nothing burns over them
          const stone = Math.max(inn, dyke);
          cr = lerp(cr, 0.085, stone);
          cg = lerp(cg, 0.078, stone);
          cb = lerp(cb, 0.075, stone);
          glow *= 1 - stone;
        }
      }
      h = this._face(4, rr, base);
    }

    // the ways down
    h = this._passes(rr, r, th, k, h);

    o.rr = rr;
    o.h = h;
    o.liq = liq;
    o.kind = kind;
    if (full) {
      o.cr = cr;
      o.cg = cg;
      o.cb = cb;
      o.wet = wet;
      o.glow = glow;
      o.ice = ice;
    }
  }

  // The drop at a circle's inner edge. Step i's whole face is worked out by
  // the circle below it: `inner` is that circle's ground, and the face rises
  // from it to the height of the circle above (whose ground is level at
  // its edge: see `edge` in _eval).
  _face(i, rr, inner) {
    const s = STEPS[i];
    const t = clamp((rr - (s.at - s.w / 2)) / s.w, 0, 1);
    return t <= 0 ? inner : lerp(inner, s.hi, smooth(t));
  }

  // The ways down: where one of a step's ramps crosses (rr, th), the ground
  // is the ramp's, cut back into the circle above and fanned out over the
  // one below.
  _passes(rr, r, th, k, h) {
    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      if (!s.pass) continue;
      const fan = (s.hi - s.lo) / s.pass.slope - s.pass.back;
      if (rr > s.at + s.pass.back + 6 || rr < s.at - fan - LANDING) continue;
      // the nearest of this sector's way down and its neighbours'
      let a = Infinity;
      for (let q = k - 1; q <= k + 1; q++) a = Math.min(a, Math.abs(th - this.sector(q).pass[i]) * r);
      if (a >= s.pass.half + FALL) continue;
      const t = clamp((rr - (s.at - fan)) / (fan + s.pass.back), 0, 1);
      // a little eased at the ends, so you walk onto it and off it
      const ramp = lerp(s.lo, s.hi, lerp(t, smooth(t), 0.35));
      // (it runs out into the ground of each circle over its last few metres)
      // (and at its foot a landing, the ramp's own level running on out over
      // what's below a little way before giving way to it, so the last step
      // off it is no steeper than the rest, whatever the rough ground there)
      const ends = (1 - smoothstep(s.at + s.pass.back, s.at + s.pass.back + 6, rr)) * smoothstep(s.at - fan - LANDING, s.at - fan, rr);
      h = lerp(h, ramp, (1 - smoothstep(s.pass.half, s.pass.half + FALL, a)) * ends);
    }
    return h;
  }

  // How far along the bank (m, signed: + is on round to the left) a place
  // in Malebolge is from the nearest bridge, and which bridge that is.
  spokeAt(r, th, out) {
    let best = Infinity;
    let which = -1;
    for (let j = 0; j < this.spokes.length; j++) {
      let d = th - this.spokes[j];
      d -= TAU * Math.round(d / TAU);
      if (Math.abs(d) < Math.abs(best)) {
        best = d;
        which = j;
      }
    }
    out.a = best * r;
    out.spoke = which;
    return out;
  }

  // Malebolge, the well and Cocytus: the one place they are.
  _pit(r, th, x, z, lump, fine, o, full) {
    let h;
    let liq = -Infinity;
    let kind = LIQUID.none;
    let cr = 0.082;
    let cg = 0.078;
    let cb = 0.084;
    let wet = 0;
    let glow = 0;
    let ice = 0;
    if (r >= R.bolge) {
      // under the great cliff: fallen rock, then the first bank
      h = H.bolge + fine * 0.25 + smoothstep(R.brink - 40, R.brink - 17, r) * (6 + lump * 3);
      h = this._face(5, r, h);
    } else if (r >= R.well && r < R.bank) {
      // the bank that girds the well
      h = H.lip + fine * 0.1;
    } else if (r >= R.well) {
      const i = Math.min(BOLGE.n - 1, Math.floor((R.bolge - r) / BOLGE.pitch));
      const into = R.bolge - i * BOLGE.pitch - r;
      const level = bankTop(i) - (BOLGE.tilt * into) / BOLGE.pitch;
      h = level + fine * 0.1;
      const q = into - BOLGE.bank;
      if (q > 0) {
        const topI = bankTop(i) - BOLGE.tilt;
        const floor = topI - BOLGE.deep;
        const w = q < BOLGE.wall ? smooth(q / BOLGE.wall) : q > BOLGE.ditch - BOLGE.wall ? smooth((BOLGE.ditch - q) / BOLGE.wall) : 1;
        h = lerp(level, floor + Math.abs(fine) * 0.25, w);
        const sp = this.spokeAt(r, th, this._c);
        if (i === BOLGE.broken) {
          // the bridge that fell: a heap of its rock across the ditch
          const sag = Math.sin((Math.PI * q) / BOLGE.ditch);
          const heap = level - (12 - fine * 0.5) * sag - Math.max(0, Math.abs(sp.a) - 4) * 0.62;
          if (heap > h) h = heap;
        }
        // a stair down the outer wall, on round from each bridge
        const s = (sp.a - STAIR.from) / STAIR.run;
        if (s > -0.08 && s < 1.08 && q > STAIR.q0 - 1.2 && q < STAIR.q1 + 1.2) {
          const tread = lerp(level, floor, clamp(s, 0, 1));
          const on = smoothstep(STAIR.q0 - 1.2, STAIR.q0, q) * (1 - smoothstep(STAIR.q1, STAIR.q1 + 1.2, q)) * smoothstep(-0.08, 0, s) * (1 - smoothstep(1, 1.08, s));
          h = lerp(h, tread, on);
        }
        if (i === 4) {
          liq = floor + 0.7;
          kind = LIQUID.pitch;
        } else if (i === 1) {
          liq = floor + 0.5;
          kind = LIQUID.filth;
        }
        if (full) {
          // each ditch's floor has its own cast
          const t = w * w;
          const tint = DITCH_TINT[i];
          cr = lerp(cr, tint[0], t);
          cg = lerp(cg, tint[1], t);
          cb = lerp(cb, tint[2], t);
          if (i === 7) glow = 0.06 * t;
          if (i === 2) glow = 0.04 * t;
        }
      }
    } else if (r >= R.shelf) {
      // the well: its wall, and the shelf the giants stand on
      const t = smoothstep(R.well - 8, R.well, r);
      h = lerp(H.shelf + fine * 0.12 * smoothstep(R.shelf, R.shelf + 8, r), H.lip, t);
      cr = 0.07;
      cg = 0.072;
      cb = 0.082;
    } else {
      // Cocytus
      h = lerp(H.centre, H.ice, r / R.shelf) + lump * 0.25 * smoothstep(30, 120, r);
      ice = 1;
      const t = 0.5 + 0.5 * this._n1(x / 31, z / 31);
      cr = lerp(0.2, 0.3, t);
      cg = lerp(0.29, 0.4, t);
      cb = lerp(0.38, 0.5, t);
    }
    o.rr = r;
    o.h = h;
    o.liq = liq;
    o.kind = kind;
    if (full) {
      o.cr = cr;
      o.cg = cg;
      o.cb = cb;
      o.wet = wet;
      o.glow = glow;
      o.ice = ice;
    }
  }

  // ── What was built ──────────────────────────────────────────────────────
  // How high (m over its ground) something built stands at (r, th) that
  // can't be walked through, or 0: the wall of Dis, but for its gates, and
  // the seven walls of a castle of Limbo, but for theirs.
  barrier(r, th, x, z) {
    if (Math.abs(r - WALL.r) < WALL.thick / 2) {
      const a = Math.abs(th - this.sector(this.sectorOf(th)).quay) * r;
      return a < WALL.gate / 2 ? 0 : WALL.h;
    }
    if (r > CASTLE.r - 100 && r < CASTLE.r + 100) {
      const s = this.sector(this.sectorOf(th));
      if (s.castle !== s.castle) return 0;
      this.place(CASTLE.r, s.castle, this._c);
      const dx = x - this._c.x;
      const dz = z - this._c.z;
      const d = Math.hypot(dx, dz);
      for (const ring of CASTLE.walls) {
        if (Math.abs(d - ring) > CASTLE.thick / 2) continue;
        // its gates are all in a line, on the side toward the river
        const out = (dx * (this._c.x - this.cx) + dz * (this._c.z - this.cz)) / (d * CASTLE.r);
        const across = d * Math.sqrt(Math.max(0, 1 - out * out));
        return out > 0 && across < CASTLE.gate / 2 ? 0 : CASTLE.h;
      }
    }
    return 0;
  }

  // ── Bridges ─────────────────────────────────────────────────────────────
  // The deck of the bridge over a place in Malebolge, if it is under (or
  // on) one: out.top, the height of its roadway, and out.under, of its
  // underside (world m). -> false where there is none.
  deck(r, th, out) {
    if (r >= R.bolge || r < R.bank) return false;
    const i = Math.min(BOLGE.n - 1, Math.floor((R.bolge - r) / BOLGE.pitch));
    if (i === BOLGE.broken) return false;
    const into = R.bolge - i * BOLGE.pitch - r;
    const q = into - BOLGE.bank;
    if (q <= 0 || q >= BOLGE.ditch) return false;
    const sp = this.spokeAt(r, th, this._c);
    if (Math.abs(sp.a) > BOLGE.deck) return false;
    const u = q / BOLGE.ditch;
    const level = bankTop(i) - (BOLGE.tilt * into) / BOLGE.pitch;
    const arch = 1 - (2 * u - 1) * (2 * u - 1);
    out.top = this.top + level + BOLGE.rise * arch;
    out.under = out.top - 1.4 - 15 * (1 - Math.sqrt(arch));
    return true;
  }
}

// What colour each ditch's floor is.
const DITCH_TINT = [
  [0.08, 0.07, 0.07], // 1 panders and seducers: trodden stone
  [0.07, 0.055, 0.03], // 2 flatterers
  [0.1, 0.085, 0.075], // 3 simoniacs: livid stone, full of holes
  [0.06, 0.065, 0.07], // 4 diviners: wet with their tears
  [0.02, 0.02, 0.022], // 5 barrators: pitch
  [0.09, 0.085, 0.07], // 6 hypocrites
  [0.075, 0.065, 0.05], // 7 thieves: dust and ash
  [0.09, 0.06, 0.045], // 8 false counsellors: lit by their own flames
  [0.085, 0.05, 0.045], // 9 sowers of discord
  [0.06, 0.066, 0.05], // 10 falsifiers
];
