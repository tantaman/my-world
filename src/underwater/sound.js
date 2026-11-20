// What it sounds like under the water.
//
// Everything from above is dulled (Soundscape.muffle, from index.js). Under
// it, a layer: the deep, slow hush of the water itself — a low rumble that
// swells and falls, bigger in the sea — with a faint fizz high over it.
// And a one-off: the bloop and burble of breath let go.

import { defineSfx } from '../audio/sfx.js';
import { rand } from '../core/geom.js';

const BUS = 'ambience';

// The layer, listening to `state` ({ under 0..1, sea 0..1 }).
export function deepWater(state) {
  return {
    name: 'underwater',

    build(s, t) {
      const ctx = s.ctx;
      const { dry } = s.bus(BUS);
      const loop = (buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.start(t, rand(0, 3));
        return src;
      };
      // the rumble
      this.low = ctx.createBiquadFilter();
      this.low.type = 'lowpass';
      this.low.frequency.value = 180;
      this.rumble = ctx.createGain();
      this.rumble.gain.value = 0;
      loop(s.brown).connect(this.low).connect(this.rumble).connect(dry);
      // the fizz
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1400;
      band.Q.value = 2.5;
      this.fizz = ctx.createGain();
      this.fizz.gain.value = 0;
      loop(s.pink).connect(band).connect(this.fizz).connect(dry);
    },

    update(s, t) {
      const u = state.under;
      const swell = 0.75 + 0.25 * Math.sin(t * 0.45) * Math.sin(t * 0.17 + 1);
      this.rumble.gain.setTargetAtTime(u * (0.5 + 0.35 * state.sea) * swell, t, 0.12);
      this.low.frequency.setTargetAtTime(140 + 90 * swell, t, 0.3);
      this.fizz.gain.setTargetAtTime(u * 0.035 * (0.6 + 0.4 * swell), t, 0.3);
    },
  };
}

// Breath let go under water: a run of bubbles, each a little rising note.
// opts.size 0..1: a few for a breath, a gush for going under.
defineSfx(
  'bubbles',
  (k) => {
    const n = Math.round(3 + k.size * 9);
    let at = k.t;
    for (let i = 0; i < n; i++) {
      const f = rand(260, 620) * (1.3 - k.size * 0.5);
      k.tone('sine', at, f, f * rand(1.8, 2.6), rand(0.05, 0.11), 0.004, rand(0.04, 0.09));
      at += rand(0.03, 0.1) * (1.2 - k.size * 0.7);
    }
    k.noise(k.s.pink, k.t, 0.25 + k.size * 0.5, [['bandpass', 700, 1.2]], 0.04 + k.size * 0.08, 0.02, 0.2 + k.size * 0.4);
  },
  { reverb: 0.15 },
);
