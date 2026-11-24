// Washington's tiles, from what the city surveyed: pure, so the tests can
// run it without the network. tools/dc.mjs fetches and hands over; the
// format is src/washington/codec.js's, read back by the same code.
//
//   buildingOf(parts, toGame)       a building from its surveyed roof
//   blockOf(parts, toGame)          or from its block, where that's all there is
//   pavingKind(layer, description)  what the survey's word for a road or a
//                                   sidewalk is, as the game paves it
//   treeKind(genus)                 a street tree, as the game grows it
//   deckOf(ring, ground)            a bridge's deck, from its outline
//   encodeTile(tile)                a tile's bytes

import { Writer, VERSION, ROOFS, PAVING, TREES } from '../../src/washington/codec.js';
import { roofFaces } from '../zoo/plan.js';
import { area } from '../../src/core/rings.js';

const DM = 10; // decimetres to a metre

// A building from its surveyed roof (the survey's multipatch, decoded:
// tools/zoo/plan.js), in game metres: { roof, pts: [[x, z, y], ...], faces:
// [[ring of indices, ...], ...] }, each corner once (to the decimetre), or
// null if there's no roof to it. toGame: ([lon, lat, h]) → [x, z, y].
export function buildingOf(parts, toGame, roofType = 'default') {
  return buildingFrom(roofFaces(parts, toGame), roofType);
}

// A building from the survey's later block of it (its "Buildings - 3D": a
// mesh of triangles, walls, floor and all), where the roofs' survey has
// none (built since it flew): the faces that look up are its roof.
export function blockOf(parts, toGame) {
  return buildingFrom(
    roofFaces(parts, toGame).filter((f) => area(f[0]) > 0),
    'flat',
  );
}

// m² of a building's roof, in plan.
export function roofArea(b) {
  let sum = 0;
  for (const f of b.faces) sum += Math.abs(area(f[0].map((k) => b.pts[k])));
  return sum;
}

// faces: [[outer, ...holes], ...], rings of [x, z, y] (game m).
export function buildingFrom(faces, roofType = 'default') {
  if (!faces.length) return null;
  const pts = [];
  const seen = new Map();
  const at = ([x, z, y]) => {
    const q = [Math.round(x * DM), Math.round(z * DM), Math.round(y * DM)];
    const key = q.join(',');
    let k = seen.get(key);
    if (k === undefined) {
      k = pts.length;
      seen.set(key, k);
      pts.push(q.map((v) => v / DM));
    }
    return k;
  };
  const out = [];
  for (const face of faces) {
    const rings = face.map((r) => {
      const ring = r.map(at);
      // (a corner the decimetres have made the same as the one before it is one corner)
      return ring.filter((k, i) => k !== ring[(i + ring.length - 1) % ring.length]);
    });
    if (rings[0].length >= 3) out.push(rings.filter((r) => r.length >= 3));
  }
  if (!out.length) return null;
  const roof = (roofType || 'default').toLowerCase();
  return { roof: ROOFS.includes(roof) ? roof : 'other', pts, faces: out };
}

// The middle of a building in plan: the mean of its corners.
export function middleOf(b) {
  let [x, z] = [0, 0];
  for (const p of b.pts) {
    x += p[0];
    z += p[1];
  }
  return [x / b.pts.length, z / b.pts.length];
}

// The survey's roads and sidewalks (Planimetrics 2023: their DESCRIPTION),
// as what's paved: null for what isn't (a median that's grass, what the
// survey couldn't see from the air: a road under a bridge, a tunnel).
const ROAD_KINDS = {
  Road: 'road',
  Intersection: 'road',
  Alley: 'alley',
  'Paved Drive': 'drive',
  'Parking Lot': 'parking',
  'Paved Median Island': 'island',
  'Paved Traffic Island': 'island',
  Sidewalk: 'sidewalk',
  Stairs: 'stairs',
  Bridge: 'bridge',
  'Pedestrian Bridge': 'footbridge',
};
export function pavingKind(description) {
  const k = ROAD_KINDS[(description || '').trim()];
  return k && PAVING.includes(k) ? k : null;
}

// A street tree's genus, as the kind of tree the game grows (TREES): the
// conifers as its pines, the birches as birches, and all the rest (oaks,
// maples, elms, lindens, honey locusts, ginkgos, cherries) broadleaf.
const CONIFERS = new Set(['Pinus', 'Picea', 'Abies', 'Tsuga', 'Juniperus', 'Thuja', 'Cedrus', 'Cryptomeria', 'Chamaecyparis', 'Cupressus', 'Taxus', 'Pseudotsuga', 'Taxodium', 'Metasequoia', 'Cupressocyparis', 'x Cupressocyparis']);
export function treeKind(genus) {
  const g = (genus || '').trim();
  return CONIFERS.has(g) ? 'pine' : g === 'Betula' ? 'birch' : 'broad';
}
// How tall a street tree stands (m): as the survey's lidar measured its
// crown, where it did; else from how thick its trunk is (DBH, inches), as a
// city tree grows; and a young one, newly planted, where neither says.
export function treeHeight({ top, ground, dbh }) {
  if (top > 0 && ground > 0 && top - ground > 2 && top - ground < 45) return top - ground;
  if (dbh > 0) return Math.min(28, 3.5 + dbh * 0.55);
  return 4;
}

// A bridge's deck from its outline (a ring of [x, z]): the line it runs
// along (its outline's longest way), how wide it is, and its height at each
// end, where it meets the ground (ground(x, z) → the height there). The road
// on it rises or falls evenly from one end to the other.
const END_OUT = 4; // m past each end the ground is read at, off the deck
export function deckOf(ring, ground) {
  const n = ring.length;
  let [mx, mz] = [0, 0];
  for (const [x, z] of ring) {
    mx += x / n;
    mz += z / n;
  }
  let [sxx, sxz, szz] = [0, 0, 0];
  for (const [x, z] of ring) {
    sxx += (x - mx) ** 2;
    sxz += (x - mx) * (z - mz);
    szz += (z - mz) ** 2;
  }
  const a = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const [ux, uz] = [Math.cos(a), Math.sin(a)];
  let [t0, t1, s0, s1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, z] of ring) {
    const t = (x - mx) * ux + (z - mz) * uz;
    const s = -(x - mx) * uz + (z - mz) * ux;
    [t0, t1, s0, s1] = [Math.min(t0, t), Math.max(t1, t), Math.min(s0, s), Math.max(s1, s)];
  }
  const sm = (s0 + s1) / 2;
  const [cx, cz] = [mx - uz * sm, mz + ux * sm];
  const A = [cx + ux * t0, cz + uz * t0];
  const B = [cx + ux * t1, cz + uz * t1];
  // the ground where each end comes onto it: the highest of a few across
  // the end, just off it (an abutment, not the stream under it)
  const end = ([x, z], dir) => {
    let h = -Infinity;
    for (const f of [-0.6, 0, 0.6]) {
      const across = ((s1 - s0) / 2) * f;
      h = Math.max(h, ground(x + ux * dir * END_OUT - uz * across, z + uz * dir * END_OUT + ux * across));
    }
    return h;
  };
  return { a: [A[0], A[1], end(A, -1)], b: [B[0], B[1], end(B, 1)], half: (s1 - s0) / 2 };
}

// ── A tile's bytes ───────────────────────────────────────────────────────────
// tile: { at: [x, z] its corner (game m), buildings, paving: [{ kind, rings:
// [[[x, z], ...], ...] }], bridges: [{ a, b, half, ring }], trees: [{ x, z,
// height, kind }], names: [[building index, name index], ...] }.
export function encodeTile({ at, buildings = [], paving = [], bridges = [], trees = [], names = [] }) {
  const w = new Writer();
  const [ox, oz] = at;
  const q = (v, o = 0) => Math.round((v - o) * DM);
  w.u(VERSION);
  // buildings: each corner the difference from the one before
  w.u(buildings.length);
  let [px, pz, py] = [0, 0, 0];
  for (const b of buildings) {
    w.u(ROOFS.indexOf(b.roof));
    w.u(b.pts.length);
    for (const [x, z, y] of b.pts) {
      const [X, Z, Y] = [q(x, ox), q(z, oz), q(y)];
      w.s(X - px);
      w.s(Z - pz);
      w.s(Y - py);
      [px, pz, py] = [X, Z, Y];
    }
    w.u(b.faces.length);
    for (const rings of b.faces) {
      w.u(rings.length);
      for (const r of rings) {
        w.u(r.length);
        for (const k of r) w.u(k);
      }
    }
  }
  // paving
  w.u(paving.length);
  [px, pz] = [0, 0];
  for (const p of paving) {
    w.u(PAVING.indexOf(p.kind));
    w.u(p.rings.length);
    for (const r of p.rings) {
      w.u(r.length);
      for (const [x, z] of r) {
        const [X, Z] = [q(x, ox), q(z, oz)];
        w.s(X - px);
        w.s(Z - pz);
        [px, pz] = [X, Z];
      }
    }
  }
  // bridges
  w.u(bridges.length);
  for (const d of bridges) {
    for (const [x, z, y] of [d.a, d.b]) {
      w.s(q(x, ox));
      w.s(q(z, oz));
      w.s(q(y));
    }
    w.u(q(d.half));
    w.u(d.ring.length);
    [px, pz] = [0, 0];
    for (const [x, z] of d.ring) {
      const [X, Z] = [q(x, ox), q(z, oz)];
      w.s(X - px);
      w.s(Z - pz);
      [px, pz] = [X, Z];
    }
  }
  // trees
  w.u(trees.length);
  [px, pz] = [0, 0];
  for (const t of trees) {
    const [X, Z] = [q(t.x, ox), q(t.z, oz)];
    w.s(X - px);
    w.s(Z - pz);
    [px, pz] = [X, Z];
    w.u(q(t.height));
    w.u(TREES.indexOf(t.kind));
  }
  // names
  w.u(names.length);
  for (const [b, n] of names) {
    w.u(b);
    w.u(n);
  }
  return w.done();
}
