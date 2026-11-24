// What Washington is built from, fetched the first time you come near it
// (index.ts asks for it, core/lazy.ts): what stands a tile of the city up.
// Nothing here is needed anywhere else.
//
// new CityTile({ key, corner, bytes, ground, offset, names, materials, trees }):
// a tile 500 m square (codec.js), built a few milliseconds at a time (pump)
// and, once `ready`, all of it in its group, at its corner:
//   corner      [x, z]: the world's coordinates of the tile's corner
//   bytes       the tile, inflated (codec.js)
//   ground      (x, z) → the height of the ground (world coordinates)
//   offset      the height a tile's heights are measured from (its land's)
//   names       (k) → the name of the city's k-th named building (city.js)
//   materials   makeMaterials()'s, shared by every tile
//   trees       { models, material, shadow }: the forest's (world/chunks.js)
//
// What's on each square metre of it (USE: a roof, paving) is kept on a grid,
// for the forest round about to ask what to keep off.

import * as THREE from 'three';
import { decodeTile, TILE } from './codec.js';
import { buildBuildings } from './buildings.js';
import { buildPaving, polygonsOf } from './paving.js';
import { streetTrees, treesLod } from './trees.js';
import { createBuildingMaterial } from '../build/surfaces.js';

export { TILE };
export const USE = { building: 1, paved: 2 };
// What the forest keeps off (m): how far a tree keeps from a wall, and from
// the kerb; a bush or a fern, from a wall.
export const KEEP = { building: 2.5, paved: 0.8, small: 0.6 };
const CELL = 1; // m, the grid's squares
const PAD = 40; // m of grid round the tile, for what strays over its edge
const GROUND_CELL = 4; // m between the heights the buildings and trees stand on
const HEIGHTS_A_STEP = 600; // heights asked of the land between one step and the next
// what the map draws as a sidewalk; the rest of the paving, as a road
const WALKS = new Set(['sidewalk', 'island', 'stairs']);

// The materials every tile is drawn with.
export function makeMaterials() {
  const solid = createBuildingMaterial();
  const paving = createBuildingMaterial();
  Object.assign(paving, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  return { solid, paving };
}

/**
 * @typedef {{ models: Record<string, any>, material: THREE.Material, shadow?: THREE.Material }} TreeKit
 * @typedef {{ key: string, corner: number[], bytes: Uint8Array, ground: (x: number, z: number) => number,
 *   offset: number, names?: (k: number) => string, materials: ReturnType<typeof makeMaterials>,
 *   trees?: TreeKit | null, seed?: number }} TileArgs
 */
export class CityTile {
  /** @param {TileArgs} args */
  constructor({ key, corner, bytes, ground, offset, names = () => '', materials, trees = null, seed = 0 }) {
    this.key = key;
    this.corner = corner;
    this.group = new THREE.Group();
    this.group.name = `washington ${key}`;
    this.group.position.set(corner[0], 0, corner[1]);
    this.ready = false;
    this.solids = [];
    this.obstacles = [];
    /** @type {Array<{ a: number[], b: number[], half: number }>} */
    this.decks = [];
    /** @type {{ roads: Path2D, walks: Path2D, roofs: Path2D } | null} */
    this._paths = null;
    this.trees = [];
    this.data = null;
    // what's where: a grid over the tile and a little round it, and out as
    // far as anything it holds goes (laid out once it's read: _grid)
    this.x0 = corner[0] - PAD;
    this.z0 = corner[1] - PAD;
    this.w = Math.ceil((TILE + PAD * 2) / CELL);
    this.h = this.w;
    this.grid = new Uint8Array(0);
    this.box = [this.x0, this.z0, this.x0 + this.w * CELL, this.z0 + this.h * CELL];
    this._steps = this._build({ bytes, ground, offset, names, materials, trees, seed });
  }

  // Build up to about ms more of it. → whether there's more to do.
  pump(ms) {
    const end = performance.now() + ms;
    while (!this.ready) {
      if (this._steps.next().done) this.ready = true;
      else if (performance.now() >= end) return true;
    }
    return false;
  }

  *_build({ bytes, ground, offset, names, materials, trees, seed }) {
    const [cx, cz] = this.corner;
    this.data = decodeTile(bytes);
    const d = this.data;
    this._grid(d);
    yield;
    // the ground, on a grid over all of it: what the buildings and trees stand on
    const G = GROUND_CELL;
    const [gx0, gz0] = [this.x0 - cx, this.z0 - cz]; // (tile metres)
    const gw = Math.ceil((this.w * CELL) / G) + 1;
    const gh = Math.ceil((this.h * CELL) / G) + 1;
    const H = new Float32Array(gw * gh);
    for (let k = 0; k < H.length; k++) {
      if (k % HEIGHTS_A_STEP === HEIGHTS_A_STEP - 1) yield;
      H[k] = ground(this.x0 + (k % gw) * G, this.z0 + Math.floor(k / gw) * G);
    }
    const onGrid = (x, z) => {
      const fx = Math.max(0, Math.min(gw - 1.001, (x - gx0) / G));
      const fz = Math.max(0, Math.min(gh - 1.001, (z - gz0) / G));
      const [i, j] = [Math.floor(fx), Math.floor(fz)];
      const [u, v] = [fx - i, fz - j];
      const k = j * gw + i;
      return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + gw] * (1 - u) + H[k + gw + 1] * u) * v;
    };
    // (the paving lies on the ground itself, each corner asked once)
    const asked = new Map();
    const exact = (x, z) => {
      const key = Math.round(x * 8) * 1e6 + Math.round(z * 8);
      let h = asked.get(key);
      if (h === undefined) asked.set(key, (h = ground(cx + x, cz + z)));
      return h;
    };
    const nameOf = new Map([...d.names].map(([b, n]) => [b, names(n)]));
    const b = yield* buildBuildings(d.buildings, { ground: onGrid, offset, names: nameOf, seed });
    const p = yield* buildPaving(d, { ground: exact, offset, seed });
    // the street trees
    let t = { meshes: [], solids: [] };
    if (trees && d.trees.length) t = streetTrees(d.trees, { ...trees, ground: onGrid });
    yield;
    // what's where, a square metre at a time
    for (const ring of b.outlines) this._fill([ring], USE.building);
    yield;
    for (let k = 0; k < d.paving.length; k++) {
      if (k % 200 === 199) yield;
      for (const poly of polygonsOf(d.paving[k].rings)) this._fill([poly.outer, ...poly.holes], USE.paved);
    }
    yield;
    // the meshes, each in a step of its own
    const add = (batch, mat, cast = true) => {
      if (batch.empty) return;
      const mesh = new THREE.Mesh(batch.build(), mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    };
    add(b.roofs, materials.solid);
    yield;
    add(b.walls, materials.solid);
    yield;
    add(p.paving, materials.paving, false);
    yield;
    add(p.bridges, materials.solid);
    for (const { mesh } of t.meshes) {
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    this.trees = t.meshes;
    this.group.updateMatrixWorld(true);
    // what you bump into, and what a builder's tools go round: in the world's coordinates
    const W = (s) => ({ ...s, ax: s.ax + cx, az: s.az + cz, bx: s.bx + cx, bz: s.bz + cz });
    this.solids = [...b.solids.map(W), ...p.solids.map(W), ...t.solids.map(W)];
    this.obstacles = b.obstacles.map((o) => ({ ...o, x: o.x + cx, z: o.z + cz }));
    // its bridges' decks: the line along each, and its height at each end
    this.decks = p.decks.map((q) => ({ a: [q.a[0] + cx, q.a[1] + cz, q.a[2]], b: [q.b[0] + cx, q.b[1] + cz, q.b[2]], half: q.half }));
  }

  // How finely its trees are drawn (0 close .. 2 far), and whether they cast shadows.
  lod(level) {
    if (level === this._lod) return;
    this._lod = level;
    treesLod(this.trees, level);
    for (const { mesh } of this.trees) mesh.castShadow = level <= 1;
  }

  // ── What's where ───────────────────────────────────────────────────────────
  // The grid laid out over everything the tile holds: what's kept in a tile
  // is whatever has its middle in it, and a big polygon (the Capitol's
  // grounds' sidewalks, all one) can reach well over into the next.
  _grid(d) {
    const [cx, cz] = this.corner;
    let [x0, z0, x1, z1] = [-PAD, -PAD, TILE + PAD, TILE + PAD];
    const grow = (x, z) => {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    };
    for (const b of d.buildings) for (let i = 0; i < b.pts.length; i += 3) grow(b.pts[i], b.pts[i + 1]);
    for (const p of d.paving) for (const r of p.rings) for (let i = 0; i < r.length; i += 2) grow(r[i], r[i + 1]);
    this.x0 = cx + Math.floor(x0) - 1;
    this.z0 = cz + Math.floor(z0) - 1;
    this.w = Math.ceil((x1 - x0) / CELL) + 3;
    this.h = Math.ceil((z1 - z0) / CELL) + 3;
    this.grid = new Uint8Array(this.w * this.h);
    this.box = [this.x0, this.z0, this.x0 + this.w * CELL, this.z0 + this.h * CELL];
  }

  // What's on the square at (x, z) (world coordinates): USE flags.
  use(x, z) {
    const i = Math.floor((x - this.x0) / CELL);
    const j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    return this.grid[j * this.w + i];
  }
  // Whether anything in `flags` is within r m of (x, z).
  near(x, z, r, flags) {
    const R = Math.ceil(r / CELL);
    const i0 = Math.floor((x - this.x0) / CELL);
    const j0 = Math.floor((z - this.z0) / CELL);
    for (let j = Math.max(0, j0 - R); j <= Math.min(this.h - 1, j0 + R); j++) {
      for (let i = Math.max(0, i0 - R); i <= Math.min(this.w - 1, i0 + R); i++) if (this.grid[j * this.w + i] & flags) return true;
    }
    return false;
  }
  // Whether a plant at (x, z) is to go: on a roof or the paving, or a tree
  // too near a wall. small: a fern or a bush.
  clears(x, z, small = false) {
    if (this.use(x, z)) return true;
    if (small) return this.near(x, z, KEEP.small, USE.building);
    return this.near(x, z, KEEP.building, USE.building) || this.near(x, z, KEEP.paved, USE.paved);
  }
  // Whether grass grows at (x, z): not on what's paved or built.
  bare(x, z) {
    return this.use(x, z) !== 0;
  }

  // Fill rings (tile metres; even-odd) on the grid: each square whose middle
  // is inside, a row at a time.
  _fill(rings, flag) {
    const [cx, cz] = this.corner;
    let [z0, z1] = [Infinity, -Infinity];
    for (const r of rings) for (const [, z] of r) [z0, z1] = [Math.min(z0, z + cz), Math.max(z1, z + cz)];
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / CELL));
    const j1 = Math.min(this.h - 1, Math.floor((z1 - this.z0) / CELL));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * CELL - cz;
      xs.length = 0;
      for (const r of rings) {
        for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
          const [ax, az] = r[b];
          const [bx, bz] = r[a];
          if (az > z !== bz > z) xs.push(ax + ((z - az) * (bx - ax)) / (bz - az) + cx);
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - this.x0) / CELL - 0.5));
        const i1 = Math.min(this.w - 1, Math.floor((xs[k + 1] - this.x0) / CELL - 0.5));
        for (let i = i0; i <= i1; i++) this.grid[j * this.w + i] |= flag;
      }
    }
  }

  // Its streets, sidewalks and roofs as paths, in its own metres, for the
  // map (onMap.js): made the first time they're asked for.
  paths() {
    if (this._paths) return this._paths;
    const d = this.data;
    const [roads, walks, roofs] = [new Path2D(), new Path2D(), new Path2D()];
    const ring = (path, r) => {
      r.forEach(([x, z], i) => (i ? path.lineTo(x, z) : path.moveTo(x, z)));
      path.closePath();
    };
    for (const p of d.paving) {
      const path = WALKS.has(p.kind) ? walks : roads;
      for (const poly of polygonsOf(p.rings)) for (const r of [poly.outer, ...poly.holes]) ring(path, r);
    }
    for (const b of d.buildings) for (const f of b.faces) ring(roofs, f[0].map((k) => [b.pts[k * 3], b.pts[k * 3 + 1]]));
    this._paths = { roads, walks, roofs };
    return this._paths;
  }

  dispose() {
    // (the trees' geometry is the forest's: theirs to keep)
    const shared = new Set(this.trees.map((t) => t.mesh));
    this.group.traverse((o) => {
      if (o.isMesh && !shared.has(o)) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
  }
}
