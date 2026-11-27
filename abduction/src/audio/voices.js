// The sounds of the place (PLAN.md 5.16): the rain, the thunder, the car,
// the saucer. Each is scheduled for the whole take when the sound starts,
// from t and from where the listener is (hearing.js), into `out` (the
// effects bus) and `space` (the reverb's send). No files: everything is
// noise and oscillators, filtered, enveloped and placed.
//
// What they are matched to, measured from the original with
// tools/sound.py (levels are dBFS of the mid channel; "per bin" is power in
// one bin of a 4096-point Hann STFT at 48 kHz):
//
// - The rain is a steady, almost mono bed (left and right correlate 0.99
//   above 4 kHz), falling about 5 dB an octave from 1 kHz to 8 kHz and
//   faster above (-72, -75, -80, -85, -91 dB per bin at 1, 2, 4, 8, 12
//   kHz), its level drifting 3 dB over the take: quietest at the start and
//   at the shop window, loudest out in the open. Over it, drops: bursts of
//   noise 3-5 ms long, flat from 300 Hz to 12 kHz, 10-20 dB over the bed,
//   a few a second, often splashing again 10-30 ms later.
// - Thunder is barely there: nothing over the music after strike 1, at most
//   a low swell after strike 2. Ours is a distant rumble, kept under it.
// - The car is tyre noise on a wet road, broadband, peaking at 21.2 s +19
//   dB over the bed below 1.5 kHz and +12 dB above 8 kHz, heard from the
//   right (left 8-12 dB under right at its peak), its highs over in 1.2 s,
//   its body in 2.8; its level falls as the square of its distance. It is
//   loudest 0.9 s after it passes nearest in the picture, so its level
//   follows the car's distance that long before.
// - The saucer: a falling whistle as it comes in and slows (1.4 kHz at 49.2
//   s to 350 Hz at 52.2, echoing, a faint whine at four times it); a bright
//   glitter diving through 1.5-4 kHz and a rising whoop (255 to 380 Hz,
//   partials to 4 kHz) as the cow goes up, 56.2-57.4 s, then a close
//   shimmer at 350-480 Hz; a rising whistle as it leaves (180 to 520 Hz,
//   61.1-63.6 s, fading). Under the beam, a deep drone. Ours adds what the
//   original's music covers: a hum of beating partials while it is near,
//   swaying with its bob, and the beam's high singing.
import { T } from '../timeline.js';
import { BOLTS } from '../weather/lightning.js';
import { EYE } from '../set/layout.js';
import {
  random, dB, pink, brown, white, onePoleLow, onePoleHigh, biquad, seamless, rms, toBuffer, loop, follow, lookup, gain, once,
} from './dsp.js';
import { carFrom, carDoppler, saucerFrom, shelter, delayOf } from './hearing.js';

const _a = {};                           // scratch for hearing.js's answers

// ---------------------------------------------------------------- rain

const RAIN_LOOP = 2 ** 19;               // samples in the bed's loop (10.9 s at 48 kHz)
const RAIN_BED = -50;                    // dB rms of the bed in the open
const RAIN_WIDTH = 0.12;                 // the bed's decorrelated part, to its mono part
const RAIN_LOW_HZ = 480;                 // Hz, the middle of the bed's lower body
// The bed's level against t (dB from RAIN_BED), as measured: quieter at the
// start, at the shop window and while the beam is on, going ahead of the
// rest at the end.
const RAIN_LEVEL = [
  [0, -2.5], [9, -2], [13, -0.5], [25, 0], [27, -2.5], [31, -2], [34, -1.5], [40, -1], [41.5, 0],
  [52.5, 0], [53.5, -2], [58.5, -2], [60, -1], [69.8, -1], [70.5, -3], [71, -5],
];
const DROPS_LOOP = 13.7;                 // s, the drops' loop (not a multiple of the bed's)
// Drops, as the original's measure: a burst of noise a few milliseconds
// long, flat from 300 Hz to 12 kHz, often splashing again 10-30 ms later.
// [a second, loudest peak dB, range of peaks dB, decay s (shortest, longest),
//  brightest and dullest low-pass Hz]
const PATTER = [70, -50, 18, [0.0003, 0.001], [14000, 5000]];      // fine, far, the bed's grain
const NEAR = [5.5, -31, 14, [0.0012, 0.003], [14000, 2500]];       // near drops, ticks
const DULL = [1.2, -36, 8, [0.002, 0.005], [2200, 900]];           // onto something soft
const SPLASH = [0.6, [0.008, 0.03], [-4, -11]];                    // chance of a second burst, after s, dB
const DRIPS = [1.4, -38, 8, [0.002, 0.006], [5000, 1500]];         // off the canopy's edge, under it

// One drop into d at `at`: noise under an exponential decay, through a
// one-pole low-pass (its brightness), maybe with a splash after it.
function drop(d, at, amp, tau, corner, sr, rnd, splash = true) {
  const n = Math.min(d.length - at, Math.floor(tau * 7 * sr));
  const a = 1 - Math.exp((-2 * Math.PI * corner) / sr);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += a * ((rnd() * 2 - 1) - y);
    d[at + i] += y * amp * Math.exp(-i / (tau * sr)) * Math.min(1, i / 3);
  }
  if (splash && rnd() < SPLASH[0]) {
    const after = Math.floor((SPLASH[1][0] + rnd() * (SPLASH[1][1] - SPLASH[1][0])) * sr);
    if (at + after < d.length) drop(d, at + after, amp * dB(SPLASH[2][0] + rnd() * (SPLASH[2][1] - SPLASH[2][0])), tau * 0.7, corner, sr, rnd, false);
  }
}

// `rate` drops a second of one kind over a loop of n samples, their tails wrapped to the head.
function scatter(n, sr, [rate, top, range, [tau0, tau1], [bright, dull]], rnd) {
  const pad = Math.floor(0.25 * sr);
  const d = new Float32Array(n + pad);
  const count = Math.round((rate * n) / sr);
  for (let k = 0; k < count; k++) {
    // Louder drops are rarer: peaks spread evenly in dB, so most are quiet.
    const amp = dB(top - range * Math.sqrt(rnd())) * 2.5;
    const tau = tau0 + (tau1 - tau0) * rnd();
    drop(d, Math.floor(rnd() * n), amp, tau, dull + (bright - dull) * rnd(), sr, rnd);
  }
  for (let i = 0; i < pad; i++) d[i] += d[n + i];
  return d.subarray(0, n);
}

// The rain's loops: the bed, the drops over it, the drips under the canopy.
function rainSounds(sr) {
  const rnd = random(101);
  // The bed: pink, a gentle roll-off from 7.5 kHz, steeper past 13, no rumble.
  const fade = Math.floor(0.2 * sr);
  const shape = (d) => {
    onePoleLow(d, sr, 7500);
    biquad(d, sr, 'low', 13000, 0.6);
    biquad(d, sr, 'low', 15000, 0.6);
    onePoleHigh(d, sr, 150);
    return seamless(d, fade);
  };
  const mono = shape(pink(RAIN_LOOP + fade, rnd));
  // Water running and splashing near the feet: as much again from 250 Hz to 1 kHz.
  const splash = biquad(pink(RAIN_LOOP + fade, rnd), sr, 'band', RAIN_LOW_HZ, 0.6);
  for (let i = 0; i < mono.length; i++) mono[i] += splash[i];
  const sides = [shape(pink(RAIN_LOOP + fade, rnd)), shape(pink(RAIN_LOOP + fade, rnd))];
  const norm = 1 / rms(mono);
  const bed = toBuffer(sr, sides.map((s) => {
    const c = new Float32Array(RAIN_LOOP);
    for (let i = 0; i < RAIN_LOOP; i++) c[i] = (mono[i] + RAIN_WIDTH * s[i]) * norm;
    return c;
  }));

  // The drops: the fine patter a little apart in the two ears, the near
  // ones in the middle, all clear of rumble.
  const n = Math.floor(DROPS_LOOP * sr);
  const patter = [scatter(n, sr, PATTER, rnd), scatter(n, sr, PATTER, rnd)];
  const near = scatter(n, sr, NEAR, rnd);
  const dull = scatter(n, sr, DULL, rnd);
  const drops = toBuffer(sr, patter.map((p) => {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = p[i] + near[i] + dull[i];
    return onePoleHigh(c, sr, 300);
  }));
  const drips = toBuffer(sr, [onePoleHigh(scatter(Math.floor(9.3 * sr), sr, DRIPS, rnd), sr, 300)]);
  return { bed, drops, drips };
}

export function rain(ctx, out, space, start) {
  const { bed, drops, drips } = once('rain', ctx.sampleRate, () => rainSounds(ctx.sampleRate));
  const level = gain(ctx);
  follow(level.gain, start, 0, T.black + 1, (t) => dB(RAIN_BED + lookup(t, RAIN_LEVEL)), 10);
  loop(ctx, bed, start).connect(level);
  const dropGain = gain(ctx, 1 / dB(RAIN_BED));   // the drops follow the bed's drift
  loop(ctx, drops, start, 3.1).connect(dropGain).connect(level);
  level.connect(out);
  // Under the canopy: drips off its edge, with a little room round them.
  const under = gain(ctx);
  follow(under.gain, start, 0, T.black + 1, (t) => shelter(t), 10);
  loop(ctx, drips, start, 1.7).connect(under);
  under.connect(out);
  under.connect(space);
}

// ---------------------------------------------------------------- thunder

const THUNDER = [-50, -47];              // dB rms at its loudest, for each bolt (weather/lightning.js)
const THUNDER_LOW = 140;                 // Hz, the rumble's corner
const THUNDER_ROLL = [0.35, 4.5];        // s to swell, s to die away
const THUNDER_LENGTH = 7;                // s of rumble made, enough for a roll from anywhere in its first 1.5 s

// The rumble: brown noise under THUNDER_LOW, the right ear's reversed so the two differ.
function rumble(sr) {
  const d = brown(Math.floor(THUNDER_LENGTH * sr), random(202));
  biquad(d, sr, 'low', THUNDER_LOW, 0.7);
  onePoleHigh(d, sr, 25);
  const norm = 1 / rms(d);
  for (let i = 0; i < d.length; i++) d[i] *= norm;
  return toBuffer(sr, [d, d.slice().reverse()]);
}

export function thunder(ctx, out, start) {
  const buffer = once('rumble', ctx.sampleRate, () => rumble(ctx.sampleRate));
  const rnd = random(203);
  BOLTS.forEach((bolt, k) => {
    const t0 = start + bolt.strike + delayOf(bolt.distance);
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    const g = gain(ctx);
    // Swells, then rolls away in a few uneven waves.
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(dB(THUNDER[k]), t0 + THUNDER_ROLL[0]);
    for (let w = 1; w < 6; w++) {
      const tw = t0 + THUNDER_ROLL[0] + (w * THUNDER_ROLL[1]) / 6;
      g.gain.linearRampToValueAtTime(dB(THUNDER[k] - 4 * w - 3 * rnd()), tw);
    }
    g.gain.linearRampToValueAtTime(0, t0 + THUNDER_ROLL[0] + THUNDER_ROLL[1]);
    s.connect(g).connect(out);
    s.start(t0, rnd() * 1.5);
    s.stop(t0 + THUNDER_ROLL[0] + THUNDER_ROLL[1] + 0.1);
  });
}

// ---------------------------------------------------------------- car

const CAR_LAG = 0.9;                     // s its level trails the picture's pass (see the top)
const CAR_SPAN = [16.5, 25.5];           // s it is heard
const CAR_NEAR = 10.5;                   // m, nearest it comes
const CAR_ROAD = -31;                    // dB, its road noise at CAR_NEAR
const CAR_AIR = 5000;                    // Hz, the road noise's low-pass at CAR_NEAR, closing with distance
const ROAD_FALL = 2;                     // its level falls as distance to this power (as the original's does)
const CAR_SPRAY = -48;                   // dB, the hiss of spray at CAR_NEAR
const CAR_ENGINE = -44;                  // dB, the engine at CAR_NEAR
const ENGINE_FALL = 1.3;                 // its level falls as distance to this power
const ENGINE_LOW = 260;                  // Hz, the low-pass over its saws
const AIR_FALL = 1.2;                    // the road noise's low-pass closes as distance to this power
const CAR_FADE = 1.5;                    // s it fades in and out over at the ends of CAR_SPAN
const CAR_FIRING = 47;                   // Hz, the engine's firing (a four at 1400 rpm)
const SPRAY_FALL = 3.5;                  // the spray's level falls as distance to this power (it is close and directional)
const CAR_PAN_LAG = 0.45;                // s its bearing trails the picture's (half its level's lag)
const CAR_PAN = 0.72;                    // how far left or right a mono body-worn microphone hears it
const WET_ROAD = 0.65;                   // the wet road's reflection, its comb in the highs
const TYRE_HEIGHT = 0.4;                 // m, where the road noise comes from

// The car's two noises, as loops: tyres on the wet road (most of it from
// 160 Hz to a few kHz), and the hiss of its spray (above 5 kHz).
function carSounds(sr) {
  const rnd = random(303);
  const len = 6;
  const fade = Math.floor(0.2 * sr);
  const road = seamless(pink(Math.floor(len * sr) + fade, rnd), fade);
  onePoleLow(road, sr, 1300);
  onePoleLow(road, sr, 4000);
  biquad(road, sr, 'high', 160, 0.7);
  const spray = seamless(white(Math.floor(len * sr) + fade, rnd), fade);
  biquad(spray, sr, 'high', 5000, 0.6);
  for (const d of [road, spray]) { const k = 1 / rms(d); for (let i = 0; i < d.length; i++) d[i] *= k; }
  return { roadBuf: toBuffer(sr, [road]), sprayBuf: toBuffer(sr, [spray]) };
}

export function car(ctx, out, start) {
  const { roadBuf, sprayBuf } = once('car', ctx.sampleRate, () => carSounds(ctx.sampleRate));

  const [a, b] = CAR_SPAN;
  const heard = (t) => carFrom(t - CAR_LAG, _a).distance;
  // Road noise, darker with distance (air, and the spray's own screening).
  const air = ctx.createBiquadFilter();
  air.type = 'lowpass';
  air.Q.value = 0.5;
  follow(air.frequency, start, a, b, (t) => Math.min(16000, CAR_AIR * Math.pow(CAR_NEAR / heard(t), AIR_FALL)));
  const roadGain = gain(ctx);
  follow(roadGain.gain, start, a, b, (t) => {
    const fadeIn = Math.min(1, (t - a) / CAR_FADE) * Math.min(1, (b - t) / CAR_FADE);
    return dB(CAR_ROAD) * Math.pow(CAR_NEAR / heard(t), ROAD_FALL) * fadeIn;
  });
  loop(ctx, roadBuf, start + a).connect(air).connect(roadGain);
  const sprayGain = gain(ctx);
  follow(sprayGain.gain, start, a, b, (t) => dB(CAR_SPRAY) * Math.pow(CAR_NEAR / heard(t), SPRAY_FALL));
  loop(ctx, sprayBuf, start + a, 2).connect(sprayGain);
  // The engine: firing and its second harmonic, a little rough, shifted by Doppler.
  const engine = gain(ctx);
  follow(engine.gain, start, a, b, (t) => dB(CAR_ENGINE) * Math.pow(CAR_NEAR / heard(t), ENGINE_FALL));
  const engineLow = ctx.createBiquadFilter();
  engineLow.type = 'lowpass';
  engineLow.frequency.value = ENGINE_LOW;
  engineLow.connect(engine);
  for (const [h, detune] of [[1, 0], [2, 9]]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = detune;
    follow(o.frequency, start, a, b, (t) => CAR_FIRING * h * carDoppler(t - CAR_LAG));
    o.connect(engineLow);
    o.start(start + a);
    o.stop(start + b);
  }
  // All three, then the wet road's reflection: the same sound a fraction of a
  // millisecond later, which combs the highs, its notches sweeping as it comes.
  const body = ctx.createGain();
  roadGain.connect(body);
  sprayGain.connect(body);
  engine.connect(body);
  const reflected = ctx.createDelay(0.01);
  follow(reflected.delayTime, start, a, b, (t) => {
    const d = carFrom(t - CAR_LAG, _a).ground;
    return delayOf(Math.hypot(d, EYE + TYRE_HEIGHT) - Math.hypot(d, EYE - TYRE_HEIGHT));
  });
  const reflection = ctx.createGain();
  reflection.gain.value = WET_ROAD;
  body.connect(reflected).connect(reflection);
  const pan = ctx.createStereoPanner();
  follow(pan.pan, start, a, b, (t) => CAR_PAN * Math.sin(carFrom(t - CAR_PAN_LAG, _a).azimuth));
  body.connect(pan);
  reflection.connect(pan);
  pan.connect(out);
}

// ---------------------------------------------------------------- saucer

// The falling whistle as it comes in: [t, Hz, dB], its pitch interpolated
// in octaves; louder as it nears and slows, its fourth partial a whine.
const ARRIVE = [
  [48.9, 1520, -70], [49.2, 1400, -60], [49.9, 1060, -54], [50.5, 700, -49], [51.0, 550, -46],
  [51.5, 465, -47], [52.2, 350, -51], [52.7, 300, -70],
];
const WHINE = -14;                       // dB, the fourth partial under the first
const ECHO = 0.42;                       // s between the whistles' echoes
const ECHO_FEEDBACK = 0.32;              // each echo, to the one before
const ECHO_LOW = 2800;                   // Hz, each echo darker than the last
const WHISTLE_WAVER = [0.004, 5.2];      // the whistles' vibrato: depth (of the pitch), Hz
const HUM = -52;                         // dB at HUM_NEAR or nearer
const HUM_NEAR = 15;                     // m
const HUM_LOW = 420;                     // Hz, the low-pass over its partials
// The hum's partials, each a pair this far apart: [Hz, beat Hz]. A tritone
// off the score's E, so it never settles into the music.
const HUM_PARTIALS = [[57.6, 0.65], [115.6, 1.45], [174.1, 2.3], [233.5, 3.1]];
const BOB = 0.45;                        // Hz, the hover's bob (ufo/flight.js)
const DRONE = [-34, -41];                // dB, the beam's drone and its octave
const DRONE_HZ = 41.2;                   // its pitch (the score's E1)
const DRONE_OUT = [56.0, 56.9];          // s it fades over, as the whoop comes
const LIFT = [56.55, 57.38];             // s, the whoop as the cow goes up
const LIFT_HZ = [255, 378];              // where it rises from and to, eased, over LIFT_RISE
const LIFT_RISE = 0.72;                  // s
const LIFT_HOOK = [57.27, -2];           // when it hooks down, and by how many semitones before the cut
const LIFT_LEVEL = -27;                  // dB
const LIFT_LOW = [3000, 0.9];            // Hz, Q: the low-pass that keeps its partials to about 4 kHz
// The beam's singing: [Hz, dB], each wavering by SING_WAVER of its pitch.
const SING = [[1180, -54], [1470, -56], [2210, -56], [2760, -58], [3610, -60]];
const SING_WAVER = 0.003;
const GLITTER = [55.95, 57.0];           // s, the falling glitter before the whoop
const GLITTER_HZ = [118, 88];            // its dive
const GLITTER_LEVEL = -27;               // dB, through its band
const GLITTER_BAND = [2300, 1.4];        // Hz, Q: the band its upper partials are heard through
const SHIMMER = [57.36, 58.9];           // s, the shimmer after it
const SHIMMER_LEVEL = -40;               // dB a partial
// The rising whistle as it goes: [t, Hz, dB], fast at first, fading as it rises.
const LEAVE = [
  [60.9, 172, -70], [61.1, 176, -45], [61.2, 182, -42], [61.5, 268, -42], [61.9, 316, -45],
  [62.4, 363, -52], [62.8, 416, -56], [63.5, 516, -61], [63.9, 560, -75],
];

export function saucer(ctx, out, space, start) {
  // An echo the whistles go through: a delay feeding back through a low-pass.
  const echoIn = ctx.createGain();
  const echo = ctx.createDelay(1);
  echo.delayTime.value = ECHO;
  const echoBack = ctx.createGain();
  echoBack.gain.value = ECHO_FEEDBACK;
  const echoLow = ctx.createBiquadFilter();
  echoLow.type = 'lowpass';
  echoLow.frequency.value = ECHO_LOW;
  echoIn.connect(echo).connect(echoLow).connect(echoBack).connect(echo);
  echoLow.connect(out);
  echoLow.connect(space);

  // Coming in: a falling whistle, its fourth partial a faint whine above it.
  {
    const a = ARRIVE[0][0];
    const b = ARRIVE[ARRIVE.length - 1][0];
    const pitch = (t) => Math.pow(2, lookup(t, ARRIVE.map(([k, f]) => [k, Math.log2(f)])));
    const g = gain(ctx);
    follow(g.gain, start, a, b, (t) => dB(lookup(t, ARRIVE.map(([k, , l]) => [k, l]))));
    for (const [h, level, type] of [[1, 0, 'triangle'], [4, WHINE, 'sine']]) {
      const o = ctx.createOscillator();
      o.type = type;
      follow(o.frequency, start, a, b, (t) => pitch(t) * h * (1 + WHISTLE_WAVER[0] * Math.sin(t * 2 * Math.PI * WHISTLE_WAVER[1])));
      const og = gain(ctx);
      og.gain.value = dB(level);
      o.connect(og).connect(g);
      o.start(start + a);
      o.stop(start + b + 0.05);
    }
    g.connect(out);
    g.connect(echoIn);
  }

  // The hum while it is near: pairs of partials a beat apart, swelling with
  // the bob, louder the nearer it is.
  {
    const a = T.ufoArrive;
    const b = T.ufoGone;
    const hum = gain(ctx);
    follow(hum.gain, start, a, b, (t) => {
      const s = saucerFrom(t, _a);
      if (!s.visible) return 0;
      const near = Math.min(1, HUM_NEAR / Math.max(1, s.distance));
      return dB(HUM) * near * (0.75 + 0.25 * Math.sin(t * 2 * Math.PI * BOB));
    }, 30);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = HUM_LOW;
    low.connect(hum);
    HUM_PARTIALS.forEach(([f, beat], k) => {
      for (const side of [-1, 1]) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? 'triangle' : 'sine';
        o.frequency.value = f + (side * beat) / 2;
        const p = ctx.createStereoPanner();
        p.pan.value = side * 0.35;
        const g = gain(ctx);
        g.gain.value = dB(-4 * k);
        o.connect(g).connect(p).connect(low);
        o.start(start + a);
        o.stop(start + b);
      }
    });
    hum.connect(out);
  }

  // The beam's drone: a deep tone and its octave, from the ring lighting to
  // the cow halfway up.
  {
    const g = gain(ctx);
    const t0 = start + T.ringOn;
    g.gain.setValueAtTime(0, t0 - 0.2);
    g.gain.linearRampToValueAtTime(1, T.beamGround + start);
    g.gain.setValueAtTime(1, start + DRONE_OUT[0]);
    g.gain.linearRampToValueAtTime(0, start + DRONE_OUT[1]);
    DRONE.forEach((level, k) => {
      const o = ctx.createOscillator();
      o.type = k === 0 ? 'sine' : 'triangle';
      o.frequency.value = DRONE_HZ * (k + 1);
      const og = gain(ctx);
      og.gain.value = dB(level);
      o.connect(og).connect(g);
      o.start(t0 - 0.2);
      o.stop(start + DRONE_OUT[1] + 0.1);
    });
    g.connect(out);
  }

  // The beam's singing: a few high partials, not in tune with each other,
  // each wavering slowly, while the beam is down.
  {
    const g = gain(ctx);
    g.gain.setValueAtTime(0, start + T.beamStart);
    g.gain.linearRampToValueAtTime(1, start + T.beamGround);
    g.gain.setValueAtTime(1, start + T.beamUp);
    g.gain.linearRampToValueAtTime(0, start + T.beamOff);
    SING.forEach(([f, level], k) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const wave = ctx.createOscillator();
      wave.frequency.value = 0.3 + 0.17 * k;
      const depth = gain(ctx, f * SING_WAVER);
      wave.connect(depth).connect(o.frequency);
      const p = ctx.createStereoPanner();
      p.pan.value = ((k % 3) - 1) * 0.4;
      o.connect(gain(ctx, dB(level))).connect(p).connect(g);
      for (const n of [o, wave]) { n.start(start + T.beamStart); n.stop(start + T.beamOff + 0.1); }
    });
    g.connect(out);
    g.connect(space);
  }

  // Before the whoop, a glitter falling through it: a buzzing tone diving,
  // heard only in its upper partials.
  {
    const [a, b] = GLITTER;
    const g = gain(ctx);
    g.gain.setValueAtTime(0, start + a);
    g.gain.linearRampToValueAtTime(dB(GLITTER_LEVEL), start + a + 0.15);
    g.gain.setValueAtTime(dB(GLITTER_LEVEL), start + b - 0.3);
    g.gain.linearRampToValueAtTime(0, start + b);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    [band.frequency.value, band.Q.value] = GLITTER_BAND;
    band.connect(g);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(GLITTER_HZ[0], start + a);
    o.frequency.exponentialRampToValueAtTime(GLITTER_HZ[1], start + b);
    o.connect(band);
    o.start(start + a);
    o.stop(start + b + 0.02);
    g.connect(out);
    g.connect(space);
  }

  // The whoop as the cow goes up: bright, rising into a hook and cut.
  {
    const [a, b] = LIFT;
    const [from, to] = LIFT_HZ;
    const [hookAt, hookBy] = LIFT_HOOK;
    const rise = (t) => {
      const k = Math.min(1, Math.max(0, (t - a) / LIFT_RISE));
      const s = k * k * (3 - 2 * k);
      const hook = t > hookAt ? (t - hookAt) / (b - hookAt) : 0;
      return from * Math.pow(to / from, s) * Math.pow(2, (hookBy * hook * hook) / 12);
    };
    const g = gain(ctx);
    g.gain.setValueAtTime(0, start + a);
    g.gain.linearRampToValueAtTime(dB(LIFT_LEVEL - 8), start + a + 0.25);
    g.gain.linearRampToValueAtTime(dB(LIFT_LEVEL), start + hookAt);
    g.gain.setValueAtTime(dB(LIFT_LEVEL), start + b - 0.03);
    g.gain.linearRampToValueAtTime(0, start + b);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    [tone.frequency.value, tone.Q.value] = LIFT_LOW;
    tone.connect(g);
    for (const detune of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = detune;
      follow(o.frequency, start, a, b + 0.02, rise, 200);
      o.connect(tone);
      o.start(start + a);
      o.stop(start + b + 0.03);
    }
    g.connect(out);
    g.connect(space);
  }

  // The shimmer after it: a close cluster that trembles and dies.
  {
    const [a, b] = SHIMMER;
    const rnd = random(404);
    const g = gain(ctx);
    g.gain.setValueAtTime(0, start + a);
    g.gain.linearRampToValueAtTime(dB(SHIMMER_LEVEL), start + a + 0.08);
    g.gain.setTargetAtTime(0, start + a + 0.3, (b - a) / 3.5);
    for (let k = 0; k < 7; k++) {
      const o = ctx.createOscillator();
      o.frequency.value = 345 + k * 21 + rnd() * 8;
      const trem = ctx.createOscillator();
      trem.frequency.value = 5 + rnd() * 6;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      const vg = gain(ctx);
      vg.gain.value = 0.5;
      trem.connect(depth).connect(vg.gain);
      const p = ctx.createStereoPanner();
      p.pan.value = (k / 6) * 1.2 - 0.6;
      o.connect(vg).connect(p).connect(g);
      for (const n of [o, trem]) { n.start(start + a); n.stop(start + b); }
    }
    g.connect(out);
    g.connect(space);
  }

  // Leaving: a whistle rising as it goes, through the echo, toward where it goes.
  {
    const a = LEAVE[0][0];
    const b = LEAVE[LEAVE.length - 1][0];
    const pitch = (t) => Math.pow(2, lookup(t, LEAVE.map(([k, f]) => [k, Math.log2(f)])));
    const g = gain(ctx);
    follow(g.gain, start, a, b, (t) => dB(lookup(t, LEAVE.map(([k, , l]) => [k, l]))));
    for (const [h, level] of [[1, 0], [2, -14]]) {
      const o = ctx.createOscillator();
      follow(o.frequency, start, a, b, (t) => pitch(t) * h);
      const og = gain(ctx);
      og.gain.value = dB(level);
      o.connect(og).connect(g);
      o.start(start + a);
      o.stop(start + b + 0.05);
    }
    const p = ctx.createStereoPanner();
    follow(p.pan, start, a, b, (t) => 0.5 * Math.sin(saucerFrom(t, _a).azimuth));
    g.connect(p).connect(out);
    g.connect(echoIn);
  }
}

// Make every buffer the sounds above need at `sampleRate`, ahead of scheduling them.
export function prepareVoices(sampleRate) {
  once('rain', sampleRate, () => rainSounds(sampleRate));
  once('rumble', sampleRate, () => rumble(sampleRate));
  once('car', sampleRate, () => carSounds(sampleRate));
}
