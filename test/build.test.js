// The bench's smaller parts: what you carry, what work has to go round, and
// how tools are picked.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../src/build/inventory.js';
import { Obstacles } from '../src/build/obstacles.js';
import { Builder } from '../src/build/builder.js';

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

test('what is grown asks only what has been built, and that never asks what else is grown', () => {
  const obstacles = new Obstacles();
  // a road's source: asked what's near, it goes looking (and sends for what it hasn't found)
  let lookedFor = 0;
  obstacles.addSource(
    (x, z, R, out) => {
      lookedFor++;
      out.push({ x: 0, z: 0, what: 'the road', dig: 4, grown: true });
    },
    { grown: true },
  );
  // the forest's, which is grown and says so...
  obstacles.addSource((x, z, R, out) => out.push({ x: 1, z: 0, what: 'a pine', dig: 1.3, clear: 'fell', grown: true }), { grown: true });
  // ...and what people have put there: a stump, a fire ring
  obstacles.addSource((x, z, R, out) => out.push({ x: 2, z: 0, what: 'a stump', dig: 1, clear: 'grub' }));
  obstacles.addSource((x, z, R, out) => out.push({ x: 3, z: 0, what: 'a fire ring', dig: 1.05 }));
  // a source that didn't say, with something grown in it: asked, and that left out
  obstacles.addSource((x, z, R, out) => out.push({ x: 4, z: 0, what: 'a boulder', dig: 2, grown: true }, { x: 5, z: 0, what: 'a footing', dig: 0.6 }));

  assert.deepEqual(obstacles.built(0, 0, 10).map((o) => o.what), ['a stump', 'a fire ring', 'a footing']);
  assert.equal(lookedFor, 0, 'the road was not asked: so finding a road cannot set off a search for whatever is beside it');
  // a tool is told about all of it
  assert.deepEqual(obstacles.near(0, 0, 10).map((o) => o.what), ['the road', 'a pine', 'a stump', 'a fire ring', 'a boulder', 'a footing']);
  assert.equal(lookedFor, 1);
});

// A bench with nothing round it: enough to register tools and pick them.
function bench() {
  const said = [];
  const b = new Builder({ player: { character: { addHeld() {}, setTool() {} } }, hud: { flash: (m) => said.push(m) } });
  const tool = (id, kit) => b.register({ id, label: id, kit, target() {}, work() {} });
  return { b, tool, said };
}

test('tools that share a kit share a slot, in the order the kits were made', () => {
  const { b, tool } = bench();
  tool('hands');
  tool('shovel', 'earth');
  tool('log', 'cabin');
  tool('footing', 'earth');
  tool('roof', 'cabin');
  tool('fire', 'camp');
  assert.deepEqual(
    b.kits.map((k) => [k.label, k.tools.map((t) => t.id)]),
    [
      ['hands', ['hands']],
      ['earth', ['shovel', 'footing']],
      ['cabin', ['log', 'roof']],
      ['fire', ['fire']], // a kit of one goes by its tool's name
    ],
  );
  assert.equal(b.slotOf('roof'), 3);
  assert.equal(b.slotOf('nothing'), null);
  // a tool another feature adds to a kit joins the end of it
  tool('stove', 'camp');
  assert.deepEqual(b.kits[3].tools.map((t) => t.id), ['fire', 'stove']);
  assert.equal(b.kits[3].label, 'camp');
});

test("a kit's key takes up the tool last used from it, and again, the next", () => {
  const { b, tool, said } = bench();
  tool('hands');
  tool('log', 'cabin');
  tool('timber', 'cabin');
  tool('roof', 'cabin');
  assert.equal(b.tool, 'hands', 'the first tool is in hand to begin with');
  b.pick(1);
  assert.equal(b.tool, 'log');
  b.pick(1);
  b.pick(1);
  assert.equal(b.tool, 'roof');
  b.pick(1);
  assert.equal(b.tool, 'log', 'and round again');
  b.pick(1);
  b.pick(0);
  assert.equal(b.tool, 'hands');
  b.pick(1);
  assert.equal(b.tool, 'timber', 'coming back to a kit gives the one you had');
  b.pick(7);
  assert.equal(b.tool, 'timber', 'a key with no kit does nothing');
  assert.deepEqual(said, ['log', 'timber', 'roof', 'log', 'timber', 'hands', 'timber']);
});

test('picking a kit of one again picks its tool again', () => {
  const { b, tool } = bench();
  tool('hands');
  const plan = tool('plan');
  const picked = [];
  b.on('select', (t) => picked.push(t.id));
  b.pick(1);
  b.pick(1);
  assert.deepEqual(picked, ['plan', 'plan'], 'so the plan tool can move on to the next plan');
  assert.equal(b.current, plan);
});
