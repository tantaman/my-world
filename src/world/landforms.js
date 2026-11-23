// Which real land is here yet: which hikes' land, and which of the real
// Earth's tiles. (Not the land a world is grown on: that is lands.js. A
// hike's land is a Landform, landform.js; the Earth is earth.js.)
//
// A hike is two things (see hikes.js): a card, which says what and where it
// is and is always here, and its land (the heights, lakes and trails, about
// 200 kB), which is fetched the first time it's needed. The Earth out past
// the forest round the middle is a tile 15° square at a time, and its
// climate (earthTiles.js), each fetched the first time something on it is
// grown. Nothing is grown within reach of a hike, or on the Earth, until
// what it's grown from has arrived: the chunks, the map and the far view
// each ask ready() for the square they're about to grow, and wait if the
// answer is no. Asking is what sends for it.
//
// Emits (see core/events.js):
//   'land'    (def)        a hike's land has arrived: def is the whole hike,
//                          card and land, as landform.js reads it
//   'earth'   (tile)       a tile of the Earth has arrived, { name, bytes },
//                          or its climate, { climate: { names, bytes } }:
//                          hand it to each world (WorldGen.addEarth)
//   'failed'  (card, err)  it couldn't be fetched; it's tried again later
//                          (card is null for a tile of the Earth)
//
// A fetch that fails is tried again, but not straight away: after RETRY[0]
// seconds, then RETRY[1], and so on, so a server that's down isn't asked
// every frame. (A page left open across a new deploy asks for a file that's
// gone; only a reload mends that.)

import { Emitter } from '../core/events.js';
import { LANDFORM_REACH } from './water.js';
import { inflate, tilesIn, detailList } from './earth.js';

const RETRY = [2, 5, 15, 30]; // s to wait before asking again, after each failure in a row

// How far (m) from a hike's middle its land can change anything.
export const reachOf = (card) => card.radius + card.fade + LANDFORM_REACH;

// The whole hike for a registry entry: its card, with its land.
export async function loadHike({ load, ...card }) {
  const land = await load();
  return { ...card, ...(land.default || land) };
}

export const loadAll = (entries) => Promise.all(entries.map(loadHike));

// Whether any of the square (x0, z0)–(x1, z1) is within a hike's reach.
function within(card, x0, z0, x1, z1) {
  const dx = Math.max(x0 - card.at[0], 0, card.at[0] - x1);
  const dz = Math.max(z0 - card.at[1], 0, card.at[1] - z1);
  return dx * dx + dz * dz <= reachOf(card) ** 2;
}

export class Landforms extends Emitter {
  // entries: HIKES (hikes.js): cards, each with load() → its land
  // earth: { tiles: EARTH_TILES, climate: CLIMATE, details: EARTH_DETAILS }
  // (earthTiles.js), each a load() by name (a detail's is its .load); or
  // null for a world with no Earth under it
  constructor(entries, earth = null) {
    super();
    this.entries = new Map(entries.map((e) => [e.id, e]));
    this.cards = entries.map(({ load, ...card }) => card);
    this.defs = new Map(); // id -> the whole hike, once its land is here
    this.loading = new Map(); // id -> the promise of it
    this.failures = new Map(); // id -> { count, until (ms) }
    this.earth = earth;
    this.details = earth ? detailList(earth.details) : [];
    this.got = new Map(); // tile name (or 'climate') -> what came, once it has
    this._names = new Set();
  }

  // Every tile of the Earth here so far, and its climate: what a world grown
  // now is handed (WorldGen.addEarth, each).
  get earthHere() {
    return [...this.got.values()];
  }

  // → Promise of the tile of the Earth called `name` ('climate' for the
  // climate), fetched once; 'earth' is emitted when it's here.
  wantEarth(name) {
    if (!this.earth) return Promise.reject(new Error('no Earth under this world'));
    if (this.got.has(name)) return Promise.resolve(this.got.get(name));
    const key = `earth:${name}`;
    let p = this.loading.get(key);
    if (p) return p;
    const f = this.failures.get(key);
    if (f && Date.now() < f.until) return Promise.reject(new Error(`the Earth's tile ${name} failed to come, a moment ago`));
    const detail = this.earth.details && this.earth.details[name];
    const load = name === 'climate' ? this.earth.climate : this.earth.tiles[name] || (detail && detail.load);
    if (!load) return Promise.reject(new Error(`no tile of the Earth called ${name}`));
    p = load()
      .then(async (m) => {
        const d = m.default || m;
        return name === 'climate' ? { climate: { names: d.names, bytes: await inflate(d.bytes) } } : { name, bytes: await inflate(d) };
      })
      .then(
        (tile) => {
          this.loading.delete(key);
          this.failures.delete(key);
          if (!this.got.has(name)) {
            this.got.set(name, tile);
            this.emit('earth', tile);
          }
          return tile;
        },
        (err) => {
          this.loading.delete(key);
          const f = this.failures.get(key) || { count: 0, until: 0 };
          f.count++;
          f.until = Date.now() + RETRY[Math.min(f.count, RETRY.length) - 1] * 1000;
          this.failures.set(key, f);
          console.warn(`could not fetch the Earth's ${name}`, err);
          this.emit('failed', null, err);
          throw err;
        },
      );
    p.catch(() => {});
    this.loading.set(key, p);
    return p;
  }

  // Is all of the Earth under the square (x0, z0)–(x1, z1) here (its tiles
  // and the climate)? If not, sends for it (unless ask is false) and says
  // no for now.
  earthReady(x0, z0, x1, z1, ask = true) {
    if (!this.earth) return true;
    const names = tilesIn(x0, z0, x1, z1, this._names, this.details);
    if (!names.size) return true;
    names.add('climate');
    let ok = true;
    for (const n of names) {
      if (this.got.has(n)) continue;
      ok = false;
      if (ask) this.wantEarth(n).catch(() => {});
    }
    names.clear();
    return ok;
  }

  // → Promise that the Earth under each of the boxes ([x0, z0, x1, z1]) is
  // here, sent for now.
  earthUnder(boxes) {
    const names = new Set();
    for (const b of boxes) tilesIn(b[0], b[1], b[2], b[3], names, this.details);
    if (names.size) names.add('climate');
    return Promise.all([...names].map((n) => this.wantEarth(n)));
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
    // (and the Earth under it, if any, before it's said to be here: whatever
    // is put up on its land when it comes stands on the Earth's, round it)
    const box = (c) => [c.at[0] - reachOf(c), c.at[1] - reachOf(c), c.at[0] + reachOf(c), c.at[1] + reachOf(c)];
    p = loadHike(entry)
      .then(async (def) => {
        if (this.earth) await this.earthUnder([box(entry)]);
        return def;
      })
      .then(
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

  // The hike, if there is one, within whose reach the square (x0, z0)–(x1, z1)
  // lies or partly lies, whether its land is here yet or not: what is grown
  // there is not the forest's alone.
  reaches(x0, z0, x1, z1) {
    for (const c of this.cards) if (within(c, x0, z0, x1, z1)) return c;
    return null;
  }

  // Is everything the square (x0, z0)–(x1, z1) is grown from here (the land
  // of any hike within reach, and the Earth under it)? If not, sends for
  // what's missing (unless ask is false) and says no for now.
  ready(x0, z0, x1, z1, ask = true) {
    let ok = this.earthReady(x0, z0, x1, z1, ask);
    for (const c of this.cards) {
      if (this.defs.has(c.id)) continue;
      if (!within(c, x0, z0, x1, z1)) continue;
      ok = false;
      const f = this.failures.get(c.id);
      if (ask && !(f && Date.now() < f.until)) this.ensure(c.id);
    }
    return ok;
  }
}
