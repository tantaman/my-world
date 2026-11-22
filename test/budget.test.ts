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
