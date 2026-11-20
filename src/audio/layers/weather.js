// Wind and leaves.
//
// Wind is low-passed brown noise that gusts along with the swaying trees,
// louder in open meadows and on high ground. Leaves rustle in swells under
// the canopy when a gust passes through.
//
// This layer also owns the gusting itself (sound.gust), which other layers
// listen to: still water laps harder when the wind gets up.

import { clamp, lerp, smoothstep } from '../../noise.js';
import { rand } from '../../core/geom.js';

export const weather = {
  name: 'weather',

  build(s, t) {
    const ctx = s.ctx;
    const out = s.bus('ambience').dry;

    // Wind: two decorrelated brown-noise beds, low-passed, panned wide.
    this.wind = [];
    for (const side of [-1, 1]) {
      const src = ctx.createBufferSource();
      src.buffer = s.brown;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      lp.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.65;
      src.connect(lp).connect(g).connect(pan).connect(out);
      src.start(t, rand(0, 6));
      this.wind.push({ lp, g, side });
    }

    // Leaves: pink noise, band-limited high, swells with the gusts.
    this.leaves = [];
    for (const side of [-1, 1]) {
      const src = ctx.createBufferSource();
      src.buffer = s.pink;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1700;
      const bp = ctx.createBiquadFilter();
      bp.type = 'peaking';
      bp.frequency.value = 4200;
      bp.gain.value = 4;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.8;
      src.connect(hp).connect(bp).connect(lp).connect(g).connect(pan);
      pan.connect(out);
      src.start(t, rand(0, 4));
      this.leaves.push({ g, side });
    }

    s.gust = 0.5;
    this.gustTarget = 0.5;
  },

  update(s, t, dt, env) {
    // gusts: a slow random walk on top of the shared wind strength
    if (Math.random() < dt * 0.25) this.gustTarget = rand(0.15, 1);
    s.gust = lerp(s.gust, this.gustTarget, 1 - Math.exp(-dt * 0.6));
    const gust = s.gusting(env);
    const open = 1 - (env.forest ?? 0.5);
    const high = clamp(((env.height ?? 0) + 10) / 55, 0, 1);
    const night = env.night ?? 0;

    const windLevel = (0.04 + 0.1 * open + 0.06 * high) * (0.3 + 0.7 * gust);
    for (const w of this.wind) {
      const wobble = 1 + 0.15 * Math.sin(t * 0.3 + w.side * 2);
      w.g.gain.setTargetAtTime(windLevel * wobble, t, 0.6);
      w.lp.frequency.setTargetAtTime(220 + 520 * gust + 260 * open * wobble, t, 0.6);
    }
    // leaves rustle in swells as gusts move through the canopy
    const leafLevel = (0.003 + 0.032 * gust * gust * gust) * smoothstep(0.15, 0.8, env.forest ?? 0.5) * (1 - night * 0.4);
    for (const l of this.leaves) {
      const swell = 0.55 + 0.45 * Math.sin(t * (0.45 + 0.1 * l.side) + l.side * 3) * Math.sin(t * 0.17 + 1);
      l.g.gain.setTargetAtTime(leafLevel * swell, t, 0.35);
    }
  },
};
