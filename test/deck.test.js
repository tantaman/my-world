// Something you stand on that moves (player.deck): a ship under way. What's
// solid of it stays where it was made solid, and it's drawn where it is now;
// standing on it, you're carried, and turned with it; walking on it, you
// walk on it, not on the water under it. The Player, at a steady 60 frames a
// second, on a floor over deep water, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player/player.js';
import { Solids } from '../src/world/solids.js';
import { toLocal } from '../src/landmarks/sites.js';

const FLOOR = 10; // m: the deck's top, over the water
function aboard() {
  const world = {
    heightAt: () => -30,
    waterAt(x, z, out) {
      Object.assign(out, { level: 0, depth: 30, flowX: 0, flowZ: 0, foam: 0 });
      return true;
    },
    forEachCollider() {},
  };
  // the deck, solid where it was: 60 m by 30, round (100, 50)
  const solids = new Solids();
  const strips = [];
  for (let x = 85.5; x < 115; x += 1) strips.push({ ax: x, az: 20.5, bx: x, bz: 79.5, r: 0.56, bottom: FLOOR - 0.4, topA: FLOOR, topB: FLOOR });
  solids.set('deck', strips);
  const held = new Set();
  const input = {
    consumeLook: () => ({ x: 0, y: 0 }),
    lookRate: () => ({ x: 0, y: 0 }),
    consumeZoom: () => 0,
    isDown: (a) => held.has(a),
    moveAxes: () => ({ x: 0, y: held.has('forward') ? 1 : 0 }),
    running: () => false,
    jumped: () => false,
    diving: () => false,
  };
  const player = new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world, input, solids });
  const still = { x: 100, z: 50, yaw: 0 };
  const at = { x: 100, z: 50, yaw: 0 };
  player.spawn(100, 50, 0, Math.PI, FLOOR);
  player.deck = { still, at };
  const run = (seconds, move, ...keys) => {
    for (const k of keys) held.add(k);
    for (let i = 0; i < seconds * 60; i++) {
      move(i / 60);
      player.update(1 / 60);
    }
    held.clear();
  };
  return { player, at, still, run };
}

test('standing on a deck that moves and turns, you go with it, and turn with it', () => {
  const { player, at, run } = aboard();
  const yaw0 = player.yaw;
  // under way: 8 m/s along x, turning a little all the while
  run(10, (t) => {
    at.x = 100 + 8 * t;
    at.yaw = 0.05 * t;
  });
  const on = toLocal(at, player.pos.x, player.pos.z, {});
  assert.ok(Math.hypot(on.x, on.z) < 0.05, `still where you stood on it (${on.x.toFixed(3)}, ${on.z.toFixed(3)})`);
  assert.ok(Math.abs(player.pos.y - FLOOR) < 0.02, 'on its floor, not in the sea');
  assert.ok(Math.abs(player.yaw - yaw0 - at.yaw) < 1e-6, 'turned as it turned');
  assert.ok(Math.abs(player.pos.x - at.x) < 0.1, 'and carried along');
});

test('walking on it, you walk on it, wherever it has got to', () => {
  const { player, at, still, run } = aboard();
  run(4, (t) => {
    at.x = 100 + 6 * t;
    at.z = 50 - 3 * t;
  }, 'forward');
  const on = toLocal(at, player.pos.x, player.pos.z, {});
  assert.ok(Math.hypot(on.x, on.z) > 3, `you've walked along it (${Math.hypot(on.x, on.z).toFixed(1)} m)`);
  assert.ok(Math.abs(player.pos.y - FLOOR) < 0.02, 'on its floor all the way');
  // set down somewhere on it where it's solid, and you're there on it now
  player.spawnOnDeck(still.x + 5, still.z + 10, 0, Math.PI, FLOOR);
  const there = toLocal(at, player.pos.x, player.pos.z, {});
  assert.ok(Math.abs(there.x - 5) < 0.01 && Math.abs(there.z - 10) < 0.01);
  // and off it, you're where you are
  player.deck = null;
  const x = player.pos.x;
  run(1, () => {});
  assert.ok(Math.abs(player.pos.x - x) < 0.5);
});
