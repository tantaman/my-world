// Birdsong, placed in 3D in the trees around you: flute-like thrush phrases,
// two-note "fee-bee" whistles, warbler trills, chip calls, wood-pigeon coos
// and the occasional woodpecker. A dawn chorus, quieter days, a little
// evensong, silence after dark — and then an owl in the distance.

import { lerp, smoothstep } from '../../noise.js';
import { rand } from '../../core/geom.js';
import { envelope } from '../kit.js';

// Each song: (sound, dest, t, amp) -> the time it ends. A perched bird that
// wildlife puts in the world sings from the same book (calls.js, 'song').
export const SONGS = {
  // Hermit-thrush-like: a held flute note then a quick ornamented run.
  thrush(s, dest, t, amp) {
    const scale = [1760, 1975, 2217, 2637, 2960, 3322, 3520, 3951];
    const start = Math.floor(rand(0, 4));
    const notes = [{ f: scale[start], d: rand(0.3, 0.42) }];
    const n = 3 + Math.floor(rand(0, 4));
    for (let i = 0; i < n; i++) notes.push({ f: scale[Math.min(scale.length - 1, start + 1 + Math.floor(rand(0, 4)))], d: rand(0.06, 0.12) });
    const end = t + notes.reduce((sum, x) => sum + x.d + 0.025, 0);
    const v = s.voice(dest, t, end, 'sine', 0.08);
    const vib = s.ctx.createOscillator();
    vib.frequency.value = rand(22, 30);
    const vg = s.ctx.createGain();
    vg.gain.value = 18;
    vib.connect(vg).connect(v.osc.frequency);
    vib.start(t);
    vib.stop(end + 0.05);
    let tt = t;
    for (const [i, x] of notes.entries()) {
      s.freq(v, tt, x.f, x.f * (i ? rand(0.97, 1.04) : 0.985), x.d);
      s.note(v, tt, x.d, amp * (i ? 0.75 : 1), i ? 0.006 : 0.03);
      tt += x.d + 0.025;
    }
    return end;
  },

  // Chickadee "fee-bee".
  whistle(s, dest, t, amp) {
    const f1 = rand(3700, 4100);
    const f2 = f1 * rand(0.82, 0.88);
    const d1 = rand(0.26, 0.34);
    const d2 = rand(0.3, 0.4);
    const end = t + d1 + 0.07 + d2;
    const v = s.voice(dest, t, end, 'sine', 0.04);
    s.freq(v, t, f1, f1 * 0.98, d1);
    s.note(v, t, d1, amp, 0.03);
    s.freq(v, t + d1 + 0.07, f2, f2 * 0.99, d2);
    s.note(v, t + d1 + 0.07, d2, amp * 0.9, 0.03);
    return end;
  },

  // A warbler's accelerating trill.
  trill(s, dest, t, amp) {
    const n = 8 + Math.floor(rand(0, 8));
    let f = rand(3200, 4800);
    let d = 0.065;
    let tt = t;
    const v = s.voice(dest, t, t + n * 0.09, 'sine', 0.15);
    for (let i = 0; i < n; i++) {
      s.freq(v, tt, f * 1.18, f * 0.82, d);
      s.note(v, tt, d, amp * (0.6 + 0.4 * (i / n)), 0.006);
      tt += d + 0.018;
      d *= 0.96;
      f *= 1.012;
    }
    return tt;
  },

  // Short contact chips.
  chips(s, dest, t, amp) {
    const n = 2 + Math.floor(rand(0, 3));
    const f = rand(5200, 6500);
    let tt = t;
    const v = s.voice(dest, t, t + n * 0.25, 'sine', 0.1);
    for (let i = 0; i < n; i++) {
      s.freq(v, tt, f, f * 0.7, 0.03);
      s.note(v, tt, 0.03, amp * 0.8, 0.003);
      tt += rand(0.13, 0.22);
    }
    return tt;
  },

  // Soft wood-pigeon coos.
  dove(s, dest, t, amp) {
    const ctx = s.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(dest);
    const pattern = [
      [0.32, 500, 470],
      [0.55, 545, 480],
      [0.3, 500, 470],
      [0.28, 490, 460],
    ];
    let tt = t;
    const end = t + pattern.reduce((sum, p) => sum + p[0] + 0.18, 0);
    const v = s.voice(lp, t, end, 'triangle', 0.2);
    for (const [d, f0, f1] of pattern) {
      s.freq(v, tt, f0, f1, d);
      s.note(v, tt, d, amp * 1.6, 0.06);
      tt += d + 0.18;
    }
    s.cleanup(end, [lp], 0.5);
    return end;
  },

  // A distant woodpecker drumming on a dead trunk.
  woodpecker(s, dest, t, amp) {
    const ctx = s.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rand(900, 1500);
    bp.Q.value = 6;
    bp.connect(dest);
    const n = 14 + Math.floor(rand(0, 10));
    let tt = t;
    let gap = 1 / rand(15, 19);
    for (let i = 0; i < n; i++) {
      const src = ctx.createBufferSource();
      src.buffer = s.white;
      const g = ctx.createGain();
      src.connect(g).connect(bp);
      envelope(g.gain, tt, 0.001, amp * 3.2 * (1 - (i / n) * 0.6), 0.018);
      src.start(tt, rand(0, 2.5), 0.03);
      tt += gap;
      gap *= 1.012;
    }
    s.cleanup(tt, [bp], 0.5);
    return tt;
  },
};

export const birds = {
  name: 'birds',

  build(s, t) {
    this.nextBird = t + rand(1, 3);
    this.nextOwl = t + rand(10, 25);
  },

  update(s, t, dt, env) {
    // a dawn chorus, quieter days, a little evensong, silent nights
    const night = env.night ?? 0;
    const h = env.hours ?? 12;
    const dawn = Math.exp(-Math.pow((h - 6.8) / 1.4, 2));
    const dusk = Math.exp(-Math.pow((h - 18.2) / 1.0, 2)) * 0.55;
    const day = h > 7 && h < 18 ? 0.35 : 0;
    const activity = Math.max(dawn, dusk, day) * (1 - smoothstep(0.3, 0.8, night)) * (0.45 + 0.55 * (env.forest ?? 0.5));
    s.env.birdActivity = activity;
    if (t >= this.nextBird) {
      if (activity > 0.05) sing(s, t + 0.05, activity, h);
      this.nextBird = t + lerp(10, 1.3, activity) * rand(0.5, 1.4);
    }
    if (t >= this.nextOwl) {
      if (night > 0.6) owl(s, t + 0.05);
      this.nextOwl = t + rand(22, 55);
    }
  },
};

// One bird, somewhere in the trees, singing a phrase (and often again).
function sing(s, t, activity, hours) {
  const forest = s.env.forest;
  const r = Math.random();
  let song;
  if (r < 0.32) song = 'thrush';
  else if (r < 0.52) song = 'whistle';
  else if (r < 0.72) song = 'trill';
  else if (r < 0.86) song = 'chips';
  else if (r < 0.95) song = hours < 11 || forest < 0.6 ? 'dove' : 'thrush';
  else song = forest > 0.5 ? 'woodpecker' : 'chips';
  // a singer often repeats itself a moment later, like real birds do
  const repeats = song === 'woodpecker' || song === 'dove' ? 1 : Math.random() < 0.5 ? 2 : 1;
  const { out, nodes } = s.place(10, 48, 3, 13);
  const loud = rand(0.06, 0.13) * (0.7 + 0.3 * activity);
  let tt = t;
  for (let i = 0; i < repeats; i++) {
    tt = SONGS[song](s, out, tt, loud) + rand(0.8, 2.2);
  }
  s.cleanup(tt, nodes);
}

// Great horned owl: hoo, h-hoo, hoo, hoo.
function owl(s, t) {
  const { out, nodes } = s.place(30, 70, 6, 14);
  const lp = s.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.connect(out);
  const f = rand(320, 380);
  const pattern = [0.42, 0.14, 0.2, 0.5, 0.55];
  const gaps = [0.32, 0.08, 0.28, 0.32, 0];
  let tt = t;
  const end = t + pattern.reduce((sum, x, i) => sum + x + gaps[i], 0);
  const v = s.voice(lp, t, end, 'sine', 0.05);
  pattern.forEach((d, i) => {
    s.freq(v, tt, f * (i === 1 ? 1.06 : 1), f * 0.94, d);
    s.note(v, tt, d, 0.12, 0.05);
    tt += d + gaps[i];
  });
  s.cleanup(end, [...nodes, lp]);
}
