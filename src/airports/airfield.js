// What an airfield looks like, made in code like everything else:
// vertex-coloured faces merged into a few meshes, built round the middle of
// the strip and put in the world there (render/origin.js).
//
//   the strip    asphalt, on its bank (airports.js), with white edges, a
//                dashed centre line, threshold bars and its number at each
//                end, the way it points (09 for due east), and lights along
//                both sides that come on after dark, green across the ends
//   the apron    concrete slabs beside its middle, a yellow line in to where
//                the plane stands
//   the banks    grassed slopes down from the edges to wherever they meet
//                the hillside
//   round it     a board terminal with a porch and a departures board, a
//                timber tower with a glass cab and a beacon that turns
//                green and white at night, a round-roofed hangar, a fuel
//                tank on its cradle, and a windsock
//
//   buildAirfield(site, ground, materials) -> {
//     object     the group, placed and turned where the field is
//     solids     capsules for the world's Solids: walk on the strip, the
//                apron and the banks; bump into the buildings
//     blockers   boxes the camera doesn't see into ({ inv, half }: core/geom.js)
//     lamps      the runway lights' and windows' material, to brighten at night
//     windows    the lit windows (shown after dark)
//     beacon     [green, white]: the tower's beacon, to flash in turn
//     sock       the windsock, to turn downwind and droop in a calm
//   }
//   materials: { body, paint (body's, drawn over the asphalt), lamps }
//   ground(x, z) -> height of the ground in the world

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { quad, beam } from '../build/faces.js';
import { phash } from '../noise.js';
import { toWorld } from '../world/frame.js';
import { HALF, STRIP, APRON, BANK, PLAN, topAt, bearingOf } from './airports.js';

const col = (hex) => new THREE.Color(hex);
const PAL = {
  asphalt: col(0x3c3d3f),
  asphaltPale: col(0x4a4b4c),
  concrete: col(0x8f8c85),
  concreteDark: col(0x7a7770),
  white: col(0xe4e2da),
  yellow: col(0xd9a92e),
  gravel: col(0x7b746a),
  earth: col(0x5f5038),
  grass: col(0x7c9440),
  boards: col(0xd6cdb4),
  trim: col(0x2f6b45),
  roof: col(0x4a4038),
  tin: col(0x8c9196),
  tinDark: col(0x6c7176),
  glass: col(0x1f2a33),
  timber: col(0x6d5c49),
  timberDark: col(0x4a3d31),
  iron: col(0x2b2724),
  board: col(0x1d2224),
  red: col(0xb8432d),
  sockOrange: col(0xe0662c),
  lamp: col(0xfff0c8),
  green: col(0x3cff6a),
  window: col(0xffd38a),
};
const W2 = STRIP.width / 2;
// Where things are, in the field's frame (m): [x0, z0, x1, z1].
export const TERMINAL = [31, -9, 39, 5];
const PORCH = 2.4; // m the porch roof comes out in front of the terminal
const TOWER = [34, 9, 38, 13];
const CAB = { floor: 7.6, glass: [8.7, 10.0], roof: 10.4, over: 0.5 };
const HANGAR = [29, 16, 40, 26];
const TANK = [33, -25, 39, -19];
export const SOCK = { x: 37.5, z: -14, pole: 6 };
export const PARK = { x: 19, z: 0 }; // where the plane stands on the apron
const LIGHTS_EVERY = 30; // m between the lights along the strip's edges
const RIM_STEP = 4; // m between the points round the top of the banks
const WALL = 3; // m, the terminal's walls

const _w = { x: 0, z: 0 };
const _c = new THREE.Color();

export function buildAirfield(site, ground, materials) {
  const y0 = topAt(site, 0);
  const T = (lz) => topAt(site, lz) - y0; // the top of the strip and the apron, as built
  const G = (lx, lz) => {
    toWorld(site, lx, lz, _w);
    return ground(_w.x, _w.z) - y0;
  };
  const W = (lx, lz) => toWorld(site, lx, lz, { x: 0, z: 0 });
  const m = new Mesher();
  const paint = new Mesher();
  const lamps = new Mesher();
  const lit = new Mesher();
  const solids = [];
  const blockerBoxes = []; // [cx, cy, cz, hx, hy, hz] in the frame

  // ── The strip and the apron ──
  // A flat face that follows the strip's top, from x0 to x1 across and z0 to
  // z1 along, cut at each of the strip's own heights.
  const flat = (mm, x0, x1, z0, z1, color, lift = 0) => {
    let za = z0;
    while (za < z1 - 1e-6) {
      const zb = Math.min(z1, (Math.floor((za + HALF) / site.ds + 1e-6) + 1) * site.ds - HALF);
      const ya = T(za) + lift;
      const yb = T(zb) + lift;
      quad(mm, [x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za], color);
      za = zb;
    }
  };
  for (let i = 0; i < site.h.length - 1; i++) {
    const z0 = -HALF + i * site.ds;
    const z1 = z0 + site.ds;
    for (let x = -W2; x < W2; x += 4) flat(m, x, x + 4, z0, z1, _c.copy(PAL.asphalt).lerp(PAL.asphaltPale, phash(i >> 2, x, 11) * 0.5));
  }
  for (let z = APRON[1]; z < APRON[3] - 1e-6; z += 4) {
    for (let x = APRON[0]; x < APRON[2] - 1e-6; x += 4) {
      const slab = (Math.round(z / 4) + Math.round(x / 4)) & 1;
      flat(m, x, Math.min(APRON[2], x + 4), z, Math.min(APRON[3], z + 4), _c.copy(slab ? PAL.concrete : PAL.concreteDark).multiplyScalar(0.95 + phash(x, z, 5) * 0.1));
    }
  }

  // ── Paint ──
  const LIFT = 0.012;
  for (const s of [-1, 1]) flat(paint, s * (W2 - 0.55), s * (W2 - 0.25), -HALF, HALF, PAL.white, LIFT);
  for (let z = -HALF + 26; z + 10 <= HALF - 26; z += 18) flat(paint, -0.25, 0.25, z, z + 10, PAL.white, LIFT);
  // threshold bars and the number at each end, read by whoever lands over it
  const number = (bearing) => String(Math.round(bearing / 10) % 36 || 36).padStart(2, '0');
  for (const end of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      for (const s of [-1, 1]) {
        const x = s * (1.6 + k * 1.8);
        const za = end * (HALF - 2);
        const zb = end * (HALF - 12);
        flat(paint, x - 0.45, x + 0.45, Math.min(za, zb), Math.max(za, zb), PAL.white, LIFT);
      }
    }
    // landing over this end you head the other way along the strip
    const heading = end < 0 ? site.yaw : site.yaw + Math.PI;
    digits(number(bearingOf(heading)), end, (lx0, lx1, lz0, lz1) => flat(paint, lx0, lx1, lz0, lz1, PAL.white, LIFT));
  }
  // the line in from the strip to where the plane stands, and a bar to stop at
  flat(paint, W2, PARK.x, -0.15, 0.15, PAL.yellow, LIFT);
  flat(paint, PARK.x - 0.15, PARK.x + 0.15, -8, 8, PAL.yellow, LIFT);
  flat(paint, PARK.x - 3, PARK.x + 3, 8, 8.4, PAL.yellow, LIFT);
  flat(paint, PARK.x - 3, PARK.x + 3, -8.4, -8, PAL.yellow, LIFT);

  // ── The banks ──
  const rim = rimOf();
  const toes = rim.map((r) => {
    const top = T(r.z);
    // out along the bank's fall until it's under the ground: a metre at a
    // time, then halved down to a few centimetres
    let lo = 0;
    let hi = 0;
    for (let t = 0.5; t <= site.toe + 2; t += 1) {
      if (top - t * BANK <= G(r.x + r.nx * t, r.z + r.nz * t)) {
        hi = t;
        break;
      }
      lo = t;
      hi = t + 1;
    }
    for (let k = 0; k < 5; k++) {
      const mid = (lo + hi) / 2;
      if (top - mid * BANK <= G(r.x + r.nx * mid, r.z + r.nz * mid)) hi = mid;
      else lo = mid;
    }
    const t = hi;
    return { t, x: r.x + r.nx * t, z: r.z + r.nz * t, y: top - t * BANK, top };
  });
  const shoulder = (k) => _c.copy(PAL.gravel).lerp(PAL.grass, 0.35 + phash(k, 1, 3) * 0.2).clone();
  const foot = (k) => _c.copy(PAL.grass).multiplyScalar(0.82 + phash(k, 2, 4) * 0.3).lerp(PAL.earth, 0.15).clone();
  for (let k = 0; k < rim.length; k++) {
    const k1 = (k + 1) % rim.length;
    if (rim[k].cut) continue;
    const a = rim[k];
    const b = rim[k1];
    const ta = toes[k];
    const tb = toes[k1];
    if (ta.t < 0.05 && tb.t < 0.05) continue;
    quad(m, [a.x, ta.top, a.z], [ta.x, ta.y - 0.15, ta.z], [tb.x, tb.y - 0.15, tb.z], [b.x, tb.top, b.z], [shoulder(k), foot(k), foot(k1), shoulder(k1)]);
  }
  // what's solid of them: a capsule down each fall line
  const lowest = Math.min(...toes.map((t) => t.y));
  for (let k = 0; k < rim.length; k++) {
    const a = W(rim[k].x, rim[k].z);
    const b = W(toes[k].x, toes[k].z);
    solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 2.1, topA: toes[k].top + y0, topB: toes[k].y + y0, bottom: lowest + y0 - 1, step: 0.7, surface: 'grass' });
  }
  // ...and of the strip and the apron
  const along = (x, z0, z1, r) => {
    for (let z = z0; z < z1 - 1e-6; z += 8) {
      const zb = Math.min(z1, z + 8);
      const a = W(x, z);
      const b = W(x, zb);
      solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r, topA: T(z) + y0, topB: T(zb) + y0, bottom: lowest + y0 - 1, step: 0.7, surface: 'tarmac' });
    }
  };
  for (const x of [-5, 0, 5]) along(x, -HALF + 3.3, HALF - 3.3, 3.3);
  for (const x of [12, 18, 24, 30, 36]) along(x, APRON[1] + 3.3, APRON[3] - 3.3, 3.3);

  // ── Lights ──
  const lampAt = (x, z, color) => {
    const y = T(z);
    beam(m, [x, y, z], [x, y + 0.3, z], 0.06, 0.06, PAL.iron);
    beam(lamps, [x, y + 0.3, z - 0.09], [x, y + 0.3, z + 0.09], 0.18, 0.16, color);
  };
  for (let z = -HALF; z <= HALF + 1e-6; z += LIGHTS_EVERY) for (const s of [-1, 1]) lampAt(s * (W2 + 0.6), z, PAL.lamp);
  for (const end of [-1, 1]) for (let x = -6; x <= 6; x += 3) lampAt(x, end * (HALF - 0.4), PAL.green);

  // ── The terminal ──
  const terminalFloor = Math.max(T(TERMINAL[1]), T(TERMINAL[3])) + 0.15;
  building(m, lit, TERMINAL, terminalFloor, T);
  {
    const [x0, z0, x1, z1] = TERMINAL;
    const f = terminalFloor;
    for (const [ax, az, bx, bz] of [
      [x0, z0, x0, z1],
      [x1, z0, x1, z1],
      [x0, z0, x1, z0],
      [x0, z1, x1, z1],
    ]) {
      const a = W(ax, az);
      const b = W(bx, bz);
      solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 0.25, topA: f + y0 + WALL, topB: f + y0 + WALL, bottom: f + y0 - 1 });
    }
    for (const pz of [z0 + 1, (z0 + z1) / 2 + 2, z1 - 1]) {
      const p = W(x0 - PORCH + 0.25, pz);
      solids.push({ ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 0.14, topA: f + y0 + 2.6, topB: f + y0 + 2.6, bottom: f + y0 - 1 });
    }
    blockerBoxes.push([(x0 + x1) / 2, f + 2.2, (z0 + z1) / 2, (x1 - x0) / 2, 2.4, (z1 - z0) / 2]);
  }

  // ── The tower ──
  const towerBase = Math.max(T(TOWER[1]), T(TOWER[3])) + 0.1;
  tower(m, lit, TOWER, towerBase, T);
  for (const [x, z] of [
    [TOWER[0], TOWER[1]],
    [TOWER[2], TOWER[1]],
    [TOWER[2], TOWER[3]],
    [TOWER[0], TOWER[3]],
  ]) {
    const p = W(x, z);
    solids.push({ ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 0.25, topA: towerBase + y0 + CAB.floor, topB: towerBase + y0 + CAB.floor, bottom: towerBase + y0 - 1 });
  }
  blockerBoxes.push([(TOWER[0] + TOWER[2]) / 2, towerBase + (CAB.floor + CAB.roof) / 2, (TOWER[1] + TOWER[3]) / 2, (TOWER[2] - TOWER[0]) / 2 + CAB.over, (CAB.roof - CAB.floor) / 2, (TOWER[3] - TOWER[1]) / 2 + CAB.over]);
  const beaconY = towerBase + CAB.roof + 1.7;
  const beaconAt = [(TOWER[0] + TOWER[2]) / 2, beaconY, (TOWER[1] + TOWER[3]) / 2];

  // ── The hangar ──
  const hangarBase = Math.min(T(HANGAR[1]), T(HANGAR[3])) - 0.2;
  hangar(m, HANGAR, hangarBase);
  {
    const [x0, z0, x1, z1] = HANGAR;
    const r = (z1 - z0) / 2;
    for (const [ax, az, bx, bz] of [
      [x0, z0, x1, z0],
      [x0, z1, x1, z1],
      [x1, z0, x1, z1],
    ]) {
      const a = W(ax, az);
      const b = W(bx, bz);
      solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 0.3, topA: hangarBase + y0 + r * 0.6, topB: hangarBase + y0 + r * 0.6, bottom: hangarBase + y0 - 1 });
    }
    blockerBoxes.push([(x0 + x1) / 2, hangarBase + r / 2, (z0 + z1) / 2, (x1 - x0) / 2, r / 2, r]);
  }

  // ── The fuel tank, and the windsock ──
  const tankBase = Math.min(T(TANK[1]), T(TANK[3]));
  fuelTank(m, TANK, tankBase);
  {
    const a = W(TANK[0] + 0.5, (TANK[1] + TANK[3]) / 2);
    const b = W(TANK[2] - 0.5, (TANK[1] + TANK[3]) / 2);
    solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 1.25, topA: tankBase + y0 + 2.7, topB: tankBase + y0 + 2.7, bottom: tankBase + y0 - 1 });
  }
  const sockBase = T(SOCK.z);
  beam(m, [SOCK.x, sockBase, SOCK.z], [SOCK.x, sockBase + SOCK.pole, SOCK.z], 0.12, 0.12, PAL.white);
  beam(m, [SOCK.x, sockBase + SOCK.pole - 0.1, SOCK.z - 0.4], [SOCK.x, sockBase + SOCK.pole - 0.1, SOCK.z + 0.4], 0.06, 0.06, PAL.iron);
  {
    const p = W(SOCK.x, SOCK.z);
    solids.push({ ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 0.12, topA: sockBase + y0 + SOCK.pole, topB: sockBase + y0 + SOCK.pole, bottom: sockBase + y0 - 1 });
  }

  // ── Putting it together ──
  const object = new THREE.Group();
  object.position.set(site.x, y0, site.z);
  object.rotation.y = site.yaw;
  const body = new THREE.Mesh(m.build(), materials.body);
  body.castShadow = true;
  body.receiveShadow = true;
  object.add(body);
  const painted = new THREE.Mesh(paint.build(), materials.paint);
  painted.receiveShadow = true;
  object.add(painted);
  object.add(new THREE.Mesh(lamps.build(), materials.lamps));
  const windows = new THREE.Mesh(lit.build(), materials.lamps);
  object.add(windows);
  // the beacon: a green lamp and a white one, flashed in turn
  const beacon = [PAL.green, PAL.white].map((c, k) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    b.position.set(beaconAt[0] + (k ? 0.2 : -0.2), beaconAt[1], beaconAt[2]);
    object.add(b);
    return b;
  });
  const sock = windsock();
  sock.position.set(SOCK.x, sockBase + SOCK.pole - 0.1, SOCK.z);
  object.add(sock);
  object.updateMatrixWorld(true);
  const blockers = blockerBoxes.map(([cx, cy, cz, hx, hy, hz]) => {
    const local = new THREE.Matrix4().makeTranslation(cx, cy, cz);
    return { inv: object.matrixWorld.clone().multiply(local).invert(), half: [hx, hy, hz] };
  });
  return { object, solids, blockers, windows, beacon, sock };
}

// The points round the top of the banks, in the frame: going round the
// plan's outline (the strip and the apron as one), each with the way out
// from it (nx, nz). Round an outside corner they fan out from the corner;
// at an inside one, where the apron meets the strip, the run is cut
// (cut: no face from this point to the next).
function rimOf() {
  // the outline, round the plan, and the way out from each side of it
  const [, az0, ax1, az1] = APRON;
  const pts = [
    [-W2, -HALF],
    [W2, -HALF],
    [W2, az0],
    [ax1, az0],
    [ax1, az1],
    [W2, az1],
    [W2, HALF],
    [-W2, HALF],
  ];
  const n = pts.length;
  const out = [];
  const normal = (k) => {
    const [x0, z0] = pts[k];
    const [x1, z1] = pts[(k + 1) % n];
    const l = Math.hypot(x1 - x0, z1 - z0);
    // the outline goes round with the plan on its left: out is to its right
    return [(z1 - z0) / l, -(x1 - x0) / l];
  };
  for (let k = 0; k < n; k++) {
    const [x0, z0] = pts[k];
    const [x1, z1] = pts[(k + 1) % n];
    const [nx, nz] = normal(k);
    const l = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.round(l / RIM_STEP));
    for (let i = 0; i < steps; i++) out.push({ x: x0 + ((x1 - x0) * i) / steps, z: z0 + ((z1 - z0) * i) / steps, nx, nz });
    // the corner at the end of this side
    const [mx, mz] = normal((k + 1) % n);
    const turn = Math.atan2(nx * mz - nz * mx, nx * mx + nz * mz);
    const a0 = Math.atan2(nz, nx);
    if (turn > 0) {
      // outside: fan round it
      out.push({ x: x1, z: z1, nx, nz });
      for (let f = 1; f <= 3; f++) {
        const a = a0 + (turn * f) / 4;
        out.push({ x: x1, z: z1, nx: Math.cos(a), nz: Math.sin(a) });
      }
    } else {
      out.push({ x: x1, z: z1, nx, nz, cut: true });
    }
  }
  return out;
}

// The runway's number, painted across the end of the strip (end: -1 for the
// -z end, read by someone heading +z): two seven-segment digits, each
// segment a rectangle in the frame given to rect(x0, x1, z0, z1).
const DIGIT = { w: 2.8, h: 6.5, gap: 1.1, from: 16 }; // m; from: the end to the digits' feet
// Each segment's rectangle in a digit [u0, v0, u1, v1]: u to the reader's
// right, v up the digit, both 0..1.
const SEGMENTS = {
  a: [0, 0.885, 1, 1],
  b: [0.73, 0.5, 1, 1],
  c: [0.73, 0, 1, 0.5],
  d: [0, 0, 1, 0.115],
  e: [0, 0, 0.27, 0.5],
  f: [0, 0.5, 0.27, 1],
  g: [0, 0.4425, 1, 0.5575],
};
const GLYPHS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
function digits(text, end, rect) {
  const total = text.length * DIGIT.w + (text.length - 1) * DIGIT.gap;
  const foot = HALF - DIGIT.from;
  [...text].forEach((ch, i) => {
    const left = -total / 2 + i * (DIGIT.w + DIGIT.gap);
    for (const s of GLYPHS[Number(ch)]) {
      const [u0, v0, u1, v1] = SEGMENTS[s];
      const U0 = left + u0 * DIGIT.w;
      const U1 = left + u1 * DIGIT.w;
      const V0 = v0 * DIGIT.h;
      const V1 = v1 * DIGIT.h;
      // heading +z, the reader's right is -x; heading -z, it's +x
      if (end < 0) rect(-U1, -U0, -foot + V0, -foot + V1);
      else rect(U0, U1, foot - V1, foot - V0);
    }
  });
}

// A box from its corners in the frame, square to it.
function block(m, x0, y0, z0, x1, y1, z1, color) {
  beam(m, [(x0 + x1) / 2, y0, (z0 + z1) / 2], [(x0 + x1) / 2, y1, (z0 + z1) / 2], x1 - x0, z1 - z0, color, [0, 0, 1]);
}

// The terminal: board walls on a concrete plinth, a gabled roof, a porch
// along its front (the apron side, -x) with a bench under it, the door, two
// windows and the departures board.
function building(m, lit, [x0, z0, x1, z1], f, T) {
  const low = Math.min(T(z0), T(z1)) - 0.3;
  block(m, x0 - 0.1, low, z0 - 0.1, x1 + 0.1, f, z1 + 0.1, PAL.concreteDark);
  block(m, x0, f, z0, x1, f + WALL, z1, PAL.boards);
  // corner boards and a band under the eaves, green
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ])
    block(m, x - 0.08, f, z - 0.08, x + 0.08, f + WALL, z + 0.08, PAL.trim);
  // the roof: its ridge along the building, over the middle
  const ridge = f + WALL + 1.7;
  const mx = (x0 + x1) / 2;
  const o = 0.5;
  const e = f + WALL - 0.05;
  quad(m, [x0 - o, e, z0 - o], [x0 - o, e, z1 + o], [mx, ridge, z1 + o], [mx, ridge, z0 - o], PAL.roof);
  quad(m, [x1 + o, e, z1 + o], [x1 + o, e, z0 - o], [mx, ridge, z0 - o], [mx, ridge, z1 + o], PAL.roof);
  for (const z of [z0, z1]) {
    const s = z === z0 ? -1 : 1;
    const a = [x0, f + WALL, z + s * 0.01];
    const b = [x1, f + WALL, z + s * 0.01];
    const c = [mx, ridge - 0.1, z + s * 0.01];
    if (s > 0) quad(m, a, b, c, c, PAL.boards);
    else quad(m, b, a, c, c, PAL.boards);
  }
  // the porch: posts, and a roof sloping down from the wall
  const px = x0 - PORCH;
  for (const pz of [z0 + 1, (z0 + z1) / 2 + 2, z1 - 1]) block(m, px + 0.1, f - 0.15, pz - 0.1, px + 0.35, f + 2.6, pz + 0.1, PAL.timber);
  quad(m, [x0, f + 2.95, z1 - 0.2], [x0, f + 2.95, z0 + 0.2], [px - 0.2, f + 2.55, z0 + 0.2], [px - 0.2, f + 2.55, z1 - 0.2], PAL.roof);
  quad(m, [px - 0.2, f + 2.5, z1 - 0.2], [px - 0.2, f + 2.5, z0 + 0.2], [x0, f + 2.9, z0 + 0.2], [x0, f + 2.9, z1 - 0.2], PAL.timberDark);
  // the door, the windows (lit at night), the bench and the board
  const front = x0 - 0.02;
  const pane = (za, zb, ya, yb, c) => quad(m, [front, ya, zb], [front, ya, za], [front, yb, za], [front, yb, zb], c);
  const glow = (za, zb, ya, yb) => quad(lit, [front - 0.01, ya, zb], [front - 0.01, ya, za], [front - 0.01, yb, za], [front - 0.01, yb, zb], PAL.window);
  pane(z0 + 5.6, z0 + 6.8, f, f + 2.1, PAL.trim);
  for (const [za, zb] of [
    [z0 + 1.2, z0 + 3.4],
    [z1 - 3.6, z1 - 1.4],
  ]) {
    pane(za - 0.1, zb + 0.1, f + 0.9, f + 2.25, PAL.trim);
    pane(za, zb, f + 1.0, f + 2.15, PAL.glass);
    glow(za + 0.05, zb - 0.05, f + 1.05, f + 2.1);
  }
  block(m, x0 - 0.75, f + 0.42, z0 + 7.6, x0 - 0.3, f + 0.5, z1 - 1.6, PAL.timber);
  for (const z of [z0 + 7.8, z1 - 1.8]) block(m, x0 - 0.7, f, z - 0.05, x0 - 0.35, f + 0.42, z + 0.05, PAL.timberDark);
  // the departures board: black, with lines of yellow
  pane(z0 + 3.9, z0 + 5.2, f + 1.2, f + 2.3, PAL.board);
  for (let k = 0; k < 4; k++) {
    const y = f + 1.35 + k * 0.24;
    quad(m, [front - 0.01, y, z0 + 5.05], [front - 0.01, y, z0 + 4.05 + (k % 2) * 0.2], [front - 0.01, y + 0.08, z0 + 4.05 + (k % 2) * 0.2], [front - 0.01, y + 0.08, z0 + 5.05], PAL.yellow);
  }
}

// The tower: four timber legs, braced, up to a cab of glass with a flat roof
// and a mast, and the beacon over it.
function tower(m, lit, [x0, z0, x1, z1], b, T) {
  const top = b + CAB.floor;
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  for (const [x, z] of corners) {
    block(m, x - 0.3, Math.min(T(z0), T(z1)) - 0.3, z - 0.3, x + 0.3, b, z + 0.3, PAL.concreteDark);
    beam(m, [x, b, z], [x, top, z], 0.26, 0.26, PAL.timber);
  }
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 4];
    for (const [ya, yb] of [
      [b + 0.3, b + CAB.floor / 2],
      [b + CAB.floor / 2, top - 0.2],
    ]) {
      beam(m, [ax, ya, az], [bx, yb, bz], 0.12, 0.12, PAL.timberDark);
      beam(m, [bx, ya, bz], [ax, yb, az], 0.12, 0.12, PAL.timberDark);
    }
  }
  // the ladder up the front leg
  for (let y = b + 0.4; y < top; y += 0.35) beam(m, [x0 - 0.35, y, z0 + 1.2], [x0 - 0.35, y, z0 + 1.7], 0.05, 0.05, PAL.iron);
  for (const z of [z0 + 1.2, z0 + 1.7]) beam(m, [x0 - 0.35, b, z], [x0 - 0.35, top, z], 0.06, 0.06, PAL.iron);
  // the cab
  const o = CAB.over;
  const [ga, gb] = CAB.glass;
  block(m, x0 - o, top, z0 - o, x1 + o, b + ga, z1 + o, PAL.boards);
  block(m, x0 - o + 0.1, b + ga, z0 - o + 0.1, x1 + o - 0.1, b + gb, z1 + o - 0.1, PAL.glass);
  for (const [x, z] of [
    [x0 - o, z0 - o],
    [x1 + o, z0 - o],
    [x1 + o, z1 + o],
    [x0 - o, z1 + o],
  ])
    beam(m, [x, b + ga, z], [x, b + gb, z], 0.14, 0.14, PAL.trim);
  block(m, x0 - o, b + gb, z0 - o, x1 + o, b + CAB.roof, z1 + o, PAL.trim);
  block(m, x0 - o - 0.3, b + CAB.roof, z0 - o - 0.3, x1 + o + 0.3, b + CAB.roof + 0.15, z1 + o + 0.3, PAL.roof);
  // lit from inside at night: a band just inside the glass
  const ix0 = x0 - o + 0.13;
  const ix1 = x1 + o - 0.13;
  const iz0 = z0 - o + 0.13;
  const iz1 = z1 + o - 0.13;
  const ya = b + ga + 0.1;
  const yb = b + gb - 0.1;
  quad(lit, [ix0 - 0.04, ya, iz1], [ix0 - 0.04, ya, iz0], [ix0 - 0.04, yb, iz0], [ix0 - 0.04, yb, iz1], PAL.window);
  quad(lit, [ix1 + 0.04, ya, iz0], [ix1 + 0.04, ya, iz1], [ix1 + 0.04, yb, iz1], [ix1 + 0.04, yb, iz0], PAL.window);
  quad(lit, [ix0, ya, iz0 - 0.04], [ix1, ya, iz0 - 0.04], [ix1, yb, iz0 - 0.04], [ix0, yb, iz0 - 0.04], PAL.window);
  quad(lit, [ix1, ya, iz1 + 0.04], [ix0, ya, iz1 + 0.04], [ix0, yb, iz1 + 0.04], [ix1, yb, iz1 + 0.04], PAL.window);
  // the mast
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  beam(m, [mx, b + CAB.roof + 0.15, mz], [mx, b + CAB.roof + 1.5, mz], 0.1, 0.1, PAL.iron);
  beam(m, [mx - 0.5, b + CAB.roof + 1.5, mz], [mx + 0.5, b + CAB.roof + 1.5, mz], 0.08, 0.08, PAL.iron);
}

// The hangar: a round roof of corrugated tin over the apron, open to the
// strip (its -x end), closed at the back, dark inside.
function hangar(m, [x0, z0, x1, z1], b) {
  const r = (z1 - z0) / 2;
  const zc = (z0 + z1) / 2;
  const n = 10;
  const P = (x, a) => [x, b + Math.sin(a) * r, zc - Math.cos(a) * r];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI;
    const a1 = ((k + 1) / n) * Math.PI;
    const c = _c.copy(k % 2 ? PAL.tin : PAL.tinDark).clone();
    // outside, and inside (dark)
    quad(m, P(x0, a0), P(x1, a0), P(x1, a1), P(x0, a1), c);
    quad(m, P(x0, a1), P(x1, a1), P(x1, a0), P(x0, a0), PAL.iron);
    // the back, closed; the front, a rib round the opening
    quad(m, [x1, b, zc], P(x1, a0), P(x1, a1), [x1, b, zc], PAL.tinDark);
    quad(m, [x1 - 0.05, b, zc], P(x1 - 0.05, a1), P(x1 - 0.05, a0), [x1 - 0.05, b, zc], PAL.iron);
    const ri = 0.25;
    const Q = (a, rr) => [x0, b + Math.sin(a) * rr, zc - Math.cos(a) * rr];
    quad(m, Q(a0, r - ri), Q(a1, r - ri), Q(a1, r), Q(a0, r), PAL.tinDark);
  }
}

// The fuel tank: a drum on its side, on two cradles, and a pump beside it.
function fuelTank(m, [x0, z0, x1, z1], b) {
  const zc = (z0 + z1) / 2;
  const r = 1.1;
  const yc = b + 0.6 + r;
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const P = (x, a) => [x, yc + Math.sin(a) * r, zc + Math.cos(a) * r];
    quad(m, P(x0 + 0.5, a0), P(x1 - 0.5, a0), P(x1 - 0.5, a1), P(x0 + 0.5, a1), PAL.red);
    quad(m, [x0 + 0.5, yc, zc], P(x0 + 0.5, a1), P(x0 + 0.5, a0), [x0 + 0.5, yc, zc], PAL.white);
    quad(m, [x1 - 0.5, yc, zc], P(x1 - 0.5, a0), P(x1 - 0.5, a1), [x1 - 0.5, yc, zc], PAL.white);
  }
  for (const x of [x0 + 1.4, x1 - 1.4]) block(m, x - 0.2, b - 0.2, zc - 1, x + 0.2, yc - r * 0.6, zc + 1, PAL.concreteDark);
  block(m, x0 - 0.2, b - 0.1, z1 - 0.2, x0 + 0.6, b + 1.5, z1 + 0.6, PAL.white);
  block(m, x0 - 0.1, b + 1.5, z1 - 0.1, x0 + 0.5, b + 1.6, z1 + 0.5, PAL.red);
}

// The windsock: five hoops of orange and white, from a swivel at the top of
// its pole. Its own group, turned downwind and drooping in a calm (index.js).
function windsock() {
  const g = new THREE.Group();
  const m = new Mesher();
  const n = 8;
  const len = 3.2;
  for (let s = 0; s < 5; s++) {
    const za = (s / 5) * len;
    const zb = ((s + 1) / 5) * len;
    const ra = 0.45 - 0.05 * s;
    const rb = 0.45 - 0.05 * (s + 1);
    const c = s % 2 ? PAL.white : PAL.sockOrange;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      const P = (z, r, a) => [Math.cos(a) * r, Math.sin(a) * r, z];
      quad(m, P(za, ra, a0), P(za, ra, a1), P(zb, rb, a1), P(zb, rb, a0), c);
      quad(m, P(zb, rb, a0), P(zb, rb, a1), P(za, ra, a1), P(za, ra, a0), c);
    }
  }
  const mesh = new THREE.Mesh(m.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  g.add(mesh);
  g.rotation.order = 'YXZ';
  return g;
}

export { PLAN };
