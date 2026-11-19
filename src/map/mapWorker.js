// Web Worker: renders map tiles off the main thread.

import { WorldGen } from '../world/worldgen.js';
import { renderTile, createVegCache } from './mapRender.js';

let gen = null;
let vegFor = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = new WorldGen(m.seed, m.structures);
    vegFor = createVegCache(gen);
    return;
  }
  if (m.type === 'tile') {
    const px = renderTile(gen, m.level, m.tx, m.tz, vegFor);
    self.postMessage({ type: 'tile', key: m.key, px }, [px.buffer]);
  }
};
