// What a treasure hunt sounds like, besides the spade's own scrape (the
// builder's 'dig'): the spade striking the lid, hollow, and the lid creaking
// back over a heap of coins.

import { defineSfx } from '../audio/sfx.js';
import { rand } from '../core/geom.js';

// The spade striking wood under the earth: a dull knock, hollow behind it.
defineSfx('treasure-strike', ({ s, t, noise, tone }) => {
  noise(s.brown, t, 0.16, [['lowpass', 700]], 0.32, 0.002, 0.1);
  tone('triangle', t, 210, 150, 0.16, 0.002, 0.16);
  tone('sine', t + 0.01, 95, 80, 0.2, 0.004, 0.3);
  noise(s.pink, t + 0.02, 0.3, [['bandpass', 420, 2.5]], 0.07, 0.01, 0.25);
});

// The lid: old hinges creaking back, and the coins shifting as it opens.
defineSfx('treasure-open', ({ s, t, noise, tone }) => {
  for (let i = 0; i < 5; i++) tone('sawtooth', t + i * 0.09, rand(380, 520), rand(300, 420), 0.012, 0.03, 0.09);
  noise(s.pink, t, 0.5, [['bandpass', 900, 4]], 0.03, 0.1, 0.35);
  for (let i = 0; i < 14; i++) {
    const at = t + 0.45 + rand(0, 0.7);
    const f = rand(3200, 5200);
    tone('sine', at, f, f * 0.98, rand(0.015, 0.04), 0.001, rand(0.08, 0.22));
    noise(s.white, at, 0.02, [['bandpass', rand(5000, 8000), 5]], rand(0.02, 0.05), 0.001, 0.015);
  }
});
