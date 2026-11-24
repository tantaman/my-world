// What the zoo sounds like: its animals' voices (audio/calls.js), heard from
// where each of them is when it calls (residents.js says when).

import { defineCall } from '../audio/calls.js';
import { rand } from '../core/geom.js';

// A lion's roar: a few deep moaning roars, each louder, then a run of
// grunts trailing away. It carries a long way.
defineCall('zoo-roar', 90, ({ s, t, noise, voice }) => {
  let at = t;
  for (let i = 0; i < 3; i++) {
    const len = 1.1 + i * 0.25;
    voice('sawtooth', at, [[0, 95], [len * 0.4, 150 + i * 15], [len, 80]], [[0.15, 0.22 + i * 0.06], [len * 0.8, 0.2], [len, 0]], { filter: [['lowpass', 700], ['bandpass', 260, 0.8]], vib: 18, vibDepth: 6 });
    noise(s.pink, at, len, [['bandpass', 220, 1]], 0.5 + i * 0.15, 0.2, len * 0.6);
    at += len + 0.35;
  }
  for (let i = 0; i < 6; i++) {
    voice('sawtooth', at, [[0, 110], [0.25, 75]], [[0.04, 0.25 - i * 0.03], [0.3, 0]], { filter: [['lowpass', 500]] });
    at += rand(0.45, 0.7);
  }
});

// An elephant's trumpet: a loud brassy blare, rising and wavering, through
// the trunk.
defineCall('zoo-trumpet', 80, ({ s, t, noise, voice }) => {
  const len = rand(0.9, 1.4);
  voice('sawtooth', t, [[0, 380], [0.15, 620], [len * 0.6, 580], [len, 420]], [[0.04, 0.3], [len * 0.8, 0.26], [len, 0]], { filter: [['bandpass', 1100, 1.1]], vib: 11, vibDepth: 30, harm: 0.4 });
  noise(s.white, t, len, [['bandpass', 1600, 2]], 0.3, 0.05, len * 0.7);
  // and a rumble under it
  voice('sine', t, [[0, 60], [len, 50]], [[0.1, 0.25], [len + 0.3, 0]]);
});

// A sea lion's honking bark: a run of hoarse "aar"s.
defineCall('zoo-honk', 50, ({ s, t, noise, voice }) => {
  const n = 3 + Math.floor(rand(0, 4));
  for (let i = 0; i < n; i++) {
    const at = t + i * rand(0.35, 0.5);
    voice('sawtooth', at, [[0, 340], [0.08, 420], [0.22, 300]], [[0.02, 0.26], [0.24, 0]], { filter: [['bandpass', 800, 1.3]] });
    noise(s.white, at, 0.25, [['bandpass', 1300, 1.2]], 0.35, 0.01, 0.18);
  }
});
