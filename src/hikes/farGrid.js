// The land round a hike, sampled coarsely, for drawing it far off: from the
// top of a real mountain you can see a long way, much further than the
// forest is streamed in around you (see farView.js). Pure, so a worker can
// do it, and the same world description the chunks are grown from, so the
// far land is the land you'll walk on.

import { NO_WATER } from '../world/water.js';

// Still water and rivers show from afar; a stream is too narrow to.
const SEEN_FAR = new Set(['lake', 'pond', 'river']);

// An n × n grid `step` metres apart from (x0, z0):
//   h        the ground
//   water    the water's level where there is water over the ground, else NO_WATER
//   forest   how thickly wooded (0..1)
//   species  broadleaf (-1) .. conifers (1)
//   bare, sand, land   what a real place's ground is made of (WorldGen.surface)
export function sampleFar(gen, x0, z0, n, step) {
  const h = new Float32Array(n * n);
  const water = new Float32Array(n * n);
  const forest = new Float32Array(n * n);
  const species = new Float32Array(n * n);
  const bare = new Float32Array(n * n);
  const sand = new Float32Array(n * n);
  const land = new Float32Array(n * n);
  const at = { bare: 0, sand: 0, land: 0 };
  const w = gen.water;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = x0 + i * step;
      const z = z0 + j * step;
      const g = gen.height(x, z);
      h[k] = g;
      water[k] = w.edge < 0 && w.region && SEEN_FAR.has(w.kind) && w.level > g ? w.level : NO_WATER;
      forest[k] = gen.forest(x, z);
      species[k] = gen.species(x, z);
      gen.surface(x, z, at);
      bare[k] = at.bare;
      sand[k] = at.sand;
      land[k] = at.land;
    }
  }
  return { x0, z0, n, step, h, water, forest, species, bare, sand, land };
}
