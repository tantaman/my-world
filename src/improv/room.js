// What the club is built of, in the club's frame (club.js), as
// vertex-coloured faces (build/kit.js) gathered by what lights them:
//
//   street      out front, at street level: the door, the canopy over it
//               with the name along its edge, the blade sign up the front
//               of the building, the frames of the poster cases
//   streetGlow  ...and what glows there: the lights under the canopy
//   house       downstairs, lit by the house lights: the floors, walls and
//               ceilings, the tables and chairs, the bar, the box office,
//               the stairs up
//   stage       lit by the stage lights: the stages, the brick behind them,
//               the stools and the stands, the curtains
//   glow        lit by itself: the candles on the tables, the bottles behind
//               the bar, the exit signs, the lamps on the trusses
//
// and where the pictures go (pictures): the neon on the brick and over the
// doors, the board in the lobby, the posters out front, each { kind, x, y,
// z, nx, nz, w, h, room, street } (a face looking along nx, nz). The
// street's (street: true) are at its height (y 0 at the door); downstairs,
// y 0 is the club's floor.
//
//   buildClub() -> { street, streetGlow, house, stage, glow } of Kits, and pictures
//
// No browser in here: the tests count what it makes.

import * as THREE from 'three';
import { Kit } from '../build/kit.js';
import { ROOMS, DOORWAYS, STAGES, COUNTERS, TABLES, SEATS, MARKS } from './club.js';

const col = (hex) => new THREE.Color(hex);
const PAL = {
  carpet: col(0x3a1622),
  carpet2: col(0x2a0f18),
  lobbyFloor: col(0x4a3a30),
  lobbyFloor2: col(0x3e3028),
  wood: col(0x6a4628),
  wood2: col(0x5a3a20),
  black: col(0x161417),
  wall: col(0x221c22),
  lobbyWall: col(0x5a2a2c),
  ceiling: col(0x101012),
  brick: [col(0x8a3a2a), col(0x7a3224), col(0x9a4430), col(0x6e2c20), col(0x844030)],
  mortar: col(0x4a3a32),
  stageTop: col(0x1c1a1c),
  stageFace: col(0x0e0e10),
  curtain: col(0x5a0e14),
  curtain2: col(0x440a10),
  table: col(0x24201e),
  tableTop: col(0x2e2a26),
  chair: col(0x3a2418),
  seat: col(0x6a1a22),
  steel: col(0x55585e),
  chrome: col(0xa8acb2),
  bar: col(0x3a2414),
  barTop: col(0x8a6a3a),
  counter: col(0x2a2026),
  candle: col(0xffb04a),
  exit: col(0xff3030),
  lamp: col(0xfff0c8),
  glass: col(0x101418),
  frame: col(0x2a2a2e),
  canopy: col(0x0c0c0e),
  gold: col(0xd8b048),
  sign: col(0x121014),
  red: col(0xe02434),
  bottles: [col(0x3a8a4a), col(0xb87a2a), col(0x6a3a1a), col(0xd8d0b0), col(0x2a6a8a), col(0x8a2a2a)],
};

export function buildClub() {
  const k = { street: new Kit(), streetGlow: new Kit(), house: new Kit(), stage: new Kit(), glow: new Kit() };
  const pictures = [];
  streetFront(k, pictures);
  lobby(k, pictures);
  showroom(k, pictures);
  lounge(k, pictures);
  furniture(k);
  return { kits: k, pictures };
}

// ── Pieces ───────────────────────────────────────────────────────────────────
// A floor of squares of two colours, a ceiling, and the walls of a room
// looking in, with gaps where the doorways are (and lintels over them).
function room(kit, box, h, { floor, floor2, wall, ceiling = PAL.ceiling, tile = 1, gaps = [] }) {
  const [x0, z0, x1, z1] = box;
  for (let x = x0, i = 0; x < x1 - 1e-6; x += tile, i++) {
    for (let z = z0, j = 0; z < z1 - 1e-6; z += tile, j++) {
      const xe = Math.min(x1, x + tile);
      const ze = Math.min(z1, z + tile);
      kit.quad([x, 0, ze], [xe, 0, ze], [xe, 0, z], [x, 0, z], [0, 1, 0], (i + j) % 2 ? floor2 : floor);
    }
  }
  kit.quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], [0, -1, 0], ceiling);
  // each side: [a, b] along it, the way it faces, and where along it
  const sides = [
    { ax: x0, az: z0, bx: x1, bz: z0, nx: 0, nz: 1 },
    { ax: x1, az: z1, bx: x0, bz: z1, nx: 0, nz: -1 },
    { ax: x0, az: z1, bx: x0, bz: z0, nx: 1, nz: 0 },
    { ax: x1, az: z0, bx: x1, bz: z1, nx: -1, nz: 0 },
  ];
  for (const s of sides) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const ux = (s.bx - s.ax) / len;
    const uz = (s.bz - s.az) / len;
    // the gaps on this side: [from, to] along it
    const holes = [];
    for (const g of gaps) {
      const on = s.nz !== 0 ? Math.abs(g.z - s.az) < 0.2 : Math.abs(g.x - s.ax) < 0.2;
      if (!on) continue;
      const a = (s.nz !== 0 ? g.a - s.ax : g.a - s.az) * (s.nz !== 0 ? ux : uz);
      const b = (s.nz !== 0 ? g.b - s.ax : g.b - s.az) * (s.nz !== 0 ? ux : uz);
      holes.push([Math.min(a, b), Math.max(a, b), g.top ?? 2.4]);
    }
    holes.sort((p, q) => p[0] - q[0]);
    let at = 0;
    const piece = (from, to, y0, y1) => {
      if (to - from < 1e-3) return;
      const p = (t, y) => [s.ax + ux * t, y, s.az + uz * t];
      kit.quad(p(from, y0), p(to, y0), p(to, y1), p(from, y1), [s.nx, 0, s.nz], wall);
    };
    for (const [a, b, top] of holes) {
      piece(at, a, 0, h);
      piece(a, b, top, h);
      at = b;
    }
    piece(at, len, 0, h);
  }
}

// A thin upright post from (x, z) on the floor up to y, w across.
const post = (kit, x, z, y0, y1, w, c) => kit.box(x - w / 2, y0, z - w / 2, x + w / 2, y1, z + w / 2, c);

// ── Out front ────────────────────────────────────────────────────────────────
function streetFront(k, pictures) {
  const s = k.street;
  // the doors: glass in black frames, a bar across each
  s.box(-1.05, 0, -0.08, 1.05, 2.7, 0.02, PAL.frame, 'z+');
  for (const x0 of [-0.95, 0.03]) {
    s.box(x0, 0.08, -0.1, x0 + 0.92, 2.55, -0.08, PAL.glass);
    s.box(x0 + 0.1, 1.0, -0.14, x0 + 0.82, 1.05, -0.1, PAL.chrome);
  }
  // the canopy over them, the name along its front and sides
  s.box(-2.2, 2.95, -2.6, 2.2, 3.35, 0, PAL.canopy);
  for (const x of [-2.05, 2.05]) post(s, x, -2.45, 0, 2.95, 0.07, PAL.steel);
  pictures.push({ kind: 'name', street: true, x: 0, y: 3.15, z: -2.62, nx: 0, nz: -1, w: 3.9, h: 0.42 });
  for (const sx of [-1, 1]) pictures.push({ kind: 'name', street: true, x: sx * 2.22, y: 3.15, z: -1.3, nx: sx, nz: 0, w: 2.4, h: 0.36 });
  // lights in its underside
  for (let x = -1.8; x <= 1.81; x += 0.9) for (const z of [-0.7, -1.9]) k.streetGlow.quad([x - 0.12, 2.94, z + 0.12], [x + 0.12, 2.94, z + 0.12], [x + 0.12, 2.94, z - 0.12], [x - 0.12, 2.94, z - 0.12], [0, -1, 0], PAL.lamp);
  // the blade sign up the front, standing out over the pavement
  s.box(2.75, 3.7, -1.6, 2.95, 8.4, -0.1, PAL.sign);
  s.box(2.8, 3.7, -0.1, 2.9, 8.4, 0, PAL.steel);
  for (const sx of [-1, 1]) {
    pictures.push({ kind: 'blade', street: true, x: 2.85 + sx * 0.11, y: 6.05, z: -0.85, nx: sx, nz: 0, w: 1.35, h: 4.5 });
  }
  // the poster cases either side of the doors
  for (const [x, room] of [[-1.9, 'main'], [1.9, 'lounge']]) {
    s.box(x - 0.62, 0.55, -0.12, x + 0.62, 2.25, 0, PAL.gold);
    pictures.push({ kind: 'poster', street: true, room, x, y: 1.4, z: -0.13, nx: 0, nz: -1, w: 1.1, h: 1.55 });
  }
}

// ── Downstairs ───────────────────────────────────────────────────────────────
function lobby(k, pictures) {
  const R = ROOMS.lobby;
  const [x0, z0, x1, z1] = R.box;
  const main = DOORWAYS[0].box;
  const lounge = DOORWAYS[1].box;
  room(k.house, R.box, R.ceiling, {
    floor: PAL.lobbyFloor,
    floor2: PAL.lobbyFloor2,
    wall: PAL.lobbyWall,
    tile: 0.5,
    gaps: [
      { z: z1, a: main[0], b: main[2] },
      { x: x1, a: lounge[1], b: lounge[3] },
      { z: z0, a: -1.2, b: 1.2, top: 2.6 },
    ],
  });
  // the stairs up to the street, into the dark
  const h = k.house;
  for (let i = 0; i < 9; i++) {
    const za = z0 - i * 0.3;
    h.box(-1.2, 0, za - 0.3, 1.2, (i + 1) * 0.18, za, i % 2 ? PAL.wood2 : PAL.wood, 'z+');
  }
  h.box(-1.25, 0, z0 - 2.8, -1.2, 3.6, z0, PAL.black);
  h.box(1.2, 0, z0 - 2.8, 1.25, 3.6, z0, PAL.black);
  h.quad([-1.2, 3.4, z0 - 2.8], [1.2, 3.4, z0 - 2.8], [1.2, 2.6, z0], [-1.2, 2.6, z0], [0, -1, 0.3], PAL.ceiling);
  h.panel(0, 2.6, z0 - 2.7, 0, 1, 2.4, 3, PAL.black);
  for (const x of [-1.1, 1.1]) h.box(x - 0.03, 0.9, z0 - 2.6, x + 0.03, 0.95, z0, PAL.chrome);
  k.glow.words('EXIT', 0, 2.85, z0 + 0.02, 0, 1, 0.05, PAL.exit);
  // the box office
  const bo = COUNTERS[0].box;
  h.box(bo[0], 0, bo[1], bo[2], COUNTERS[0].h, bo[3], PAL.counter);
  h.box(bo[2] - 0.05, COUNTERS[0].h, bo[1], bo[2] + 0.12, COUNTERS[0].h + 0.05, bo[3], PAL.barTop);
  h.box(bo[0], 2.3, bo[1], bo[2], 2.6, bo[3], PAL.black);
  k.glow.words('BOX OFFICE', bo[2] + 0.01, 2.45, (bo[1] + bo[3]) / 2, 1, 0, 0.035, PAL.gold);
  // the board of the week's shows, beside the way into the showroom
  pictures.push({ kind: 'board', x: -3.2, y: 1.75, z: z1 - 0.05, nx: 0, nz: -1, w: 2.6, h: 1.73 });
  h.box(-4.6, 0.82, z1 - 0.03, -1.8, 2.68, z1, PAL.gold);
  // neon over the two ways in
  pictures.push({ kind: 'name', x: 0, y: 2.82, z: z1 - 0.02, nx: 0, nz: -1, w: 2.6, h: 0.65 });
  pictures.push({ kind: 'lounge', x: x1 - 0.02, y: 2.72, z: (lounge[1] + lounge[3]) / 2, nx: -1, nz: 0, w: 2.2, h: 0.55 });
  // headshots of the comics down the lounge side
  for (let i = 0; i < 4; i++) pictures.push({ kind: 'headshot', n: i, x: x1 - 0.03, y: 1.6, z: z0 + 0.7 + i * 0.85 + (i >= 2 ? 3.6 : 0), nx: -1, nz: 0, w: 0.6, h: 0.8 });
  // a light over the middle of it
  k.glow.box(-0.4, R.ceiling - 0.04, 4.6, 0.4, R.ceiling, 5.4, PAL.lamp);
}

function brickWall(kit, x0, x1, z, y0, y1, facing) {
  // mortar behind, bricks proud of it
  kit.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, facing], PAL.mortar);
  if (facing < 0) kit.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], [0, 0, -1], PAL.mortar);
  const BW = 0.23;
  const BH = 0.075;
  const gap = 0.012;
  let n = 0;
  for (let y = y0, row = 0; y < y1 - BH; y += BH + gap, row++) {
    for (let x = x0 - (row % 2) * BW * 0.5; x < x1; x += BW + gap) {
      const a = Math.max(x0, x);
      const b = Math.min(x1, x + BW);
      if (b - a < 0.02) continue;
      const c = PAL.brick[(n++ * 7 + row * 3) % PAL.brick.length];
      const zz = z + facing * 0.008;
      if (facing < 0) kit.quad([b, y, zz], [a, y, zz], [a, y + BH, zz], [b, y + BH, zz], [0, 0, -1], c);
      else kit.quad([a, y, zz], [b, y, zz], [b, y + BH, zz], [a, y + BH, zz], [0, 0, 1], c);
    }
  }
}
// ...the same, on a wall along z (facing along x)
function brickWallX(kit, z0, z1, x, y0, y1, facing) {
  const BW = 0.23;
  const BH = 0.075;
  const gap = 0.012;
  kit.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], [facing, 0, 0], PAL.mortar);
  let n = 0;
  for (let y = y0, row = 0; y < y1 - BH; y += BH + gap, row++) {
    for (let z = z0 - (row % 2) * BW * 0.5; z < z1; z += BW + gap) {
      const a = Math.max(z0, z);
      const b = Math.min(z1, z + BW);
      if (b - a < 0.02) continue;
      const c = PAL.brick[(n++ * 7 + row * 3) % PAL.brick.length];
      const xx = x + facing * 0.008;
      kit.quad([xx, y, b], [xx, y, a], [xx, y + BH, a], [xx, y + BH, b], [facing, 0, 0], c);
    }
  }
}

// Curtains: folds of two reds, hanging from the ceiling to the floor.
function curtain(kit, ax, az, bx, bz, y0, y1, nx, nz) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / 0.18));
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const dep = i % 2 ? 0.06 : 0;
    const p = (t, y) => [ax + (bx - ax) * t + nx * dep, y, az + (bz - az) * t + nz * dep];
    kit.quad(p(t0, y0), p(t1, y0), p(t1, y1), p(t0, y1), [nx, 0, nz], i % 2 ? PAL.curtain : PAL.curtain2);
  }
}

function stageBox(kit, s, top = PAL.stageTop) {
  const [x0, z0, x1, z1] = s.box;
  kit.box(x0, 0, z0, x1, s.h, z1, PAL.stageFace, 'y+ y-');
  kit.quad([x0, s.h, z1], [x1, s.h, z1], [x1, s.h, z0], [x0, s.h, z0], [0, 1, 0], top);
}

// A mic stand and a stool, at a stage's marks, at its height.
function props(kit, marks, h) {
  const m = marks.mic;
  post(kit, m.x, m.z, h, h + 0.04, 0.32, PAL.black); // its foot
  post(kit, m.x, m.z, h, h + 1.42, 0.025, PAL.chrome);
  const st = marks.stool;
  post(kit, st.x, st.z, h + 0.74, h + 0.8, 0.38, PAL.black);
  for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) post(kit, st.x + dx, st.z + dz, h, h + 0.74, 0.03, PAL.chrome);
  // and a bottle of water on it
  post(kit, st.x + 0.08, st.z, h + 0.8, h + 1.0, 0.06, PAL.chrome);
}

function showroom(k, pictures) {
  const R = ROOMS.main;
  const [x0, z0, x1, z1] = R.box;
  const S = STAGES.main;
  room(k.house, R.box, R.ceiling, {
    floor: PAL.carpet,
    floor2: PAL.carpet2,
    wall: PAL.wall,
    gaps: [{ z: z0, a: DOORWAYS[0].box[0], b: DOORWAYS[0].box[2] }],
  });
  stageBox(k.stage, S);
  // the brick behind the stage, the curtains either side of it
  brickWall(k.stage, S.box[0], S.box[2], z1 - 0.02, S.h, R.ceiling, -1);
  curtain(k.stage, S.box[0], z1 - 0.05, x0, z1 - 0.05, 0, R.ceiling, 0, -1);
  curtain(k.stage, x1, z1 - 0.05, S.box[2], z1 - 0.05, 0, R.ceiling, 0, -1);
  for (const sx of [-1, 1]) curtain(k.stage, sx * S.box[2], S.box[1] + 0.4, sx * S.box[2], z1 - 0.1, S.h, R.ceiling, -sx, 0);
  pictures.push({ kind: 'logo', room: 'main', x: 0, y: 3.15, z: z1 - 0.06, nx: 0, nz: -1, w: 6.2, h: 1.55 });
  props(k.stage, MARKS.main, S.h);
  // the truss over the front of the stage, its lamps aimed at it
  k.house.box(-7, R.ceiling - 0.45, S.box[1] - 1.25, 7, R.ceiling - 0.35, S.box[1] - 1.15, PAL.steel);
  for (let x = -6; x <= 6.01; x += 2.4) {
    k.house.box(x - 0.12, R.ceiling - 0.7, S.box[1] - 1.32, x + 0.12, R.ceiling - 0.45, S.box[1] - 1.08, PAL.black);
    k.glow.panel(x, R.ceiling - 0.6, S.box[1] - 1.07, 0, 1, 0.16, 0.14, PAL.lamp);
  }
  // the bar along the back
  const B = COUNTERS[1];
  const [bx0, bz0, bx1, bz1] = B.box;
  k.house.box(bx0, 0, bz0 + 0.5, bx1, B.h, bz1, PAL.bar);
  k.house.box(bx0 - 0.05, B.h, bz0 + 0.45, bx1 + 0.05, B.h + 0.05, bz1 + 0.05, PAL.barTop);
  k.house.box(bx0, 1.3, z0, bx1, 1.34, z0 + 0.3, PAL.wood);
  k.house.box(bx0, 1.8, z0, bx1, 1.84, z0 + 0.3, PAL.wood);
  let n = 0;
  for (const y of [1.34, 1.84]) {
    for (let x = bx0 + 0.15; x < bx1 - 0.1; x += 0.17) {
      const c = PAL.bottles[n++ % PAL.bottles.length];
      k.glow.box(x - 0.04, y, z0 + 0.1, x + 0.04, y + 0.26 + (n % 3) * 0.03, z0 + 0.18, c.clone().multiplyScalar(0.5));
    }
  }
  k.glow.words('BAR', (bx0 + bx1) / 2, 2.6, z0 + 0.02, 0, 1, 0.06, PAL.gold);
  k.glow.words('EXIT', 0, 2.75, z0 + 0.02, 0, 1, 0.05, PAL.exit);
}

function lounge(k, pictures) {
  const R = ROOMS.lounge;
  const [x0, z0, x1, z1] = R.box;
  const S = STAGES.lounge;
  room(k.house, R.box, R.ceiling, {
    floor: PAL.wood,
    floor2: PAL.wood2,
    wall: col(0x1a1a2a),
    tile: 0.5,
    gaps: [{ x: x0, a: DOORWAYS[1].box[1], b: DOORWAYS[1].box[3] }],
  });
  stageBox(k.stage, S, col(0x24202a));
  brickWallX(k.stage, S.box[1], S.box[3], x1 - 0.02, S.h, R.ceiling, -1);
  curtain(k.stage, x1 - 0.05, z0, x1 - 0.05, S.box[1], 0, R.ceiling, -1, 0);
  curtain(k.stage, x1 - 0.05, S.box[3], x1 - 0.05, z1, 0, R.ceiling, -1, 0);
  pictures.push({ kind: 'troupe', room: 'lounge', x: x1 - 0.06, y: 2.55, z: (S.box[1] + S.box[3]) / 2, nx: -1, nz: 0, w: 4.4, h: 1.1 });
  props(k.stage, MARKS.lounge, S.h);
  // the troupe's chairs along the brick
  for (const b of MARKS.lounge.back) chair(k.stage, b.x + 0.1, b.z, -Math.PI / 2, S.h);
  // a truss of lamps
  k.house.box(S.box[0] - 1.0, R.ceiling - 0.4, S.box[1], S.box[0] - 0.9, R.ceiling - 0.32, S.box[3], PAL.steel);
  for (let z = S.box[1] + 1; z < S.box[3]; z += 2.4) k.glow.panel(S.box[0] - 0.88, R.ceiling - 0.5, z, 1, 0, 0.14, 0.12, PAL.lamp);
  k.glow.words('EXIT', x0 + 0.02, 2.75, (DOORWAYS[1].box[1] + DOORWAYS[1].box[3]) / 2, 1, 0, 0.045, PAL.exit);
}

// A chair at (x, z) facing yaw (in the club's frame), on a floor at y0.
function chair(kit, x, z, yaw, y0 = 0) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const H = 0.46;
  kit.box(x - 0.21, y0 + H - 0.05, z - 0.21, x + 0.21, y0 + H, z + 0.21, PAL.seat);
  for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) post(kit, x + dx, z + dz, y0, y0 + H - 0.05, 0.03, PAL.chair);
  // the back, behind whoever sits in it
  const bx = x - fx * 0.2;
  const bz = z - fz * 0.2;
  kit.box(bx - Math.abs(fz) * 0.21 - Math.abs(fx) * 0.02, y0 + H, bz - Math.abs(fx) * 0.21 - Math.abs(fz) * 0.02, bx + Math.abs(fz) * 0.21 + Math.abs(fx) * 0.02, y0 + 0.92, bz + Math.abs(fx) * 0.21 + Math.abs(fz) * 0.02, PAL.chair);
}

function furniture(k) {
  for (const t of TABLES) {
    k.house.box(t.x - t.r, 0.7, t.z - t.r, t.x + t.r, 0.74, t.z + t.r, PAL.tableTop);
    post(k.house, t.x, t.z, 0, 0.7, 0.07, PAL.table);
    post(k.house, t.x, t.z, 0, 0.03, 0.42, PAL.table);
    // a candle in a glass
    post(k.glow, t.x, t.z + 0.1, 0.74, 0.82, 0.05, PAL.candle);
  }
  for (const s of SEATS) chair(k.house, s.x, s.z, s.yaw);
}

