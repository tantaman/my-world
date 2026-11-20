// Boats: where one can be built and pushed off, how it rests, where you can
// step out of it, how boats are spelled in a save, and the keel that keeps a
// boat you're paddling off the shallows. On a made-up bank, in Node.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOATS, KINDS } from '../src/boats/kinds.js';
import { site, launch, stepOut, rest, floats, waterWay, WADE } from '../src/boats/shore.js';
import { Boats, boatsSave, validateBoats, hullDistance } from '../src/boats/boats.js';
import { SaveDomains } from '../src/save/domains.js';
import { regionOf } from '../src/save/regions.js';
import { Solids } from '../src/world/solids.js';
import { Player } from '../src/player/player.js';

const canoe = BOATS.canoe;
const raft = BOATS.raft;

// A bank running along z: dry land for x < 0, rising 10 cm a metre, and a lake
// for x > 0, getting 10 cm deeper a metre out.
const SLOPE = 0.1;
const bank = {
  ground: (x) => -SLOPE * x,
  depth: (x) => Math.max(0, SLOPE * x),
  surface: (x) => (x > 0 ? 0 : null),
};

test('a boat is built at the water’s edge, its bow to the water', () => {
  for (const kind of KINDS) {
    const s = site(bank, BOATS[kind], 1, 0);
    assert.equal(s.ok, true, kind);
    assert.ok(Math.abs(s.yaw - Math.PI / 2) < 0.3, `${kind} faces out over the lake (yaw ${s.yaw.toFixed(2)})`);
  }
  // not far up the bank, out of reach of the water
  const dry = site(bank, canoe, -12, 0);
  assert.equal(dry.ok, false);
  assert.match(dry.why, /water’s edge/);
  assert.ok(dry.where, 'and it is the place that won’t do');
  // nor out in the lake, where you'd be swimming
  const deep = site(bank, canoe, (WADE + 0.2) / SLOPE, 0);
  assert.equal(deep.ok, false);
  assert.match(deep.why, /too deep/);
});

test('not by a puddle, nor on a steep bank', () => {
  // water knee deep, but only a metre and a half across
  const puddle = { ground: () => 0, depth: (x) => (Math.abs(x - 2.5) < 0.75 ? 0.6 : 0), surface: (x) => (Math.abs(x - 2.5) < 0.75 ? 0.6 : null) };
  assert.ok(waterWay(puddle, canoe, 1, 0), 'there is water by it');
  const s = site(puddle, canoe, 1, 0);
  assert.equal(s.ok, false);
  assert.match(s.why, /too little water/);
  // a bank that drops away a metre for every metre
  const cliff = { ground: (x) => -1.2 * x, depth: (x) => Math.max(0, 1.2 * x), surface: (x) => (x > 0 ? 0 : null) };
  const c = site(cliff, canoe, -0.3, 0);
  assert.equal(c.ok, false);
  assert.match(c.why, /too steep/);
});

test('pushed off, it slides bow first down the bank until it floats', () => {
  const to = launch(bank, canoe, 1, 0, Math.PI / 2);
  assert.ok(to, 'there is water to push it off into');
  assert.ok(floats(bank, canoe, to.x, to.z, 1, 0), 'and there it floats, bow and all');
  assert.ok(to.x < 1 + 7.5, `not much further out than it has to be (${to.x.toFixed(2)})`);
  assert.ok(Math.abs(to.z) < 1e-9 && Math.abs(to.yaw - Math.PI / 2) < 1e-9, 'straight out, the way it faced');
  // already afloat: it stays where it is
  assert.deepEqual(launch(bank, canoe, 10, 0, Math.PI / 2), { x: 10, z: 0, yaw: Math.PI / 2 });
  // facing up the bank: it goes the way the water is instead
  const turned = launch(bank, canoe, 1, 0, -Math.PI / 2);
  assert.ok(turned && turned.x > 1 && floats(bank, canoe, turned.x, turned.z), 'turned round, out into the lake');
  // nowhere near water
  assert.equal(launch(bank, canoe, -30, 0, 0), null);
});

test('left on the bank it lies on its slope; left in the water it floats', () => {
  const up = rest(bank, raft, -5, 0, Math.PI / 2);
  assert.equal(up.afloat, false);
  assert.ok(Math.abs(up.y - SLOPE * 5) < 0.05, 'on the ground');
  assert.ok(up.pitch < -0.05, 'its bow down the slope');
  const out = rest(bank, raft, 20, 0, Math.PI / 2);
  assert.equal(out.afloat, true);
  assert.ok(Math.abs(out.y + raft.draft) < 1e-9, 'its keel its draft under the surface');
  assert.ok(Math.abs(out.pitch) < 1e-9, 'and level');
});

test('you step out onto the bank or into the shallows, never into deep water', () => {
  // in the shallows: out over the side
  const near = stepOut(bank, canoe, 4, 0, Math.PI / 2);
  assert.ok(near, 'somewhere to step');
  assert.ok(bank.depth(near.x, near.z) <= 0.7);
  assert.ok(Math.abs(near.z) > canoe.beam / 2, 'over the side');
  // a trunk on one side: the other
  const other = stepOut(bank, canoe, 4, 0, Math.PI / 2, (x, z) => z > 0);
  assert.ok(other.z < 0);
  // far out: nowhere
  assert.equal(stepOut(bank, canoe, 30, 0, Math.PI / 2), null);
});

// ── The boats, and how they're saved ────────────────────────────────────────
const made = () => new Boats({ scene: new THREE.Scene(), solids: new Solids(), world: bank });

test('boats are spelled b:<id> -> [kind, x, z, yaw], where they were left', () => {
  // This is how boats are on the save server and in people's browsers: keep it.
  const domains = new SaveDomains();
  domains.register(boatsSave);
  const data = [
    ['k3f9x1ab', 'canoe', 12.5, -40.25, 1.571],
    ['p0q8zzcd', 'raft', -70, 130.5, -0.5],
  ];
  const elements = domains.toElements({ boats: data });
  const plain = Object.fromEntries([...elements].map(([r, m]) => [r, Object.fromEntries(m)]));
  assert.deepEqual(plain, {
    '0,-1': { 'b:k3f9x1ab': ['canoe', 12.5, -40.25, 1.571] },
    '-2,2': { 'b:p0q8zzcd': ['raft', -70, 130.5, -0.5] },
  });
  assert.deepEqual(domains.fromElements(elements).boats, data, 'and put back together, they are what they were');
});

test('a boat keeps its id wherever it is left', () => {
  const boats = made();
  let changes = 0;
  boats.on('change', () => changes++);
  const b = boats.add('canoe', 1, 0, Math.PI / 2);
  assert.equal(changes, 1);
  assert.equal(boats.near(1.2, 0.3, 0.5), b, 'aimed at, it is found');
  assert.ok(hullDistance(b, 1, 0) < 0, 'inside its hull');
  assert.ok(hullDistance(b, 1, 3) > 2, 'and well clear of it to one side');
  const was = regionOf(b.x, b.z);
  boats.setOut(b, 'you');
  assert.equal(boats.near(1, 0, 1), null, 'out on the water, it is not where it was left');
  boats.leave(b, 300, -200, 0.5);
  assert.equal(changes, 2);
  assert.deepEqual(boats.serialize(), [[b.id, 'canoe', 300, -200, 0.5]]);
  assert.notEqual(regionOf(b.x, b.z), was, 'it has gone to another region');
  assert.equal(boats.near(300, -200, 1), b, 'and is there');
  boats.remove(b);
  assert.deepEqual(boats.serialize(), []);
});

test('someone else’s boats arrive, but the one you are in stays with you', () => {
  const boats = made();
  const mine = boats.add('canoe', 1, 0, 0);
  boats.add('raft', 2, 10, 0);
  boats.setOut(mine, 'you');
  mine.x = 50; // paddled out
  // their version: your canoe still on the bank, the raft gone, a new canoe
  boats.adopt([
    [mine.id, 'canoe', 1, 0, 0],
    ['newone12', 'canoe', -3, 4, 1],
  ]);
  assert.equal(boats.get(mine.id), mine, 'the very same boat');
  assert.equal(mine.x, 50, 'still where you are');
  assert.equal(mine.out, 'you');
  assert.deepEqual([...boats.list.keys()].sort(), [mine.id, 'newone12'].sort());
});

test('what a save holds of the boats is checked before it is believed', () => {
  assert.deepEqual(validateBoats('nonsense'), []);
  assert.deepEqual(validateBoats([['a1', 'canoe', 1, 2, 3], ['a2', 'submarine', 1, 2, 3], [5, 'raft', 1, 2], ['a3', 'raft', 'x', 2], ['a4', 'raft', 4, 5]]), [
    ['a1', 'canoe', 1, 2, 3],
    ['a4', 'raft', 4, 5, 0],
  ]);
});

// ── The keel ────────────────────────────────────────────────────────────────
// A player in a canoe on a lake whose bed shelves up to a beach at x = 0.
function paddler(shore = (x) => -SLOPE * x) {
  const world = {
    heightAt: (x, z) => shore(x, z),
    waterAt(x, z, out) {
      const g = shore(x, z);
      if (g >= 0) return false;
      Object.assign(out, { level: 0, depth: -g, flowX: 0, flowZ: 0, foam: 0 });
      return true;
    },
    forEachCollider() {},
  };
  const held = new Set();
  const input = {
    held,
    consumeLook: () => ({ x: 0, y: 0 }),
    lookRate: () => ({ x: 0, y: 0 }),
    consumeZoom: () => 0,
    isDown: (a) => held.has(a),
    moveAxes: () => ({ x: held.has('right') ? 1 : 0, y: held.has('forward') ? 1 : held.has('back') ? -1 : 0 }),
    running: () => false,
    jumped: () => false,
    diving: () => false,
  };
  const p = new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world, input });
  return { p, input, world };
}
const run = (p, s, dt = 1 / 60) => {
  for (let i = 0; i < s / dt; i++) p.update(dt);
};

test('paddled at the shore, a boat runs aground short of it, and can paddle back out', () => {
  const { p, input } = paddler();
  // 40 m out, the camera looking toward the beach (-x)
  p.spawn(40, 0, -Math.PI / 2, Math.PI / 2);
  p.carrier = { ...canoe.carrier };
  input.held.add('forward');
  run(p, 30);
  const keel = canoe.carrier.keel / SLOPE; // where it's just deep enough under the middle
  assert.ok(p.pos.x > keel + canoe.carrier.bow - 0.3, `aground, bow and all, short of the shallows (at ${p.pos.x.toFixed(2)})`);
  assert.ok(p.pos.x < keel + canoe.carrier.bow + 1.5, `but right up to them (at ${p.pos.x.toFixed(2)})`);
  input.held.delete('forward');
  input.held.add('back');
  const at = p.pos.x;
  run(p, 4);
  assert.ok(p.pos.x > at + 4, 'and away again');
});

test('a boat running into the shore at a slant slides along it', () => {
  // the shore runs along x = z: water where x > z
  const { p, input } = paddler((x, z) => -SLOPE * (x - z));
  p.spawn(30, 0, -Math.PI / 2, Math.PI / 2);
  p.carrier = { ...canoe.carrier };
  input.held.add('forward');
  run(p, 25);
  // (heading -x into a shore running along x = z, along it is toward -z)
  assert.ok(p.pos.z < -3, `it has gone along the shore (z ${p.pos.z.toFixed(2)})`);
  assert.ok(SLOPE * (p.pos.x - p.pos.z) >= canoe.carrier.keel - 0.02, 'never into the shallows');
});

test('a boat pulled up on a beach can be pushed out, but no further up', () => {
  const { p, input } = paddler();
  p.spawn(1, 0, Math.PI / 2, -Math.PI / 2); // in 10 cm of water, the camera looking out (+x)
  p.carrier = { ...canoe.carrier };
  input.held.add('back'); // up the beach
  run(p, 2);
  assert.ok(p.pos.x > 0.99, `not up onto the sand (at ${p.pos.x.toFixed(2)})`);
  input.held.delete('back');
  input.held.add('forward');
  run(p, 8);
  assert.ok(p.pos.x > 4, `out it goes (at ${p.pos.x.toFixed(2)})`);
});
