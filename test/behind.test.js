// The camera locked behind you (player.lockCamera): one stick does it all.
// Left and right turn you and the camera with you, forward walks the way you
// face, back backs you up, and the camera looks past your right shoulder.
// The Player, at a steady 60 frames a second, on flat dry ground, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player/player.js';
import { Character } from '../src/player/character.js';
import { hiker } from '../src/player/hikers.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function walker(lockCamera) {
  const world = {
    heightAt: () => 0,
    waterAt: () => false,
    forEachCollider() {},
  };
  const held = new Set();
  const input = {
    consumeLook: () => ({ x: 0, y: 0 }),
    lookRate: () => ({ x: 0, y: 0 }),
    consumeZoom: () => 0,
    isDown: (a) => held.has(a),
    // as Input's: W A S D, held, and kept to the round of a stick's travel
    moveAxes() {
      let x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      let y = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0);
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      return { x, y };
    },
    running: () => held.has('run'),
    jumped: () => false,
    diving: () => false,
  };
  const player = new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world, input });
  player.lockCamera = lockCamera;
  player.spawn(0, 0, 0); // facing +z, the camera behind, looking along +z
  const run = (seconds, ...keys) => {
    for (const k of keys) held.add(k);
    for (let i = 0; i < seconds * 60; i++) player.update(1 / 60);
    held.clear();
  };
  return { player, run };
}

test('locked behind you, left and right turn you on the spot, and the camera with you', () => {
  const { player, run } = walker(true);
  run(0.5, 'left');
  assert.ok(Math.hypot(player.pos.x, player.pos.z) < 0.05, `stepped ${Math.hypot(player.pos.x, player.pos.z).toFixed(2)} m`);
  assert.ok(player.camYaw > Math.PI + 0.8, `the camera only turned to ${player.camYaw.toFixed(2)}`);
  run(0.5);
  assert.ok(Math.abs(wrap(player.yaw + Math.PI - player.camYaw)) < 0.05, 'you face the way the camera looks');
  const yaw = player.camYaw;
  run(1, 'right');
  assert.ok(player.camYaw < yaw - 1.5, 'and back the other way');
});

test('locked behind you, forward walks the way you face, turning as you go', () => {
  const { player, run } = walker(true);
  run(1, 'forward');
  assert.ok(player.pos.z > 1 && Math.abs(player.pos.x) < 0.05, `walked to ${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}`);
  const along = player.pos.z;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  run(1, 'forward', 'left');
  assert.ok(Math.hypot(player.vel.x, player.vel.z) > speed * 0.95, 'turning, no slower');
  assert.ok(player.pos.x > 0.2, 'curving round to the left'); // left of +z is +x
  assert.ok(player.pos.z > along, 'still going on');
  assert.ok(Math.abs(wrap(player.yaw + Math.PI - player.camYaw)) < 0.2, 'with the camera behind you');
});

test('locked behind you, back backs you up still facing ahead, slower, and never at a run', () => {
  const { player, run } = walker(true);
  run(1, 'forward');
  const ahead = Math.hypot(player.vel.x, player.vel.z);
  run(1);
  const was = player.pos.z;
  run(1.5, 'back', 'run');
  assert.ok(player.pos.z < was - 1, `backed up ${(was - player.pos.z).toFixed(2)} m`);
  assert.ok(Math.abs(wrap(player.yaw)) < 0.05, `still facing ahead, not ${player.yaw.toFixed(2)}`);
  const back = Math.hypot(player.vel.x, player.vel.z);
  assert.ok(back < ahead * 0.7, `backing at ${back.toFixed(2)} m/s, walking ${ahead.toFixed(2)}`);
});

test('free, left steps you sideways and the camera stays where it was', () => {
  const { player, run } = walker(false);
  run(1, 'left');
  assert.ok(player.pos.x > 1, `stepped to ${player.pos.x.toFixed(2)}`);
  assert.equal(player.camYaw, Math.PI);
});

test('locked behind you, the camera looks past your right shoulder', () => {
  const { player, run } = walker(true);
  run(2);
  const cam = player.camera.position;
  const right = { x: Math.cos(player.camYaw), z: -Math.sin(player.camYaw) };
  const side = (cam.x - player.pos.x) * right.x + (cam.z - player.pos.z) * right.z;
  assert.ok(side > 0.4, `only ${side.toFixed(2)} m to the right`);
  assert.ok(cam.z < player.pos.z - 3, 'and behind you');
  // looking straight ahead, not in at you
  const dir = player.camera.getWorldDirection(new THREE.Vector3());
  assert.ok(Math.abs(dir.x) < 0.01 && dir.z > 0.9, `looking along ${dir.x.toFixed(2)}, ${dir.z.toFixed(2)}`);
});

test('a wall to your right leaves the camera no room to look past that shoulder', () => {
  const { player, run } = walker(true);
  player.cameraBlockers.push((origin, dir, max) => (dir.y === 0 && dir.x < -0.9 ? 0.3 : Infinity));
  run(2);
  const side = player.pos.x - player.camera.position.x; // right of +z is -x
  assert.ok(Math.abs(side) < 0.1, `${side.toFixed(2)} m to the side`);
});

test('locked behind you and walked somewhere, the camera comes round behind the way you go', () => {
  const { player, run } = walker(true);
  player.steer = { x: 20, z: 0 };
  run(3);
  assert.ok(player.pos.x > 2, `walked to ${player.pos.x.toFixed(2)}`);
  assert.ok(Math.abs(wrap(player.camYaw - (Math.PI / 2 + Math.PI))) < 0.15, `the camera at ${player.camYaw.toFixed(2)}`);
});

test('walking backwards, the legs walk backwards, and the steps are still heard', () => {
  const body = new Character(hiker('hiker'));
  let steps = 0;
  body.onFootstep = () => steps++;
  for (let i = 0; i < 120; i++) body.update(1 / 60, -1.2, true, 0, 0);
  assert.ok(body.phase < -1, `the walk went to ${body.phase.toFixed(2)}`);
  assert.ok(steps >= 3, `${steps} steps in 2 s`);
  assert.ok(body.moveBlend > 0.8, 'walking, not standing');
});
