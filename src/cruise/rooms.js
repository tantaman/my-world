// What's in the rooms: the furniture of each kind of room, made of
// vertex-coloured boxes and cylinders like the rest of her (decks.js draws
// the rooms themselves), and what of it is solid.
//
//   furnish(room, ctx)    adds a room's things to ctx.kits, and its solids;
//                         ctx: { n, y, kits, solid, rectSolid, box, seed,
//                         look, L, extra? }. Things that move (the dance
//                         floor, the mirror ball, the slot machines' lights)
//                         are handed to ctx.look.extra(kind, spec) to be
//                         made by whoever animates them.
//   furnishCabin(kits, cabin, state, { yours, y }) -> solids: a stateroom's
//                         furniture, its bathroom and its balcony's chairs,
//                         built when you come near its door
//
// Everything is in the ship's frame (plan.js).

import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { CORE, CORR, DECK_H, SLAB, H_IN, POOLS, TRACK, FUNNEL, inner, cabinsOn, isCabinDeck } from './plan.js';

const col = (hex) => new THREE.Color(hex);
const WOOD = col(0x6a4426);
const WOOD_LIGHT = col(0xa07850);
const CLOTH = col(0xf4f2ec);
const CHROME = col(0xb8bcc4);
const BRASS = col(0xc8a050);
const BLACK = col(0x18181c);
const RED = col(0x8a1c22);
const LEATHER = col(0x4a2a1a);
const GREEN = col(0x1e6a3a);
const WHITE = col(0xf4f4f0);
const PLANT = col(0x3a6a32);
const POT = col(0x8a6a4a);

const SHOP_LOOK = [
  { sign: 'SEA GLASS', wall: 0x2a6a8a, stock: [0xd8e8f0, 0x8ac4d8, 0xf4f0e0] },
  { sign: 'DUTY FREE', wall: 0x3a3a48, stock: [0x8a5a2a, 0x2a6a3a, 0xc8a050, 0x6a1a2a] },
  { sign: 'SWEETS', wall: 0xd86a9a, stock: [0xf2c230, 0xe8262a, 0x2a6ad8, 0xf28c1a] },
  { sign: 'TIMEPIECES', wall: 0x2a2a30, stock: [0xc8a050, 0xb8bcc4, 0x18181c] },
  { sign: 'LOGO SHOP', wall: 0x1a3a6a, stock: [0xf4f4f0, 0x1a3a6a, 0xd8262a] },
  { sign: 'PERFUMERY', wall: 0xe8d8e8, stock: [0xf0c8d8, 0xd8c8f0, 0xf4e8b8] },
  { sign: 'PHOTO', wall: 0x18181c, stock: [0xf4f4f0, 0x8a8a8a] },
  { sign: 'SUNDRIES', wall: 0x6a8a5a, stock: [0xf4f4f0, 0x3aa0d8, 0xf2c230] },
];

// ── Little things ────────────────────────────────────────────────────────────

function chair(k, x, y, z, face, c = WOOD) {
  // face: which way the sitter faces (radians: 0 = +z). A seat on a single
  // stem, and a back: there are hundreds of them.
  const fx = Math.sin(face);
  const fz = Math.cos(face);
  k.box(x - 0.22, y + 0.42, z - 0.22, x + 0.22, y + 0.48, z + 0.22, c);
  k.box(x - 0.03, y, z - 0.03, x + 0.03, y + 0.42, z + 0.03, c, 'y-');
  // the back, behind the sitter
  const bx = x - fx * 0.2;
  const bz = z - fz * 0.2;
  const sx = Math.abs(fz) * 0.22 + 0.025;
  const sz = Math.abs(fx) * 0.22 + 0.025;
  k.box(bx - sx, y + 0.48, bz - sz, bx + sx, y + 0.95, bz + sz, c);
}

function roundTable(k, x, y, z, r, cloth = CLOTH, h = 0.75) {
  k.cyl(x, y + h - 0.04, z, y + h, r, cloth, 14);
  if (cloth === CLOTH) k.cyl(x, y + 0.3, z, y + h - 0.04, r, cloth, 14, r * 0.98, false);
  k.cyl(x, y, z, y + h - 0.04, 0.06, CHROME, 6);
}

function plant(k, x, y, z, s = 1) {
  k.cyl(x, y, z, y + 0.45 * s, 0.25 * s, POT, 8, 0.3 * s);
  k.cyl(x, y + 0.45 * s, z, y + 1.4 * s, 0.38 * s, PLANT, 7, 0.08 * s);
}

function sofa(k, x0, y, z0, x1, z1, c, backSide) {
  // backSide: 'x0', 'x1', 'z0' or 'z1': where its back is
  k.box(x0, y, z0, x1, y + 0.42, z1, c);
  const t = 0.18;
  if (backSide === 'x0') k.box(x0, y + 0.42, z0, x0 + t, y + 0.85, z1, c);
  if (backSide === 'x1') k.box(x1 - t, y + 0.42, z0, x1, y + 0.85, z1, c);
  if (backSide === 'z0') k.box(x0, y + 0.42, z0, x1, y + 0.85, z0 + t, c);
  if (backSide === 'z1') k.box(x0, y + 0.42, z1 - t, x1, y + 0.85, z1, c);
}

function painting(k, x, y, z, nx, nz, w, h, rnd) {
  k.panel(x + nx * 0.03, y, z + nz * 0.03, nx, nz, w + 0.12, h + 0.12, BRASS);
  // a few blocks of colour, an abstract of the sea
  const hues = [0.55 + rnd() * 0.1, 0.08 + rnd() * 0.05, 0.6 + rnd() * 0.1];
  const bands = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < bands; i++) {
    const c = new THREE.Color().setHSL(hues[i % 3], 0.4 + rnd() * 0.3, 0.35 + rnd() * 0.35);
    const by = y - h / 2 + (h / bands) * (i + 0.5);
    k.panel(x + nx * 0.04, by, z + nz * 0.04, nx, nz, w, h / bands, c);
  }
}

function sign(k, text, x, y, z, nx, nz, px, c, back = null) {
  if (back) {
    const w = (text.length * 6 - 1) * px + px * 4;
    k.panel(x + nx * 0.02, y, z + nz * 0.02, nx, nz, w, px * 11, back);
  }
  k.words(text, x + nx * 0.035, y, z + nz * 0.035, nx, nz, px, c);
}

function counter(k, x0, y, z0, x1, z1, front, top = col(0x2a2a30)) {
  k.box(x0, y, z0, x1, y + 1.05, z1, front);
  k.box(x0 - 0.05, y + 1.05, z0 - 0.05, x1 + 0.05, y + 1.1, z1 + 0.05, top);
}

function stool(k, x, y, z) {
  k.cyl(x, y + 0.72, z, y + 0.78, 0.2, LEATHER, 10);
  k.cyl(x, y, z, y + 0.72, 0.03, CHROME, 5);
}

function lounger(k, x, y, z, along, c) {
  // a sun lounger lying along z (along = 1) or x (0)
  const hw = 0.33;
  const hl = 0.95;
  const [ax, az] = along ? [hw, hl] : [hl, hw];
  k.box(x - ax, y + 0.28, z - az, x + ax, y + 0.36, z + az, c);
  const back = along ? [x - hw, y + 0.36, z + hl - 0.6, x + hw, y + 0.75, z + hl - 0.45] : [x + hl - 0.6, y + 0.36, z - hw, x + hl - 0.45, y + 0.75, z + hw];
  k.box(...back, c);
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    k.box(x + a * (ax - 0.04) - 0.02, y, z + b * (az - 0.06) - 0.02, x + a * (ax - 0.04) + 0.02, y + 0.28, z + b * (az - 0.06) + 0.02, CHROME);
}

function umbrella(k, x, y, z, c) {
  k.cyl(x, y, z, y + 2.3, 0.03, WHITE, 5);
  k.cyl(x, y + 2.0, z, y + 2.45, 1.4, c, 8, 0.05, false);
}

function chandelier(k, glow, x, y, z, r) {
  k.cyl(x, y - 0.6, z, y, 0.02, BRASS, 4);
  k.cyl(x, y - 0.9, z, y - 0.6, r, BRASS, 10, r * 0.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    glow.box(x + Math.cos(a) * r - 0.04, y - 0.95, z + Math.sin(a) * r - 0.04, x + Math.cos(a) * r + 0.04, y - 0.85, z + Math.sin(a) * r + 0.04, col(0xfff0c8));
  }
}

// ── Rooms ────────────────────────────────────────────────────────────────────

export function furnish(r, ctx) {
  const fn = BY_KIND[r.kind];
  if (fn) fn(r, ctx, mulberry32(((ctx.seed ^ 0xf00d) + hashId(r.id)) >>> 0));
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BY_KIND = {
  lobby(r, { kits, y, n }) {
    const k = kits.inside;
    // the deck's number, big, on the back wall between the stairs and the lifts
    const z = r.z0 + 0.09;
    const L = CORE.lifts;
    for (const x of L.xs) {
      // call buttons beside each car, a light over it
      k.box(x + L.door + 0.12, y + 1.05, r.z1 - 0.08, x + L.door + 0.22, y + 1.25, r.z1 - 0.06, BRASS);
      kits.glow.box(x - 0.3, y + 2.25, r.z1 - 0.08, x + 0.3, y + 2.35, r.z1 - 0.06, col(0xfff0c8));
    }
    for (const s of [1, -1]) {
      sign(k, `DECK ${n}`, s * 5.2, y + 1.7, z, 0, 1, 0.045, BRASS, col(0x1e2a44));
      // which way the cabins run, on the decks that have them
      if (isCabinDeck(n)) {
        const list = cabinsOn(n).filter((q) => Math.sign(q.x0 + q.x1) === s && q.kind !== 'inside');
        const fore = list.filter((q) => q.z0 > r.z1);
        const aft = list.filter((q) => q.z1 < r.z0);
        const span = (l) => (l.length ? `${Math.min(...l.map((q) => q.no))}-${Math.max(...l.map((q) => q.no))}` : '');
        // on the far wall of the corridor, over the doors, facing you as you come out of the lobby
        const sx = s * (CORR[1] - 0.09);
        if (fore.length) sign(k, `FWD ${span(fore)}`, sx, y + 2.36, r.z1 - 1.3, -s, 0, 0.02, BRASS, col(0x1e2a44));
        if (aft.length) sign(k, `AFT ${span(aft)}`, sx, y + 2.36, r.z0 + 1.3, -s, 0, 0.02, BRASS, col(0x1e2a44));
      }
    }
    plant(k, -2.6, y, r.z0 + 0.5, 0.8);
    plant(k, 2.6, y, r.z0 + 0.5, 0.8);
  },

  dining(r, { kits, y, solid, n }, rnd) {
    const k = kits.inside;
    const well = n === 4 ? [-7, -132, 7, -110] : null;
    for (let z = r.z0 + 2.2; z < r.z1 - 1.6; z += 3.1) {
      for (let x = r.x0 + 2; x < r.x1 - 1.6; x += 3.2) {
        if (n === 5 && x > -7.6 && x < 7.6 && z > -132.6 && z < -109.4) continue;
        const big = rnd() < 0.4;
        const tr = big ? 0.8 : 0.55;
        roundTable(k, x, y, z, tr);
        solid(x, z, x, z, tr, y, y + 0.76);
        const seats = big ? 6 : 4;
        for (let i = 0; i < seats; i++) {
          const a = (i / seats) * Math.PI * 2 + 0.3;
          chair(k, x + Math.sin(a) * (tr + 0.3), y, z + Math.cos(a) * (tr + 0.3), a + Math.PI, col(0x5a1a22));
        }
        // a lamp on each
        kits.glow.cyl(x, y + 0.76, z, y + 0.86, 0.05, col(0xffe0a0), 6);
      }
    }
    if (well) {
      // a grand chandelier down through the well, and the captain's table under it
      chandelier(k, kits.glow, 0, y + 2 * DECK_H - SLAB, -121, 2.2);
      chandelier(k, kits.glow, 0, y + 2 * DECK_H - SLAB - 1.1, -121, 1.4);
    }
    for (let z = r.z0 + 6; z < r.z1 - 4; z += 9) {
      if (well && z > -133 && z < -109) continue;
      chandelier(k, kits.glow, r.x0 + 8, y + H_IN, z, 0.7);
      chandelier(k, kits.glow, r.x1 - 8, y + H_IN, z, 0.7);
    }
    sign(k, 'THE LANTERN ROOM', 0, y + 2.2, r.z1 - 0.1, 0, -1, 0.06, BRASS, col(0x3a1a14));
  },

  theatre(r, { kits, y, solid, rectSolid, box }) {
    const k = kits.inside;
    const seat = col(0x8a1a24);
    if (r.rake) {
      // the balcony: rows stepping up toward the back
      const { from, step, rise, rows } = r.rake;
      for (let i = 0; i < rows; i++) {
        const z1 = from - i * step;
        const z0 = z1 - step;
        const t = y + (i + 1) * rise;
        k.box(r.x0, y, z0, r.x1, t, z1, col(0x4a141c), 'y-');
        rectSolid(r.x0 + 0.2, z0, r.x1 - 0.2, z1, y, t, { surface: 'carpet' });
        box(r.x0, y, z0, r.x1, t, z1);
        seatRow(k, r.x0 + 1.5, r.x1 - 1.5, t, z0 + 0.45, seat, [-1.2, 1.2]);
      }
      // behind the back row, steps back down to the doors in from the
      // passages, which are at the deck's own level
      let z1 = from - rows * step;
      for (let i = rows - 1; i >= 0 && z1 > r.z0; i--) {
        const z0 = Math.max(r.z0, z1 - step);
        const t = y + i * rise;
        if (t > y + 0.01) {
          k.box(r.x0, y, z0, r.x1, t, z1, col(0x4a141c), 'y-');
          rectSolid(r.x0 + 0.2, z0, r.x1 - 0.2, z1, y, t, { surface: 'carpet' });
          box(r.x0, y, z0, r.x1, t, z1);
        }
        z1 = z0;
      }
      return;
    }
    // the stalls: rows of seats facing the stage (forward), with aisles
    for (let z = r.z0 + 4; z < r.z1 - 3; z += 1.0) {
      const half = Math.min(r.x1 - 1.2, 2 + (z - r.z0) * 0.3);
      seatRow(k, -half, half, y, z, seat, [-1.1, 1.1, -r.x1 + 3.2, r.x1 - 3.2]);
      solid(-half + 0.4, z + 0.05, -1.4, z + 0.05, 0.3, y, y + 0.48);
      solid(1.4, z + 0.05, half - 0.4, z + 0.05, 0.3, y, y + 0.48);
    }
    // a sound desk at the back
    k.box(-1.8, y, r.z0 + 1.4, 1.8, y + 1.1, r.z0 + 2.4, BLACK);
    solid(-1.4, r.z0 + 1.9, 1.4, r.z0 + 1.9, 0.5, y, y + 1.1);
  },

  stage(r, { kits, y, rectSolid, box }) {
    const k = kits.inside;
    const front = r.z0 + 1.5;
    const top = y + 1.0;
    k.box(r.x0, y, front, r.x1, top, r.z1, col(0x2a1c12), 'y-');
    rectSolid(r.x0, front, r.x1, r.z1, y, top, { surface: 'boards' });
    box(r.x0, y, front, r.x1, top, r.z1);
    // steps up at the sides
    for (const s of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const t = y + (i + 1) * 0.25;
        const x0 = s > 0 ? r.x1 - 1.6 : r.x0;
        const x1 = s > 0 ? r.x1 : r.x0 + 1.6;
        k.box(x0, y, front - 0.3 * (4 - i), x1, t, front - 0.3 * (3 - i), col(0x2a1c12));
        rectSolid(x0, front - 0.3 * (4 - i), x1, front - 0.3 * (3 - i), y, t, { surface: 'boards' });
      }
    }
    // the proscenium, and the curtain
    const ph = y + 7.6;
    const pw = r.x1 - 1.4;
    k.box(-pw - 1, y, front - 0.2, -pw, ph, front + 0.2, col(0xc8a050));
    k.box(pw, y, front - 0.2, pw + 1, ph, front + 0.2, col(0xc8a050));
    k.box(-pw - 1, ph, front - 0.2, pw + 1, ph + 1, front + 0.2, col(0xc8a050));
    for (let x = -pw; x < pw; x += 0.5) {
      const fold = (Math.floor((x + pw) / 0.5) & 1) * 0.08;
      k.box(x, top, front + 0.4 + fold, x + 0.5, ph, front + 0.5 + fold, col(0x9a1420));
    }
    sign(k, 'MERIDIAN', 0, ph + 0.5, front - 0.22, 0, -1, 0.11, col(0x3a1a14));
  },

  club(r, { kits, y, solid, look }) {
    const k = kits.inside;
    // the dance floor, lit from under: made and lit by whoever has the music
    const cz = (r.z0 + r.z1) / 2;
    const df = { x0: -5, z0: cz - 5, x1: 5, z1: cz + 5, y };
    if (look.extra) look.extra('dancefloor', df);
    // the DJ's booth at the forward end of the floor
    k.box(-2, y, df.z1 + 1, 2, y + 1.1, df.z1 + 2, BLACK);
    solid(-1.6, df.z1 + 1.5, 1.6, df.z1 + 1.5, 0.5, y, y + 1.1);
    kits.glow.box(-1.8, y + 1.1, df.z1 + 1.1, 1.8, y + 1.14, df.z1 + 1.3, col(0x40e0ff));
    if (look.extra) look.extra('mirrorball', { x: 0, y: y + H_IN - 0.7, z: cz });
    // the bar along the side, and booths round the walls
    counter(k, r.x1 - 2.4, y, r.z0 + 6, r.x1 - 1.6, r.z1 - 6, col(0x2a1a3a), col(0x101018));
    solid(r.x1 - 2, r.z0 + 6.3, r.x1 - 2, r.z1 - 6.3, 0.45, y, y + 1.1);
    kits.glow.box(r.x1 - 2.45, y + 0.05, r.z0 + 6, r.x1 - 2.4, y + 0.12, r.z1 - 6, col(0xff40c0));
    for (let z = r.z0 + 7; z < r.z1 - 7; z += 1.6) stool(k, r.x1 - 2.9, y, z);
    for (let z = r.z0 + 3; z < r.z1 - 3; z += 4) {
      sofa(k, r.x0 + 0.3, y, z - 1.2, r.x0 + 1.1, z + 1.2, col(0x5a1a6a), 'x0');
      roundTable(k, r.x0 + 1.9, y, z, 0.45, col(0x18181c), 0.5);
    }
    sign(kits.glow, 'AFTERGLOW', 0, y + 2.1, r.z0 + 0.12, 0, 1, 0.07, col(0xff60d0));
  },

  casino(r, { kits, y, solid, look }, rnd) {
    const k = kits.inside;
    // card tables down the middle, slot machines round the sides
    for (let z = r.z0 + 4; z < r.z1 - 3; z += 5) {
      for (const x of [-4.5, 0, 4.5]) {
        k.cyl(x, y, z, y + 0.76, 1.1, GREEN, 16, 1.1);
        k.cyl(x, y + 0.76, z, y + 0.8, 1.18, LEATHER, 16);
        solid(x, z, x, z, 1.15, y, y + 0.8);
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + (i - 2) * 0.5;
          stool(k, x + Math.sin(a) * 1.6, y, z + Math.cos(a) * 1.6);
        }
      }
    }
    const lights = [];
    for (const s of [1, -1]) {
      const x = s > 0 ? r.x1 - 0.6 : r.x0 + 0.6;
      for (let z = r.z0 + 1.5; z < r.z1 - 1; z += 1.1) {
        k.box(x - 0.35, y, z - 0.4, x + 0.35, y + 1.5, z + 0.4, col(0x2a2a40));
        kits.glow.panel(x - s * 0.36, y + 1.15, z, -s, 0, 0.5, 0.42, new THREE.Color().setHSL(rnd(), 0.8, 0.55));
        lights.push({ x: x - s * 0.37, y: y + 1.6, z, s });
      }
      solid(x, r.z0 + 1.5, x, r.z1 - 1.5, 0.45, y, y + 1.5);
    }
    if (look.extra) look.extra('slots', { lights });
    sign(kits.glow, 'CASINO', 0, y + 2.1, r.z0 + 0.12, 0, 1, 0.07, col(0xffd040));
  },

  bar(r, { kits, y, solid }, rnd) {
    const k = kits.inside;
    const z = (r.z0 + r.z1) / 2;
    counter(k, -6, y, z - 1, 6, z, WOOD, BRASS);
    solid(-5.6, z - 0.5, 5.6, z - 0.5, 0.55, y, y + 1.1);
    for (let x = -5.5; x <= 5.5; x += 1) stool(k, x, y, z + 0.6);
    // bottles on a back bar
    k.box(-6, y, z - 2.6, 6, y + 2.2, z - 2.2, WOOD);
    for (let x = -5.8; x < 5.8; x += 0.18) kits.glow.cyl(x, y + 1.3, z - 2.35, y + 1.6, 0.04, new THREE.Color().setHSL(0.08 + rnd() * 0.1, 0.7, 0.4 + rnd() * 0.3), 5);
    // a baby grand, and armchairs round low tables
    k.box(r.x1 - 5, y + 0.6, r.z1 - 5, r.x1 - 3.4, y + 1.0, r.z1 - 3, BLACK);
    k.box(r.x1 - 4.4, y, r.z1 - 4.2, r.x1 - 4.2, y + 0.6, r.z1 - 4, BLACK);
    solid(r.x1 - 4.2, r.z1 - 4.4, r.x1 - 4.2, r.z1 - 3.6, 0.8, y, y + 1);
    for (let zz = r.z0 + 2.5; zz < z - 3.5; zz += 3.5) {
      for (const x of [-9, -4, 4, 9]) {
        roundTable(k, x, y, zz, 0.4, col(0x2a1a10), 0.45);
        for (const a of [0, Math.PI]) sofa(k, x + Math.sin(a) * 0.9 - 0.35, y, zz - 0.35 + Math.cos(a) * 0.9, x + Math.sin(a) * 0.9 + 0.35, zz + 0.35 + Math.cos(a) * 0.9, LEATHER, a === 0 ? 'z1' : 'z0');
      }
    }
    sign(k, 'THE COMPASS BAR', 0, y + 2.2, r.z1 - 0.1, 0, -1, 0.05, BRASS, col(0x2a1a10));
  },

  atrium(r, { kits, y, n, solid }) {
    const k = kits.inside;
    if (n !== 4) return;
    // guest services along the forward wall, a bar to one side, a piano
    counter(k, -6, y, r.z1 - 2.2, 6, r.z1 - 1.4, WOOD, col(0xe8e2d6));
    solid(-5.6, r.z1 - 1.8, 5.6, r.z1 - 1.8, 0.45, y, y + 1.1);
    sign(k, 'GUEST SERVICES', 0, y + 2.3, r.z1 - 0.1, 0, -1, 0.05, BRASS, col(0x1e2a44));
    // the great chandelier hanging down through the well, three decks of it
    for (let i = 0; i < 6; i++) {
      const rr = 3.4 - i * 0.45;
      const yy = y + 3 * DECK_H - SLAB - 0.8 - i * 1.1;
      k.cyl(0, yy - 0.05, 31, yy + 0.05, rr, BRASS, 18, rr, false);
      for (let j = 0; j < 14; j++) {
        const a = (j / 14) * Math.PI * 2 + i * 0.2;
        kits.glow.box(Math.cos(a) * rr - 0.05, yy - 0.5, 31 + Math.sin(a) * rr - 0.05, Math.cos(a) * rr + 0.05, yy - 0.05, 31 + Math.sin(a) * rr + 0.05, col(0xfff4d8));
      }
    }
    k.cyl(0, y + 3 * DECK_H - SLAB - 7.5, 31, y + 3 * DECK_H - SLAB, 0.03, BRASS, 4);
    // a fountain under it
    k.cyl(0, y, 31, y + 0.5, 2.4, col(0xe8e2d6), 20);
    kits.water.cyl(0, y + 0.5, 31, y + 0.45, 2.2, col(0x3a9ac8), 20, 2.2, false);
    solid(0, 31, 0, 31, 2.45, y, y + 0.5);
    for (const [x, z] of [
      [-10, 20],
      [10, 20],
      [-10, 42],
      [10, 42],
    ])
      plant(k, x, y, z, 1.4);
  },

  gangway(r, { kits, y, solid }) {
    const k = kits.inside;
    // the welcome desk by the shell door, and the photographer's backdrop
    counter(k, r.x1 - 7, y, -23.5, r.x1 - 6.2, -19.5, WOOD, col(0xe8e2d6));
    solid(r.x1 - 6.6, -23.1, r.x1 - 6.6, -19.9, 0.45, y, y + 1.1);
    sign(k, 'WELCOME ABOARD', r.x1 - 6.25, y + 2.2, -21.5, 1, 0, 0.045, BRASS, col(0x1e2a44));
    k.panel(r.x0 + 0.12, y + 1.4, -30, 1, 0, 4, 2.4, col(0x2a6a9a));
    plant(k, r.x1 - 1, y, -27, 1.2);
    plant(k, r.x1 - 1, y, -16.5, 1.2);
  },

  gallery(r, { kits, y }, rnd) {
    const k = kits.inside;
    for (let z = r.z0 + 3; z < r.z1 - 2; z += 3.4) {
      for (const s of [1, -1]) {
        const x = s > 0 ? r.x1 - 0.1 : r.x0 + 0.1;
        painting(k, x, y + 1.6, z, -s, 0, 1.6 + rnd() * 0.6, 1.1 + rnd() * 0.5, rnd);
      }
      // easels down the middle
      if (Math.floor(z) % 2 === 0) {
        k.box(-0.05, y, z - 0.6, 0.05, y + 1.6, z - 0.5, WOOD_LIGHT);
        painting(k, 0.06, y + 1.4, z, 1, 0, 1, 0.8, rnd);
      }
    }
  },

  galleria(r, { kits, y, solid }) {
    const k = kits.inside;
    for (let z = r.z0 + 6; z < r.z1 - 4; z += 12) {
      plant(k, 0, y, z, 1.3);
      solid(0, z, 0, z, 0.4, y, y + 1);
      for (const s of [1, -1]) {
        k.box(s * 2.2 - 0.9, y, z + 3 - 0.25, s * 2.2 + 0.9, y + 0.45, z + 3 + 0.25, WOOD);
      }
    }
  },

  shop(r, { kits, y, solid }, rnd) {
    const k = kits.inside;
    const s = Math.sign(r.x0 + r.x1);
    const S = SHOP_LOOK[r.shop % SHOP_LOOK.length];
    const inner = s > 0 ? r.x0 : r.x1;
    const outer = s > 0 ? r.x1 : r.x0;
    // its name over the door, on the street side
    sign(kits.glow, S.sign, inner - s * 0.15, y + 2.3, (r.z0 + r.z1) / 2, -s, 0, 0.045, col(0xfff4d8), col(S.wall));
    // shelves along the back, a counter, a table of things in the middle
    const bx = outer - s * 0.45;
    k.box(Math.min(bx, outer), y, r.z0 + 0.4, Math.max(bx, outer), y + 2.1, r.z1 - 0.4, col(S.wall));
    for (let sh = 0; sh < 4; sh++) {
      for (let z = r.z0 + 0.6; z < r.z1 - 0.6; z += 0.3) {
        const c = col(S.stock[Math.floor(rnd() * S.stock.length)]);
        const xx = outer - s * 0.5;
        k.box(xx - 0.08, y + 0.4 + sh * 0.45, z - 0.1, xx + 0.08, y + 0.6 + sh * 0.45 + rnd() * 0.1, z + 0.1, c);
      }
    }
    const mid = (r.x0 + r.x1) / 2;
    k.box(mid - 0.8, y, r.z0 + 2, mid + 0.8, y + 0.85, r.z1 - 2, WOOD_LIGHT);
    solid(mid, r.z0 + 2.4, mid, r.z1 - 2.4, 0.8, y, y + 0.85);
    counter(k, Math.min(bx - s * 1.6, bx - s * 0.8), y, r.z1 - 1.4, Math.max(bx - s * 1.6, bx - s * 0.8), r.z1 - 0.5, col(S.wall));
  },

  cafe(r, { kits, y, solid }) {
    const k = kits.inside;
    counter(k, -4, y, r.z1 - 2, 4, r.z1 - 1.2, WOOD, col(0xe8e2d6));
    solid(-3.6, r.z1 - 1.6, 3.6, r.z1 - 1.6, 0.45, y, y + 1.1);
    kits.glow.box(-3.6, y + 2.0, r.z1 - 0.15, 3.6, y + 2.4, r.z1 - 0.1, col(0x3a2a1a));
    sign(k, 'CAFE MISTRAL', 0, y + 2.2, r.z1 - 0.16, 0, -1, 0.035, col(0xf4e8c8));
    for (let z = r.z0 + 2; z < r.z1 - 3.5; z += 2.4) {
      for (let x = r.x0 + 2; x < r.x1 - 1.5; x += 2.6) {
        if (Math.abs(x) < 2.5) continue;
        roundTable(k, x, y, z, 0.4, WHITE);
        chair(k, x - 0.7, y, z, Math.PI / 2, WOOD_LIGHT);
        chair(k, x + 0.7, y, z, -Math.PI / 2, WOOD_LIGHT);
      }
    }
  },

  champagne(r, { kits, y, solid }) {
    const k = kits.inside;
    counter(k, -3, y, (r.z0 + r.z1) / 2 - 0.5, 3, (r.z0 + r.z1) / 2 + 0.5, col(0x2a2030), col(0xe8e2d6));
    solid(-2.6, (r.z0 + r.z1) / 2, 2.6, (r.z0 + r.z1) / 2, 0.55, y, y + 1.1);
    kits.glow.box(-3, y + 0.02, (r.z0 + r.z1) / 2 + 0.52, 3, y + 0.08, (r.z0 + r.z1) / 2 + 0.55, col(0xffd8a0));
    for (let x = -2.5; x <= 2.5; x += 1) stool(k, x, y, (r.z0 + r.z1) / 2 + 1.1);
    sign(kits.glow, 'BUBBLES', 0, y + 2.1, r.z1 - 0.12, 0, -1, 0.05, col(0xffe0b0));
  },

  foyer(r, { kits, y }) {
    const k = kits.inside;
    sign(k, 'THEATRE', 0, y + 2.2, r.z1 - 0.12, 0, -1, 0.06, BRASS, col(0x3a1a14));
    plant(k, r.x0 + 1, y, r.z1 - 1, 1.2);
    plant(k, r.x1 - 1, y, r.z1 - 1, 1.2);
  },

  buffet(r, { kits, y, solid }, rnd) {
    if (!r.id.startsWith('buffet')) return;
    const k = kits.inside;
    // serving stations down the middle, tables along the windows
    for (const z of [r.z0 + 12, r.z0 + 22, r.z0 + 32]) {
      if (z > r.z1 - 3) continue;
      counter(k, -3.5, y, z - 1.2, 3.5, z + 1.2, WHITE, col(0xb8bcc4));
      solid(-3.1, z, 3.1, z, 1.25, y, y + 1.1);
      k.box(-3.3, y + 1.6, z - 0.3, 3.3, y + 1.65, z + 0.3, CHROME);
      for (let x = -3; x < 3; x += 0.6) kits.glow.cyl(x + 0.3, y + 1.1, z, y + 1.18, 0.2, new THREE.Color().setHSL(0.05 + rnd() * 0.12, 0.7, 0.45), 8);
    }
    for (let z = r.z0 + 9; z < r.z1 - 2; z += 2.6) {
      for (const s of [1, -1]) {
        const x = s * (Math.min(r.x1, inner(z - 1, z + 1)) - 2);
        if (Math.abs(x) < 6) continue;
        roundTable(k, x, y, z, 0.5, WHITE);
        chair(k, x, y, z - 0.8, 0, WOOD_LIGHT);
        chair(k, x, y, z + 0.8, Math.PI, WOOD_LIGHT);
        solid(x, z, x, z, 0.5, y, y + 0.76);
      }
    }
    sign(k, 'THE GALLEY MARKET', 0, y + 2.2, r.z0 + 0.12, 0, 1, 0.05, col(0xf4f0e6), col(0x2a5a3a));
  },

  vestibule(r, { kits, y }) {
    sign(kits.inside, 'PROMENADE', (r.x0 + r.x1) / 2, y + 2.25, r.z0 + 0.1, 0, 1, 0.025, BRASS, col(0x1e2a44));
  },

  terrace(r, { kits, y, solid }) {
    const k = kits.outside;
    for (let x = r.x0 + 2; x < r.x1 - 1.5; x += 2.4) {
      roundTable(k, x, y, (r.z0 + r.z1) / 2, 0.45, WHITE);
      chair(k, x, y, (r.z0 + r.z1) / 2 - 0.75, 0, WHITE);
      chair(k, x, y, (r.z0 + r.z1) / 2 + 0.75, Math.PI, WHITE);
      solid(x, (r.z0 + r.z1) / 2, x, (r.z0 + r.z1) / 2, 0.45, y, y + 0.76);
    }
  },

  lido(r, ctx, rnd) {
    loungers(r, ctx, rnd, [0x2a8ac8, 0xf4f4f0]);
  },
  splash(r, ctx, rnd) {
    if (r.id === 'aft-deck') {
      // the pool bar, under the sun deck
      const { kits, y, solid } = ctx;
      const z = -120;
      counter(kits.outside, -4, y, z - 1, 4, z + 1, col(0x2a7aa8), WHITE);
      solid(-3.6, z, 3.6, z, 1.05, y, y + 1.1);
      for (let x = -3.5; x <= 3.5; x += 1) stool(kits.outside, x, y, z + 1.6);
      sign(kits.outside, 'POOL BAR', 0, y + 1.6, z - 1.02, 0, -1, 0.04, WHITE, col(0x2a7aa8));
      return;
    }
    loungers(r, ctx, rnd, [0xf2c230, 0xf4f4f0]);
  },
  sun(r, ctx, rnd) {
    loungers(r, ctx, rnd, [0xe86a3a, 0xf4f4f0]);
  },
  sky(r, ctx, rnd) {
    loungers(r, ctx, rnd, [0x3aa86a, 0xf4f4f0]);
  },

  golf(r, { kits, y }, rnd) {
    if (r.id !== 'golf') return;
    const k = kits.outside;
    // nine holes: a flag in each, and some low walls to play round
    for (let i = 0; i < 9; i++) {
      const x = r.x0 + 3 + ((i % 3) / 2) * (r.x1 - r.x0 - 6);
      const z = r.z0 + 4 + Math.floor(i / 3) * ((r.z1 - r.z0 - 8) / 2);
      k.cyl(x, y + 0.005, z, y + 0.01, 0.06, BLACK, 8);
      k.cyl(x, y, z, y + 1.2, 0.012, WHITE, 4);
      k.panel(x + 0.15, y + 1.1, z, 0, 1, 0.3, 0.18, new THREE.Color().setHSL(rnd(), 0.8, 0.5));
      k.box(x - 1.5, y, z + 1.2, x + 1.5 - rnd() * 1.5, y + 0.15, z + 1.4, col(0xe8e2d6));
    }
    sign(k, 'MINI GOLF', 0, y + 1.2, r.z0 + 0.6, 0, -1, 0.04, WHITE, col(0x2a6a3a));
  },

  track(r, { kits, y }) {
    if (r.id !== 'track-aft') return;
    kits.outside.words('START', -14.9, y + 0.006, r.z1 - 6, 0, 1, 0.05, WHITE);
  },

  lookout(r, ctx, rnd) {
    loungers(r, ctx, rnd, [0x2a5a8a, 0xf4f4f0]);
  },

  bridge() {},
};

// Sun loungers in rows across the open deck, with the odd umbrella, keeping
// off the pools, the deckhouses and the way along it.
function loungers(r, { kits, y, solid, n }, rnd, colors) {
  const k = kits.outside;
  const pools = POOLS.filter((p) => p.deck === n);
  const clear = (x, z, m) => {
    for (const p of pools) if (x > p.x0 - m - 1 && x < p.x1 + m + 1 && z > p.z0 - m - 1 && z < p.z1 + m + 1) return false;
    if (n === 15) {
      const [hx0, hz0, hx1, hz1] = TRACK.hole;
      if (x > hx0 - 1 && x < hx1 + 1 && z > hz0 - 1 && z < hz1 + 1) return false;
    }
    if (Math.abs(x) < FUNNEL.half + 1.5 && z > FUNNEL.z0 - 1.5 && z < FUNNEL.z1 + 1.5) return false;
    return true;
  };
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  if (w < 3 || d < 3) return;
  const step = 1.0;
  for (let z = r.z0 + 1.5; z < r.z1 - 1.5; z += 3.2) {
    for (let x = r.x0 + 1.2; x < r.x1 - 1; x += step) {
      // a gangway down the middle of the deck, and along each side
      if (Math.abs(x) < 2.2 || Math.abs(x) > Math.min(Math.abs(r.x0), Math.abs(r.x1)) - 1.5) continue;
      if (!clear(x, z, 0.4)) continue;
      if (rnd() < 0.25) continue;
      lounger(k, x, y, z, 1, col(colors[Math.floor(rnd() * colors.length)]));
      solid(x, z - 0.7, x, z + 0.7, 0.3, y, y + 0.45);
      if (rnd() < 0.08) umbrella(k, x + 0.5, y, z, col(colors[0]));
    }
  }
}

function seatRow(k, x0, x1, y, z, c, aisles = []) {
  for (let x = x0 + 0.27; x < x1 - 0.2; x += 0.55) {
    if (aisles.some((a) => Math.abs(x - a) < 0.6)) continue;
    k.box(x - 0.24, y + 0.38, z - 0.25, x + 0.24, y + 0.48, z + 0.22, c);
    k.box(x - 0.24, y + 0.48, z - 0.3, x + 0.24, y + 1.0, z - 0.22, c);
    k.box(x - 0.26, y, z - 0.28, x - 0.22, y + 0.65, z + 0.2, BLACK);
  }
}

// ── A stateroom ──────────────────────────────────────────────────────────────

// The furniture of a stateroom, its bathroom, and its balcony's chairs: into
// kits (inside, glow, outside), in the ship's frame. -> solids, in the same.
export function furnishCabin(kits, c, st, { yours = false, y }) {
  const k = kits.inside;
  const out = [];
  const solid = (ax, az, bx, bz, r, b, t) => out.push({ ax, az, bx, bz, r, bottom: b, topA: t, topB: t });
  const s = c.side;
  const p = st.palette;
  const wood = col(p.wood);
  const fabric = col(p.fabric);
  const accent = col(p.accent);
  // across the cabin, from its corridor wall (in) to its far wall (out)
  const xin = s > 0 ? (c.kind === 'inside' ? c.x1 : c.x0) : c.kind === 'inside' ? c.x0 : c.x1;
  const xout = s > 0 ? (c.kind === 'inside' ? c.x0 : c.x1) : c.kind === 'inside' ? c.x1 : c.x0;
  const dir = Math.sign(xout - xin); // from the door, into the room
  const X = (d) => xin + dir * d; // d m in from the corridor wall
  const deep = Math.abs(xout - xin);
  const box = (d0, y0, z0, d1, y1, z1, color) => k.box(Math.min(X(d0), X(d1)), y + y0, z0, Math.max(X(d0), X(d1)), y + y1, z1, color);
  const { z0, z1 } = c;
  const fore = z1;
  // the bathroom: a pod in the corner by the door, beside the way in
  const bath = { d0: 0.1, d1: 1.9, z0: fore - 2.6 - 0.9, z1: fore - 1.25 };
  const bz0 = Math.max(z0 + 0.1, z0 + (z1 - z0) - 3.3);
  box(bath.d0, 0, bz0 - 0.0, bath.d1, H_IN - 0.05, fore - 1.3, col(0xe8e4dc));
  solid(X(bath.d0 + 0.2), (bz0 + fore - 1.3) / 2, X(bath.d1 - 0.2), (bz0 + fore - 1.3) / 2, Math.max(0.2, (fore - 1.3 - bz0) / 2), y, y + H_IN);
  // the wardrobe opposite it, on the cabin's aft side by the door... (inboard)
  box(0.1, 0, z0 + 0.1, 1.2, 2.2, z0 + 0.7, wood);
  solid(X(0.65), z0 + 0.4, X(0.65), z0 + 0.4, 0.45, y, y + 2.2);
  // the bed, its head against the aft wall, toward the window
  const suite = c.kind === 'suite';
  const bedD = Math.min(deep - 1.4, 2.4 + (suite ? 1.2 : 0));
  const bedZ = (z0 + z1) / 2 - (suite ? 1.5 : 0.1);
  const bw = 1.6 + (suite ? 0.4 : 0);
  const bl = 2.0;
  const bx0 = bedD - bl / 2;
  const bx1 = bedD + bl / 2;
  box(bx0, 0, bedZ - bw / 2, bx1, 0.45, bedZ + bw / 2, wood);
  box(bx0 + 0.05, 0.45, bedZ - bw / 2 + 0.05, bx1 - 0.05, 0.62, bedZ + bw / 2 - 0.05, st.made || yours ? WHITE : col(0xe8e4dc));
  // the headboard along the corridor-side end? along the inboard-outboard axis the
  // bed lies across: its head against the wall between it and the next cabin
  box(bx0, 0, bedZ - bw / 2 - 0.08, bx1, 1.1, bedZ - bw / 2, accent);
  box(bx0 + 0.15, 0.62, bedZ - bw / 2 + 0.1, bx0 + 0.85, 0.75, bedZ - bw / 2 + 0.55, WHITE);
  box(bx1 - 0.85, 0.62, bedZ - bw / 2 + 0.1, bx1 - 0.15, 0.75, bedZ - bw / 2 + 0.55, WHITE);
  if (st.made || yours) box(bx0 + 0.05, 0.62, bedZ + 0.1, bx1 - 0.05, 0.66, bedZ + bw / 2 - 0.25, accent);
  else box(bx0 + 0.2, 0.62, bedZ - 0.2, bx1 - 0.3, 0.74, bedZ + bw / 2 - 0.1, fabric);
  solid(X(bx0 + 0.3), bedZ, X(bx1 - 0.3), bedZ, bw / 2, y, y + 0.62);
  // a towel animal, folded by the steward
  if (st.towel || yours) towel(k, X(bedD), y + 0.62, bedZ + 0.3, st.towel || 'swan');
  // nightstands and lamps either side of the bed's head
  for (const d of [bx0 - 0.3, bx1 + 0.3]) {
    if (d < 0.2 || d > deep - 0.2) continue;
    box(d - 0.22, 0, bedZ - bw / 2 + 0.02, d + 0.22, 0.55, bedZ - bw / 2 + 0.45, wood);
    kits.glow.cyl(X(d), y + 0.75, bedZ - bw / 2 + 0.25, y + 0.95, 0.1, col(0xfff0c8), 8, 0.14);
  }
  // the desk and a television on the forward wall, a sofa toward the window
  const deskD = Math.min(deep - 1.2, bx1 + 0.4);
  box(deskD - 0.6, 0.72, fore - 0.55, deskD + 0.6, 0.76, fore - 0.05, wood);
  box(deskD - 0.55, 0, fore - 0.5, deskD - 0.5, 0.72, fore - 0.1, wood);
  box(deskD + 0.5, 0, fore - 0.5, deskD + 0.55, 0.72, fore - 0.1, wood);
  k.box(Math.min(X(deskD - 0.5), X(deskD + 0.5)), y + 1.3, fore - 0.08, Math.max(X(deskD - 0.5), X(deskD + 0.5)), y + 1.9, fore - 0.04, BLACK);
  if (deep > 5.6) {
    const sd = deep - 0.75;
    box(sd - 0.4, 0, z0 + 0.4, sd + 0.4, 0.42, z0 + 2.2, fabric);
    box(sd - 0.4, 0.42, z0 + 0.2, sd + 0.4, 0.82, z0 + 0.4, fabric);
    solid(X(sd), z0 + 0.6, X(sd), z0 + 2.0, 0.42, y, y + 0.45);
  }
  // luggage, and a robe over the chair
  if (!yours) {
    for (let i = 0; i < st.cases; i++) {
      const d = 0.3 + i * 0.5;
      box(d, 0, z0 + 0.85, d + 0.4, 0.65 - i * 0.08, z0 + 1.15, col([0x2a2a30, 0x8a2a2a, 0x2a5a8a][i]));
    }
    if (st.robe) box(deskD - 0.3, 0.45, fore - 0.9, deskD + 0.3, 0.9, fore - 0.75, WHITE);
  } else {
    // a welcome card and your key card on the desk
    box(deskD - 0.3, 0.76, fore - 0.4, deskD - 0.1, 0.9, fore - 0.38, col(0xf4ecd8));
    box(deskD + 0.05, 0.76, fore - 0.35, deskD + 0.15, 0.765, fore - 0.2, col(0x2a6a9a));
  }
  if (st.fizz) {
    k.cyl(X(deskD + 0.3), y + 0.76, fore - 0.3, y + 0.95, 0.09, CHROME, 8);
    k.cyl(X(deskD + 0.3), y + 0.9, fore - 0.3, y + 1.15, 0.035, col(0x1a3a1a), 6);
  }
  // the balcony: two chairs and a little table
  if (c.balcony) {
    const b = c.balcony;
    const bx = (b.x0 + b.x1) / 2;
    const o = kits.outside;
    roundTable(o, bx, y, (b.z0 + b.z1) / 2, 0.3, WHITE, 0.5);
    chair(o, bx, y, (b.z0 + b.z1) / 2 - 0.7, 0, col(0x2a2a30));
    chair(o, bx, y, (b.z0 + b.z1) / 2 + 0.7, Math.PI, col(0x2a2a30));
  }
  return out;
}

// A towel folded into an animal, on the bed.
function towel(k, x, y, z, kind) {
  const w = WHITE;
  if (kind === 'swan') {
    for (const s of [1, -1]) {
      k.box(x - 0.15, y, z - 0.12 * s - 0.08, x + 0.15, y + 0.12, z - 0.12 * s + 0.08, w);
      k.box(x + 0.12, y + 0.1, z - 0.06 * s - 0.03, x + 0.17, y + 0.32, z - 0.06 * s + 0.03, w);
    }
  } else if (kind === 'elephant') {
    k.box(x - 0.18, y, z - 0.12, x + 0.18, y + 0.2, z + 0.12, w);
    k.box(x + 0.15, y + 0.12, z - 0.14, x + 0.3, y + 0.3, z + 0.14, w);
    k.box(x + 0.28, y + 0.02, z - 0.03, x + 0.34, y + 0.2, z + 0.03, w);
  } else {
    k.box(x - 0.12, y, z - 0.1, x + 0.12, y + 0.22, z + 0.1, w);
    k.box(x - 0.08, y + 0.22, z - 0.08, x + 0.08, y + 0.36, z + 0.08, w);
    k.box(x - 0.35, y + 0.1, z - 0.03, x + 0.35, y + 0.15, z + 0.03, w);
  }
}

