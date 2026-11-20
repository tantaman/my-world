// How a saved world is spelled. Worlds already on the save server, and in
// people's browsers, are spelled exactly this way, so these must not drift.

import test from 'node:test';
import assert from 'node:assert/strict';
import { toElements, fromElements, diffElements, applyOps, cloneElements } from '../src/save/regions.js';
import { validateSnapshot } from '../src/save/snapshot.js';
import { matchesGolden } from './helpers/golden.js';
import { SEED, NAME, BUILD, MARKS, PLAYER, HOURS } from './fixtures/save.js';

const snapshot = () => structuredClone({ v: 1, seed: SEED, name: NAME, saved: 0, world: BUILD, marks: MARKS, player: PLAYER, hours: HOURS });
const visitor = () => structuredClone({ saved: 0, inv: BUILD.inv, datum: BUILD.datum, player: PLAYER, hours: HOURS, tracked: MARKS.tracked });

const plain = (elements) => {
  const out = {};
  for (const r of [...elements.keys()].sort()) out[r] = Object.fromEntries([...elements.get(r)].sort(([a], [b]) => (a < b ? -1 : 1)));
  return out;
};
const fromPlain = (obj) => new Map(Object.entries(obj).map(([r, m]) => [r, new Map(Object.entries(m))]));

test('a world is spelled the way it always has been', () => {
  matchesGolden('save-elements', plain(toElements(snapshot())));
});

test('elements put back together are the world that was taken apart', () => {
  const elements = toElements(snapshot());
  const back = fromElements(SEED, elements, visitor());
  assert.deepEqual(plain(toElements(back)), plain(elements));
  assert.equal(back.name, NAME);
  assert.deepEqual(back.world.inv, BUILD.inv);
  assert.deepEqual(back.world.datum, BUILD.datum);
  assert.deepEqual(back.player, PLAYER);
  assert.equal(back.hours, HOURS);
  assert.equal(back.marks.tracked, MARKS.tracked);
  assert.deepEqual([...back.marks.marks].sort((a, b) => (a.id < b.id ? -1 : 1)), MARKS.marks);
  assert.equal(back.world.buildings.length, 2);
  assert.equal(back.world.terrain.length, BUILD.terrain.length);
});

test('a world from the server opens the same', () => {
  // what GET /api/worlds/:id hands back, once unpacked
  const golden = fromPlain(plain(toElements(snapshot())));
  const opened = validateSnapshot(fromElements(SEED, golden, visitor()));
  assert.ok(opened);
  assert.deepEqual(plain(toElements(opened)), plain(golden));
});

test('only what changed goes out', () => {
  const before = toElements(snapshot());
  const s = snapshot();
  s.world.terrain[2] = -0.6; // dig the first vertex deeper
  s.world.forest.stumps.pop(); // grub out a stump
  s.marks.marks[1].name = 'the ford'; // name a mark
  s.world.buildings[0].logs.push(['log', 'x', 20, 10, 14, 2, []]); // lay a log
  const ops = diffElements(before, toElements(s));
  assert.deepEqual(
    ops.map((o) => `${o.r} ${o.k} ${o.v === null ? 'gone' : 'set'}`).sort(),
    ['* m:p0q8zz set', '0,0 l:x:20:10:14:2 set', '0,0 t:10:20 set', '1,0 s:70.25:3 gone'],
  );
  const after = cloneElements(before);
  const touched = applyOps(after, ops);
  assert.deepEqual([...touched].sort(), ['*', '0,0', '1,0']);
  assert.deepEqual(plain(after), plain(toElements(s)));
  assert.equal(diffElements(after, toElements(s)).length, 0);
});

test('a save that is not a save is turned away', () => {
  assert.equal(validateSnapshot(null), null);
  assert.equal(validateSnapshot({ v: 99, seed: 1 }), null);
  assert.equal(validateSnapshot({ v: 1, seed: 'x' }), null);
  const bare = validateSnapshot({ v: 1, seed: 7.9, name: 5, world: { terrain: 'no', buildings: {} }, marks: { marks: 3 }, player: { x: 'a' } });
  assert.equal(bare.seed, 7);
  assert.equal(bare.name, '');
  assert.deepEqual(bare.world.terrain, []);
  assert.deepEqual(bare.world.buildings, []);
  assert.deepEqual(bare.marks.marks, []);
  assert.equal(bare.player.x, null);
});
