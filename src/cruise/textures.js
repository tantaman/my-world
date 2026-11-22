// What her insides are made of: the carpets, the marble, the wood, the
// wallpaper and the ceilings, painted here in code (this game has no image
// files), each into a layer of one array of textures, so that every floor,
// wall and ceiling of a deck is still drawn in one go, however many of them
// there are.
//
// A surface is drawn in one of two ways:
//   dyed      in its own colours (the corridor carpet, the marble): what's
//             drawn with it is drawn white
//   tinted    near-white, its pattern in shades: it takes the colour it's
//             drawn in (a stateroom's carpet in that stateroom's colour, the
//             wallpaper in the room's)
// Each layer's alpha is its relief (1 high, 0 low: the grout between tiles,
// the bevel round a panel, a coffer in the ceiling), which the light picks
// out; and each surface says how rough it is (marble shines, carpet doesn't).
//
// A surface is laid on by where it is in her frame, a repeat of it every
// `size` metres from her origin (kit.js): so a carpet runs on unbroken from
// one room into the next, and her ceiling lights can be put in the middle of
// a coffer.
//
//   SURFACES               { name: { layer, size, dyed, rough, bump } }
//   new Painter()          paints them, a little at a time: step(ms) -> done
//   paintSurfaces() -> { data (RGBA, a layer after another), size, layers }
//   surfaceTexture(painter) -> the THREE.DataArrayTexture of what it painted
//                          (or, given none, a plain white one to stand in)
//   laySurfaces(shader, uSurfaces): into a material, from its onBeforeCompile
//
// No game in here: the tests paint them.

import * as THREE from 'three';
import { mulberry32 } from '../noise.js';

export const SIZE = 256; // texels across a layer

// size: m one repeat covers; rough: 0 a mirror, 1 a blanket; bump: how much
// its relief shows. Layer 0 is plain: whatever isn't laid with a surface.
export const SURFACES = {
  plain: { layer: 0, size: 1, dyed: false, rough: 0.8, bump: 0 },
  trellis: { layer: 1, size: 1.6, dyed: true, rough: 1, bump: 0 }, // the corridors' carpet
  plush: { layer: 2, size: 1.2, dyed: false, rough: 1, bump: 0 }, // a stateroom's carpet
  medallion: { layer: 3, size: 2.4, dyed: true, rough: 1, bump: 0 }, // the dining room's, the theatre's
  casino: { layer: 4, size: 2.4, dyed: true, rough: 1, bump: 0 }, // the casino's, as loud as they come
  marble: { layer: 5, size: 2.4, dyed: true, rough: 0.2, bump: 1.5 },
  parquet: { layer: 6, size: 1.2, dyed: false, rough: 0.45, bump: 1 },
  panel: { layer: 7, size: 1, dyed: false, rough: 0.55, bump: 3 }, // wood panelling
  paper: { layer: 8, size: 0.8, dyed: false, rough: 0.85, bump: 0.6 }, // wallpaper
  coffer: { layer: 9, size: 2.4, dyed: false, rough: 0.8, bump: 5 }, // a coffered ceiling
  tiles: { layer: 10, size: 1.2, dyed: false, rough: 0.9, bump: 1.5 }, // a ceiling of panels
  tile: { layer: 11, size: 1.2, dyed: false, rough: 0.35, bump: 1.5 }, // a floor of tiles
  drape: { layer: 12, size: 1.2, dyed: false, rough: 0.9, bump: 3 }, // curtains, velvet
  steel: { layer: 13, size: 1, dyed: false, rough: 0.35, bump: 0.3 }, // brushed, in the lifts
};
export const LAYERS = Object.keys(SURFACES).length;

// ── Painting ─────────────────────────────────────────────────────────────────
// Each painter is handed (u, v) across its layer, 0 to 1 (v up), and sets
// o = [r, g, b, relief], each 0 to 1 (colours as seen: sRGB).

const N = SIZE;
const AA = 1.2 / N; // a texel and a bit: how soft an edge is
const TAU = Math.PI * 2;
const fract = (x) => x - Math.floor(x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// how much of a line `w` wide (each side) covers a point `d` from it
const ink = (d, w) => 1 - smooth(w - AA, w + AA, d);
// the way round to x from a point on a repeating tile, -0.5 to 0.5
const wrap = (x) => x - Math.round(x);
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const mix = (o, c, t) => {
  o[0] += (c[0] - o[0]) * t;
  o[1] += (c[1] - o[1]) * t;
  o[2] += (c[2] - o[2]) * t;
};
const set = (o, c, k = 1) => {
  o[0] = c[0] * k;
  o[1] = c[1] * k;
  o[2] = c[2] * k;
};
const shade = (o, k) => {
  o[0] *= k;
  o[1] *= k;
  o[2] *= k;
};

// Smooth noise that repeats every `period` cells, so a layer tiles.
function lattice(seed, period) {
  const rnd = mulberry32(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = g[y0 * period + x0];
    const b = g[y0 * period + x1];
    const c = g[y1 * period + x0];
    const d = g[y1 * period + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
// Several of those, finer and fainter: -> 0 to 1, about. (u, v across the tile.)
function fbm(seed, period, octaves) {
  const ls = [];
  for (let k = 0; k < octaves; k++) ls.push(lattice(seed + k * 101, period << k));
  return (u, v) => {
    let s = 0;
    let a = 0.5;
    let n = 0;
    for (let k = 0; k < octaves; k++) {
      const p = period << k;
      s += a * ls[k](u * p, v * p);
      n += a;
      a *= 0.5;
    }
    return s / n;
  };
}
// a number from 0 to 1 for a texel, the same each time: the fibres of a carpet
const grain = (px, py, seed) => {
  let h = (px * 374761393 + py * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const PAINT = {};

PAINT.plain = (u, v, o) => {
  o[0] = o[1] = o[2] = o[3] = 1;
};

// The corridors' carpet: navy, a gold trellis across it, a rosette in each
// diamond of it, a gold stud where its lines cross.
{
  const NAVY = rgb(0x1d2a4a);
  const GOLD = rgb(0xc9a24e);
  const TEAL = rgb(0x2f8a88);
  const CORAL = rgb(0xd0674c);
  const CREAM = rgb(0xe8dcc0);
  const mottle = fbm(11, 4, 3);
  PAINT.trellis = (u, v, o, px, py) => {
    set(o, NAVY, 0.88 + 0.2 * mottle(u, v) + 0.1 * (grain(px, py, 1) - 0.5));
    const a = (u + v) * 2;
    const b = (u - v) * 2;
    const da = fract(a) - 0.5;
    const db = fract(b) - 0.5;
    // the rosette in the middle of a diamond
    const r = Math.hypot(da, db);
    const th = Math.atan2(db, da);
    const petal = 0.2 * (0.45 + 0.55 * Math.abs(Math.cos(2 * th)));
    mix(o, TEAL, ink(r, petal) * 0.95);
    mix(o, CREAM, ink(Math.abs(r - petal * 0.6), 0.008) * ink(r, petal));
    mix(o, CORAL, ink(r, 0.05));
    // the trellis, and a stud where it crosses
    const la = (0.5 - Math.abs(da)) / 2.83; // in tile units
    const lb = (0.5 - Math.abs(db)) / 2.83;
    mix(o, GOLD, ink(Math.min(la, lb), 0.006));
    mix(o, GOLD, ink(Math.hypot(0.5 - Math.abs(da), 0.5 - Math.abs(db)) / 2.83, 0.022));
    // small gold dots halfway along the sides of each diamond
    mix(o, CREAM, ink(Math.hypot(Math.abs(da) - 0.5, db) / 2.83, 0.009) + ink(Math.hypot(da, Math.abs(db) - 0.5) / 2.83, 0.009));
    o[3] = 1;
  };
}

// A stateroom's carpet: soft, its pile catching the light unevenly, a little
// square pattern in it, tone on tone.
{
  const mottle = fbm(21, 4, 3);
  PAINT.plush = (u, v, o, px, py) => {
    let k = 0.93 + 0.06 * (mottle(u, v) - 0.5) + 0.06 * (grain(px, py, 2) - 0.5);
    const gu = Math.abs(wrap(u * 8));
    const gv = Math.abs(wrap(v * 8));
    k -= 0.06 * ink(Math.min(gu, gv) / 8, 0.004);
    k -= 0.05 * ink(Math.hypot(Math.abs(gu) - 0.5, Math.abs(gv) - 0.5) / 8, 0.012);
    o[0] = o[1] = o[2] = k;
    o[3] = 1;
  };
}

// The dining room's and the theatre's carpet: claret, with gold medallions
// in rows, offset, and a gold fleuron between them.
{
  const CLARET = rgb(0x5a1820);
  const DEEP = rgb(0x3a0e16);
  const GOLD = rgb(0xc8a050);
  const CREAM = rgb(0xead9b4);
  const mottle = fbm(31, 4, 3);
  PAINT.medallion = (u, v, o, px, py) => {
    set(o, CLARET, 0.9 + 0.16 * mottle(u, v) + 0.1 * (grain(px, py, 3) - 0.5));
    // the nearest medallion: at the corners and the middle of the tile
    let du = wrap(u);
    let dv = wrap(v);
    const eu = wrap(u - 0.5);
    const ev = wrap(v - 0.5);
    if (eu * eu + ev * ev < du * du + dv * dv) {
      du = eu;
      dv = ev;
    }
    const r = Math.hypot(du, dv);
    const th = Math.atan2(dv, du);
    // its round field, darker; a ring of gold; a ring of dots
    mix(o, DEEP, ink(r, 0.2) * 0.8);
    mix(o, GOLD, ink(Math.abs(r - 0.2), 0.008));
    mix(o, GOLD, ink(Math.abs(r - 0.222), 0.003));
    const dot = (TAU / 24) * 0.248;
    const a = wrap((th / TAU) * 24) * dot;
    mix(o, CREAM, ink(Math.hypot(a, r - 0.248), 0.009));
    // an eight-pointed star of petals, and its heart
    const p = 0.17 * (0.35 + 0.65 * Math.pow(Math.abs(Math.cos(4 * th)), 0.6));
    mix(o, GOLD, ink(r, p) * 0.9);
    mix(o, CLARET, ink(Math.abs(r - p * 0.55), 0.006) * ink(r, p));
    mix(o, CREAM, ink(r, 0.035));
    mix(o, CLARET, ink(r, 0.015));
    // the fleuron between them: a small diamond
    const fu = Math.min(Math.abs(wrap(u - 0.5)), Math.abs(wrap(u)));
    const fv = Math.min(Math.abs(wrap(v)), Math.abs(wrap(v - 0.5)));
    const onEdge = Math.abs(wrap(u - 0.5)) < 0.25 !== Math.abs(wrap(v - 0.5)) < 0.25;
    if (onEdge) mix(o, GOLD, ink(fu + fv, 0.04));
    o[3] = 1;
  };
}

// The casino's carpet: as loud as they come, swirls and starbursts in red,
// gold, teal and magenta on plum.
{
  const PLUM = rgb(0x24122e);
  const COLOURS = [0xc8283c, 0xe0b040, 0x1fa3a0, 0xc04aa0, 0xe8742a].map(rgb);
  const rnd = mulberry32(0xca5170);
  const SWIRLS = [];
  for (let i = 0; i < 9; i++) SWIRLS.push({ x: rnd(), y: rnd(), r: 0.08 + rnd() * 0.08, arms: 2 + Math.floor(rnd() * 3), twist: 1 + rnd() * 1.5, c: COLOURS[i % COLOURS.length], c2: COLOURS[(i + 2) % COLOURS.length], turn: rnd() * TAU });
  const STARS = [];
  for (let i = 0; i < 22; i++) STARS.push({ x: rnd(), y: rnd(), r: 0.018 + rnd() * 0.02, c: COLOURS[Math.floor(rnd() * COLOURS.length)] });
  const mottle = fbm(41, 4, 3);
  PAINT.casino = (u, v, o, px, py) => {
    set(o, PLUM, 0.85 + 0.25 * mottle(u, v) + 0.1 * (grain(px, py, 4) - 0.5));
    // a lattice of thin gold waves under it all
    const w = Math.abs(wrap(v * 6 + 0.08 * Math.sin(u * TAU * 6)));
    mix(o, COLOURS[1], ink(w / 6, 0.002) * 0.6);
    for (const s of SWIRLS) {
      const du = wrap(u - s.x);
      const dv = wrap(v - s.y);
      const r = Math.hypot(du, dv);
      if (r > s.r + AA) continue;
      const th = Math.atan2(dv, du) + s.turn;
      const ph = fract((th / TAU) * s.arms + (r / s.r) * s.twist);
      mix(o, s.c, smooth(0.42, 0.38, Math.abs(ph - 0.5)) * ink(r, s.r));
      mix(o, s.c2, ink(Math.abs(ph - 0.5), 0.07) * ink(r, s.r * 0.95));
      mix(o, COLOURS[1], ink(r, s.r * 0.18));
    }
    for (const s of STARS) {
      const du = Math.abs(wrap(u - s.x));
      const dv = Math.abs(wrap(v - s.y));
      // four points: thin along each axis
      const d = Math.min(du + dv * 4, du * 4 + dv);
      mix(o, s.c, ink(d, s.r));
    }
    o[3] = 1;
  };
}

// Marble: slabs of it 1.2 m square, cream and warm grey by turns, veined,
// with a black keystone where four meet and a fine line of grout round each.
{
  const CREAM = rgb(0xeee8dc);
  const TAUPE = rgb(0xcdbfaa);
  const VEIN = rgb(0x8a7e70);
  const KEY = rgb(0x1e2622);
  const GROUT = rgb(0xa49a8c);
  const flow = fbm(51, 3, 5);
  const fine = fbm(57, 6, 4);
  PAINT.marble = (u, v, o) => {
    const i = Math.floor(u * 2);
    const j = Math.floor(v * 2);
    const s = fract(u * 2);
    const t = fract(v * 2);
    const dark = (i + j) & 1;
    const n = flow(u, v);
    set(o, dark ? TAUPE : CREAM, 0.96 + 0.08 * (fine(u, v) - 0.5));
    // veins: where a wave across the slab, bent by the noise, crosses zero
    const ang = dark ? 0.7 : -0.5;
    const x = s * Math.cos(ang) + t * Math.sin(ang);
    const vein = Math.exp(-Math.abs(Math.sin((x * 2.2 + n * 3.2) * Math.PI)) * 26);
    const thin = Math.exp(-Math.abs(Math.sin((x * 5.3 - n * 4.1 + fine(u, v) * 1.5) * Math.PI)) * 60);
    mix(o, VEIN, vein * 0.55 + thin * 0.3);
    // the keystone, and the grout
    const e = Math.min(s, 1 - s, t, 1 - t);
    const corner = Math.min(s, 1 - s) + Math.min(t, 1 - t);
    const key = ink(corner, 0.09);
    mix(o, KEY, key);
    mix(o, CREAM, ink(Math.abs(corner - 0.09), 0.004) * 0.8);
    const g = ink(e / 2, 0.0035);
    mix(o, GROUT, g);
    o[3] = 1 - g * 0.8;
  };
}

// Parquet: blocks of four slats, each block turned against the next, each
// slat its own shade, with the grain along it.
{
  const grainN = fbm(61, 8, 3);
  PAINT.parquet = (u, v, o) => {
    const B = 4; // blocks across the tile
    const bi = Math.floor(u * B);
    const bj = Math.floor(v * B);
    const su = fract(u * B);
    const sv = fract(v * B);
    const across = (bi + bj) & 1 ? su : sv; // across the slats
    const along = (bi + bj) & 1 ? sv : su;
    const slat = Math.floor(across * 4);
    const f = fract(across * 4);
    const tone = 0.86 + 0.14 * grain(bi * 7 + slat, bj * 13, 6);
    const g = 0.94 + 0.12 * (grainN(((bi + bj) & 1 ? v : u) * 0.25 + slat * 0.37, ((bi + bj) & 1 ? u : v) * 4 + bi * 0.13) - 0.5) + 0.04 * Math.sin(along * TAU * 3 + slat * 2 + f * 2);
    const k = tone * g;
    o[0] = Math.min(1, k * 1.04);
    o[1] = k;
    o[2] = k * 0.9;
    const gap = ink(Math.min(f, 1 - f) / (B * 4), 0.0015) + ink(Math.min(along, 1 - along, Math.min(across, 1 - across)) / B, 0.002);
    shade(o, 1 - 0.45 * clamp01(gap));
    o[3] = 1 - clamp01(gap);
  };
}

// Wood panelling: a raised panel in a frame, a metre square, with a moulded
// rail along its top (the top of the panelling, where it stops at a dado).
{
  const grainN = fbm(71, 4, 4);
  PAINT.panel = (u, v, o) => {
    const FRAME = 0.11;
    const BEVEL = 0.06;
    const ex = Math.min(u, 1 - u); // in from a stile
    const ey = Math.min(v, 1 - v) - (v > 0.5 ? 0.06 : 0); // in from a rail (the top one deeper, under the moulding)
    const e = Math.min(ex, ey);
    // the grain: up the stiles and the panel, across the rails
    const rail = ey < FRAME && ey < ex;
    const gr = rail ? grainN(v * 6, u * 0.6) : grainN(u * 6, v * 0.6);
    let k = 0.86 + 0.18 * gr + 0.04 * Math.sin((rail ? v : u) * 90 + gr * 8);
    let h;
    if (e < FRAME) h = 1;
    else if (e < FRAME + 0.012) {
      h = 0.25; // the groove inside the frame
      k *= 0.72;
    } else if (e < FRAME + BEVEL) {
      const t = (e - FRAME - 0.012) / (BEVEL - 0.012);
      h = 0.4 + 0.5 * t;
      k *= ex < ey ? 0.9 : 1.04; // the bevels catch the light differently
    } else h = 0.9;
    // the moulding along the top
    if (v > 0.94) {
      const t = (v - 0.94) / 0.06;
      h = 0.7 + 0.3 * Math.sin(t * Math.PI);
      k = 0.9 + 0.14 * Math.sin(t * Math.PI * 2) + 0.06 * gr;
    }
    o[0] = Math.min(1, k * 1.02);
    o[1] = k;
    o[2] = k * 0.94;
    o[3] = h;
  };
}

// Wallpaper: an ogee trellis, tone on tone, embossed, with a small flower in
// each of its cells.
PAINT.paper = (u, v, o) => {
  const x = fract(u * 2);
  const s = Math.sin(v * TAU);
  const c1 = Math.abs(x - (0.5 + 0.5 * s));
  const c2 = Math.abs(x - (0.5 - 0.5 * s));
  const steep = Math.sqrt(1 + Math.pow(Math.PI * Math.cos(v * TAU) * 0.5, 2));
  const line = ink(Math.min(c1, c2) / steep / 2, 0.005);
  // the flowers: in the middle of each cell
  const fx = wrap(x - 0.5) / 2;
  const fy = Math.min(Math.abs(wrap(v - 0.25)), Math.abs(wrap(v - 0.75)));
  const gx = wrap(x) / 2;
  const gy = Math.min(Math.abs(wrap(v)), Math.abs(wrap(v - 0.5)));
  const r1 = Math.hypot(fx, fy);
  const r2 = Math.hypot(gx, gy);
  const r = Math.min(r1, r2);
  const th = r1 < r2 ? Math.atan2(fy, fx) : Math.atan2(gy, gx);
  const flower = ink(r, 0.035 * (0.5 + 0.5 * Math.abs(Math.cos(2.5 * th))));
  const k = 0.97 - 0.07 * line - 0.05 * flower;
  o[0] = o[1] = o[2] = k;
  o[3] = 0.5 + 0.5 * Math.max(line, flower);
};

// A coffered ceiling: deep square coffers between beams, a step down and a
// fine moulding round each.
PAINT.coffer = (u, v, o) => {
  const e = Math.min(u, 1 - u, v, 1 - v);
  let k;
  let h;
  if (e < 0.09) {
    h = 0;
    k = 1;
  } else if (e < 0.15) {
    const t = (e - 0.09) / 0.06;
    h = t * 0.6;
    // the sides of the coffer: the ones facing one way lit, the others not
    k = Math.min(u, 1 - u) < Math.min(v, 1 - v) ? 0.86 : 0.93;
  } else if (e < 0.165) {
    h = 0.62;
    k = 0.82;
  } else {
    h = 1;
    k = 0.97 - 0.05 * smooth(0.165, 0.5, e);
  }
  o[0] = o[1] = o[2] = k;
  o[3] = 1 - h; // the beams stand down from it: the coffers are up
};

// A ceiling of panels, 0.6 m square, in a fine grid, speckled.
PAINT.tiles = (u, v, o, px, py) => {
  const gu = Math.abs(wrap(u * 2));
  const gv = Math.abs(wrap(v * 2));
  const g = ink(Math.min(gu, gv) / 2, 0.004);
  let k = 0.97 - 0.025 * (grain(px, py, 10) > 0.93 ? 1 : 0);
  k -= 0.16 * g;
  o[0] = o[1] = o[2] = k;
  o[3] = 1 - g;
};

// A floor of tiles, 0.6 m square, each a little different, grouted.
{
  const mottle = fbm(81, 6, 4);
  PAINT.tile = (u, v, o, px, py) => {
    const i = Math.floor(u * 2);
    const j = Math.floor(v * 2);
    const gu = Math.abs(wrap(u * 2));
    const gv = Math.abs(wrap(v * 2));
    const g = ink(Math.min(gu, gv) / 2, 0.003);
    let k = 0.95 + 0.04 * (grain(i, j, 11) - 0.5) + 0.07 * (mottle(u, v) - 0.5);
    k = k * (1 - 0.3 * g);
    o[0] = o[1] = o[2] = k;
    o[3] = 1 - g;
  };
}

// Curtains, or velvet on a wall: deep folds, hanging straight.
{
  const sway = fbm(91, 2, 2);
  PAINT.drape = (u, v, o) => {
    const x = u * 6 + 0.25 * (sway(u, v) - 0.5);
    const c = 0.5 + 0.5 * Math.cos(x * TAU);
    const k = 0.62 + 0.38 * Math.pow(c, 0.8);
    o[0] = o[1] = o[2] = k;
    o[3] = c;
  };
}

// Brushed steel: streaks along it.
{
  const streak = lattice(101, 4);
  PAINT.steel = (u, v, o, px, py) => {
    const k = 0.86 + 0.1 * streak(u * 4, v * 160) + 0.04 * (grain(0, py, 12) - 0.5);
    o[0] = o[1] = o[2] = k;
    o[3] = 1;
  };
}

// Painting them all takes a while (a sixth of a second, about), so it's done
// a little at a time, a frame's share at once, from when she comes in sight.
//   new Painter(); painter.step(ms) -> whether it's done; painter.data
export class Painter {
  constructor() {
    this.names = Object.keys(SURFACES).sort((a, b) => SURFACES[a].layer - SURFACES[b].layer);
    this.layers = this.names.length;
    this.size = N;
    this.data = new Uint8Array(N * N * 4 * this.layers);
    this.row = 0; // rows painted, counting on through the layers
    this.done = false;
  }

  step(ms = Infinity) {
    const t0 = performance.now();
    const o = [0, 0, 0, 0];
    const data = this.data;
    while (this.row < this.layers * N) {
      const layer = Math.floor(this.row / N);
      const py = this.row % N;
      const paint = PAINT[this.names[layer]];
      const v = (py + 0.5) / N;
      let i = (layer * N + py) * N * 4;
      for (let px = 0; px < N; px++, i += 4) {
        paint((px + 0.5) / N, v, o, px, py);
        data[i] = clamp01(o[0]) * 255 + 0.5;
        data[i + 1] = clamp01(o[1]) * 255 + 0.5;
        data[i + 2] = clamp01(o[2]) * 255 + 0.5;
        data[i + 3] = clamp01(o[3]) * 255 + 0.5;
      }
      this.row++;
      if ((this.row & 7) === 0 && performance.now() - t0 > ms) break;
    }
    this.done = this.row >= this.layers * N;
    return this.done;
  }
}

// -> { data, size, layers }: every surface painted, a layer after another.
export function paintSurfaces() {
  const p = new Painter();
  p.step();
  return { data: p.data, size: p.size, layers: p.layers };
}

// The array of them, for a material: from a painter that's done, or (none)
// a single plain white layer to stand in until one is.
export function surfaceTexture(painter = null) {
  const data = painter ? painter.data : new Uint8Array([255, 255, 255, 255]);
  const size = painter ? painter.size : 1;
  const tex = new THREE.DataArrayTexture(data, size, size, painter ? painter.layers : 1);
  tex.format = THREE.RGBAFormat;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ── In a material ────────────────────────────────────────────────────────────
// What a material's shader is given to lay its surfaces on: the array of
// them (uniforms.uSurfaces, a { value } to swap in once they're painted),
// each layer's roughness and relief; and each vertex says its layer in the
// `surface` attribute, where it is on that layer in `uv` (kit.js).
//   laySurfaces(shader, uSurfaces): from a material's onBeforeCompile

const byLayer = Object.values(SURFACES).sort((a, b) => a.layer - b.layer);
const ROUGH = byLayer.map((s) => s.rough);
const BUMP = byLayer.map((s) => s.bump);

export function laySurfaces(shader, uSurfaces) {
  shader.uniforms.uSurfaces = uSurfaces;
  shader.uniforms.uSurfRough = { value: ROUGH };
  shader.uniforms.uSurfBump = { value: BUMP };
  shader.vertexShader = `attribute float surface;
varying vec3 vSurf;
${shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvSurf = vec3(uv, surface);')}`;
  shader.fragmentShader = `uniform sampler2DArray uSurfaces;
uniform float uSurfRough[${LAYERS}];
uniform float uSurfBump[${LAYERS}];
varying vec3 vSurf;
// the normal tipped by the slope of the relief under it (dH: how much it
// rises across a pixel each way on the screen), as a bump map does
vec3 surfBump(vec3 p, vec3 n, vec2 dH, float facing) {
  vec3 sx = normalize(dFdx(p));
  vec3 sy = normalize(dFdy(p));
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * facing;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * n - grad);
}
${shader.fragmentShader
  .replace(
    '#include <map_fragment>',
    `int surfL = int(vSurf.z + 0.5);
	vec4 surfTex = texture(uSurfaces, vSurf);
	diffuseColor.rgb *= surfTex.rgb;`,
  )
  .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = uSurfRough[surfL];')
  .replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
	{
		vec2 dSx = dFdx(vSurf.xy);
		vec2 dSy = dFdy(vSurf.xy);
		vec2 dH = vec2(texture(uSurfaces, vec3(vSurf.xy + dSx, vSurf.z)).a - surfTex.a, texture(uSurfaces, vec3(vSurf.xy + dSy, vSurf.z)).a - surfTex.a);
		normal = surfBump(-vViewPosition, normal, dH * uSurfBump[surfL], faceDirection);
	}`,
  )}`;
}
