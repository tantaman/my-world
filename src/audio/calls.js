// Animal calls, made from noise and oscillators like the rest of the
// soundscape, and placed in 3D at the animal that made them: a deer's alarm
// snort from the edge of the wood, a pack howling across the valley, a
// squirrel scolding from a trunk, bees about your knees.
//
// Played through Soundscape.call(kind, x, y, z, opts). A new animal's voice is
// a defineCall() away, from wherever the animal lives:
//
//   defineCall('quack', 20, ({ t, voice }) => {
//     voice('sawtooth', t, [[0, 700], [0.15, 500]], [[0.01, 0.2], [0.18, 0]], { filter: [['bandpass', 1200, 2]] });
//   });
//
// The number is how far it carries: the distance (m) at which it is heard at
// full strength, falling away beyond.
//
// What a call is handed (k):
//   s, ctx, t       the soundscape, its audio context, and when to start
//   kind, opts      what was asked for (opts.delay and opts.gain are applied
//                   for you; anything else is the call's own business)
//   out, nodes      where to connect, and what to tidy away afterwards
//   noise(buffer, at, duration, filters, peak, attack, decay, rate?)  -> its gain node
//   voice(type, at, pitch, gain, { filter, vib, vibDepth, harm })     -> its gain node
//                   a pitched voice with a pitch contour [[time, hz], ...]
//                   and a gain contour [[time, gain], ...], times from `at`
//   end             when it will have finished; noise() and voice() keep
//                   this up to date, so only set it if you build by hand

import { rand } from '../core/geom.js';
import { envelope as env, filtered, setPos } from './kit.js';
import { SONGS } from './layers/birds.js';

const CALLS = new Map(); // kind -> { reach, play }

export function defineCall(kind, reach, play) {
  CALLS.set(kind, { reach, play });
}

export const callKinds = () => [...CALLS.keys()];

export function playCall(s, kind, x, y, z, opts = {}) {
  const call = CALLS.get(kind);
  const ctx = s.ctx;
  const t = ctx.currentTime + 0.02 + (opts.delay ?? 0);
  const pan = ctx.createPanner();
  pan.panningModel = s.offline ? 'equalpower' : 'HRTF';
  pan.distanceModel = 'inverse';
  pan.refDistance = call ? call.reach : 10;
  pan.rolloffFactor = 1;
  pan.maxDistance = 10000;
  setPos(pan, x, y, z);
  const out = ctx.createGain();
  out.gain.value = opts.gain ?? 1;
  out.connect(pan);
  const { dry, wet } = s.bus('wildlife');
  pan.connect(dry);
  const send = ctx.createGain();
  const l = s.listener;
  const dist = l ? Math.hypot(x - l.x, y - l.y, z - l.z) : 20;
  send.gain.value = Math.min(0.9, 0.15 + dist / 60);
  pan.connect(send).connect(wet);
  const nodes = [out, pan, send];
  const k = { s, ctx, t, kind, opts, out, nodes, end: t + 0.5 };

  k.noise = (buf, at, dur, filters, peak, attack, decay, rate = 1) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const node = filtered(ctx, src, filters, nodes);
    const g = ctx.createGain();
    env(g.gain, at, attack, peak, decay);
    node.connect(g).connect(out);
    nodes.push(g);
    src.start(at, rand(0, 2), dur);
    k.end = Math.max(k.end, at + dur + 0.1);
    return g;
  };
  k.voice = (type, at, pitch, gain, { filter, vib, vibDepth = 0, harm = 0 } = {}) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(pitch[0][1], at);
    for (const [tt, f] of pitch.slice(1)) o.frequency.exponentialRampToValueAtTime(f, at + tt);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    for (const [tt, v] of gain) g.gain.linearRampToValueAtTime(v, at + tt);
    const node = filter ? filtered(ctx, o, filter, nodes) : o;
    node.connect(g).connect(out);
    nodes.push(g);
    const stop = at + gain[gain.length - 1][0] + 0.05;
    if (vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = vib;
      const lg = ctx.createGain();
      lg.gain.value = vibDepth;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(at);
      lfo.stop(stop);
      nodes.push(lg);
    }
    if (harm) {
      const h = ctx.createOscillator();
      h.type = 'sine';
      h.frequency.setValueAtTime(pitch[0][1] * 2, at);
      for (const [tt, f] of pitch.slice(1)) h.frequency.exponentialRampToValueAtTime(f * 2, at + tt);
      const hg = ctx.createGain();
      hg.gain.value = harm;
      h.connect(hg).connect(g);
      h.start(at);
      h.stop(stop);
      nodes.push(hg);
    }
    o.start(at);
    o.stop(stop);
    k.end = Math.max(k.end, stop);
    return g;
  };

  if (call) call.play(k);
  s.cleanup(k.end, nodes, 0.8);
}

// ── The voices ──────────────────────────────────────────────────────────────

// A deer's alarm: a hard blow through the nose, often twice.
defineCall('snort', 24, ({ s, t, noise }) => {
  const n = Math.random() < 0.6 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.5, 0.8);
    noise(s.white, at, 0.5, [['bandpass', rand(600, 800), 1.4], ['lowpass', 2400]], 2.6, 0.015, 0.32);
    noise(s.pink, at, 0.5, [['bandpass', 300, 1]], 1.2, 0.02, 0.25);
  }
});

// A hoof stamped, a rabbit's thump, hooves going by. opts.size: 0..1
function footfall({ s, ctx, t, kind, opts, out, nodes, noise }) {
  const big = opts.size ?? 0.6;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(kind === 'thump' ? 110 : 130 - big * 50, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
  const g = ctx.createGain();
  env(g.gain, t, 0.003, kind === 'hoof' ? 0.35 * big : 0.8, 0.09);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.2);
  nodes.push(g);
  noise(s.white, t, 0.05, [['bandpass', kind === 'hoof' ? 900 : 1400, 1.5]], kind === 'hoof' ? 0.15 * big : 0.25, 0.001, 0.03);
}
defineCall('stamp', 6, footfall);
defineCall('thump', 5, footfall);
defineCall('hoof', 7, footfall);

// A bull elk: a low growl climbing into a long eerie whistle, then
// dropping away into grunts.
defineCall('bugle', 60, ({ s, t, noise, voice }) => {
  voice('sawtooth', t, [[0, 140], [0.5, 220]], [[0.05, 0.12], [0.45, 0.1], [0.6, 0]], { filter: [['bandpass', 600, 1.2]] });
  const w = t + 0.45;
  voice('sine', w, [[0, 650], [0.7, 1700], [1.6, 1850], [2.0, 1200], [2.3, 900]], [[0.1, 0.22], [1.7, 0.2], [2.1, 0.1], [2.35, 0]], { vib: 6, vibDepth: 18, harm: 0.25 });
  noise(s.white, w + 0.6, 1.4, [['bandpass', 1800, 4]], 0.18, 0.3, 0.9);
  for (let i = 0; i < 4; i++) {
    const at = w + 2.6 + i * rand(0.35, 0.5);
    voice('sawtooth', at, [[0, 110], [0.15, 80]], [[0.02, 0.2], [0.16, 0]], { filter: [['lowpass', 500]] });
  }
});

// An elk cow's alarm bark.
defineCall('bark', 30, ({ s, t, noise, voice }) => {
  voice('sawtooth', t, [[0, 420], [0.18, 300]], [[0.01, 0.25], [0.2, 0]], { filter: [['bandpass', 900, 1.2]] });
  noise(s.white, t, 0.25, [['bandpass', 1200, 1.5]], 0.5, 0.005, 0.15);
});

// One wolf's howl: a slow rise to a long held note, a fall at the end.
// opts.pitch: Hz, so a pack can sing in different voices
defineCall('howl', 80, ({ t, opts, voice }) => {
  const f = opts.pitch ?? rand(380, 520);
  const hold = rand(1.8, 3.0);
  voice('triangle', t, [[0, f * 0.75], [0.7, f * 1.25], [0.7 + hold, f * 1.18], [1.5 + hold, f * 0.8]], [[0.4, 0.2], [0.7 + hold, 0.18], [1.55 + hold, 0]], { vib: 4.5, vibDepth: 7, harm: 0.15, filter: [['lowpass', 2200]] });
});

// A fox's yapping bark.
defineCall('yip', 30, ({ s, t, noise, voice }) => {
  const n = 2 + Math.floor(rand(0, 3));
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.5, 0.8);
    voice('sawtooth', at, [[0, 900], [0.06, 1300], [0.18, 700]], [[0.015, 0.2], [0.2, 0]], { filter: [['bandpass', 1400, 1.5]] });
    noise(s.white, at, 0.15, [['bandpass', 2500, 2]], 0.25, 0.005, 0.1);
  }
});

// A squirrel scolding: a fast run of "kuk"s, then a wheezy "quaa".
defineCall('chatter', 12, ({ s, t, noise, voice }) => {
  const n = 7 + Math.floor(rand(0, 8));
  for (let i = 0; i < n; i++) {
    const at = t + i * 0.075;
    noise(s.white, at, 0.04, [['bandpass', rand(2800, 3600), 4]], 0.45, 0.002, 0.025);
    voice('sine', at, [[0, 2600], [0.03, 2000]], [[0.004, 0.05], [0.035, 0]]);
  }
  noise(s.pink, t + n * 0.075 + 0.1, 0.5, [['bandpass', 2400, 2]], 0.4, 0.05, 0.35);
});

// A chipmunk: a run of sharp chips.
defineCall('chip', 8, ({ t, voice }) => {
  const n = 3 + Math.floor(rand(0, 6));
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.22, 0.32);
    voice('sine', at, [[0, 3600], [0.03, 2900]], [[0.003, 0.1], [0.04, 0]]);
  }
});

// A mouse.
defineCall('squeak', 2, ({ t, voice }) => {
  for (let i = 0; i < 2; i++) voice('sine', t + i * 0.12, [[0, 7500], [0.05, 8500]], [[0.005, 0.05], [0.06, 0]]);
});

// A black bear blowing and popping its jaw.
defineCall('huff', 10, ({ s, t, noise }) => {
  for (let i = 0; i < 3; i++) {
    const at = t + i * rand(0.35, 0.5);
    noise(s.brown, at, 0.4, [['lowpass', 500]], 0.9, 0.02, 0.25);
    noise(s.white, at, 0.3, [['bandpass', 700, 1]], 0.18, 0.02, 0.2);
  }
  noise(s.white, t + 1.5, 0.03, [['bandpass', 1500, 3]], 0.6, 0.001, 0.02);
});

// A moose's low croak.
defineCall('grunt', 16, ({ t, voice }) => {
  voice('sawtooth', t, [[0, 110], [0.5, 85]], [[0.05, 0.25], [0.55, 0]], { filter: [['lowpass', 420]] });
});

// A rattlesnake's buzz: hissing noise chopped fast. opts.dur: seconds
defineCall('rattle', 5, (k) => {
  const { s, ctx, t, opts, out, nodes } = k;
  const src = ctx.createBufferSource();
  src.buffer = s.white;
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 6000;
  hp.Q.value = 0.7;
  const am = ctx.createGain();
  am.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = rand(45, 60);
  const lg = ctx.createGain();
  lg.gain.value = 0.5;
  lfo.connect(lg).connect(am.gain);
  const g = ctx.createGain();
  const dur = opts.dur ?? 2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.35, t + 0.1);
  g.gain.setValueAtTime(0.35, t + dur - 0.3);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(hp).connect(am).connect(g).connect(out);
  src.start(t, 0, dur);
  lfo.start(t);
  lfo.stop(t + dur);
  nodes.push(hp, am, lg, g);
  k.end = t + dur;
});

// A flock taking off: a whirr of wings. opts.count: how many birds
defineCall('flush', 8, ({ s, ctx, t, opts, nodes, noise }) => {
  const n = opts.count ?? 4;
  for (let i = 0; i < n; i++) {
    const at = t + rand(0, 0.25);
    const g = noise(s.pink, at, 0.6, [['bandpass', rand(1400, 2600), 1.2]], 0.6, 0.01, 0.4);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(16, 24);
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(g.gain);
    lfo.start(at);
    lfo.stop(at + 0.5);
    nodes.push(lg);
  }
});

// Crows: harsh, nasal, in threes.
defineCall('caw', 40, ({ s, t, noise, voice }) => {
  const n = 2 + Math.floor(rand(0, 3));
  const f = rand(480, 600);
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.42, 0.55);
    voice('sawtooth', at, [[0, f], [0.1, f * 1.05], [0.3, f * 0.85]], [[0.02, 0.22], [0.25, 0.15], [0.32, 0]], { filter: [['bandpass', 1300, 1.8]] });
    noise(s.white, at, 0.32, [['bandpass', 1500, 2]], 0.25, 0.02, 0.28);
  }
});

// A red-tail's raspy descending scream: keee-eeer.
defineCall('hawk', 70, ({ s, t, noise, voice }) => {
  voice('sawtooth', t, [[0, 3400], [0.25, 3100], [1.1, 2000]], [[0.06, 0.08], [0.8, 0.07], [1.15, 0]], { filter: [['bandpass', 2800, 3]] });
  noise(s.white, t, 1.2, [['bandpass', 3000, 3]], 0.3, 0.08, 1.0);
});

// Great horned owl: hoo, h-hoo, hoo, hoo.
defineCall('hoot', 45, ({ t, voice }) => {
  const f = rand(320, 380);
  const pattern = [0.42, 0.14, 0.2, 0.5, 0.55];
  const gaps = [0.32, 0.08, 0.28, 0.32, 0];
  let at = t;
  pattern.forEach((d, i) => {
    voice('sine', at, [[0, f * (i === 1 ? 1.06 : 1)], [d, f * 0.94]], [[0.05, 0.14], [d - 0.03, 0.12], [d, 0]], { filter: [['lowpass', 700]], harm: 0.05 });
    at += d + gaps[i];
  });
});

// A bumblebee passing: a low wobbling drone.
defineCall('buzz', 1.2, ({ t, voice }) => {
  const f = rand(150, 210);
  const dur = rand(0.5, 1.2);
  voice('sawtooth', t, [[0, f], [dur * 0.5, f * rand(0.92, 1.1)], [dur, f * rand(0.85, 1.05)]], [[0.1, 0.06], [dur - 0.15, 0.06], [dur, 0]], { filter: [['lowpass', 1100], ['peaking', 400, 1]], vib: 11, vibDepth: 5 });
});

// A perched songbird: borrow the ambient singers' phrases.
// opts.song: which (see SONGS in layers/birds.js)
defineCall('song', 14, (k) => {
  const { s, t, opts, out } = k;
  const sing = SONGS[opts.song ?? 'chips'];
  if (sing) k.end = sing(s, out, t, rand(0.06, 0.11));
});
