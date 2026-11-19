// Map tile cache. Tiles are rendered by a couple of Web Workers (or, if those
// aren't available, on the main thread a tile per frame) and kept as
// ImageBitmaps / canvases, least-recently-used first out.

import { WorldGen } from '../world/worldgen.js';
import { TILE, renderTile, createVegCache } from './mapRender.js';

const MAX_TILES = 320;

export const tileKey = (level, tx, tz) => `${level}:${tx}:${tz}`;

export class MapTiles {
  constructor(seed, structures = []) {
    this.seed = seed;
    this.structures = structures.map((s) => ({ x: s.x, z: s.z, radius: s.radius }));
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
        w.postMessage({ type: 'init', seed, structures: this.structures });
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

  // Replaces the wish list. Nearest (lowest pri) first.
  want(list) {
    this.wanted = list.filter((w) => !this.cache.has(w.key) && !this.inFlight.has(w.key)).sort((a, b) => a.pri - b.pri);
    this.pump();
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
      const gen = new WorldGen(this.seed, this.structures);
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
