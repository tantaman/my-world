// What hang gliding sounds like, made from noise like every other sound here
// (audio/soundscape.js), on a bus of its own ('gliding'):
//
//   - the air going past: a rush that rises and brightens with your speed
//   - the wires singing, thin and high, when you go fast
//   - the sail luffing, a soft flutter, while it fills and when you fly slow
//   - one-offs (sound.sfx): the sail cracking open and filling, running it
//     out as you land, coming down hard, and crashing into the branches
//
// The layer (sound.addLayer) hears what it should from `source`, which the
// feature fills in every frame:
//   source.on       on the glider
//   source.speed    m/s
//   source.luff     0..1 how slack the sail is (filling, or flying slowly)

import { defineSfx } from '../audio/sfx.js';
import { SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';
import { clamp } from '../noise.js';

const BUS = 'gliding';
// m/s at which the rush of air is as loud as it gets
const LOUDEST = 22;
// m/s from which the wires start to sing
const SING = 13;

export function glideSounds(source) {
  return {
    name: 'gliding',

    build(s, t) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus(BUS);
      const bed = (buf, filters) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        let node = src;
        const made = [];
        for (const [type, f, q] of filters) {
          const b = ctx.createBiquadFilter();
          b.type = type;
          b.frequency.value = f;
          if (q) b.Q.value = q;
          node.connect(b);
          node = b;
          made.push(b);
        }
        const g = ctx.createGain();
        g.gain.value = SILENT;
        node.connect(g).connect(dry);
        const send = ctx.createGain();
        send.gain.value = 0.1;
        g.connect(send).connect(wet);
        src.start(t, rand(0, 3));
        return { g, f: made };
      };
      this.rush = bed(s.pink, [['lowpass', 600, 0.7]]);
      this.wires = bed(s.white, [['bandpass', 2600, 18]]);
      // the flutter: noise whose loudness is shaken by a slow wobble
      this.luff = bed(s.brown, [['bandpass', 260, 1.2]]);
      const wobble = ctx.createOscillator();
      wobble.frequency.value = 7;
      const depth = ctx.createGain();
      depth.gain.value = 0;
      wobble.connect(depth).connect(this.luff.g.gain);
      wobble.start(t);
      this.wobble = { osc: wobble, depth };
    },

    update(s, t) {
      const on = source.on ? 1 : 0;
      const v = clamp(source.speed / LOUDEST, 0, 1.3);
      const set = (bed, level, at = 0.15) => bed.g.gain.setTargetAtTime(Math.max(SILENT, level), t, at);
      set(this.rush, on * (0.04 + 0.3 * v * v));
      this.rush.f[0].frequency.setTargetAtTime(300 + 1500 * v, t, 0.2);
      const sing = on * clamp((source.speed - SING) / (LOUDEST - SING), 0, 1);
      set(this.wires, sing * 0.05);
      this.wires.f[0].frequency.setTargetAtTime(2200 + 900 * sing, t, 0.2);
      const luff = on * clamp(source.luff, 0, 1);
      set(this.luff, luff * 0.18, 0.08);
      this.wobble.depth.gain.setTargetAtTime(luff * 0.16, t, 0.08);
      this.wobble.osc.frequency.setTargetAtTime(5 + 9 * (1 - luff), t, 0.2);
    },
  };
}

// The sail cracking open: a rustle of cloth, then the whump as it fills.
defineSfx('sail-open', (k) => {
  k.noise(k.s.white, k.t, 0.5, [['bandpass', 1800, 0.7]], 0.25, 0.04, 0.4);
  for (let i = 0; i < 5; i++) k.noise(k.s.pink, k.t + i * rand(0.05, 0.09), 0.08, [['bandpass', 900, 1.5]], 0.3, 0.004, 0.05);
  k.noise(k.s.brown, k.t + 0.55, 0.5, [['lowpass', 220]], 1.6, 0.02, 0.3);
  k.noise(k.s.pink, k.t + 0.55, 0.3, [['bandpass', 500, 0.9]], 0.4, 0.01, 0.2);
});

// Running it out as you land: quick steps on the ground, slowing.
defineSfx('run-out', (k) => {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const at = k.t + i * (0.17 + i * 0.03);
    k.noise(k.s.brown, at, 0.12, [['lowpass', 500]], 0.7 * (1 - i / (n + 1)), 0.004, 0.07);
    k.noise(k.s.pink, at, 0.08, [['bandpass', 1400, 1]], 0.15 * (1 - i / (n + 1)), 0.003, 0.05);
  }
});

// Coming down hard: a thump, and the frame clattering.
defineSfx('crash-down', (k) => {
  k.noise(k.s.brown, k.t, 0.4, [['lowpass', 260]], 1.6, 0.005, 0.25);
  k.tone('triangle', k.t + 0.05, 900, 700, 0.06, 0.002, 0.25);
  k.tone('triangle', k.t + 0.12, 1300, 1150, 0.04, 0.002, 0.2);
  k.noise(k.s.white, k.t + 0.03, 0.5, [['bandpass', 2000, 0.6]], 0.15, 0.01, 0.4);
});

// Into the branches: snapping twigs, rustling leaves, and the frame knocking.
defineSfx('branches', (k) => {
  k.noise(k.s.white, k.t, 0.9, [['bandpass', 3000, 0.5]], 0.3, 0.02, 0.7);
  for (let i = 0; i < 7; i++) {
    const at = k.t + rand(0, 0.6);
    k.noise(k.s.white, at, 0.04, [['highpass', 2500]], 0.4, 0.001, 0.025);
  }
  k.noise(k.s.pink, k.t + 0.1, 0.2, [['bandpass', 420, 2]], 0.8, 0.002, 0.1);
  k.noise(k.s.brown, k.t + 0.5, 0.4, [['lowpass', 300]], 1.0, 0.005, 0.25);
});
