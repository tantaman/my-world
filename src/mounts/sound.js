// What the mounts sound like, and the whistle you call yours with. Made from
// noise and oscillators like every other sound in the forest.
//
//   whinny    a horse's neigh: a high quavering cry falling away, then a blow
//   nicker    a low, soft rumble, close by: what a horse says to a friend
//   plunge    something heavy sliding into the water
//   eagle     a golden eagle's cry: thin, high yelps, a long way off
//   wingbeat  one great downstroke of an eagle's wings
//   whistle   your two-note whistle (a one-off sound, not placed)

import { defineCall } from '../audio/calls.js';
import { defineSfx } from '../audio/sfx.js';
import { rand } from '../core/geom.js';

defineCall('whinny', 70, ({ s, t, noise, voice }) => {
  const f = rand(620, 760);
  // the quaver: a fast wobble that slows as it falls
  voice('sawtooth', t, [[0, f * 0.9], [0.12, f * 1.35], [0.5, f * 1.1], [1.2, f * 0.62]], [[0.05, 0.16], [0.9, 0.12], [1.25, 0]], { vib: 11, vibDepth: f * 0.06, filter: [['bandpass', 1500, 1.1]], harm: 0.3 });
  noise(s.white, t, 1.2, [['bandpass', 2200, 2]], 0.12, 0.1, 0.9);
  // and a snort to finish
  noise(s.white, t + 1.4, 0.4, [['bandpass', 700, 1.2], ['lowpass', 2000]], 1.6, 0.01, 0.28);
});

defineCall('nicker', 8, ({ t, voice }) => {
  for (let i = 0; i < 4; i++) {
    const at = t + i * 0.09;
    voice('sawtooth', at, [[0, 120], [0.08, 100]], [[0.01, 0.18], [0.09, 0]], { filter: [['lowpass', 380]] });
  }
});

defineCall('plunge', 30, ({ s, t, noise, voice }) => {
  noise(s.brown, t, 0.9, [['lowpass', 600]], 2.2, 0.02, 0.6);
  noise(s.white, t + 0.05, 0.6, [['bandpass', 1300, 0.8]], 0.5, 0.01, 0.4);
  for (let i = 0; i < 5; i++) {
    const at = t + 0.25 + i * rand(0.08, 0.2);
    const f = rand(300, 600);
    voice('sine', at, [[0, f], [0.06, f * 1.6]], [[0.005, 0.06], [0.07, 0]]);
  }
});

defineCall('eagle', 110, ({ s, t, noise, voice }) => {
  const n = 3 + Math.floor(rand(0, 4));
  const f = rand(1900, 2300);
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.22, 0.3);
    voice('sawtooth', at, [[0, f], [0.05, f * 1.12], [0.16, f * 0.8]], [[0.02, 0.07], [0.12, 0.05], [0.18, 0]], { filter: [['bandpass', 2400, 2.5]] });
    noise(s.white, at, 0.18, [['bandpass', 2600, 3]], 0.12, 0.02, 0.14);
  }
});

defineCall('wingbeat', 18, ({ s, t, noise }) => {
  noise(s.brown, t, 0.5, [['lowpass', 420]], 2.4, 0.08, 0.32);
  noise(s.pink, t + 0.03, 0.4, [['bandpass', 900, 0.7]], 0.25, 0.06, 0.25);
});

defineSfx(
  'whistle',
  ({ t, tone }) => {
    tone('sine', t, 1650, 2300, 0.13, 0.03, 0.28);
    tone('sine', t + 0.36, 2300, 1500, 0.13, 0.03, 0.42);
  },
  { reverb: 0.5 },
);
