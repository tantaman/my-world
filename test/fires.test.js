// Campfires: how one burns down by the clock, what you can do to it when, and
// how it is spelled in a save. The spelling is what campfires were first
// saved with, in this browser and on the server, so it is pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Fires, FIRE, fireState, firesSave } from '../src/fires/fires.js';
import { Solids } from '../src/world/solids.js';
import { LocalStore } from '../src/save/local.js';
import { diffElements } from '../src/save/regions.js';
import { memoryStorage, KEYS } from '../src/core/storage.js';
import { makeDomains, plain } from './helpers/saved.js';
import { SEED } from './fixtures/save.js';

const T0 = Date.UTC(2026, 10, 20, 18); // an evening
const s = (seconds) => T0 + seconds * 1000;

// Fires on a clock the test moves by hand.
function make() {
  const clock = { now: T0 };
  const solids = new Solids();
  const fires = new Fires({ scene: new THREE.Scene(), solids, clock: () => clock.now });
  let changes = 0;
  fires.on('change', () => changes++);
  // what you can bump into is sorted out on the next frame
  const solid = (f) => {
    fires.update(0, new THREE.Vector3());
    return solids.owners.has(f);
  };
  return { fires, clock, solids, solid, changes: () => changes };
}

test('a fire burns down by the clock on the wall', () => {
  assert.equal(fireState({ wood: 0, lit: 0, ash: 0 }).state, 'ring');
  assert.equal(fireState({ wood: 1, lit: 0, ash: 0 }).state, 'laid');
  assert.equal(fireState({ wood: 0, lit: 0, ash: 1 }).state, 'cold');
  const f = { wood: 1, lit: T0, ash: 1 };
  const lit = fireState(f, T0);
  assert.equal(lit.state, 'burning');
  assert.ok(lit.heat < 0.05, 'it takes a while to catch');
  const caught = fireState(f, s(FIRE.catch));
  assert.ok(caught.heat > 0.8, `and then burns well (${caught.heat})`);
  assert.ok(Math.abs(caught.fuel - (1 - FIRE.catch / FIRE.burn)) < 1e-9, 'a metre of wood burns for FIRE.burn seconds');
  const low = fireState(f, s(FIRE.burn * 0.9));
  assert.ok(low.heat < caught.heat, 'down to its last stick it burns low');
  assert.deepEqual(fireState(f, s(FIRE.burn)), { state: 'embers', fuel: 0, heat: 1, age: FIRE.burn });
  assert.equal(fireState(f, s(FIRE.burn + FIRE.embers / 2)).heat, 0.5);
  assert.equal(fireState(f, s(FIRE.burn + FIRE.embers)).state, 'cold');
  assert.equal(fireState(f, s(86400)).state, 'cold', 'one left burning is cold ash the next day');
});

test('ring it, lay it, light it, feed it, put it out', () => {
  const { fires, clock, solid, changes } = make();
  const f = fires.add(12, -40, 3.2504);
  assert.equal(f.y, 3.25);
  assert.equal(fires.state(f).state, 'ring');
  assert.equal(solid(f), false, 'you can step into a bare ring');
  assert.equal(fires.at(12, -40), f);
  assert.equal(fires.near(12.3, -40.2, 1), f);
  assert.equal(fires.near(14, -40, 1), null);

  assert.equal(fires.light(f), false, 'nothing to light');
  assert.equal(fires.lay(f, FIRE.lay), true);
  assert.equal(fires.state(f).state, 'laid');
  assert.equal(solid(f), true, 'but you walk round one with wood in it');

  assert.equal(fires.light(f), true);
  assert.equal(fires.state(f).state, 'burning');
  assert.equal(fires.lay(f, 1), false, "you don't lay a fire on a burning one");
  let fed = 0;
  while (fires.feed(f, FIRE.feed)) fed++;
  assert.equal(fed, (FIRE.max - FIRE.lay) / FIRE.feed, 'it takes wood up to FIRE.max');

  clock.now = s(60);
  assert.equal(fires.douse(f), 'burning');
  assert.equal(f.wood, Math.round((FIRE.max - 60 / FIRE.burn) * 10) / 10, 'what had not burned is left, charred');
  assert.equal(f.ash, 2);
  assert.equal(fires.state(f).state, 'laid', 'and can be lit again');

  assert.equal(fires.light(f), true);
  clock.now = s(60 + f.wood * FIRE.burn + 10);
  assert.equal(fires.state(f).state, 'embers');
  assert.equal(fires.feed(f, FIRE.feed), true, 'hot embers take fresh wood');
  const again = fires.state(f);
  assert.equal(again.state, 'burning');
  assert.ok(again.age > 0 && again.age < FIRE.catch, 'and catch it quicker than a fresh fire');

  clock.now += (FIRE.feed * FIRE.burn + FIRE.embers / 2) * 1000;
  assert.equal(fires.state(f).state, 'embers');
  assert.equal(fires.douse(f), 'embers');
  assert.deepEqual([f.wood, f.lit, f.ash], [0, 0, 1]);
  assert.equal(fires.state(f).state, 'cold');
  assert.equal(fires.douse(f), null, 'nothing left to put out');

  assert.equal(fires.remove(f), 0);
  assert.equal(fires.list.size, 0);
  assert.equal(solid(f), false);
  assert.ok(changes() >= 12, `every change is told (${changes()})`);
});

test('a ring taken apart gives back the wood laid in it', () => {
  const { fires } = make();
  const f = fires.add(0, 0, 1);
  fires.lay(f, 1);
  fires.lay(f, 1);
  assert.equal(f.wood, 2);
  assert.equal(fires.remove(f), 2);
});

test('the fires nearest you are the ones you hear', () => {
  const { fires } = make();
  for (const [x, z] of [[0, 0], [20, 0], [-10, 0], [60, 0]]) {
    const f = fires.add(x, z, 1);
    fires.lay(f, 1);
    fires.light(f);
  }
  fires.add(5, 5, 1); // just a ring
  fires.update(0.016, new THREE.Vector3(-2, 1, 0));
  assert.deepEqual(fires.heard.map((h) => h.x), [0, -10], 'two, nearest first; not the bare ring, not the one 62 m off');
});

test('a fire is spelled c:<x>:<z> -> [y, wood, lit, ash]', () => {
  const domains = makeDomains();
  const data = [[12, -40, 3.25, 1.5, T0, 1], [70, 3, 2, 0, 0, 0]];
  const elements = domains.toElements({ fires: data });
  assert.deepEqual(plain(elements), {
    '0,-1': { 'c:12:-40': [3.25, 1.5, T0, 1] },
    '1,0': { 'c:70:3': [2, 0, 0, 0] },
  });
  assert.deepEqual(domains.fromElements(elements).fires, data);
  // lighting one sends that one, and a fire burning down sends nothing
  const lit = structuredClone(data);
  lit[1][3] = 1;
  lit[1][4] = T0;
  const ops = diffElements(elements, domains.toElements({ fires: lit }));
  assert.deepEqual(ops, [{ r: '1,0', k: 'c:70:3', v: [2, 1, T0, 0] }]);
});

test('fires come back the way they were saved', () => {
  const a = make();
  const f = a.fires.add(3, 4, 2.5);
  a.fires.lay(f, 1);
  a.fires.light(f);
  const saved = a.fires.serialize();
  assert.deepEqual(saved, [[3, 4, 2.5, 1, T0, 1]]);
  const b = make();
  b.fires.load(firesSave.validate(saved));
  assert.deepEqual(b.fires.serialize(), saved);
  assert.equal(b.fires.state(b.fires.at(3, 4)).state, 'burning');
  assert.equal(b.changes(), 0, 'loading is not a change of yours');
  // someone else's version replaces ours outright
  b.fires.adopt([[9, 9, 1, 0, 0, 1]]);
  assert.deepEqual(b.fires.serialize(), [[9, 9, 1, 0, 0, 1]]);
  assert.equal(b.solids.owners.size, 0, "nothing of the old fire is left to bump into");
});

test('a save that is not fires is tidied, not trusted', () => {
  assert.deepEqual(firesSave.validate('no'), []);
  assert.deepEqual(firesSave.validate([[1, 2, 3], 'x', null]), [[1, 2, 3]]);
  const { fires } = make();
  fires.load([[1, 2], [NaN, 0, 0], [5, 5, 1, -3, 'soon', 7], [5, 5, 9]]);
  assert.deepEqual(fires.serialize(), [[5, 5, 1, 0, 0, 1]], 'one fire to a node, and nonsense made harmless');
});

test("in this browser, fires are kept with the rest of what's built", () => {
  const { fires } = make();
  const f = fires.add(3, 4, 2.5);
  fires.lay(f, 1);
  const domains = makeDomains({ fires: { collect: () => fires.serialize(), restore: (d) => fires.load(d) } });
  const storage = memoryStorage();
  new LocalStore({ domains, storage, seed: SEED }).flush();
  assert.deepEqual(storage.get(KEYS.build(SEED)).fires, [[3, 4, 2.5, 1, 0, 0]], 'where the campfire branch kept them');
  const back = make();
  const again = makeDomains({ fires: { collect: () => back.fires.serialize(), restore: (d) => back.fires.load(d) } });
  again.restore(new LocalStore({ domains: again, storage, seed: SEED }).read());
  assert.deepEqual(back.fires.serialize(), [[3, 4, 2.5, 1, 0, 0]]);
});
