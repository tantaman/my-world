// Web Worker: renders map tiles off the main thread.

import { growWorld } from '../world/lands.js';
import { Earth } from '../world/earth.js';
import { renderTile, createVegCache } from './mapRender.js';

let gen = null;
let vegFor = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = growWorld(m.seed, m.structures, m.land, m.hikes, m.earth ? new Earth(m.earth.meta) : null);
    for (const t of m.earth ? m.earth.got : []) gen.addEarth(t);
    vegFor = createVegCache(gen);
    return;
  }
  if (m.type === 'hike') {
    gen.addHike(m.def);
    return;
  }
  if (m.type === 'earth') {
    gen.addEarth(m.tile);
    return;
  }
  if (m.type === 'tile') {
    const px = renderTile(gen, m.level, m.tx, m.tz, vegFor);
    self.postMessage({ type: 'tile', key: m.key, px }, [px.buffer]);
  }
};
