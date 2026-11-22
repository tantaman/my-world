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
