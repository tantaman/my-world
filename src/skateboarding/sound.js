// What skateboarding sounds like, made from noise like every other sound here
// (audio/soundscape.js), on a bus of its own ('skateboarding'):
//
//   - the wheels on the tarmac: a low roar that rises with your speed, a
//     clatter over boards, a rough grinding crunch over gravel
//   - a powerslide: the wheels squealing sideways over the tarmac
//   - a foot dragged to brake, or a glove on the tarmac carving hard: a scuff
//   - the wind past your ears at speed
//   - one-offs (sound.sfx): a push, the tail popping an ollie, the wheels
//     slapping down to land, a bail, the board clattering off on its own,
//     the board set down and picked up
//
// The layer (sound.addLayer) hears what it should from `source`, which the
// skateboarding fills in every frame:
//   source.on        on the board
//   source.speed     m/s
//   source.rolling   the wheels on the ground
//   source.surface   what they're on ('tarmac', 'boards', 'gravel'...)
//   source.slide     0..1 how far into a powerslide
//   source.drag      0..1 a foot dragged, or a hand down

import { defineSfx } from '../audio/sfx.js';
import { SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';
import { clamp } from '../noise.js';

const BUS = 'skateboarding';
// m/s at which the wheels and the wind are as loud as they get
const LOUDEST = 14;

export function skateSounds(source) {
  return {
    name: 'skateboarding',

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
      this.roar = bed(s.brown, [['lowpass', 220, 0.8]]);
      this.hum = bed(s.pink, [['bandpass', 420, 1.6]]);
      this.clack = bed(s.pink, [['bandpass', 1300, 2.5], ['peaking', 650, 2]]);
      this.grit = bed(s.white, [['bandpass', 2600, 1.1]]);
      this.squeal = bed(s.white, [['bandpass', 1700, 7], ['peaking', 3400, 4]]);
      this.scuff = bed(s.pink, [['bandpass', 900, 1]]);
      this.wind = bed(s.pink, [['lowpass', 450, 0.7]]);
    },

    update(s, t) {
      const on = source.on;
      const v = clamp(source.speed / LOUDEST, 0, 1.3);
      const rolling = on && source.rolling ? Math.min(1, source.speed / 1.5) : 0;
      const surf = source.surface;
      const boards = surf === 'boards' ? 1 : 0;
      const gravel = surf === 'gravel' ? 1 : 0;
      const smooth = 1 - gravel;
      const set = (bed, level, at = 0.05) => bed.g.gain.setTargetAtTime(Math.max(SILENT, level), t, at);
      set(this.roar, rolling * smooth * (0.12 + 0.45 * v));
      this.roar.f[0].frequency.setTargetAtTime(140 + 260 * v, t, 0.1);
      set(this.hum, rolling * smooth * (0.03 + 0.12 * v));
      this.hum.f[0].frequency.setTargetAtTime(300 + 500 * v, t, 0.1);
      set(this.clack, rolling * boards * (0.1 + 0.3 * v), 0.03);
      set(this.grit, rolling * gravel * (0.15 + 0.35 * v), 0.04);
      set(this.squeal, rolling * clamp(source.slide * 1.4 - 0.2, 0, 1) * (0.05 + 0.18 * v), 0.04);
      set(this.scuff, rolling * source.drag * 0.35, 0.04);
      set(this.wind, on ? 0.02 + 0.22 * v * v : 0, 0.2);
      this.wind.f[0].frequency.setTargetAtTime(300 + 1400 * v, t, 0.2);
    },
  };
}

// A push: a shoe scuffing the tarmac.
defineSfx('skate-push', (k) => {
  k.noise(k.s.pink, k.t, 0.16, [['bandpass', 1100, 1.2]], 0.35, 0.01, 0.09);
  k.noise(k.s.brown, k.t, 0.1, [['lowpass', 300]], 0.3, 0.004, 0.05);
});

// An ollie: the tail snapped down on the ground, a sharp crack of wood.
defineSfx('skate-pop', (k) => {
  k.noise(k.s.white, k.t, 0.05, [['bandpass', 2400, 2]], 0.8, 0.001, 0.025);
  k.tone('triangle', k.t, 520, 260, 0.35, 0.001, 0.05);
  k.noise(k.s.brown, k.t + 0.004, 0.08, [['lowpass', 400]], 0.4, 0.002, 0.05);
});

// Coming down on it: the wheels slapping the ground, and the deck under the
// feet. Bigger the harder you land.
defineSfx('skate-land', (k) => {
  const s = k.size;
  k.noise(k.s.brown, k.t, 0.2, [['lowpass', 320]], 0.6 + 0.7 * s, 0.003, 0.08 + 0.06 * s);
  k.noise(k.s.white, k.t, 0.04, [['bandpass', 1800, 2]], 0.4 + 0.3 * s, 0.001, 0.02);
  k.tone('triangle', k.t + 0.01, 300, 160, 0.2 + 0.2 * s, 0.001, 0.05);
});

// A bail: you hitting the ground, rolling over, sliding to a stop.
defineSfx('skate-bail', (k) => {
  const n = 3;
  for (let i = 0; i < n; i++) {
    const at = k.t + i * rand(0.14, 0.22);
    const w = 1 - i / (n + 1);
    k.noise(k.s.brown, at, 0.3, [['lowpass', 280]], 1.1 * w, 0.004, 0.14);
    k.noise(k.s.pink, at + 0.01, 0.2, [['bandpass', 700, 0.9]], 0.35 * w, 0.004, 0.1);
  }
  k.noise(k.s.pink, k.t + 0.2, 0.7, [['bandpass', 1200, 0.6]], 0.15, 0.05, 0.5);
});

// The board on its own, hitting the ground: a hollow clack of wood and the
// wheels after it.
defineSfx('skate-clatter', (k) => {
  const s = k.size;
  for (const at of [0, rand(0.04, 0.09)]) {
    k.noise(k.s.white, k.t + at, 0.05, [['bandpass', rand(1500, 2300), 2.5]], 0.5 * s + 0.1, 0.001, 0.03);
    k.tone('triangle', k.t + at, rand(380, 460), 220, 0.25 * s + 0.05, 0.001, 0.05);
  }
});

// The board set down on the ground to step onto, or kicked up into a hand.
defineSfx('skate-board', (k) => {
  k.noise(k.s.white, k.t, 0.04, [['bandpass', 1900, 2.5]], 0.4, 0.001, 0.02);
  k.tone('triangle', k.t, 400, 240, 0.18, 0.001, 0.04);
  k.noise(k.s.brown, k.t + 0.03, 0.12, [['lowpass', 500]], 0.2, 0.01, 0.07);
});
