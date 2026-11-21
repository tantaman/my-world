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
