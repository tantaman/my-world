// A tile of Washington as it's kept: what `npm run dc` (tools/dc.mjs) writes
// and the game reads back. Pure, and no three.js: the tests read it, and the
// importer writes with the same code it is read by (tools/dc/encode.js uses
// Writer).
//
// A tile is TILE metres square, from (i·TILE, j·TILE) game metres from the
// middle of Washington's real place (its card in world/hikes.js), x east and z
// south. Everything in it is in decimetres from that corner, and a height (y)
// in decimetres over the real place's `base`, at its scale (life size): the
// game stands it on the land as it stands the land, y + the land's offset.
// What's in a tile is whatever has its middle in it, so its edges stray a
// little over into the next.
//
// The bytes, every number a varint (signed ones zigzagged), the coordinates
// of each list each the difference from the one before:
//
//   version
//   buildings   count, then each:
//                 roof     ROOFS' index: what the survey says its roof is
//                 points   count, then x, z, y each: its roof's corners
//                 faces    count, then each: rings count, then each ring:
//                          count, then indices into its points. A face is
//                          [outer, ...holes]
//   paving      count, then each:
//                 kind     PAVING's index
//                 rings    count, then each: count, then x, z each. Filled
//                          even-odd: a ring inside another is a hole
//   bridges     count, then each: a deck, a line along it from one end to
//               the other (ax, az, ay, bx, bz, by: its height at each end)
//               and how wide (dm), and its outline, a ring (count, x, z each)
//   trees       count, then x, z, height (dm) and kind (TREES' index) each:
//               the city's street trees, as surveyed
//   names       count, then for each building that has one: its index
//               among the buildings, and the index of its name in the
//               city's list (city.js)

export const VERSION = 1;
export const TILE = 500; // m along a tile's side

// What a roof is, as the survey says it (its ROOF_TYPE, lower case).
export const ROOFS = ['flat', 'default', 'gable', 'hip', 'shed', 'mansard', 'dome', 'other'];
// What's paved: each of the survey's kinds of road and sidewalk, as one of
// these (tools/dc/encode.js says which).
export const PAVING = ['road', 'alley', 'drive', 'parking', 'island', 'sidewalk', 'stairs', 'bridge', 'footbridge'];
// The street trees, by their kind of tree (the survey's genus, sorted into
// what the game grows: tools/dc/encode.js).
export const TREES = ['broad', 'pine', 'birch'];

// ── Varints ──────────────────────────────────────────────────────────────────
export class Writer {
  constructor() {
    this.bytes = [];
  }
  u(v) {
    let z = Math.max(0, Math.round(v));
    while (z >= 128) {
      this.bytes.push((z & 127) | 128);
      z = Math.floor(z / 128);
    }
    this.bytes.push(z);
  }
  s(v) {
    const r = Math.round(v);
    this.u(r >= 0 ? r * 2 : -r * 2 - 1);
  }
  done() {
    return Uint8Array.from(this.bytes);
  }
}

export class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.p = 0;
  }
  u() {
    let z = 0;
    let mul = 1;
    let byte;
    do {
      byte = this.b[this.p++];
      z += (byte & 127) * mul;
      mul *= 128;
    } while (byte & 128);
    return z;
  }
  s() {
    const z = this.u();
    return z & 1 ? -(z + 1) / 2 : z / 2;
  }
  get end() {
    return this.p >= this.b.length;
  }
}

// ── Reading a tile ───────────────────────────────────────────────────────────
// bytes (inflated) → { buildings, paving, bridges, trees, names }, in game
// metres from the tile's corner (heights over the place's base):
//   buildings  [{ roof, pts: Float32Array [x, z, y, ...], faces: [[ring, ...], ...] }],
//              each ring an array of indices into pts (by point, not by number)
//   paving     [{ kind, rings: [Float32Array [x, z, ...], ...] }]
//   bridges    [{ a: [x, z, y], b: [x, z, y], half, ring: Float32Array }]
//   trees      Float32Array [x, z, height, kind, ...]
//   names      Map(building index → name index)
export function decodeTile(bytes) {
  const r = new Reader(bytes);
  const version = r.u();
  if (version !== VERSION) throw new Error(`a tile of Washington of version ${version}, not ${VERSION}`);
  const D = 0.1;
  // ── buildings
  const buildings = [];
  let [x, z, y] = [0, 0, 0];
  for (let n = r.u(), k = 0; k < n; k++) {
    const roof = ROOFS[r.u()] || 'other';
    const np = r.u();
    const pts = new Float32Array(np * 3);
    for (let i = 0; i < np; i++) {
      x += r.s();
      z += r.s();
      y += r.s();
      pts[i * 3] = x * D;
      pts[i * 3 + 1] = z * D;
      pts[i * 3 + 2] = y * D;
    }
    const faces = [];
    for (let nf = r.u(), f = 0; f < nf; f++) {
      const rings = [];
      for (let nr = r.u(), q = 0; q < nr; q++) {
        const ring = new Array(r.u());
        for (let i = 0; i < ring.length; i++) ring[i] = r.u();
        rings.push(ring);
      }
      faces.push(rings);
    }
    buildings.push({ roof, pts, faces });
  }
  // ── paving
  const paving = [];
  [x, z] = [0, 0];
  for (let n = r.u(), k = 0; k < n; k++) {
    const kind = PAVING[r.u()];
    const rings = [];
    for (let nr = r.u(), q = 0; q < nr; q++) {
      const ring = new Float32Array(r.u() * 2);
      for (let i = 0; i < ring.length; i += 2) {
        x += r.s();
        z += r.s();
        ring[i] = x * D;
        ring[i + 1] = z * D;
      }
      rings.push(ring);
    }
    paving.push({ kind, rings });
  }
  // ── bridges
  const bridges = [];
  for (let n = r.u(), k = 0; k < n; k++) {
    const a = [r.s() * D, r.s() * D, r.s() * D];
    const b = [r.s() * D, r.s() * D, r.s() * D];
    const half = r.u() * D;
    const ring = new Float32Array(r.u() * 2);
    [x, z] = [0, 0];
    for (let i = 0; i < ring.length; i += 2) {
      x += r.s();
      z += r.s();
      ring[i] = x * D;
      ring[i + 1] = z * D;
    }
    bridges.push({ a, b, half, ring });
  }
  // ── trees
  const nt = r.u();
  const trees = new Float32Array(nt * 4);
  [x, z] = [0, 0];
  for (let k = 0; k < nt; k++) {
    x += r.s();
    z += r.s();
    trees[k * 4] = x * D;
    trees[k * 4 + 1] = z * D;
    trees[k * 4 + 2] = r.u() * D;
    trees[k * 4 + 3] = r.u();
  }
  // ── names
  const names = new Map();
  for (let n = r.u(), k = 0; k < n; k++) names.set(r.u(), r.u());
  return { buildings, paving, bridges, trees, names };
}
