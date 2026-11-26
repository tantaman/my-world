// Which way each entrance's escalator well runs, and where exactly its top
// is: on the sidewalk, clear of the city's buildings, its streets and its
// street trees (src/washington/tiles, as the game has them).
//
// The District's survey says where an entrance is, not which way its
// escalators go down. Left to run towards the platforms, most of them go
// down into the front of the building beside them, or out across the
// street. So each is turned, and if it must be moved a few metres, to where
// its well, its pylon and the room to walk into it from are all on open
// ground: as little turned and moved as that takes.
//
//   const city = await cityPlan(tilesDir);
//   const { x, z, yaw } = placeWell(entrance, city, taken);
//
// entrance is { x, z, yaw } (game m from the middle of Washington); taken,
// the wells already placed (each { x, z, yaw }), kept clear of too.

import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { decodeTile, TILE } from '../../src/washington/codec.js';
import { inside } from '../../src/core/rings.js';
import { ENTRANCE } from '../../src/metro/network.js';

const { well: WELL, pylon: PYLON } = ENTRANCE;
const CELL = 0.5; // m: the city is looked at on squares this big round an entrance
const ROUND = 50; // m: how far round an entrance the city is looked at
const MOVE = 12; // m: the most an entrance is moved…
const FAR = 30; // …unless that's still in the way (one in a building's lobby): this
const BLOCKED = 0.05; // how much of a well can be in the way and it be left there
const STRIDE = 2; // m between the places first tried, then each metre round the best
const TURN = Math.PI / 36; // the ways a well is tried, this far apart
const STREET = new Set(['road', 'alley', 'drive', 'parking']);
// What's in the way, and how much: a building is out of the question, a
// street nearly so, a street tree or another well's ground too; then a
// little for each metre moved and for turning from the way it was.
const COST = { building: 20, street: 8, tree: 3, well: 20, moved: 0.05, turned: 0.1 };
const TREE = 1.2; // m round a street tree that's its own

// The city's buildings, paving and street trees, a tile at a time as asked.
export async function cityPlan(dir) {
  const tiles = new Map();
  const tile = (i, j) => {
    const key = `${i}_${j}`;
    if (tiles.has(key)) return tiles.get(key);
    const file = path.join(dir, `${key}.js`);
    let t = null;
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf8');
      const d = decodeTile(inflateRawSync(Buffer.from(text.match(/'([^']*)'/)[1], 'base64')));
      const [ox, oz] = [i * TILE, j * TILE];
      const ring = (r) => {
        const out = [];
        for (let k = 0; k < r.length; k += 2) out.push([r[k] + ox, r[k + 1] + oz]);
        return out;
      };
      t = {
        buildings: d.buildings.flatMap((b) => b.faces.map((f) => f[0].map((q) => [b.pts[q * 3] + ox, b.pts[q * 3 + 1] + oz]))),
        streets: d.paving.filter((p) => STREET.has(p.kind)).map((p) => p.rings.map(ring)),
        trees: Array.from({ length: d.trees.length / 4 }, (_, k) => [d.trees[k * 4] + ox, d.trees[k * 4 + 1] + oz]),
      };
    }
    tiles.set(key, t);
    return t;
  };
  // what's within r m of (x, z): its rings and trees
  return {
    near(x, z, r) {
      const out = { buildings: [], streets: [], trees: [] };
      // (a tile holds what has its middle in it: its neighbours' stray into it)
      const by = (ring) => {
        let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const [px, pz] of ring) [x0, z0, x1, z1] = [Math.min(x0, px), Math.min(z0, pz), Math.max(x1, px), Math.max(z1, pz)];
        return x1 > x - r && x0 < x + r && z1 > z - r && z0 < z + r;
      };
      for (let i = Math.floor((x - r) / TILE) - 1; i <= Math.floor((x + r) / TILE) + 1; i++) {
        for (let j = Math.floor((z - r) / TILE) - 1; j <= Math.floor((z + r) / TILE) + 1; j++) {
          const t = tile(i, j);
          if (!t) continue;
          out.buildings.push(...t.buildings.filter(by));
          out.streets.push(...t.streets.filter((rings) => rings.some(by)));
          out.trees.push(...t.trees.filter(([tx, tz]) => Math.abs(tx - x) < r && Math.abs(tz - z) < r));
        }
      }
      return out;
    },
  };
}

// What's on each square round (x, z): 1 a building, 2 a street, 4 a tree,
// 8 another well.
function grid(city, x, z, taken) {
  const n = Math.round((ROUND * 2) / CELL);
  const g = new Uint8Array(n * n);
  const x0 = x - ROUND;
  const z0 = z - ROUND;
  const { buildings, streets, trees } = city.near(x, z, ROUND);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [px, pz] = [x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL];
      let v = 0;
      if (buildings.some((r) => inside(r, px, pz))) v |= 1;
      else if (streets.some((rings) => rings.filter((r) => inside(r, px, pz)).length % 2)) v |= 2;
      if (trees.some(([tx, tz]) => Math.hypot(tx - px, tz - pz) < TREE)) v |= 4;
      for (const w of taken) if (onWell(w, px, pz, 1)) v |= 8;
      g[j * n + i] = v;
    }
  }
  return { g, n, x0, z0 };
}

// Whether (px, pz) is on the well at w, its parapets and pylon and the
// ground at its top (more m round it).
function onWell(w, px, pz, more = 0) {
  const [dx, dz] = [Math.sin(w.yaw), Math.cos(w.yaw)];
  const u = (px - w.x) * dx + (pz - w.z) * dz;
  const c = (px - w.x) * -dz + (pz - w.z) * dx;
  return u > -2 - more && u < WELL.run + 0.5 + more && c > -WELL.half - 0.5 - more && c < WELL.half + 0.9 + PYLON.half + more;
}

// The ground a well at (x, z), facing yaw, stands on: across its parapets
// and its pylon, from the room to walk in at its top to its far end.
function* footprint(x, z, yaw) {
  const [dx, dz] = [Math.sin(yaw), Math.cos(yaw)];
  const [rx, rz] = [-dz, dx];
  for (let u = -1.75; u <= WELL.run + 0.4; u += CELL) {
    for (let c = -WELL.half - 0.35; c <= WELL.half + 0.35; c += CELL) yield [x + dx * u + rx * c, z + dz * u + rz * c];
  }
  // the pylon, beside the top
  for (const u of [-0.25, 0.25]) for (const c of [WELL.half + 0.9 - 0.25, WELL.half + 0.9 + 0.25]) yield [x + dx * u + rx * c, z + dz * u + rz * c];
}

// Where an entrance's well goes: { x, z, yaw }.
export function placeWell(e, city, taken = []) {
  const { g, n, x0, z0 } = grid(city, e.x, e.z, taken);
  const at = (px, pz) => {
    const i = Math.floor((px - x0) / CELL);
    const j = Math.floor((pz - z0) / CELL);
    return i < 0 || j < 0 || i >= n || j >= n ? 0 : g[j * n + i];
  };
  // → [what it costs, how much of it is in the way]
  const cost = (x, z, yaw) => {
    let [b, s, t, w, all] = [0, 0, 0, 0, 0];
    for (const [px, pz] of footprint(x, z, yaw)) {
      const v = at(px, pz);
      all++;
      if (v & 1) b++;
      else if (v & 2) s++;
      if (v & 4) t++;
      if (v & 8) w++;
    }
    const turned = Math.abs(Math.atan2(Math.sin(yaw - e.yaw), Math.cos(yaw - e.yaw)));
    const blocked = (COST.building * b + COST.street * s + COST.tree * t + COST.well * w) / all;
    return [blocked + COST.moved * Math.hypot(x - e.x, z - e.z) + COST.turned * turned, (b + s + w) / all];
  };
  let best = { x: e.x, z: e.z, yaw: e.yaw, cost: Infinity, blocked: 1 };
  const tryAt = (x, z) => {
    // (moved, it can only be better by being clear: no use trying if moving costs more than the best)
    if (COST.moved * Math.hypot(x - e.x, z - e.z) >= best.cost) return;
    for (let a = 0; a < Math.PI * 2 - 1e-9; a += TURN) {
      const yaw = Math.atan2(Math.sin(e.yaw + a), Math.cos(e.yaw + a));
      const [c, blocked] = cost(x, z, yaw);
      if (c < best.cost) best = { x, z, yaw, cost: c, blocked };
    }
  };
  tryAt(e.x, e.z);
  for (const most of [MOVE, FAR]) {
    if (best.blocked <= BLOCKED) break;
    for (let mx = -most; mx <= most; mx += STRIDE) {
      for (let mz = -most; mz <= most; mz += STRIDE) if (Math.hypot(mx, mz) <= most) tryAt(e.x + mx, e.z + mz);
    }
  }
  const [bx, bz] = [best.x, best.z];
  for (let mx = -STRIDE + 1; mx < STRIDE; mx++) for (let mz = -STRIDE + 1; mz < STRIDE; mz++) if (mx || mz) tryAt(bx + mx, bz + mz);
  return best;
}
