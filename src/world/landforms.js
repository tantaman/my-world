// Which hikes' land is here yet.
//
// A hike is two things (see hikes.js): a card, which says what and where it
// is and is always here, and its land (the heights, lakes and trails, about
// 200 kB), which is fetched the first time it's needed. Nothing is grown
// within reach of a hike until its land has arrived: the chunks, the map and
// the far view each ask ready() for the square they're about to grow, and
// wait if the answer is no. Asking is what sends for it.
//
// Emits (see core/events.js):
//   'land'    (def)        a hike's land has arrived: def is the whole hike,
//                          card and land, as landform.js reads it
//   'failed'  (card, err)  it couldn't be fetched; it's tried again later
//
// A fetch that fails is tried again, but not straight away: after RETRY[0]
// seconds, then RETRY[1], and so on, so a server that's down isn't asked
// every frame. (A page left open across a new deploy asks for a file that's
// gone; only a reload mends that.)

import { Emitter } from '../core/events.js';
import { LAND_REACH } from './water.js';

const RETRY = [2, 5, 15, 30]; // s to wait before asking again, after each failure in a row

// How far (m) from a hike's middle its land can change anything.
export const reachOf = (card) => card.radius + card.fade + LAND_REACH;

// The whole hike for a registry entry: its card, with its land.
export async function loadHike({ load, ...card }) {
  const land = await load();
  return { ...card, ...(land.default || land) };
}

export const loadAll = (entries) => Promise.all(entries.map(loadHike));

export class Lands extends Emitter {
  // entries: HIKES (hikes.js): cards, each with load() → its land
  constructor(entries) {
    super();
    this.entries = new Map(entries.map((e) => [e.id, e]));
    this.cards = entries.map(({ load, ...card }) => card);
    this.defs = new Map(); // id -> the whole hike, once its land is here
    this.loading = new Map(); // id -> the promise of it
    this.failures = new Map(); // id -> { count, until (ms) }
  }

  has(id) {
    return this.defs.has(id);
  }

  // → Promise of the whole hike. Fetched once; 'land' is emitted when it's here.
  ensure(id) {
    if (this.defs.has(id)) return Promise.resolve(this.defs.get(id));
    let p = this.loading.get(id);
    if (p) return p;
    const entry = this.entries.get(id);
    if (!entry) return Promise.reject(new Error(`no hike called ${id}`));
    p = loadHike(entry).then(
      (def) => {
        this.loading.delete(id);
        this.failures.delete(id);
        if (!this.defs.has(id)) {
          this.defs.set(id, def);
          this.emit('land', def);
        }
        return def;
      },
      (err) => {
        this.loading.delete(id);
        const f = this.failures.get(id) || { count: 0, until: 0 };
        f.count++;
        f.until = Date.now() + RETRY[Math.min(f.count, RETRY.length) - 1] * 1000;
        this.failures.set(id, f);
        console.warn(`could not fetch the land of ${id}`, err);
        this.emit('failed', this.cards.find((c) => c.id === id), err);
        throw err;
      },
    );
    p.catch(() => {});
    this.loading.set(id, p);
    return p;
  }

  // Is everything the square (x0, z0)–(x1, z1) is grown from here? If not,
  // sends for what's missing (unless ask is false) and says no for now.
  ready(x0, z0, x1, z1, ask = true) {
    let ok = true;
    for (const c of this.cards) {
      if (this.defs.has(c.id)) continue;
      const dx = Math.max(x0 - c.at[0], 0, c.at[0] - x1);
      const dz = Math.max(z0 - c.at[1], 0, c.at[1] - z1);
      if (dx * dx + dz * dz > reachOf(c) ** 2) continue;
      ok = false;
      const f = this.failures.get(c.id);
      if (ask && !(f && Date.now() < f.until)) this.ensure(c.id);
    }
    return ok;
  }
}
