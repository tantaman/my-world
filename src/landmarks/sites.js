// Where the old buildings are: cabins, a ruined homestead, a hunting cabin,
// a tent someone left, a well, a dock with a boat, a canoe on a bank.
//
// The world is cut into CELL-metre squares, and each has one chance (CHANCE)
// of something standing in it. Which kind, and where, comes from the seed and
// the land alone — a cabin wants level, dry ground near a footpath; a dock
// wants the shore of a pond or a lake — so everyone in a world finds the same
// cabin in the same place, and nothing about it is saved.
//
// Nothing here changes what a seed grows: the ground isn't levelled and no
// tree is moved. A site is looked for where the land already suits it, and
// what stands there stands on piers or posts over whatever slope is left. The
// plants under it are hidden as it's shown, the way a felled tree is (see
// index.js), so the forest itself, and every save made against it, is just as
// it was.
//
// No three.js in here: the tests read it, and the map asks it what to label.
//
// A site:
//   id        `${kind}:${ci}:${cj}`: what it is and the cell it's in
//   kind      a key of KINDS (kinds.js)
//   x, z      where it stands: the origin of its own frame
//   yaw       how that frame is turned: its front (+z) faces (sin yaw, cos yaw)
//   name      what it's called ('Hollis cabin')
//   seed      for the little differences between one cabin and the next
//   plan      rectangles [x0, z0, x1, z1] in its frame that it stands on
//   bare      ...where no grass grows
//   shape     ...and what the map draws
//   box       [x0, z0, x1, z1] in the world, round its plan
//   ...and what its kind needs: a dock's length, the level of its water

import { mulberry32, hash2i } from '../noise.js';
import { Searches } from '../core/searches.ts';
import { toWorld, boxOf } from '../world/frame.js';
import { NET } from '../world/drainage.js';
import { KINDS, KIND_IDS } from './kinds.js';
import { SURNAMES } from '../core/names.js';

export const CELL = 300; // m, the side of the square each site has to itself
const CHANCE = 0.55; // that a cell has something in it at all
const INSET = 0.12; // land sites keep this fraction of a cell in from its edges...
const SPILL = 15; // ...and nothing reaches more than this far (m) out of its cell
const START_CLEAR = 150; // m kept clear round the start of the path, where people build
const PAD_CLEAR = 20; // m kept clear round a hand-placed structure
const TRIES = 14; // spots tried for each kind of site on land
const BANK_STEP = 15; // m between looks for a river bank or a shore
const DOCK_LEN = [6, 10]; // m out over the water
const DOCK_DEPTH = 0.7; // m of water wanted at the end of a dock
const SALT = 0x1a2d3;
const TAU = Math.PI * 2;

const key = (ci, cj) => `${ci}:${cj}`;

// ── The sites ────────────────────────────────────────────────────────────────
export class Sites {
  // start: where people first arrive, kept clear (the start of the path)
  constructor(gen, { start = gen.findSpawn(0, 0) } = {}) {
    this.gen = gen;
    this.start = start;
    // looked at outright (cell) or a few a frame (peek, then pump): core/searches.ts
    this.search = new Searches({
      grow: (k) => {
        const [ci, cj] = k.split(':').map(Number);
        return this._grow(ci, cj);
      },
    });
    this.cells = this.search.known; // "ci:cj" -> site or null
    // the side of a cell, and how far (m) a site may reach out of its own:
    // something grown on bigger cells (a town) says otherwise
    this.size = CELL;
    this.spill = SPILL;
  }

  // Cells asked about and not yet looked at.
  get queue() {
    return this.search.queue;
  }

  // The site in cell (ci, cj), or null.
  cell(ci, cj) {
    const k = key(ci, cj);
    const s = this.cells.get(k);
    if (s !== undefined) return s;
    if (this.cells.size > 40000) this.cells.clear();
    return this.search.get(k);
  }

  // The site in cell (ci, cj) if the cell has been looked at (null: nothing
  // there), or undefined if not yet, and then it's queued for pump(): for
  // lists that would rather wait a frame than stall.
  peek(ci, cj) {
    return this.search.peek(key(ci, cj));
  }

  // Sites whose plan comes within r of (x, z).
  near(x, z, r) {
    return this.within(x - r, z - r, x + r, z + r).filter((s) => boxDist(s.box, x, z) <= r);
  }

  // Sites overlapping a rectangle of the world. With wait = false, cells not
  // looked at yet are left out and queued for pump(): for the map, which
  // would rather fill in over a few frames than stall.
  within(x0, z0, x1, z1, wait = true) {
    const out = [];
    const { size, spill } = this;
    const ci0 = Math.floor((x0 - spill) / size);
    const ci1 = Math.floor((x1 + spill) / size);
    const cj0 = Math.floor((z0 - spill) / size);
    const cj1 = Math.floor((z1 + spill) / size);
    for (let cj = cj0; cj <= cj1; cj++) {
      for (let ci = ci0; ci <= ci1; ci++) {
        let s = this.cells.get(key(ci, cj));
        if (s === undefined) {
          if (!wait) {
            this.queue.add(key(ci, cj));
            continue;
          }
          s = this.cell(ci, cj);
        }
        if (s && s.box[0] <= x1 && s.box[2] >= x0 && s.box[1] <= z1 && s.box[3] >= z0) out.push(s);
      }
    }
    return out;
  }

  // Look at queued cells for up to `ms` milliseconds. -> how many are left.
  pump(ms) {
    return this.search.pump(ms);
  }

  // Ask for the cells within r of (x, z) to be looked at in the background.
  prefetch(x, z, r) {
    this.within(x - r, z - r, x + r, z + r, false);
  }

  // The site with this id, or null.
  byId(id) {
    const m = /^([a-z]+):(-?\d+):(-?\d+)$/.exec(String(id));
    if (!m || !KINDS[m[1]]) return null;
    const s = this.cell(Number(m[2]), Number(m[3]));
    return s && s.id === id ? s : null;
  }

  // ── Growing a cell ─────────────────────────────────────────────────────────
  _grow(ci, cj) {
    const rng = mulberry32(hash2i(ci, cj, (this.gen.seed ^ SALT) >>> 0));
    if (rng() > CHANCE) return null;
    // drawn first, so that how long the search below takes can't change them
    const family = SURNAMES[Math.floor(rng() * SURNAMES.length)];
    const form = rng();
    const seed = Math.floor(rng() * 1e9);
    const basins = this._basins(ci, cj);
    const weight = (k) => (KINDS[k].search === 'shore' && !basins.length ? 0 : KINDS[k].weight);
    for (const kind of weightedOrder(KIND_IDS, weight, rng)) {
      const K = KINDS[kind];
      const spot = K.search === 'shore' ? this._shore(basins, ci, cj, rng) : K.search === 'bank' ? this._bank(K, ci, cj, rng) : this._land(K, ci, cj, rng);
      if (!spot) continue;
      const name = K.names[form < 0.5 ? 0 : 1].replace('{s}', family);
      const site = {
        id: `${kind}:${ci}:${cj}`,
        kind,
        name: name[0].toUpperCase() + name.slice(1),
        seed,
        plan: K.plan,
        bare: K.bare,
        shape: K.shape,
        ...spot,
      };
      site.box = boxOf(site);
      return site;
    }
    return null;
  }

  _clear(x, z) {
    return Math.hypot(x - this.start.x, z - this.start.z) > START_CLEAR && this.gen.padClearance(x, z) > PAD_CLEAR;
  }

  // On dry land, as level as its kind needs, where it likes to be.
  _land(K, ci, cj, rng) {
    const gen = this.gen;
    for (let t = 0; t < TRIES; t++) {
      const x = (ci + INSET + rng() * (1 - 2 * INSET)) * CELL;
      const z = (cj + INSET + rng() * (1 - 2 * INSET)) * CELL;
      const turn = (rng() - 0.5) * 0.4;
      const f = gen.forest(x, z);
      if (f < K.forest[0] || f > K.forest[1]) continue;
      gen.pathMask(x, z);
      if (gen.pathEdge < K.path[0] || gen.pathEdge > K.path[1]) continue;
      if (!this._clear(x, z)) continue;
      gen.height(x, z);
      const edge = gen.water.edge;
      if (edge < K.dry || (K.near && edge > K.near)) continue;
      if (K.face === 'meadow' && !meadowNear(gen, x, z)) continue;
      const yaw = facing(gen, K.face, x, z) + turn;
      if (!this._fits(K, x, z, yaw, K.dry * 0.6)) continue;
      return { x, z, yaw };
    }
    return null;
  }

  // Across its level rectangle the ground falls no more than its kind allows,
  // and no corner of it is in the water or on a footpath.
  _fits(K, x, z, yaw, dry) {
    const gen = this.gen;
    const s = { x, z, yaw };
    const [x0, z0, x1, z1] = K.level;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j <= 2; j++) {
      for (let i = 0; i <= 2; i++) {
        const p = toWorld(s, x0 + ((x1 - x0) * i) / 2, z0 + ((z1 - z0) * j) / 2);
        const h = gen.height(p.x, p.z);
        if (gen.water.edge < dry || gen.pathEdge < 0.5) return false;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    for (const [a, b, c, d] of K.plan) {
      for (const [lx, lz] of [[a, b], [c, b], [a, d], [c, d]]) {
        const p = toWorld(s, lx, lz);
        gen.height(p.x, p.z);
        if (gen.water.edge < Math.min(dry, 2) || gen.pathEdge < 0.3) return false;
      }
    }
    return hi - lo <= K.slope;
  }

  // Ponds and lakes whose middle is in this cell (so each is only one cell's).
  _basins(ci, cj) {
    const C = NET.cell;
    const net = this.gen.water.net;
    const x0 = ci * CELL;
    const z0 = cj * CELL;
    const seen = new Set();
    const out = [];
    for (let j = Math.floor(z0 / C); j <= Math.floor((z0 + CELL) / C); j++) {
      for (let i = Math.floor(x0 / C); i <= Math.floor((x0 + CELL) / C); i++) {
        for (const b of net.near(i, j).basins) {
          if (seen.has(b) || b.x < x0 || b.x >= x0 + CELL || b.z < z0 || b.z >= z0 + CELL) continue;
          seen.add(b);
          out.push(b);
        }
      }
    }
    // the order they were found in depends on what the network had cached
    return out.sort((a, b) => a.x - b.x || a.z - b.z);
  }

  // A dock: from the shore of a pond or lake straight out over it, far enough
  // to have water under a boat at the end. Its frame's origin is where the
  // water meets the land, and its front is out over the water.
  _shore(basins, ci, cj, rng) {
    const gen = this.gen;
    for (const b of basins) {
      for (let t = 0; t < 8; t++) {
        const th = rng() * TAU;
        const len = DOCK_LEN[0] + rng() * (DOCK_LEN[1] - DOCK_LEN[0]);
        const ux = Math.cos(th);
        const uz = Math.sin(th);
        const at = (r) => ({ x: b.x + ux * r, z: b.z + uz * r });
        // walk out from the middle until there's ground above the water
        let shore = -1;
        for (let r = b.R0 * 0.4; r < b.maxR + 12; r += 0.5) {
          const p = at(r);
          if (gen.height(p.x, p.z) > b.level) {
            shore = r;
            break;
          }
        }
        if (shore < 0 || shore - len < b.R0 * 0.15) continue;
        const o = at(shore);
        if (o.x < ci * CELL || o.x >= (ci + 1) * CELL || o.z < cj * CELL || o.z >= (cj + 1) * CELL) continue;
        if (!this._clear(o.x, o.z)) continue;
        const site = { x: o.x, z: o.z, yaw: Math.atan2(-ux, -uz) };
        // deep enough at the end, and beside it where the boat is tied
        const end = toWorld(site, 0, len);
        if (b.level - gen.height(end.x, end.z) < DOCK_DEPTH) continue;
        const boat = toWorld(site, 1.55, len - 2.1);
        if (b.level - gen.height(boat.x, boat.z) < DOCK_DEPTH * 0.6) continue;
        // ground the shore end can sit on, no stream coming in, and no cliff
        const foot = at(shore + 1.6);
        if (gen.height(foot.x, foot.z) - b.level > 0.55 || gen.water.edge < 1) continue;
        const back = at(shore + 5);
        if (gen.height(back.x, back.z) - b.level > 2.2 || gen.water.edge < 3) continue;
        gen.pathMask(foot.x, foot.z);
        if (gen.pathEdge < 0.5) continue;
        const plan = [[-0.9, -1.8, 2.4, len + 0.3]];
        const shape = [[-0.8, -1.6, 0.8, len], [0.86, len - 3.75, 1.98, len - 0.45]];
        return { ...site, len, level: b.level, plan, bare: plan, shape };
      }
    }
    return null;
  }

  // A canoe turned over on the bank of a river, a pond or a lake, its bow up
  // the bank away from the water.
  _bank(K, ci, cj, rng) {
    const gen = this.gen;
    const w = gen.water;
    const found = [];
    const a = (ci + INSET) * CELL;
    const b = (cj + INSET) * CELL;
    const span = (1 - 2 * INSET) * CELL;
    for (let z = b; z < b + span; z += BANK_STEP) {
      for (let x = a; x < a + span; x += BANK_STEP) {
        w.probe(x, z);
        if (w.kind && w.kind !== 'stream' && w.edge > 1.6 && w.edge < 5) found.push(x, z);
      }
    }
    const n = found.length / 2;
    for (let t = 0; t < Math.min(6, n); t++) {
      const k = Math.floor(rng() * n) * 2;
      const turn = (rng() - 0.5) * 0.5;
      const x = found[k];
      const z = found[k + 1];
      if (!this._clear(x, z)) continue;
      const edge = (px, pz) => (w.probe(px, pz), w.edge);
      const gx = edge(x + 1.5, z) - edge(x - 1.5, z);
      const gz = edge(x, z + 1.5) - edge(x, z - 1.5);
      if (Math.hypot(gx, gz) < 1e-3) continue;
      const yaw = Math.atan2(gx, gz) + turn;
      if (!this._fits(K, x, z, yaw, 0.5)) continue;
      return { x, z, yaw };
    }
    return null;
  }
}

function boxDist(b, x, z) {
  const dx = Math.max(b[0] - x, 0, x - b[2]);
  const dz = Math.max(b[1] - z, 0, z - b[3]);
  return Math.hypot(dx, dz);
}

// The ids in a random order, those with more weight more often first; any
// with no weight are left out.
function weightedOrder(ids, weight, rng) {
  const left = ids.map((id) => [id, weight(id)]).filter(([, w]) => w > 0);
  const out = [];
  while (left.length) {
    let total = 0;
    for (const [, w] of left) total += w;
    let r = rng() * total;
    let i = 0;
    while (i < left.length - 1 && r >= left[i][1]) r -= left[i++][1];
    out.push(left[i][0]);
    left.splice(i, 1);
  }
  return out;
}

// Which way a site's front turns: towards the nearest footpath, the open
// meadow, the water, or downhill (where the view is). -> a yaw
function facing(gen, face, x, z) {
  const d = 3;
  let f;
  if (face === 'path') f = (px, pz) => (gen.pathMask(px, pz), Math.min(gen.pathEdge, 60));
  else if (face === 'meadow') f = (px, pz) => gen.forest(px, pz);
  else if (face === 'water') f = (px, pz) => (gen.water.probe(px, pz), Math.min(gen.water.edge, 200));
  else f = (px, pz) => gen.broadHeight(px, pz);
  let gx = f(x + d, z) - f(x - d, z);
  let gz = f(x, z + d) - f(x, z - d);
  if (Math.hypot(gx, gz) < 1e-4 && face !== 'downhill') return facing(gen, 'downhill', x, z);
  if (Math.hypot(gx, gz) < 1e-6) gz = -1;
  return Math.atan2(-gx, -gz);
}

// Is there open meadow within sight, for a hunting cabin to look out over?
function meadowNear(gen, x, z) {
  for (const r of [25, 45]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      if (gen.forest(x + Math.cos(a) * r, z + Math.sin(a) * r) < 0.3) return true;
    }
  }
  return false;
}
