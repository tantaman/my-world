// The sounds, each made from oscillators and noise (PLAN.md 5.16; no files,
// and none of the original's music). Each maker wires itself into `out`
// and returns { update(t, listener) } for what follows the picture.
//
// Read from the original's spectrogram: rain is quiet (its band is the
// weakest), low rumbles after each strike, the car's rush peaking at 21 s,
// a tone sliding up as the cow goes up, everything cut off at the end. The
// music under it here is our own drone.
import { T } from '../timeline.js';

// A buffer of white noise, `seconds` long.
export function noiseBuffer(ctx, seconds = 2) {
  const b = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return b;
}

function loopNoise(ctx, buffer) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.start();
  return s;
}

// Rain: filtered noise, a harder patter when under the canopy.
export function rain(ctx, out, noise) {
  const src = loopNoise(ctx, noise);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  src.connect(hp).connect(lp).connect(g).connect(out);
  // The patter on the canopy: noise through a resonant band, gated by a
  // fast random wobble.
  const p = loopNoise(ctx, noise);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 0.7;
  const pg = ctx.createGain();
  pg.gain.value = 0;
  p.connect(bp).connect(pg).connect(out);
  return {
    update(t, { underCanopy }) {
      pg.gain.setTargetAtTime(underCanopy ? 0.07 : 0, ctx.currentTime, 0.3);
    },
  };
}

// Thunder after each strike, a noise burst through a falling low-pass with a
// long tail. `at` is the strike's time on the take's clock, `delay` its
// distance over the speed of sound.
export function thunder(ctx, out, noise, start, at, delay, loud = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  const g = ctx.createGain();
  const t0 = start + at + delay;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.55 * loud, t0 + 0.08);
  g.gain.setTargetAtTime(0.25 * loud, t0 + 0.1, 0.4);
  g.gain.setTargetAtTime(0.0, t0 + 1.2, 1.3);
  lp.frequency.setValueAtTime(1800, t0);
  lp.frequency.exponentialRampToValueAtTime(90, t0 + 2.5);
  s.connect(lp).connect(g).connect(out);
  s.start(t0);
  s.stop(t0 + 9);
}

// The car: a rush of noise and a low sawtooth, panned by its bearing, its
// pitch falling as it passes.
export function car(ctx, out, noise) {
  const n = loopNoise(ctx, noise);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 600;
  bp.Q.value = 0.5;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = 55;
  const sawLp = ctx.createBiquadFilter();
  sawLp.type = 'lowpass';
  sawLp.frequency.value = 220;
  const g = ctx.createGain();
  g.gain.value = 0;
  const pan = ctx.createStereoPanner();
  n.connect(bp).connect(g);
  saw.connect(sawLp).connect(g);
  g.connect(pan).connect(out);
  saw.start();
  return {
    // rel: the car relative to the listener (metres, x right, z ahead); approach: m/s toward
    update(t, { car: c }) {
      if (!c) { g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); return; }
      const d = Math.hypot(c.x, c.z) + 2;
      const loud = Math.min(1, 40 / (d * d)) * 0.9;
      const doppler = 343 / (343 - c.approach);
      g.gain.setTargetAtTime(loud, ctx.currentTime, 0.05);
      saw.frequency.setTargetAtTime(52 * doppler, ctx.currentTime, 0.05);
      bp.frequency.setTargetAtTime(650 * doppler, ctx.currentTime, 0.05);
      pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, c.x / (Math.abs(c.z) + 4))), ctx.currentTime, 0.05);
    },
  };
}

// The saucer: two detuned tones with a slow tremor, pitch following its
// speed; the beam a rising sweep; the lift a tone sliding up.
export function saucer(ctx, out, start) {
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = 'sine';
  b.type = 'triangle';
  a.frequency.value = 96;
  b.frequency.value = 97.3;
  const trem = ctx.createOscillator();
  trem.frequency.value = 5.5;
  const tremGain = ctx.createGain();
  tremGain.gain.value = 0.3;
  const g = ctx.createGain();
  g.gain.value = 0;
  const tg = ctx.createGain();
  tg.gain.value = 0.7;
  trem.connect(tremGain).connect(tg.gain);
  a.connect(tg);
  b.connect(tg);
  tg.connect(g).connect(out);
  a.start(); b.start(); trem.start();
  // The beam's hum, and the tone that rises with the cow.
  const hum = ctx.createOscillator();
  hum.type = 'sawtooth';
  const humLp = ctx.createBiquadFilter();
  humLp.type = 'lowpass';
  humLp.frequency.value = 900;
  const hg = ctx.createGain();
  hg.gain.value = 0;
  hum.connect(humLp).connect(hg).connect(out);
  const t0 = start + T.beamStart;
  hum.frequency.setValueAtTime(140, start);
  hum.frequency.setValueAtTime(140, t0);
  hum.frequency.exponentialRampToValueAtTime(220, t0 + 0.7);
  hum.frequency.setValueAtTime(220, start + T.liftStart + 1.4);
  hum.frequency.exponentialRampToValueAtTime(660, start + T.liftEnd - 0.6);
  hum.frequency.exponentialRampToValueAtTime(180, start + T.beamOff);
  hg.gain.setValueAtTime(0, t0);
  hg.gain.linearRampToValueAtTime(0.06, t0 + 0.6);
  hg.gain.setValueAtTime(0.06, start + T.liftEnd - 0.4);
  hg.gain.linearRampToValueAtTime(0.0, start + T.beamOff);
  hum.start();
  return {
    update(t, { ufo }) {
      if (!ufo) { g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); return; }
      const loud = Math.min(1, 220 / (ufo.distance * ufo.distance)) * 0.35;
      g.gain.setTargetAtTime(loud, ctx.currentTime, 0.1);
      const f = 96 + ufo.speed * 2.2;
      a.frequency.setTargetAtTime(f, ctx.currentTime, 0.1);
      b.frequency.setTargetAtTime(f * 1.013, ctx.currentTime, 0.1);
    },
  };
}

// Our own drone: a low fifth that swells slowly, and from 9.7 s chords of
// sine stacks coming and going in phrases.
export function drone(ctx, out, start) {
  const g = ctx.createGain();
  g.gain.value = 0.0;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(0.06, start + 3);
  g.connect(out);
  for (const [f, type] of [[55, 'sine'], [82.4, 'sine'], [110.2, 'triangle']]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 6.5 + f * 0.0002;
    const lg = ctx.createGain();
    lg.gain.value = 0.35;
    lfo.connect(lg).connect(swell.gain);
    o.connect(swell).connect(g);
    o.start(); lfo.start();
  }
  // Chords: [start s, length s, frequencies].
  const CHORDS = [
    [9.7, 7, [220, 261.6, 329.6]], [17.5, 6, [196, 246.9, 293.7]], [24.5, 7, [174.6, 220, 261.6]],
    [32, 8, [164.8, 207.7, 246.9]], [42.5, 7, [220, 277.2, 329.6]], [50.5, 9, [233.1, 277.2, 349.2]],
    [60, 9, [207.7, 261.6, 311.1]],
  ];
  for (const [at, len, notes] of CHORDS) {
    const cg = ctx.createGain();
    const t0 = start + at;
    cg.gain.setValueAtTime(0, t0);
    cg.gain.linearRampToValueAtTime(0.025, t0 + len * 0.35);
    cg.gain.linearRampToValueAtTime(0, t0 + len);
    cg.connect(out);
    for (const f of notes) {
      for (const detune of [-4, 4]) {
        const o = ctx.createOscillator();
        o.frequency.value = f * 2;
        o.detune.value = detune;
        o.connect(cg);
        o.start(t0);
        o.stop(t0 + len + 0.1);
      }
    }
  }
}

// The signal lost: bursts of crushed noise, then nothing.
export function glitch(ctx, out, noise, start) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) curve[i] = Math.round(((i / 255) * 2 - 1) * 3) / 3;
  shaper.curve = curve;
  const g = ctx.createGain();
  g.gain.value = 0;
  const [a, b] = T.glitch;
  for (let x = a; x < b; x += 0.05) {
    g.gain.setValueAtTime(Math.random() < 0.6 ? 0.12 : 0, start + x);
  }
  g.gain.setValueAtTime(0, start + b);
  s.connect(shaper).connect(g).connect(out);
  s.start(start + a);
  s.stop(start + b + 0.1);
}
