// A square of land, sampled coarsely, for drawing it far off (see view.js):
// from the top of a mountain you can see a long way, much further than the
// forest is streamed in around you. Pure, so a worker can do it, and the same
// world description the chunks are grown from, so the far land is the land
// you'll walk on.

import { NO_WATER } from '../world/water.js';

// Still water and rivers show from afar; a stream is too narrow to. A river
// is narrower than the grid this samples on, so one counts as seen from this
// far to either side of it (as a share of the grid's step), or it would come
// out as a row of dots.
const SEEN_FAR = new Set(['lake', 'pond', 'river']);
const RIVER_SEEN = 0.45;

// An n × n grid `step` metres apart from (x0, z0):
//   h        the ground
//   water    the water's level where there is water over the ground, else NO_WATER
//   shore    how far (m) inside the water's edge it is (out of it: less than
//            nothing), within a couple of steps of it: so the edge can be
//            drawn where it is between two heights, not round the grid
//   forest   how thickly wooded (0..1)
//   species  broadleaf (-1) .. conifers (1)
//   bare, sand, land, country   what a real place's ground is made of, and
//            which country's it is (WorldGen.surface)
//   real     how high it really is (m over the sea) on a real place, for the
//            beds in a sandstone country's cliffs; NaN elsewhere
//   above, snow   how far it is above the trees, and how much snow lies there
//            (0..1 each: a land's or a real place's high ground)
export function sampleFar(gen, x0, z0, n, step) {
  const h = new Float32Array(n * n);
  const water = new Float32Array(n * n);
  const shore = new Float32Array(n * n);
  const forest = new Float32Array(n * n);
  const species = new Float32Array(n * n);
  const bare = new Float32Array(n * n);
  const sand = new Float32Array(n * n);
  const land = new Float32Array(n * n);
  const country = new Uint8Array(n * n);
  const real = new Float32Array(n * n);
  const above = new Float32Array(n * n);
  const snow = new Float32Array(n * n);
  const high = gen.highIn(x0, z0, x0 + (n - 1) * step, z0 + (n - 1) * step);
  const at = { bare: 0, sand: 0, land: 0, country: 0 };
  const w = gen.water;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = x0 + i * step;
      const z = z0 + j * step;
      const g = gen.height(x, z);
      h[k] = g;
      water[k] = w.edge < 0 && w.region && SEEN_FAR.has(w.kind) && w.level > g ? w.level : NO_WATER;
      const seen = water[k] !== NO_WATER;
      if (w.kind === 'river' && w.edge < step * RIVER_SEEN && w.level > NO_WATER / 2) water[k] = w.level;
      // (a river drawn wider than it is, to be seen at all, is drawn to there)
      const edge = seen ? w.edge : w.kind === 'river' && water[k] !== NO_WATER ? w.edge - step * RIVER_SEEN : Math.max(w.edge, 0.01);
      shore[k] = Math.max(-2 * step, Math.min(2 * step, -edge));
      // where the real sea runs on past a hike's land, it is sea from afar
      if (water[k] === NO_WATER) {
        for (const L of gen.landforms) {
          if (!L.openSea(x, z)) continue;
          water[k] = L.level + L.offset;
          h[k] = water[k] - 1;
          shore[k] = step;
        }
      }
      // (what's drawn as water is in it, whatever the nearest edge is of)
      if (water[k] !== NO_WATER) shore[k] = Math.max(shore[k], 0.5);
      forest[k] = gen.forest(x, z);
      species[k] = gen.species(x, z);
      gen.surface(x, z, at);
      bare[k] = at.bare;
      sand[k] = at.sand;
      land[k] = at.land;
      country[k] = at.country;
      real[k] = NaN;
      for (const L of gen.landforms) if (L.weight(x, z) > 0) real[k] = (g - L.offset) / L.def.scale + (L.def.base || 0);
      if (high) {
        above[k] = gen.above(x, z, g);
        snow[k] = gen.snow(x, z, g);
      }
    }
  }
  return { x0, z0, n, step, h, water, shore, forest, species, bare, sand, land, country, real, above, snow };
}
