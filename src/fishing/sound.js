// What fishing sounds like, made from noise and oscillators like the rest
// (audio/sfx.js): the cast whistling out and the reel paying out line, the
// float landing, a fish at the bait, the bite, the strike, the reel's click,
// the drag letting line go on a run, a line snapping, and a fish landed.

import { defineSfx } from '../audio/sfx.js';
import { rand } from '../core/geom.js';

// The rod whipped forward, and the reel spinning as the line goes out.
defineSfx('cast', ({ s, t, noise, tone }) => {
  noise(s.white, t, 0.25, [['bandpass', 1800, 1.2]], 0.1, 0.08, 0.15, 1.3);
  for (let i = 0; i < 14; i++) tone('square', t + 0.15 + i * 0.045, 2300, 2100, 0.012 * (1 - i / 16), 0.001, 0.02);
});

// The float landing on the water.
defineSfx('plop', ({ s, t, noise, tone }) => {
  tone('sine', t, 900, 380, 0.08, 0.002, 0.08);
  noise(s.white, t, 0.15, [['bandpass', 1400, 1.5]], 0.06, 0.003, 0.1);
});

// Something at the bait: the float ticking on the water.
defineSfx('nibble', ({ s, t, tone, noise }) => {
  tone('sine', t, 700, 520, 0.035, 0.002, 0.05);
  noise(s.white, t, 0.05, [['bandpass', 2200, 3]], 0.025, 0.001, 0.03);
});

// It took it: the float pulled under, with a deep plunk.
defineSfx('bite', ({ s, t, tone, noise }) => {
  tone('sine', t, 420, 150, 0.16, 0.003, 0.18);
  noise(s.pink, t, 0.3, [['lowpass', 900]], 0.12, 0.01, 0.2);
});

// The rod snapped up to set the hook.
defineSfx('hook', ({ s, t, noise }) => {
  noise(s.white, t, 0.18, [['bandpass', 2600, 1.4]], 0.14, 0.01, 0.12, 1.4);
});

// The reel's ratchet, a few clicks of it. opts.size: how fast it's turned.
defineSfx('reel', ({ s, t, noise, size }) => {
  const n = 3 + Math.round(size * 3);
  for (let i = 0; i < n; i++) noise(s.white, t + i * 0.035, 0.012, [['bandpass', rand(3600, 4200), 5]], 0.05, 0.0005, 0.008);
});

// The drag screaming as a fish runs with the line.
defineSfx('drag', ({ s, t, tone, noise }) => {
  for (let i = 0; i < 26; i++) tone('sawtooth', t + i * 0.022, 1700, 1650, 0.012, 0.001, 0.015);
  noise(s.pink, t, 0.6, [['bandpass', 1200, 2]], 0.03, 0.05, 0.4);
});

// The line parting: a sharp twang.
defineSfx('snap', ({ s, t, tone, noise }) => {
  noise(s.white, t, 0.04, [['highpass', 3000]], 0.25, 0.0005, 0.03);
  tone('triangle', t, 1400, 300, 0.1, 0.001, 0.2);
});

// A fish lifted out of the water: the splash, and it flapping.
defineSfx('landed', ({ s, t, noise }) => {
  noise(s.pink, t, 0.4, [['bandpass', 700, 0.8]], 0.2, 0.01, 0.3);
  for (let i = 0; i < 5; i++) noise(s.pink, t + 0.35 + i * rand(0.1, 0.16), 0.06, [['bandpass', rand(500, 900), 2]], rand(0.06, 0.12), 0.003, 0.04);
});
