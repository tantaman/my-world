// What a saved world is made of.
//
// The forest is procedural, so nothing about the land as it was grown is
// saved: only a seed, and what was changed. Each system that has something
// worth keeping registers a *domain* — its share of the save — and everything
// that keeps a world (this browser, the save server, the socket other people
// build over) works off the list. Adding something new to save is one
// register() call next to the system that owns it; nothing in src/save/ has
// to learn about it.
//
//   domains.register({
//     id: 'fires',                      // its name in a save, for good
//     scope: 'world',                   // 'world': part of the place, shared with everyone in it
//                                       // 'yours': travels with you (what you carry, where you stand)
//     collect: () => fires.serialize(), // -> plain JSON
//     restore: (data) => fires.load(data),
//
//     // 'world' domains also say how they are cut into elements (see below)
//     kinds: ['c'],
//     encode(data, put) { for (const f of data) put(regionOf(f.x, f.z), `c:${f.x}:${f.z}`, [f.wood, f.lit]); },
//     decode() {
//       const out = [];
//       return { take(region, kind, rest, value) { ... out.push(...) }, done: () => out };
//     },
//
//     // optional
//     validate: (raw) => tidy,          // a save is bytes somebody sent us: check the shape
//     adopt: (data, ops) => ...,        // someone else changed it while you're here (default: restore)
//     adoptOps: (ops) => ...,           // ...or take the changes one by one, if rebuilding is too dear
//     local: 'build',                   // which of this browser's copies keeps it (see local.js)
//   });
//
// Elements. A world domain's data is cut into *elements*: one thing each — a
// ground vertex, a stump, a log — under a key every machine works out the
// same way, `kind:rest`. That is what makes two people changing the same
// place merge instead of collide: the unit of conflict is the thing itself.
// Elements are grouped by region (a 64 m square, or LOOSE for things with no
// place). The first part of the key, the kind, says which domain owns it.
//
// Keys and values already out in the world are spelled the way they are
// (test/golden/save-elements.json): change how a domain spells its elements
// and the worlds saved before the change stop opening. Add, don't alter.

export class SaveDomains {
  constructor() {
    this.list = [];
    this.byId = new Map();
    this.byKind = new Map();
  }

  register(domain) {
    const d = { scope: 'world', local: 'build', kinds: [], ...domain };
    if (!d.id) throw new Error('a save domain needs an id');
    if (this.byId.has(d.id)) throw new Error(`save domain "${d.id}" is already registered`);
    if (d.scope !== 'world' && d.scope !== 'yours') throw new Error(`save domain "${d.id}": scope is 'world' or 'yours'`);
    if (d.scope === 'world' && (!d.kinds.length || !d.encode || !d.decode)) throw new Error(`save domain "${d.id}": a world domain needs kinds, encode and decode`);
    for (const kind of d.kinds) {
      const taken = this.byKind.get(kind);
      if (taken) throw new Error(`element kind "${kind}" belongs to "${taken.id}" already`);
      this.byKind.set(kind, d);
    }
    this.list.push(d);
    this.byId.set(d.id, d);
    return d;
  }

  get(id) {
    return this.byId.get(id);
  }

  // The domain that owns an element, or undefined for a kind this build of the
  // game has never heard of (something a newer one saved).
  owner(key) {
    return this.byKind.get(kindOf(key));
  }

  // ── The live world ⇄ a state ──────────────────────────────────────────────
  // A state is { [domain id]: data }: everything, as plain JSON.

  collect(only = null) {
    const state = {};
    for (const d of this.list) {
      if (!d.collect || (only && !only(d))) continue;
      state[d.id] = d.collect();
    }
    return state;
  }

  restore(state) {
    for (const d of this.list) if (d.restore && state[d.id] !== undefined) d.restore(state[d.id]);
  }

  // Check the shape of a state that came from somewhere else.
  validate(state) {
    const out = {};
    for (const d of this.list) {
      if (!state || state[d.id] === undefined) continue;
      out[d.id] = d.validate ? d.validate(state[d.id]) : state[d.id];
    }
    return out;
  }

  // ── A state ⇄ elements (the part of it that is the world) ────────────────
  // -> Map<region, Map<key, value>>

  toElements(state) {
    const out = new Map();
    const put = (region, key, value) => {
      let m = out.get(region);
      if (!m) out.set(region, (m = new Map()));
      m.set(key, value);
    };
    for (const d of this.list) if (d.scope === 'world' && state[d.id] !== undefined) d.encode(state[d.id], put);
    return out;
  }

  // -> the world part of a state. `only`: just these domains.
  fromElements(elements, only = null) {
    const readers = new Map();
    for (const d of this.list) if (d.scope === 'world' && (!only || only.has(d))) readers.set(d, d.decode());
    for (const [region, m] of elements) {
      for (const [key, value] of m) {
        if (value === null || value === undefined) continue;
        const cut = key.indexOf(':');
        const kind = cut < 0 ? key : key.slice(0, cut);
        const reader = readers.get(this.byKind.get(kind));
        if (reader) reader.take(region, kind, cut < 0 ? '' : key.slice(cut + 1), value, key);
      }
    }
    const state = {};
    for (const [d, reader] of readers) state[d.id] = reader.done();
    return state;
  }

  // ── A state ⇄ what is yours ───────────────────────────────────────────────
  // The save server keeps this beside the world, as one small blob.

  yours(state) {
    const out = { saved: Date.now() };
    for (const d of this.list) if (d.scope === 'yours' && state[d.id] !== undefined) out[d.id] = state[d.id];
    return out;
  }

  fromYours(blob) {
    const state = {};
    for (const d of this.list) if (d.scope === 'yours' && blob && blob[d.id] !== undefined) state[d.id] = blob[d.id];
    return state;
  }

  // ── Someone else's changes ────────────────────────────────────────────────
  // `elements` already has the ops folded in; this makes the world in front
  // of you match. -> the ids of the domains that moved.
  adopt(ops, elements) {
    const touched = new Map();
    for (const op of ops) {
      const d = this.owner(op.k);
      if (!d) continue;
      if (!touched.has(d)) touched.set(d, []);
      touched.get(d).push(op);
    }
    const whole = new Set([...touched.keys()].filter((d) => !d.adoptOps));
    const state = whole.size ? this.fromElements(elements, whole) : {};
    for (const [d, list] of touched) {
      if (d.adoptOps) d.adoptOps(list);
      else {
        const data = d.validate ? d.validate(state[d.id]) : state[d.id];
        if (d.adopt) d.adopt(data, list);
        else if (d.restore) d.restore(data);
      }
    }
    return [...touched.keys()].map((d) => d.id);
  }
}

export const kindOf = (key) => {
  const cut = key.indexOf(':');
  return cut < 0 ? key : key.slice(0, cut);
};
