// Adventures: one at a time, sent somewhere first if it needs, how it goes
// for you (hurt, worn down, mending), how it ends (made it, didn't and set
// down where it began, given up), a camp left standing a while once won,
// your record and how it's saved; and the pure parts the adventures stand
// on: finding water, a mountainside or a clearing, the stockade that stops
// a bullet, and the bear or lion that comes for you.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Adventures, validateRecord, HEALTH, CARD } from '../src/adventures/adventures.js';
import { tally } from '../src/adventures/board.js';
import { arrowTo, clock } from '../src/adventures/banner.js';
import { slopeAt, findWater, findSlope, findClearing, nearest } from '../src/adventures/places.js';
import { rayWalls } from '../src/adventures/camp.js';
import { Prowler } from '../src/adventures/prowler.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// You, standing somewhere, and a record of being set down again.
function you(x = 0, z = 0) {
  const body = { at: { x, z, y: 0, yaw: 0 }, backs: [] };
  body.where = () => ({ ...body.at });
  body.back = (home) => {
    body.backs.push(home);
    body.at = { ...home };
  };
  return body;
}

// An adventure that does what it's told: { outcome } is what its next update says.
function kind(id, extra = {}) {
  const k = {
    id,
    title: id.toUpperCase(),
    runs: [],
    start(kit, { at, from }) {
      const run = { at, from, outcome: null, t: 0, disposed: 0, objective: `do ${id}`, update(dt) {
        run.t += dt;
        return run.outcome;
      }, dispose() {
        run.disposed++;
      } };
      Object.assign(run, extra.run || {});
      k.runs.push(run);
      return run;
    },
    ...extra.kind,
  };
  return k;
}

const step = (a, seconds, dt = 0.05) => {
  for (let t = 0; t < seconds; t += dt) a.update(dt);
};

test('an adventure begins, goes on, and when you make it, is cleared away and counted', () => {
  const body = you(5, 7);
  const a = new Adventures({ body, kit: { name: 'kit' } });
  const storm = a.define(kind('storm'));
  const said = [];
  a.on('state', (s) => said.push(s));
  a.on('end', (k, outcome, line) => said.push(`${k.id}:${outcome}:${line}`));
  assert.equal(a.begin('storm'), null);
  assert.equal(a.state, 'on');
  assert.deepEqual(storm.runs[0].from, { x: 5, z: 7, y: 0, yaw: 0 }, 'it is handed where you were');
  assert.equal(a.begin('storm'), "you're on one already · STORM", 'one at a time');
  assert.equal(a.view().objective, 'do storm');
  step(a, 3);
  storm.runs[0].outcome = { won: 'it blew over' };
  a.update(0.05);
  assert.equal(a.state, 'over');
  assert.deepEqual(a.view().outcome, 'won');
  step(a, CARD + 0.1);
  assert.equal(a.state, 'idle');
  assert.equal(storm.runs[0].disposed, 1, 'cleared away once the word on it has been up');
  assert.deepEqual(a.record.storm, { tries: 1, won: 1, best: 3 });
  assert.deepEqual(said, ['on', 'over', 'storm:won:it blew over', 'idle']);
  assert.equal(a.view(), null);
});

test("if you don't make it, you're set down where it began, under the blackout", () => {
  const body = you(10, 20);
  const a = new Adventures({ body });
  const fire = a.define(kind('fire'));
  a.begin('fire');
  body.at = { x: 90, z: 40, y: 3, yaw: 1 };
  a.hurt(40, 'singed');
  assert.equal(a.health, HEALTH - 40);
  a.hurt(70, 'caught in the fire');
  assert.equal(a.state, 'over');
  assert.equal(a.outcome, 'lost');
  assert.equal(a.line, "you didn't make it · caught in the fire");
  assert.equal(body.backs.length, 0, 'not straight away: the screen goes black first');
  step(a, 1.2);
  assert.deepEqual(body.backs, [{ x: 10, z: 20, y: 0, yaw: 0 }], 'back where it began');
  assert.equal(fire.runs[0].disposed, 1, 'and everything of it cleared away under the blackout');
  a.hurt(50);
  assert.equal(a.health, 0, 'nothing more hurts once it is over');
  step(a, CARD);
  assert.equal(a.state, 'idle');
  assert.equal(fire.runs[0].disposed, 1, 'cleared away once only');
  assert.deepEqual(a.record.fire, { tries: 1, won: 0, best: 0 });
});

test('hurt, you mend after a while; worn down, you don\'t', () => {
  const a = new Adventures({ body: you() });
  a.define(kind('bear'));
  a.begin('bear');
  const cries = [];
  a.on('hurt', (n, why) => cries.push([n, why]));
  a.hurt(30, 'mauled');
  step(a, 3);
  assert.equal(a.health, 70, 'not at once');
  step(a, 8);
  assert.ok(a.health > 70 && a.health <= HEALTH, `but in a while (${a.health})`);
  const was = a.health;
  for (let i = 0; i < 200; i++) {
    a.wear(0.01, 'the cold');
    a.update(0.05);
  }
  assert.ok(a.health < was, 'worn down a little at a time, with no mending in between');
  assert.deepEqual(cries, [[30, 'mauled']], 'and no cry for each little bit');
});

test('somewhere to go first: it begins when you get there, with where that was', () => {
  const body = you(0, 0);
  const a = new Adventures({ body, kit: { k: 1 } });
  const cave = a.define(kind('cave', { kind: { where: (kit, from) => ({ x: from.x + 200, z: 0, label: 'the cave', near: 12, cave: 'Owl Hollow', kit }) } }));
  const flat = a.define(kind('slide', { kind: { where: () => ({ none: 'no mountainside near here' }) } }));
  assert.equal(a.begin('slide'), 'no mountainside near here', 'nowhere near enough: it says why');
  assert.equal(a.state, 'idle');
  assert.equal(flat.runs.length, 0);
  assert.equal(a.begin('cave'), null);
  assert.equal(a.state, 'travel');
  assert.deepEqual(a.view().guide, { x: 200, z: 0, label: 'the cave' });
  assert.equal(a.view().objective, 'get to the cave');
  step(a, 1);
  assert.equal(cave.runs.length, 0, 'nothing yet');
  body.at = { x: 192, z: 3, y: 0, yaw: 0 };
  a.update(0.05);
  assert.equal(a.state, 'on');
  assert.equal(cave.runs[0].at.cave, 'Owl Hollow', 'handed where it sent you');
  assert.equal(a.home.x, 192, 'and it began where you got to');
});

test('given up, it is cleared away there and then', () => {
  const a = new Adventures({ body: you() });
  const t = a.define(kind('twister'));
  const ends = [];
  a.on('end', (k, outcome) => ends.push(outcome));
  assert.equal(a.abandon(), false, 'nothing to give up');
  a.begin('twister');
  assert.equal(a.abandon(), true);
  assert.equal(a.state, 'idle');
  assert.equal(t.runs[0].disposed, 1);
  assert.deepEqual(ends, ['left']);
  assert.deepEqual(a.record.twister, { tries: 1, won: 0, best: 0 });
});

test('a camp won stays a while for you to look round, then goes', () => {
  const a = new Adventures({ body: you() });
  let wanted = true;
  let afters = 0;
  const fort = a.define(kind('fort', { run: { linger: 60, after: () => (afters++, wanted) } }));
  a.begin('fort');
  fort.runs[0].outcome = { won: 'it is yours' };
  step(a, CARD + 0.2);
  assert.equal(a.state, 'idle');
  assert.equal(fort.runs[0].disposed, 0, 'still standing');
  step(a, 5);
  assert.ok(afters > 50);
  wanted = false;
  a.update(0.05);
  assert.equal(fort.runs[0].disposed, 1, 'gone once you are');
  // and starting another clears one still standing
  wanted = true;
  a.begin('fort');
  fort.runs[1].outcome = { won: 'again' };
  step(a, CARD + 0.2);
  a.begin('fort');
  assert.equal(fort.runs[1].disposed, 1);
});

test('your record is saved as [tries, won, best], and only that is taken back', () => {
  const a = new Adventures({ body: you() });
  a.record = { bear: { tries: 3, won: 2, best: 95 }, cave: { tries: 1, won: 0, best: 0 } };
  const saved = a.serialize();
  assert.deepEqual(saved, { bear: [3, 2, 95], cave: [1, 0, 0] });
  const b = new Adventures({ body: you() });
  b.load(validateRecord(JSON.parse(JSON.stringify(saved))));
  assert.deepEqual(b.record, a.record);
  assert.deepEqual(validateRecord({ bear: [1, 1, 2.7], bad: [1, 2], worse: 'x', neg: [-1, 0, 0], nan: [1, NaN, 1] }), { bear: [1, 1, 2] });
  assert.deepEqual(validateRecord(null), {});
  assert.deepEqual(validateRecord([1, 2]), {});
});

test('a kind needs an id, a title and a start, and its id is its own', () => {
  const a = new Adventures({ body: you() });
  assert.throws(() => a.define({ id: 'x', title: 'X' }), /needs an id, a title and start/);
  a.define(kind('x'));
  assert.throws(() => a.define(kind('x')), /already defined/);
  assert.match(a.begin('y'), /no such adventure: y/);
});

test('the board and the banner say it in a few words', () => {
  assert.equal(tally(undefined), 'not yet tried');
  assert.equal(tally({ tries: 2, won: 0, best: 0 }), 'tried 2 times');
  assert.equal(tally({ tries: 1, won: 0, best: 0 }), 'tried once');
  assert.equal(tally({ tries: 4, won: 1, best: 125 }), 'made it once · best 2:05');
  assert.equal(clock(61.9), '1:01');
  // the camera looks along -z with camYaw 0: ahead is -z
  assert.equal(arrowTo(0, -10, 0), '↑');
  assert.equal(arrowTo(10, 0, 0), '→');
  assert.equal(arrowTo(0, 10, 0), '↓');
  assert.equal(arrowTo(-10, -10, 0), '↖');
});

// ── Places ──────────────────────────────────────────────────────────────────

test('the slope of the ground, and which way is down', () => {
  const s = slopeAt((x, z) => 0.5 * x, 10, 3);
  assert.ok(near(s.slope, 0.5));
  assert.ok(near(s.ux, -1) && near(s.uz, 0), 'down is toward -x');
  assert.equal(slopeAt(() => 4, 0, 0).slope, 0);
});

test('the nearest water deep enough, looked for ring by ring', () => {
  // a pond 2 m deep, 20 m across, its middle at (100, 0)
  const depth = (x, z) => (Math.hypot(x - 100, z) < 10 ? 2 : -1);
  const w = findWater(depth, 0, 0, { far: 300, step: 5 });
  assert.ok(w && depth(w.x, w.z) >= 0.55, 'in it');
  assert.ok(w.d >= 90 && w.d <= 100, `at the nearest edge of it (${w.d})`);
  assert.equal(findWater(depth, 0, 0, { far: 60 }), null, 'not if it is too far');
  assert.equal(findWater(depth, 100, 0).d, 0, 'and you are in it already');
});

test('a mountainside: steep, with a run of steep ground above it', () => {
  // flat to x = 200, then a mountain rising steeply to the east
  const height = (x) => (x < 200 ? 0 : (x - 200) * 0.6);
  const s = findSlope(height, 0, 0, { far: 400, step: 20 });
  assert.ok(s, 'found');
  assert.ok(s.x > 200, `on the mountain (${s.x})`);
  assert.ok(s.ux < 0, 'down is back toward you');
  assert.equal(findSlope(() => 0, 0, 0, { far: 300 }), null, 'none on the flat');
  const here = findSlope((x) => x * 0.6, 0, 0);
  assert.deepEqual([here.x, here.z], [0, 0], 'where you stand, if it is steep enough there');
  assert.equal(findSlope(height, 0, 0, { far: 400, off: () => true }), null, 'not where it may not go');
});

test('a clearing for a camp: dry, flat, open, and clear of what to keep away from', () => {
  let n = 0;
  const rnd = () => ((n = (n * 9301 + 49297) % 233280), n / 233280);
  // a lake to the north, a steep bank to the east, woods to the west
  const look = {
    height: (x) => (x > 150 ? (x - 150) * 2 : 0),
    depth: (x, z) => (z < -120 ? 1 : -2),
    trees: (x) => (x < -100 ? 30 : 0),
    off: () => false,
  };
  const c = findClearing(look, 0, 0, { near: 170, far: 250, radius: 20, tries: 200, rnd });
  assert.ok(c, 'found');
  const d = Math.hypot(c.x, c.z);
  assert.ok(d >= 170 && d <= 250, `in reach (${d})`);
  assert.ok(c.z >= -120 + 20 && c.x <= 150 && c.x >= -100, `dry, flat and open (${c.x}, ${c.z})`);
  assert.ok(near(c.yaw, Math.atan2(-c.x, -c.z)), 'its gate facing you');
  assert.equal(findClearing({ ...look, keep: () => true }, 0, 0, { rnd }), null, 'nowhere, if everywhere is to be kept clear');
  assert.equal(nearest([{ x: 5, z: 0, n: 1 }, { x: 2, z: 0, n: 2 }], 0, 0).n, 2);
  assert.equal(nearest([], 0, 0), null);
});

test('the stockade stops a shot, but not one over the top of it or past its end', () => {
  const walls = [{ ax: 10, az: -5, bx: 10, bz: 5, bottom: 0, top: 3 }];
  const level = { x: 1, y: 0, z: 0 };
  assert.ok(near(rayWalls(walls, { x: 0, y: 1.5, z: 0 }, level), 10));
  assert.equal(rayWalls(walls, { x: 0, y: 4, z: 0 }, level), null, 'over it');
  assert.equal(rayWalls(walls, { x: 0, y: 1.5, z: 8 }, level), null, 'past its end');
  assert.equal(rayWalls(walls, { x: 0, y: 1.5, z: 0 }, level, 9), null, 'out of range');
  assert.equal(rayWalls(walls, { x: 0, y: 1.5, z: 0 }, { x: -1, y: 0, z: 0 }), null, 'behind you');
  const up = { x: 0.6, y: 0.8, z: 0 };
  assert.equal(rayWalls(walls, { x: 0, y: 1.5, z: 0 }, up), null, 'aimed up over it');
});

// ── Something with teeth ────────────────────────────────────────────────────

// A prowler on flat open ground, and you standing at (0, 0) looking along `facing`.
function prowling(kind, x, z, { facing = { x: 0, z: -1 }, fire = null, asleep = false, speed = 0 } = {}) {
  const mauls = [];
  const world = {
    ctx: { dt: 0, ground: () => 0, blocked: () => null, pushOut() {}, call() {} },
    you: () => ({ x: 0, z: 0, y: 0, speed, facing }),
    fire: () => fire,
    maul: (n, dir, why) => mauls.push({ n, why }),
    say() {},
  };
  const p = new Prowler(kind, x, z, world, { asleep });
  return { p, mauls, run: (seconds) => {
    for (let t = 0; t < seconds && !mauls.length; t += 0.05) p.update(0.05);
  } };
}

test('a bear charges, mauls you, and backs off', () => {
  const { p, mauls, run } = prowling('bear', 40, 0);
  p._set('charge');
  run(15);
  assert.equal(mauls.length, 1, 'it got you');
  assert.deepEqual(mauls[0], { n: 30, why: 'mauled by the bear' });
  assert.equal(p.mind, 'back');
});

test('a lion only comes from behind: face it, and it turns away', () => {
  const faced = prowling('cougar', 0, -30, { facing: { x: 0, z: -1 } });
  faced.p._set('charge');
  faced.run(6);
  assert.equal(faced.mauls.length, 0, 'not while you look at it');
  assert.equal(faced.p.mind, 'back');
  const behind = prowling('cougar', 0, 30, { facing: { x: 0, z: -1 } });
  behind.p._set('charge');
  behind.run(6);
  assert.equal(behind.mauls.length, 1, 'but from behind it gets you');
});

test('neither comes near a burning fire', () => {
  const { p, mauls, run } = prowling('bear', 40, 0, { fire: { x: 0, z: 0 } });
  p._set('charge');
  run(8);
  assert.equal(mauls.length, 0);
  assert.ok(Math.hypot(p.x, p.z) > 10, `it keeps off (${Math.hypot(p.x, p.z).toFixed(1)} m)`);
});

test('asleep, it wakes if you come too close, and it takes three good hits to bring a bear down', () => {
  const far = prowling('bear', 15, 0, { asleep: true, speed: 1.2 });
  far.run(2);
  assert.equal(far.p.mind, 'sleep', 'creep past at a distance');
  const near = prowling('bear', 3, 0, { asleep: true });
  near.run(0.1);
  assert.equal(near.p.mind, 'charge', 'too close and it is up');
  const loud = prowling('bear', 8, 0, { asleep: true, speed: 6 });
  loud.run(0.1);
  assert.equal(loud.p.mind, 'charge', 'running past it wakes it');
  assert.equal(near.p.shot(), 'hurt');
  assert.equal(near.p.shot(), 'hurt');
  assert.equal(near.p.shot(), 'down');
  assert.ok(near.p.down);
  assert.equal(near.p.shot(), 'down', 'and stays down');
});
