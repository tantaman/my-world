// Web Worker: samples the land round a hike for its far view (farGrid.js),
// off the main thread.

import { growWorld } from '../world/lands.js';
import { sampleFar } from './farGrid.js';

let gen = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = growWorld(m.seed, m.structures, m.land, m.hikes);
    return;
  }
  if (m.type === 'hike') {
    gen.addHike(m.def);
    return;
  }
  if (m.type === 'far') {
    const g = sampleFar(gen, m.x0, m.z0, m.n, m.step);
    self.postMessage({ type: 'far', id: m.id, grid: g }, [g.h.buffer, g.water.buffer, g.forest.buffer, g.species.buffer, g.bare.buffer, g.sand.buffer, g.land.buffer, g.country.buffer]);
  }
};
