// Web Worker: samples the land for the far view (grid.js), off the main
// thread. It grows a world of its own from the same seed, so what it samples
// is the land you will walk on.

import { growWorld } from '../world/lands.js';
import { Earth } from '../world/earth.js';
import { sampleFar } from './grid.js';

let gen = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = growWorld(m.seed, m.structures, m.land, m.hikes, m.earth ? new Earth(m.earth.meta) : null);
    for (const t of m.earth ? m.earth.got : []) gen.addEarth(t);
    return;
  }
  // a real place's land has been fetched: this world needs it too, or the
  // far view would draw the forest where the real land now is
  if (m.type === 'land') {
    gen.addHike(m.def);
    return;
  }
  // and a tile of the real Earth, likewise
  if (m.type === 'earth') {
    gen.addEarth(m.tile);
    return;
  }
  if (m.type === 'far') {
    const g = sampleFar(gen, m.x0, m.z0, m.n, m.step);
    self.postMessage({ type: 'far', id: m.id, grid: g }, [g.h.buffer, g.water.buffer, g.forest.buffer, g.species.buffer, g.bare.buffer, g.sand.buffer, g.land.buffer, g.country.buffer, g.real.buffer]);
  }
};
