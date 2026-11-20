// Hunting: what is game, what a shot hits, a kill lying where it fell, meat
// roasting on a spit and how it is saved; and what hunting asks of the
// animals (to be shot at and startled) and of the player (a scope to look
// through).

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { QUARRY, isGame, yieldOf } from '../src/hunting/quarry.js';
import { traceShot, RANGE } from '../src/hunting/shot.js';
import { Carcasses, the } from '../src/hunting/carcasses.js';
import { Spits, ROAST, doneness, roastPace, cutColour, validateSpits } from '../src/hunting/roasting.js';
import { rayCapsule } from '../src/wildlife/beasts.js';
import { Wildlife } from '../src/wildlife/wildlife.js';
import { SPECIES } from '../src/wildlife/species.js';
import { Player } from '../src/player/player.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const v = (x, y, z) => new THREE.Vector3(x, y, z);

// ── What is game ────────────────────────────────────────────────────────────

test('game is the bigger mammals, and a smaller one gives less', () => {
  for (const kind of ['deer', 'elk', 'moose', 'bear', 'rabbit', 'squirrel']) assert.ok(isGame(kind), kind);
  for (const kind of ['mouse', 'chipmunk', 'snake', 'flock', 'owl', 'toString', 'constructor']) assert.ok(!isGame(kind), kind);
  assert.deepEqual(yieldOf('deer'), { cuts: QUARRY.deer.cuts, dress: QUARRY.deer.dress });
  const fawn = yieldOf('deer', 0.66);
  assert.ok(fawn.cuts < QUARRY.deer.cuts && fawn.cuts >= 1 && fawn.dress < QUARRY.deer.dress);
  assert.equal(yieldOf('bear', 0.42).cuts, 1, 'a cub is a cut at least');
  assert.equal(yieldOf('mouse'), null);
  assert.ok(yieldOf('moose', 1.1).dress <= QUARRY.moose.dress, 'a big one takes no longer than a grown one');
});

// ── What a shot hits ────────────────────────────────────────────────────────

// Flat ground at y = 0, with trees and rocks where it is told: [kind, x, z, s].
function land(plants = []) {
  return {
    heightAt: () => 0,
    forEachPlant(x, z, r, kinds, fn) {
      for (const [kind, px, pz, s] of plants) if (kinds.includes(kind) && Math.hypot(px - x, pz - z) <= r) fn(null, kind, 0, px, 0, pz, s);
    },
  };
}
// An animal standing at distance `at` along +z, as wildlife.aimed reports one.
const animalAt = (at) => ({
  aimed: (o, d, far, nearT) => (at >= nearT && at < far ? { t: at, e: {}, who: { kind: 'deer' } } : null),
});

test('a shot hits the first thing along it: game, ground, a trunk or a boulder', () => {
  const o = v(0, 1.5, 0);
  const level = v(0, 0, 1);
  const down = v(0, -0.1, 1).normalize();
  assert.equal(traceShot({ chunks: land() }, o, level).what, null, 'nothing in range: off into the trees');
  const ground = traceShot({ chunks: land() }, o, down);
  assert.equal(ground.what, 'ground');
  assert.ok(near(ground.t, 1.5 / 0.1 * Math.hypot(0.1, 1), 0.05), `where it meets the ground (${ground.t})`);
  assert.equal(traceShot({ chunks: land(), wildlife: animalAt(40) }, o, level).what, 'animal');
  assert.equal(traceShot({ chunks: land(), wildlife: animalAt(40) }, o, down).what, 'ground', 'not through the hillside');
  const pine = ['pine', 0, 30, 1];
  const shotAtTree = traceShot({ chunks: land([pine]), wildlife: animalAt(40) }, o, level);
  assert.equal(shotAtTree.what, 'tree', 'a trunk in front of it stops the shot');
  assert.ok(near(shotAtTree.t, 30 - 0.32, 0.01));
  assert.equal(traceShot({ chunks: land([pine]), wildlife: animalAt(20) }, o, level).what, 'animal', 'one in front of the trunk is hit');
  const low = v(0, 0.6, 0); // lying down to shoot
  assert.equal(traceShot({ chunks: land([['rock', 0, 25, 1.2]]) }, low, level).what, 'rock', 'a boulder as high as the shot');
  assert.equal(traceShot({ chunks: land([['rock', 0, 25, 0.4]]) }, low, level).what, null, 'a stone it goes over');
  assert.equal(traceShot({ chunks: land([['rock', 0, 25, 1.2]]) }, o, level).what, null, 'and a boulder, from standing');
  assert.equal(traceShot({ chunks: land([['pine', 0, 1, 1]]), wildlife: animalAt(40) }, o, level, 2).what, 'animal', 'nothing nearer than `near` counts');
  assert.equal(traceShot({ chunks: land(), wildlife: animalAt(RANGE + 10) }, o, level).what, null, 'nor anything out of range');
  const wall = { raycast: (oo, dd, max) => (12 < max ? { t: 12 } : null) };
  assert.equal(traceShot({ chunks: land(), buildings: wall, wildlife: animalAt(40) }, o, level).what, 'building');
});

test('a ray meets a capsule where it should', () => {
  const a = v(-1, 1, 10);
  const b = v(1, 1, 10);
  const o = v(0, 1, 0);
  assert.ok(near(rayCapsule(o, v(0, 0, 1), a, b, 0.3), 9.7), 'square on: its near side');
  assert.equal(rayCapsule(o, v(0, 0, 1), a, b, 0.3, 9), null, 'not past `far`');
  assert.equal(rayCapsule(o, v(0, 0, -1), a, b, 0.3), null, 'not behind you');
  assert.equal(rayCapsule(v(0, 1.4, 0), v(0, 0, 1), a, b, 0.3), null, 'over the top of it');
  const end = rayCapsule(v(1.2, 1, 0), v(0, 0, 1), a, b, 0.3);
  assert.ok(end !== null && end > 9.7 && end < 10, 'its rounded end');
  assert.equal(rayCapsule(v(1.4, 1, 0), v(0, 0, 1), a, b, 0.3), null, 'and past it');
  const along = rayCapsule(v(-5, 1, 10), v(1, 0, 0), a, b, 0.3);
  assert.ok(near(along, 3.7), 'end on');
});

// ── The animals, shot at and startled ───────────────────────────────────────

function forest() {
  const chunks = { heightAt: () => 0, waterAt: () => false, forEachCollider() {}, forEachPlant() {} };
  const player = { pos: v(0, 0, 0), vel: v(0, 0, 0), camYaw: 0 };
  const wl = new Wildlife({ scene: new THREE.Scene(), gen: {}, chunks, player, camera: new THREE.PerspectiveCamera() });
  const herd = (kind, x, z) => wl.spawnAt(SPECIES[kind], { x, z }, {});
  return { wl, herd };
}

test('an animal can be shot: the first along the ray, if it is game, and is then gone', () => {
  const { wl, herd } = forest();
  const deer = herd('deer', 0, 30);
  const mice = herd('mouse', 0, 20);
  const doe = deer.members[0];
  const y = doe.torso.y;
  const o = v(0, y, 0);
  const d = v(doe.x, y, doe.z).sub(o).normalize();
  // the mouse is nearer, but isn't game; and nothing is hit past `far`
  const game = (a) => a.kind === 'deer';
  const a = wl.aimed(o, d, 100, 0, game);
  assert.ok(a && a.who === doe && a.e === deer, 'the deer');
  assert.ok(a.t > 28 && a.t < 30.5, `about where it stands (${a.t})`);
  assert.equal(wl.aimed(o, d, 20, 0, game), null);
  assert.equal(wl.aimed(o, v(0, 0, -1), 100), null, 'and nothing behind you');
  assert.ok(mice.members.length > 0);

  const n = deer.members.length;
  const body = wl.kill(a);
  assert.equal(body.kind, 'deer');
  assert.match(body.label, /^a white-tailed/);
  assert.equal(body.mesh, doe.mesh);
  assert.equal(body.mesh.parent, null, 'out of the scene, for whoever shot it');
  assert.deepEqual(body.torso, doe.torso);
  assert.equal(deer.members.length, n - 1, 'and out of its herd');
  assert.ok(!deer.meshes.includes(doe.mesh));
  assert.equal(wl.entities.includes(deer), n > 1, 'which goes when the last of it does');
  assert.equal(wl.kill(a), null, 'it can only be killed once');
  body.dispose();
});

test('a shot startles everything in earshot, and nothing beyond', () => {
  const { wl, herd } = forest();
  const close = herd('elk', 0, 60);
  const far = herd('elk', 0, 400);
  for (const m of [...close.members, ...far.members]) m.setState('graze', 999);
  wl.startle(0, 0, 300);
  assert.ok(close.members.every((m) => m.state === 'flee'), 'the near herd runs');
  assert.ok(far.members.every((m) => m.state === 'graze'), 'the far one never heard it');
  assert.ok(close.alarm && close.alarm.x === 0 && close.alarm.z === 0, 'away from where it came from');
});

// ── A kill ──────────────────────────────────────────────────────────────────

test('a kill goes over onto its side where it stood, and can be found along its body', () => {
  const scene = new THREE.Scene();
  const kills = new Carcasses({ scene, ground: () => 2 });
  let gone = 0;
  const body = (x, z, yaw = 0) => ({ kind: 'deer', label: 'a white-tailed buck', mesh: new THREE.Object3D(), x, z, yaw, scale: 1, torso: { a: -0.4, b: 0.4, y: 0.76, r: 0.22 }, dispose: () => gone++ });
  const c = kills.add(body(10, 20));
  assert.equal(c.name, 'the white-tailed buck');
  assert.equal(c.cuts, QUARRY.deer.cuts);
  assert.equal(c.mesh.parent, scene);
  assert.ok(near(c.mesh.position.y, 2), 'standing, at first');
  kills.update(1);
  assert.ok(near(Math.abs(c.mesh.rotation.z), Math.PI / 2), 'then on its side');
  const centre = new THREE.Vector3(0, 0.76, 0).applyEuler(c.mesh.rotation).add(c.mesh.position);
  assert.ok(near(centre.x, 10, 1e-6) && near(centre.z, 20, 1e-6), 'where it stood');
  assert.ok(near(centre.y, 2 + 0.22, 1e-6), 'its thickness off the ground');
  assert.equal(kills.near(10, 20.5, 0.5), c, 'along its body');
  assert.equal(kills.near(10.6, 20, 0.3), null, 'but not off to the side of it');
  assert.equal(kills.near(10, 21.2, 0.3), null, 'or past its end');
  for (let i = 0; i < 8; i++) kills.add(body(i, 0));
  assert.equal(kills.list.length, 6, 'only the last few are kept');
  assert.equal(gone, 3, 'the others go, and are disposed of');
  assert.equal(the('an elk'), 'the elk');
});

// ── Roasting ────────────────────────────────────────────────────────────────

// Fires that burn as they're told: { "x,z": { state, heat } }.
function fires(states) {
  return {
    at: (x, z) => (states[`${x},${z}`] ? { x, z } : null),
    state: (f) => states[`${f.x},${f.z}`],
  };
}

test('meat roasts while the fire under it burns, and burns if left', () => {
  const states = { '0,0': { state: 'burning', heat: 1 } };
  const spits = new Spits({ scene: new THREE.Scene(), fires: fires(states) });
  let changes = 0;
  spits.on('change', () => changes++);
  assert.ok(spits.put(0, 0, 1.5));
  assert.equal(changes, 1);
  const s = spits.at(0, 0);
  for (let t = 0.5; t < ROAST.cook; t += 0.5) spits.update(0.5, { x: 0, z: 3 });
  assert.equal(doneness(s.cuts[0]), 'nearly done', 'not quite, just short of its time');
  spits.update(1, { x: 0, z: 3 });
  assert.ok(s.cuts[0] >= 1 && s.cuts[0] < 1.05, 'roasted in its time');
  assert.equal(doneness(s.cuts[0]), 'done');
  assert.ok(changes >= 4, 'and said so at each stage, to be kept');
  assert.deepEqual(spits.heard && [spits.heard.x, spits.heard.z], [0, 0], 'it can be heard');
  states['0,0'] = { state: 'cold', heat: 0 };
  const was = s.cuts[0];
  spits.update(10, { x: 0, z: 3 });
  assert.equal(s.cuts[0], was, 'and stops when the fire is out');
  assert.equal(spits.heard, null, 'and goes quiet');
  states['0,0'] = { state: 'burning', heat: 1 };
  spits.update(ROAST.cook, null);
  assert.equal(doneness(s.cuts[0]), 'burnt');
});

test('embers roast more slowly than flames; a fire just catching, slowly too', () => {
  assert.equal(roastPace({ state: 'burning', heat: 1 }), 1);
  assert.equal(roastPace({ state: 'burning', heat: 0.05 }), ROAST.least);
  assert.ok(roastPace({ state: 'embers', heat: 1 }) < 1 && roastPace({ state: 'embers', heat: 0.2 }) < roastPace({ state: 'embers', heat: 1 }));
  for (const state of ['ring', 'laid', 'cold']) assert.equal(roastPace({ state, heat: 0 }), 0, state);
  assert.equal(roastPace(null), 0);
  const raw = cutColour(0);
  const done = cutColour(1);
  const burnt = cutColour(ROAST.char);
  assert.ok(raw.r > done.r && done.r > burnt.r, 'red, browned, black');
});

test('a spit takes three cuts, and taking them off sorts them', () => {
  const spits = new Spits({ scene: new THREE.Scene(), fires: fires({}) });
  assert.ok(spits.put(3, 4, 0, 0.2));
  assert.ok(spits.put(3, 4, 0, 1.2));
  assert.ok(spits.put(3, 4, 0, ROAST.char + 0.1));
  assert.equal(spits.put(3, 4, 0), false, 'full');
  assert.deepEqual(spits.takeOff(spits.at(3, 4)), { done: 1, burnt: 1, raw: 1 });
  assert.equal(spits.at(3, 4), null, 'and the spit comes down with them');
  assert.equal(spits.list.size, 0);
});

test('spits are saved as they are, and a save is made safe before it is believed', () => {
  const a = new Spits({ scene: new THREE.Scene(), fires: fires({}) });
  a.put(1, 2, 0.5, 0.25);
  a.put(1, 2, 0.5, 1.0004);
  a.put(-7, 9, 3.25, 0);
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  assert.deepEqual(saved, [[1, 2, 0.5, [0.25, 1]], [-7, 9, 3.25, [0]]]);
  const b = new Spits({ scene: new THREE.Scene(), fires: fires({}) });
  b.put(50, 50, 0);
  b.load(validateSpits(saved));
  assert.deepEqual(b.serialize(), saved, 'what was there before is replaced');
  assert.deepEqual(validateSpits(null), []);
  assert.deepEqual(validateSpits([[1, 2, 0, [0.5, 'x', -1, 2, 3, 4]], 'x', [1, 'a', 0, [1]], [5.4, 6, 0, []], [7, 8, 0, [Infinity]]]), [[1, 2, 0, [0.5, 2, 3]]]);
});

// ── The scope ───────────────────────────────────────────────────────────────

test('a sight held up puts the camera at your eye, the same way, closer; let go, it is as it was', () => {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  const world = { heightAt: () => 0, waterAt: () => false, forEachCollider() {} };
  const input = { consumeLook: () => ({ x: 0, y: 0 }), consumeZoom: () => 0 };
  const player = new Player({ scene: new THREE.Scene(), camera, world, input });
  player.spawn(5, 5, 0);
  const behind = camera.position.clone();
  const ahead = new THREE.Vector3();
  camera.getWorldDirection(ahead);
  player.sight = { zoom: 4 };
  player.updateCamera(1 / 60, true);
  assert.ok(near(camera.fov, 55 / 4));
  assert.ok(camera.position.distanceTo(v(5, player.eye, 5)) < 1e-9, 'at your eye');
  const through = new THREE.Vector3();
  camera.getWorldDirection(through);
  assert.ok(through.distanceTo(ahead) < 1e-6, 'looking the way it was');
  assert.equal(player.character.root.visible, false, 'and you out of the way');
  player.sight = null;
  player.updateCamera(1 / 60, true);
  assert.equal(camera.fov, 55);
  assert.ok(camera.position.distanceTo(behind) < 1e-6);
  assert.equal(player.character.root.visible, true);
});
