// What the Metro's track looks like where it runs, a piece at a time: made in
// code like everything else, vertex-coloured faces merged into a mesh or two
// for each PIECE metres of a track.
//
// Under the street, each track is in a tube of its own: a flat floor, walls,
// a rounded roof, and the rails on a concrete plinth. Along its outer wall
// (the side with no other track) runs the safety walk, at about the cars'
// floor, with a lamp over it every so often and, every 240 m, a blue light:
// where a phone and the switch for the third rail are. Along the other wall
// run the cables, on their brackets. The tube's faces look only inwards, so
// from inside one you see its walls, and where two run side by side (or
// cross) their walls, seen from behind, aren't drawn at all: the tunnels
// open into each other rather than showing each other's backs.
//
// Over the street, on a viaduct: a concrete box girder under each track, a
// parapet along its outer side, and a pier under it every SPAN metres, down
// to the ground. On the ground: a bank of ballast, sloping down to the ground
// either side, and concrete ties across it.
//
// Everywhere, two running rails a standard gauge apart, and the third rail
// beside them under its cover board.
//
//   buildPiece(track, s0, s1, { ground, outside, station, mats }) -> { over, under }
//     over: a Mesh of what's above the ground (null if none); under: a Group
//     of what's in the tunnels (null if none). Each built round itself and
//     put in the world (render/origin.js).
//   ground(x, z)       the height of the ground
//   outside(x, z, dx, dz) -> -1 | 1 | 0: which side of a track (x, z) going
//                      (dx, dz) has no other track beside it (for parapets)
//   station(x, z, y)   whether (x, z) is in a station's vault, for a rail at
//                      y (where the track has no tube of its own: the vault's
//                      round it)

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF } from '../build/surfaces.js';
import { quad, box } from '../build/faces.js';
import { TUNNEL, BRIDGE, TUBE } from './network.js';

export const PIECE = 120; // m of a track built and shown together
export const GAUGE = 1.435; // m between the rails
const RAIL = { w: 0.075, h: 0.16 };
const THIRD = { c: 1.32, w: 0.09, h: 0.12, cover: 0.32 }; // m across from the middle; its cover board
const TIE = { half: 1.3, h: 0.17, w: 0.26, every: 0.76 };
const BALLAST = { top: 1.65, slope: 1.6, under: 0.32 }; // half its top, m out per m down, rail over it
const PLINTH = { half: 1.0, h: 0.28 }; // the rails' bed in a tunnel
const DECK = { half: 2.25, depth: 1.7, under: 0.34 }; // a viaduct's girder; its top under the rail
const PARAPET = { h: 1.05, w: 0.22 };
const SPAN = 32; // m between piers
const PIER = { w: 1.3, head: 2.7, cap: 1.1 };
const LAMP_EVERY = 24; // m between lamps in a tunnel
const BLUE_EVERY = 240; // m between blue lights
const WALK = { wide: 0.55, up: 0.95, rail: 1.9 }; // the safety walk: m wide, its top over the rail, its handrail's
const CABLES = [1.25, 1.42, 1.59, 2.05]; // m over the rail, the cables along the wall
const BRACKET_EVERY = 1.5; // m between the brackets they're on
// a tube's cross-section: [m across, m over the rail], round its inside,
// from the floor at one wall over the roof to the other
const PROFILE = (() => {
  const H = TUBE.half;
  const wall = TUBE.top - H * 0.9;
  const out = [[-H, -0.35], [-H, wall]];
  for (let k = 1; k < 8; k++) {
    const a = Math.PI - (k / 8) * Math.PI;
    out.push([Math.cos(a) * H, wall + Math.sin(a) * H * 0.9]);
  }
  out.push([H, wall], [H, -0.35], [-H, -0.35]);
  return out;
})();

const lin = (hex) => new THREE.Color(hex);
export const PAL = {
  concrete: lin(0x8f8a80),
  concreteDark: lin(0x6f6b64),
  tube: lin(0x77736b),
  tubeFloor: lin(0x3d3b37),
  ballast: lin(0x6f6a62),
  ballastDark: lin(0x55514b),
  tie: lin(0x8a867d),
  rail: lin(0x4a3a30),
  railTop: lin(0xb4b0aa),
  cover: lin(0xd9c58a),
  lamp: lin(0xffe2b0),
  blue: lin(0x2f6bff),
  cable: lin(0x1c1c1c),
  bracket: lin(0x5a5c5e),
  walk: lin(0x7c7871),
  pier: lin(0x9a958b),
};

const _a = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
const _c = new THREE.Color();

// The frames of a track between s0 and s1: at each of its points in that
// stretch (and at the ends), where it is, the way it runs (averaged with the
// stretch before, so pieces meet), and the kind of the stretch after it.
function framesOf(t, s0, s1) {
  const out = [];
  const at = (s) => {
    let i = 0;
    while (i + 2 < t.n && t.s[i + 1] <= s) i++;
    const len = t.s[i + 1] - t.s[i] || 1;
    const k = Math.max(0, Math.min(1, (s - t.s[i]) / len));
    return { x: t.x[i] + (t.x[i + 1] - t.x[i]) * k, y: t.y[i] + (t.y[i + 1] - t.y[i]) * k, z: t.z[i] + (t.z[i + 1] - t.z[i]) * k, s, i };
  };
  out.push(at(s0));
  for (let i = 0; i < t.n; i++) if (t.s[i] > s0 + 0.05 && t.s[i] < s1 - 0.05) out.push({ x: t.x[i], y: t.y[i], z: t.z[i], s: t.s[i], i });
  out.push(at(s1));
  for (let k = 0; k < out.length; k++) {
    const p = out[k];
    const a = out[Math.max(0, k - 1)];
    const b = out[Math.min(out.length - 1, k + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    p.dx = dx;
    p.dz = dz;
    // right, level, square to the way it runs
    p.rx = -dz;
    p.rz = dx;
  }
  for (let k = 0; k + 1 < out.length; k++) {
    const mid = (out[k].s + out[k + 1].s) / 2;
    let i = 0;
    while (i + 2 < t.n && t.s[i + 1] <= mid) i++;
    out[k].kind = t.kind[i];
  }
  return out;
}
// a point c m across and y m over the rail at a frame
const P = (f, c, y) => [f.x + f.rx * c, f.y + y, f.z + f.rz * c];

// A strip of faces between two frames along a cross-section [[c, y], ...],
// each face turned the way `toward` says (a point in the cross-section it
// faces, or away from: inward true for a tube's inside).
function strip(m, f0, f1, prof, color, faceTo, away = false) {
  for (let k = 0; k + 1 < prof.length; k++) {
    const [c0, y0] = prof[k];
    const [c1, y1] = prof[k + 1];
    const a = P(f0, c0, y0);
    const b = P(f0, c1, y1);
    const c = P(f1, c1, y1);
    const d = P(f1, c0, y0);
    // the way this face should face: towards faceTo across the section (or away)
    const mc = (c0 + c1) / 2;
    const my = (y0 + y1) / 2;
    let wc = faceTo[0] - mc;
    let wy = faceTo[1] - my;
    if (away) [wc, wy] = [-wc, -wy];
    // the face's own normal across the section, going round a→b then along
    const ec = c1 - c0;
    const ey = y1 - y0;
    // (a→b, then a→d along +s: the normal of a, b, c, d is (a→b) × (a→d))
    const along = f1.s >= f0.s ? 1 : -1;
    const nc = -ey * along;
    const ny = ec * along;
    const col = typeof color === 'function' ? color(mc, my) : color;
    if (nc * wc + ny * wy >= 0) quad(m, a, b, c, d, col);
    else quad(m, a, d, c, b, col);
  }
}

// A rod along the track between two frames: c across, y over the rail, r thick.
function rod(m, f0, f1, c, y, r, color) {
  strip(m, f0, f1, [[c - r, y - r], [c - r, y + r], [c + r, y + r], [c + r, y - r]], color, [c, y], true);
}
const _p = [0, 0, 0];

function rails(m, f0, f1, y0) {
  for (const side of [-1, 1]) {
    const c = (side * GAUGE) / 2;
    const prof = [[c - RAIL.w / 2, y0 - RAIL.h], [c - RAIL.w / 2, y0], [c + RAIL.w / 2, y0], [c + RAIL.w / 2, y0 - RAIL.h]];
    strip(m, f0, f1, prof, (mc, my) => (my > y0 - 0.01 ? PAL.railTop : PAL.rail), [c, y0 - RAIL.h / 2], true);
  }
  // the third rail, and its cover board over it
  const c = THIRD.c;
  const yt = y0 + 0.04;
  strip(m, f0, f1, [[c - THIRD.w / 2, yt - THIRD.h], [c - THIRD.w / 2, yt], [c + THIRD.w / 2, yt], [c + THIRD.w / 2, yt - THIRD.h]], PAL.rail, [c, yt - THIRD.h / 2], true);
  strip(m, f0, f1, [[c - THIRD.cover / 2, yt + 0.06], [c + THIRD.cover / 2, yt + 0.09]], PAL.cover, [c, yt + 5]);
}

// One piece of a track: s0..s1 m along it.
/**
 * @param {any} t
 * @param {number} s0
 * @param {number} s1
 * @param {{ ground: (x: number, z: number) => number, outside: (x: number, z: number, dx: number, dz: number) => number,
 *   station?: (x: number, z: number, y: number) => boolean, mats: any }} kit
 */
export function buildPiece(t, s0, s1, { ground, outside, station = () => false, mats }) {
  const frames = framesOf(t, s0, s1);
  const over = new Mesher();
  const under = new Mesher();
  const glow = new Mesher();
  over.surf = SURF.concrete;
  under.surf = SURF.concrete;
  for (let k = 0; k + 1 < frames.length; k++) {
    const f0 = frames[k];
    const f1 = frames[k + 1];
    const kind = f0.kind;
    if (kind === TUNNEL) {
      const inVault = station((f0.x + f1.x) / 2, (f0.z + f1.z) / 2, (f0.y + f1.y) / 2);
      if (inVault) {
        rails(under, f0, f1, 0);
        continue;
      }
      // the tube, looking in
      strip(under, f0, f1, PROFILE, (c, y) => (y < 0 ? PAL.tubeFloor : _c.copy(PAL.tube).multiplyScalar(0.85 + 0.15 * Math.min(1, y / 3))), [0, TUBE.top / 2]);
      // the plinth the rails are on
      strip(under, f0, f1, [[-PLINTH.half, -0.35], [-PLINTH.half, -0.35 + PLINTH.h - RAIL.h], [PLINTH.half, -0.35 + PLINTH.h - RAIL.h], [PLINTH.half, -0.35]], PAL.concreteDark, [0, -0.3], true);
      rails(under, f0, f1, 0);
      // the safety walk along the outer wall, and its handrail
      const ws = outside(f0.x, f0.z, f0.dx, f0.dz) || 1;
      const wall = ws * TUBE.half;
      const edge = ws * (TUBE.half - WALK.wide);
      strip(under, f0, f1, [[wall, WALK.up], [edge, WALK.up], [edge, -0.35]], PAL.walk, [-ws * 3, 3]);
      rod(under, f0, f1, wall - ws * 0.07, WALK.rail, 0.025, PAL.bracket);
      // the cables along the other wall
      for (const y of CABLES) rod(under, f0, f1, -wall + ws * 0.09, y, 0.03, PAL.cable);
      const yaw = Math.atan2(f0.dx, f0.dz);
      const at = (s, c, y, out) => {
        const u = (s - f0.s) / (f1.s - f0.s || 1);
        out[0] = f0.x + (f1.x - f0.x) * u + f0.rx * c;
        out[1] = f0.y + (f1.y - f0.y) * u + y;
        out[2] = f0.z + (f1.z - f0.z) * u + f0.rz * c;
        return out;
      };
      for (let s = Math.ceil(f0.s / BRACKET_EVERY) * BRACKET_EVERY; s < f1.s; s += BRACKET_EVERY) {
        at(s, -wall + ws * 0.07, (CABLES[0] + CABLES[CABLES.length - 1]) / 2, _p);
        box(under, _p[0], _p[1], _p[2], 0.07, (CABLES[CABLES.length - 1] - CABLES[0]) / 2 + 0.08, 0.02, yaw, PAL.bracket);
      }
      // a lamp now and then over the walk, and a blue light where the phone is
      for (let s = Math.ceil(f0.s / LAMP_EVERY) * LAMP_EVERY; s < f1.s; s += LAMP_EVERY) {
        at(s, wall - ws * 0.06, 3.1, _p);
        box(glow, _p[0], _p[1], _p[2], 0.05, 0.09, 0.35, yaw, PAL.lamp);
      }
      for (let s = Math.ceil(f0.s / BLUE_EVERY) * BLUE_EVERY; s < f1.s; s += BLUE_EVERY) {
        at(s, wall - ws * 0.06, 2.55, _p);
        box(glow, _p[0], _p[1], _p[2], 0.06, 0.12, 0.12, yaw, PAL.blue);
        at(s + 0.5, wall - ws * 0.08, 1.55, _p);
        box(under, _p[0], _p[1], _p[2], 0.08, 0.3, 0.22, yaw, PAL.bracket);
      }
      continue;
    }
    if (kind === BRIDGE) {
      const top = -DECK.under;
      const bot = top - DECK.depth;
      // the girder: its top, its sides, its underside
      strip(over, f0, f1, [[-DECK.half, bot + 0.3], [-DECK.half, top], [DECK.half, top], [DECK.half, bot + 0.3]], PAL.concrete, [0, -50], true);
      strip(over, f0, f1, [[-DECK.half, bot + 0.3], [-DECK.half * 0.6, bot], [DECK.half * 0.6, bot], [DECK.half, bot + 0.3]], PAL.concreteDark, [0, 50], true);
      // a parapet on the side with no track beside it
      const side = outside(f0.x, f0.z, f0.dx, f0.dz);
      if (side) {
        const c0 = side * (DECK.half - PARAPET.w);
        const c1 = side * DECK.half;
        strip(over, f0, f1, [[c0, top], [c0, top + PARAPET.h], [c1, top + PARAPET.h], [c1, top]], PAL.concrete, [c0 - side * 50, top], false);
      }
      // ties on the deck
      ties(over, f0, f1, top);
      rails(over, f0, f1, 0);
      // piers, every SPAN m along
      const first = Math.ceil(f0.s / SPAN) * SPAN;
      for (let s = first; s < f1.s; s += SPAN) {
        const u = (s - f0.s) / (f1.s - f0.s || 1);
        const x = f0.x + (f1.x - f0.x) * u;
        const z = f0.z + (f1.z - f0.z) * u;
        const yb = f0.y + (f1.y - f0.y) * u + bot;
        const g = ground(x, z) - 0.3;
        if (yb - g < 1.2) continue;
        const yaw = Math.atan2(f0.dx, f0.dz);
        const capY = yb - PIER.cap / 2;
        box(over, x, (g + capY) / 2, z, PIER.w / 2, (capY - g) / 2, PIER.w / 2, yaw, PAL.pier);
        box(over, x, capY, z, PIER.head / 2, PIER.cap / 2, PIER.w / 2 + 0.2, yaw, PAL.pier);
      }
      continue;
    }
    // on the ground: a bank of ballast down to it either side
    const top = -BALLAST.under;
    const prof = [];
    for (const side of [-1, 1]) {
      const g0 = ground(f0.x + f0.rx * side * BALLAST.top * 1.5, f0.z + f0.rz * side * BALLAST.top * 1.5) - f0.y - 0.15;
      const drop = Math.max(0.2, Math.min(6, top - g0));
      prof.push([side * (BALLAST.top + drop * BALLAST.slope), top - drop]);
    }
    const bank = [prof[0], [-BALLAST.top, top], [BALLAST.top, top], prof[1]];
    strip(over, f0, f1, bank, (c, y) => (y < top - 0.01 ? PAL.ballastDark : PAL.ballast), [0, -50], true);
    ties(over, f0, f1, top);
    rails(over, f0, f1, 0);
  }
  const out = { over: null, under: null };
  if (!over.empty) out.over = meshOf(over, mats.solid);
  if (!under.empty || !glow.empty) {
    const g = new THREE.Group();
    if (!under.empty) g.add(meshOf(under, mats.tube));
    if (!glow.empty) g.add(meshOf(glow, mats.glow));
    out.under = g;
  }
  return out;
}

// concrete ties across, on top of the ballast or the deck
function ties(m, f0, f1, top) {
  const len = Math.hypot(f1.x - f0.x, f1.z - f0.z);
  const first = Math.ceil(f0.s / TIE.every) * TIE.every;
  const yaw = Math.atan2(f0.dx, f0.dz);
  for (let s = first; s < f1.s; s += TIE.every) {
    const u = (s - f0.s) / (f1.s - f0.s || 1);
    if (len < 0.01) break;
    const x = f0.x + (f1.x - f0.x) * u;
    const y = f0.y + (f1.y - f0.y) * u + top + TIE.h / 2;
    const z = f0.z + (f1.z - f0.z) * u;
    box(m, x, y, z, TIE.half, TIE.h / 2, TIE.w / 2, yaw, PAL.tie);
  }
}

export function meshOf(m, material) {
  const at = m.anchor();
  const mesh = new THREE.Mesh(m.build(at), material);
  mesh.position.copy(at);
  return mesh;
}

// How many pieces a track is cut into, and where each starts and ends.
export function piecesOf(t) {
  const count = Math.max(1, Math.round(t.length / PIECE));
  const out = [];
  for (let p = 0; p < count; p++) out.push([(t.length * p) / count, (t.length * (p + 1)) / count]);
  return out;
}
