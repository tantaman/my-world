// What the plane sounds like, made from noise and oscillators like every
// other sound here (audio/soundscape.js), on a bus of its own ('planes'):
//
//   the engines  two propellers' buzz, a little out of step with each other
//                so they beat, deeper idling and rising to a snarl flat out;
//                a thin turbine whine over it; and the roar of the exhaust
//   the air      rushing past, the faster the louder
//   one-offs     (sound.sfx) the cabin chime, the door, the tyres touching
//                down
//
// It's heard from where the plane is. What the layer hears comes from
// `source`, which index.js fills in every frame:
//   source.plane   null, or { x, y, z, power (0..1), v (m/s) }
//
// And a kind of ground underfoot: tarmac, the strip and the apron.

import { setPos, SILENT } from '../audio/kit.js';
import { defineSfx } from '../audio/sfx.js';
import { defineSurface } from '../audio/footsteps.js';

const BUS = 'planes';
const BUZZ = [34, 96]; // Hz, the propellers' blades going by: idling, and flat out
const BEAT = 1.013; // the second engine, this much faster
const WHINE = [2600, 4100]; // Hz, the turbine
const HEARD_TO = 1800; // m: past this, nothing

export function planeSounds(source) {
  return {
    name: 'planes',

    build(s) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus(BUS);
      const panner = ctx.createPanner();
      panner.panningModel = s.offline ? 'equalpower' : 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 14;
      panner.rolloffFactor = 1;
      panner.maxDistance = 20000;
      panner.connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.3;
      panner.connect(send).connect(wet);
      const out = ctx.createGain();
      out.gain.value = SILENT;
      out.connect(panner);
      // the propellers: a buzz from each, through a filter that opens up with power
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 500;
      tone.Q.value = 0.7;
      const buzz = ctx.createGain();
      buzz.gain.value = 0.22;
      tone.connect(buzz).connect(out);
      const props = [1, BEAT].map((k) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = BUZZ[0] * k;
        o.connect(tone);
        o.start();
        return o;
      });
      // the turbine's whine
      const whine = ctx.createOscillator();
      whine.type = 'sine';
      whine.frequency.value = WHINE[0];
      const wg = ctx.createGain();
      wg.gain.value = SILENT;
      whine.connect(wg).connect(out);
      whine.start();
      // the exhaust's roar
      const loop = (buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.start(0, Math.random() * 2);
        return src;
      };
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      const roar = ctx.createGain();
      roar.gain.value = SILENT;
      loop(s.brown).connect(lp).connect(roar).connect(out);
      // the air going by
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.5;
      const air = ctx.createGain();
      air.gain.value = SILENT;
      loop(s.pink).connect(bp).connect(air).connect(out);
      Object.assign(this, { panner, out, tone, props, whine, wg, lp, roar, bp, air });
    },

    update(s, t) {
      const p = source.plane;
      const l = s.listener;
      const heard = p && p.power > 0.005 && (!l || Math.hypot(p.x - l.x, p.z - l.z) < HEARD_TO);
      this.out.gain.setTargetAtTime(heard ? 1 : SILENT, t, heard ? 0.3 : 0.6);
      if (!heard) return;
      setPos(this.panner, p.x, p.y + 2.8, p.z);
      const k = Math.min(1, p.power);
      const f = BUZZ[0] + (BUZZ[1] - BUZZ[0]) * k;
      this.props[0].frequency.setTargetAtTime(f, t, 0.6);
      this.props[1].frequency.setTargetAtTime(f * BEAT, t, 0.6);
      this.tone.frequency.setTargetAtTime(380 + 1500 * k, t, 0.5);
      this.whine.frequency.setTargetAtTime(WHINE[0] + (WHINE[1] - WHINE[0]) * k, t, 1.2);
      this.wg.gain.setTargetAtTime(0.006 + 0.01 * k, t, 0.5);
      this.roar.gain.setTargetAtTime(0.1 + 0.55 * k, t, 0.4);
      this.lp.frequency.setTargetAtTime(220 + 420 * k, t, 0.4);
      const rush = Math.min(1, p.v / 45);
      this.air.gain.setTargetAtTime(Math.max(SILENT, rush * rush * 0.35), t, 0.4);
      this.bp.frequency.setTargetAtTime(600 + 900 * rush, t, 0.5);
    },
  };
}

// The cabin chime: two soft notes, high then low.
defineSfx(
  'chime',
  (k) => {
    k.tone('sine', k.t, 988, 988, 0.08, 0.005, 0.9);
    k.tone('sine', k.t + 0.45, 784, 784, 0.08, 0.005, 1.1);
  },
  { reverb: 0.15 },
);

// The door: a latch, and a clunk as it comes home or down.
defineSfx(
  'door',
  (k) => {
    k.noise(k.s.white, k.t, 0.03, [['bandpass', 3200, 2]], 0.18, 0.001, 0.02);
    k.noise(k.s.brown, k.t + 0.02, 0.2, [['lowpass', 260]], 0.7, 0.004, 0.14);
  },
  { reverb: 0.2 },
);

// The tyres touching down: two quick chirps and a thump.
defineSfx(
  'touchdown',
  (k) => {
    for (const dt of [0, 0.09]) k.noise(k.s.white, k.t + dt, 0.12, [['bandpass', 1600, 1.5]], 0.35, 0.002, 0.09);
    k.tone('sine', k.t, 85, 50, 0.4, 0.004, 0.2);
  },
  { reverb: 0.3 },
);

// Tarmac underfoot: a short, hard scuff with a little grit in it.
defineSurface('tarmac', {
  thump: 0.75,
  step({ s, t, sharp, noise }) {
    noise(s.white, t, 0.06, [['bandpass', 1900, 1.1]], 0.5 * sharp, 0.001, 0.03);
    noise(s.pink, t + 0.005, 0.12, [['bandpass', 650, 0.9]], 0.4 * sharp, 0.003, 0.05);
  },
});
