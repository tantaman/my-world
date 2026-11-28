// Waterfalls: found on the land where the map marks them, as high as the
// cliff really is, and the falling water kept clear of the rock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { localFrame } from '../tools/hike/geo.js';
import { buildHike } from '../tools/hike/build.js';
import { growWorld } from '../src/world/lands.js';
import { findFall, curtain } from '../src/falls/falls.js';

const SEED = 20261119;
const PHOTO = { lat: 36.25, lon: -112.7, bearing: 180, hour: 12 };
const frame = localFrame(PHOTO.lat, PHOTO.lon);
const LL = (e, n) => frame.toLatLon(e, n);
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);
const AT = [60000, -30000];

// A creek running north down a gentle valley, over a drop at n = 0 (real m):
// `drop(n)` is how far the land has fallen by then.
function creek(drop) {
  const elevation = (lat, lon) => {
    const [e, n] = frame.toEN(lat, lon);
    return 900 - n * 0.02 + Math.abs(e) * 0.15 - drop(n);
  };
  const def = buildHike({
    id: 'creek',
    scale: 0.2,
    name: 'Creek',
    photo: PHOTO,
    elevation,
    streams: [{ name: 'Creek', river: true, points: Array.from({ length: 41 }, (_, k) => LL(0, -800 + k * 40)) }],
    falls: [{ name: 'The Fall', lat: LL(0, 8)[0], lon: LL(0, 8)[1] }],
    at: AT,
    radius: 1200,
    fade: 300,
    cell: 5,
  }).def;
  const gen = growWorld(SEED, [], 1, [def]);
  const L = gen.landforms[0];
  const f = def.falls[0];
  return { gen, L, at: [AT[0] + f.x, AT[1] + f.z] };
}

test('a fall is where the land drops, as far as it drops, the way the water goes', () => {
  // a cliff 30 real metres high, a few metres from where the map puts it
  const { gen, L, at } = creek((n) => 30 * smooth(-2, 2, n));
  const f = findFall(L, ...at);
  assert.ok(f, 'found');
  near(f.height, 30 * 0.2, 0.8, 'as high as the cliff, at 1 : 5');
  assert.equal(f.cascade, false, 'off an edge');
  near(f.dir[1], -1, 0.05, 'falling north, the way the creek runs');
  near(f.top[0], AT[0], 1, 'on the creek');
  near(f.top[2], AT[1], 2.5, 'at the cliff, not where the map says');
  assert.ok(f.foot[1] < f.top[1] - 5 && f.width > 1, 'landing below it, as wide as the water');
  // the water falls clear of the rock, all the way down
  const ground = (x, z) => gen.height(x, z);
  const shape = curtain(f, ground, 12);
  assert.equal(shape.length, 13);
  shape.forEach(([out, y], r) => {
    if (r === 0 || r === 12) return;
    const g = ground(f.top[0] + f.dir[0] * out, f.top[2] + f.dir[1] * out);
    assert.ok(g < y, `row ${r}: the water (${y.toFixed(2)}) over the ground (${g.toFixed(2)})`);
    assert.ok(out >= shape[r - 1][0], 'and never back towards the cliff');
  });
});

test('travertine steps are a cascade; a plain creek has no fall', () => {
  // ten steps of a metre and a half, ten metres apart
  const steps = creek((n) => {
    let d = 0;
    for (let k = 0; k < 10; k++) d += 1.5 * smooth(-30 + k * 10 - 1, -30 + k * 10 + 1, n);
    return d;
  });
  const f = findFall(steps.L, ...steps.at);
  assert.ok(f && f.cascade, 'a cascade');
  assert.ok(f.height > 1 && f.height < 15 * 0.2 + 0.5, `down some of the steps (${f.height.toFixed(2)} m)`);
  const shape = curtain(f, (x, z) => steps.gen.height(x, z), 6);
  near(shape[6][0], f.run, 1e-9, 'poured down its slope to its foot');
  const plain = creek(() => 0);
  assert.equal(findFall(plain.L, ...plain.at), null, 'nothing falls on a gentle creek');
});
