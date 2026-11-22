// Iron heating pipes settling, a shoe on grit, and a sorting bell whose
// second tine rings a little flat. Each call has a source in the building.
import { defineCall } from '../audio/calls.js';

defineCall('ward-pipes', 7, ({ t, voice, noise, s }) => {
  for (const delay of [0, 0.36, 1.52]) {
    noise(s.pink, t + delay, 0.11, [['bandpass', 670, 1.3]], 0.5, 0.003, 0.07);
    for (const f of [122, 307, 504])
      voice(
        'sine',
        t + delay,
        [[0, f]],
        [
          [0.008, 0.047],
          [0.23, 0.014],
          [1.4, 0],
        ],
      );
  }
});
defineCall('depot-bell', 8, ({ t, voice }) => {
  for (const f of [387, 779, 1146])
    voice(
      'sine',
      t,
      [[0, f]],
      [
        [0.003, 0.064],
        [0.35, 0.023],
        [2.6, 0],
      ],
    );
});
defineCall('stray-heel', 4, ({ t, s, noise, voice }) => {
  voice(
    'sine',
    t,
    [
      [0, 117],
      [0.09, 48],
    ],
    [
      [0.007, 0.18],
      [0.13, 0],
    ],
  );
  noise(s.pink, t + 0.04, 0.23, [['bandpass', 1120, 1.1]], 0.55, 0.016, 0.14);
});

// Each phrase has a bowed bass and a sparse, imperfectly tuned melody.
// The same master envelope follows the listener from the steps into the
// building and fades scheduled voices together when the listener leaves.
export function hauntingScore(source) {
  let master,
    next = 0,
    phrase = 0;
  const motifs = [
    [0, 7, 6, 1],
    [0, 3, -1, 6],
    [7, 6, 1, -2],
    [3, 1, -5, 0],
  ];
  return {
    name: 'abandoned-score',
    build(s) {
      master = null;
      next = 0;
      phrase = 0;
    },
    update(s, t) {
      if (!master && source.level <= 0) return;
      const ctx = s.ctx;
      if (!master) {
        master = ctx.createGain();
        master.gain.value = 0;
        const bus = s.bus('music');
        master.connect(bus.dry);
        const send = ctx.createGain();
        send.gain.value = 0.58;
        master.connect(send).connect(bus.wet);
      }
      master.gain.setTargetAtTime(source.level, t, source.level > 0.1 ? 0.65 : 1.35);
      if (source.level <= 0) {
        next = 0;
        phrase = 0;
        return;
      }
      if (next > t + 0.22) return;
      const at = Math.max(next, t + 0.035);
      function tone(type, hz, when, duration, peak, attack, detune = 0) {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = type;
        o.frequency.value = hz;
        o.detune.setValueAtTime(detune - 7, when);
        o.detune.linearRampToValueAtTime(detune, when + duration * 0.7);
        g.gain.setValueAtTime(0.00001, when);
        g.gain.exponentialRampToValueAtTime(peak, when + attack);
        g.gain.exponentialRampToValueAtTime(0.00001, when + duration);
        o.connect(g).connect(master);
        o.start(when);
        o.stop(when + duration + 0.02);
        o.onended = () => {
          o.disconnect();
          g.disconnect();
        };
      }
      const root = source.porter ? 55 : 65.406;
      const motif = motifs[phrase % motifs.length];
      tone('triangle', root, at, 6.8, 0.107, 0.94);
      tone('sine', root * 1.5, at + 0.08, 6.6, 0.083, 1.4, -11);
      for (const [i, offset] of [0, 1.37, 2.94, 4.92].entries()) {
        const f = root * 4 * 2 ** (motif[i] / 12);
        tone('sine', f, at + offset, 2.65, 0.105, 0.018);
        tone('sine', f * 2.012, at + offset, 1.1, 0.023, 0.007);
      }
      if (source.tension > 0.35) {
        tone('triangle', root * 2.12, at + 0.25, 5.6, 0.064, 1.2);
        tone('sine', root * 4.015, at + 0.6, 5.3, 0.044, 1.35);
      }
      next = at + 6.05;
      phrase++;
    },
  };
}

defineCall('bath-drain', 8, ({ t, s, noise, voice }) => {
  for (const delay of [0, 0.21, 1.08]) {
    voice(
      'sine',
      t + delay,
      [
        [0, 740],
        [0.08, 422],
      ],
      [
        [0.008, 0.084],
        [0.12, 0.025],
        [0.95, 0],
      ],
    );
    noise(s.pink, t + delay, 0.17, [['bandpass', 1500, 2.2]], 0.17, 0.009, 0.12);
  }
});
defineCall('furnace-knock', 10, ({ t, s, noise, voice }) => {
  for (const delay of [0, 0.72]) {
    noise(s.brown, t + delay, 0.29, [['lowpass', 720]], 0.65, 0.012, 0.2);
    for (const hz of [76, 194, 451])
      voice(
        'triangle',
        t + delay,
        [[0, hz]],
        [
          [0.012, 0.073],
          [0.31, 0.025],
          [1.65, 0],
        ],
      );
  }
});
