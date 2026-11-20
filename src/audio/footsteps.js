// Footsteps follow the stride of the walk and run animation, and change with
// the ground under you: packed earth and grit on paths, a swish in grass,
// crackling leaf litter in the woods, a squeaky crunch in snow, a slosh and a splash and falling drops
// in water. They get sharper when you run, there's a thud when you land a
// jump, and out of your depth each stroke sweeps through the water.
//
// A new kind of ground (snow, a plank floor) is a defineSurface() away:
//
//   defineSurface('planks', {
//     thump: 0.9,                      // how much of the body's weight you hear
//     step(k) { k.noise(k.s.pink, k.t, 0.15, [['bandpass', 300, 2]], 0.8, 0.002, 0.09); },
//   });
//
// What a surface is handed (k):
//   s, ctx, t       the soundscape, its audio context, when the foot lands
//   kind            'step' | 'jump' | 'land' | 'swim'      land: kind === 'land'
//   run             0..1                                   sharp: 1 + run / 2
//   strength        how hard you landed; in water, how deep it is (m)
//   noise(buffer, at, duration, filters, peak, attack, decay)
//   drip(at, amp)   a drop falling back into water

import { rand } from '../core/geom.js';
import { envelope, filtered } from './kit.js';

const SURFACES = new Map();

// thump: 0..1, or (kind) => 0..1
export function defineSurface(name, surface) {
  SURFACES.set(name, surface);
}

export function playFootstep(s, surface, run = 0, kind = 'step', strength = 1) {
  const ground = SURFACES.get(surface) || SURFACES.get('litter');
  const ctx = s.ctx;
  const t = ctx.currentTime + 0.004;
  const land = kind === 'land';
  const vol = (0.16 + 0.16 * run) * rand(0.82, 1.12) * (land ? 1.2 + strength : kind === 'jump' ? 0.8 : 1);

  const { dry, wet } = s.bus('effects');
  const out = ctx.createGain();
  out.gain.value = vol;
  out.connect(dry);
  const send = ctx.createGain();
  send.gain.value = 0.12;
  out.connect(send).connect(wet);
  const nodes = [out, send];

  // the weight of the body landing
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  const tg = ctx.createGain();
  thump.frequency.setValueAtTime(rand(95, 125) * (land ? 0.7 : 1), t);
  thump.frequency.exponentialRampToValueAtTime(48, t + 0.08);
  const weight = typeof ground.thump === 'function' ? ground.thump(kind) : ground.thump;
  envelope(tg.gain, t, 0.004, weight * (land ? 1.6 : 1), land ? 0.16 : 0.07);
  thump.connect(tg).connect(out);
  thump.start(t);
  thump.stop(t + 0.25);
  nodes.push(tg);

  const jitter = () => rand(0.85, 1.15);
  const k = { s, ctx, t, kind, land, run, strength, sharp: 1 + run * 0.5 };
  k.noise = (buf, at, dur, filters, peak, attack, decay) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = jitter();
    const node = filtered(ctx, src, filters, nodes, jitter);
    const g = ctx.createGain();
    envelope(g.gain, at, attack, peak, decay);
    node.connect(g).connect(out);
    nodes.push(g);
    src.start(at, rand(0, 2), dur);
  };
  // a drop falling back into the water: a tiny rising chirp
  k.drip = (at, amp) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = rand(700, 1500);
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 1.7, at + 0.025);
    const g = ctx.createGain();
    envelope(g.gain, at, 0.002, amp, 0.035);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.06);
    nodes.push(g);
  };

  ground.step(k);
  thump.onended = () => s.cleanup(ctx.currentTime, nodes, 0.4);
}

// ── What is underfoot ───────────────────────────────────────────────────────

defineSurface('dirt', {
  thump: 0.7,
  step({ s, t, sharp, noise }) {
    noise(s.white, t, 0.2, [['bandpass', 850, 0.9]], 0.9 * sharp, 0.003, 0.085);
    noise(s.white, t + 0.006, 0.08, [['highpass', 3200]], 0.22 * sharp, 0.002, 0.035);
    // a little gravel grit
    for (let i = 0; i < 4; i++) noise(s.white, t + rand(0.005, 0.07), 0.02, [['bandpass', 4500, 3]], rand(0.08, 0.2), 0.001, 0.008);
  },
});

defineSurface('grass', {
  thump: 0.35,
  step({ s, t, run, sharp, noise }) {
    noise(s.pink, t, 0.35, [['highpass', 1300], ['bandpass', 3300, 0.6]], 0.75 * sharp, 0.025, 0.18 - run * 0.05);
    noise(s.white, t + 0.03, 0.2, [['highpass', 5000]], 0.12, 0.03, 0.1);
  },
});

// Leaf litter: a crackle of little dry snaps over a soft crush.
defineSurface('litter', {
  thump: 0.7,
  step({ s, t, run, sharp, noise }) {
    noise(s.pink, t, 0.25, [['bandpass', 1800, 0.8]], 0.45 * sharp, 0.006, 0.12);
    const grains = 7 + Math.floor(rand(0, 6) + run * 4);
    for (let i = 0; i < grains; i++) {
      noise(s.white, t + rand(0, 0.13), 0.015, [['bandpass', rand(2000, 5000), 2.5]], rand(0.15, 0.5) * sharp, 0.001, rand(0.004, 0.012));
    }
  },
});

// Snow: packed down underfoot in a soft, squeaky crunch.
defineSurface('snow', {
  thump: 0.45,
  step({ s, t, run, sharp, noise }) {
    noise(s.pink, t, 0.3, [['bandpass', 1100, 1.1]], 0.55 * sharp, 0.02, 0.13 + run * 0.02);
    const grains = 10 + Math.floor(rand(0, 6) + run * 5);
    for (let i = 0; i < grains; i++) {
      noise(s.white, t + 0.01 + (i / grains) * rand(0.09, 0.13), 0.012, [['bandpass', rand(1400, 2600), 4]], rand(0.12, 0.3) * sharp, 0.001, rand(0.005, 0.01));
    }
  },
});

// Boards with air under them: a dock, a cabin floor. A hollow knock that
// rings a little in the space beneath, and a creak now and then.
defineSurface('boards', {
  thump: 0.95,
  step({ s, t, run, sharp, noise }) {
    noise(s.pink, t, 0.18, [['bandpass', rand(260, 340), 2.2]], 1.1 * sharp, 0.002, 0.11 + run * 0.03);
    noise(s.white, t + 0.004, 0.06, [['bandpass', 1900, 1.4]], 0.28 * sharp, 0.001, 0.03);
    if (Math.random() < 0.18) noise(s.pink, t + rand(0.05, 0.12), 0.3, [['bandpass', rand(600, 900), 9]], 0.25, 0.04, 0.18);
  },
});

defineSurface('water', {
  // afloat, your weight doesn't land on anything
  thump: (kind) => (kind === 'swim' ? 0 : 0.15),
  step({ s, t, kind, land, run, strength, sharp, noise, drip }) {
    if (kind === 'swim') {
      // a stroke: the arm sweeping through, and the water running off it
      noise(s.pink, t, 0.9, [['bandpass', rand(380, 560), 0.7]], 0.75, 0.12, 0.38);
      noise(s.white, t + 0.15, 0.4, [['bandpass', 2600, 1.2]], 0.14, 0.05, 0.18);
      for (let i = 0; i < 5; i++) drip(t + rand(0.25, 0.6), rand(0.03, 0.08));
      return;
    }
    const d = land ? 0.6 : Math.min(1.1, strength);
    // the leg pushing through, deeper and longer the deeper it is
    noise(s.pink, t, 0.6, [['lowpass', 1000 - d * 350], ['highpass', 140]], (0.55 + d * 0.6) * sharp, 0.015 + d * 0.035, 0.14 + d * 0.22);
    // the splash
    noise(s.white, t + 0.008, 0.3, [['bandpass', 2300 - d * 700, 0.8]], (0.3 + 0.25 * (1 - d)) * sharp * (land ? 1.6 : 1), 0.003, 0.08 + d * 0.08);
    const drops = 2 + Math.floor(rand(0, 4) + run * 3);
    for (let i = 0; i < drops; i++) drip(t + rand(0.05, 0.3), rand(0.03, 0.1));
  },
});
