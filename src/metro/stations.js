// What the Metro's stations look like, made in code.
//
// Under the street, a level is the station everyone knows: a barrel vault
// of coffered concrete over the tracks and the platforms, lit from below by
// a cove of light along its foot, so that it glows warm and darkens towards
// its crown. Its platforms are paved in red-brown tile, edged in pale
// granite with a row of lights set in the granite (which flash as a train
// comes in: `edges`). At one end a mezzanine spans the vault, with escalators
// down to each platform; at both ends the tracks run on into their tunnels.
// Brown pylons stand along the platforms with the station's name on them.
//
// Over the street, a level is its platforms, on the viaduct or on the
// ground, under the canopies Metro's open-air stations have: a concrete roof
// that rises to either side like a pair of wings, on a row of columns.
//
// At each of a station's entrances, the brown pylon with its M and a band
// for each line; under the street, the escalators going down beside it,
// walled in granite.
//
//   buildLevel(L, room, { ground, mats, vault }) -> { group, edges, under, spots, posts }
//     group:  everything, built round itself; edges: the material of its
//     platform-edge lights; under: whether it's under the street; spots: the
//     foot of each platform's escalator ({ x, y, z, yaw }), where you go up;
//     posts: what stands on its platforms, as solids (world/solids.js)
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
import { pylonTop, nameBoard } from './signs.js';

const COFFER = { size: 1.7, inset: 0.24, depth: 0.42 }; // m: a coffer's width; how far its sides come in; how deep
const MEZZ = { from: 6, deep: 12, up: 5.4, slab: 0.7 }; // m in from the vault's end; how far it spans; its floor over the platform's
const ESCALATOR = { run: 9.4, half: 0.62, every: 1.5 }; // m it takes to climb to the mezzanine; half its width; between them
const EDGE_GRANITE = 0.5; // m of granite along a platform's edge
const PYLON_EVERY = 46; // m between pylons along a platform
const CANOPY = { up: 3.7, wing: 0.85, thick: 0.32, every: 14 };
const WELL = { half: 2.2, run: 12, slope: 0.55, wall: 1.05 }; // an entrance's escalator well: half its width, how long, how steep, its parapet
const PYLON = { half: 0.3, h: 3.3, top: 1.05 };

const lin = (hex) => new THREE.Color(hex);
export const PAL = {
  vault: lin(0xb3a48e),
  tile: lin(0x7d4433),
  tileDark: lin(0x5e3428),
  granite: lin(0xc4c0b6),
  trackbed: lin(0x3a3835),
  wall: lin(0x8a8276),
  bronze: lin(0x4a3426),
  bronzeLight: lin(0x6b4c37),
  cove: lin(0xffd9a0),
  edgeLight: lin(0xfff1c8),
  steel: lin(0xa7aaad),
  step: lin(0x3c3d3f),
  canopy: lin(0xa29c91),
  canopyUnder: lin(0x8d877d),
  column: lin(0x958f84),
  rail: lin(0x55575a),
};

const _c = new THREE.Color();
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

// How lit a face of a coffer is: the light comes up from the cove along the
// vault's foot, so a face that looks down catches it and one that looks up
// is in its own shadow. (a, b, d: three of its corners; into: the way into
// the room, which it's turned to face.)
const _lit = new THREE.Color();
function lit(col, a, b, d, into, k) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] * into[0] + n[1] * into[1] + n[2] * into[2] < 0) n = n.map((v) => -v);
  const l = Math.hypot(...n) || 1;
  return _lit.copy(col).multiplyScalar(k * (0.62 + 0.55 * Math.max(0, -n[1] / l)));
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
  const glow = new Mesher();
  const edgeMesh = new Mesher();
  m.surf = SURF.concrete;
  shell.surf = SURF.concrete;
  const under = room.under;
  // the way along the level, and across it, in the world
  const along = [L.dx, 0, L.dz];
  const right = [-L.dz, 0, L.dx];
  const up = [0, 1, 0];
  const spots = [];
  // what stands on the platforms, to walk round: capsules (world/solids.js)
  const posts = [];
  const post = (a0, a1, c, r, top) => {
    const [x0, , z0] = W(L, a0, c, 0);
    const [x1, , z1] = W(L, a1, c, 0);
    posts.push({ ax: x0, az: z0, bx: x1, bz: z1, r, bottom: L.floor - 0.5, topA: L.floor + top, topB: L.floor + top });
  };

  if (under) {
    // ── the vault (or a part of it, on its own: buildVault) ──
    if (vault) vaultPart(shell, L, room, 0, 1);
    // ── its ends: a wall each, with the tunnels' mouths in it ──
    for (const [a, sign] of [[room.a0, 1], [room.a1, -1]]) {
      const into = [along[0] * sign, 0, along[2] * sign];
      const n = Math.round((room.c1 - room.c0) / 0.5);
      for (let i = 0; i < n; i++) {
        const c0 = room.c0 + ((room.c1 - room.c0) * i) / n;
        const c1 = room.c0 + ((room.c1 - room.c0) * (i + 1)) / n;
        const cm = (c0 + c1) / 2;
        const top0 = roofOf(room, c0);
        const top1 = roofOf(room, c1);
        const onTrack = L.tracks.some((t) => Math.abs(cm - t) < TUBE.half);
        const bottom = onTrack ? L.rail + TUBE.top - 0.4 : L.rail - 0.35;
        if (Math.min(top0, top1) <= bottom) continue;
        face(shell, W(L, a, c0, bottom), W(L, a, c1, bottom), W(L, a, c1, top1), W(L, a, c0, top0), PAL.wall, into);
      }
    }
    // ── the floor: the trackbed, and the platforms on it ──
    face(shell, W(L, room.a0, room.c0, L.rail - 0.35), W(L, room.a1, room.c0, L.rail - 0.35), W(L, room.a1, room.c1, L.rail - 0.35), W(L, room.a0, room.c1, L.rail - 0.35), PAL.trackbed, up);
    // (and where the vault comes down to the floor, outside the outermost
    // platforms: a strip of floor, and the cove of light that lights it)
    const cs = L.platforms.map((p) => [p.c0, p.c1]).flat();
    const outerL = Math.min(...cs, ...L.tracks.map((t) => t - TUBE.half));
    const outerR = Math.max(...cs, ...L.tracks.map((t) => t + TUBE.half));
    for (const [c0, c1] of [[room.c0, outerL], [outerR, room.c1]]) {
      if (c1 - c0 < 0.05) continue;
      box(m, ...W(L, (room.a0 + room.a1) / 2, (c0 + c1) / 2, (L.floor + L.rail - 0.35) / 2), (c1 - c0) / 2, (L.floor - L.rail + 0.35) / 2, (room.a1 - room.a0) / 2, Math.atan2(L.dx, L.dz), PAL.wall);
    }
    // (and up from it to where the vault springs)
    for (const [c, s] of [[room.c0, 1], [room.c1, -1]]) face(shell, W(L, room.a0, c, L.floor), W(L, room.a1, c, L.floor), W(L, room.a1, c, room.spring + 0.02), W(L, room.a0, c, room.spring + 0.02), PAL.wall, [right[0] * s, 0, right[2] * s]);
    for (const c of [room.c0 + 0.35, room.c1 - 0.35]) {
      const y = roofOf(room, c) - 0.05;
      for (let a = room.a0 + 2; a < room.a1 - 2; a += 6) box(glow, ...W(L, a + 2.5, c, Math.min(y, L.floor + 0.9)), 0.08, 0.05, 2.6, Math.atan2(L.dx, L.dz), PAL.cove);
    }
  }

  // ── the platforms ──
  for (const p of L.platforms) {
    const bottom = under ? L.rail - 0.35 : L.what === 'bridge' ? L.rail - 2.05 : Math.min(L.rail - 0.4, ground(...W(L, (p.a0 + p.a1) / 2, (p.c0 + p.c1) / 2, 0).filter((_, i) => i !== 1)) - 0.3);
    const am = (p.a0 + p.a1) / 2;
    const cm = (p.c0 + p.c1) / 2;
    const yaw = Math.atan2(L.dx, L.dz);
    // the slab, under the tile
    m.surf = SURF.concrete;
    box(m, ...W(L, am, cm, (L.floor - 0.06 + bottom) / 2), (p.c1 - p.c0) / 2, (L.floor - 0.06 - bottom) / 2, (p.a1 - p.a0) / 2, yaw, PAL.wall);
    // the tile, and the granite along each edge beside a track
    const edges = L.tracks.flatMap((t) => (Math.abs(t - p.c0) < 2.2 ? [[p.c0, 1]] : Math.abs(t - p.c1) < 2.2 ? [[p.c1, -1]] : []));
    let t0 = p.c0;
    let t1 = p.c1;
    m.surf = SURF.stone;
    for (const [c, inward] of edges) {
      const ca = c;
      const cb = c + inward * EDGE_GRANITE;
      box(m, ...W(L, am, (ca + cb) / 2, L.floor - 0.03), EDGE_GRANITE / 2, 0.03, (p.a1 - p.a0) / 2, yaw, PAL.granite);
      if (inward > 0) t0 = cb;
      else t1 = cb;
      // its lights, set in the granite
      for (let a = p.a0 + 0.8; a < p.a1 - 0.5; a += 1.25) box(edgeMesh, ...W(L, a, c + inward * 0.3, L.floor + 0.002), 0.07, 0.006, 0.07, yaw, PAL.edgeLight);
    }
    m.surf = SURF.clay;
    for (let a = p.a0; a < p.a1 - 0.01; a += 6) {
      const a1 = Math.min(p.a1, a + 6);
      face(m, W(L, a, t0, L.floor), W(L, a1, t0, L.floor), W(L, a1, t1, L.floor), W(L, a, t1, L.floor), Math.floor(a / 6) % 2 ? PAL.tile : _c.copy(PAL.tile).lerp(PAL.tileDark, 0.25), up);
    }
    m.surf = SURF.concrete;
    // pylons along it, with the name on (signs: below)
    if (p.c1 - p.c0 > 2.6) {
      for (let a = p.a0 + 20; a < p.a1 - 15; a += PYLON_EVERY) {
        pylonAt(L, a, cm, yaw, m, group, mats);
        post(a - 0.62, a + 0.62, cm, 0.2, 2.9);
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
    const yaw = Math.atan2(L.dx, L.dz);
    if (c1 - c0 > 4) {
      box(m, ...W(L, (front + end) / 2, (c0 + c1) / 2, deck - MEZZ.slab / 2), (c1 - c0) / 2, MEZZ.slab / 2, (end - front) / 2, yaw, PAL.wall);
      // its parapet, along the front, and the railing on it
      box(m, ...W(L, front + 0.15, (c0 + c1) / 2, deck + 0.5), (c1 - c0) / 2, 0.5, 0.15, yaw, PAL.vault);
      box(m, ...W(L, front + 0.15, (c0 + c1) / 2, deck + 1.06), (c1 - c0) / 2, 0.04, 0.09, yaw, PAL.rail);
      // the vault's end wall over it, in brown
      // escalators: from the foot, on each platform, up to the mezzanine's front
      for (const p of L.platforms) {
        const foot = front - ESCALATOR.run;
        if (foot < p.a0 + 10) continue;
        const cm = (p.c0 + p.c1) / 2;
        const n = Math.max(1, Math.min(3, Math.floor((p.c1 - p.c0 - 0.8) / ESCALATOR.every)));
        for (let k = 0; k < n; k++) {
          const c = cm + (k - (n - 1) / 2) * ESCALATOR.every;
          escalator(m, L, foot, front, L.floor, deck, c, yaw);
          post(foot + 0.4, front, c, ESCALATOR.half, MEZZ.up);
        }
        // and a wall under the mezzanine's front, behind them
        const at = W(L, foot - 1.6, cm, L.floor);
        spots.push({ x: at[0], y: L.floor, z: at[2], yaw: Math.atan2(L.dx, L.dz), level: L });
      }
    }
  } else {
    // up from the street at each end of each platform
    for (const p of L.platforms) {
      const at = W(L, p.a1 - 4, (p.c0 + p.c1) / 2, L.floor);
      spots.push({ x: at[0], y: L.floor, z: at[2], yaw: Math.atan2(L.dx, L.dz), level: L });
    }
  }

  if (!shell.empty) group.add(meshOf(shell, mats.vault));
  if (!m.empty) group.add(meshOf(m, under ? mats.vaultSolid : mats.solid));
  if (!glow.empty) group.add(meshOf(glow, mats.glow));
  const edges = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  if (!edgeMesh.empty) group.add(meshOf(edgeMesh, edges));
  return { group, edges, under, spots, posts };
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
  const right = [-L.dz, 0, L.dx];
  const k = room.crown - room.spring;
  const arc = Math.PI * Math.sqrt((room.half * room.half + k * k) / 2);
  const nTh = Math.max(6, Math.round(arc / COFFER.size));
  const nA = Math.max(4, Math.round((room.a1 - room.a0) / COFFER.size));
  const shade = (y) => _c.copy(PAL.vault).multiplyScalar(1.18 - 0.62 * Math.min(1, Math.max(0, (y - room.spring) / k)));
  for (let i = 0; i < nTh; i++) {
    const t0 = (i / nTh) * Math.PI;
    const t1 = ((i + 1) / nTh) * Math.PI;
    const tm = (t0 + t1) / 2;
    const p0 = vaultAt(room, t0);
    const p1 = vaultAt(room, t1);
    const pm = vaultAt(room, tm);
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
      const inner = outer.map(([a, c, y]) => [am + (a - am) * (1 - COFFER.inset * 2), pm.c + (c - pm.c) * (1 - COFFER.inset * 2) - pm.nc * COFFER.depth, pm.y + (y - pm.y) * (1 - COFFER.inset * 2) - pm.ny * COFFER.depth]);
      const toW = ([a, c, y]) => W(L, a, c, y);
      const into = [right[0] * pm.nc, pm.ny, right[2] * pm.nc];
      const col = shade(pm.y);
      face(shell, toW(inner[0]), toW(inner[1]), toW(inner[2]), toW(inner[3]), lit(col, toW(inner[0]), toW(inner[1]), toW(inner[3]), into, 0.78), into);
      for (let e = 0; e < 4; e++) {
        const f = (e + 1) % 4;
        const [a, b, c, d] = [toW(outer[e]), toW(outer[f]), toW(inner[f]), toW(inner[e])];
        face(shell, a, b, c, d, lit(col, a, b, d, into, 1), into);
      }
    }
  }
}

function roofOf(room, c) {
  const u = Math.min(1, Math.abs(c - room.mid) / room.half);
  return room.spring + (room.crown - room.spring) * Math.sqrt(1 - u * u);
}

// An escalator, from (foot, y0) to (top, y1) along the level, c across.
function escalator(m, L, foot, top, y0, y1, c, yaw) {
  const n = Math.ceil(Math.hypot(top - foot, y1 - y0) / 0.4);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const a = foot + (top - foot) * u;
    const y = y0 + (y1 - y0) * u;
    box(m, ...W(L, a, c, y - 0.05), ESCALATOR.half - 0.08, 0.06, 0.19, yaw, PAL.step);
  }
  // balustrades either side: a sloping panel and a handrail
  for (const s of [-1, 1]) {
    const cc = c + s * ESCALATOR.half;
    const a0 = W(L, foot, cc, y0);
    const a1 = W(L, top, cc, y1);
    const b0 = W(L, foot, cc, y0 + 0.95);
    const b1 = W(L, top, cc, y1 + 0.95);
    quad(m, a0, a1, b1, b0, PAL.steel);
    quad(m, a0, b0, b1, a1, PAL.steel);
  }
  // its truss underneath, down to the floor
  const under = [W(L, foot, c - ESCALATOR.half, y0), W(L, top, c - ESCALATOR.half, y1 - 0.4), W(L, top, c + ESCALATOR.half, y1 - 0.4), W(L, foot, c + ESCALATOR.half, y0)];
  quad(m, under[0], under[3], under[2], under[1], PAL.wall);
  quad(m, under[0], under[1], under[2], under[3], PAL.wall);
}

// A pylon on a platform: brown, and its name on either face.
function pylonAt(L, a, c, yaw, m, group, mats) {
  box(m, ...W(L, a, c, L.floor + 1.45), 0.16, 1.45, 0.8, yaw, PAL.bronze);
  const tex = nameBoard(L.station.name, L.lines.map((id) => mats.colour(id)));
  if (!tex) return;
  const mat = mats.sign(tex);
  for (const s of [-1, 1]) {
    const sign = new THREE.Mesh(mats.signPlane, mat);
    const p = W(L, a, c + s * 0.17, L.floor + 2.45);
    sign.position.set(p[0], p[1], p[2]);
    sign.rotation.y = yaw + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
    sign.scale.set(1.5, 0.235, 1);
    group.add(sign);
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
// beside it, in a well walled with granite.
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
    for (const s of [-1, 1]) {
      const c = s * WELL.half;
      // the wall, inside
      face(m, at(0, c, g0 + 0.1), at(WELL.run, c, g0 + 0.1), at(WELL.run, c, g0 - depth - 0.5), at(0, c, g0 - 0.5), PAL.granite, [-rx * s, 0, -rz * s]);
      // the parapet along the top
      box(m, ...at(WELL.run / 2, c + s * 0.15, g0 + WELL.wall / 2 - 0.1), 0.15, WELL.wall / 2 + 0.1, WELL.run / 2 + 0.15, e.yaw, PAL.granite);
    }
    // and across the far end, and the end wall below it
    box(m, ...at(WELL.run + 0.15, 0, g0 + WELL.wall / 2 - 0.1), WELL.half + 0.3, WELL.wall / 2 + 0.1, 0.15, e.yaw, PAL.granite);
    face(m, at(WELL.run, -WELL.half, g0 + 0.1), at(WELL.run, WELL.half, g0 + 0.1), at(WELL.run, WELL.half, g0 - depth - 3), at(WELL.run, -WELL.half, g0 - depth - 3), PAL.wall, [-dx, 0, -dz]);
    // the roof over the lower end (where it goes in under the street)
    face(m, at(WELL.run * 0.55, -WELL.half, g0 - 0.25), at(WELL.run, -WELL.half, g0 - 0.25), at(WELL.run, WELL.half, g0 - 0.25), at(WELL.run * 0.55, WELL.half, g0 - 0.25), PAL.wall, [0, -1, 0]);
    // two escalators, and stairs between
    for (const c of [-1.05, 1.05]) {
      const n = Math.ceil(WELL.run / 0.4);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        box(m, ...at(WELL.run * u, c, g0 - depth * u - 0.05), ESCALATOR.half - 0.08, 0.06, 0.19, e.yaw, PAL.step);
      }
      for (const s of [-1, 1]) {
        const cc = c + s * ESCALATOR.half;
        quad(m, at(0, cc, g0), at(WELL.run, cc, g0 - depth), at(WELL.run, cc, g0 - depth + 0.95), at(0, cc, g0 + 0.95), PAL.steel);
        quad(m, at(0, cc, g0), at(0, cc, g0 + 0.95), at(WELL.run, cc, g0 - depth + 0.95), at(WELL.run, cc, g0 - depth), PAL.steel);
      }
    }
  }
  group.add(meshOf(m, mats.solid));
  return group;
}

export const ENTRANCE = { well: WELL, pylon: PYLON };
