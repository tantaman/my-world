// What the trains sound like, made from noise and oscillators like every
// other sound here (audio/soundscape.js), on a bus of their own ('trains'):
//
//   - the exhaust: a chuff from the stack four times a turn of the driving
//     wheels, slow and heavy pulling away, quick and lighter at speed
//   - the wheels over the rail joints, axle by axle down the train: the
//     clickety-clack, heard from the middle of the train
//   - steam hissing while it stands, and the brakes squealing as it draws up
//   - the whistle, three chimes in a chord: two short pulling out of a
//     station, one long coming up to one, and long, long, short, long at a
//     footpath crossing
//
// A layer (sound.addLayer) gives each of the trains nearest you a voice of
// its own. What it hears comes from `source`, which the railway fills in
// every frame:
//   source.heard     [{ id, stack: {x,y,z}, mid: {x,y,z}, v (m/s), odo (m
//                    rolled), braking (bool) }]
//   source.whistles  [{ id, pattern }] to blow, taken as they're played
//
// And a kind of ground underfoot: ballast, a crunch of loose stones.

import { setPos, envelope, SILENT } from '../audio/kit.js';
import { defineSurface } from '../audio/footsteps.js';
import { rand } from '../core/geom.js';

const BUS = 'trains';
const LOOKAHEAD = 0.2; // s of sound scheduled ahead of the frame
const DRIVER_TURN = 2 * Math.PI * 0.52; // m rolled in one turn of the drivers
const JOINT = 9.1; // m between rail joints
// Where the axles are, in m back from the front of the train.
const AXLES = [1.35, 3.0, 4.15, 5.3, 9.0, 10.3, 11.7, 13.0, 14.0, 15.3, 20.0, 21.3, 22.7, 24.0, 28.6, 29.9];
const CHIMES = [294, 370, 440]; // Hz: the whistle's chord
export const WHISTLES = {
  leave: [0.45, 0.45],
  near: [1.5],
  crossing: [1.1, 1.1, 0.4, 1.5],
};
const HEARD_TO = 420; // m: past this, a train makes no sound for you

export function trainSounds(source) {
  return {
    name: 'trains',

    build() {
      this.voices = new Map(); // train id -> voice
    },

    update(s, t) {
      const l = s.listener;
      const live = new Set();
      for (const h of source.heard) {
        if (l && Math.hypot(h.mid.x - l.x, h.mid.z - l.z) > HEARD_TO) continue;
        live.add(h.id);
        let v = this.voices.get(h.id);
        if (!v) this.voices.set(h.id, (v = voice(s, t, h)));
        update(s, v, h, t);
      }
      for (const w of source.whistles.splice(0)) {
        const v = this.voices.get(w.id);
        if (v) whistle(s, v, t + 0.05, WHISTLES[w.pattern] || WHISTLES.near);
      }
      for (const [id, v] of this.voices) {
        if (live.has(id)) continue;
        v.hiss.gain.setTargetAtTime(SILENT, t, 0.3);
        v.squeal.gain.setTargetAtTime(SILENT, t, 0.3);
        if (!v.goneAt) v.goneAt = t;
        if (t - v.goneAt > 2) {
          s.cleanup(t + 0.5, v.nodes, 0.2);
          this.voices.delete(id);
        }
      }
    },
  };
}

// One train's voice: a panner at the stack (exhaust, hiss, whistle) and one
// at the middle of the train (wheels, brakes).
function voice(s, t, h) {
  const ctx = s.ctx;
  const { dry, wet } = s.bus(BUS);
  const panner = (ref) => {
    const p = ctx.createPanner();
    p.panningModel = s.offline ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.1;
    p.maxDistance = 10000;
    p.connect(dry);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    p.connect(send).connect(wet);
    return p;
  };
  const stack = panner(9);
  const mid = panner(6);
  const out = ctx.createGain();
  out.connect(stack);
  const wheels = ctx.createGain();
  wheels.connect(mid);
  // steam hissing from the cocks and the safety valve
  const hissSrc = ctx.createBufferSource();
  hissSrc.buffer = s.white;
  hissSrc.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2600;
  const hiss = ctx.createGain();
  hiss.gain.value = SILENT;
  hissSrc.connect(hp).connect(hiss).connect(out);
  hissSrc.start(t, rand(0, 3));
  // the brakes: two thin tones that won't quite agree, over a scrape
  const squeal = ctx.createGain();
  squeal.gain.value = SILENT;
  squeal.connect(wheels);
  const tones = [2870, 3460].map((f) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    o.connect(g).connect(squeal);
    o.start(t);
    return o;
  });
  const nodes = [stack, mid, out, wheels, hissSrc, hp, hiss, squeal, ...tones];
  return { stack, mid, out, wheels, hiss, squeal, nodes, next: t, axles: null, goneAt: 0 };
}

function update(s, v, h, t) {
  v.goneAt = 0;
  setPos(v.stack, h.stack.x, h.stack.y, h.stack.z);
  setPos(v.mid, h.mid.x, h.mid.y - 1, h.mid.z);
  const standing = h.v < 0.2;
  v.hiss.gain.setTargetAtTime(standing ? 0.035 : 0.008, t, 0.4);
  v.squeal.gain.setTargetAtTime(h.braking && h.v < 5 && h.v > 0.4 ? 0.012 : SILENT, t, 0.25);

  // the exhaust: four beats to a turn of the drivers, the first the strongest
  const rate = (4 * h.v) / DRIVER_TURN;
  const horizon = t + LOOKAHEAD;
  if (rate < 0.4 || h.braking) v.next = Math.max(v.next, t);
  else {
    while (v.next < horizon) {
      if (v.next >= t - 0.02) {
        v.beat = ((v.beat || 0) + 1) % 4;
        chuff(s, v, Math.max(v.next, t), rate, v.beat === 0 ? 1 : 0.75);
      }
      v.next = Math.max(v.next, t - 0.02) + 1 / rate;
    }
  }

  // each axle over each joint: when it next gets to one, if that's soon
  if (!v.axles) v.axles = AXLES.map((d) => (Math.floor((h.odo - d) / JOINT) + 1) * JOINT + d);
  if (h.v > 0.3) {
    for (let k = 0; k < AXLES.length; k++) {
      // (if it has been a while, catch up without a burst of clicks)
      if (v.axles[k] < h.odo - JOINT) v.axles[k] = (Math.floor((h.odo - AXLES[k]) / JOINT) + 1) * JOINT + AXLES[k];
      while (v.axles[k] - h.odo < h.v * LOOKAHEAD) {
        const at = t + Math.max(0, (v.axles[k] - h.odo) / h.v);
        click(s, v, at, Math.min(1, h.v / 8));
        v.axles[k] += JOINT;
      }
    }
  }
}

// One beat of the exhaust.
function chuff(s, v, at, rate, accent) {
  const ctx = s.ctx;
  const dur = Math.min(0.32, 0.55 / rate + 0.05);
  const heavy = Math.max(0.35, 1 - rate / 14);
  const nodes = [];
  const burst = (buf, filters, peak, attack, decay) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let node = src;
    for (const [type, f, q] of filters) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      if (q) b.Q.value = q;
      node.connect(b);
      node = b;
      nodes.push(b);
    }
    const g = ctx.createGain();
    envelope(g.gain, at, attack, peak, decay);
    node.connect(g).connect(v.out);
    src.start(at, rand(0, 2), attack + decay + 0.05);
    nodes.push(src, g);
  };
  burst(s.white, [['bandpass', rand(420, 560), 0.8], ['lowpass', 2200]], 0.55 * accent * heavy, 0.008, dur);
  burst(s.brown, [['lowpass', 240]], 0.7 * accent * heavy, 0.012, dur * 1.2);
  burst(s.white, [['highpass', 4200]], 0.05 * accent, 0.004, dur * 0.6);
  s.cleanup(at + dur * 1.3 + 0.1, nodes, 0.1);
}

// A wheel over a rail joint: a short bright tick and a knock under it.
function click(s, v, at, hard) {
  const ctx = s.ctx;
  const nodes = [];
  const src = ctx.createBufferSource();
  src.buffer = s.white;
  const b = ctx.createBiquadFilter();
  b.type = 'bandpass';
  b.frequency.value = rand(1700, 2400);
  b.Q.value = 2.5;
  const g = ctx.createGain();
  envelope(g.gain, at, 0.001, 0.22 * hard, 0.025);
  src.connect(b).connect(g).connect(v.wheels);
  src.start(at, rand(0, 2), 0.05);
  const knock = ctx.createOscillator();
  knock.type = 'sine';
  knock.frequency.setValueAtTime(rand(110, 140), at);
  knock.frequency.exponentialRampToValueAtTime(60, at + 0.06);
  const kg = ctx.createGain();
  envelope(kg.gain, at, 0.002, 0.3 * hard, 0.05);
  knock.connect(kg).connect(v.wheels);
  knock.start(at);
  knock.stop(at + 0.1);
  nodes.push(src, b, g, knock, kg);
  s.cleanup(at + 0.12, nodes, 0.05);
}

// The whistle: three chimes rising onto their note together, a breath of
// steam through them, held for each of `toots` (s), a little gap between.
function whistle(s, v, at, toots) {
  const ctx = s.ctx;
  const nodes = [];
  let t = at;
  for (const dur of toots) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.07);
    g.gain.setValueAtTime(0.16, t + dur - 0.12);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(v.out);
    nodes.push(g);
    for (const f of CHIMES) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 0.93, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.14);
      o.frequency.setValueAtTime(f, t + dur - 0.1);
      o.frequency.exponentialRampToValueAtTime(f * 0.97, t + dur);
      const og = ctx.createGain();
      og.gain.value = 0.33;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
      nodes.push(o, og);
    }
    const breath = ctx.createBufferSource();
    breath.buffer = s.pink;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 1.2;
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    breath.connect(bp).connect(bg).connect(g);
    breath.start(t, rand(0, 2), dur + 0.05);
    nodes.push(breath, bp, bg);
    t += dur + 0.22;
  }
  s.cleanup(t + 0.3, nodes, 0.2);
}

// ── Underfoot ────────────────────────────────────────────────────────────────
// Ballast: loose broken stone that shifts and grinds under your boot.
defineSurface('ballast', {
  thump: 0.6,
  step({ s, t, run, sharp, noise }) {
    noise(s.white, t, 0.16, [['bandpass', 1300, 0.8]], 0.65 * sharp, 0.003, 0.07);
    const grains = 8 + Math.floor(rand(0, 5) + run * 4);
    for (let i = 0; i < grains; i++) noise(s.white, t + rand(0.003, 0.09), 0.018, [['bandpass', rand(2600, 5200), 3]], rand(0.1, 0.32) * sharp, 0.001, rand(0.005, 0.012));
  },
});
