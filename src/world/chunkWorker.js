// Web Worker: generates chunk terrain + vegetation off the main thread.

import { growWorld } from './lands.js';
import { generateTerrain, generateSurface, generateVegetation, VEG_KINDS } from './chunkGen.js';

let gen = null;
let size = 64;
let trunkRadius = {};

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = growWorld(m.seed, m.structures, m.land, m.hikes);
    size = m.chunkSize;
    trunkRadius = m.trunkRadius;
    return;
  }
  if (m.type === 'hike') {
    gen.addHike(m.def);
    return;
  }
  if (m.type === 'chunk') {
    const t = generateTerrain(gen, m.cx, m.cz, m.step, size);
    const surface = generateSurface(gen, m.cx, m.cz, m.step, size);
    const out = { type: 'chunk', id: m.id, lod: m.lod, terrain: t, surface, veg: null };
    const transfer = [t.pos.buffer, t.nor.buffer, t.gnd.buffer, t.wat.buffer, t.idx.buffer, t.heights.buffer, t.paths.buffer, t.forest.buffer, t.wLevel.buffer, t.wData.buffer];
    if (t.high) transfer.push(t.high.buffer, t.hi.buffer);
    if (surface) transfer.push(surface.buffer);
    if (m.veg) {
      const v = generateVegetation(gen, m.cx, m.cz, size, trunkRadius);
      out.veg = v;
      for (const k of VEG_KINDS) transfer.push(v.lists[k].buffer);
      transfer.push(v.colliders.buffer);
    }
    self.postMessage(out, transfer);
  }
};
