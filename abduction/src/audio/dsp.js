// What the sounds share: a seeded random source (so the page and an offline
// render of it play the same take), buffers of shaped noise and of scattered
// drops computed in plain JavaScript once at the start, the room's impulse
// response, and small helpers for scheduling (a value against time as an
// automation curve, decibels, notes).
//
// Buffers that loop are made seamless by crossfading their tail into their
// head, so a loop of rain has no click where it wraps.

// mulberry32: a small, fast, seeded generator of [0, 1).
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dB = (d) => Math.pow(10, d / 20);
export const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// One-pole low-pass in place: y += a (x - y), a from the corner in Hz.
export function onePoleLow(d, sr, corner) {
  const a = 1 - Math.exp((-2 * Math.PI * corner) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; }
  return d;
}

// One-pole high-pass in place.
export function onePoleHigh(d, sr, corner) {
  const a = 1 - Math.exp((-2 * Math.PI * corner) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] -= y; }
  return d;
}

// A second-order filter (RBJ's cookbook) in place: type 'low' | 'high' | 'band'.
export function biquad(d, sr, type, f, q = 0.707) {
  const w = (2 * Math.PI * f) / sr;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0;
  let b1;
  let b2;
  if (type === 'low') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'high') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al;
  const a1 = -2 * cs;
  const a2 = 1 - al;
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    d[i] = y;
  }
  return d;
}

// White noise, n samples.
export function white(n, rnd) {
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  return d;
}

// Pink noise (-3 dB an octave), Paul Kellet's refined filter; unit-ish level.
export function pink(n, rnd) {
  const d = new Float32Array(n);
  let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return d;
}

// Brown noise (-6 dB an octave), leaky integrated white; unit-ish level.
export function brown(n, rnd) {
  const d = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) { y = 0.998 * y + (rnd() * 2 - 1) * 0.06; d[i] = y; }
  return d;
}

// Make d (n + fade samples long) loop seamlessly as its first n samples: its
// last `fade` samples are crossfaded, at equal power, into its head.
export function seamless(d, fade) {
  const n = d.length - fade;
  const out = d.subarray(0, n);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    out[i] = d[i] * Math.sqrt(k) + d[n + i] * Math.sqrt(1 - k);
  }
  return out;
}

// Root mean square of d.
export function rms(d) {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length);
}

// An AudioBuffer at `sampleRate` from channel arrays (all the same length).
// Not tied to a context, so one made once serves every context at that rate.
export function toBuffer(sampleRate, channels) {
  const b = new AudioBuffer({ numberOfChannels: channels.length, length: channels[0].length, sampleRate });
  channels.forEach((c, i) => b.copyToChannel(c, i));
  return b;
}

// What make() returns for `key` at `sampleRate`, made the first time it is
// asked for: the buffers take a moment to compute, and are the same every time.
const made = new Map();
export function once(key, sampleRate, make) {
  const k = `${key}@${sampleRate}`;
  if (!made.has(k)) made.set(k, make());
  return made.get(k);
}

// A buffer source playing `buffer` in a loop from `at`, starting `offset` seconds in.
export function loop(ctx, buffer, at = 0, offset = 0) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.start(at, offset % buffer.duration);
  return s;
}

// A room for the night outside: a stereo impulse response of decorrelated
// noise under an exponential decay, darker as it decays (air and wet
// surfaces take the highs first), after a few early reflections.
export function impulse(sr, { seconds = 3, rt60 = 2.6, early = 0.012, bright = 6000, dark = 900, seed = 7 } = {}) {
  const n = Math.floor(seconds * sr);
  const rnd = random(seed);
  const chans = [0, 1].map(() => {
    const d = new Float32Array(n);
    // The tail: noise, decaying 60 dB in rt60, through a low-pass that closes over time.
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const corner = dark + (bright - dark) * Math.exp(-t / (rt60 * 0.25));
      const a = 1 - Math.exp((-2 * Math.PI * corner) / sr);
      y += a * ((rnd() * 2 - 1) - y);
      const env = Math.exp((-6.9 * t) / rt60) * Math.min(1, t / 0.03);
      d[i] = y * env;
    }
    // Early reflections: a handful of taps in the first 80 ms.
    for (let k = 0; k < 9; k++) {
      const at = Math.floor((early + rnd() * 0.07) * sr);
      d[at] += (rnd() < 0.5 ? -1 : 1) * (0.5 - k * 0.04);
    }
    return d;
  });
  // Unit energy, so a send level is the reverb's level.
  const e = Math.hypot(rms(chans[0]), rms(chans[1])) * Math.sqrt(n);
  for (const c of chans) for (let i = 0; i < n; i++) c[i] /= e;
  return toBuffer(sr, chans);
}

// A soft-clipping curve (tanh) for a WaveShaperNode: unity gain for quiet
// signals, rounding off what comes near full scale; `drive` is how hard.
export function softClip(drive = 1.5, size = 2048) {
  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive) / drive;
  }
  return c;
}

// Schedule a param to follow f(t) (t in the take's seconds) from a to b, at
// `rate` points a second, as one value curve starting at start + a.
export function follow(param, start, a, b, f, rate = 60) {
  const n = Math.max(2, Math.ceil((b - a) * rate) + 1);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = f(a + ((b - a) * i) / (n - 1));
  param.setValueAtTime(v[0], start + a);
  param.setValueCurveAtTime(v, start + a + 1e-4, b - a - 1e-4);
  return param;
}

// Piecewise-linear lookup in [[t, v], ...].
export function lookup(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return keys[keys.length - 1][1];
}

// A gain node at `value` from the start. Automated gains start silent: an
// AudioParam holds its default (1 for a gain) until its first event, and a
// source started on the very frame of that event can let one sample through.
export function gain(ctx, value = 0) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}
