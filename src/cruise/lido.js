// The pools, the hot tubs, the slide tower and the slides: up on decks 14 and
// 15, seen from the shore as well as swum in.
//
//   a pool       a tiled tank let into the deck, its rim standing a little
//                over it (step up onto it, and in), steps down into the water
//                at its aft end; a hot tub likewise, with a bench round its
//                inside to sit on and climb out by
//   the tower    an open steel frame on the sun deck, a staircase going round
//                four times inside it to a platform with a canopy, where the
//                two slides start
//   the slides   the Corkscrew, an open red flume, and the Plunge, a closed
//                blue tube, on steel legs (slides.js has where they go)
//
// Everything is in the ship's frame (plan.js), round her origin.
//
//   buildLido({ materials }) -> {
//     object, solids, blockers (as decks.js's),
//     pools      [{ p (plan.js's), level, contains(x, z), bedAt(x, z) }] in
//                the ship's frame, for whoever makes them basins
//     starts     [{ slide, x, y, z, yaw }]: where each slide is got into
//   }

import * as THREE from 'three';
import { ShipKit } from './kit.js';
import { POOLS, poolBed, deckY, DECK_H, CORE, TOWER, towerPlatform, halfBeam, layout, floorStrips, TUB_BENCH } from './plan.js';
import { SLIDES, path } from './slides.js';
import { stairs, railing, RAIL_SOLID } from './decks.js';

const col = (hex) => new THREE.Color(hex);
const TILE = col(0x7ac8e0);
const TILE_DARK = col(0x4a9ac0);
const RIM = col(0xe8e6de);
const STEEL = col(0xc0c4ca);
const WATER = col(0x3aa8d0);
const RED = col(0xd8362a);
const BLUE = col(0x2a6ad8);

export function buildLido({ materials }) {
  const kits = { outside: new ShipKit(), glass: new ShipKit(), water: new ShipKit(), tube: new ShipKit(), glow: new ShipKit() };
  const solids = [];
  const blockers = [];
  const solid = (ax, az, bx, bz, r, bottom, top, extra) => solids.push({ ax, az, bx, bz, r, bottom, topA: top, topB: top, ...extra });
  const rect = (x0, z0, x1, z1, bottom, top, extra) => {
    const alongX = x1 - x0 >= z1 - z0;
    const short = alongX ? z1 - z0 : x1 - x0;
    const k = Math.max(1, Math.round(short / 1.1));
    const r = short / k / 2;
    for (let i = 0; i < k; i++) {
      const c = (alongX ? z0 : x0) + r * (2 * i + 1);
      if (alongX) solid(x0 + r, c, Math.max(x0 + r, x1 - r), c, r + 0.02, bottom, top, extra);
      else solid(c, z0 + r, c, Math.max(z0 + r, z1 - r), r + 0.02, bottom, top, extra);
    }
  };
  const pools = POOLS.map((p) => pool(kits, p, solid, rect));
  tower(kits, solid, rect, blockers);
  const starts = slides(kits, solid);
  bigScreen(kits);

  const object = new THREE.Group();
  object.name = 'lido';
  const mats = { outside: materials.outside, glass: materials.glass, water: materials.water, tube: materials.tube, glow: materials.glow };
  for (const k of Object.keys(kits)) {
    if (kits[k].empty) continue;
    const mesh = new THREE.Mesh(kits[k].build(), mats[k]);
    mesh.castShadow = k === 'outside' || k === 'tube';
    mesh.receiveShadow = k === 'outside';
    if (k === 'glass' || k === 'water' || k === 'tube') mesh.renderOrder = 2;
    mesh.name = `lido-${k}`;
    object.add(mesh);
  }
  return {
    object,
    solids,
    blockers,
    pools,
    starts,
    dispose() {
      object.traverse((o) => o.isMesh && o.geometry.dispose());
    },
  };
}

// ── A pool ───────────────────────────────────────────────────────────────────

function pool(kits, p, solid, rect) {
  const y = deckY(p.deck);
  const k = kits.outside;
  const rimTop = y + p.rim;
  const level = rimTop - p.free;
  const bottom = level - p.deep;
  const t = 0.3; // the rim's width
  // the rim, all round, and solid: step up onto it
  k.box(p.x0 - t, y, p.z0 - t, p.x1 + t, rimTop, p.z0, RIM, 'y-');
  k.box(p.x0 - t, y, p.z1, p.x1 + t, rimTop, p.z1 + t, RIM, 'y-');
  k.box(p.x0 - t, y, p.z0, p.x0, rimTop, p.z1, RIM, 'y-');
  k.box(p.x1, y, p.z0, p.x1 + t, rimTop, p.z1, RIM, 'y-');
  const step = p.rim + 0.08;
  for (const [ax, az, bx, bz] of [
    [p.x0 - t / 2, p.z0 - t / 2, p.x1 + t / 2, p.z0 - t / 2],
    [p.x0 - t / 2, p.z1 + t / 2, p.x1 + t / 2, p.z1 + t / 2],
    [p.x0 - t / 2, p.z0, p.x0 - t / 2, p.z1],
    [p.x1 + t / 2, p.z0, p.x1 + t / 2, p.z1],
  ])
    solid(ax, az, bx, bz, t / 2 + 0.02, y, rimTop, { step, surface: 'boards' });
  // the tank: tiled walls inside, down to its floor
  k.panel((p.x0 + p.x1) / 2, (bottom + rimTop) / 2, p.z0, 0, 1, p.x1 - p.x0, rimTop - bottom, TILE);
  k.panel((p.x0 + p.x1) / 2, (bottom + rimTop) / 2, p.z1, 0, -1, p.x1 - p.x0, rimTop - bottom, TILE);
  k.panel(p.x0, (bottom + rimTop) / 2, (p.z0 + p.z1) / 2, 1, 0, p.z1 - p.z0, rimTop - bottom, TILE);
  k.panel(p.x1, (bottom + rimTop) / 2, (p.z0 + p.z1) / 2, -1, 0, p.z1 - p.z0, rimTop - bottom, TILE);
  // its floor, with a dark line down each lane, and the steps or the bench
  const D = 0.5;
  for (let x = p.x0; x < p.x1 - 1e-3; x += D) {
    for (let z = p.z0; z < p.z1 - 1e-3; z += D) {
      const b = y + poolBed(p, x + D / 2, z + D / 2);
      const lane = !p.tub && Math.abs(((x + D / 2 - p.x0) % 2.5) - 1.25) < 0.26 && z > p.z0 + 2.5 && z < p.z1 - 1;
      k.flat(x, z, Math.min(p.x1, x + D), Math.min(p.z1, z + D), b, lane ? TILE_DARK : TILE);
    }
  }
  // what you stand on under the water: the floor, the treads, the bench
  rect(p.x0, p.z0, p.x1, p.z1, bottom - 0.3, bottom, { surface: 'boards' });
  if (p.tub) {
    const b = TUB_BENCH;
    for (const [x0, z0, x1, z1] of [
      [p.x0, p.z0, p.x1, p.z0 + b],
      [p.x0, p.z1 - b, p.x1, p.z1],
      [p.x0, p.z0 + b, p.x0 + b, p.z1 - b],
      [p.x1 - b, p.z0 + b, p.x1, p.z1 - b],
    ]) {
      rect(x0, z0, x1, z1, bottom, y + 0.05, { step: 0.5 });
      k.box(x0, bottom, z0, x1, y + 0.05, z1, TILE, 'y-');
    }
    // the bubbles' light, under the water
    kits.glow.flat(p.x0 + b + 0.1, p.z0 + b + 0.1, p.x1 - b - 0.1, p.z1 - b - 0.1, bottom + 0.01, col(0x60d0ff));
  } else {
    const mid = (p.x0 + p.x1) / 2;
    const { wide, tread, rise } = { wide: 3, tread: 0.4, rise: 0.25 };
    for (let i = 0; ; i++) {
      const top = p.rim - rise * (i + 1);
      if (y + top <= bottom) break;
      const z0 = p.z0 + i * tread;
      rect(mid - wide / 2, z0, mid + wide / 2, z0 + tread, bottom, y + top);
      k.box(mid - wide / 2, bottom, z0, mid + wide / 2, y + top, z0 + tread, RIM, 'y-');
    }
    // a steel rail down the steps
    kits.outside.rod([mid - wide / 2 - 0.05, rimTop + 0.9, p.z0 - 0.2], [mid - wide / 2 - 0.05, level + 0.6, p.z0 + 2.2], 0.03, STEEL);
  }
  // the water
  kits.water.flat(p.x0, p.z0, p.x1, p.z1, level, WATER);
  kits.water.flat(p.x0, p.z0, p.x1, p.z1, level - 0.002, WATER, true);
  return {
    p,
    level,
    contains: (x, z) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1,
    bedAt: (x, z) => y + poolBed(p, x, z),
  };
}

// ── The slide tower ──────────────────────────────────────────────────────────

function tower(kits, solid, rect, blockers) {
  const k = kits.outside;
  const S = CORE.stair;
  const y0 = deckY(TOWER.deck);
  const top = TOWER.top;
  const { x, z } = TOWER;
  // the stairs, going round
  stairs(k, z, x, TOWER.deck, 99, solid, (...b) => blockers.push(b), y0, TOWER.turns);
  // a landing at each turn, where the flight up starts, with a rail along its front
  const lz0 = z + S.top;
  const lz1 = z + CORE.lobby[0];
  for (let i = 1; i < TOWER.turns; i++) {
    const yy = y0 + i * DECK_H;
    k.box(x - S.half, yy - 0.25, lz0, x + S.half, yy, lz1, col(0x6a6a70));
    rect(x - S.half, lz0, x + S.half, lz1, yy - 0.3, yy);
    railing(kits, x - S.half, lz1, x + S.half, lz1, yy, 0, -1);
    solid(x - S.half, lz1, x + S.half, lz1, 0.08, yy, yy + RAIL_SOLID);
  }
  // the frame round it: posts at the corners, mesh on three sides
  const [fx0, fz0, fx1, fz1] = [x - S.half - 0.1, z + S.back - 0.1, x + S.half + 0.1, lz1];
  for (const [px, pz] of [
    [fx0, fz0],
    [fx1, fz0],
    [fx0, fz1],
    [fx1, fz1],
  ])
    k.box(px - 0.12, y0, pz - 0.12, px + 0.12, top + 3, pz + 0.12, col(0x2a6ad8));
  for (const [ax, az, bx, bz, nx, nz] of [
    [fx0, fz0, fx1, fz0, 0, 1],
    [fx0, fz0, fx0, fz1, 1, 0],
    [fx1, fz0, fx1, fz1, -1, 0],
  ]) {
    const len = Math.hypot(bx - ax, bz - az);
    kits.glass.panel((ax + bx) / 2, (y0 + top) / 2, (az + bz) / 2, nx, nz, len, top - y0, col(0xa8c8d8));
    kits.glass.panel((ax + bx) / 2, (y0 + top) / 2, (az + bz) / 2, -nx, -nz, len, top - y0, col(0xa8c8d8));
    solid(ax, az, bx, bz, 0.1, y0, top);
    blockers.push([Math.min(ax, bx) - 0.1, y0, Math.min(az, bz) - 0.1, Math.max(ax, bx) + 0.1, top, Math.max(az, bz) + 0.1]);
  }
  // the platform on top, less the well the stairs come up
  const P = towerPlatform();
  const [px0, pz0, px1, pz1] = P.rect;
  const [hx0, hz0, hx1, hz1] = P.hole;
  for (const [a, b, c, d] of [
    [px0, pz0, px1, hz0],
    [px0, hz1, px1, pz1],
    [px0, hz0, hx0, hz1],
    [hx1, hz0, px1, hz1],
  ]) {
    if (c - a < 0.05 || d - b < 0.05) continue;
    k.box(a, top - 0.3, b, c, top, d, col(0x6a6a70));
    rect(a, b, c, d, top - 0.35, top, { surface: 'boards' });
    blockers.push([a, top - 0.3, b, c, top, d]);
  }
  // round its edge, a rail, but for where the slides start; round the well,
  // but where the stairs come up
  const gaps = { aft: [-14.2, -11.8], port: [-105.2, -102.8] };
  const edge = (ax, az, bx, bz, nx, nz) => {
    railing(kits, ax, az, bx, bz, top, nx, nz);
    solid(ax, az, bx, bz, 0.08, top, top + RAIL_SOLID);
  };
  edge(px0, pz0, gaps.aft[0], pz0, 0, 1);
  edge(gaps.aft[1], pz0, px1, pz0, 0, 1);
  edge(px0, pz1, px1, pz1, 0, -1);
  edge(px0, pz0, px0, pz1, 1, 0);
  edge(px1, pz0, px1, gaps.port[0], -1, 0);
  edge(px1, gaps.port[1], px1, pz1, -1, 0);
  edge(hx0, hz0, hx1, hz0, 0, -1);
  edge(hx0, hz0, hx0, hz1, -1, 0);
  edge(hx1, hz0, hx1, hz1, 1, 0);
  edge(x + S.gap, hz1, hx1, hz1, 0, 1);
  // a canopy over it, on four legs
  for (const [cx, cz] of [
    [px0 + 0.3, pz0 + 0.3],
    [px1 - 0.3, pz0 + 0.3],
    [px0 + 0.3, pz1 - 0.3],
    [px1 - 0.3, pz1 - 0.3],
  ])
    k.cyl(cx, top, cz, top + 3.2, 0.08, STEEL, 6);
  k.box(px0, top + 3.2, pz0, px1, top + 3.35, pz1, col(0x2a6ad8));
  k.words('THE CORKSCREW', (gaps.aft[0] + gaps.aft[1]) / 2, top + 2.7, pz0 - 0.05, 0, -1, 0.06, col(0xf4f4f0));
  k.words('THE PLUNGE', px1 + 0.05, top + 2.7, (gaps.port[0] + gaps.port[1]) / 2, 1, 0, 0.06, col(0xf4f4f0));
  void halfBeam;
}

// ── The slides ───────────────────────────────────────────────────────────────

function slides(kits, solid) {
  const starts = [];
  for (const sl of SLIDES) {
    const p = path(sl);
    const R = sl.tube ? 0.75 : 0.65;
    // the rider sits in the bottom of it: the tube's middle is a little over them
    const pts = p.pts.map(([x, y, z]) => [x, y + R - 0.35, z]);
    if (sl.tube) kits.tube.tube(pts, R, BLUE.clone(), { seg: 14, inside: true, inColor: col(0x6aa0f0) });
    else kits.outside.tube(pts, R, RED.clone(), { seg: 14, part: 0.55, inside: true, inColor: col(0xf06a5a) });
    // legs down to whatever is under it, every few metres
    for (let i = 8; i < pts.length - 4; i += 14) {
      const [x, y, z] = pts[i];
      const under = floorUnder(x, z, y - R);
      if (under !== null) kits.outside.rod([x, y - R, z], [x, under, z], 0.09, STEEL, 6);
      else {
        // out over the side: a strut back in to her
        const s = Math.sign(x);
        const hb = halfBeam(z) - 0.3;
        kits.outside.rod([x, y - R, z], [s * hb, deckY(15), z], 0.1, STEEL, 6);
      }
    }
    const a = p.pts[0];
    const b = p.pts[3];
    starts.push({ slide: sl, x: a[0], y: a[1], z: a[2], yaw: Math.atan2(b[0] - a[0], b[2] - a[2]) });
  }
  return starts;
}

// The highest floor under (x, z) that's lower than y, on decks 14 to 16, or null.
function floorUnder(x, z, y) {
  for (let n = 16; n >= 14; n--) {
    const yy = deckY(n);
    if (yy >= y) continue;
    if (floorStrips(layout(n)).some((s) => Math.abs(s.x - x) <= s.r && z >= s.z0 && z <= s.z1)) return yy;
  }
  return null;
}

// The big screen over the main pool, on the aft face of the midships deckhouse.
function bigScreen(kits) {
  const z = 12 + CORE.block[0] - 0.08;
  const y = deckY(15) + 1;
  kits.outside.box(-4.4, y - 0.2, z - 0.25, 4.4, y + 4.9, z, col(0x1a1a1e));
  // a sunset on it
  const bands = [0x1a2a5a, 0x3a4a8a, 0x8a5a9a, 0xd87a6a, 0xf2b05a, 0xf6d88a, 0x2a6a9a, 0x1a4a7a];
  bands.forEach((c, i) => kits.glow.panel(0, y + 4.5 - i * 0.58, z - 0.27, 0, -1, 8.4, 0.58, col(c)));
}
