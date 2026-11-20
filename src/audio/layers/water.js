// Water, and what lives by it.
//
// Running water is heard from where it actually runs: from up to three
// sources (env.water.sources, from ChunkManager.waterAround), each placed in
// 3D on the water, and as loud as there is water there, running fast, or
// white. Each source is made of:
//
//   - Bubbles. The babble of a brook is thousands of small bubbles, each
//     ringing for a moment at a pitch set by its size and rising as it
//     closes. Here a few sine voices per source ring one bubble after
//     another: small, high, quick ones on a stream; bigger, deeper ones on a
//     river; and many more of them where the water is white.
//   - A rush of noise under them, hissing on white water, with a low roar
//     under a river or a cascade.
//   - Air and earth: far-off water loses its high end first, and where a
//     bank stands between you and the water (source.hidden, 0..1) it's
//     muffled.
//
// Still water laps at the shore in slow swells (env.water.still, sx, sy, sz).
// And standing in the water, you hear it gurgle round your legs, more the
// faster it goes past them (env.wading).
//
// By still water, something small plops in now and then, and from dusk the
// frogs start up.

import { lerp, smoothstep } from '../../noise.js';
import { rand } from '../../core/geom.js';

// Bubble voices per source, and how far ahead (s) bubbles are scheduled.
const VOICES = 4;
const AHEAD = 0.12;
// Bubbles each voice rings per second: on calm running water, on white water.
const RATE = [4, 20];
// Pitch range (Hz) of a stream's bubbles, and of a big river's.
const STREAM_PITCH = [520, 2300];
const RIVER_PITCH = [170, 760];
// How fast the high end goes with distance (Hz of cutoff at 1 m, falling as 1/d).
const AIR = 60000;

export const water = {
  name: 'water',

  build(s, t) {
    const ctx = s.ctx;
    const { dry, wet } = s.bus('ambience');
    const place = (send = 0.35) => {
      const p = ctx.createPanner();
      p.panningModel = s.offline ? 'equalpower' : 'HRTF';
      // loudness is worked out from how near the water is; this only places it
      p.distanceModel = 'linear';
      p.rolloffFactor = 0;
      p.connect(dry);
      const g = ctx.createGain();
      g.gain.value = send;
      p.connect(g).connect(wet);
      return p;
    };
    const loop = (buf, at) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.start(at, rand(0, 2));
      return src;
    };
    const gain = (v = 0) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const filter = (type, f, q = 0.7) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    // A place water is heard from: rush, roar and bubbles into one muffler.
    const source = (voices, send) => {
      const pan = place(send);
      const level = gain();
      const muffle = filter('lowpass', 9000, 0.5);
      level.connect(muffle).connect(pan);
      const hiss = filter('bandpass', 1200, 0.55);
      const rush = gain();
      loop(s.pink, t).connect(hiss).connect(rush).connect(level);
      const low = filter('lowpass', 320, 0.6);
      const roar = gain();
      loop(s.brown, t).connect(low).connect(roar).connect(level);
      const bubbles = [];
      for (let i = 0; i < voices; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const g = gain();
        osc.connect(g).connect(level);
        osc.start(t);
        bubbles.push({ osc, g, next: t + rand(0, 0.3) });
      }
      return { pan, level, muffle, hiss, rush, roar, bubbles };
    };
    this.sources = [0, 1, 2].map(() => source(VOICES, 0.35));
    this.legs = source(3, 0.12);
    const still = place();
    const lp = filter('lowpass', 380);
    const lap = gain();
    loop(s.brown, t).connect(lp).connect(lap).connect(still);
    Object.assign(this, { still, lap, lapNext: t });
  },

  update(s, t, dt, env) {
    const w = env.water;
    if (!w) return;
    const l = s.listener || { x: 0, y: 0, z: 0 };
    for (let i = 0; i < this.sources.length; i++) {
      const v = this.sources[i];
      const src = i < (w.count ?? 0) ? w.sources[i] : null;
      if (!src) {
        v.level.gain.setTargetAtTime(0, t, 0.6);
        continue;
      }
      s.moveTo(v.pan, src.x, src.y, src.z, t);
      const dist = Math.hypot(src.x - l.x, src.y - l.y, src.z - l.z);
      const { loud, foam, big } = src;
      v.level.gain.setTargetAtTime(loud * 0.8, t, 0.5);
      // far off, and behind a bank, the high end goes first
      const cut = Math.min(9000, AIR / Math.max(1, dist)) * (1 - 0.82 * (src.hidden ?? 0));
      v.muffle.frequency.setTargetAtTime(Math.max(350, cut), t, 0.4);
      v.hiss.frequency.setTargetAtTime(lerp(900, 2400, foam) * (1 - 0.45 * big), t, 0.5);
      v.rush.gain.setTargetAtTime(0.06 + 0.5 * foam + 0.08 * big, t, 0.5);
      v.roar.gain.setTargetAtTime(0.55 * big + 0.3 * foam * foam, t, 0.5);
      const pitch = [lerp(STREAM_PITCH[0], RIVER_PITCH[0], big), lerp(STREAM_PITCH[1], RIVER_PITCH[1], big)];
      bubble(v, t, lerp(RATE[0], RATE[1], foam), pitch, 1 - 0.45 * foam);
    }

    // round your legs, as the water goes by them
    const wd = env.wading;
    const legs = this.legs;
    const deep = wd && wd.depth > 0.04 ? smoothstep(0.04, 0.6, wd.depth) : 0;
    const by = deep ? Math.min(2.5, wd.speed) : 0;
    const k = deep * smoothstep(0.05, 1.2, by);
    legs.level.gain.setTargetAtTime(k * 0.55, t, 0.15);
    if (k > 0.001) {
      s.moveTo(legs.pan, wd.x, wd.y, wd.z, t);
      legs.muffle.frequency.setTargetAtTime(lerp(4000, 1400, smoothstep(0.6, 1.2, wd.depth)), t, 0.3);
      legs.hiss.frequency.setTargetAtTime(lerp(500, 900, by / 2.5), t, 0.3);
      legs.rush.gain.setTargetAtTime(0.25 + 0.2 * by, t, 0.2);
      legs.roar.gain.setTargetAtTime(0.25 * deep, t, 0.3);
      bubble(legs, t, lerp(3, 16, by / 2.5), [260, 1100], 0.8);
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

// Ring the next bubble on each of a source's voices that is due one: a sine
// at a pitch between pitch[0] and pitch[1] (more of the high, small ones),
// rising as the bubble closes, ringing for a few dozen cycles.
function bubble(v, t, rate, pitch, amp) {
  for (const b of v.bubbles) {
    if (b.next > t + AHEAD) continue;
    const at = Math.max(t + 0.005, b.next);
    const f0 = pitch[0] * (pitch[1] / pitch[0]) ** Math.sqrt(Math.random());
    const ring = rand(14, 34) / f0;
    b.osc.frequency.setValueAtTime(f0, at);
    b.osc.frequency.exponentialRampToValueAtTime(f0 * rand(1.25, 1.9), at + ring);
    // bigger (deeper) bubbles are louder
    const a = amp * rand(0.25, 0.7) * (0.6 + 0.6 * Math.sqrt(pitch[0] / f0));
    b.g.gain.setValueAtTime(0, at);
    b.g.gain.linearRampToValueAtTime(a, at + 0.003);
    b.g.gain.exponentialRampToValueAtTime(0.0005, at + ring);
    b.g.gain.setValueAtTime(0, at + ring + 0.002);
    // the gaps between them are as uneven as rain
    b.next = at + ring + 0.004 - Math.log(1 - Math.random() * 0.98) / rate;
  }
}

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
