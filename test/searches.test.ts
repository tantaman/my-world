// Answers worked out once, a little at a time or all at once (src/core/searches.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Searches } from '../src/core/searches.ts';

// A clock the searches wind on themselves: each step of one takes a millisecond.
function bench() {
  let now = 0;
  const steps: string[] = [];
  const clock = () => now;
  // a search of n steps, whose answer is its key in capitals
  function* slow(key: string, n: number) {
    for (let i = 0; i < n; i++) {
      steps.push(key);
      now += 1;
      yield;
    }
    return key.toUpperCase();
  }
  return { clock, steps, slow, spend: (ms: number) => (now += ms) };
}

test('get runs a search to its end, and keeps the answer', () => {
  const { clock, slow, steps } = bench();
  const s = new Searches<string, number>({ grow: (key, n) => slow(key, n), clock });
  assert.equal(s.get('a', 5), 'A');
  assert.equal(steps.length, 5);
  assert.equal(s.get('a', 5), 'A');
  assert.equal(steps.length, 5, 'worked out once');
  assert.ok(s.has('a'));
});

test('peek says what is known, and puts the rest in line for pump', () => {
  const { clock, slow } = bench();
  const s = new Searches<string, number>({ grow: (key, n) => slow(key, n), clock });
  assert.equal(s.peek('a', 3), undefined);
  assert.equal(s.peek('b', 3), undefined);
  assert.equal(s.peek('c', 3, false), undefined, 'asked not to ask');
  assert.equal(s.size, 2);
  assert.equal(s.pump(4), 1, 'a is found, b begun');
  assert.equal(s.peek('a', 3), 'A');
  assert.equal(s.peek('b', 3), undefined);
  assert.equal(s.pump(10), 0);
  assert.equal(s.peek('b', 3), 'B');
});

test('a search begun in pump is finished by get from where it had got to', () => {
  const { clock, slow, steps } = bench();
  const s = new Searches<string, number>({ grow: (key, n) => slow(key, n), clock });
  s.ask('a', 6);
  s.pump(2);
  const done = steps.length;
  assert.ok(done > 0 && done < 6);
  assert.equal(s.get('a', 6), 'A');
  assert.equal(steps.length, 6, 'not begun again');
  assert.equal(s.size, 0);
});

test('an answer that needs no search is just the answer, null included', () => {
  const found: Array<[string, string | null]> = [];
  const s = new Searches<string | null>({ grow: (key) => (key === 'none' ? null : key.toUpperCase()), found: (k, a) => void found.push([k, a]) });
  assert.equal(s.get('none', undefined), null);
  assert.equal(s.peek('none', undefined), null, 'nothing there is an answer, not a question');
  s.ask('a', undefined);
  assert.equal(s.pump(1), 0);
  assert.equal(s.peek('a', undefined), 'A');
  assert.deepEqual(found, [['none', null], ['a', 'A']], 'each is told once, as it is found');
  assert.equal(s.set('b', 'said'), 'said');
  assert.equal(s.get('b', undefined), 'said');
});

test('a search that is waiting on something is left, and the others gone on with', () => {
  const { clock, slow } = bench();
  let surveyed = false;
  const calls = { waiting: 0 };
  const s = new Searches<string, number>({
    *grow(key, n) {
      if (key === 'waits') {
        while (s.patient && !surveyed) {
          calls.waiting++;
          yield 'wait';
        }
        return 'WAITED';
      }
      return yield* slow(key, n);
    },
    clock,
  });
  s.ask('waits', 0);
  s.ask('b', 2);
  s.ask('c', 2);
  assert.equal(s.pump(50), 1, 'b and c are done while it waits');
  assert.equal(calls.waiting, 1, 'asked once, not over and over until the time ran out');
  assert.equal(s.pump(50), 1);
  assert.equal(calls.waiting, 2);
  surveyed = true;
  assert.equal(s.pump(50), 0);
  assert.equal(s.peek('waits', 0), 'WAITED');
});

test('wanted outright, a search does not wait', () => {
  const s = new Searches<string>({
    *grow() {
      while (s.patient) yield 'wait';
      return 'now';
    },
  });
  s.ask('a', undefined);
  s.pump(5);
  assert.equal(s.size, 1);
  assert.equal(s.get('a', undefined), 'now');
  assert.ok(s.patient, 'and is patient again afterwards');
});

test('what was asked for most lately is looked for first; what is asked for together, in the order asked', () => {
  const { clock, slow, steps } = bench();
  const s = new Searches<string, number>({ grow: (key, n) => slow(key, n), clock });
  // a map scrolled across a while ago left these...
  for (const k of ['far1', 'far2', 'far3']) s.ask(k, 4);
  s.pump(1); // (the first of them begun: two of its four steps)
  assert.deepEqual(steps, ['far1', 'far1']);
  // ...and now what's round you is asked for, nearest first
  for (const k of ['near1', 'near2']) s.ask(k, 2);
  steps.length = 0;
  s.pump(3);
  assert.deepEqual(steps, ['near1', 'near1', 'near2', 'near2'], 'those first, in the order they were asked for');
  // asked for again, something from before goes ahead of the rest of it
  s.peek('far3', 4);
  steps.length = 0;
  assert.equal(s.pump(100), 0, 'and nothing is dropped: all of it is found in the end');
  assert.deepEqual(steps, ['far3', 'far3', 'far3', 'far3', 'far1', 'far1', 'far2', 'far2', 'far2', 'far2'], 'far1 from where it had got to');
  assert.equal(s.peek('far1', 4), 'FAR1');
});

test('asking again for something in line does not put it in twice, nor ahead of what it was asked with', () => {
  const { clock, slow, steps } = bench();
  const s = new Searches<string, number>({ grow: (key, n) => slow(key, n), clock });
  for (let round = 0; round < 3; round++) for (const k of ['a', 'b', 'c']) s.peek(k, 1);
  assert.equal(s.size, 3);
  s.pump(100);
  assert.deepEqual(steps, ['a', 'b', 'c']);
});

test('pump stops when its time is up, mid-search', () => {
  const { clock, slow, steps } = bench();
  const s = new Searches<string, number>({ grow: (key, n) => slow(key, n), clock });
  for (const k of ['a', 'b', 'c']) s.ask(k, 10);
  s.pump(4);
  assert.ok(steps.length >= 4 && steps.length <= 6, `about four steps (${steps.length})`);
  assert.equal(s.size, 3);
});
