// What boats sound like, made from noise and oscillators like the rest
// (audio/sfx.js): a paddle stroke, a hull scraping off the bank into the
// water, rope pulled tight round logs, climbing in and out.

import { defineSfx } from '../audio/sfx.js';
import { rand } from '../core/geom.js';

// A paddle stroke: the blade going in, the pull of the water past it, and
// the drips as it comes out. opts.size: how hard (0..1).
defineSfx('paddle', ({ s, t, noise, size }) => {
  const k = 0.6 + size * 0.6;
  noise(s.white, t, 0.08, [['bandpass', rand(900, 1300), 1.2]], 0.1 * k, 0.004, 0.05);
  noise(s.pink, t + 0.03, 0.5, [['bandpass', rand(380, 520), 0.8]], 0.16 * k, 0.08, 0.35);
  noise(s.brown, t + 0.05, 0.5, [['lowpass', 300]], 0.14 * k, 0.1, 0.3);
  for (let i = 0; i < 4; i++) noise(s.white, t + 0.55 + rand(0, 0.35), 0.02, [['bandpass', rand(1800, 3200), 6]], rand(0.03, 0.07) * k, 0.001, 0.012);
});

// Pushed off: the hull scraping over gravel and mud, and the water taking it.
defineSfx('launch', ({ s, t, noise }) => {
  noise(s.pink, t, 0.7, [['bandpass', 650, 0.7]], 0.22, 0.05, 0.5);
  noise(s.white, t + 0.05, 0.5, [['bandpass', 2400, 1.5]], 0.05, 0.05, 0.35);
  noise(s.brown, t + 0.55, 0.8, [['lowpass', 380]], 0.3, 0.02, 0.6);
  noise(s.pink, t + 0.6, 0.6, [['bandpass', 900, 0.9]], 0.15, 0.02, 0.45);
});

// Rope pulled tight round the logs, and a log knocked into its place.
defineSfx('lash', ({ s, t, noise, tone }) => {
  noise(s.pink, t, 0.35, [['bandpass', rand(1300, 1700), 3]], 0.08, 0.05, 0.25);
  tone('triangle', t + 0.08, rand(220, 260), rand(180, 200), 0.03, 0.05, 0.2);
  noise(s.brown, t + 0.4, 0.2, [['lowpass', 500]], 0.3, 0.002, 0.12);
  tone('sine', t + 0.4, 140, 90, 0.18, 0.002, 0.12);
});

// Climbing in or out: a knock on the hull, and the water sloshing under it.
defineSfx('board', ({ s, t, noise, tone }) => {
  noise(s.brown, t, 0.18, [['lowpass', 600]], 0.3, 0.002, 0.1);
  tone('sine', t, 180, 120, 0.12, 0.002, 0.1);
  noise(s.pink, t + 0.1, 0.6, [['bandpass', 480, 0.8]], 0.14, 0.12, 0.4);
});
