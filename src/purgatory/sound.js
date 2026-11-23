// What Purgatory sounds like. One layer for the soundscape
// (audio/soundscape.js), made of a few beds that where you are turns up or
// down, and the singing:
//
//   sea      the billow beating on the shore, heard from the plain
//   wind     high on the mountain, round the terraces
//   birds    "the little birds upon their tops", in the forest on the top
//   fire     the burning of the seventh terrace, and its wall
//   quake    the mountain trembling
//   choir    voices singing what the poem has them sing where it has them:
//            "In exitu Israel" from the angel's boat coming in at dawn, the
//            Miserere on the slope, the Salve Regina in the valley, the Te
//            Deum through the gate, the Agnus Dei in the smoke, the Gloria
//            when the mountain shakes, "Summae Deus clementiae" in the fire;
//            and on the top, one voice, a lady's, singing as she goes
//
// Singing ("Ah me! how different are these entrances from the Infernal! for
// with anthems here one enters, and below with wild laments") is a few
// voices, each a reed through three formants that make a vowel of it, on a
// plainsong line: a tone it is recited on, and a cadence back down to the
// final, round and round.
//
// It is told where you are each frame: state.inside (0..1), state.region
// (plan.REGIONS' ids), state.sea, high, birds, fire, quake (0..1 each);
// state.chant, something sung for a while wherever you are ('deum',
// 'gloria', 'agnus'), for state.chantFor s from when it was set; and
// state.moments, short sounds to make now ('wing', 'door', 'voice'), which
// it takes off the list as it makes them.
//
// Also the stone of the terraces, underfoot: defineSurface('stone').

import { rand } from '../core/geom.js';
import { envelope } from '../audio/kit.js';
import { defineSurface } from '../audio/footsteps.js';

const BUS = 'purgatory';
const EASE = 1.2; // s: how quickly a bed follows where you are

// Stone underfoot: a hard heel on it, the knock of the rock under that.
defineSurface('stone', {
  thump: 0.65,
  step({ s, t, run, sharp, noise }) {
    noise(s.white, t, 0.05, [['bandpass', rand(1900, 2500), 2]], 0.5 * sharp, 0.001, 0.022);
    noise(s.pink, t + 0.004, 0.14, [['bandpass', rand(500, 700), 1.4]], 0.35 * sharp, 0.002, 0.06 - run * 0.012);
    for (let i = 0; i < 2; i++) noise(s.white, t + rand(0.01, 0.05), 0.02, [['bandpass', 5200, 3]], rand(0.05, 0.12), 0.001, 0.006);
  },
});

// The vowels a voice is made to sing: its three formants (Hz).
const VOWELS = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  e: [400, 1700, 2600],
  u: [325, 700, 2530],
  i: [300, 2200, 3000],
};
const VOWEL_LIST = ['a', 'e', 'o', 'a', 'u', 'i', 'a', 'o'];
// A plainsong line: notes as semitones over the final, and how many beats
// each; the line goes round. Recited on the tone, and down to the final.
const LINES = {
  // a psalm tone: up to the tone, a long recitation, a fall to the final
  psalm: [
    [0, 1],
    [2, 1],
    [7, 1],
    [7, 1],
    [7, 1],
    [7, 1],
    [9, 1],
    [7, 2],
    [7, 1],
    [7, 1],
    [5, 1],
    [7, 1],
    [4, 1],
    [2, 1],
    [0, 3],
  ],
  // an antiphon: a line that rises and turns and comes home
  antiphon: [
    [0, 1],
    [3, 1],
    [5, 2],
    [7, 1],
    [5, 1],
    [3, 1],
    [5, 1],
    [7, 2],
    [10, 1],
    [7, 1],
    [5, 1],
    [3, 1],
    [2, 1],
    [0, 3],
  ],
  // a hymn: four even phrases
  hymn: [
    [0, 1],
    [2, 1],
    [4, 1],
    [5, 2],
    [4, 1],
    [2, 1],
    [4, 2],
    [7, 1],
    [5, 1],
    [4, 1],
    [2, 2],
    [4, 1],
    [2, 1],
    [0, 3],
  ],
};
// What is sung: which line, on what final (MIDI), how fast (beats a second),
// how many voices, how loud, and whether a lady sings it alone.
const CHANTS = {
  exitu: { line: 'psalm', final: 43, beat: 2.4, voices: 4, loud: 0.8 },
  miserere: { line: 'psalm', final: 45, beat: 1.8, voices: 3, loud: 0.65 },
  salve: { line: 'antiphon', final: 50, beat: 1.5, voices: 4, loud: 0.8 },
  deum: { line: 'hymn', final: 48, beat: 2.2, voices: 5, loud: 1 },
  agnus: { line: 'antiphon', final: 45, beat: 1.2, voices: 3, loud: 0.6 },
  gloria: { line: 'hymn', final: 50, beat: 2.8, voices: 5, loud: 1 },
  summae: { line: 'antiphon', final: 47, beat: 1.4, voices: 4, loud: 0.75 },
  pater: { line: 'psalm', final: 43, beat: 1.6, voices: 3, loud: 0.5 },
  lady: { line: 'antiphon', final: 62, beat: 1.7, voices: 1, loud: 0.55, alone: true },
};
// What is sung in each region, as you come into it (unless something else is).
// ("In exitu Israel" is the boat's, while it comes in: index.js says when.)
const SUNG = { slope: 'miserere', valley: 'salve', pride: 'pater', wrath: 'agnus', lust: 'summae', eden: 'lady' };
// How much of each bed a region has.
const MIX = {
  shore: { sea: 1 },
  plain: { sea: 0.6 },
  foot: { sea: 0.25, wind: 0.1 },
  terrace: { wind: 0.2 },
  slope: { wind: 0.3 },
  valley: { wind: 0.1 },
  ledge: { wind: 0.4 },
  pride: { wind: 0.5 },
  envy: { wind: 0.55 },
  wrath: { wind: 0.2 },
  sloth: { wind: 0.6 },
  avarice: { wind: 0.6 },
  gluttony: { wind: 0.6 },
  lust: { wind: 0.45 },
  eden: { wind: 0.15 },
};
const BEDS = ['sea', 'wind', 'birds', 'fire', 'quake'];
const VOICE_LOUD = 0.028; // one voice's gain, at its loudest
const CHOIR_EASE = 2.5; // s: how slowly the singing comes in, and goes

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function mountSounds(state) {
  let made = null;
  const level = Object.fromEntries(BEDS.map((b) => [b, 0]));
  let nextBird = 0;
  let nextCrackle = 0;
  let nextWave = 0;
  // the singing: what is being sung, where in its line, and how loud
  const choir = { chant: null, note: 0, at: 0, loud: 0, vowel: 0, until: 0 };

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

  // A voice: a reed (sawtooth, a little vibrato) through three formants.
  const voice = (s, t, pan, female) => {
    const ctx = s.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const vib = ctx.createOscillator();
    vib.frequency.value = rand(4.8, 5.8);
    const depth = ctx.createGain();
    depth.gain.value = rand(9, 15); // cents
    vib.connect(depth).connect(o.detune);
    o.detune.value = rand(-6, 6);
    const sum = ctx.createGain();
    sum.gain.value = 1;
    const formants = [0, 1, 2].map((i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = VOWELS.a[i] * (female ? 1.18 : 1);
      f.Q.value = [9, 11, 13][i];
      const g = ctx.createGain();
      g.gain.value = [1, 0.55, 0.22][i];
      o.connect(f).connect(g).connect(sum);
      return f;
    });
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    sum.connect(g).connect(p);
    p.connect(s.bus(BUS).dry);
    p.connect(s.bus(BUS).wet);
    o.start(t);
    vib.start(t);
    return { o, g, formants, female };
  };

  function build(s, t) {
    made = {
      sea: [
        bed(s, t, s.brown, [['lowpass', 380, 0.6]], -0.3),
        bed(
          s,
          t,
          s.pink,
          [
            ['bandpass', 900, 0.5],
            ['lowpass', 2400, 0.4],
          ],
          0.3,
        ),
      ],
      wind: [-0.6, 0.6].map((pan) =>
        bed(
          s,
          t,
          s.pink,
          [
            ['bandpass', 520, 1.6],
            ['lowpass', 2200, 0.5],
          ],
          pan,
        ),
      ),
      fire: bed(s, t, s.brown, [['bandpass', 260, 0.6]]),
      quake: bed(s, t, s.brown, [['lowpass', 70, 1.2]]),
      voices: [-0.5, 0.45, -0.15, 0.25, 0.6].map((pan, i) => voice(s, t, pan, false)),
      lady: voice(s, t, 0.2, true),
    };
  }

  // A short sound of its own, placed nowhere in particular.
  const blip = (s, make) => {
    const g = s.ctx.createGain();
    g.connect(s.bus(BUS).dry);
    make(g);
  };
  // a bird in the trees: a few quick rising and falling whistles
  const bird = (s, t, loud) =>
    blip(s, (out) => {
      const o = s.ctx.createOscillator();
      o.type = 'sine';
      const f = rand(2200, 4200);
      const n = 2 + Math.floor(rand(0, 5));
      let at = t;
      out.gain.setValueAtTime(0, t);
      for (let i = 0; i < n; i++) {
        const len = rand(0.05, 0.14);
        o.frequency.setValueAtTime(f * rand(0.85, 1.1), at);
        o.frequency.exponentialRampToValueAtTime(f * rand(1.1, 1.6), at + len * 0.6);
        out.gain.linearRampToValueAtTime(rand(0.012, 0.03) * loud, at + 0.01);
        out.gain.linearRampToValueAtTime(0, at + len);
        at += len + rand(0.02, 0.09);
      }
      o.connect(out);
      o.start(t);
      o.stop(at + 0.1);
    });
  // a wave breaking along the shore
  const wave = (s, t, loud) =>
    blip(s, (out) => {
      const src = s.ctx.createBufferSource();
      src.buffer = s.pink;
      const lp = s.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, t);
      lp.frequency.linearRampToValueAtTime(2400, t + 0.9);
      lp.frequency.linearRampToValueAtTime(600, t + 3.2);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(0.28 * loud, t + 0.9);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      src.connect(lp).connect(out);
      src.start(t, rand(0, 3), 4);
    });
  const crackle = (s, t, loud) =>
    blip(s, (out) => {
      const src = s.ctx.createBufferSource();
      src.buffer = s.white;
      const bp = s.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rand(1500, 4800);
      bp.Q.value = 2;
      envelope(out.gain, t, 0.001, rand(0.04, 0.12) * loud, rand(0.012, 0.05));
      src.connect(bp).connect(out);
      src.start(t, rand(0, 2), 0.12);
    });

  // The singing: on to the next note of the line when this one is done,
  // each voice gliding to it, a vowel to a note.
  function sing(s, t, dt) {
    if (state.chantFor > 0) {
      choir.until = t + state.chantFor;
      state.chantFor = 0;
    }
    const want = state.chant && t < choir.until ? state.chant : SUNG[state.region] || null;
    const c = want ? CHANTS[want] : null;
    // a new chant starts at the top of its line, once the last has faded
    if (want !== choir.chant && choir.loud < 0.05) {
      choir.chant = want;
      choir.note = 0;
      choir.at = t;
    }
    const k = 1 - Math.exp(-dt / CHOIR_EASE);
    const target = c && want === choir.chant ? c.loud * state.inside : 0;
    choir.loud += (target - choir.loud) * k;
    const cur = choir.chant ? CHANTS[choir.chant] : null;
    if (!cur) {
      for (const v of [...made.voices, made.lady]) v.g.gain.setTargetAtTime(0, t, 0.4);
      return;
    }
    const line = LINES[cur.line];
    if (t >= choir.at) {
      const [step, beats] = line[choir.note % line.length];
      choir.note++;
      choir.vowel++;
      const len = beats / cur.beat;
      choir.at = t + len;
      const vowel = VOWELS[VOWEL_LIST[choir.vowel % VOWEL_LIST.length]];
      // the voices: the line in octaves, a drone on the final, and a fifth
      const parts = cur.alone ? [] : [0, -12, 'drone', 7, 12].slice(0, cur.voices);
      made.voices.forEach((v, i) => {
        const part = parts[i];
        if (part === undefined) {
          v.g.gain.setTargetAtTime(0, t, 0.3);
          return;
        }
        const n = part === 'drone' ? cur.final - 12 : cur.final + step + part;
        v.o.frequency.setTargetAtTime(midi(n), t, 0.06);
        v.formants.forEach((f, j) => f.frequency.setTargetAtTime(vowel[j], t, 0.08));
        const breath = 0.85 + 0.15 * Math.sin(t * 0.7 + i);
        v.g.gain.setTargetAtTime(VOICE_LOUD * choir.loud * breath * (part === 'drone' ? 0.7 : 1), t, 0.12);
      });
      const lady = made.lady;
      if (cur.alone) {
        lady.o.frequency.setTargetAtTime(midi(cur.final + step), t, 0.05);
        lady.formants.forEach((f, j) => f.frequency.setTargetAtTime(vowel[j] * 1.18, t, 0.08));
        lady.g.gain.setTargetAtTime(VOICE_LOUD * 1.2 * choir.loud, t, 0.1);
      } else lady.g.gain.setTargetAtTime(0, t, 0.3);
    }
  }

  return {
    name: 'purgatory',
    build() {
      made = null; // (made the first time you're there, not before)
    },
    update(s, t, dt) {
      const inside = state.inside;
      if (!made) {
        if (inside < 0.01) return;
        build(s, t);
      }
      const mix = MIX[state.region] || {};
      const k = 1 - Math.exp(-dt / EASE);
      const want = { sea: Math.max(mix.sea || 0, state.sea), wind: Math.max(mix.wind || 0, state.high * 0.6), birds: state.birds, fire: state.fire, quake: state.quake };
      for (const b of BEDS) level[b] += ((want[b] || 0) * inside - level[b]) * k;
      const set = (g, v) => g.gain.setTargetAtTime(v, t, 0.2);
      made.sea.forEach((b, i) => set(b.g, (i ? 0.08 : 0.25) * level.sea * (0.75 + 0.25 * Math.sin(t * 0.21 + i))));
      made.wind.forEach((b, i) => {
        const gust = 0.6 + 0.4 * Math.sin(t * 0.19 + i * 1.7) * Math.sin(t * 0.53 + i);
        b.filters[0].frequency.setTargetAtTime(380 + 420 * gust, t, 0.8);
        set(b.g, 0.3 * level.wind * gust);
      });
      set(made.fire.g, 0.35 * level.fire);
      set(made.quake.g, 0.9 * level.quake * (0.7 + 0.3 * Math.sin(t * 9)));
      if (level.sea > 0.1 && t > nextWave) {
        nextWave = t + rand(5, 11);
        wave(s, t, level.sea);
      }
      if (level.birds > 0.05 && t > nextBird) {
        nextBird = t + rand(0.4, 3) / level.birds;
        bird(s, t, level.birds);
      }
      if (level.fire > 0.05 && t > nextCrackle) {
        nextCrackle = t + rand(0.03, 0.25) / level.fire;
        crackle(s, t, level.fire);
      }
      sing(s, t, dt);
      while (state.moments.length) moment(s, state.moments.shift());
    },
  };
}

// A short sound, now, wherever you are: an angel's wing ('wing'), the gate
// opening ('door'), a voice flying past ('voice'). s: the soundscape.
function moment(s, kind) {
  const ctx = s.ctx;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.connect(s.bus(BUS).dry);
  out.connect(s.bus(BUS).wet);
  const noise = (buffer, filters, peak, attack, decay, start = t) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    let node = src;
    for (const [type, f, q, to] of filters) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.setValueAtTime(f, start);
      if (to) b.frequency.exponentialRampToValueAtTime(to, start + attack + decay);
      if (q) b.Q.value = q;
      node = node.connect(b);
    }
    const g = ctx.createGain();
    envelope(g.gain, start, attack, peak, decay);
    node.connect(g).connect(out);
    src.start(start, rand(0, 2), attack + decay * 4);
  };
  if (kind === 'wing') {
    // a great soft beat of air, and a bell-like shimmer on it
    noise(s.pink, [['bandpass', 500, 0.7, 1400]], 0.5, 0.18, 0.45);
    for (const f of [1318, 1976, 2637]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      envelope(g.gain, t + 0.1, 0.02, 0.025, 1.6);
      o.connect(g).connect(out);
      o.start(t + 0.1);
      o.stop(t + 3);
    }
  } else if (kind === 'door') {
    // the hinges, "massive and sonorous": a long groan and a roar
    noise(s.brown, [['bandpass', 90, 2, 60]], 1.2, 0.4, 2.4);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(48, t + 2.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = ctx.createGain();
    envelope(g.gain, t, 0.3, 0.12, 2.2);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + 4);
  } else if (kind === 'voice') {
    // a cry going over, near and then away
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(200, 300), t);
    o.frequency.linearRampToValueAtTime(rand(150, 220), t + 1.8);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 3;
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-1, t);
    p.pan.linearRampToValueAtTime(1, t + 2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.6);
    g.gain.linearRampToValueAtTime(0, t + 2);
    o.connect(bp).connect(g).connect(p).connect(out);
    o.start(t);
    o.stop(t + 2.2);
    noise(s.pink, [['bandpass', 700, 0.8, 2000]], 0.15, 0.6, 0.8);
  }
}
