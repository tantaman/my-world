// A world as keyed elements, grouped by 64 m regions.
//
// Everything you can change about the world is one element with a stable key
// that every machine derives the same way — a ground vertex, a removed plant,
// a stump, a felled tree, a footing, a log, a roof, a mark. That is what makes
// two people editing the same place merge instead of collide: the unit of
// conflict is the thing itself, not the square it stands in and not the whole
// world.
//
// Regions are a 64 m grid — the same grid the world streams on, and the grid
// Forestry already keys its removed plants by. They group elements for storage
// and for sending, and nothing else depends on where the lines fall: a cabin
// straddling one keeps its pieces in whichever square each piece stands in.
//
// The game only ever handles whole snapshots. This is the only file that knows
// a world is made of parts.

import { SNAPSHOT_VERSION } from './snapshot.js';

export const REGION = 64; // metres; CONFIG.chunkSize
export const LOOSE = '*'; // things with no place in the world: marks, the name

export const regionOf = (x, z) => `${Math.floor(x / REGION)},${Math.floor(z / REGION)}`;
export const keyOf = (rx, rz) => `${rx},${rz}`;
export const parseKey = (key) => key.split(',').map(Number);

// ── A snapshot, as elements ─────────────────────────────────────────────────
// -> Map<regionKey, Map<elementKey, value>>

export function toElements(s) {
  const out = new Map();
  const put = (region, key, value) => {
    let m = out.get(region);
    if (!m) out.set(region, (m = new Map()));
    m.set(key, value);
  };

  const world = s.world || {};
  const terrain = Array.isArray(world.terrain) ? world.terrain : [];
  for (let i = 0; i + 3 < terrain.length; i += 4) {
    const [x, z] = [terrain[i], terrain[i + 1]];
    put(regionOf(x, z), `t:${x}:${z}`, [terrain[i + 2], terrain[i + 3]]);
  }

  const forest = world.forest || {};
  // Forestry keys these by chunk, which is the same grid as a region.
  for (const chunk in forest.removed || {}) {
    for (const plant of forest.removed[chunk] || []) put(chunk, `r:${plant}`, 1);
  }
  for (const st of forest.stumps || []) put(regionOf(st.x, st.z), `s:${st.x}:${st.z}`, [st.kind, st.y, st.r]);
  // A felled tree's id is minted locally and never stored, so it is keyed by
  // the tree it came from instead — which every machine agrees on.
  for (const f of forest.felled || []) {
    put(regionOf(f.x, f.z), `f:${f.kind}:${f.x}:${f.z}`, [f.y, f.s, f.yaw, f.dir, f.end, f.state, f.total, f.left, f.r0]);
  }

  // Building pieces each live where they stand, and carry the building they
  // belong to, so they regroup without anyone re-deriving which is which.
  for (const b of world.buildings || []) {
    const anchor = anchorOf(b);
    for (const [x, z, ground] of b.footings || []) put(regionOf(x, z), `p:${x}:${z}`, [anchor, ground, b.y0, b.sill]);
    for (const [kind, axis, line, s0, s1, k, notches] of b.logs || []) {
      const [x, z] = axis === 'x' ? [(s0 + s1) / 2, line] : [line, (s0 + s1) / 2];
      put(regionOf(x, z), `l:${axis}:${line}:${s0}:${s1}:${k}`, [anchor, kind, notches || []]);
    }
    for (const [x0, z0, x1, z1, eave, axis] of b.roofs || []) {
      put(regionOf((x0 + x1) / 2, (z0 + z1) / 2), `o:${x0}:${z0}:${x1}:${z1}`, [anchor, eave, axis]);
    }
  }

  for (const m of (s.marks && s.marks.marks) || []) put(LOOSE, `m:${m.id}`, m);
  if (s.name) put(LOOSE, 'name', s.name);
  return out;
}

export function fromElements(seed, elements, visitor = {}) {
  const terrain = [];
  const removed = {};
  const stumps = [];
  const felled = [];
  const marks = [];
  const groups = new Map(); // anchor -> building being rebuilt
  let name = '';

  const building = (anchor, y0, sill) => {
    let b = groups.get(anchor);
    if (!b) groups.set(anchor, (b = { y0: 0, sill: null, footings: [], logs: [], roofs: [] }));
    if (y0 !== undefined) b.y0 = y0;
    if (sill !== undefined && sill !== null) b.sill = sill;
    return b;
  };

  for (const [region, m] of elements) {
    for (const [key, v] of m) {
      if (v === null || v === undefined) continue;
      const cut = key.indexOf(':');
      const kind = cut < 0 ? key : key.slice(0, cut);
      const rest = cut < 0 ? '' : key.slice(cut + 1);
      if (kind === 't') {
        const [x, z] = rest.split(':').map(Number);
        terrain.push(x, z, v[0], v[1]);
      } else if (kind === 'r') {
        (removed[region] || (removed[region] = [])).push(rest);
      } else if (kind === 's') {
        const [x, z] = rest.split(':').map(Number);
        stumps.push({ kind: v[0], x, y: v[1], z, r: v[2] });
      } else if (kind === 'f') {
        const at = rest.split(':');
        const x = Number(at[1]);
        const z = Number(at[2]);
        felled.push({ kind: at[0], x, z, y: v[0], s: v[1], yaw: v[2], dir: v[3], end: v[4], state: v[5], total: v[6], left: v[7], r0: v[8] });
      } else if (kind === 'p') {
        const [x, z] = rest.split(':').map(Number);
        building(v[0], v[2], v[3]).footings.push([x, z, v[1]]);
      } else if (kind === 'l') {
        const [axis, line, s0, s1, k] = rest.split(':');
        building(v[0]).logs.push([v[1], axis, Number(line), Number(s0), Number(s1), Number(k), v[2] || []]);
      } else if (kind === 'o') {
        const [x0, z0, x1, z1] = rest.split(':').map(Number);
        building(v[0]).roofs.push([x0, z0, x1, z1, v[1], v[2]]);
      } else if (kind === 'm') {
        marks.push(v);
      } else if (key === 'name') {
        name = v;
      }
    }
  }
  // A building needs somewhere to stand; pieces orphaned by a half-arrived
  // save would only throw when the mesher reached them.
  const buildings = [...groups.values()].filter((b) => b.footings.length);

  return {
    v: SNAPSHOT_VERSION,
    seed,
    name,
    saved: visitor.saved || 0,
    world: { v: 1, inv: visitor.inv || {}, datum: visitor.datum || null, terrain, forest: { removed, stumps, felled }, buildings },
    marks: { marks, tracked: visitor.tracked || null },
    player: visitor.player || {},
    hours: Number.isFinite(visitor.hours) ? visitor.hours : null,
  };
}

// The building every piece of it names: its lowest footing, which both
// machines work out the same way from the same set.
function anchorOf(b) {
  let best = null;
  for (const [x, z] of b.footings || []) {
    if (!best || x < best[0] || (x === best[0] && z < best[1])) best = [x, z];
  }
  return best ? `${best[0]}:${best[1]}` : '0:0';
}

// ── Changes ─────────────────────────────────────────────────────────────────

// What moved between two element maps. -> [{ r, k, v }], v === null = gone.
export function diffElements(before, after) {
  const ops = [];
  for (const [region, now] of after) {
    const was = before.get(region);
    for (const [key, value] of now) {
      if (!was) {
        ops.push({ r: region, k: key, v: value });
        continue;
      }
      const had = was.get(key);
      if (had === undefined || !same(had, value)) ops.push({ r: region, k: key, v: value });
    }
  }
  for (const [region, was] of before) {
    const now = after.get(region);
    for (const key of was.keys()) if (!now || !now.has(key)) ops.push({ r: region, k: key, v: null });
  }
  return ops;
}

// Fold changes in. -> the set of regions that moved.
export function applyOps(elements, ops) {
  const touched = new Set();
  for (const op of ops) {
    if (!op || typeof op.r !== 'string' || typeof op.k !== 'string') continue;
    let m = elements.get(op.r);
    if (op.v === null || op.v === undefined) {
      if (m && m.delete(op.k)) {
        touched.add(op.r);
        if (!m.size) elements.delete(op.r);
      }
      continue;
    }
    if (!m) elements.set(op.r, (m = new Map()));
    if (!same(m.get(op.k), op.v)) {
      m.set(op.k, op.v);
      touched.add(op.r);
    }
  }
  return touched;
}

export const cloneElements = (elements) => new Map([...elements].map(([r, m]) => [r, new Map(m)]));

// Element values are small JSON: nearly always a short array of numbers, so
// walk those rather than writing them out — this runs over every element in
// the world several times a second while someone is digging.
function same(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  return JSON.stringify(a) === JSON.stringify(b); // a mark: a flat object
}
