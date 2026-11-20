// Out of your depth you float; you can dive, swim about under the surface,
// and come back up. The Player, at a steady 60 frames a second, over a lake
// 20 m deep, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player, SWIM_DEPTH } from '../src/player/player.js';

const LEVEL = 0;
const BED = -20;

function swimmer() {
  const world = {
    heightAt: () => BED,
    waterAt(x, z, out) {
      Object.assign(out, { level: LEVEL, depth: LEVEL - BED, flowX: 0, flowZ: 0, foam: 0 });
      return true;
    },
    forEachCollider() {},
  };
  const held = new Set();
  const input = {
    consumeLook: () => ({ x: 0, y: 0 }),
    consumeZoom: () => 0,
    isDown: (a) => held.has(a),
    moveAxes: () => ({ x: 0, y: held.has('forward') ? 1 : 0 }),
    running: () => false,
    jumped: () => false,
    diving: () => held.has('dive'),
  };
  const player = new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world, input });
  player.spawn(0, 0, 0);
  const run = (seconds, ...keys) => {
    for (const k of keys) held.add(k);
    for (let i = 0; i < seconds * 60; i++) player.update(1 / 60);
    held.clear();
  };
  return { player, run };
}

test('out of your depth you float, head out', () => {
  const { player, run } = swimmer();
  run(1);
  assert.ok(player.swimming);
  assert.ok(Math.abs(player.pos.y - (LEVEL - SWIM_DEPTH)) < 0.01, `floating at ${player.pos.y.toFixed(3)}`);
  assert.equal(player.submerged, false);
});

test('holding dive takes you under, and you drift back up when you let go', () => {
  const { player, run } = swimmer();
  run(0.5);
  run(2, 'dive');
  assert.ok(player.under > 1.5, `only ${player.under.toFixed(2)} m under`);
  assert.ok(player.submerged, 'your head is under');
  const deep = player.under;
  run(4); // (going on down a little first, as you would)
  assert.ok(player.under < deep && player.under > 0, 'drifting up, slowly');
});

test('under water you swim the way you look, lying flat, and not through the bed', () => {
  const { player, run } = swimmer();
  run(2, 'dive');
  player.camYaw = Math.PI; // looking along +z
  player.camPitch = 1.2; // ...and well down
  const y0 = player.pos.y;
  run(3, 'forward');
  assert.ok(player.pos.z > 1, `went ${player.pos.z.toFixed(2)} m along`);
  assert.ok(player.pos.y < y0 - 1, 'and down, the way the camera looks');
  assert.ok(player.prone > 0.6, 'lying flat in the water');
  run(30, 'dive');
  assert.ok(player.pos.y > BED - 1, 'the bed stops you');
});

test('space brings you back up to float, and no further', () => {
  const { player, run } = swimmer();
  run(2, 'dive');
  run(4, 'jump');
  assert.equal(player.submerged, false);
  assert.ok(Math.abs(player.pos.y - (LEVEL - SWIM_DEPTH)) < 0.05, `floating at ${player.pos.y.toFixed(3)}`);
});
