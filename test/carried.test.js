// Being carried (Player.carrier): something else's speeds, depth, width and
// head room count instead of your own, and a carrier that flies takes off,
// climbs, glides and lands. Tested on flat ground with a pond in it.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player, SWIM_DEPTH } from '../src/player/player.js';
import { MOUNTS } from '../src/mounts/kinds.js';

// A flat world, with water 2 m deep for x > 50.
const world = {
  heightAt: (x) => (x > 50 ? -2 : 0),
  waterAt(x, z, out) {
    if (x <= 50) return false;
    out.level = 0;
    out.depth = 2;
    out.flowX = out.flowZ = out.foam = 0;
    return true;
  },
  forEachCollider() {},
};

// Keys held down, and jump pressed this frame.
function controls() {
  const held = new Set();
  let jump = false;
  return {
    held,
    tapJump: () => (jump = true),
    consumeLook: () => ({ x: 0, y: 0 }),
    lookRate: () => ({ x: 0, y: 0 }),
    consumeZoom: () => 0,
    isDown: (a) => held.has(a),
    moveAxes: () => ({ x: 0, y: held.has('forward') ? 1 : 0 }),
    running: () => held.has('run'),
    diving: () => held.has('run'), // (shift, out of your depth on foot)
    jumped() {
      const j = jump;
      jump = false;
      return j;
    },
  };
}

function make() {
  const input = controls();
  const p = new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world, input });
  p.spawn(0, 0, 0, Math.PI); // camera behind, looking along +z
  return { p, input };
}
const run = (p, s, dt = 1 / 60) => {
  for (let i = 0; i < s / dt; i++) p.update(dt);
};
const speed = (p) => Math.hypot(p.vel.x, p.vel.z);

test('on a horse you go at its pace, not your own', () => {
  const { p, input } = make();
  input.held.add('forward').add('run');
  run(p, 2);
  const onFoot = speed(p);
  p.carrier = { ...MOUNTS.horse.carrier };
  run(p, 3);
  assert.ok(onFoot < 8, `on foot, a run (${onFoot.toFixed(1)} m/s)`);
  assert.ok(Math.abs(speed(p) - MOUNTS.horse.carrier.run) < 0.3, `on a horse, a gallop (${speed(p).toFixed(1)} m/s)`);
  // and it jumps higher than you do
  input.held.clear();
  run(p, 1);
  input.tapJump();
  let top = 0;
  for (let i = 0; i < 90; i++) {
    p.update(1 / 60);
    top = Math.max(top, p.pos.y);
  }
  assert.ok(top > 1.2, `a horse clears more than a metre (${top.toFixed(2)} m)`);
});

test('a turtle swims where you would, and floats you where you would sink', () => {
  const { p } = make();
  p.spawn(60, 0, 0);
  p.update(1 / 60);
  assert.ok(p.swimming, 'on foot, 2 m of water is out of your depth');
  assert.ok(Math.abs(p.pos.y - (0 - SWIM_DEPTH)) < 0.05);
  p.carrier = { ...MOUNTS.turtle.carrier };
  run(p, 0.5);
  assert.ok(p.swimming);
  assert.ok(Math.abs(p.pos.y - -MOUNTS.turtle.carrier.depth) < 0.05, 'a turtle floats high in the water');
});

test('an eagle takes off, climbs, glides, and lands', () => {
  const { p, input } = make();
  p.carrier = { ...MOUNTS.eagle.carrier, fly: { ...MOUNTS.eagle.carrier.fly }, landing: false };
  run(p, 0.5);
  assert.equal(p.flying, false, 'on the ground to start with');
  let tookOff = 0;
  p.on('takeoff', () => tookOff++);
  input.tapJump();
  input.held.add('jump');
  p.update(1 / 60);
  assert.equal(p.flying, true);
  assert.equal(tookOff, 1);
  run(p, 4);
  const high = p.pos.y;
  assert.ok(high > 12, `climbing with jump held (${high.toFixed(1)} m)`);
  input.held.delete('jump');
  input.held.add('forward');
  run(p, 2);
  const gliding = p.pos.y;
  run(p, 2);
  assert.ok(p.pos.y < gliding && p.pos.y > gliding - 2, `gliding, it loses height slowly (${(gliding - p.pos.y).toFixed(2)} m in 2 s)`);
  assert.ok(Math.abs(speed(p) - MOUNTS.eagle.carrier.fly.cruise) < 1, `at a cruise (${speed(p).toFixed(1)} m/s)`);
  input.held.add('run');
  run(p, 1);
  assert.ok(p.vel.y < -6, 'stooping, it drops fast');
  // and it only goes so high
  input.held.clear();
  input.held.add('jump');
  run(p, 30);
  assert.ok(p.height < MOUNTS.eagle.carrier.fly.ceiling + 1, `no higher than its ceiling (${p.height.toFixed(1)} m)`);
  input.held.clear();
  p.carrier.landing = true;
  run(p, 14);
  assert.equal(p.flying, false, 'and comes down to land');
  assert.ok(Math.abs(p.pos.y) < 0.01);
});

test('nothing carrying you, nothing changes', () => {
  const { p, input } = make();
  input.held.add('forward');
  run(p, 2);
  assert.ok(Math.abs(speed(p) - 2.2) < 0.05, 'a walk');
  assert.equal(p.flying, false);
});

test('aboard something that moves you, you go where it puts you, and the camera comes round with it', () => {
  const { p, input } = make();
  // a seat going round a 40 m circle at 10 m/s, facing the way it goes
  let a = 0;
  const seat = { x: 0, y: 3, z: 0, yaw: 0 };
  p.aboard = {
    place(out) {
      out.x = Math.sin(a) * 40;
      out.y = 3;
      out.z = Math.cos(a) * 40 - 40;
      out.yaw = a + Math.PI / 2;
      Object.assign(seat, out);
    },
  };
  input.held.add('forward').add('run');
  input.tapJump();
  const cam0 = p.camYaw - (Math.PI / 2 + 0);
  for (let i = 0; i < 120; i++) {
    a += (10 / 40) / 60;
    p.update(1 / 60);
  }
  assert.ok(Math.hypot(p.pos.x - seat.x, p.pos.z - seat.z) < 1e-9 && p.pos.y === 3, 'it puts you where you sit, whatever your keys say');
  assert.ok(Math.abs(p.yaw - seat.yaw) < 1e-9, 'facing the way it faces');
  assert.equal(p.grounded, true);
  assert.ok(Math.abs(Math.hypot(p.vel.x, p.vel.z) - 10) < 0.2, `going at its speed (${Math.hypot(p.vel.x, p.vel.z).toFixed(2)} m/s)`);
  // the camera turned as far as it did, so you see the same side of the line
  assert.ok(Math.abs(p.camYaw - Math.PI / 2 - cam0 - (a - (10 / 40) / 60)) < 0.02, 'the camera swung round with it');
  assert.ok(Math.hypot(p.camTarget.x - p.pos.x, p.camTarget.z - p.pos.z) < 0.5, 'and keeps up with you');
  // off again: your own feet
  p.aboard = null;
  input.held.clear();
  run(p, 0.5);
  assert.ok(p.pos.y < 3, 'stepped off, you come down to the ground');
});
