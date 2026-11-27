// Our cue: the music under the take, written for it. It is not the
// original's music (that is someone else's composition); it fills the same
// role, measured from it with tools/sound.py: a deep pulse at 43 beats a
// minute from 0.1 s, a warm bass that never stops and moves at the same
// moments, and slow chords of three to six voices in the same register (F3
// to F5, their partials up to about 1.5 kHz) that lean into pitch and swell
// where the picture turns, leaving room where it holds, each band as loud
// as the original's within a few dB through the take. Ours is centred on D,
// as the original's is (its bass sits on D2 most of the take), with its own
// progression and voicings, in D minor; the original's notes are not used.
//
// Placed in beats of the pulse (beat(b) is seconds into the take), but the
// glides' "after", in seconds; notes are MIDI numbers; levels dB.

// The pulse: a soft low thump on every beat (43 a minute, as the
// original's), a breath at the shop window, and from the lift a softer
// beat just before every fourth, like a heart's. Everything else in the
// score is placed in beats of it: beat(b) is its time in seconds.
export const PULSE = {
  first: 0.088,             // s, the first beat (the original's falls at 0.10 s, ours rises 14 ms)
  period: 60 / 43,          // s
  beats: 52,
  rest: [19],               // beats left out
  pickup: [42, 46, 50],     // beats a softer one comes just before
  pickupBefore: 0.36,       // s
  pickupLevel: -5,          // dB under the beat
  level: -31,               // dB, the thump's peak
  hz: 41.2,                 // Hz, its pitch (the original's thumps settle at 40 to 45 Hz)
  from: 64,                 // Hz, where each thump's pitch starts
};
export const beat = (b) => PULSE.first + b * PULSE.period;

// The bass, held throughout: [beat, note, level dB, glide s]. Each line
// holds until the next; the glide is how long it takes to slide there.
export const BASS = [
  [-0.07, 38, -49, 0],
  [2.5, 39, -41, 0.35],
  [3, 38, -47, 0.3],
  [4, 38, -51, 0],
  [6.75, 36, -42, 0.15],
  [7, 38, -41, 0.12],
  [8, 38, -47, 0],
  [10, 34, -40, 0.12],
  [11, 34, -44, 0],
  [13, 34, -48, 0],
  [15.25, 31, -39, 0.3],
  [16, 31, -47, 0],
  [17.75, 31, -51, 0],
  [18, 31, -41, 0],
  [19, 38, -40, 0.4],
  [20, 38, -47, 0],
  [21, 38, -50, 0],
  [22.5, 36, -41, 0.12],
  [23, 38, -42, 0.2],
  [25, 38, -45, 0],
  [26.5, 34, -41, 0.2],
  [28.25, 34, -47, 0],
  [29.25, 34, -50, 0],
  [30.5, 33, -43, 0.3],
  [31, 31, -40, 0.25],
  [32.25, 31, -47, 0],
  [33.25, 31, -50, 0],
  [34, 29, -42, 0.15],
  [35, 38, -41, 0.3],
  [36, 38, -48, 0],
  [38, 38, -39, 0.1],
  [38.75, 39, -38, 0.2],
  [39.25, 38, -38, 0.3],
  [41, 38, -42, 0],
  [43, 36, -38, 0.2],
  [44.25, 36, -42, 0],
  [45, 36, -51, 0],
  [45.6, 36, -45, 0],
  [46.25, 34, -41, 0.2],
  [47, 31, -40, 0.25],
  [48.25, 31, -45, 0],
  [49.75, 38, -42, 0.2],
  [50.75, 38, -45, 0],
];

// Where the bass is doubled an octave down, for weight: [beat, level dB under the bass].
export const SUB = [
  [0, -60], [30.75, -60], [31, -6], [32.75, -10], [34, -60],
  [42.9, -60], [43, -4], [44.75, -9], [46, -60], [46.9, -60], [47, -4], [49, -9], [49.65, -60],
];

// Chords: [beat, length in beats, notes, level dB a voice, brightness
// (filter Hz), glides: [[after s, notes], ...]]. Voices scoop up into each note.
export const CHORDS = [
  [2.5, 0.6, [51, 58, 63], -45, 1000],
  [7, 3, [53, 57, 62, 64, 69], -45, 1100],
  [10, 1.05, [53, 57, 62, 65, 69], -43, 1000, [[0.55, [53, 57, 62, 65, 70]], [0.95, [55, 57, 62, 65, 70]]]],
  [11, 4.3, [53, 58, 62], -57, 800],
  [15.25, 2.75, [55, 58, 62], -57, 800],
  [18, 1, [55, 58, 62, 69, 72], -45, 1400, [[0.6, [53, 57, 62, 69, 72]], [1.0, [53, 57, 62, 67, 69]]]],
  [19, 3.5, [50, 57], -59, 600],
  [22.5, 0.55, [60, 64, 67, 72, 76], -43, 2200],
  [23, 3.45, [57, 62, 69, 76], -48, 1300],
  [26.5, 0.75, [58, 62, 65, 70], -44, 1600],
  [27.25, 3.25, [53, 57, 60, 62, 69], -46, 1200],
  [30.5, 0.5, [57, 61, 64, 67], -44, 1600, [[0.3, [56, 60, 63, 66]]]],
  [31, 2.9, [55, 58, 62, 69], -46, 1100],
  [34, 1.05, [53, 57, 60, 65, 69], -43, 1400],
  [35, 2.95, [50, 57, 62], -54, 700],
  [38, 0.65, [51, 55, 58, 62, 69], -46, 3200],
  [38.75, 0.6, [55, 58, 62, 67], -43, 3000],
  [39.25, 2.7, [50, 57, 62, 64, 69], -47, 3000],
  [43, 1.6, [48, 55, 60, 64], -50, 1100],
  [46.25, 0.75, [58, 62, 65, 69, 72], -43, 1200, [[0.4, [55, 58, 62, 67, 70]]]],
  [47, 2.75, [55, 58, 62], -45, 1000],
  [49.75, 0.85, [57, 62, 65, 69, 74, 77], -44, 1400, [[0.8, [56, 61, 64, 68, 73, 76]]]],
];

// A lead line: [beat, length in beats, note, level dB, scoop from (semitones)].
// Its fundamental weak, its second partial strongest, the rest falling away.
export const LEAD = [
  [42, 1.05, 57, -33, -2],
];

// Offbeat swishes through the climax: noise swelling into each half-beat, from beat to beat.
export const SWISH = { from: 39, to: 47.5, level: -46 };
