// What a car sounds like, made from noise and oscillators like every other
// sound here (audio/soundscape.js), on a bus of its own ('cars'):
//
//   the engine   its firing: a growl a cylinder's worth of beats to each turn
//                of the crank, through a filter that opens up as you put your
//                foot down; deeper idling, rising through each gear and
//                dropping as it changes up
//   the tyres    a hiss on tarmac, a grinding crunch on gravel, a rumble off
//                the road, rising with speed; and the air going by
//   one-offs     (sound.sfx) the door, the engine starting, the horn, a bump
//                into something, and a splash
//
// It's heard from where the car is. What the layer hears comes from `source`,
// which index.js fills in every frame:
//   source.car   null, or { x, y, z, revs (0..1), load (0..1), v (m/s),
//                under ('paved', 'gravel', 'ground', 'snow'), idle, red (rpm), cyl }

import { setPos, SILENT } from '../audio/kit.js';
import { defineSfx } from '../audio/sfx.js';

const BUS = 'cars';
const HEARD_TO = 400; // m: past this, nothing
// How the tyres sound on each kind of ground: [hiss, crunch, rumble].
const TYRES = { paved: [1, 0, 0.15], gravel: [0.3, 1, 0.4], ground: [0.15, 0.3, 1], snow: [0.4, 0.2, 0.4] };

export function carSounds(source) {
  return {
    name: 'cars',

    build(s) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus(BUS);
      const panner = ctx.createPanner();
      panner.panningModel = s.offline ? 'equalpower' : 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 6;
      panner.rolloffFactor = 1;
      panner.maxDistance = 5000;
      panner.connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.12;
      panner.connect(send).connect(wet);
      const out = ctx.createGain();
      out.gain.value = SILENT;
      out.connect(panner);
      // the engine: two saws a hair apart for the firing, and a square an
      // octave down for the weight of it, through a lowpass that opens with the throttle
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 400;
      tone.Q.value = 2.5;
      const engine = ctx.createGain();
      engine.gain.value = 0.16;
      tone.connect(engine).connect(out);
      const osc = ['sawtooth', 'sawtooth', 'square'].map((type) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = 40;
        o.connect(tone);
        o.start();
        return o;
      });
      const loop = (buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.start(0, Math.random() * 2);
        return src;
      };
      // the exhaust's burble
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      const burble = ctx.createGain();
      burble.gain.value = SILENT;
      loop(s.brown).connect(lp).connect(burble).connect(out);
      // the tyres: a hiss, a crunch, a rumble
      const band = (buf, type, f, q) => {
        const b = ctx.createBiquadFilter();
        b.type = type;
        b.frequency.value = f;
        b.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = SILENT;
        loop(buf).connect(b).connect(g).connect(out);
        return { b, g };
      };
      const hiss = band(s.pink, 'bandpass', 1400, 0.6);
      const crunch = band(s.white, 'bandpass', 2600, 1.4);
      const rumble = band(s.brown, 'lowpass', 120, 0.7);
      const air = band(s.pink, 'bandpass', 700, 0.4);
      Object.assign(this, { panner, out, tone, osc, lp, burble, hiss, crunch, rumble, air });
    },

    update(s, t) {
      const c = source.car;
      const l = s.listener;
      const heard = !!c && (!l || Math.hypot(c.x - l.x, c.z - l.z) < HEARD_TO);
      this.out.gain.setTargetAtTime(heard ? 1 : SILENT, t, heard ? 0.15 : 0.4);
      if (!heard) return;
      setPos(this.panner, c.x, c.y + 0.6, c.z);
      // the crank's speed, and its firing: cyl/2 beats a turn (four stroke)
      const rpm = c.idle + (c.red - c.idle) * c.revs;
      const fire = (rpm / 60) * (c.cyl / 2);
      this.osc[0].frequency.setTargetAtTime(fire, t, 0.08);
      this.osc[1].frequency.setTargetAtTime(fire * 1.006, t, 0.08);
      this.osc[2].frequency.setTargetAtTime(fire / 2, t, 0.08);
      const load = Math.min(1, c.load);
      this.tone.frequency.setTargetAtTime(220 + fire * (1.6 + 2.4 * load), t, 0.1);
      this.burble.gain.setTargetAtTime(0.06 + 0.25 * load, t, 0.15);
      this.lp.frequency.setTargetAtTime(120 + fire * 1.2, t, 0.15);
      // the tyres, and the air
      const v = Math.min(1, c.v / 35);
      const [h, cr, ru] = TYRES[c.under] || TYRES.ground;
      this.hiss.g.gain.setTargetAtTime(Math.max(SILENT, h * v * 0.22), t, 0.2);
      this.hiss.b.frequency.setTargetAtTime(900 + 1400 * v, t, 0.3);
      this.crunch.g.gain.setTargetAtTime(Math.max(SILENT, cr * Math.sqrt(v) * 0.16), t, 0.15);
      this.rumble.g.gain.setTargetAtTime(Math.max(SILENT, ru * Math.sqrt(v) * 0.5), t, 0.15);
      this.air.g.gain.setTargetAtTime(Math.max(SILENT, v * v * 0.2), t, 0.3);
    },
  };
}

// A car door shutting: the latch, and the thump of it coming home.
defineSfx(
  'car-door',
  (k) => {
    k.noise(k.s.white, k.t, 0.025, [['bandpass', 2600, 2]], 0.2, 0.001, 0.02);
    k.noise(k.s.brown, k.t + 0.012, 0.22, [['lowpass', 220]], 0.9, 0.003, 0.12);
    k.tone('sine', k.t + 0.01, 95, 60, 0.35, 0.003, 0.1);
  },
  { reverb: 0.15 },
);

// The engine catching: the starter whirring, and a rising roar.
defineSfx(
  'car-start',
  (k) => {
    for (let i = 0; i < 5; i++) k.tone('sawtooth', k.t + i * 0.09, 70, 60, 0.08, 0.01, 0.07);
    k.tone('sawtooth', k.t + 0.48, 45, 110, 0.18, 0.02, 0.5);
    k.noise(k.s.brown, k.t + 0.48, 0.6, [['lowpass', 300]], 0.6, 0.02, 0.4);
  },
  { reverb: 0.1 },
);

// The horn: two notes a third apart, together.
defineSfx(
  'horn',
  (k) => {
    for (const f of [415, 523]) k.tone('square', k.t, f, f, 0.07, 0.01, 0.42);
  },
  { reverb: 0.3 },
);

// Running into something: a crump and a rattle, as hard as opts.gain (0..1).
defineSfx(
  'car-bump',
  (k) => {
    const g = k.opts.gain ?? 1;
    k.noise(k.s.brown, k.t, 0.3, [['lowpass', 400]], g, 0.002, 0.2);
    k.noise(k.s.white, k.t + 0.01, 0.2, [['bandpass', 1800, 1.2]], 0.35 * g, 0.002, 0.12);
  },
  { reverb: 0.2 },
);

// Driving into water: a wash thrown up either side.
defineSfx(
  'car-splash',
  (k) => {
    k.noise(k.s.pink, k.t, 0.6, [['bandpass', 900, 0.6]], 0.6, 0.03, 0.45);
  },
  { reverb: 0.25 },
);
