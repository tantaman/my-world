// The zoo laid out in the world: its plan (plan.js, as tools/zoo.mjs brought
// it in) moved onto the real place it's on, and what's where on it. No
// three.js in here: the tests read it, and the look builds from it.
//
// What's where is a grid a metre square over the whole zoo, each square
// saying what it has on it (USE): a building, a path, a plaza, an exhibit's
// pen, a fence. Whether there's water is the land's to say (wet). The forest round about asks it what to keep off (no tree in
// the Panda House, no grass on Olmsted Walk), the animals ask it where they
// may go, and the fences are put up round what it says is a pen.
//
// A pen is where an exhibit's animals live: the area the map draws for it,
// or, where the map has only a point (the Kids' Farm's goats, the zebras at
// the Cheetah Conservation Station), the ground round the point out as far
// as it goes before a path, a building, a wall or fence the map has, or
// another pen, up to how far its animals want (species.js). Where the map's
// fences and buildings close the ground round the point in (the goats' yard
// at the Kids' Farm), that yard is the pen, and is `walled`: it needs no
// fence of its own. An exhibit the map draws over a building (the Reptile
// Discovery Center, the Great Ape House) is indoors: it has a sign at the
// door and no pen.
//
//   new Site(plan, { at, offset, ground, wet, kindOf })
//     plan     plan.js's
//     at       [x, z]: where the plan's middle is in the world (its card's)
//     offset   m to add to the plan's heights (the real place's offset)
//     ground   (x, z) → the height of the ground
//     wet      (x, z) → whether there's water there (a moat, a pool)
//     kindOf   (exhibit) → what lives in it (species.js's kindOf), or null

import { inside, area, centroid, edgeDistance } from '../core/rings.js';

export const USE = { path: 1, plaza: 2, building: 4, pen: 8, fence: 16 };
const CELL = 1; // m, the grid's squares
const PAD = 30; // m of grid round the zoo's outline
// A pen grown round a point: how many ways out it's looked for, how far
// apart its edge is tried, and how far it keeps from a path or a building.
const RAYS = 28;
const RAY_STEP = 0.5;
const PEN_CLEAR = 1.2;
const SEEK = 25; // m from the map's point to look for open ground for a pen
const YARD = 45; // m: how far out a yard the map fences in round its point is looked for
// An exhibit drawn over a building is indoors when this much of it is under
// its roof.
const INDOORS = 0.5;
const SPOT_TRIES = 60; // spots tried in a pen before giving up on one

export class Site {
  constructor(plan, { at, offset = 0, ground = () => 0, wet = () => false, kindOf = () => null }) {
    this.plan = plan;
    this.ax = at[0];
    this.az = at[1];
    this.offset = offset;
    this.ground = ground;
    const W = (p) => [p[0] + this.ax, p[1] + this.az];
    this.outline = plan.outline.map(W);
    // the buildings in the world: faces and walls moved, and their outlines
    this.buildings = plan.buildings.map((b) => ({
      ...b,
      faces: b.faces.map((f) => f.map((r) => r.map(([x, z, y]) => [x + this.ax, z + this.az, y + offset]))),
      walls: b.walls.map(([ax, az, at, bx, bz, bt, ab, bb]) => [ax + this.ax, az + this.az, at + offset, bx + this.ax, bz + this.az, bt + offset, ab === null ? null : ab + offset, bb === null ? null : bb + offset]),
    }));
    this.paths = plan.paths.map((p) => ({ ...p, pts: p.pts.map((v, i) => v + (i % 2 ? this.az : this.ax)) }));
    this.areas = plan.areas.map((a) => ({ ...a, rings: a.rings.map((r) => r.map(W)) }));
    this.barriers = plan.barriers.map((b) => ({ ...b, pts: b.pts.map((v, i) => v + (i % 2 ? this.az : this.ax)) }));
    this.points = plan.points.map((p) => ({ ...p, x: p.x + this.ax, z: p.z + this.az }));

    // the grid
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of this.outline) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    this.x0 = Math.floor(x0 - PAD);
    this.z0 = Math.floor(z0 - PAD);
    this.w = Math.ceil((x1 + PAD - this.x0) / CELL);
    this.h = Math.ceil((z1 + PAD - this.z0) / CELL);
    this.box = [this.x0, this.z0, this.x0 + this.w * CELL, this.z0 + this.h * CELL];
    this.grid = new Uint8Array(this.w * this.h);
    for (const b of this.buildings) for (const f of b.faces) this._fill(f[0], USE.building, f.slice(1));
    for (const a of this.areas) for (const r of a.rings) this._fill(r, USE.plaza);
    for (const p of this.paths) this._stroke(p.pts, p.width / 2, USE.path);
    for (const b of this.barriers) this._trace(b.pts, USE.fence);
    // (water is asked about where it matters, not worked out for every square)
    this.wet = wet;

    // the exhibits, and the pens of those with animals out in them
    this.exhibits = [];
    for (const e of plan.exhibits) {
      const ex = { ...e, x: e.at[0] + this.ax, z: e.at[1] + this.az, area: e.area && e.area.map(W), pen: null, kind: null, indoors: false };
      ex.kind = kindOf(ex);
      if (ex.area) ex.indoors = this._covered(ex.area) >= INDOORS;
      this.exhibits.push(ex);
    }
    for (const ex of this.exhibits) {
      if (ex.indoors || !ex.kind) continue;
      // (a point in another's pen shares it: Grévy's zebras in with the zebras)
      const host = !ex.area && this.exhibits.find((o) => o.pen && inside(o.pen, ex.x, ex.z));
      if (host) {
        ex.pen = host.pen;
        ex.shared = true;
        continue;
      }
      if (ex.area) ex.pen = ex.area;
      else {
        const grown = this._grow(ex.x, ex.z, ex.kind.room || 8);
        ex.pen = grown && grown.ring;
        ex.walled = !!grown?.walled;
      }
      if (ex.pen && Math.abs(area(ex.pen)) < 2) ex.pen = null;
      if (ex.pen) this._fill(ex.pen, USE.pen);
    }
  }

  // ── The grid ──────────────────────────────────────────────────────────────
  // What's on the square at (x, z): USE flags (0 off the grid).
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
    for (let j = j0 - R; j <= j0 + R; j++) {
      if (j < 0 || j >= this.h) continue;
      for (let i = i0 - R; i <= i0 + R; i++) {
        if (i < 0 || i >= this.w) continue;
        if (this.grid[j * this.w + i] & flags) return true;
      }
    }
    return false;
  }
  // Whether no square with anything in `flags` on it comes within r m of
  // (x, z): an animal r m long from its middle can stand there.
  clearOf(x, z, r, flags) {
    const i0 = Math.max(0, Math.floor((x - r - this.x0) / CELL));
    const i1 = Math.min(this.w - 1, Math.floor((x + r - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - r - this.z0) / CELL));
    const j1 = Math.min(this.h - 1, Math.floor((z + r - this.z0) / CELL));
    for (let j = j0; j <= j1; j++) {
      // (how far the row of squares is, up or down)
      const sz = this.z0 + j * CELL;
      const dz = Math.max(sz - z, 0, z - sz - CELL);
      for (let i = i0; i <= i1; i++) {
        if (!(this.grid[j * this.w + i] & flags)) continue;
        const sx = this.x0 + i * CELL;
        const dx = Math.max(sx - x, 0, x - sx - CELL);
        if (dx * dx + dz * dz < r * r) return false;
      }
    }
    return true;
  }
  // Whether (x, z) is inside the zoo's outline.
  inZoo(x, z) {
    return inside(this.outline, x, z);
  }

  // fn(k) for each square whose middle is in the ring and not in a hole: a
  // row at a time, from where the rings' edges cross it.
  _cells(ring, holes, fn) {
    const rings = [ring, ...holes];
    let [z0, z1] = [Infinity, -Infinity];
    for (const [, z] of ring) [z0, z1] = [Math.min(z0, z), Math.max(z1, z)];
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / CELL));
    const j1 = Math.min(this.h - 1, Math.floor((z1 - this.z0) / CELL));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * CELL;
      xs.length = 0;
      for (const r of rings) {
        for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
          const [ax, az] = r[b];
          const [bx, bz] = r[a];
          if (az > z !== bz > z) xs.push(ax + ((z - az) * (bx - ax)) / (bz - az));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // squares whose middles lie between this crossing and the next
        const i0 = Math.max(0, Math.ceil((xs[k] - this.x0) / CELL - 0.5));
        const i1 = Math.min(this.w - 1, Math.floor((xs[k + 1] - this.x0) / CELL - 0.5));
        for (let i = i0; i <= i1; i++) fn(j * this.w + i);
      }
    }
  }
  _fill(ring, flag, holes = []) {
    this._cells(ring, holes, (k) => (this.grid[k] |= flag));
  }
  // every square within r of a line [x, z, x, z, …]
  _stroke(pts, r, flag) {
    const R = r + CELL * 0.5;
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const [ax, az, bx, bz] = [pts[k], pts[k + 1], pts[k + 2], pts[k + 3]];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - this.x0) / CELL));
      const i1 = Math.min(this.w - 1, Math.floor((Math.max(ax, bx) + R - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - this.z0) / CELL));
      const j1 = Math.min(this.h - 1, Math.floor((Math.max(az, bz) + R - this.z0) / CELL));
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + (i + 0.5) * CELL;
          const z = this.z0 + (j + 0.5) * CELL;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= r) this.grid[j * this.w + i] |= flag;
        }
      }
    }
  }
  // every square a line [x, z, x, z, …] runs through, if only across a
  // corner: a wall or fence, which is thinner than a square but mustn't have
  // gaps in it. (From square to square along it, into whichever it crosses
  // the side of next.)
  _trace(pts, flag) {
    const mark = (i, j) => {
      if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.grid[j * this.w + i] |= flag;
    };
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const [ax, az, bx, bz] = [pts[k], pts[k + 1], pts[k + 2], pts[k + 3]];
      let i = Math.floor((ax - this.x0) / CELL);
      let j = Math.floor((az - this.z0) / CELL);
      const [i1, j1] = [Math.floor((bx - this.x0) / CELL), Math.floor((bz - this.z0) / CELL)];
      const [dx, dz] = [bx - ax, bz - az];
      const [si, sj] = [Math.sign(dx), Math.sign(dz)];
      // how far along it (0..1) the next side across x, and across z, is
      let tx = dx ? (this.x0 + (i + (si > 0 ? 1 : 0)) * CELL - ax) / dx : Infinity;
      let tz = dz ? (this.z0 + (j + (sj > 0 ? 1 : 0)) * CELL - az) / dz : Infinity;
      const [stepX, stepZ] = [dx ? CELL / Math.abs(dx) : Infinity, dz ? CELL / Math.abs(dz) : Infinity];
      mark(i, j);
      for (let n = Math.abs(i1 - i) + Math.abs(j1 - j); n > 0; n--) {
        if (tx < tz) {
          i += si;
          tx += stepX;
        } else {
          j += sj;
          tz += stepZ;
        }
        mark(i, j);
      }
    }
  }
  // How much of a ring is under a roof (0..1), by its grid squares.
  _covered(ring) {
    let all = 0;
    let under = 0;
    this._cells(ring, [], (k) => {
      all++;
      if (this.grid[k] & USE.building) under++;
    });
    if (all) return under / all;
    const [x, z] = centroid(ring);
    return this.use(x, z) & USE.building ? 1 : 0;
  }
  // A pen round (x, z): { ring, walled }. Out each way until a path, a
  // building, a wall or fence, water or another pen is near, or `room` m.
  // Where the map's point is on something (the Kids' Farm's goats on its
  // barn, the gorillas on the Great Ape House), their yard is the open ground
  // nearest it, beside it. Where every way out comes to a wall, a fence or a
  // building within YARD m, the map has fenced a yard in there, and all of
  // it is the pen: walled, needing no fence of its own.
  _grow(x, z, room) {
    const blocked = (px, pz) => this.near(px, pz, PEN_CLEAR, USE.path | USE.plaza | USE.building | USE.pen | USE.fence) || this.wet(px, pz);
    if (blocked(x, z)) {
      const at = this._open(x, z, blocked);
      if (!at) return null;
      [x, z] = at;
    }
    const yard = this._rays(x, z, YARD, blocked);
    if (yard.every((r) => r.walled)) return { ring: yard.map((r) => r.at), walled: true };
    return { ring: this._rays(x, z, room, blocked).map((r) => r.at), walled: false };
  }
  // Out from (x, z) each way until blocked, or `most` m: [{ at: [x, z],
  // walled: stopped by a wall, a fence or a building }].
  _rays(x, z, most, blocked) {
    const out = [];
    for (let k = 0; k < RAYS; k++) {
      const a = (k / RAYS) * Math.PI * 2;
      const [dx, dz] = [Math.cos(a), Math.sin(a)];
      let r = RAY_STEP;
      while (r + RAY_STEP <= most && !blocked(x + dx * (r + RAY_STEP), z + dz * (r + RAY_STEP))) r += RAY_STEP;
      const [nx, nz] = [x + dx * (r + RAY_STEP), z + dz * (r + RAY_STEP)];
      const walled = r + RAY_STEP <= most && this.near(nx, nz, PEN_CLEAR, USE.building | USE.fence);
      out.push({ at: [Math.round((x + dx * r) * 100) / 100, Math.round((z + dz * r) * 100) / 100], walled });
    }
    return out;
  }

  // The nearest spot to (x, z) that isn't blocked, out to SEEK m; or null.
  _open(x, z, blocked) {
    for (let r = 1; r <= SEEK; r += 1) {
      const n = Math.max(8, Math.round(r * 2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        // (and with room round it to be a pen)
        if (!blocked(px, pz) && !blocked(px + 2, pz) && !blocked(px - 2, pz) && !blocked(px, pz + 2) && !blocked(px, pz - 2)) return [px, pz];
      }
    }
    return null;
  }

  // ── Asking about it ──────────────────────────────────────────────────────
  // The exhibits within r of (x, z), nearest first.
  exhibitsNear(x, z, r) {
    return this.exhibits
      .map((e) => ({ e, d: e.pen ? Math.max(0, inside(e.pen, x, z) ? 0 : edgeDistance(e.pen, x, z)) : Math.hypot(e.x - x, e.z - z) }))
      .filter((q) => q.d <= r)
      .sort((a, b) => a.d - b.d)
      .map((q) => q.e);
  }
  // A spot in a pen that its animals can stand on: inside it, `clear` m in
  // from its edge and from any building, wall or fence in it, on dry ground.
  // rnd: () → 0..1. Null if none is found.
  spotIn(pen, rnd, clear = 1) {
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of pen) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    for (let k = 0; k < SPOT_TRIES; k++) {
      const x = x0 + rnd() * (x1 - x0);
      const z = z0 + rnd() * (z1 - z0);
      if (!this.roomIn(pen, x, z, clear) || this.wet(x, z)) continue;
      return [x, z];
    }
    return null;
  }
  // Whether something `clear` m from its middle fits at (x, z) in a pen: in
  // it, and that far from its edge and from any building, wall or fence.
  roomIn(pen, x, z, clear) {
    return inside(pen, x, z) && edgeDistance(pen, x, z) >= clear && this.clearOf(x, z, clear, USE.building | USE.fence);
  }
}
