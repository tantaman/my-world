// What skiing sounds like, made from noise like every other sound here
// (audio/soundscape.js), on a bus of its own ('skiing'):
//
//   - the snow going by under you: a hiss that rises with your speed
//   - the edges: a bright bite as you carve, a rough rasp as you skid or brake
//   - bare ground: a gritty scrape
//   - the wind past your ears, louder and higher the faster you go, and in
//     the air most of all
//   - one-offs (sound.sfx): the click of the bindings, a jump, a landing in
//     the snow, a fall, a knock against a trunk or a rock
//
// The layer (sound.addLayer) hears what it should from `source`, which the
// skiing fills in every frame:
//   source.on         skis on
//   source.speed      m/s
//   source.grounded   on the snow
//   source.carve      0..1 how hard the edges are biting
//   source.skid       0..1 how hard you're skidding or braking
//   source.bare       0..1 how bare the ground is under you

import { defineSfx } from '../audio/sfx.js';
import { SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';
import { clamp } from '../noise.js';

const BUS = 'skiing';
// m/s at which the snow and the wind are as loud as they get
const LOUDEST = 22;

export function skiSounds(source) {
  return {
    name: 'skiing',

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
        send.gain.value = 0.12;
        g.connect(send).connect(wet);
        src.start(t, rand(0, 3));
        return { g, f: made };
      };
      this.hiss = bed(s.pink, [['bandpass', 1500, 0.6]]);
      this.edge = bed(s.white, [['highpass', 2600], ['peaking', 5200, 1.2]]);
      this.rasp = bed(s.white, [['bandpass', 900, 0.9]]);
      this.grit = bed(s.brown, [['bandpass', 380, 1.4]]);
      this.wind = bed(s.pink, [['lowpass', 500, 0.7]]);
    },

    update(s, t) {
      const on = source.on;
      const v = clamp(source.speed / LOUDEST, 0, 1.3);
      const ground = on && source.grounded ? 1 : 0;
      const snow = ground * (1 - source.bare);
      const set = (bed, level, at = 0.06) => bed.g.gain.setTargetAtTime(Math.max(SILENT, level), t, at);
      set(this.hiss, snow * (0.05 + 0.2 * v) * Math.min(1, source.speed / 2));
      this.hiss.f[0].frequency.setTargetAtTime(900 + 1600 * v, t, 0.1);
      set(this.edge, snow * source.carve * 0.12 * Math.min(1, v * 1.5), 0.04);
      set(this.rasp, snow * source.skid * (0.08 + 0.25 * v), 0.04);
      set(this.grit, ground * source.bare * Math.min(1, source.speed / 4) * 0.5, 0.05);
      set(this.wind, on ? 0.03 + 0.28 * v * v : 0, 0.2);
      this.wind.f[0].frequency.setTargetAtTime(350 + 1700 * v, t, 0.2);
    },
  };
}

// The bindings clicking shut (or open): two clicks, one for each boot.
defineSfx('binding', (k) => {
  for (const at of [0, 0.11]) {
    k.noise(k.s.white, k.t + at, 0.03, [['bandpass', 3200, 3]], 0.5, 0.001, 0.018);
    k.tone('square', k.t + at, 1900, 1500, 0.04, 0.001, 0.02);
  }
});

// Springing off the snow: a push, and the snow letting go.
defineSfx('pop', (k) => {
  k.noise(k.s.pink, k.t, 0.25, [['bandpass', 700, 0.8]], 0.5, 0.01, 0.12);
  k.noise(k.s.white, k.t + 0.02, 0.2, [['highpass', 2500]], 0.12, 0.005, 0.1);
});

// Coming down in the snow: a soft whump, bigger the harder you land.
defineSfx('powder', (k) => {
  const s = k.size;
  k.noise(k.s.brown, k.t, 0.4, [['lowpass', 380]], 0.6 + 0.9 * s, 0.006, 0.18 + 0.15 * s);
  k.noise(k.s.pink, k.t + 0.01, 0.4, [['bandpass', 1300, 0.7]], 0.25 + 0.4 * s, 0.004, 0.16 + 0.12 * s);
});

// A fall: thumps as you go over and over, and a spray of snow.
defineSfx('wipeout', (k) => {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const at = k.t + i * rand(0.16, 0.24);
    const w = 1 - i / (n + 1);
    k.noise(k.s.brown, at, 0.35, [['lowpass', 300]], 1.1 * w, 0.005, 0.16);
    k.noise(k.s.pink, at + 0.01, 0.3, [['bandpass', 1500, 0.8]], 0.4 * w, 0.004, 0.14);
  }
  k.noise(k.s.white, k.t, 1.1, [['bandpass', 2400, 0.5]], 0.15, 0.05, 0.8);
});

// Glancing off a trunk or a rock.
defineSfx('knock', (k) => {
  k.noise(k.s.pink, k.t, 0.15, [['bandpass', 420, 2]], 0.9 * (0.4 + k.size), 0.002, 0.08);
  k.tone('sine', k.t, 180, 110, 0.15 * k.size, 0.002, 0.1);
});
