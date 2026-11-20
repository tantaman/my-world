// How a saved world is spelled. Worlds already on the save server, and in
// people's browsers, are spelled exactly this way, so these must not drift.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveDomains } from '../src/save/domains.js';
import { diffElements, applyOps, cloneElements, regionOf, LOOSE } from '../src/save/regions.js';
import { matchesGolden } from './helpers/golden.js';
import { makeDomains, plain, fromPlain } from './helpers/saved.js';
import { NAME, BUILD, MARKS, PLAYER, HOURS } from './fixtures/save.js';

// Everything, by domain: what domains.collect() hands back in the game.
const state = () =>
  structuredClone({
    name: NAME,
    terrain: BUILD.terrain,
    forest: BUILD.forest,
    buildings: BUILD.buildings,
    marks: MARKS.marks,
    inv: BUILD.inv,
    datum: BUILD.datum,
    player: PLAYER,
    hours: HOURS,
    tracked: MARKS.tracked,
  });

test('a world is spelled the way it always has been', () => {
  // Recorded from the game before saving was made a registry. If this fails,
  // the code is wrong, not the golden file.
  matchesGolden('save-elements', plain(makeDomains().toElements(state())));
});

test('elements put back together are the world that was taken apart', () => {
  const domains = makeDomains();
  const elements = domains.toElements(state());
  const back = domains.fromElements(elements);
  assert.deepEqual(plain(domains.toElements(back)), plain(elements));
  assert.equal(back.name, NAME);
  assert.deepEqual(back.terrain.length, BUILD.terrain.length);
  assert.deepEqual(back.forest.stumps.length, 2);
  assert.equal(back.buildings.length, 2);
  assert.deepEqual([...back.marks].sort((a, b) => (a.id < b.id ? -1 : 1)), MARKS.marks);
  assert.deepEqual(Object.keys(back).sort(), ['buildings', 'fires', 'forest', 'marks', 'name', 'terrain'], 'only what is the world’s is in the elements');
});

test('what is yours travels beside the world, spelled as it always was', () => {
  const domains = makeDomains();
  const yours = domains.yours(state());
  assert.ok(Number.isFinite(yours.saved));
  assert.deepEqual({ ...yours, saved: 0 }, { saved: 0, inv: BUILD.inv, datum: BUILD.datum, player: PLAYER, hours: HOURS, tracked: MARKS.tracked });
  assert.deepEqual(domains.fromYours(yours), { inv: BUILD.inv, datum: BUILD.datum, player: PLAYER, hours: HOURS, tracked: MARKS.tracked });
  assert.deepEqual(domains.fromYours(null), {});
});

test('a world from the server opens the same', () => {
  // what GET /api/worlds/:id hands back, once unpacked
  const domains = makeDomains();
  const served = fromPlain(plain(domains.toElements(state())));
  const opened = domains.validate(domains.fromElements(served));
  assert.deepEqual(plain(domains.toElements(opened)), plain(served));
});

test('only what changed goes out', () => {
  const domains = makeDomains();
  const before = domains.toElements(state());
  const s = state();
  s.terrain[2] = -0.6; // dig the first vertex deeper
  s.forest.stumps.pop(); // grub out a stump
  s.marks[1].name = 'the ford'; // name a mark
  s.buildings[0].logs.push(['log', 'x', 20, 10, 14, 2, []]); // lay a log
  const ops = diffElements(before, domains.toElements(s));
  assert.deepEqual(
    ops.map((o) => `${o.r} ${o.k} ${o.v === null ? 'gone' : 'set'}`).sort(),
    ['* m:p0q8zz set', '0,0 l:x:20:10:14:2 set', '0,0 t:10:20 set', '1,0 s:70.25:3 gone'],
  );
  const after = cloneElements(before);
  const touched = applyOps(after, ops);
  assert.deepEqual([...touched].sort(), ['*', '0,0', '1,0']);
  assert.deepEqual(plain(after), plain(domains.toElements(s)));
  assert.equal(diffElements(after, domains.toElements(s)).length, 0);
});

test('what a newer game saved is left alone by an older one', () => {
  const domains = makeDomains({}, { except: ['fires'] }); // a game from before campfires
  const server = domains.toElements(state());
  server.get('0,0').set('c:12:22', [3, 1, 0, 0]); // a campfire, from a version that has them
  server.set('9,9', new Map([['zz:1', 'who knows']]));
  const mine = domains.toElements(state());
  const owned = (key) => !!domains.owner(key);
  assert.deepEqual(diffElements(server, mine, owned), [], 'nothing to send: the campfire is not ours to remove');
  assert.equal(diffElements(server, mine).length, 2, 'without asking who owns what, it would have been swept away');
  // and opening that world doesn't trip over it
  const opened = domains.fromElements(server);
  assert.equal(opened.buildings.length, 2);
});

test('a save that is not a save is tidied, not trusted', () => {
  const domains = makeDomains();
  const tidy = domains.validate({ terrain: 'no', buildings: {}, forest: 7, marks: 3, somethingElse: [1] });
  assert.deepEqual(tidy, { terrain: [], forest: null, buildings: [], marks: [] });
  assert.deepEqual(domains.validate(null), {});
  // nothing in the elements at all
  assert.deepEqual(domains.fromElements(new Map()), { name: '', terrain: [], forest: { removed: {}, stumps: [], felled: [] }, buildings: [], fires: [], marks: [] });
  // a building's pieces with nowhere to stand don't make a building
  const orphan = new Map([['0,0', new Map([['l:x:20:10:14:0', ['10:20', 'log', []]]])]]);
  assert.deepEqual(domains.fromElements(orphan).buildings, []);
});

test("someone else's changes go to whoever owns them", () => {
  const heard = [];
  const note = (id) => ({ restore: (data) => heard.push([id, 'restore', data]) });
  const domains = makeDomains({
    terrain: { adoptOps: (ops) => heard.push(['terrain', 'ops', ops.map((o) => o.k)]) },
    forest: { adopt: (data, ops) => heard.push(['forest', 'adopt', data.stumps.length, ops.length]) },
    buildings: note('buildings'),
    fires: { adopt: (data, ops) => heard.push(['fires', 'adopt', data, ops.length]) },
    marks: note('marks'),
    name: note('name'),
  });
  const elements = domains.toElements(state());
  const ops = [
    { r: '0,0', k: 't:10:20', v: [-1, 1] },
    { r: '0,0', k: 't:10:21', v: [-1, 1] },
    { r: '1,0', k: 's:70.25:3', v: null },
    { r: LOOSE, k: 'name', v: 'Renamed' },
    { r: '0,0', k: 'c:1:2', v: [2.5, 1, 0, 0] }, // a fire laid ready
    { r: '0,0', k: 'zz:1:2', v: [1] }, // nobody's
  ];
  applyOps(elements, ops);
  const moved = domains.adopt(ops, elements);
  assert.deepEqual(moved.sort(), ['fires', 'forest', 'name', 'terrain']);
  assert.deepEqual(heard, [
    ['terrain', 'ops', ['t:10:20', 't:10:21']],
    ['forest', 'adopt', 1, 1],
    ['name', 'restore', 'Renamed'],
    ['fires', 'adopt', [[1, 2, 2.5, 1, 0, 0]], 1],
  ]);
});

test('a domain is registered once, and owns its kinds outright', () => {
  const domains = new SaveDomains();
  const fires = {
    id: 'fires',
    kinds: ['c'],
    encode: (data, put) => data.forEach((f) => put(regionOf(f.x, f.z), `c:${f.x}:${f.z}`, [f.wood])),
    decode() {
      const out = [];
      return { take: (r, k, rest, v) => void out.push({ x: +rest.split(':')[0], z: +rest.split(':')[1], wood: v[0] }), done: () => out };
    },
  };
  domains.register(fires);
  assert.throws(() => domains.register(fires), /already registered/);
  assert.throws(() => domains.register({ ...fires, id: 'embers' }), /belongs to "fires"/);
  assert.throws(() => domains.register({ id: 'half', kinds: ['h'] }), /needs kinds, encode and decode/);
  assert.throws(() => domains.register({ id: 'odd', scope: 'theirs' }), /scope/);
  const data = [{ x: 70, z: -3, wood: 2.5 }];
  const elements = domains.toElements({ fires: data });
  assert.deepEqual(plain(elements), { '1,-1': { 'c:70:-3': [2.5] } });
  assert.deepEqual(domains.fromElements(elements), { fires: data });
});

test('a record of what was saved is never the game’s own objects', () => {
  const domains = makeDomains();
  // going out: the game renames a mark in place after it was sent
  const live = state();
  const sent = new Map();
  applyOps(sent, diffElements(new Map(), domains.toElements(live)));
  live.marks[0].name = 'renamed';
  live.buildings[0].logs[2][6].push(22); // and cuts a notch
  const ops = diffElements(sent, domains.toElements(live));
  assert.deepEqual(ops.map((o) => o.k).sort(), ['l:z:10:20:24:1', 'm:k3f9x1'], 'both changes are seen, so both go out');
  // coming in: what a domain is handed is its own to change
  const back = domains.fromElements(sent);
  back.marks.find((m) => m.id === 'p0q8zz').name = 'changed after opening';
  back.buildings[0].logs[0][6].push(99);
  assert.equal(sent.get(LOOSE).get('m:p0q8zz').name, '', 'the record did not change with it');
  assert.equal(diffElements(sent, domains.toElements({ ...state(), marks: back.marks })).length, 1);
});
