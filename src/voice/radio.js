// The radio: what a voice sounds like having been through one, and the noises
// a radio makes of its own.
//
// A walkie-talkie throws away everything below about 300 Hz and above about
// 3 kHz, honks in the middle, drives what is left into its little speaker
// until it breaks up, and squeezes it flat. Between transmissions it is
// silent, its squelch shut. When someone keys up it opens with a click and a
// breath of static, hisses softly under them while they talk, and when they
// let go it closes with the burst of static everyone knows.
//
//   const radio = new Radio(sound);   // the soundscape, once it has a context
//   voice.connect(radio.input);
//   radio.open(t) / radio.close(t)    someone keyed up / let go
//   radio.carrier(on, t)              is anyone on the air?
//   radio.key(down, t)                the click of your own radio's button
//
// It comes out of the radio on your strap, so it isn't placed anywhere and
// has no reverb: it is on its own bus, 'radio'.

import { rand } from '../core/geom.js';
import { envelope } from '../audio/kit.js';

const BAND = [330, 2900]; // Hz: what gets through
const HONK = { f: 1500, q: 1.1, db: 7 }; // the little speaker's resonance
const DRIVE = 6; // how hard it is driven into breaking up
const LEVEL = 1.1; // what comes out
const HISS = 0.035; // the static under a transmission
const SQUELCH = 0.55; // the burst of static when it closes

export class Radio {
  constructor(s) {
    const ctx = s.ctx;
    this.s = s;
    const filter = (type, f, q = 0.8, gain = 0) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      b.gain.value = gain;
      return b;
    };
    this.input = ctx.createGain();
    const low = filter('highpass', BAND[0], 0.9);
    const low2 = filter('highpass', BAND[0], 0.7);
    const high = filter('lowpass', BAND[1], 0.9);
    const honk = filter('peaking', HONK.f, HONK.q, HONK.db);
    const drive = ctx.createWaveShaper();
    drive.curve = crunch(DRIVE);
    drive.oversample = '2x';
    const fizz = filter('lowpass', 3600, 0.7); // what the breaking-up adds up top
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -30;
    squash.knee.value = 6;
    squash.ratio.value = 10;
    squash.attack.value = 0.003;
    squash.release.value = 0.12;
    this.out = ctx.createGain();
    this.out.gain.value = LEVEL;
    this.input.connect(low).connect(low2).connect(high).connect(honk).connect(drive).connect(fizz).connect(squash).connect(this.out);
    this.out.connect(s.bus('radio').dry);

    // the hiss under a transmission, through the same speaker
    const hiss = ctx.createBufferSource();
    hiss.buffer = s.white;
    hiss.loop = true;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    hiss.connect(this.hiss).connect(this.input);
    hiss.start();
    this.onAir = false;
  }

  // Is anyone on the air? The hiss rides under them.
  carrier(on, t = this.s.ctx.currentTime) {
    if (on === this.onAir) return;
    this.onAir = on;
    this.hiss.gain.setTargetAtTime(on ? HISS : 0, t, on ? 0.02 : 0.05);
  }

  // Someone keyed up: a click as the squelch opens, and a breath of static.
  open(t = this.s.ctx.currentTime) {
    this.#burst(t, 0.035, 0.3, 0.002, 0.03);
    this.#click(t, 2400);
  }

  // They let go: the squelch tail.
  close(t = this.s.ctx.currentTime) {
    this.#burst(t + 0.02, 0.2, SQUELCH, 0.004, 0.16);
  }

  // Your own radio's button going down, or coming back up.
  key(down, t = this.s.ctx.currentTime) {
    const ctx = this.s.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.s.white;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = down ? 3200 : 2500;
    band.Q.value = 3;
    const g = ctx.createGain();
    envelope(g.gain, t, 0.001, down ? 0.5 : 0.35, 0.018);
    src.connect(band).connect(g).connect(this.s.bus('radio').dry);
    src.start(t, rand(0, 2), 0.04);
    this.s.cleanup(t + 0.05, [src, band, g]);
  }

  // A burst of static, through the radio.
  #burst(t, dur, peak, attack, decay) {
    const ctx = this.s.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.s.white;
    const g = ctx.createGain();
    envelope(g.gain, t, attack, peak, decay);
    src.connect(g).connect(this.input);
    src.start(t, rand(0, 2), dur + 0.05);
    this.s.cleanup(t + dur + 0.05, [src, g]);
  }

  // A short tick, through the radio.
  #click(t, f) {
    const ctx = this.s.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = ctx.createGain();
    envelope(g.gain, t, 0.001, 0.25, 0.012);
    o.connect(g).connect(this.input);
    o.start(t);
    o.stop(t + 0.03);
    this.s.cleanup(t + 0.03, [o, g]);
  }
}

// A soft clip that breaks up harder the higher k is.
function crunch(k, n = 1024) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}
