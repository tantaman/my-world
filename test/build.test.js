// The bench's smaller parts: what you carry, and what work has to go round.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../src/build/inventory.js';
import { Obstacles } from '../src/build/obstacles.js';

test('materials are gathered and spent', () => {
  const inv = new Inventory();
  assert.equal(inv.line(), 'logs 0 m · timber 0 m · stone 0 · soil 0.0 m³');
  inv.gain('log', 10);
  assert.equal(inv.have('log', 10), true);
  assert.equal(inv.have('log', 10.5), false);
  inv.spend('log', 0.5);
  inv.gain('timber', 0.5);
  inv.gain('stone', 3);
  inv.gain('soil', 0.26);
  assert.equal(inv.line(), 'logs 9.5 m · timber 0.5 m · stone 3 · soil 0.3 m³');
  inv.spend('stone', 99);
  assert.equal(inv.amounts.stone, 0, 'never below nothing');
  assert.equal(inv.dirty, true);
});

test('creative mode has everything and uses nothing', () => {
  const inv = new Inventory({ creative: true });
  assert.equal(inv.have('timber', 1000), true);
  inv.spend('timber', 9);
  assert.equal(inv.amounts.timber, 0);
  assert.match(inv.line(), /creative/);
});

test('a feature can bring its own material', () => {
  const inv = new Inventory();
  inv.define({ id: 'clay', label: 'clay', format: (v) => `${v} kg` });
  inv.gain('clay', 4);
  assert.match(inv.line(), /soil 0\.0 m³ · clay 4 kg$/);
  assert.throws(() => inv.define({ id: 'clay', label: 'clay' }), /already defined/);
});

test('a material most people never carry stays off the line until you have some', () => {
  const inv = new Inventory();
  inv.define({ id: 'meat', label: 'raw meat', optional: true });
  assert.equal(inv.line(), 'logs 0 m · timber 0 m · stone 0 · soil 0.0 m³');
  inv.gain('meat', 2);
  assert.match(inv.line(), /soil 0\.0 m³ · raw meat 2$/);
  inv.spend('meat', 2);
  assert.doesNotMatch(inv.line(), /meat/);
});

test('what you carry is saved, and what a newer game carried is kept', () => {
  const inv = new Inventory();
  inv.load({ log: 4, stone: 2, flint: 1, soil: 'lots' });
  assert.equal(inv.amounts.log, 4);
  assert.equal(inv.amounts.soil, 0, 'nonsense is not believed');
  assert.equal(inv.amounts.flint, 1, 'a material this build has no name for is still carried');
  assert.equal(inv.dirty, false);
  assert.doesNotMatch(inv.line(), /flint/);
});

test('whoever owns a thing says how much room it needs', () => {
  const obstacles = new Obstacles();
  const trees = [{ x: 0, z: 0, r: 0.4 }, { x: 30, z: 0, r: 0.3 }];
  obstacles.addSource((x, z, R, out) => {
    for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < R) out.push({ x: t.x, z: t.z, what: 'a pine', dig: t.r + 0.9, wall: t.r, footing: 0.9 });
  });
  obstacles.addSource((x, z, R, out) => out.push({ x: 2, z: 1, what: 'a fire ring', dig: 1.3, wall: 0.8, footing: 1.4 }));
  const near = obstacles.near(1, 0, 5);
  assert.deepEqual(near.map((o) => o.what), ['a pine', 'a fire ring']);
  const blocksFooting = (x, z) => near.find((o) => o.footing && Math.hypot(o.x - x, o.z - z) < o.footing);
  assert.equal(blocksFooting(0, 0.5).what, 'a pine');
  assert.equal(blocksFooting(3, 1).what, 'a fire ring');
  assert.equal(blocksFooting(-3, -3), undefined);
});
