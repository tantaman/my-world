// What the Metro sounds like, made from noise and oscillators like every
// other sound here (audio/soundscape.js), on a bus of its own ('metro'):
//
//   - a train running: the rumble of its wheels on the rail, louder and
//     brighter the faster it goes; the whine of its motors, rising as it
//     pulls away and falling as it draws up; and the hiss of the wheels
//   - its brakes as it draws up at a platform: the squeal of the shoes on
//     the wheels in the last few metres
//   - its doors closing: the two falling notes of the chime, before it
//     pulls out of a station
//   - under the street, the hum of the fans that move the air through the
//     tunnels, there all the time
//
// A layer (sound.addLayer) gives each of the trains nearest you a voice of
// its own. What it hears comes from `source`, which the Metro fills in every
// frame:
//   source.heard   [{ id, x, y, z (its middle), v (m/s), a (m/s², + pulling away) }]
//   source.chimes  [{ id }] to sound, taken as they're played
//   source.below   whether you're under the street
//
// And what a platform's floor sounds like underfoot: tile and granite.

import { setPos, envelope, SILENT } from '../audio/kit.js';
import { defineSurface } from '../audio/footsteps.js';
import { rand } from '../core/geom.js';

const BUS = 'metro';
const HEARD_TO = 500; // m: past this, a train makes no sound for you
const CHIME = [[988, 0], [784, 0.42]]; // Hz, s after the first: the two notes
const SQUEAL = { hz: 3300, from: 4.5, to: 0.25, most: 0.035 }; // the brakes: its pitch, m/s it starts and stops at, how loud
const HUM = { hz: [58, 117, 176], level: 0.03, air: 0.012 }; // the fans under the street: Hz of the drone, how loud; the air they move

export function metroSounds(source) {
  return {
    name: 'metro',

    build() {
      this.voices = new Map();
      this.hum = null;
    },

    update(s, t) {
      const l = s.listener;
      // the fans, while you're under the street
      if (source.below && !this.hum) this.hum = hum(s, t);
      if (this.hum) this.hum.gain.gain.setTargetAtTime(source.below ? 1 : SILENT, t, 0.8);
      const live = new Set();
      for (const h of source.heard) {
        if (l && Math.hypot(h.x - l.x, h.z - l.z) > HEARD_TO) continue;
        live.add(h.id);
        let v = this.voices.get(h.id);
        if (!v) this.voices.set(h.id, (v = voice(s, t)));
        update(v, h, t);
      }
      for (const c of source.chimes.splice(0)) {
        const v = this.voices.get(c.id);
        if (v) chime(s, v, t + 0.05);
      }
      for (const [id, v] of this.voices) {
        if (live.has(id)) continue;
        for (const g of [v.rumble, v.hiss, v.whine, v.squeal]) g.gain.setTargetAtTime(SILENT, t, 0.3);
        if (!v.goneAt) v.goneAt = t;
        if (t - v.goneAt > 2) {
          s.cleanup(t + 0.5, v.nodes, 0.2);
          this.voices.delete(id);
        }
      }
    },
  };
}

function voice(s, t) {
  const ctx = s.ctx;
  const { dry, wet } = s.bus(BUS);
  const at = ctx.createPanner();
  at.panningModel = s.offline ? 'equalpower' : 'HRTF';
  at.distanceModel = 'inverse';
  at.refDistance = 14;
  at.rolloffFactor = 1.1;
  at.maxDistance = 10000;
  at.connect(dry);
  const send = ctx.createGain();
  send.gain.value = 0.35;
  at.connect(send).connect(wet);
  const loop = (buf, type, f, q) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (q) b.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = SILENT;
    src.connect(b).connect(g).connect(at);
    src.start(t, rand(0, 3));
    return { src, b, g };
  };
  const rumble = loop(s.brown, 'lowpass', 180);
  const hiss = loop(s.pink, 'bandpass', 1400, 0.7);
  const squeal = loop(s.white, 'bandpass', SQUEAL.hz, 28);
  // the motors: a buzz through a narrow filter, its pitch with the speed
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 120;
  const wb = ctx.createBiquadFilter();
  wb.type = 'bandpass';
  wb.frequency.value = 900;
  wb.Q.value = 6;
  const whine = ctx.createGain();
  whine.gain.value = SILENT;
  osc.connect(wb).connect(whine).connect(at);
  osc.start(t);
  return { at, rumble: rumble.g, rumbleF: rumble.b, hiss: hiss.g, squeal: squeal.g, squealF: squeal.b, whine, osc, wb, nodes: [at, send, rumble.src, rumble.b, rumble.g, hiss.src, hiss.b, hiss.g, squeal.src, squeal.b, squeal.g, osc, wb, whine], goneAt: 0 };
}

function update(v, h, t) {
  v.goneAt = 0;
  setPos(v.at, h.x, h.y + 1, h.z);
  const k = Math.min(1, h.v / 24);
  v.rumble.gain.setTargetAtTime(0.02 + 0.5 * k, t, 0.3);
  v.rumbleF.frequency.setTargetAtTime(120 + 260 * k, t, 0.3);
  v.hiss.gain.setTargetAtTime(0.18 * k * k, t, 0.3);
  // the inverters sing while it's pulling away or drawing up, in steps
  const f = 260 + h.v * 46;
  v.osc.frequency.setTargetAtTime(f / 2, t, 0.15);
  v.wb.frequency.setTargetAtTime(f, t, 0.15);
  v.whine.gain.setTargetAtTime(Math.abs(h.a) > 0.2 && h.v > 0.3 ? 0.05 : h.v > 0.3 ? 0.012 : SILENT, t, 0.25);
  // the brakes, in the last few metres of drawing up, wavering
  const braking = h.a < -0.2 && h.v < SQUEAL.from && h.v > SQUEAL.to;
  v.squeal.gain.setTargetAtTime(braking ? SQUEAL.most * (1 - h.v / SQUEAL.from) : SILENT, t, braking ? 0.2 : 0.08);
  v.squealF.frequency.setTargetAtTime(SQUEAL.hz * (0.97 + 0.06 * Math.sin(t * 7.3)), t, 0.05);
}

// The fans: a drone a little out of tune with itself, and the air they push.
function hum(s, t) {
  const ctx = s.ctx;
  const { dry } = s.bus(BUS);
  const gain = ctx.createGain();
  gain.gain.value = SILENT;
  gain.connect(dry);
  for (const [k, f] of HUM.hz.entries()) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * (1 + 0.004 * k);
    const g = ctx.createGain();
    g.gain.value = HUM.level / (k + 1);
    o.connect(g).connect(gain);
    o.start(t);
  }
  const air = ctx.createBufferSource();
  air.buffer = s.pink;
  air.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const ag = ctx.createGain();
  ag.gain.value = HUM.air;
  air.connect(lp).connect(ag).connect(gain);
  air.start(t, rand(0, 3));
  return { gain };
}

// The doors closing: two notes, falling, each a bell's.
function chime(s, v, at) {
  const ctx = s.ctx;
  const nodes = [];
  for (const [f, dt] of CHIME) {
    for (const [mul, amp] of [[1, 0.22], [2.01, 0.06], [3.02, 0.025]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      envelope(g.gain, at + dt, 0.005, amp, 1.1);
      o.connect(g).connect(v.at);
      o.start(at + dt);
      o.stop(at + dt + 1.3);
      nodes.push(o, g);
    }
  }
  s.cleanup(at + 2, nodes, 0.2);
}

// ── Underfoot ────────────────────────────────────────────────────────────────
// A platform: tile and granite, hard, with a ring to it.
defineSurface('platform', {
  thump: 0.6,
  step({ s, t, run, sharp, noise }) {
    noise(s.white, t, 0.04, [['bandpass', rand(2600, 3300), 2.5]], 0.45 * sharp, 0.001, 0.018);
    noise(s.pink, t + 0.003, 0.12, [['bandpass', rand(650, 850), 1.6]], 0.3 * sharp, 0.002, 0.05 - run * 0.01);
  },
});
