// What the boats look like, made in code like everything else: vertex-
// coloured primitives merged into one mesh each (build/geometry.js), and the
// paddle the hiker holds.
//
// A boat is built round its own origin, on its keel, with its bow towards +z:
// the mesh is put in the world, not the geometry (render/origin.js).
//
//   boatGeometry(kind, seed)   -> BufferGeometry, for the boat or its ghost
//   makePaddle()               -> a Group, gripped at the top of the shaft,
//                                 the blade along -y (as held tools are); the
//                                 blade's tip is the child named 'blade'

import * as THREE from 'three';
import { Mesher, WOOD, alongMatrix, addRoundLog } from '../build/geometry.js';
import { phash } from '../noise.js';
import { BOATS } from './kinds.js';

const lin = (hex) => new THREE.Color(hex);
const PAL = {
  outside: lin(0x4a3524), // the hull, weathered and smoked dark outside
  char: lin(0x261a12),
  inside: lin(0xb48a58), // fresh adze-cut wood inside
  insideDark: lin(0x7d5a36),
  rim: lin(0x9a7448),
  rope: lin(0xb59a6a),
};

export function boatGeometry(kind, seed = 1) {
  const m = new Mesher();
  if (kind === 'raft') addRaft(m, BOATS.raft, seed);
  else addDugout(m, BOATS.canoe, seed);
  return m.build();
}

// ── The dugout ──────────────────────────────────────────────────────────────
// A log hollowed out: round underneath, pointed and solid at both ends, the
// sheer rising a little towards them, the walls a few fingers thick and the
// floor thicker.
const WALL = 0.045; // m
const FLOOR = 0.07; // m
const RISE = 0.1; // how much the sheer rises towards the ends (m)
const NL = 18; // stations along it
const NC = 10; // ...and round each one

function addDugout(m, { len, beam, rim }, seed) {
  const half = (s) => (beam / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.55);
  const sheer = (s) => rim + RISE * s * s;
  const keel = (s) => 0.12 * Math.pow(Math.abs(s), 4);
  // One skin of it: inset 0 for the outside, or the wall's thickness for the
  // inside (whose faces look the other way). -> { geo, top: [[x, y, z]...] }
  const skin = (inset) => {
    const pos = [];
    for (let i = 0; i <= NL; i++) {
      const s = -1 + (2 * i) / NL;
      const hb = Math.max(0, half(s) - inset);
      const top = sheer(s);
      const bot = keel(s) + (inset ? FLOOR + (top - FLOOR) * Math.pow(Math.abs(s), 6) : 0);
      for (let j = 0; j <= NC; j++) {
        const phi = (j / NC) * Math.PI;
        pos.push(hb * Math.cos(phi), bot + (top - bot) * (1 - Math.pow(Math.sin(phi), 0.6)), (s * len) / 2);
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
  const id = new THREE.Matrix4();
  m.add(skin(0), id, (p, n, out) => {
    const k = phash(Math.round(p.z * 6), Math.round(p.y * 9), seed);
    out.copy(PAL.char).lerp(PAL.outside, 0.55 + k * 0.45);
    if (p.y > sheer((p.z * 2) / len) - 0.03) out.copy(PAL.rim);
    return out;
  });
  m.add(skin(WALL), id, (p, n, out) => {
    const k = phash(Math.round(p.z * 7), Math.round(p.x * 20), seed + 3);
    return out.copy(PAL.insideDark).lerp(PAL.inside, 0.45 + k * 0.55);
  });
  // the rim: a flat strip along each gunwale, outside edge to inside edge
  const tri = [];
  for (let i = 0; i < NL; i++) {
    for (const side of [1, -1]) {
      const at = (k, inset) => {
        const s = -1 + (2 * k) / NL;
        return new THREE.Vector3(side * Math.max(0, half(s) - inset), sheer(s), (s * len) / 2);
      };
      const [o0, o1, i0, i1] = [at(i, 0), at(i + 1, 0), at(i, WALL), at(i + 1, WALL)];
      if (side > 0) tri.push(o0, i0, o1, o1, i0, i1);
      else tri.push(o0, o1, i0, o1, i1, i0);
    }
  }
  m.tris(tri, (p, n, out) => out.copy(PAL.rim).multiplyScalar(0.9 + phash(Math.round(p.z * 5), 1, seed) * 0.2));
  // a thwart to sit against, behind the seat
  const thwart = new THREE.BoxGeometry(beam * 0.78, 0.04, 0.12);
  m.add(thwart, new THREE.Matrix4().makeTranslation(0, rim - 0.05, BOATS.canoe.seat.z - 0.38), (p, n, out) => out.copy(PAL.inside).multiplyScalar(0.85));
}

// ── The raft ────────────────────────────────────────────────────────────────
// Round logs side by side, two poles across them near the ends, lashed down
// with rope where they cross.
const RAFT_LOG = 0.17; // a log's radius (m)
const POLE = 0.07;

function addRaft(m, { len, beam }, seed) {
  const n = Math.max(3, Math.round(beam / (RAFT_LOG * 2)));
  const w = n * RAFT_LOG * 2;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + RAFT_LOG * (2 * i + 1);
    // not all cut to quite the same length
    const l = len - phash(i, 7, seed) * 0.35;
    const dz = (phash(i, 9, seed) - 0.5) * 0.2;
    addRoundLog(m, alongMatrix('z', x, RAFT_LOG, dz), l, seed + i * 17, RAFT_LOG, 0.04);
  }
  for (const z of [-len * 0.36, len * 0.36]) {
    addRoundLog(m, alongMatrix('x', 0, RAFT_LOG * 2 + POLE * 0.6, z), w + 0.25, seed + Math.round(z * 10), POLE, 0.02);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + RAFT_LOG * (2 * i + 1);
      const band = new THREE.TorusGeometry(POLE + 0.025, 0.012, 4, 8);
      m.add(band, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x + RAFT_LOG * 0.55, RAFT_LOG * 2 + POLE * 0.4, z), (p, nn, out) => out.copy(PAL.rope));
    }
  }
}

// ── The paddle ──────────────────────────────────────────────────────────────
// A plain one carved from a single board: a knob to hold, a long shaft, and a
// broad blade.
export const PADDLE = { len: 1.45 }; // from the grip to the tip of the blade (m)

export function makePaddle() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: WOOD.hewn, roughness: 0.8 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 1.0, 6), wood);
  shaft.position.y = -0.45;
  g.add(shaft);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.035), wood);
  knob.position.y = 0.04;
  g.add(knob);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.02), wood);
  blade.position.y = -PADDLE.len + 0.25;
  g.add(blade);
  const tip = new THREE.Object3D();
  tip.name = 'blade';
  tip.position.y = -PADDLE.len + 0.08;
  g.add(tip);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}
