// What the match sounds like, made from noise and oscillators like every
// other sound here (audio/soundscape.js).
//
// All one-offs (sound.sfx), each with opts.size 0..1: how near it is, 1
// being your own. Far things are quieter and duller.
//
//   the guns     'sk-shot' { gun }: a crack for the pistols, a rattle for
//                the SMG, a boom for the shotgun, a long report for the
//                rifles; 'sk-knife', 'sk-dry', 'sk-reload', 'sk-draw'
//   getting hit  'sk-hit' (you), 'sk-dink' (a head), 'sk-kill' (yours),
//                'sk-died'
//   on foot      'sk-step', 'sk-jump', 'sk-land'
//   grenades     'sk-bounce', 'sk-frag', 'sk-flash', 'sk-smoke'
//   the charge   'sk-planting', 'sk-planted', 'sk-beep', 'sk-defusing',
//                'sk-defused', 'sk-boom'
//   the round    'sk-round', 'sk-win', 'sk-lose', 'sk-buy', 'sk-no'

import { defineSfx } from '../audio/sfx.js';

// How loud and how bright something `size` near is.
const near = (k) => 0.12 + 0.88 * k.size * k.size;
const bright = (k, f) => (k.size > 0.85 ? f : f * (0.25 + 0.75 * k.size));

defineSfx(
  'sk-shot',
  (k) => {
    const g = near(k);
    const { s, t } = k;
    const gun = k.opts.gun;
    if (gun === 'shotgun') {
      k.noise(s.brown, t, 0.5, [['lowpass', bright(k, 900)]], 1.5 * g, 0.002, 0.34);
      k.noise(s.white, t, 0.1, [['bandpass', bright(k, 2200), 0.6]], 0.7 * g, 0.001, 0.08);
      k.tone('sine', t, 150, 45, 0.9 * g, 0.002, 0.25);
    } else if (gun === 'longrifle') {
      k.noise(s.white, t, 0.09, [['highpass', bright(k, 1500)]], 1.0 * g, 0.001, 0.07);
      k.noise(s.pink, t, 1.1, [['lowpass', bright(k, 1300)]], 0.9 * g, 0.004, 0.9);
      k.tone('sine', t, 170, 40, 1.0 * g, 0.002, 0.3);
    } else if (gun === 'rifle') {
      k.noise(s.white, t, 0.06, [['highpass', bright(k, 1900)]], 0.7 * g, 0.001, 0.05);
      k.noise(s.pink, t, 0.4, [['lowpass', bright(k, 1500)]], 0.6 * g, 0.003, 0.3);
      k.tone('square', t, 520, 110, 0.12 * g, 0.001, 0.07);
      k.tone('sine', t, 190, 60, 0.6 * g, 0.002, 0.14);
    } else if (gun === 'smg') {
      k.noise(s.white, t, 0.045, [['highpass', bright(k, 2600)]], 0.5 * g, 0.001, 0.035);
      k.noise(s.pink, t, 0.18, [['bandpass', bright(k, 1100), 0.7]], 0.4 * g, 0.002, 0.13);
      k.tone('sine', t, 240, 90, 0.35 * g, 0.002, 0.08);
    } else {
      const heavy = gun === 'magnum' ? 1.5 : 1;
      k.noise(s.white, t, 0.06, [['highpass', bright(k, 2100 / heavy)]], 0.6 * g * heavy, 0.001, 0.045);
      k.noise(s.pink, t, 0.3 * heavy, [['lowpass', bright(k, 1400)]], 0.45 * g * heavy, 0.003, 0.22 * heavy);
      k.tone('sine', t, 210 / heavy, 70, 0.5 * g * heavy, 0.002, 0.1 * heavy);
    }
  },
  { reverb: 0.5 },
);

// A swing of the knife.
defineSfx('sk-knife', (k) => k.noise(k.s.white, k.t, 0.16, [['bandpass', 2400, 1.4]], 0.22 * near(k), 0.03, 0.1), { reverb: 0.1 });

// An empty gun.
defineSfx(
  'sk-dry',
  (k) => {
    k.noise(k.s.white, k.t, 0.02, [['bandpass', 3800, 3]], 0.18, 0.001, 0.015);
    k.tone('square', k.t, 1400, 1100, 0.03, 0.001, 0.02);
  },
  { reverb: 0.05 },
);

// Reloading: the old one out, the new one home, the bolt (opts.len: how long it takes).
defineSfx(
  'sk-reload',
  (k) => {
    const len = k.opts.len || 2.3;
    const click = (at, f, peak) => {
      k.noise(k.s.white, k.t + at, 0.03, [['bandpass', f, 2.5]], peak, 0.001, 0.022);
      k.tone('triangle', k.t + at, f * 0.4, f * 0.3, peak * 0.35, 0.001, 0.03);
    };
    click(len * 0.12, 1700, 0.16);
    click(len * 0.52, 2300, 0.2);
    click(len * 0.82, 2900, 0.22);
    click(len * 0.88, 2100, 0.18);
  },
  { reverb: 0.08 },
);

// Something else coming up into your hands.
defineSfx('sk-draw', (k) => k.noise(k.s.pink, k.t, 0.12, [['bandpass', 1500, 0.8]], 0.1, 0.02, 0.08), { reverb: 0.05 });

// Hit: a thud you feel.
defineSfx(
  'sk-hit',
  (k) => {
    k.tone('sine', k.t, 150, 60, 0.5, 0.002, 0.14);
    k.noise(k.s.brown, k.t, 0.12, [['lowpass', 500]], 0.5, 0.002, 0.09);
  },
  { reverb: 0.1 },
);

// A round off a head: a bright little ring.
defineSfx(
  'sk-dink',
  (k) => {
    const g = near(k);
    k.tone('triangle', k.t, 2900, 2500, 0.2 * g, 0.001, 0.14);
    k.tone('sine', k.t, 4350, 4100, 0.09 * g, 0.001, 0.2);
  },
  { reverb: 0.25 },
);

// You got one.
defineSfx(
  'sk-kill',
  (k) => {
    k.tone('triangle', k.t, 660, 660, 0.11, 0.004, 0.12);
    k.tone('triangle', k.t + 0.07, 990, 990, 0.11, 0.004, 0.22);
  },
  { reverb: 0.2 },
);

// You're down.
defineSfx(
  'sk-died',
  (k) => {
    k.tone('sine', k.t, 180, 42, 0.5, 0.004, 0.7);
    k.noise(k.s.brown, k.t, 0.6, [['lowpass', 350]], 0.5, 0.005, 0.5);
  },
  { reverb: 0.4 },
);

// A foot down on packed sand.
defineSfx(
  'sk-step',
  (k) => {
    const g = near(k);
    k.noise(k.s.brown, k.t, 0.09, [['lowpass', 420]], 0.38 * g, 0.003, 0.06);
    k.noise(k.s.pink, k.t, 0.07, [['bandpass', 1900, 0.9]], 0.09 * g, 0.004, 0.05);
  },
  { reverb: 0.12 },
);
defineSfx('sk-jump', (k) => k.noise(k.s.pink, k.t, 0.1, [['bandpass', 1200, 1]], 0.08, 0.004, 0.08), { reverb: 0.1 });
defineSfx(
  'sk-land',
  (k) => {
    k.tone('sine', k.t, 110, 55, 0.3 * k.size, 0.003, 0.12);
    k.noise(k.s.brown, k.t, 0.12, [['lowpass', 600]], 0.4 * k.size, 0.002, 0.09);
  },
  { reverb: 0.12 },
);

// A grenade off a wall.
defineSfx('sk-bounce', (k) => k.tone('triangle', k.t, 1900, 1500, 0.1 * near(k), 0.001, 0.05), { reverb: 0.2 });
defineSfx(
  'sk-frag',
  (k) => {
    const g = near(k);
    k.noise(k.s.brown, k.t, 1.3, [['lowpass', bright(k, 700)]], 2.0 * g, 0.003, 1.0);
    k.noise(k.s.white, k.t, 0.2, [['bandpass', bright(k, 1800), 0.5]], 0.9 * g, 0.001, 0.15);
    k.tone('sine', k.t, 120, 30, 1.2 * g, 0.003, 0.5);
  },
  { reverb: 0.7 },
);
// A flash: the bang, and (opts.ring 0..1) the ringing it leaves in your ears.
defineSfx(
  'sk-flash',
  (k) => {
    const g = near(k);
    k.noise(k.s.white, k.t, 0.12, [['highpass', 1200]], 1.4 * g, 0.001, 0.09);
    k.tone('sine', k.t, 300, 80, 0.6 * g, 0.002, 0.15);
    const ring = k.opts.ring || 0;
    if (ring > 0.05) k.tone('sine', k.t + 0.02, 3600, 3550, 0.12 * ring, 0.02, 0.5 + 2.2 * ring);
  },
  { reverb: 0.4 },
);
defineSfx('sk-smoke', (k) => k.noise(k.s.white, k.t, 1.6, [['bandpass', 5200, 0.6]], 0.2 * near(k), 0.05, 1.3), { reverb: 0.2 });

// The charge: keys pressed as it's set; the tone that says it is; its beep.
defineSfx(
  'sk-planting',
  (k) => {
    const g = near(k);
    for (let i = 0; i < 6; i++) k.tone('square', k.t + i * 0.42 + (i % 2) * 0.08, 1500 + (i % 3) * 180, 1500 + (i % 3) * 180, 0.035 * g, 0.002, 0.05);
  },
  { reverb: 0.1 },
);
defineSfx(
  'sk-planted',
  (k) => {
    k.tone('square', k.t, 880, 880, 0.07, 0.004, 0.14);
    k.tone('square', k.t + 0.16, 880, 880, 0.07, 0.004, 0.14);
    k.tone('square', k.t + 0.32, 1175, 1175, 0.08, 0.004, 0.4);
  },
  { reverb: 0.3 },
);
defineSfx('sk-beep', (k) => k.tone('sine', k.t, 2050, 2050, 0.03 + 0.12 * near(k), 0.002, 0.06), { reverb: 0.25 });
defineSfx(
  'sk-defusing',
  (k) => {
    const g = near(k);
    for (let i = 0; i < 4; i++) k.noise(k.s.white, k.t + i * 0.13, 0.03, [['bandpass', 2600 + i * 200, 3]], 0.12 * g, 0.001, 0.02);
  },
  { reverb: 0.1 },
);
defineSfx(
  'sk-defused',
  (k) => {
    k.tone('triangle', k.t, 523, 523, 0.1, 0.005, 0.2);
    k.tone('triangle', k.t + 0.1, 784, 784, 0.1, 0.005, 0.45);
  },
  { reverb: 0.3 },
);
defineSfx(
  'sk-boom',
  (k) => {
    const g = 0.4 + 0.6 * k.size;
    k.noise(k.s.brown, k.t, 3.2, [['lowpass', 500]], 2.6 * g, 0.004, 2.6);
    k.noise(k.s.pink, k.t, 1.4, [['bandpass', 900, 0.4]], 1.2 * g, 0.004, 1.1);
    k.tone('sine', k.t, 90, 24, 1.6 * g, 0.004, 1.4);
  },
  { reverb: 0.9 },
);

// A round begins; one won; one lost.
defineSfx(
  'sk-round',
  (k) => {
    k.tone('triangle', k.t, 392, 392, 0.1, 0.01, 0.5);
    k.tone('triangle', k.t + 0.02, 587, 587, 0.07, 0.01, 0.5);
  },
  { reverb: 0.4 },
);
defineSfx(
  'sk-win',
  (k) => {
    [523, 659, 784, 1047].forEach((f, i) => k.tone('triangle', k.t + i * 0.11, f, f, 0.09, 0.005, 0.3));
  },
  { reverb: 0.4 },
);
defineSfx(
  'sk-lose',
  (k) => {
    [440, 370, 294].forEach((f, i) => k.tone('triangle', k.t + i * 0.16, f, f, 0.09, 0.005, 0.4));
  },
  { reverb: 0.4 },
);
defineSfx(
  'sk-buy',
  (k) => {
    k.noise(k.s.white, k.t, 0.03, [['bandpass', 2400, 2]], 0.16, 0.001, 0.02);
    k.noise(k.s.white, k.t + 0.09, 0.04, [['bandpass', 3100, 2]], 0.2, 0.001, 0.03);
  },
  { reverb: 0.08 },
);
defineSfx('sk-no', (k) => k.tone('square', k.t, 150, 140, 0.05, 0.004, 0.12), { reverb: 0.05 });

// How near (0..1) something `far` m off sounds, for something heard `reach` m away.
export const nearness = (far, reach) => Math.max(0, 1 - far / reach);
