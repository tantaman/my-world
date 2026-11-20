// The caves near you: found as you go, built as you come within reach of
// them (a little each frame, so walking never stutters), and let go of again
// once you're well away.
//
// A cave is known by its layout long before it is built (sites.js: cheap,
// a few milliseconds a square), which is all the map and the forest's
// clearing of its mouth need. Building it — the rock, its walls and floor,
// what grows in it — takes a tenth of a second or so, spread over frames;
// once built it is drawn, walked in (it joins Spaces), and its mouth is cut
// into the hillside.
//
// A square that a real place brought in from a photo reaches any of has no
// cave (keepOff: world/landforms.js reaches): the land there isn't the
// forest's alone, and until it's fetched it isn't even known. That is told
// from the hikes' cards, so a square's cave never waits on, or changes with,
// a hike's land arriving.
//
// Emits:
//   'built'   (cave)   a cave is ready to go into
//   'gone'    (cave)   ...and has been let go of

import { Emitter } from '../core/events.js';
import { layoutCave, cellOf, CAVE } from './sites.js';
import { buildCave, step, finish } from './build.js';
import { caveObject, disposeCave } from './look.js';
import { MAX_CUTS } from '../world/cuts.js';

const BUILD_NEAR = 170; // m from a cave's nearest edge: start building it
const LET_GO = 260; // m: and let it go
const BUDGET = 4; // ms a frame spent building
const LOOK_EVERY = 0.5; // s between looks round for caves to build
const FIND_NEAR = 1500; // m: squares this close are looked over for caves, a few a frame, for the map

const key = (cx, cz) => `${cx},${cz}`;

export class Caves extends Emitter {
  // kit: the materials and shapes every cave is drawn with (look.js caveKit)
  // keepOff(x0, z0, x1, z1): is any of that square somewhere no cave may be?
  constructor({ scene, gen, spaces, solids, kit, keepOff = () => false }) {
    super();
    this.keepOff = keepOff;
    this.scene = scene;
    this.gen = gen;
    this.spaces = spaces;
    this.solids = solids;
    this.kit = kit;
    this.sites = new Map(); // "cx,cz" -> layout, or null for a square with none
    this.built = new Map(); // id -> { cave, result, group }
    this.jobs = new Map(); // id -> { cave, job }
    this._look = 0;
    this._ring = null;
    // The mouths to cut into the hillside, nearest first (_sortMouths), and a
    // count that goes up whenever that list changes.
    this.mouths = [];
    this.mouthsChanged = 0;
  }

  // ── Knowing where they are ────────────────────────────────────────────────
  // The cave in square (cx, cz), or null (worked out the first time it's asked).
  site(cx, cz) {
    const k = key(cx, cz);
    if (!this.sites.has(k)) {
      const S = CAVE.cell;
      const off = this.keepOff(cx * S, cz * S, (cx + 1) * S, (cz + 1) * S);
      this.sites.set(k, off ? null : layoutCave(this.gen, cx, cz));
    }
    return this.sites.get(k);
  }

  // The caves whose squares overlap the box, each looked over if it hasn't
  // been. -> [cave]
  inBox(x0, z0, x1, z1) {
    const out = [];
    const [a, b] = cellOf(x0, z0);
    const [c, d] = cellOf(x1, z1);
    for (let cz = b; cz <= d; cz++) {
      for (let cx = a; cx <= c; cx++) {
        const cave = this.site(cx, cz);
        if (cave) out.push(cave);
      }
    }
    return out;
  }

  // Those already looked over whose mouths are in the box (for the map, which
  // mustn't stall working out the rest).
  known(x0, z0, x1, z1) {
    const out = [];
    for (const cave of this.sites.values()) {
      if (cave && cave.mouth.x >= x0 && cave.mouth.x <= x1 && cave.mouth.z >= z0 && cave.mouth.z <= z1) out.push(cave);
    }
    return out;
  }

  // The nearest cave mouth to (x, z) within r: { cave, d } or null.
  nearest(x, z, r = CAVE.cell * 1.5) {
    let best = null;
    for (const cave of this.inBox(x - r, z - r, x + r, z + r)) {
      const d = Math.hypot(cave.mouth.x - x, cave.mouth.z - z);
      if (d <= r && (!best || d < best.d)) best = { cave, d };
    }
    return best;
  }

  // ── Building and letting go ───────────────────────────────────────────────
  update(dt, at) {
    this._look -= dt;
    if (this._look <= 0) {
      this._look = LOOK_EVERY;
      const R = BUILD_NEAR;
      for (const cave of this.inBox(at.x - R, at.z - R, at.x + R, at.z + R)) {
        if (this.built.has(cave.id) || this.jobs.has(cave.id)) continue;
        if (boxDist(cave.bounds, at.x, at.z) < R) this.jobs.set(cave.id, { cave, job: buildCave(this.gen, cave) });
      }
      for (const b of [...this.built.values()]) if (boxDist(b.cave.bounds, at.x, at.z) > LET_GO) this.letGo(b.cave.id);
      for (const [id, j] of [...this.jobs]) if (boxDist(j.cave.bounds, at.x, at.z) > LET_GO) this.jobs.delete(id);
      this._sortMouths(at);
    }
    // one cave at a time, nearest first
    let next = null;
    for (const j of this.jobs.values()) if (!next || boxDist(j.cave.bounds, at.x, at.z) < boxDist(next.cave.bounds, at.x, at.z)) next = j;
    if (next) {
      const result = step(next.job, BUDGET);
      if (result) this._show(result);
    } else this._find(at);
  }

  // Build the cave at (x, z) now, if there is one there that isn't built: for
  // someone set down in it (a reload, a teleport).
  ensure(x, z) {
    const [cx, cz] = cellOf(x, z);
    const cave = this.site(cx, cz);
    if (!cave || this.built.has(cave.id) || boxDist(cave.bounds, x, z) > 4) return;
    const j = this.jobs.get(cave.id);
    this._show(finish(j ? j.job : buildCave(this.gen, cave)));
  }

  _show(result) {
    const { cave } = result;
    this.jobs.delete(cave.id);
    if (this.built.has(cave.id)) return;
    const group = caveObject(this.kit, result);
    this.scene.add(group);
    this.built.set(cave.id, { cave, result, group });
    this.spaces.add(result.space);
    this.solids.set(cave.id, result.rocks.map((r) => ({ ax: r.x, az: r.z, bx: r.x, bz: r.z, r: r.s * 0.95, bottom: r.y - r.sy * 0.6, topA: r.y + r.sy * 0.9, topB: r.y + r.sy * 0.9, step: 0 })));
    this._sortMouths(cave.mouth);
    this.emit('built', cave);
  }

  letGo(id) {
    const b = this.built.get(id);
    if (!b) return;
    this.built.delete(id);
    this.scene.remove(b.group);
    disposeCave(b.group);
    this.spaces.remove(b.result.space);
    this.solids.clear(id);
    this._sortMouths(b.cave.mouth);
    this.emit('gone', b.cave);
  }

  // Look over a few more squares round you each idle frame, nearest first,
  // so the map has the caves on it before you open it.
  _find(at) {
    const [cx, cz] = cellOf(at.x, at.z);
    if (!this._ring || this._ring.cx !== cx || this._ring.cz !== cz) {
      const n = Math.ceil(FIND_NEAR / CAVE.cell);
      const list = [];
      for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) if (dx * dx + dz * dz <= n * n) list.push([cx + dx, cz + dz, dx * dx + dz * dz]);
      list.sort((a, b) => a[2] - b[2]);
      this._ring = { cx, cz, list, i: 0 };
    }
    const r = this._ring;
    const t0 = performance.now();
    while (r.i < r.list.length && performance.now() - t0 < BUDGET) {
      const [x, z] = r.list[r.i++];
      if (!this.sites.has(key(x, z))) this.site(x, z);
    }
  }

  // ── What others ask ───────────────────────────────────────────────────────
  // The mouths of the built caves nearest `at`, to cut into the hillside
  // (this.mouths), counting a change when the list is a new one.
  _sortMouths(at) {
    const list = [...this.built.values()].sort((a, b) => Math.hypot(a.cave.mouth.x - at.x, a.cave.mouth.z - at.z) - Math.hypot(b.cave.mouth.x - at.x, b.cave.mouth.z - at.z));
    const next = list.slice(0, MAX_CUTS).map((b) => b.result.cuts[0]);
    if (next.length !== this.mouths.length || next.some((c, i) => c !== this.mouths[i])) {
      this.mouths = next;
      this.mouthsChanged++;
    }
  }

  // Tips of stalactites within r of (x, y, z): [x, y, z, ...]
  dripsNear(x, y, z, r) {
    const out = this._drips || (this._drips = []);
    out.length = 0;
    for (const b of this.built.values()) {
      const [x0, z0, x1, z1] = b.cave.bounds;
      if (x < x0 - r || x > x1 + r || z < z0 - r || z > z1 + r) continue;
      const d = b.result.drips;
      for (let i = 0; i < d.length; i += 3) {
        if ((d[i] - x) ** 2 + (d[i + 1] - y) ** 2 + (d[i + 2] - z) ** 2 < r * r) out.push(d[i], d[i + 1], d[i + 2]);
      }
    }
    return out;
  }

  // For the console: the caves looked over so far, nearest (x, z) first.
  list(x = 0, z = 0) {
    return [...this.sites.values()]
      .filter(Boolean)
      .map((c) => ({ name: c.name, id: c.id, x: Math.round(c.mouth.x), z: Math.round(c.mouth.z), d: Math.round(Math.hypot(c.mouth.x - x, c.mouth.z - z)), rooms: c.rooms.length, built: this.built.has(c.id) }))
      .sort((a, b) => a.d - b.d);
  }
}

// How far (x, z) is from a box [x0, z0, x1, z1] (0 inside it).
function boxDist(b, x, z) {
  const dx = Math.max(b[0] - x, 0, x - b[2]);
  const dz = Math.max(b[1] - z, 0, z - b[3]);
  return Math.hypot(dx, dz);
}
