// Drops thrown up out of the water come back down into it, and are gone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Splashes } from '../src/splashes/splashes.js';

test('a splash falls back into the water and is gone', () => {
  const s = new Splashes({ add() {} });
  s.update(1 / 60);
  assert.equal(s.live, 0, 'nothing in the air to begin with');
  s.burst(0, 0.02, 0, 0, 20, { up: 2.2 });
  s.update(1 / 60);
  assert.equal(s.live, 20);
  let peak = 0;
  for (let f = 0; f < 120; f++) {
    s.update(1 / 60);
    for (let k = 0; k < 20; k++) peak = Math.max(peak, s.pos[k * 3 + 1]);
  }
  assert.ok(peak > 0.1, 'drops fly up first');
  assert.equal(s.live, 0, 'and all of them are back in the water within two seconds');
  assert.equal(s.points.visible, false, 'with nothing left to draw');
});
