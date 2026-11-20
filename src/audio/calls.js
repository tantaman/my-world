// Animal calls, made from noise and oscillators like the rest of the
// soundscape, and placed in 3D at the animal that made them: a deer's alarm
// snort from the edge of the wood, a pack howling across the valley, a
// squirrel scolding from a trunk, bees about your knees.
//
// playCall(soundscape, kind, x, y, z, opts) is used through Soundscape.call().

const rand = (a, b) => a + Math.random() * (b - a);
const SILENT = 0.0001;

function env(param, t, attack, peak, decay) {
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack);
  param.exponentialRampToValueAtTime(SILENT, t + attack + decay);
}

// How far each call carries: the panner's reference distance (m).
const REACH = {
  snort: 24, stamp: 6, bugle: 60, bark: 30, howl: 80, yip: 30, chatter: 12, chip: 8, huff: 10, grunt: 16,
  rattle: 5, flush: 8, caw: 40, hawk: 70, hoot: 45, buzz: 1.2, thump: 5, squeak: 2, hoof: 7, song: 14,
};

export function playCall(s, kind, x, y, z, opts = {}) {
  const ctx = s.ctx;
  const t = ctx.currentTime + 0.02 + (opts.delay ?? 0);
  const pan = ctx.createPanner();
  pan.panningModel = s.offline ? 'equalpower' : 'HRTF';
  pan.distanceModel = 'inverse';
  pan.refDistance = REACH[kind] ?? 10;
  pan.rolloffFactor = 1;
  pan.maxDistance = 10000;
  if (pan.positionX) {
    pan.positionX.value = x;
    pan.positionY.value = y;
    pan.positionZ.value = z;
  } else pan.setPosition(x, y, z);
  const out = ctx.createGain();
  out.gain.value = opts.gain ?? 1;
  out.connect(pan);
  pan.connect(s.master);
  const send = ctx.createGain();
  const l = s.listener;
  const dist = l ? Math.hypot(x - l.x, y - l.y, z - l.z) : 20;
  send.gain.value = Math.min(0.9, 0.15 + dist / 60);
  pan.connect(send).connect(s.reverb);
  const nodes = [out, pan, send];
  let end = t + 0.5;

  const noise = (buf, at, dur, filters, peak, attack, decay, rate = 1) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    let node = src;
    for (const f of filters) {
      const b = ctx.createBiquadFilter();
      b.type = f[0];
      b.frequency.value = f[1];
      if (f[2]) b.Q.value = f[2];
      node.connect(b);
      node = b;
      nodes.push(b);
    }
    const g = ctx.createGain();
    env(g.gain, at, attack, peak, decay);
    node.connect(g).connect(out);
    nodes.push(g);
    src.start(at, rand(0, 2), dur);
    end = Math.max(end, at + dur + 0.1);
    return g;
  };
  // A pitched voice with an arbitrary pitch contour [[time, hz], ...] and
  // gain contour [[time, gain], ...] (times relative to `at`).
  const voice = (type, at, pitch, gain, { filter, vib, vibDepth = 0, harm = 0 } = {}) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(pitch[0][1], at);
    for (const [tt, f] of pitch.slice(1)) o.frequency.exponentialRampToValueAtTime(f, at + tt);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    for (const [tt, v] of gain) g.gain.linearRampToValueAtTime(v, at + tt);
    let node = o;
    if (filter) {
      for (const f of filter) {
        const b = ctx.createBiquadFilter();
        b.type = f[0];
        b.frequency.value = f[1];
        if (f[2]) b.Q.value = f[2];
        node.connect(b);
        node = b;
        nodes.push(b);
      }
    }
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
    end = Math.max(end, stop);
    return g;
  };

  switch (kind) {
    case 'snort': {
      // a deer's alarm: a hard blow through the nose, often twice
      const n = Math.random() < 0.6 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const at = t + i * rand(0.5, 0.8);
        noise(s.white, at, 0.5, [['bandpass', rand(600, 800), 1.4], ['lowpass', 2400]], 2.6, 0.015, 0.32);
        noise(s.pink, at, 0.5, [['bandpass', 300, 1]], 1.2, 0.02, 0.25);
      }
      break;
    }
    case 'stamp':
    case 'thump':
    case 'hoof': {
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
      break;
    }
    case 'bugle': {
      // a bull elk: a low growl climbing into a long eerie whistle, then
      // dropping away into grunts
      voice('sawtooth', t, [[0, 140], [0.5, 220]], [[0.05, 0.12], [0.45, 0.1], [0.6, 0]], { filter: [['bandpass', 600, 1.2]] });
      const w = t + 0.45;
      voice('sine', w, [[0, 650], [0.7, 1700], [1.6, 1850], [2.0, 1200], [2.3, 900]], [[0.1, 0.22], [1.7, 0.2], [2.1, 0.1], [2.35, 0]], { vib: 6, vibDepth: 18, harm: 0.25 });
      noise(s.white, w + 0.6, 1.4, [['bandpass', 1800, 4]], 0.18, 0.3, 0.9);
      for (let i = 0; i < 4; i++) {
        const at = w + 2.6 + i * rand(0.35, 0.5);
        voice('sawtooth', at, [[0, 110], [0.15, 80]], [[0.02, 0.2], [0.16, 0]], { filter: [['lowpass', 500]] });
      }
      break;
    }
    case 'bark': {
      // an elk cow's alarm bark
      voice('sawtooth', t, [[0, 420], [0.18, 300]], [[0.01, 0.25], [0.2, 0]], { filter: [['bandpass', 900, 1.2]] });
      noise(s.white, t, 0.25, [['bandpass', 1200, 1.5]], 0.5, 0.005, 0.15);
      break;
    }
    case 'howl': {
      // one wolf's howl: a slow rise to a long held note, a fall at the end
      const f = opts.pitch ?? rand(380, 520);
      const hold = rand(1.8, 3.0);
      voice('triangle', t, [[0, f * 0.75], [0.7, f * 1.25], [0.7 + hold, f * 1.18], [1.5 + hold, f * 0.8]], [[0.4, 0.2], [0.7 + hold, 0.18], [1.55 + hold, 0]], { vib: 4.5, vibDepth: 7, harm: 0.15, filter: [['lowpass', 2200]] });
      break;
    }
    case 'yip': {
      // a fox's yapping bark
      const n = 2 + Math.floor(rand(0, 3));
      for (let i = 0; i < n; i++) {
        const at = t + i * rand(0.5, 0.8);
        voice('sawtooth', at, [[0, 900], [0.06, 1300], [0.18, 700]], [[0.015, 0.2], [0.2, 0]], { filter: [['bandpass', 1400, 1.5]] });
        noise(s.white, at, 0.15, [['bandpass', 2500, 2]], 0.25, 0.005, 0.1);
      }
      break;
    }
    case 'chatter': {
      // a squirrel scolding: a fast run of "kuk"s, then a wheezy "quaa"
      const n = 7 + Math.floor(rand(0, 8));
      for (let i = 0; i < n; i++) {
        const at = t + i * 0.075;
        noise(s.white, at, 0.04, [['bandpass', rand(2800, 3600), 4]], 0.45, 0.002, 0.025);
        voice('sine', at, [[0, 2600], [0.03, 2000]], [[0.004, 0.05], [0.035, 0]]);
      }
      noise(s.pink, t + n * 0.075 + 0.1, 0.5, [['bandpass', 2400, 2]], 0.4, 0.05, 0.35);
      break;
    }
    case 'chip': {
      // a chipmunk: a run of sharp chips
      const n = 3 + Math.floor(rand(0, 6));
      for (let i = 0; i < n; i++) {
        const at = t + i * rand(0.22, 0.32);
        voice('sine', at, [[0, 3600], [0.03, 2900]], [[0.003, 0.1], [0.04, 0]]);
      }
      break;
    }
    case 'squeak': {
      for (let i = 0; i < 2; i++) voice('sine', t + i * 0.12, [[0, 7500], [0.05, 8500]], [[0.005, 0.05], [0.06, 0]]);
      break;
    }
    case 'huff': {
      // a black bear blowing and popping its jaw
      for (let i = 0; i < 3; i++) {
        const at = t + i * rand(0.35, 0.5);
        noise(s.brown, at, 0.4, [['lowpass', 500]], 0.9, 0.02, 0.25);
        noise(s.white, at, 0.3, [['bandpass', 700, 1]], 0.18, 0.02, 0.2);
      }
      noise(s.white, t + 1.5, 0.03, [['bandpass', 1500, 3]], 0.6, 0.001, 0.02);
      break;
    }
    case 'grunt': {
      // a moose's low croak
      voice('sawtooth', t, [[0, 110], [0.5, 85]], [[0.05, 0.25], [0.55, 0]], { filter: [['lowpass', 420]] });
      break;
    }
    case 'rattle': {
      // a rattlesnake's buzz: hissing noise chopped fast
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
      end = t + dur;
      break;
    }
    case 'flush': {
      // a flock taking off: a whirr of wings
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
      break;
    }
    case 'caw': {
      // crows: harsh, nasal, in threes
      const n = 2 + Math.floor(rand(0, 3));
      const f = rand(480, 600);
      for (let i = 0; i < n; i++) {
        const at = t + i * rand(0.42, 0.55);
        voice('sawtooth', at, [[0, f], [0.1, f * 1.05], [0.3, f * 0.85]], [[0.02, 0.22], [0.25, 0.15], [0.32, 0]], { filter: [['bandpass', 1300, 1.8]] });
        noise(s.white, at, 0.32, [['bandpass', 1500, 2]], 0.25, 0.02, 0.28);
      }
      break;
    }
    case 'hawk': {
      // a red-tail's raspy descending scream: keee-eeer
      voice('sawtooth', t, [[0, 3400], [0.25, 3100], [1.1, 2000]], [[0.06, 0.08], [0.8, 0.07], [1.15, 0]], { filter: [['bandpass', 2800, 3]] });
      noise(s.white, t, 1.2, [['bandpass', 3000, 3]], 0.3, 0.08, 1.0);
      break;
    }
    case 'hoot': {
      // great horned owl: hoo, h-hoo, hoo, hoo
      const f = rand(320, 380);
      const pattern = [0.42, 0.14, 0.2, 0.5, 0.55];
      const gaps = [0.32, 0.08, 0.28, 0.32, 0];
      let at = t;
      pattern.forEach((d, i) => {
        voice('sine', at, [[0, f * (i === 1 ? 1.06 : 1)], [d, f * 0.94]], [[0.05, 0.14], [d - 0.03, 0.12], [d, 0]], { filter: [['lowpass', 700]], harm: 0.05 });
        at += d + gaps[i];
      });
      break;
    }
    case 'buzz': {
      // a bumblebee passing: a low wobbling drone
      const f = rand(150, 210);
      const dur = rand(0.5, 1.2);
      voice('sawtooth', t, [[0, f], [dur * 0.5, f * rand(0.92, 1.1)], [dur, f * rand(0.85, 1.05)]], [[0.1, 0.06], [dur - 0.15, 0.06], [dur, 0]], { filter: [['lowpass', 1100], ['peaking', 400, 1]], vib: 11, vibDepth: 5 });
      break;
    }
    case 'song': {
      // a perched songbird: borrow the ambient singers' phrases
      const fn = s[`_${opts.song ?? 'chips'}`];
      if (fn) end = fn.call(s, out, t, rand(0.06, 0.11));
      break;
    }
    default:
      break;
  }
  if (!s.offline) setTimeout(() => nodes.forEach((n) => n.disconnect()), (end - ctx.currentTime + 0.8) * 1000);
}
