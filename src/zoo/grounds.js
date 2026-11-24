// The zoo's grounds: its paths, laid over the land as wide as they are and
// paved as the map says (asphalt, concrete, brick, paving stones, boards);
// its plazas; its footbridges, decks you can walk out on; and what stands
// along them: benches, picnic tables, bins, drinking fountains, the cafés'
// and the ice cream stands' kiosks, maps on their boards, and the statues
// (Uncle Beazley the triceratops among them).
//
// buildGrounds(site, ground, out) fills out with { paving: [Mesher], things:
// Mesher, solids }, a little at a time (a generator, as buildings.js's is).

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { SURF, UPRIGHT } from '../build/surfaces.js';
import { USE } from './site.js';
import { area } from './shapes.js';

// What a path is paved with, by what the map says: [colour, surface].
const PAVING = {
  asphalt: [0x45433f, SURF.clay],
  paved: [0x55534e, SURF.clay],
  concrete: [0xa6a196, SURF.clay],
  'concrete:plates': [0xa09a8e, SURF.clay],
  paving_stones: [0x9c8874, SURF.stone],
  brick: [0x8c4f3c, SURF.stone],
  sett: [0x7a746c, SURF.stone],
  wood: [0x7c5c3c, SURF.wood],
  gravel: [0x9a9080, SURF.stone],
  fine_gravel: [0xa89c88, SURF.stone],
  compacted: [0x9a8c74, SURF.stone],
  dirt: [0x7a6448, SURF.clay],
  ground: [0x7a6448, SURF.clay],
};
const STEPS = [0xb0aca2, SURF.stone];
const LIFT = { path: 0.2, plaza: 0.12 }; // m over the ground (paths over plazas)
const STEP = 1.6; // m between the points a path is laid over
const PLAZA_EDGE = 3.2; // m: the longest side of a plaza's triangles
const DECK = { thick: 0.35, rail: 1.05, clear: 0.25 }; // a footbridge's deck, its rail (m), and how far it stays over the ground
const _c = new THREE.Color();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const PER_STEP = 12; // paths (or plazas) laid between one step and the next
const MESH_MOST = 30000; // vertices in one mesh of paving: more starts another
export function* buildGrounds(site, ground, out = {}) {
  let paving = new Mesher();
  const things = new Mesher();
  const solids = [];
  Object.assign(out, { paving: [paving], things, solids });
  // (a few meshes of it, not one big one: each is handed to the graphics card
  // in a step of its own)
  const room = () => {
    if (paving.n < MESH_MOST) return;
    paving = new Mesher();
    out.paving.push(paving);
  };
  // ── plazas
  for (const a of site.areas) {
    const [col, surf] = PAVING[a.surface] || PAVING.paved;
    for (const ring of a.rings) plaza(paving, ring, ground, new THREE.Color(col), surf);
    room();
    yield;
  }
  // ── paths (not those indoors, under a roof)
  for (const [k, p] of site.paths.entries()) {
    if (k % PER_STEP === PER_STEP - 1) {
      room();
      yield;
    }
    const P = p.pts;
    const mid = Math.floor(P.length / 4) * 2;
    if (site.use(P[mid], P[mid + 1]) & USE.building && site.use(P[0], P[1]) & USE.building) continue;
    if (p.surface === 'linoleum' || p.surface === 'carpet') continue;
    const [col, surf] = p.kind === 'steps' ? STEPS : PAVING[p.surface] || PAVING.asphalt;
    if (p.bridge) bridge(paving, things, solids, P, p.width / 2, ground, new THREE.Color(col), surf);
    // (where a path crosses a plaza the map draws as well, the plaza is its
    // paving: Olmsted Walk is drawn both ways)
    else strip(paving, P, p.width / 2, (x, z) => ground(x, z) + LIFT.path, new THREE.Color(col), surf, p.kind === 'steps', (x, z) => (site.use(x, z) & USE.plaza) !== 0);
  }
  yield;
  // ── what stands along them
  for (const pt of site.points) {
    const make = THINGS[pt.kind];
    if (!make) continue;
    if (site.use(pt.x, pt.z) & USE.building) continue;
    const yaw = facing(site, pt.x, pt.z);
    make(things, { x: pt.x, y: ground(pt.x, pt.z), z: pt.z, yaw, name: pt.name, solids });
  }
  return out;
}

// The way to face from (x, z) to look at the nearest path (rad, yaw as the
// game has it: 0 looks down +z).
function facing(site, x, z) {
  let best = Infinity;
  let yaw = 0;
  for (const p of site.paths) {
    const P = p.pts;
    for (let k = 0; k + 3 < P.length; k += 2) {
      const [ax, az, bx, bz] = [P[k], P[k + 1], P[k + 2], P[k + 3]];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < best && d > 0.01) {
        best = d;
        yaw = Math.atan2(px - x, pz - z);
      }
    }
  }
  return yaw;
}

// A path's points every STEP m along it: [[x, z, dirX, dirZ], ...]
function along(P) {
  const out = [];
  for (let k = 0; k + 3 < P.length; k += 2) {
    const [ax, az, bx, bz] = [P[k], P[k + 1], P[k + 2], P[k + 3]];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    const n = Math.max(1, Math.ceil(len / STEP));
    for (let i = k === 0 ? 0 : 1; i <= n; i++) out.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, (bx - ax) / len, (bz - az) / len]);
  }
  // each point's way across: between the stretches either side of it
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1];
    const b = out[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    out[i][2] = dx / l;
    out[i][3] = dz / l;
  }
  return out;
}

// A ribbon along a path, `half` m either side, at height(x, z) every metre or
// so along it and across it, so it lies on the land as the land lies.
const ACROSS = 2; // m between the points across a path
function strip(m, P, half, height, col, surf, steps = false, skip = null) {
  const pts = along(P);
  if (pts.length < 2) return;
  const tri = [];
  const k = Math.max(1, Math.ceil((2 * half) / ACROSS));
  const rows = pts.map(([x, z, dx, dz]) => {
    const [nx, nz] = [-dz, dx];
    const row = [];
    for (let j = 0; j <= k; j++) {
      const o = half - (2 * half * j) / k;
      row.push(V(x + nx * o, height(x + nx * o, z + nz * o), z + nz * o));
    }
    return row;
  });
  for (let i = 0; i + 1 < rows.length; i++) {
    if (skip && skip((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)) continue;
    for (let j = 0; j < k; j++) {
      const [a, b] = [rows[i][j], rows[i][j + 1]];
      const [c, d] = [rows[i + 1][j], rows[i + 1][j + 1]];
      tri.push(a, c, b, b, c, d);
    }
  }
  // steps: a darker nosing every so often, so they read as steps
  m.tris(tri, (p) => (steps && Math.floor(p.y / 0.18) % 2 ? _c.copy(col).multiplyScalar(0.8) : _c.copy(col)), surf);
}

// A footbridge: a deck along the path, level from one end to the other (or
// as high over the ground as it must be), with a rail each side, solid to
// walk on.
function bridge(m, things, solids, P, half, ground, col, surf) {
  const pts = along(P);
  if (pts.length < 2) return;
  const n = pts.length - 1;
  const y0 = ground(pts[0][0], pts[0][1]) + LIFT.path;
  const y1 = ground(pts[n][0], pts[n][1]) + LIFT.path;
  const deck = pts.map(([x, z], i) => Math.max(y0 + ((y1 - y0) * i) / n, ground(x, z) + DECK.clear));
  strip(m, P, half, (x, z) => {
    let best = 0;
    let bd = Infinity;
    pts.forEach(([px, pz], i) => {
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return deck[best];
  }, col, surf);
  const rail = _c.set(0x3a4a3e).clone();
  for (let i = 0; i < n; i++) {
    const [ax, az, dx, dz] = pts[i];
    const [bx, bz] = pts[i + 1];
    solids.push({ ax, az, bx, bz, r: half, bottom: Math.min(deck[i], deck[i + 1]) - DECK.thick, topA: deck[i], topB: deck[i + 1], surface: surf === SURF.wood ? 'boards' : undefined });
    for (const s of [1, -1]) {
      const [nx, nz] = [-dz * s * half, dx * s * half];
      const a0 = V(ax + nx, deck[i] + DECK.rail, az + nz);
      const b0 = V(bx + nx, deck[i + 1] + DECK.rail, bz + nz);
      things.tris([a0, b0, b0.clone().setY(b0.y - 0.06), a0, b0.clone().setY(b0.y - 0.06), a0.clone().setY(a0.y - 0.06)], () => rail, SURF.iron | UPRIGHT);
      if (i % 2 === 0) post(things, ax + nx, deck[i], az + nz, DECK.rail, 0.03, rail);
    }
  }
}

// A plaza: its outline cut into triangles small enough to lie on the land.
function plaza(m, ring, ground, col, surf) {
  if (ring.length < 3) return;
  const ccw = area(ring) > 0;
  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(
      ring.map(([x, z]) => new THREE.Vector2(x, z)),
      [],
    );
  } catch {
    return;
  }
  const out = [];
  const split = (a, b, c, depth) => {
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const bc = Math.hypot(b[0] - c[0], b[1] - c[1]);
    const ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const most = Math.max(ab, bc, ca);
    if (most <= PLAZA_EDGE || depth > 16) {
      out.push(a, b, c);
      return;
    }
    // halve the longest side
    if (most === ab) {
      const mm = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      split(a, mm, c, depth + 1);
      split(mm, b, c, depth + 1);
    } else if (most === bc) {
      const mm = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
      split(a, b, mm, depth + 1);
      split(a, mm, c, depth + 1);
    } else {
      const mm = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      split(a, b, mm, depth + 1);
      split(mm, b, c, depth + 1);
    }
  };
  for (const [a, b, c] of tris) (ccw ? split(ring[a], ring[c], ring[b], 0) : split(ring[a], ring[b], ring[c], 0));
  m.tris(
    out.map(([x, z]) => V(x, ground(x, z) + LIFT.plaza, z)),
    () => col,
    surf,
  );
}

// ── Things along the paths ──────────────────────────────────────────────────
// A box w × h × d, its foot's middle at (x, y, z), turned to yaw.
function box(m, x, y, z, yaw, w, h, d, col, surf = SURF.paint) {
  const g = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y + h / 2, z);
  const c = new THREE.Color(col);
  m.add(g, mat, () => c, null, surf);
}
// …and one offset from there along the thing's own across (u) and back (v)
function part(m, o, u, y, v, w, h, d, col, surf) {
  const [s, c] = [Math.sin(o.yaw), Math.cos(o.yaw)];
  box(m, o.x + c * u + s * v, o.y + y, o.z - s * u + c * v, o.yaw, w, h, d, col, surf);
}
function post(m, x, y, z, h, r, col) {
  const g = new THREE.CylinderGeometry(r, r, h, 5);
  const c = new THREE.Color(col);
  m.add(g, new THREE.Matrix4().setPosition(x, y + h / 2, z), () => c, null, SURF.iron);
}
const WOOD = 0x7a5a38;
const IRON = 0x2e3430;
const GREEN = 0x2f4a36;
const THINGS = {
  bench(m, o) {
    for (const u of [-0.75, 0.75]) part(m, o, u, 0, 0, 0.06, 0.45, 0.5, IRON, SURF.iron);
    part(m, o, 0, 0.42, 0, 1.8, 0.05, 0.45, WOOD, SURF.wood);
    part(m, o, 0, 0.55, -0.24, 1.8, 0.4, 0.04, WOOD, SURF.wood);
  },
  picnic_table(m, o) {
    part(m, o, 0, 0.72, 0, 1.9, 0.05, 0.8, WOOD, SURF.wood);
    for (const v of [-0.65, 0.65]) part(m, o, 0, 0.42, v, 1.9, 0.05, 0.3, WOOD, SURF.wood);
    for (const u of [-0.75, 0.75]) part(m, o, u, 0, 0, 0.08, 0.72, 1.6, WOOD, SURF.wood);
    o.solids.push(solidOf(o, 0.9, 0.78));
  },
  waste_basket(m, o) {
    post(m, o.x, o.y, o.z, 0.95, 0.28, GREEN);
  },
  drinking_water(m, o) {
    post(m, o.x, o.y, o.z, 0.9, 0.16, 0x7a7c78);
    part(m, o, 0, 0.9, 0, 0.45, 0.08, 0.35, 0x8a8c88, SURF.iron);
  },
  vending_machine(m, o) {
    part(m, o, 0, 0, 0, 1.0, 1.85, 0.8, 0xb8262a);
    part(m, o, 0.18, 0.5, 0.41, 0.45, 1.1, 0.02, 0x1a2228, SURF.glass);
    o.solids.push(solidOf(o, 0.55, 1.85));
  },
  information(m, o) {
    for (const u of [-0.7, 0.7]) part(m, o, u, 0, 0, 0.08, 2.1, 0.08, GREEN, SURF.iron);
    part(m, o, 0, 0.9, 0, 1.6, 1.1, 0.06, GREEN);
    part(m, o, 0, 1.0, 0.04, 1.4, 0.9, 0.02, 0xd8d0b8);
  },
  toilets(m, o) {
    post(m, o.x, o.y, o.z, 2.4, 0.05, GREEN);
    part(m, o, 0, 2.0, 0, 0.6, 0.35, 0.04, 0x2a5a8a);
  },
  cafe: kiosk(0x7a2a24),
  fast_food: kiosk(0x2a5a7a),
  ice_cream: kiosk(0xc85a8a),
  artwork(m, o) {
    // a plinth, and on it something cast in bronze
    part(m, o, 0, 0, 0, 1.4, 0.7, 1.0, 0xa8a094, SURF.stone);
    const big = /beazley/i.test(o.name);
    if (big) {
      // Uncle Beazley: a triceratops, 25 ft of fibreglass, on the grass
      const g = new THREE.Color(0x5a6a3c);
      const add = (geo, x, y, z, rx = 0) => m.add(geo, new THREE.Matrix4().makeRotationY(o.yaw).multiply(new THREE.Matrix4().makeRotationX(rx)).setPosition(o.x + Math.sin(o.yaw) * z + Math.cos(o.yaw) * x, o.y + y, o.z + Math.cos(o.yaw) * z - Math.sin(o.yaw) * x), () => g, null, SURF.paint);
      add(new THREE.SphereGeometry(1, 10, 8).scale(1.4, 1.3, 2.8), 0, 2.1, 0);
      add(new THREE.SphereGeometry(1, 8, 6).scale(0.8, 0.8, 1.1), 0, 2.2, 3.0);
      add(new THREE.CylinderGeometry(1.6, 1.6, 0.25, 12, 1, false, 0, Math.PI), 0, 3.0, 2.4, -0.9);
      for (const [x, z] of [[0.9, 1.6], [-0.9, 1.6], [0.9, -1.6], [-0.9, -1.6]]) add(new THREE.CylinderGeometry(0.4, 0.45, 1.4, 6), x, 0.7, z);
      for (const x of [0.4, -0.4]) add(new THREE.ConeGeometry(0.15, 1.3, 5), x, 3.0, 3.9, 1.1);
      add(new THREE.ConeGeometry(0.4, 2.6, 6), 0, 1.9, -3.6, -1.4);
      o.solids.push(solidOf(o, 1.8, 3.5));
      return;
    }
    const bronze = new THREE.Color(0x5c4430);
    const g = new THREE.SphereGeometry(1, 9, 7).scale(0.45, 0.55, 0.4);
    m.add(g, new THREE.Matrix4().setPosition(o.x, o.y + 1.25, o.z), () => bronze, null, SURF.iron);
    const h = new THREE.SphereGeometry(1, 8, 6).scale(0.25, 0.25, 0.25);
    m.add(h, new THREE.Matrix4().setPosition(o.x + Math.sin(o.yaw) * 0.2, o.y + 1.85, o.z + Math.cos(o.yaw) * 0.2), () => bronze, null, SURF.iron);
    o.solids.push(solidOf(o, 0.75, 0.7));
  },
};
// a kiosk under an awning in its own colour
function kiosk(awning) {
  return (m, o) => {
    part(m, o, 0, 0, 0, 2.6, 2.3, 2.0, 0xe8e0cc);
    part(m, o, 0, 0.9, 1.01, 1.8, 0.9, 0.02, 0x2a2622, SURF.glass);
    part(m, o, 0, 2.3, 0.3, 3.0, 0.12, 2.8, awning, SURF.cloth);
    part(m, o, 0, 2.42, 0.3, 3.0, 0.35, 0.05, awning, SURF.cloth);
    o.solids.push(solidOf(o, 1.4, 2.4));
  };
}
const solidOf = (o, r, h) => ({ ax: o.x, az: o.z, bx: o.x + 0.01, bz: o.z, r, bottom: o.y - 0.5, topA: o.y + h, topB: o.y + h });
