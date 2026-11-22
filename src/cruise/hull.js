// The ship from outside: what's seen of her from the shore, from the pier,
// from a boat, from her own open decks.
//
//   the hull       lofted from her keel up to the promenade's bulwark: fine
//                  at the bow, with a raked stem and a flare, full amidships,
//                  a flat transom; red under the water, a dark boot-top at
//                  it, white above with a navy stripe; the door in her port
//                  side where the gangway comes aboard
//   the promenade  deck 6, open along both sides under the deck over it, with
//                  the lifeboats hung outboard on their davits
//   the decks      7 to 13 stacked on her, each stepping back at the front:
//                  windows on 7, balconies on 8 to 13 (glass rails, the
//                  partitions between them, the glass doors behind), the
//                  bridge across the front of 13 with its wings
//   on top         the funnel, raked aft, in the line's colours; the mast
//                  over the bridge; the forecastle deck at the bow
//   her name       HALCYON on both bows and across the stern, MERIDIAN under it
//
// The open decks (14–16) are drawn by decks.js, as they're walked on too.
// Windows are glass, so you can see out of them from inside; after dark, the
// rooms behind some of them light up (the lit kit), and whoever builds this
// turns that up with the night, and off while you're aboard and the real
// rooms are there.
//
// Everything is in the ship's frame (plan.js), round her origin.
//
//   buildHull({ materials, states }) -> { object, lit (the lit windows'
//     mesh), backing (what's behind the rest), solids: her sides at the
//     waterline, for swimmers and boats }
//   states(cabin) -> its stateroom (cabins.js), for which are lit
//   hullWidth(z, y) -> how far out her plating is at z, y (m)

import * as THREE from 'three';
import { ShipKit } from './kit.js';
import { layout } from '../videostore/font.js';
import { halfBeam, deckY, layout as deckLayout, walls, cabinsOn, CORES, DECK_H, SLAB, HALF_BEAM, BOW, STERN, DRAFT, HULL_T, FUNNEL, SHIP } from './plan.js';

const col = (hex) => new THREE.Color(hex);
const WHITE = col(0xf2f2ee);
const OFFWHITE = col(0xe6e6e0);
const NAVY = col(0x1a2a4a);
const BOOT = col(0x14161c);
const RED = col(0x7a2622);
const GOLD = col(0xc8a050);
const GLASS = col(0x5a7a8a);
const DARK_GLASS = col(0x1a2a34);
const TEAK = col(0xa98256);
const STEEL = col(0x8a9098);
const ORANGE = col(0xe8641e);
const LIT = col(0xffd9a0);

const PROMENADE = { z0: -136, z1: 85, inner: 15.4, y: deckY(6) };
const BULWARK = PROMENADE.y + 1.1; // m: the top of her side along the promenade
const FORECASTLE = deckY(7); // the deck at the bow
const SHELL = { z0: -24, z1: -20, y0: deckY(4), y1: deckY(4) + 2.3 };
const CABINS_AFT = -140;
const cabinsFore = (n) => 116 - (n - 7) * 2.5;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// How far up her side goes at z.
export function hullTop(z) {
  return BULWARK + smooth(85, 108, z) * (FORECASTLE + 1.1 - BULWARK) + smooth(-138, -146, z) * 0;
}
// How deep her keel is at z: it rises toward the stern, and at the forefoot.
function keel(z) {
  return DRAFT * (1 - 0.72 * smooth(-118, -150, z)) * (1 - 0.35 * smooth(134, 148, z));
}
// How far out her plating is at z, height y (over the waterline).
export function hullWidth(z, y) {
  const deck = halfBeam(z);
  // at the waterline she's finer forward (the flare above it)
  const wl = halfBeam(z + 8 * smooth(40, 140, z));
  if (y >= 0) return wl + (deck - wl) * smooth(0, 10, y);
  const D = keel(z);
  const t = Math.min(1, -y / D);
  const p = 2 + 4 * (1 - smooth(70, 140, z)) * (1 - 0.5 * smooth(-110, -150, z));
  return wl * Math.pow(Math.max(0, 1 - Math.pow(t, p)), 1 / p);
}

export function buildHull({ materials, states = () => null }) {
  const kits = { hull: new ShipKit(), glass: new ShipKit(), lit: new ShipKit(), backing: new ShipKit(), glow: new ShipKit(), teak: new ShipKit() };
  const object = new THREE.Group();
  object.name = 'hull';
  hull(kits);
  transom(kits);
  promenade(kits);
  for (let n = 7; n <= 13; n++) superstructure(kits, n, states);
  lowerWindows(kits);
  bridge(kits);
  forecastle(kits);
  funnel(kits);
  mast(kits);
  lifeboats(kits);
  names(kits);
  navLights(kits);

  const mats = { hull: materials.outside, glass: materials.glass, lit: materials.lit, backing: materials.backing, glow: materials.glow, teak: materials.teak };
  let lit = null;
  let backing = null;
  for (const k of Object.keys(kits)) {
    if (kits[k].empty) continue;
    const mesh = new THREE.Mesh(kits[k].build(k === 'teak'), mats[k]);
    mesh.castShadow = k === 'hull';
    mesh.receiveShadow = k === 'hull' || k === 'teak';
    if (k === 'glass') mesh.renderOrder = 2;
    mesh.name = `hull-${k}`;
    object.add(mesh);
    if (k === 'lit') lit = mesh;
    if (k === 'backing') backing = mesh;
  }
  // her sides at the waterline, from the keel up to deck 4: swimmers and
  // boats keep off them
  const solids = [];
  for (const s of [1, -1]) {
    let prev = null;
    for (let z = STERN; z <= BOW; z += 6) {
      const p = [s * hullWidth(z, 0), z];
      if (prev) solids.push({ ax: prev[0], az: prev[1], bx: p[0], bz: p[1], r: 0.6, bottom: -DRAFT - 1, topA: deckY(4) - 0.5, topB: deckY(4) - 0.5 });
      prev = p;
    }
  }
  solids.push({ ax: -hullWidth(STERN, 0), az: STERN, bx: hullWidth(STERN, 0), bz: STERN, r: 0.6, bottom: -DRAFT - 1, topA: deckY(4) - 0.5, topB: deckY(4) - 0.5 });
  return {
    object,
    lit,
    backing,
    solids,
    dispose() {
      object.traverse((o) => o.isMesh && o.geometry.dispose());
    },
  };
}

// A window: its glass, and just inside it what's seen through it while the
// room behind isn't there: a lit room after dark, or a dim one.
function pane(kits, x, y, z, nx, nz, w, h, on, color = GLASS) {
  kits.glass.panel(x, y, z, nx, nz, w, h, color);
  (on ? kits.lit : kits.backing).panel(x - nx * 0.12, y, z - nz * 0.12, nx, nz, w - 0.08, h - 0.08, on ? LIT : col(0x2a3440));
}

// ── The hull ─────────────────────────────────────────────────────────────────

const LEVELS = [-DRAFT, -7.8, -6.6, -5, -3.2, -1.6, -0.3, 0.9, 2.6, 3.1, 5, SHELL.y0, SHELL.y1, 10.5, 12, 'top'];
function stations() {
  const out = new Set();
  for (let z = STERN; z <= 130; z += 2.5) out.add(+z.toFixed(2));
  for (let z = 130; z <= BOW; z += 1) out.add(z);
  out.add(SHELL.z0);
  out.add(SHELL.z1);
  return [...out].sort((a, b) => a - b);
}
function colorAt(y) {
  if (y < -0.3) return RED;
  if (y < 0.9) return BOOT;
  if (y < 2.6) return NAVY;
  if (y < 3.1) return GOLD;
  return WHITE;
}

function hull(kits) {
  const k = kits.hull;
  const Z = stations();
  for (const s of [1, -1]) {
    for (let i = 0; i < Z.length - 1; i++) {
      const za = Z[i];
      const zb = Z[i + 1];
      for (let j = 0; j < LEVELS.length - 1; j++) {
        const lv = (z, l) => (l === 'top' ? hullTop(z) : Math.max(-keel(z), l));
        const ya0 = lv(za, LEVELS[j]);
        const ya1 = lv(za, LEVELS[j + 1]);
        const yb0 = lv(zb, LEVELS[j]);
        const yb1 = lv(zb, LEVELS[j + 1]);
        if (ya1 <= ya0 + 1e-3 && yb1 <= yb0 + 1e-3) continue;
        // the door in her port side
        if (s > 0 && za >= SHELL.z0 - 1e-3 && zb <= SHELL.z1 + 1e-3 && ya0 >= SHELL.y0 - 1e-3 && ya1 <= SHELL.y1 + 1e-3) continue;
        const a = [s * hullWidth(za, ya0), ya0, za];
        const b = [s * hullWidth(zb, yb0), yb0, zb];
        const c = [s * hullWidth(zb, yb1), yb1, zb];
        const d = [s * hullWidth(za, ya1), ya1, za];
        const color = colorAt((ya0 + ya1) / 2);
        if (s > 0) k.face(a, d, c, b, color);
        else k.face(a, b, c, d, color);
      }
    }
  }
  // the bottom between the keels: the hull closes there, but give it a strip
  // so there's no slit along it
  for (let i = 0; i < Z.length - 1; i++) {
    const za = Z[i];
    const zb = Z[i + 1];
    k.face([-0.2, -keel(za), za], [-0.2, -keel(zb), zb], [0.2, -keel(zb), zb], [0.2, -keel(za), za], RED);
  }
  // the door's frame, and its recess
  const x = hullWidth((SHELL.z0 + SHELL.z1) / 2, SHELL.y0 + 1) - HULL_T;
  k.box(x - 0.02, SHELL.y0, SHELL.z0, x, SHELL.y1, SHELL.z1, col(0xd8d4cc));
  k.box(x, SHELL.y1, SHELL.z0 - 0.1, HALF_BEAM + 0.05, SHELL.y1 + 0.1, SHELL.z1 + 0.1, STEEL);
  k.box(x, SHELL.y0 - 0.02, SHELL.z0, HALF_BEAM, SHELL.y0, SHELL.z1, STEEL);
  for (const z of [SHELL.z0, SHELL.z1]) k.box(x, SHELL.y0, z - 0.05, HALF_BEAM + 0.05, SHELL.y1, z + 0.05, STEEL);
  // the top of her side: a teak cap along the bulwark, and the forecastle's
  const Zt = Z.filter((z) => z > STERN + 0.1 && z < BOW - 1);
  for (const s of [1, -1]) {
    for (let i = 0; i < Zt.length - 1; i++) {
      const za = Zt[i];
      const zb = Zt[i + 1];
      const ya = hullTop(za);
      const yb = hullTop(zb);
      const xa = s * hullWidth(za, ya);
      const xb = s * hullWidth(zb, yb);
      const ia = s * (hullWidth(za, ya) - 0.3);
      const ib = s * (hullWidth(zb, yb) - 0.3);
      if (s > 0) kits.hull.face([ia, ya, za], [xa, ya, za], [xb, yb, zb], [ib, yb, zb], TEAK);
      else kits.hull.face([ia, ya, za], [ib, yb, zb], [xb, yb, zb], [xa, ya, za], TEAK);
      // and its inside face, down to the deck
      const floor = za > 100 ? FORECASTLE : PROMENADE.y;
      if (s > 0) kits.hull.face([ia, floor, za], [ia, ya, za], [ib, yb, zb], [ib, floor, zb], WHITE);
      else kits.hull.face([ia, floor, za], [ib, floor, zb], [ib, yb, zb], [ia, ya, za], WHITE);
    }
  }
}

function transom(kits) {
  const k = kits.hull;
  const z = STERN;
  const top = hullTop(z);
  const ys = [-keel(z), -0.3, 0.9, 2.6, 3.1, top];
  for (let j = 0; j < ys.length - 1; j++) {
    const y0 = ys[j];
    const y1 = ys[j + 1];
    const w0 = hullWidth(z, y0);
    const w1 = hullWidth(z, y1);
    k.face([-w0, y0, z], [w0, y0, z], [w1, y1, z], [-w1, y1, z], colorAt((y0 + y1) / 2));
    // facing aft: the face above is anticlockwise seen from behind? flip it to be sure it's seen
    k.face([-w0, y0, z], [-w1, y1, z], [w1, y1, z], [w0, y0, z], colorAt((y0 + y1) / 2));
  }
  // the stern's deck (the terrace on 6) and its rail are drawn with the promenade
}

// ── The promenade ────────────────────────────────────────────────────────────

function promenade(kits) {
  const { z0, z1, inner, y } = PROMENADE;
  const top = deckY(7) - SLAB;
  const k = kits.hull;
  const doors = CORES.filter((c) => c.id !== 'fwd').map((c) => [c.z - 1.2, c.z + 1.2]);
  for (const s of [1, -1]) {
    // the deck itself
    kits.teak.quad([s > 0 ? inner : -HALF_BEAM, y + 0.003, z1], [s > 0 ? HALF_BEAM : -inner, y + 0.003, z1], [s > 0 ? HALF_BEAM : -inner, y + 0.003, z0], [s > 0 ? inner : -HALF_BEAM, y + 0.003, z0], [0, 1, 0], TEAK, [0, z1 / 4, 1, z0 / 4]);
    // the wall along its inner side, windowed, with the doors in
    const x = s * (inner + 0.08);
    let from = z0;
    const cuts = [...doors].sort((a, b) => a[0] - b[0]);
    const run = (a, b) => {
      for (let z = a; z < b - 0.01; z += 3) {
        const e = Math.min(b, z + 3);
        k.panel(x, (y + top) / 2, (z + e) / 2, s, 0, e - z, top - y, OFFWHITE);
        if (e - z > 2.4) pane(kits, x + s * 0.02, y + 1.45, (z + e) / 2, s, 0, 2, 1.3, true, DARK_GLASS);
      }
    };
    for (const [a, b] of cuts) {
      run(from, a);
      k.panel(x, (y + 2.2 + top) / 2, (a + b) / 2, s, 0, b - a, top - y - 2.2, OFFWHITE);
      kits.backing.panel(x - s * 0.5, y + 1.1, (a + b) / 2, s, 0, b - a, 2.2, col(0x3a3a34));
      from = b;
    }
    run(from, z1);
    // the deck over it
    k.flat(s > 0 ? inner : -HALF_BEAM, z0, s > 0 ? HALF_BEAM : -inner, z1, top, WHITE, true);
    for (let z = z0 + 2; z < z1; z += 4) kits.glow.flat(s * (inner + 1.1) - 0.2, z - 0.2, s * (inner + 1.1) + 0.2, z + 0.2, top - 0.01, LIT, true);
    // the end wall at its forward end
    k.panel(s * (inner + HALF_BEAM) / 2, (y + top) / 2, z1, 0, -1, HALF_BEAM - inner, top - y, WHITE);
    // the edge of the deck over it, along her side
    k.box(s > 0 ? HALF_BEAM - 0.05 : -HALF_BEAM, top, z0, s > 0 ? HALF_BEAM : -HALF_BEAM + 0.05, top + SLAB, z1, WHITE);
  }
  // round the stern: the terrace's deck, and the wall of the nightclub behind it
  const tz = [-146, -136];
  const th = halfBeam(tz[0]) - 0.2;
  kits.teak.quad([-th, y + 0.003, tz[1]], [th, y + 0.003, tz[1]], [th, y + 0.003, tz[0]], [-th, y + 0.003, tz[0]], [0, 1, 0], TEAK, [0, tz[1] / 4, 1, tz[0] / 4]);
  for (let x = -inner; x < inner - 0.01; x += 3) {
    const e = Math.min(inner, x + 3);
    const door = Math.abs((x + e) / 2) < 2;
    if (!door) k.panel((x + e) / 2, (y + top) / 2, tz[1] - 0.08, 0, -1, e - x, top - y, OFFWHITE);
    else k.panel((x + e) / 2, (y + 2.2 + top) / 2, tz[1] - 0.08, 0, -1, e - x, top - y - 2.2, OFFWHITE);
    if (!door) pane(kits, (x + e) / 2, y + 1.45, tz[1] - 0.1, 0, -1, 2, 1.3, true, DARK_GLASS);
  }
  k.flat(-th, tz[0], th, tz[1], top, WHITE, true);
  // the deck over the terrace (deck 7's aft end is at -140: its top here is open)
  k.flat(-th, tz[0], th, CABINS_AFT, top + SLAB, OFFWHITE);
  k.box(-th, top, tz[0], th, top + SLAB, tz[0] + 0.05, WHITE);
}

// ── Decks 7 to 13 ────────────────────────────────────────────────────────────

function superstructure(kits, n, states) {
  const k = kits.hull;
  const y0 = deckY(n) - SLAB;
  const y1 = deckY(n + 1) - SLAB;
  const fore = cabinsFore(n);
  const h = y1 - y0;
  const cabins = cabinsOn(n);
  // which stretches of her side have a balcony or a window
  for (const s of [1, -1]) {
    const mine = cabins.filter((c) => c.side === s && c.kind !== 'inside').sort((a, b) => a.z0 - b.z0);
    let z = CABINS_AFT;
    const solidSide = (a, b) => {
      if (b - a < 0.01) return;
      for (let zz = a; zz < b - 0.01; zz += 3) {
        const e = Math.min(b, zz + 3);
        const x = s * halfBeam((zz + e) / 2);
        k.panel(x, (y0 + y1) / 2, (zz + e) / 2, s, 0, e - zz, h, WHITE);
      }
    };
    for (const c of mine) {
      solidSide(z, c.z0);
      if (c.balcony) balcony(kits, c, y0, y1, states(c));
      else window(kits, c, y0, y1, states(c));
      z = c.z1;
    }
    solidSide(z, fore);
  }
  // the front, stepping back a little each deck, with a band of windows
  const fw = halfBeam(fore);
  if (n < 13) {
    for (let x = -fw; x < fw - 0.01; x += 3) {
      const e = Math.min(fw, x + 3);
      k.panel((x + e) / 2, (y0 + y1) / 2, fore, 0, 1, e - x, h, WHITE);
      if (e - x > 2.2) k.panel((x + e) / 2, deckY(n) + 1.4, fore + 0.02, 0, 1, 2, 1.2, DARK_GLASS);
    }
    // the top of the step, out in front of the deck over it
    k.flat(-fw, cabinsFore(n + 1), fw, fore, y1 + SLAB, OFFWHITE);
  }
  // the aft end, with its windows
  const aw = halfBeam(CABINS_AFT);
  for (let x = -aw; x < aw - 0.01; x += 3) {
    const e = Math.min(aw, x + 3);
    k.panel((x + e) / 2, (y0 + y1) / 2, CABINS_AFT, 0, -1, e - x, h, WHITE);
    if (e - x > 2.2) k.panel((x + e) / 2, deckY(n) + 1.4, CABINS_AFT - 0.02, 0, -1, 2, 1.2, DARK_GLASS);
  }
  // the edge of each deck: a white band
  for (const s of [1, -1]) {
    for (let z = CABINS_AFT; z < fore - 0.01; z += 3) {
      const e = Math.min(fore, z + 3);
      k.panel(s * (halfBeam((z + e) / 2) + 0.02), y0 + SLAB / 2, (z + e) / 2, s, 0, e - z, SLAB, WHITE);
    }
  }
}

function window(kits, c, y0, y1, st) {
  const s = c.side;
  const x = s * halfBeam((c.z0 + c.z1) / 2);
  const zc = (c.z0 + c.z1) / 2;
  const h = y1 - y0;
  kits.hull.panel(x, (y0 + y1) / 2, zc, s, 0, c.z1 - c.z0, h, WHITE);
  pane(kits, x + s * 0.03, y0 + SLAB + 1.45, zc, s, 0, 1.8, 1.25, !!(st && st.lit));
}

function balcony(kits, c, y0, y1, st) {
  const s = c.side;
  const b = c.balcony;
  const wallX = s > 0 ? b.x0 : b.x1; // the cabin's glass front
  const edge = s > 0 ? b.x1 + 0.25 : b.x0 - 0.25;
  const y = y0 + SLAB;
  const top = y1;
  const zc = (c.z0 + c.z1) / 2;
  const w = c.z1 - c.z0;
  // the balcony's floor slab and its edge
  const lo = Math.min(wallX, edge);
  const hi = Math.max(wallX, edge);
  kits.teak.quad([lo, y + 0.003, c.z1], [hi, y + 0.003, c.z1], [hi, y + 0.003, c.z0], [lo, y + 0.003, c.z0], [0, 1, 0], TEAK, [lo / 4, c.z1 / 4, hi / 4, c.z0 / 4]);
  kits.hull.panel(edge, y0 + SLAB / 2, zc, s, 0, w, SLAB, WHITE);
  // and the underside of the one over it
  kits.hull.flat(lo, c.z0, hi, c.z1, top, WHITE, true);
  // the glass front of the cabin, its frames, and the light in the room behind
  kits.glass.panel(wallX + s * 0.08, y + 1.2, zc, s, 0, w - 0.3, 2.3, GLASS);
  (st && st.lit ? kits.lit : kits.backing).panel(wallX - s * 0.15, y + 1.2, zc, s, 0, w - 0.6, 2.1, st && st.lit ? LIT : col(0x2a3440));
  kits.hull.box(Math.min(wallX, wallX + s * 0.1), y, c.z0, Math.max(wallX, wallX + s * 0.1), top, c.z0 + 0.15, WHITE);
  kits.hull.box(Math.min(wallX, wallX + s * 0.1), y + 2.3, c.z0, Math.max(wallX, wallX + s * 0.1), top, c.z1, WHITE);
  // the partition between it and the next, white
  kits.hull.box(lo, y, c.z0 - 0.04, hi, top - 0.15, c.z0 + 0.04, OFFWHITE);
  // the glass rail
  const rx = s > 0 ? b.x1 : b.x0;
  kits.glass.panel(rx + s * 0.05, y + 0.55, zc, s, 0, w - 0.1, 0.95, col(0x9cc4d4));
  kits.glass.panel(rx + s * 0.05, y + 0.55, zc, -s, 0, w - 0.1, 0.95, col(0x9cc4d4));
  kits.hull.box(Math.min(rx, rx + s * 0.12), y + 1.0, c.z0, Math.max(rx, rx + s * 0.12), y + 1.06, c.z1, STEEL);
}

// Windows in her side on decks 4 and 5, where the rooms along it have them.
function lowerWindows(kits) {
  for (const n of [4, 5]) {
    const L = deckLayout(n);
    const y = deckY(n);
    for (const w of walls(L)) {
      if (w.kind !== 'hull' || w.x0 !== w.x1) continue;
      const len = Math.abs(w.z1 - w.z0);
      const r = w.room;
      if (r.kind === 'theatre' || r.kind === 'stage') continue;
      const s = Math.sign(w.x0);
      const P = 3;
      const ww = 2;
      const zlo = Math.min(w.z0, w.z1);
      for (let a = (len % P) / 2 + (P - ww) / 2; a + ww <= len - 0.3; a += P) {
        const zc = zlo + a + ww / 2;
        const yc = y + (0.75 + 2.1) / 2;
        const x = s * (hullWidth(zc, yc) + 0.03);
        if (Math.abs(hullWidth(zc, y + 0.75) - hullWidth(zc, y + 2.1)) > 0.15) continue;
        pane(kits, x, yc, zc, s, 0, ww, 2.1 - 0.75, true);
      }
    }
  }
}

// ── The bridge ───────────────────────────────────────────────────────────────

function bridge(kits) {
  const n = 13;
  const y = deckY(n);
  const z1 = cabinsFore(n);
  const w = halfBeam(z1);
  const k = kits.hull;
  // its front: glass all the way across, raked out a little at the top
  kits.glass.face([-w, y + 0.9, z1 + 0.02], [w, y + 0.9, z1 + 0.02], [w, y + 2.5, z1 + 0.3], [-w, y + 2.5, z1 + 0.3], DARK_GLASS);
  k.face([-w, y - SLAB, z1], [w, y - SLAB, z1], [w, y + 0.9, z1], [-w, y + 0.9, z1], WHITE);
  k.face([-w, y + 2.5, z1 + 0.3], [w, y + 2.5, z1 + 0.3], [w, y + DECK_H - SLAB, z1], [-w, y + DECK_H - SLAB, z1], WHITE);
  // the wings, out past her sides so the officers can see down them
  for (const s of [1, -1]) {
    const x0 = s * (halfBeam(z1 - 4) - 0.1);
    const x1 = s * (HALF_BEAM + 3.5);
    k.box(Math.min(x0, x1), y - SLAB, z1 - 6, Math.max(x0, x1), y, z1 - 1, WHITE);
    k.box(Math.min(x0, x1), y + 2.4, z1 - 6, Math.max(x0, x1), y + DECK_H - SLAB, z1 - 1, WHITE);
    kits.glass.box(Math.min(x0, x1), y + 0.9, z1 - 6, Math.max(x0, x1), y + 2.4, z1 - 1, DARK_GLASS);
    k.box(Math.min(x0, x1), y, z1 - 6, Math.max(x0, x1), y + 0.9, z1 - 1, WHITE);
  }
}

// The deck at the bow, forward of the decks over it: the anchor windlasses,
// mooring winches, bollards.
function forecastle(kits) {
  const k = kits.hull;
  const y = FORECASTLE;
  const z0 = cabinsFore(7);
  const Z = [];
  for (let z = z0; z <= BOW - 0.5; z += 1) Z.push(z);
  for (let i = 0; i < Z.length - 1; i++) {
    const a = halfBeam(Z[i]) - 0.3;
    const b = halfBeam(Z[i + 1]) - 0.3;
    k.face([-a, y, Z[i]], [-b, y, Z[i + 1]], [b, y, Z[i + 1]], [a, y, Z[i]], col(0x5a6a5a));
  }
  // the front of deck 7 and the decks over it, above the forecastle: done in superstructure
  for (const s of [1, -1]) {
    k.cyl(s * 3.5, y, 126, y + 1.0, 1.0, col(0x3a3a3e), 12);
    k.cyl(s * 3.5, y + 1, 126, y + 1.1, 0.4, STEEL, 8);
    for (const z of [120, 132, 138]) k.cyl(s * Math.max(1, halfBeam(z) - 1.6), y, z, y + 0.6, 0.22, BOOT, 8);
  }
  // the hawse pipes, where the anchors are, low on her bow
  for (const s of [1, -1]) {
    const z = 136;
    const yy = 11.5;
    k.box(s * hullWidth(z, yy) - 0.05, yy - 0.8, z - 0.8, s * hullWidth(z, yy) + 0.05, yy + 0.8, z + 0.8, BOOT);
  }
}

// ── The funnel ───────────────────────────────────────────────────────────────

function funnel(kits) {
  const k = kits.hull;
  const base = deckY(15);
  const top = FUNNEL.top;
  const rake = 3; // m aft at the top
  const rows = [];
  const N = 20;
  const levels = [base, base + 6, base + 10, base + 13, top - 2.5, top - 1.4, top];
  for (const y of levels) {
    const t = (y - base) / (top - base);
    const half = FUNNEL.half * (1 - 0.18 * t);
    const len = (FUNNEL.z1 - FUNNEL.z0) * (1 - 0.15 * t);
    const zc = (FUNNEL.z0 + FUNNEL.z1) / 2 - rake * t;
    const ring = [];
    for (let i = 0; i <= N; i++) {
      // a rounded box: a superellipse in plan, rounder at the front
      const a = (i / N) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const p = 4;
      const x = half * Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
      const z = zc + (len / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s > 0 ? 2.6 : p));
      ring.push([x, y, z]);
    }
    rows.push(ring);
  }
  const band = (j) => {
    const y = levels[j];
    if (y >= top - 1.5) return BOOT;
    if (y >= base + 10 && y < base + 13) return NAVY;
    return WHITE;
  };
  k.loft(rows, (i) => band(i), false);
  // the cap, and the line's sun on each side of the blue
  const r0 = rows[rows.length - 1];
  for (let i = 0; i < r0.length - 1; i++) k.tri([0, top, (FUNNEL.z0 + FUNNEL.z1) / 2 - rake], r0[i + 1], r0[i], BOOT);
  for (const s of [1, -1]) {
    const t = (base + 11.5 - base) / (top - base);
    const x = s * (FUNNEL.half * (1 - 0.18 * t) + 0.06);
    const z = (FUNNEL.z0 + FUNNEL.z1) / 2 - rake * t;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.panel(x, base + 11.5 + Math.sin(a) * 1.0, z + Math.cos(a) * 1.0, s, 0, 0.25, 0.6, GOLD);
    }
    k.panel(x + s * 0.01, base + 11.5, z, s, 0, 1.1, 1.1, GOLD);
  }
}

function mast(kits) {
  const k = kits.hull;
  const z = 92;
  const y0 = deckY(15) + 0.5;
  k.cyl(0, y0, z, y0 + 13, 0.35, WHITE, 8, 0.2);
  k.box(-4, y0 + 8.5, z - 0.15, 4, y0 + 8.8, z + 0.15, WHITE);
  // radar: a dome either side, a scanner on top
  for (const s of [1, -1]) {
    k.cyl(s * 3.5, y0 + 8.8, z, y0 + 9.6, 0.7, WHITE, 12, 0.3);
  }
  k.box(-1.6, y0 + 13, z - 0.12, 1.6, y0 + 13.3, z + 0.12, col(0x2a2a30));
  kits.glow.box(-0.12, y0 + 13.3, z - 0.12, 0.12, y0 + 13.6, z + 0.12, col(0xffffff));
  // and the forward stub mast at the bow
  k.cyl(0, FORECASTLE, 145, FORECASTLE + 6, 0.12, WHITE, 6);
}

// ── Lifeboats ────────────────────────────────────────────────────────────────

export const LIFEBOATS = (() => {
  const out = [];
  for (const s of [1, -1]) for (let i = 0; i < 12; i++) out.push({ side: s, z: -112 + i * 16.5 });
  return out;
})();

function lifeboats(kits) {
  const k = kits.hull;
  const yk = PROMENADE.y + 0.9;
  for (const { side: s, z } of LIFEBOATS) {
    const xc = s * (HALF_BEAM + 2.2);
    const L = 10.4;
    const B = 1.8;
    // the hull: lofted, pointed at both ends, orange
    const rows = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const zz = z - L / 2 + t * L;
      const w = B * Math.pow(Math.sin(Math.PI * t), 0.6);
      const ring = [];
      for (const [u, v] of [
        [0, 0],
        [0.6, 0.15],
        [0.95, 0.6],
        [1, 1.5],
      ])
        ring.push([xc + s * w * u, yk + v, zz]);
      rows.push(ring);
    }
    const mirror = rows.map((r) => r.map(([x, y, zz]) => [2 * xc - x, y, zz]));
    k.loft(rows, () => ORANGE, s < 0);
    k.loft(mirror, () => ORANGE, s > 0);
    // the canopy over it, white, with windows
    k.box(xc - B * 0.85, yk + 1.5, z - L * 0.38, xc + B * 0.85, yk + 2.6, z + L * 0.38, WHITE);
    kits.glass.box(xc - B * 0.86, yk + 1.75, z - L * 0.3, xc + B * 0.86, yk + 2.15, z + L * 0.3, DARK_GLASS);
    k.box(xc - B * 0.5, yk + 2.6, z - L * 0.1, xc + B * 0.5, yk + 2.9, z + L * 0.1, ORANGE);
    // its davits: arms out from under the deck over the promenade
    const dy = deckY(7) - SLAB;
    for (const dz of [-L * 0.32, L * 0.32]) {
      k.rod([s * (HALF_BEAM - 0.4), dy - 0.2, z + dz], [s * (HALF_BEAM + 2.4), dy - 0.4, z + dz], 0.12, STEEL);
      k.rod([s * (HALF_BEAM + 2.2), dy - 0.4, z + dz], [xc, yk + 2.6, z + dz], 0.03, BOOT);
    }
  }
}

// ── Her name ─────────────────────────────────────────────────────────────────

// Words along her curving bow: each square of the letters set on her plating.
function hullWords(k, text, z0, yTop, s, px, color) {
  const L = layout(text);
  for (const [i, j] of L.dots) {
    const z = z0 - s * (i + 0.5) * px; // to port it reads aft, to starboard forward
    const y = yTop - (j + 0.5) * px;
    const x = s * (hullWidth(z, y) + 0.04);
    k.panel(x, y, z, s, 0, px * 0.95, px * 0.95, color);
  }
}

function names(kits) {
  const k = kits.hull;
  const px = 0.36;
  const len = (SHIP.name.length * 6 - 1) * px;
  hullWords(k, SHIP.name, 124, 12.6, 1, px, NAVY);
  hullWords(k, SHIP.name, 124 - len, 12.6, -1, px, NAVY);
  // across the stern, and her home port under it
  const z = STERN - 0.04;
  k.words(SHIP.name, 0, 11.4, z, 0, -1, 0.42, NAVY);
  k.words(SHIP.home, 0, 8.6, z, 0, -1, 0.24, NAVY);
}

// Red to port, green to starboard, on the bridge wings; white on the mast.
function navLights(kits) {
  const y = deckY(13) + 2.7;
  const z = cabinsFore(13) - 3;
  kits.glow.box(HALF_BEAM + 3.3, y, z - 0.2, HALF_BEAM + 3.6, y + 0.3, z + 0.2, col(0xff2020));
  kits.glow.box(-HALF_BEAM - 3.6, y, z - 0.2, -HALF_BEAM - 3.3, y + 0.3, z + 0.2, col(0x20ff40));
  // deck lights along the bulwark, for after dark
  for (let zz = -130; zz < 80; zz += 10) {
    for (const s of [1, -1]) kits.glow.box(s * (HALF_BEAM - 0.2) - 0.08, BULWARK + 0.02, zz - 0.08, s * (HALF_BEAM - 0.2) + 0.08, BULWARK + 0.08, zz + 0.08, LIT);
  }
}
