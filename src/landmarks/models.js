// What each kind of site looks like, made in code like everything else:
// vertex-coloured primitives merged into one mesh per site (and one more for
// a boat, so it can ride the water). The cabins use the same logs, piers and
// shake roofs as the ones you build (build/geometry.js), and are then
// weathered: greyed by the sun, and mossy where the rain sits. Each piece
// says what it is made of (build/surfaces.js): mostly by its colour, since
// the palette's planks are wood, its iron is iron and its canvas cloth
// (MADE_OF), and otherwise as it's added.
//
// Nothing is levelled for them (see sites.js), so each stands on the ground
// as it is: a cabin on piers that are taller on the downhill side, a tent
// tipped to the slope, a dock's posts down to the bed of the lake.
//
//   buildSite(site, ground, material) -> {
//     object    a THREE.Group, placed and turned where the site is
//     solids    capsules for the world's Solids (walls, floors, a deck, steps)
//     blockers  boxes the camera can't see through: { inv, half }
//     bobbing   boats on the water: { object, y, phase }
//   }
//   ground(x, z) -> height of the ground in the world

import * as THREE from 'three';
import { Mesher, WOOD, alongMatrix, addRoundLog, addRoof } from '../build/geometry.js';
import { SURF } from '../build/surfaces.js';
import { mulberry32, phash } from '../noise.js';
import { toWorld } from './sites.js';

const lin = (hex) => new THREE.Color(hex);
export const PAL = {
  canvas: [lin(0xa89a6c), lin(0xb07a4e), lin(0x6f7348), lin(0x617487)],
  paint: [lin(0xcfc8b4), lin(0x5e7a5a), lin(0x93493a), lin(0x3f5f78)],
  trim: lin(0x2a2622),
  plank: lin(0x8a6f50),
  plankGrey: lin(0x7d776c),
  rope: lin(0xb59a6a),
  iron: lin(0x3a3532),
  rust: lin(0x7a4628),
  tin: lin(0x8d8a82),
  bone: lin(0xe2d8c0),
  ash: lin(0x58544e),
  char: lin(0x1c1814),
  dark: lin(0x0b0a09),
  blanket: lin(0x6b4a3c),
  moss: lin(0x4d5a26),
};

// What the palette's colours are made of (build/surfaces.js). A piece given
// one of them is that; given another, it's whatever its mesher says (m.surf).
// The towns add their own palette's (towns/buildings.js).
export const MADE_OF = new Map([
  [PAL.plank, SURF.wood],
  [PAL.plankGrey, SURF.wood],
  [PAL.trim, SURF.paint],
  [PAL.rope, SURF.cloth],
  [PAL.iron, SURF.iron],
  [PAL.rust, SURF.iron],
  [PAL.tin, SURF.tin],
  [PAL.blanket, SURF.cloth],
  [PAL.char, SURF.bark],
  [WOOD.bark, SURF.bark],
  [WOOD.barkDark, SURF.bark],
  [WOOD.stone, SURF.stone],
  [WOOD.stoneDark, SURF.stone],
  [WOOD.board, SURF.wood],
  [WOOD.hewn, SURF.wood],
  ...PAL.canvas.map((c) => [c, SURF.cloth]),
  ...PAL.paint.map((c) => [c, SURF.paint]),
]);
// What a piece coloured `color` (a colour, or a function from tone()) is made
// of, on mesher m.
export const madeOf = (color, m) => MADE_OF.get(color && color.base ? color.base : color) ?? m.surf;
const OLD = 0.6; // how worn the old places are (build/surfaces.js)

const C = 0.32; // a course of round logs, as built by hand (build/constants.js)
const R = 0.17; // a log's radius
const OH = 0.3; // how far log ends run past a corner
const PITCH = (34 * Math.PI) / 180;
const STEP_RISE = 0.3; // the most one step up to a door rises (m)
const STEP_RUN = 0.32; // ...and how deep each step is

const _v = new THREE.Vector3();
const _w = { x: 0, z: 0 };

export function buildSite(site, ground, material) {
  const y0 = ground(site.x, site.z);
  // the ground under a point of the site's own frame, relative to its origin
  const g = (lx, lz) => {
    toWorld(site, lx, lz, _w);
    return ground(_w.x, _w.z) - y0;
  };
  const b = new Builder(site, g, mulberry32(site.seed), y0);
  b.m.wear = OLD;
  BUILD[site.kind](b, site);

  const object = new THREE.Group();
  object.position.set(site.x, y0, site.z);
  object.rotation.y = site.yaw;
  const meshes = [];
  for (const part of b.parts) {
    if (part.m.empty) continue;
    const mesh = new THREE.Mesh(part.m.build(), material);
    mesh.position.copy(part.at);
    mesh.rotation.y = part.yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    object.add(mesh);
    meshes.push({ mesh, part });
  }
  object.updateMatrixWorld(true);

  const solids = b.solids.map((s) => {
    const a = toWorld(site, s.ax, s.az);
    const e = toWorld(site, s.bx, s.bz);
    return { ax: a.x, az: a.z, bx: e.x, bz: e.z, r: s.r, bottom: s.bottom + y0, topA: s.topA + y0, topB: s.topB + y0, step: s.step, surface: s.surface };
  });
  const blockers = b.blockers.map(({ c, h, rx }) => {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx), new THREE.Vector3(1, 1, 1));
    const world = object.matrixWorld.clone().multiply(local);
    return { inv: world.invert(), half: h };
  });
  const bobbing = meshes.filter(({ part }) => part.bob).map(({ mesh }, i) => ({ object: mesh, y: mesh.position.y, phase: phash(site.seed, i, 3) * 6.28 }));
  return { object, solids, blockers, bobbing, y0 };
}

// ── The kit ──────────────────────────────────────────────────────────────────
// Everything below works in the site's own frame, with y measured from the
// ground at its origin. The towns (towns/buildings.js) build with it too.
export class Builder {
  constructor(site, g, rnd, y0) {
    this.site = site;
    this.g = g;
    this.y0 = y0; // the height of the frame's origin in the world
    this.rnd = rnd;
    this.seed = site.seed % 100000;
    this.m = new Mesher();
    this.parts = [{ m: this.m, at: new THREE.Vector3(), yaw: 0 }];
    this.solids = [];
    this.blockers = [];
  }

  // A separate mesh (a boat), at a point of the frame.
  part(at, yaw = 0, bob = false) {
    const m = new Mesher();
    m.surf = this.m.surf;
    m.wear = this.m.wear;
    this.parts.push({ m, at, yaw, bob });
    return m;
  }

  // Highest and lowest ground among points [[x, z], ...].
  span(points) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, z] of points) {
      const h = this.g(x, z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return { lo, hi };
  }

  solid(ax, az, bx, bz, r, bottom, top, extra = {}) {
    this.solids.push({ ax, az, bx, bz, r, bottom, topA: top, topB: top, ...extra });
  }

  blocker(cx, cy, cz, hx, hy, hz, rx = 0) {
    this.blockers.push({ c: [cx, cy, cz], h: [hx, hy, hz], rx });
  }
}

// One colour for a whole piece, a little different from the next. (It
// remembers which, for what it's made of: madeOf.)
export const tone = (color, rnd, spread = 0.2) => {
  const k = 1 - spread / 2 + rnd() * spread;
  const fn = (p, n, out) => out.copy(color).multiplyScalar(k);
  fn.base = color;
  return fn;
};

// A box. What it's made of goes by its colour (madeOf), unless said (surf).
export function box(m, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0, surf = madeOf(color, m)) {
  const mat = new THREE.Matrix4().compose(_v.set(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  m.add(new THREE.BoxGeometry(sx, sy, sz), mat, typeof color === 'function' ? color : (p, n, out) => out.copy(color), null, surf);
}

// A round rod from a to b (arrays [x, y, z]).
export function rod(m, a, b, r, color, sides = 5, surf = madeOf(color, m)) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  if (len < 1e-4) return;
  const mat = alongMatrix(d.normalize(), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.add(new THREE.CylinderGeometry(r, r, len, sides, 1), mat, typeof color === 'function' ? color : (p, n, out) => out.copy(color), null, surf);
}

// A rough stone, about `s` across, its middle at (x, y, z).
export function stone(m, x, y, z, s, seed, flat = 0.6) {
  const mat = new THREE.Matrix4().compose(
    _v.set(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(phash(seed, 1, 2) * 0.4, phash(seed, 2, 3) * 6.28, phash(seed, 3, 4) * 0.4)),
    new THREE.Vector3(s * (0.9 + phash(seed, 4, 5) * 0.3), s * flat, s * (0.8 + phash(seed, 5, 6) * 0.3)),
  );
  m.add(
    new THREE.IcosahedronGeometry(0.5, 0),
    mat,
    (p, n, out) => out.copy(WOOD.stoneDark).lerp(WOOD.stone, 0.35 + Math.max(0, n.y) * 0.35 + phash(p.x * 13 + seed, p.y * 13, p.z * 13) * 0.3),
    null,
    SURF.stone,
  );
}

// Dry-stacked stones from the ground (g) up to `top`, with a flat one on top.
export function pier(m, x, z, g, top, seed, w = 0.42) {
  let y = g - 0.12;
  let i = 0;
  while (top - y > 0.2) {
    const sh = Math.min(0.24, top - y - 0.08);
    stone(m, x + (phash(seed, i, 7) - 0.5) * 0.05, y + sh / 2, z + (phash(seed, i, 8) - 0.5) * 0.05, w + 0.08, seed + i * 13, sh / (w + 0.08));
    y += sh;
    i++;
  }
  box(m, x, (y + top) / 2, z, w, Math.max(0.04, top - y), w, (p, n, out) => out.copy(WOOD.stone).multiplyScalar(0.8 + phash(seed, x, z) * 0.25), 0, 0, 0, SURF.stone);
}

// Greys whatever was added to m since `from`, as wood goes in the weather,
// with moss on what faces the sky.
export function weather(m, from, grey, moss = 0) {
  const c = m.col;
  const n = m.nor;
  const p = m.pos;
  for (let i = from; i < m.n; i++) {
    const o = i * 3;
    const l = c[o] * 0.3 + c[o + 1] * 0.55 + c[o + 2] * 0.15;
    let r = c[o] + (l * 1.05 - c[o]) * grey;
    let gg = c[o + 1] + (l * 1.05 - c[o + 1]) * grey;
    let b = c[o + 2] + (l * 1.08 - c[o + 2]) * grey;
    if (moss && n[o + 1] > 0.45) {
      const k = moss * phash(Math.round(p[o] * 3), Math.round(p[o + 1] * 3), Math.round(p[o + 2] * 3)) * (n[o + 1] - 0.45) * 1.8;
      r += (PAL.moss.r - r) * k;
      gg += (PAL.moss.g - gg) * k;
      b += (PAL.moss.b - b) * k;
    }
    c[o] = r;
    c[o + 1] = gg;
    c[o + 2] = b;
  }
}

// A wall of round logs along `axis` at `at` across it, from -half to +half
// between corners (the ends run on past them), one log per course from
// courses[0] to courses[1] - 1, a course lower than the next by C. `lift` is
// in courses (walls across the sills sit half a course up). Gaps are
// openings: { from, to, k0, k1 } leaves out courses k0..k1-1 between from
// and to.
function logWall(b, { axis, at, half, base, lift = 0, courses, gaps = [], seed, top = null }) {
  for (let k = courses[0]; k < courses[1]; k++) {
    let segs = [[-half - OH, half + OH]];
    if (top && k === courses[1] - 1) segs = [top]; // a ragged last course: what's left of it
    for (const gap of gaps) {
      if (k < gap.k0 || k >= gap.k1) continue;
      segs = segs.flatMap(([a, c]) => (gap.to <= a || gap.from >= c ? [[a, c]] : [[a, gap.from], [gap.to, c]].filter(([u, w]) => w - u > 0.2)));
    }
    for (const [a, c] of segs) {
      const mid = (a + c) / 2;
      const y = base + (k + lift) * C + R;
      const mat = alongMatrix(axis, axis === 'x' ? mid : at, y, axis === 'x' ? at : mid);
      addRoundLog(b.m, mat, c - a, seed + k * 31 + Math.round(at * 10), R, 0.04);
    }
  }
}

// Steps from the ground in front of a door (at z, across x0..x1) up to a
// floor at `floor`: as many as it takes to keep each rise easy. Also the
// threshold you cross, so your feet find something in the doorway.
export function stepsUp(b, z, x0, x1, floor, color) {
  const xm = (x0 + x1) / 2;
  const w = x1 - x0;
  b.solid(x0 + 0.15, z, x1 - 0.15, z, 0.22, floor - 2, floor, { step: 0.34, surface: 'boards' });
  let n = 1;
  let rise = 0;
  for (let pass = 0; pass < 2; pass++) {
    rise = floor - b.g(xm, z + 0.17 + Math.max(0.5, (n - 0.5) * STEP_RUN));
    n = Math.max(1, Math.ceil(rise / STEP_RISE));
  }
  for (let i = 1; i < n; i++) {
    const top = floor - (rise * i) / n;
    const sz = z + 0.17 + (i - 0.5) * STEP_RUN;
    const g = Math.min(b.g(x0, sz), b.g(x1, sz)) - 0.1;
    box(b.m, xm, (top + g) / 2, sz, w, top - g, STEP_RUN, tone(color, b.rnd, 0.25));
    b.solid(x0 + 0.18, sz, x1 - 0.18, sz, 0.18, g, top, { step: 0.34 });
  }
}

// The floor of a raised room, as capsules you stand on, and its planks.
export function floor(b, x0, z0, x1, z1, top, bottom, color) {
  const inset = 0.04;
  const along = x1 - x0 >= z1 - z0;
  const cross = along ? [z0, z1] : [x0, x1];
  const n = Math.ceil((cross[1] - cross[0]) / 0.22);
  const pw = (cross[1] - cross[0]) / n;
  for (let i = 0; i < n; i++) {
    const c = cross[0] + (i + 0.5) * pw;
    const len = (along ? x1 - x0 : z1 - z0) - inset * 2;
    const k = 0.85 + b.rnd() * 0.25;
    const col = (p, nn, out) => out.copy(color).multiplyScalar(k);
    if (along) box(b.m, (x0 + x1) / 2, top - 0.03, c, len, 0.06, pw - 0.015, col, 0, 0, 0, SURF.wood);
    else box(b.m, c, top - 0.03, (z0 + z1) / 2, pw - 0.015, 0.06, len, col, 0, 0, 0, SURF.wood);
  }
  // capsules along the long side, overlapping so there's no gap to fall through
  const rows = Math.max(1, Math.round((cross[1] - cross[0]) / 0.9));
  const rr = (cross[1] - cross[0]) / rows / 2 + 0.06;
  for (let i = 0; i < rows; i++) {
    const c = cross[0] + (i + 0.5) * ((cross[1] - cross[0]) / rows);
    if (along) b.solid(x0 + rr, c, x1 - rr, c, rr, bottom, top, { step: 0.34, surface: 'boards' });
    else b.solid(c, z0 + rr, c, z1 - rr, rr, bottom, top, { step: 0.34, surface: 'boards' });
  }
}

// A plank door, hung at hinge (x, z) and swung `swing` radians.
function door(m, x, z, y, w, h, swing, color, rnd) {
  const boards = 4;
  for (let i = 0; i < boards; i++) {
    const u = (i + 0.5) * (w / boards) * -Math.sign(x || 1);
    const k = 0.85 + rnd() * 0.25;
    const cx = x + Math.cos(swing) * u;
    const cz = z + Math.sin(swing) * u * -1;
    box(m, cx, y + h / 2, cz, w / boards - 0.01, h, 0.05, (p, n, out) => out.copy(color).multiplyScalar(k), 0, swing, 0, madeOf(color, m));
  }
}

// A stack of split firewood against a wall, along z at x.
function woodpile(b, x, z0, z1, y0) {
  const n = Math.round((z1 - z0) / 0.24);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < n - row; i++) {
      const z = z0 + (i + 0.5 + row * 0.5) * ((z1 - z0) / n);
      const y = y0 + b.g(x, z) + 0.12 + row * 0.2;
      addRoundLog(b.m, alongMatrix('x', x, y, z), 0.6, b.seed + row * 17 + i, 0.1 + b.rnd() * 0.03, 0.02);
    }
  }
  b.solid(x, z0 + 0.2, x, z1 - 0.2, 0.36, b.g(x, (z0 + z1) / 2) - 0.2, b.g(x, (z0 + z1) / 2) + 0.7);
}

// A gable roof's two slopes and its walls, as boxes the camera stops at.
function roomBlockers(b, w, d, base, eave, roof = true) {
  const h = (eave - base) / 2;
  b.blocker(0, base + h, d / 2, w / 2 + R, h, R);
  b.blocker(0, base + h, -d / 2, w / 2 + R, h, R);
  b.blocker(w / 2, base + h, 0, R, h, d / 2 + R);
  b.blocker(-w / 2, base + h, 0, R, h, d / 2 + R);
  if (!roof) return;
  // each slope runs from its eave edge, an overhang out, up to the ridge
  const half = d / 2 + 0.45;
  const slope = half / Math.cos(PITCH) / 2;
  const y = eave + ((d / 2 - 0.45) / 2) * Math.tan(PITCH);
  b.blocker(0, y, half / 2, w / 2 + 0.45, 0.08, slope, PITCH);
  b.blocker(0, y, -half / 2, w / 2 + 0.45, 0.08, slope, -PITCH);
}

// A stone chimney outside the wall at x = at (pointing +x), from the ground
// up to `top`, with a firebox inside the wall.
function chimney(b, at, base, top, seed) {
  const m = b.m;
  const x0 = at + 0.12;
  const g = Math.min(b.g(x0 + 0.4, -0.5), b.g(x0 + 0.4, 0.5));
  let y = g - 0.15;
  let row = 0;
  while (y < top) {
    const fire = y < base + 1.5;
    const wd = fire ? 1.15 : 0.75;
    const dp = fire ? 0.85 : 0.6;
    const sh = 0.22;
    const per = Math.max(2, Math.round(wd / 0.36));
    for (let i = 0; i < per; i++) {
      const z = -wd / 2 + (i + 0.5) * (wd / per) + (row % 2 ? 0.08 : -0.08);
      if (Math.abs(z) > wd / 2) continue;
      stone(m, x0 + dp / 2, y + sh / 2, z, Math.min(0.42, wd / per + 0.1), seed + row * 23 + i, sh / 0.42);
    }
    box(m, x0 + dp / 2, y + sh / 2, 0, dp - 0.08, sh, wd - 0.12, (p, n, out) => out.copy(WOOD.stoneDark).multiplyScalar(0.9 + phash(seed, row, 2) * 0.2), 0, 0, 0, SURF.stone);
    y += sh;
    row++;
  }
  // the firebox, dark, seen through the opening in the wall
  box(m, at - 0.02, base + 0.75, 0, 0.3, 0.9, 0.8, PAL.dark);
  box(m, at - 0.1, base + 0.36, 0, 0.36, 0.06, 0.9, PAL.ash);
  b.solid(x0 + 0.42, -0.25, x0 + 0.42, 0.25, 0.55, g - 0.2, top);
}

// ── The kinds ────────────────────────────────────────────────────────────────
export const BUILD = {
  cabin(b) {
    const W = 5.0;
    const D = 4.2;
    const N = 7;
    const corners = [
      [-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2],
      [0, -D / 2], [0, D / 2], [-W / 2, 0], [W / 2, 0],
    ];
    const { lo, hi } = b.span(corners);
    const base = hi + 0.22;
    const top = base + C; // the floor, flush with the top of the front sill
    const eave = base + N * C + 0.05;
    const from = b.m.n;
    for (const [x, z] of corners) pier(b.m, x, z, b.g(x, z), z === 0 ? base + C / 2 : base, b.seed + Math.round(x * 7 + z * 13));
    const doorGap = { from: -0.5, to: 0.5, k0: 1, k1: 6 };
    logWall(b, { axis: 'x', at: D / 2, half: W / 2, base, courses: [0, N], gaps: [doorGap], seed: b.seed });
    logWall(b, { axis: 'x', at: -D / 2, half: W / 2, base, courses: [0, N], seed: b.seed + 1 });
    logWall(b, { axis: 'z', at: -W / 2, half: D / 2, base, lift: 0.5, courses: [0, N], gaps: [{ from: -0.5, to: 0.5, k0: 3, k1: 5 }], seed: b.seed + 2 });
    logWall(b, { axis: 'z', at: W / 2, half: D / 2, base, lift: 0.5, courses: [0, N], gaps: [{ from: -0.45, to: 0.45, k0: 0, k1: 3 }], seed: b.seed + 3 });
    floor(b, -W / 2 + R, -D / 2 + R, W / 2 - R, D / 2 - R, top, lo - 0.3, PAL.plank);
    weather(b.m, from, 0.45, 0.25);
    const roofFrom = b.m.n;
    addRoof(b.m, { x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2, eave, axis: 'x' }, PITCH, 0.45, b.seed);
    weather(b.m, roofFrom, 0.35, 0.9);
    const ridge = eave + (D / 2) * Math.tan(PITCH);
    chimney(b, W / 2 + R, base, ridge + 0.5, b.seed);

    // the door hangs open, and the shutters
    const wood = b.m.n;
    door(b.m, 0.5, D / 2 - 0.05, top, 0.95, 1.55, -1.25, PAL.plank, b.rnd);
    box(b.m, -W / 2 - 0.2, base + 4 * C + 0.15, 0.85, 0.04, 0.62, 0.48, PAL.plank, 0, 0.3);
    box(b.m, -W / 2 - 0.2, base + 4 * C + 0.15, -0.85, 0.04, 0.62, 0.48, PAL.plank, 0, -0.3);
    // inside: a table and a bench, a bunk with a blanket on it
    box(b.m, -1.3, top + 0.74, 0.7, 1.1, 0.06, 0.7, PAL.plank);
    for (const [x, z] of [[-1.78, 0.42], [-0.82, 0.42], [-1.78, 0.98], [-0.82, 0.98]]) box(b.m, x, top + 0.36, z, 0.07, 0.72, 0.07, PAL.plank);
    box(b.m, -1.3, top + 0.42, 1.35, 1.0, 0.05, 0.28, PAL.plank);
    box(b.m, 1.15, top + 0.25, -1.55, 1.9, 0.5, 0.75, PAL.plank);
    box(b.m, 1.15, top + 0.53, -1.55, 1.8, 0.08, 0.7, PAL.blanket);
    b.solid(-1.3, 0.55, -1.3, 0.85, 0.5, top, top + 0.78);
    b.solid(0.5, -1.55, 1.8, -1.55, 0.38, top, top + 0.55);
    // a woodpile on the west wall, a chopping block out front
    woodpile(b, -W / 2 - 0.5, -1.6, 0.6, 0);
    addRoundLog(b.m, new THREE.Matrix4().makeTranslation(-1.9, b.g(-1.9, 3.0) + 0.2, 3.0), 0.5, b.seed + 5, 0.24, 0.02);
    b.solid(-1.9, 3.0, -1.9, 3.0, 0.3, b.g(-1.9, 3.0) - 0.2, b.g(-1.9, 3.0) + 0.45);
    stepsUp(b, D / 2, -0.55, 0.55, top, WOOD.stone);
    weather(b.m, wood, 0.4, 0.15);

    // walls (split at the door), and the roof, for the camera
    const wallTop = base + N * C + 0.1;
    const lowest = lo - 0.4;
    b.solid(-W / 2, D / 2, -0.55, D / 2, 0.2, lowest, wallTop);
    b.solid(0.55, D / 2, W / 2, D / 2, 0.2, lowest, wallTop);
    b.solid(-W / 2, -D / 2, W / 2, -D / 2, 0.2, lowest, wallTop);
    b.solid(-W / 2, -D / 2, -W / 2, D / 2, 0.2, lowest, wallTop);
    b.solid(W / 2, -D / 2, W / 2, D / 2, 0.2, lowest, wallTop);
    roomBlockers(b, W, D, top, eave);
  },

  ruin(b) {
    const W = 5.0;
    const D = 4.2;
    const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]];
    const { lo, hi } = b.span(corners);
    const base = hi + 0.08;
    const from = b.m.n;
    for (const [x, z] of corners) pier(b.m, x, z, b.g(x, z), base, b.seed + Math.round(x * 7 + z * 13));
    // what's left of each wall: a few courses, the top one broken off
    const left = () => 1 + Math.floor(b.rnd() * 4);
    const ragged = (half) => {
      const keep = 0.35 + b.rnd() * 0.45;
      return b.rnd() < 0.5 ? [-half - OH, -half + (half * 2) * keep] : [half - (half * 2) * keep, half + OH];
    };
    const walls = [
      { axis: 'x', at: D / 2, half: W / 2, lift: 0, gaps: [{ from: -0.5, to: 0.5, k0: 1, k1: 9 }] },
      { axis: 'x', at: -D / 2, half: W / 2, lift: 0 },
      { axis: 'z', at: -W / 2, half: D / 2, lift: 0.5 },
      { axis: 'z', at: W / 2, half: D / 2, lift: 0.5, gaps: [{ from: -0.45, to: 0.45, k0: 0, k1: 3 }] },
    ];
    let highest = 0;
    walls.forEach((w, i) => {
      const n = left();
      highest = Math.max(highest, n);
      logWall(b, { ...w, base, courses: [0, n], seed: b.seed + i, top: n > 1 ? ragged(w.half) : null });
      const h = base + (n + w.lift) * C + 0.1;
      const [ax, az, bx, bz] = w.axis === 'x' ? [-w.half, w.at, w.half, w.at] : [w.at, -w.half, w.at, w.half];
      b.solid(ax, az, bx, bz, 0.2, lo - 0.3, h);
    });
    // a roof beam fallen in across the room, and a rusted stove
    const beamTop = base + Math.min(highest, 2) * C + 0.2;
    const a = [-W / 2 + 0.2, beamTop, -0.6];
    const e = [W / 2 - 1.3, b.g(W / 2 - 1.3, 1.1) + 0.12, 1.1];
    const dir = new THREE.Vector3(e[0] - a[0], e[1] - a[1], e[2] - a[2]);
    const len = dir.length();
    addRoundLog(b.m, alongMatrix(dir.normalize(), (a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2), len, b.seed + 9, 0.13, 0.03);
    weather(b.m, from, 0.6, 0.7);
    const iron = b.m.n;
    const sg = b.g(1.2, -1.3);
    box(b.m, 1.2, sg + 0.35, -1.3, 0.6, 0.62, 0.45, PAL.rust, 0.06, 0.4, 0.04);
    rod(b.m, [1.2, sg + 0.6, -1.3], [1.28, sg + 1.35, -1.32], 0.07, PAL.rust, 7);
    weather(b.m, iron, 0.2, 0.3);
    b.solid(1.2, -1.3, 1.2, -1.3, 0.4, sg - 0.2, sg + 0.66);
    // the chimney outlasts the rest
    chimney(b, W / 2 + R, base, base + 3.6 + b.rnd() * 0.8, b.seed);
    roomBlockers(b, W, D, base, base + highest * C + 0.2, false);
  },

  hunting(b) {
    const W = 3.2;
    const D = 3.8;
    const posts = [];
    for (const x of [-W / 2, 0, W / 2]) for (const z of [-D / 2, 0, D / 2]) if (x || z) posts.push([x, z]);
    const { lo, hi } = b.span(posts);
    const top = hi + 0.45;
    const front = top + 2.25;
    const back = top + 1.75;
    const roofY = (z) => back + ((z + D / 2) / D) * (front - back);
    const from = b.m.n;
    for (const [x, z] of posts) box(b.m, x, (b.g(x, z) - 0.2 + top) / 2, z, 0.16, top - b.g(x, z) + 0.2, 0.16, tone(PAL.plank, b.rnd));
    floor(b, -W / 2, -D / 2, W / 2, D / 2, top, lo - 0.3, PAL.plank);
    // board walls: vertical boards, the side walls following the roof down
    const boardW = 0.2;
    const wall = (x0, z0, x1, z1, gaps = []) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.round(len / boardW);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        const u = t * len - len / 2;
        const h = roofY(z) - top;
        let spans = [[0, h]];
        for (const gp of gaps) if (u > gp.from && u < gp.to) spans = spans.flatMap(([a, c]) => [[a, Math.min(c, gp.y0)], [Math.max(a, gp.y1), c]].filter(([p, q]) => q - p > 0.05));
        const k = 0.8 + b.rnd() * 0.3;
        const col = (p, nn, out) => out.copy(PAL.plank).multiplyScalar(k * (1 - Math.abs(p.x) * 1.5));
        for (const [a, c] of spans) {
          const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
          box(b.m, x, top + (a + c) / 2, z, along ? boardW - 0.01 : 0.04, c - a, along ? 0.04 : boardW - 0.01, col, 0, 0, 0, SURF.wood);
        }
      }
    };
    wall(-W / 2, D / 2, W / 2, D / 2, [{ from: -0.45, to: 0.45, y0: 0, y1: 1.85 }]);
    wall(-W / 2, -D / 2, W / 2, -D / 2);
    wall(-W / 2, -D / 2, -W / 2, D / 2);
    wall(W / 2, -D / 2, W / 2, D / 2, [{ from: -0.3, to: 0.3, y0: 1.05, y1: 1.55 }]);
    door(b.m, 0.45, D / 2 + 0.03, top, 0.9, 1.85, 1.15, PAL.plank, b.rnd);
    weather(b.m, from, 0.4, 0.1);
    // a tin roof, corrugated and rusting, sloping to the back
    const tin = b.m.n;
    const rx0 = -W / 2 - 0.35;
    const rx1 = W / 2 + 0.35;
    const rz0 = -D / 2 - 0.4;
    const rz1 = D / 2 + 0.4;
    const ry = (z) => roofY(z) + 0.06;
    const ribs = Math.round((rx1 - rx0) / 0.12);
    for (let i = 0; i < ribs; i++) {
      const xa = rx0 + ((rx1 - rx0) * i) / ribs;
      const xb = rx0 + ((rx1 - rx0) * (i + 1)) / ribs;
      const lift = i % 2 ? 0.02 : 0;
      const A = new THREE.Vector3(xa, ry(rz0) + lift, rz0);
      const B = new THREE.Vector3(xb, ry(rz0) + 0.02 - lift, rz0);
      const Cc = new THREE.Vector3(xb, ry(rz1) + 0.02 - lift, rz1);
      const Dd = new THREE.Vector3(xa, ry(rz1) + lift, rz1);
      const rust = (p, nn, out) => {
        const r = phash(Math.round(p.x * 4), Math.round(p.z * 3), b.seed);
        out.copy(PAL.tin).lerp(PAL.rust, r > 0.55 ? 0.4 + r * 0.6 : r * 0.3);
        return out.multiplyScalar(i % 2 ? 0.9 : 1.05);
      };
      b.m.tris([A, Cc, B, A, Dd, Cc], rust, SURF.tin);
    }
    weather(b.m, tin, 0.1, 0.25);
    // antlers over the door
    const bone = b.m.n;
    const ay = top + 2.0;
    const az = D / 2 + 0.06;
    box(b.m, 0, ay, az, 0.2, 0.14, 0.06, PAL.plank);
    box(b.m, 0, ay + 0.03, az + 0.05, 0.12, 0.1, 0.06, PAL.bone);
    for (const s of [-1, 1]) {
      const p0 = [s * 0.05, ay + 0.06, az + 0.06];
      const p1 = [s * 0.3, ay + 0.2, az + 0.14];
      const p2 = [s * 0.42, ay + 0.48, az + 0.12];
      const p3 = [s * 0.32, ay + 0.72, az + 0.06];
      rod(b.m, p0, p1, 0.025, PAL.bone);
      rod(b.m, p1, p2, 0.022, PAL.bone);
      rod(b.m, p2, p3, 0.018, PAL.bone);
      rod(b.m, p1, [s * 0.22, ay + 0.42, az + 0.22], 0.016, PAL.bone);
      rod(b.m, p2, [s * 0.5, ay + 0.66, az + 0.18], 0.015, PAL.bone);
    }
    // a game pole to hang the deer from, and firewood along the back
    const pole = b.m.n;
    for (const z of [-0.9, 0.9]) {
      const g = b.g(2.7, z);
      rod(b.m, [2.7, g - 0.2, z], [2.7, g + 2.3, z], 0.07, WOOD.bark, 6);
      b.solid(2.7, z, 2.7, z, 0.1, g - 0.2, g + 2.3);
    }
    const pt = Math.max(b.g(2.7, -0.9), b.g(2.7, 0.9)) + 2.15;
    rod(b.m, [2.7, pt, -1.15], [2.7, pt, 1.15], 0.06, WOOD.bark, 6);
    rod(b.m, [2.7, pt, 0.2], [2.7, pt - 0.7, 0.2], 0.012, PAL.rope, 4);
    for (let i = 0; i < 6; i++) {
      const x = -1.2 + i * 0.4;
      const g = b.g(x, -D / 2 - 0.45);
      addRoundLog(b.m, alongMatrix('z', x, g + 0.12, -D / 2 - 0.45), 0.55, b.seed + 40 + i, 0.11, 0.02);
      if (i < 5) addRoundLog(b.m, alongMatrix('z', x + 0.2, g + 0.32, -D / 2 - 0.45), 0.55, b.seed + 50 + i, 0.1, 0.02);
    }
    b.solid(-1.4, -D / 2 - 0.45, 1.0, -D / 2 - 0.45, 0.3, lo - 0.2, b.g(0, -D / 2 - 0.45) + 0.5);
    stepsUp(b, D / 2, -0.45, 0.45, top, PAL.plank);
    weather(b.m, pole, 0.35, 0.1);
    weather(b.m, bone, 0.05, 0);

    const wallTop = front + 0.05;
    b.solid(-W / 2, D / 2, -0.47, D / 2, 0.12, lo - 0.4, wallTop);
    b.solid(0.47, D / 2, W / 2, D / 2, 0.12, lo - 0.4, wallTop);
    b.solid(-W / 2, -D / 2, W / 2, -D / 2, 0.12, lo - 0.4, back);
    b.solid(-W / 2, -D / 2, -W / 2, D / 2, 0.12, lo - 0.4, back);
    b.solid(W / 2, -D / 2, W / 2, D / 2, 0.12, lo - 0.4, back);
    const hh = (front - top) / 2;
    b.blocker(0, top + hh, D / 2, W / 2, hh, 0.08);
    b.blocker(0, top + hh, -D / 2, W / 2, hh, 0.08);
    b.blocker(W / 2, top + hh, 0, 0.08, hh, D / 2);
    b.blocker(-W / 2, top + hh, 0, 0.08, hh, D / 2);
    const tilt = Math.atan2(front - back, D);
    b.blocker(0, (front + back) / 2 + 0.06, 0, W / 2 + 0.35, 0.06, D / 2 + 0.4, -tilt);
  },

  camp(b) {
    const canvas = PAL.canvas[b.seed % PAL.canvas.length];
    // the tent: an A-frame, tipped to lie on the slope it's pitched on
    const tz = -1.0;
    const hw = 1.0;
    const z0 = tz - 1.2;
    const z1 = tz + 1.2;
    const H = 1.45;
    const ga = b.g(-hw, z0);
    const gb = b.g(hw, z0);
    const gc = b.g(-hw, z1);
    const gd = b.g(hw, z1);
    const plane = (x, z) => {
      const u = (x + hw) / (2 * hw);
      const v = (z - z0) / (z1 - z0);
      return (ga * (1 - u) + gb * u) * (1 - v) + (gc * (1 - u) + gd * u) * v + 0.02;
    };
    const P = (x, y, z) => new THREE.Vector3(x, plane(x, z) + y, z);
    const stain = (p, n, out) => out.copy(canvas).multiplyScalar(0.82 + phash(Math.round(p.x * 3), Math.round(p.y * 4), Math.round(p.z * 3) + b.seed) * 0.2);
    const from = b.m.n;
    b.m.surf = SURF.cloth;
    b.m.tris([P(-hw, 0, z0), P(0, H, z0), P(0, H, z1), P(-hw, 0, z0), P(0, H, z1), P(-hw, 0, z1)], stain);
    b.m.tris([P(hw, 0, z0), P(0, H, z1), P(0, H, z0), P(hw, 0, z0), P(hw, 0, z1), P(0, H, z1)], stain);
    b.m.tris([P(-hw, 0, z0), P(hw, 0, z0), P(0, H, z0)], stain);
    // the door flaps, tied back
    b.m.tris([P(0, H, z1), P(-hw, 0, z1), P(-hw * 0.55, 0.25, z1 + 0.32)], stain);
    b.m.tris([P(0, H, z1), P(hw * 0.55, 0.25, z1 + 0.32), P(hw, 0, z1)], stain);
    b.m.tris([P(-hw + 0.05, 0.01, z0 + 0.05), P(hw - 0.05, 0.01, z1 - 0.05), P(hw - 0.05, 0.01, z0 + 0.05), P(-hw + 0.05, 0.01, z0 + 0.05), P(-hw + 0.05, 0.01, z1 - 0.05), P(hw - 0.05, 0.01, z1 - 0.05)], (p, n, out) => out.copy(PAL.canvas[2]).multiplyScalar(0.45));
    weather(b.m, from, 0.25, 0);
    b.m.surf = SURF.plain;
    const kit = b.m.n;
    // a bedroll inside
    const bed = P(-0.35, 0.08, tz - 0.1);
    box(b.m, bed.x, bed.y, bed.z, 0.7, 0.14, 1.8, PAL.blanket);
    // poles, a ridge pole, guy ropes to pegs
    for (const z of [z0, z1]) rod(b.m, [0, plane(0, z) - 0.1, z], [0, plane(0, z) + H + 0.12, z], 0.025, WOOD.bark, 5);
    rod(b.m, [0, plane(0, z0) + H + 0.02, z0 - 0.08], [0, plane(0, z1) + H + 0.02, z1 + 0.08], 0.02, WOOD.bark, 5);
    for (const [z, out] of [[z0, -0.95], [z1, 0.95]]) {
      const pz = z + out;
      const pg = b.g(0, pz);
      rod(b.m, [0, plane(0, z) + H + 0.08, z], [0, pg + 0.12, pz], 0.008, PAL.rope, 3);
      rod(b.m, [0, pg - 0.05, pz], [0, pg + 0.16, pz], 0.02, PAL.plank, 4);
    }
    for (const s of [-1, 1]) {
      for (const z of [z0 + 0.3, z1 - 0.3]) {
        const px = s * (hw + 0.55);
        const pg = b.g(px, z);
        rod(b.m, [s * hw * 0.55, plane(s * hw * 0.55, z) + H * 0.45, z], [px, pg + 0.1, z], 0.007, PAL.rope, 3);
      }
    }
    b.solid(0, z0 + 0.4, 0, z1 - 0.4, hw - 0.05, Math.min(ga, gb, gc, gd) - 0.2, Math.max(ga, gb, gc, gd) + H);

    // the fire ring: stones round charred ends and ash, gone cold
    const fx = 0;
    const fz = 2.2;
    const fg = b.g(fx, fz);
    const ringFrom = b.m.n;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + b.rnd() * 0.2;
      const x = fx + Math.cos(a) * 0.52;
      const z = fz + Math.sin(a) * 0.52;
      stone(b.m, x, b.g(x, z) + 0.06, z, 0.26 + b.rnd() * 0.08, b.seed + i * 11, 0.65);
    }
    b.m.tris([new THREE.Vector3(fx - 0.4, fg + 0.02, fz), new THREE.Vector3(fx, fg + 0.02, fz + 0.4), new THREE.Vector3(fx + 0.4, fg + 0.02, fz), new THREE.Vector3(fx - 0.4, fg + 0.02, fz), new THREE.Vector3(fx + 0.4, fg + 0.02, fz), new THREE.Vector3(fx, fg + 0.02, fz - 0.4)], (p, n, out) => out.copy(PAL.ash));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      rod(b.m, [fx + Math.cos(a) * 0.32, fg + 0.06, fz + Math.sin(a) * 0.32], [fx - Math.cos(a) * 0.05, fg + 0.1, fz - Math.sin(a) * 0.05], 0.05, PAL.char, 6);
    }
    // a tripod over it with a pot hanging
    const apex = [fx, fg + 1.35, fz];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 1.1;
      const x = fx + Math.cos(a) * 0.75;
      const z = fz + Math.sin(a) * 0.75;
      rod(b.m, [x, b.g(x, z) - 0.05, z], [apex[0] - Math.cos(a) * 0.08, apex[1] + 0.12, apex[2] - Math.sin(a) * 0.08], 0.025, WOOD.bark, 5);
    }
    rod(b.m, apex, [fx, fg + 0.75, fz], 0.008, PAL.iron, 3);
    const pot = new THREE.Matrix4().makeTranslation(fx, fg + 0.6, fz);
    b.m.add(new THREE.CylinderGeometry(0.16, 0.13, 0.26, 9, 1), pot, (p, n, out) => out.copy(PAL.iron).multiplyScalar(0.9 + Math.max(0, n.y) * 0.4));
    weather(b.m, ringFrom, 0.1, 0);
    // somewhere to sit: a log, and a round on its end; a crate with a lantern
    const lx = 1.55;
    const lg = Math.min(b.g(lx, 1.6), b.g(lx, 3.2));
    addRoundLog(b.m, alongMatrix('z', lx, lg + 0.17, 2.4), 1.6, b.seed + 3, 0.19, 0.05);
    b.solid(lx, 1.8, lx, 3.0, 0.2, lg - 0.2, lg + 0.36, { step: 0.4 });
    const rg = b.g(-1.25, 2.85);
    addRoundLog(b.m, new THREE.Matrix4().makeTranslation(-1.25, rg + 0.2, 2.85), 0.42, b.seed + 4, 0.22, 0.02);
    b.solid(-1.25, 2.85, -1.25, 2.85, 0.24, rg - 0.2, rg + 0.41, { step: 0.45 });
    const cg = b.g(-1.35, 0.6);
    box(b.m, -1.35, cg + 0.24, 0.6, 0.5, 0.48, 0.45, tone(PAL.plank, b.rnd), 0, 0.3);
    box(b.m, -1.35, cg + 0.6, 0.6, 0.12, 0.2, 0.12, PAL.rust, 0, 0.3);
    box(b.m, -1.35, cg + 0.6, 0.6, 0.09, 0.14, 0.13, lin(0xd9c58a), 0, 0.3);
    b.solid(-1.35, 0.6, -1.35, 0.6, 0.3, cg - 0.2, cg + 0.48, { step: 0.55 });
    weather(b.m, kit, 0.3, 0.1);
  },

  well(b) {
    const ring = [];
    for (let i = 0; i < 8; i++) ring.push([Math.cos((i / 8) * 6.28) * 0.8, Math.sin((i / 8) * 6.28) * 0.8]);
    const { lo, hi } = b.span(ring);
    const rim = hi + 0.78;
    const from = b.m.n;
    // courses of stone round the shaft, then flat capstones
    const per = 14;
    for (let row = 0, y = lo - 0.15; y < rim - 0.16; row++, y += 0.2) {
      for (let i = 0; i < per; i++) {
        const a = ((i + (row % 2) * 0.5) / per) * Math.PI * 2;
        stone(b.m, Math.cos(a) * 0.72, y + 0.1, Math.sin(a) * 0.72, 0.38, b.seed + row * 31 + i, 0.55);
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      box(b.m, Math.cos(a) * 0.72, rim - 0.04, Math.sin(a) * 0.72, 0.26, 0.09, 0.46, (p, n, out) => out.copy(WOOD.stone).multiplyScalar(0.85 + phash(i, b.seed, 4) * 0.25), 0, -a, 0, SURF.stone);
    }
    // the shaft: dark, and darker the further down you look
    const shaft = new THREE.CylinderGeometry(0.56, 0.56, rim - lo + 0.1, 12, 3, true);
    b.m.add(shaft, new THREE.Matrix4().makeTranslation(0, (rim + lo) / 2 - 0.1, 0), (p, n, out) => out.copy(WOOD.stoneDark).multiplyScalar(Math.max(0.05, 0.5 + p.y * 0.5)), null, SURF.stone);
    const disc = new THREE.CircleGeometry(0.56, 12);
    b.m.add(disc, new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, lo + 0.04, 0), () => PAL.dark.clone());
    // posts, a windlass with a crank, rope wound on it, and a little roof
    const wood = b.m.n;
    for (const s of [-1, 1]) {
      const g = b.g(s * 0.95, 0);
      box(b.m, s * 0.95, (g - 0.2 + rim + 1.4) / 2, 0, 0.13, rim + 1.6 - g, 0.13, tone(PAL.plank, b.rnd));
    }
    addRoundLog(b.m, alongMatrix('x', 0, rim + 0.62, 0), 1.95, b.seed + 2, 0.08, 0.01);
    b.m.add(new THREE.CylinderGeometry(0.115, 0.115, 0.5, 9, 1), alongMatrix('x', -0.15, rim + 0.62, 0), (p, n, out) => out.copy(PAL.rope).multiplyScalar(0.8 + phash(Math.round(p.y * 30), 1, 2) * 0.3), null, SURF.cloth);
    rod(b.m, [1.02, rim + 0.62, 0], [1.2, rim + 0.62, 0], 0.03, PAL.iron);
    rod(b.m, [1.2, rim + 0.62, 0], [1.2, rim + 0.3, 0.1], 0.025, PAL.iron);
    rod(b.m, [1.2, rim + 0.3, 0.1], [1.32, rim + 0.3, 0.1], 0.03, PAL.plank);
    rod(b.m, [0.05, rim + 0.5, 0.11], [0.3, rim + 0.08, 0.62], 0.012, PAL.rope, 3);
    const bucket = new THREE.Matrix4().makeTranslation(0.32, rim + 0.13, 0.66);
    b.m.add(new THREE.CylinderGeometry(0.15, 0.12, 0.26, 10, 1), bucket, (p, n, out) => out.copy(Math.abs(p.y) > 0.09 && Math.abs(n.y) < 0.5 ? PAL.iron : PAL.plank).multiplyScalar(0.85 + phash(Math.round(Math.atan2(p.z, p.x) * 3), 2, 3) * 0.3));
    weather(b.m, from, 0.25, 0.5);
    const roofFrom = b.m.n;
    addRoof(b.m, { x0: -1.0, z0: -0.55, x1: 1.0, z1: 0.55, eave: rim + 1.3, axis: 'x' }, PITCH, 0.28, b.seed);
    weather(b.m, wood, 0.4, 0);
    weather(b.m, roofFrom, 0.2, 0.8);
    b.solid(0, 0, 0, 0, 0.92, lo - 0.3, rim);
    b.solid(-0.95, 0, -0.95, 0, 0.1, lo - 0.3, rim + 1.4);
    b.solid(0.95, 0, 0.95, 0, 0.1, lo - 0.3, rim + 1.4);
  },

  dock(b, site) {
    const L = site.len;
    const lv = site.level - b.y0; // the water, from the frame's origin at its edge
    const deck = Math.max(lv + 0.42, b.g(0, -1.6) + 0.08);
    const z0 = -1.6;
    const from = b.m.n;
    // planks across, on two stringers, on posts down to the bed
    const n = Math.round((L - z0) / 0.22);
    for (let i = 0; i < n; i++) {
      const z = z0 + (i + 0.5) * ((L - z0) / n);
      if (b.rnd() < 0.03 && i > 3 && i < n - 2) continue; // one gone
      const k = 0.75 + b.rnd() * 0.35;
      box(b.m, (b.rnd() - 0.5) * 0.04, deck - 0.025, z, 1.6, 0.05, 0.2, (p, nn, out) => out.copy(PAL.plankGrey).lerp(PAL.plank, 0.4).multiplyScalar(k), 0, (b.rnd() - 0.5) * 0.03, 0, SURF.wood);
    }
    for (const x of [-0.6, 0.6]) box(b.m, x, deck - 0.12, (z0 + L) / 2, 0.1, 0.14, L - z0, tone(PAL.plank, b.rnd));
    for (let z = z0 + 0.2; z <= L + 0.01; z += 2) {
      const zz = Math.min(z, L - 0.15);
      for (const x of [-0.72, 0.72]) {
        const g = b.g(x, zz);
        rod(b.m, [x, g - 0.3, zz], [x, deck - 0.05, zz], 0.085, tone(WOOD.bark, b.rnd), 6);
        b.solid(x, zz, x, zz, 0.1, g - 0.3, deck - 0.05);
      }
    }
    // the post at the end the boat is tied to
    rod(b.m, [0.72, b.g(0.72, L - 0.15) - 0.3, L - 0.15], [0.72, deck + 0.55, L - 0.15], 0.1, WOOD.bark, 7);
    b.solid(0.72, L - 0.15, 0.72, L - 0.15, 0.12, lv - 2, deck + 0.55);
    rod(b.m, [0.72, deck + 0.4, L - 0.15], [1.42, lv + 0.42, L - 0.55], 0.012, PAL.rope, 3);
    weather(b.m, from, 0.5, 0.35);
    b.solid(-0.35, z0 + 0.4, -0.35, L - 0.35, 0.45, deck - 0.25, deck, { step: 0.5, surface: 'boards' });
    b.solid(0.35, z0 + 0.4, 0.35, L - 0.35, 0.45, deck - 0.25, deck, { step: 0.5, surface: 'boards' });

    // the rowboat, riding on the water alongside
    const boat = b.part(new THREE.Vector3(1.42, lv - 0.17, L - 2.1), 0, true);
    hull(boat, new THREE.Matrix4(), { len: 3.3, beam: 1.12, depth: 0.5, rise: 0.12, transom: 0.62, paint: PAL.paint[b.seed % PAL.paint.length], seed: b.seed });
    for (const s of [-0.55, 0.05, 0.6]) box(boat, 0, 0.36, s * 1.5, 0.98 * (1 - Math.abs(s) * 0.3), 0.04, 0.24, PAL.plank);
    rod(boat, [-0.25, 0.14, -1.2], [-0.12, 0.22, 1.1], 0.025, PAL.plank);
    rod(boat, [0.25, 0.14, -1.2], [0.12, 0.22, 1.1], 0.025, PAL.plank);
    weather(boat, 0, 0.3, 0);
    b.solid(1.42, L - 3.4, 1.42, L - 0.8, 0.5, lv - 0.3, lv + 0.05, { step: 0.6, surface: 'boards' });
  },

  canoe(b) {
    const ga = b.g(0, -2.0);
    const gb = b.g(0, 2.0);
    const pitch = Math.atan2(gb - ga, 4.0);
    const from = b.m.n;
    // two short logs to rest it on
    for (const z of [-1.3, 1.3]) {
      const g = b.g(0, z);
      addRoundLog(b.m, alongMatrix('x', 0, g + 0.08, z), 1.0, b.seed + Math.round(z * 10), 0.11, 0.03);
    }
    weather(b.m, from, 0.5, 0.4);
    // turned over: keel up, gunwales on the rests
    const mid = (ga + gb) / 2 + 0.2;
    const flip = new THREE.Matrix4().compose(
      new THREE.Vector3(0, mid + 0.36, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, 0, Math.PI)),
      new THREE.Vector3(1, 1, 1),
    );
    const hullFrom = b.m.n;
    hull(b.m, flip, { len: 4.6, beam: 0.86, depth: 0.36, rise: 0.22, transom: 0, paint: PAL.paint[(b.seed >> 3) % PAL.paint.length], seed: b.seed });
    weather(b.m, hullFrom, 0.25, 0.2);
    // a paddle laid on the grass beside it
    const px = 0.85;
    const pa = [px, b.g(px, -0.9) + 0.03, -0.9];
    const pb = [px + 0.15, b.g(px + 0.15, 0.55) + 0.05, 0.55];
    rod(b.m, pa, pb, 0.017, PAL.plank);
    box(b.m, px + 0.18, b.g(px + 0.18, 0.85) + 0.05, 0.85, 0.17, 0.02, 0.55, PAL.plank, 0, 0.1, 0);
    b.solid(0, -2.0, 0, 2.0, 0.42, Math.min(ga, gb) - 0.2, Math.max(ga, gb) + 0.45);
  },
};

// ── Boats ────────────────────────────────────────────────────────────────────
// A wooden hull along z, keel at y = 0, painted outside and bare inside.
//   len, beam, depth  m
//   rise      how much the sheer rises towards the ends (m)
//   transom   width of a square stern as a fraction of the beam (0: a canoe,
//             pointed at both ends)
function hull(m, matrix, { len, beam, depth, rise, transom, paint, seed }) {
  const NL = 14;
  const NC = 9;
  const half = (s) => {
    const pointed = Math.sqrt(Math.max(0, 1 - s * s));
    return (beam / 2) * (s < 0 && transom ? transom + (1 - transom) * Math.sqrt(Math.max(0, 1 - s * s * 0.999)) : pointed);
  };
  const sheer = (s) => depth + rise * s * s;
  const keel = (s) => rise * 0.35 * s * s * s * s;
  const surface = (inset) => {
    const pos = [];
    for (let i = 0; i <= NL; i++) {
      const s = -1 + (2 * i) / NL;
      const hb = Math.max(0, half(s) - inset);
      const top = sheer(s);
      const bot = keel(s) + inset;
      for (let j = 0; j <= NC; j++) {
        const phi = (j / NC) * Math.PI;
        const x = hb * Math.cos(phi);
        const y = bot + (top - bot) * (1 - Math.pow(Math.sin(phi), 0.55));
        pos.push(x, y, (s * len) / 2);
      }
    }
    const idx = [];
    for (let i = 0; i < NL; i++) {
      for (let j = 0; j < NC; j++) {
        const a = i * (NC + 1) + j;
        const c = a + NC + 1;
        if (inset) idx.push(a, a + 1, c, a + 1, c + 1, c);
        else idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  m.add(
    surface(0),
    matrix,
    (p, n, out) => {
      const top = sheer((p.z * 2) / len);
      if (p.y > top - 0.06) return out.copy(PAL.trim);
      out.copy(paint).multiplyScalar(0.85 + phash(Math.round(p.z * 4), Math.round(p.y * 8), seed) * 0.2);
      if (p.y < 0.08) out.multiplyScalar(0.55);
      return out;
    },
    null,
    SURF.paint,
  );
  m.add(surface(0.035), matrix, (p, n, out) => out.copy(PAL.plank).multiplyScalar(0.8 + phash(Math.round(p.z * 5), 1, seed) * 0.25), null, SURF.wood);
  // a square stern
  if (transom) {
    const s = -1;
    const hb = half(s);
    const pts = [];
    for (let j = 0; j <= NC; j++) {
      const phi = (j / NC) * Math.PI;
      pts.push(new THREE.Vector3(hb * Math.cos(phi), keel(s) + (sheer(s) - keel(s)) * (1 - Math.pow(Math.sin(phi), 0.55)), -len / 2).applyMatrix4(matrix));
    }
    const c = new THREE.Vector3(0, (keel(s) + sheer(s)) / 2, -len / 2).applyMatrix4(matrix);
    const tri = [];
    for (let j = 0; j < NC; j++) tri.push(c, pts[j + 1], pts[j]);
    m.tris(tri, (p, n, out) => out.copy(paint).multiplyScalar(0.8), SURF.paint);
  }
}
