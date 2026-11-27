// Our cue: the music under the take, written for it. It is not the
// original's music (that is someone else's composition); it fills the same
// role, measured from it with tools/sound.py: a deep pulse at 43 beats a
// minute from 0.1 s, a warm bass that never stops and moves at the same
// moments, and slow chords of three to six voices in the same register (G3
// to G5, their partials up to about 1.5 kHz) that scoop into pitch and swell
// where the picture turns, leaving room where it holds, each band as loud
// as the original's within a few dB through the take. Ours is in E minor
// with its own progression and voicings; the original's notes are not used.
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
  hz: 41.2,                 // its pitch (E1)
  from: 64,                 // Hz, where each thump's pitch starts
};
export const beat = (b) => PULSE.first + b * PULSE.period;

// The bass, held throughout: [beat, note, level dB, glide s]. Each line
// holds until the next; the glide is how long it takes to slide there.
export const BASS = [
  [-0.07, 40, -49, 0],
  [2.5, 41, -41, 0.35],
  [3, 40, -47, 0.3],
  [4, 40, -51, 0],
  [6.75, 38, -42, 0.15],
  [7, 40, -41, 0.12],
  [8, 40, -47, 0],
  [10, 36, -40, 0.12],
  [11, 36, -44, 0],
  [13, 36, -48, 0],
  [15.25, 33, -39, 0.3],
  [16, 33, -47, 0],
  [17.75, 33, -51, 0],
  [18, 33, -41, 0],
  [19, 40, -40, 0.4],
  [20, 40, -47, 0],
  [21, 40, -50, 0],
  [22.5, 38, -41, 0.12],
  [23, 40, -42, 0.2],
  [25, 40, -45, 0],
  [26.5, 36, -41, 0.2],
  [28.25, 36, -47, 0],
  [29.25, 36, -50, 0],
  [30.5, 35, -43, 0.3],
  [31, 33, -40, 0.25],
  [32.25, 33, -47, 0],
  [33.25, 33, -50, 0],
  [34, 31, -42, 0.15],
  [35, 40, -41, 0.3],
  [36, 40, -48, 0],
  [38, 40, -39, 0.1],
  [38.75, 41, -38, 0.2],
  [39.25, 40, -38, 0.3],
  [41, 40, -42, 0],
  [43, 38, -38, 0.2],
  [44.25, 38, -42, 0],
  [45, 38, -51, 0],
  [45.6, 38, -45, 0],
  [46.25, 36, -41, 0.2],
  [47, 33, -40, 0.25],
  [48.25, 33, -45, 0],
  [49.75, 40, -42, 0.2],
  [50.75, 40, -45, 0],
];

// Where the bass is doubled an octave down, for weight: [beat, level dB under the bass].
export const SUB = [
  [0, -60], [30.75, -60], [31, -6], [32.75, -10], [34, -60],
  [42.9, -60], [43, -4], [44.75, -9], [46, -60], [46.9, -60], [47, -4], [49, -9], [49.65, -60],
];

// Chords: [beat, length in beats, notes, level dB a voice, brightness
// (filter Hz), glides: [[after s, notes], ...]]. Voices scoop up into each note.
export const CHORDS = [
  [2.5, 0.6, [53, 60, 65], -45, 1000],
  [7, 3, [55, 59, 64, 66, 71], -45, 1100],
  [10, 1.05, [55, 59, 64, 67, 71], -43, 1000, [[0.55, [55, 59, 64, 67, 72]], [0.95, [57, 59, 64, 67, 72]]]],
  [11, 4.3, [55, 60, 64], -57, 800],
  [15.25, 2.75, [57, 60, 64], -57, 800],
  [18, 1, [57, 60, 64, 71, 74], -45, 1400, [[0.6, [55, 59, 64, 71, 74]], [1.0, [55, 59, 64, 69, 71]]]],
  [19, 3.5, [52, 59], -59, 600],
  [22.5, 0.55, [62, 66, 69, 74, 78], -43, 2200],
  [23, 3.45, [59, 64, 71, 78], -48, 1300],
  [26.5, 0.75, [60, 64, 67, 72], -44, 1600],
  [27.25, 3.25, [55, 59, 62, 64, 71], -46, 1200],
  [30.5, 0.5, [59, 63, 66, 69], -44, 1600, [[0.3, [58, 62, 65, 68]]]],
  [31, 2.9, [57, 60, 64, 71], -46, 1100],
  [34, 1.05, [55, 59, 62, 67, 71], -43, 1400],
  [35, 2.95, [52, 59, 64], -54, 700],
  [38, 0.65, [53, 57, 60, 64, 71], -46, 3200],
  [38.75, 0.6, [57, 60, 64, 69], -43, 3000],
  [39.25, 2.7, [52, 59, 64, 66, 71], -47, 3000],
  [43, 1.6, [50, 57, 62, 66], -50, 1100],
  [46.25, 0.75, [60, 64, 67, 71, 74], -40, 1200, [[0.4, [57, 60, 64, 69, 72]]]],
  [47, 2.75, [57, 60, 64], -45, 1000],
  [50, 0.6, [59, 64, 67, 71, 76, 79], -44, 1400, [[0.55, [58, 63, 66, 70, 75, 78]]]],
];

// A lead line: [beat, length in beats, note, level dB, scoop from (semitones)].
// Its fundamental weak, its second partial strongest, the rest falling away.
export const LEAD = [
  [42, 1.05, 59, -33, -2],
];

// Offbeat swishes through the climax: noise swelling into each half-beat, from beat to beat.
export const SWISH = { from: 39, to: 47.5, level: -46 };
