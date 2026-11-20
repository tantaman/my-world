// Mounts: where each one lives in a world grown from a seed, the hints that
// lead you there, and winning a wild one over. Where they live is part of
// what a world is (the hints on the map point at it, and everyone in a
// shared world goes looking in the same meadow), so it's pinned like the land.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { findHaunts, hintArea, bearing, shore, STAGE, HINTS, RANGE, KINDS } from '../src/mounts/haunts.js';
import { Hints, FIRST, EVERY } from '../src/mounts/hints.js';
import { sense, tamed, STILL } from '../src/mounts/taming.js';
import { MOUNTS } from '../src/mounts/kinds.js';

const SEEDS = [20261119, 42];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

for (const land of LANDS) for (const seed of SEEDS) {
  test(`seed ${seed}${land > 1 ? ` on land ${land}` : ''}: each mount has a haunt that suits it, the same every time`, () => {
    const gen = growWorld(seed, [], land);
    const start = gen.findSpawn(0, 0);
    const h = findHaunts(gen, start);
    assert.deepEqual(Object.keys(h).sort(), [...KINDS].sort(), 'a horse, a turtle and an eagle');

    // the horse: out in the open, on dry ground, within a long walk
    const { horse, turtle, eagle } = h;
    assert.ok(gen.forest(horse.x, horse.z) < 0.2, 'the horse lives in a meadow');
    gen.height(horse.x, horse.z);
    assert.ok(gen.water.edge > 10, 'on dry ground');
    const dh = dist(horse, start);
    assert.ok(dh >= RANGE.horse[0] && dh <= RANGE.horse[1], `within reach (${dh.toFixed(0)} m)`);

    // the turtle: in water deep enough to swim in, with a shore to bask on
    assert.ok(turtle.lake, 'the turtle lives in a lake or a pond');
    const deep = turtle.lake.level - gen.height(turtle.lake.x, turtle.lake.z);
    assert.ok(deep > 1, `deep in the middle (${deep.toFixed(1)} m)`);
    const bank = shore(turtle.lake, 0.7, 2);
    gen.height(bank.x, bank.z);
    assert.ok(gen.water.edge > -0.5, 'and its shore is the edge of the water');

    // the eagle: up high, higher than the land round about
    const top = gen.height(eagle.x, eagle.z);
    for (let a = 0; a < 6.28; a += 0.8) assert.ok(gen.height(eagle.x + Math.cos(a) * 30, eagle.z + Math.sin(a) * 30) < top + 0.5, 'the eagle is on a summit');
    assert.ok(dist(eagle, start) > dh, 'further off than the horse');

    // the same seed, the same places
    const again = findHaunts(growWorld(seed, [], land), start);
    for (const k of KINDS) {
      assert.equal(again[k].x, h[k].x);
      assert.equal(again[k].z, h[k].z);
    }
  });
}

test('the hint circles narrow down, and always hold the haunt', () => {
  const gen = growWorld(42, [], 1);
  const h = findHaunts(gen, gen.findSpawn(0, 0));
  for (const k of KINDS) {
    const wide = hintArea(h[k], STAGE.RUMOUR, 42);
    const near = hintArea(h[k], STAGE.SIGNS, 42);
    assert.ok(wide.r <= HINTS[STAGE.RUMOUR].r);
    assert.ok(near.r < wide.r, 'the second circle is smaller');
    assert.ok(dist(wide, gen.findSpawn(0, 0)) > wide.r, "you don't start out in it");
    for (const c of [wide, near]) {
      assert.ok(dist(c, h[k]) < c.r * 0.61, 'the haunt is inside it');
      assert.ok(dist(c, h[k]) > 0, 'but not right in the middle');
    }
    assert.deepEqual(hintArea(h[k], STAGE.RUMOUR, 42), wide, 'the same circle every time');
    assert.equal(hintArea(h[k], STAGE.NONE, 42), null, 'nothing before there is word of it');
    assert.equal(hintArea(h[k], STAGE.SEEN, 42), null, 'or once it has been seen');
  }
});

test('a bearing in words', () => {
  assert.deepEqual(bearing(0, 0, 0, -300).words, 'about 300 m to the north');
  assert.deepEqual(bearing(0, 0, 212, 212).words, 'about 300 m to the south-east');
  assert.equal(bearing(10, 10, -40, 10).way, 'west');
  assert.equal(bearing(0, 0, 3, 0).words, 'about 10 m to the east');
});

test('word comes of the nearest first, then signs, then a sighting', () => {
  const haunts = {
    horse: { kind: 'horse', x: 200, z: 0, r: 20, d: 200 },
    turtle: { kind: 'turtle', x: 0, z: 400, r: 20, d: 400 },
    eagle: { kind: 'eagle', x: -700, z: 0, r: 4, d: 700 },
  };
  const hints = new Hints({ haunts, seed: 7, start: { x: 0, z: 0 } });
  const home = { x: 0, z: 0 };
  const never = () => false;
  assert.deepEqual(hints.update(FIRST - 1, home, never), [], 'nothing at first');
  assert.deepEqual(hints.update(2, home, never), [{ kind: 'horse', stage: STAGE.RUMOUR }], 'then the nearest');
  assert.ok(hints.area('horse'), 'and it is on the map');
  assert.equal(hints.area('turtle'), null, 'the others are not yet');
  // into the circle: signs of it
  const wide = hints.area('horse');
  assert.deepEqual(hints.update(0.1, wide, never), [{ kind: 'horse', stage: STAGE.SIGNS }]);
  assert.ok(hints.area('horse').r < wide.r);
  // seeing it
  assert.deepEqual(hints.update(0.1, wide, (k) => k === 'horse'), [{ kind: 'horse', stage: STAGE.SEEN }]);
  assert.equal(hints.area('horse'), null, 'no more circle: it is on the map where it is');
  // won over: word of the next comes soon after
  hints.won('horse');
  assert.deepEqual(hints.update(FIRST + 0.1, home, never), [{ kind: 'turtle', stage: STAGE.RUMOUR }]);
  // and the last in its own time
  assert.deepEqual(hints.update(EVERY - 1, home, never), []);
  assert.deepEqual(hints.update(2, home, never), [{ kind: 'eagle', stage: STAGE.RUMOUR }]);
  // what was known comes back from a save
  const again = new Hints({ haunts, seed: 7, start: { x: 0, z: 0 } });
  again.load(hints.save());
  assert.deepEqual(again.stage, hints.stage);
  again.load({ horse: 9, turtle: 'x' });
  assert.deepEqual(again.stage, hints.stage, 'and nonsense in a save is ignored');
});

test('stumbling on one before any word of it counts as finding it', () => {
  const hints = new Hints({ haunts: { horse: { kind: 'horse', x: 50, z: 0, r: 20 } }, seed: 1, start: { x: 0, z: 0 } });
  assert.deepEqual(hints.update(0.1, { x: 40, z: 0 }, () => false), [{ kind: 'horse', stage: STAGE.SEEN }]);
});

test('winning a wild one over: stand quietly beside it, hand out', () => {
  const t = MOUNTS.horse.taming;
  const s = { trust: 0, mood: 'ignore' };
  const quiet = { d: t.reach - 0.5, speed: 0, holding: true };
  sense(s, quiet, t, t.calm / 2);
  assert.equal(s.mood, 'calm');
  assert.ok(Math.abs(s.trust - 0.5) < 1e-9, 'halfway there');
  // moving, it doesn't count, but doesn't scare it either
  sense(s, { ...quiet, speed: STILL + 0.5 }, t, 1);
  assert.ok(Math.abs(s.trust - 0.5) < 1e-9);
  // letting go, it fades slowly
  sense(s, { d: 10, speed: 0, holding: false }, t, 1);
  assert.equal(s.mood, 'watch');
  assert.ok(s.trust < 0.5 && s.trust > 0.4);
  // too far off to reach
  sense(s, { d: t.reach + 1, speed: 0, holding: true }, t, 1);
  assert.notEqual(s.mood, 'calm');
  // rushing at it sets you back, and sends it off
  sense(s, { d: t.wary - 1, speed: t.spook + 1, holding: false }, t, 0.016);
  assert.equal(s.mood, 'bolt');
  assert.equal(s.trust, 0);
  // stand with it long enough, and it's yours
  for (let i = 0; i < 400 && !tamed(s); i++) sense(s, quiet, t, 1 / 60);
  assert.ok(tamed(s), 'tamed');
  assert.equal(s.trust, 1);
});

test('each mount carries you its own way', () => {
  const { horse, turtle, eagle } = MOUNTS;
  assert.ok(horse.carrier.run > turtle.carrier.run * 5, 'a horse is the fast one on land');
  assert.ok(turtle.carrier.swim > horse.carrier.swim * 2, 'a turtle is the fast one in water');
  assert.ok(eagle.carrier.fly && !horse.carrier.fly && !turtle.carrier.fly, 'and only the eagle flies');
  for (const m of Object.values(MOUNTS)) {
    for (const k of ['walk', 'run', 'swim', 'depth', 'radius', 'height', 'eye', 'back', 'agility', 'turn', 'push']) assert.ok(Number.isFinite(m.carrier[k]), `${m.name}.${k}`);
    assert.ok(m.taming.reach < m.taming.wary && m.taming.wary < m.taming.notice, `${m.name}: reach < wary < notice`);
  }
});
