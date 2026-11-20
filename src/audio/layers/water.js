// Water, and what lives by it.
//
// Running water babbles: a broad rush under a few narrow resonances that hop
// from pitch to pitch, rising as they go, like bubbles. It comes from where
// the running water near you is, and roars more where it tumbles down a
// cascade. Still water laps at the shore in slow swells. Each sits at the
// middle of the water you can hear (env.water, from ChunkManager.waterAround),
// so it comes from the right side.
//
// And by still water, something small plops in now and then, and from dusk
// the frogs start up.

import { lerp, smoothstep } from '../../noise.js';
import { rand } from '../../core/geom.js';

export const water = {
  name: 'water',

  build(s, t) {
    const ctx = s.ctx;
    const { dry, wet } = s.bus('ambience');
    const place = () => {
      const p = ctx.createPanner();
      p.panningModel = s.offline ? 'equalpower' : 'HRTF';
      // loudness is worked out from how near the water is; this only places it
      p.distanceModel = 'linear';
      p.rolloffFactor = 0;
      p.connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.35;
      p.connect(send).connect(wet);
      return p;
    };
    const loop = (buf, at) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.start(at, rand(0, 2));
      return src;
    };
    const run = place();
    const runGain = ctx.createGain();
    runGain.gain.value = 0;
    runGain.connect(run);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 850;
    bp.Q.value = 0.5;
    const rush = ctx.createGain();
    rush.gain.value = 0;
    loop(s.pink, t).connect(bp).connect(rush).connect(runGain);
    const babble = [];
    for (let i = 0; i < 5; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 11;
      f.frequency.value = rand(400, 1200);
      const g = ctx.createGain();
      g.gain.value = 0;
      loop(s.white, t).connect(f).connect(g).connect(runGain);
      babble.push({ f, g, next: t + rand(0, 0.2) });
    }
    const still = place();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const lap = ctx.createGain();
    lap.gain.value = 0;
    loop(s.brown, t).connect(lp).connect(lap).connect(still);
    Object.assign(this, { run, runGain, rush, babble, still, lap, lapNext: t });
  },

  update(s, t, dt, env) {
    const w = env.water;
    if (!w) return;
    if (w.run > 0.005) s.moveTo(this.run, w.rx, w.ry, w.rz, t);
    this.runGain.gain.setTargetAtTime(w.run * 0.75, t, 0.5);
    this.rush.gain.setTargetAtTime(0.1 + 0.55 * w.foam, t, 0.5);
    // each voice: a bubble, rising in pitch, then quiet a moment
    const horizon = t + 0.1;
    for (const b of this.babble) {
      if (b.next > horizon || w.run < 0.005) continue;
      const at = Math.max(t, b.next);
      const dur = rand(0.035, 0.13);
      const f0 = rand(380, 1250) * (1 + w.foam * 0.25);
      b.f.frequency.setTargetAtTime(f0, at, 0.008);
      b.f.frequency.setTargetAtTime(f0 * rand(1.15, 1.6), at + dur * 0.3, dur * 0.4);
      b.g.gain.setTargetAtTime(rand(0.5, 1.6), at, 0.008);
      b.g.gain.setTargetAtTime(0, at + dur * 0.7, 0.025);
      b.next = at + dur + rand(0, 0.1) * (1 - w.foam * 0.7);
    }
    // still water laps at the shore in slow swells
    if (w.still > 0.005) s.moveTo(this.still, w.sx, w.sy, w.sz, t);
    if (t >= this.lapNext) {
      const amp = w.still * rand(0.18, 0.32) * (0.6 + 0.6 * s.gust);
      this.lap.gain.setTargetAtTime(amp, t, 0.25);
      this.lap.gain.setTargetAtTime(amp * 0.15, t + rand(0.5, 0.9), 0.5);
      this.lapNext = t + rand(1.6, 3.4);
    }
  },
};

export const pondLife = {
  name: 'pond life',

  build(s, t) {
    this.nextFrog = t + rand(3, 8);
    this.nextPlop = t + rand(8, 20);
  },

  update(s, t, dt, env) {
    const w = env.water;
    if (!w) return;
    const night = env.night ?? 0;
    // frogs from dusk, by still water
    if (t >= this.nextFrog) {
      const frogs = smoothstep(0.2, 0.7, night) * smoothstep(0.03, 0.3, w.still);
      if (frogs > 0.05) frog(s, t + 0.05, w);
      this.nextFrog = t + lerp(14, 1.5, frogs) * rand(0.5, 1.5);
    }
    if (t >= this.nextPlop) {
      if (w.still > 0.08 && night < 0.5) plop(s, t + 0.05, w);
      this.nextPlop = t + rand(9, 30);
    }
  },
};

// A frog by still water: a couple of throaty, pulsing croaks.
function frog(s, t, w) {
  const { out, nodes } = s.placeAt(w.sx + rand(-6, 6), w.sy + 0.1, w.sz + rand(-6, 6));
  const ctx = s.ctx;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = rand(550, 900);
  bp.Q.value = 3;
  bp.connect(out);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const f = rand(130, 230);
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(g).connect(bp);
  const croaks = 1 + Math.floor(rand(0, 3));
  let tt = t;
  for (let c = 0; c < croaks; c++) {
    const dur = rand(0.18, 0.32);
    o.frequency.setValueAtTime(f, tt);
    o.frequency.linearRampToValueAtTime(f * 0.88, tt + dur);
    // a croak is a quick rattle of pulses
    for (let p = tt; p < tt + dur; p += 0.045) {
      g.gain.setValueAtTime(0, p);
      g.gain.linearRampToValueAtTime(0.11, p + 0.008);
      g.gain.linearRampToValueAtTime(0, p + 0.035);
    }
    tt += dur + rand(0.15, 0.4);
  }
  o.start(t);
  o.stop(tt + 0.1);
  s.cleanup(tt, [...nodes, bp, g]);
}

// Something small jumping into still water: plop, and the rings settle.
function plop(s, t, w) {
  const { out, nodes } = s.placeAt(w.sx + rand(-8, 8), w.sy, w.sz + rand(-8, 8));
  const o = s.voice(out, t, t + 0.2, 'sine', 0);
  o.osc.frequency.setValueAtTime(rand(900, 1300), t);
  o.osc.frequency.exponentialRampToValueAtTime(rand(260, 380), t + 0.07);
  s.note(o, t, 0.09, 0.09, 0.003);
  s.cleanup(t + 0.3, nodes);
}
