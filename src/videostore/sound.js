// What the video store sounds like, made from noise and oscillators like
// every other sound here (audio/soundscape.js).
//
//   the shop     a layer: the hum of the strip lights, and music from the
//                ceiling speakers, soft and pleasant and instantly
//                forgettable, a few chords round and round with an
//                electric piano over them; heard inside, and a little at
//                the doors
//   one-offs     (sound.sfx) the chime as you come in, a box taken down off
//                the shelf and put back, the scanner's beep and the till,
//                the security gate going off, a tape dropped in the returns
//   underfoot    carpet inside, a soft scuff; tarmac outside, gritty
//
// The layer hears what it should from `source`, which index.js fills in
// every frame:
//   source.inside   0..1 how far in you are (1 among the shelves)
//   source.near     0..1 how near the doors you are, outside

import { defineSfx } from '../audio/sfx.js';
import { defineSurface } from '../audio/footsteps.js';
import { SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';

const BUS = 'videostore';
const BEAT = 60 / 92; // s, the music's beat
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// I vi IV V, with sevenths and sixths: the sound of a shop at four o'clock
const CHORDS = [
  [60, 64, 67, 71],
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 59, 62, 64],
];
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76];
const MUSIC = 0.05; // how loud the music is, fully in
const HUM = 0.012; // and the lights

export function shopSounds(source) {
  return {
    name: 'videostore',

    build(s) {
      const ctx = s.ctx;
      const { dry } = s.bus(BUS);
      // the ceiling speakers: nothing much below or above the voice
      const speaker = ctx.createBiquadFilter();
      speaker.type = 'bandpass';
      speaker.frequency.value = 900;
      speaker.Q.value = 0.45;
      const music = ctx.createGain();
      music.gain.value = SILENT;
      music.connect(speaker).connect(dry);
      // the strip lights: the mains hum, a little buzz on it
      const hum = ctx.createGain();
      hum.gain.value = SILENT;
      for (const [f, a, type] of [
        [120, 1, 'sine'],
        [240, 0.5, 'sine'],
        [360, 0.18, 'sawtooth'],
      ]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = a;
        o.connect(g).connect(hum);
        o.start();
      }
      hum.connect(dry);
      this.music = music;
      this.hum = hum;
      this.next = 0;
      this.bar = 0;
    },

    update(s, t) {
      const heard = Math.max(source.inside, source.near * 0.35);
      this.music.gain.setTargetAtTime(Math.max(SILENT, heard * MUSIC), t, 0.4);
      this.hum.gain.setTargetAtTime(Math.max(SILENT, source.inside * HUM), t, 0.4);
      if (heard < 0.01) {
        this.next = 0;
        return;
      }
      // the next bar, scheduled a little ahead
      if (this.next < t) this.next = t + 0.05;
      while (this.next < t + 0.6) {
        this._bar(s, this.next, CHORDS[this.bar % CHORDS.length]);
        this.next += BEAT * 4;
        this.bar++;
      }
    },

    _bar(s, at, chord) {
      const ctx = s.ctx;
      const out = this.music;
      const voice = (f, when, len, amp, type = 'sine') => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(SILENT, when);
        g.gain.exponentialRampToValueAtTime(amp, when + 0.01);
        g.gain.exponentialRampToValueAtTime(SILENT, when + len);
        o.connect(g).connect(out);
        o.start(when);
        o.stop(when + len + 0.05);
        o.onended = () => g.disconnect();
      };
      // the electric piano: the chord on the one and the and of two, a bell on top
      for (const at2 of [at, at + BEAT * 1.5]) {
        for (const n of chord) {
          voice(NOTE(n), at2, BEAT * 1.6, 0.16);
          voice(NOTE(n) * 2.01, at2, BEAT * 0.5, 0.04);
        }
      }
      // the bass, on the root
      voice(NOTE(chord[0] - 24), at, BEAT * 1.8, 0.5, 'triangle');
      voice(NOTE(chord[0] - 24 + 7), at + BEAT * 2, BEAT * 1.6, 0.4, 'triangle');
      // a tune, a few notes of it, never going anywhere
      let k = Math.floor(rand(0, SCALE.length));
      for (let e = 0; e < 8; e++) {
        if (Math.random() < 0.45) continue;
        k = Math.max(0, Math.min(SCALE.length - 1, k + Math.floor(rand(-2, 3))));
        voice(NOTE(SCALE[k] + 12), at + e * BEAT * 0.5, BEAT * 0.7, 0.07, 'triangle');
      }
    },
  };
}

// The chime over the door: ding, dong.
defineSfx(
  'shop-chime',
  (k) => {
    k.tone('sine', k.t, 1318, 1318, 0.12, 0.003, 0.9);
    k.tone('sine', k.t + 0.28, 1046, 1046, 0.12, 0.003, 1.2);
    k.tone('sine', k.t, 2636, 2636, 0.03, 0.002, 0.3);
  },
  { reverb: 0.2 },
);

// A box off the shelf: plastic on plastic.
defineSfx(
  'tape-take',
  (k) => {
    k.noise(k.s.white, k.t, 0.04, [['bandpass', 2600, 1.5]], 0.32, 0.001, 0.03);
    k.noise(k.s.pink, k.t + 0.02, 0.12, [['bandpass', 900, 1.2]], 0.2, 0.004, 0.08);
  },
  { reverb: 0.05 },
);

// ...and slid back in.
defineSfx(
  'tape-back',
  (k) => {
    k.noise(k.s.pink, k.t, 0.18, [['bandpass', 1500, 0.9]], 0.18, 0.04, 0.1);
    k.noise(k.s.white, k.t + 0.16, 0.03, [['bandpass', 2200, 1.5]], 0.25, 0.001, 0.025);
  },
  { reverb: 0.05 },
);

// The scanner's beep, once a tape.
defineSfx(
  'scan',
  (k) => {
    k.tone('square', k.t, 1900, 1900, 0.05, 0.002, 0.09);
  },
  { reverb: 0.05 },
);

// The till: the drawer, and a little bell.
defineSfx(
  'till',
  (k) => {
    k.noise(k.s.pink, k.t, 0.2, [['bandpass', 500, 0.8]], 0.3, 0.005, 0.15);
    k.tone('sine', k.t + 0.08, 2093, 2093, 0.08, 0.002, 0.6);
    k.tone('sine', k.t + 0.08, 3136, 3136, 0.04, 0.002, 0.4);
  },
  { reverb: 0.1 },
);

// The security gate: the beeping everybody in the shop turns round at.
defineSfx(
  'gate-alarm',
  (k) => {
    for (let i = 0; i < 6; i++) {
      const at = k.t + i * 0.22;
      k.tone('square', at, i % 2 ? 2100 : 2500, i % 2 ? 2100 : 2500, 0.06, 0.003, 0.17);
    }
  },
  { reverb: 0.15 },
);

// A tape dropped into the returns: a clatter, and a thud at the bottom.
defineSfx(
  'tape-drop',
  (k) => {
    k.noise(k.s.white, k.t, 0.06, [['bandpass', 1800, 1.2]], 0.25, 0.002, 0.05);
    k.tone('sine', k.t + 0.18, 140, 90, 0.3, 0.004, 0.18);
    k.noise(k.s.pink, k.t + 0.18, 0.15, [['lowpass', 600]], 0.35, 0.003, 0.12);
  },
  { reverb: 0.2 },
);

// Carpet: a soft scuff, the weight mostly swallowed.
defineSurface('carpet', {
  thump: 0.45,
  step({ s, t, run, sharp, noise }) {
    noise(s.pink, t, 0.14, [['bandpass', rand(380, 520), 0.9]], 0.45 * sharp, 0.008, 0.07 + run * 0.02);
    noise(s.white, t + 0.01, 0.06, [['bandpass', 2400, 1]], 0.06 * sharp, 0.006, 0.04);
  },
});

// Tarmac: a hard heel, and a little grit.
defineSurface('tarmac', {
  thump: 0.75,
  step({ s, t, sharp, noise }) {
    noise(s.white, t, 0.1, [['bandpass', 1300, 1.1]], 0.7 * sharp, 0.002, 0.05);
    for (let i = 0; i < 3; i++) noise(s.white, t + rand(0.005, 0.05), 0.015, [['bandpass', 5200, 3]], rand(0.05, 0.12), 0.001, 0.006);
  },
});
