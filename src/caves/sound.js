// What a cave sounds like. The soundscape already muffles the forest and
// rings what you do off the rock once you're shut in (Soundscape.setEnclosed);
// this adds the cave's own:
//
//   rock    footsteps on stone: a hard knock, the scuff of a sole, grit
//   drips   water falling from the tips of the stalactites round you, each
//           from where it hangs, now and then into a pool
//   hush    the low, still air of a place out of the wind

import { defineSurface } from '../audio/footsteps.js';
import { rand } from '../core/geom.js';
import { envelope } from '../audio/kit.js';

defineSurface('rock', {
  thump: 0.8,
  step({ s, t, run, sharp, noise }) {
    noise(s.white, t, 0.05, [['bandpass', 2300, 1.4]], 0.45 * sharp, 0.001, 0.025);
    noise(s.pink, t + 0.008, 0.16, [['bandpass', 750, 0.9]], 0.45 * sharp, 0.004, 0.07 - run * 0.02);
    for (let i = 0; i < 3; i++) noise(s.white, t + rand(0.01, 0.08), 0.015, [['bandpass', rand(3500, 6000), 3]], rand(0.06, 0.16), 0.001, 0.006);
  },
});

const DRIP_EVERY = [0.35, 1.6]; // seconds between drips you hear, deep inside
const DRIP_REACH = 16; // m: drips further than this aren't heard

// caves: what to drip from (Caves.dripsNear(x, y, z, r) -> [x, y, z, ...])
// Its bus, 'cave', is made the first time you're shut in, not before.
export function caveSounds(caves) {
  let next = 0;
  let hush = null;
  return {
    name: 'cave',
    build() {
      hush = null;
    },
    update(s, t, dt) {
      const e = s.enclosed;
      if (!hush && e < 0.05) return;
      if (!hush) hush = makeHush(s, t);
      hush.gain.setTargetAtTime(0.07 * e, t, 0.5);
      if (e < 0.25 || t < next) return;
      next = t + rand(DRIP_EVERY[0], DRIP_EVERY[1]) / e;
      const l = s.listener;
      if (!l) return;
      const near = caves.dripsNear(l.x, l.y, l.z, DRIP_REACH);
      if (!near.length) return;
      const i = Math.floor(Math.random() * (near.length / 3)) * 3;
      drip(s, near[i], near[i + 1], near[i + 2], Math.random() < 0.3);
    },
  };
}

// The low, still air of a place out of the wind: brown noise, far down.
function makeHush(s, t) {
  const ctx = s.ctx;
  const src = ctx.createBufferSource();
  src.buffer = s.brown;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 160;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(lp).connect(g).connect(s.bus('cave').dry);
  src.start(t, rand(0, 5));
  return g;
}

// One drop: a bright plink as it lands, rising as the splash closes, and
// into a pool a deeper, rounder plop.
function drip(s, x, y, z, pool) {
  const ctx = s.ctx;
  const t = ctx.currentTime + 0.01;
  const { out, nodes } = s.placeAt(x, y, z, 'cave');
  out.gain.value = pool ? 0.5 : 0.32;
  const o = ctx.createOscillator();
  o.type = 'sine';
  const f = pool ? rand(380, 650) : rand(1300, 2600);
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * (pool ? 2.2 : 1.6), t + (pool ? 0.06 : 0.03));
  const g = ctx.createGain();
  envelope(g.gain, t, 0.002, 1, pool ? 0.11 : 0.05);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.25);
  nodes.push(g);
  o.onended = () => s.cleanup(ctx.currentTime, nodes, 1.5);
}
