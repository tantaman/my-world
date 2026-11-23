import assert from 'node:assert/strict';
import test from 'node:test';
import { planRoute } from '../src/map/routes.js';

const start = { x: 0, z: 0 };
const home = { id: 'home', x: -100, z: 0 };
const alps = { id: 'alps', x: 50000, z: -1000 };
const peak = { id: 'peak', x: 50000, z: -1200 };
const fields = [home, alps];
const steps = (legs) => legs.map(({ mode, to }) => [mode, to.id]);

test('local destinations have a direct bearing and world distance', () => {
  const [walk] = planRoute(start, { x: -300, z: -400 }, { fields });
  assert.deepEqual([walk.mode, walk.bearing, walk.distance], ['walk', 'NW', 500]);
  assert.deepEqual(steps(planRoute(start, peak, { fields: [home] })), [['walk', 'peak']]);
});

test('directions give the reachable flight and update at each end', () => {
  assert.deepEqual(steps(planRoute(start, peak, { fields, surveying: true })), [['survey', 'peak']]);
  assert.deepEqual(steps(planRoute(start, peak, { fields })), [['walk', 'home'], ['flight', 'alps'], ['walk', 'peak']]);
  assert.deepEqual(steps(planRoute(start, peak, { fields, here: home })), [['flight', 'alps'], ['walk', 'peak']]);
  assert.deepEqual(steps(planRoute(start, peak, { fields, here: home, landing: alps })), [['flight', 'alps'], ['walk', 'peak']]);
  assert.deepEqual(steps(planRoute(alps, peak, { fields, here: alps })), [['walk', 'peak']]);
  assert.deepEqual(steps(planRoute(start, alps, { fields, here: home })), [['flight', 'alps']]);
});

test('places are listed by kind, nearest first, from every source in the list', async () => {
  const { Places } = await import('../src/map/places.js');
  const { GridNearest } = await import('../src/core/nearest.js');
  const places = new Places();
  // one on every 100 m square, at its middle
  places.addSource({
    within: () => [],
    get: () => null,
    list: 'wells',
    nearest: (x, z) => new GridNearest(x, z, { size: 100, at: (i, j) => [{ id: `well:${i}:${j}`, x: i * 100 + 50, z: j * 100 + 50 }] }),
  });
  places.addSource({ list: 'ski', destinations: () => [{ id: 'peak', x: 1000, z: 0 }] });
  places.addSource({ list: 'ski', destinations: () => [{ id: 'hill', x: 120, z: 0 }] });
  assert.deepEqual(places.lists(), ['ski', 'wells']);
  const take = (stream, n) => {
    const out = [];
    while (out.length < n) {
      if (stream.ready) out.push(stream.take().place.id);
      else if (stream.work() === 'done' && !stream.ready) break;
    }
    return out;
  };
  assert.deepEqual(take(places.around(0, 0, 'ski'), 5), ['hill', 'peak']);
  assert.deepEqual(take(places.around(10, 10, 'wells'), 1), ['well:0:0']);
  // everywhere: the wells as they come, the hill among them
  const all = take(places.around(0, 0), 12);
  assert.equal(all.length, 12);
  assert.ok(all.indexOf('hill') > 0 && all.indexOf('hill') < 12);
});

test('a search finds places by the words they are known by', async () => {
  const { matcher, wordsOf } = await import('../src/map/search.js');
  assert.equal(matcher('  '), null, 'nothing to look for');
  assert.deepEqual(wordsOf('Charon’s Boat — Île'), ['charon', 's', 'boat', 'ile']);
  const cabin = { name: 'Hollis cabin', kind: 'old cabin', note: 'a roof fallen in' };
  const gate = { name: 'The Gate', kind: 'gate', note: 'Through me the way', words: 'hell inferno' };
  const yes = (q, p, ...more) => matcher(q)(p, ...more);
  assert.ok(yes('cab', cabin), 'the start of a word in its name');
  assert.ok(yes('HOLLIS Cabin', cabin), 'whatever the case');
  assert.ok(yes('roof', cabin), 'its note');
  assert.ok(yes('old pl', cabin, 'old places'), 'the list it is in');
  assert.ok(!yes('abin', cabin), 'not the middle of a word');
  assert.ok(!yes('hollis well', cabin), 'every word, not any');
  assert.ok(yes('hell', gate), 'and words it is given besides');
  assert.ok(yes('ile', { name: 'Île Verte' }), 'without its accents');
});

test('a search looks in every source that can say what it has, as far as asked', async () => {
  const { Places } = await import('../src/map/places.js');
  const { GridNearest, MergeNearest } = await import('../src/core/nearest.js');
  const { matcher } = await import('../src/map/search.js');
  const places = new Places();
  // a well on every 100 m square, every tenth one a dry one
  places.addSource({
    list: 'wells',
    nearest: (x, z) => new GridNearest(x, z, { size: 100, at: (i, j) => [{ id: `well:${i}:${j}`, x: i * 100 + 50, z: j * 100 + 50, name: (i + j) % 10 ? 'well' : 'dry well' }] }),
  });
  places.addSource({ list: 'hikes', destinations: () => [{ id: 'hike:far', x: 3e6, z: 0, name: 'Far Valley', kind: 'hike' }] });
  // in no list: only found by searching
  places.addSource({ within: () => [], get: () => null, destinations: () => [{ id: 'gate:0', x: 900, z: 0, name: 'The Gate', words: 'hell' }] });
  places.addSource({ within: () => [], get: () => null }); // nothing to say
  const take = (stream, n = 1e4) => {
    const out = [];
    while (out.length < n) {
      if (stream.ready) out.push(stream.take().place.id);
      else if (stream.work() === 'done' && !stream.ready) break;
    }
    return out;
  };
  // a stream a source, here taken together nearest first
  const search = (q, list, reach) => {
    const streams = places.search(0, 0, matcher(q), list, reach);
    return { found: take(new MergeNearest(streams)), cut: streams.some((s) => s.cut), sources: streams.length };
  };
  assert.ok(!take(places.around(0, 0), 200).includes('gate:0'), 'the gate is in no list');
  assert.deepEqual(search('hell', null, 2000), { found: ['gate:0'], cut: true, sources: 3 }, 'but a search finds it');
  assert.deepEqual(search('hell', 'wells', 2000), { found: [], cut: true, sources: 1 }, 'not in a list it is not in');
  const dry = search('dry', null, 500);
  assert.ok(dry.found.length > 0 && dry.found.every((id) => id.startsWith('well:')));
  assert.equal(dry.cut, true, 'it stopped at its reach, and there were more');
  assert.deepEqual(search('valley', null, 500).found, ['hike:far'], 'one known all along is found however far');
  assert.deepEqual(search('wells far', null, 500).found, [], 'every word');
  assert.deepEqual(search('far', 'hikes', 500), { found: ['hike:far'], cut: false, sources: 1 }, 'all of a known list is looked over');
});
