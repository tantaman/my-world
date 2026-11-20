// Map tile cache. Tiles are rendered by a couple of Web Workers (or, if those
// aren't available, on the main thread a tile per frame) and kept as
// ImageBitmaps / canvases, least-recently-used first out.

import { growWorld } from '../world/lands.js';
import { TILE, renderTile, createVegCache } from './mapRender.js';

// Past its own edges a tile reads a pixel of border, and the trees of every
// 64 m chunk it touches (mapRender.js): what it's drawn from reaches this
// much further (m), plus a pixel.
const TILE_READS = 72;

const MAX_TILES = 320;

export const tileKey = (level, tx, tz) => `${level}:${tx}:${tz}`;

export class MapTiles {
  // land: which land the world is grown on (see world/lands.js).
  // hikes: the hikes whose land is here already; addHike() brings more.
  // ready(x0, z0, x1, z1, ask): whether all a square is drawn from is here
  // (see world/landforms.js); a tile waits until it is.
  constructor(seed, structures = [], land = 1, hikes = [], ready = () => true) {
    this.seed = seed;
    this.land = land;
    this.structures = structures.map((s) => ({ x: s.x, z: s.z, radius: s.radius }));
    this.hikes = [...hikes];
    this.ready = ready;
    this.cache = new Map(); // key -> { img }
    this.inFlight = new Set();
    this.wanted = []; // [{ key, level, tx, tz, pri }]
    this.onTile = null;
    this.workers = [];
    this.busy = [];
    this.local = null;
    this.epoch = 0; // bumps when in-flight work is lost
    const count = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
    try {
      for (let i = 0; i < count; i++) {
        const w = new Worker(new URL('./mapWorker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this._receive(i, e.data);
        w.onerror = (e) => {
          console.warn('map worker failed, rendering on the main thread', e.message);
          this._dropWorkers();
        };
        w.postMessage({ type: 'init', seed, land, structures: this.structures, hikes });
        this.workers.push(w);
        this.busy.push(0);
      }
    } catch (err) {
      console.warn('Web Workers unavailable, rendering the map on the main thread', err);
      this._dropWorkers();
    }
  }

  get(level, tx, tz) {
    const k = tileKey(level, tx, tz);
    const t = this.cache.get(k);
    if (t) {
      this.cache.delete(k);
      this.cache.set(k, t);
    }
    return t ? t.img : null;
  }

  has(level, tx, tz) {
    return this.cache.has(tileKey(level, tx, tz));
  }

  // Replaces the wish list. Nearest (lowest pri) first. A tile near a hike
  // whose land isn't here waits for it, and asks for it unless ask is false
  // (drawing ahead of time shouldn't fetch land nobody has gone to see).
  want(list, ask = true) {
    this.wanted = list.filter((w) => !this.cache.has(w.key) && !this.inFlight.has(w.key) && this._ready(w, ask)).sort((a, b) => a.pri - b.pri);
    this.pump();
  }

  _ready(w, ask) {
    const mpp = 2 ** w.level;
    const span = TILE * mpp;
    const x0 = w.tx * span;
    const z0 = w.tz * span;
    const m = TILE_READS + mpp;
    return this.ready(x0 - m, z0 - m, x0 + span + m, z0 + span + m, ask);
  }

  // A hike's land has arrived: tiles are drawn with it from now on.
  addHike(def) {
    if (this.hikes.some((h) => h.id === def.id)) return;
    this.hikes.push(def);
    for (const w of this.workers) w.postMessage({ type: 'hike', def });
    if (this.local) this.local.gen.addHike(def);
  }

  pump() {
    if (this.workers.length) {
      for (let i = 0; i < this.workers.length; i++) {
        while (this.busy[i] < 2 && this.wanted.length) {
          const w = this.wanted.shift();
          this.inFlight.add(w.key);
          this.busy[i]++;
          this.workers[i].postMessage({ type: 'tile', key: w.key, level: w.level, tx: w.tx, tz: w.tz });
        }
      }
      return;
    }
    // main-thread fallback: one tile per call
    const w = this.wanted.shift();
    if (!w) return;
    this.inFlight.add(w.key);
    if (!this.local) {
      const gen = growWorld(this.seed, this.structures, this.land, this.hikes);
      this.local = { gen, vegFor: createVegCache(gen, 48) };
    }
    const px = renderTile(this.local.gen, w.level, w.tx, w.tz, this.local.vegFor);
    this._store(w.key, px);
  }

  get pending() {
    return this.wanted.length + this.inFlight.size;
  }

  _receive(i, m) {
    if (m.type !== 'tile') return;
    this.busy[i] = Math.max(0, this.busy[i] - 1);
    this._store(m.key, m.px);
    this.pump();
  }

  _store(key, px) {
    const data = new ImageData(px, TILE, TILE);
    const done = (img) => {
      this.inFlight.delete(key);
      this.cache.set(key, { img });
      while (this.cache.size > MAX_TILES) {
        const old = this.cache.keys().next().value;
        const t = this.cache.get(old);
        if (t.img.close) t.img.close();
        this.cache.delete(old);
      }
      if (this.onTile) this.onTile(key);
    };
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(data).then(done, () => done(toCanvas(data)));
    } else done(toCanvas(data));
  }

  _dropWorkers() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.busy = [];
    this.inFlight.clear();
    this.epoch++;
  }
}

function toCanvas(data) {
  const c = document.createElement('canvas');
  c.width = data.width;
  c.height = data.height;
  c.getContext('2d').putImageData(data, 0, 0);
  return c;
}
