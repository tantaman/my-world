// What a race sounds like, made from noise and oscillators like every other
// sound here (audio/soundscape.js), on a bus of its own ('racing'):
//
//   your engine     a rasp from two saw waves an octave apart, rising with
//                   the revs through each gear and dropping as it changes
//                   up, through a filter that opens as you put your foot
//                   down; the exhaust's rumble under it
//   theirs          a thinner buzz from each of the two nearest others,
//                   heard from where they are, rising and falling as they
//                   go by
//   the tyres       a squeal as they scrub, and the patter of the kerbs
//   the crowd       a murmur from the grandstand, louder as you near it,
//                   and a roar at the start and the finish
//   one-offs        (sound.sfx) a light coming on, the lights going out, a
//                   lap, the chequered flag, the barrier, getting in
//
// What the layer hears comes from `heard`, which index.js fills in every
// frame:
//   heard.you      null, or { x, y, z, rpm (0..1), gear, throttle, skid, kerb, speed }
//   heard.others   [{ x, y, z, v }]: the two nearest of the others
//   heard.crowd    null, or { x, y, z, cheer (0..1) }: the grandstand

import { setPos, SILENT } from '../audio/kit.js';
import { defineSfx } from '../audio/sfx.js';

const BUS = 'racing';
const IDLE = 38; // Hz, the engine ticking over...
const REDLINE = 150; // ...and flat out in a gear
const THEIRS = [60, 210]; // Hz, the others' engines slow and flat out
const HEARD_TO = 900; // m: past this, the race isn't heard at all

function panner(ctx, s, ref, send) {
  const p = ctx.createPanner();
  p.panningModel = s.offline ? 'equalpower' : 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = ref;
  p.rolloffFactor = 1;
  p.maxDistance = 20000;
  const { dry, wet } = s.bus(BUS);
  p.connect(dry);
  const g = ctx.createGain();
  g.gain.value = send;
  p.connect(g).connect(wet);
  return p;
}
const loop = (ctx, buf) => {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(0, Math.random() * 2);
  return src;
};

export function raceSounds(heard) {
  return {
    name: 'racing',

    build(s) {
      const ctx = s.ctx;
      // your engine, and your tyres
      const near = panner(ctx, s, 6, 0.12);
      const out = ctx.createGain();
      out.gain.value = SILENT;
      out.connect(near);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 600;
      tone.Q.value = 2.5;
      const buzz = ctx.createGain();
      buzz.gain.value = 0.16;
      tone.connect(buzz).connect(out);
      const saws = [1, 2.01].map((k, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = IDLE * k;
        const g = ctx.createGain();
        g.gain.value = i ? 0.45 : 1;
        o.connect(g).connect(tone);
        o.start();
        return o;
      });
      const rumbleLp = ctx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.value = 180;
      const rumble = ctx.createGain();
      rumble.gain.value = SILENT;
      loop(ctx, s.brown).connect(rumbleLp).connect(rumble).connect(out);
      const squealBp = ctx.createBiquadFilter();
      squealBp.type = 'bandpass';
      squealBp.frequency.value = 1100;
      squealBp.Q.value = 6;
      const squeal = ctx.createGain();
      squeal.gain.value = SILENT;
      loop(ctx, s.pink).connect(squealBp).connect(squeal).connect(out);
      const kerbBp = ctx.createBiquadFilter();
      kerbBp.type = 'bandpass';
      kerbBp.frequency.value = 160;
      kerbBp.Q.value = 1.5;
      const kerb = ctx.createGain();
      kerb.gain.value = SILENT;
      const trem = ctx.createOscillator();
      trem.frequency.value = 18;
      const tremDepth = ctx.createGain();
      tremDepth.gain.value = 0;
      trem.connect(tremDepth).connect(kerb.gain);
      trem.start();
      loop(ctx, s.brown).connect(kerbBp).connect(kerb).connect(out);
      // theirs, each from where it is
      const others = [0, 1].map(() => {
        const p = panner(ctx, s, 10, 0.2);
        const g = ctx.createGain();
        g.gain.value = SILENT;
        g.connect(p);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        lp.connect(g);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = THEIRS[0];
        o.connect(lp);
        o.start();
        return { p, g, o };
      });
      // the crowd
      const stand = panner(ctx, s, 25, 0.35);
      const crowdBp = ctx.createBiquadFilter();
      crowdBp.type = 'bandpass';
      crowdBp.frequency.value = 700;
      crowdBp.Q.value = 0.6;
      const crowd = ctx.createGain();
      crowd.gain.value = SILENT;
      loop(ctx, s.pink).connect(crowdBp).connect(crowd).connect(stand);
      Object.assign(this, { near, out, tone, saws, rumble, rumbleLp, squeal, squealBp, kerb, tremDepth, others, stand, crowd, crowdBp });
    },

    update(s, t) {
      const l = s.listener;
      const far = (p) => !l || Math.hypot(p.x - l.x, p.z - l.z) > HEARD_TO;
      const y = heard.you;
      this.out.gain.setTargetAtTime(y ? 1 : SILENT, t, y ? 0.15 : 0.5);
      if (y) {
        setPos(this.near, y.x, y.y + 0.6, y.z);
        const f = IDLE + (REDLINE - IDLE) * y.rpm;
        const lift = 1 + (y.gear - 1) * 0.06; // a little higher in each gear
        this.saws[0].frequency.setTargetAtTime(f * lift, t, 0.05);
        this.saws[1].frequency.setTargetAtTime(f * lift * 2.01, t, 0.05);
        this.tone.frequency.setTargetAtTime(380 + 1900 * y.throttle * (0.4 + 0.6 * y.rpm), t, 0.08);
        this.rumble.gain.setTargetAtTime(0.25 + 0.45 * y.throttle, t, 0.1);
        this.rumbleLp.frequency.setTargetAtTime(140 + 160 * y.rpm, t, 0.1);
        this.squeal.gain.setTargetAtTime(Math.max(SILENT, y.skid * y.skid * 0.5), t, 0.05);
        this.squealBp.frequency.setTargetAtTime(950 + 400 * y.skid, t, 0.1);
        const k = y.kerb ? Math.min(1, Math.abs(y.speed) / 20) : 0;
        this.kerb.gain.setTargetAtTime(k * 0.35, t, 0.05);
        this.tremDepth.gain.setTargetAtTime(k * 0.3, t, 0.05);
      }
      const list = heard.others || [];
      this.others.forEach((o, i) => {
        const car = list[i];
        const on = car && !far(car);
        o.g.gain.setTargetAtTime(on ? 0.07 : SILENT, t, 0.2);
        if (!on) return;
        setPos(o.p, car.x, car.y + 0.6, car.z);
        o.o.frequency.setTargetAtTime(THEIRS[0] + (THEIRS[1] - THEIRS[0]) * Math.min(1, car.v / 45), t, 0.1);
      });
      const c = heard.crowd;
      const on = c && !far(c);
      this.crowd.gain.setTargetAtTime(on ? 0.05 + 0.5 * c.cheer : SILENT, t, on && c.cheer > 0.3 ? 0.1 : 0.8);
      if (on) {
        setPos(this.stand, c.x, c.y + 3, c.z);
        this.crowdBp.frequency.setTargetAtTime(600 + 500 * c.cheer, t, 0.3);
      }
    },
  };
}

// A light coming on over the line: a short beep.
defineSfx('race-light', (k) => k.tone('square', k.t, 660, 660, 0.09, 0.004, 0.22), { reverb: 0.2 });
// ...and all of them going out: higher, and longer.
defineSfx('race-go', (k) => k.tone('square', k.t, 990, 990, 0.12, 0.004, 0.6), { reverb: 0.25 });
// A lap done: two quick notes.
defineSfx('race-lap', (k) => {
  k.tone('triangle', k.t, 880, 880, 0.1, 0.004, 0.15);
  k.tone('triangle', k.t + 0.14, 1175, 1175, 0.1, 0.004, 0.3);
});
// The chequered flag: three rising notes.
defineSfx('race-flag', (k) => {
  [784, 988, 1319].forEach((f, i) => k.tone('triangle', k.t + i * 0.16, f, f, 0.12, 0.005, i === 2 ? 0.8 : 0.18));
});
// Into the barrier: a thump, and steel or concrete ringing.
defineSfx('race-bump', (k) => {
  k.noise(k.s.brown, k.t, 0.3, [['lowpass', 300]], 0.6 + k.size * 0.6, 0.003, 0.2);
  k.noise(k.s.white, k.t, 0.15, [['bandpass', 2400, 3]], 0.15 + k.size * 0.2, 0.002, 0.1);
  k.tone('triangle', k.t, 520, 480, 0.06 * k.size, 0.002, 0.35);
});
// Getting in: a door-less clunk into the seat, and the engine catching.
defineSfx('race-start', (k) => {
  k.noise(k.s.brown, k.t, 0.2, [['lowpass', 220]], 0.5, 0.004, 0.14);
  k.tone('sawtooth', k.t + 0.25, 30, 70, 0.12, 0.05, 0.5);
  k.noise(k.s.brown, k.t + 0.25, 0.7, [['lowpass', 260]], 0.4, 0.05, 0.5);
});
