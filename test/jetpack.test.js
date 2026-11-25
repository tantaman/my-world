// The jetpack: when the jets fire and cut out, and how they carry you, with
// the hiker as the game has it (Player) on flat ground with a pond; and where
// its rack stands at the launch site, on every land.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player/player.js';
import { MOUNTS } from '../src/mounts/kinds.js';
import { Jets, HOLD, FLIGHT, BURN, LEAN, FLYING, LIT, aimAlong } from '../src/jetpack/jets.js';
import { Jetpackers } from '../src/jetpack/others.js';
import { Character } from '../src/player/character.js';
import { rackAt, RACK } from '../src/jetpack/rack.js';
import { growWorld, LANDS } from '../src/world/lands.js';
import { findSite, PAD, ROCKET_AT, LANDING_AT } from '../src/spaceport/site.js';
import { buildLaunchSite } from '../src/spaceport/launchSite.js';
import { segDist } from '../src/core/geom.js';

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

// Keys held down, and jump pressed this frame (as Input has them).
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
    diving: () => held.has('run'),
    // (a press lasts the frame, as Input's does: asking doesn't take it)
    jumped: () => jump,
    endFrame: () => (jump = false),
  };
}

// The hiker, the jets on their back, and a frame as the game runs it: the
// hiker moves, then the jets see what came of it (index.js).
function make({ worn = true } = {}) {
  const input = controls();
  const p = new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world, input });
  p.spawn(0, 0, 0, Math.PI); // camera behind, looking along +z
  const jets = new Jets();
  jets.worn = worn;
  const said = [];
  const keys = {
    get held() {
      return input.held.has('jump');
    },
    pressed: () => input.jumped(),
    blocked: false,
  };
  const frame = (dt = 1 / 60) => {
    p.update(dt);
    const what = jets.step(dt, p, keys);
    if (what) said.push(what);
    jets.update(dt, p, input.running());
    input.endFrame();
  };
  const run = (s, dt = 1 / 60) => {
    for (let i = 0; i < s / dt; i++) frame(dt);
  };
  frame(); // (standing on the ground from the first frame on)
  return { p, input, jets, said, frame, run };
}
const speed = (p) => Math.hypot(p.vel.x, p.vel.z);

test('a tapped jump is still a jump: the jets only fire when jump is held off the ground', () => {
  const { p, input, jets, said, frame, run } = make();
  input.tapJump();
  input.held.add('jump');
  frame();
  input.held.delete('jump'); // let go at once
  run(1);
  assert.deepEqual(said, [], 'no jets');
  assert.ok(p.grounded && !p.carrier, 'down again, on your own feet');
  // held this time
  input.tapJump();
  input.held.add('jump');
  let lit = 0;
  for (let t = 0; !jets.on && t < 1; t += 1 / 60) {
    frame();
    lit = t;
  }
  assert.deepEqual(said, ['ignite']);
  assert.ok(lit >= HOLD - 0.02 && lit < HOLD + 0.1, `they fire once it's been held up there a moment (${lit.toFixed(2)} s)`);
  assert.equal(p.carrier, jets.carrier, 'and carry you');
  assert.ok(p.carrier.fly, 'flying');
});

test('pressed again in the air, they fire then and there', () => {
  const { p, input, jets, said, frame } = make();
  input.tapJump();
  frame();
  assert.ok(!p.grounded && !jets.on, 'up, from a jump');
  frame();
  frame();
  input.tapJump();
  frame();
  assert.deepEqual(said, ['ignite']);
  assert.ok(p.flying || !p.grounded);
});

test('flying: space climbs, the jets go full; W flies, shift dives and goes faster', () => {
  const { p, input, jets, run } = make();
  input.tapJump();
  input.held.add('jump');
  run(4);
  assert.ok(jets.on && p.flying, 'flying');
  assert.ok(Math.abs(p.vel.y - FLIGHT.climb) < 0.3, `climbing at ${p.vel.y.toFixed(1)} m/s`);
  assert.ok(p.height > 20, `${p.height.toFixed(0)} m up`);
  assert.ok(jets.thrust > BURN.climb * 0.95, `the jets full on (${jets.thrust.toFixed(2)})`);
  input.held.add('forward');
  run(3);
  assert.ok(Math.abs(speed(p) - FLIGHT.cruise) < 0.5, `flying along at ${speed(p).toFixed(1)} m/s`);
  assert.ok(jets.pitch > 0.1 && jets.pitch < LEAN.most, `tipped forward into it (${jets.pitch.toFixed(2)} rad)`);
  input.held.delete('jump');
  input.held.add('run');
  run(1.5);
  assert.ok(speed(p) > FLIGHT.cruise + 5, `faster with shift (${speed(p).toFixed(1)} m/s)`);
  assert.ok(p.vel.y < FLIGHT.glide - 5, `and diving (${p.vel.y.toFixed(1)} m/s)`);
  assert.ok(jets.thrust < BURN.glide, `on a flicker of the jets (${jets.thrust.toFixed(2)})`);
});

test('let go and they let you down slowly; touch down and they cut out', () => {
  const { p, input, jets, said, run } = make();
  input.tapJump();
  input.held.add('jump');
  run(3);
  input.held.delete('jump');
  run(2);
  assert.ok(jets.on, 'still flying');
  assert.ok(Math.abs(p.vel.y - FLIGHT.glide) < 0.2, `sinking at ${p.vel.y.toFixed(1)} m/s`);
  assert.ok(Math.abs(jets.thrust - BURN.glide) < 0.05, 'the jets throttled back');
  let t = 0;
  while (jets.on && t < 60) {
    run(0.5);
    t += 0.5;
  }
  assert.deepEqual(said, ['ignite', 'landed'], 'down, and they cut out');
  assert.ok(p.grounded && p.carrier === null && !p.flying, 'on your own feet');
  assert.equal(jets.pitch, 0);
  run(1);
  assert.ok(jets.thrust < 0.01, 'and they die away');
  // holding jump again on the ground does nothing more: you have to jump
  input.held.add('jump');
  run(1);
  assert.deepEqual(said, ['ignite', 'landed']);
});

test('no higher than its ceiling over the ground', () => {
  const { p, input, run } = make();
  input.tapJump();
  input.held.add('jump');
  run(FLIGHT.ceiling / FLIGHT.climb + 10, 1 / 30);
  assert.ok(p.height < FLIGHT.ceiling + 1 && p.height > FLIGHT.ceiling - 3, `${p.height.toFixed(1)} m up`);
});

test('down into deep water, they cut out and you swim', () => {
  const { p, input, jets, said, run } = make();
  input.tapJump();
  input.held.add('jump');
  run(1);
  input.held.delete('jump');
  p.pos.x = 70;
  input.held.add('run'); // dive
  let t = 0;
  while (jets.on && t < 10) {
    run(0.25);
    t += 0.25;
  }
  input.held.delete('run');
  run(1);
  assert.deepEqual(said, ['ignite', 'landed']);
  assert.ok(p.swimming, 'swimming');
});

test('without it on, or with something else carrying you, they never fire; and a mount takes over from them', () => {
  const off = make({ worn: false });
  off.input.tapJump();
  off.input.held.add('jump');
  off.run(2);
  assert.deepEqual(off.said, []);
  const horse = make();
  horse.p.carrier = { ...MOUNTS.horse.carrier };
  horse.input.tapJump();
  horse.input.held.add('jump');
  horse.run(2);
  assert.deepEqual(horse.said, [], 'not from a horse’s back');
  // flying, and your horse is ridden: it's the horse's now
  const flying = make();
  flying.input.tapJump();
  flying.input.held.add('jump');
  flying.run(1);
  flying.p.carrier = { ...MOUNTS.horse.carrier };
  flying.run(0.1);
  assert.deepEqual(flying.said, ['ignite', 'lost']);
  assert.ok(!flying.jets.on && flying.p.carrier.walk === MOUNTS.horse.carrier.walk, 'the horse is left carrying you');
});

// ── A push for whatever carries you ─────────────────────────────────────────
// A skateboard under your feet asks the jets for a push along instead of a
// flight (skateboarding/), and does the pushing itself with what they give.

test('asked for a push, the jets catch after the same moment and go full blast, and fly you nowhere', () => {
  const { p, jets, said, frame } = make();
  jets.want();
  frame();
  assert.equal(jets.pushing, false, 'a tap of it is still a tap');
  let held = 0;
  for (; !jets.pushing && held < 1; held += 1 / 60) {
    jets.want();
    frame();
  }
  assert.ok(held >= HOLD - 0.02 && held < HOLD + 0.05, `held, and they catch (${held.toFixed(2)} s, where a flight waits ${HOLD})`);
  for (let i = 0; i < 60; i++) {
    jets.want();
    frame();
  }
  assert.ok(jets.along > BURN.along * 0.95, `going full blast (${jets.along.toFixed(2)})`);
  assert.equal(jets.along, jets.thrust, 'which is what the flames and the roar are made of');
  assert.deepEqual(said, [], 'and no flight of their own');
  assert.ok(p.grounded && !p.carrier && p.rides.free, 'nothing of the jetpack has you: the pushing is the asker’s');
  // stop asking, and that is the end of it
  frame();
  assert.equal(jets.pushing, false, 'out as soon as you stop asking');
  assert.equal(jets.along, 0);
  for (let i = 0; i < 120; i++) frame();
  assert.equal(jets.thrust, 0, 'and they die away to nothing');
});

test('pushing something along, the jetpack swings round flat on your back to point the jets back the way it goes', () => {
  const { jets, frame } = make();
  // the back as a skater has it, stood across the board: the board goes to
  // the hiker's left, along the ground
  const toBack = (v) => ({ x: v.x, y: v.y, z: v.z });
  const left = { x: 1, y: 0, z: 0 };
  const go = (n, toward = left) => {
    for (let i = 0; i < n; i++) {
      jets.want(toward);
      frame();
      jets.swing(1 / 60, toBack);
    }
  };
  // the nozzles' way out, in the back's frame (they point down its spine, -y, turned round z)
  const out = () => ({ x: Math.sin(jets.swivel), y: -Math.cos(jets.swivel) });
  go(3);
  assert.equal(jets.pushing, false);
  assert.equal(jets.swivel, 0, 'a tap of the push leaves it hanging as it was');
  go(60);
  assert.ok(jets.pushing);
  const o = out();
  assert.ok(o.x < -0.99 && Math.abs(o.y) < 0.05, `the jets point back along the way you go, flat to the ground (${o.x.toFixed(2)}, ${o.y.toFixed(2)})`);
  // let go: it stays round while the flames die, then hangs upright again
  frame();
  jets.swing(1 / 60, toBack);
  assert.ok(!jets.pushing && jets.thrust > LIT && jets.swivel < -1.5, 'still round while the flames die away');
  for (let i = 0; i < 120; i++) {
    frame();
    jets.swing(1 / 60, toBack);
  }
  assert.ok(Math.abs(jets.swivel) < 0.01, `upright again once they're out (${jets.swivel.toFixed(3)})`);
  // up a hill, the jets point back down it; the other way round, the other way
  assert.ok(Math.abs(aimAlong({ x: 0.9, y: 0.436, z: 0 }) - aimAlong(left) - 0.452) < 0.01, 'tipped with the slope');
  assert.ok(Math.abs(aimAlong({ x: -1, y: 0, z: 0 }) - Math.PI / 2) < 1e-9, 'round the other way');
  // the way through your back can't be pointed along: it stays as it was
  assert.equal(aimAlong({ x: 0.1, y: 0, z: 1 }), null);
  go(60, { x: 0.1, y: 0, z: -1 });
  assert.ok(Math.abs(jets.swivel + Math.PI / 2) < 0.01, 'kept turned the way it was');
});

test('nothing is pushed with the jetpack on its rack, and a flight of your own comes first', () => {
  const off = make({ worn: false });
  for (let i = 0; i < 60; i++) {
    off.jets.want();
    off.frame();
  }
  assert.equal(off.jets.pushing, false, 'it is on its rack: there is nothing to ask');
  assert.equal(off.jets.thrust, 0, 'and nothing burns');
  // flying, an ask gets nothing: the jets have you themselves
  const flying = make();
  flying.input.tapJump();
  flying.input.held.add('jump');
  flying.run(1);
  assert.ok(flying.jets.on, 'flying');
  for (let i = 0; i < 60; i++) {
    flying.jets.want();
    flying.frame();
  }
  assert.ok(flying.jets.on && !flying.jets.pushing, 'still flying, and pushing nobody along');
  assert.equal(flying.jets.along, 0, 'nothing for an asker');
  assert.ok(flying.jets.thrust > 0.9, `the jets going for the flight (${flying.jets.thrust.toFixed(2)})`);
});

// ── The rack ────────────────────────────────────────────────────────────────

const SEED = 20261119;

test('the rack stands on the launch pad, at the front, clear of everything else on it', () => {
  assert.ok(Math.abs(RACK.x) < PAD - 1 && Math.abs(RACK.z) < PAD - 0.5, 'on the pad');
  assert.ok(RACK.z > 0, 'at the front, the side people come from');
  assert.ok(Math.hypot(RACK.x - ROCKET_AT.x, RACK.z - ROCKET_AT.z) > 7, 'too far from the rocket for T to climb aboard from it');
  assert.ok(Math.hypot(RACK.x - LANDING_AT.x, RACK.z - LANDING_AT.z) > 4, 'clear of where the capsule comes down');
  for (const land of LANDS) {
    const gen = growWorld(SEED, [], land);
    const site = findSite(gen, gen.findSpawn(0, 0));
    const rack = rackAt(site);
    assert.ok(Math.abs(rack.y - site.top) < 1e-9, `land ${land}: on the top of the pad`);
    // clear of the pad's own solids (the tower, the rocket, the tank, the blockhouse,
    // the floodlights), leaving room to walk up to it
    const { solids } = buildLaunchSite(site, (x, z) => gen.height(x, z), { body: new THREE.MeshBasicMaterial() });
    const seg = { d: 0, nx: 0, nz: 0, t: 0 };
    for (const s of solids) {
      if (s.topA - site.top < 0.5) continue; // the pad itself, underfoot
      for (const [x, z] of [
        [rack.solid.ax, rack.solid.az],
        [rack.solid.bx, rack.solid.bz],
        [rack.front.x, rack.front.z],
      ]) {
        segDist(x, z, s.ax, s.az, s.bx, s.bz, seg);
        assert.ok(seg.d > s.r + RACK.r + 0.6, `land ${land}: clear of what stands on the pad (${(seg.d - s.r).toFixed(2)} m)`);
      }
    }
    // and in front of it, facing it
    const ahead = { x: rack.front.x - rack.x, z: rack.front.z - rack.z };
    assert.ok(Math.abs(Math.atan2(-ahead.x, -ahead.z) - Math.atan2(Math.sin(rack.front.yaw), Math.cos(rack.front.yaw))) < 1e-6, 'facing it');
  }
  assert.equal(rackAt(null), null, 'no launch site, no rack');
});

// ── Other people's ──────────────────────────────────────────────────────────

test("someone else's jetpack: on their back while they have it, and up where they say while they fly", () => {
  // someone here, standing on the ground 3 m up, as player/peers.js keeps them
  const someone = { character: new Character(), pos: new THREE.Vector3(10, 3, 0), flag: { position: new THREE.Vector3(10, 5.25, 0) } };
  const peers = { get: (id) => (id === 'them' ? someone : null) };
  let made = 0;
  const others = new Jetpackers({
    peers,
    make: () => {
      made++;
      return { object: new THREE.Group(), burn() {} };
    },
  });
  const back = () => someone.character.back.children.length;
  const pack = () => someone.character.back.children[0];
  others.hear('them', { have: true });
  assert.equal(back(), 1, 'strapped on: on their back');
  others.hear('them', { have: true });
  assert.equal(made, 1, 'the same one, said again');
  // the jets fire: they hang under it, and come up to where they say they are
  others.hear('them', { have: true, y: 23, burn: 1 });
  let loud = 0;
  for (let i = 0; i < 120; i++) {
    someone.character.root.position.copy(someone.pos); // (as peers.update puts them each frame)
    loud = others.update(1 / 60, { x: 0, z: 0 });
  }
  assert.equal(someone.character.stood, FLYING, 'hanging under it');
  assert.ok(Math.abs(someone.character.root.position.y - 23) < 0.1, `up where they said (${someone.character.root.position.y.toFixed(2)} m)`);
  assert.ok(Math.abs(someone.flag.position.y - 25.25) < 0.1, 'their pennant with them');
  assert.ok(loud > 0.8, `and their jets heard close by (${loud.toFixed(2)})`);
  // down again: on their feet, the jetpack still on
  others.hear('them', { have: true });
  for (let i = 0; i < 240; i++) {
    someone.character.root.position.copy(someone.pos);
    loud = others.update(1 / 60, { x: 0, z: 0 });
  }
  assert.equal(someone.character.stood, null, 'standing');
  assert.equal(someone.character.root.position.y, 3, 'on the ground');
  assert.equal(loud, 0);
  assert.equal(back(), 1);
  // ...and on a board of their own: the jets burning, with no height to put
  // them at, because they're wherever everyone else already has them
  others.hear('them', { have: true, burn: 1 });
  for (let i = 0; i < 60; i++) {
    someone.character.root.position.copy(someone.pos);
    loud = others.update(1 / 60, { x: 0, z: 0 });
  }
  assert.equal(someone.character.stood, null, 'on their own feet, not hanging under it');
  assert.equal(someone.character.root.position.y, 3, 'and on the ground, where they were put');
  assert.ok(loud > 0.8, `their jets heard all the same (${loud.toFixed(2)})`);
  assert.equal(pack().rotation.z, 0, 'said nothing of where they point: hanging as it does');
  // ...swung round on their back, as they say, to push them along
  others.hear('them', { have: true, burn: 1, aim: -Math.PI / 2 });
  for (let i = 0; i < 60; i++) others.update(1 / 60, { x: 0, z: 0 });
  assert.ok(Math.abs(pack().rotation.z + Math.PI / 2) < 0.01, `swung round as they said (${pack().rotation.z.toFixed(2)})`);
  others.hear('them', { have: true });
  for (let i = 0; i < 60; i++) others.update(1 / 60, { x: 0, z: 0 });
  assert.ok(Math.abs(pack().rotation.z) < 0.01, 'and back again once they are out');
  // hung back up, or gone: off their back
  others.hear('them', { have: false });
  assert.equal(back(), 0, 'hung up: off their back');
  others.hear('stranger', { have: true });
  assert.equal(others.all.size, 0, 'nobody to put one on');
  // nonsense is nothing
  others.hear('them', 'have');
  others.hear('them', { have: 'yes', y: 'high' });
  assert.equal(back(), 0);
});
