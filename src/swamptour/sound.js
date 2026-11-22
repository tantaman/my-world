// What an airboat sounds like, made from oscillators and noise like every
// other sound here (audio/soundscape.js), on a bus of its own ('airboat').
// It is loud: an engine with no muffler driving a propeller in the open,
// heard a long way off over the water.
//
//   - the propeller: two blades going past, a deep throb at the blade rate
//     (about 100 Hz flat out, a third of that at idle) and a strong second
//     harmonic, which is what the videos of the real one are mostly made of
//   - the engine under it, rough and buzzy, and the roar of the wash
//   - the starter grinding and the engine catching; it dying away at the end
//
// A layer (sound.addLayer) gives the boat its voice. What it hears comes
// from `source`, which the tour fills in every frame:
//   source.boat   null, or { x, y, z (the propeller), throttle (0..1), running }

import { setPos, SILENT } from '../audio/kit.js';
import { defineSfx } from '../audio/sfx.js';
import { rand } from '../core/geom.js';

const BUS = 'airboat';
// Hz: the blades' rate at idle and flat out
const BLADES = [32, 100];
const HEARD_TO = 900; // m: past this, nothing
const LOUD = 0.55; // its level, flat out, close to

export function airboatSound(source) {
  return {
    name: 'airboat',
    build() {
      this.voice = null;
    },
    update(s, t) {
      const b = source.boat;
      const l = s.listener;
      const near = b && b.running && (!l || Math.hypot(b.x - l.x, b.z - l.z) < HEARD_TO);
      if (near && !this.voice) this.voice = voice(s, t);
      const v = this.voice;
      if (!v) return;
      if (!near) {
        v.out.gain.setTargetAtTime(SILENT, t, 0.6);
        if (!v.goneAt) v.goneAt = t;
        if (t - v.goneAt > 3) {
          s.cleanup(t + 0.5, v.nodes, 0.2);
          this.voice = null;
        }
        return;
      }
      v.goneAt = 0;
      setPos(v.pan, b.x, b.y, b.z);
      const k = b.throttle;
      const f = BLADES[0] + (BLADES[1] - BLADES[0]) * k;
      for (const [o, m] of v.oscs) o.frequency.setTargetAtTime(f * m, t, 0.35);
      v.chop.frequency.setTargetAtTime(f, t, 0.35);
      v.wash.gain.setTargetAtTime(0.05 + 0.5 * k * k, t, 0.4);
      v.washFilter.frequency.setTargetAtTime(500 + 1400 * k, t, 0.4);
      v.out.gain.setTargetAtTime(LOUD * (0.35 + 0.65 * k), t, 0.3);
    },
  };
}

function voice(s, t) {
  const ctx = s.ctx;
  const { dry, wet } = s.bus(BUS);
  const pan = ctx.createPanner();
  pan.panningModel = s.offline ? 'equalpower' : 'HRTF';
  pan.distanceModel = 'inverse';
  pan.refDistance = 14;
  pan.rolloffFactor = 0.9;
  pan.maxDistance = 10000;
  pan.connect(dry);
  const send = ctx.createGain();
  send.gain.value = 0.3;
  pan.connect(send).connect(wet);
  const out = ctx.createGain();
  out.gain.value = SILENT;
  out.connect(pan);
  // the throb: the blade rate and its harmonics, chopped at the blade rate
  const chopGain = ctx.createGain();
  chopGain.gain.value = 0.55;
  const chop = ctx.createOscillator();
  chop.type = 'sine';
  chop.frequency.value = BLADES[0];
  const depth = ctx.createGain();
  depth.gain.value = 0.45;
  chop.connect(depth).connect(chopGain.gain);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1600;
  chopGain.connect(lp).connect(out);
  const oscs = [];
  for (const [type, m, g] of [['sawtooth', 1, 0.5], ['sine', 2, 0.55], ['square', 3, 0.08], ['sawtooth', 4.02, 0.06]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = BLADES[0] * m;
    const og = ctx.createGain();
    og.gain.value = g;
    o.connect(og).connect(chopGain);
    o.start(t);
    oscs.push([o, m]);
  }
  chop.start(t);
  // the wash: air torn by the blades, a broad roar
  const src = ctx.createBufferSource();
  src.buffer = s.pink;
  src.loop = true;
  const washFilter = ctx.createBiquadFilter();
  washFilter.type = 'bandpass';
  washFilter.frequency.value = 600;
  washFilter.Q.value = 0.6;
  const wash = ctx.createGain();
  wash.gain.value = 0.05;
  src.connect(washFilter).connect(wash).connect(out);
  src.start(t, rand(0, 2));
  const nodes = [pan, send, out, chopGain, chop, depth, lp, src, washFilter, wash, ...oscs.map(([o]) => o)];
  return { pan, out, oscs, chop, wash, washFilter, nodes, goneAt: 0 };
}

// The starter grinding, and the engine catching with a bang and a roar.
defineSfx('airboat-start', ({ s, t, noise, tone }) => {
  for (let i = 0; i < 5; i++) noise(s.white, t + i * 0.13, 0.1, [['bandpass', 1400, 2]], 0.25, 0.01, 0.08);
  noise(s.brown, t + 0.7, 0.5, [['lowpass', 300]], 1.2, 0.01, 0.4);
  tone('sawtooth', t + 0.7, 45, 30, 0.25, 0.02, 0.6);
});

// Pulling a pair of ear defenders down over your ears: a soft thump each side.
defineSfx('earmuffs', ({ s, t, noise }) => {
  noise(s.brown, t, 0.12, [['lowpass', 260]], 0.6, 0.005, 0.1);
  noise(s.brown, t + 0.22, 0.12, [['lowpass', 260]], 0.6, 0.005, 0.1);
});
