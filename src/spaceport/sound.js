// What the trip sounds like, made from noise and oscillators like every
// other sound here (audio/soundscape.js).
//
//   the rocket   a layer: the deep roar of the engine, heard from where the
//                rocket is, louder the harder it's going and the nearer you
//                are; and in orbit, a low hum of the station's machinery
//   one-offs     (sound.sfx) the countdown's beeps, the engine catching, the
//                railgun's crack (yours, close and bright; anyone else's,
//                duller with distance), a jump pad's whoomp, a landing, a
//                frag, being fragged, taking or losing the lead
//
// The layer hears what it should from `source`, which index.js fills in
// every frame:
//   source.thrust   0..1 how hard the engine is going
//   source.near     0..1 how near the rocket you are (1 aboard it)
//   source.orbit    whether you're up in the arena

import { defineSfx } from '../audio/sfx.js';
import { SILENT } from '../audio/kit.js';

const BUS = 'spaceport';

export function tripSounds(source) {
  return {
    name: 'spaceport',

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
      // the roar: brown noise, low, with a crackle of pink on top
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const roar = ctx.createGain();
      roar.gain.value = SILENT;
      loop(s.brown).connect(lp).connect(roar);
      const crackle = ctx.createBiquadFilter();
      crackle.type = 'bandpass';
      crackle.frequency.value = 900;
      crackle.Q.value = 0.6;
      const cg = ctx.createGain();
      cg.gain.value = 0.25;
      loop(s.pink).connect(crackle).connect(cg).connect(roar);
      roar.connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.5;
      roar.connect(send).connect(wet);
      // the hum: two low tones beating against each other
      const hum = ctx.createGain();
      hum.gain.value = SILENT;
      for (const f of [55, 55.7, 110.4]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.start();
        o.connect(hum);
      }
      hum.connect(dry);
      this.roar = roar;
      this.lp = lp;
      this.hum = hum;
    },

    update(s, t) {
      const k = source.thrust * (0.15 + 0.85 * source.near);
      this.roar.gain.setTargetAtTime(Math.max(SILENT, k * 1.4), t, 0.25);
      this.lp.frequency.setTargetAtTime(160 + 320 * source.thrust, t, 0.3);
      this.hum.gain.setTargetAtTime(source.orbit ? 0.035 : SILENT, t, 0.8);
    },
  };
}

// A beep of the countdown, and a higher one for "go".
defineSfx(
  'countdown',
  (k) => {
    const f = k.opts.go ? 1320 : 880;
    k.tone('square', k.t, f, f, 0.09, 0.004, 0.16);
    k.tone('sine', k.t, f * 2, f * 2, 0.04, 0.004, 0.12);
  },
  { reverb: 0.1 },
);

// The engine catching: a thump and a rush that opens up.
defineSfx(
  'ignite',
  (k) => {
    k.noise(k.s.brown, k.t, 2.2, [['lowpass', 220]], 1.2, 0.05, 1.8);
    k.noise(k.s.pink, k.t + 0.05, 1.6, [['bandpass', 600, 0.5]], 0.35, 0.3, 1.2);
    k.tone('sine', k.t, 70, 38, 0.6, 0.01, 0.9);
  },
  { reverb: 0.6 },
);

// Your railgun: a sharp electric crack, a falling zap, and the air torn.
defineSfx(
  'rail',
  (k) => {
    k.noise(k.s.white, k.t, 0.08, [['highpass', 2500]], 0.55, 0.001, 0.06);
    k.tone('sawtooth', k.t, 2400, 180, 0.22, 0.002, 0.42);
    k.tone('sine', k.t, 140, 55, 0.5, 0.004, 0.35);
    k.noise(k.s.pink, k.t + 0.01, 0.6, [['bandpass', 1800, 0.8]], 0.25, 0.01, 0.5);
  },
  { reverb: 0.4 },
);

// Someone else's: the same, further off (opts.size 0..1, nearer louder).
defineSfx(
  'rail-far',
  (k) => {
    const g = 0.15 + 0.85 * k.size;
    k.noise(k.s.white, k.t, 0.07, [['bandpass', 3000, 0.7]], 0.25 * g, 0.002, 0.07);
    k.tone('sawtooth', k.t, 1800, 160, 0.12 * g, 0.003, 0.4);
    k.noise(k.s.pink, k.t, 0.5, [['lowpass', 1400]], 0.18 * g, 0.01, 0.45);
  },
  { reverb: 0.6 },
);

// The railgun charged again: a soft rising click.
defineSfx(
  'charged',
  (k) => {
    k.tone('sine', k.t, 900, 1500, 0.035, 0.003, 0.06);
  },
  { reverb: 0.05 },
);

// A jump pad throwing you: a deep whoomp, rising.
defineSfx(
  'pad',
  (k) => {
    k.tone('sine', k.t, 90, 360, 0.45 * (0.3 + 0.7 * k.size), 0.01, 0.35);
    k.noise(k.s.pink, k.t, 0.4, [['bandpass', 500, 0.7]], 0.25 * (0.3 + 0.7 * k.size), 0.01, 0.3);
  },
  { reverb: 0.3 },
);

// A jump, and a landing on metal (opts.size: how hard).
defineSfx(
  'arena-jump',
  (k) => {
    k.noise(k.s.pink, k.t, 0.1, [['bandpass', 1400, 1]], 0.08, 0.004, 0.08);
  },
  { reverb: 0.15 },
);
defineSfx(
  'arena-land',
  (k) => {
    k.tone('sine', k.t, 120, 60, 0.3 * k.size, 0.003, 0.12);
    k.noise(k.s.white, k.t, 0.06, [['bandpass', 3200, 2]], 0.12 * k.size, 0.002, 0.05);
    k.tone('triangle', k.t, 740, 700, 0.05 * k.size, 0.002, 0.3);
  },
  { reverb: 0.2 },
);

// You fragged someone: a bright two-note chime.
defineSfx(
  'frag',
  (k) => {
    k.tone('triangle', k.t, 880, 880, 0.16, 0.004, 0.2);
    k.tone('triangle', k.t + 0.09, 1320, 1320, 0.16, 0.004, 0.35);
  },
  { reverb: 0.3 },
);

// You were fragged: a low thud and a fall.
defineSfx(
  'fragged',
  (k) => {
    k.tone('sine', k.t, 160, 40, 0.5, 0.004, 0.6);
    k.noise(k.s.brown, k.t, 0.5, [['lowpass', 400]], 0.5, 0.005, 0.4);
  },
  { reverb: 0.4 },
);

// The lead: up three notes taking it, down two losing it, one held tied.
defineSfx(
  'lead',
  (k) => {
    const notes = { taken: [660, 880, 1100], lost: [660, 440], tied: [660, 660] }[k.opts.how] || [660];
    notes.forEach((f, i) => k.tone('square', k.t + i * 0.1, f, f, 0.06, 0.004, 0.16));
  },
  { reverb: 0.2 },
);
