// What the ship sounds like, made from noise and oscillators like every other
// sound here (audio/soundscape.js).
//
//   the ship     a layer: the air handling's low hum all through her inside,
//                and the deep rumble of her generators, felt more than heard;
//                in the nightclub a house beat, bass, hats and chords; out on
//                the Lido, steel drums; in the atrium, a pianist; the sea
//                lapping at her side and the pier's piles, down by the water
//   one-offs     (sound.sfx) the lift's chime, its doors, a key card's beep
//                and a cabin door's latch, the rush down a slide and the
//                splash at the bottom
//   her horn     (sound.call 'ship-horn' at her funnel) the long deep blast
//                she sounds at noon and at five
//
// The layer hears what it should from `source`, which index.js fills in
// every frame (each 0..1):
//   source.inside  how far inside her you are
//   source.club    how near the dance floor
//   source.lido    out on her open decks
//   source.atrium  in the atrium
//   source.lap     down by the water, near her
//   source.beat    (written here) the club's beat, counted from when it started

import { defineSfx } from '../audio/sfx.js';
import { defineCall } from '../audio/calls.js';
import { SILENT } from '../audio/kit.js';

const BUS = 'cruise';
const BPM = 124;
export const BEAT = 60 / BPM; // s
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const HUM = 0.02;
const RUMBLE = 0.05;
const CLUB = 0.16;
const DRUMS = 0.05;
const PIANO = 0.045;
const LAP = 0.08;
// the club's chords: minor, going round (Am F C G, sevenths)
const CLUB_CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [48, 52, 55, 59],
  [55, 59, 62, 65],
];
const DRUM_TUNE = [72, 74, 76, 79, 76, 74, 72, 69, 67, 69, 72, 74, 72, 67, 64, 67];
const PIANO_CHORDS = [
  [60, 64, 67, 71, 74],
  [57, 60, 64, 67, 72],
  [62, 65, 69, 72, 76],
  [55, 59, 62, 65, 71],
];

export function shipSounds(source) {
  return {
    name: 'cruise',

    build(s) {
      const ctx = s.ctx;
      const { dry } = s.bus(BUS);
      const gain = (v = SILENT) => {
        const g = ctx.createGain();
        g.gain.value = v;
        return g;
      };
      // the air handling: a broad hush, low
      this.hum = gain();
      const air = ctx.createBufferSource();
      air.buffer = s.pink;
      air.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      air.connect(lp).connect(this.hum).connect(dry);
      air.start();
      // the generators, a long way down
      this.rumble = gain();
      for (const [f, a] of [
        [36, 1],
        [72, 0.4],
        [108, 0.15],
      ]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = gain(a);
        o.connect(g).connect(this.rumble);
        o.start();
      }
      this.rumble.connect(dry);
      // the sea at her side
      this.lap = gain();
      const sea = ctx.createBufferSource();
      sea.buffer = s.brown || s.pink;
      sea.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 0.6;
      this.lapLfo = ctx.createGain();
      sea.connect(bp).connect(this.lap).connect(dry);
      sea.start();
      // the music: each source's own gain, scheduled notes into it
      this.club = gain();
      const clubLp = ctx.createBiquadFilter();
      clubLp.type = 'lowpass';
      clubLp.frequency.value = 2400;
      this.club.connect(clubLp).connect(dry);
      this.clubLp = clubLp;
      this.drums = gain();
      this.drums.connect(dry);
      this.piano = gain();
      this.piano.connect(dry);
      this.nextClub = 0;
      this.nextDrums = 0;
      this.nextPiano = 0;
      this.step = 0;
      this.bar = 0;
      this.tune = 0;
      this.chord = 0;
      this.t0 = null;
    },

    update(s, t) {
      const set = (g, v, tc = 0.3) => g.gain.setTargetAtTime(Math.max(SILENT, v), t, tc);
      set(this.hum, source.inside * HUM);
      set(this.rumble, Math.max(source.inside, source.lido * 0.4, source.lap * 0.3) * RUMBLE);
      set(this.lap, source.lap * LAP * (0.7 + 0.3 * Math.sin(t * 0.7)), 0.8);
      set(this.club, source.club * CLUB);
      // through the walls, only the bass gets out
      this.clubLp.frequency.setTargetAtTime(source.inClub ? 6000 : 300, t, 0.2);
      set(this.drums, source.lido * DRUMS);
      set(this.piano, source.atrium * PIANO);
      if (this.t0 === null) this.t0 = t;
      source.beat = (t - this.t0) / BEAT;
      if (source.club > 0.01) this._club(s, t);
      else this.nextClub = 0;
      if (source.lido > 0.01) this._drums(s, t);
      else this.nextDrums = 0;
      if (source.atrium > 0.01) this._piano(s, t);
      else this.nextPiano = 0;
    },

    _voice(s, out, type, f, at, len, amp, f1 = f) {
      const ctx = s.ctx;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, at);
      if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, at + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(SILENT, at);
      g.gain.exponentialRampToValueAtTime(amp, at + 0.006);
      g.gain.exponentialRampToValueAtTime(SILENT, at + len);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + len + 0.05);
      o.onended = () => g.disconnect();
    },

    _hat(s, out, at, amp) {
      const ctx = s.ctx;
      const n = ctx.createBufferSource();
      n.buffer = s.white;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, at);
      g.gain.exponentialRampToValueAtTime(SILENT, at + 0.05);
      n.connect(hp).connect(g).connect(out);
      n.start(at, Math.random());
      n.stop(at + 0.08);
      n.onended = () => g.disconnect();
    },

    // The club: four on the floor, sixteenth-note bars scheduled ahead
    _club(s, t) {
      const step = BEAT / 4;
      // stay on the beat the lights are following
      if (this.nextClub < t) this.nextClub = this.t0 + Math.ceil((t + 0.05 - this.t0) / step) * step;
      while (this.nextClub < t + 0.4) {
        const at = this.nextClub;
        const k = Math.round((at - this.t0) / step) % 64;
        const chord = CLUB_CHORDS[Math.floor(k / 16)];
        if (k % 4 === 0) this._voice(s, this.club, 'sine', 120, at, 0.28, 0.9, 42); // the kick
        if (k % 4 === 2) this._hat(s, this.club, at, 0.35);
        else if (k % 2 === 1) this._hat(s, this.club, at, 0.12);
        // the bass on the offbeats
        if (k % 4 === 2) this._voice(s, this.club, 'sawtooth', NOTE(chord[0] - 24), at, step * 1.6, 0.22);
        // chord stabs
        if (k % 8 === 3 || k % 16 === 14) for (const n of chord) this._voice(s, this.club, 'square', NOTE(n), at, step * 1.2, 0.035);
        this.nextClub += step;
      }
    },

    // Steel drums by the pool: a tune going round, a little loose
    _drums(s, t) {
      const step = 0.25;
      if (this.nextDrums < t) this.nextDrums = t + 0.05;
      while (this.nextDrums < t + 0.5) {
        const at = this.nextDrums;
        if (Math.random() > 0.15) {
          const n = DRUM_TUNE[this.tune % DRUM_TUNE.length];
          this._voice(s, this.drums, 'sine', NOTE(n), at, 0.5, 0.5);
          this._voice(s, this.drums, 'sine', NOTE(n) * 2.76, at, 0.2, 0.12);
        }
        this.tune++;
        this.nextDrums += step;
      }
    },

    // A pianist in the atrium: slow chords, broken
    _piano(s, t) {
      const bar = 2.4;
      if (this.nextPiano < t) this.nextPiano = t + 0.05;
      while (this.nextPiano < t + 0.6) {
        const at = this.nextPiano;
        const chord = PIANO_CHORDS[this.chord % PIANO_CHORDS.length];
        chord.forEach((n, i) => this._voice(s, this.piano, 'triangle', NOTE(n), at + i * 0.12, 2.2, 0.3));
        this._voice(s, this.piano, 'triangle', NOTE(chord[0] - 12), at, 2.4, 0.35);
        this.chord++;
        this.nextPiano += bar;
      }
    },
  };
}

// The lift's chime: one note going up, two going down.
defineSfx(
  'lift-ding',
  (k) => {
    const up = k.opts.down ? 0 : 1;
    k.tone('sine', k.t, up ? 784 : 988, up ? 784 : 988, 0.1, 0.004, 0.9);
    if (!up) k.tone('sine', k.t + 0.3, 784, 784, 0.1, 0.004, 1.1);
    k.tone('sine', k.t, up ? 1568 : 1976, up ? 1568 : 1976, 0.02, 0.004, 0.4);
  },
  { reverb: 0.15 },
);

// The lift's doors, rolling.
defineSfx(
  'lift-doors',
  (k) => {
    k.noise(k.s.pink, k.t, 1.2, [['bandpass', 300, 0.8]], 0.06, 0.15, 0.6);
    k.noise(k.s.white, k.t + 1.15, 0.05, [['bandpass', 1200, 1.2]], 0.08, 0.002, 0.04);
  },
  { reverb: 0.05 },
);

// A key card to the lock: the beep and the latch.
defineSfx(
  'keycard',
  (k) => {
    k.tone('square', k.t, 1760, 1760, 0.03, 0.002, 0.08);
    k.tone('square', k.t + 0.1, 2349, 2349, 0.03, 0.002, 0.08);
    k.noise(k.s.white, k.t + 0.22, 0.04, [['bandpass', 2800, 2]], 0.18, 0.001, 0.03);
  },
  { reverb: 0.05 },
);

// A cabin door: the handle, the latch, the swing.
defineSfx(
  'cabin-door',
  (k) => {
    k.noise(k.s.white, k.t, 0.04, [['bandpass', 2400, 2]], 0.2, 0.001, 0.03);
    k.noise(k.s.pink, k.t + 0.05, 0.5, [['lowpass', 500]], 0.08, 0.1, 0.3);
  },
  { reverb: 0.08 },
);

// Down a slide: the rush of the water round you, building.
defineSfx(
  'slide-rush',
  (k) => {
    const len = k.opts.length ?? 8;
    k.noise(k.s.pink, k.t, len, [['bandpass', 900, 0.6]], 0.22, 1.2, len * 0.3);
    k.noise(k.s.white, k.t, len, [['highpass', 3000]], 0.05, 1.5, len * 0.3);
  },
  { reverb: 0.1 },
);

// ...and into the pool at the bottom.
defineSfx(
  'slide-splash',
  (k) => {
    k.noise(k.s.white, k.t, 0.7, [['bandpass', 1400, 0.5]], 0.6, 0.004, 0.5);
    k.noise(k.s.pink, k.t + 0.05, 1.2, [['lowpass', 700]], 0.4, 0.02, 0.9);
  },
  { reverb: 0.2 },
);

// Her horn: a long deep blast, two notes a fifth apart sounding together,
// rich and buzzing, carrying a long way.
defineCall('ship-horn', 400, ({ t, voice }) => {
  const len = 4.5;
  for (const [f, a] of [
    [73.4, 0.5],
    [110, 0.35],
  ]) {
    voice(
      'sawtooth',
      t,
      [
        [0, f * 0.97],
        [0.4, f],
        [len, f],
      ],
      [
        [0.35, a],
        [len - 0.6, a],
        [len, 0],
      ],
      { filter: [['lowpass', 900, 0.7]] },
    );
  }
});
