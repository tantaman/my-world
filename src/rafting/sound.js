// What rafting sounds like, made from noise and oscillators like every other
// sound here (audio/soundscape.js). The river itself, and the roar of a
// rapid, are the soundscape's own (it's told you're in the water: aboard's
// wade, and the white water round you); this is only what the raft adds:
//
//   - water slapping and drumming on its tubes, now and then on a pool, and
//     hard and fast through a rapid
//   - one-offs (sound.sfx): the raft thrown in and you climbing aboard, a
//     paddle stroke, a knock against a rock, a drop over a lip, a wave
//     breaking over the bow, going over, and climbing back in
//
// The layer (sound.addLayer) hears what it should from `source`, which the
// feature fills in every frame:
//   source.on       in the raft, on the water
//   source.churn    0..1 how rough the water is (white water, waves)
// (It's right where you are, so it isn't placed anywhere.)

import { defineSfx } from '../audio/sfx.js';
import { SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';
import { clamp } from '../noise.js';

// Seconds between slaps on the tubes: on a pool, and through a rapid.
const SLAPS = [[1.1, 2.6], [0.09, 0.25]];

export function raftSounds(source) {
  return {
    name: 'rafting',

    build(s) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus('effects');
      // a slap on taut fabric: pink noise through a low band, and a hollow
      // drum under it
      this.src = ctx.createBufferSource();
      this.src.buffer = s.pink;
      this.src.loop = true;
      this.band = ctx.createBiquadFilter();
      this.band.type = 'bandpass';
      this.band.frequency.value = 420;
      this.band.Q.value = 1.3;
      this.gain = ctx.createGain();
      this.gain.gain.value = SILENT;
      this.src.connect(this.band).connect(this.gain).connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.18;
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
      const amp = rand(0.05, 0.1) * (1 + 2 * c);
      this.band.frequency.setValueAtTime(rand(260, 520) * (1 + 0.6 * c), t);
      this.gain.gain.setTargetAtTime(amp, t, 0.006);
      this.gain.gain.setTargetAtTime(SILENT, t + rand(0.03, 0.08), 0.05);
      const lo = SLAPS[0][0] + (SLAPS[1][0] - SLAPS[0][0]) * c;
      const hi = SLAPS[0][1] + (SLAPS[1][1] - SLAPS[0][1]) * c;
      this.next = t + rand(lo, hi);
    },
  };
}

// Thrown in and climbed aboard: the raft landing flat on the water with a
// hollow boom, and the slosh of you clambering over its tube.
defineSfx('raft-in', ({ s, t, noise, tone }) => {
  tone('sine', t, 95, 55, 0.32, 0.004, 0.25);
  noise(s.pink, t, 0.5, [['bandpass', 520, 0.8]], 0.24, 0.01, 0.38);
  noise(s.white, t + 0.03, 0.3, [['bandpass', 2300, 1.4]], 0.06, 0.01, 0.2);
  noise(s.brown, t + 0.45, 0.6, [['lowpass', 450]], 0.22, 0.03, 0.4);
  tone('triangle', t + 0.5, 180, 130, 0.05, 0.01, 0.2);
});

// A stroke of a raft paddle: the blade planted, the pull of the water past
// it, the drips as it comes out. opts.size: how hard.
defineSfx('raft-stroke', ({ s, t, noise, size }) => {
  const k = 0.6 + size * 0.6;
  noise(s.white, t, 0.07, [['bandpass', rand(1000, 1400), 1.2]], 0.1 * k, 0.003, 0.05);
  noise(s.pink, t + 0.02, 0.45, [['bandpass', rand(340, 480), 0.8]], 0.17 * k, 0.06, 0.32);
  for (let i = 0; i < 3; i++) noise(s.white, t + 0.5 + rand(0, 0.3), 0.02, [['bandpass', rand(1900, 3200), 6]], rand(0.03, 0.06) * k, 0.001, 0.012);
});

// Into a rock: the dull boom of a big tube, and the fabric scrubbing round
// it. opts.size: how hard.
defineSfx('raft-bump', ({ s, t, noise, tone, size }) => {
  const k = 0.4 + size * 0.8;
  tone('sine', t, 110, 60, 0.36 * k, 0.003, 0.2);
  noise(s.brown, t, 0.16, [['lowpass', 360]], 0.3 * k, 0.002, 0.1);
  noise(s.pink, t + 0.05, 0.35, [['bandpass', rand(700, 1000), 2]], 0.05 * k, 0.04, 0.28);
});

// Over a lip and down: the bow slapping onto the water below and the water
// coming in over it. opts.size: how far it dropped.
defineSfx('raft-drop', ({ s, t, noise, tone, size }) => {
  const k = 0.5 + size * 0.7;
  tone('sine', t, 90, 50, 0.3 * k, 0.003, 0.25);
  noise(s.pink, t, 0.55, [['bandpass', 560, 0.7]], 0.28 * k, 0.005, 0.42);
  noise(s.white, t + 0.03, 0.4, [['bandpass', 2000, 1.1]], 0.12 * k, 0.005, 0.3);
  noise(s.brown, t + 0.2, 0.7, [['lowpass', 340]], 0.22 * k, 0.04, 0.5);
});

// A wave breaking over the bow, into your face. opts.size: how big.
defineSfx('raft-wave', ({ s, t, noise, size }) => {
  const k = 0.4 + size * 0.8;
  noise(s.white, t, 0.5, [['bandpass', 1500, 0.7]], 0.14 * k, 0.03, 0.4);
  noise(s.pink, t + 0.05, 0.7, [['bandpass', 600, 0.6]], 0.22 * k, 0.05, 0.55);
  noise(s.brown, t + 0.1, 0.5, [['lowpass', 300]], 0.18 * k, 0.03, 0.4);
});

// Over it goes: a great crash of water, and then you're under it.
defineSfx('raft-flip', ({ s, t, noise, tone }) => {
  noise(s.white, t, 0.6, [['bandpass', 1800, 0.6]], 0.2, 0.01, 0.45);
  noise(s.pink, t, 1.0, [['bandpass', 500, 0.6]], 0.34, 0.02, 0.8);
  noise(s.brown, t + 0.1, 1.2, [['lowpass', 260]], 0.36, 0.05, 1.0);
  tone('sine', t + 0.05, 80, 40, 0.3, 0.01, 0.5);
});

// Hauled back over, and climbed back in.
defineSfx('raft-right', ({ s, t, noise, tone }) => {
  noise(s.pink, t, 0.5, [['bandpass', 450, 0.8]], 0.2, 0.08, 0.4);
  tone('sine', t + 0.45, 100, 55, 0.3, 0.004, 0.25);
  noise(s.white, t + 0.47, 0.4, [['bandpass', 2400, 1.3]], 0.08, 0.01, 0.3);
  noise(s.brown, t + 0.7, 0.5, [['lowpass', 500]], 0.16, 0.02, 0.35);
});

// Out onto the bank, and the raft rolled up: water sloshing off you, the
// valves hissing, and the fabric folded.
defineSfx('raft-out', ({ s, t, noise }) => {
  noise(s.pink, t, 0.6, [['bandpass', 520, 0.8]], 0.15, 0.04, 0.45);
  noise(s.white, t + 0.4, 1.0, [['highpass', 3500]], 0.05, 0.1, 0.8);
  noise(s.brown, t + 1.1, 0.4, [['lowpass', 500]], 0.12, 0.02, 0.3);
});
