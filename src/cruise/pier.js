// The pier she lies alongside, the trestle out to it from the land, the
// cruise terminal on it, and the gangway up to the door in her side.
//
//   the trestle    a road on piles, straight out from the land to the pier
//                  head, with lamps along it and a rail each side
//   the pier head  a long concrete apron along her port side, fenders on its
//                  face, bollards along its edge with her mooring lines made
//                  fast to them
//   the terminal   a long low building of glass and white panels, the line's
//                  name on its roof
//   the gangway    a covered ramp up along the pier to a landing level with
//                  deck 4, and a short bridge across into her
//
// Everything is in the ship's frame (plan.js; site.js says where the pier
// is in it), round her origin at the waterline. Nothing about the land
// changes for it: the piles go down to the ground as it is.
//
//   buildPier(site, ground, { materials }) -> { object, solids, blockers }
//   ground(x, z) -> the height of the ground under (x, z) of her frame,
//   over her waterline

import * as THREE from 'three';
import { ShipKit } from './kit.js';
import { PIER, TRESTLE, TERMINAL, GANGWAY } from './site.js';
import { deckY, HALF_BEAM, SHIP } from './plan.js';
import { hullWidth } from './hull.js';
import { railing, RAIL_SOLID } from './decks.js';

const col = (hex) => new THREE.Color(hex);
const CONCRETE = col(0xb4b0a8);
const CONCRETE_DARK = col(0x8a8680);
const ASPHALT = col(0x4a4a4e);
const YELLOW = col(0xe8c030);
const BLACK = col(0x1e1e22);
const WHITE = col(0xeeeeea);
const STEEL = col(0x8a9098);
const BLUE = col(0x1e4a7a);
const GLASS = col(0x6a8a9a);
const LAMP = col(0xfff0c8);
const SLAB_T = 0.8; // m: the pier's deck, thick
const PILE_STEP = 9; // m between piles
const RAMP_W = 2;
const LANDING = { x0: PIER.x0, x1: GANGWAY.x1 + 0.2 };

export function buildPier(site, ground, { materials }) {
  const kits = { outside: new ShipKit(), glass: new ShipKit(), glow: new ShipKit() };
  const k = kits.outside;
  const solids = [];
  const blockers = [];
  const top = PIER.up;
  const solid = (ax, az, bx, bz, r, bottom, t, extra) => solids.push({ ax, az, bx, bz, r, bottom, topA: t, topB: t, ...extra });
  const rect = (x0, z0, x1, z1, bottom, t, extra) => {
    const alongX = x1 - x0 >= z1 - z0;
    const short = alongX ? z1 - z0 : x1 - x0;
    const n = Math.max(1, Math.round(short / 1.2));
    const r = short / n / 2;
    for (let i = 0; i < n; i++) {
      const c = (alongX ? z0 : x0) + r * (2 * i + 1);
      if (alongX) solid(x0 + r, c, Math.max(x0 + r, x1 - r), c, r + 0.02, bottom, t, extra);
      else solid(c, z0 + r, c, Math.max(z0 + r, z1 - r), r + 0.02, bottom, t, extra);
    }
  };

  // ── the pier head ──
  k.box(PIER.x0, top - SLAB_T, PIER.z0, PIER.x1, top, PIER.z1, CONCRETE);
  rect(PIER.x0, PIER.z0, PIER.x1, PIER.z1, top - SLAB_T, top, { surface: 'tarmac' });
  blockers.push([PIER.x0, top - SLAB_T, PIER.z0, PIER.x1, top, PIER.z1]);
  // a yellow line along its edge, and the fenders on its face
  k.flat(PIER.x0 + 0.6, PIER.z0, PIER.x0 + 0.75, PIER.z1, top + 0.005, YELLOW);
  for (let z = PIER.z0 + 4; z < PIER.z1 - 2; z += 8) {
    k.box(PIER.x0 - 0.5, top - 2.4, z - 1, PIER.x0, top - 0.2, z + 1, BLACK);
  }
  // piles under it, down to the bed
  for (let z = PIER.z0 + 2; z <= PIER.z1 - 2; z += PILE_STEP) {
    for (let x = PIER.x0 + 1.5; x <= PIER.x1 - 1; x += 6.5) {
      const g = ground(x, z);
      k.cyl(x, Math.min(g, top - SLAB_T) - 0.5, z, top - SLAB_T, 0.45, CONCRETE_DARK, 8, 0.45, false);
    }
  }
  // bollards along the edge, and her mooring lines made fast to them
  const lines = [
    [-104, -138, 10.5],
    [-90, -128, 10.5],
    [-60, -96, 11],
    [62, 96, 11],
    [80, 118, 11.5],
    [86, 130, 12],
  ];
  for (let z = PIER.z0 + 6; z < PIER.z1 - 3; z += 14) {
    k.cyl(PIER.x0 + 1.4, top, z, top + 0.55, 0.28, BLACK, 10);
    k.cyl(PIER.x0 + 1.4, top + 0.55, z, top + 0.7, 0.4, BLACK, 10);
    solid(PIER.x0 + 1.4, z, PIER.x0 + 1.4, z, 0.35, top, top + 0.7);
  }
  for (const [bz, sz, sy] of lines) {
    const x = hullWidth(sz, sy);
    k.rod([PIER.x0 + 1.4, top + 0.6, bz], [x, sy, sz], 0.05, col(0x6a5a3a), 5);
  }
  // lamps along it
  for (let z = PIER.z0 + 10; z < PIER.z1; z += 25) lamp(kits, PIER.x1 - 1.2, top, z);

  // ── the terminal ──
  const T = TERMINAL;
  const th = 8;
  k.box(T.x0, top, T.z0, T.x1, top + 0.4, T.z1, CONCRETE_DARK);
  k.box(T.x0 + 0.5, top + 0.4, T.z0 + 0.5, T.x1 - 0.5, top + th, T.z1 - 0.5, WHITE);
  for (let z = T.z0 + 1.5; z < T.z1 - 1.5; z += 3) {
    for (const y0 of [top + 1, top + 4.6]) {
      kits.glass.panel(T.x0 + 0.48, y0 + 1.3, z + 1, -1, 0, 2.6, 2.8, GLASS);
      kits.glass.panel(T.x1 - 0.48, y0 + 1.3, z + 1, 1, 0, 2.6, 2.8, GLASS);
    }
  }
  k.box(T.x0, top + th, T.z0, T.x1, top + th + 0.5, T.z1, BLUE);
  k.words(SHIP.line.toUpperCase(), T.x0 - 0.02, top + th - 1.2, (T.z0 + T.z1) / 2, -1, 0, 0.32, BLUE);
  k.words('CRUISE TERMINAL', T.x1 + 0.02, top + th - 1.2, (T.z0 + T.z1) / 2, 1, 0, 0.32, BLUE);
  rect(T.x0, T.z0, T.x1, T.z1, top, top + th + 0.5);
  blockers.push([T.x0, top, T.z0, T.x1, top + th + 0.5, T.z1]);

  // ── the trestle ──
  const tx0 = PIER.x1;
  const tx1 = site.land + 2;
  k.box(tx0, top - 0.6, -TRESTLE.half, tx1, top, TRESTLE.half, ASPHALT, '');
  k.flat(tx0, -0.08, tx1, 0.08, top + 0.005, WHITE);
  rect(tx0 - 0.5, -TRESTLE.half, tx1, TRESTLE.half, top - 0.6, top, { surface: 'tarmac', step: 0.42 });
  blockers.push([tx0, top - 0.6, -TRESTLE.half, tx1, top, TRESTLE.half]);
  for (const s of [1, -1]) {
    railing(kits, tx0, s * TRESTLE.half, tx1, s * TRESTLE.half, top, 0, -s);
    solid(tx0, s * TRESTLE.half, tx1, s * TRESTLE.half, 0.08, top, top + RAIL_SOLID);
    for (let x = tx0 + 8; x < tx1 - 4; x += 24) lamp(kits, x, top, s * (TRESTLE.half - 0.4));
  }
  for (let x = tx0 + 4; x < tx1 - 2; x += PILE_STEP) {
    for (const z of [-TRESTLE.half + 1, TRESTLE.half - 1]) {
      const g = ground(x, z);
      if (g > top - 0.8) continue;
      k.cyl(x, g - 0.5, z, top - 0.6, 0.4, CONCRETE_DARK, 8, 0.4, false);
    }
  }
  // an arch over the land end of it, with her name on
  const ax = tx1 - 3;
  for (const s of [1, -1]) k.box(ax - 0.3, top, s * (TRESTLE.half + 0.2) - 0.3, ax + 0.3, top + 6, s * (TRESTLE.half + 0.2) + 0.3, BLUE);
  k.box(ax - 0.3, top + 5, -TRESTLE.half - 0.5, ax + 0.3, top + 6.2, TRESTLE.half + 0.5, BLUE);
  k.words(`${SHIP.name} · ${SHIP.line.toUpperCase()}`, ax + 0.32, top + 5.6, 0, 1, 0, 0.09, WHITE);
  k.words(`${SHIP.name} · ${SHIP.line.toUpperCase()}`, ax - 0.32, top + 5.6, 0, -1, 0, 0.09, WHITE);

  // ── the gangway ──
  gangway(kits, solid, rect, blockers, solids);

  const object = new THREE.Group();
  object.name = 'pier';
  const mats = { outside: materials.outside, glass: materials.glass, glow: materials.glow };
  for (const name of Object.keys(kits)) {
    if (kits[name].empty) continue;
    const mesh = new THREE.Mesh(kits[name].build(), mats[name]);
    mesh.castShadow = name === 'outside';
    mesh.receiveShadow = name === 'outside';
    if (name === 'glass') mesh.renderOrder = 2;
    object.add(mesh);
  }
  return {
    object,
    solids,
    blockers,
    dispose() {
      object.traverse((o) => o.isMesh && o.geometry.dispose());
    },
  };
}

function lamp(kits, x, y, z) {
  kits.outside.cyl(x, y, z, y + 6, 0.08, STEEL, 6, 0.06);
  kits.outside.box(x - 0.5, y + 6, z - 0.12, x + 0.1, y + 6.15, z + 0.12, STEEL);
  kits.glow.box(x - 0.45, y + 5.95, z - 0.1, x - 0.05, y + 6, z + 0.1, LAMP);
}

// A ramp up along the pier, a landing at the top level with deck 4, and a
// bridge across into the door in her side; a roof over all of it.
function gangway(kits, solid, rect, blockers, solids) {
  const k = kits.outside;
  const top = PIER.up;
  const y4 = deckY(4);
  const G = GANGWAY;
  const xm = (G.x0 + G.x1) / 2;
  // the ramp: rising from the foot (forward) to the head (aft)
  k.face([G.x0, top + 0.05, G.foot], [G.x1, top + 0.05, G.foot], [G.x1, y4, G.head], [G.x0, y4, G.head], col(0x5a5a60));
  k.face([G.x0, top - 0.2, G.foot], [G.x0, y4 - 0.25, G.head], [G.x1, y4 - 0.25, G.head], [G.x1, top - 0.2, G.foot], STEEL);
  solids.push({ ax: xm, az: G.foot + 0.5, bx: xm, bz: G.head, r: RAMP_W / 2, bottom: top - 0.5, topA: top + 0.1, topB: y4, surface: 'boards', step: 0.4 });
  for (const s of [-1, 1]) {
    const x = s < 0 ? G.x0 : G.x1;
    k.rod([x, top + 1.1, G.foot], [x, y4 + 1.1, G.head], 0.035, STEEL);
    solids.push({ ax: x, az: G.foot, bx: x, bz: G.head, r: 0.06, bottom: top, topA: top + RAIL_SOLID, topB: y4 + RAIL_SOLID });
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const z = G.foot + (G.head - G.foot) * t;
      const yy = top + (y4 - top) * t;
      k.box(x - 0.03, yy, z - 0.03, x + 0.03, yy + 1.1, z + 0.03, STEEL);
      // legs down to the pier
      if (yy > top + 0.6) k.box(x - 0.08, top, z - 0.08, x + 0.08, yy, z + 0.08, STEEL);
    }
  }
  // the landing at the top, and the bridge across
  const [lz0, lz1] = G.landing;
  k.box(LANDING.x0, y4 - 0.25, lz0, LANDING.x1, y4, lz1, col(0x5a5a60));
  rect(LANDING.x0, lz0, LANDING.x1, lz1, y4 - 0.3, y4, { surface: 'boards' });
  for (const [x, z] of [
    [LANDING.x0 + 0.1, lz0 + 0.1],
    [LANDING.x1 - 0.1, lz0 + 0.1],
    [LANDING.x1 - 0.1, lz1 - 0.1],
  ])
    k.box(x - 0.1, top, z - 0.1, x + 0.1, y4, z + 0.1, STEEL);
  const [dz0, dz1] = G.door;
  const bx0 = HALF_BEAM - 0.6;
  k.box(bx0, y4 - 0.15, dz0 + 0.2, LANDING.x0, y4, dz1 - 0.2, col(0x5a5a60));
  rect(bx0, dz0 + 0.2, LANDING.x0 + 0.2, dz1 - 0.2, y4 - 0.3, y4, { surface: 'boards' });
  // rails round the landing (not where the ramp comes up, nor the bridge goes off)
  railing(kits, LANDING.x1, lz0, LANDING.x1, G.head - RAMP_W - 0.2, y4, -1, 0);
  solid(LANDING.x1, lz0, LANDING.x1, lz1, 0.08, y4, y4 + RAIL_SOLID);
  railing(kits, LANDING.x0, lz0, LANDING.x1, lz0, y4, 0, 1);
  solid(LANDING.x0, lz0, LANDING.x1, lz0, 0.08, y4, y4 + RAIL_SOLID);
  railing(kits, LANDING.x0, lz1, G.x0, lz1, y4, 0, -1);
  solid(LANDING.x0, lz1, G.x0 - 0.05, lz1, 0.08, y4, y4 + RAIL_SOLID);
  for (const z of [dz0 + 0.2, dz1 - 0.2]) {
    railing(kits, bx0 + 0.6, z, LANDING.x0, z, y4, 0, z < (dz0 + dz1) / 2 ? 1 : -1);
    solid(bx0 + 0.6, z, LANDING.x0, z, 0.06, y4, y4 + RAIL_SOLID);
  }
  // the roof over the ramp and the landing, white canvas on steel
  const ry = y4 + 2.6;
  k.face([G.x0 - 0.2, top + 2.6, G.foot], [G.x0 - 0.2, ry, G.head], [G.x1 + 0.2, ry, G.head], [G.x1 + 0.2, top + 2.6, G.foot], WHITE);
  k.face([G.x0 - 0.2, top + 2.6, G.foot], [G.x1 + 0.2, top + 2.6, G.foot], [G.x1 + 0.2, ry, G.head], [G.x0 - 0.2, ry, G.head], WHITE);
  k.box(bx0, ry, lz0, LANDING.x1, ry + 0.1, lz1, WHITE);
  // a sign at its foot
  k.box(xm - 0.05, top, G.foot + 1.6, xm + 0.05, top + 1.2, G.foot + 1.7, STEEL);
  k.panel(xm, top + 1.6, G.foot + 1.72, 0, 1, 1.6, 0.8, BLUE);
  k.words('ALL ABOARD', xm, top + 1.6, G.foot + 1.75, 0, 1, 0.035, WHITE);
  blockers.push([G.x0, top, G.head, G.x1, y4, G.foot]);
}

// While she isn't alongside, a chain across where the bridge goes off the
// landing to her door, and a sign on it. -> { object, solid } in her frame
// (the solid to be put in the world, the object shown, only then).
export function gangwayChain(materials) {
  const k = new ShipKit();
  const y4 = deckY(4);
  const [z0, z1] = GANGWAY.door;
  const x = LANDING.x0 + 0.1;
  for (const z of [z0, z1]) k.cyl(x, y4, z, y4 + 1.1, 0.05, YELLOW, 6);
  const sag = 0.25;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = z0 + ((z1 - z0) * i) / n;
    const b = z0 + ((z1 - z0) * (i + 1)) / n;
    const ya = y4 + 1.0 - sag * Math.sin((Math.PI * i) / n);
    const yb = y4 + 1.0 - sag * Math.sin((Math.PI * (i + 1)) / n);
    k.rod([x, ya, a], [x, yb, b], 0.025, i % 2 ? BLACK : YELLOW, 4);
  }
  k.panel(x + 0.03, y4 + 0.62, (z0 + z1) / 2, 1, 0, 0.9, 0.36, col(0xc82a2a));
  k.words('NO BOARDING', x + 0.05, y4 + 0.62, (z0 + z1) / 2, 1, 0, 0.018, WHITE);
  const object = new THREE.Mesh(k.build(), materials.outside);
  object.name = 'gangway-chain';
  return { object, solid: { ax: x, az: z0, bx: x, bz: z1, r: 0.12, bottom: y4, topA: y4 + 2, topB: y4 + 2 } };
}
