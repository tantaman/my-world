import assert from 'node:assert/strict';
import test from 'node:test';
import { GridNearest, ListNearest, MergeNearest, PendingNearest, FilterNearest, ReachNearest } from '../src/core/nearest.js';
import { mulberry32, hash2i } from '../src/noise.js';

// A made-up grid: some squares have a place or two, some spill a little out.
const SIZE = 100;
const SPILL = 12;
function placesIn(i, j, salt) {
  const r = mulberry32(hash2i(i, j, salt));
  const out = [];
  const n = r() < 0.4 ? 0 : r() < 0.8 ? 1 : 2;
  for (let k = 0; k < n; k++) out.push({ id: `${salt}:${i}:${j}:${k}`, x: (i + r()) * SIZE + (r() - 0.5) * SPILL * 2, z: (j + r()) * SIZE + (r() - 0.5) * SPILL * 2 });
  return out;
}
function everything(salt, n = 20) {
  const all = [];
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) all.push(...placesIn(i, j, salt));
  return all;
}
function pull(stream, count) {
  const out = [];
  let spins = 0;
  while (out.length < count) {
    if (stream.ready) out.push(stream.take());
    else if (stream.work() === 'done' && !stream.ready) break;
    if (++spins > 1e6) throw new Error('never settled');
  }
  return out;
}
const byDistance = (all, x, z) => all.map((p) => ({ id: p.id, d: Math.hypot(p.x - x, p.z - z) })).sort((a, b) => a.d - b.d);

test('a grid is listed nearest first, as far as it is asked', () => {
  const x = 37;
  const z = -61;
  let looked = 0;
  const stream = new GridNearest(x, z, { size: SIZE, spill: SPILL, at: (i, j) => (looked++, placesIn(i, j, 1)) });
  const got = pull(stream, 60);
  const want = byDistance(everything(1), x, z).slice(0, 60);
  assert.deepEqual(got.map((g) => g.place.id), want.map((w) => w.id));
  for (let k = 1; k < got.length; k++) assert.ok(got[k].d >= got[k - 1].d);
  assert.ok(looked < 140, `looked at ${looked} squares for 60 places`);
});

test('a square still being looked over holds the list back, then lets it go', () => {
  let asked = 0;
  const at = (i, j) => (i === 0 && j === 0 && asked++ < 3 ? undefined : placesIn(i, j, 2));
  const stream = new GridNearest(50, 50, { size: SIZE, spill: SPILL, at });
  const seen = [];
  let waits = 0;
  while (seen.length < 10) {
    if (stream.ready) seen.push(stream.take().place.id);
    else if (stream.work() === 'wait') waits++;
  }
  assert.ok(waits >= 1);
  assert.deepEqual(seen, byDistance(everything(2), 50, 50).slice(0, 10).map((w) => w.id));
});

test('streams merge nearest first, and stop where they are told', () => {
  const a = new GridNearest(0, 0, { size: SIZE, spill: SPILL, at: (i, j) => placesIn(i, j, 3), far: 500 });
  const b = new GridNearest(0, 0, { size: SIZE, spill: SPILL, at: (i, j) => placesIn(i, j, 4), far: 500 });
  const fixed = [{ id: 'far', x: 4000, z: 0 }, { id: 'near', x: 3, z: 4 }];
  const all = pull(new MergeNearest([a, b, new ListNearest(0, 0, fixed)]), 1e4);
  const want = byDistance([...everything(3), ...everything(4), ...fixed], 0, 0).filter((w) => w.d <= 500 || w.id === 'far');
  assert.deepEqual(all.map((g) => g.place.id), want.map((w) => w.id));
});

test('a place two streams hold is listed once', () => {
  const p = { id: 'same', x: 10, z: 0 };
  const merged = new MergeNearest([new ListNearest(0, 0, [p]), new ListNearest(0, 0, [p, { id: 'other', x: 20, z: 0 }])]);
  assert.deepEqual(pull(merged, 5).map((g) => g.place.id), ['same', 'other']);
});

test('a square that says where its places can be is only looked in when that is next', () => {
  // big squares, most with nothing; one place in some, somewhere near a spot
  const BIG = 1000;
  const spot = (i, j) => {
    const r = mulberry32(hash2i(i, j, 9));
    return r() < 0.3 ? { x: (i + 0.2 + r() * 0.6) * BIG, z: (j + 0.2 + r() * 0.6) * BIG } : null;
  };
  const placeOf = (i, j) => {
    const s = spot(i, j);
    return s ? [{ id: `${i}:${j}`, x: s.x + 40, z: s.z - 30 }] : [];
  };
  const looked = [];
  const stream = new GridNearest(10, 10, {
    size: BIG,
    at: (i, j) => (looked.push(`${i}:${j}`), placeOf(i, j)),
    box: (i, j) => {
      const s = spot(i, j);
      return s ? [s.x - 60, s.z - 60, s.x + 60, s.z + 60] : null;
    },
  });
  const got = pull(stream, 8);
  const all = [];
  for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) all.push(...placeOf(i, j));
  assert.deepEqual(got.map((g) => g.place.id), byDistance(all, 10, 10).slice(0, 8).map((w) => w.id));
  assert.equal(looked.length, new Set(looked).size, 'each looked in once');
  assert.ok(looked.every((k) => spot(...k.split(':').map(Number))), 'and only those that can have something');
  assert.ok(looked.length <= 10, `no more of them than it took (${looked.length})`);
});

test('a place still being worked out holds up only what could be further than it', () => {
  const x = 0;
  const z = 0;
  let known; // undefined: still being worked out
  const late = { id: 'late', x: 300, z: 0 };
  const merged = () =>
    new MergeNearest([
      new PendingNearest(x, z, () => known, 250),
      new ListNearest(x, z, [
        { id: 'a', x: 100, z: 0 },
        { id: 'b', x: 400, z: 0 },
      ]),
    ]);
  const s = merged();
  assert.equal(s.ready.place.id, 'a', 'nearer than it could be: listed straight away');
  s.take();
  assert.equal(s.ready, null, 'further than it could be: held up');
  assert.equal(s.work(), 'wait', 'while it is worked out');
  known = late;
  assert.equal(s.work(), 'more');
  assert.deepEqual(pull(s, 5).map((f) => f.place.id), ['late', 'b'], 'then in its place');
  known = null;
  assert.deepEqual(pull(merged(), 5).map((f) => f.place.id), ['a', 'b'], 'and nothing, if there is none');
});

test('a filtered grid lists only what is kept, still nearest first', () => {
  const x = -20;
  const z = 45;
  const keep = (p) => p.id.endsWith(':0') && (p.x > 0) === (p.z > 0); // two quarters of the world, first of each square
  const s = new FilterNearest(new GridNearest(x, z, { size: SIZE, spill: SPILL, at: (i, j) => placesIn(i, j, 3) }), keep);
  const want = byDistance(everything(3).filter(keep), x, z).slice(0, 25);
  assert.deepEqual(pull(s, 25).map((g) => g.place.id), want.map((w) => w.id));
});

test('a stream with a reach stops there, and says it was cut short', () => {
  const x = 0;
  const z = 0;
  const grid = () => new GridNearest(x, z, { size: SIZE, spill: SPILL, at: (i, j) => placesIn(i, j, 4) });
  const s = new ReachNearest(grid(), 450);
  const got = pull(s, 1e4);
  const want = byDistance(everything(4), x, z).filter((w) => w.d <= 450);
  assert.deepEqual(got.map((g) => g.place.id), want.map((w) => w.id), 'everything within it');
  assert.equal(s.work(), 'done');
  assert.equal(s.low, Infinity);
  assert.equal(s.cut, true, 'and there was more beyond');
  // a short list wholly within reach isn't cut
  const near = new ReachNearest(new ListNearest(x, z, [{ id: 'a', x: 10, z: 0 }]), 450);
  assert.deepEqual(pull(near, 5).map((g) => g.place.id), ['a']);
  assert.equal(near.cut, false);
  // merged with a far list, the far place still comes, after the reach
  const short = new ReachNearest(grid(), 300);
  const all = pull(new MergeNearest([short, new ListNearest(x, z, [{ id: 'far', x: 90000, z: 0 }])]), 1e4).map((g) => g.place.id);
  assert.equal(all.at(-1), 'far');
  assert.equal(all.length, byDistance(everything(4), x, z).filter((w) => w.d <= 300).length + 1);
  assert.equal(short.cut, true);
});
