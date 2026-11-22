// What surfing sounds like, made from noise like every other sound here
// (audio/soundscape.js):
//
//   - the break: where a wave's lip comes down, a deep boom and a roar, from
//     there (it moves along the shore as the wave peels); and the hiss of
//     the white water rolling in after it. Heard from the beach too.
//   - the board: water rushing under it, rising with your speed, a slap and
//     spit of spray off the rail as you carve; and the paddling, lying down
//   - one-offs (sound.sfx): popping up, coming down from the air, a wipeout
//     (going under, and the wave going over), a duck under a wave
//
// The layer (sound.addLayer) hears what it should from `source`, which the
// surfing fills in every frame:
//   source.breaking   0..1 how hard the waves are breaking, and
//   source.bx, by, bz where (the loudest of them)
//   source.foam       0..1 how much white water is rolling in near you
//   source.on         on the board
//   source.riding     up on your feet, on the water
//   source.speed      m/s
//   source.carve      0..1 how hard the rail is biting
//   source.paddle     0..1 paddling

import { defineSfx } from '../audio/sfx.js';
import { SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';
import { clamp } from '../noise.js';

const BUS = 'surfing';
const LOUDEST = 12; // m/s at which the board is as loud as it gets

export function surfSounds(source) {
  return {
    name: 'surfing',

    build(s, t) {
      const ctx = s.ctx;
      const loop = (buf, filters, dest) => {
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
        node.connect(g).connect(dest);
        src.start(t, rand(0, 3));
        return { g, f: made };
      };
      // the break, from where it's breaking
      const placed = s.placeAt(0, -1000, 0, BUS);
      this.pan = placed.nodes[1];
      this.roar = loop(s.brown, [['lowpass', 260, 0.7]], placed.out);
      this.crash = loop(s.pink, [['bandpass', 700, 0.5]], placed.out);
      // the white water round you, and the board
      const { dry } = s.bus(BUS);
      this.hiss = loop(s.white, [['bandpass', 2200, 0.5]], dry);
      this.rush = loop(s.pink, [['bandpass', 900, 0.7]], dry);
      this.spit = loop(s.white, [['highpass', 3000], ['peaking', 5500, 1.5]], dry);
      this.stroke = loop(s.pink, [['bandpass', 500, 1.1]], dry);
      this.was = 0;
    },

    update(s, t) {
      const set = (bed, level, at = 0.08) => bed.g.gain.setTargetAtTime(Math.max(SILENT, level), t, at);
      const b = clamp(source.breaking, 0, 1);
      if (b > 0.01) s.moveTo(this.pan, source.bx, source.by, source.bz, t);
      // a boom as it comes down, then the roar
      const boom = Math.max(0, b - this.was);
      this.was += (b - this.was) * 0.08;
      set(this.roar, b * 0.9 + boom * 2, 0.12);
      set(this.crash, b * 0.35, 0.15);
      set(this.hiss, clamp(source.foam, 0, 1) * 0.18, 0.2);
      const v = clamp(source.speed / LOUDEST, 0, 1.3);
      const up = source.on && source.riding ? 1 : 0;
      set(this.rush, up * (0.04 + 0.22 * v), 0.06);
      this.rush.f[0].frequency.setTargetAtTime(600 + 900 * v, t, 0.1);
      set(this.spit, up * clamp(source.carve, 0, 1) * 0.14 * Math.min(1, v * 1.5), 0.04);
      // paddling: a pull through the water with each stroke
      const p = source.on && !source.riding ? clamp(source.paddle, 0, 1) : 0;
      set(this.stroke, p * (0.06 + 0.06 * Math.max(0, Math.sin(t * 6))), 0.05);
    },
  };
}

// Popping up: hands slapping the deck and the board taking your weight.
defineSfx('surf-pop', (k) => {
  k.noise(k.s.pink, k.t, 0.12, [['bandpass', 900, 1.2]], 0.35, 0.002, 0.06);
  k.noise(k.s.brown, k.t + 0.08, 0.3, [['lowpass', 400]], 0.5, 0.01, 0.15);
  k.noise(k.s.white, k.t + 0.1, 0.4, [['bandpass', 2500, 0.6]], 0.08, 0.02, 0.25);
});

// Coming back down on the water from the air.
defineSfx('surf-land', (k) => {
  const s = k.size;
  k.noise(k.s.brown, k.t, 0.4, [['lowpass', 350]], 0.5 + 0.8 * s, 0.004, 0.18);
  k.noise(k.s.white, k.t + 0.01, 0.6, [['bandpass', 1800, 0.6]], 0.15 + 0.3 * s, 0.01, 0.35);
});

// Wiped out: a splash, going under, and the wave going over: muffled roar.
defineSfx('surf-wipeout', (k) => {
  k.noise(k.s.white, k.t, 0.5, [['bandpass', 1600, 0.6]], 0.45, 0.005, 0.3);
  k.noise(k.s.brown, k.t + 0.05, 1.6, [['lowpass', 220]], 0.9, 0.08, 1.2);
  for (let i = 0; i < 5; i++) k.noise(k.s.pink, k.t + 0.3 + rand(0, 1.1), 0.25, [['bandpass', rand(250, 500), 1.5]], 0.15, 0.03, 0.15);
});

// The nose pushed under a wave, and coming up behind it.
defineSfx('surf-duck', (k) => {
  k.noise(k.s.pink, k.t, 0.3, [['bandpass', 800, 0.8]], 0.25, 0.02, 0.18);
  k.noise(k.s.brown, k.t + 0.15, 0.8, [['lowpass', 260]], 0.35, 0.1, 0.5);
});
