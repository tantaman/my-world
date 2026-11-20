// The sea breaking on the shore of a real place.
//
// A sound layer (audio/soundscape.js): heard from where the sea is white
// along the shore near you (env.water.surf and where, from
// ChunkManager.waterAround), as loud as there is of it. One wave after
// another gathers with a low rumble, breaks in a wash of noise, and runs up
// the shore hissing before it drains away; no two the same size, a few
// seconds apart, bigger when it blows.

import { rand } from '../core/geom.js';

const BETWEEN = [5, 9]; // s from one wave to the next
const AIR = 60000; // Hz of high end left at 1 m, falling as 1/d (as running water's)

export function surf() {
  return {
    name: 'surf',

    build(s, t) {
      const ctx = s.ctx;
      const { dry, wet } = s.bus('ambience');
      const pan = ctx.createPanner();
      pan.panningModel = s.offline ? 'equalpower' : 'HRTF';
      // loudness is worked out from how much surf is near; this only places it
      pan.distanceModel = 'linear';
      pan.rolloffFactor = 0;
      pan.connect(dry);
      const send = ctx.createGain();
      send.gain.value = 0.4;
      pan.connect(send).connect(wet);
      const level = ctx.createGain();
      level.gain.value = 0;
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = 9000;
      level.connect(muffle).connect(pan);
      // a band of noise through a gain that the waves open and close
      const band = (buf, filters, rest) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.start(t, rand(0, 2));
        let node = src;
        for (const [type, f, q = 0.6] of filters) {
          const b = ctx.createBiquadFilter();
          b.type = type;
          b.frequency.value = f;
          b.Q.value = q;
          node.connect(b);
          node = b;
        }
        const g = ctx.createGain();
        g.gain.value = rest;
        node.connect(g).connect(level);
        return g;
      };
      this.rumble = band(s.brown, [['lowpass', 150]], 0.05);
      this.wash = band(s.pink, [['lowpass', 900]], 0.1);
      this.hiss = band(s.white, [['highpass', 1800], ['lowpass', 7500]], 0.02);
      Object.assign(this, { pan, level, muffle, next: t + rand(0, 2) });
    },

    update(s, t, dt, env) {
      const w = env.water;
      const near = w && w.surf > 0.01 ? w.surf : 0;
      this.level.gain.setTargetAtTime(near * 0.85, t, 0.6);
      if (!near) return;
      s.moveTo(this.pan, w.ux, w.uy, w.uz, t);
      const l = s.listener || { x: 0, y: 0, z: 0 };
      const dist = Math.hypot(w.ux - l.x, w.uy - l.y, w.uz - l.z);
      this.muffle.frequency.setTargetAtTime(Math.max(500, Math.min(9000, AIR / Math.max(1, dist))), t, 0.4);
      if (t < this.next) return;
      // one wave: it gathers, breaks, runs up the shore and drains away
      const size = rand(0.55, 1) * (0.7 + 0.5 * (s.gust ?? 0.5));
      this.rumble.gain.setTargetAtTime(0.8 * size, t + 0.2, 0.3);
      this.rumble.gain.setTargetAtTime(0.05, t + 1.3, 0.7);
      this.wash.gain.setTargetAtTime(0.9 * size, t + 0.5, 0.35);
      this.wash.gain.setTargetAtTime(0.1, t + 1.7, 1.1);
      this.hiss.gain.setTargetAtTime(0.45 * size, t + 1.2, 0.3);
      this.hiss.gain.setTargetAtTime(0.02, t + 2.3, 1.5);
      this.next = t + rand(BETWEEN[0], BETWEEN[1]);
    },
  };
}
