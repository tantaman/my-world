// Web Worker: generates chunk terrain + vegetation off the main thread.

import { WorldGen } from './worldgen.js';
import { generateTerrain, generateVegetation, VEG_KINDS } from './chunkGen.js';

let gen = null;
let size = 64;
let trunkRadius = {};

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = new WorldGen(m.seed, m.structures);
    size = m.chunkSize;
    trunkRadius = m.trunkRadius;
    return;
  }
  if (m.type === 'chunk') {
    const t = generateTerrain(gen, m.cx, m.cz, m.step, size);
    const out = { type: 'chunk', id: m.id, lod: m.lod, terrain: t, veg: null };
    const transfer = [t.pos.buffer, t.nor.buffer, t.gnd.buffer, t.idx.buffer, t.heights.buffer, t.paths.buffer, t.forest.buffer];
    if (m.veg) {
      const v = generateVegetation(gen, m.cx, m.cz, size, trunkRadius);
      out.veg = v;
      for (const k of VEG_KINDS) transfer.push(v.lists[k].buffer);
      transfer.push(v.colliders.buffer);
    }
    self.postMessage(out, transfer);
  }
};
