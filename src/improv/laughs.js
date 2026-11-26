// A room full of people, made from numbers: laughter, applause, the
// murmur of a crowd before the show, and a room shouting out suggestions.
// Each is a buffer of samples, worked out once and played back as often as
// it's wanted (sound.js), like everything here made in code and not from a
// recording.
//
// A laugh is a run of "ha"s: a breath of noise, then a voiced vowel, four
// or five a second, each a little lower than the last. The voice is a
// buzzing source (the vocal folds) through three resonances (the mouth and
// throat: the vowel's formants), as speech is; a crowd's laugh is dozens of
// them, every one its own voice, coming in a beat or so after each other
// and dying away at their own pace. Applause is dozens of pairs of hands,
// each clap a burst of noise ringing in the hollow of the palms, at the
// pace each person claps. A murmur is a crowd talking among itself: voices
// on vowels that keep changing, too many and too low to make out.
//
//   laughter(strength, seed)   0 (a chuckle) .. 3 (the room falls apart)
//   applause(seconds, seed, { cheer })
//   murmur(seconds, seed)      loops: its end runs into its start
//   shout(seed)                the room calling out suggestions at once
//   -> { rate, data: Float32Array }
//   laughing(…), clapping(…), murmuring(…), shouting(…): the same, a few
//   voices at a time (a generator: what it returns is the sound)
//
// No browser in here: the tests listen to them as numbers.

import { mulberry32 } from '../noise.js';

export const RATE = 22050; // samples a second: plenty for a room of voices
const STEP = 6; // voices worked out between yields

// Each is worked out a little at a time (a generator that yields between
// voices: laughing, clapping, murmuring, shouting), or all at once.
export function finish(steps) {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

// A resonance: a two-pole filter ringing at f (Hz), bw wide.
function resonator(f, bw) {
  const r = Math.exp((-Math.PI * bw) / RATE);
  return { a1: 2 * r * Math.cos((2 * Math.PI * f) / RATE), a2: -r * r, g: 1 - r, y1: 0, y2: 0 };
}
const ring = (R, x) => {
  const y = R.g * x + R.a1 * R.y1 + R.a2 * R.y2;
  R.y2 = R.y1;
  R.y1 = y;
  return y;
};

// The vowels a crowd's voices pass through: [F1, F2, F3] (Hz, a man's; a
// woman's are higher).
const VOWELS = { a: [730, 1090, 2440], ah: [640, 1190, 2390], e: [530, 1840, 2480], o: [570, 840, 2410], u: [300, 870, 2240], i: [390, 1990, 2550], uh: [520, 1190, 2390] };
const TALK = ['a', 'e', 'o', 'u', 'i', 'uh', 'ah'];

// One voice saying a run of syllables into `out`: each { at (s), dur (s),
// f0 (Hz, at its start), drop (how far its pitch falls across it), vowel,
// breath (how much of its start is the h), amp }.
function voice(out, syllables, { pitch = 1, formant = 1, breathy = 0.25 }, rnd) {
  const R = [0, 1, 2].map(() => null);
  let phase = rnd();
  let lp = 0;
  for (const s of syllables) {
    const F = VOWELS[s.vowel];
    R[0] = resonator(F[0] * formant, 90);
    R[1] = resonator(F[1] * formant, 110);
    R[2] = resonator(F[2] * formant, 170);
    const i0 = Math.max(0, Math.floor(s.at * RATE));
    const n = Math.floor(s.dur * RATE);
    const h = s.breath;
    for (let j = 0; j < n && i0 + j < out.length; j++) {
      const u = j / n;
      // the h, then the vowel; up quickly, down slower
      const env = u < h ? (u / h) * 0.5 : Math.min(1, (u - h) / 0.08 + 0.5) * Math.pow(1 - (u - h) / (1 - h), 1.6);
      const voiced = u < h ? 0.15 : 1;
      const f0 = s.f0 * pitch * (1 - s.drop * u) * (1 + 0.012 * Math.sin(j * 0.031));
      phase += f0 / RATE;
      if (phase >= 1) phase -= 1;
      // the folds' buzz, softened, and the breath through them
      lp += (2 * phase - 1 - lp) * 0.35;
      const src = lp * voiced + (rnd() * 2 - 1) * (breathy + (u < h ? 0.7 : 0));
      const y = ring(R[0], src) * 1.0 + ring(R[1], src) * 0.55 + ring(R[2], src) * 0.25;
      out[i0 + j] += y * env * s.amp;
    }
  }
}

// Someone's voice: how high, and the size of their throat and mouth.
function someone(rnd) {
  const her = rnd() < 0.5;
  return { her, pitch: her ? 1.7 + rnd() * 0.5 : 0.95 + rnd() * 0.35, formant: her ? 1.12 + rnd() * 0.08 : 0.94 + rnd() * 0.1, breathy: 0.15 + rnd() * 0.25 };
}

// Scaled to peak at `peak`.
function normal(data, peak = 0.85) {
  let m = 0;
  for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i]));
  if (m > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / m;
  return data;
}

// The room laughing: 0 a few chuckles .. 3 everyone, hard, for a while.
export const laughter = (strength, seed) => finish(laughing(strength, seed));
export function* laughing(strength, seed = 1) {
  const rnd = mulberry32(seed);
  const L = [
    { people: 9, seconds: 1.6, syll: [1, 3], loud: 0.5 },
    { people: 26, seconds: 2.4, syll: [2, 5], loud: 0.75 },
    { people: 44, seconds: 3.4, syll: [3, 8], loud: 0.9 },
    { people: 60, seconds: 4.8, syll: [5, 11], loud: 1 },
  ][Math.max(0, Math.min(3, Math.round(strength)))];
  const out = new Float32Array(Math.floor(L.seconds * RATE));
  for (let p = 0; p < L.people; p++) {
    const who = someone(rnd);
    // most come in together; some a moment late, getting it
    let at = Math.pow(rnd(), 2.2) * 0.6 + (rnd() < 0.15 ? rnd() * 0.8 : 0);
    const n = L.syll[0] + Math.floor(rnd() * (L.syll[1] - L.syll[0] + 1));
    const pace = 1 / (4.2 + rnd() * 1.6);
    const base = 120 + rnd() * 50;
    const amp = (0.25 + rnd() * 0.75) * L.loud;
    const vowel = rnd() < 0.7 ? 'ah' : rnd() < 0.5 ? 'a' : 'uh';
    const syl = [];
    for (let k = 0; k < n; k++) {
      if (at > L.seconds - 0.12) break;
      syl.push({ at, dur: pace * (0.7 + rnd() * 0.25), f0: base * (1 - (k / n) * 0.22), drop: 0.08, vowel, breath: 0.3, amp: amp * (1 - (k / n) * 0.5) });
      at += pace * (0.9 + rnd() * 0.25);
    }
    voice(out, syl, who, rnd);
    if (p % STEP === STEP - 1) yield;
  }
  fade(out, 0.004, 0.25);
  return { rate: RATE, data: normal(out, 0.6 + 0.1 * strength) };
}

// Hands, clapping: each clap a burst of noise ringing in the cupped palms.
export const applause = (seconds, seed, opts) => finish(clapping(seconds, seed, opts));
export function* clapping(seconds, seed = 1, { people = 40, cheer = 0 } = {}) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let p = 0; p < people; p++) {
    const R = resonator(900 + rnd() * 1600, 500 + rnd() * 900);
    const pace = 1 / (3.6 + rnd() * 2.6);
    const amp = 0.3 + rnd() * 0.7;
    let at = rnd() * 0.35;
    // (they stop when they stop, over the last second and a half)
    const stop = seconds - rnd() * Math.min(1.5, seconds * 0.4);
    while (at < stop) {
      const i0 = Math.floor(at * RATE);
      const n = Math.floor(RATE * (0.018 + rnd() * 0.02));
      const k = amp * (0.7 + rnd() * 0.3) * Math.min(1, (stop - at) * 1.2);
      for (let j = 0; j < n && i0 + j < out.length; j++) {
        const env = Math.exp(-j / (RATE * 0.006));
        out[i0 + j] += ring(R, (rnd() * 2 - 1) * env) * k * 3;
      }
      at += pace * (0.92 + rnd() * 0.16);
    }
    if (p % (STEP * 2) === STEP * 2 - 1) yield;
  }
  // a whoop or two
  for (let w = 0; w < cheer; w++) {
    const who = someone(rnd);
    const at = 0.2 + rnd() * Math.max(0.2, seconds - 1.6);
    voice(out, [{ at, dur: 0.7 + rnd() * 0.4, f0: 210 + rnd() * 60, drop: -0.25, vowel: 'u', breath: 0.12, amp: 0.9 }], { ...who, breathy: 0.1 }, rnd);
  }
  fade(out, 0.05, 0.6);
  return { rate: RATE, data: normal(out, 0.7) };
}

// A crowd talking among itself, before the lights go down.
export const murmur = (seconds, seed, people) => finish(murmuring(seconds, seed, people));
export function* murmuring(seconds, seed = 1, people = 16) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let p = 0; p < people; p++) {
    const who = someone(rnd);
    const base = 110 + rnd() * 40;
    const syl = [];
    let at = rnd() * 1.5;
    while (at < seconds - 0.3) {
      // a phrase of a few syllables, then a pause
      const n = 3 + Math.floor(rnd() * 7);
      for (let k = 0; k < n && at < seconds - 0.3; k++) {
        const dur = 0.1 + rnd() * 0.12;
        syl.push({ at, dur, f0: base * (1.1 - (k / n) * 0.2 + rnd() * 0.08), drop: 0.04, vowel: TALK[Math.floor(rnd() * TALK.length)], breath: 0.12, amp: 0.25 + rnd() * 0.3 });
        at += dur * (0.95 + rnd() * 0.2);
      }
      at += 0.3 + rnd() * 1.4;
    }
    voice(out, syl, who, rnd);
    if (p % 2 === 1) yield;
  }
  // muffled by the room: a gentle lowpass, then its end run into its start
  let lp = 0;
  for (let i = 0; i < out.length; i++) out[i] = lp += (out[i] - lp) * 0.3;
  const X = Math.floor(0.8 * RATE);
  for (let i = 0; i < X; i++) {
    const w = i / X;
    out[i] = out[i] * w + out[out.length - X + i] * (1 - w);
  }
  return { rate: RATE, data: normal(out.subarray(0, out.length - X).slice(), 0.5) };
}

// The room calling out suggestions: a dozen voices at once, each a word or two, loud.
export const shout = (seed) => finish(shouting(seed));
export function* shouting(seed = 1) {
  const rnd = mulberry32(seed);
  const seconds = 1.8;
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let p = 0; p < 12; p++) {
    const who = someone(rnd);
    let at = rnd() * 0.5;
    const syl = [];
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const dur = 0.14 + rnd() * 0.16;
      syl.push({ at, dur, f0: 170 + rnd() * 60, drop: k === n - 1 ? 0.25 : 0, vowel: TALK[Math.floor(rnd() * TALK.length)], breath: 0.15, amp: 0.5 + rnd() * 0.5 });
      at += dur;
    }
    voice(out, syl, { ...who, breathy: 0.2 }, rnd);
  }
  fade(out, 0.01, 0.3);
  return { rate: RATE, data: normal(out, 0.7) };
}

// In and out: a ramp over the first `a` seconds and the last `b`.
function fade(out, a, b) {
  const A = Math.floor(a * RATE);
  const B = Math.floor(b * RATE);
  for (let i = 0; i < A && i < out.length; i++) out[i] *= i / A;
  for (let i = 0; i < B && i < out.length; i++) out[out.length - 1 - i] *= i / B;
}
