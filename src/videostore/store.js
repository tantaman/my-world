// What the video store looks like, made in code like everything else:
// vertex-coloured boxes and quads, a few meshes in all, and one texture,
// the atlas of every cover (covers.js), for the boxes on the shelves.
//
//   outside   one slab of tarmac for the car park and the shop, set on the
//             ground as it is (site.js), with its spaces painted on; a
//             pavement along the front; the building, stucco with a teal
//             stripe, its glass front with posters in the windows, sliding
//             doors, and over them the sign, REWIND VIDEO in yellow on
//             indigo beside a cassette; a drop box for returns by the door,
//             lamps over the car park, the air conditioning on the roof
//   inside    patterned carpet, a ceiling of tiles and strip lights, and
//             floorplan.js's shelving, every slot with its box (or a card
//             saying all the copies are out); the signs; the counter with
//             its till, the tapes on the wall behind it and a television
//             over the clerk's head; sweets in front; the kids' corner with
//             its own television and two bean bags; stand-ups by the door
//             and the security gate
//
// Everything is built round the store's own origin (the middle of the shop
// floor, at the slab's top) and that group is what's put in the world, so
// nothing big goes to the graphics card (render/origin.js).
//
// The inside is lit by its own strip lights, whatever the sun is doing: its
// surfaces glow with a share of their own colour (materials.inside, set up
// by index.js), and the covers and the carpet likewise.
//
//   buildStore(site, ground, { catalog, atlas, hidden, out, materials }) -> {
//     object    the group, placed and turned where the store is
//     solids    capsules for the world's Solids
//     blockers  boxes the camera can't see through: { inv, half }
//     doors     [left, right] glass panels, to slide open (their x, in the
//               store's frame, when shut: doors[i].userData.shut)
//     boxes     the boxes on the shelves: show(key, on) for a slot
//               ('face:col:row'), to take one down and put it back
//   }
//   hidden    slots whose box isn't there (in your hands, or rented by you)
//   out       ids of the new releases with every copy out today
//   materials { outside, inside, covers, carpet, glow, neon, glass, screen }
//   makeHeldBox(material) -> { object, show(film, atlas) }: a box in the hand
//   ground(x, z) -> height of the ground in the world

import * as THREE from 'three';
import { toWorld } from '../landmarks/sites.js';
import { HALF_W, BACK, FRONT, SLAB, SKIRT } from './site.js';
import { FACE_BY_ID, RACKS, BOX, ROW, SOLIDS, CEILING, COUNTER, CANDY, KIDS, STANDEES, GATE, DOOR, CLERK, RETURN_SLOT, slotAt, signs } from './floorplan.js';
import { STORE } from './catalog.js';
import { layout } from './font.js';

const col = (hex) => new THREE.Color(hex);
const PAL = {
  tarmac: col(0x3a3b3e),
  skirt: col(0x55524c),
  line: col(0xe8e6dc),
  yellow: col(0xf2c230),
  pavement: col(0xa8a49a),
  stucco: col(0xd9c9a6),
  stuccoDark: col(0xb9a888),
  teal: col(0x19a89e),
  magenta: col(0xd62a7a),
  indigo: col(0x2b1a5c),
  neon: col(0xffd84a),
  metal: col(0x5a5e66),
  frame: col(0x2a2c30),
  roof: col(0x6e6c68),
  wallIn: col(0xe6e2d8),
  ceiling: col(0xd9d7cf),
  tileLine: col(0xa9a79f),
  strip: col(0xfff6e0),
  rack: col(0x1e3a62),
  rackDark: col(0x142a48),
  shelf: col(0xc9ccd2),
  rail: col(0xf2c230),
  cap: col(0xd62a7a),
  signPanel: col(0x1a1440),
  white: col(0xf2f0ea),
  black: col(0x18181a),
  tape: col(0x222224),
  label: col(0xe8e4d8),
  counter: col(0xd62a7a),
  counterTop: col(0x19a89e),
  screen: col(0x2a3a4a),
  card: col(0xfaf6e8),
  red: col(0xd8262a),
  cardboard: col(0xb08a5a),
  bean: [col(0xd62a7a), col(0x19a89e)],
  candy: [0xe8262a, 0xf2c230, 0x2a6ad8, 0x8a2ad8, 0x2ab84a, 0xf28c1a, 0xffffff].map(col),
};

const WALL_T = 0.25; // m, the walls' thickness
const ROOF = 4.55; // m, the top of the roof deck
const PARAPET = 5.0; // m, the top of the low wall round the roof
const GLASS_TOP = 3.05; // m, the top of the glass front
const FASCIA = { y0: 3.2, y1: 6.3, out: 0.45 }; // the sign band over the front, and how far it stands out
const SIGN_PX = 0.2; // m, one square of the big sign's letters
const LOT = { z0: 12.2, z1: SLAB[3] - 0.4, space: 2.7 }; // the car park's painted spaces
const PAVE = { z0: FRONT, z1: LOT.z0 }; // the pavement along the front
const LIFT = 0.006; // m, paint and carpet over what they're on
export const DROP_BOX = { x: 3.1, z: FRONT + 0.75 }; // the returns box outside, by the doors
const LAMPS = [
  { x: -12.6, z: 23.6 },
  { x: 12.6, z: 23.6 },
];

const _w = { x: 0, z: 0 };
const _r = {};

// ── Building blocks ─────────────────────────────────────────────────────────
// Vertex-coloured geometry, gathered into one mesh per material.
export class Kit {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
  }

  // a flat four-cornered piece, a b c d round it (anticlockwise seen from
  // the front), facing n; uv: [u0, v0, u1, v1] across it, v0 at the top
  quad(a, b, c, d, n, color, uv = null) {
    for (const [p, t] of [
      [a, [0, 1]],
      [b, [1, 1]],
      [c, [1, 0]],
      [a, [0, 1]],
      [c, [1, 0]],
      [d, [0, 0]],
    ]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(color.r, color.g, color.b);
      if (uv) this.uv.push(uv[0] + (uv[2] - uv[0]) * t[0], uv[1] + (uv[3] - uv[1]) * t[1]);
      else this.uv.push(0, 0);
    }
  }

  // a box from (x0, y0, z0) to (x1, y1, z1); skip: faces to leave off
  // ('x-', 'x+', 'y-', 'y+', 'z-', 'z+')
  box(x0, y0, z0, x1, y1, z1, color, skip = '') {
    const f = (k) => !skip.includes(k);
    if (f('z+')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color);
    if (f('z-')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color);
    if (f('x+')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color);
    if (f('x-')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color);
    if (f('y+')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color);
    if (f('y-')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color);
  }

  // an upright panel facing (nx, nz), its middle at (x, y, z), w across and
  // h up; uv as for quad
  panel(x, y, z, nx, nz, w, h, color, uv = null) {
    const ux = nz;
    const uz = -nx; // to the right, seen from in front
    const hw = w / 2;
    const hh = h / 2;
    this.quad([x - ux * hw, y - hh, z - uz * hw], [x + ux * hw, y - hh, z + uz * hw], [x + ux * hw, y + hh, z + uz * hw], [x - ux * hw, y + hh, z - uz * hw], [nx, 0, nz], color, uv);
  }

  // words in the 5 × 7 font (small: 3 × 5) on an upright, facing (nx, nz),
  // middled on (x, y, z), each square px across; deep: squares that stand
  // out from what they're on this far, as a sign's letters do
  words(text, x, y, z, nx, nz, px, color, { deep = 0, small = false } = {}) {
    const L = layout(text, small);
    const ux = nz;
    const uz = -nx;
    const left = (-L.width * px) / 2;
    const top = (L.height * px) / 2;
    for (const [i, j] of L.dots) {
      const a = left + i * px;
      const v = top - j * px;
      const cx = x + ux * (a + px / 2) + nx * deep;
      const cz = z + uz * (a + px / 2) + nz * deep;
      this.panel(cx, y + v - px / 2, cz, nx, nz, px * 0.96, px * 0.96, color);
      if (deep > 0.001) {
        // the sides of each square, back to what it's on
        const bx = cx - nx * deep;
        const bz = cz - nz * deep;
        this.box(Math.min(cx, bx) - (Math.abs(ux) * px) / 2, y + v - px, Math.min(cz, bz) - (Math.abs(uz) * px) / 2, Math.max(cx, bx) + (Math.abs(ux) * px) / 2, y + v, Math.max(cz, bz) + (Math.abs(uz) * px) / 2, color.clone().multiplyScalar(0.55), nx > 0 ? 'x+' : nx < 0 ? 'x-' : nz > 0 ? 'z+' : 'z-');
      }
    }
    return L.width * px;
  }

  get empty() {
    return this.pos.length === 0;
  }

  build(withUv = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ── The store ───────────────────────────────────────────────────────────────

export function buildStore(site, ground, { catalog, atlas, hidden = new Set(), out = new Set(), materials }) {
  const object = new THREE.Group();
  object.position.set(site.x, site.top, site.z);
  object.rotation.y = site.yaw;
  // the ground under a point of the store's frame, measured from the slab's top
  const g = (lx, lz) => {
    toWorld(site, lx, lz, _w);
    return ground(_w.x, _w.z) - site.top;
  };
  const kits = { outside: new Kit(), inside: new Kit(), glow: new Kit(), neon: new Kit(), glass: new Kit(), screen: new Kit(), carpet: new Kit(), posters: new Kit() };
  const solids = [];
  const blockers = [];
  const solid = (ax, az, bx, bz, r, bottom, top, extra) => {
    const a = toWorld(site, ax, az);
    const b = toWorld(site, bx, bz);
    solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r, bottom: site.top + bottom, topA: site.top + top, topB: site.top + top, ...extra });
  };
  // a rectangle of the store's frame as capsules along its long side
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

  slab(kits.outside, g, site, solids, solid);
  // the carpet underfoot, a hair over the slab, for its footsteps
  rectSolid(-HALF_W, BACK, HALF_W, FRONT, -0.5, LIFT, { surface: 'carpet', step: 0.34 });
  lot(kits.outside);
  shell(kits, solid, rectSolid, blocker, site.theme);
  sign(kits, site.theme);
  outsideThings(kits, solid, catalog, atlas);
  insideShell(kits);
  shelving(kits, catalog);
  signsInside(kits, catalog.faces);
  counter(kits);
  corners(kits, catalog, atlas);
  for (const [x0, z0, x1, z1, h] of SOLIDS) rectSolid(x0, z0, x1, z1, 0, h);

  const add = (kit, material, uv = false, shadow = true) => {
    if (kit.empty) return null;
    const mesh = new THREE.Mesh(kit.build(uv), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    object.add(mesh);
    return mesh;
  };
  add(kits.outside, materials.outside);
  add(kits.inside, materials.inside);
  add(kits.carpet, materials.carpet, true, false);
  add(kits.posters, materials.covers, true, false);
  add(kits.glow, materials.glow, false, false);
  add(kits.neon, materials.neon, false, false);
  add(kits.screen, materials.screen, false, false);
  const glass = add(kits.glass, materials.glass, false, false);
  if (glass) glass.renderOrder = 2;

  // the boxes on the shelves, in a mesh of their own so one can be taken down
  const boxes = shelfBoxes(catalog, atlas, hidden, out, materials);
  object.add(boxes.mesh);
  if (boxes.tags) object.add(boxes.tags);

  const doors = slidingDoors(materials);
  for (const d of doors) object.add(d);

  object.updateMatrixWorld(true);
  const blocks = blockers.map(({ c, h }) => {
    const local = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]);
    const world = object.matrixWorld.clone().multiply(local);
    return { inv: world.invert(), half: h };
  });
  return { object, solids, blockers: blocks, doors, boxes };
}

// ── Outside ─────────────────────────────────────────────────────────────────

// The slab: its top, and its sloping sides down to below the ground all
// round; and the solids you stand on, top and sides (as the launch pad's).
function slab(m, g, site, solids, solid) {
  const [x0, z0, x1, z1] = SLAB;
  const out = SKIRT;
  m.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], PAL.tarmac);
  const top = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const foot = [
    [x0 - out, z0 - out],
    [x1 + out, z0 - out],
    [x1 + out, z1 + out],
    [x0 - out, z1 + out],
  ];
  const depth = (x, z) => Math.min(-0.3, g(x, z) - 0.4);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const n = 10;
    for (let k = 0; k < n; k++) {
      const a = k / n;
      const b = (k + 1) / n;
      const ta = lerp2(top[i], top[j], a);
      const tb = lerp2(top[i], top[j], b);
      const fa = lerp2(foot[i], foot[j], a);
      const fb = lerp2(foot[i], foot[j], b);
      // (the side faces out: its normal is roughly the way out from the middle)
      const nx = (fa[0] + fb[0]) / 2 - (ta[0] + tb[0]) / 2;
      const nz = (fa[1] + fb[1]) / 2 - (ta[1] + tb[1]) / 2;
      const l = Math.hypot(nx, nz, 1);
      m.quad([fb[0], depth(...fb), fb[1]], [fa[0], depth(...fa), fa[1]], [ta[0], 0, ta[1]], [tb[0], 0, tb[1]], [nx / l, 1 / l, nz / l], PAL.skirt);
    }
  }
  const rise = site.top - site.low;
  // the top, as wide capsules across it
  const rows = Math.round((x1 - x0) / 3.6);
  const R = (x1 - x0) / rows / 2;
  for (let i = 0; i < rows; i++) solid(x0 + R * (2 * i + 1), z0 + R, x0 + R * (2 * i + 1), z1 - R, R + 0.05, -rise - 1, 0, { surface: 'tarmac' });
  // and the sloping sides, from the top's edge down to the ground
  for (let i = 0; i < 4; i++) {
    const [u, v] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][i];
    const along = u ? [z0, z1] : [x0, x1];
    for (let t = along[0] + 0.6; t <= along[1] - 0.6; t += 1.2) {
      const ax = u ? (u > 0 ? x1 : x0) - u * 0.3 : t;
      const az = v ? (v > 0 ? z1 : z0) - v * 0.3 : t;
      const bx = u ? ax + u * (out + 0.3) : t;
      const bz = v ? az + v * (out + 0.3) : t;
      const a = toWorld(site, ax, az);
      const b = toWorld(site, bx, bz);
      solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 0.6, bottom: site.top - rise - 1, topA: site.top, topB: site.top + Math.min(0, g(bx, bz)), surface: 'tarmac' });
    }
  }
}

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// The pavement and the car park's painted spaces.
function lot(m) {
  const [x0, , x1] = SLAB;
  m.box(x0, 0, PAVE.z0, x1, 0.12, PAVE.z1, PAL.pavement, 'y-');
  // the kerb by the doors, painted yellow
  m.box(-4, 0.004, PAVE.z1 - 0.12, 4, 0.124, PAVE.z1 + 0.002, PAL.yellow, 'y-');
  const S = LOT.space;
  const n = Math.floor((x1 - x0 - 2) / S);
  const left = -(n * S) / 2;
  const mid = (LOT.z0 + LOT.z1) / 2;
  for (let i = 0; i <= n; i++) {
    const x = left + i * S;
    m.box(x - 0.05, 0, LOT.z0 + 0.6, x + 0.05, LIFT, mid - 0.5, PAL.line, 'y-');
    m.box(x - 0.05, 0, mid + 0.5, x + 0.05, LIFT, LOT.z1, PAL.line, 'y-');
  }
  m.box(left, 0, mid - 0.05, left + n * S, LIFT, mid + 0.05, PAL.line, 'y-');
  // wheel stops at the head of each space
  for (let i = 0; i < n; i++) {
    const x = left + (i + 0.5) * S;
    m.box(x - 0.7, 0, LOT.z0 + 0.75, x + 0.7, 0.12, LOT.z0 + 0.95, PAL.pavement, 'y-');
  }
}

// The walls, the glass front, the roof, and the solids and camera blockers
// that go with them.
function shell(kits, solid, rectSolid, blocker, theme) {
  const m = kits.outside;
  const X = HALF_W + WALL_T;
  const Z0 = BACK - WALL_T;
  // the outside of the back and the side walls, up to the parapet
  m.box(-X, 0, Z0, X, PARAPET, BACK, PAL.stucco, 'z+');
  m.box(-X, 0, BACK, -HALF_W, PARAPET, FRONT, PAL.stucco, 'x+');
  m.box(HALF_W, 0, BACK, X, PARAPET, FRONT, PAL.stucco, 'x-');
  // a teal stripe round them, and a darker plinth: bands on their outsides
  for (const [y0, y1, c] of [
    [3.3, 3.6, PAL.teal],
    [0, 0.4, PAL.stuccoDark],
  ]) {
    const y = (y0 + y1) / 2;
    const h = y1 - y0;
    m.panel(0, y, Z0 - 0.01, 0, -1, 2 * X + 0.02, h, c);
    m.panel(-X - 0.01, y, (Z0 + FRONT) / 2, -1, 0, FRONT - Z0, h, c);
    m.panel(X + 0.01, y, (Z0 + FRONT) / 2, 1, 0, FRONT - Z0, h, c);
  }
  // the roof deck, and the inside of the parapet over it
  m.quad([-HALF_W, ROOF, FRONT], [HALF_W, ROOF, FRONT], [HALF_W, ROOF, BACK], [-HALF_W, ROOF, BACK], [0, 1, 0], PAL.roof);
  // the glass front: a kick plate along the foot, posts between the panes,
  // a bar along the top, and the wall from there up to the fascia
  const F = FRONT;
  m.box(-HALF_W, 0, F - 0.06, DOOR.x0 - 0.1, 0.35, F + 0.06, PAL.frame);
  m.box(DOOR.x1 + 0.1, 0, F - 0.06, HALF_W, 0.35, F + 0.06, PAL.frame);
  for (const x of [-HALF_W, -8.6, -5.2, DOOR.x0 - 0.1, DOOR.x1 + 0.1, 5.2, 8.6, HALF_W]) m.box(x - 0.07, 0, F - 0.07, x + 0.07, GLASS_TOP, F + 0.07, PAL.frame);
  m.box(-HALF_W, GLASS_TOP - 0.1, F - 0.08, HALF_W, GLASS_TOP + 0.05, F + 0.08, PAL.frame);
  m.box(-X, GLASS_TOP + 0.05, F - 0.1, X, FASCIA.y0, F + 0.1, PAL.stucco);
  const glass = kits.glass;
  for (const [a, b] of [
    [-HALF_W, DOOR.x0 - 0.1],
    [DOOR.x1 + 0.1, HALF_W],
  ]) {
    glass.quad([a, 0.35, F], [b, 0.35, F], [b, GLASS_TOP - 0.1, F], [a, GLASS_TOP - 0.1, F], [0, 0, 1], PAL.white);
  }
  // the fascia the sign is on, standing out over the pavement
  const fz = F + FASCIA.out;
  m.box(-X - 0.2, FASCIA.y0, F, X + 0.2, FASCIA.y1, fz, theme ? col(theme.fascia) : PAL.indigo);
  m.box(-X - 0.2, FASCIA.y0 - 0.12, F, X + 0.2, FASCIA.y0, fz + 0.04, PAL.teal);
  m.box(-X - 0.2, FASCIA.y1, F - 0.1, X + 0.2, FASCIA.y1 + 0.12, fz + 0.04, PAL.magenta);
  // lights under the fascia, over the pavement
  for (let x = -10; x <= 10; x += 4) kits.neon.box(x - 0.3, FASCIA.y0 - 0.14, F + 0.15, x + 0.3, FASCIA.y0 - 0.12, F + 0.35, PAL.strip);
  // air conditioning on the roof
  for (const [x, z] of [
    [-6, -3],
    [5, 2],
  ]) {
    m.box(x - 1.1, ROOF, z - 0.8, x + 1.1, ROOF + 1.1, z + 0.8, PAL.metal);
    m.box(x - 0.5, ROOF + 1.1, z - 0.5, x + 0.5, ROOF + 1.16, z + 0.5, PAL.frame);
  }
  // a back door, and a dumpster by it
  m.box(4, 0, Z0 - 0.03, 5.2, 2.3, Z0, PAL.metal);
  m.box(-8, 0, Z0 - 1.9, -6, 1.3, Z0 - 0.3, col(0x2e5a3a));
  rectSolid(-8, Z0 - 1.9, -6, Z0 - 0.3, 0, 1.3);

  // solids: the walls, and the glass either side of the doors. Not the roof:
  // anything set down here from the map would land on it
  const r = WALL_T / 2;
  solid(-X + r, Z0 + r, X - r, Z0 + r, r + 0.02, 0, PARAPET);
  solid(-X + r, Z0 + r, -X + r, F, r + 0.02, 0, PARAPET);
  solid(X - r, Z0 + r, X - r, F, r + 0.02, 0, PARAPET);
  solid(-HALF_W, F, DOOR.x0 - 0.2, F, 0.1, 0, GLASS_TOP + 1);
  solid(DOOR.x1 + 0.2, F, HALF_W, F, 0.1, 0, GLASS_TOP + 1);
  // the camera stays inside the walls, and under the ceiling
  blocker(-X, 0, Z0, X, PARAPET, BACK);
  blocker(-X, 0, BACK, -HALF_W, PARAPET, F);
  blocker(HALF_W, 0, BACK, X, PARAPET, F);
  blocker(-X, 0, F - 0.1, DOOR.x0 - 0.1, PARAPET, F + 0.1);
  blocker(DOOR.x1 + 0.1, 0, F - 0.1, X, PARAPET, F + 0.1);
  blocker(DOOR.x0 - 0.1, GLASS_TOP - 0.1, F - 0.1, DOOR.x1 + 0.1, PARAPET, F + 0.1);
  blocker(-X, CEILING, BACK, X, ROOF, F);
  blocker(-X - 0.2, FASCIA.y0, F, X + 0.2, FASCIA.y1, F + FASCIA.out);
}

// REWIND VIDEO, in yellow letters standing out from the fascia, beside a
// cassette; and under it, smaller, the motto.
function sign(kits, theme) {
  const z = FRONT + FASCIA.out;
  const y = (FASCIA.y0 + FASCIA.y1) / 2 + 0.25;
  const text = STORE.name.toUpperCase();
  const w = layout(text).width * SIGN_PX;
  const cx = 1.6;
  kits.neon.words(text, cx, y, z, 0, 1, SIGN_PX, PAL.neon, { deep: 0.12 });
  const subtitle = theme ? `${theme.label} specialists` : STORE.motto;
  kits.neon.words(subtitle.toUpperCase(), cx, FASCIA.y0 + 0.42, z + 0.01, 0, 1, 0.055, PAL.white);
  // the cassette: a magenta body, a window, two teal reels
  const lx = cx - w / 2 - 2.1;
  const m = kits.outside;
  m.box(lx - 1.5, y - 0.95, z, lx + 1.5, y + 0.95, z + 0.1, PAL.magenta);
  m.box(lx - 1.1, y - 0.35, z + 0.1, lx + 1.1, y + 0.45, z + 0.13, PAL.black);
  for (const s of [-1, 1]) {
    m.box(lx + s * 0.6 - 0.28, y - 0.2, z + 0.13, lx + s * 0.6 + 0.28, y + 0.3, z + 0.17, PAL.teal);
    m.box(lx + s * 0.6 - 0.08, y - 0.03, z + 0.17, lx + s * 0.6 + 0.08, y + 0.13, z + 0.19, PAL.black);
  }
  m.box(lx - 0.7, y - 0.95, z + 0.1, lx + 0.7, y - 0.6, z + 0.14, PAL.indigo);
  // OPEN, in the window by the door, and the hours
  kits.neon.words('OPEN', DOOR.x1 + 1.6, 2.2, FRONT - 0.05, 0, 1, 0.07, col(0xff3a6a));
  kits.glow.words('OPEN 10 AM TO MIDNIGHT', DOOR.x0 - 1.7, 2.3, FRONT - 0.04, 0, 1, 0.02, PAL.white, { small: true });
}

// The drop box, the lamps over the car park, posters in the windows.
function outsideThings(kits, solid, catalog, atlas) {
  const m = kits.outside;
  const d = DROP_BOX;
  m.box(d.x - 0.35, 0.12, d.z - 0.3, d.x + 0.35, 1.15, d.z + 0.3, PAL.indigo);
  m.box(d.x - 0.38, 1.15, d.z - 0.33, d.x + 0.38, 1.25, d.z + 0.33, PAL.teal);
  m.box(d.x - 0.2, 0.9, d.z + 0.3, d.x + 0.2, 0.96, d.z + 0.31, PAL.black);
  kits.glow.words('RETURNS', d.x, 0.7, d.z + 0.312, 0, 1, 0.022, PAL.neon, { small: true });
  solid(d.x, d.z, d.x, d.z, 0.4, 0, 1.25);
  for (const l of LAMPS) {
    m.box(l.x - 0.08, 0, l.z - 0.08, l.x + 0.08, 6.2, l.z + 0.08, PAL.metal);
    const dir = -Math.sign(l.x);
    m.box(Math.min(l.x, l.x + dir * 1.4), 6.1, l.z - 0.06, Math.max(l.x, l.x + dir * 1.4), 6.22, l.z + 0.06, PAL.metal);
    m.box(l.x + dir * 1.4 - 0.35, 5.95, l.z - 0.2, l.x + dir * 1.4 + 0.35, 6.12, l.z + 0.2, PAL.frame);
    kits.neon.box(l.x + dir * 1.4 - 0.3, 5.94, l.z - 0.16, l.x + dir * 1.4 + 0.3, 5.95, l.z + 0.16, PAL.strip, 'y+');
    solid(l.x, l.z, l.x, l.z, 0.15, 0, 6.2);
  }
  // posters in the windows, facing out, of the newest films
  const news = catalog.section('new');
  const spots = [-10.4, -6.9, 6.9, 10.4];
  spots.forEach((x, i) => {
    const f = news[(i * 29 + 7) % news.length];
    if (!f) return;
    const r = atlas.rect(f.id, _r);
    kits.posters.panel(x, 1.75, FRONT - 0.03, 0, 1, 0.9, 1.35, PAL.white, [r.u0, r.v0, r.u1, r.v1]);
    // and its back, plain, from inside the shop
    kits.inside.panel(x, 1.75, FRONT - 0.04, 0, -1, 0.9, 1.35, PAL.card);
  });
}

// ── Inside ──────────────────────────────────────────────────────────────────

function insideShell(kits) {
  const m = kits.inside;
  // the walls' inside faces, a stripe round them, and the ceiling with its lights
  m.quad([-HALF_W, 0, BACK], [HALF_W, 0, BACK], [HALF_W, CEILING, BACK], [-HALF_W, CEILING, BACK], [0, 0, 1], PAL.wallIn);
  m.quad([-HALF_W, 0, FRONT], [-HALF_W, 0, BACK], [-HALF_W, CEILING, BACK], [-HALF_W, CEILING, FRONT], [1, 0, 0], PAL.wallIn);
  m.quad([HALF_W, 0, BACK], [HALF_W, 0, FRONT], [HALF_W, CEILING, FRONT], [HALF_W, CEILING, BACK], [-1, 0, 0], PAL.wallIn);
  m.quad([HALF_W, GLASS_TOP, FRONT], [-HALF_W, GLASS_TOP, FRONT], [-HALF_W, CEILING, FRONT], [HALF_W, CEILING, FRONT], [0, 0, -1], PAL.wallIn);
  m.box(-HALF_W, 2.95, BACK, HALF_W, 3.15, BACK + 0.02, PAL.teal, 'y-y+');
  m.box(-HALF_W, 2.95, BACK, -HALF_W + 0.02, 3.15, FRONT, PAL.teal, 'y-y+');
  m.box(HALF_W - 0.02, 2.95, BACK, HALF_W, 3.15, FRONT, PAL.teal, 'y-y+');
  m.quad([-HALF_W, CEILING, BACK], [HALF_W, CEILING, BACK], [HALF_W, CEILING, FRONT], [-HALF_W, CEILING, FRONT], [0, -1, 0], PAL.ceiling);
  for (let x = -HALF_W + 1.2; x < HALF_W; x += 1.2) m.box(x - 0.02, CEILING - 0.02, BACK, x + 0.02, CEILING, FRONT, PAL.tileLine, 'y+');
  for (let z = BACK + 1.2; z < FRONT; z += 1.2) m.box(-HALF_W, CEILING - 0.02, z - 0.02, HALF_W, CEILING, z + 0.02, PAL.tileLine, 'y+');
  for (let x = -HALF_W + 2.4; x < HALF_W - 1; x += 3.6) for (let z = BACK + 1.8; z < FRONT - 0.5; z += 2.4) kits.glow.box(x - 0.6, CEILING - 0.04, z - 0.3, x + 0.6, CEILING - 0.02, z + 0.3, PAL.strip, 'y+');
  // the carpet, its pattern from the texture, a tile every metre and a bit
  const T = 1.2;
  kits.carpet.quad([-HALF_W, LIFT, FRONT], [HALF_W, LIFT, FRONT], [HALF_W, LIFT, BACK], [-HALF_W, LIFT, BACK], [0, 1, 0], PAL.white, [-HALF_W / T, FRONT / T, HALF_W / T, BACK / T]);
  // a mat inside the doors
  m.box(DOOR.x0, 0, FRONT - 1.6, DOOR.x1, 0.015, FRONT - 0.05, PAL.black, 'y-');
}

// Every run of shelving: its back, its ends, its shelves with their price
// rails, a cap along its top.
function shelving(kits, catalog) {
  const m = kits.inside;
  for (const f of catalog.faces) {
    const R = RACKS[f.kind];
    const ux = f.ux;
    const uz = f.uz;
    // the face's rectangle on the floor, from its front back to its back
    const ax = f.x0;
    const az = f.z0;
    const bx = f.x0 + ux * f.len;
    const bz = f.z0 + uz * f.len;
    const back = f.kind === 'island' && f.section !== 'picks' && f.section !== 'sale' ? f.depth - 0.02 : f.depth;
    const cx = [ax, bx, ax - f.nx * back, bx - f.nx * back];
    const cz = [az, bz, az - f.nz * back, bz - f.nz * back];
    const x0 = Math.min(...cx);
    const x1 = Math.max(...cx);
    const z0 = Math.min(...cz);
    const z1 = Math.max(...cz);
    // the back panel
    const px = ax - f.nx * (back - 0.02);
    const pz = az - f.nz * (back - 0.02);
    m.panel(px + (ux * f.len) / 2, R.height / 2, pz + (uz * f.len) / 2, f.nx, f.nz, f.len, R.height, PAL.rack);
    // the kick along the foot, and the cap along the top
    boxFace(m, f, 0, R.y0 - 0.04, 0.02, back, PAL.rackDark);
    m.box(x0, R.height - 0.06, z0, x1, R.height, z1, PAL.cap);
    // the ends
    for (const t of [0, f.len]) {
      const ex = ax + ux * t;
      const ez = az + uz * t;
      const e0x = Math.min(ex, ex - f.nx * back) - Math.abs(ux) * 0.02;
      const e1x = Math.max(ex, ex - f.nx * back) + Math.abs(ux) * 0.02;
      const e0z = Math.min(ez, ez - f.nz * back) - Math.abs(uz) * 0.02;
      const e1z = Math.max(ez, ez - f.nz * back) + Math.abs(uz) * 0.02;
      m.box(e0x, 0, e0z, e1x, R.height, e1z, PAL.rack);
    }
    // a shelf under each row, with a yellow rail along its front
    for (let row = 0; row < R.rows; row++) {
      const y = R.y0 + row * ROW;
      boxFace(m, f, y - 0.035, y, -0.04, back, PAL.shelf);
      boxFace(m, f, y - 0.05, y + 0.02, -0.05, -0.035, PAL.rail);
    }
    // a staff pick's card under each box, and whose picks they are
    if (f.section === 'picks') {
      const who = catalog.staff[f.staff % catalog.staff.length].name.toUpperCase();
      const mid = f.len / 2;
      kits.glow.words(`${who}’S PICKS`, ax + ux * mid + f.nx * 0.01, R.height + 0.16, az + uz * mid + f.nz * 0.01, f.nx, f.nz, 0.016, PAL.neon);
      m.panel(ax + ux * mid - f.nx * 0.03, R.height + 0.16, az + uz * mid - f.nz * 0.03, f.nx, f.nz, f.len, 0.22, PAL.signPanel);
      for (let c = 0; c < f.cols; c++) {
        for (let row = 0; row < f.rows; row++) {
          const s = slotAt(f, c, row, {});
          m.panel(s.x + f.nx * 0.05, s.y - BOX.h / 2 - 0.03, s.z + f.nz * 0.05, f.nx, f.nz, 0.11, 0.05, PAL.card);
        }
      }
    }
    if (f.section === 'sale') {
      const mid = f.len / 2;
      kits.glow.words('$9.99 SALE', ax + ux * mid + f.nx * 0.01, R.height + 0.16, az + uz * mid + f.nz * 0.01, f.nx, f.nz, 0.016, PAL.white);
      m.panel(ax + ux * mid - f.nx * 0.03, R.height + 0.16, az + uz * mid - f.nz * 0.03, f.nx, f.nz, f.len, 0.22, PAL.red);
    }
  }
}

// A slab along a face, from `front` to `back` metres behind its front
// (negative: out in front of it), between heights y0 and y1.
function boxFace(m, f, y0, y1, front, back, color) {
  const ax = f.x0 - f.nx * front;
  const az = f.z0 - f.nz * front;
  const bx = f.x0 + f.ux * f.len - f.nx * back;
  const bz = f.z0 + f.uz * f.len - f.nz * back;
  m.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), color);
}

// The signs over the shelves: words that glow, on a dark panel.
function signsInside(kits, faces) {
  for (const s of signs(faces)) {
    const px = s.big ? 0.1 : 0.055;
    const w = layout(s.text).width * px;
    const h = 7 * px;
    kits.inside.panel(s.x - s.nx * 0.01, s.y, s.z - s.nz * 0.01, s.nx, s.nz, w + px * 5, h + px * 4, PAL.signPanel);
    kits.inside.panel(s.x, s.y + h / 2 + px * 2.3, s.z, s.nx, s.nz, w + px * 5, px * 0.6, PAL.cap);
    kits.glow.words(s.text, s.x + s.nx * 0.005, s.y, s.z + s.nz * 0.005, s.nx, s.nz, px, PAL.neon);
  }
}

// The counter: its body and top, the till, the tapes on the wall behind,
// a television high up, the sign about rewinding.
function counter(kits) {
  const m = kits.inside;
  const C = COUNTER;
  m.box(C.x0 + 0.05, 0, C.z0, C.x1, C.top - 0.05, C.z1, PAL.counter);
  m.box(C.x0 - 0.08, C.top - 0.05, C.z0 - 0.05, C.x1 + 0.1, C.top, C.z1 + 0.05, PAL.counterTop);
  m.box(C.x0, 0.5, C.z0, C.x0 + 0.06, 0.62, C.z1, PAL.yellow);
  // the till and its screen, the scanner
  m.box(C.x0 + 0.25, C.top, CLERK.z - 0.25, C.x1 - 0.05, C.top + 0.22, CLERK.z + 0.25, PAL.black);
  m.box(C.x0 + 0.3, C.top + 0.22, CLERK.z - 0.2, C.x0 + 0.34, C.top + 0.42, CLERK.z + 0.2, PAL.black);
  kits.glow.box(C.x0 + 0.29, C.top + 0.25, CLERK.z - 0.17, C.x0 + 0.3, C.top + 0.39, CLERK.z + 0.17, col(0x40e080), 'x+');
  m.box(C.x0 + 0.2, C.top, CLERK.z + 0.6, C.x0 + 0.45, C.top + 0.12, CLERK.z + 0.9, PAL.metal);
  kits.glow.box(C.x0 + 0.21, C.top + 0.12, CLERK.z + 0.7, C.x0 + 0.44, C.top + 0.121, CLERK.z + 0.8, PAL.red, 'y-');
  // the return slot in the counter's front end
  const R = RETURN_SLOT;
  m.box(R.x - 0.25, 0.7, C.z1, R.x + 0.25, 0.78, C.z1 + 0.01, PAL.black);
  kits.glow.words('RETURNS', R.x, 0.9, C.z1 + 0.012, 0, 1, 0.022, PAL.neon, { small: true });
  // the wall behind: the tapes themselves, row on row in their black cases
  const wx = HALF_W - 0.5;
  m.box(wx, 0, C.z0 - 0.4, HALF_W, 2.2, FRONT - 0.3, PAL.rackDark, 'x+');
  for (let row = 0; row < 6; row++) {
    const y = 0.2 + row * 0.33;
    m.box(wx - 0.02, y - 0.03, C.z0 - 0.4, HALF_W, y, FRONT - 0.3, PAL.shelf);
    for (let z = C.z0 - 0.35; z < FRONT - 0.35; z += 0.045) {
      const c = PAL.tape.clone().multiplyScalar(0.8 + ((z * 97 + row * 13) % 1) * 0.5);
      m.panel(wx - 0.01, y + 0.1, z + 0.02, -1, 0, 0.035, 0.2, c);
      m.panel(wx - 0.012, y + 0.14, z + 0.02, -1, 0, 0.03, 0.05, PAL.label);
    }
  }
  // the low wall closing off the back of the clerk's corner
  m.box(C.x1, 0, C.z0 - 0.8, HALF_W - 0.5, 1.1, C.z0 - 0.4, PAL.counter);
  m.box(C.x1, 1.1, C.z0 - 0.85, HALF_W - 0.5, 1.15, C.z0 - 0.35, PAL.counterTop);
  // the television, up over the clerk, and the sign
  const ty = 2.85;
  m.box(HALF_W - 0.65, ty - 0.33, CLERK.z - 0.45, HALF_W - 0.1, ty + 0.33, CLERK.z + 0.45, PAL.black);
  m.box(HALF_W - 0.3, ty - 0.05, CLERK.z - 0.05, HALF_W, ty + 0.05, CLERK.z + 0.05, PAL.metal);
  kits.screen.panel(HALF_W - 0.66, ty, CLERK.z, -1, 0, 0.72, 0.52, PAL.white);
  kits.inside.panel(HALF_W - 0.02, 3.55, 6.2, -1, 0, 3.4, 0.46, PAL.signPanel);
  kits.glow.words('BE KIND, PLEASE REWIND', HALF_W - 0.025, 3.55, 6.2, -1, 0, 0.032, PAL.neon);
  kits.inside.panel(HALF_W - 0.02, 3.55, 0.9, -1, 0, 2.6, 0.46, PAL.signPanel);
  kits.glow.words('NO LATE FEES*', HALF_W - 0.025, 3.6, 0.9, -1, 0, 0.032, PAL.white);
  kits.glow.words('*SOME LATE FEES', HALF_W - 0.025, 3.4, 0.9, -1, 0, 0.012, PAL.white, { small: true });
}

// The sweets in front of the counter, the kids' corner, the stand-ups by
// the door, the security gate, posters on the walls.
function corners(kits, catalog, atlas) {
  const m = kits.inside;
  const K = CANDY;
  m.box(K.x0, 0, K.z0, K.x1, K.top, K.z1, PAL.metal);
  for (let row = 0; row < 3; row++) {
    const y = 0.35 + row * 0.3;
    for (let z = K.z0 + 0.08; z < K.z1 - 0.08; z += 0.13) {
      const c = PAL.candy[Math.floor(((z * 31 + row * 7) % 1) * PAL.candy.length + 7) % PAL.candy.length];
      m.box(K.x0 - 0.05, y, z - 0.05, K.x0, y + 0.18, z + 0.05, c, 'x+');
      m.box(K.x1, y, z - 0.05, K.x1 + 0.05, y + 0.18, z + 0.05, PAL.candy[(Math.floor(z * 10) + row) % PAL.candy.length], 'x-');
    }
  }
  // popcorn on top, in red and white bags
  for (let z = K.z0 + 0.2; z < K.z1 - 0.1; z += 0.3) {
    m.box(K.x0 + 0.12, K.top, z - 0.1, K.x1 - 0.12, K.top + 0.28, z + 0.1, PAL.red);
    m.box(K.x0 + 0.11, K.top + 0.1, z - 0.11, K.x1 - 0.11, K.top + 0.16, z + 0.11, PAL.white);
  }
  // the kids' corner: a television on their shelves, and bean bags
  const tv = KIDS.tv;
  const y0 = RACKS.low.height;
  m.box(tv.x - 0.4, y0, tv.z - 0.2, tv.x + 0.4, y0 + 0.55, tv.z + 0.2, PAL.black);
  kits.screen.panel(tv.x, y0 + 0.29, tv.z - 0.205, 0, -1, 0.62, 0.42, PAL.white);
  KIDS.bags.forEach((b, i) => {
    const c = PAL.bean[i % 2];
    m.box(b.x - 0.42, 0, b.z - 0.42, b.x + 0.42, 0.3, b.z + 0.42, c);
    m.box(b.x - 0.32, 0.3, b.z - 0.32, b.x + 0.32, 0.45, b.z + 0.32, c.clone().multiplyScalar(0.9));
  });
  // the stand-ups: a new release on a board, and a foot to stand it on
  const news = catalog.section('new');
  STANDEES.forEach((s, i) => {
    const f = news[(i * 37 + 3) % news.length];
    if (!f) return;
    const r = atlas.rect(f.id, _r);
    const nx = Math.sin(s.yaw);
    const nz = Math.cos(s.yaw);
    // (only boards facing straight along an axis are boxes; these are turned)
    kits.posters.panel(s.x + nx * 0.02, 1.0, s.z + nz * 0.02, nx, nz, 1.0, 1.6, PAL.white, [r.u0, r.v0, r.u1, r.v1]);
    m.panel(s.x - nx * 0.01, 1.0, s.z - nz * 0.01, -nx, -nz, 1.0, 1.6, PAL.cardboard);
    m.box(s.x - 0.25, 0, s.z - 0.15, s.x + 0.25, 0.2, s.z + 0.15, PAL.cardboard);
  });
  // the security gate inside the doors
  for (const side of [-1, 1]) {
    const x = side * GATE.half;
    m.box(x - 0.07, 0, GATE.z - 0.15, x + 0.07, 1.5, GATE.z + 0.15, PAL.shelf);
    kits.glow.box(x - 0.071, 1.38, GATE.z - 0.1, x + 0.071, 1.44, GATE.z + 0.1, col(0x40e080));
  }
  // posters over the wall shelving
  const posterAt = [
    [-HALF_W + 0.01, 3.4, -6.5, 1, 0],
    [-HALF_W + 0.01, 3.4, 1.2, 1, 0],
    [HALF_W - 0.01, 3.4, -6.8, -1, 0],
    [HALF_W - 0.01, 3.4, -2.2, -1, 0],
  ];
  const picks = catalog.section('picks');
  posterAt.forEach(([x, y, z, nx, nz], i) => {
    const f = picks[(i * 23 + 5) % picks.length];
    if (!f) return;
    const r = atlas.rect(f.id, _r);
    kits.posters.panel(x, y, z, nx, nz, 0.8, 1.2, PAL.white, [r.u0, r.v0, r.u1, r.v1]);
  });
}

// ── The boxes ───────────────────────────────────────────────────────────────
// One box per filled slot, front on, leaning back a little, its front the
// film's cover and its sides the cover's edge. A slot whose film has every
// copy out today shows a card instead.

const LEAN = 0.03; // m the top of a box leans back from its foot
const PER_BOX = 4 * 6; // vertices: front, top, two sides

function shelfBoxes(catalog, atlas, hidden, out, materials) {
  const list = []; // [{ key, film, face, col, row }]
  for (const f of catalog.faces) {
    for (let c = 0; c < f.cols; c++) {
      for (let r = 0; r < f.rows; r++) {
        const film = catalog.at(f.id, c, r);
        if (film && !out.has(film.id)) list.push({ key: `${f.id}:${c}:${r}`, film, face: f, col: c, row: r });
      }
    }
  }
  const n = list.length;
  const pos = new Float32Array(n * PER_BOX * 3);
  const nor = new Float32Array(n * PER_BOX * 3);
  const uv = new Float32Array(n * PER_BOX * 2);
  let k = 0;
  const put = (p, nn, u, v) => {
    pos.set(p, k * 3);
    nor.set(nn, k * 3);
    uv[k * 2] = u;
    uv[k * 2 + 1] = v;
    k++;
  };
  const quad = (a, b, c, d, nn, r) => {
    // r: [u0, v0, u1, v1] with v0 at the top; a b c d from the bottom left round
    put(a, nn, r[0], r[3]);
    put(b, nn, r[2], r[3]);
    put(c, nn, r[2], r[1]);
    put(a, nn, r[0], r[3]);
    put(c, nn, r[2], r[1]);
    put(d, nn, r[0], r[1]);
  };
  const index = new Map();
  const s = {};
  list.forEach((b, i) => {
    index.set(b.key, i);
    const f = b.face;
    slotAt(f, b.col, b.row, s);
    const r = atlas.rect(b.film.id, _r);
    const ux = f.ux;
    const uz = f.uz;
    const hw = BOX.w / 2;
    const y0 = s.y - BOX.h / 2;
    const y1 = s.y + BOX.h / 2;
    const bx = s.x - f.nx * LEAN;
    const bz = s.z - f.nz * LEAN;
    const d = BOX.d;
    const fl = [s.x - ux * hw, y0, s.z - uz * hw];
    const fr = [s.x + ux * hw, y0, s.z + uz * hw];
    const tr = [bx + ux * hw, y1, bz + uz * hw];
    const tl = [bx - ux * hw, y1, bz - uz * hw];
    const back = (p) => [p[0] - f.nx * d, p[1], p[2] - f.nz * d];
    const n = [f.nx, 0.12, f.nz];
    quad(fl, fr, tr, tl, n, [r.u0, r.v0, r.u1, r.v1]);
    // the edge of the cover wraps round its spine, top and sides
    const edge = [r.u0, r.v0, r.u0 + (r.u1 - r.u0) / 24, r.v1];
    quad(tl, tr, back(tr), back(tl), [0, 1, 0], [r.u0, r.v0, r.u1, r.v0 + (r.v1 - r.v0) / 36]);
    quad(back(fl), fl, tl, back(tl), [-ux, 0, -uz], edge);
    quad(fr, back(fr), back(tr), tr, [ux, 0, uz], edge);
    if (hidden.has(b.key)) collapse(pos, i);
  });
  const geo = new THREE.BufferGeometry();
  const P = new THREE.BufferAttribute(pos, 3);
  P.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', P);
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, materials.covers);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const kept = new Float32Array(pos); // where each box's corners were, to put one back
  // where every copy is out: a card in each of its slots
  let tags = null;
  if (out.size) {
    const kit = new Kit();
    for (const id of out) {
      for (const { face, col: c, row } of catalog.slotsOf(id)) {
        const f = FACE_BY_ID.get(face);
        slotAt(f, c, row, s);
        kit.panel(s.x, s.y - 0.02, s.z, f.nx, f.nz, BOX.w * 0.95, BOX.h * 0.6, PAL.card);
        kit.panel(s.x + f.nx * 0.002, s.y + 0.02, s.z + f.nz * 0.002, f.nx, f.nz, BOX.w * 0.8, 0.04, PAL.red);
      }
    }
    tags = new THREE.Mesh(kit.build(), materials.inside);
  }
  return {
    mesh,
    tags,
    has: (key) => index.has(key),
    show(key, on) {
      const i = index.get(key);
      if (i === undefined) return;
      if (on) pos.set(kept.subarray(i * PER_BOX * 3, (i + 1) * PER_BOX * 3), i * PER_BOX * 3);
      else collapse(pos, i);
      P.needsUpdate = true;
    },
  };
}

// A box drawn as nothing: all its corners in one place.
function collapse(pos, i) {
  const o = i * PER_BOX * 3;
  for (let j = 3; j < PER_BOX * 3; j++) pos[o + j] = pos[o + (j % 3)];
}

// The sliding doors: a pane of glass in a frame each, meeting in the middle.
function slidingDoors(materials) {
  const out = [];
  const w = (DOOR.x1 - DOOR.x0) / 2;
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const frame = new Kit();
    frame.box(-w / 2, 0, -0.04, w / 2, 0.12, 0.04, PAL.frame);
    frame.box(-w / 2, GLASS_TOP - 0.18, -0.04, w / 2, GLASS_TOP - 0.1, 0.04, PAL.frame);
    frame.box(-w / 2, 0, -0.04, -w / 2 + 0.06, GLASS_TOP - 0.1, 0.04, PAL.frame);
    frame.box(w / 2 - 0.06, 0, -0.04, w / 2, GLASS_TOP - 0.1, 0.04, PAL.frame);
    frame.box(-w / 2 + 0.06, 1.0, -0.045, w / 2 - 0.06, 1.06, 0.045, PAL.metal);
    const fm = new THREE.Mesh(frame.build(), materials.outside);
    fm.castShadow = true;
    g.add(fm);
    const pane = new Kit();
    pane.quad([-w / 2, 0.12, 0], [w / 2, 0.12, 0], [w / 2, GLASS_TOP - 0.18, 0], [-w / 2, GLASS_TOP - 0.18, 0], [0, 0, 1], PAL.white);
    const pm = new THREE.Mesh(pane.build(), materials.glass);
    pm.renderOrder = 2;
    g.add(pm);
    const x = side * (w / 2);
    g.position.set(x, 0, FRONT);
    g.userData.shut = x;
    g.userData.side = side;
    out.push(g);
  }
  return out;
}

// ── A box in the hand ───────────────────────────────────────────────────────
// Held up to read, as things raised to the face are (Character.addRaised):
// gripped at its origin, its top along -y, its cover towards the hiker.
export function makeHeldBox(material) {
  const geo = new THREE.BoxGeometry(BOX.w, BOX.h, BOX.d);
  const uv = geo.attributes.uv;
  const base = Float32Array.from(uv.array); // BoxGeometry's own: 0..1 on each face, v up
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = -BOX.h * 0.42;
  mesh.rotation.z = Math.PI; // top along -y
  mesh.castShadow = true;
  const object = new THREE.Group();
  object.add(mesh);
  return {
    object,
    mesh,
    show(film, atlas) {
      const r = atlas.rect(film.id, _r);
      // the front (+z) and back (-z) faces are the whole cover; the other
      // four its edge. BoxGeometry's faces go +x -x +y -y +z -z, four corners each.
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        const full = face === 4 || face === 5;
        const u = base[i * 2];
        const v = base[i * 2 + 1];
        const u1 = full ? r.u1 : r.u0 + (r.u1 - r.u0) / 24;
        uv.setXY(i, r.u0 + (u1 - r.u0) * u, r.v1 + (r.v0 - r.v1) * v);
      }
      uv.needsUpdate = true;
    },
  };
}
