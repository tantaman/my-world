// What the Metro's stations look like, made in code.
//
// Under the street, a level is the station everyone knows: a barrel vault
// of coffered concrete over the tracks and the platforms, lit only from
// below: along the vault's foot runs a trough with the lamps in it, hidden
// behind its lip, washing light up the coffers. So the vault glows warm
// near its foot and darkens towards its crown, each coffer's sides that
// look down catching the light and those that look up in their own shadow.
// That light is worked out here as each face is built (coveLight) and
// carried in its colour: nothing else lights it (look.js).
//
// Its platforms are paved in red-brown hexagonal tile, edged in pale
// granite with a row of round lights set in the granite (which flash as a
// train comes in: `edges`); the edge overhangs the trackbed, with a dark
// slot under it. Brown pylons stand along each platform with the station's
// name on them, facing the tracks; benches between; and over the platform,
// on posts, the boards that say when the next trains come (`board`: painted
// by the feature from the clock). At one end a mezzanine spans the vault,
// with escalators down to each platform; at both ends the tracks run on
// into their tunnels.
//
// Over the street, a level is its platforms, on the viaduct or on the
// ground, under the canopies Metro's open-air stations have: a concrete roof
// that rises to either side like a pair of wings, on a row of columns.
//
// At each of a station's entrances, the brown pylon with its M and a band
// for each line; under the street, the escalators going down beside it,
// walled in granite, under a canopy of glass on steel ribs.
//
//   buildLevel(L, room, { ground, mats, vault }) -> { group, edges, board, under, spots, posts }
//     group:  everything, built round itself; edges: the material of its
//     platform-edge lights; board: its arrival boards' sign (signs.js:
//     arrivalBoard), or null where there's nothing to paint on; under:
//     whether it's under the street; spots: the foot of each platform's
//     escalator ({ x, y, z, yaw }), where you go up; posts: what stands on
//     its platforms, as solids (world/solids.js)
//     (vault: false leaves out the coffered vault, to be built in parts:)
//   buildVault(L, room, mats, part, parts) -> Mesh
//   buildEntrance(e, station, { ground, mats, under }) -> Group
//
// Everything is placed in a level's own frame (along it, a; across it, c, +
// to the right), and turned into the world's at the end (fromLevel).

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF } from '../build/surfaces.js';
import { quad, box } from '../build/faces.js';
import { fromLevel, TUBE } from './network.js';
import { meshOf } from './track.js';
import { pylonTop, nameBoard, arrivalBoard } from './signs.js';

const COFFER = { size: 1.7, inset: 0.16, depth: 0.34 }; // m: a coffer's width; how far its sides come in; how deep
const MEZZ = { from: 6, deep: 12, up: 5.4, slab: 0.7 }; // m in from the vault's end; how far it spans; its floor over the platform's
const ESCALATOR = { run: 9.4, half: 0.62, every: 1.5 }; // m it takes to climb to the mezzanine; half its width; between them
const EDGE_GRANITE = 0.6; // m of granite along a platform's edge
const EDGE_LIGHTS = { every: 1.22, in: 0.3, r: 0.065 }; // m between the lights in it; in from the edge; their radius
const LIP = { under: 0.5, thick: 0.25 }; // m the platform's edge overhangs the trackbed; how thick it is there
// m along a platform: from its end to the first pylon, and between them
// (a bench half way between each two)
const PYLON_FIRST = 15;
const PYLON_EVERY = 46;
const PLAT_PYLON = { half: 0.5, thick: 0.12, h: 2.75, sign: 0.42 }; // half its width, half its thickness, height; its name's height
const BENCH = { half: 1.1, depth: 0.44, seat: 0.46 };
const BOARD = { w: 1.9, h: 0.48, low: 2.55, at: [0.32, 0.68] }; // an arrival board: m wide, high, its bottom over the floor; where along
const TROUGH = { wide: 0.9, high: 0.85, lip: 0.12 }; // the lamps' trough along the vault's foot
const CANOPY = { up: 3.7, wing: 0.85, thick: 0.32, every: 14 };
const WELL = { half: 2.2, run: 12, slope: 0.55, wall: 1.05 }; // an entrance's escalator well: half its width, how long, how steep, its parapet
const ENTRY_ROOF = { run: 7.5, up: 3.4, rib: 1.5 }; // the glass canopy over a well's top: how far down it, how high, m between ribs
const PYLON = { half: 0.3, h: 4.0, top: 1.1 }; // the brown pylon at an entrance: half its width, its height, its M and bands

// How the coves light the vault: m it reaches before it's fallen to half,
// and how steeply it falls past that; how much a face turned a little away
// still catches; how far the lamps lean their light in towards the room
// (over up); what comes back off everything, everywhere; and the most.
// (Under the street the eye has got used to the dark, and the picture is
// made about three and a half times as bright as by day: world/sky.js,
// render/pipeline.js. These are for that.)
const LIGHT = { reach: 3.4, fall: 2.8, wrap: 0.45, aim: 0.45, bounce: 0.018, most: 1.2 };
// what lights what stands on the platform, and the floor: the vault's light, come back down
const UNDER_LIT = { solid: 0.2, floor: 0.3, trackbed: 0.06 };

const lin = (hex) => new THREE.Color(hex);
export const PAL = {
  vault: lin(0xb6a68e),
  tile: lin(0x9c5844),
  granite: lin(0xc9c5bc),
  trackbed: lin(0x3a3835),
  wall: lin(0x9a8f7f),
  bronze: lin(0x4a3426),
  bronzeLight: lin(0x6b4c37),
  cove: lin(0xffd9a0),
  edgeLight: lin(0xfff1c8),
  steel: lin(0xa7aaad),
  step: lin(0x3c3d3f),
  stepEdge: lin(0xd9b232),
  handrail: lin(0x18181a),
  bench: lin(0x5a5550),
  canopy: lin(0xa29c91),
  canopyUnder: lin(0x8d877d),
  column: lin(0x958f84),
  rail: lin(0x55575a),
  board: lin(0x141414),
  glass: lin(0x6f8590),
  rib: lin(0xb7bbbf),
};
// the coves' lamps, warm; what comes back off the concrete, less so
const WARM = new THREE.Color(1.0, 0.8, 0.55);
const BOUNCE = new THREE.Color(0.9, 0.84, 0.76);

const _c = new THREE.Color();
const _l = new THREE.Color();
const _w = { x: 0, z: 0 };

// A point a along, c across and y up a level, in the world.
function W(L, a, c, y) {
  fromLevel(L, a, c, _w);
  return [_w.x, y, _w.z];
}

// A face from four corners, turned to face `toward` (a direction [x, y, z]).
function face(m, a, b, c, d, color, toward) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0) quad(m, a, b, c, d, color);
  else quad(m, a, d, c, b, color);
}

// The lamps along a room's foot, one each side: where across, how high,
// and which way across they lean their light (into the room).
function covesOf(room) {
  const L = room.L;
  return [
    { c: room.c0 + TROUGH.wide * 0.6, y: L.floor + TROUGH.high, s: 1 },
    { c: room.c1 - TROUGH.wide * 0.6, y: L.floor + TROUGH.high, s: -1 },
  ];
}

// The light the coves put on a face at c across and y up, looking n (a
// unit [along, across, up]), as a colour to take its own by.
function coveLight(room, c, y, n, out) {
  const aim = Math.hypot(LIGHT.aim, 1);
  let direct = 0;
  for (const cv of room.coves || (room.coves = covesOf(room))) {
    const vc = cv.c - c;
    const vy = cv.y - y;
    const d = Math.hypot(vc, vy) || 1;
    // how square on it is to the lamps (wrapped: a face turned a little
    // away still catches some, off the coffers round it)
    const facing = Math.max(0, (n[1] * vc + n[2] * vy) / d + LIGHT.wrap) / (1 + LIGHT.wrap);
    // the lamps throw their light up and in, little of it along the floor
    const thrown = Math.max(0, (-vc * cv.s * LIGHT.aim - vy) / (d * aim));
    direct += (facing * (0.15 + 0.85 * thrown)) / (1 + (d / LIGHT.reach) ** LIGHT.fall);
  }
  return out.copy(WARM).multiplyScalar(Math.min(LIGHT.most, direct)).add(_l.copy(BOUNCE).multiplyScalar(LIGHT.bounce));
}

// A face given by its corners in a level's frame ([a, c, y]), turned to
// look `into` (likewise), coloured `col` as the coves light it there.
const _n3 = [0, 0, 0];
function litFace(m, L, room, P, col, into, k = 1) {
  const [p0, p1, , p3] = P;
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const e2 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
  let na = e1[1] * e2[2] - e1[2] * e2[1];
  let nc = e1[2] * e2[0] - e1[0] * e2[2];
  let ny = e1[0] * e2[1] - e1[1] * e2[0];
  const l = Math.hypot(na, nc, ny) || 1;
  const s = na * into[0] + nc * into[1] + ny * into[2] < 0 ? -1 / l : 1 / l;
  [na, nc, ny] = [na * s, nc * s, ny * s];
  _n3[0] = na;
  _n3[1] = nc;
  _n3[2] = ny;
  const cm = (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4;
  const ym = (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4;
  coveLight(room, cm, ym, _n3, _c).multiply(col).multiplyScalar(k);
  const toward = [L.dx * na - L.dz * nc, ny, L.dz * na + L.dx * nc];
  const w = P.map(([a, c, y]) => W(L, a, c, y));
  face(m, w[0], w[1], w[2], w[3], _c, toward);
}

// The vault's surface: where it is θ round from one side (0) to the other
// (π), and the way into the room there, in the level's (c, y).
function vaultAt(room, th) {
  const k = room.crown - room.spring;
  const c = room.mid - room.half * Math.cos(th);
  const y = room.spring + k * Math.sin(th);
  // (the ellipse's inward normal)
  let nc = Math.cos(th) / room.half;
  let ny = -Math.sin(th) / k;
  const l = Math.hypot(nc, ny);
  nc /= l;
  ny /= l;
  return { c, y, nc, ny };
}

export function buildLevel(L, room, { ground, mats, vault = true }) {
  const group = new THREE.Group();
  const m = new Mesher(); // what's built of boxes, seen from all round
  const shell = new Mesher(); // the vault and its ends, seen from inside
  const tile = new Mesher(); // the platforms' tile
  const granite = new Mesher(); // and their granite edges
  const glow = new Mesher();
  const edgeMesh = new Mesher();
  m.surf = SURF.concrete;
  shell.surf = SURF.concrete;
  tile.surf = SURF.plain;
  granite.surf = SURF.plain;
  const under = room.under;
  // what lights what's built of boxes: under the street, the vault's light
  // come back down (they take none of the scene's there: look.js); over it,
  // the day
  const solidLit = (col, k = UNDER_LIT.solid) => (under ? _l.copy(BOUNCE).multiplyScalar(k * 0.4).add(_c.copy(WARM).multiplyScalar(k * 0.6)).multiply(col) : col);
  const up = [0, 1, 0];
  const yaw = Math.atan2(L.dx, L.dz);
  const spots = [];
  // what stands on the platforms, to walk round: capsules (world/solids.js)
  const posts = [];
  const post = (a0, a1, c, r, top) => {
    const [x0, , z0] = W(L, a0, c, 0);
    const [x1, , z1] = W(L, a1, c, 0);
    posts.push({ ax: x0, az: z0, bx: x1, bz: z1, r, bottom: L.floor - 0.5, topA: L.floor + top, topB: L.floor + top });
  };
  const bed = L.rail - 0.35;

  if (under) {
    // ── the vault (or a part of it, on its own: buildVault) ──
    if (vault) vaultPart(shell, L, room, 0, 1);
    // ── its ends: a wall each, with the tunnels' mouths in it ──
    for (const [a, sign] of [[room.a0, 1], [room.a1, -1]]) {
      const into = [sign, 0, 0];
      const n = Math.round((room.c1 - room.c0) / 0.5);
      for (let i = 0; i < n; i++) {
        const c0 = room.c0 + ((room.c1 - room.c0) * i) / n;
        const c1 = room.c0 + ((room.c1 - room.c0) * (i + 1)) / n;
        const cm = (c0 + c1) / 2;
        const top0 = roofOf(room, c0);
        const top1 = roofOf(room, c1);
        const onTrack = L.tracks.some((t) => Math.abs(cm - t) < TUBE.half);
        const bottom = onTrack ? L.rail + TUBE.top - 0.4 : bed;
        if (Math.min(top0, top1) <= bottom) continue;
        // (in bands up it, for the light to fall off by)
        const bands = 4;
        for (let b = 0; b < bands; b++) {
          const f0 = b / bands;
          const f1 = (b + 1) / bands;
          litFace(shell, L, room, [[a, c0, bottom + (top0 - bottom) * f0], [a, c1, bottom + (top1 - bottom) * f0], [a, c1, bottom + (top1 - bottom) * f1], [a, c0, bottom + (top0 - bottom) * f1]], PAL.wall, into, 0.8);
        }
      }
    }
    // ── the floor: the trackbed, and the platforms on it ──
    face(shell, W(L, room.a0, room.c0, bed), W(L, room.a1, room.c0, bed), W(L, room.a1, room.c1, bed), W(L, room.a0, room.c1, bed), _c.copy(PAL.trackbed).multiplyScalar(UNDER_LIT.trackbed), up);
    // (and where the vault comes down to the floor, outside the outermost
    // platforms: a strip of floor, and the trough of lamps along it that
    // lights it all)
    const cs = L.platforms.map((p) => [p.c0, p.c1]).flat();
    const outerL = Math.min(...cs, ...L.tracks.map((t) => t - TUBE.half));
    const outerR = Math.max(...cs, ...L.tracks.map((t) => t + TUBE.half));
    for (const [c0, c1] of [[room.c0, outerL], [outerR, room.c1]]) {
      if (c1 - c0 < 0.05) continue;
      box(m, ...W(L, (room.a0 + room.a1) / 2, (c0 + c1) / 2, (L.floor + bed) / 2), (c1 - c0) / 2, (L.floor - bed) / 2, (room.a1 - room.a0) / 2, yaw, solidLit(PAL.wall, 0.18));
    }
    // (and up from it to where the vault springs)
    for (const [c, s] of [[room.c0, 1], [room.c1, -1]]) {
      litFace(shell, L, room, [[room.a0, c, L.floor], [room.a1, c, L.floor], [room.a1, c, room.spring + 0.02], [room.a0, c, room.spring + 0.02]], PAL.wall, [0, s, 0]);
    }
    for (const cv of covesOf(room)) {
      const back = cv.s > 0 ? room.c0 : room.c1;
      const front = back + cv.s * TROUGH.wide;
      const len = (room.a1 - room.a0) / 2 - 0.2;
      const am = (room.a0 + room.a1) / 2;
      // the trough: its body, its front lip, and the lamps in it
      box(m, ...W(L, am, (back + front) / 2, L.floor + TROUGH.high / 2), TROUGH.wide / 2, TROUGH.high / 2, len, yaw, solidLit(PAL.wall, 0.2));
      box(m, ...W(L, am, front - cv.s * 0.06, L.floor + TROUGH.high + TROUGH.lip / 2), 0.06, TROUGH.lip / 2, len, yaw, solidLit(PAL.granite, 0.3));
      box(glow, ...W(L, am, back + cv.s * TROUGH.wide * 0.45, L.floor + TROUGH.high + 0.01), 0.1, 0.012, len - 0.3, yaw, PAL.cove);
    }
  }

  // ── the platforms ──
  const ownTile = under ? UNDER_LIT.floor : 1;
  const signMat = (tex) => mats.sign(tex, under);
  const name = nameBoard(L.station.name, L.lines.map((id) => mats.colour(id)));
  const board = arrivalBoard();
  const boardMat = board ? new THREE.MeshBasicMaterial({ map: board.texture, toneMapped: false }) : null;
  for (const p of L.platforms) {
    const bottom = under ? bed : L.what === 'bridge' ? L.rail - 2.05 : Math.min(L.rail - 0.4, ground(...W(L, (p.a0 + p.a1) / 2, (p.c0 + p.c1) / 2, 0).filter((_, i) => i !== 1)) - 0.3);
    const am = (p.a0 + p.a1) / 2;
    const cm = (p.c0 + p.c1) / 2;
    const halfA = (p.a1 - p.a0) / 2;
    // its edges beside a track: where, and which way is in from them
    const edges = L.tracks.flatMap((t) => (Math.abs(t - p.c0) < 2.2 ? [[p.c0, 1]] : Math.abs(t - p.c1) < 2.2 ? [[p.c1, -1]] : []));
    // the slab, set back under its edges, where the edge overhangs the trackbed
    let s0 = p.c0;
    let s1 = p.c1;
    for (const [c, inward] of edges) {
      if (inward > 0) s0 = c + LIP.under;
      else s1 = c - LIP.under;
    }
    m.surf = SURF.concrete;
    box(m, ...W(L, am, (s0 + s1) / 2, (L.floor - 0.06 + bottom) / 2), (s1 - s0) / 2, (L.floor - 0.06 - bottom) / 2, halfA, yaw, solidLit(PAL.wall, 0.12));
    // the tile, and the granite along each edge beside a track
    let t0 = p.c0;
    let t1 = p.c1;
    for (const [c, inward] of edges) {
      const cb = c + inward * EDGE_GRANITE;
      box(granite, ...W(L, am, (c + cb) / 2, L.floor - LIP.thick / 2), EDGE_GRANITE / 2, LIP.thick / 2, halfA, yaw, solidLit(PAL.granite, 0.24));
      if (inward > 0) t0 = cb;
      else t1 = cb;
      // its lights, round, set in the granite
      for (let a = p.a0 + 0.8; a < p.a1 - 0.5; a += EDGE_LIGHTS.every) disc(edgeMesh, L, a, c + inward * EDGE_LIGHTS.in, L.floor + 0.003, EDGE_LIGHTS.r, PAL.edgeLight);
    }
    face(tile, W(L, p.a0, t0, L.floor), W(L, p.a1, t0, L.floor), W(L, p.a1, t1, L.floor), W(L, p.a0, t1, L.floor), _c.copy(PAL.tile).multiplyScalar(ownTile), up);
    // pylons along it with the name on, benches between, and the boards
    // over it that say when the trains come
    const wide = p.c1 - p.c0;
    const boards = BOARD.at.map((f) => p.a0 + (p.a1 - p.a0) * f);
    const clear = (a) => boards.every((b) => Math.abs(a - b) > 4);
    if (wide > 2.6) {
      for (let a = p.a0 + PYLON_FIRST; a < p.a1 - 12; a += PYLON_EVERY) {
        if (clear(a)) {
          pylonAt(L, a, cm, yaw, m, group, solidLit, name && signMat(name));
          post(a - PLAT_PYLON.half, a + PLAT_PYLON.half, cm, PLAT_PYLON.thick + 0.08, PLAT_PYLON.h);
        }
        const b = a + PYLON_EVERY / 2;
        if (b < p.a1 - 12 && clear(b)) {
          benchAt(m, L, b, cm, yaw, solidLit);
          post(b - BENCH.half, b + BENCH.half, cm, BENCH.depth / 2 + 0.05, BENCH.seat);
        }
      }
      for (const a of boards) {
        boardAt(m, L, a, cm, yaw, solidLit, group, boardMat, mats.signPlane);
        post(a, a, cm, 0.12, BOARD.low + BOARD.h);
      }
    }
    // under the open sky, a canopy
    if (!under) for (const a of canopy(L, p, m)) post(a, a, cm, 0.24, CANOPY.up);
  }

  // ── the mezzanine, and the escalators up to it ──
  if (under) {
    const end = room.a1;
    const front = end - MEZZ.from - MEZZ.deep;
    const deck = L.floor + MEZZ.up;
    // across as far as the vault leaves headroom over it
    let c0 = room.mid;
    let c1 = room.mid;
    while (c0 > room.c0 && roofOf(room, c0 - 0.25) > deck + 2.4) c0 -= 0.25;
    while (c1 < room.c1 && roofOf(room, c1 + 0.25) > deck + 2.4) c1 += 0.25;
    if (c1 - c0 > 4) {
      box(m, ...W(L, (front + end) / 2, (c0 + c1) / 2, deck - MEZZ.slab / 2), (c1 - c0) / 2, MEZZ.slab / 2, (end - front) / 2, yaw, solidLit(PAL.wall, 0.16));
      // its parapet along the front, in granite, and the bronze rail on it
      box(m, ...W(L, front + 0.15, (c0 + c1) / 2, deck + 0.5), (c1 - c0) / 2, 0.5, 0.15, yaw, solidLit(PAL.granite, 0.26));
      box(m, ...W(L, front + 0.15, (c0 + c1) / 2, deck + 1.06), (c1 - c0) / 2, 0.04, 0.09, yaw, solidLit(PAL.bronzeLight, 0.4));
      // the fare gates across it
      for (let c = c0 + 1.2; c < c1 - 1.2; c += 0.95) box(m, ...W(L, front + MEZZ.deep * 0.55, c, deck + 0.5), 0.12, 0.5, 0.7, yaw, solidLit(PAL.steel, 0.3));
      // escalators: from the foot, on each platform, up to the mezzanine's front
      for (const p of L.platforms) {
        const foot = front - ESCALATOR.run;
        if (foot < p.a0 + 10) continue;
        const cm = (p.c0 + p.c1) / 2;
        const n = Math.max(1, Math.min(3, Math.floor((p.c1 - p.c0 - 0.8) / ESCALATOR.every)));
        for (let k = 0; k < n; k++) {
          const c = cm + (k - (n - 1) / 2) * ESCALATOR.every;
          escalator(m, L, foot, front, L.floor, deck, c, yaw, solidLit);
          post(foot + 0.4, front, c, ESCALATOR.half, MEZZ.up);
        }
        const at = W(L, foot - 1.6, cm, L.floor);
        spots.push({ x: at[0], y: L.floor, z: at[2], yaw, level: L });
      }
    }
  } else {
    // up from the street at each end of each platform
    for (const p of L.platforms) {
      const at = W(L, p.a1 - 4, (p.c0 + p.c1) / 2, L.floor);
      spots.push({ x: at[0], y: L.floor, z: at[2], yaw, level: L });
    }
  }

  if (!shell.empty) group.add(meshOf(shell, mats.vault));
  if (!m.empty) group.add(meshOf(m, under ? mats.vaultSolid : mats.solid));
  if (!tile.empty) group.add(meshOf(tile, under ? mats.tile : mats.tileOpen));
  if (!granite.empty) group.add(meshOf(granite, under ? mats.granite : mats.graniteOpen));
  if (!glow.empty) group.add(meshOf(glow, mats.glow));
  const edges = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  if (!edgeMesh.empty) group.add(meshOf(edgeMesh, edges));
  return { group, edges, board, boardMat, under, spots, posts };
}

// A round light, flat on the floor: a fan of triangles.
function disc(m, L, a, c, y, r, col) {
  const n = 8;
  const mid = W(L, a, c, y);
  for (let k = 0; k < n; k++) {
    const t0 = (k / n) * Math.PI * 2;
    const t1 = ((k + 1) / n) * Math.PI * 2;
    face(m, mid, W(L, a + Math.cos(t0) * r, c + Math.sin(t0) * r, y), W(L, a + Math.cos(t1) * r, c + Math.sin(t1) * r, y), mid, col, [0, 1, 0]);
  }
}

// The coffered vault over a level, or the `part`th of `parts` of it along
// its length (so that building one is never one long step).
export function buildVault(L, room, mats, part = 0, parts = 1) {
  const shell = new Mesher();
  shell.surf = SURF.concrete;
  vaultPart(shell, L, room, part, parts);
  return meshOf(shell, mats.vault);
}

function vaultPart(shell, L, room, part, parts) {
  const k = room.crown - room.spring;
  const arc = Math.PI * Math.sqrt((room.half * room.half + k * k) / 2);
  const nTh = Math.max(6, Math.round(arc / COFFER.size));
  const nA = Math.max(4, Math.round((room.a1 - room.a0) / COFFER.size));
  const keep = 1 - COFFER.inset * 2;
  for (let i = 0; i < nTh; i++) {
    const t0 = (i / nTh) * Math.PI;
    const t1 = ((i + 1) / nTh) * Math.PI;
    const tm = (t0 + t1) / 2;
    const p0 = vaultAt(room, t0);
    const p1 = vaultAt(room, t1);
    const pm = vaultAt(room, tm);
    const into = [0, pm.nc, pm.ny];
    for (let j = Math.floor((nA * part) / parts); j < Math.floor((nA * (part + 1)) / parts); j++) {
      const a0 = room.a0 + ((room.a1 - room.a0) * j) / nA;
      const a1 = room.a0 + ((room.a1 - room.a0) * (j + 1)) / nA;
      const am = (a0 + a1) / 2;
      // the cell on the vault's surface, and the coffer's back, set into it
      const outer = [
        [a0, p0.c, p0.y],
        [a1, p0.c, p0.y],
        [a1, p1.c, p1.y],
        [a0, p1.c, p1.y],
      ];
      const inner = outer.map(([a, c, y]) => [am + (a - am) * keep, pm.c + (c - pm.c) * keep - pm.nc * COFFER.depth, pm.y + (y - pm.y) * keep - pm.ny * COFFER.depth]);
      // (a little of each coffer's own: concrete poured in forms is never quite even)
      const one = 0.94 + 0.12 * hash(i, j);
      litFace(shell, L, room, inner, PAL.vault, into, 0.86 * one);
      for (let e = 0; e < 4; e++) {
        const f = (e + 1) % 4;
        litFace(shell, L, room, [outer[e], outer[f], inner[f], inner[e]], PAL.vault, into, one);
      }
    }
  }
}

const hash = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function roofOf(room, c) {
  const u = Math.min(1, Math.abs(c - room.mid) / room.half);
  return room.spring + (room.crown - room.spring) * Math.sqrt(1 - u * u);
}

// An escalator, from (foot, y0) to (top, y1) along the level, c across:
// its steps, dark with a yellow nose; its balustrades of steel with the
// black handrail along their tops; its landings; and its truss under it.
function escalator(m, L, foot, top, y0, y1, c, yaw, lit) {
  const n = Math.ceil(Math.hypot(top - foot, y1 - y0) / 0.4);
  const steel = lit(PAL.steel, 0.3).clone();
  const step = lit(PAL.step, 0.3).clone();
  const nose = lit(PAL.stepEdge, 0.3).clone();
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const a = foot + (top - foot) * u;
    const y = y0 + (y1 - y0) * u;
    box(m, ...W(L, a, c, y - 0.05), ESCALATOR.half - 0.08, 0.06, 0.19, yaw, step);
    box(m, ...W(L, a + 0.17, c, y + 0.012), ESCALATOR.half - 0.1, 0.006, 0.025, yaw, nose);
  }
  // the landings, a plate of steel at each end
  box(m, ...W(L, foot - 0.6, c, y0 + 0.01), ESCALATOR.half, 0.01, 0.6, yaw, steel);
  box(m, ...W(L, top + 0.6, c, y1 + 0.01), ESCALATOR.half, 0.01, 0.6, yaw, steel);
  // balustrades either side: a sloping panel, and the handrail on it
  for (const s of [-1, 1]) {
    const cc = c + s * ESCALATOR.half;
    const a0 = W(L, foot, cc, y0);
    const a1 = W(L, top, cc, y1);
    const b0 = W(L, foot, cc, y0 + 0.95);
    const b1 = W(L, top, cc, y1 + 0.95);
    quad(m, a0, a1, b1, b0, steel);
    quad(m, a0, b0, b1, a1, steel);
    const r0 = W(L, foot - 0.4, cc, y0 + 1.0);
    const r1 = W(L, top + 0.4, cc, y1 + 1.0);
    const dx = r1[0] - r0[0];
    const dy = r1[1] - r0[1];
    const dz = r1[2] - r0[2];
    const len = Math.hypot(dx, dy, dz);
    const mid = [(r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2, (r0[2] + r1[2]) / 2];
    handrail(m, mid, len, Math.atan2(dy, Math.hypot(dx, dz)), yaw, lit(PAL.handrail, 0.4));
  }
  // its truss underneath, down to the floor, clad in steel
  const under = [W(L, foot, c - ESCALATOR.half, y0), W(L, top, c - ESCALATOR.half, y1 - 0.4), W(L, top, c + ESCALATOR.half, y1 - 0.4), W(L, foot, c + ESCALATOR.half, y0)];
  quad(m, under[0], under[3], under[2], under[1], steel);
  quad(m, under[0], under[1], under[2], under[3], steel);
}

// A handrail: a flat black band, len long, climbing at `pitch`, along yaw.
function handrail(m, mid, len, pitch, yaw, col) {
  const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
  const h = len / 2;
  const cp = Math.cos(pitch) * h;
  const sp = Math.sin(pitch) * h;
  const a = [mid[0] - fx * cp, mid[1] - sp, mid[2] - fz * cp];
  const b = [mid[0] + fx * cp, mid[1] + sp, mid[2] + fz * cp];
  const w = 0.045;
  const t = 0.03;
  const [rx, rz] = [-fz * w, fx * w];
  const P = (p, s, y) => [p[0] + rx * s, p[1] + y, p[2] + rz * s];
  face(m, P(a, -1, t), P(b, -1, t), P(b, 1, t), P(a, 1, t), col, [0, 1, 0]);
  face(m, P(a, -1, -t), P(b, -1, -t), P(b, -1, t), P(a, -1, t), col, [-fz, 0, fx]);
  face(m, P(a, 1, -t), P(b, 1, -t), P(b, 1, t), P(a, 1, t), col, [fz, 0, -fx]);
}

// A pylon on a platform: brown, slim, and its name at the top on either face.
function pylonAt(L, a, c, yaw, m, group, lit, mat) {
  box(m, ...W(L, a, c, L.floor + PLAT_PYLON.h / 2), PLAT_PYLON.thick, PLAT_PYLON.h / 2, PLAT_PYLON.half, yaw, lit(PAL.bronze, 0.45));
  if (!mat) return;
  for (const s of [-1, 1]) {
    const plane = new THREE.Mesh(planeGeo, mat);
    const p = W(L, a, c + s * (PLAT_PYLON.thick + 0.005), L.floor + PLAT_PYLON.h - PLAT_PYLON.sign / 2 - 0.08);
    plane.position.set(p[0], p[1], p[2]);
    plane.rotation.y = yaw + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
    plane.scale.set(PLAT_PYLON.half * 2 - 0.06, PLAT_PYLON.sign, 1);
    group.add(plane);
  }
}
const planeGeo = new THREE.PlaneGeometry(1, 1);

// A bench: a slab of dark stone on two pedestals.
function benchAt(m, L, a, c, yaw, lit) {
  const col = lit(PAL.bench, 0.3).clone();
  box(m, ...W(L, a, c, L.floor + BENCH.seat - 0.04), BENCH.depth / 2, 0.04, BENCH.half, yaw, col);
  for (const s of [-1, 1]) box(m, ...W(L, a + s * (BENCH.half - 0.35), c, L.floor + (BENCH.seat - 0.08) / 2), BENCH.depth / 2 - 0.08, (BENCH.seat - 0.08) / 2, 0.12, yaw, lit(PAL.wall, 0.15));
}

// An arrival board on its post: a black box, its lights on both faces,
// read along the platform.
function boardAt(m, L, a, c, yaw, lit, group, mat, plane) {
  const y = L.floor + BOARD.low + BOARD.h / 2;
  box(m, ...W(L, a, c, L.floor + BOARD.low / 2), 0.06, BOARD.low / 2, 0.06, yaw, lit(PAL.bronze, 0.45));
  box(m, ...W(L, a, c, y), BOARD.w / 2 + 0.06, BOARD.h / 2 + 0.06, 0.09, yaw, lit(PAL.board, 0.4));
  if (!mat) return;
  for (const s of [-1, 1]) {
    const face = new THREE.Mesh(plane, mat);
    const p = W(L, a + s * 0.095, c, y);
    face.position.set(p[0], p[1], p[2]);
    face.rotation.y = yaw + (s > 0 ? 0 : Math.PI);
    face.scale.set(BOARD.w, BOARD.h, 1);
    group.add(face);
  }
}

// The wings over an open platform: a row of columns down its middle, and a
// roof that rises from over them to either side.
function canopy(L, p, m) {
  const cm = (p.c0 + p.c1) / 2;
  const half = (p.c1 - p.c0) / 2 + 0.4;
  const a0 = p.a0 + 4;
  const a1 = p.a1 - 4;
  const y = L.floor + CANOPY.up;
  const yaw = Math.atan2(L.dx, L.dz);
  const columns = [];
  for (let a = a0 + 3; a < a1 - 2; a += CANOPY.every) {
    box(m, ...W(L, a, cm, L.floor + CANOPY.up / 2), 0.22, CANOPY.up / 2, 0.22, yaw, PAL.column);
    columns.push(a);
  }
  for (const s of [-1, 1]) {
    const cIn = cm;
    const cOut = cm + s * half;
    const yIn = y;
    const yOut = y + CANOPY.wing;
    const t = CANOPY.thick;
    const pts = (a) => [W(L, a, cIn, yIn + t), W(L, a, cOut, yOut + t), W(L, a, cOut, yOut), W(L, a, cIn, yIn)];
    const [A0, A1, A2, A3] = pts(a0);
    const [B0, B1, B2, B3] = pts(a1);
    face(m, A0, B0, B1, A1, PAL.canopy, [0, 1, 0]);
    face(m, A3, B3, B2, A2, PAL.canopyUnder, [0, -1, 0]);
    face(m, A1, B1, B2, A2, PAL.canopy, [-L.dz * s, 0, L.dx * s]);
    face(m, A0, A1, A2, A3, PAL.canopy, [-L.dx, 0, -L.dz]);
    face(m, B0, B1, B2, B3, PAL.canopy, [L.dx, 0, L.dz]);
  }
  return columns;
}

// An entrance: its pylon, and (under the street) the escalators going down
// beside it, in a well walled with granite, under a canopy of glass.
export function buildEntrance(e, station, { ground, mats, under }) {
  const group = new THREE.Group();
  const m = new Mesher();
  m.surf = SURF.concrete;
  const dx = Math.sin(e.yaw);
  const dz = Math.cos(e.yaw);
  const [rx, rz] = [-dz, dx];
  const g0 = ground(e.x, e.z);
  // the pylon, to one side of the top of the well
  const px = e.x + rx * (WELL.half + 0.9);
  const pz = e.z + rz * (WELL.half + 0.9);
  const pg = ground(px, pz);
  box(m, px, pg + PYLON.h / 2, pz, PYLON.half, PYLON.h / 2, PYLON.half, e.yaw, PAL.bronze);
  const tex = pylonTop(station.lines.map((id) => mats.colour(id)));
  if (tex) {
    const mat = mats.sign(tex);
    for (let k = 0; k < 4; k++) {
      const a = e.yaw + (k * Math.PI) / 2;
      const sign = new THREE.Mesh(mats.signPlane, mat);
      sign.position.set(px + Math.sin(a) * (PYLON.half + 0.005), pg + PYLON.h - PYLON.top / 2 - 0.05, pz + Math.cos(a) * (PYLON.half + 0.005));
      sign.rotation.y = a;
      sign.scale.set(PYLON.half * 2 - 0.04, PYLON.top, 1);
      group.add(sign);
    }
  }
  if (under) {
    // the well: its walls going down, the escalators in it, its parapet round the top
    const at = (u, c, y) => [e.x + dx * u + rx * c, y, e.z + dz * u + rz * c];
    const depth = WELL.run * WELL.slope;
    m.surf = SURF.stone;
    for (const s of [-1, 1]) {
      const c = s * WELL.half;
      // the wall, inside
      face(m, at(0, c, g0 + 0.1), at(WELL.run, c, g0 + 0.1), at(WELL.run, c, g0 - depth - 0.5), at(0, c, g0 - 0.5), PAL.granite, [-rx * s, 0, -rz * s]);
      // the parapet along the top
      box(m, ...at(WELL.run / 2, c + s * 0.15, g0 + WELL.wall / 2 - 0.1), 0.15, WELL.wall / 2 + 0.1, WELL.run / 2 + 0.15, e.yaw, PAL.granite);
    }
    // and across the far end, and the end wall below it
    box(m, ...at(WELL.run + 0.15, 0, g0 + WELL.wall / 2 - 0.1), WELL.half + 0.3, WELL.wall / 2 + 0.1, 0.15, e.yaw, PAL.granite);
    m.surf = SURF.concrete;
    face(m, at(WELL.run, -WELL.half, g0 + 0.1), at(WELL.run, WELL.half, g0 + 0.1), at(WELL.run, WELL.half, g0 - depth - 3), at(WELL.run, -WELL.half, g0 - depth - 3), PAL.wall, [-dx, 0, -dz]);
    // the roof over the lower end (where it goes in under the street)
    face(m, at(WELL.run * 0.55, -WELL.half, g0 - 0.25), at(WELL.run, -WELL.half, g0 - 0.25), at(WELL.run, WELL.half, g0 - 0.25), at(WELL.run * 0.55, WELL.half, g0 - 0.25), PAL.wall, [0, -1, 0]);
    // two escalators, and stairs between
    for (const c of [-1.05, 1.05]) {
      const n = Math.ceil(WELL.run / 0.4);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        box(m, ...at(WELL.run * u, c, g0 - depth * u - 0.05), ESCALATOR.half - 0.08, 0.06, 0.19, e.yaw, PAL.step);
        box(m, ...at(WELL.run * u + 0.17, c, g0 - depth * u + 0.012), ESCALATOR.half - 0.1, 0.006, 0.025, e.yaw, PAL.stepEdge);
      }
      for (const s of [-1, 1]) {
        const cc = c + s * ESCALATOR.half;
        quad(m, at(0, cc, g0), at(WELL.run, cc, g0 - depth), at(WELL.run, cc, g0 - depth + 0.95), at(0, cc, g0 + 0.95), PAL.steel);
        quad(m, at(0, cc, g0), at(0, cc, g0 + 0.95), at(WELL.run, cc, g0 - depth + 0.95), at(WELL.run, cc, g0 - depth), PAL.steel);
        const len = Math.hypot(WELL.run, depth);
        const mid = at(WELL.run / 2, cc, g0 - depth / 2 + 1.0);
        handrail(m, mid, len, -Math.atan2(depth, WELL.run), e.yaw, PAL.handrail);
      }
    }
    // the canopy over its top: steel ribs arched over it, glass between
    const R = ENTRY_ROOF;
    const ribs = Math.round(R.run / R.rib);
    const arc = 10;
    const ribAt = (u, k, out = 0) => {
      // k round the arch, 0..arc: up from the parapet on one side, over, down the other
      const t = (k / arc) * Math.PI;
      const c = -Math.cos(t) * (WELL.half + 0.3 + out);
      const y = g0 + WELL.wall + Math.sin(t) * (R.up - WELL.wall) + out;
      return at(u, c, y);
    };
    m.surf = SURF.glass;
    for (let i = 0; i < ribs; i++) {
      const u0 = (i / ribs) * R.run;
      const u1 = ((i + 1) / ribs) * R.run;
      for (let k = 0; k < arc; k++) {
        const P = [ribAt(u0, k), ribAt(u1, k), ribAt(u1, k + 1), ribAt(u0, k + 1)];
        quad(m, P[0], P[1], P[2], P[3], PAL.glass);
        quad(m, P[0], P[3], P[2], P[1], PAL.glass);
      }
    }
    m.surf = SURF.steel;
    for (let i = 0; i <= ribs; i++) {
      const u = (i / ribs) * R.run;
      for (let k = 0; k < arc; k++) {
        const a = ribAt(u, k, 0.03);
        const b = ribAt(u, k + 1, 0.03);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const run = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        // a rib's piece: a box turned across the well, sloping as the arch does
        ribPiece(m, mid, run, Math.atan2(b[1] - a[1], (b[0] - a[0]) * rx + (b[2] - a[2]) * rz), e.yaw, PAL.rib);
      }
    }
  }
  group.add(meshOf(m, mats.solid));
  return group;
}

// A piece of a canopy's rib: across the well (sloping at `pitch` up from
// level across it), at `mid`, `run` long.
function ribPiece(m, mid, run, pitch, yaw, col) {
  const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
  const [rx, rz] = [-fz, fx];
  const h = run / 2;
  const cp = Math.cos(pitch) * h;
  const sp = Math.sin(pitch) * h;
  const a = [mid[0] - rx * cp, mid[1] - sp, mid[2] - rz * cp];
  const b = [mid[0] + rx * cp, mid[1] + sp, mid[2] + rz * cp];
  const w = 0.05;
  const P = (p, s, y) => [p[0] + fx * w * s, p[1] + y, p[2] + fz * w * s];
  for (const s of [-1, 1]) face(m, P(a, s, -0.06), P(b, s, -0.06), P(b, s, 0.06), P(a, s, 0.06), col, [fx * s, 0, fz * s]);
  face(m, P(a, -1, 0.06), P(b, -1, 0.06), P(b, 1, 0.06), P(a, 1, 0.06), col, [-Math.sin(pitch) * rx, Math.cos(pitch), -Math.sin(pitch) * rz]);
  face(m, P(a, -1, -0.06), P(b, -1, -0.06), P(b, 1, -0.06), P(a, 1, -0.06), col, [Math.sin(pitch) * rx, -Math.cos(pitch), Math.sin(pitch) * rz]);
}

export const ENTRANCE = { well: WELL, pylon: PYLON };
