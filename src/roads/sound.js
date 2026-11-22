// What a road sounds like underfoot. Tarmac is the airfields' (airports/
// sound.js); a gravel road is loose, small, rounded stone over packed earth:
// a grinding crunch, finer and softer than the railway's ballast.

import { defineSurface } from '../audio/footsteps.js';
import { rand } from '../core/geom.js';

defineSurface('gravel', {
  thump: 0.65,
  step({ s, t, run, sharp, noise }) {
    noise(s.white, t, 0.18, [['bandpass', 1050, 0.8]], 0.7 * sharp, 0.003, 0.08);
    const grains = 6 + Math.floor(rand(0, 4) + run * 3);
    for (let i = 0; i < grains; i++) noise(s.white, t + rand(0.004, 0.1), 0.016, [['bandpass', rand(2200, 4200), 2.5]], rand(0.08, 0.24) * sharp, 0.001, rand(0.005, 0.011));
  },
});
