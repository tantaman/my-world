// What tubing sounds like, made from noise and oscillators like every other
// sound here (audio/soundscape.js). The water going by you is the
// soundscape's own (it's told you're in it: player.aboard's wade), so this
// is only what the tube adds:
//
//   - wavelets slapping against the rubber, now and then, and quickly
//     in white water
//   - one-offs (sound.sfx): the tube tossed in and you dropping into it, a
//     hand stroke, a knock against a boulder, going down a step, and
//     climbing out
//
// The layer (sound.addLayer) hears what it should from `source`, which the
// feature fills in every frame:
//   source.on       in the tube, afloat
//   source.churn    0..1 how rough the water is (white water)
// (It's right where you are, so it isn't placed anywhere.)

import { defineSfx } from '../audio/sfx.js';
import { SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';
import { clamp } from '../noise.js';

// Seconds between slaps of the water on the rubber: on calm water, and in
// white water.
const SLAPS = [[1.4, 3.2], [0.18, 0.45]];

export function tubeSounds(source) {
  return {
    name: 'tubing',

    build(s) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus('effects');
      // a slap: pink noise through a band, opened and shut by its gain
      this.src = ctx.createBufferSource();
      this.src.buffer = s.pink;
      this.src.loop = true;
      this.band = ctx.createBiquadFilter();
      this.band.type = 'bandpass';
      this.band.frequency.value = 700;
      this.band.Q.value = 1.1;
      this.gain = ctx.createGain();
      this.gain.gain.value = SILENT;
      this.src.connect(this.band).connect(this.gain).connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.15;
      this.gain.connect(send).connect(wet);
      this.src.start(ctx.currentTime, rand(0, 2));
      this.next = 0;
    },

    update(s, t) {
      if (!source.on) {
        this.next = t + rand(...SLAPS[0]);
        return;
      }
      if (t < this.next) return;
      const c = clamp(source.churn, 0, 1);
      const amp = rand(0.05, 0.11) * (1 + 1.5 * c);
      this.band.frequency.setValueAtTime(rand(450, 900) * (1 + 0.5 * c), t);
      this.gain.gain.setTargetAtTime(amp, t, 0.008);
      this.gain.gain.setTargetAtTime(SILENT, t + rand(0.03, 0.07), 0.06);
      const [lo, hi] = [SLAPS[0][0] + (SLAPS[1][0] - SLAPS[0][0]) * c, SLAPS[0][1] + (SLAPS[1][1] - SLAPS[0][1]) * c];
      this.next = t + rand(lo, hi);
    },
  };
}

// Tossed in and sat down in: the rubber landing flat on the water with a
// hollow bounce, and the splash of you dropping into it.
defineSfx('tube-in', ({ s, t, noise, tone }) => {
  tone('sine', t, 120, 70, 0.3, 0.004, 0.18);
  tone('triangle', t + 0.01, 240, 150, 0.06, 0.004, 0.12);
  noise(s.pink, t, 0.4, [['bandpass', 700, 0.8]], 0.22, 0.01, 0.3);
  noise(s.white, t + 0.03, 0.3, [['bandpass', 2600, 1.4]], 0.07, 0.01, 0.2);
  noise(s.brown, t + 0.35, 0.6, [['lowpass', 500]], 0.25, 0.02, 0.45);
  noise(s.pink, t + 0.38, 0.5, [['bandpass', 1100, 0.9]], 0.12, 0.02, 0.35);
  tone('sine', t + 0.4, 95, 65, 0.15, 0.01, 0.2);
});

// A hand pulled through the water over the side. opts.size: how hard.
defineSfx('hand-stroke', ({ s, t, noise, size }) => {
  const k = 0.5 + size * 0.7;
  noise(s.pink, t, 0.35, [['bandpass', rand(600, 900), 0.9]], 0.08 * k, 0.03, 0.25);
  for (let i = 0; i < 3; i++) noise(s.white, t + 0.3 + rand(0, 0.25), 0.02, [['bandpass', rand(1800, 3000), 6]], rand(0.02, 0.05) * k, 0.001, 0.012);
});

// Knocked against a boulder: the thump of a rubber ring, and its squeak as
// it scrubs round. opts.size: how hard.
defineSfx('tube-bump', ({ s, t, noise, tone, size }) => {
  const k = 0.4 + size * 0.8;
  tone('sine', t, 150, 85, 0.3 * k, 0.003, 0.14);
  noise(s.brown, t, 0.12, [['lowpass', 420]], 0.25 * k, 0.002, 0.08);
  tone('triangle', t + 0.04, rand(520, 680), rand(380, 460), 0.035 * k, 0.02, 0.16);
});

// Down a step: the tube slapping onto the pool below, and the water
// coming up over its sides. opts.size: how far it dropped.
defineSfx('tube-drop', ({ s, t, noise, tone, size }) => {
  const k = 0.5 + size * 0.8;
  tone('sine', t, 110, 60, 0.25 * k, 0.003, 0.2);
  noise(s.pink, t, 0.45, [['bandpass', 650, 0.8]], 0.25 * k, 0.005, 0.35);
  noise(s.white, t + 0.02, 0.35, [['bandpass', 2200, 1.2]], 0.1 * k, 0.005, 0.25);
  noise(s.brown, t + 0.15, 0.6, [['lowpass', 380]], 0.2 * k, 0.04, 0.45);
});

// Climbing out: water sloshing off you, and the tube squeaked flat and
// rolled up.
defineSfx('tube-out', ({ s, t, noise, tone }) => {
  noise(s.pink, t, 0.6, [['bandpass', 520, 0.8]], 0.16, 0.04, 0.45);
  noise(s.white, t + 0.2, 0.4, [['bandpass', 2400, 2]], 0.04, 0.05, 0.3);
  tone('triangle', t + 0.5, rand(480, 560), rand(360, 420), 0.03, 0.04, 0.25);
  noise(s.brown, t + 0.6, 0.25, [['lowpass', 600]], 0.12, 0.01, 0.15);
});
