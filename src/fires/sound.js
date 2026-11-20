// What a fire sounds like.
//
// Burning: a layer (see addLayer in audio/soundscape.js) that gives each of
// the fires nearest you a voice of its own, placed where it burns: a soft
// roar with dry crackles and the odd pop of resin, louder and busier the
// harder it burns. Which fires those are comes from Fires.update (fires.heard).
//
// And three one-off sounds (audio/sfx.js): the flint struck, the tinder
// catching, and the long hiss of earth kicked over the coals.

import { defineSfx } from '../audio/sfx.js';
import { envelope, setPos, SILENT } from '../audio/kit.js';
import { rand } from '../core/geom.js';

const BUS = 'ambience';
const LOOKAHEAD = 0.15; // seconds of crackles scheduled ahead of the frame

// The layer, listening to `fires`.
export function crackle(fires) {
  return {
    name: 'fires',

    build() {
      this.voices = [];
    },

    update(s, t) {
      const list = fires.heard;
      while (this.voices.length < list.length) this.voices.push(voice(s));
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i];
        const f = list[i];
        const heat = f ? f.heat : 0;
        if (f) {
          // a different fire took this voice: move it there while it's quiet
          if (v.at && Math.hypot(v.at.x - f.x, v.at.z - f.z) > 0.5) v.bed.gain.setValueAtTime(SILENT, t);
          setPos(v.pan, f.x, f.y + 0.35, f.z);
          v.at = { x: f.x, z: f.z };
        }
        v.bed.gain.setTargetAtTime(0.11 * heat, t, 0.5);
        v.lp.frequency.setTargetAtTime(380 + 520 * heat, t, 0.5);
        const horizon = t + LOOKAHEAD;
        while (v.next < horizon) {
          if (heat > 0.03 && v.next >= t) snap(s, v, v.next, heat);
          v.next = Math.max(v.next, t) + rand(0.02, 0.22) / (0.25 + heat * 1.3);
        }
      }
    },
  };
}

// One fire's voice: the roar of the flames, brown and pink noise, low and
// breathy, through a panner where the fire is. Crackles go to `out`.
function voice(s) {
  const ctx = s.ctx;
  const { dry, wet } = s.bus(BUS);
  const pan = ctx.createPanner();
  pan.panningModel = s.offline ? 'equalpower' : 'HRTF';
  pan.distanceModel = 'inverse';
  pan.refDistance = 1.6;
  pan.rolloffFactor = 1.4;
  const out = ctx.createGain();
  out.connect(pan);
  pan.connect(dry);
  const send = ctx.createGain();
  send.gain.value = 0.18;
  pan.connect(send).connect(wet);
  const src = ctx.createBufferSource();
  src.buffer = s.brown;
  src.loop = true;
  const hiss = ctx.createBufferSource();
  hiss.buffer = s.pink;
  hiss.loop = true;
  const hg = ctx.createGain();
  hg.gain.value = 0.12;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  const bed = ctx.createGain();
  bed.gain.value = 0;
  src.connect(lp);
  hiss.connect(hg).connect(lp);
  lp.connect(bed).connect(out);
  src.start(ctx.currentTime, rand(0, 6));
  hiss.start(ctx.currentTime, rand(0, 4));
  return { pan, out, bed, lp, next: ctx.currentTime, at: null };
}

// One snap of burning wood; now and then a resin pop with a little fizz.
function snap(s, v, at, heat) {
  const ctx = s.ctx;
  const nodes = [];
  let end = at;
  const burst = (dur, f, q, peak, decay) => {
    const src = ctx.createBufferSource();
    src.buffer = s.white;
    const b = ctx.createBiquadFilter();
    b.type = 'bandpass';
    b.frequency.value = f;
    b.Q.value = q;
    const g = ctx.createGain();
    envelope(g.gain, at, 0.0008, peak, decay);
    src.connect(b).connect(g).connect(v.out);
    src.start(at, rand(0, 2.5), dur);
    nodes.push(src, b, g);
    end = Math.max(end, at + dur);
  };
  if (Math.random() < 0.06 + 0.05 * heat) {
    burst(0.08, rand(700, 1400), 1.2, rand(0.5, 0.9) * (0.5 + heat * 0.5), 0.03);
    for (let i = 0; i < 4; i++) burst(0.02, rand(3000, 7000), 3, rand(0.05, 0.15), 0.006);
  } else {
    const n = Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) burst(0.03, rand(1500, 5200), rand(1.5, 4), rand(0.08, 0.32) * (0.4 + heat * 0.6), rand(0.003, 0.014));
  }
  s.cleanup(end, nodes, 0.1);
}

// ── One-offs ────────────────────────────────────────────────────────────────

// Flint struck on steel: three bright scrapes, a tiny ring each.
defineSfx('strike', ({ s, t, noise, tone }) => {
  for (let i = 0; i < 3; i++) {
    const at = t + i * rand(0.16, 0.24);
    noise(s.white, at, 0.06, [['highpass', 3500], ['bandpass', rand(5000, 7000), 2]], rand(0.25, 0.4), 0.002, 0.03);
    tone('sine', at, rand(3600, 4400), 3300, 0.05, 0.001, 0.05);
  }
});

// The tinder catching: a breathy rush that opens up as the flames rise.
defineSfx('ignite', (k) => {
  const { s, ctx, t, out, noise } = k;
  const src = ctx.createBufferSource();
  src.buffer = s.pink;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(260, t);
  bp.frequency.exponentialRampToValueAtTime(1500, t + 0.7);
  const g = ctx.createGain();
  envelope(g.gain, t, 0.25, 0.6, 1.1);
  src.connect(bp).connect(g).connect(out);
  src.start(t, rand(0, 3), 1.6);
  k.nodes.push(bp, g);
  noise(s.brown, t + 0.1, 0.6, [['lowpass', 220]], 0.5, 0.15, 0.4);
  for (let i = 0; i < 6; i++) noise(s.white, t + rand(0.2, 1.2), 0.02, [['bandpass', rand(2000, 5000), 3]], rand(0.08, 0.2), 0.001, 0.008);
  k.end = Math.max(k.end, t + 1.8);
});

// Earth on hot coals: a long hiss with a sizzle running through it.
defineSfx('douse', ({ s, t, noise }) => {
  noise(s.white, t + 0.05, 1.8, [['highpass', 2400], ['lowpass', 9000]], 0.4, 0.04, 1.3);
  noise(s.pink, t + 0.05, 1.2, [['bandpass', 1100, 0.7]], 0.25, 0.05, 0.7);
  for (let i = 0; i < 12; i++) noise(s.white, t + rand(0.1, 1.4), 0.02, [['bandpass', rand(2500, 6000), 4]], rand(0.06, 0.18), 0.001, 0.008);
});
