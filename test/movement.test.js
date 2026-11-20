// How the hiker moves, whatever the frame rate: the same jump on a slow
// screen as on a fast one (player/player.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player/player.js';
import { CONFIG } from '../src/config.js';

const flat = { heightAt: () => 0, waterAt: () => false, forEachCollider() {} };

// A hiker on flat ground, with jump pressed when `jump` is set.
function hiker() {
  const keys = { jump: false };
  const input = {
    consumeLook: () => ({ x: 0, y: 0 }),
    consumeZoom: () => 0,
    isDown: () => false,
    moveAxes: () => ({ x: 0, y: 0 }),
    running: () => false,
    jumped() {
      const j = keys.jump;
      keys.jump = false;
      return j;
    },
  };
  const p = new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world: flat, input });
  p.spawn(0, 0, 0, 0);
  return { p, keys };
}

test('a jump rises as high at 30 fps as at 240, and comes down to stand again', () => {
  const top = (CONFIG.jumpSpeed * CONFIG.jumpSpeed) / (2 * CONFIG.gravity);
  for (const fps of [20, 30, 60, 144, 240]) {
    const { p, keys } = hiker();
    for (let i = 0; i < fps; i++) p.update(1 / fps);
    keys.jump = true;
    let high = 0;
    for (let i = 0; i < fps * 2; i++) {
      p.update(1 / fps);
      high = Math.max(high, p.pos.y);
    }
    assert.ok(Math.abs(high - top) < 0.01, `at ${fps} fps it peaks at ${high.toFixed(3)} m, not ${top.toFixed(3)}`);
    assert.ok(p.grounded && p.pos.y === 0, `and at ${fps} fps it lands`);
  }
});
