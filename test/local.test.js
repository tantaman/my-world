// A world with no address is kept in this browser. What is already in
// people's localStorage has to keep opening, so the layouts are pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore } from '../src/save/local.js';
import { memoryStorage, KEYS } from '../src/core/storage.js';
import { makeDomains } from './helpers/saved.js';
import { SEED, BUILD, MARKS, PLAYER, HOURS } from './fixtures/save.js';

// What an earlier version of the game left behind.
const left = () => ({
  [KEYS.build(SEED)]: structuredClone(BUILD),
  [KEYS.marks(SEED)]: { v: 1, ...structuredClone(MARKS) },
  [KEYS.state]: { seed: SEED, ...PLAYER, hours: HOURS },
});

// A game that holds some state, to save from and restore into.
function world(initial = {}) {
  const held = structuredClone(initial);
  const live = {};
  for (const id of ['terrain', 'forest', 'buildings', 'marks', 'inv', 'datum', 'player', 'hours', 'tracked']) {
    live[id] = { collect: () => held[id], restore: (data) => void (held[id] = data) };
  }
  return { held, domains: makeDomains(live) };
}

test("what's in this browser already still opens", () => {
  const { domains } = world();
  const store = new LocalStore({ domains, storage: memoryStorage(left()), seed: SEED });
  const state = store.read();
  assert.deepEqual(state.terrain, BUILD.terrain);
  assert.deepEqual(state.forest, BUILD.forest);
  assert.deepEqual(state.buildings, BUILD.buildings);
  assert.deepEqual(state.inv, BUILD.inv);
  assert.deepEqual(state.datum, BUILD.datum);
  assert.deepEqual(state.marks, MARKS.marks);
  assert.equal(state.tracked, MARKS.tracked);
  assert.deepEqual(state.player, PLAYER);
  assert.equal(state.hours, HOURS);
  assert.equal('name' in state, false, 'a world that is only local has no name to keep');
});

test('and is written back the way it was found', () => {
  const storage = memoryStorage(left());
  const first = world();
  const store = new LocalStore({ domains: first.domains, storage, seed: SEED });
  first.domains.restore(store.read());
  store.flush();
  for (const [key, was] of Object.entries(left())) assert.deepEqual(storage.get(key), was, key);
});

test('?reset forgets where you stood, and nothing else', () => {
  const { domains } = world();
  const state = new LocalStore({ domains, storage: memoryStorage(left()), seed: SEED, fresh: true }).read();
  assert.equal(state.player, undefined);
  assert.equal(state.hours, undefined);
  assert.equal(state.buildings.length, 2);
  assert.equal(state.marks.length, 2);
});

test('?clearbuild forgets what was built, and keeps the marks', () => {
  const storage = memoryStorage(left());
  const state = new LocalStore({ domains: world().domains, storage, seed: SEED, clear: true }).read();
  assert.equal(state.buildings, undefined);
  assert.equal(state.inv, undefined);
  assert.equal(state.marks.length, 2);
  assert.equal(storage.get(KEYS.build(SEED)), null);
});

test('another seed is another world', () => {
  const state = new LocalStore({ domains: world().domains, storage: memoryStorage(left()), seed: 42 }).read();
  assert.deepEqual(state, {});
});

test('a new domain is kept without anyone being told', () => {
  const { domains } = world({ terrain: [], inv: { log: 1 } });
  let wells = [{ x: 3, z: 4, depth: 2 }];
  domains.register({ id: 'wells', kinds: ['w'], encode() {}, decode: () => ({ take() {}, done: () => [] }), collect: () => wells, restore: (d) => void (wells = d) });
  const storage = memoryStorage();
  const store = new LocalStore({ domains, storage, seed: SEED });
  store.flush();
  assert.deepEqual(storage.get(KEYS.build(SEED)).wells, [{ x: 3, z: 4, depth: 2 }]);
  wells = null;
  domains.restore(new LocalStore({ domains, storage, seed: SEED }).read());
  assert.deepEqual(wells, [{ x: 3, z: 4, depth: 2 }]);
});

test('changes are written after a lull, and not at all once the server keeps the world', () => {
  const storage = memoryStorage();
  const { domains, held } = world({ inv: { log: 1 }, player: PLAYER, hours: 9 });
  const store = new LocalStore({ domains, storage, seed: SEED });
  const t0 = performance.now();
  store.tick(t0);
  assert.equal(storage.get(KEYS.build(SEED)), null, 'nothing has changed yet');
  assert.deepEqual(storage.get(KEYS.state), { seed: SEED, ...PLAYER, hours: 9 }, 'but where you stand is noted');
  held.inv = { log: 5 };
  store.touch();
  store.tick(t0 + 100);
  assert.equal(storage.get(KEYS.build(SEED)), null, 'not yet');
  store.tick(t0 + 5000);
  assert.deepEqual(storage.get(KEYS.build(SEED)).inv, { log: 5 });
  store.disable();
  held.inv = { log: 9 };
  store.touch();
  store.tick(t0 + 20000);
  store.flush();
  assert.deepEqual(storage.get(KEYS.build(SEED)).inv, { log: 5 });
});
