// The instruments that play our cue (score.js): a low thump, a bass of one
// round wave twice over, pads of saws that scoop into each note and glide
// between chords, a lead, and swishes of noise. All scheduled at the start
// for the whole take; the pads, lead and swishes go to `space` (the reverb)
// as well as `out`.
import { PULSE, BASS, SUB, CHORDS, LEAD, SWISH, beat } from './score.js';
import { random, dB, hz, white, biquad, toBuffer, gain, once } from './dsp.js';

const SCOOP = -1.6;                // semitones each pad voice starts under its note
const SCOOP_TIME = 0.28;           // s to reach it
const GLIDE_TIME = 0.35;           // s for a pad voice to slide to its next note
const PAD_ATTACK = 0.09;           // s
const PAD_DECAY = 1.6;             // s, the time constant of a chord's fade while held
const PAD_SUSTAIN = 0.3;           // where it fades toward, of its peak
const PAD_RELEASE = 0.3;           // s, the time constant it dies away with once let go
const PAD_GAIN = 4;                // dB on every voice's level in the score
const PAD_SPREAD = 0.7;            // how wide the voices are spread across the stereo field
const VIBRATO_HZ = 4.6;            // about this, each voice its own
const VIBRATO_CENTS = 6;           // how deep
const PAD_BRIGHT = 0.85;           // all the score's brightnesses, scaled
const PAD_OPEN = 1.3;              // how much brighter each chord starts, closing to its own in a second
const BASS_PARTIALS = [0, -2, -6, -14, -20, -24, -28, -32];   // dB, the bass wave's partials against its first
// Its two copies: [pan, detune cents, level]. Unequal, so that as they
// drift in and out of phase the bass moves across the middle and never
// cancels itself.
const BASS_COPIES = [[-0.2, -2, 1.4], [0.65, 3, 0.8]];
const SAW = 2 / Math.PI;           // a unit saw's fundamental: the bass's levels are as if it were one
const LEVEL_GLIDE = 0.25;          // s, time constant of the bass's level changes
const SWISH_RISE = 0.22;           // s each swish swells for
const PULSE_ATTACK = 0.006;        // s each thump takes to arrive
const PULSE_DROP = 0.04;           // s its pitch takes to fall to the note
const PULSE_HOLD = 0.07;           // s it holds before it is let go
const PULSE_FALL = 0.05;           // s, the time constant it dies away with
const TICK = -22;                  // dB, the tick of noise on its front, under it
const TICK_FALL = 0.006;           // s, the tick's time constant
const LEAD_PARTIALS = [0.3, 1, 0.75, 0.45, 0.25, 0.15, 0.1, 0.06];   // its partials' amplitudes, first upward
const LEAD_ATTACK = 0.12;          // s
const LEAD_SAG = -4;               // dB the lead sinks by while held
const LEAD_DETUNE = 5;             // cents either side, its two copies
const LEAD_BEND = -1.5;            // semitones it falls by as it is let go

// The pulse: a sine thump falling to its pitch, held a moment, then let go;
// a soft tick of noise on its front.
function pulse(ctx, out, start, noise) {
  const P = PULSE;
  const hit = (t, level) => {
    const t0 = start + t;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(P.from, t0);
    o.frequency.exponentialRampToValueAtTime(P.hz, t0 + PULSE_DROP);
    const g = gain(ctx);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(dB(level), t0 + PULSE_ATTACK);
    g.gain.setValueAtTime(dB(level), t0 + PULSE_HOLD);
    g.gain.setTargetAtTime(0, t0 + PULSE_HOLD, PULSE_FALL);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + PULSE_HOLD + PULSE_FALL * 12);
    const n = ctx.createBufferSource();
    n.buffer = noise;
    const ng = gain(ctx);
    ng.gain.setValueAtTime(dB(level + TICK), t0);
    ng.gain.setTargetAtTime(0, t0, TICK_FALL);
    n.connect(ng).connect(out);
    n.start(t0, (t * 7.3) % 1);
    n.stop(t0 + TICK_FALL * 10);
  };
  for (let k = 0; k < P.beats; k++) {
    if (P.rest.includes(k)) continue;
    const t = beat(k);
    hit(t, P.level);
    if (P.pickup.includes(k)) hit(t - P.pickupBefore, P.level + P.pickupLevel);
  }
}

// The bass: held from the first line to the end, sliding and swelling as
// BASS says: two copies of one round wave a few cents apart, either side
// of the middle, and a sine an octave down where SUB asks for weight. The
// wave's partials fall as the original's bass's do (BASS_PARTIALS): the
// second nearly as strong as the first, the third a little under, then
// little above that, so no filter is needed and none can make them beat.
function bass(ctx, out, start, end) {
  const g = gain(ctx);
  const amps = BASS_PARTIALS.map((d) => dB(d) * SAW);
  const wave = ctx.createPeriodicWave(new Float32Array(amps.length + 1), new Float32Array([0, ...amps]), { disableNormalization: true });
  const oscs = BASS_COPIES.map(([pan, detune, level]) => {
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.detune.value = detune;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(gain(ctx, level)).connect(p).connect(g);
    return o;
  });
  const sub = ctx.createOscillator();
  const subGain = gain(ctx);
  sub.connect(subGain).connect(g);
  // Each pitch-following param, and its ratio to the note.
  const follows = [...oscs.map((o) => [o.frequency, 1]), [sub.frequency, 0.5]];
  for (const [b, note, level, glide] of BASS) {
    const t0 = start + Math.max(0, beat(b));
    const f = hz(note);
    for (const [param, ratio] of follows) {
      if (glide > 0) param.setTargetAtTime(f * ratio, t0, glide / 3);
      else param.setValueAtTime(f * ratio, t0);
    }
    g.gain.setTargetAtTime(dB(level), t0, t0 === start ? 0.05 : LEVEL_GLIDE);
  }
  for (const [b, level] of SUB) subGain.gain.setTargetAtTime(dB(level) * 2 * SAW, start + Math.max(0, beat(b)), 0.15);
  for (const o of [...oscs, sub]) { o.start(start); o.stop(end); }
  g.connect(out);
}

// One pad voice: a saw through a low-pass that opens and settles, scooping
// into its first note, gliding to the next ones, with a slow vibrato of its
// own. (Detuned pairs beat, and their partials flicker; one saw a voice
// keeps them as steady as the original's.)
function padVoice(ctx, out, space, start, at, length, notes, level, bright, pan, rnd) {
  const t0 = start + at;
  const t1 = t0 + length;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.Q.value = 0.7;
  low.frequency.setValueAtTime(bright * PAD_BRIGHT * PAD_OPEN, t0);
  low.frequency.setTargetAtTime(bright * PAD_BRIGHT, t0, 0.6);
  const g = gain(ctx);
  const peak = dB(level + PAD_GAIN);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + PAD_ATTACK);
  g.gain.setTargetAtTime(peak * PAD_SUSTAIN, t0 + PAD_ATTACK, PAD_DECAY);
  g.gain.setTargetAtTime(0, t1, PAD_RELEASE);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(hz(notes[0][1] + SCOOP), t0);
  o.frequency.exponentialRampToValueAtTime(hz(notes[0][1]), t0 + SCOOP_TIME);
  for (let j = 1; j < notes.length; j++) {
    const [after, note] = notes[j];
    o.frequency.setValueAtTime(hz(notes[j - 1][1]), t0 + after);
    o.frequency.exponentialRampToValueAtTime(hz(note), t0 + after + GLIDE_TIME);
  }
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = VIBRATO_HZ * (0.8 + 0.4 * rnd());
  vibrato.connect(gain(ctx, VIBRATO_CENTS)).connect(o.detune);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(low).connect(g).connect(p);
  p.connect(out);
  p.connect(space);
  const end = t1 + PAD_RELEASE * 6;
  o.start(t0);
  o.stop(end);
  vibrato.start(t0 - rnd() * 0.3);
  vibrato.stop(end);
}

function pads(ctx, out, space, start) {
  const rnd = random(606);
  for (const [b, beats, notes, level, bright, glides = []] of CHORDS) {
    const at = beat(b);
    const length = beats * PULSE.period;
    notes.forEach((note, i) => {
      const line = [[0, note], ...glides.map(([after, ns]) => [after, ns[i] ?? note])];
      const pan = notes.length > 1 ? PAD_SPREAD * ((i / (notes.length - 1)) * 2 - 1) * (i % 2 ? -1 : 1) : 0;
      padVoice(ctx, out, space, start, at, length, line, level, bright, pan, rnd);
    });
  }
}

// The lead: a tone whose second partial leads (its fundamental weak),
// scooping up into its note and falling away from it as it is let go.
function lead(ctx, out, space, start) {
  const real = new Float32Array([0, ...LEAD_PARTIALS]);
  const wave = ctx.createPeriodicWave(real, new Float32Array(real.length));
  for (const [b, beats, note, level, scoop] of LEAD) {
    const t0 = start + beat(b);
    const t1 = t0 + beats * PULSE.period;
    const g = gain(ctx);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(dB(level), t0 + LEAD_ATTACK);
    g.gain.setTargetAtTime(dB(level + LEAD_SAG), t0 + LEAD_ATTACK, 1.2);
    g.gain.setTargetAtTime(0, t1, 0.15);
    for (const side of [-1, 1]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.detune.value = side * LEAD_DETUNE;
      o.frequency.setValueAtTime(hz(note + scoop), t0);
      o.frequency.exponentialRampToValueAtTime(hz(note), t0 + SCOOP_TIME);
      o.frequency.setValueAtTime(hz(note), t1 - 0.2);
      o.frequency.exponentialRampToValueAtTime(hz(note + LEAD_BEND), t1 + 0.2);
      o.connect(g);
      o.start(t0);
      o.stop(t1 + 0.6);
    }
    g.connect(out);
    g.connect(space);
  }
}

// The swishes: high noise swelling into each half-beat, cut on it.
function swishes(ctx, out, space, start, noise) {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  hp.connect(out);
  hp.connect(space);
  for (let k = SWISH.from; k < SWISH.to; k++) {
    const t = beat(k + 0.5);
    const t0 = start + t;
    const n = ctx.createBufferSource();
    n.buffer = noise;
    const g = gain(ctx);
    // From 40 dB under (an exponential ramp cannot start from nothing).
    g.gain.setValueAtTime(dB(SWISH.level - 40), t0 - SWISH_RISE);
    g.gain.exponentialRampToValueAtTime(dB(SWISH.level), t0);
    g.gain.setTargetAtTime(0, t0, 0.03);
    n.connect(g).connect(hp);
    n.start(t0 - SWISH_RISE, (t * 3.1) % 1);
    n.stop(t0 + 0.3);
  }
}

// Two seconds of noise above 200 Hz, for the thumps' ticks and the swishes.
const noiseOf = (sr) => once('music-noise', sr, () => toBuffer(sr, [biquad(white(sr * 2, random(505)), sr, 'high', 200)]));

// Make every buffer the cue needs at `sampleRate`, ahead of scheduling it.
export const prepareMusic = (sampleRate) => noiseOf(sampleRate);

export function music(ctx, out, space, start, end) {
  const noise = noiseOf(ctx.sampleRate);
  pulse(ctx, out, start, noise);
  bass(ctx, out, start, end);
  pads(ctx, out, space, start);
  lead(ctx, out, space, start);
  swishes(ctx, out, space, start, noise);
}
