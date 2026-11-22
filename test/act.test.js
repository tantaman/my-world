// Acting on what's at hand: one key, and it does the nearest thing that has
// something to be done, what you're in or on first.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Offers } from '../src/act/offers.js';

test('the key does the nearest thing at hand', () => {
  const offers = new Offers();
  const done = [];
  let boat = 2;
  let car = 1.2;
  offers.offer({ id: 'boat', at: () => (boat === null ? null : { d: boat, word: 'get in', run: () => done.push('boat') }) });
  offers.offer({ id: 'car', at: () => (car === null ? null : { d: car, word: 'get in', run: () => done.push('car') }) });
  assert.equal(offers.here().id, 'car');
  assert.ok(offers.press());
  assert.deepEqual(done, ['car']);
  // in the boat now: it's 0 m away, and comes first
  boat = 0;
  assert.equal(offers.here().id, 'boat');
  assert.equal(offers.here().word, 'get in');
  // nothing at hand: nothing done
  boat = null;
  car = null;
  assert.equal(offers.here(), null);
  assert.equal(offers.press(), false);
  assert.deepEqual(done, ['car']);
});

test('of two as near, the one offered first', () => {
  const offers = new Offers();
  offers.offer({ id: 'a', at: () => ({ d: 1, word: 'a', run() {} }) });
  offers.offer({ id: 'b', at: () => ({ d: 1, word: 'b', run() {} }) });
  assert.equal(offers.here().id, 'a');
});

test('an offer needs a name of its own, and something to do', () => {
  const offers = new Offers();
  offers.offer({ id: 'a', at: () => null });
  assert.throws(() => offers.offer({ id: 'a', at: () => null }), /already/);
  assert.throws(() => offers.offer({ id: 'b' }), /at\(\)/);
  offers.offer({ id: 'c', at: () => ({ d: 0, word: 'broken' }) });
  assert.equal(offers.here(), null, 'one with nothing to run is passed over');
});

test('held down, it does what is done by holding it', () => {
  const offers = new Offers();
  let calm = 0;
  let near = true;
  offers.offer({ id: 'wild', at: () => (near ? { d: 2, word: 'calm', run() {}, hold: (dt) => (calm += dt) } : null) });
  offers.offer({ id: 'boat', at: () => ({ d: 3, word: 'get in', run() {} }) });
  assert.ok(offers.hold(0.5));
  assert.equal(calm, 0.5);
  near = false;
  assert.equal(offers.hold(0.5), false, 'the nearest now is pressed, not held');
  assert.equal(calm, 0.5);
});
