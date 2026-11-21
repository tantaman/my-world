// Fishing: what bites where and when, and the line, from the cast to a fish
// caught or lost. In Node, with the dice loaded where it matters.

import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH } from '../src/underwater/fish.js';
import { BITE, CATCHABLE, hourly, deepness, biteRate, whatBites, sized, describe, nameOf } from '../src/fishing/catch.js';
import { Line, LINE } from '../src/fishing/line.js';

// A run of numbers 0..1 that is the same every time.
function dice(seed = 1) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

test('minnows are too small to take a hook; the rest of the fish can be caught', () => {
  assert.ok(!CATCHABLE.includes('minnow'));
  for (const kind of ['perch', 'trout', 'pike', 'herring', 'mackerel', 'bass']) assert.ok(CATCHABLE.includes(kind), kind);
});

test('fish feed best at dawn and dusk, less at midday, least at night', () => {
  assert.ok(hourly(6.5) > hourly(13));
  assert.ok(hourly(19.5) > hourly(13));
  assert.ok(hourly(13) > hourly(1));
  // and better in deeper water, up to a few metres
  assert.ok(deepness(0.4) < deepness(1.5) && deepness(1.5) < deepness(3));
  assert.equal(deepness(3), deepness(30));
  // a school under the float makes a bite come sooner
  const here = { depth: 3, hour: 13 };
  assert.ok(Math.abs(biteRate({ ...here, school: true }) / biteRate(here) - BITE.schoolFaster) < 1e-9);
  assert.ok(1 / biteRate({ depth: 3, hour: 6.5 }) < 20, 'at dawn in deep water, a bite every quarter of a minute or so');
});

test('the sea’s fish are caught in the sea, and fresh water’s in fresh', () => {
  const roll = dice(7);
  for (let i = 0; i < 200; i++) {
    const sea = i % 2 === 0;
    const f = whatBites({ sea, depth: 4, rand: roll });
    assert.equal(FISH[f.kind].sea, sea, `${f.kind} in ${sea ? 'the sea' : 'a lake'}`);
  }
});

test('a school under the float is most likely what takes the bait', () => {
  const roll = dice(11);
  let pike = 0;
  for (let i = 0; i < 400; i++) if (whatBites({ sea: false, depth: 4, school: 'pike', rand: roll }).kind === 'pike') pike++;
  assert.ok(pike / 400 > BITE.schoolTakes * 0.9, `${pike} of 400 were pike`);
  // ...but not a school of minnows, nor the sea's fish in a lake
  const minnows = whatBites({ sea: false, depth: 4, school: 'minnow', rand: dice(3) });
  assert.notEqual(minnows.kind, 'minnow');
  const herring = whatBites({ sea: false, depth: 4, school: 'herring', rand: () => 0 });
  assert.equal(FISH[herring.kind].sea, false);
});

test('a fish is its kind’s size, now and then bigger, and pulls by its size', () => {
  const roll = dice(5);
  let big = 0;
  for (let i = 0; i < 500; i++) {
    const f = sized('trout', roll);
    const [lo, hi] = FISH.trout.len;
    assert.ok(f.len >= lo - 0.01 && f.len <= hi * 1.31, `${f.len} m`);
    if (f.len > hi + 0.005) big++;
    assert.ok(f.strength >= 0.5 && f.strength <= 2.6);
    assert.ok(Math.abs(f.kg - BITE.kg * f.len ** 3) < 0.01);
  }
  assert.ok(big > 0 && big < 70, `an old one now and then (${big} of 500)`);
  assert.ok(sized('pike', () => 0.9).strength > sized('perch', () => 0.9).strength, 'a pike pulls harder than a perch');
});

test('a catch is told as what it is, how long and how heavy', () => {
  assert.equal(nameOf('trout'), 'a brown trout');
  assert.equal(nameOf('perch'), 'a yellow perch');
  assert.equal(nameOf('herring'), 'a herring');
  assert.equal(describe({ name: 'a brown trout', len: 0.384, kg: 0.51 }), 'a brown trout, 38 cm (510 g)');
  assert.equal(describe({ name: 'a northern pike', len: 0.9, kg: 6.56 }), 'a northern pike, 90 cm (6.6 kg)');
});

// ── The line ────────────────────────────────────────────────────────────────
const YOU = { x: 0, z: 0 };

// A line cast 12 m out, where fish bite at `rate` and it's `fish` that does.
function cast(fish, { rate = 1, seed = 1 } = {}) {
  const line = new Line({ rand: dice(seed) });
  const heard = [];
  for (const e of ['splash', 'nibble', 'bite', 'early', 'missed', 'hooked', 'run', 'snapped', 'freed', 'caught', 'in']) line.on(e, () => heard.push(e));
  line.cast(0, 0, 12, 0, { rate, bite: () => ({ ...fish }) });
  return { line, heard };
}
const PERCH = { kind: 'perch', name: 'a yellow perch', len: 0.25, kg: 0.14, strength: 0.71 };
const PIKE = { kind: 'pike', name: 'a northern pike', len: 0.85, kg: 5.5, strength: 2.43 };
const wait = (line, until, you = YOU, s = 120) => {
  for (let t = 0; t < s && !until(); t += 1 / 30) line.update(1 / 30, you);
};

test('cast out, the float lands, a fish nibbles, then bites, and is hooked on the strike', () => {
  const { line, heard } = cast(PERCH);
  assert.equal(line.state, 'flying');
  line.update(LINE.flight + 0.01, YOU);
  assert.equal(line.state, 'waiting');
  assert.deepEqual(heard, ['splash']);
  wait(line, () => line.state === 'biting');
  assert.equal(line.state, 'biting');
  assert.equal(heard.at(-1), 'bite');
  assert.equal(line.strike(), 'hooked');
  assert.equal(line.state, 'hooked');
  assert.equal(line.fish.kind, 'perch');
});

test('strike at a nibble and it’s gone; too slow, and it lets go', () => {
  const { line, heard } = cast(PERCH, { seed: 3 });
  wait(line, () => heard.includes('nibble'));
  assert.ok(heard.includes('nibble'), 'a nibble, first');
  assert.equal(line.strike(), 'early');
  assert.equal(line.state, 'waiting');
  // nothing there: a strike does nothing
  assert.equal(line.strike(), null);
  wait(line, () => line.state === 'biting');
  line.update(LINE.window + 0.05, YOU);
  assert.equal(heard.at(-1), 'missed');
  assert.equal(line.state, 'waiting');
});

// Play a hooked fish in: `careful` lets go while it runs and when the line
// strains; otherwise reel the whole time. -> what came of it
function play(fish, careful, seed) {
  const { line, heard } = cast(fish, { seed });
  wait(line, () => line.state === 'biting');
  line.strike();
  for (let t = 0; t < 180 && line.state === 'hooked'; t += 1 / 30) {
    const reel = careful ? line.run <= 0 && line.tension < 0.7 : true;
    line.update(1 / 30, YOU, reel);
  }
  return heard.at(-1);
}

test('played carefully, a fish comes in; reeled into its runs, a big one snaps the line', () => {
  for (let seed = 1; seed <= 12; seed++) {
    assert.equal(play(PERCH, true, seed), 'caught', `a perch (${seed})`);
    assert.equal(play(PIKE, true, seed), 'caught', `a pike, with patience (${seed})`);
    assert.equal(play(PIKE, false, seed), 'snapped', `a pike, rushed (${seed})`);
  }
  // a little one can just about be cranked in, often enough
  let perch = 0;
  for (let seed = 1; seed <= 20; seed++) if (play(PERCH, false, seed) === 'caught') perch++;
  assert.ok(perch >= 5, `a perch, rushed, came in ${perch} times of 20`);
});

test('reeled in, wandered off from, or put down: the line comes in', () => {
  const a = cast(PERCH);
  a.line.update(LINE.flight + 0.01, YOU);
  a.line.reelIn();
  wait(a.line, () => a.line.state === 'idle');
  assert.equal(a.heard.at(-1), 'in');
  // you paddle off, further than the line goes
  const b = cast(PERCH, { rate: 1e-4 });
  b.line.update(LINE.flight + 0.01, YOU);
  wait(b.line, () => b.line.state === 'idle', { x: -LINE.slack, z: 0 });
  assert.equal(b.heard.at(-1), 'in');
  // a fish on, and you let it go
  const c = cast(PERCH);
  wait(c.line, () => c.line.state === 'biting');
  c.line.strike();
  c.line.reelIn();
  assert.ok(c.heard.includes('freed'));
  const d = cast(PERCH);
  wait(d.line, () => d.line.state === 'biting');
  d.line.strike();
  d.line.drop();
  assert.equal(d.line.state, 'idle');
  assert.equal(d.heard.at(-1), 'freed');
});
