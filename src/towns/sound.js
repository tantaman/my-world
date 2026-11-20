// What a town sounds like, made from oscillators and noise like every other
// sound here (audio/calls.js), and placed where it comes from: a church bell
// striking the hour across a village green, a piano in a saloon, a sign
// creaking on its hinge in an empty street, a dog, somebody saying hello.
//
// index.js decides when each is heard; this only says how each sounds.
//   town-bell   opts.strokes, opts.pitch (Hz of the strike note)
//   piano       one phrase of a honky-tonk piano, a few bars long
//   creak       a hinge or a sign swinging in the wind
//   dog         a dog barking, two or three times
//   hello       a few syllables of speech; opts.pitch scales the voice
//   whisper     breath, close by, and gone

import { defineCall } from '../audio/calls.js';
import { rand } from '../core/geom.js';

// A bell's partials as ratios of the strike note, how loud each is, and how
// long each rings (s): the hum under it rings longest.
const BELL = [[0.5, 0.5, 7], [1, 0.6, 5], [1.19, 0.35, 3.5], [1.5, 0.22, 2.8], [2, 0.3, 2.5], [2.52, 0.12, 1.6], [3.01, 0.08, 1.2]];

defineCall('town-bell', 40, ({ t, opts, voice }) => {
  const f = opts.pitch ?? 330;
  const n = opts.strokes ?? 1;
  for (let i = 0; i < n; i++) {
    const at = t + i * (opts.every ?? 2.3);
    for (const [r, a, dur] of BELL) {
      voice('sine', at, [[0, f * r * rand(0.998, 1.002)]], [[0.006, a * 0.22], [dur * 0.25, a * 0.08], [dur, 0]]);
    }
  }
});

// Honky-tonk: two strings to a note, a little out of tune with each other;
// a stride bass, chords on the off beats, and a tune over the top.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = { C: [60, 64, 67], F: [65, 69, 72], G: [67, 71, 74, 77] };
const ROOT = { C: 36, F: 41, G: 43 };
const TUNES = [['C', 'F', 'C', 'G'], ['C', 'C', 'F', 'C'], ['F', 'C', 'G', 'C'], ['C', 'G', 'C', 'C']];

defineCall('piano', 9, ({ t, voice }) => {
  const beat = 0.3 * rand(0.95, 1.05);
  const prog = TUNES[Math.floor(Math.random() * TUNES.length)];
  const key = (n, at, amp, len) => {
    const f = NOTE(n);
    for (const det of [0.994, 1.006]) voice('triangle', at, [[0, f * det]], [[0.004, amp], [len * 0.3, amp * 0.4], [len, 0]], { filter: [['lowpass', 2600]] });
  };
  prog.forEach((name, bar) => {
    const at = t + bar * beat * 4;
    const ch = CHORDS[name];
    key(ROOT[name], at, 0.12, beat * 1.4);
    key(ROOT[name] + 7, at + beat * 2, 0.1, beat * 1.4);
    for (const b of [1, 3]) for (const n of ch) key(n, at + beat * b, 0.045, beat * 0.7);
    // the tune: chord tones and the notes between, on the eighths, some rests
    let k = Math.floor(Math.random() * ch.length);
    for (let e = 0; e < 8; e++) {
      if (Math.random() < 0.3) continue;
      k = Math.max(0, Math.min(ch.length + 1, k + Math.floor(Math.random() * 3) - 1));
      const n = (k < ch.length ? ch[k] : ch[k - ch.length] + 12) + 12;
      key(n, at + e * beat * 0.5 + (e % 2 ? beat * 0.08 : 0), 0.07, beat * 0.6);
    }
  });
});

defineCall('creak', 14, ({ t, opts, voice }) => {
  const f = opts.pitch ?? rand(70, 120);
  const len = rand(0.6, 1.3);
  const pitch = [[0, f]];
  for (let s = 0.15; s < len; s += rand(0.12, 0.3)) pitch.push([s, f * rand(0.8, 1.6)]);
  voice('sawtooth', t, pitch, [[0.08, 0.09], [len * 0.7, 0.07], [len, 0]], { filter: [['bandpass', rand(900, 1400), 6]], vib: rand(18, 28), vibDepth: f * 0.25 });
});

defineCall('dog', 45, ({ s, t, voice, noise }) => {
  const n = 2 + Math.floor(rand(0, 2));
  const f = rand(240, 380);
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.35, 0.55);
    voice('sawtooth', at, [[0, f * 1.3], [0.05, f], [0.16, f * 0.7]], [[0.01, 0.22], [0.17, 0]], { filter: [['bandpass', 750, 1.6]] });
    noise(s.pink, at, 0.15, [['bandpass', 1400, 1.2]], 0.3, 0.006, 0.1);
  }
});

// Speech, as the sound of it and nothing more: a few syllables, each a
// voiced buzz through a vowel.
defineCall('hello', 6, ({ t, opts, voice }) => {
  const f = 150 * (opts.pitch ?? 1);
  const n = 3 + Math.floor(rand(0, 4));
  let at = t;
  for (let i = 0; i < n; i++) {
    const len = rand(0.08, 0.15);
    const g = f * rand(0.9, 1.25) * (i === n - 1 ? 0.85 : 1);
    voice('sawtooth', at, [[0, g], [len, g * rand(0.9, 1.1)]], [[0.015, 0.1], [len * 0.7, 0.08], [len, 0]], { filter: [['bandpass', rand(500, 1600), 3], ['lowpass', 3000]] });
    at += len + rand(0.02, 0.07);
  }
});

defineCall('whisper', 5, ({ s, t, noise }) => {
  const n = 2 + Math.floor(rand(0, 3));
  for (let i = 0; i < n; i++) noise(s.white, t + i * rand(0.25, 0.45), 0.5, [['bandpass', rand(2200, 4200), 2.5]], 0.25, 0.08, 0.3);
});
