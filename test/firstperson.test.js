// Looking out of your own eyes (Player.firstPerson): zoomed in past the
// nearest the camera comes it goes into your head, and zoomed out it comes
// back. Tested on flat ground, with the wheel and a pad's held zoom button.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player/player.js';

const world = { heightAt: () => 0, waterAt: () => false, forEachCollider() {} };

// The wheel turned (+1 a notch out, -1 a notch in) and buttons held down.
function controls() {
  const held = new Set();
  let wheel = 0;
  return {
    held,
    turn: (n) => (wheel += n),
    consumeLook: () => ({ x: 0, y: 0 }),
    lookRate: () => ({ x: 0, y: 0 }),
    consumeZoom() {
      const z = wheel;
      wheel = 0;
      return z;
    },
    isDown: (a) => held.has(a),
    moveAxes: () => ({ x: 0, y: 0 }),
    running: () => false,
    diving: () => false,
    jumped: () => false,
  };
}

function make() {
  const input = controls();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  const p = new Player({ scene: new THREE.Scene(), camera, world, input });
  p.spawn(5, 5, 0);
  return { p, input, camera };
}
const run = (p, s, dt = 1 / 60) => {
  for (let i = 0; i < s / dt; i++) p.update(dt);
};
// a notch of the wheel, and a frame for it to be seen
const notch = (p, input, n) => {
  input.turn(n);
  p.update(1 / 60);
};
const looking = (camera) => camera.getWorldDirection(new THREE.Vector3());

test('zoomed in past the nearest, you look out of your own eyes; zoomed out, from behind again', () => {
  const { p, input, camera } = make();
  let notches = 0;
  while (!p.firstPerson && notches < 40) {
    notch(p, input, -1);
    notches++;
  }
  assert.ok(p.firstPerson, 'in, in the end');
  assert.ok(notches > 2, `a few notches first, from behind (${notches})`);
  const nearest = p.camDist;
  const ahead = looking(camera);
  run(p, 0.2);
  assert.ok(p.fromEye);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(5, p.eye, 5)) < 1e-9, 'at your eyes');
  assert.ok(looking(camera).distanceTo(ahead) < 1e-6, 'looking the way you were');
  assert.equal(camera.fov, 55, 'as wide as ever');
  assert.equal(p.character.hips.visible, false, 'and you not in the way');
  assert.equal(p.character.root.visible, true, '(the figure: the root is left for whatever carries you off)');
  notch(p, input, -1);
  assert.ok(p.firstPerson, 'further in, still in');
  notch(p, input, 1);
  assert.ok(!p.firstPerson, 'a notch out, and out of your head');
  assert.equal(p.camDist, nearest, 'as near as it comes');
  run(p, 1);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(5, p.eye, 5)) > 1.5, 'behind you again');
  assert.equal(p.character.hips.visible, true);
  assert.equal(camera.fov, 55);
});

test('a held zoom button stops at the nearest a moment before going in', () => {
  const { p, input } = make();
  const far = p.camDist;
  input.held.add('zoomIn');
  for (let i = 0; i < 600 && p.camDist > 2.21; i++) run(p, 1 / 60);
  const nearest = p.camDist;
  assert.ok(nearest < far / 2 && !p.firstPerson, 'at the nearest, not yet in');
  run(p, 0.2);
  assert.ok(!p.firstPerson, 'held in there a moment');
  run(p, 0.3);
  assert.ok(p.firstPerson, 'then in');
  input.held.clear();
  input.held.add('zoomOut');
  run(p, 1 / 60);
  assert.ok(!p.firstPerson, 'and out at once');
  run(p, 1);
  assert.ok(p.camDist > nearest * 2, 'and on out');
});

test('from your eyes you can look further up', () => {
  const { p, input } = make();
  const up = (s) => {
    p.camPitch = -3;
    run(p, s);
    return p.camPitch;
  };
  const behind = up(1);
  p.firstPerson = true;
  const fromEyes = up(1 / 60);
  assert.ok(fromEyes < behind - 0.5, `up to ${fromEyes} from your eyes, ${behind} from behind`);
  notch(p, input, 1);
  run(p, 2);
  assert.ok(Math.abs(p.camPitch - behind) < 0.01, 'back where it can be from behind');
});

test('riding something that moves you itself, you see yourself on it; off it, your eyes again', () => {
  const { p, input, camera } = make();
  p.firstPerson = true;
  run(p, 0.1);
  const at = { x: 5, y: 0, z: 5 };
  p.aboard = {
    place(out) {
      at.z += 0.05;
      Object.assign(out, at, { yaw: 0 });
    },
  };
  run(p, 0.5);
  assert.ok(!p.fromEye, 'from behind while it carries you');
  assert.equal(p.character.hips.visible, true);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(p.pos.x, p.pos.y + p.eye, p.pos.z)) > 1.5);
  // zooming in from the nearest, aboard, goes no nearer
  for (let i = 0; i < 30; i++) notch(p, input, -1);
  assert.ok(!p.fromEye);
  p.aboard = null;
  run(p, 0.1);
  assert.ok(p.fromEye && p.firstPerson, 'off it, back behind your eyes');
  // ...and zooming out aboard puts first person by
  p.aboard = { place: (out) => Object.assign(out, at, { yaw: 0 }) };
  notch(p, input, 1);
  p.aboard = null;
  run(p, 0.1);
  assert.ok(!p.firstPerson);
});

test('a sight held up from your eyes brings things closer, and lowered, leaves you in them', () => {
  const { p, camera } = make();
  p.firstPerson = true;
  run(p, 0.1);
  p.sight = { zoom: 4 };
  run(p, 1 / 60);
  assert.ok(Math.abs(camera.fov - 55 / 4) < 1e-9);
  p.sight = null;
  run(p, 1 / 60);
  assert.equal(camera.fov, 55);
  assert.ok(p.fromEye, 'still from your eyes');
  assert.equal(p.character.hips.visible, false);
});

test('whatever hides you for itself still has you hidden after', () => {
  const { p, input } = make();
  p.character.root.visible = false; // (a plane you've boarded)
  p.firstPerson = true;
  run(p, 0.1);
  notch(p, input, 1);
  run(p, 0.1);
  assert.equal(p.character.root.visible, false);
});
