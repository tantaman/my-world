// What the tower and the Whorl sound like, made from noise like every other
// sound here (audio/soundscape.js):
//
//   - footsteps on the steel grating of its decks: a hollow clank, ringing a
//     little (the 'grating' surface its decks say they are)
//   - going down (a layer): the felt hissing over the stainless, rising with
//     how fast you go; the tube booming round you while you're in it; and a
//     knock as you go over each joint, a flange every metre and a half
//   - one-offs (sound.sfx): sitting down on the mat, and coming out onto the
//     run-out and sliding to a stop
//
// The layer hears what it should from `source`, which the feature fills in
// every frame (it's right where you are, so it isn't placed anywhere):
//   source.on       on the slide
//   source.v        how fast (m/s)
//   source.inside   0..1 how shut in the tube you are (not the open trough)
//   source.joints   how many joints you've gone over (it knocks for each new one)

import { defineSfx } from '../audio/sfx.js';
import { defineSurface } from '../audio/footsteps.js';
import { SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';
import { clamp } from '../noise.js';

// m/s at which the slide is as loud as it gets
const FULL = 7;

defineSurface('grating', {
  thump: 0.7,
  step({ s, t, run, sharp, noise }) {
    noise(s.pink, t, 0.12, [['bandpass', rand(520, 680), 3]], 0.75 * sharp, 0.0015, 0.08 + run * 0.02);
    noise(s.white, t + 0.003, 0.05, [['bandpass', rand(2300, 2900), 5]], 0.22 * sharp, 0.001, 0.03);
    // the deck ringing under the step
    noise(s.white, t + 0.01, 0.4, [['bandpass', rand(1300, 1500), 18]], 0.12 * sharp, 0.005, 0.3);
  },
});

export function slideSounds(source) {
  return {
    name: 'whorl',

    build(s) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus('effects');
      // the felt on the steel: a hiss that brightens as you go faster
      this.hiss = ctx.createBufferSource();
      this.hiss.buffer = s.pink;
      this.hiss.loop = true;
      this.band = ctx.createBiquadFilter();
      this.band.type = 'bandpass';
      this.band.frequency.value = 900;
      this.band.Q.value = 0.7;
      this.hissGain = ctx.createGain();
      this.hissGain.gain.value = SILENT;
      this.hiss.connect(this.band).connect(this.hissGain).connect(dry);
      // the tube round you, booming
      this.boom = ctx.createBufferSource();
      this.boom.buffer = s.brown;
      this.boom.loop = true;
      this.body = ctx.createBiquadFilter();
      this.body.type = 'bandpass';
      this.body.frequency.value = 230;
      this.body.Q.value = 3;
      this.boomGain = ctx.createGain();
      this.boomGain.gain.value = SILENT;
      this.boom.connect(this.body).connect(this.boomGain).connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.25;
      this.boomGain.connect(send).connect(wet);
      this.hiss.start(ctx.currentTime, rand(0, 3));
      this.boom.start(ctx.currentTime, rand(0, 5));
      this.joints = 0;
    },

    update(s, t) {
      const v = source.on ? clamp(source.v / FULL, 0, 1) : 0;
      const shut = source.on ? clamp(source.inside, 0, 1) : 0;
      this.hissGain.gain.setTargetAtTime(source.on ? 0.02 + 0.2 * v : SILENT, t, 0.08);
      this.band.frequency.setTargetAtTime(600 + 1600 * v, t, 0.1);
      this.boomGain.gain.setTargetAtTime(source.on ? (0.05 + 0.5 * v) * (0.3 + 0.7 * shut) : SILENT, t, 0.1);
      this.body.frequency.setTargetAtTime(180 + 120 * v, t, 0.2);
      // a knock at each joint gone over
      if (!source.on) this.joints = source.joints;
      else if (source.joints !== this.joints) {
        this.joints = source.joints;
        s.sfx('whorl-joint', { size: v });
      }
    },
  };
}

// Over a joint between two lengths of tube: a dull knock, ringing in the steel.
defineSfx('whorl-joint', ({ s, t, noise, tone, size }) => {
  const k = 0.3 + size * 0.7;
  tone('sine', t, rand(130, 160), 90, 0.12 * k, 0.002, 0.07);
  noise(s.white, t, 0.25, [['bandpass', rand(1700, 2100), 14]], 0.05 * k, 0.002, 0.2);
});

// Sat down on the mat at the mouth: the felt rustling, a creak of the steel.
defineSfx('whorl-sit', ({ s, t, noise, tone }) => {
  noise(s.pink, t, 0.35, [['bandpass', 1400, 0.8]], 0.12, 0.03, 0.25);
  noise(s.brown, t + 0.15, 0.2, [['lowpass', 400]], 0.18, 0.01, 0.12);
  tone('triangle', t + 0.25, rand(380, 420), rand(300, 340), 0.025, 0.02, 0.2);
});

// Out of the tube and along the run-out to a stop: the hiss trailing off,
// the mat flopping still, and stepping off onto the ground.
defineSfx('whorl-out', ({ s, t, noise }) => {
  noise(s.pink, t, 0.9, [['bandpass', 900, 0.7]], 0.14, 0.01, 0.8);
  noise(s.brown, t + 0.7, 0.25, [['lowpass', 350]], 0.25, 0.01, 0.18);
  noise(s.pink, t + 1.1, 0.15, [['bandpass', 500, 1.5]], 0.15, 0.004, 0.1);
});
