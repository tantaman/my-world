// One deck of the ship, built from its plan (plan.js): what it looks like,
// what's solid on it, and what the camera can't see through.
//
// Each room is its floor, its ceiling (where the deck over it is), its walls
// (each room draws its own side of a wall, so the wall between two rooms is
// two faces with the wall's thickness between), the head over each doorway,
// and what's in it (rooms.js). Windows are gaps in the walls on her side,
// with the hull's thickness round them; the glass is in the hull (hull.js).
// The staircases are drawn tread by tread; the doors are instances, to be
// opened one at a time.
//
// Up on decks 14 to 16 the deck is her outside too, seen from the shore:
// there a wall with nothing beyond it gets an outside face, and a room with
// nothing over it a roof. The balconies and the promenade are drawn with
// her outside (hull.js), so they're left out here but for what's solid.
//
// Everything is in the ship's frame (plan.js), round her origin.
//
//   buildDeck(n, { materials, seed, look, visual }) -> {
//     object     the group, in the ship's frame
//     solids     capsules for Solids, in the ship's frame ({ ax, az, bx, bz, r,
//                bottom, topA, topB, surface?, step? })
//     blockers   boxes the camera can't see through: [x0, y0, z0, x1, y1, z1]
//     doors      [{ ...plan's door, key (its index in the plan's), mesh, index,
//                open (0..1) }]: set(door, open) swings or slides it;
//                doorSolid(door) is what fills it shut
//     set(door, open)
//   }
//   visual: false builds only what's solid and the blockers, drawing nothing
//   (for the decks you aren't near).

import * as THREE from 'three';
import { ShipKit } from './kit.js';
import { layout, walls, floorStrips, flights, subtract, intersect, rectOf, CORES, CORE, deckY, DECK_H, SLAB, WALL_T, HULL_T, LAST } from './plan.js';
import { furnish } from './rooms.js';

const col = (hex) => new THREE.Color(hex);
const H_IN = DECK_H - SLAB; // m: a room's height, floor to ceiling
const DOOR_HEAD = 2.15; // m: the top of a doorway
const LINTEL_MOST = 3.4; // m: an opening wider than this is an archway, with no head over it
const RAIL_H = 1.05; // m: a railing's top
export const RAIL_SOLID = 2; // m: how high a railing is solid (so it can't be jumped)
const WELL_SOLID = 1.8; // ...and the rail round a well
const TOP_DECKS = 14; // from this deck up, the deck is her outside

const MARBLE = [col(0xe8e2d6), col(0xcfc6b6)];
const LOOK = {
  corridor: { floor: 0x2c3e5c, wall: 0xe8e2d4, dado: 0x7a5a3e, ceil: 0xf0ece4 },
  passage: { floor: 0x2c3e5c, wall: 0xe8e2d4, dado: 0x7a5a3e, ceil: 0xf0ece4 },
  lobby: { floor: 'marble', wall: 0xd8ccb4, dado: 0x6a4a30, ceil: 0xf2eee6 },
  stair: { floor: 0x5a4a3a, wall: 0xe0d8c8, ceil: 0xf0ece4 },
  lift: { floor: 0x4a4a4e, wall: 0xb8b8bc, ceil: 0xd8d8dc },
  sill: { floor: 0x9a9a9e, wall: 0xb8b8bc, ceil: 0xd8d8dc },
  cabin: { floor: 0x8a7a64, wall: 0xe8e0d0, ceil: 0xf2eee6 },
  balcony: { floor: 'teak', wall: 0xf2f2ee },
  dining: { floor: 0x6e2228, wall: 0xe8d8b8, dado: 0x5a3a24, ceil: 0xf2e6cc },
  theatre: { floor: 0x4a141c, wall: 0x2a1418, ceil: 0x1a1014 },
  stage: { floor: 0x3a2818, wall: 0x141010, ceil: 0x101010 },
  foyer: { floor: 0x5a2228, wall: 0xd8c8a8, dado: 0x5a3a24, ceil: 0xf0e8d8 },
  club: { floor: 0x16121c, wall: 0x1e1828, ceil: 0x0e0c14 },
  casino: { floor: 0x5a1420, wall: 0x3a1820, ceil: 0x2a1418 },
  bar: { floor: 0x4a3426, wall: 0x6a4a32, ceil: 0x3a2a20 },
  atrium: { floor: 'marble', wall: 0xe8dcc4, ceil: 0xf4ecdc },
  gangway: { floor: 'marble', wall: 0xe8dcc4, dado: 0x7a5a3e, ceil: 0xf4ecdc },
  gallery: { floor: 0x8a8278, wall: 0xf2f0ea, ceil: 0xf4f2ee },
  galleria: { floor: 'marble', wall: 0xece4d4, ceil: 0xf4f0e6 },
  shop: { floor: 0xc8c0b0, wall: 0xf4f0e8, ceil: 0xf6f4ee },
  cafe: { floor: 0x8a6a4a, wall: 0xe8d8c0, dado: 0x5a3a24, ceil: 0xf0e6d6 },
  champagne: { floor: 0x2a2030, wall: 0x4a3a50, ceil: 0x2a2030 },
  buffet: { floor: 0xa89a84, wall: 0xeee8dc, ceil: 0xf4f0ea },
  vestibule: { floor: 0x8a8278, wall: 0xe8e2d4, ceil: 0xf0ece4 },
  promenade: { floor: 'teak', wall: 0xf2f2ee, ceil: 0xf4f4f0 },
  terrace: { floor: 'teak', wall: 0xf2f2ee },
  lido: { floor: 'teak', wall: 0xf2f2ee, ceil: 0xf4f4f0 },
  splash: { floor: 'teak', wall: 0xf2f2ee, ceil: 0xf4f4f0 },
  track: { floor: 0x9a4a3a, wall: 0xf2f2ee },
  golf: { floor: 0x3e8a3e, wall: 0xf2f2ee },
  sun: { floor: 'teak', wall: 0xf2f2ee },
  sky: { floor: 'teak', wall: 0xf2f2ee },
  lookout: { floor: 'teak', wall: 0xf2f2ee },
  bridge: { floor: 0x3a3a40, wall: 0xe8e8e4, ceil: 0xf0f0ee },
};
const lookOf = (r) => LOOK[r.kind] || LOOK.corridor;
// Rooms drawn with her outside (hull.js): here only what's solid of them.
const OUTSIDE = new Set(['balcony', 'promenade', 'terrace']);
const TEAK = [col(0xb08a5a), col(0xa47e50), col(0xb89462)];
const STEEL = col(0x9aa0a8);
const RAIL_TOP = col(0x8a5a32);
const BRASS = col(0xc8a050);
const NIGHT_SIGN = col(0xf6f0dc);

// A kit that draws nothing, for a deck built only for what's solid.
const NOTHING = new Proxy(
  { empty: true },
  {
    get: (t, k) => (k in t ? t[k] : () => 0),
  },
);

// The kits a deck is drawn in, and the material each is drawn with.
const KITS = ['inside', 'outside', 'glow', 'glass', 'teak', 'water'];

export function buildDeck(n, { materials, seed = 0, look = {}, visual = true } = {}) {
  const L = layout(n);
  const y = L.y;
  const top = n >= TOP_DECKS;
  const kits = Object.fromEntries(KITS.map((k) => [k, visual ? new ShipKit() : NOTHING]));
  const solids = [];
  const blockers = [];
  const object = new THREE.Group();
  object.name = `deck-${n}`;
  const kitFor = (r) => (r.out ? kits.outside : kits.inside);

  // ── solids, in the ship's frame ──
  const solid = (ax, az, bx, bz, r, bottom, top_, extra) => solids.push({ ax, az, bx, bz, r, bottom, topA: top_, topB: top_, ...extra });
  const rectSolid = (x0, z0, x1, z1, bottom, top_, extra) => {
    const alongX = x1 - x0 >= z1 - z0;
    const short = alongX ? z1 - z0 : x1 - x0;
    const k = Math.max(1, Math.round(short / 1.1));
    const r = short / k / 2;
    for (let i = 0; i < k; i++) {
      const c = (alongX ? z0 : x0) + r * (2 * i + 1);
      if (alongX) solid(x0 + r, c, Math.max(x0 + r, x1 - r), c, r + 0.02, bottom, top_, extra);
      else solid(c, z0 + r, c, Math.max(z0 + r, z1 - r), r + 0.02, bottom, top_, extra);
    }
  };
  const box = (x0, y0, z0, x1, y1, z1) => blockers.push([x0, y0, z0, x1, y1, z1]);

  // the floor: strips, solid and seen by the camera
  const surfaceOf = (x, z) => {
    for (const r of L.rooms) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.out || lookOf(r).floor === 'teak' ? 'boards' : 'carpet';
    return 'boards';
  };
  for (const s of floorStrips(L)) {
    solid(s.x, s.z0 + s.r, s.x, Math.max(s.z0 + s.r, s.z1 - s.r), s.r, y - SLAB, y, { surface: surfaceOf(s.x, (s.z0 + s.z1) / 2) });
    box(s.x - s.r, y - SLAB, s.z0, s.x + s.r, y, s.z1);
  }
  // ...and the deck over it, which the camera mustn't rise through
  if (n < LAST) for (const s of floorStrips(layout(n + 1))) box(s.x - s.r, deckY(n + 1) - SLAB - 0.02, s.z0, s.x + s.r, deckY(n + 1), s.z1);

  // ── floors ──
  const above = n < LAST ? layout(n + 1) : null;
  const aboveRooms = above ? above.rooms.filter((r) => !r.crew).map(rectOf) : [];
  for (const r of L.rooms) {
    if (OUTSIDE.has(r.kind) || r.crew) continue;
    const lk = lookOf(r);
    const rects = subtract([rectOf(r)], [...L.holes, ...L.pools]);
    for (const [x0, z0, x1, z1] of rects) floorQuads(kits, lk.floor, x0, z0, x1, z1, y + 0.002, r, look);
  }

  // ── ceilings, and roofs where nothing is over a room ──
  for (const r of L.rooms) {
    if (OUTSIDE.has(r.kind) || r.crew) continue;
    const lk = lookOf(r);
    const base = [rectOf(r)];
    const k = kitFor(r);
    const tall = r.up ? Math.round((r.up + SLAB) / DECK_H) : 1;
    // the underside of the deck over it, where there is one
    let cover = above ? subtract(r.out ? intersect(base, aboveRooms) : base, above.holes) : [];
    if (above && !r.out && top) cover = intersect(cover, aboveRooms);
    for (const c of cover) ceiling(k, kits.glow, c, y + H_IN, lk, r);
    // a tall room: the ceiling of the decks it goes up through, where they're open over it
    if (tall > 1) {
      let open = base;
      for (let j = 1; j < tall; j++) open = intersect(open, layout(n + j).holes);
      for (const c of open) ceiling(k, kits.glow, c, y + tall * DECK_H - SLAB, lk, r);
    }
    // up top, a roof over what has nothing over it (seen from the shore, and from higher up)
    if (top && !r.out) {
      const bare = above ? subtract(subtract(base, aboveRooms), above.holes) : base;
      for (const [x0, z0, x1, z1] of bare) {
        kits.outside.flat(x0 - WALL_T / 2, z0 - WALL_T / 2, x1 + WALL_T / 2, z1 + WALL_T / 2, y + DECK_H - 0.01, col(0xe6e6e2));
        box(x0, y + H_IN, z0, x1, y + DECK_H, z1);
      }
    }
  }

  // ── walls ──
  const W = walls(L);
  for (const w of W) wall(kits, w, y, n, top, solid, box, L, look);
  // the heads over doorways, and the jambs either side
  for (const r of L.rooms) lintels(kitFor(r), r, L, y);
  // rails round the holes in the floor
  for (const [x0, z0, x1, z1] of L.wells) wellRail(kits, x0, z0, x1, z1, y, solid, n);
  // solid blocks (under the stairs, the funnel's casing)
  for (const [x0, z0, x1, z1, h] of L.blocks) {
    if (h <= 0) continue;
    rectSolid(x0, z0, x1, z1, y, y + h);
    const k = top ? kits.outside : kits.inside;
    k.box(x0, y, z0, x1, y + Math.min(h, H_IN), z1, col(h > 3 ? 0xe8e8e4 : 0xd8d0c0), 'y-');
    box(x0, y, z0, x1, y + h, z1);
  }

  // ── stairs ──
  for (const c of CORES) {
    if (n > c.top) continue;
    stairs(kits.inside, c.z, 0, n, c.top, solid, box);
  }

  // ── what's in the rooms ──
  for (const r of L.rooms) furnish(r, { n, y, kits, solid, rectSolid, box, seed, look, L });

  // ── doors ──
  const doors = visual ? makeDoors(L, y, materials, object) : { list: L.doors.map((d, key) => ({ ...d, key, y, open: 0 })), set() {} };

  // into meshes
  const mats = { inside: materials.inside, outside: materials.outside, glow: materials.glow, glass: materials.glass, teak: materials.teak, water: materials.water };
  for (const k of KITS) {
    if (!visual || kits[k].empty) continue;
    const mesh = new THREE.Mesh(kits[k].build(k === 'teak'), mats[k]);
    mesh.castShadow = k === 'outside' || (k === 'inside' && top);
    mesh.receiveShadow = k !== 'glow' && k !== 'glass';
    if (k === 'glass' || k === 'water') mesh.renderOrder = 2;
    mesh.name = `deck-${n}-${k}`;
    object.add(mesh);
  }

  return {
    n,
    object,
    solids,
    blockers,
    doors: doors.list,
    set: doors.set,
    doorSolid: (d) => doorSolid(d, y),
    dispose() {
      object.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh) o.geometry.dispose();
      });
    },
  };
}

// ── Floors ───────────────────────────────────────────────────────────────────

function floorQuads(kits, kind, x0, z0, x1, z1, y, r, look) {
  if (kind === 'marble') {
    // big tiles, in two shades
    const T = 1.2;
    for (let z = z0; z < z1 - 1e-3; z += T) {
      for (let x = x0; x < x1 - 1e-3; x += T) {
        const i = Math.floor((x + 100) / T) + Math.floor((z + 400) / T);
        kits.inside.flat(x, z, Math.min(x1, x + T), Math.min(z1, z + T), y, MARBLE[i & 1]);
      }
    }
    return;
  }
  if (kind === 'teak') {
    // planks along her: the teak kit has its own texture of them, uv in metres
    const k = kits.teak;
    k.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], TEAK[0], [x0 / 4, z1 / 4, x1 / 4, z0 / 4]);
    return;
  }
  let c = col(kind);
  if (r.kind === 'cabin' && look.cabins) {
    const s = look.cabins(r.cabin);
    if (s) c = col(s.palette.carpet);
  }
  const k = r.out ? kits.outside : kits.inside;
  k.flat(x0, z0, x1, z1, y, c);
  // a running track's lanes
  if (r.kind === 'track') {
    for (const lx of [-15.5, -14.3, 14.3, 15.5]) if (lx > x0 && lx < x1) k.flat(lx - 0.04, z0, lx + 0.04, z1, y + 0.004, col(0xf2f2ee));
  }
}

// ── Ceilings ─────────────────────────────────────────────────────────────────

function ceiling(k, glow, [x0, z0, x1, z1], h, lk, r) {
  k.flat(x0, z0, x1, z1, h, col(lk.ceil ?? 0xf0ece4), true);
  if (r.out && r.kind !== 'promenade' && r.kind !== 'lido' && r.kind !== 'splash') return;
  // lights let into it
  const S = r.kind === 'cabin' || r.kind === 'corridor' || r.kind === 'passage' ? 2.6 : 3.2;
  const sz = r.kind === 'club' || r.kind === 'theatre' ? 0.12 : 0.28;
  const light = r.kind === 'club' ? col(0x8a4aff) : r.kind === 'casino' ? col(0xffd890) : NIGHT_SIGN;
  for (let z = z0 + S / 2; z < z1; z += S) {
    for (let x = x0 + S / 2; x < x1; x += S) {
      if (x1 - x < 0.4 || z1 - z < 0.4) continue;
      glow.flat(x - sz, z - sz, x + sz, z + sz, h - 0.01, light, true);
    }
  }
}

// ── Walls ────────────────────────────────────────────────────────────────────

// Where the windows go in a run of her side: [[from, to]] along it (m).
function windowsIn(w, len) {
  const r = w.room;
  if (r.kind === 'cabin') {
    // one, the middle of the outer wall (the balcony ones have a door instead)
    const ww = Math.min(1.8, len - 0.8);
    return ww > 0.6 ? [[(len - ww) / 2, (len + ww) / 2]] : [];
  }
  if (r.kind === 'theatre' || r.kind === 'stage' || r.kind === 'club' || r.kind === 'casino') return [];
  const out = [];
  const P = 3;
  const ww = 2;
  for (let a = (len % P) / 2 + (P - ww) / 2; a + ww <= len - 0.3; a += P) out.push([a, a + ww]);
  return out;
}
const SILL = 0.75;
const HEAD = 2.1;

function wall(kits, w, y, n, top, solid, box, L, look) {
  const r = w.room;
  const lk = lookOf(r);
  const ux = w.x1 - w.x0;
  const uz = w.z1 - w.z0;
  const len = Math.hypot(ux, uz);
  if (len < 0.05) return;
  const dx = ux / len;
  const dz = uz / len;
  const tall = r.up ? r.up : H_IN;
  const inset = WALL_T / 2 + (n > 4 && n <= 6 ? 0.012 : 0);
  const k = r.out ? kits.outside : kits.inside;
  let wc = col(lk.wall);
  if (r.kind === 'cabin' && look.cabins) {
    const s = look.cabins(r.cabin);
    if (s) wc = col(s.palette.wall);
  }
  // A strip of wall along the run from a to b (m), y0 to y1 over the floor.
  const strip = (kit, a, b, y0, y1, c, off = inset) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return;
    const m = (a + b) / 2;
    kit.panel(w.x0 + dx * m + w.nx * off, y + (y0 + y1) / 2, w.z0 + dz * m + w.nz * off, w.nx, w.nz, b - a, y1 - y0, c);
  };

  if (w.kind === 'glass') {
    // a pane from floor to ceiling, solid
    const mx = (w.x0 + w.x1) / 2 + w.nx * inset;
    const mz = (w.z0 + w.z1) / 2 + w.nz * inset;
    kits.glass.panel(mx, y + tall / 2, mz, w.nx, w.nz, len, tall, col(0x9cc4d4));
    kits.glass.panel(mx, y + tall / 2, mz, -w.nx, -w.nz, len, tall, col(0x9cc4d4));
    k.box(Math.min(w.x0, w.x1) + w.nx * inset - 0.03, y, Math.min(w.z0, w.z1) + w.nz * inset - 0.03, Math.max(w.x0, w.x1) + w.nx * inset + 0.03, y + 0.1, Math.max(w.z0, w.z1) + w.nz * inset + 0.03, STEEL);
    solid(w.x0, w.z0, w.x1, w.z1, WALL_T / 2 + 0.03, y, y + tall);
    return;
  }
  if (w.kind === 'rail') {
    if (OUTSIDE.has(r.kind)) {
      // drawn with her outside; only what's solid here
    } else {
      railing(kits, w.x0, w.z0, w.x1, w.z1, y, w.nx, w.nz);
      // up top, the edge of the deck under the rail, seen from outside
      if (top) {
        const mx = (w.x0 + w.x1) / 2 - w.nx * 0.02;
        const mz = (w.z0 + w.z1) / 2 - w.nz * 0.02;
        kits.outside.panel(mx, y - SLAB / 2, mz, -w.nx, -w.nz, len, SLAB, col(0xf2f2ee));
      }
    }
    solid(w.x0, w.z0, w.x1, w.z1, 0.08, y, y + RAIL_SOLID);
    box(Math.min(w.x0, w.x1) - 0.05, y, Math.min(w.z0, w.z1) - 0.05, Math.max(w.x0, w.x1) + 0.05, y + RAIL_H, Math.max(w.z0, w.z1) + 0.05);
    return;
  }

  // solid from the floor to the ceiling
  solid(w.x0, w.z0, w.x1, w.z1, WALL_T / 2 + 0.03, y, y + tall);
  box(Math.min(w.x0, w.x1) - WALL_T / 2, y, Math.min(w.z0, w.z1) - WALL_T / 2, Math.max(w.x0, w.x1) + WALL_T / 2, y + tall, Math.max(w.z0, w.z1) + WALL_T / 2);
  if (OUTSIDE.has(r.kind)) return;

  const bottom = r.out ? 0 : -SLAB;
  const wins = w.kind === 'hull' ? windowsIn(w, len) : [];
  const dado = lk.dado != null && !r.up ? 1.0 : 0;
  const draw = (a, b, y0, y1) => {
    if (dado && y0 < dado) {
      strip(k, a, b, y0, Math.min(dado, y1), col(lk.dado));
      strip(k, a, b, Math.min(dado, y1), y1, wc);
    } else strip(k, a, b, y0, y1, wc);
  };
  let from = 0;
  for (const [a, b] of wins) {
    draw(from, a, bottom, tall);
    draw(a, b, bottom, SILL);
    draw(a, b, HEAD, tall);
    // the hull's thickness round the window: sill, head and sides
    const reveal = HULL_T + 0.02;
    const cx = (s) => w.x0 + dx * s;
    const cz = (s) => w.z0 + dz * s;
    for (const [yy, ny] of [
      [SILL, 1],
      [HEAD, -1],
    ]) {
      const x0 = cx(a) + w.nx * inset;
      const z0 = cz(a) + w.nz * inset;
      const x1 = cx(b) - w.nx * reveal;
      const z1 = cz(b) - w.nz * reveal;
      if (ny > 0) k.flat(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y + yy, col(0xf4f2ee));
      else k.flat(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y + yy, col(0xf4f2ee), true);
    }
    for (const [s, sgn] of [
      [a, 1],
      [b, -1],
    ]) {
      const px = cx(s) + (w.nx * (inset - reveal)) / 2;
      const pz = cz(s) + (w.nz * (inset - reveal)) / 2;
      k.panel(px, y + (SILL + HEAD) / 2, pz, dx * sgn, dz * sgn, inset + reveal, HEAD - SILL, col(0xf4f2ee));
    }
    // up top there's no hull over these: the glass is here
    if (top) {
      const m = (a + b) / 2;
      kits.glass.panel(cx(m) - w.nx * 0.05, y + (SILL + HEAD) / 2, cz(m) - w.nz * 0.05, -w.nx, -w.nz, b - a, HEAD - SILL, col(0x8ab0c4));
      kits.glass.panel(cx(m) - w.nx * 0.05, y + (SILL + HEAD) / 2, cz(m) - w.nz * 0.05, w.nx, w.nz, b - a, HEAD - SILL, col(0x8ab0c4));
    }
    from = b;
  }
  draw(from, len, bottom, tall);

  // a handrail along a corridor
  if (r.kind === 'corridor' || r.kind === 'passage') {
    const off = inset + 0.07;
    kits.inside.box(Math.min(w.x0, w.x1) + w.nx * off - 0.025, y + 0.86, Math.min(w.z0, w.z1) + w.nz * off - 0.025, Math.max(w.x0, w.x1) + w.nx * off + 0.025, y + 0.92, Math.max(w.z0, w.z1) + w.nz * off + 0.025, RAIL_TOP);
  }
  // up top, a wall with nothing the other side of it is her outside: face it outward too
  if (top) {
    const ox = (w.x0 + w.x1) / 2 - w.nx * 0.5;
    const oz = (w.z0 + w.z1) / 2 - w.nz * 0.5;
    const beyond = L.rooms.some((m) => m !== r && ox >= m.x0 && ox <= m.x1 && oz >= m.z0 && oz <= m.z1);
    if (!beyond) {
      let a = 0;
      const out = kits.outside;
      const face = (p, q, y0, y1) => strip(out, p, q, y0, y1, col(0xeeeeea), -inset);
      for (const [p, q] of wins) {
        face(a, p, -SLAB, DECK_H);
        face(p, q, -SLAB, SILL);
        face(p, q, HEAD, DECK_H);
        a = q;
      }
      face(a, len, -SLAB, DECK_H);
    }
  }
}

// The heads over a room's doorways, and the jambs either side of each.
function lintels(k, r, L, y) {
  if (OUTSIDE.has(r.kind) || r.kind === 'sill') return;
  const lk = lookOf(r);
  const tall = r.up ? r.up : H_IN;
  const E = 0.06;
  const sides = [
    ['x0', r.x0, 1, 0],
    ['x1', r.x1, -1, 0],
    ['z0', r.z0, 0, 1],
    ['z1', r.z1, 0, -1],
  ];
  for (const [name, at, nx, nz] of sides) {
    if (r.open && r.open.includes(name)) continue;
    const alongZ = nx !== 0;
    for (const o of L.openings) {
      const on = alongZ ? o[0] - E <= at && o[2] + E >= at : o[1] - E <= at && o[3] + E >= at;
      if (!on) continue;
      const lo = alongZ ? Math.max(o[1], r.z0) : Math.max(o[0], r.x0);
      const hi = alongZ ? Math.min(o[3], r.z1) : Math.min(o[2], r.x1);
      if (hi - lo < 0.05) continue;
      const m = (lo + hi) / 2;
      const inset = WALL_T / 2;
      const px = alongZ ? at + nx * inset : m;
      const pz = alongZ ? m : at + nz * inset;
      const wc = col(lk.wall);
      if (hi - lo <= LINTEL_MOST && !r.out) k.panel(px, y + (DOOR_HEAD + tall) / 2, pz, nx, nz, hi - lo, tall - DOOR_HEAD, wc);
      // the jambs: across the wall's half-thickness on this side
      const jh = hi - lo <= LINTEL_MOST && !r.out ? DOOR_HEAD : tall;
      for (const [s, sgn] of [
        [lo, 1],
        [hi, -1],
      ]) {
        const jx = alongZ ? at + (nx * inset) / 2 : s;
        const jz = alongZ ? s : at + (nz * inset) / 2;
        k.panel(jx, y + jh / 2, jz, alongZ ? 0 : sgn, alongZ ? sgn : 0, inset, jh, wc);
      }
      // and the underside of the head
      if (hi - lo <= LINTEL_MOST && !r.out) {
        if (alongZ) k.flat(Math.min(at, at + nx * inset), lo, Math.max(at, at + nx * inset), hi, y + DOOR_HEAD, wc, true);
        else k.flat(lo, Math.min(at, at + nz * inset), hi, Math.max(at, at + nz * inset), y + DOOR_HEAD, wc, true);
      }
    }
  }
}

// A railing out on deck: glass panels between posts, a teak rail on top.
export function railing(kits, x0, z0, x1, z1, y, nx, nz) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.05) return;
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  const off = 0.04;
  kits.glass.panel((x0 + x1) / 2 + nx * off, y + 0.55, (z0 + z1) / 2 + nz * off, nx, nz, len, 0.95, col(0x9cc4d4));
  kits.glass.panel((x0 + x1) / 2 + nx * off, y + 0.55, (z0 + z1) / 2 + nz * off, -nx, -nz, len, 0.95, col(0x9cc4d4));
  const t = 0.05;
  kits.outside.box(Math.min(x0, x1) - t + nx * off, y + RAIL_H - 0.06, Math.min(z0, z1) - t + nz * off, Math.max(x0, x1) + t + nx * off, y + RAIL_H, Math.max(z0, z1) + t + nz * off, RAIL_TOP);
  const posts = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= posts; i++) {
    const s = (i / posts) * len;
    const px = x0 + dx * s + nx * off;
    const pz = z0 + dz * s + nz * off;
    kits.outside.box(px - 0.025, y, pz - 0.025, px + 0.025, y + RAIL_H - 0.06, pz + 0.025, STEEL);
  }
}

function wellRail(kits, x0, z0, x1, z1, y, solid, n) {
  const k = { glass: kits.glass, outside: n >= TOP_DECKS ? kits.outside : kits.inside };
  const sides = x1 - x0 < 0.3 || z1 - z0 < 0.3 ? [[x0, (z0 + z1) / 2, x1, (z0 + z1) / 2]] : [
    [x0, z0, x1, z0],
    [x1, z0, x1, z1],
    [x1, z1, x0, z1],
    [x0, z1, x0, z0],
  ];
  if (x1 - x0 < 0.3) sides[0] = [(x0 + x1) / 2, z0, (x0 + x1) / 2, z1];
  for (const [a, b, c, d] of sides) {
    const len = Math.hypot(c - a, d - b);
    const nx = len ? -(d - b) / len : 0;
    const nz = len ? (c - a) / len : 0;
    railing(k, a, b, c, d, y, nx, nz);
    solid(a, b, c, d, 0.08, y, y + WELL_SOLID);
  }
}

// ── Stairs ───────────────────────────────────────────────────────────────────

// The staircase of a core at z from deck n up, tread by tread, and the wall
// between its two flights; x: across her, its middle.
export function stairs(k, z, x, n, coreTop, solid, box, base = null, turns = 1) {
  const S = CORE.stair;
  const treadC = col(0x6a5a4a);
  const nose = BRASS;
  const y0 = base ?? deckY(n);
  for (let t = 0; t < turns; t++) {
    const yb = y0 + t * DECK_H;
    if (base === null && n >= coreTop) break;
    const list = base === null ? flights({ z, top: coreTop }, n) : flightsAt(x, z, yb);
    for (const f of list) {
      if (f.landing) {
        k.box(f.x0, f.top - 0.25, f.z0, f.x1, f.top, f.z1, treadC);
        const r = (f.z1 - f.z0) / 2;
        solid(f.x0 + r, (f.z0 + f.z1) / 2, f.x1 - r, (f.z0 + f.z1) / 2, r + 0.02, f.top - 0.3, f.top, { surface: 'carpet' });
        box(f.x0, f.top - 0.25, f.z0, f.x1, f.top, f.z1);
        continue;
      }
      // a tread and its riser, and the stringer under it
      k.box(f.x0, f.top - 1 / 6, f.z0, f.x1, f.top, f.z1, treadC, 'y-');
      k.box(f.x0, f.top - 0.02, f.flight === 1 ? f.z1 - 0.03 : f.z0, f.x1, f.top + 0.005, f.flight === 1 ? f.z1 : f.z0 + 0.03, nose);
      const r = (f.z1 - f.z0) / 2 + 0.02;
      solid(f.x0 + r, (f.z0 + f.z1) / 2, f.x1 - r, (f.z0 + f.z1) / 2, r, f.top - 0.35, f.top, { surface: 'carpet' });
    }
    // under each flight, a sloping soffit
    for (const [xa, xb, za, zb, ya, yb2] of [
      [x + S.gap, x + S.half, z + S.top, z + S.mid, yb, yb + DECK_H / 2],
      [x - S.half, x - S.gap, z + S.mid, z + S.top, yb + DECK_H / 2, yb + DECK_H],
    ]) {
      const d = 0.25;
      k.face([xa, ya - d, za], [xb, ya - d, za], [xb, yb2 - d, zb], [xa, yb2 - d, zb], col(0xe0d8c8));
    }
    // the wall between the flights, and a brass rail along its top
    k.box(x - S.gap, yb - SLAB, z + S.mid, x + S.gap, yb + DECK_H - SLAB, z + S.top, col(0xe0d8c8));
    solid(x, z + S.mid, x, z + S.top, S.gap + 0.05, yb - 0.4, yb + DECK_H - SLAB);
    box(x - S.gap, yb - 0.4, z + S.mid, x + S.gap, yb + DECK_H - SLAB, z + S.top);
    // a rail up the outer side of each flight
    k.rod([x + S.half - 0.06, yb + 0.95, z + S.top], [x + S.half - 0.06, yb + DECK_H / 2 + 0.95, z + S.mid], 0.025, nose);
    k.rod([x - S.half + 0.06, yb + DECK_H / 2 + 0.95, z + S.mid], [x - S.half + 0.06, yb + DECK_H + 0.95, z + S.top], 0.025, nose);
  }
}

function flightsAt(x, z, y) {
  // the same as a core's, set at (x, z), from y
  const S = CORE.stair;
  const rise = DECK_H / 2 / S.risers;
  const run = (S.top - S.mid) / (S.risers - 1);
  const out = [];
  for (let i = 1; i < S.risers; i++) {
    const za = z + S.top - (i - 1) * run;
    out.push({ x0: x + S.gap, z0: za - run, x1: x + S.half, z1: za, top: y + i * rise, flight: 1 });
  }
  out.push({ x0: x - S.half, z0: z + S.back, x1: x + S.half, z1: z + S.mid, top: y + DECK_H / 2, landing: true });
  for (let i = 1; i < S.risers; i++) {
    const za = z + S.mid + (i - 1) * run;
    out.push({ x0: x - S.half, z0: za, x1: x - S.gap, z1: za + run, top: y + DECK_H / 2 + i * rise, flight: 2 });
  }
  return out;
}

// ── Doors ────────────────────────────────────────────────────────────────────

const DOOR_H = 2.1;
const LEAF_T = 0.045;

function makeDoors(L, y, materials, object) {
  const kinds = { cabin: [], lift: [], glass: [] };
  for (const d of L.doors) kinds[d.kind]?.push(d);
  const list = [];
  const meshes = {};
  const geo = {
    cabin: new THREE.BoxGeometry(1, DOOR_H, LEAF_T),
    lift: new THREE.BoxGeometry(1, DOOR_H, 0.04),
    glass: new THREE.BoxGeometry(1, DOOR_H, 0.03),
  };
  const mat = { cabin: materials.door, lift: materials.steel, glass: materials.glass };
  for (const kind of Object.keys(kinds)) {
    const ds = kinds[kind];
    if (!ds.length) continue;
    const leaves = kind === 'cabin' ? 1 : 2;
    const mesh = new THREE.InstancedMesh(geo[kind], mat[kind], ds.length * leaves);
    mesh.name = `doors-${kind}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (kind === 'glass') mesh.renderOrder = 2;
    meshes[kind] = mesh;
    object.add(mesh);
    ds.forEach((d, i) => {
      const door = { ...d, key: L.doors.indexOf(d), mesh, index: i * leaves, leaves, open: 0, y };
      list.push(door);
      place(door, 0);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { list, set: (door, open) => place(door, open) };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Put a door's leaves where open (0 shut .. 1 open) has them. A leaf is a
// box whose width lies along its own x; turned by θ about the up axis, that
// points along (cos θ, −sin θ).
const along = (dx, dz) => Math.atan2(-dz, dx);
function place(door, open) {
  door.open = open;
  const { mesh, index, w, x, z, nx, nz, y } = door;
  // the wall it's in runs along (ux, uz)
  const ux = -nz;
  const uz = nx;
  if (door.kind === 'cabin') {
    // hinged at one end, swinging in (the way nx, nz points), most of the way round
    const phi = open * 1.6;
    const dx = ux * Math.cos(phi) + nx * Math.sin(phi);
    const dz = uz * Math.cos(phi) + nz * Math.sin(phi);
    const hx = x - (ux * w) / 2;
    const hz = z - (uz * w) / 2;
    _p.set(hx + (dx * w) / 2, y + DOOR_H / 2, hz + (dz * w) / 2);
    _q.setFromAxisAngle(_up, along(dx, dz));
    _s.set(w - 0.04, 1, 1);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(index, _m);
  } else {
    // two leaves sliding apart into the wall
    const half = w / 2;
    for (let k = 0; k < 2; k++) {
      const sgn = k === 0 ? -1 : 1;
      const c = (half / 2 + open * half * 0.95) * sgn;
      _p.set(x + ux * c, y + DOOR_H / 2, z + uz * c);
      _q.setFromAxisAngle(_up, along(ux, uz));
      _s.set(half, 1, 1);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(index + k, _m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

// What fills a door shut: a capsule across it.
function doorSolid(d, y) {
  const ux = -d.nz;
  const uz = d.nx;
  const h = d.w / 2;
  return { ax: d.x - ux * h, az: d.z - uz * h, bx: d.x + ux * h, bz: d.z + uz * h, r: 0.12, bottom: y, topA: y + DOOR_H, topB: y + DOOR_H };
}

