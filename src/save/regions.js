// Elements, grouped by 64 m regions, and the changes between two sets of them.
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
// What the elements *mean* is each domain's own business (see domains.js).
// Nothing in this file knows one kind from another.

export const REGION = 64; // metres; CONFIG.chunkSize
export const LOOSE = '*'; // things with no place in the world: marks, the name

export const regionOf = (x, z) => `${Math.floor(x / REGION)},${Math.floor(z / REGION)}`;
export const keyOf = (rx, rz) => `${rx},${rz}`;
export const parseKey = (key) => key.split(',').map(Number);

// ── Whose value is it? ──────────────────────────────────────────────────────
// An element map is a *record* — of what the server holds, of what was saved.
// The game's own objects must never end up inside one, nor the record's
// inside the game: a mark that is renamed in place would rename the record of
// what was sent too, the two would never differ again, and the rename would
// never go out. So values are copied on the way in (ops made by diffElements)
// and on the way out (SaveDomains.fromElements).
export const own = (v) => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(own);
  const out = {};
  for (const k in v) out[k] = own(v[k]);
  return out;
};

// ── Changes ─────────────────────────────────────────────────────────────────

// What moved between two element maps. -> [{ r, k, v }], v === null = gone.
// The values in the ops are copies: they can be kept, sent, and folded into a
// record without anything that happens to `after` later showing through.
//
// `owned(key)`: an element this build doesn't know how to make is never
// reported gone. Its absence from `after` only means we didn't write it — a
// newer version of the game did, and an older one walking through the same
// world must not sweep it away.
export function diffElements(before, after, owned = null) {
  const ops = [];
  for (const [region, now] of after) {
    const was = before.get(region);
    for (const [key, value] of now) {
      if (!was) {
        ops.push({ r: region, k: key, v: own(value) });
        continue;
      }
      const had = was.get(key);
      if (had === undefined || !same(had, value)) ops.push({ r: region, k: key, v: own(value) });
    }
  }
  for (const [region, was] of before) {
    const now = after.get(region);
    for (const key of was.keys()) {
      if (now && now.has(key)) continue;
      if (owned && !owned(key)) continue;
      ops.push({ r: region, k: key, v: null });
    }
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

// Element maps as plain JSON and back, for this browser's copy of a world.
export function elementsToPlain(elements) {
  const out = {};
  for (const [r, m] of elements) out[r] = Object.fromEntries(m);
  return out;
}

export function plainToElements(plain) {
  const out = new Map();
  for (const r in plain || {}) out.set(r, new Map(Object.entries(plain[r])));
  return out;
}

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
