// What the hunt club looks like, made in code like everything else:
// vertex-coloured boxes and quads, gathered into a few meshes.
//
//   the clubhouse   board-and-batten walls stained brown on a stone footing, a
//                   green metal roof with a stone chimney, and a covered porch
//                   along its front facing the field, up a few steps, with a
//                   railing, benches and lamps. In the front wall: a door with
//                   antlers over it, two windows, and the hatch the steward
//                   serves from, its counter out over the porch; through it,
//                   the gun room, lit from within: a rack of shotguns, shelves
//                   of shells, a pair of antlers. The club's name on a board
//                   along the porch roof.
//   the field       the high house and the low house, white with green
//                   trim, each with the dark mouth its trap throws from and
//                   its name on the front; a concrete pad at every station,
//                   its number painted on it; the walk round the
//                   arc, and out to station 8 and back to the porch steps; the
//                   stake at the crossing point.
//
// Everything is built round the club's own origin (station 8, at the height
// of the ground there) and that group is what's put in the world, so nothing
// big goes to the graphics card (render/origin.js).
//
//   buildClub(site, lay, ground, materials) -> {
//     object    the group, placed and turned where the club is
//     solids    capsules for the world's Solids
//     blockers  boxes the camera can't see through: { inv, half }
//     marker    an arrow to hang over the station you shoot from next (its
//               position is in the club's frame; hidden to start with)
//     steward   where the steward stands behind the hatch, and faces: { x, y, z, yaw } in the club's frame
//   }
//   lay        site.js layout(): how high everything stands
//   ground     (x, z) -> the height of the ground in the world
//   materials  { outside, inside, glow }: inside is lit from within (the gun room)

import * as THREE from 'three';
import { Kit } from '../videostore/store.js';
import { layout } from '../videostore/font.js';
import { toWorld } from '../landmarks/sites.js';
import { CLUB, EDGE, TREAD } from './site.js';
import { STATIONS, HOUSES, FIELD } from './skeet.js';

const col = (hex) => new THREE.Color(hex);
const PAL = {
  siding: col(0x6a4a30),
  batten: col(0x52381f),
  trim: col(0xd9cfb4),
  roof: col(0x35523a),
  under: col(0x5a4630),
  deck: [col(0x9a7a52), col(0x8c6c46)],
  stone: col(0x77736a),
  stoneDark: col(0x5e5a52),
  glass: col(0x1a2228),
  door: col(0x6a2a1a),
  log: col(0x8a6038),
  sign: col(0x24402c),
  letters: col(0xf0e6c8),
  frame: col(0x3a2a1c),
  house: col(0xe4dfd2),
  houseTrim: col(0x2e5a3a),
  mouth: col(0x0c0c0c),
  pad: col(0xb5b0a4),
  padSide: col(0x8f8a7e),
  walk: col(0xa9a497),
  post: col(0xf2efe6),
  orange: col(0xf2621c),
  bone: col(0xe0d2b4),
  plaque: col(0x5a3a20),
  brass: col(0xc8a040),
  // in the gun room
  pine: col(0xc8b48c),
  floor: col(0x8a6a48),
  rack: col(0x5a3a20),
  stock: col(0x7a4a26),
  steel: col(0x2a2c2e),
  shells: [0xc8282a, 0x2a6a3a, 0xe0b020, 0x1e4a8a].map(col),
  bulb: col(0xfff0c8),
};

const WALL = 0.2; // m, how thick the clubhouse walls are
const WALL_UP = 3.2; // m from the floor to the top of the walls
const RIDGE = 1.8; // m the ridge stands over the tops of the walls
const EAVE = 0.4; // m the roof overhangs the walls
const PORCH_ROOF = { high: 3.0, low: 2.62, out: 0.15 }; // m over the deck at the wall and at its edge; how far past the edge
const RAIL = 0.95; // m, the porch railing's height
// Holes in the front wall (x0, y0, x1, y1 over the floor): a window, the
// door, the hatch, a window.
const WINDOW_A = [-6.3, 1.0, -4.7, 2.2];
const DOOR = [-3.4, 0, -2.3, 2.15];
export const HATCH = [1.2, 1.0, 4.2, 2.15];
const WINDOW_B = [4.9, 1.0, 6.4, 2.2];
// The gun room behind the hatch (x0, z0, x1, z1), and its ceiling over the floor.
const ROOM = [0.3, CLUB.z0 + WALL, 6.8, CLUB.z0 + 3.4];
const ROOM_UP = 2.7;
// Where you stand at the hatch to be served: in the club's frame.
export const COUNTER = { x: (HATCH[0] + HATCH[2]) / 2, z: CLUB.z0 - 0.75 };
const PAD_NUMBER = { px: 0.05, in: 0.27 }; // m: a square of the number painted on a pad, and how far in from its edge the number's middle is
const WALK = 1.0; // m, how wide the walk round the arc is
const LIFT = 0.035; // m the walks stand over the ground

export function buildClub(site, lay, ground, materials) {
  const object = new THREE.Group();
  object.position.set(site.x, site.base, site.z);
  object.rotation.y = site.yaw;
  const _w = { x: 0, z: 0 };
  // the ground under a point of the club's frame, measured from its origin
  const g = (lx, lz) => {
    toWorld(site, lx, lz, _w);
    return ground(_w.x, _w.z) - site.base;
  };
  const D = lay.deck - site.base;
  const low = lay.low - site.base;
  const kits = { outside: new Kit(), inside: new Kit(), glow: new Kit() };
  const k = kits.outside;
  const solids = [];
  const blockers = [];
  const solid = (ax, az, bx, bz, r, bottom, top, extra) => {
    const a = toWorld(site, ax, az);
    const b = toWorld(site, bx, bz);
    solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r, bottom: site.base + bottom, topA: site.base + top, topB: site.base + top, ...extra });
  };
  // a rectangle of the club's frame as capsules along its long side
  const rectSolid = (x0, z0, x1, z1, bottom, top, extra) => {
    const alongX = x1 - x0 >= z1 - z0;
    const short = alongX ? z1 - z0 : x1 - x0;
    const n = Math.max(1, Math.round(short / 1.2));
    const r = short / n / 2;
    for (let i = 0; i < n; i++) {
      const c = (alongX ? z0 : x0) + r * (2 * i + 1);
      if (alongX) solid(x0 + r, c, Math.max(x0 + r, x1 - r), c, r + 0.02, bottom, top, extra);
      else solid(c, z0 + r, c, Math.max(z0 + r, z1 - r), r + 0.02, bottom, top, extra);
    }
  };
  const blocker = (x0, y0, z0, x1, y1, z1) => blockers.push({ c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2] });

  clubhouse(kits, D, low, solid, rectSolid, blocker);
  gunRoom(kits.inside, kits.glow, D);
  steps(k, lay, site, D, g, rectSolid);
  sign(k, site.name, D);
  houses(k, lay, site, rectSolid, blocker);
  pads(k, lay, site, g, rectSolid);
  walks(k, lay, site, g);

  const add = (kit, material, shadow = true) => {
    if (kit.empty) return null;
    const mesh = new THREE.Mesh(kit.build(), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    object.add(mesh);
    return mesh;
  };
  add(kits.outside, materials.outside);
  add(kits.inside, materials.inside, false);
  add(kits.glow, materials.glow, false);

  // the arrow over the next station, bobbing (index.js moves it)
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), materials.marker || materials.glow);
  marker.rotation.x = Math.PI; // point down
  marker.visible = false;
  object.add(marker);

  object.updateMatrixWorld(true);
  const blocks = blockers.map(({ c, h }) => {
    const local = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]);
    const world = object.matrixWorld.clone().multiply(local);
    return { inv: world.invert(), half: h };
  });
  return { object, solids, blockers: blocks, marker, steward: { x: COUNTER.x, y: D, z: CLUB.z0 + 0.7, yaw: Math.PI } };
}

// ── Building blocks ─────────────────────────────────────────────────────────

// A four-cornered face a b c d, its normal worked out from the way round it
// goes and turned to point the way of `out` (a rough outward direction).
function face(k, a, b, c, d, color, out) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  if (nx * out[0] + ny * out[1] + nz * out[2] < 0) k.quad(d, c, b, a, [-nx, -ny, -nz], color);
  else k.quad(a, b, c, d, [nx, ny, nz], color);
}

// A square stick from a to b, w across: an antler's beam, a gun's barrel.
function beam(k, a, b, w, color) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  const d = [dx / l, dy / l, dz / l];
  const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const norm = (p, s) => {
    const n = Math.hypot(p[0], p[1], p[2]) || 1;
    return [(p[0] / n) * s, (p[1] / n) * s, (p[2] / n) * s];
  };
  const u = norm(cross(d, up), w / 2);
  const v = norm(cross(d, u), w / 2);
  const at = (p, su, sv) => [p[0] + u[0] * su + v[0] * sv, p[1] + u[1] * su + v[1] * sv, p[2] + u[2] * su + v[2] * sv];
  const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) {
    const [s0, t0] = ring[i];
    const [s1, t1] = ring[(i + 1) % 4];
    const out = [u[0] * (s0 + s1) + v[0] * (t0 + t1), u[1] * (s0 + s1) + v[1] * (t0 + t1), u[2] * (s0 + s1) + v[2] * (t0 + t1)];
    face(k, at(a, s0, t0), at(a, s1, t1), at(b, s1, t1), at(b, s0, t0), color, out);
  }
}

// A wall along x from x0 to x1, y0 to y1 high, z0 to z1 deep, with
// rectangular holes [hx0, hy0, hx1, hy1] cut through it.
function holedWall(k, x0, x1, y0, y1, z0, z1, holes, color) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[2]]).filter((x) => x > x0 && x < x1)])].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    const mid = (a + b) / 2;
    const cuts = holes.filter((h) => h[0] <= mid && h[2] >= mid).sort((p, q) => p[1] - q[1]);
    let y = y0;
    for (const h of cuts) {
      if (h[1] > y) k.box(a, y, z0, b, Math.min(y1, h[1]), z1, color);
      y = Math.max(y, h[3]);
    }
    if (y < y1) k.box(a, y, z0, b, y1, z1, color);
  }
}

// Words in the 5 × 7 font laid flat at height y, middled on (x, z), read by
// someone facing (fx, fz) (unit): the tops of the letters away from them.
function flatWords(k, text, x, y, z, fx, fz, px, color) {
  const L = layout(text);
  const rx = -fz; // to the reader's right
  const rz = fx;
  const left = (-L.width * px) / 2;
  const top = (L.height * px) / 2;
  const h = px * 0.46;
  for (const [i, j] of L.dots) {
    const a = left + (i + 0.5) * px;
    const b = top - (j + 0.5) * px;
    const cx = x + rx * a + fx * b;
    const cz = z + rz * a + fz * b;
    face(k, [cx - h, y, cz - h], [cx + h, y, cz - h], [cx + h, y, cz + h], [cx - h, y, cz + h], color, [0, 1, 0]);
  }
}

// A pair of antlers on a plaque, on a wall facing -z, the plaque's middle at
// (x, y, z); s: how big (1 is a good buck's).
function antlers(k, x, y, z, s, color, plaque) {
  if (plaque) k.box(x - 0.13 * s, y - 0.1 * s, z - 0.03, x + 0.13 * s, y + 0.1 * s, z, plaque);
  for (const side of [-1, 1]) {
    const p = (px, py, pz) => [x + side * px * s, y + py * s, z - 0.04 - pz * s];
    const main = [p(0.05, 0.04, 0), p(0.17, 0.12, 0.04), p(0.25, 0.25, 0.09), p(0.26, 0.39, 0.13), p(0.2, 0.5, 0.17), p(0.12, 0.56, 0.2)];
    for (let i = 0; i < main.length - 1; i++) beam(k, main[i], main[i + 1], 0.03 * s * (1 - i * 0.1), color);
    // the tines, up off the beam
    for (const [i, h] of [[1, 0.12], [2, 0.16], [3, 0.13]]) {
      const b = main[i];
      beam(k, b, [b[0] - side * 0.02 * s, b[1] + h * s, b[2] - 0.02 * s], 0.02 * s, color);
    }
  }
}

// ── The clubhouse ───────────────────────────────────────────────────────────

function clubhouse(kits, D, low, solid, rectSolid, blocker) {
  const k = kits.outside;
  const { x0, z0, x1, z1 } = CLUB;
  const top = D + WALL_UP;
  // the stone footing, down below the lowest ground under it
  k.box(x0 - 0.05, low - 0.3, z0 - 0.05, x1 + 0.05, D, z1 + 0.05, PAL.stone);
  for (let x = x0; x < x1; x += 0.9) k.box(x, D - 0.32, z0 - 0.07, x + 0.45, D - 0.22, z1 + 0.07, PAL.stoneDark, 'y-');

  // the walls: the front with its holes, the rest whole
  const holes = [WINDOW_A, DOOR, HATCH, WINDOW_B].map(([a, b, c, d]) => [a, D + b, c, D + d]);
  holedWall(k, x0, x1, D, top, z0, z0 + WALL, holes, PAL.siding);
  k.box(x0, D, z1 - WALL, x1, top, z1, PAL.siding);
  k.box(x0, D, z0, x0 + WALL, top, z1, PAL.siding);
  k.box(x1 - WALL, D, z0, x1, top, z1, PAL.siding);
  // battens over the joints, outside, and boards at the corners
  for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.55) {
    holedWall(k, x - 0.03, x + 0.03, D, top, z0 - 0.03, z0, holes, PAL.batten);
    k.box(x - 0.03, D, z1, x + 0.03, top, z1 + 0.03, PAL.batten);
  }
  for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.55) {
    k.box(x0 - 0.03, D, z - 0.03, x0, top, z + 0.03, PAL.batten);
    k.box(x1, D, z - 0.03, x1 + 0.03, top, z + 0.03, PAL.batten);
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) k.box(x - 0.08, D, z - 0.08, x + 0.08, top, z + 0.08, PAL.trim);
  // the windows: dark glass set back in a cream frame, with a cross bar
  for (const [a, b, c, d] of [WINDOW_A, WINDOW_B]) {
    k.box(a, D + b, z0 + 0.1, c, D + d, z0 + 0.12, PAL.glass);
    k.box(a - 0.07, D + b - 0.09, z0 - 0.05, c + 0.07, D + b, z0 + 0.02, PAL.trim); // the sill
    k.box(a - 0.07, D + d, z0 - 0.04, c + 0.07, D + d + 0.08, z0 + 0.02, PAL.trim);
    k.box(a - 0.07, D + b, z0 - 0.04, a, D + d, z0 + 0.02, PAL.trim);
    k.box(c, D + b, z0 - 0.04, c + 0.07, D + d, z0 + 0.02, PAL.trim);
    k.box((a + c) / 2 - 0.025, D + b, z0 + 0.06, (a + c) / 2 + 0.025, D + d, z0 + 0.1, PAL.trim);
    k.box(a, D + (b + d) / 2 - 0.025, z0 + 0.06, c, D + (b + d) / 2 + 0.025, z0 + 0.1, PAL.trim);
  }
  // the door, of planks, shut; its frame and handle; antlers over it
  {
    const [a, , c, d] = DOOR;
    for (let x = a; x < c - 0.01; x += (c - a) / 5) k.box(x + 0.005, D, z0 + 0.06, x + (c - a) / 5 - 0.005, D + d, z0 + 0.1, PAL.door);
    k.box(a - 0.08, D, z0 - 0.04, a, D + d + 0.08, z0 + 0.04, PAL.trim);
    k.box(c, D, z0 - 0.04, c + 0.08, D + d + 0.08, z0 + 0.04, PAL.trim);
    k.box(a - 0.08, D + d, z0 - 0.04, c + 0.08, D + d + 0.08, z0 + 0.04, PAL.trim);
    k.box(a + 0.12, D + 1.0, z0 + 0.0, a + 0.18, D + 1.06, z0 + 0.06, PAL.brass);
    antlers(k, (a + c) / 2, D + d + 0.32, z0 - 0.01, 0.9, PAL.bone, PAL.plaque);
  }
  // the hatch: its frame, and the counter out over the porch
  {
    const [a, b, c, d] = HATCH;
    k.box(a - 0.1, D + b - 0.06, z0 - 0.42, c + 0.1, D + b, z0 + 0.32, PAL.log); // the counter
    k.box(a - 0.1, D + b - 0.3, z0 - 0.3, a - 0.02, D + b - 0.06, z0 - 0.22, PAL.log); // its brackets
    k.box(c + 0.02, D + b - 0.3, z0 - 0.3, c + 0.1, D + b - 0.06, z0 - 0.22, PAL.log);
    k.box(a - 0.08, D + b, z0 - 0.04, a, D + d + 0.08, z0 + 0.04, PAL.trim);
    k.box(c, D + b, z0 - 0.04, c + 0.08, D + d + 0.08, z0 + 0.04, PAL.trim);
    k.box(a - 0.08, D + d, z0 - 0.04, c + 0.08, D + d + 0.08, z0 + 0.04, PAL.trim);
    // a shutter, propped up over it on two arms
    k.box(a - 0.05, D + d + 0.1, z0 - 0.9, c + 0.05, D + d + 0.14, z0 - 0.05, PAL.siding);
    beam(k, [a + 0.1, D + d, z0 - 0.02], [a + 0.1, D + d + 0.11, z0 - 0.8], 0.03, PAL.batten);
    beam(k, [c - 0.1, D + d, z0 - 0.02], [c - 0.1, D + d + 0.11, z0 - 0.8], 0.03, PAL.batten);
  }

  // the roof: two planes of green metal over the walls, its gable ends
  // boarded, its underside showing at the eaves; and a stone chimney
  const ridge = top + RIDGE;
  const midZ = (z0 + z1) / 2;
  const slope = RIDGE / (midZ - z0);
  const eave = top - EAVE * slope;
  const rx0 = x0 - EAVE;
  const rx1 = x1 + EAVE;
  const T = 0.06; // the metal's thickness
  for (const [ez, n] of [[z0 - EAVE, -1], [z1 + EAVE, 1]]) {
    const a = [rx0, eave + T, ez];
    const b = [rx1, eave + T, ez];
    const c = [rx1, ridge + T, midZ];
    const d = [rx0, ridge + T, midZ];
    face(k, a, b, c, d, PAL.roof, [0, 1, n]);
    face(k, [rx0, eave, ez], [rx1, eave, ez], [rx1, ridge, midZ], [rx0, ridge, midZ], PAL.under, [0, -1, -n]);
    face(k, [rx0, eave, ez], [rx1, eave, ez], [rx1, eave + T, ez], [rx0, eave + T, ez], PAL.roof, [0, 0, n]);
  }
  for (const [x, n] of [[x0, -1], [x1, 1]]) {
    face(k, [x, top, z0], [x, top, z1], [x, ridge, midZ], [x, ridge, midZ], PAL.siding, [n, 0, 0]);
    // the roof's ends, over the gables
    face(k, [x + n * EAVE, eave, z0 - EAVE], [x + n * EAVE, ridge, midZ], [x + n * EAVE, ridge + T, midZ], [x + n * EAVE, eave + T, z0 - EAVE], PAL.roof, [n, 0, 0]);
    face(k, [x + n * EAVE, eave, z1 + EAVE], [x + n * EAVE, ridge, midZ], [x + n * EAVE, ridge + T, midZ], [x + n * EAVE, eave + T, z1 + EAVE], PAL.roof, [n, 0, 0]);
  }
  k.box(rx0, ridge, midZ - 0.12, rx1, ridge + T + 0.06, midZ + 0.12, PAL.roof); // the ridge cap
  k.box(-4.9, D, z1 - 0.9, -4.1, ridge + 0.9, z1 - 0.1, PAL.stone); // the chimney
  k.box(-5.0, ridge + 0.85, z1 - 1.0, -4.0, ridge + 0.95, z1, PAL.stoneDark);

  // the porch: its deck of boards, on posts, the roof over it on posts, the
  // railing round it but for the steps, benches against the wall, lamps
  const px0 = x0 - 0.5;
  const px1 = x1 + 0.5;
  const pz0 = EDGE;
  for (let z = pz0, i = 0; z < z0 - 0.01; z += 0.15, i++) k.box(px0, D - 0.06, z + 0.006, px1, D, Math.min(z0, z + 0.144), PAL.deck[i % 2], 'y-');
  k.box(px0, D - 0.3, pz0 - 0.04, px1, D - 0.06, pz0 + 0.04, PAL.log);
  for (const x of [px0 + 0.1, -2.4, 2.4, px1 - 0.1]) {
    for (const z of [pz0 + 0.1, z0 - 0.15]) k.box(x - 0.07, low - 0.2, z - 0.07, x + 0.07, D - 0.06, z + 0.07, PAL.log);
  }
  rectSolid(px0, pz0, px1, z0 + 0.1, low - 1, D, { surface: 'boards' });
  const roofAt = (z) => D + PORCH_ROOF.low + ((PORCH_ROOF.high - PORCH_ROOF.low) * (z - pz0)) / (z0 - pz0);
  const fz = pz0 - PORCH_ROOF.out;
  {
    const lo = roofAt(fz);
    const hi = roofAt(z0);
    face(k, [px0 - 0.1, lo + T, fz], [px1 + 0.1, lo + T, fz], [px1 + 0.1, hi + T, z0], [px0 - 0.1, hi + T, z0], PAL.roof, [0, 1, -1]);
    face(k, [px0 - 0.1, lo, fz], [px1 + 0.1, lo, fz], [px1 + 0.1, hi, z0], [px0 - 0.1, hi, z0], PAL.under, [0, -1, 0]);
    k.box(px0 - 0.1, lo - 0.18, fz - 0.03, px1 + 0.1, lo + T, fz + 0.03, PAL.roof); // its fascia
  }
  const SH = CLUB.steps + 0.15;
  for (const x of [px0 + 0.1, -SH, SH, px1 - 0.1]) {
    k.box(x - 0.08, D, pz0 + 0.02, x + 0.08, roofAt(pz0 + 0.1), pz0 + 0.18, PAL.log);
    solid(x, pz0 + 0.1, x, pz0 + 0.1, 0.1, D, D + 2.4);
  }
  // the railing along the front either side of the steps, and up the sides
  const rail = (ax, az, bx, bz) => {
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const [a0, a1] = alongX ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(az, bz), Math.max(az, bz)];
    const at = (t, w0, w1, y0, y1) => (alongX ? k.box(t, y0, az - w0, t + (w1 - t), y1, az + w0, PAL.log) : k.box(ax - w0, y0, t, ax + w0, y1, w1, PAL.log));
    at(a0, 0.05, a1, D + RAIL - 0.07, D + RAIL);
    at(a0, 0.04, a1, D + 0.12, D + 0.18);
    for (let t = a0 + 0.3; t < a1 - 0.1; t += 0.34) at(t - 0.022, 0.022, t + 0.022, D + 0.18, D + RAIL - 0.07);
    solid(ax, az, bx, bz, 0.08, D, D + RAIL);
  };
  rail(px0 + 0.1, pz0 + 0.1, -SH, pz0 + 0.1);
  rail(SH, pz0 + 0.1, px1 - 0.1, pz0 + 0.1);
  rail(px0 + 0.1, pz0 + 0.1, px0 + 0.1, z0 - 0.1);
  rail(px1 - 0.1, pz0 + 0.1, px1 - 0.1, z0 - 0.1);
  for (const [a, b] of [[-6.6, -4.4], [4.6, 6.6]]) {
    k.box(a, D + 0.42, z0 - 0.45, b, D + 0.47, z0 - 0.05, PAL.log);
    for (const x of [a + 0.1, b - 0.16]) k.box(x, D, z0 - 0.42, x + 0.06, D + 0.42, z0 - 0.08, PAL.batten);
    rectSolid(a, z0 - 0.45, b, z0, D, D + 0.47, { surface: 'boards' });
  }
  for (const x of [-4.2, 4.2, 0]) {
    const y = roofAt(pz0 + 1.6);
    k.box(x - 0.012, y - 0.25, pz0 + 1.59, x + 0.012, y, pz0 + 1.61, PAL.steel);
    kits.glow.box(x - 0.05, y - 0.36, pz0 + 1.55, x + 0.05, y - 0.25, pz0 + 1.65, PAL.bulb);
  }

  // solid: the walls, the hatch's counter
  rectSolid(x0, z0, x1, z1, low - 1, top);
  rectSolid(HATCH[0] - 0.1, z0 - 0.42, HATCH[2] + 0.1, z0, D + HATCH[1] - 0.06, D + HATCH[1]);
  blocker(x0 - EAVE, low, z0, x1 + EAVE, top, z1);
  blocker(x0 - EAVE, top, z0 - EAVE, x1 + EAVE, ridge - 0.5, z1 + EAVE);
  blocker(px0 - 0.1, roofAt(fz) - 0.18, fz, px1 + 0.1, roofAt(z0) + T, z0);
}

// ── The gun room, seen through the hatch ────────────────────────────────────
function gunRoom(k, glow, D) {
  const [x0, z0, x1, z1] = ROOM;
  const up = D + ROOM_UP;
  k.box(x0, D, z0, x1, D + 0.01, z1, PAL.floor);
  k.box(x0, up, z0, x1, up + 0.02, z1, PAL.pine);
  k.box(x0, D, z1 - 0.05, x1, up, z1, PAL.pine);
  k.box(x0, D, z0, x0 + 0.05, up, z1, PAL.pine);
  k.box(x1 - 0.05, D, z0, x1, up, z1, PAL.pine);
  for (let x = x0 + 0.3; x < x1; x += 0.3) k.box(x, D, z1 - 0.06, x + 0.012, up, z1 - 0.05, PAL.rack);
  // the counter's inside, a bench under the hatch
  k.box(HATCH[0], D, z0, HATCH[2], D + HATCH[1] - 0.06, z0 + 0.5, PAL.rack);
  // the rack of shotguns on the back wall, standing in a row
  const rz = z1 - 0.06;
  k.box(1.6, D + 0.85, rz - 0.2, 4.6, D + 0.92, rz, PAL.rack);
  k.box(1.6, D + 1.75, rz - 0.12, 4.6, D + 1.82, rz, PAL.rack);
  for (let i = 0; i < 7; i++) {
    const x = 1.85 + i * 0.42;
    k.box(x - 0.025, D + 0.92, rz - 0.15, x + 0.025, D + 1.24, rz - 0.07, PAL.stock);
    k.box(x - 0.015, D + 1.24, rz - 0.12, x + 0.015, D + 1.36, rz - 0.08, PAL.steel);
    beam(k, [x, D + 1.36, rz - 0.1], [x, D + 2.12, rz - 0.07], 0.022, PAL.steel);
  }
  antlers(k, 3.1, D + 2.3, rz + 0.04, 1.1, PAL.bone, PAL.plaque);
  // shelves of shells
  for (const y of [1.0, 1.42, 1.84]) {
    k.box(4.9, D + y - 0.03, rz - 0.3, 6.6, D + y, rz, PAL.rack);
    for (let i = 0; i < 6; i++) {
      const c = PAL.shells[(i + Math.round(y * 10)) % PAL.shells.length];
      const x = 4.98 + i * 0.27;
      k.box(x, D + y, rz - 0.24, x + 0.22, D + y + 0.11, rz - 0.06, c);
    }
  }
  // a bulb hanging over it all
  glow.box(2.65, up - 0.45, 29.7, 2.75, up - 0.35, 29.8, PAL.bulb);
  k.box(2.69, up - 0.35, 29.74, 2.71, up, 29.76, PAL.steel);
}

// ── The steps down off the porch ────────────────────────────────────────────
function steps(k, lay, site, D, g, rectSolid) {
  const w = CLUB.steps;
  for (const s of lay.steps) {
    const top = s.top - site.base;
    const bottom = Math.min(g(-w, s.z0), g(w, s.z0), g(0, s.z0)) - 0.2;
    k.box(-w, bottom, s.z0, w, top, s.z1, PAL.deck[0]);
    k.box(-w, top - 0.03, s.z0 - 0.02, w, top, s.z0 + 0.03, PAL.deck[1]);
    rectSolid(-w, s.z0, w, s.z1, bottom - 0.5, top, { surface: 'boards' });
  }
  // the stringers either side, from the porch down to the ground
  const n = lay.steps.length;
  if (n) {
    const z = EDGE - n * TREAD;
    for (const x of [-w - 0.06, w]) {
      const foot = g(x, z) - site.base;
      face(k, [x, D, EDGE], [x, foot, z], [x, foot - 0.25, z], [x, D - 0.25, EDGE], PAL.log, [x < 0 ? -1 : 1, 0, 0]);
      face(k, [x + 0.06, D, EDGE], [x + 0.06, foot, z], [x + 0.06, foot - 0.25, z], [x + 0.06, D - 0.25, EDGE], PAL.log, [x < 0 ? 1 : -1, 0, 0]);
    }
  }
}

// ── The board with the club's name on it, along the porch roof ──────────────
const SIGN = { big: 0.072, small: 0.05, gap: 0.12, margin: 0.16 }; // m: a square of the name's letters, of 'HUNT CLUB'; between the lines; round them
function sign(k, name, D) {
  const words = name.toUpperCase().replace(/ HUNT CLUB$/, '');
  const z = EDGE - PORCH_ROOF.out - 0.06;
  const bottom = D + PORCH_ROOF.low - 0.12;
  const h = 7 * SIGN.big + SIGN.gap + 7 * SIGN.small + SIGN.margin * 2;
  const mid = bottom + h / 2;
  // the board, its frame, and the lettering
  const width = Math.max(4.2, words.length * 6 * SIGN.big + SIGN.margin * 2 + 0.3);
  k.box(-width / 2, bottom, z, width / 2, bottom + h, z + 0.05, PAL.sign);
  k.box(-width / 2 - 0.05, bottom - 0.05, z + 0.01, width / 2 + 0.05, bottom + h + 0.05, z + 0.06, PAL.frame);
  const top = bottom + h - SIGN.margin;
  k.words(words, 0, top - (7 * SIGN.big) / 2, z - 0.002, 0, -1, SIGN.big, PAL.letters, { deep: 0.012 });
  k.words('HUNT CLUB', 0, top - 7 * SIGN.big - SIGN.gap - (7 * SIGN.small) / 2, z - 0.002, 0, -1, SIGN.small, PAL.letters, { deep: 0.01 });
  // a clay target's orange either end
  for (const s of [-1, 1]) k.box(s * (width / 2 - 0.22) - 0.08, mid - 0.08, z - 0.02, s * (width / 2 - 0.22) + 0.08, mid + 0.08, z, PAL.orange);
}

// ── The field ───────────────────────────────────────────────────────────────

function houses(k, lay, site, rectSolid, blocker) {
  for (const [key, h] of Object.entries(HOUSES)) {
    const [x0, z0, x1, z1] = h.box;
    const floor = lay.houses[key].floor - site.base;
    const bottom = lay.houses[key].low - site.base - 0.25;
    const top = floor + h.height;
    k.box(x0, bottom, z0, x1, top, z1, PAL.house);
    for (let x = x0 + 0.25; x < x1; x += 0.35) k.box(x - 0.02, floor, z1, x + 0.02, top, z1 + 0.02, PAL.post); // its boards
    k.box(x0 - 0.15, top, z0 - 0.15, x1 + 0.15, top + 0.16, z1 + 0.15, PAL.houseTrim); // the roof
    k.box(x0, bottom, z0, x1, floor + 0.25, z1 + 0.03, PAL.houseTrim); // a green skirt
    // the mouth the trap throws from, in its side towards the field
    const m = h.mouth;
    const sx = m.x > 0 ? -1 : 1; // which way it faces
    const mx = sx > 0 ? x1 : x0;
    const my = floor + m.up;
    k.panel(mx + sx * 0.005, my, m.z, sx, 0, 0.62, 0.42, PAL.mouth);
    k.box(Math.min(mx, mx + sx * 0.12), my - 0.27, m.z - 0.38, Math.max(mx, mx + sx * 0.12), my - 0.21, m.z + 0.38, PAL.houseTrim);
    // a door round the back, and its name on the front
    k.panel((x0 + x1) / 2, floor + 0.95, z0 - 0.005, 0, -1, 0.8, 1.9, PAL.houseTrim);
    const word = key === 'H' ? 'HIGH' : 'LOW';
    k.words(word, (x0 + x1) / 2, Math.min(top - 0.55, floor + 1.45), z1 + 0.025, 0, 1, 0.08, PAL.houseTrim);
    rectSolid(x0, z0, x1, z1, bottom - 0.5, top + 0.16);
    blocker(x0 - 0.15, bottom, z0 - 0.15, x1 + 0.15, top + 0.16, z1 + 0.15);
  }
}

function pads(k, lay, site, g, rectSolid) {
  const P = FIELD.pad;
  for (const [i, s] of STATIONS.entries()) {
    const pad = lay.pads[i];
    const top = pad.top - site.base;
    k.box(s.x - P, pad.low - site.base - 0.15, s.z - P, s.x + P, top - 0.01, s.z + P, PAL.padSide, 'y+');
    k.box(s.x - P, top - 0.01, s.z - P, s.x + P, top, s.z + P, PAL.pad, 'y-');
    rectSolid(s.x - P, s.z - P, s.x + P, s.z + P, pad.low - site.base - 1, top, { surface: 'tarmac' });
    // its number painted near the edge you walk up to it from (the outside of
    // the arc; station 8's from station 4), the right way up as you come
    let ox = 0;
    let oz = 1;
    if (s.n !== 8) {
      const cz = -Math.sqrt(FIELD.radius ** 2 - (FIELD.chord / 2) ** 2);
      const l = Math.hypot(s.x, s.z - cz);
      ox = s.x / l;
      oz = (s.z - cz) / l;
    }
    flatWords(k, String(s.n), s.x + ox * (P - PAD_NUMBER.in), top + LIFT / 4, s.z + oz * (P - PAD_NUMBER.in), -ox, -oz, PAD_NUMBER.px, PAL.houseTrim);
  }
  // the stake at the crossing point, its top orange
  const cy = g(0, FIELD.cross);
  k.box(-0.025, cy - 0.2, FIELD.cross - 0.025, 0.025, cy + 0.45, FIELD.cross + 0.025, PAL.post);
  k.box(-0.035, cy + 0.45, FIELD.cross - 0.035, 0.035, cy + 0.6, FIELD.cross + 0.035, PAL.orange);
}

// The walks: round the arc through the pads, out from station 4 to station 8,
// and back from station 4 to the porch steps; each following the ground.
function walks(k, lay, site, g) {
  const ribbon = (pts, w) => {
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
      const [px, pz] = pts[Math.max(0, i - 1)];
      let dx = nx - px;
      let dz = nz - pz;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const lx = x - dz * (w / 2);
      const lz = z + dx * (w / 2);
      const rx = x + dz * (w / 2);
      const rz = z - dx * (w / 2);
      const cut = [
        [lx, g(lx, lz) + LIFT, lz],
        [rx, g(rx, rz) + LIFT, rz],
      ];
      if (prev) face(k, prev[0], prev[1], cut[1], cut[0], PAL.walk, [0, 1, 0]);
      prev = cut;
    }
  };
  const R = FIELD.radius;
  const cz = -Math.sqrt(R * R - (FIELD.chord / 2) ** 2);
  const a1 = Math.atan2(-cz, -FIELD.chord / 2);
  const a7 = Math.atan2(-cz, FIELD.chord / 2);
  const arc = [];
  const n = Math.ceil((R * (a1 - a7)) / 1.0);
  for (let i = 0; i <= n; i++) {
    const a = a1 + ((a7 - a1) * i) / n;
    arc.push([R * Math.cos(a), cz + R * Math.sin(a)]);
  }
  ribbon(arc, WALK);
  const line = (x, za, zb) => {
    const pts = [];
    const m = Math.max(1, Math.ceil(Math.abs(zb - za)));
    for (let i = 0; i <= m; i++) pts.push([x, za + ((zb - za) * i) / m]);
    return pts;
  };
  const s4 = STATIONS[3];
  ribbon(line(0, FIELD.pad, s4.z - FIELD.pad), 0.8);
  ribbon(line(0, s4.z + FIELD.pad, EDGE - lay.steps.length * TREAD), 1.1);
}
