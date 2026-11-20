// One-shot sounds of things happening: steel biting into wood, a log set
// down on another, the scrape of the spade. Made from noise and oscillators
// like the rest of the soundscape; played through Soundscape.sfx(kind, opts).
//
// A feature with a sound of its own defines it from its own folder:
//
//   import { defineSfx } from '../audio/sfx.js';
//   defineSfx('strike', (k) => {
//     k.noise(k.s.white, k.t, 0.06, [['highpass', 3500]], 0.3, 0.002, 0.03);
//     k.tone('sine', k.t, 4000, 3300, 0.05, 0.001, 0.05);
//   });
//
// What a sound is handed (k):
//   s, ctx, t          the soundscape, its audio context, and when to start
//   kind, opts         what was asked for; opts.size is 0..1 (default 0.5)
//   out, nodes         where to connect, and what to tidy away afterwards
//   noise(buffer, at, duration, filters, peak, attack, decay, rate?)
//                      a burst of s.white / s.pink / s.brown through
//                      [[type, frequency, Q?], ...]
//   tone(type, at, f0, f1, peak, attack, decay)
//                      an oscillator gliding from f0 to f1
//   end                when it will have finished; noise() and tone() keep
//                      this up to date, so only set it if you build by hand

import { rand } from '../core/geom.js';
import { envelope, filtered, SILENT } from './kit.js';

const SOUNDS = new Map(); // kind -> { play, reverb }

// reverb: how much of it carries through the trees (0..1)
export function defineSfx(kind, play, { reverb = 0.28 } = {}) {
  SOUNDS.set(kind, { play, reverb });
}

export const sfxKinds = () => [...SOUNDS.keys()];

export function playSfx(s, kind, opts = {}) {
  const sound = SOUNDS.get(kind);
  const ctx = s.ctx;
  const t = ctx.currentTime + 0.005;
  const { dry, wet } = s.bus('effects');
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(dry);
  const send = ctx.createGain();
  send.gain.value = sound ? sound.reverb : 0.28;
  out.connect(send).connect(wet);
  const k = { s, ctx, t, kind, opts, out, size: opts.size ?? 0.5, nodes: [out, send], end: t + 0.5 };

  k.noise = (buf, at, dur, filters, peak, attack, decay, rate = 1) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * rand(0.92, 1.08);
    const node = filtered(ctx, src, filters, k.nodes);
    const g = ctx.createGain();
    envelope(g.gain, at, attack, peak, decay);
    node.connect(g).connect(out);
    k.nodes.push(g);
    src.start(at, rand(0, 2), dur);
    k.end = Math.max(k.end, at + dur + 0.2);
  };
  k.tone = (type, at, f0, f1, peak, attack, decay) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + attack + decay);
    const g = ctx.createGain();
    envelope(g.gain, at, attack, peak, decay);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
    k.nodes.push(g);
    k.end = Math.max(k.end, at + attack + decay + 0.2);
  };

  if (sound) sound.play(k);
  s.cleanup(k.end, k.nodes, 0.6);
}

// ── The sounds of work ──────────────────────────────────────────────────────

// Steel biting into wood: a hard knock, a woody body, a few chips. Felling
// (deeper on a thick trunk), cutting a notch, and squaring a log.
function strike({ s, t, kind, size, noise, tone }) {
  const pitch = kind === 'hew' ? 1.25 : kind === 'notch' ? 1.12 : 1 - size * 0.25;
  const amp = kind === 'chop' ? 0.9 : 0.7;
  noise(s.white, t, 0.06, [['bandpass', 2600 * pitch, 1.2]], amp * 0.5, 0.001, 0.025);
  noise(s.pink, t, 0.2, [['bandpass', 520 * pitch, 2.5]], amp * 1.1, 0.002, 0.11);
  noise(s.brown, t, 0.25, [['lowpass', 380]], amp * 0.9, 0.002, 0.12);
  tone('sine', t, 190 * pitch, 85 * pitch, amp * 0.55, 0.002, 0.12);
  tone('triangle', t, 410 * pitch * rand(0.95, 1.05), 380 * pitch, amp * 0.12, 0.002, 0.18);
  for (let i = 0; i < 3; i++) noise(s.white, t + rand(0.02, 0.09), 0.02, [['bandpass', rand(3000, 5500), 3]], rand(0.05, 0.14), 0.001, 0.01);
}
defineSfx('chop', strike);
defineSfx('notch', strike);
defineSfx('hew', strike);

// A tree about to go. Fibres giving way: a slow, rough groan with snaps.
defineSfx('creak', (k) => {
  const { s, ctx, t, out, noise } = k;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(rand(55, 75), t);
  o.frequency.linearRampToValueAtTime(rand(95, 130), t + 1.4);
  const trem = ctx.createOscillator();
  trem.frequency.value = rand(11, 17);
  const tg = ctx.createGain();
  tg.gain.value = 0.5;
  const am = ctx.createGain();
  am.gain.value = 0.5;
  trem.connect(tg).connect(am.gain);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 420;
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.5);
  g.gain.exponentialRampToValueAtTime(SILENT, t + 1.6);
  o.connect(am).connect(bp).connect(g).connect(out);
  o.start(t);
  trem.start(t);
  o.stop(t + 1.7);
  trem.stop(t + 1.7);
  k.nodes.push(tg, am, bp, g);
  for (let i = 0; i < 4; i++) noise(s.white, t + rand(0.2, 1.4), 0.03, [['bandpass', rand(1200, 2600), 2]], rand(0.2, 0.45), 0.001, 0.02);
  k.end = t + 2;
});

// A trunk hitting the ground and the crown thrashing through the brush.
// opts.strength: 0..1, how hard it came down
defineSfx(
  'crash',
  ({ s, t, opts, noise, tone }) => {
    const hard = opts.strength ?? 1;
    tone('sine', t, 70, 32, 1.4 * hard, 0.004, 0.5);
    noise(s.brown, t, 0.8, [['lowpass', 260]], 1.6 * hard, 0.004, 0.45);
    noise(s.pink, t + 0.02, 1.6, [['highpass', 900], ['lowpass', 6000]], 0.9 * hard, 0.05, 1.1);
    for (let i = 0; i < 14; i++) noise(s.white, t + rand(0.0, 0.7), 0.03, [['bandpass', rand(1500, 4500), 2.5]], rand(0.1, 0.4) * hard, 0.001, rand(0.008, 0.03));
  },
  { reverb: 0.5 },
);

// Spade into soil, then the scrape and the toss.
function spade({ s, t, kind, noise, tone }) {
  const f = kind === 'dig' ? 1 : 0.8;
  noise(s.white, t, 0.12, [['bandpass', 3400 * f, 1.5]], 0.25, 0.002, 0.05);
  noise(s.pink, t + 0.01, 0.35, [['bandpass', 700 * f, 0.9]], 0.65, 0.01, 0.2);
  tone('sine', t, 110, 60, 0.35, 0.003, 0.09);
  for (let i = 0; i < 6; i++) noise(s.white, t + rand(0.03, 0.22), 0.02, [['bandpass', rand(2500, 5000), 3]], rand(0.05, 0.16), 0.001, 0.01);
}
defineSfx('dig', spade);
defineSfx('fill', spade);

// Levering a stump out: roots tearing.
defineSfx('grub', ({ s, t, noise }) => {
  noise(s.pink, t, 0.4, [['bandpass', 380, 1.4]], 0.7, 0.01, 0.25);
  for (let i = 0; i < 5; i++) noise(s.white, t + rand(0, 0.3), 0.03, [['bandpass', rand(900, 2200), 2]], rand(0.2, 0.4), 0.001, 0.02);
});

// A heavy log set down on another: low knock with a hollow ring.
defineSfx('thud', ({ s, t, size, noise, tone }) => {
  const weight = 0.6 + size * 0.6;
  tone('sine', t, 120, 52, 0.9 * weight, 0.003, 0.22);
  noise(s.pink, t, 0.25, [['bandpass', 240, 3]], 0.8 * weight, 0.003, 0.16);
  tone('triangle', t + 0.005, 230 * rand(0.95, 1.05), 210, 0.12, 0.003, 0.3);
  noise(s.white, t, 0.04, [['bandpass', 1800, 1.5]], 0.15, 0.001, 0.02);
});

// Stones clacking together.
defineSfx('stone', ({ s, t, noise, tone }) => {
  for (let i = 0; i < 3; i++) {
    const at = t + i * rand(0.05, 0.11);
    noise(s.white, at, 0.04, [['bandpass', rand(1900, 3200), 6]], rand(0.35, 0.6), 0.001, 0.025);
    tone('sine', at, rand(1300, 2100), 1100, 0.08, 0.001, 0.05);
  }
});

// Picking something light up off the ground.
defineSfx('pick', ({ s, t, noise }) => {
  noise(s.pink, t, 0.2, [['bandpass', 900, 1]], 0.4, 0.01, 0.1);
  noise(s.white, t + 0.06, 0.04, [['bandpass', 2600, 4]], 0.3, 0.001, 0.025);
});

// "Can't do that": two soft falling notes.
defineSfx('deny', ({ t, tone }) => {
  tone('triangle', t, 220, 180, 0.14, 0.01, 0.12);
  tone('triangle', t + 0.1, 180, 150, 0.12, 0.01, 0.14);
});
