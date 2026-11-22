// What Hell sounds like. One layer for the soundscape (audio/soundscape.js),
// made of a few beds that each region turns up or down (MIX):
//
//   drone    the weight of the place: far down, always there
//   wail     "sighs, complaints, and ululations loud": a crowd a long way
//            off, its voices rising and falling
//   sigh     Limbo's: breath, and no more
//   wind     the hurricane of the second circle; and, thin and high, the
//            wind over the ice
//   rain     the third circle's
//   fire     a low roar and its crackle: the tombs, the sand, the eighth ditch
//   seethe   what boils and bubbles: the marsh, the blood, the pitch
//   falls    the brook going over the brink
//
// It is told where you are each frame: state.inside (0..1), state.region
// (plan.REGIONS' ids), state.falls (0..1, how near the falls are).

import { rand } from '../core/geom.js';
import { envelope } from '../audio/kit.js';

const BUS = 'hell';
const EASE = 0.8; // s: how quickly a bed follows what the region asks of it

// How much of each bed a region has.
const MIX = {
  vestibule: { wail: 1, wind: 0.12 },
  acheron: { wail: 0.8, seethe: 0.15 },
  limbo: { sigh: 1, wail: 0.08 },
  lustful: { wind: 1, wail: 0.55 },
  gluttons: { rain: 1, wail: 0.35 },
  avaricious: { wail: 0.8 },
  styx: { seethe: 0.8, wail: 0.45 },
  heretics: { fire: 0.8, wail: 0.5 },
  blood: { seethe: 1, wail: 0.55 },
  wood: { wail: 0.7, wind: 0.08 },
  sand: { fire: 0.55, wail: 0.5 },
  brink: { fire: 0.2, wail: 0.2 },
  malebolge: { wail: 0.65, fire: 0.15, seethe: 0.2 },
  well: { ice: 0.5, wail: 0.1 },
  cocytus: { ice: 1 },
};
const BEDS = ['wail', 'sigh', 'wind', 'rain', 'fire', 'seethe', 'ice', 'falls'];

// state: { inside, region, falls }, kept up to date by whoever knows
export function hellSounds(state) {
  let made = null;
  const level = Object.fromEntries(BEDS.map((b) => [b, 0]));
  let nextCrackle = 0;
  let nextBubble = 0;
  let nextCry = 0;

  // A looping noise through filters into a gain (0 to begin with), panned.
  const bed = (s, t, buffer, filters, pan = 0) => {
    const ctx = s.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    let node = src;
    const made = [];
    for (const [type, f, q] of filters) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      if (q) b.Q.value = q;
      node = node.connect(b);
      made.push(b);
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(g).connect(p).connect(s.bus(BUS).dry);
    src.start(t, rand(0, 4));
    return { g, filters: made };
  };

  function build(s, t) {
    made = {
      drone: bed(s, t, s.brown, [['lowpass', 95, 0.8]]),
      // voices: narrow bands of noise that wander about where a voice sits
      wail: [-0.7, -0.25, 0.3, 0.75].map((pan, i) => ({ ...bed(s, t, s.pink, [['bandpass', 380 + i * 130, 9], ['bandpass', 900 + i * 210, 4]], pan), at: 0, to: 0, f: 400 + i * 120 })),
      sigh: [-0.5, 0.5].map((pan) => bed(s, t, s.pink, [['bandpass', 520, 0.7], ['lowpass', 1400, 0.5]], pan)),
      wind: [-0.6, 0.6].map((pan) => bed(s, t, s.pink, [['bandpass', 600, 2.2], ['lowpass', 2600, 0.5]], pan)),
      rain: [bed(s, t, s.white, [['highpass', 2400, 0.5], ['lowpass', 9000, 0.5]]), bed(s, t, s.pink, [['bandpass', 900, 0.6]])],
      fire: bed(s, t, s.brown, [['bandpass', 240, 0.6]]),
      seethe: bed(s, t, s.brown, [['bandpass', 170, 1.2]]),
      ice: [-0.5, 0.5].map((pan) => bed(s, t, s.white, [['bandpass', 2300, 14], ['highpass', 900, 0.5]], pan)),
      falls: bed(s, t, s.pink, [['lowpass', 1500, 0.4], ['highpass', 90, 0.5]]),
    };
  }

  // A short sound of its own, placed nowhere in particular.
  const blip = (s, t, make) => {
    const g = s.ctx.createGain();
    g.connect(s.bus(BUS).dry);
    make(g);
  };
  const crackle = (s, t, loud) =>
    blip(s, t, (out) => {
      const src = s.ctx.createBufferSource();
      src.buffer = s.white;
      const bp = s.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rand(1800, 5200);
      bp.Q.value = 2;
      envelope(out.gain, t, 0.001, rand(0.05, 0.16) * loud, rand(0.012, 0.05));
      src.connect(bp).connect(out);
      src.start(t, rand(0, 2), 0.12);
    });
  const bubble = (s, t, loud) =>
    blip(s, t, (out) => {
      const o = s.ctx.createOscillator();
      const f = rand(70, 190);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * rand(1.6, 2.6), t + 0.12);
      envelope(out.gain, t, 0.01, rand(0.06, 0.14) * loud, 0.1);
      o.connect(out);
      o.start(t);
      o.stop(t + 0.4);
    });
  // one voice, nearer than the rest: a cry that rises and breaks
  const cry = (s, t, loud) =>
    blip(s, t, (out) => {
      const o = s.ctx.createOscillator();
      o.type = 'sawtooth';
      const f = rand(180, 420);
      const len = rand(0.9, 2.2);
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * rand(1.15, 1.5), t + len * 0.45);
      o.frequency.linearRampToValueAtTime(f * rand(0.7, 0.95), t + len);
      const bp = s.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rand(600, 1100);
      bp.Q.value = 3;
      const lp = s.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1300;
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(rand(0.012, 0.03) * loud, t + len * 0.4);
      out.gain.linearRampToValueAtTime(0, t + len);
      o.connect(bp).connect(lp).connect(out);
      o.start(t);
      o.stop(t + len + 0.1);
    });

  return {
    name: 'hell',
    build() {
      made = null; // (made the first time you're down there, not before)
    },
    update(s, t, dt) {
      const inside = state.inside;
      if (!made) {
        if (inside < 0.01) return;
        build(s, t);
      }
      const mix = MIX[state.region] || {};
      const k = 1 - Math.exp(-dt / EASE);
      for (const b of BEDS) level[b] += ((b === 'falls' ? state.falls : mix[b] || 0) * inside - level[b]) * k;
      const set = (g, v) => g.gain.setTargetAtTime(v, t, 0.2);

      set(made.drone.g, 0.22 * inside);
      // each voice drifts to a new pitch and loudness every few seconds
      for (const v of made.wail) {
        if (t > v.at) {
          v.at = t + rand(1.5, 5);
          v.to = rand(0.2, 1);
          v.f = rand(260, 780);
        }
        v.filters[0].frequency.setTargetAtTime(v.f, t, 1.1);
        v.filters[1].frequency.setTargetAtTime(v.f * rand(2.1, 2.6), t, 1.1);
        set(v.g, 0.55 * level.wail * v.to);
      }
      made.sigh.forEach((b, i) => set(b.g, 0.09 * level.sigh * (0.6 + 0.4 * Math.sin(t * 0.37 + i * 2.1))));
      made.wind.forEach((b, i) => {
        const gust = 0.6 + 0.4 * Math.sin(t * 0.23 + i * 1.7) * Math.sin(t * 0.61 + i);
        b.filters[0].frequency.setTargetAtTime(420 + 520 * gust, t, 0.6);
        set(b.g, 0.5 * level.wind * gust);
      });
      set(made.rain[0].g, 0.11 * level.rain);
      set(made.rain[1].g, 0.14 * level.rain);
      set(made.fire.g, 0.3 * level.fire);
      set(made.seethe.g, 0.3 * level.seethe * (0.8 + 0.2 * Math.sin(t * 1.3)));
      made.ice.forEach((b, i) => {
        b.filters[0].frequency.setTargetAtTime(1900 + 900 * Math.sin(t * 0.17 + i * 2.4), t, 0.8);
        set(b.g, 0.28 * level.ice * (0.7 + 0.3 * Math.sin(t * 0.4 + i)));
      });
      set(made.falls.g, 0.5 * level.falls);

      if (level.fire > 0.05 && t > nextCrackle) {
        nextCrackle = t + rand(0.03, 0.3) / level.fire;
        crackle(s, t, level.fire);
      }
      if (level.seethe > 0.05 && t > nextBubble) {
        nextBubble = t + rand(0.12, 0.8) / level.seethe;
        bubble(s, t, level.seethe);
      }
      if (level.wail > 0.2 && t > nextCry) {
        nextCry = t + rand(2.5, 9) / level.wail;
        cry(s, t, level.wail);
      }
    },
  };
}
