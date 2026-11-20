// What a town's buildings look like, made in code like everything else:
// vertex-coloured primitives merged into one mesh per lot, built with the same
// kit as the old places (landmarks/models.js): its piers, plank floors, steps
// and doors, and its weathering.
//
// A building is walls of painted clapboard, boards, or stone, with openings
// cut in them for doors and windows; a roof of shingles, slate, boards or
// tin; a porch or a boardwalk in front; and a foundation down to the ground,
// taller on the downhill side, since nothing is levelled for a town (see
// towns.js). Then it's dressed: a counter and shelves in a store, a bar and a
// piano in a saloon, pews in a church, a bed and a stove in a house.
//
// How it's built depends on the town: a western town's false fronts and
// boardwalks, a village's painted cottages behind picket fences, a dark
// town's tall houses with their shutters hanging. An abandoned town's
// buildings have boards gone, holes in their roofs and their glass broken,
// and some have fallen in altogether; a dark town's lean.
//
// Windows that are lit at night go into a mesh of their own, drawn with a
// material whose brightness follows the dark (see index.js).
//
//   buildLot(town, lot, ground, materials) -> {
//     object    a THREE.Group, placed and turned where the lot is
//     solids    capsules for the world's Solids: walls, floors, porches, steps
//     blockers  boxes the camera can't see through: { inv, half }
//     spinners  things that turn in the wind: { object, speed }
//     y0        the height of the ground at the lot's middle
//     piano     where a saloon's piano stands ({ x, z }), or null
//     bell      where a church's bell hangs ({ x, z, y } over y0), or null
//   }
//   buildStreet(town, ground, material) -> a THREE.Mesh: the dirt of the street
//   ground(x, z) -> height of the ground in the world
//   materials: { body, glow }

import * as THREE from 'three';
import { Mesher, WOOD, addRoundLog } from '../build/geometry.js';
import { mulberry32, phash } from '../noise.js';
import { toWorld } from '../landmarks/sites.js';
import { Builder, PAL as OLD, BUILD as OLD_PLACES, box, rod, stone, weather, stepsUp, floor, tone } from '../landmarks/models.js';
import { bodyOf } from './towns.js';

const lin = (hex) => new THREE.Color(hex);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

// ── Colours ──────────────────────────────────────────────────────────────────
const PAINT = {
  western: [0xc9b48a, 0xa8553a, 0x8f9c7c, 0xd6cfba, 0x7d8fa2, 0xbb9459, 0x9c8c78, 0xc7c1ad].map(lin),
  village: [0xf2ede2, 0xe9d9a2, 0xb7cad6, 0xa8bf9f, 0xe3bcb2, 0xdccbb0, 0x9fb4c8, 0xf0e2c8].map(lin),
  creepy: [0x3b3b41, 0x2f3b34, 0x4b2b2b, 0x4a4540, 0x56524c, 0x35303a].map(lin),
};
const TRIM = {
  western: [0xe6dfcc, 0x4a3a2a, 0x6e4c33].map(lin),
  village: [0xf7f3ea, 0xf7f3ea, 0xe8e2d4].map(lin),
  creepy: [0x6a645a, 0x26221f, 0x8a8478].map(lin),
};
const DOOR = {
  western: [0x6e4c33, 0x4a3a2a, 0x7a3a2a, 0x3e4a3a].map(lin),
  village: [0x2d4f73, 0x8a2b2b, 0x2e5a3a, 0x262626, 0x7a5a2a].map(lin),
  creepy: [0x1e1a18, 0x3a1414, 0x262a26].map(lin),
};
const SHUTTER = {
  western: [0x6e4c33, 0x4a5a3a].map(lin),
  village: [0x2e5a3a, 0x2d4f73, 0x7a2b2b, 0x3c3c3c].map(lin),
  creepy: [0x1e1e1e, 0x2a2420, 0x2a1a1a].map(lin),
};
const ROOFS = {
  western: [['tin', 0x8d8a82], ['shingle', 0x6a5238], ['board', 0x7a6a56], ['tin', 0x9a8a78]],
  village: [['shingle', 0x5e4a34], ['slate', 0x4b5059], ['slate', 0x7f4536], ['shingle', 0x3f4a40]],
  creepy: [['slate', 0x26272c], ['shingle', 0x2e2a28], ['slate', 0x302a2e]],
};
const BOARD = lin(0x8a6c4a);
const PLASTER = lin(0xc8bca2);
const GLASS = lin(0x1a2129);
const LIT = lin(0xffbf73);
const COALS = lin(0xff6a24);
const DIRT = lin(0x7a6248);
const HAY = lin(0xc9a95a);
const CANVAS = [lin(0xb9442f), lin(0xe9e1cc), lin(0x2f5f7a), lin(0x3f6a3f)];
const FLOWERS = [0xd94848, 0xf0d040, 0xe8e0f0, 0xb86ad0, 0xf08a3a, 0xe06a9a].map(lin);
const LEAF = lin(0x3c5a26);
const DEAD = lin(0x3a3430);
const GOODS = [0xa0522d, 0x6b8e23, 0xd2b48c, 0x8b4513, 0x4682b4, 0xb22222, 0xdaa520].map(lin);

const STOREY = 3.0; // m from one floor to the next
const POST_SPACING = 3; // m, the most between a porch's posts
const _q = new THREE.Quaternion();

// ── A lot ────────────────────────────────────────────────────────────────────
export function buildLot(town, lot, ground, materials) {
  const y0 = ground(lot.x, lot.z);
  const _w = {};
  const g = (lx, lz) => {
    toWorld(lot, lx, lz, _w);
    return ground(_w.x, _w.z) - y0;
  };
  const b = new Builder(lot, g, mulberry32(lot.seed), y0);
  b.glow = new Mesher();
  b.town = town;
  b.lot = lot;
  b.style = town.style;
  b.decay = lot.decay;
  b.dark = town.style === 'creepy';
  b.alive = town.people > 0;
  // in a dark town, one house in three has a candle burning in a window
  b.candle = town.style === 'creepy' && lot.type !== 'church' && lot.seed % 3 === 0;
  b.look = lookOf(town, lot, b.rnd);
  const from = b.m.n;
  BUILD[lot.type](b, lot);
  // what was put on it and round it weathers too
  if (b.after !== undefined) weather(b.m, b.after, (b.style === 'western' ? 0.2 : 0.04) + b.decay * 0.5, b.decay * 0.4);
  // a dark town's houses lean, as if the ground had moved under them
  if (b.lean) lean(b.m, from, b.lean, b.leanFrom);
  if (b.lean) lean(b.glow, 0, b.lean, b.leanFrom);

  const object = new THREE.Group();
  object.position.set(lot.x, y0, lot.z);
  object.rotation.y = lot.yaw;
  const spinners = [];
  for (const part of b.parts) {
    if (part.m.empty) continue;
    const mesh = new THREE.Mesh(part.m.build(), materials.body);
    mesh.position.copy(part.at);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = part.yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    object.add(mesh);
    if (part.spin) spinners.push({ object: mesh, speed: part.spin });
  }
  if (!b.glow.empty) {
    const glow = new THREE.Mesh(b.glow.build(), materials.glow);
    glow.castShadow = false;
    object.add(glow);
  }
  object.updateMatrixWorld(true);
  const solids = b.solids.map((s) => {
    const a = toWorld(lot, s.ax, s.az);
    const e = toWorld(lot, s.bx, s.bz);
    return { ax: a.x, az: a.z, bx: e.x, bz: e.z, r: s.r, bottom: s.bottom + y0, topA: s.topA + y0, topB: s.topB + y0, step: s.step, surface: s.surface };
  });
  const blockers = b.blockers.map(({ c, h, rx, ry = 0 }) => {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const world = object.matrixWorld.clone().multiply(local);
    return { inv: world.invert(), half: h };
  });
  return { object, solids, blockers, spinners, y0, piano: b.piano || null, bell: b.bell || null };
}

// How a lot is painted and roofed, and how its windows are lit.
function lookOf(town, lot, rnd) {
  const st = town.style;
  const [cover, roof] = pick(ROOFS[st], rnd);
  const lit = town.style === 'creepy' ? 0 : town.people ? 0.62 : 0;
  return {
    paint: pick(PAINT[st], rnd),
    trim: pick(TRIM[st], rnd),
    door: pick(DOOR[st], rnd),
    shutter: pick(SHUTTER[st], rnd),
    cover,
    roof: lin(roof),
    siding: st === 'western' ? (rnd() < 0.5 ? 'board' : 'clap') : st === 'creepy' && rnd() < 0.3 ? 'board' : 'clap',
    raw: st === 'western' && rnd() < 0.35, // boards never painted
    lit,
  };
}

// ── The kit ──────────────────────────────────────────────────────────────────
// Everything works in the lot's own frame, y up from the ground at its middle.

function quad(m, a, b, c, d, color) {
  m.tris([a, b, c, a, c, d], color);
}

// [[a, b], ...] less the stretch [c, d]
function cutOut(spans, c, d) {
  const out = [];
  for (const [a, b] of spans) {
    if (d <= a || c >= b) out.push([a, b]);
    else {
      if (c - a > 0.03) out.push([a, c]);
      if (b - d > 0.03) out.push([d, b]);
    }
  }
  return out;
}

// A wall's own frame: t along it from a, out from its face, y up.
function frameOf(a, e) {
  const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
  const ux = (e[0] - a[0]) / len;
  const uz = (e[1] - a[1]) / len;
  const nx = -uz;
  const nz = ux;
  return {
    a,
    len,
    ux,
    uz,
    nx,
    nz,
    ry: Math.atan2(-uz, ux),
    at: (t, y, off = 0) => V(a[0] + ux * t + nx * off, y, a[1] + uz * t + nz * off),
  };
}

// A box lined up with a wall: centred at (t, y, off) in its frame.
function wbox(m, F, t, y, off, st, sy, so, color) {
  const p = F.at(t, y, off);
  box(m, p.x, p.y, p.z, st, sy, so, color, 0, F.ry, 0);
}

// A wall from a to e ([x, z]) from y0 up to its top: a height, or a gable
// { eave, peak } rising to its peak over the middle.
//   siding   'clap' (painted lap boards), 'board' (upright boards), 'stone'
//   color    its paint, or its stone
//   holes    { c, w, y, h, ... }: openings, c from the middle along it
//   decay    0..1: boards gone and broken off
//   lining   the colour of its inside face, if it has one
// -> its frame, with the openings in wall terms on it (for dressing them)
function wall(b, { a, e, y0, top, siding, color, holes = [], decay = 0, lining = null, m = b.m }) {
  const F = frameOf(a, e);
  const { len } = F;
  const flat = typeof top === 'number';
  const peak = flat ? top : top.peak;
  const topAt = (t) => (flat ? top : top.eave + (top.peak - top.eave) * Math.max(0, 1 - Math.abs(t - len / 2) / (len / 2)));
  // where along the wall it still reaches y
  const reach = (y) => {
    if (flat) return y < top ? [0, len] : null;
    if (y <= top.eave) return [0, len];
    if (y >= top.peak) return null;
    const hw = (len / 2) * (1 - (y - top.eave) / (top.peak - top.eave));
    return [len / 2 - hw, len / 2 + hw];
  };
  const H = holes.map((h) => ({ ...h, t0: len / 2 + h.c - h.w / 2, t1: len / 2 + h.c + h.w / 2, y0: y0 + h.y, y1: y0 + h.y + h.h }));
  const rnd = b.rnd;

  if (siding === 'board') {
    const n = Math.max(1, Math.round(len / 0.24));
    const bw = len / n;
    for (let i = 0; i < n; i++) {
      const t0 = i * bw;
      const t1 = t0 + bw - 0.014;
      const tm = (t0 + t1) / 2;
      let yt = topAt(tm);
      if (decay) {
        if (rnd() < decay * 0.2) continue;
        if (rnd() < decay * 0.3) yt -= rnd() * decay * (yt - y0) * 0.75;
      }
      let spans = [[y0, yt]];
      for (const h of H) if (tm > h.t0 && tm < h.t1) spans = cutOut(spans, h.y0, h.y1);
      const k = 0.8 + rnd() * 0.28;
      const col = (p, nn, out) => out.copy(color).multiplyScalar(k * (0.93 + 0.07 * Math.sin(p.y * 3.1 + i)));
      for (const [ya, yb] of spans) quad(m, F.at(t0, ya), F.at(t1, ya), F.at(t1, yb), F.at(t0, yb), col);
    }
  } else {
    const course = siding === 'clap' ? 0.2 : 0.3;
    let k = 0;
    for (let y = y0; y < peak - 0.02; y += course, k++) {
      const yt = Math.min(y + course, peak);
      const r = reach((y + yt) / 2);
      if (!r) break;
      let spans = [r];
      for (const h of H) if (h.y0 < yt - 0.01 && h.y1 > y + 0.01) spans = cutOut(spans, h.t0, h.t1);
      for (const [t0, t1] of spans) {
        if (siding === 'clap') {
          if (decay && rnd() < decay * 0.16) continue;
          const shade = 0.9 + rnd() * 0.13;
          const mid = (y + yt) / 2;
          const col = (p, nn, out) => out.copy(color).multiplyScalar(shade * (p.y > mid ? 1 : 0.8));
          quad(m, F.at(t0, y, 0.035), F.at(t1, y, 0.035), F.at(t1, yt, 0), F.at(t0, yt, 0), col);
        } else {
          // dressed stone, in courses, each block a little different
          let t = t0 - (k % 2 ? 0.32 : 0);
          while (t < t1) {
            const bl = 0.5 + rnd() * 0.35;
            const ta = Math.max(t, t0);
            const tb = Math.min(t + bl, t1);
            t += bl;
            if (tb - ta < 0.05) continue;
            if (decay && rnd() < decay * 0.08) continue;
            const shade = 0.78 + rnd() * 0.32;
            const col = (p, nn, out) => out.copy(color).multiplyScalar(shade * (p.y > y + 0.04 ? 1 : 0.62));
            quad(m, F.at(ta + 0.01, y, 0.02), F.at(tb - 0.01, y, 0.02), F.at(tb - 0.01, yt - 0.01, 0.02), F.at(ta + 0.01, yt - 0.01, 0.02), col);
          }
        }
      }
    }
  }

  // the inside face, plain, cut round the openings
  if (lining) {
    const cuts = [0, len];
    for (const h of H) cuts.push(Math.max(0, h.t0), Math.min(len, h.t1));
    cuts.sort((p, q) => p - q);
    const col = (p, nn, out) => out.copy(lining).multiplyScalar(0.9 + 0.1 * Math.sin(p.x * 2 + p.z * 3));
    for (let i = 0; i < cuts.length - 1; i++) {
      const ta = cuts[i];
      const tb = cuts[i + 1];
      if (tb - ta < 0.02) continue;
      const tm = (ta + tb) / 2;
      let spans = [[y0, Math.min(topAt(ta), topAt(tb))]];
      for (const h of H) if (tm > h.t0 && tm < h.t1) spans = cutOut(spans, h.y0, h.y1);
      for (const [ya, yb] of spans) quad(m, F.at(ta, ya, -0.09), F.at(tb, ya, -0.09), F.at(tb, yb, -0.09), F.at(ta, yb, -0.09), col);
    }
  }
  F.holes = H;
  return F;
}

// Dress a wall's openings: frames, glass (lit, dark or broken), shutters,
// bars and doors.
function dress(b, F, trim) {
  const { look, decay } = b;
  for (const h of F.holes) {
    const tm = (h.t0 + h.t1) / 2;
    const w = h.t1 - h.t0;
    const ht = h.y1 - h.y0;
    if (h.kind === 'gap') continue;
    // the frame round it
    wbox(b.m, F, h.t0 - 0.05, (h.y0 + h.y1) / 2, 0.03, 0.1, ht + 0.1, 0.16, trim);
    wbox(b.m, F, h.t1 + 0.05, (h.y0 + h.y1) / 2, 0.03, 0.1, ht + 0.1, 0.16, trim);
    wbox(b.m, F, tm, h.y1 + 0.05, 0.03, w + 0.2, 0.1, 0.16, trim);
    if (h.kind === 'window') {
      wbox(b.m, F, tm, h.y0 - 0.04, 0.06, w + 0.24, 0.07, 0.2, trim);
      const broken = decay > 0.3 && b.rnd() < decay * 0.9;
      const candle = b.candle && !broken && h.y > 2;
      if (candle) b.candle = false;
      const lit = candle || (!broken && b.rnd() < (h.lit ?? look.lit));
      if (broken) {
        // a shard or two left in the corner of the frame
        if (b.rnd() < 0.5) b.m.tris([F.at(h.t0, h.y0, -0.03), F.at(h.t0 + w * 0.5, h.y0, -0.03), F.at(h.t0, h.y0 + ht * 0.6, -0.03)], (p, n, out) => out.copy(GLASS));
      } else {
        const pane = lit ? b.glow : b.m;
        const col = lit ? (p, n, out) => out.copy(LIT) : (p, n, out) => out.copy(GLASS).multiplyScalar(0.8 + Math.max(0, p.y - h.y0) / ht * 0.6);
        quad(pane, F.at(h.t0, h.y0, -0.04), F.at(h.t1, h.y0, -0.04), F.at(h.t1, h.y1, -0.04), F.at(h.t0, h.y1, -0.04), col);
        if (!h.plain) {
          // glazing bars
          wbox(b.m, F, tm, (h.y0 + h.y1) / 2, -0.02, 0.05, ht, 0.04, trim);
          wbox(b.m, F, tm, (h.y0 + h.y1) / 2, -0.02, w, 0.05, 0.04, trim);
        }
      }
      if (h.bars) for (let i = 1; i < 5; i++) wbox(b.m, F, h.t0 + (w * i) / 5, (h.y0 + h.y1) / 2, 0.05, 0.035, ht, 0.035, OLD.iron);
      if (h.shutters) {
        for (const s of [-1, 1]) {
          if (decay && b.rnd() < decay * 0.5) continue;
          const hang = decay && b.rnd() < decay ? (b.rnd() - 0.5) * 0.6 : 0;
          const p = F.at(s < 0 ? h.t0 - 0.12 - w * 0.25 : h.t1 + 0.12 + w * 0.25, (h.y0 + h.y1) / 2, 0.06);
          box(b.m, p.x, p.y, p.z, w * 0.5, ht, 0.04, tone(look.shutter, b.rnd, 0.15), 0, F.ry, hang);
        }
      }
    } else if (h.kind === 'door') {
      wbox(b.m, F, tm, h.y0 - 0.02, 0.0, w + 0.2, 0.05, 0.3, trim);
      const leaf = h.color || look.door;
      if (h.batwing) {
        // a saloon's swinging half doors, one pushed a little open
        for (const s of [-1, 1]) {
          const p = F.at(tm + s * w * 0.25, h.y0 + 1.15, -0.05 + (s > 0 ? 0.12 : 0));
          box(b.m, p.x, p.y, p.z, w * 0.48, 0.95, 0.05, tone(leaf, b.rnd, 0.1), 0, F.ry + (s > 0 ? 0.5 : 0), 0);
        }
      } else if (!(decay > 0.6 && b.rnd() < 0.4)) {
        // hung on its hinge, open into the room
        const swing = h.swing ?? 1.2 + b.rnd() * 0.5;
        const hinge = F.at(h.t1 - 0.02, 0, -0.08);
        const leafW = w - 0.06;
        const fall = decay > 0.5 && b.rnd() < 0.5 ? 0.25 : 0;
        const c = Math.cos(swing);
        const n = Math.sin(swing);
        const dir = V(-F.ux * c - F.nx * n, 0, -F.uz * c - F.nz * n);
        box(b.m, hinge.x + (dir.x * leafW) / 2, h.y0 + ht / 2 - 0.03, hinge.z + (dir.z * leafW) / 2, leafW, ht - 0.06, 0.05, tone(leaf, b.rnd, 0.12), 0, Math.atan2(-dir.z, dir.x), fall);
      }
    } else if (h.kind === 'big') {
      // a barn's big doors: one slid aside along the wall, or fallen
      const leaf = h.color || look.door;
      const p = F.at(h.t1 + w * 0.25, (h.y0 + h.y1) / 2 - 0.05, 0.1);
      box(b.m, p.x, p.y, p.z, w * 0.5, ht - 0.1, 0.07, tone(leaf, b.rnd, 0.12), 0, F.ry, 0);
      wbox(b.m, F, (h.t0 + h.t1 + w * 0.5) / 2, h.y1 + 0.12, 0.14, w * 1.5, 0.06, 0.06, OLD.iron);
    }
  }
}

// Walls go round a room as solids, split where a door is (an opening down
// to the floor, and tall enough to walk through).
function wallSolids(b, F, bottom, top, fl) {
  let spans = [[0, F.len]];
  for (const h of F.holes) if ((h.kind === 'door' || h.kind === 'big' || h.kind === 'gap') && h.y0 - fl < 0.3 && h.y1 - h.y0 > 1.6) spans = cutOut(spans, h.t0 - 0.05, h.t1 + 0.05);
  for (const [t0, t1] of spans) {
    const p = F.at(t0 + 0.1, 0);
    const q = F.at(t1 - 0.1, 0);
    b.solid(p.x, p.z, q.x, q.z, 0.14, bottom, top);
  }
}

// What a building stands on, from the ground up to its floor: stone, or
// boards on posts, round the rectangle; taller where the ground falls away.
function skirt(b, x0, z0, x1, z1, top, kind) {
  const sides = [[[x0, z1], [x1, z1]], [[x1, z1], [x1, z0]], [[x1, z0], [x0, z0]], [[x0, z0], [x0, z1]]];
  for (const [a, e] of sides) {
    const F = frameOf(a, e);
    const n = Math.max(1, Math.round(F.len / 0.9));
    for (let i = 0; i < n; i++) {
      const ta = (F.len * i) / n;
      const tb = (F.len * (i + 1)) / n;
      const pa = F.at(ta, 0);
      const pb = F.at(tb, 0);
      const ga = b.g(pa.x, pa.z) - 0.15;
      const gb = b.g(pb.x, pb.z) - 0.15;
      if (top - Math.max(ga, gb) < 0.02 && top - Math.min(ga, gb) < 0.02) continue;
      const k = 0.75 + b.rnd() * 0.3;
      const color = kind === 'stone' ? WOOD.stone : kind === 'brick' ? lin(0x8a4a38) : BOARD;
      const col = (p, nn, out) => out.copy(color).multiplyScalar(k * (kind === 'boards' ? 0.7 : 0.9));
      quad(b.m, F.at(ta, Math.min(ga, top), 0.02), F.at(tb, Math.min(gb, top), 0.02), F.at(tb, top, 0.02), F.at(ta, top, 0.02), col);
    }
  }
}

// A gable roof over [x0, x1] × [z0, z1], its ridge along `axis`, its eaves
// at `eave`, pitched `pitch`, overhanging by `over`.
//   cover   'shingle' | 'slate' | 'tin' | 'board'
// -> the height of the ridge
function roof(b, { x0, z0, x1, z1, eave, pitch, axis = 'x', over = 0.4, cover = 'shingle', color, decay = 0, m = b.m, blockers = true }) {
  const along = axis === 'x';
  const u0 = (along ? x0 : z0) - over;
  const u1 = (along ? x1 : z1) + over;
  const vc = along ? (z0 + z1) / 2 : (x0 + x1) / 2;
  const half = (along ? z1 - z0 : x1 - x0) / 2;
  const tan = Math.tan(pitch);
  const ridge = eave + half * tan;
  const W = (u, y, v) => (along ? V(u, y, v) : V(v, y, u));
  const vEdge = half + over;
  const yEdge = eave - over * tan;
  const rnd = b.rnd;
  const rusty = cover === 'tin' ? 0.15 + decay * 0.8 : 0;
  for (const s of [-1, 1]) {
    const at = (u, f, lift = 0) => W(u, yEdge + (ridge - yEdge) * f + lift, vc + s * vEdge * (1 - f));
    if (cover === 'tin' || cover === 'board') {
      // ribs or planks running up the slope
      const cw = cover === 'tin' ? 0.17 : 0.26;
      const n = Math.max(2, Math.round((u1 - u0) / cw));
      for (let i = 0; i < n; i++) {
        const ua = u0 + ((u1 - u0) * i) / n;
        const ub = u0 + ((u1 - u0) * (i + 1)) / n - (cover === 'board' ? 0.015 : 0);
        let f0 = 0;
        let f1 = 1.01;
        if (decay && rnd() < decay * 0.3) {
          // a hole: this one's gone from somewhere up the slope
          const c = rnd();
          f0 = c < 0.5 ? 0 : 0.3 + rnd() * 0.4;
          f1 = c < 0.5 ? 0.2 + rnd() * 0.5 : 1.01;
          if (rnd() < 0.5) continue;
        }
        const lift = cover === 'tin' && i % 2 ? 0.025 : 0;
        const r = phash(i, s, b.seed);
        const col = (p, nn, out) => {
          out.copy(color);
          if (rusty) out.lerp(OLD.rust, Math.min(1, rusty * phash(Math.round(p.x * 3), Math.round(p.y * 4), Math.round(p.z * 3) + b.seed) * 1.6));
          return out.multiplyScalar((0.82 + r * 0.25) * (lift ? 0.9 : 1.05));
        };
        quad(m, at(ua, f0, lift + 0.1), at(ub, f0, lift + 0.1), at(ub, Math.min(1, f1), lift + 0.1), at(ua, Math.min(1, f1), lift + 0.1), col);
      }
    } else {
      // courses of shingles or slates, each laid over the one below
      const slope = Math.hypot(vEdge, ridge - yEdge);
      const rows = Math.max(3, Math.round(slope / (cover === 'slate' ? 0.26 : 0.34)));
      const segs = Math.max(2, Math.round((u1 - u0) / 1.1));
      for (let r = 0; r < rows; r++) {
        const fa = r / rows;
        const fb = Math.min(1, (r + 1) / rows + 0.04);
        for (let c = 0; c < segs; c++) {
          if (decay && rnd() < decay * 0.22) continue;
          const ua = u0 + ((u1 - u0) * c) / segs;
          const ub = u0 + ((u1 - u0) * (c + 1)) / segs;
          const j = phash(r, c, b.seed);
          const k = 0.75 + j * 0.4;
          const col = (p, nn, out) => out.copy(color).multiplyScalar(k);
          quad(m, at(ua, fa, 0.1 - 0.03), at(ub, fa, 0.1 - 0.03), at(ub, fb, 0.1), at(ua, fb, 0.1), col);
          const dark = (p, nn, out) => out.copy(color).multiplyScalar(k * 0.5);
          quad(m, at(ua, fa, 0.04), at(ub, fa, 0.04), at(ub, fa, 0.075), at(ua, fa, 0.075), dark);
        }
      }
    }
    // the underside
    const und = (p, nn, out) => out.copy(BOARD).multiplyScalar(0.45);
    quad(m, at(u0, 0, 0.02), at(u1, 0, 0.02), at(u1, 1, 0.02), at(u0, 1, 0.02), und);
  }
  // a cap along the ridge
  const rc = W((u0 + u1) / 2, ridge + 0.13, vc);
  const cap = (p, nn, out) => out.copy(color).multiplyScalar(0.7);
  box(m, rc.x, rc.y, rc.z, along ? u1 - u0 : 0.22, 0.1, along ? 0.22 : u1 - u0, cap);
  if (blockers) {
    const slope = vEdge / Math.cos(pitch) / 2;
    const y = (yEdge + ridge) / 2 + 0.08;
    for (const s of [-1, 1]) {
      const c = W((u0 + u1) / 2, y, vc + (s * vEdge) / 2);
      // a slope, as a thin box tipped about the ridge's axis
      if (along) b.blocker(c.x, c.y, c.z, (u1 - u0) / 2, 0.08, slope, s * pitch);
      else b.blockers.push({ c: [c.x, c.y, c.z], h: [(u1 - u0) / 2, 0.08, slope], rx: s * pitch, ry: Math.PI / 2 });
    }
  }
  return ridge;
}

// A roof of one slope: from y0 along the edge at z0 down to y1 at z1, across
// [x0, x1]. A porch roof, an awning, a shed.
function shed(b, { x0, x1, z0, z1, y0, y1, cover = 'board', color, decay = 0, m = b.m, stripes = null }) {
  const n = Math.max(2, Math.round((x1 - x0) / (cover === 'tin' ? 0.17 : 0.3)));
  for (let i = 0; i < n; i++) {
    const xa = x0 + ((x1 - x0) * i) / n;
    const xb = x0 + ((x1 - x0) * (i + 1)) / n - 0.01;
    if (decay && b.rnd() < decay * 0.3) continue;
    const r = phash(i, 7, b.seed);
    const c = stripes ? stripes[i % stripes.length] : color;
    const col = (p, nn, out) => {
      out.copy(c).multiplyScalar(0.85 + r * 0.2);
      if (cover === 'tin') out.lerp(OLD.rust, 0.15 + decay * 0.6 * phash(Math.round(p.x * 3), Math.round(p.z * 3), b.seed));
      return out;
    };
    quad(m, V(xa, y0, z0), V(xb, y0, z0), V(xb, y1, z1), V(xa, y1, z1), col);
  }
}

// A porch or a boardwalk across [x0, x1] from z0 (the wall) out to z1, its
// deck at `deck`; posts and a roof if `roofY`; steps down in front.
function porch(b, { x0, x1, z0, z1, deck, roofY = 0, cover = 'board', color, rail = false, steps = null, decay = 0, posts = null, stripes = null }) {
  const m = b.m;
  const n = Math.max(2, Math.round((x1 - x0) / 0.2));
  const pw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    if (decay && b.rnd() < decay * 0.18) continue;
    const k = 0.75 + b.rnd() * 0.3;
    const sag = decay ? (b.rnd() - 0.5) * decay * 0.06 : 0;
    box(m, x0 + (i + 0.5) * pw, deck - 0.03 + sag, (z0 + z1) / 2, pw - 0.02, 0.05, z1 - z0, (p, nn, out) => out.copy(BOARD).lerp(lin(0x7f786c), 0.4).multiplyScalar(k));
  }
  // its edge, and posts down to the ground
  box(m, (x0 + x1) / 2, deck - 0.16, z1 - 0.03, x1 - x0, 0.22, 0.05, tone(BOARD, b.rnd, 0.1));
  const legs = Math.max(2, Math.round((x1 - x0) / 2.2) + 1);
  for (let i = 0; i < legs; i++) {
    const x = x0 + 0.1 + ((x1 - x0 - 0.2) * i) / (legs - 1);
    const gy = b.g(x, z1 - 0.1);
    if (deck - gy > 0.15) box(m, x, (deck - 0.1 + gy - 0.2) / 2, z1 - 0.1, 0.12, deck - 0.1 - gy + 0.2, 0.12, tone(BOARD, b.rnd, 0.15));
  }
  const rows = Math.max(1, Math.round((z1 - z0) / 1.0));
  const rr = (z1 - z0) / rows / 2 + 0.05;
  for (let i = 0; i < rows; i++) {
    const z = z0 + (i + 0.5) * ((z1 - z0) / rows);
    b.solid(x0 + rr, z, x1 - rr, z, rr, deck - 0.6, deck, { step: 0.36, surface: 'boards' });
  }
  if (roofY) {
    // at the ends, and every few metres between, but never in front of the steps
    let xs = posts;
    if (!xs) {
      const n = Math.max(1, Math.round((x1 - x0) / POST_SPACING));
      xs = [];
      for (let i = 0; i <= n; i++) xs.push(x0 + 0.12 + ((x1 - x0 - 0.24) * i) / n);
      if (steps) xs = xs.filter((x, i) => i === 0 || i === n || x < steps[0] - 0.45 || x > steps[1] + 0.45);
    }
    for (const x of xs) {
      if (decay > 0.7 && b.rnd() < 0.35) continue;
      box(m, x, (deck + roofY) / 2, z1 - 0.12, 0.13, roofY - deck, 0.13, tone(b.look.trim, b.rnd, 0.1));
      b.solid(x, z1 - 0.12, x, z1 - 0.12, 0.09, deck - 0.5, roofY);
    }
    const droop = decay > 0.75 && b.rnd() < 0.5 ? 0.6 : 0;
    shed(b, { x0: x0 - 0.15, x1: x1 + 0.15, z0, z1: z1 + 0.3, y0: roofY + 0.35, y1: roofY - droop, cover, color, decay, stripes });
    box(m, (x0 + x1) / 2, roofY - 0.06, z1 - 0.12, x1 - x0, 0.12, 0.12, tone(b.look.trim, b.rnd, 0.1));
  }
  if (rail) {
    for (const x of [x0 + 0.06, x1 - 0.06]) {
      rod(m, [x, deck + 0.9, z0], [x, deck + 0.9, z1 - 0.1], 0.03, b.look.trim);
      b.solid(x, z0 + 0.2, x, z1 - 0.2, 0.06, deck - 0.3, deck + 0.95);
    }
  }
  if (steps) stepsUp(b, z1, steps[0], steps[1], deck, BOARD);
}

// A building's body: walls on a floor over a foundation, a roof, and what the
// camera and your feet need of it. The openings go on each wall, front
// (+z), back, left (-x) and right, as { c, w, y, h, kind, ... }; c is from
// the middle of the wall, to your right as you look at it from outside.
//   storeys, storey   how many floors, and how far apart (m)
//   lift      how far its floor is above the highest ground under it
//   roof      { axis, pitch, cover, color, over } or null (a flat roof)
//   parapet   a false front: how far the front wall rises past the eaves
//   foundation 'stone' | 'boards' | 'brick'
// -> { floor, eave, ridge, lo }
function body(b, o) {
  const { x0, z0, x1, z1 } = o;
  const look = b.look;
  const corners = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1], [x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]];
  const { lo, hi } = b.span(corners);
  const fl = hi + (o.lift ?? 0.35);
  const storeys = b.lot.ruin ? 1 : o.storeys ?? 1;
  const storey = o.storey ?? STOREY;
  const eave = fl + storeys * storey;
  const siding = o.siding ?? look.siding;
  const paint = o.color ?? (look.raw && siding === 'board' ? BOARD : look.paint);
  const trim = o.trim ?? look.trim;
  const decay = b.decay;
  const ruin = b.lot.ruin;
  const from = b.m.n;
  skirt(b, x0, z0, x1, z1, fl - 0.05, o.foundation ?? (b.style === 'village' ? 'stone' : 'boards'));
  floor(b, x0 + 0.06, z0 + 0.06, x1 - 0.06, z1 - 0.06, fl, lo - 0.4, o.floorColor ?? BOARD);

  const R = o.roof;
  const gableX = R && R.axis === 'x'; // the side walls have the gables
  const gableZ = R && R.axis === 'z'; // the front and back do
  const rise = (span) => (R ? (span / 2) * Math.tan(R.pitch) : 0);
  const ragged = () => fl + 0.5 + b.rnd() * 1.8;
  const topOf = (side) => {
    if (ruin) return ragged();
    if (side === 'front' && o.parapet) return eave + o.parapet;
    if (!R) return eave + (o.flatParapet ?? 0.5);
    if ((side === 'left' || side === 'right') && gableX) return { eave, peak: eave + rise(z1 - z0) };
    if ((side === 'front' || side === 'back') && gableZ) return { eave, peak: eave + rise(x1 - x0) };
    return eave;
  };
  const sides = {
    front: [[x0, z1], [x1, z1]],
    right: [[x1, z1], [x1, z0]],
    back: [[x1, z0], [x0, z0]],
    left: [[x0, z0], [x0, z1]],
  };
  const lining = o.lining === undefined ? (b.style === 'village' ? PLASTER : BOARD) : o.lining;
  const walls = {};
  for (const side in sides) {
    const [a, e] = sides[side];
    const holes = (o.openings[side] || []).filter((h) => !ruin || h.y < 1.2);
    walls[side] = wall(b, { a, e, y0: fl - 0.04, top: topOf(side), siding, color: paint, holes, decay: ruin ? Math.max(decay, 0.6) : decay, lining });
    if (!ruin) dress(b, walls[side], trim);
    wallSolids(b, walls[side], lo - 0.4, ruin ? fl + 1 : eave, fl);
  }
  // corner boards
  if (siding !== 'stone' && !ruin) for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(b.m, x, (fl + eave) / 2, z, 0.14, eave - fl, 0.14, trim);
  // a ceiling between the floors, and a band round the outside where it is
  for (let s = 1; s < storeys; s++) {
    const y = fl + s * storey;
    quad(b.m, V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1), (p, nn, out) => out.copy(BOARD).multiplyScalar(0.6));
    for (const side in walls) wbox(b.m, walls[side], walls[side].len / 2, y, 0.06, walls[side].len + 0.1, 0.14, 0.06, trim);
  }
  if (storeys > 1) b.blocker((x0 + x1) / 2, fl + storey + 0.05, (z0 + z1) / 2, (x1 - x0) / 2, 0.05, (z1 - z0) / 2);

  let ridge = eave;
  if (ruin) {
    // what's left of the roof is on the floor
    for (let i = 0; i < 3; i++) {
      const a = [x0 + 0.3 + b.rnd() * (x1 - x0 - 0.6), fl + 0.1, z0 + 0.3];
      const e = [x0 + 0.3 + b.rnd() * (x1 - x0 - 0.6), fl + 0.8 + b.rnd() * 1.2, z1 - 0.3];
      rod(b.m, a, e, 0.08, tone(BOARD, b.rnd, 0.2), 6);
    }
  } else if (R) {
    const caved = decay > 0.8 && b.rnd() < 0.4;
    ridge = roof(b, { x0, z0, x1, z1, eave, pitch: R.pitch, axis: R.axis, over: R.over ?? 0.4, cover: R.cover ?? look.cover, color: R.color ?? look.roof, decay: caved ? 0.9 : decay * 0.8 });
  } else {
    // a flat roof inside its parapet
    const y = eave + 0.02;
    quad(b.m, V(x0, y, z0), V(x1, y, z0), V(x1, y, z1), V(x0, y, z1), (p, nn, out) => out.copy(lin(0x3a3632)));
    quad(b.m, V(x0, y - 0.05, z0), V(x1, y - 0.05, z0), V(x1, y - 0.05, z1), V(x0, y - 0.05, z1), (p, nn, out) => out.copy(BOARD).multiplyScalar(0.5));
    b.blocker((x0 + x1) / 2, y, (z0 + z1) / 2, (x1 - x0) / 2, 0.06, (z1 - z0) / 2);
  }
  // the walls, for the camera
  const top = o.parapet ? eave + o.parapet : eave;
  const hh = (eave - fl) / 2;
  b.blocker((x0 + x1) / 2, fl + hh, z1, (x1 - x0) / 2, hh, 0.12);
  b.blocker((x0 + x1) / 2, fl + hh, z0, (x1 - x0) / 2, hh, 0.12);
  b.blocker(x0, fl + hh, (z0 + z1) / 2, 0.12, hh, (z1 - z0) / 2);
  b.blocker(x1, fl + hh, (z0 + z1) / 2, 0.12, hh, (z1 - z0) / 2);
  if (o.parapet) b.blocker((x0 + x1) / 2, (eave + top) / 2, z1, (x1 - x0) / 2, (top - eave) / 2 + 0.1, 0.12);

  // the weather: greyed by the sun, mossy where the rain sits
  const grey = (b.style === 'western' ? 0.25 : 0.08) + decay * 0.55;
  weather(b.m, from, grey, b.dark ? 0.35 : decay * 0.6);
  b.after = b.m.n;
  if (b.style === 'creepy') {
    b.lean = (b.rnd() - 0.5) * 2 * 0.035;
    b.leanFrom = fl;
  }
  return { floor: fl, eave, ridge, lo, hi, walls, top };
}

// Bend a mesh over from `from` up, by `k` across its width (x per metre up).
function lean(m, start, k, from) {
  const p = m.pos;
  for (let i = start * 3; i < m.n * 3; i += 3) {
    const up = p[i + 1] - from;
    if (up > 0) p[i] += up * k;
  }
}

// ── Things in and about them ─────────────────────────────────────────────────
function barrel(b, x, z, y = null, r = 0.28, h = 0.8) {
  const gy = y ?? b.g(x, z);
  const k = 0.8 + b.rnd() * 0.3;
  b.m.add(new THREE.CylinderGeometry(r, r, h, 9, 1), new THREE.Matrix4().makeTranslation(x, gy + h / 2, z), (p, n, out) =>
    Math.abs(p.y) > h * 0.3 && Math.abs(p.y) < h * 0.38 ? out.copy(OLD.iron) : out.copy(BOARD).multiplyScalar(k * (0.85 + 0.15 * Math.sin(Math.atan2(p.z, p.x) * 9))),
  );
  b.solid(x, z, x, z, r + 0.02, gy - 0.2, gy + h, { step: h + 0.1 });
}

function crate(b, x, z, y = null, s = 0.6) {
  const gy = y ?? b.g(x, z);
  box(b.m, x, gy + s / 2, z, s, s, s, tone(lin(0x9a7a50), b.rnd, 0.25), 0, b.rnd() * 0.6, 0);
  b.solid(x, z, x, z, s * 0.55, gy - 0.2, gy + s, { step: s + 0.1 });
}

function bench(b, x, z, yaw = 0, y = null) {
  const gy = y ?? b.g(x, z);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  box(b.m, x, gy + 0.45, z, 1.6, 0.06, 0.4, tone(BOARD, b.rnd, 0.15), 0, yaw, 0);
  box(b.m, x - s * 0.18, gy + 0.72, z - c * 0.18, 1.6, 0.3, 0.05, tone(BOARD, b.rnd, 0.15), 0, yaw, 0);
  for (const e of [-0.7, 0.7]) box(b.m, x + c * e, gy + 0.22, z - s * e, 0.06, 0.45, 0.36, OLD.iron, 0, yaw, 0);
  b.solid(x - c * 0.75, z + s * 0.75, x + c * 0.75, z - s * 0.75, 0.25, gy - 0.2, gy + 0.48, { step: 0.55 });
}

function lamp(b, x, z, y = null) {
  const gy = y ?? b.g(x, z);
  rod(b.m, [x, gy - 0.2, z], [x, gy + 2.6, z], 0.05, OLD.iron, 6);
  box(b.m, x, gy + 2.62, z, 0.3, 0.05, 0.3, OLD.iron);
  box(b.m, x, gy + 3.02, z, 0.36, 0.06, 0.36, OLD.iron);
  const lit = b.alive && !b.dark;
  const m = lit ? b.glow : b.m;
  box(m, x, gy + 2.82, z, 0.24, 0.36, 0.24, lit ? (p, n, out) => out.copy(LIT) : GLASS);
  b.solid(x, z, x, z, 0.08, gy - 0.2, gy + 2.6);
}

function hitchRail(b, x0, x1, z) {
  const ga = b.g(x0, z);
  const gb = b.g(x1, z);
  for (const [x, g] of [[x0, ga], [x1, gb]]) rod(b.m, [x, g - 0.2, z], [x, g + 1.0, z], 0.06, WOOD.bark, 6);
  rod(b.m, [x0 - 0.1, ga + 0.95, z], [x1 + 0.1, gb + 0.95, z], 0.05, WOOD.bark, 6);
  b.solid(x0, z, x1, z, 0.08, Math.min(ga, gb) - 0.2, Math.max(ga, gb) + 1.0);
}

function trough(b, x, z, len = 1.8, yaw = 0) {
  const gy = b.g(x, z);
  box(b.m, x, gy + 0.3, z, len, 0.5, 0.6, tone(BOARD, b.rnd, 0.1), 0, yaw, 0);
  box(b.m, x, gy + 0.52, z, len - 0.1, 0.02, 0.5, lin(0x2d3f46), 0, yaw, 0);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  b.solid(x - (c * len) / 2, z + (s * len) / 2, x + (c * len) / 2, z - (s * len) / 2, 0.32, gy - 0.2, gy + 0.55, { step: 0.6 });
}

// A wagon in the street, or what's left of one.
function wagon(b, x, z, yaw, broken) {
  const gy = b.g(x, z);
  const m = b.part(V(x, gy, z), yaw);
  const tilt = broken ? 0.22 : 0;
  const bed = (p, n, out) => out.copy(BOARD).multiplyScalar(0.8 + phash(Math.round(p.x * 5), 1, b.seed) * 0.3);
  box(m, 0, 0.95 - tilt, 0, 1.3, 0.08, 3.0, bed, 0, 0, broken ? 0.18 : 0);
  for (const s of [-1, 1]) box(m, s * 0.63, 1.15 - tilt * (s > 0 ? 1.6 : 0.4), 0, 0.06, 0.38, 3.0, bed, 0, 0, broken ? 0.18 : 0);
  for (const [wx, wz, r] of [[-0.78, 1.05, 0.5], [0.78, 1.05, 0.5], [-0.78, -1.05, 0.62], [0.78, -1.05, 0.62]]) {
    if (broken && wx > 0 && wz > 0) {
      // ...and its wheel lying in the dirt beside it
      m.add(new THREE.TorusGeometry(r, 0.04, 4, 14), new THREE.Matrix4().compose(V(wx + 0.9, 0.06, wz), _q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)), (p, n, out) => out.copy(BOARD).multiplyScalar(0.7));
      continue;
    }
    const at = new THREE.Matrix4().compose(V(wx, r, wz), _q.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), V(1, 1, 1));
    m.add(new THREE.TorusGeometry(r, 0.045, 4, 14), at, (p, n, out) => out.copy(OLD.iron).lerp(BOARD, 0.5));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      rod(m, [wx, r + Math.cos(a) * r, wz + Math.sin(a) * r], [wx, r - Math.cos(a) * r, wz - Math.sin(a) * r], 0.02, BOARD, 4);
    }
  }
  rod(m, [0, 0.55, 1.5], [0.1, 0.25, 3.2], 0.04, BOARD, 5);
  weather(m, 0, 0.3 + b.decay * 0.5, b.decay * 0.4);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  b.solid(x - s * 1.4, z - c * 1.4, x + s * 1.4, z + c * 1.4, 0.75, gy - 0.2, gy + 1.3);
}

// A tree that has died where it stood: a dark town's, a graveyard's.
function deadTree(b, x, z, h = 6) {
  const gy = b.g(x, z);
  const rnd = b.rnd;
  const grow = (a, dir, len, r, depth) => {
    const e = [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len];
    rod(b.m, a, e, r, DEAD, 5);
    if (depth === 0) return;
    const n = depth > 1 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const yaw = rnd() * Math.PI * 2;
      const up = 0.3 + rnd() * 0.6;
      const d = [Math.cos(yaw) * (1 - up) + dir[0] * 0.4, up + dir[1] * 0.3, Math.sin(yaw) * (1 - up) + dir[2] * 0.4];
      const l = Math.hypot(...d);
      grow(e, d.map((v) => v / l), len * (0.5 + rnd() * 0.2), r * 0.6, depth - 1);
    }
  };
  grow([x, gy - 0.3, z], [0, 1, 0], h * 0.45, 0.16, 3);
  b.solid(x, z, x, z, 0.2, gy - 0.3, gy + h * 0.45);
}

// A picket fence along x at z, from x0 to x1, with a gate's gap; or iron
// railings with spikes, or a rail fence.
function fence(b, x0, x1, z, { kind = 'picket', gate = null, color = null } = {}) {
  const decay = b.decay;
  const spacing = kind === 'picket' ? 0.16 : kind === 'iron' ? 0.14 : 2.2;
  const n = Math.max(1, Math.round((x1 - x0) / spacing));
  const col = color || (kind === 'iron' ? OLD.iron : kind === 'rail' ? WOOD.bark : b.look.trim);
  const hgt = kind === 'iron' ? 1.35 : kind === 'picket' ? 0.95 : 1.1;
  const runs = gate ? [[x0, gate[0]], [gate[1], x1]] : [[x0, x1]];
  for (const [a, c] of runs) {
    if (c - a < 0.1) continue;
    const k = Math.max(1, Math.round((c - a) / spacing));
    for (let i = 0; i <= k; i++) {
      const x = a + ((c - a) * i) / k;
      const gy = b.g(x, z);
      if (decay && b.rnd() < decay * 0.25) continue;
      const tilt = decay ? (b.rnd() - 0.5) * decay * 0.5 : 0;
      if (kind === 'picket') box(b.m, x, gy + hgt / 2 - 0.1, z, 0.07, hgt, 0.025, tone(col, b.rnd, 0.1), 0, 0, tilt);
      else if (kind === 'iron') {
        rod(b.m, [x, gy - 0.1, z], [x + tilt * 0.3, gy + hgt, z], 0.012, col, 4);
        box(b.m, x + tilt * 0.3, gy + hgt + 0.05, z, 0.03, 0.1, 0.03, col, 0, 0.785, 0);
      } else rod(b.m, [x, gy - 0.2, z], [x, gy + hgt, z], 0.06, col, 5);
    }
    const ga = b.g(a, z);
    const gc = b.g(c, z);
    for (const y of kind === 'iron' ? [0.15, hgt - 0.1] : kind === 'picket' ? [0.25, hgt - 0.3] : [0.45, 0.95]) {
      if (decay && b.rnd() < decay * 0.4) continue;
      rod(b.m, [a, ga + y, z - 0.02], [c, gc + y, z - 0.02], kind === 'rail' ? 0.045 : 0.02, col, 4);
    }
    b.solid(a, z, c, z, 0.06, Math.min(ga, gc) - 0.2, Math.max(ga, gc) + hgt);
  }
  return n;
}

// Flowers in a bed: a tuft of leaves with a head of colour, here and there.
function flowers(b, x0, z0, x1, z1, n) {
  for (let i = 0; i < n; i++) {
    const x = x0 + b.rnd() * (x1 - x0);
    const z = z0 + b.rnd() * (z1 - z0);
    const gy = b.g(x, z);
    const c = pick(FLOWERS, b.rnd);
    box(b.m, x, gy + 0.12, z, 0.22, 0.26, 0.22, LEAF, 0, b.rnd(), 0);
    box(b.m, x, gy + 0.3, z, 0.12, 0.1, 0.12, c, 0, b.rnd(), 0);
  }
}

// A sign: a board with its lettering, as strokes too small to read.
function sign(b, x, y, z, w, h, color, ink, yaw = 0) {
  box(b.m, x, y, z, w, h, 0.06, color, 0, yaw, 0);
  let u = -w / 2 + 0.15;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  while (u < w / 2 - 0.2) {
    const lw = 0.08 + b.rnd() * 0.14;
    if (b.rnd() < 0.15) {
      u += 0.12;
      continue;
    }
    const lx = u + lw / 2;
    box(b.m, x + lx * c + 0.035 * s, y, z - lx * s + 0.035 * c, lw, h * 0.55, 0.02, ink, 0, yaw, 0);
    u += lw + 0.05;
  }
}

function chimney(b, x, z, from, top, color = lin(0x8a4a38)) {
  for (let y = from; y < top; y += 0.25) {
    const k = 0.8 + b.rnd() * 0.3;
    box(b.m, x, y + 0.125, z, 0.6, 0.24, 0.6, (p, n, out) => out.copy(color).multiplyScalar(k));
  }
  box(b.m, x, top + 0.05, z, 0.72, 0.1, 0.72, (p, n, out) => out.copy(color).multiplyScalar(0.7));
}

function stovepipe(b, x, z, from, top) {
  rod(b.m, [x, from, z], [x, top, z], 0.08, OLD.iron, 7);
  box(b.m, x, top + 0.08, z, 0.26, 0.04, 0.26, OLD.iron);
}

// Shelves on a wall along x at z, stocked.
function shelves(b, x0, x1, z, y, rows = 3, stocked = true) {
  for (let r = 0; r < rows; r++) {
    const yy = y + 0.4 + r * 0.55;
    box(b.m, (x0 + x1) / 2, yy, z, x1 - x0, 0.04, 0.4, BOARD);
    if (!stocked) continue;
    for (let x = x0 + 0.15; x < x1 - 0.15; x += 0.18 + b.rnd() * 0.15) {
      if (b.decay && b.rnd() < b.decay) continue;
      const h = 0.12 + b.rnd() * 0.2;
      box(b.m, x, yy + h / 2 + 0.02, z, 0.12, h, 0.14 + b.rnd() * 0.1, pick(GOODS, b.rnd));
    }
  }
}

function table(b, x, z, y, w = 1.0, d = 0.8, chairs = 2) {
  box(b.m, x, y + 0.74, z, w, 0.05, d, tone(BOARD, b.rnd, 0.15));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(b.m, x + sx * (w / 2 - 0.06), y + 0.36, z + sz * (d / 2 - 0.06), 0.06, 0.72, 0.06, BOARD);
  for (let i = 0; i < chairs; i++) {
    const s = i % 2 ? 1 : -1;
    const cz = z + s * (d / 2 + 0.3);
    box(b.m, x, y + 0.44, cz, 0.42, 0.05, 0.42, BOARD);
    box(b.m, x, y + 0.7, cz + s * 0.2, 0.42, 0.5, 0.04, BOARD);
    for (const [ax, az] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) box(b.m, x + ax, y + 0.22, cz + az, 0.04, 0.44, 0.04, BOARD);
  }
  b.solid(x - w / 2 + d / 2, z, x + w / 2 - d / 2, z, d / 2, y, y + 0.78);
}

function stove(b, x, z, y, top) {
  box(b.m, x, y + 0.4, z, 0.7, 0.8, 0.55, OLD.iron);
  stovepipe(b, x, z, y + 0.8, top);
  b.solid(x, z, x, z, 0.4, y, y + 0.85);
}

function counter(b, x0, x1, z, y, color = BOARD) {
  box(b.m, (x0 + x1) / 2, y + 0.5, z, x1 - x0, 1.0, 0.6, tone(color, b.rnd, 0.1));
  box(b.m, (x0 + x1) / 2, y + 1.03, z, x1 - x0 + 0.1, 0.06, 0.72, tone(BOARD, b.rnd, 0.1));
  b.solid(x0 + 0.3, z, x1 - 0.3, z, 0.32, y, y + 1.06);
}

function bed(b, x, z, y, yaw = 0) {
  box(b.m, x, y + 0.3, z, 1.0, 0.32, 2.0, BOARD, 0, yaw, 0);
  box(b.m, x, y + 0.5, z, 0.95, 0.1, 1.9, b.dark ? lin(0x3a2a2a) : lin(0x8a4a3c), 0, yaw, 0);
  box(b.m, x, y + 0.58, z - Math.cos(yaw) * 0.75, 0.6, 0.1, 0.35, lin(0xe8e0d0), 0, yaw, 0);
  b.solid(x, z - 0.6, x, z + 0.6, 0.5, y, y + 0.55);
}

// ── The buildings ────────────────────────────────────────────────────────────
// Each is handed the Builder and its lot; the lot's body (bodyOf) is where
// its walls go, and anything in front of that is porch, boardwalk or garden.
const BUILD = {
  // A western store: a false front over the street, a boardwalk under an
  // awning, display windows either side of the door.
  store(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const D = z1 - z0;
    const win = { y: 0.7, h: 1.6, kind: 'window', plain: b.rnd() < 0.5 };
    const h = body(b, {
      x0, z0, x1, z1,
      storey: 3.2,
      roof: { axis: 'z', pitch: 0.36, over: 0.3 },
      parapet: 1.5 + b.rnd() * 0.8,
      openings: {
        front: [{ c: 0, w: 1.1, y: 0, h: 2.25, kind: 'door' }, { ...win, c: -W / 4 - 0.25, w: Math.min(1.6, W / 4) }, { ...win, c: W / 4 + 0.25, w: Math.min(1.6, W / 4) }],
        left: [{ c: (b.rnd() - 0.5) * D * 0.4, w: 0.8, y: 1.1, h: 1.1, kind: 'window' }],
        right: [{ c: (b.rnd() - 0.5) * D * 0.4, w: 0.8, y: 1.1, h: 1.1, kind: 'window' }],
        back: b.rnd() < 0.5 ? [{ c: W / 4, w: 0.9, y: 0, h: 2.0, kind: 'door' }] : [],
      },
    });
    falseFront(b, h, x0, x1, z1);
    porch(b, { x0, x1, z0: z1, z1: lot.d / 2, deck: h.floor, roofY: h.floor + 2.75, cover: b.look.cover === 'tin' ? 'tin' : 'board', color: b.look.cover === 'tin' ? b.look.roof : BOARD, steps: [-0.7, 0.7], decay: b.decay });
    if (!lot.ruin) {
      counter(b, x0 + 0.5, x0 + 0.5 + Math.min(3.5, D * 0.5), z0 + D * 0.55, h.floor);
      shelves(b, x0 + 0.3, x1 - 0.3, z0 + 0.3, h.floor, 3, !b.decay || b.decay < 0.6);
      stove(b, x1 - 0.8, z0 + D * 0.45, h.floor, h.ridge + 0.6);
      barrel(b, x1 - 0.6, z1 - 0.6, h.floor);
    }
    barrel(b, x0 + 0.5, z1 + 0.6, h.floor);
    if (b.rnd() < 0.6) crate(b, x1 - 0.55, z1 + 0.5, h.floor);
    if (b.rnd() < 0.5) hitchRail(b, x0 + 0.6, x1 - 0.6, lot.d / 2 + 0.7);
  },

  // A saloon: two floors behind a false front, a balcony over the boardwalk,
  // swinging doors, and inside a long bar, tables and a piano.
  saloon(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const D = z1 - z0;
    const up = { y: STOREY + 0.6, h: 1.5, kind: 'window', w: 0.9 };
    const h = body(b, {
      x0, z0, x1, z1,
      storeys: 2,
      storey: STOREY,
      roof: { axis: 'z', pitch: 0.32, over: 0.3 },
      parapet: 1.8,
      openings: {
        front: [
          { c: 0, w: 1.4, y: 0, h: 2.3, kind: 'door', batwing: true },
          { c: -W / 3, w: 1.5, y: 0.75, h: 1.5, kind: 'window', lit: b.alive ? 0.95 : 0 },
          { c: W / 3, w: 1.5, y: 0.75, h: 1.5, kind: 'window', lit: b.alive ? 0.95 : 0 },
          { ...up, c: -W / 3 },
          { c: 0, w: 1.0, y: STOREY, h: 2.1, kind: 'door' },
          { ...up, c: W / 3 },
        ],
        left: [{ c: -D / 4, w: 0.9, y: 1.0, h: 1.2, kind: 'window', lit: b.alive ? 0.9 : 0 }, { ...up, c: D / 4 }],
        right: [{ c: D / 4, w: 0.9, y: 1.0, h: 1.2, kind: 'window', lit: b.alive ? 0.9 : 0 }, { ...up, c: -D / 4 }],
        back: [{ c: W / 3, w: 0.9, y: 0, h: 2.0, kind: 'door' }],
      },
    });
    falseFront(b, h, x0, x1, z1);
    porch(b, { x0, x1, z0: z1, z1: lot.d / 2, deck: h.floor, roofY: h.floor + STOREY - 0.1, cover: 'board', color: BOARD, steps: [-1.0, 1.0], decay: b.decay });
    // the balcony's rail, over the boardwalk's roof
    if (!lot.ruin) {
      const by = h.floor + STOREY + 0.35;
      const z = lot.d / 2 - 0.15;
      rod(b.m, [x0, by + 0.9, z], [x1, by + 0.9, z], 0.04, b.look.trim);
      for (let x = x0 + 0.1; x < x1; x += 0.3) {
        if (b.decay && b.rnd() < b.decay * 0.4) continue;
        box(b.m, x, by + 0.45, z, 0.05, 0.9, 0.05, b.look.trim);
      }
    }
    if (!lot.ruin) {
      // the bar, and the bottles behind it
      const bx = x1 - 1.3;
      box(b.m, bx, h.floor + 0.55, (z0 + z1) / 2 - 0.4, 0.6, 1.1, D * 0.6, tone(lin(0x5a3a24), b.rnd, 0.1));
      box(b.m, bx, h.floor + 1.12, (z0 + z1) / 2 - 0.4, 0.75, 0.06, D * 0.6 + 0.1, tone(lin(0x6a4a2c), b.rnd, 0.1));
      const mid = (z0 + z1) / 2 - 0.4;
      b.solid(bx, mid - D * 0.3 + 0.3, bx, mid + D * 0.3 - 0.3, 0.36, h.floor, h.floor + 1.15);
      for (let r = 0; r < 2; r++) {
        const y = h.floor + 1.3 + r * 0.5;
        box(b.m, x1 - 0.3, y, (z0 + z1) / 2 - 0.4, 0.3, 0.04, D * 0.55, BOARD);
        for (let z = z0 + D * 0.25; z < z1 - D * 0.35; z += 0.14) {
          if (b.decay && b.rnd() < b.decay) continue;
          box(b.m, x1 - 0.3, y + 0.14, z, 0.08, 0.24, 0.08, pick([lin(0x3a5a2a), lin(0x6a3a1a), lin(0xc0b090), lin(0x2a3a4a)], b.rnd));
        }
      }
      // tables, and a piano against the wall
      table(b, x0 + 1.6, z0 + D * 0.35, h.floor, 1.0, 1.0, 2);
      table(b, x0 + 1.6, z0 + D * 0.7, h.floor, 1.0, 1.0, 2);
      if (W > 8.5) table(b, (x0 + x1) / 2 - 0.6, z0 + D * 0.5, h.floor, 0.9, 0.9, 2);
      box(b.m, x0 + 0.45, h.floor + 0.65, z0 + 1.6, 0.6, 1.3, 1.5, lin(0x2a1c14));
      box(b.m, x0 + 0.85, h.floor + 0.75, z0 + 1.6, 0.3, 0.05, 1.3, lin(0xe8e2d0));
      b.solid(x0 + 0.5, z0 + 1.0, x0 + 0.5, z0 + 2.2, 0.4, h.floor, h.floor + 1.3);
      b.piano = toWorld(lot, x0 + 0.6, z0 + 1.6);
    }
    hitchRail(b, x0 + 0.6, x1 - 0.6, lot.d / 2 + 0.7);
    barrel(b, x1 - 0.5, z1 + 0.55, h.floor);
    sign(b, (x0 + x1) / 2, h.floor + STOREY * 2 + 1.0, z1 + 0.08, W * 0.7, 0.7, lin(0x2a2018), lin(0xd8c090));
  },

  // A hotel: two floors and a balcony all along the front.
  hotel(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const front = [{ c: 0, w: 1.2, y: 0, h: 2.3, kind: 'door' }];
    for (const c of [-W / 3, W / 3]) front.push({ c, w: 1.2, y: 0.8, h: 1.4, kind: 'window' });
    for (const c of [-W * 0.36, -W * 0.12, W * 0.12, W * 0.36]) front.push({ c, w: 0.8, y: STOREY + 0.6, h: 1.4, kind: 'window', shutters: b.style !== 'western' });
    const h = body(b, {
      x0, z0, x1, z1,
      storeys: 2,
      roof: { axis: 'x', pitch: 0.42, over: 0.45 },
      openings: {
        front,
        back: [{ c: 0, w: 0.9, y: 0, h: 2.0, kind: 'door' }, { c: -W / 3, w: 0.8, y: STOREY + 0.6, h: 1.3, kind: 'window' }, { c: W / 3, w: 0.8, y: STOREY + 0.6, h: 1.3, kind: 'window' }],
        left: [{ c: 0, w: 0.8, y: STOREY + 0.6, h: 1.3, kind: 'window' }],
        right: [{ c: 0, w: 0.8, y: 1.0, h: 1.2, kind: 'window' }],
      },
    });
    porch(b, { x0, x1, z0: z1, z1: lot.d / 2, deck: h.floor, roofY: h.floor + STOREY - 0.1, cover: 'board', color: BOARD, steps: [-0.9, 0.9], decay: b.decay, posts: [x0 + 0.12, x0 + W / 3, x1 - W / 3, x1 - 0.12] });
    if (!lot.ruin) {
      const by = h.floor + STOREY + 0.35;
      rod(b.m, [x0, by + 0.9, lot.d / 2 - 0.15], [x1, by + 0.9, lot.d / 2 - 0.15], 0.04, b.look.trim);
      for (let x = x0 + 0.1; x < x1; x += 0.35) box(b.m, x, by + 0.45, lot.d / 2 - 0.15, 0.05, 0.9, 0.05, b.look.trim);
      counter(b, x0 + 0.6, x0 + 2.6, z0 + 2.0, h.floor, lin(0x5a3a24));
      for (let i = 0; i < 6; i++) box(b.m, x1 - 0.8, h.floor + 0.12 + i * 0.25, z0 + 0.6 + i * 0.3, 1.0, 0.25, 0.3, BOARD);
      chimney(b, x0 + 0.6, (z0 + z1) / 2, h.eave - 0.5, h.ridge + 0.9);
    }
    sign(b, (x0 + x1) / 2, h.eave + 0.2, z1 + 0.5, W * 0.55, 0.55, b.look.trim, lin(0x2a2018));
    bench(b, x0 + 1.4, z1 + 0.5, 0, h.floor);
  },

  // A bank: dressed stone, a flat roof behind a cornice, bars on the windows.
  bank(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const stoneC = pick([lin(0xb0a48a), lin(0x9c8a72), lin(0x8a7a6a)], b.rnd);
    const h = body(b, {
      x0, z0, x1, z1,
      storey: 3.8,
      roof: null,
      flatParapet: 0.7,
      siding: 'stone',
      color: stoneC,
      foundation: 'stone',
      lift: 0.5,
      trim: lin(0x5a4a3a),
      openings: {
        front: [{ c: 0, w: 1.2, y: 0, h: 2.5, kind: 'door', color: lin(0x3a2a1c) }, { c: -W / 3, w: 1.0, y: 0.9, h: 1.8, kind: 'window', bars: true }, { c: W / 3, w: 1.0, y: 0.9, h: 1.8, kind: 'window', bars: true }],
        left: [{ c: 0, w: 0.8, y: 1.2, h: 1.4, kind: 'window', bars: true }],
        right: [{ c: 0, w: 0.8, y: 1.2, h: 1.4, kind: 'window', bars: true }],
      },
    });
    if (!lot.ruin) {
      box(b.m, (x0 + x1) / 2, h.eave + 0.75, z1 + 0.08, W + 0.4, 0.22, 0.3, (p, n, out) => out.copy(stoneC).multiplyScalar(0.9));
      box(b.m, (x0 + x1) / 2, h.eave + 0.05, z1 + 0.05, W + 0.2, 0.14, 0.2, (p, n, out) => out.copy(stoneC).multiplyScalar(0.8));
      sign(b, (x0 + x1) / 2, h.eave - 0.45, z1 + 0.06, W * 0.6, 0.45, lin(0x2a2420), lin(0xd8c48a));
      counter(b, x0 + 0.4, x1 - 0.4, z0 + 2.4, h.floor, lin(0x4a3424));
      for (let x = x0 + 0.6; x < x1 - 0.5; x += 0.12) rod(b.m, [x, h.floor + 1.08, z0 + 2.4], [x, h.floor + 1.9, z0 + 2.4], 0.012, lin(0xb09a50), 3);
      box(b.m, x1 - 1.0, h.floor + 0.6, z0 + 0.7, 1.0, 1.2, 0.8, lin(0x2a2a2c));
      box(b.m, x1 - 1.0, h.floor + 0.6, z0 + 1.11, 0.25, 0.25, 0.02, lin(0xb09a50));
      b.solid(x1 - 1.0, z0 + 0.7, x1 - 1.0, z0 + 0.7, 0.55, h.floor, h.floor + 1.2);
    }
    const front = lot.d / 2;
    if (front - z1 > 0.3) stepsUp(b, front, -0.8, 0.8, h.floor, WOOD.stone);
    porch(b, { x0: -0.9, x1: 0.9, z0: z1, z1: front, deck: h.floor, decay: b.decay * 0.5 });
  },

  // The sheriff's office and the jail: a porch with a bench on it, and a cell
  // at the back behind bars.
  jail(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const D = z1 - z0;
    const stone = b.rnd() < 0.4;
    const h = body(b, {
      x0, z0, x1, z1,
      storey: 3.0,
      roof: { axis: 'x', pitch: 0.34, over: 0.4 },
      siding: stone ? 'stone' : undefined,
      color: stone ? lin(0x9a8c78) : undefined,
      openings: {
        front: [{ c: -W / 5, w: 1.0, y: 0, h: 2.2, kind: 'door' }, { c: W / 4, w: 1.0, y: 0.9, h: 1.3, kind: 'window', bars: true }],
        left: [{ c: -D / 4, w: 0.6, y: 1.5, h: 0.7, kind: 'window', bars: true, plain: true }],
        right: [{ c: D / 4, w: 0.6, y: 1.5, h: 0.7, kind: 'window', bars: true, plain: true }],
      },
    });
    porch(b, { x0, x1, z0: z1, z1: lot.d / 2, deck: h.floor, roofY: h.floor + 2.6, cover: b.look.cover === 'tin' ? 'tin' : 'board', color: b.look.cover === 'tin' ? b.look.roof : BOARD, steps: [-W / 5 - 0.6, -W / 5 + 0.6], decay: b.decay });
    bench(b, W / 5 + 0.3, z1 + 0.45, 0, h.floor);
    if (!lot.ruin) {
      // the cell
      const cz = z0 + D * 0.38;
      for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.16) {
        if (Math.abs(x - (x0 + W * 0.7)) < 0.4) continue;
        rod(b.m, [x, h.floor, cz], [x, h.eave, cz], 0.016, OLD.iron, 4);
      }
      rod(b.m, [x0, h.floor + 2.0, cz], [x1, h.floor + 2.0, cz], 0.02, OLD.iron, 4);
      b.solid(x0 + 0.1, cz, x0 + W * 0.7 - 0.45, cz, 0.06, h.floor, h.eave);
      b.solid(x0 + W * 0.7 + 0.45, cz, x1 - 0.1, cz, 0.06, h.floor, h.eave);
      box(b.m, x0 + 0.6, h.floor + 0.25, z0 + 1.0, 0.8, 0.12, 1.8, BOARD);
      table(b, x1 - 1.4, z1 - 1.6, h.floor, 1.2, 0.7, 1);
      stove(b, x0 + 0.7, z1 - 1.2, h.floor, h.ridge + 0.5);
    }
  },

  // A livery stable: a big barn with its doors open, a hayloft above, and
  // stalls inside.
  livery(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const D = z1 - z0;
    const red = b.style !== 'creepy' && b.rnd() < 0.5;
    const h = body(b, {
      x0, z0, x1, z1,
      storey: 4.0,
      lift: 0.15,
      siding: 'board',
      color: red ? lin(0x8a3a2a) : undefined,
      roof: { axis: 'z', pitch: 0.62, over: 0.5 },
      openings: {
        front: [{ c: 0, w: 3.0, y: 0, h: 3.2, kind: 'big' }, { c: 0, w: 1.3, y: 4.3, h: 1.3, kind: 'gap' }],
        back: [{ c: 0, w: 1.4, y: 0, h: 2.4, kind: 'door' }],
        left: [{ c: -D / 4, w: 0.7, y: 1.6, h: 0.7, kind: 'window', plain: true }, { c: D / 4, w: 0.7, y: 1.6, h: 0.7, kind: 'window', plain: true }],
        right: [{ c: -D / 4, w: 0.7, y: 1.6, h: 0.7, kind: 'window', plain: true }, { c: D / 4, w: 0.7, y: 1.6, h: 0.7, kind: 'window', plain: true }],
      },
    });
    if (!lot.ruin) {
      // the hoist beam over the loft door
      rod(b.m, [0, h.floor + 5.9, z1 - 1.0], [0, h.floor + 5.9, z1 + 0.9], 0.1, WOOD.bark, 6);
      rod(b.m, [0, h.floor + 5.85, z1 + 0.8], [0, h.floor + 4.6, z1 + 0.8], 0.012, OLD.rope, 3);
      // stalls down the right-hand side
      for (let z = z0 + 0.1; z < z1 - 2.5; z += 2.4) box(b.m, x1 - 1.2, h.floor + 0.7, z, 2.3, 1.4, 0.06, tone(BOARD, b.rnd, 0.15));
      for (let z = z0 + 0.1; z < z1 - 4.9; z += 2.4) {
        box(b.m, x1 - 2.35, h.floor + 0.55, z + 1.2, 0.06, 1.1, 1.4, tone(BOARD, b.rnd, 0.15));
        b.solid(x1 - 2.35, z + 0.6, x1 - 2.35, z + 1.8, 0.08, h.floor, h.floor + 1.1);
      }
      for (let i = 0; i < 5; i++) {
        const x = x0 + 0.7 + b.rnd() * 1.2;
        const z = z0 + 0.6 + i * 0.85;
        box(b.m, x, h.floor + 0.25 + (i % 2) * 0.5, z, 1.0, 0.5, 0.75, (p, n, out) => out.copy(HAY).multiplyScalar(0.85 + Math.sin(p.x * 13 + p.z * 7) * 0.08));
      }
      b.solid(x0 + 1.2, z0 + 0.6, x0 + 1.2, z0 + 4.0, 0.7, h.floor, h.floor + 1.0);
    }
    trough(b, x1 + 0.2 - 1.2, lot.d / 2 + 0.4, 1.8);
    if (b.rnd() < 0.7) wagon(b, x0 - 1.8 + W * 0.2, lot.d / 2 + 2.6, Math.PI / 2 + (b.rnd() - 0.5) * 0.4, b.decay > 0.4);
  },

  // A smithy: open to the street, a forge with its chimney, an anvil.
  smithy(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const h = body(b, {
      x0, z0, x1, z1,
      storey: 3.0,
      lift: 0.12,
      siding: 'board',
      roof: { axis: 'x', pitch: 0.4, over: 0.4 },
      openings: { front: [{ c: 0, w: W - 0.8, y: 0, h: 2.7, kind: 'gap' }], back: [{ c: W / 4, w: 0.7, y: 1.2, h: 0.8, kind: 'window', plain: true }] },
      floorColor: lin(0x5a5048),
    });
    const fx = x0 + 1.1;
    const fz = z0 + 1.2;
    for (let y = h.floor; y < h.floor + 0.9; y += 0.3) stone(b.m, fx, y + 0.15, fz, 1.2, b.seed + Math.round(y * 10), 0.3);
    box(b.m, fx, h.floor + 0.8, fz, 1.1, 0.25, 1.0, WOOD.stoneDark);
    const hot = b.alive && !b.dark;
    box(hot ? b.glow : b.m, fx, h.floor + 0.94, fz, 0.6, 0.04, 0.5, hot ? (p, n, out) => out.copy(COALS) : OLD.ash);
    chimney(b, fx, z0 + 0.45, h.floor + 1.0, h.ridge + 0.8, WOOD.stoneDark);
    b.solid(fx, fz, fx, fz, 0.65, h.floor, h.floor + 0.95);
    // the anvil on its stump, and the quench barrel
    const ax = x0 + 2.9;
    const az = z0 + 2.4;
    addRoundLog(b.m, new THREE.Matrix4().makeTranslation(ax, h.floor + 0.3, az), 0.6, b.seed + 3, 0.28, 0.02);
    box(b.m, ax, h.floor + 0.7, az, 0.65, 0.22, 0.25, OLD.iron);
    box(b.m, ax + 0.4, h.floor + 0.74, az, 0.25, 0.1, 0.12, OLD.iron);
    b.solid(ax, az, ax, az, 0.35, h.floor, h.floor + 0.8);
    barrel(b, x1 - 0.7, z0 + 0.8, h.floor);
    for (let i = 0; i < 4; i++) rod(b.m, [x1 - 0.12, h.floor + 1.0 + i * 0.12, z0 + 1.4 + i * 0.3], [x1 - 0.12, h.floor + 1.6, z0 + 1.4 + i * 0.3], 0.02, OLD.iron, 4);
  },

  // A shack of grey boards and a tin roof, with a stovepipe.
  shack(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const h = body(b, {
      x0, z0, x1, z1,
      storey: 2.5,
      lift: 0.3,
      siding: 'board',
      color: BOARD,
      roof: { axis: 'x', pitch: 0.22, over: 0.35, cover: 'tin', color: lin(0x8d8a82) },
      openings: { front: [{ c: -W / 5, w: 0.9, y: 0, h: 2.0, kind: 'door' }, { c: W / 4, w: 0.7, y: 1.0, h: 0.8, kind: 'window' }], left: [{ c: 0, w: 0.6, y: 1.1, h: 0.7, kind: 'window', plain: true }] },
    });
    if (!lot.ruin) {
      stovepipe(b, x1 - 0.6, z0 + 0.7, h.floor + 0.8, h.ridge + 0.8);
      bed(b, x0 + 0.7, (z0 + z1) / 2, h.floor);
    }
    porch(b, { x0: -W / 5 - 0.7, x1: -W / 5 + 0.7, z0: z1, z1: lot.d / 2, deck: h.floor, decay: b.decay });
    if (b.rnd() < 0.5) barrel(b, x1 + 0.1 - 0.4, z1 + 0.45);
  },

  // A house: a painted cottage behind a picket fence in a village, a plain
  // board house in a western town, a dark one with its shutters hanging in
  // the woods.
  house(b, lot) {
    const front = b.style === 'village' ? 1.9 : 1.8; // the porch; the rest is garden
    const [x0, z0, x1] = bodyOf(lot);
    const z1 = lot.d / 2 - lot.front;
    const W = x1 - x0;
    const D = z1 - z0;
    const village = b.style === 'village';
    const dark = b.dark;
    const shut = village || (dark && b.rnd() < 0.7);
    const win = (c, y = 0.85) => ({ c, w: 0.85, y, h: dark ? 1.6 : 1.3, kind: 'window', shutters: shut });
    const h = body(b, {
      x0, z0, x1, z1,
      storey: village ? 2.9 : 2.8,
      roof: { axis: 'x', pitch: dark ? 0.85 : village ? 0.62 : 0.45, over: 0.45 },
      openings: {
        front: [{ c: 0, w: 1.0, y: 0, h: 2.2, kind: 'door' }, win(-W / 4 - 0.3), win(W / 4 + 0.3)],
        back: [win(-W / 4), { c: W / 4, w: 0.9, y: 0, h: 2.1, kind: 'door' }],
        left: [win(0), { ...win(0, 3.2), h: 0.9, w: 0.7, shutters: false }],
        right: [win(-D / 5), { ...win(0, 3.2), h: 0.9, w: 0.7, shutters: false }],
      },
    });
    const pz = Math.min(lot.d / 2 - 0.3, z1 + front);
    porch(b, { x0: village ? -W / 2 + 0.6 : x0, x1: village ? W / 2 - 0.6 : x1, z0: z1, z1: pz, deck: h.floor, roofY: h.floor + 2.5, cover: village ? 'shingle' : b.look.cover === 'tin' ? 'tin' : 'board', color: village || dark ? b.look.roof : b.look.cover === 'tin' ? b.look.roof : BOARD, steps: [-0.6, 0.6], rail: village || dark, decay: b.decay });
    if (!lot.ruin) {
      chimney(b, x0 + 0.5, (z0 + z1) / 2 - 0.4, h.eave - 0.4, h.ridge + 0.6, village ? lin(0x8a4a38) : WOOD.stoneDark);
      bed(b, x1 - 0.8, z0 + 1.3, h.floor);
      table(b, x0 + 1.6, z0 + 1.6, h.floor, 1.0, 0.8, 2);
      stove(b, x0 + 0.6, (z0 + z1) / 2 + 0.6, h.floor, h.eave - 0.3);
    }
    // the garden, and the fence along the street
    const fz = lot.d / 2 - 0.15;
    const gate = [-0.55, 0.55];
    if (village) {
      fence(b, -lot.w / 2 + 0.2, lot.w / 2 - 0.2, fz, { kind: 'picket', gate });
      if (b.decay < 0.5) {
        flowers(b, -W / 2 + 0.3, pz + 0.3, -0.9, fz - 0.3, 8);
        flowers(b, 0.9, pz + 0.3, W / 2 - 0.3, fz - 0.3, 8);
      }
      // a path of flags from the gate to the steps
      for (let z = pz + 0.4; z < fz; z += 0.55) stone(b.m, (b.rnd() - 0.5) * 0.1, b.g(0, z) + 0.01, z, 0.5, b.seed + Math.round(z * 10), 0.12);
      if (b.alive) lamp(b, lot.w / 2 - 0.35, fz - 0.25);
    } else if (dark) {
      fence(b, -lot.w / 2 + 0.2, lot.w / 2 - 0.2, fz, { kind: b.rnd() < 0.6 ? 'iron' : 'picket', gate, color: b.rnd() < 0.5 ? null : lin(0x4a4640) });
      if (b.rnd() < 0.55) deadTree(b, (b.rnd() < 0.5 ? -1 : 1) * (W / 2 - 0.4), pz + 1.2 + b.rnd() * 0.8, 5 + b.rnd() * 3);
    } else if (b.rnd() < 0.5) fence(b, -lot.w / 2 + 0.2, lot.w / 2 - 0.2, fz, { kind: 'rail', gate: [-1.2, 1.2] });
    else barrel(b, W / 2 - 0.6, pz + 0.7);
  },

  // A village shop: its gable to the street, a display window under a
  // striped awning, and its sign hung out on a bracket.
  shop(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const D = z1 - z0;
    const h = body(b, {
      x0, z0, x1, z1,
      storey: 3.1,
      roof: { axis: 'z', pitch: 0.7, over: 0.4 },
      openings: {
        front: [{ c: W / 4 + 0.15, w: 1.0, y: 0, h: 2.2, kind: 'door' }, { c: -W / 6, w: W * 0.42, y: 0.6, h: 1.6, kind: 'window', lit: b.alive ? 0.9 : 0 }, { c: 0, w: 0.9, y: 3.6, h: 0.9, kind: 'window', shutters: true }],
        left: [{ c: 0, w: 0.8, y: 1.0, h: 1.2, kind: 'window' }],
        right: [{ c: -D / 5, w: 0.8, y: 1.0, h: 1.2, kind: 'window' }],
      },
    });
    if (!lot.ruin) {
      const stripes = [pick(CANVAS, b.rnd), lin(0xece4d0)];
      shed(b, { x0: x0 + 0.1, x1: x1 - 0.1, z0: z1 + 0.05, z1: z1 + 1.2, y0: h.floor + 2.6, y1: h.floor + 2.2, stripes, decay: b.decay });
      const by = h.floor + 2.9;
      rod(b.m, [x1 - 0.3, by, z1], [x1 - 0.3, by, z1 + 1.1], 0.03, OLD.iron, 4);
      sign(b, x1 - 0.3, by - 0.45, z1 + 0.75, 0.8, 0.55, b.look.trim, lin(0x2a2420), Math.PI / 2);
      counter(b, x0 + 0.5, x0 + 0.5 + 2.6, z0 + D * 0.5, h.floor, b.look.paint);
      shelves(b, x0 + 0.3, x1 - 0.3, z0 + 0.3, h.floor, 3, b.decay < 0.5);
      flowers(b, x0 + 0.2, z1 + 0.15, x0 + 1.2, z1 + 0.5, 3);
    }
    if (lot.d / 2 - z1 > 0.4) stepsUp(b, lot.d / 2, W / 4 - 0.45, W / 4 + 0.75, h.floor, WOOD.stone);
    porch(b, { x0: W / 4 - 0.5, x1: W / 4 + 0.8, z0: z1, z1: lot.d / 2, deck: h.floor, decay: b.decay * 0.5 });
    bench(b, x0 + 1.0, lot.d / 2 + 0.6, 0);
  },

  // An inn: two floors, chimneys at both ends, a sign over the door.
  inn(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const front = [{ c: 0, w: 1.2, y: 0, h: 2.3, kind: 'door' }];
    for (const c of [-W * 0.32, -W * 0.16, W * 0.16, W * 0.32]) front.push({ c, w: 0.85, y: 0.9, h: 1.3, kind: 'window', shutters: true, lit: b.alive ? 0.85 : 0 });
    for (const c of [-W * 0.36, -W * 0.12, W * 0.12, W * 0.36]) front.push({ c, w: 0.8, y: STOREY + 0.6, h: 1.2, kind: 'window', shutters: true });
    const h = body(b, {
      x0, z0, x1, z1,
      storeys: 2,
      roof: { axis: 'x', pitch: 0.6, over: 0.45 },
      openings: {
        front,
        back: [{ c: 0, w: 0.9, y: 0, h: 2.1, kind: 'door' }, { c: -W / 3, w: 0.8, y: 1.0, h: 1.2, kind: 'window' }, { c: W / 3, w: 0.8, y: STOREY + 0.6, h: 1.2, kind: 'window' }],
        left: [{ c: 0, w: 0.8, y: 1.0, h: 1.2, kind: 'window' }],
        right: [{ c: 0, w: 0.8, y: STOREY + 0.6, h: 1.2, kind: 'window' }],
      },
    });
    if (!lot.ruin) {
      for (const x of [x0 + 0.5, x1 - 0.5]) chimney(b, x, (z0 + z1) / 2, h.eave - 0.5, h.ridge + 0.7);
      // a canopy over the door, and the sign on its bracket
      shed(b, { x0: -1.0, x1: 1.0, z0: z1, z1: z1 + 1.0, y0: h.floor + 2.75, y1: h.floor + 2.5, cover: 'shingle', color: b.look.roof });
      rod(b.m, [-1.6, h.floor + 3.1, z1], [-1.6, h.floor + 3.1, z1 + 1.2], 0.03, OLD.iron, 4);
      sign(b, -1.6, h.floor + 2.6, z1 + 0.8, 0.9, 0.7, lin(0x2a3a2a), lin(0xd8c090), Math.PI / 2);
      for (let i = 0; i < 3; i++) table(b, x0 + 1.4 + i * 2.2, z0 + 2.0, h.floor, 1.0, 0.9, 2);
      counter(b, x1 - 3.0, x1 - 0.5, z1 - 2.0, h.floor, lin(0x5a3a24));
      for (const x of [-W / 2 + 1.3, W / 2 - 1.3]) bench(b, x, z1 + 0.5, 0);
      if (b.alive) lamp(b, W / 2 - 0.3, lot.d / 2 - 0.2);
    }
    if (lot.d / 2 - z1 > 0.4) stepsUp(b, lot.d / 2, -0.7, 0.7, h.floor, WOOD.stone);
    porch(b, { x0: -0.8, x1: 0.8, z0: z1, z1: lot.d / 2, deck: h.floor, decay: b.decay * 0.5 });
  },

  // A tall dark house: two floors and a steep roof, a tower at one corner
  // with a spire, a porch, and railings with spikes along the street.
  tall(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const D = z1 - z0;
    const tall = (c, y) => ({ c, w: 0.7, y, h: 1.8, kind: 'window', shutters: b.rnd() < 0.5 });
    const h = body(b, {
      x0, z0, x1, z1,
      storeys: 2,
      storey: 3.1,
      roof: { axis: 'x', pitch: 0.95, over: 0.35 },
      foundation: 'stone',
      lift: 0.6,
      openings: {
        front: [{ c: -W / 5, w: 1.0, y: 0, h: 2.4, kind: 'door' }, tall(W / 5, 0.7), tall(-W / 4, 3.7), tall(W / 4, 3.7)],
        back: [tall(0, 0.7), tall(0, 3.7)],
        left: [tall(-D / 4, 0.7), tall(D / 4, 3.7), { c: 0, w: 0.6, y: 6.5, h: 1.0, kind: 'window' }],
        right: [tall(D / 4, 0.7), tall(-D / 4, 3.7), { c: 0, w: 0.6, y: 6.5, h: 1.0, kind: 'window' }],
      },
    });
    if (!lot.ruin) {
      // the tower: square, a storey higher, under a spire
      const tw = 2.2;
      const tx = x1 - tw / 2 + 0.15;
      const tz = z1 - tw / 2 + 0.15;
      const ty = h.eave + 2.4;
      const from = b.m.n;
      for (const [a, e] of [[[tx - tw / 2, tz + tw / 2], [tx + tw / 2, tz + tw / 2]], [[tx + tw / 2, tz + tw / 2], [tx + tw / 2, tz - tw / 2]], [[tx + tw / 2, tz - tw / 2], [tx - tw / 2, tz - tw / 2]], [[tx - tw / 2, tz - tw / 2], [tx - tw / 2, tz + tw / 2]]]) {
        const F = wall(b, { a, e, y0: h.eave - 0.3, top: ty, siding: 'clap', color: b.look.paint, holes: [{ c: 0, w: 0.6, y: 0.9, h: 1.1, kind: 'window', plain: true }], decay: b.decay });
        dress(b, F, b.look.trim);
      }
      weather(b.m, from, 0.1 + b.decay * 0.5, 0.35);
      const spire = new THREE.ConeGeometry(tw * 0.85, 3.6, 4, 1);
      b.m.add(spire, new THREE.Matrix4().compose(V(tx, ty + 1.8, tz), _q.setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), V(1, 1, 1)), (p, n, out) => out.copy(b.look.roof).multiplyScalar(0.8 + Math.max(0, n.y) * 0.3));
      rod(b.m, [tx, ty + 3.5, tz], [tx, ty + 4.3, tz], 0.025, OLD.iron, 4);
      b.blocker(tx, (h.eave + ty) / 2, tz, tw / 2, (ty - h.eave) / 2, tw / 2);
      chimney(b, x0 + 0.5, (z0 + z1) / 2, h.eave, h.ridge + 0.4, WOOD.stoneDark);
      bed(b, x0 + 0.8, z0 + 1.3, h.floor);
      table(b, (x0 + x1) / 2, (z0 + z1) / 2, h.floor, 1.4, 0.8, 2);
      // a clock that stopped, a chair by the window
      box(b.m, x1 - 0.4, h.floor + 1.0, z0 + 0.6, 0.45, 2.0, 0.35, lin(0x2a1c14));
    }
    porch(b, { x0, x1, z0: z1, z1: lot.d / 2 - 0.5, deck: h.floor, roofY: h.floor + 2.7, cover: 'shingle', color: b.look.roof, steps: [-W / 5 - 0.55, -W / 5 + 0.55], rail: true, decay: b.decay });
    fence(b, -lot.w / 2 + 0.2, lot.w / 2 - 0.2, lot.d / 2 - 0.12, { kind: 'iron', gate: [-W / 5 - 0.6, -W / 5 + 0.6] });
  },

  // A church: its door at the gable end, a steeple over it with a bell, tall
  // windows down each side, and pews inside.
  church(b, lot) {
    const [x0, z0, x1, z1] = bodyOf(lot);
    const W = x1 - x0;
    const D = z1 - z0;
    const village = b.style === 'village';
    const paint = village ? lin(0xf2eee4) : b.dark ? lin(0x2e2c30) : lin(0xcfc6b0);
    const tall = (c) => ({ c, w: 0.75, y: 1.1, h: 2.5, kind: 'window', plain: true, lit: b.alive ? (b.dark ? 0.3 : 0.4) : b.dark ? 0.1 : 0 });
    const h = body(b, {
      x0, z0, x1, z1,
      storey: 4.4,
      color: paint,
      siding: 'clap',
      lift: 0.5,
      foundation: 'stone',
      roof: { axis: 'z', pitch: 0.82, over: 0.4, cover: village ? 'slate' : b.look.cover === 'tin' ? 'board' : b.look.cover, color: b.dark ? lin(0x222226) : b.look.roof },
      openings: {
        front: [{ c: 0, w: 1.5, y: 0, h: 2.8, kind: 'door', color: b.dark ? lin(0x1a1414) : lin(0x6a3a28) }, { c: 0, w: 0.8, y: 4.9, h: 0.9, kind: 'window', plain: true }],
        left: [tall(-D / 3), tall(0), tall(D / 3)],
        right: [tall(-D / 3), tall(0), tall(D / 3)],
        back: [],
      },
    });
    if (!lot.ruin) {
      // the steeple: a tower out of the roof over the door, its belfry open,
      // and a spire with a cross
      const tw = 2.4;
      const tz = z1 - tw / 2;
      const belfry = h.ridge + 1.0;
      const top = belfry + 1.8;
      const from = b.m.n;
      const sides = [[[-tw / 2, tz + tw / 2], [tw / 2, tz + tw / 2]], [[tw / 2, tz + tw / 2], [tw / 2, tz - tw / 2]], [[tw / 2, tz - tw / 2], [-tw / 2, tz - tw / 2]], [[-tw / 2, tz - tw / 2], [-tw / 2, tz + tw / 2]]];
      for (const [a, e] of sides) {
        const F = wall(b, { a, e, y0: h.eave + 0.2, top, siding: 'clap', color: paint, holes: [{ c: 0, w: 1.0, y: belfry - h.eave - 0.2, h: 1.3, kind: 'gap' }], decay: b.decay });
        dress(b, F, b.look.trim);
      }
      box(b.m, 0, top + 0.06, tz, tw + 0.25, 0.12, tw + 0.25, b.look.trim);
      weather(b.m, from, 0.05 + b.decay * 0.5, b.dark ? 0.3 : 0);
      // the bell
      b.m.add(new THREE.CylinderGeometry(0.22, 0.42, 0.6, 10, 1, true), new THREE.Matrix4().makeTranslation(0, belfry + 0.6, tz), (p, n, out) => out.copy(lin(0x6a5a32)).multiplyScalar(0.8 + Math.max(0, n.y) * 0.4));
      rod(b.m, [-tw / 2, belfry + 1.0, tz], [tw / 2, belfry + 1.0, tz], 0.05, BOARD);
      const spire = new THREE.ConeGeometry(tw * 0.78, 5.0, 4, 1);
      b.m.add(spire, new THREE.Matrix4().compose(V(0, top + 2.6, tz), _q.setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), V(1, 1, 1)), (p, n, out) => out.copy(b.dark ? lin(0x222226) : b.look.roof).multiplyScalar(0.75 + Math.max(0, n.y) * 0.3));
      const cy = top + 5.1;
      const cross = b.dark && b.rnd() < 0.5 ? 0.5 : 0; // ...knocked askew
      box(b.m, 0, cy + 0.45, tz, 0.08, 0.9, 0.08, OLD.iron, 0, 0, cross);
      box(b.m, 0, cy + 0.6, tz, 0.5, 0.07, 0.07, OLD.iron, 0, 0, cross);
      b.blocker(0, (h.eave + top) / 2, tz, tw / 2, (top - h.eave) / 2, tw / 2);
      b.bell = { ...toWorld(lot, 0, tz), y: belfry + 0.6 };
      // pews either side of the aisle, and the altar
      for (let z = z0 + 2.6; z < z1 - 1.6; z += 1.05) {
        for (const s of [-1, 1]) {
          if (b.decay && b.rnd() < b.decay * 0.4) continue;
          const px = s * (W / 4 + 0.15);
          const tilt = b.decay ? (b.rnd() - 0.5) * b.decay * 0.5 : 0;
          box(b.m, px, h.floor + 0.44, z, W / 2 - 1.2, 0.06, 0.4, tone(BOARD, b.rnd, 0.1), 0, tilt, 0);
          box(b.m, px, h.floor + 0.7, z + 0.22, W / 2 - 1.2, 0.5, 0.05, tone(BOARD, b.rnd, 0.1), 0, tilt, 0);
          b.solid(px - (W / 4 - 0.7), z, px + (W / 4 - 0.7), z, 0.24, h.floor, h.floor + 0.5, { step: 0.55 });
        }
      }
      box(b.m, 0, h.floor + 0.5, z0 + 1.1, 1.6, 1.0, 0.7, b.dark ? lin(0x1a1414) : lin(0xe8e0cc));
      b.solid(-0.5, z0 + 1.1, 0.5, z0 + 1.1, 0.38, h.floor, h.floor + 1.0);
    }
    if (lot.d / 2 - z1 > 0.3) stepsUp(b, lot.d / 2, -1.0, 1.0, h.floor, WOOD.stone);
    porch(b, { x0: -1.1, x1: 1.1, z0: z1, z1: lot.d / 2, deck: h.floor, decay: b.decay * 0.5 });
  },

  // A village green: a bandstand in the middle, benches round it, flower
  // beds and lamps.
  green(b, lot) {
    const W = lot.w;
    const D = lot.d;
    const decay = b.decay;
    // the bandstand: an eight-sided deck, posts, a rail and a roof
    const gx = 0;
    const gz = -D * 0.08;
    const R = 2.6;
    const { hi } = b.span([[gx - R, gz - R], [gx + R, gz - R], [gx - R, gz + R], [gx + R, gz + R]]);
    const deck = hi + 0.5;
    const from = b.m.n;
    b.m.add(new THREE.CylinderGeometry(R, R, deck - b.span([[gx, gz]]).lo + 0.3, 8, 1), new THREE.Matrix4().makeTranslation(gx, (deck + b.g(gx, gz) - 0.3) / 2, gz), (p, n, out) => (n.y > 0.5 ? out.copy(BOARD).multiplyScalar(0.9) : out.copy(b.look.trim).multiplyScalar(0.9)));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      if (decay > 0.6 && b.rnd() < 0.3) continue;
      const px = gx + Math.cos(a) * (R - 0.15);
      const pz = gz + Math.sin(a) * (R - 0.15);
      rod(b.m, [px, deck, pz], [px, deck + 2.5, pz], 0.06, b.look.trim, 6);
      b.solid(px, pz, px, pz, 0.08, deck - 1, deck + 2.5);
      const a2 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
      if (i !== 1) rod(b.m, [px, deck + 0.8, pz], [gx + Math.cos(a2) * (R - 0.15), deck + 0.8, gz + Math.sin(a2) * (R - 0.15)], 0.03, b.look.trim, 4);
    }
    const roofC = new THREE.ConeGeometry(R + 0.5, 1.8, 8, 1);
    b.m.add(roofC, new THREE.Matrix4().compose(V(gx, deck + 3.4, gz), _q.setFromEuler(new THREE.Euler(0, Math.PI / 8, 0)), V(1, 1, 1)), (p, n, out) => out.copy(lin(0x7f4536)).multiplyScalar(0.8 + Math.max(0, n.y) * 0.3));
    rod(b.m, [gx, deck + 4.2, gz], [gx, deck + 4.8, gz], 0.04, OLD.iron, 4);
    weather(b.m, from, 0.05 + decay * 0.5, decay * 0.6);
    b.blocker(gx, deck + 3.4, gz, R, 0.6, R);
    for (let i = 0; i < 6; i++) b.solid(gx + Math.cos((i / 6) * 6.28) * R * 0.45, gz + Math.sin((i / 6) * 6.28) * R * 0.45, gx + Math.cos((i / 6) * 6.28) * R * 0.45, gz + Math.sin((i / 6) * 6.28) * R * 0.45, R * 0.6, deck - 2, deck, { step: 0.55, surface: 'boards' });
    // steps up, towards the street
    const sz = gz + R;
    const sg = b.g(gx, sz + 0.5);
    for (let i = 1; i <= Math.ceil((deck - sg) / 0.28); i++) {
      const top = deck - i * 0.28;
      if (top < sg - 0.1) break;
      box(b.m, gx, (top + sg - 0.2) / 2, sz + 0.15 + i * 0.3, 1.4, top - sg + 0.2, 0.3, BOARD);
      b.solid(gx - 0.5, sz + 0.15 + i * 0.3, gx + 0.5, sz + 0.15 + i * 0.3, 0.16, sg - 0.3, top, { step: 0.34 });
    }
    // benches round it, beds of flowers, lamps on the corners
    for (const [x, z, yaw] of [[-W / 2 + 2, gz, Math.PI / 2], [W / 2 - 2, gz, -Math.PI / 2], [-W / 4, -D / 2 + 1.2, 0], [W / 4, -D / 2 + 1.2, 0]]) {
      if (decay > 0.5 && b.rnd() < 0.4) continue;
      bench(b, x, z, yaw);
    }
    if (decay < 0.5) {
      flowers(b, -W / 2 + 0.6, D / 2 - 1.6, -W / 2 + 3.2, D / 2 - 0.4, 12);
      flowers(b, W / 2 - 3.2, D / 2 - 1.6, W / 2 - 0.6, D / 2 - 0.4, 12);
    }
    for (const x of [-W / 2 + 0.6, W / 2 - 0.6]) lamp(b, x, D / 2 - 0.5);
    b.spot = toWorld(lot, gx, gz);
  },

  // A graveyard: a fence round it, stones in rows, and in a dark town a dead
  // tree and a little stone tomb.
  graveyard(b, lot) {
    const W = lot.w;
    const D = lot.d;
    const western = b.style === 'western';
    const kind = b.dark ? 'iron' : western ? 'rail' : 'picket';
    const color = kind === 'picket' ? lin(0xe8e2d4) : null;
    fence(b, -W / 2, W / 2, D / 2 - 0.2, { kind, gate: [-0.8, 0.8], color });
    fence(b, -W / 2, W / 2, -D / 2 + 0.2, { kind, color });
    // the sides, as fences along z
    for (const x of [-W / 2, W / 2]) sideFence(b, x, -D / 2 + 0.2, D / 2 - 0.2, kind, color);
    if (kind !== 'rail') {
      for (const x of [-0.95, 0.95]) {
        const gy = b.g(x, D / 2 - 0.2);
        box(b.m, x, gy + 0.65, D / 2 - 0.2, 0.3, 1.5, 0.3, b.dark ? WOOD.stoneDark : WOOD.stone);
      }
    }
    const rows = Math.floor((D - 2.4) / 1.8);
    const cols = Math.floor((W - 1.6) / 1.4);
    const decay = Math.max(b.decay, b.dark ? 0.5 : western ? 0.4 : 0.15);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.abs(-W / 2 + 0.8 + (c + 0.5) * ((W - 1.6) / cols)) < 0.9) continue; // the path
        if (b.rnd() < 0.18) continue;
        const x = -W / 2 + 0.8 + (c + 0.5) * ((W - 1.6) / cols) + (b.rnd() - 0.5) * 0.25;
        const z = D / 2 - 1.8 - r * 1.8 + (b.rnd() - 0.5) * 0.2;
        const gy = b.g(x, z);
        const tilt = (b.rnd() - 0.5) * decay * 0.5;
        const lean = (b.rnd() - 0.5) * decay * 0.4;
        const t = b.rnd();
        if (western ? t < 0.75 : t < 0.15) {
          // a wooden cross
          box(b.m, x, gy + 0.45, z, 0.08, 1.0, 0.06, tone(BOARD, b.rnd, 0.2), lean, 0, tilt);
          box(b.m, x, gy + 0.7, z, 0.5, 0.07, 0.06, tone(BOARD, b.rnd, 0.2), lean, 0, tilt);
        } else if (t < 0.85) {
          const w = 0.45 + b.rnd() * 0.2;
          const hh = 0.55 + b.rnd() * 0.35;
          const col = b.dark ? WOOD.stoneDark : WOOD.stone;
          box(b.m, x, gy + hh / 2 - 0.1, z, w, hh, 0.12, tone(col, b.rnd, 0.25), lean, 0, tilt);
          box(b.m, x - Math.sin(tilt) * hh * 0.5, gy + hh - 0.06, z, w * 0.62, 0.1, 0.12, tone(col, b.rnd, 0.2), lean, 0, tilt);
        } else {
          // an obelisk
          box(b.m, x, gy + 0.15, z, 0.5, 0.3, 0.5, WOOD.stone);
          b.m.add(new THREE.CylinderGeometry(0.08, 0.17, 1.5, 4, 1), new THREE.Matrix4().compose(V(x, gy + 1.0, z), _q.setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), V(1, 1, 1)), (p, n, out) => out.copy(WOOD.stone).multiplyScalar(0.9));
        }
        // the mound
        box(b.m, x, gy - 0.02, z - 0.75, 0.6, 0.12, 1.2, (p, n, out) => out.copy(DIRT).multiplyScalar(0.9 + b.rnd() * 0.1));
        b.solid(x, z, x, z, 0.25, gy - 0.2, gy + 0.6);
      }
    }
    if (b.dark || (b.decay > 0.4 && b.rnd() < 0.5)) deadTree(b, W / 2 - 1.5, -D / 2 + 1.6, 6 + b.rnd() * 3);
    if (b.dark && b.rnd() < 0.6) {
      // a tomb
      const tx = -W / 2 + 2.0;
      const tz = -D / 2 + 1.8;
      const gy = b.g(tx, tz);
      box(b.m, tx, gy + 0.9, tz, 2.0, 2.0, 2.4, tone(WOOD.stoneDark, b.rnd, 0.1));
      box(b.m, tx, gy + 2.0, tz, 2.3, 0.2, 2.7, WOOD.stoneDark);
      box(b.m, tx, gy + 0.75, tz + 1.21, 0.8, 1.5, 0.04, PAL_DARK);
      b.solid(tx, tz - 0.8, tx, tz + 0.8, 1.05, gy - 0.2, gy + 2.1);
    }
    b.spot = toWorld(lot, 0, D / 2 - 1.5);
  },

  // A water tower on four legs, with its tank and a pipe.
  tower(b) {
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const top = 5.6;
    const gys = legs.map(([sx, sz]) => b.g(sx * 1.9, sz * 1.9));
    const base = Math.max(...gys);
    const deckY = base + top;
    const from = b.m.n;
    legs.forEach(([sx, sz], i) => {
      rod(b.m, [sx * 1.9, gys[i] - 0.3, sz * 1.9], [sx * 1.35, deckY, sz * 1.35], 0.12, tone(BOARD, b.rnd, 0.15), 6);
      b.solid(sx * 1.85, sz * 1.85, sx * 1.85, sz * 1.85, 0.16, gys[i] - 0.3, deckY);
    });
    for (const f of [0.3, 0.65]) {
      for (const [a, c] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
        const p = (k, ff) => [legs[k][0] * (1.9 - 0.55 * ff), base + top * ff - 0.2, legs[k][1] * (1.9 - 0.55 * ff)];
        rod(b.m, p(a, f), p(c, f + 0.3), 0.04, BOARD, 4);
      }
    }
    box(b.m, 0, deckY, 0, 3.2, 0.15, 3.2, tone(BOARD, b.rnd, 0.1));
    const tank = new THREE.CylinderGeometry(1.5, 1.6, 2.6, 16, 1);
    b.m.add(tank, new THREE.Matrix4().makeTranslation(0, deckY + 1.38, 0), (p, n, out) => {
      if (Math.abs(n.y) > 0.5) return out.copy(BOARD).multiplyScalar(0.7);
      const stave = Math.round(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 16);
      return out.copy(BOARD).multiplyScalar(0.8 + phash(stave, 3, b.seed) * 0.3);
    });
    for (const y of [0.4, 1.3, 2.2]) b.m.add(new THREE.CylinderGeometry(1.62, 1.62, 0.07, 16, 1, true), new THREE.Matrix4().makeTranslation(0, deckY + 0.1 + y, 0), () => OLD.iron.clone());
    b.m.add(new THREE.ConeGeometry(1.8, 1.0, 16, 1), new THREE.Matrix4().makeTranslation(0, deckY + 3.15, 0), (p, n, out) => out.copy(lin(0x6a5238)).multiplyScalar(0.8 + Math.max(0, n.y) * 0.3));
    // the spout, swung out for filling
    rod(b.m, [1.4, deckY + 0.5, 0], [2.6, deckY - 0.6, 0.4], 0.12, OLD.iron, 7);
    weather(b.m, from, 0.3 + b.decay * 0.5, b.decay * 0.4);
  },

  // A windpump: a lattice tower, a wheel of blades that turns in the wind,
  // and a trough at its foot.
  windpump(b) {
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const H = 7.2;
    const gys = legs.map(([sx, sz]) => b.g(sx * 1.1, sz * 1.1 - 0.5));
    const base = Math.max(...gys);
    legs.forEach(([sx, sz], i) => {
      rod(b.m, [sx * 1.1, gys[i] - 0.3, sz * 1.1 - 0.5], [sx * 0.22, base + H, sz * 0.22 - 0.5], 0.05, tone(BOARD, b.rnd, 0.15), 5);
      b.solid(sx * 1.1, sz * 1.1 - 0.5, sx * 1.1, sz * 1.1 - 0.5, 0.1, gys[i] - 0.3, base + 2);
    });
    for (let f = 0.15; f < 0.95; f += 0.2) {
      const p = (k) => [legs[k][0] * (1.1 - 0.88 * f), base + H * f, legs[k][1] * (1.1 - 0.88 * f) - 0.5];
      for (const [a, c] of [[0, 1], [1, 3], [3, 2], [2, 0]]) rod(b.m, p(a), p(c), 0.025, BOARD, 4);
    }
    weather(b.m, 0, 0.3 + b.decay * 0.5, 0);
    // the head, its tail vane, and the wheel (a part of its own, so it turns)
    box(b.m, 0, base + H + 0.15, -0.5, 0.25, 0.3, 0.5, OLD.iron);
    rod(b.m, [0, base + H + 0.2, -0.6], [0, base + H + 0.2, -2.0], 0.03, OLD.iron, 4);
    box(b.m, 0, base + H + 0.35, -2.1, 0.03, 0.7, 0.9, tone(lin(0x8d8a82), b.rnd, 0.1));
    const wheel = b.part(V(0, base + H + 0.2, -0.15), 0);
    b.parts[b.parts.length - 1].spin = b.decay > 0.7 ? 0 : b.decay > 0.4 ? 0.4 : 1.6;
    const blades = 16;
    const broken = b.decay > 0.5 ? Math.floor(b.rnd() * 6) : 0;
    for (let i = 0; i < blades; i++) {
      if (i < broken && b.rnd() < 0.6) continue;
      const a = (i / blades) * Math.PI * 2;
      const r = 0.85;
      box(wheel, Math.cos(a) * r, Math.sin(a) * r, 0, 0.15, 1.0, 0.02, (p, n, out) => out.copy(lin(0x9a9890)).multiplyScalar(0.8 + (i % 2) * 0.15), 0, 0, a - Math.PI / 2);
    }
    wheel.add(new THREE.TorusGeometry(1.2, 0.03, 4, 20), new THREE.Matrix4(), () => OLD.iron.clone());
    wheel.add(new THREE.TorusGeometry(0.45, 0.03, 4, 12), new THREE.Matrix4(), () => OLD.iron.clone());
    weather(wheel, 0, 0.2 + b.decay * 0.4, 0);
    rod(b.m, [0, base + H, -0.5], [0, b.g(0, -0.5) + 0.3, -0.5], 0.02, OLD.iron, 4);
    trough(b, 0, 1.4, 2.0);
  },

  // A well: the old places' (landmarks/models.js).
  well(b) {
    OLD_PLACES.well(b);
  },
};

const PAL_DARK = lin(0x0b0a09);

// A fence down a side of a lot (along z at x).
function sideFence(b, x, z0, z1, kind, color) {
  const n = Math.max(1, Math.round((z1 - z0) / (kind === 'picket' ? 0.16 : kind === 'iron' ? 0.14 : 2.2)));
  const col = color || (kind === 'iron' ? OLD.iron : WOOD.bark);
  const hgt = kind === 'iron' ? 1.35 : kind === 'picket' ? 0.95 : 1.1;
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    const gy = b.g(x, z);
    if (b.decay && b.rnd() < b.decay * 0.25) continue;
    if (kind === 'picket') box(b.m, x, gy + hgt / 2 - 0.1, z, 0.025, hgt, 0.07, tone(col, b.rnd, 0.1));
    else if (kind === 'iron') rod(b.m, [x, gy - 0.1, z], [x, gy + hgt, z], 0.012, col, 4);
    else rod(b.m, [x, gy - 0.2, z], [x, gy + hgt, z], 0.06, col, 5);
  }
  const ga = b.g(x, z0);
  const gc = b.g(x, z1);
  for (const y of kind === 'iron' ? [0.15, hgt - 0.1] : kind === 'picket' ? [0.25, hgt - 0.3] : [0.45, 0.95]) rod(b.m, [x, ga + y, z0], [x, gc + y, z1], kind === 'rail' ? 0.045 : 0.02, col, 4);
  b.solid(x, z0, x, z1, 0.06, Math.min(ga, gc) - 0.2, Math.max(ga, gc) + hgt);
}

// The false front of a western building: its front wall carried up square
// past the roof, with a cornice along the top and the name painted on it.
function falseFront(b, h, x0, x1, z) {
  if (b.lot.ruin) return;
  const top = h.eave + (h.top - h.eave);
  const W = x1 - x0;
  box(b.m, (x0 + x1) / 2, top + 0.08, z + 0.1, W + 0.3, 0.16, 0.3, b.look.trim);
  box(b.m, (x0 + x1) / 2, top - 0.12, z + 0.06, W + 0.16, 0.1, 0.18, b.look.trim);
  // brackets under the cornice
  for (let x = x0 + 0.2; x <= x1 - 0.1; x += W / Math.max(2, Math.round(W / 1.2))) box(b.m, x, top - 0.28, z + 0.08, 0.08, 0.26, 0.16, b.look.trim);
  const ink = b.look.paint.getHSL({}).l > 0.45 ? lin(0x2a2420) : lin(0xe8dfc8);
  sign(b, (x0 + x1) / 2, h.eave + 0.25, z + 0.05, W * 0.78, 0.6, b.look.raw ? lin(0x3a3028) : b.look.trim.clone().lerp(b.look.paint, 0.3), ink);
  // the back of it, from the roof
  quad(b.m, V(x0, h.eave, z - 0.08), V(x1, h.eave, z - 0.08), V(x1, top, z - 0.08), V(x0, top, z - 0.08), (p, n, out) => out.copy(BOARD).multiplyScalar(0.6));
}

// ── The street ───────────────────────────────────────────────────────────────
// Packed dirt laid over the ground from end to end of the main street, rutted
// by wheels down the middle; a village's is paler gravel, a dark town's mud,
// an abandoned one's going back to grass.
const STREET_STEP = 1.5; // m between the street's vertices along it
const STREET_LIFT = 0.05; // m it sits over the ground (with a polygon offset)
const ACROSS = 8; // vertices across it

export function buildStreet(town, ground, material) {
  const [u0, v0, u1, v1] = town.street;
  const nu = Math.max(2, Math.round((u1 - u0) / STREET_STEP));
  const pos = [];
  const col = [];
  const idx = [];
  const base = town.style === 'village' ? lin(0x9a8a70) : town.style === 'creepy' ? lin(0x4a3e32) : lin(0x8a7050);
  const grass = lin(0x5a6a34);
  const abandoned = town.kind === 'ghost' || town.kind === 'deserted';
  const c = new THREE.Color();
  const p = {};
  const center = new THREE.Vector3();
  toWorld(town, 0, 0, p);
  center.set(p.x, ground(p.x, p.z), p.z);
  for (let i = 0; i <= nu; i++) {
    const u = u0 + ((u1 - u0) * i) / nu;
    const fadeEnd = Math.min(1, (u - u0) / 4, (u1 - u) / 4);
    for (let j = 0; j <= ACROSS; j++) {
      const f = j / ACROSS;
      const v = v0 + (v1 - v0) * f;
      toWorld(town, u, v, p);
      pos.push(p.x - center.x, ground(p.x, p.z) + STREET_LIFT - center.y, p.z - center.z);
      const n = phash(Math.round(u * 1.3), Math.round(v * 1.3), town.seed);
      c.copy(base).multiplyScalar(0.85 + n * 0.25);
      // ruts where the wheels go, and the edges giving way to grass
      const off = Math.abs(v) / town.half;
      if (Math.abs(off - 0.25) < 0.08) c.multiplyScalar(0.82);
      const edge = Math.max(0, (off - 0.75) / 0.25) * 0.8 + (1 - fadeEnd) * 0.7;
      const weeds = abandoned ? Math.max(0, phash(Math.round(u * 0.5), Math.round(v * 0.5), town.seed + 1) - 0.35) * 1.2 : 0;
      c.lerp(grass, Math.min(0.85, edge + weeds));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < ACROSS; j++) {
      const a = i * (ACROSS + 1) + j;
      const d = a + ACROSS + 1;
      idx.push(a, a + 1, d, a + 1, d + 1, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // facing up whichever way it was wound
  const nor = g.attributes.normal;
  if (nor.getY(0) < 0) for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.position.copy(center);
  mesh.receiveShadow = true;
  return mesh;
}

// ── Tumbleweeds ──────────────────────────────────────────────────────────────
// A ball of dry twigs, for the wind to roll down an empty street.
export function makeTumbleweed(seed, material) {
  const m = new Mesher();
  const rnd = mulberry32(seed);
  const r = 0.35 + rnd() * 0.2;
  for (let i = 0; i < 26; i++) {
    const a = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
    const l = Math.hypot(...a) || 1;
    const p = a.map((v) => (v / l) * r * (0.6 + rnd() * 0.4));
    const q = p.map((v) => -v * (0.2 + rnd() * 0.6));
    rod(m, p, q, 0.012, lin(0x9a8458), 3);
  }
  const mesh = new THREE.Mesh(m.build(), material);
  mesh.castShadow = true;
  return { mesh, r };
}
