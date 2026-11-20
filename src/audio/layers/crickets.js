// Crickets: a handful of voices dotted around, each chirping on its own
// clock. They fade in at dusk, louder in the open.

import { smoothstep } from '../../noise.js';
import { rand } from '../../core/geom.js';

export const crickets = {
  name: 'crickets',

  build(s, t) {
    const ctx = s.ctx;
    const out = s.bus('ambience').dry;
    this.voices = [];
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = rand(4300, 5300);
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = rand(-0.9, 0.9);
      osc.connect(g).connect(pan).connect(out);
      osc.start(t);
      this.voices.push({ g, next: t + rand(0, 1), period: rand(0.5, 0.95), amp: rand(0.35, 1), pulses: Math.random() < 0.5 ? 3 : 2 });
    }
  },

  update(s, t, dt, env) {
    const night = env.night ?? 0;
    const open = 1 - (env.forest ?? 0.5);
    const level = smoothstep(0.15, 0.75, night) * (0.45 + 0.55 * open) * 0.022;
    const horizon = t + 0.12;
    for (const c of this.voices) {
      while (c.next < horizon) {
        const amp = level * c.amp;
        if (amp > 0.0006 && c.next >= t) {
          for (let p = 0; p < c.pulses; p++) {
            const at = c.next + p * 0.032;
            c.g.gain.setValueAtTime(0, at);
            c.g.gain.linearRampToValueAtTime(amp, at + 0.004);
            c.g.gain.linearRampToValueAtTime(0, at + 0.021);
          }
        }
        c.next = Math.max(c.next, t) + c.period * rand(0.9, 1.12);
      }
    }
  },
};
