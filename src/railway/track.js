// What the railway looks like where it runs, made in code like everything
// else: vertex-coloured boxes and strips merged into one mesh for each piece
// of track and each station.
//
// The track stands on the land as it is (see lines.js). Where the rail is
// low over the ground it runs on a ballast bank, sloping down to the ground
// either side; where it's higher than TRESTLE_FROM, on a timber trestle: a
// bent of four posts (the outer two leaning out) every BENT metres, braced
// across, with two stringers under the ties. Over the ties, two rails a
// GAUGE apart (three-foot narrow gauge).
//
// A station: a platform of boards beside the track, following its curve,
// on posts down to the ground, with steps at either end; a little board
// station house behind it, on stone piers, its door to the platform; a lamp
// at each end, the name board, and at the first station of a line, a water
// tower for the engines.
//
//   buildPiece(line, p, ground, material) -> { object, solids }
//   buildStation(line, st, ground, material, glow) -> { object, solids,
//     blockers }   blockers: boxes the camera can't see into, upright and
//                  turned to a yaw: { x, y, z, half: [x, y, z], yaw }
//   ground(x, z) -> height of the ground in the world (with what's been dug)

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { phash } from '../noise.js';
import { TRESTLE_FROM, PLATFORM, PLATFORM_EDGE, PLATFORM_W, HOUSE, pointAt } from './lines.js';

export const PIECE = 96; // m of track stood up and taken down together
export const GAUGE = 0.914; // m between the rails (three feet)
export const RAIL_H = 0.11; // m from the top of a tie to the top of the rail
const RAIL_W = 0.07;
const TIE = { len: 1.9, h: 0.13, w: 0.2, every: 0.62 };
const SHOULDER = 1.25; // m either side of the middle, the flat top of the ballast
const BANK_SLOPE = 1.5; // a bank's side runs this far out for each metre down
const TOE_MAX = 9; // m out from the middle a bank's side reaches at most
const BENT = 4.8; // m between trestle bents
const BENT_HALF = 1.05; // m from the middle to an outer post, at the top
const BATTER = 0.14; // m an outer post leans out for each metre down
const PANEL = 3.6; // m between a bent's horizontal braces
const DECK = 0.45; // m from the bottom of the ties to the bottom of the stringers
const STEP = { rise: 0.22, run: 0.32 }; // the steps up to a platform
// What you hear underfoot: hollow on the boards, a crunch on the ballast.
const BOARDS = 'boards';
const BALLAST = 'ballast';

const lin = (hex) => new THREE.Color(hex);
export const PAL = {
  ballast: lin(0x7b746a),
  ballastDark: lin(0x5a544b),
  earth: lin(0x5f5038),
  grass: lin(0x7c9440),
  tie: lin(0x3b2e25),
  tieOld: lin(0x5a4a3c),
  rail: lin(0x5d4436),
  railTop: lin(0xa7a29b),
  timber: lin(0x6d5c49),
  timberDark: lin(0x4a3d31),
  plank: lin(0x8e7656),
  plankGrey: lin(0x7f786c),
  paint: lin(0x86402e),
  trim: lin(0xd9ccaa),
  door: lin(0x3d5a44),
  roof: lin(0x4a4038),
  stone: lin(0x8a857a),
  iron: lin(0x2b2724),
  board: lin(0xe6dcc0),
  glass: lin(0x2a3438),
};

const _c = new THREE.Color();
const _base = new THREE.Color();
const _shade = new THREE.Color();
const _vary = new THREE.Color();
const _top = new THREE.Color();
const _sh = new THREE.Color();
const _ft = new THREE.Color();
const _p = { x: 0, y: 0, z: 0, dx: 0, dz: 0, grade: 0 };
const _q = { x: 0, y: 0, z: 0, dx: 0, dz: 0, grade: 0 };

// ── Writing geometry ─────────────────────────────────────────────────────────
// Straight into a Mesher (build/geometry.js), a face at a time with flat
// normals: thousands of ties and planks don't each need a BufferGeometry.
// Each vertex goes in by the Mesher's own vertex(), which gives it what it's
// made of and its grain as well: the material that draws it reads those, and
// a mesh missing them isn't drawn at all.

// Component k of (q - p) × (s - r), for [x, y, z] points.
function cross(p, q, r, s, k) {
  const i = (k + 1) % 3;
  const j = (k + 2) % 3;
  return (q[i] - p[i]) * (s[j] - r[j]) - (q[j] - p[j]) * (s[i] - r[i]);
}

// A flat four-sided face, its corners in order round it as seen from the
// side it faces. Corners are [x, y, z]; color is one THREE.Color, or one
// for each corner. A triangle is a quad with a corner given twice: c and d
// the same, or a and d (a fan round a hub, as a drum's end is).
export function quad(m, a, b, c, d, color) {
  // the way it faces: across its first corner, or, where that is no corner
  // (a and d the same), across its diagonals, which turn the same way
  let nx = cross(a, b, a, d, 0);
  let ny = cross(a, b, a, d, 1);
  let nz = cross(a, b, a, d, 2);
  if (Math.hypot(nx, ny, nz) < 1e-12) {
    nx = cross(a, c, b, d, 0);
    ny = cross(a, c, b, d, 1);
    nz = cross(a, c, b, d, 2);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const [ca, cb, cc, cd] = Array.isArray(color) ? color : [color, color, color, color];
  const i = m.vertex(a[0], a[1], a[2], nx, ny, nz, ca);
  m.vertex(b[0], b[1], b[2], nx, ny, nz, cb);
  m.vertex(c[0], c[1], c[2], nx, ny, nz, cc);
  m.vertex(d[0], d[1], d[2], nx, ny, nz, cd);
  m.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

// A box from its eight corners: c[0..3] the bottom, c[4..7] the top, each
// going round the same way.
function box8(m, c, color) {
  _base.copy(color);
  const s = (k) => _shade.copy(_base).multiplyScalar(k);
  quad(m, c[4], c[5], c[6], c[7], s(1.08)); // top
  quad(m, c[3], c[2], c[1], c[0], s(0.7)); // bottom
  for (let k = 0; k < 4; k++) {
    const a = k;
    const b = (k + 1) % 4;
    quad(m, c[a], c[b], c[b + 4], c[a + 4], s(k % 2 ? 0.9 : 0.97));
  }
}

// A beam from a to b ([x, y, z]), w wide and h deep; `up` says which way
// its depth is turned (straight up, unless it runs straight up itself).
export function beam(m, a, b, w, h, color, up = null) {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  let dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  dx /= len;
  dy /= len;
  dz /= len;
  let ux = up ? up[0] : 0;
  let uy = up ? up[1] : 1;
  let uz = up ? up[2] : 0;
  if (Math.abs(dx * ux + dy * uy + dz * uz) > 0.95) [ux, uy, uz] = [1, 0, 0];
  // side = d × up, top = side × d
  let sx = dy * uz - dz * uy;
  let sy = dz * ux - dx * uz;
  let sz = dx * uy - dy * ux;
  const sl = Math.hypot(sx, sy, sz);
  sx /= sl;
  sy /= sl;
  sz /= sl;
  const tx = sy * dz - sz * dy;
  const ty = sz * dx - sx * dz;
  const tz = sx * dy - sy * dx;
  const corner = (p, a1, a2) => [p[0] + sx * a1 * w * 0.5 + tx * a2 * h * 0.5, p[1] + sy * a1 * w * 0.5 + ty * a2 * h * 0.5, p[2] + sz * a1 * w * 0.5 + tz * a2 * h * 0.5];
  box8(m, [corner(a, -1, -1), corner(a, 1, -1), corner(b, 1, -1), corner(b, -1, -1), corner(a, -1, 1), corner(a, 1, 1), corner(b, 1, 1), corner(b, -1, 1)], color);
}

// A box turned to `yaw` about its middle (cx, cy, cz): hx across, hy up and
// hz along (half sizes).
export function box(m, cx, cy, cz, hx, hy, hz, yaw, color) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (a, b, e) => [cx + a * hx * c + e * hz * s, cy + b * hy, cz - a * hx * s + e * hz * c];
  box8(m, [at(-1, -1, -1), at(1, -1, -1), at(1, -1, 1), at(-1, -1, 1), at(-1, 1, -1), at(1, 1, -1), at(1, 1, 1), at(-1, 1, 1)], color);
}

// A colour a little different from the next, the same every time.
const vary = (color, a, b, spread = 0.18) => _vary.copy(color).multiplyScalar(1 - spread / 2 + phash(a, b, 7) * spread);

// How far out (m) from the middle the track takes up the ground at sample
// i, to one side (1: its +x side, -1: its -x side) or the wider of the two:
// out to the foot of its bank, or the feet of a trestle's posts. With
// `bare`, only where no grass grows: the ballast on top of a bank (its
// sides are grown over, and grass grows on under a trestle).
export function footprint(line, i, bare = false, side = 0) {
  const top = line.h[i];
  if (top - line.g[i] > TRESTLE_FROM) return bare ? 0 : BENT_HALF + 0.25 + BATTER * (top - line.g[i]);
  const g = side > 0 ? line.gp[i] : side < 0 ? line.gm[i] : Math.min(line.gp[i], line.gm[i]);
  const out = Math.min(TOE_MAX, SHOULDER + Math.max(0.15, top - RAIL_H - TIE.h * 0.55 - g) * BANK_SLOPE);
  return bare ? Math.min(out, SHOULDER + 0.4) : out;
}

// ── A piece of track ─────────────────────────────────────────────────────────
// Samples i0..i1 of the line (i1 may be past the end, and wraps). Everything
// is made relative to the piece's first sample, which is where its object
// stands, so that a long way from the middle of the world nothing jitters.
export function pieceRange(line, p) {
  const per = Math.round(PIECE / line.ds);
  const i0 = p * per;
  return [i0, Math.min(line.n, i0 + per)];
}

export const pieceCount = (line) => Math.ceil(line.n / Math.round(PIECE / line.ds));

export function buildPiece(line, p, ground, material) {
  const [i0, i1] = pieceRange(line, p);
  const { n, ds } = line;
  const ox = line.x[i0 % n];
  const oy = line.h[i0 % n];
  const oz = line.z[i0 % n];
  const m = new Mesher();
  const solids = [];
  const S = (i) => {
    const k = ((i % n) + n) % n;
    const a = (k - 1 + n) % n;
    const b = (k + 1) % n;
    let tx = line.x[b] - line.x[a];
    let tz = line.z[b] - line.z[a];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    return { k, x: line.x[k], z: line.z[k], h: line.h[k], up: line.h[k] - line.g[k], tx, tz, nx: tz, nz: -tx };
  };
  const L = (x, y, z) => [x - ox, y - oy, z - oz];
  const raised = (s) => s.up > TRESTLE_FROM;

  // ── the bank, and what's solid ──
  let prev = S(i0);
  let prevSec = section(prev, ground);
  for (let i = i0 + 1; i <= i1; i++) {
    const cur = S(i);
    const sec = section(cur, ground);
    const trestle = raised(prev) || raised(cur);
    if (!trestle) {
      // the flat top the ties are bedded in, and the slopes, gravel at the
      // top and grown over with grass toward the foot
      const top = _top.copy(vary(PAL.ballast, prev.k, 2, 0.14));
      quad(m, L(...prevSec.ls), L(...sec.ls), L(...sec.rs), L(...prevSec.rs), top);
      const shoulder = _sh.copy(top).lerp(PAL.earth, 0.25).lerp(PAL.grass, 0.25);
      const foot = (k) => _ft.copy(PAL.grass).multiplyScalar(0.85 + phash(prev.k, k, 5) * 0.3).lerp(PAL.earth, 0.12);
      quad(m, L(...prevSec.lt), L(...sec.lt), L(...sec.ls), L(...prevSec.ls), [foot(1).clone(), foot(2).clone(), shoulder, shoulder]);
      quad(m, L(...prevSec.rs), L(...sec.rs), L(...sec.rt), L(...prevSec.rt), [shoulder, shoulder, foot(3).clone(), foot(4).clone()]);
    } else {
      // the bank comes to an end against the trestle
      if (!raised(prev) && raised(cur)) bankEnd(m, prevSec, prev, ground, L, true);
      if (raised(prev) && !raised(cur)) bankEnd(m, sec, cur, ground, L, false);
    }
    // walk along it: on the boards of a trestle, and up onto a low bank
    const top = (s) => s.h - RAIL_H;
    const lowest = Math.min(prev.up, cur.up);
    solids.push({
      ax: prev.x,
      az: prev.z,
      bx: cur.x,
      bz: cur.z,
      r: SHOULDER + 0.15,
      topA: top(prev),
      topB: top(cur),
      bottom: trestle ? Math.min(top(prev), top(cur)) - TIE.h - DECK - 0.35 : Math.min(prev.h - prev.up, cur.h - cur.up) - 1,
      step: trestle ? undefined : Math.min(lowest + 0.1, 1.1),
      surface: trestle ? BOARDS : BALLAST,
    });
    prev = cur;
    prevSec = sec;
  }

  // ── trestles: bents, stringers, guard timbers ──
  const s0 = i0 * ds;
  const s1 = i1 * ds;
  for (let s = Math.ceil(s0 / BENT) * BENT; s < s1; s += BENT) {
    const i = Math.round(s / ds);
    if (!raised(S(i))) continue;
    pointAt(line, s, _p);
    bent(m, _p, ground, L, Math.round(s / BENT));
  }
  let run = null;
  for (let i = i0; i <= i1; i++) {
    const on = raised(S(i)) || (i < i1 && raised(S(i + 1))) || (i > i0 && raised(S(i - 1)));
    if (on && run === null) run = i;
    if ((!on || i === i1) && run !== null) {
      const end = on ? i : i - 1;
      if (end > run) {
        for (const off of [-0.55, 0.55]) alongTrack(m, line, run * ds, end * ds, off, -RAIL_H - TIE.h - DECK / 2, 0.24, DECK, PAL.timberDark, L);
        for (const off of [-TIE.len / 2 + 0.12, TIE.len / 2 - 0.12]) alongTrack(m, line, run * ds, end * ds, off, -RAIL_H + 0.06, 0.16, 0.14, PAL.timber, L);
      }
      run = null;
    }
  }

  // ── ties ──
  for (let s = Math.ceil(s0 / TIE.every) * TIE.every; s < s1; s += TIE.every) {
    pointAt(line, s, _p);
    const yaw = Math.atan2(_p.dx, _p.dz);
    const k = Math.round(s / TIE.every);
    const [x, y, z] = L(_p.x, _p.y - RAIL_H - TIE.h / 2, _p.z);
    box(m, x, y, z, TIE.len / 2 + (phash(k, 3, 1) - 0.5) * 0.06, TIE.h / 2, TIE.w / 2, yaw, vary(phash(k, 9, 2) < 0.15 ? PAL.tieOld : PAL.tie, k, 1, 0.25));
  }

  // ── rails ──
  for (const side of [-1, 1]) {
    const off = (side * GAUGE) / 2;
    alongTrack(m, line, s0, s1, off, -RAIL_H / 2, RAIL_W, RAIL_H, PAL.rail, L, PAL.railTop);
  }

  return { object: place(m, null, material, null, ox, oy, oz), solids };
}

// The meshes made, as one object standing at (ox, oy, oz).
function place(m, lamps, material, glow, ox, oy, oz) {
  const object = new THREE.Group();
  object.position.set(ox, oy, oz);
  const mesh = new THREE.Mesh(m.build(), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  object.add(mesh);
  if (lamps && !lamps.empty) object.add(new THREE.Mesh(lamps.build(), glow));
  object.updateMatrixWorld(true);
  return object;
}

// A cross-section of the bank at a sample: its toes on the ground and its
// shoulders up by the ties, either side ([x, y, z] in the world).
function section(s, ground) {
  const top = s.h - RAIL_H - TIE.h * 0.55;
  const at = (off, y) => [s.x + s.nx * off, y, s.z + s.nz * off];
  // where a slope of BANK_SLOPE down from the shoulder meets the ground:
  // closer in where the ground rises to meet it, further out (to a point)
  // where the hillside falls away
  const toe = (side) => {
    let out = SHOULDER + 0.3;
    let g = top;
    for (let k = 0; k < 4; k++) {
      g = ground(s.x + s.nx * side * out, s.z + s.nz * side * out);
      out = Math.min(TOE_MAX, SHOULDER + Math.max(0.15, top - g) * BANK_SLOPE);
    }
    g = ground(s.x + s.nx * side * out, s.z + s.nz * side * out);
    return at(side * out, Math.min(g, top) - 0.2);
  };
  return { lt: toe(-1), ls: at(-SHOULDER, top), rs: at(SHOULDER, top), rt: toe(1), top };
}

// Where a bank stops at a trestle, it ends in a slope of its own, running
// on under the trestle's first bents to the ground, grassed over like its
// sides. `on`: whether the trestle is ahead (the way round) or behind.
function bankEnd(m, sec, cur, ground, L, on) {
  const dir = on ? 1 : -1;
  const fx = cur.tx * dir;
  const fz = cur.tz * dir;
  const foot = (p) => {
    let out = 1;
    let g = p[1];
    for (let k = 0; k < 4; k++) {
      g = ground(p[0] + fx * out, p[2] + fz * out);
      out = Math.min(TOE_MAX, Math.max(0.3, p[1] - g) * BANK_SLOPE);
    }
    g = ground(p[0] + fx * out, p[2] + fz * out);
    return [p[0] + fx * out, Math.min(g, p[1]) - 0.2, p[2] + fz * out];
  };
  const a = sec.ls;
  const b = sec.rs;
  const c = foot(b);
  const d = foot(a);
  const grass = _ft.copy(PAL.grass).lerp(PAL.earth, 0.3).clone();
  const top = _sh.copy(PAL.ballast).lerp(PAL.earth, 0.3).clone();
  quad(m, L(...a), L(...b), L(...c), L(...d), [top, top, grass, grass]);
  // and its corners, down to the feet of the bank's sides
  m.tris([new THREE.Vector3(...L(...a)), new THREE.Vector3(...L(...d)), new THREE.Vector3(...L(...sec.lt))], (p, n, out) => out.copy(grass));
  m.tris([new THREE.Vector3(...L(...b)), new THREE.Vector3(...L(...sec.rt)), new THREE.Vector3(...L(...c))], (p, n, out) => out.copy(grass));
}

// A long timber or a rail along the track from s0 to s1, `off` m across
// from the middle and `dy` m from the top of the rail to its middle, w wide
// and h deep. With `topColor`, its top is that colour (a rail's worn head).
function alongTrack(m, line, s0, s1, off, dy, w, h, color, L, topColor = null) {
  const step = 2;
  const steps = Math.max(1, Math.ceil((s1 - s0) / step));
  let a = null;
  for (let e = 0; e <= steps; e++) {
    const s = s0 + ((s1 - s0) * e) / steps;
    pointAt(line, s, _q);
    const nx = _q.dz;
    const nz = -_q.dx;
    const cx = _q.x + nx * off;
    const cz = _q.z + nz * off;
    const cy = _q.y + dy;
    const b = {
      bl: L(cx - nx * w * 0.5, cy - h / 2, cz - nz * w * 0.5),
      br: L(cx + nx * w * 0.5, cy - h / 2, cz + nz * w * 0.5),
      tl: L(cx - nx * w * 0.5, cy + h / 2, cz - nz * w * 0.5),
      tr: L(cx + nx * w * 0.5, cy + h / 2, cz + nz * w * 0.5),
    };
    if (a) {
      quad(m, a.tl, a.tr, b.tr, b.tl, topColor || _c.copy(color).multiplyScalar(1.08));
      quad(m, a.tr, a.br, b.br, b.tr, _c.copy(color).multiplyScalar(0.92));
      quad(m, a.br, a.bl, b.bl, b.br, _c.copy(color).multiplyScalar(0.7));
      quad(m, a.bl, a.tl, b.tl, b.bl, _c.copy(color).multiplyScalar(0.97));
    }
    a = b;
  }
}

// One trestle bent at point p (on the rail's top): a cap under the
// stringers, two upright posts and two leaning out, down to the ground, and
// braces across them.
function bent(m, p, ground, L, seed) {
  const nx = p.dz;
  const nz = -p.dx;
  const capTop = p.y - RAIL_H - TIE.h - DECK;
  const capY = capTop - 0.15;
  const across = (off, y) => [p.x + nx * off, y, p.z + nz * off];
  const col = vary(PAL.timber, seed, 5, 0.16);
  const capA = L(...across(-BENT_HALF - 0.35, capY));
  const capB = L(...across(BENT_HALF + 0.35, capY));
  beam(m, capA, capB, 0.32, 0.3, col);
  const posts = [];
  let lowest = Infinity;
  let highest = -Infinity;
  for (const top of [-BENT_HALF, -0.35, 0.35, BENT_HALF]) {
    const outer = Math.abs(top) > 0.5;
    // where it meets the ground: leaning out as far as it is tall
    let off = top;
    let g = ground(...xz(across(off, 0)));
    if (outer) {
      off = top + Math.sign(top) * BATTER * Math.max(0, capY - g);
      g = ground(...xz(across(off, 0)));
    }
    lowest = Math.min(lowest, g);
    highest = Math.max(highest, g);
    posts.push({ top, off, g });
    beam(m, L(...across(top, capY - 0.15)), L(...across(off, g - 0.3)), 0.24, 0.24, vary(PAL.timber, seed, top * 10, 0.2), [p.dx, 0, p.dz]);
  }
  // braces: a level girt every PANEL down, and crossed boards between them
  const left = (y) => -BENT_HALF - BATTER * (capY - y);
  const right = (y) => BENT_HALF + BATTER * (capY - y);
  const brace = vary(PAL.timberDark, seed, 11, 0.15);
  let yA = capY - 0.2;
  while (yA - PANEL > highest + 0.4) {
    const yB = yA - PANEL;
    beam(m, L(...across(left(yB) - 0.12, yB)), L(...across(right(yB) + 0.12, yB)), 0.08, 0.22, brace);
    for (const f of [0.14, -0.14]) {
      const a = L(...across(left(yA), yA));
      const b = L(...across(right(yB), yB));
      const c = L(...across(right(yA), yA));
      const d = L(...across(left(yB), yB));
      const along = (q) => [q[0] + p.dx * f, q[1], q[2] + p.dz * f];
      beam(m, along(a), along(b), 0.06, 0.2, brace);
      beam(m, along(c), along(d), 0.06, 0.2, brace);
    }
    yA = yB;
  }
  // a sill across the feet on level enough ground
  if (highest - lowest < 0.35) beam(m, L(...across(posts[0].off - 0.3, lowest - 0.1)), L(...across(posts[3].off + 0.3, lowest - 0.1)), 0.3, 0.25, PAL.timberDark);
}

const xz = (p) => [p[0], p[2]];

// ── A station ────────────────────────────────────────────────────────────────
export function buildStation(line, st, ground, material, glow) {
  const m = new Mesher();
  const lamps = new Mesher();
  const solids = [];
  const blockers = [];
  const ox = st.x;
  const oy = st.rail;
  const oz = st.z;
  const L = (x, y, z) => [x - ox, y - oy, z - oz];
  const side = st.side;
  const deck = st.deck;
  const across = (q, off, y) => [q.x + q.dz * off * side, y, q.z - q.dx * off * side];
  const e0 = PLATFORM_EDGE;
  const e1 = PLATFORM_EDGE + PLATFORM_W;

  // ── the platform, along the curve ──
  const STEP_S = 2;
  let a = null;
  for (let s = -PLATFORM; s <= PLATFORM + 1e-6; s += STEP_S) {
    pointAt(line, st.s + s, _q);
    const b = { in: across(_q, e0, deck), out: across(_q, e1, deck), q: { ..._q } };
    if (a) {
      const k = Math.round(s / STEP_S);
      // boards across, so each two-metre strip a little different
      for (let w = 0; w < 3; w++) {
        const f0 = w / 3;
        const f1 = (w + 1) / 3;
        const mix = (u, v, f) => [u[0] + (v[0] - u[0]) * f, u[1], u[2] + (v[2] - u[2]) * f];
        const c = vary(phash(k, w, 4) < 0.3 ? PAL.plankGrey : PAL.plank, k, w, 0.2);
        const pa = mix(a.in, a.out, f0);
        const pb = mix(b.in, b.out, f0);
        const pc = mix(b.in, b.out, f1);
        const pd = mix(a.in, a.out, f1);
        if (side > 0) quad(m, L(...pa), L(...pd), L(...pc), L(...pb), c);
        else quad(m, L(...pa), L(...pb), L(...pc), L(...pd), c);
      }
      // the edge timber along the track, and the far edge
      beam(m, L(...shift(a.in, -0.1)), L(...shift(b.in, -0.1)), 0.2, 0.28, PAL.timberDark);
      beam(m, L(...shift(a.out, -0.1)), L(...shift(b.out, -0.1)), 0.16, 0.24, PAL.timberDark);
      solids.push({
        ax: (a.in[0] + a.out[0]) / 2,
        az: (a.in[2] + a.out[2]) / 2,
        bx: (b.in[0] + b.out[0]) / 2,
        bz: (b.in[2] + b.out[2]) / 2,
        r: PLATFORM_W / 2,
        topA: deck,
        topB: deck,
        bottom: deck - 3,
        step: 0.62,
        surface: BOARDS,
      });
    }
    // posts down to the ground
    for (const p of [b.in, b.out]) {
      const g = ground(p[0], p[2]);
      if (deck - g > 0.15) beam(m, L(p[0], deck - 0.15, p[2]), L(p[0], g - 0.25, p[2]), 0.18, 0.18, PAL.timber);
    }
    a = b;
  }
  // steps down at each end, if it stands high
  for (const end of [-1, 1]) {
    pointAt(line, st.s + end * PLATFORM, _q);
    const mid = across(_q, (e0 + e1) / 2, deck);
    stepsDown(m, solids, mid, [_q.dx * end, _q.dz * end], [_q.dz * side, -_q.dx * side], deck, ground, L);
  }

  // ── the station house ──
  pointAt(line, st.s, _q);
  const f = { x: _q.x, z: _q.z, dx: _q.dx, dz: _q.dz };
  house(m, solids, blockers, f, side, deck, ground, L);
  // a porch between the platform and its door
  const porch = [across(f, e1 - 0.1, deck), across(f, HOUSE[0] + 0.05, deck)];
  for (let w = -HOUSE[2] + 0.2; w < HOUSE[2] - 0.2; w += 0.6) {
    const at = (p) => [p[0] + f.dx * w, p[1], p[2] + f.dz * w];
    const bt = (p) => [p[0] + f.dx * (w + 0.55), p[1], p[2] + f.dz * (w + 0.55)];
    const c = vary(PAL.plank, w * 10, 2, 0.2);
    const [p0, p1] = porch;
    if (side > 0) quad(m, L(...at(p0)), L(...at(p1)), L(...bt(p1)), L(...bt(p0)), c);
    else quad(m, L(...at(p0)), L(...bt(p0)), L(...bt(p1)), L(...at(p1)), c);
  }
  {
    const [p0, p1] = porch;
    const mid = [(p0[0] + p1[0]) / 2, deck, (p0[2] + p1[2]) / 2];
    solids.push({ ax: mid[0] - f.dx * HOUSE[2], az: mid[2] - f.dz * HOUSE[2], bx: mid[0] + f.dx * HOUSE[2], bz: mid[2] + f.dz * HOUSE[2], r: 0.55, topA: deck, topB: deck, bottom: deck - 3, step: 0.62, surface: BOARDS });
  }

  // ── lamps and the name board ──
  for (const end of [-1, 1]) {
    pointAt(line, st.s + end * (PLATFORM - 1.2), _q);
    const at = across(_q, e1 - 0.3, deck);
    lamp(m, lamps, at, L);
    pointAt(line, st.s + end * (PLATFORM - 4.5), _q);
    nameBoard(m, across(_q, e1 - 0.35, deck), _q, L);
  }
  // a bench against the house
  {
    const at = across(f, HOUSE[0] - 0.45, deck);
    const yaw = Math.atan2(f.dx, f.dz);
    const [x, y, z] = L(at[0] + f.dx * 1.2, deck + 0.42, at[2] + f.dz * 1.2);
    box(m, x, y, z, 0.2, 0.03, 0.7, yaw, PAL.plank);
    box(m, x - f.dz * side * 0.17, y + 0.25, z + f.dx * side * 0.17, 0.03, 0.18, 0.7, yaw, PAL.plank);
    for (const e of [-0.6, 0.6]) box(m, x + f.dx * e, y - 0.22, z + f.dz * e, 0.18, 0.2, 0.03, yaw, PAL.iron);
  }

  // ── a water tower beyond the far end ──
  if (st.tower) {
    pointAt(line, st.s + PLATFORM + 3.2, _q);
    tower(m, solids, across(_q, 5.4, 0), _q, side, ground, L);
  }

  return { object: place(m, lamps, material, glow, ox, oy, oz), solids, blockers };
}

const shift = (p, dy) => [p[0], p[1] + dy, p[2]];

// Steps from the platform's end down to the ground, if it's high enough to
// need them: `out` is the way along the track away from the platform,
// `across` the way to its far side.
function stepsDown(m, solids, at, out, across, deck, ground, L) {
  const g = ground(at[0] + out[0] * 0.8, at[2] + out[1] * 0.8);
  const n = Math.round((deck - g) / STEP.rise);
  if (n < 1) return;
  for (let k = 1; k <= n; k++) {
    const top = deck - k * STEP.rise;
    const d = (k - 0.5) * STEP.run;
    const cx = at[0] + out[0] * d;
    const cz = at[2] + out[1] * d;
    const gy = ground(cx, cz);
    const yaw = Math.atan2(out[0], out[1]);
    const lo = Math.min(gy, top) - 0.2;
    const [x, , z] = L(cx, 0, cz);
    const ly = L(0, (top + lo) / 2, 0)[1];
    box(m, x, ly, z, 0.8, (top - lo) / 2, STEP.run / 2, yaw, vary(PAL.plank, k, 9, 0.2));
    solids.push({ ax: cx - across[0] * 0.7, az: cz - across[1] * 0.7, bx: cx + across[0] * 0.7, bz: cz + across[1] * 0.7, r: STEP.run / 2, topA: top, topB: top, bottom: lo, step: STEP.rise + 0.08, surface: BOARDS });
  }
}

// The station house: board walls painted the railway's red, cream at the
// corners and round the door and windows, a door and two windows to the
// platform, a gable roof along the track with its eaves well out over the
// door, a stovepipe, and stone piers under it.
function house(m, solids, blockers, f, side, deck, ground, L) {
  const yaw = Math.atan2(f.dx, f.dz);
  const mid = (HOUSE[0] + HOUSE[1]) / 2;
  const hw = (HOUSE[1] - HOUSE[0]) / 2; // half its depth, away from the track
  const hl = HOUSE[2]; // half its length, along it
  const wall = 2.55;
  const nx = f.dz * side;
  const nz = -f.dx * side;
  const cx = f.x + nx * mid;
  const cz = f.z + nz * mid;
  const at = (a, e) => [cx + nx * a + f.dx * e, cz + nz * a + f.dz * e]; // a: out from the track, e: along it
  const P = (a, y, e) => {
    const [x, z] = at(a, e);
    return L(x, y, z);
  };
  // piers
  for (const a of [-hw + 0.2, hw - 0.2]) {
    for (const e of [-hl + 0.2, 0, hl - 0.2]) {
      const [x, z] = at(a, e);
      const g = ground(x, z);
      if (deck - g > 0.05) beam(m, L(x, deck - 0.05, z), L(x, g - 0.3, z), 0.4, 0.4, vary(PAL.stone, a * 7, e * 7, 0.2));
    }
  }
  // floor and walls
  const [x0, y0, z0] = P(0, deck + wall / 2, 0);
  box(m, x0, y0, z0, hw, wall / 2, hl, yaw, PAL.paint);
  // battens: thin cream lines up the walls
  for (let e = -hl + 0.45; e < hl; e += 0.6) {
    for (const a of [-hw - 0.012, hw + 0.012]) {
      const [x, y, z] = P(a, deck + wall / 2, e);
      box(m, x, y, z, 0.012, wall / 2, 0.03, yaw, _c.copy(PAL.paint).multiplyScalar(0.8));
    }
  }
  // corner boards
  for (const a of [-hw, hw]) {
    for (const e of [-hl, hl]) {
      const [x, y, z] = P(a, deck + wall / 2, e);
      box(m, x, y, z, 0.07, wall / 2, 0.07, yaw, PAL.trim);
    }
  }
  // the door and two windows, to the track
  const front = -hw - 0.03;
  {
    const [x, y, z] = P(front, deck + 1.05, 0);
    box(m, x, y, z, 0.04, 1.05, 0.48, yaw, PAL.door);
    const [tx, ty, tz] = P(front - 0.01, deck + 2.16, 0);
    box(m, tx, ty, tz, 0.04, 0.06, 0.58, yaw, PAL.trim);
  }
  for (const e of [-1.45, 1.45]) {
    const [x, y, z] = P(front, deck + 1.45, e);
    box(m, x, y, z, 0.04, 0.5, 0.4, yaw, PAL.trim);
    const [gx, gy, gz] = P(front - 0.01, deck + 1.45, e);
    box(m, gx, gy, gz, 0.04, 0.42, 0.32, yaw, PAL.glass);
  }
  // a window at the back too
  {
    const [x, y, z] = P(hw + 0.03, deck + 1.45, 0);
    box(m, x, y, z, 0.04, 0.42, 0.36, yaw, PAL.glass);
  }
  // the roof: a gable along the track, eaves out over the platform
  const ridge = deck + wall + 1.35;
  const eave = deck + wall - 0.05;
  const over = 1.15; // out over the door
  const back = 0.45;
  const ends = 0.4;
  const roofCol = (k) => vary(PAL.roof, k, 3, 0.12);
  quad(m, P(-hw - over, eave, -hl - ends), P(-hw - over, eave, hl + ends), P(0, ridge, hl + ends), P(0, ridge, -hl - ends), roofCol(1));
  quad(m, P(hw + back, eave + 0.1, hl + ends), P(hw + back, eave + 0.1, -hl - ends), P(0, ridge, -hl - ends), P(0, ridge, hl + ends), roofCol(2));
  // gable ends
  for (const e of [-hl, hl]) {
    const a = P(-hw, deck + wall, e);
    const b = P(hw, deck + wall, e);
    const c = P(0, ridge - 0.05, e);
    m.tris([new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c)], () => PAL.paint);
  }
  // brackets under the eaves on the platform side
  for (const e of [-hl + 0.3, hl - 0.3]) beam(m, P(-hw, deck + wall - 0.9, e), P(-hw - over + 0.15, eave - 0.05, e), 0.1, 0.12, PAL.trim);
  // a stovepipe
  {
    const [x, y, z] = P(hw * 0.4, ridge + 0.1, hl * 0.5);
    box(m, x, y, z, 0.09, 0.55, 0.09, yaw, PAL.iron);
  }
  // solid: walls you bump into
  const corners = [at(-hw, -hl), at(-hw, hl), at(hw, hl), at(hw, -hl)];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 4];
    solids.push({ ax, az, bx, bz, r: 0.12, topA: deck + wall, topB: deck + wall, bottom: deck - 0.5 });
  }
  blockers.push({ x: cx, y: deck + (wall + 1.35) / 2, z: cz, half: [hw + 0.2, (wall + 1.35) / 2 + 0.1, hl + 0.3], yaw });
}

// A lamp post: an iron post and a lantern with a warm glass (in `lamps`, so
// it can glow).
function lamp(m, lamps, at, L) {
  const [x, y, z] = L(at[0], at[1], at[2]);
  box(m, x, y + 1.3, z, 0.05, 1.3, 0.05, 0, PAL.iron);
  box(m, x, y + 2.62, z, 0.15, 0.03, 0.15, 0, PAL.iron);
  box(m, x, y + 2.92, z, 0.13, 0.03, 0.13, 0, PAL.iron);
  box(lamps, x, y + 2.77, z, 0.1, 0.13, 0.1, 0, lin(0xffd58a));
}

// The board with the station's name on it, on two posts, facing the track.
function nameBoard(m, at, q, L) {
  const yaw = Math.atan2(q.dx, q.dz);
  const [x, y, z] = L(at[0], at[1], at[2]);
  for (const e of [-0.75, 0.75]) box(m, x + q.dx * e, y + 0.9, z + q.dz * e, 0.05, 0.9, 0.05, yaw, PAL.timberDark);
  box(m, x, y + 1.62, z, 0.04, 0.24, 0.95, yaw, PAL.iron);
  box(m, x, y + 1.62, z, 0.06, 0.19, 0.88, yaw, PAL.board);
  // a dark band, where the name is painted
  box(m, x, y + 1.62, z, 0.065, 0.05, 0.7, yaw, PAL.iron);
}

// A water tower: a round wooden tank on a frame of four posts, and a spout
// swung up out of the way of the trains.
function tower(m, solids, at, q, side, ground, L) {
  const g = ground(at[0], at[2]);
  const legs = 1.25;
  const frameTop = g + 4.4;
  const corners = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = at[0] + (q.dz * a + q.dx * b) * legs;
    const z = at[2] + (-q.dx * a + q.dz * b) * legs;
    const gy = ground(x, z);
    corners.push([x, z, gy]);
    beam(m, L(x, frameTop, z), L(x + (q.dz * a + q.dx * b) * 0.35, gy - 0.3, z + (-q.dx * a + q.dz * b) * 0.35), 0.24, 0.24, PAL.timber);
  }
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 4];
    beam(m, L(ax, frameTop - 0.1, az), L(bx, frameTop - 0.1, bz), 0.22, 0.22, PAL.timberDark);
    beam(m, L(ax, g + 1.6, az), L(bx, g + 1.6, bz), 0.1, 0.16, PAL.timberDark);
  }
  // the tank: staves, and iron hoops round it
  const R = 1.55;
  const H = 2.3;
  const tank = new THREE.CylinderGeometry(R, R * 1.04, H, 14, 1);
  const [tx, ty, tz] = L(at[0], frameTop + H / 2, at[2]);
  m.add(tank, new THREE.Matrix4().makeTranslation(tx, ty, tz), (p, n, out) => out.copy(PAL.plank).multiplyScalar(0.75 + 0.25 * phash(Math.round(Math.atan2(p.z, p.x) * 3), 1, 2)));
  for (const y of [0.35, 1.15, 1.95]) {
    const hoop = new THREE.CylinderGeometry(R * 1.03, R * 1.03, 0.07, 14, 1, true);
    m.add(hoop, new THREE.Matrix4().makeTranslation(tx, L(0, frameTop + y, 0)[1], tz), (p, n, out) => out.copy(PAL.iron));
  }
  const lid = new THREE.ConeGeometry(R * 1.1, 0.8, 14, 1);
  m.add(lid, new THREE.Matrix4().makeTranslation(tx, L(0, frameTop + H + 0.4, 0)[1], tz), (p, n, out) => out.copy(PAL.roof));
  // the spout, hinged up against the tank on the track side
  const sx = at[0] - q.dz * side * R * 0.9;
  const sz = at[2] + q.dx * side * R * 0.9;
  beam(m, L(sx, frameTop + 0.5, sz), L(sx - q.dz * side * 0.4, frameTop + 2.6, sz + q.dx * side * 0.4), 0.24, 0.24, PAL.iron);
  for (const [x, z] of corners) solids.push({ ax: x, az: z, bx: x, bz: z, r: 0.25, topA: frameTop, topB: frameTop, bottom: g - 1 });
}
