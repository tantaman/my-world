// What adventures sound like, from noise and oscillators like everything
// else.
//
// The air (a layer, see addLayer in audio/soundscape.js): a gale, rain, a
// fire's roar and a twister's freight-train rumble, each as loud as the
// adventure under way says (`air`, written every frame, 0..1 each). Heard on
// the ambience bus, so a cave muffles a storm outside like the rest of the
// open air.
//
// One-off sounds (audio/sfx.js): how one starts, being hurt, making it and
// not making it; thunder near and far; a long rumble (snow, rock); a sharp
// crack; a bullet going past.
//
// Calls placed where they happen (audio/calls.js): a gunshot across the
// clearing, a man shouting, a bear's roar, a mountain lion's snarl, a twig
// snapping under something you can't see, bats, rocks coming down.

import { defineSfx } from '../audio/sfx.js';
import { defineCall } from '../audio/calls.js';
import { envelope } from '../audio/kit.js';
import { rand } from '../core/geom.js';

const BUS = 'ambience';
const EASE = 0.5; // s for the air to follow what it's told

// ── The air ─────────────────────────────────────────────────────────────────
// air: { wind, rain, fire, roar } 0..1, set by whoever knows.
export function adventureAir(air) {
  return {
    name: 'adventure',

    build(s, t) {
      const ctx = s.ctx;
      const out = s.bus(BUS).dry;
      const loop = (buf, at = rand(0, 4)) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.start(t, at);
        return src;
      };
      const filter = (type, f, q = 0.7) => {
        const b = ctx.createBiquadFilter();
        b.type = type;
        b.frequency.value = f;
        b.Q.value = q;
        return b;
      };
      const gain = () => {
        const g = ctx.createGain();
        g.gain.value = 0;
        return g;
      };
      // a gale: brown noise, opening up as it blows harder, and a whistle in it
      this.wind = { lp: filter('lowpass', 300), g: gain() };
      loop(s.brown).connect(this.wind.lp).connect(this.wind.g).connect(out);
      this.whistle = { bp: filter('bandpass', 700, 6), g: gain() };
      loop(s.pink).connect(this.whistle.bp).connect(this.whistle.g).connect(out);
      // rain: the hiss of it on leaves and ground
      this.rain = { g: gain() };
      loop(s.white).connect(filter('highpass', 1400)).connect(filter('lowpass', 8000)).connect(this.rain.g).connect(out);
      // a fire coming: a low roar
      this.fire = { lp: filter('lowpass', 500), g: gain() };
      loop(s.brown).connect(this.fire.lp).connect(this.fire.g).connect(out);
      loop(s.pink).connect(filter('bandpass', 900, 0.8)).connect(this.fire.g);
      // a twister: a deep, steady rumble
      this.roar = { lp: filter('lowpass', 140, 1.2), g: gain() };
      loop(s.brown).connect(this.roar.lp).connect(this.roar.g).connect(out);
      this.nextSnap = t;
    },

    update(s, t) {
      const w = clamp01(air.wind);
      const gust = 0.75 + 0.25 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
      this.wind.g.gain.setTargetAtTime(0.5 * w * gust, t, EASE);
      this.wind.lp.frequency.setTargetAtTime(260 + 900 * w * gust, t, EASE);
      this.whistle.g.gain.setTargetAtTime(0.05 * w * w * gust, t, EASE);
      this.whistle.bp.frequency.setTargetAtTime(500 + 500 * gust, t, EASE);
      this.rain.g.gain.setTargetAtTime(0.16 * clamp01(air.rain), t, EASE);
      const f = clamp01(air.fire);
      this.fire.g.gain.setTargetAtTime(0.45 * f, t, EASE);
      this.fire.lp.frequency.setTargetAtTime(380 + 600 * f, t, EASE);
      this.roar.g.gain.setTargetAtTime(1.1 * clamp01(air.roar), t, EASE);
      // wood snapping in the flames, the nearer the busier
      while (f > 0.05 && this.nextSnap < t + 0.15) {
        if (this.nextSnap >= t) snap(s, this.nextSnap, f);
        this.nextSnap = Math.max(this.nextSnap, t) + rand(0.03, 0.25) / (0.3 + f);
      }
      if (f <= 0.05) this.nextSnap = t;
    },
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));

function snap(s, at, f) {
  const ctx = s.ctx;
  const src = ctx.createBufferSource();
  src.buffer = s.white;
  const b = ctx.createBiquadFilter();
  b.type = 'bandpass';
  b.frequency.value = rand(900, 4000);
  b.Q.value = 2;
  const g = ctx.createGain();
  envelope(g.gain, at, 0.001, rand(0.1, 0.4) * f, rand(0.005, 0.03));
  src.connect(b).connect(g).connect(s.bus(BUS).dry);
  src.start(at, rand(0, 2), 0.06);
  s.cleanup(at + 0.1, [src, b, g]);
}

// ── One-offs ────────────────────────────────────────────────────────────────

// It begins: a low drum, and a tone climbing under it.
defineSfx('adv-start', ({ s, t, noise, tone }) => {
  noise(s.brown, t, 0.8, [['lowpass', 160]], 1.0, 0.004, 0.6);
  tone('sawtooth', t, 70, 140, 0.12, 0.3, 1.2);
  tone('sine', t + 0.05, 98, 196, 0.2, 0.4, 1.0);
});

// Hurt: a grunt, and the thump of whatever it was.
defineSfx('adv-hurt', ({ s, t, size, noise, tone }) => {
  noise(s.brown, t, 0.25, [['lowpass', 300]], 0.6 + size * 0.4, 0.003, 0.15);
  tone('sawtooth', t + 0.01, rand(180, 210), 120, 0.08, 0.01, 0.16);
  noise(s.pink, t + 0.01, 0.15, [['bandpass', 700, 1.5]], 0.12, 0.01, 0.1);
});

// You made it: three notes up, and the last one held.
defineSfx(
  'adv-won',
  ({ t, tone }) => {
    const notes = [392, 494, 587, 784];
    notes.forEach((f, i) => {
      tone('triangle', t + i * 0.16, f, f, 0.16, 0.01, i === notes.length - 1 ? 1.4 : 0.22);
      tone('sine', t + i * 0.16, f * 2, f * 2, 0.04, 0.01, 0.2);
    });
  },
  { reverb: 0.5 },
);

// You didn't: two notes down, low.
defineSfx(
  'adv-lost',
  ({ s, t, noise, tone }) => {
    tone('triangle', t, 220, 220, 0.16, 0.02, 0.5);
    tone('triangle', t + 0.42, 165, 150, 0.16, 0.02, 1.4);
    noise(s.brown, t, 1.2, [['lowpass', 120]], 0.5, 0.02, 1.0);
  },
  { reverb: 0.6 },
);

// Thunder. size 1: right overhead, a crack and then the roll; 0: far off,
// only the roll, long after.
defineSfx(
  'thunder',
  ({ s, t, size, noise }) => {
    const near = size;
    if (near > 0.6) noise(s.white, t, 0.12, [['highpass', 1200]], 0.9 * near, 0.001, 0.09);
    noise(s.pink, t + 0.02, 1.2, [['lowpass', 1400 * near + 300]], 0.5 + 0.5 * near, 0.01, 0.9);
    for (let i = 0; i < 4; i++) noise(s.brown, t + 0.1 + i * rand(0.3, 0.7) * (1.6 - near), 2.6, [['lowpass', 220]], (0.9 - i * 0.15) * (0.5 + 0.5 * near), 0.15, 1.8);
  },
  { reverb: 0.8 },
);

// A long, low rumble: snow letting go, rock coming down. size: how big
defineSfx(
  'rumble',
  ({ s, t, size, noise }) => {
    const dur = 2 + size * 4;
    noise(s.brown, t, dur, [['lowpass', 150]], 1.0, dur * 0.25, dur * 0.7);
    noise(s.brown, t + 0.3, dur, [['lowpass', 420]], 0.5 * size, dur * 0.3, dur * 0.6);
    noise(s.pink, t + 0.5, dur * 0.8, [['bandpass', 600, 0.7]], 0.2 * size, dur * 0.3, dur * 0.5);
  },
  { reverb: 0.7 },
);

// A sharp crack: a slab of snow breaking, a limb giving way.
defineSfx(
  'crack',
  ({ s, t, noise, tone }) => {
    noise(s.white, t, 0.06, [['highpass', 900]], 1.0, 0.0005, 0.05);
    noise(s.brown, t, 0.4, [['lowpass', 300]], 0.7, 0.002, 0.3);
    tone('square', t, 300, 90, 0.08, 0.001, 0.08);
  },
  { reverb: 0.75 },
);

// A bullet going past your ear.
defineSfx('whizz', ({ s, t, noise, tone }) => {
  tone('sine', t, 2400, 1300, 0.05, 0.005, 0.12);
  noise(s.white, t, 0.12, [['bandpass', 3000, 2]], 0.3, 0.01, 0.08);
});

// Something flying past you in the wind.
defineSfx('swish', ({ s, t, size, noise }) => {
  noise(s.pink, t, 0.35, [['bandpass', 500 + size * 900, 1.2]], 0.3 + size * 0.3, 0.08, 0.2);
});

// ── Calls, where they happen ────────────────────────────────────────────────

// A rifle fired across the clearing: the crack, the boom, the echo.
defineCall('gunshot', 90, ({ s, t, noise, voice }) => {
  noise(s.white, t, 0.05, [['highpass', 1500]], 1.0, 0.0005, 0.035);
  noise(s.pink, t, 0.5, [['lowpass', 900]], 0.9, 0.001, 0.3);
  noise(s.brown, t, 0.7, [['lowpass', 260]], 1.0, 0.002, 0.45);
  voice('sine', t, [[0, 110], [0.25, 45]], [[0.002, 0.6], [0.3, 0]]);
  noise(s.pink, t + rand(0.5, 0.8), 0.9, [['lowpass', 500]], 0.25, 0.04, 0.6);
});

// A man shouting: two or three hoarse syllables.
defineCall('shout', 30, ({ s, t, noise, voice }) => {
  const f = rand(130, 170);
  const n = 2 + Math.floor(rand(0, 2));
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.22, 0.32);
    voice('sawtooth', at, [[0, f * 1.1], [0.08, f * 1.35], [0.2, f]], [[0.02, 0.22], [0.16, 0.18], [0.22, 0]], { filter: [['bandpass', rand(700, 1100), 1.6]], harm: 0.3 });
    noise(s.pink, at, 0.2, [['bandpass', 1800, 2]], 0.08, 0.02, 0.15);
  }
});

// A black bear's roar: a deep ragged bellow.
defineCall('roar', 45, ({ s, t, noise, voice }) => {
  voice('sawtooth', t, [[0, 90], [0.3, 130], [1.1, 70]], [[0.1, 0.4], [0.9, 0.3], [1.2, 0]], { filter: [['lowpass', 700]], vib: 23, vibDepth: 18 });
  noise(s.brown, t, 1.3, [['lowpass', 400]], 0.9, 0.1, 1.0);
  noise(s.pink, t + 0.05, 1.0, [['bandpass', 500, 1]], 0.3, 0.1, 0.8);
});

// A mountain lion's snarl: a hiss and a rising, rasping scream.
defineCall('snarl', 35, ({ s, t, noise, voice }) => {
  noise(s.white, t, 0.5, [['highpass', 2500]], 0.4, 0.02, 0.4);
  voice('sawtooth', t + 0.35, [[0, 300], [0.25, 700], [0.9, 420]], [[0.08, 0.25], [0.7, 0.2], [1.0, 0]], { filter: [['bandpass', 1300, 1.2]], vib: 31, vibDepth: 40 });
  noise(s.pink, t + 0.35, 0.8, [['bandpass', 2000, 1.5]], 0.2, 0.05, 0.6);
});

// A twig snapping under a foot you can't see.
defineCall('snap', 9, ({ s, t, noise }) => {
  noise(s.white, t, 0.03, [['bandpass', rand(1800, 3200), 3]], 0.9, 0.0005, 0.02);
  noise(s.white, t + rand(0.03, 0.08), 0.02, [['bandpass', rand(2500, 4000), 3]], 0.4, 0.0005, 0.012);
});

// Bats: a flurry of high chirps and the flutter of wings.
defineCall('bats', 7, ({ s, t, noise, voice }) => {
  for (let i = 0; i < 9; i++) {
    const at = t + rand(0, 1.2);
    voice('sine', at, [[0, rand(5500, 8000)], [0.02, rand(4000, 5000)]], [[0.003, 0.06], [0.025, 0]]);
  }
  for (let i = 0; i < 14; i++) noise(s.pink, t + i * 0.09, 0.05, [['bandpass', 900, 1]], 0.15, 0.005, 0.04);
});

// Rocks coming down: clatter and thumps.
defineCall('crash', 25, ({ s, t, noise }) => {
  for (let i = 0; i < 10; i++) {
    const at = t + rand(0, 0.9);
    noise(s.brown, at, 0.2, [['lowpass', 400]], rand(0.4, 1), 0.002, 0.15);
    noise(s.white, at, 0.05, [['bandpass', rand(1200, 2600), 2]], rand(0.1, 0.35), 0.001, 0.04);
  }
});

