// The ground of Hell, drawn: the land (land.js) as a quadtree of square
// tiles round whoever is looking, fine underfoot and coarser with distance,
// so that from a brink you can see a kilometre and more down into the pit.
//
// A tile is GRID × GRID squares of ground, whatever its size: the root tiles
// are ROOT m across, and each level down halves that, to FINEST. One is cut
// into four when the eye is within SPLIT of its own width from it. Tiles are
// built a few milliseconds a frame, nearest first, and a tile is only swapped
// for its four quarters once all four are built, so the ground never has a
// hole in it; each has a skirt hanging from its edges to hide the crack where
// a fine tile meets a coarse one.
//
// What lies in the land's hollows (a river, a marsh, pitch) is not drawn
// apart: where the land says there is a liquid, the tile's surface is the
// liquid's, flat, and each vertex carries how deep it is (aFx.w), so the
// shore falls where the bed comes up through it, pixel by pixel.
//
// Each tile is a mesh at its own corner, its vertices measured from there
// (render/origin.js), and remembers which turn of the land it was built for
// (land.js: a circle doesn't close); when the turn where it lies is no
// longer that one, it is built again.

import * as THREE from 'three';
import { R, H, ONE, TAU } from './plan.js';

export const TILES = {
  root: 2048, // m: the coarsest tile
  levels: 6, // halvings down to the finest (32 m)
  grid: 32, // squares along a tile's side
  split: 2.0, // a tile within this many of its own widths is cut in four
  range: 2700, // m: nothing is drawn further off than this
  keep: 900, // frames a tile nobody has wanted is kept before it's let go
};

const N = TILES.grid;
const V = N + 1;
const W = N + 3; // samples a side: one more all round, for the slopes at the edge
const _o = {};

// One index buffer for every tile: the grid, then the skirt.
function makeIndex() {
  const idx = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = i + j * V;
      const b = a + 1;
      const c = a + V;
      const d = c + 1;
      // split the square along whichever diagonal alternates: no long ridges
      if ((i + j) & 1) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  }
  // the skirt: the edge's vertices again, lower, in the same order as edge()
  const base = V * V;
  const ring = edge();
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const a2 = base + k;
    const b2 = base + ((k + 1) % ring.length);
    idx.push(a, a2, b, b, a2, b2);
  }
  return new THREE.BufferAttribute(new Uint16Array(idx), 1);
}

// The grid's edge vertices, once round.
function edge() {
  const ring = [];
  for (let i = 0; i < N; i++) ring.push(i);
  for (let j = 0; j < N; j++) ring.push(N + j * V);
  for (let i = N; i > 0; i--) ring.push(i + N * V);
  for (let j = N; j > 0; j--) ring.push(j * V);
  return ring;
}

const INDEX = makeIndex();
const EDGE = edge();
const COUNT = V * V + EDGE.length;

class Tile {
  constructor(level, i, j) {
    this.level = level;
    this.i = i;
    this.j = j;
    this.size = TILES.root / (1 << level);
    this.x0 = i * this.size;
    this.z0 = j * this.size;
    this.kids = null;
    this.mesh = null;
    this.turn = 0;
    this.wanted = 0; // the frame it was last asked for
    this.queued = false;
    this.lo = 0;
    this.hi = 0;
  }
}

export class HellTerrain {
  // land: the HellLand · material: what the ground is drawn with · group:
  // where its meshes go
  constructor({ land, material, group }) {
    this.land = land;
    this.material = material;
    this.group = group;
    this.roots = new Map();
    this.queue = [];
    this.frame = 0;
    this.drawn = [];
    this.built = 0; // tiles built so far (for the curious)
    this.pending = 0; // tiles wanted and not yet built
    this._eye = { x: 0, y: 0, z: 0, ref: 0, pit: false };
    this._h = new Float32Array(W * W);
    this._g = new Float32Array(W * W);
  }

  // Draw the land round an eye at (x, y, z) whose turn is ref, spending up
  // to `ms` on building tiles.
  update(x, y, z, ref, ms = 4) {
    this.frame++;
    const eye = this._eye;
    eye.x = x;
    eye.y = y;
    eye.z = z;
    eye.ref = ref;
    // down in the pit, the circles over the brink can't be seen
    eye.pit = y < this.land.top + H.bolge + 150;
    for (const t of this.drawn) t.mesh.visible = false;
    this.drawn.length = 0;
    this.queue.length = 0;
    const S = TILES.root;
    const i0 = Math.floor((x - TILES.range) / S);
    const i1 = Math.floor((x + TILES.range) / S);
    const j0 = Math.floor((z - TILES.range) / S);
    const j1 = Math.floor((z + TILES.range) / S);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const key = `${i}:${j}`;
        let root = this.roots.get(key);
        if (!root) {
          if (!this._hasLand(i * S, j * S, S)) continue;
          this.roots.set(key, (root = new Tile(0, i, j)));
        }
        this._visit(root);
      }
    }
    // build what's wanted, nearest first
    this.pending = this.queue.length;
    if (this.queue.length) {
      this.queue.sort((a, b) => a.d - b.d);
      const until = performance.now() + ms;
      let n = 0;
      for (const q of this.queue) {
        if (n > 0 && performance.now() > until) break;
        this._build(q.tile);
        n++;
      }
      this.pending -= n;
    }
    if (this.frame % 240 === 0) this._forget();
  }

  // Build everything an eye there would want, now: for when you're set down
  // somewhere (through the door, say) rather than having walked to it.
  settle(x, y, z, ref) {
    for (let i = 0; i < 40; i++) {
      this.update(x, y, z, ref, 1e6);
      if (!this.pending && i > 0) break;
    }
  }

  // Is any of the square at (x0, z0), S across, inside Hell?
  _hasLand(x0, z0, S) {
    const L = this.land;
    const dx = Math.max(x0 - L.cx, 0, L.cx - x0 - S);
    const dz = Math.max(z0 - L.cz, 0, L.cz - z0 - S);
    return Math.hypot(dx, dz) < L.reach;
  }

  // How far a tile is from the eye, in plan (0 over it), and from the axis
  // at its nearest.
  _far(t) {
    const e = this._eye;
    const dx = Math.max(t.x0 - e.x, 0, e.x - t.x0 - t.size);
    const dz = Math.max(t.z0 - e.z, 0, e.z - t.z0 - t.size);
    return Math.hypot(dx, dz);
  }

  _nearestToAxis(t) {
    const L = this.land;
    const dx = Math.max(t.x0 - L.cx, 0, L.cx - t.x0 - t.size);
    const dz = Math.max(t.z0 - L.cz, 0, L.cz - t.z0 - t.size);
    return Math.hypot(dx, dz);
  }

  // The turn the land has at a tile's middle, for this eye.
  _turn(t) {
    const p = this.land.polar(t.x0 + t.size / 2, t.z0 + t.size / 2, this._eye.ref, _o);
    return p.r > ONE ? Math.round(p.th / TAU) : 0;
  }

  _ready(t) {
    return !!t.mesh && t.turn === this._turn(t);
  }

  _want(t, d) {
    t.wanted = this.frame;
    if (!this._ready(t)) this.queue.push({ tile: t, d: d + t.level * 1e-3 });
  }

  _draw(t) {
    t.mesh.visible = true;
    this.drawn.push(t);
  }

  _visit(t) {
    const d = this._far(t);
    if (d > TILES.range) return;
    if (this._eye.pit && this._nearestToAxis(t) > R.brink + 120) return;
    t.wanted = this.frame;
    const split = t.level < TILES.levels && d < t.size * TILES.split;
    if (split) {
      if (!t.kids) {
        t.kids = [];
        for (let q = 0; q < 4; q++) {
          const kid = new Tile(t.level + 1, t.i * 2 + (q & 1), t.j * 2 + (q >> 1));
          t.kids.push(this._hasLand(kid.x0, kid.z0, kid.size) ? kid : null);
        }
      }
      let all = true;
      for (const k of t.kids) if (k && !this._ready(k)) all = false;
      if (all) {
        for (const k of t.kids) if (k) this._visit(k);
        return;
      }
      for (const k of t.kids) if (k) this._want(k, this._far(k));
    }
    if (this._ready(t)) this._draw(t);
    else {
      this._want(t, d);
      // an old turn's ground is better than a hole while the new one is built
      if (t.mesh) this._draw(t);
    }
  }

  _build(t) {
    const land = this.land;
    const ref = this._eye.ref;
    const step = t.size / N;
    const H0 = this._h;
    const G = this._g;
    const pos = new Float32Array(COUNT * 3);
    const nor = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const fx = new Float32Array(COUNT * 4);
    const kind = new Float32Array(COUNT);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = -1; j <= V; j++) {
      for (let i = -1; i <= V; i++) {
        const s = land.sample(t.x0 + i * step, t.z0 + j * step, ref, _o, true);
        const w = i + 1 + (j + 1) * W;
        const wet = s.liq > s.h;
        // the surface: the ground, or what lies over it
        H0[w] = wet ? s.liq : s.h;
        G[w] = s.h;
        if (i < 0 || j < 0 || i > N || j > N) continue;
        const v = i + j * V;
        const y = H0[w] - land.top;
        pos[v * 3] = i * step;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = j * step;
        if (y < lo) lo = y;
        if (y > hi) hi = y;
        col[v * 3] = s.cr;
        col[v * 3 + 1] = s.cg;
        col[v * 3 + 2] = s.cb;
        fx[v * 4] = s.wet;
        fx[v * 4 + 1] = s.glow;
        fx[v * 4 + 2] = s.ice;
        fx[v * 4 + 3] = s.liq > -1e8 ? Math.max(-6, Math.min(8, s.liq - s.h)) : -6;
        kind[v] = s.kind;
      }
    }
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const w = i + 1 + (j + 1) * W;
        const v = i + j * V;
        const dx = H0[w - 1] - H0[w + 1];
        const dz = H0[w - W] - H0[w + W];
        const l = Math.hypot(dx, 2 * step, dz);
        nor[v * 3] = dx / l;
        nor[v * 3 + 1] = (2 * step) / l;
        nor[v * 3 + 2] = dz / l;
      }
    }
    // the skirt: the edge again, hung lower
    const drop = step * 1.5 + 1.5;
    for (let k = 0; k < EDGE.length; k++) {
      const a = EDGE[k];
      const b = V * V + k;
      pos[b * 3] = pos[a * 3];
      pos[b * 3 + 1] = pos[a * 3 + 1] - drop;
      pos[b * 3 + 2] = pos[a * 3 + 2];
      for (let c = 0; c < 3; c++) {
        nor[b * 3 + c] = nor[a * 3 + c];
        col[b * 3 + c] = col[a * 3 + c];
      }
      for (let c = 0; c < 4; c++) fx[b * 4 + c] = fx[a * 4 + c];
      kind[b] = kind[a];
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(INDEX);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aFx', new THREE.BufferAttribute(fx, 4));
    geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    const half = t.size / 2;
    const mid = (lo + hi) / 2 - drop / 2;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(half, mid, half), Math.hypot(half, half, (hi - lo + drop) / 2));
    if (t.mesh) {
      t.mesh.geometry.dispose();
      t.mesh.geometry = geo;
    } else {
      t.mesh = new THREE.Mesh(geo, this.material);
      t.mesh.position.set(t.x0, land.top, t.z0);
      t.mesh.matrixAutoUpdate = false;
      t.mesh.updateMatrix();
      t.mesh.receiveShadow = true;
      t.mesh.visible = false;
      this.group.add(t.mesh);
    }
    t.turn = this._turn(t);
    t.lo = lo;
    t.hi = hi;
    this.built++;
  }

  // Let go of tiles nobody has wanted for a while.
  _forget() {
    const old = this.frame - TILES.keep;
    const prune = (t) => {
      if (t.kids) {
        let any = false;
        for (let q = 0; q < 4; q++) {
          const k = t.kids[q];
          if (!k) continue;
          prune(k);
          if (k.mesh || k.kids) any = true;
        }
        if (!any && t.wanted < old) t.kids = null;
      }
      if (t.mesh && t.wanted < old) {
        this.group.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh = null;
      }
    };
    for (const [key, root] of this.roots) {
      prune(root);
      if (!root.mesh && !root.kids && root.wanted < old) this.roots.delete(key);
    }
  }

  // How many tiles are being drawn, and how many are held.
  get stats() {
    let held = 0;
    const count = (t) => {
      if (t.mesh) held++;
      if (t.kids) for (const k of t.kids) if (k) count(k);
    };
    for (const root of this.roots.values()) count(root);
    return { drawn: this.drawn.length, held, pending: this.pending, built: this.built };
  }

  dispose() {
    const drop = (t) => {
      if (t.mesh) {
        this.group.remove(t.mesh);
        t.mesh.geometry.dispose();
      }
      if (t.kids) for (const k of t.kids) if (k) drop(k);
    };
    for (const root of this.roots.values()) drop(root);
    this.roots.clear();
  }
}
