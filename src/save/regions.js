// Cutting a world into regions, and putting it back together.
//
// The game only ever sees a whole snapshot. This is the one place that knows
// a world is stored in pieces, and the pieces are plain spatial buckets on a
// 64 m grid — the same grid the world streams on, which is also the grid
// Forestry already keys its removed plants by, so those keys carry straight
// over.
//
// Everything that has a place in the world goes in the region it sits in.
// Everything that doesn't — the marks, your materials, where you were
// standing — goes in meta or visitor, which are stored whole.

import { SNAPSHOT_VERSION } from './snapshot.js';

export const REGION = 64; // metres; CONFIG.chunkSize

export const regionOf = (x, z) => [Math.floor(x / REGION), Math.floor(z / REGION)];
export const keyOf = (rx, rz) => `${rx},${rz}`;
export const parseKey = (key) => key.split(',').map(Number);

// -> { meta, visitor, patches: Map<"rx,rz", part> }
export function splitSnapshot(s) {
  const patches = new Map();
  const part = (rx, rz) => {
    const key = keyOf(rx, rz);
    let p = patches.get(key);
    if (!p) patches.set(key, (p = { v: SNAPSHOT_VERSION, terrain: [], removed: {}, stumps: [], felled: [], buildings: [] }));
    return p;
  };

  const world = s.world || {};
  const terrain = Array.isArray(world.terrain) ? world.terrain : [];
  for (let i = 0; i + 3 < terrain.length; i += 4) {
    const [rx, rz] = regionOf(terrain[i], terrain[i + 1]);
    part(rx, rz).terrain.push(terrain[i], terrain[i + 1], terrain[i + 2], terrain[i + 3]);
  }

  const forest = world.forest || {};
  // Forestry keys these by chunk, which is the same grid, so the key is the
  // region — but trust the coordinates in it rather than the grid matching.
  for (const k in forest.removed || {}) {
    const list = forest.removed[k];
    if (!Array.isArray(list) || !list.length) continue;
    const [cx, cz] = parseKey(k);
    if (!Number.isInteger(cx) || !Number.isInteger(cz)) continue;
    part(cx, cz).removed[k] = list;
  }
  for (const st of forest.stumps || []) part(...regionOf(st.x, st.z)).stumps.push(st);
  for (const f of forest.felled || []) part(...regionOf(f.x, f.z)).felled.push(f);

  // A building is a cluster inside JOIN_RADIUS, so it lives whole in the
  // region its first footing sits in, even where it reaches over the line.
  for (const b of world.buildings || []) {
    const anchor = b.footings && b.footings[0];
    const [rx, rz] = anchor ? regionOf(anchor[0], anchor[1]) : [0, 0];
    part(rx, rz).buildings.push(b);
  }

  for (const [key, p] of patches) if (isEmpty(p)) patches.delete(key);

  return {
    meta: { v: SNAPSHOT_VERSION, name: s.name || '', marks: s.marks || { marks: [], tracked: null } },
    visitor: {
      v: SNAPSHOT_VERSION,
      saved: s.saved || 0,
      inv: world.inv || {},
      datum: world.datum || null,
      player: s.player || {},
      hours: s.hours,
    },
    patches,
  };
}

// The reverse. `patches` is any iterable of parts; order doesn't matter,
// because nothing in a snapshot is positional.
export function mergeSnapshot({ seed, meta, visitor, patches }) {
  const terrain = [];
  const removed = {};
  const stumps = [];
  const felled = [];
  const buildings = [];
  for (const p of patches) {
    if (!p || typeof p !== 'object') continue;
    for (const v of p.terrain || []) terrain.push(v);
    for (const k in p.removed || {}) removed[k] = p.removed[k];
    for (const st of p.stumps || []) stumps.push(st);
    for (const f of p.felled || []) felled.push(f);
    for (const b of p.buildings || []) buildings.push(b);
  }
  const m = meta || {};
  const vis = visitor || {};
  return {
    v: SNAPSHOT_VERSION,
    seed,
    name: m.name || '',
    saved: vis.saved || 0,
    world: { v: 1, inv: vis.inv || {}, datum: vis.datum || null, terrain, forest: { removed, stumps, felled }, buildings },
    marks: m.marks || { marks: [], tracked: null },
    player: vis.player || {},
    hours: Number.isFinite(vis.hours) ? vis.hours : null,
  };
}

const isEmpty = (p) =>
  !p.terrain.length && !p.stumps.length && !p.felled.length && !p.buildings.length && !Object.keys(p.removed).length;
