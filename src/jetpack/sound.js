// What the jetpack sounds like, made from noise and oscillators like every
// other sound here (audio/soundscape.js).
//
//   the jets    a layer: a deep rushing roar with a hiss on top, louder and
//               brighter the harder they go; your own, and quieter, anyone
//               else's flying near you
//   one-offs    (sound.sfx) the buckles as you strap it on or hang it up, the
//               jets catching with a whump, and cutting out with a sputter
//
// The layer hears what it should from `source`, which index.js fills in every
// frame:
//   source.thrust   0..1 how hard your jets are going
//   source.others   0..1 how loud the loudest of anyone else's are, here

import { defineSfx } from '../audio/sfx.js';
import { SILENT } from '../audio/kit.js';

const BUS = 'jetpack';
// How loud anyone else's jets are beside yours, at the same thrust.
const OTHERS = 0.5;

export function jetSounds(source) {
  return {
    name: 'jetpack',

    build(s) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus(BUS);
      const loop = (buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.start();
        return src;
      };
      const out = ctx.createGain();
      out.gain.value = SILENT;
      // the roar: brown noise through a lowpass that opens up with thrust
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      loop(s.brown).connect(lp).connect(out);
      // the hiss: white noise, high and narrow
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 0.8;
      const hiss = ctx.createGain();
      hiss.gain.value = 0.12;
      loop(s.white).connect(bp).connect(hiss).connect(out);
      out.connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.25;
      out.connect(send).connect(wet);
      this.out = out;
      this.lp = lp;
      this.bp = bp;
    },

    update(s, t) {
      const k = Math.max(source.thrust, source.others * OTHERS);
      this.out.gain.setTargetAtTime(Math.max(SILENT, k * 0.9), t, 0.12);
      this.lp.frequency.setTargetAtTime(260 + 900 * k, t, 0.15);
      this.bp.frequency.setTargetAtTime(1800 + 1600 * k, t, 0.15);
    },
  };
}

// Buckles: two clicks, and a strap pulled tight (opts.on: strapping it on).
defineSfx(
  'jet-strap',
  (k) => {
    k.noise(k.s.white, k.t, 0.03, [['highpass', 3000]], 0.25, 0.001, 0.02);
    k.noise(k.s.white, k.t + 0.12, 0.03, [['highpass', 3400]], 0.25, 0.001, 0.02);
    k.noise(k.s.pink, k.t + 0.02, 0.25, [['bandpass', k.opts.on ? 1400 : 900, 1.2]], 0.12, 0.03, 0.18);
  },
  { reverb: 0.1 },
);

// The jets catching: a whump, and a rush that opens up.
defineSfx(
  'jet-ignite',
  (k) => {
    k.tone('sine', k.t, 70, 140, 0.4, 0.005, 0.3);
    k.noise(k.s.brown, k.t, 0.6, [['lowpass', 500]], 0.6, 0.01, 0.45);
    k.noise(k.s.pink, k.t + 0.03, 0.5, [['bandpass', 1500, 0.6]], 0.25, 0.08, 0.35);
  },
  { reverb: 0.3 },
);

// Cutting out: a sputter, and the rush dying away.
defineSfx(
  'jet-cut',
  (k) => {
    for (let i = 0; i < 3; i++) k.noise(k.s.brown, k.t + i * 0.07, 0.06, [['lowpass', 700]], 0.3 - i * 0.07, 0.003, 0.05);
    k.noise(k.s.pink, k.t, 0.4, [['bandpass', 1100, 0.7]], 0.12, 0.005, 0.35);
  },
  { reverb: 0.25 },
);
