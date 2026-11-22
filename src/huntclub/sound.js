// What the hunt club sounds like, made from noise and oscillators like the
// rest.
//
// One-off sounds (audio/sfx.js), in your hands: the shotgun going off, a
// deeper, rounder boom than the rifle's, rolling back off the trees; the gun
// broken open, the empty shells kicked out; fresh ones slid in and the gun
// snapped shut.
//
// And from where they happen (audio/calls.js): your call of "pull!", the
// trap's arm whipping round in its house, and a target breaking in the air.

import { defineSfx } from '../audio/sfx.js';
import { defineCall } from '../audio/calls.js';
import { rand } from '../core/geom.js';

// The shot: a crack, a big round boom under it, and its echo off the trees.
defineSfx(
  'shotgun',
  ({ s, t, noise, tone }) => {
    noise(s.white, t, 0.04, [['highpass', 1400]], 0.75, 0.0005, 0.03);
    noise(s.pink, t, 0.55, [['lowpass', 700]], 1.0, 0.001, 0.36);
    noise(s.brown, t, 0.8, [['lowpass', 220]], 1.0, 0.002, 0.55);
    tone('sine', t, 95, 34, 0.9, 0.001, 0.32);
    const echo = rand(0.35, 0.6);
    noise(s.pink, t + echo, 0.8, [['lowpass', 480]], 0.22, 0.04, 0.6);
    noise(s.brown, t + echo * 1.9, 1.0, [['lowpass', 260]], 0.13, 0.08, 0.8);
  },
  { reverb: 0.7 },
);

// Broken open: the lever thrown, the barrels dropping on the hinge with a
// clunk, and the empties flicked out by the ejectors.
defineSfx('gun-open', ({ s, t, noise, tone }) => {
  noise(s.white, t, 0.03, [['bandpass', 3400, 3]], 0.25, 0.0008, 0.015);
  noise(s.white, t + 0.07, 0.06, [['bandpass', 1600, 2]], 0.28, 0.002, 0.04);
  tone('triangle', t + 0.07, 520, 380, 0.08, 0.001, 0.06);
  for (const at of [0.13, 0.16]) noise(s.white, t + at, 0.03, [['bandpass', rand(2400, 3000), 4]], 0.12, 0.001, 0.02);
});

// Shells slid into the chambers (opts.shells: one or two), then the gun
// snapped shut.
defineSfx('gun-load', ({ s, t, opts, noise, tone }) => {
  const n = opts.shells ?? 2;
  for (let i = 0; i < n; i++) {
    const at = t + 0.12 + i * 0.28;
    noise(s.pink, at, 0.12, [['bandpass', rand(900, 1300), 2]], 0.12, 0.01, 0.08);
    noise(s.white, at + 0.1, 0.02, [['bandpass', 2600, 3]], 0.1, 0.001, 0.015);
  }
  const shut = t + 0.2 + n * 0.28;
  noise(s.white, shut, 0.05, [['bandpass', 2200, 1.5]], 0.38, 0.0008, 0.03);
  tone('square', shut, 900, 600, 0.06, 0.001, 0.03);
  noise(s.brown, shut, 0.1, [['lowpass', 500]], 0.25, 0.002, 0.06);
});

// "Pull!": a short sharp call, the p puffed out.
defineCall('pull', 10, ({ s, t, opts, noise, voice }) => {
  const f = 150 * (opts.pitch ?? 1);
  noise(s.white, t, 0.03, [['bandpass', 1200, 1]], 0.08, 0.001, 0.02);
  voice('sawtooth', t + 0.025, [[0, f * 1.15], [0.12, f], [0.24, f * 0.82]], [[0.02, 0.22], [0.15, 0.18], [0.26, 0]], { filter: [['bandpass', 620, 2.4], ['lowpass', 2600]] });
});

// The trap: its arm whipping round, a thump and the whirr of the target
// going out.
defineCall('trap', 30, ({ s, t, noise }) => {
  noise(s.brown, t, 0.12, [['lowpass', 320]], 0.5, 0.002, 0.08);
  noise(s.white, t, 0.04, [['bandpass', 1800, 2]], 0.3, 0.001, 0.025);
  noise(s.pink, t + 0.02, 0.35, [['bandpass', 2400, 1.2]], 0.1, 0.02, 0.28);
});

// A target broken: a crisp crack, and the bits of it pattering.
defineCall('clay', 45, ({ s, t, noise }) => {
  noise(s.white, t, 0.05, [['bandpass', rand(2800, 3800), 1.5]], 0.6, 0.0005, 0.035);
  noise(s.pink, t, 0.12, [['bandpass', 1400, 1]], 0.25, 0.001, 0.08);
  for (let i = 0; i < 5; i++) noise(s.white, t + rand(0.03, 0.2), 0.02, [['bandpass', rand(4000, 7000), 5]], rand(0.05, 0.12), 0.001, 0.01);
});
