// What a road looks like where it runs, made in code like everything else:
// vertex-coloured strips merged into one mesh for each piece of road, and
// one for each town's gate.
//
// The road lies on the land as it is (see roads.js). Its top is level across:
// tarmac between its edges (HALF either side of the middle), with a dashed
// yellow line down the middle and a white one along each edge, and a gravel
// shoulder beyond; or, to a town nobody keeps up, all gravel, with two worn
// ruts. Where it stands over the ground it's on a bank, its sides sloping
// down to the ground and grassed over toward the foot; where it's higher than
// BRIDGE_FROM, on a bridge: a deck on piers, with a railing each side
// (concrete for a paved road, timber for a gravel one), its banks ending in a
// wall at each end. At a level crossing there's a crossbuck each side of the
// railway.
//
// At a town's gate the roads meet on a round of tarmac (or gravel), and a
// stretch of road runs from it to the end of the town's street.
//
//   buildPiece(road, p, ground, material) -> { object, solids }
//   buildGate(gate, paved, ground, material) -> { object, solids }
//   ground(x, z) -> height of the ground in the world (with what's been dug)

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF } from '../build/surfaces.js';
import { phash } from '../noise.js';
import { HALF, WIDE, BRIDGE_FROM, pointAt } from './roads.js';

export const PIECE = 96; // m of road stood up and taken down together
const BANK_SLOPE = 1.6; // a bank's side runs this far out for each metre down
const TOE_MAX = 10; // m out from the edge a bank's side reaches at most
const LINE = { w: 0.12, up: 0.012, dash: 3, gap: 6, edge: 0.2 }; // paint: width, how far over the road, the centre line's dashes and gaps, and the edge lines' distance in from the tarmac's edge (m)
const RUT = [0.55, 1.55]; // m from the middle of a gravel road to the inside and outside of each rut
const DECK = 0.7; // m from the top of a bridge's deck to its underside
const PIER = { every: 12, w: 0.9, thick: 0.7 }; // a bridge's piers: how far apart, how wide across the road (m, besides the deck's width), how thick along it
const RAIL = { h: 1.0, post: 0.14, every: 2.4 }; // its railings
const SIGN = { h: 2.6, arm: 1.25, w: 0.22, off: WIDE + 0.8, out: 5 }; // a crossbuck: how high, its boards, where it stands (m off the middle, and back from the rail)
const JUNCTION = WIDE + 1.6; // m across the round where roads meet, from its middle
// What you hear underfoot.
export const UNDERFOOT = { paved: 'tarmac', gravel: 'gravel', timber: 'boards' };

const lin = (hex) => new THREE.Color(hex);
export const PAL = {
  tarmac: lin(0x3c3d3e),
  tarmacWorn: lin(0x55565a),
  shoulder: lin(0x6f6858),
  gravel: lin(0x7d705a),
  rut: lin(0x5f5444),
  earth: lin(0x5f5038),
  grass: lin(0x7c9440),
  yellow: lin(0xd8a62a),
  white: lin(0xe4e2da),
  concrete: lin(0x9c9a94),
  concreteDark: lin(0x7a7872),
  timber: lin(0x6d5c49),
  timberDark: lin(0x4a3d31),
  sign: lin(0xeeeeea),
  signEdge: lin(0x2a2a2a),
  post: lin(0xd8d8d2),
};

const _c = new THREE.Color();
const _base = new THREE.Color();
const _shade = new THREE.Color();
const _p = { x: 0, y: 0, z: 0, dx: 0, dz: 0, grade: 0 };

// ── Writing geometry ─────────────────────────────────────────────────────────

function vert(m, x, y, z, nx, ny, nz, c) {
  m.pos.push(x, y, z);
  m.nor.push(nx, ny, nz);
  m.col.push(c.r, c.g, c.b);
  m.kind.push(SURF.plain);
  m.uv.push(0, 0);
  return m.n++;
}

// A flat four-sided face, its corners [x, y, z] in order round it as seen
// from the side it faces; color is one THREE.Color, or one for each corner.
function quad(m, a, b, c, d, color) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = d[0] - a[0];
  const vy = d[1] - a[1];
  const vz = d[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  const [ca, cb, cc, cd] = Array.isArray(color) ? color : [color, color, color, color];
  const i = vert(m, a[0], a[1], a[2], nx, ny, nz, ca);
  vert(m, b[0], b[1], b[2], nx, ny, nz, cb);
  vert(m, c[0], c[1], c[2], nx, ny, nz, cc);
  vert(m, d[0], d[1], d[2], nx, ny, nz, cd);
  m.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

// A box from its eight corners: c[0..3] the bottom, c[4..7] the top, each
// going round the same way.
function box8(m, c, color) {
  _base.copy(color);
  const s = (k) => _shade.copy(_base).multiplyScalar(k).clone();
  quad(m, c[4], c[5], c[6], c[7], s(1.06));
  quad(m, c[3], c[2], c[1], c[0], s(0.7));
  for (let k = 0; k < 4; k++) {
    const a = k;
    const b = (k + 1) % 4;
    quad(m, c[a], c[b], c[b + 4], c[a + 4], s(k % 2 ? 0.88 : 0.96));
  }
}

// A box turned to `yaw` about its middle (cx, cy, cz): hx across, hy up and
// hz along (half sizes).
function box(m, cx, cy, cz, hx, hy, hz, yaw, color) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (a, b, e) => [cx + a * hx * c + e * hz * s, cy + b * hy, cz - a * hx * s + e * hz * c];
  box8(m, [at(-1, -1, -1), at(1, -1, -1), at(1, -1, 1), at(-1, -1, 1), at(-1, 1, -1), at(1, 1, -1), at(1, 1, 1), at(-1, 1, 1)], color);
}

// A colour a little different from the next, the same every time.
const vary = (color, a, b, spread = 0.16) => _c.copy(color).multiplyScalar(1 - spread / 2 + phash(a, b, 11) * spread).clone();

// The meshes made, as one object standing at (ox, oy, oz).
function place(m, material, ox, oy, oz) {
  const object = new THREE.Group();
  object.position.set(ox, oy, oz);
  const mesh = new THREE.Mesh(m.build({ x: ox, y: oy, z: oz }), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  object.add(mesh);
  object.updateMatrixWorld(true);
  return object;
}

// ── A piece of road ──────────────────────────────────────────────────────────

export function pieceRange(road, p) {
  const per = Math.round(PIECE / road.ds);
  const i0 = p * per;
  return [i0, Math.min(road.n - 1, i0 + per)];
}

export const pieceCount = (road) => Math.ceil((road.n - 1) / Math.round(PIECE / road.ds));

// How far out (m) from its middle the road takes up the ground at sample i,
// to one side (1: the right, looking along it; -1: the left) or the wider of
// the two: out to the foot of its bank, or the edge of a bridge. With
// `bare`, only where no grass grows: the road and its shoulders.
export function footprint(road, i, bare = false, side = 0) {
  if (bare || road.h[i] - road.g[i] > BRIDGE_FROM) return WIDE + 0.3;
  const g = side > 0 ? road.gr[i] : side < 0 ? road.gl[i] : Math.min(road.gl[i], road.gr[i]);
  return WIDE + Math.min(TOE_MAX, Math.max(0.1, road.h[i] - g) * BANK_SLOPE);
}

// Sample i: where it is, which way the road runs, and its right.
function sample(road, i) {
  const a = Math.max(0, i - 1);
  const b = Math.min(road.n - 1, i + 1);
  let tx = road.x[b] - road.x[a];
  let tz = road.z[b] - road.z[a];
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  // looking along (tx, tz), the right hand is (-tz, tx)
  return { i, x: road.x[i], z: road.z[i], h: road.h[i], up: road.h[i] - road.g[i], tx, tz, rx: -tz, rz: tx };
}

// A cross-section of the road at a sample: the top, level across it, at
// each offset in `offs` (m right of the middle), and the toe of the bank
// each side on the ground.
function section(s, offs, ground) {
  const at = (off, y) => [s.x + s.rx * off, y, s.z + s.rz * off];
  const toe = (side) => {
    let out = WIDE + 0.3;
    let g = s.h;
    for (let k = 0; k < 4; k++) {
      g = ground(s.x + s.rx * side * out, s.z + s.rz * side * out);
      out = WIDE + Math.min(TOE_MAX, Math.max(0.1, s.h - g) * BANK_SLOPE);
    }
    g = ground(s.x + s.rx * side * out, s.z + s.rz * side * out);
    return at(side * out, Math.min(g, s.h) - 0.25);
  };
  return { top: offs.map((o) => at(o, s.h)), lt: toe(-1), rt: toe(1) };
}

const PAVED_OFFS = [-WIDE, -HALF, 0, HALF, WIDE];
const GRAVEL_OFFS = [-WIDE, -RUT[1], -RUT[0], RUT[0], RUT[1], WIDE];

export function buildPiece(road, p, ground, material) {
  const [i0, i1] = pieceRange(road, p);
  const paved = road.surface === 'paved';
  const offs = paved ? PAVED_OFFS : GRAVEL_OFFS;
  const m = new Mesher();
  const solids = [];
  const ox = road.x[i0];
  const oy = road.h[i0];
  const oz = road.z[i0];
  const raised = (s) => s.up > BRIDGE_FROM;
  // the colour of each strip across the top
  const strips = (k) =>
    paved
      ? [PAL.shoulder, vary(PAL.tarmac, k, 1, 0.12), vary(PAL.tarmac, k, 2, 0.12), PAL.shoulder]
      : [PAL.shoulder, vary(PAL.gravel, k, 1), vary(PAL.rut, k, 2), vary(PAL.gravel, k, 3), vary(PAL.rut, k, 4), PAL.shoulder];
  const deckColor = paved ? PAL.concrete : PAL.timber;

  let prev = sample(road, i0);
  let ps = section(prev, offs, ground);
  for (let i = i0 + 1; i <= i1; i++) {
    const cur = sample(road, i);
    const cs = section(cur, offs, ground);
    const bridge = raised(prev) || raised(cur);
    // the top
    const cols = strips(prev.i);
    for (let k = 0; k < offs.length - 1; k++) quad(m, cs.top[k], ps.top[k], ps.top[k + 1], cs.top[k + 1], cols[k]);
    if (!bridge) {
      // the bank's sides, gravel at the top and grassed toward the foot
      const foot = (k) => vary(PAL.grass, prev.i, k, 0.25).lerp(PAL.earth, 0.15);
      const lip = _c.copy(PAL.shoulder).lerp(PAL.earth, 0.3).clone();
      quad(m, ps.lt, cs.lt, cs.top[0], ps.top[0], [foot(5), foot(6), lip, lip]);
      const last = offs.length - 1;
      quad(m, ps.top[last], cs.top[last], cs.rt, ps.rt, [lip, lip, foot(7), foot(8)]);
    } else {
      // the deck's underside and its edges
      const down = (q) => [q[0], q[1] - DECK, q[2]];
      const last = offs.length - 1;
      quad(m, down(ps.top[0]), down(cs.top[0]), down(cs.top[last]), down(ps.top[last]), _c.copy(deckColor).multiplyScalar(0.6).clone());
      quad(m, down(cs.top[0]), down(ps.top[0]), ps.top[0], cs.top[0], _c.copy(deckColor).multiplyScalar(0.85).clone());
      quad(m, down(ps.top[last]), down(cs.top[last]), cs.top[last], ps.top[last], _c.copy(deckColor).multiplyScalar(0.85).clone());
      // a wall where the bank ends against the bridge
      if (raised(prev) !== raised(cur)) abutment(m, raised(prev) ? cur : prev, ground, deckColor);
    }
    // walk along it, and up onto a low bank
    const lowest = Math.min(prev.up, cur.up);
    solids.push({
      ax: prev.x,
      az: prev.z,
      bx: cur.x,
      bz: cur.z,
      r: WIDE + 0.1,
      topA: prev.h,
      topB: cur.h,
      bottom: bridge ? Math.min(prev.h, cur.h) - DECK - 0.3 : Math.min(prev.h - prev.up, cur.h - cur.up) - 1,
      step: bridge ? undefined : Math.min(Math.max(lowest, 0) + 0.12, 1.1),
      surface: bridge && !paved ? UNDERFOOT.timber : UNDERFOOT[road.surface],
    });
    prev = cur;
    ps = cs;
  }

  const s0 = i0 * road.ds;
  const s1 = i1 * road.ds;
  // ── the paint ──
  if (paved) {
    for (let s = Math.ceil(s0 / (LINE.dash + LINE.gap)) * (LINE.dash + LINE.gap); s < s1; s += LINE.dash + LINE.gap) along(m, road, s, Math.min(s + LINE.dash, s1), 0, LINE.w, PAL.yellow);
    for (const side of [-1, 1]) along(m, road, s0, s1, side * (HALF - LINE.edge), LINE.w, PAL.white);
  }
  // ── bridges: piers and railings ──
  for (let s = Math.ceil(s0 / PIER.every) * PIER.every; s < s1; s += PIER.every) {
    const i = Math.round(s / road.ds);
    if (!raised(sample(road, i))) continue;
    pier(m, road, s, ground, deckColor);
  }
  for (let s = Math.ceil(s0 / RAIL.every) * RAIL.every; s <= s1; s += RAIL.every) {
    const i = Math.min(road.n - 1, Math.round(s / road.ds));
    if (!raised(sample(road, i))) continue;
    pointAt(road, s, _p);
    for (const side of [-1, 1]) {
      const x = _p.x - _p.dz * side * (WIDE - 0.15);
      const z = _p.z + _p.dx * side * (WIDE - 0.15);
      box(m, x, _p.y + RAIL.h / 2, z, RAIL.post / 2, RAIL.h / 2, RAIL.post / 2, Math.atan2(_p.dx, _p.dz), deckColor);
    }
  }
  let run = null;
  for (let i = i0; i <= i1; i++) {
    const on = raised(sample(road, i));
    if (on && run === null) run = i;
    if ((!on || i === i1) && run !== null) {
      const end = on ? i : i - 1;
      if (end > run) for (const side of [-1, 1]) along(m, road, run * road.ds, end * road.ds, side * (WIDE - 0.15), 0.12, deckColor, RAIL.h, 0.12);
      run = null;
    }
  }
  // ── crossbucks at a level crossing ──
  for (let i = Math.max(1, i0); i <= i1; i++) {
    const was = road.cross[i - 1];
    const is = road.cross[i];
    if (was === is) continue;
    // either side of the run of crossing samples, back from the rail, on the right of the way you come
    const s = is ? (i - 1) * road.ds - SIGN.out : i * road.ds + SIGN.out;
    if (s < 0 || s > road.length) continue;
    crossbuck(m, road, s, is ? 1 : -1, ground);
  }

  return { object: place(m, material, ox, oy, oz), solids };
}

// A strip along the road from s0 to s1, `off` m right of the middle, w wide,
// on its top (up: how far over it its middle is, thick: how deep, for a
// rail; 0 for paint laid on it).
function along(m, road, s0, s1, off, w, color, up = 0, thick = 0) {
  const step = 2;
  const steps = Math.max(1, Math.ceil((s1 - s0) / step));
  let a = null;
  for (let e = 0; e <= steps; e++) {
    const s = s0 + ((s1 - s0) * e) / steps;
    pointAt(road, s, _p);
    const rx = -_p.dz;
    const rz = _p.dx;
    const cx = _p.x + rx * off;
    const cz = _p.z + rz * off;
    const y = _p.y + (up || LINE.up);
    const b = {
      l: [cx - rx * w * 0.5, y, cz - rz * w * 0.5],
      r: [cx + rx * w * 0.5, y, cz + rz * w * 0.5],
    };
    if (a) {
      if (!thick) quad(m, b.l, a.l, a.r, b.r, color);
      else {
        const d = (q) => [q[0], q[1] - thick, q[2]];
        quad(m, b.l, a.l, a.r, b.r, _c.copy(color).multiplyScalar(1.05).clone());
        quad(m, d(a.l), d(b.l), d(b.r), d(a.r), _c.copy(color).multiplyScalar(0.6).clone());
        quad(m, a.l, b.l, d(b.l), d(a.l), _c.copy(color).multiplyScalar(0.9).clone());
        quad(m, b.r, a.r, d(a.r), d(b.r), _c.copy(color).multiplyScalar(0.9).clone());
      }
    }
    a = b;
  }
}

// A pier under a bridge at s: from the ground up to the deck's underside.
function pier(m, road, s, ground, color) {
  pointAt(road, s, _p);
  const yaw = Math.atan2(_p.dx, _p.dz);
  const top = _p.y - DECK;
  const g = Math.min(ground(_p.x, _p.z), ground(_p.x - _p.dz * WIDE * 0.6, _p.z + _p.dx * WIDE * 0.6), ground(_p.x + _p.dz * WIDE * 0.6, _p.z - _p.dx * WIDE * 0.6)) - 0.4;
  if (top - g < 0.3) return;
  box(m, _p.x, (top + g) / 2, _p.z, WIDE - PIER.w, (top - g) / 2, PIER.thick / 2, yaw, _c.copy(color).multiplyScalar(0.92).clone());
}

// The wall at the end of a bank, where it meets a bridge (s: the last sample
// on the bank).
function abutment(m, s, ground, color) {
  const g = Math.min(ground(s.x + s.rx * WIDE, s.z + s.rz * WIDE), ground(s.x - s.rx * WIDE, s.z - s.rz * WIDE), ground(s.x, s.z)) - 0.5;
  const top = s.h - 0.05;
  box(m, s.x, (top + g) / 2, s.z, WIDE + 0.4, (top - g) / 2, 0.5, Math.atan2(s.tx, s.tz), _c.copy(color).multiplyScalar(0.85).clone());
}

// A crossbuck beside the road at s, on its right (dir 1) or its left (-1)
// as you come toward the railway, facing you.
function crossbuck(m, road, s, dir, ground) {
  pointAt(road, s, _p);
  const side = dir;
  const x = _p.x - _p.dz * side * SIGN.off;
  const z = _p.z + _p.dx * side * SIGN.off;
  const g = ground(x, z);
  const yaw = Math.atan2(_p.dx, _p.dz);
  box(m, x, g + SIGN.h / 2 - 0.3, z, 0.06, SIGN.h / 2 + 0.3, 0.06, yaw, PAL.post);
  // the two boards, crossed, facing along the road
  const c = Math.cos(yaw);
  const n = Math.sin(yaw);
  const cy = g + SIGN.h - 0.35;
  for (const tilt of [Math.PI / 4, -Math.PI / 4]) {
    const ax = Math.cos(tilt) * SIGN.arm;
    const ay = Math.sin(tilt) * SIGN.arm;
    const across = (u, v, f) => [x + u * c + f * n * 0.04 * dir, cy + v, z - u * n + f * c * 0.04 * dir];
    const hw = SIGN.w / 2;
    const nx = -Math.sin(tilt) * hw;
    const ny = Math.cos(tilt) * hw;
    const face = (f) => [across(-ax - nx, -ay - ny, f), across(ax - nx, ay - ny, f), across(ax + nx, ay + ny, f), across(-ax + nx, -ay + ny, f)];
    const [a, b, cc, d] = face(-1);
    quad(m, a, b, cc, d, PAL.sign);
    quad(m, d, cc, b, a, PAL.sign);
    const [e, f, gg, h] = face(1);
    quad(m, h, gg, f, e, PAL.signEdge);
    quad(m, e, f, gg, h, PAL.signEdge);
  }
}

// ── A town's gate ────────────────────────────────────────────────────────────
// The round where its roads meet, and the stretch from it to the end of the
// street. gate: roads.js gateOf.
export function buildGate(gate, paved, ground, material) {
  const m = new Mesher();
  const solids = [];
  const { approach, ax, az } = gate;
  const ox = gate.x;
  const oy = gate.h;
  const oz = gate.z;
  const rx = -az;
  const rz = ax;
  const offs = paved ? PAVED_OFFS : GRAVEL_OFFS;
  // the stretch from the street to the gate, as a little road of its own
  const road = { n: approach.n, ds: approach.ds, h: approach.h, x: new Float64Array(approach.n), z: new Float64Array(approach.n), g: new Float64Array(approach.n), length: (approach.n - 1) * approach.ds };
  for (let i = 0; i < approach.n; i++) {
    road.x[i] = gate.ex + ax * approach.ds * i;
    road.z[i] = gate.ez + az * approach.ds * i;
    road.g[i] = ground(road.x[i], road.z[i]);
  }
  let ps = null;
  let prev = null;
  for (let i = 0; i < road.n; i++) {
    const cur = { i, x: road.x[i], z: road.z[i], h: road.h[i], up: road.h[i] - road.g[i], tx: ax, tz: az, rx, rz };
    const cs = section(cur, offs, ground);
    if (ps) {
      const cols = paved ? [PAL.shoulder, PAL.tarmac, PAL.tarmac, PAL.shoulder] : [PAL.shoulder, PAL.gravel, PAL.rut, PAL.gravel, PAL.rut, PAL.shoulder];
      for (let k = 0; k < offs.length - 1; k++) quad(m, cs.top[k], ps.top[k], ps.top[k + 1], cs.top[k + 1], cols[k]);
      const foot = _c.copy(PAL.grass).lerp(PAL.earth, 0.2).clone();
      const lip = _c.copy(PAL.shoulder).lerp(PAL.earth, 0.3).clone();
      quad(m, ps.lt, cs.lt, cs.top[0], ps.top[0], [foot, foot, lip, lip]);
      const last = offs.length - 1;
      quad(m, ps.top[last], cs.top[last], cs.rt, ps.rt, [lip, lip, foot, foot]);
      solids.push({ ax: prev.x, az: prev.z, bx: cur.x, bz: cur.z, r: WIDE + 0.1, topA: prev.h, topB: cur.h, bottom: Math.min(prev.h - prev.up, cur.h - cur.up) - 1, step: Math.min(Math.max(Math.min(prev.up, cur.up), 0) + 0.12, 1.1), surface: UNDERFOOT[paved ? 'paved' : 'gravel'] });
    }
    ps = cs;
    prev = cur;
  }
  if (paved) for (const side of [-1, 1]) along(m, road, 0, road.length - JUNCTION, side * (HALF - LINE.edge), LINE.w, PAL.white);
  // the round, a little over the roads that meet on it, with its rim sloping down to the ground
  const N = 24;
  const top = gate.h + 0.02;
  const ring = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const x = gate.x + Math.cos(a) * JUNCTION;
    const z = gate.z + Math.sin(a) * JUNCTION;
    const g = ground(x, z);
    const out = Math.min(TOE_MAX, Math.max(0.1, top - g) * BANK_SLOPE);
    ring.push({ x, z, a, g, out });
  }
  const color = paved ? PAL.tarmac : PAL.gravel;
  for (let k = 0; k < N; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % N];
    m.tris([new THREE.Vector3(gate.x, top, gate.z), new THREE.Vector3(b.x, top, b.z), new THREE.Vector3(a.x, top, a.z)], (p, nrm, out) => out.copy(color));
    const toe = (q) => [q.x + Math.cos(q.a) * q.out, Math.min(q.g, top) - 0.25, q.z + Math.sin(q.a) * q.out];
    const foot = _c.copy(PAL.grass).lerp(PAL.earth, 0.2).clone();
    quad(m, [a.x, top, a.z], [b.x, top, b.z], toe(b), toe(a), [PAL.shoulder, PAL.shoulder, foot, foot]);
  }
  solids.push({ ax: gate.x, az: gate.z, bx: gate.x + 0.01, bz: gate.z, r: JUNCTION, topA: top, topB: top, bottom: top - 2, step: 1.1, surface: UNDERFOOT[paved ? 'paved' : 'gravel'] });
  return { object: place(m, material, ox, oy, oz), solids };
}
