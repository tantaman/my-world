// What hunting sounds like, made from noise and oscillators like the rest.
//
// One-off sounds (audio/sfx.js): the shot, which rolls back off the hills a
// moment later; the bolt worked; cartridges pushed into the magazine; the
// knife at work dressing a kill; a cut put on over the flames; chewing.
//
// And the sizzle of meat roasting (a layer, see addLayer in
// audio/soundscape.js): fat spitting into the fire from the spit nearest
// you, placed where it is, busier the hotter the fire and the fuller the spit.

import { defineSfx } from '../audio/sfx.js';
import { envelope, setPos } from '../audio/kit.js';
import { rand } from '../core/geom.js';

// The shot: a sharp crack, the boom under it, and its echo coming back off
// the hills, softer and duller, once and then again.
defineSfx(
  'rifle',
  ({ s, t, noise, tone }) => {
    noise(s.white, t, 0.05, [['highpass', 1800]], 1.0, 0.0005, 0.035);
    noise(s.pink, t, 0.5, [['lowpass', 900]], 0.95, 0.001, 0.32);
    noise(s.brown, t, 0.7, [['lowpass', 260]], 1.0, 0.002, 0.5);
    tone('sine', t, 110, 40, 0.8, 0.001, 0.3);
    const echo = rand(0.55, 0.9);
    noise(s.pink, t + echo, 0.9, [['lowpass', 520]], 0.28, 0.04, 0.7);
    noise(s.brown, t + echo * 2.1, 1.2, [['lowpass', 300]], 0.18, 0.08, 1.0);
  },
  { reverb: 0.75 },
);

// The bolt worked: back with a scrape, forward and locked.
defineSfx('bolt', ({ s, t, noise, tone }) => {
  noise(s.white, t, 0.04, [['bandpass', 3200, 2]], 0.3, 0.001, 0.02);
  noise(s.white, t + 0.05, 0.09, [['bandpass', 2200, 1.5]], 0.14, 0.01, 0.06);
  noise(s.white, t + 0.2, 0.05, [['bandpass', 2600, 2]], 0.24, 0.001, 0.025);
  tone('square', t + 0.26, 1500, 1300, 0.05, 0.001, 0.03);
  noise(s.white, t + 0.26, 0.03, [['bandpass', 4000, 3]], 0.3, 0.0005, 0.015);
});

// Cartridges pushed down into the magazine, one after another.
defineSfx('load', ({ s, t, noise, tone }) => {
  for (let i = 0; i < 5; i++) {
    const at = t + 0.25 + i * rand(0.3, 0.38);
    noise(s.white, at, 0.03, [['bandpass', rand(2600, 3400), 3]], 0.18, 0.0008, 0.015);
    tone('triangle', at, rand(2100, 2500), 1900, 0.03, 0.001, 0.03);
  }
});

// A knife at work: short soft draws, and the odd rustle.
defineSfx('dress', ({ s, t, noise }) => {
  noise(s.pink, t, 0.18, [['bandpass', rand(700, 1100), 1.2]], 0.16, 0.02, 0.12);
  noise(s.pink, t + rand(0.25, 0.4), 0.15, [['bandpass', rand(900, 1300), 1.2]], 0.12, 0.02, 0.1);
  noise(s.brown, t + 0.1, 0.3, [['lowpass', 400]], 0.12, 0.05, 0.2);
});

// A cut put on over the flames: the hiss of it taking.
defineSfx('spit', ({ s, t, noise }) => {
  noise(s.white, t + 0.05, 1.1, [['highpass', 2800], ['lowpass', 9000]], 0.22, 0.03, 0.9);
  for (let i = 0; i < 8; i++) noise(s.white, t + rand(0.1, 0.9), 0.02, [['bandpass', rand(3000, 6500), 4]], rand(0.05, 0.14), 0.001, 0.008);
});

// Chewing: a few soft, wet crunches.
defineSfx('munch', ({ s, t, noise }) => {
  for (let i = 0; i < 3; i++) {
    const at = t + i * rand(0.2, 0.28);
    noise(s.pink, at, 0.09, [['bandpass', rand(600, 1000), 1.5]], rand(0.12, 0.2), 0.005, 0.05);
    noise(s.white, at, 0.04, [['bandpass', rand(1800, 2600), 2]], 0.05, 0.002, 0.02);
  }
});

// ── The sizzle ──────────────────────────────────────────────────────────────
const BUS = 'ambience';
const LOOKAHEAD = 0.15; // seconds of spitting fat scheduled ahead of the frame

// The layer, listening to `spits` (Spits.heard).
export function sizzle(spits) {
  return {
    name: 'spits',

    build(s) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus(BUS);
      this.pan = ctx.createPanner();
      this.pan.panningModel = s.offline ? 'equalpower' : 'HRTF';
      this.pan.distanceModel = 'inverse';
      this.pan.refDistance = 1.2;
      this.pan.rolloffFactor = 1.6;
      this.out = ctx.createGain();
      this.out.connect(this.pan);
      this.pan.connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.12;
      this.pan.connect(send).connect(wet);
      // a thin steady hiss under the spitting
      const src = ctx.createBufferSource();
      src.buffer = s.white;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3200;
      this.bed = ctx.createGain();
      this.bed.gain.value = 0;
      src.connect(hp).connect(this.bed).connect(this.out);
      src.start(ctx.currentTime, rand(0, 3));
      this.next = ctx.currentTime;
    },

    update(s, t) {
      const h = spits.heard;
      const heat = h ? h.heat : 0;
      if (h) setPos(this.pan, h.x, h.y, h.z);
      this.bed.gain.setTargetAtTime(0.035 * heat, t, 0.4);
      const horizon = t + LOOKAHEAD;
      while (this.next < horizon) {
        if (heat > 0.02 && this.next >= t) pop(s, this.out, this.next, heat);
        this.next = Math.max(this.next, t) + rand(0.03, 0.25) / (0.3 + heat);
      }
    },
  };
}

// A drop of fat spitting in the heat.
function pop(s, out, at, heat) {
  const ctx = s.ctx;
  const src = ctx.createBufferSource();
  src.buffer = s.white;
  const b = ctx.createBiquadFilter();
  b.type = 'bandpass';
  b.frequency.value = rand(2500, 7000);
  b.Q.value = rand(2, 5);
  const g = ctx.createGain();
  envelope(g.gain, at, 0.0008, rand(0.05, 0.16) * (0.5 + heat * 0.5), rand(0.004, 0.02));
  src.connect(b).connect(g).connect(out);
  src.start(at, rand(0, 2.5), 0.04);
  s.cleanup(at + 0.05, [src, b, g], 0.1);
}
