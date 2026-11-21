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
