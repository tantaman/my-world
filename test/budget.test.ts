// Work that can wait shares one allowance a frame (src/game/budget.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Budget, type Job } from '../src/game/budget.ts';
import { Game } from '../src/game/game.ts';

// A clock the jobs wind on themselves, so a test says exactly what each took.
function bench() {
  let now = 0;
  const budget = new Budget({ clock: () => now });
  // A job with `todo` ms of work in it, that does as much as it's given.
  const job = (name: string, todo: number, log: string[] = []): Job & { left: number; given: number[] } => {
    const j = {
      name,
      left: todo,
      given: [] as number[],
      work(ms: number) {
        j.given.push(ms);
        log.push(name);
        const did = Math.min(ms, j.left);
        now += did;
        j.left -= did;
        return j.left > 0;
      },
    };
    return j;
  };
  return { budget, job, spend: (ms: number) => (now += ms) };
}

test('one job with a lot to do gets the whole allowance, and no more', () => {
  const { budget, job } = bench();
  const towns = job('towns', 100);
  budget.add(towns);
  budget.run();
  assert.equal(budget.spent, budget.usual);
  assert.equal(towns.left, 100 - budget.usual);
  budget.run(true);
  assert.equal(budget.spent, budget.roomy, 'with nothing being drawn there is more to spare');
});

test('several busy at once share it, rather than each taking its own', () => {
  const { budget, job } = bench();
  const jobs = ['towns', 'stores', 'tracks', 'lines'].map((n) => job(n, 100));
  for (const j of jobs) budget.add(j);
  budget.run();
  assert.equal(budget.spent, budget.usual, 'four of them cost a frame what one did');
  for (const j of jobs) assert.equal(100 - j.left, budget.usual / 4, `${j.name} had its share`);
  assert.deepEqual(Object.keys(budget.by).sort(), ['lines', 'stores', 'towns', 'tracks']);
});

test('what one job leaves, the others have', () => {
  const { budget, job } = bench();
  const quick = job('quick', 0.5);
  const long = job('long', 100);
  budget.add(quick);
  budget.add(long);
  budget.run();
  assert.equal(quick.left, 0);
  assert.equal(100 - long.left, budget.usual - 0.5);
});

test('a different job goes first each frame', () => {
  const { budget, job } = bench();
  const log: string[] = [];
  for (const n of ['a', 'b', 'c']) budget.add(job(n, 1000, log));
  const firsts = [];
  for (let i = 0; i < 3; i++) {
    log.length = 0;
    budget.run();
    firsts.push(log[0]);
  }
  assert.deepEqual(firsts.sort(), ['a', 'b', 'c']);
});

test('a job with nothing to do costs one call; one waiting on something is not asked over and over', () => {
  const { budget } = bench();
  let idle = 0;
  let waiting = 0;
  budget.add({ name: 'idle', work: () => void idle++ });
  budget.add({ name: 'waiting', work: () => (waiting++, true) }); // more to do, but it did nothing with its slice
  budget.run();
  assert.equal(idle, 1);
  assert.equal(waiting, 1);
  assert.equal(budget.spent, 0);
});

test('a step that runs long is made up for in the frames after it', () => {
  const { budget, spend } = bench();
  let calls = 0;
  // every step of it takes 18 ms, whatever it is given
  budget.add({ name: 'slow', work: () => (calls++, spend(18), true) });
  budget.run();
  assert.equal(calls, 1);
  assert.equal(budget.spent, 18);
  assert.equal(budget.owed, 18 - budget.usual);
  // the next frames do nothing while what it went over by is being made up
  budget.run();
  assert.equal(calls, 1);
  assert.equal(budget.spent, 0);
  // ...so over a few seconds the frames give what they promised, and no more
  let spent = 18;
  const FRAMES = 200;
  for (let i = 2; i < FRAMES; i++) {
    budget.run();
    spent += budget.spent;
  }
  assert.ok(spent <= FRAMES * budget.usual + 18, `${spent} ms in ${FRAMES} frames`);
  assert.ok(spent >= FRAMES * budget.usual - 18, 'and no less: it is slower, not stopped');
});

test('a frame that owes a little does a little less', () => {
  const { budget, job, spend } = bench();
  let first = true;
  budget.add({ name: 'once', work: () => (first ? ((first = false), spend(budget.usual + 1.5), false) : false) });
  const steady = job('steady', 100);
  budget.add(steady);
  budget.run(); // (whichever goes first, the frame ends 1.5 ms over, or exactly spent)
  const owed = budget.owed;
  const before = steady.left;
  budget.run();
  assert.ok(Math.abs(before - steady.left - (budget.usual - owed)) < 1e-9, 'the frame after has what is left of its allowance');
  assert.equal(budget.owed, 0);
});

test('a job the others are waiting on goes first, and has most of the frame', () => {
  const { budget, job } = bench();
  const log: string[] = [];
  const roads = job('roads', 100, log);
  const tracks = job('tracks', 100, log);
  // the pier: 5 ms of looking, and every road waits on it until it's found
  const pier = job('pier', 5, log);
  budget.add(roads);
  budget.add(tracks);
  budget.add({ name: 'pier', work: (ms) => pier.work(ms), pressing: () => pier.left > 0 });
  budget.run();
  assert.equal(log[0], 'pier', 'before the others, whoever\'s turn it was');
  assert.equal(budget.by.pier, budget.usual * 0.75, 'three quarters of the allowance, not a third of it');
  assert.equal(budget.by.roads + budget.by.tracks, budget.usual * 0.25, 'and the others have the rest');
  assert.equal(budget.spent, budget.usual);
  // once it's found (nobody is waiting on it any more) it's a job like any other
  budget.run();
  assert.equal(pier.left, 0);
  budget.run();
  assert.equal(budget.by.roads, budget.usual / 2);
});

test('a job the others are waiting on that is itself waiting leaves the frame to them', () => {
  const { budget, job } = bench();
  const roads = job('roads', 100);
  let asked = 0;
  budget.add({ name: 'pier', work: () => (asked++, true), pressing: () => true }); // more to do, but it did nothing with its time
  budget.add(roads);
  budget.run();
  assert.equal(asked, 1);
  assert.equal(100 - roads.left, budget.usual);
});

test('a job nobody is waiting for has only what the others leave', () => {
  const { budget, job } = bench();
  const roads = job('roads', budget.usual * 2.5);
  const far = job('far airfields', 100);
  budget.add({ name: 'far airfields', work: (ms) => far.work(ms), idle: () => true });
  budget.add(roads);
  budget.run();
  budget.run();
  assert.equal(far.left, 100, 'nothing, while the roads are busy');
  budget.run();
  assert.equal(roads.left, 0);
  assert.equal(100 - far.left, budget.usual / 2, 'what they left of the frame they finished in');
  budget.run();
  assert.equal(100 - far.left, budget.usual * 1.5, 'and all of it once they are done');
});

test('a job that keeps throwing is stopped, and the rest carry on', (t) => {
  t.mock.method(console, 'error', () => {});
  const { budget, job } = bench();
  const good = job('good', 100);
  budget.add({
    name: 'bad',
    work() {
      throw new Error('no');
    },
  });
  budget.add(good);
  for (let i = 0; i < 6; i++) budget.run();
  assert.deepEqual(budget.names, ['good']);
  assert.equal(good.left, 100 - 6 * budget.usual);
});

test('a job can be taken off again, and two cannot share a name', () => {
  const { budget, job } = bench();
  const off = budget.add(job('towns', 10));
  assert.throws(() => budget.add(job('towns', 10)), /two jobs are called "towns"/);
  off();
  assert.deepEqual(budget.names, []);
});

test('the game runs it once a frame, after the world has caught up', () => {
  const game = new Game();
  const order: string[] = [];
  game.addSystem({ name: 'streaming', phase: 'world', update: () => void order.push('world') });
  game.addSystem({ name: 'sound', phase: 'audio', update: () => void order.push('audio') });
  game.budget.add({ name: 'search', work: () => void order.push('budget') });
  game.tick(16);
  assert.deepEqual(order, ['world', 'budget', 'audio']);
});
