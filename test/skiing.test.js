// Skiing: the physics of sliding down the snow, on ground made up for the
// purpose, and the judging of what you did in the air.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Skier, GRAVITY } from '../src/skiing/skier.js';
import { counts, fall, nameOf, score, LAND } from '../src/skiing/tricks.js';
import { Run, COMBO } from '../src/skiing/run.js';
import { earthAtFirst } from './helpers/earth.js';

// A plane falling away to +z at `slope` (rise over run), all snow, nothing on it.
const plane = (slope, extra = {}) => ({
  height: (x, z) => -slope * z,
  snow: () => 1,
  hit: () => false,
  ...extra,
});
const idle = { steer: 0, tuck: 0, brake: 0, pop: false, grab: false, flip: 0 };
// Run the skier for `secs`, with controls that can change as it goes.
function ride(sk, secs, ctl = () => idle, dt = 1 / 60) {
  const events = [];
  for (const e of ['takeoff', 'land', 'touch', 'crash', 'up', 'brush']) sk.on(e, (...a) => events.push([e, ...a]));
  for (let t = 0; t < secs; t += dt) sk.step(dt, { ...idle, ...ctl(t, sk) });
  return events;
}

test('pointed down a slope, you pick up speed, and the air holds you to a sensible top speed', () => {
  const sk = new Skier(plane(0.5));
  sk.start(0, 0, 0, 0.5, 0);
  ride(sk, 2);
  const early = sk.speed;
  assert.ok(early > 6, `a couple of seconds in (${early.toFixed(1)} m/s)`);
  ride(sk, 30);
  const top = sk.speed;
  assert.ok(top > 15 && top < 26, `upright, top speed is quick but not silly (${(top * 3.6).toFixed(0)} km/h)`);
  ride(sk, 20, () => ({ tuck: 1 }));
  assert.ok(sk.speed > top + 3, `tucked, faster (${(sk.speed * 3.6).toFixed(0)} km/h)`);
  assert.ok(sk.grounded && Math.abs(sk.y - -0.5 * sk.z) < 0.01, 'and on the snow all the way');
});

test('across the slope the edges hold you, and the skis carry you along their line', () => {
  const sk = new Skier(plane(0.5));
  sk.start(0, 0, 0, 0, Math.PI / 2); // pointing along +x, across the fall line
  ride(sk, 3);
  assert.ok(Math.abs(sk.vz) < 1, `hardly slipping down the slope (${sk.vz.toFixed(2)} m/s)`);
});

test('turning carves you round, and braking slows you to a stop', () => {
  const sk = new Skier(plane(0.4));
  sk.start(0, 0, 0, 12, 0);
  ride(sk, 1.5, () => ({ steer: 1 }));
  assert.ok(sk.heading < -0.4, `steering right turns you right (${sk.heading.toFixed(2)})`);
  assert.ok(sk.speed > 9, 'carving keeps most of your speed');
  const across = new Skier(plane(0.2));
  across.start(0, 0, 0, 14, 0);
  ride(across, 6, () => ({ brake: 1 }));
  assert.ok(across.speed < 1, `a snowplough stops you on a gentle slope (${across.speed.toFixed(2)} m/s)`);
});

test('on the flat, tucking pushes you along; stopped, you stay stopped', () => {
  const sk = new Skier(plane(0));
  sk.start(0, 0, 0, 0, 0);
  ride(sk, 2);
  assert.ok(sk.speed < 0.01, 'nothing moves you on the flat');
  ride(sk, 3, () => ({ tuck: 1 }));
  assert.ok(sk.speed > 3, `poling along (${sk.speed.toFixed(1)} m/s)`);
});

test('off the top of a ridge, fast enough, you fly; slowly, the snow keeps you', () => {
  // a ridge: flat, then dropping away at 0.6 past z = 0 (rounded over a metre)
  const ridge = plane(0, { height: (x, z) => (z < 0 ? 0 : z < 1 ? -0.3 * z * z : -0.6 * (z - 0.5)) });
  const fast = new Skier(ridge);
  fast.start(0, -10, 0, 14, 0);
  const ev = ride(fast, 2.5);
  assert.ok(ev.some((e) => e[0] === 'takeoff'), 'took off');
  const land = ev.find((e) => e[0] === 'land' || e[0] === 'touch');
  assert.ok(land, 'and came down again');
  assert.ok(!ev.some((e) => e[0] === 'crash'), 'on your skis');
  const slow = new Skier(ridge);
  slow.start(0, -3, 0, 2, 0);
  const ev2 = ride(slow, 3);
  assert.ok(!ev2.some((e) => e[0] === 'takeoff'), 'slowly over the top, you follow the snow down');
});

test('a jump: up and back down where you were going, on your skis', () => {
  const sk = new Skier(plane(0.3));
  sk.start(0, 0, 0, 8, 0);
  const ev = ride(sk, 2, (t) => ({ pop: t < 1 / 60 }));
  assert.equal(ev[0][0], 'takeoff');
  assert.equal(ev[0][1], true, 'you jumped');
  const land = ev.find((e) => e[0] === 'land');
  assert.ok(land, 'and landed');
  assert.ok(land[1].air.time > 0.5, `in the air a while (${land[1].air.time.toFixed(2)} s)`);
});

test('in the air, a key pressed since take-off spins you; one held from before does not', () => {
  // held through take-off: no spin
  const held = new Skier(plane(0.3));
  held.start(0, 0, 0, 8, 0);
  const ev = ride(held, 2, (t) => ({ pop: t < 1 / 60, steer: 1 }));
  const land = ev.find((e) => e[0] === 'land');
  assert.ok(land && Math.abs(land[1].air.spin) < 0.3, 'held from before: you land straight');
  // pressed in the air, for about half a turn, then let go
  const spun = new Skier(plane(0.5));
  spun.start(0, 0, 0, 8, 0);
  const ev2 = ride(spun, 3, (t) => ({ pop: t < 1 / 60, steer: t > 0.05 && t < 0.35 ? 1 : 0 }));
  const l2 = ev2.find((e) => e[0] === 'land');
  assert.ok(l2, `came down on your skis (${ev2.map((e) => e[0]).join(', ')})`);
  assert.equal(l2[1].name, '180', `a 180 (${(l2[1].air.spin * 180 / Math.PI).toFixed(0)}°)`);
  assert.ok(l2[1].switched, 'landed riding backwards');
  ride(spun, 1.5);
  assert.ok(Math.abs(spun.face) < 0.2, 'and swung round to face forward again');
});

test('land sideways and you fall, tumble to a stop, and get up across the slope', () => {
  const sk = new Skier(plane(0.5));
  sk.start(0, 0, 0, 8, 0);
  const ev = ride(sk, 6, (t) => ({ pop: t < 1 / 60, steer: t > 0.05 && t < 0.2 ? 1 : 0 }));
  const crash = ev.find((e) => e[0] === 'crash');
  assert.ok(crash, `fell (${ev.map((e) => e[0]).join(', ')})`);
  assert.equal(crash[1], 'landed sideways');
  assert.ok(ev.some((e) => e[0] === 'up'), 'and got up again');
  assert.ok(sk.speed < 0.01 && sk.down < 0, 'standing still');
  assert.ok(Math.abs(Math.cos(sk.yaw)) < 0.1, 'skis across the slope, so you stay put');
  ride(sk, 1);
  assert.ok(sk.speed < 0.5, 'and you do');
});

test('into a tree at speed you fall; brushing past one you glance off', () => {
  const tree = { x: 0, z: 20, r: 0.3 };
  const hit = (x, y, z, r, out) => {
    const dx = x - tree.x;
    const dz = z - tree.z;
    const d = Math.hypot(dx, dz);
    if (d > tree.r + r) return false;
    out.nx = dx / d;
    out.nz = dz / d;
    out.depth = tree.r + r - d;
    out.what = 'a tree';
    return true;
  };
  const sk = new Skier(plane(0.3, { hit }));
  sk.start(0.05, 0, 0, 12, 0);
  const ev = ride(sk, 3);
  const crash = ev.find((e) => e[0] === 'crash');
  assert.ok(crash, 'straight into it');
  assert.equal(crash[1], 'into a tree');
  const by = new Skier(plane(0.3, { hit }));
  by.start(0.58, 0, 0, 10, 0); // just clipping its side
  const ev2 = ride(by, 3);
  assert.ok(!ev2.some((e) => e[0] === 'crash'), 'past it, only just');
});

test('onto bare ground the skis scrape you to a stop', () => {
  const sk = new Skier(plane(0.1, { snow: (x, z) => (z < 10 ? 1 : 0) }));
  sk.start(0, 0, 0, 10, 0);
  ride(sk, 4);
  assert.ok(sk.speed < 0.5 && sk.z < 30, `stopped soon after (${sk.z.toFixed(1)} m)`);
  assert.ok(sk.bare > 0.9);
});

test('tricks are named and scored, and landing them is judged', () => {
  const air = (o) => ({ time: 1, height: 1, spin: 0, flip: 0, grab: 0, popped: true, ...o });
  assert.equal(nameOf(air({ spin: Math.PI * 2 })), '360');
  assert.equal(nameOf(air({ spin: -Math.PI * 3.1 })), '540');
  assert.equal(nameOf(air({ flip: -Math.PI * 2 })), 'backflip');
  assert.equal(nameOf(air({ flip: Math.PI * 4 })), 'double frontflip');
  assert.equal(nameOf(air({ flip: -Math.PI * 2, spin: Math.PI * 2, grab: 0.5 })), 'backflip 360 · mute grab');
  assert.equal(nameOf(air({ spin: Math.PI, grab: 0.4 }), 'board'), '180 · indy');
  assert.equal(nameOf(air({ grab: 0.6 }), 'board'), 'method');
  assert.equal(nameOf(air({ time: 1.5 })), 'big air');
  assert.equal(nameOf(air({ time: 0.6 })), '');
  // more is worth more
  assert.ok(score(air({ spin: Math.PI * 4 })) > score(air({ spin: Math.PI * 2 })));
  assert.ok(score(air({ flip: Math.PI * 4 })) === score(air({ flip: Math.PI * 2 })) + 3 * 400);
  assert.ok(Math.abs(score(air({ spin: Math.PI * 2 }), { sketchy: true }) - score(air({ spin: Math.PI * 2 })) / 2) <= 5, 'still holding the grab as you land: half');
  // a skip over a bump is nothing
  assert.ok(!counts({ time: 0.1, height: 0.1, spin: 0, flip: 0, grab: 0, popped: false }));
  assert.equal(score({ time: 0.1, height: 0.1, spin: 0, flip: 0, grab: 0, popped: false }), 0);
  // landing
  assert.equal(fall({ skew: 0.2, upright: 0.1, impact: 5 }), null);
  assert.equal(fall({ skew: LAND.skew + 0.1, upright: 0, impact: 5 }), 'sideways');
  assert.equal(fall({ skew: 0, upright: Math.PI, impact: 5 }), 'on your head');
  assert.equal(fall({ skew: 0, upright: Math.PI * 2 + 0.2, impact: 5 }), null, 'a whole flip round is upright');
  assert.equal(fall({ skew: 0, upright: 0, impact: LAND.impact + 1 }), 'too hard');
});

test('a run tallies its tricks into combos, banked on the snow or lost in a fall', () => {
  const r = new Run();
  r.reset(0, 100, 0);
  r.landed('360', 200);
  r.landed('backflip', 400);
  assert.equal(r.pending, 1200, 'two tricks: their points, twice');
  assert.equal(r.update(COMBO - 0.5, 0, 90, 10, 15, true), 0);
  assert.equal(r.update(1, 0, 80, 20, 20, true), 1200, 'banked once you have been on the snow a while');
  assert.equal(r.points, 1200);
  assert.equal(r.drop, 20);
  assert.equal(r.top, 20);
  r.landed('180', 100);
  assert.equal(r.fall(), 100, 'a fall loses the combo');
  assert.equal(r.points, 1200);
  assert.equal(r.falls, 1);
  assert.equal(r.best.name, 'backflip');
});

test('gravity is gentler than walking’s, so airs float a little', () => {
  assert.ok(GRAVITY > 9 && GRAVITY < 19);
});

// ── The forest's ski runs ───────────────────────────────────────────────────

test('ski runs are wherever the high country holds snow, a square at a time, and pinned', async () => {
  const { growWorld, LANDS } = await import('../src/world/lands.js');
  const { HIKES } = await import('../src/world/hikes.js');
  const { Landforms } = await import('../src/world/landforms.js');
  const { findRunTop, runDrop } = await import('../src/skiing/descent.js');
  const { SkiRuns, RUNS } = await import('../src/skiing/runs.js');
  const { matchesGolden } = await import('./helpers/golden.js');
  const SEED = 20261119;
  const gen = growWorld(SEED, [], LANDS[0], [], await earthAtFirst());
  const start = gen.findSpawn(0, 0);
  const landforms = new Landforms(HIKES);
  const home = findRunTop(gen, landforms, start, 30000, 750);
  const runs = new SkiRuns(gen, landforms, { home });
  const pinned = {};
  const names = new Map();
  for (let j = -5; j < 5; j++) {
    for (let i = -5; i < 5; i++) {
      const r = runs.cell(i, j);
      if (!r) continue;
      assert.ok(r.x >= i * RUNS.cell && r.x < (i + 1) * RUNS.cell && r.z >= j * RUNS.cell && r.z < (j + 1) * RUNS.cell, 'in its own square');
      assert.equal(runDrop(gen, landforms, r.x, r.z), r.drop, 'snow enough below it, on the forest\'s own land');
      assert.ok(!home || Math.hypot(r.x - home.x, r.z - home.z) >= RUNS.apart, 'apart from the High Country ski run');
      assert.equal(runs.byId(r.id), r);
      for (let dj = -3; dj <= 0; dj++) for (let di = -3; di <= 3; di++) if (dj < 0 || di < 0) assert.notEqual(names.get(`${i + di}:${j + dj}`)?.split(' ')[0], r.name.split(' ')[0], 'no two within three squares share a mountain');
      names.set(`${i}:${j}`, r.name);
      pinned[r.id] = { name: r.name, x: r.x, z: r.z, drop: Math.round(r.drop * 1000) / 1000 };
    }
  }
  assert.ok(Object.keys(pinned).length >= 3, 'there are some');
  assert.ok(Object.keys(pinned).length < 60, 'but the high country is rare');
  assert.deepEqual(new SkiRuns(gen, landforms, { home }).cell(...Object.keys(pinned)[0].split(':').slice(2).map(Number)), runs.byId(Object.keys(pinned)[0]), 'the same every time');
  // places people track are where they were
  matchesGolden(`ski-runs-${SEED}`, pinned, { tolerance: 1e-6 });
});
