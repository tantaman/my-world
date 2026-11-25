// Skateboarding: the physics of rolling on the tarmac, on ground made up for
// the purpose, and the judging and naming of what you did in the air.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Skater, PUSH, JETS, rolls, setsOff } from '../src/skateboarding/skater.js';
import { bail, nameOf, score, counts, LAND } from '../src/skateboarding/tricks.js';
import { Session, LINE } from '../src/skateboarding/session.js';

// Tarmac everywhere, falling away to +z at `slope` (rise over run), unless
// told otherwise: `surface(x, z)`, `height(x, z, reach)`, `hit(...)`.
const ground = ({ slope = 0, surface = () => 'tarmac', height = null, hit = () => false } = {}) => ({
  at(x, z, reach, out) {
    out.y = height ? height(x, z, reach) : -slope * z;
    out.surface = surface(x, z);
    out.what = out.surface === 'ground' ? 'the grass' : '';
    out.water = 0;
    return out;
  },
  hit,
});
const idle = { push: false, brake: 0, steer: 0, crouch: false, pop: false, flip: 0, shove: false, jets: 0 };
// Ride for `secs`, with controls that can change as it goes; what happened.
function ride(sk, secs, ctl = () => idle, dt = 1 / 60) {
  const events = [];
  for (const e of ['push', 'takeoff', 'land', 'touch', 'crash', 'up', 'off', 'brush']) sk.on(e, (...a) => events.push([e, ...a]));
  for (let t = 0; t < secs; t += dt) sk.step(dt, { ...idle, ...ctl(t, sk) });
  return events;
}
const named = (events, e) => events.filter((x) => x[0] === e);
// An ollie at speed v, with `air(t)` the controls once in the air (t: s since the pop).
function ollie(air = () => ({}), v = 4, extra = {}) {
  const sk = new Skater(ground(extra));
  sk.start(0, 0, 0, v);
  const events = ride(sk, 2.5, (t) => (t < 1 / 60 ? { pop: true } : air(t - 1 / 60)));
  return { sk, events, land: named(events, 'land')[0]?.[1], crash: named(events, 'crash')[0] };
}

test('pushing gets you going on the flat, to about a run and no faster; let go, and you roll on a long way', () => {
  const sk = new Skater(ground());
  sk.start(0, 0, 0);
  const events = ride(sk, 12, () => ({ push: true }));
  assert.ok(sk.v > 4 && sk.v <= PUSH.top, `pushing on (${sk.v.toFixed(2)} m/s)`);
  assert.ok(named(events, 'push').length > 10, `a foot down for each push (${named(events, 'push').length})`);
  const from = sk.z;
  ride(sk, 60);
  assert.equal(sk.v, 0, 'you roll to a stop in the end');
  assert.ok(sk.z - from > 30, `but a good way first (${(sk.z - from).toFixed(0)} m)`);
  assert.equal(sk.pushing, false, 'both feet back on the board');
});

test('down a hill you pick up speed, faster crouched, and the air holds you to something sensible', () => {
  const sk = new Skater(ground({ slope: 0.1 }));
  sk.start(0, 0, 0, 1);
  ride(sk, 60);
  const top = sk.v;
  assert.ok(top > 9 && top < 14, `down a road as steep as a road gets (${(top * 3.6).toFixed(0)} km/h)`);
  ride(sk, 40, () => ({ crouch: true }));
  assert.ok(sk.v > top + 2, `crouched, faster (${(sk.v * 3.6).toFixed(0)} km/h)`);
  assert.ok(sk.grounded && Math.abs(sk.y + 0.1 * sk.z) < 0.01, 'and on the ground all the way');
  // pointed up it, you slow, stop, and roll back down backwards: fakie
  const up = new Skater(ground({ slope: 0.1 }));
  up.start(0, 0, Math.PI, 3);
  ride(up, 6);
  assert.ok(up.fakie, 'rolling back down it, you ride fakie');
  assert.ok(up.vz > 0.5, 'down the hill');
});

test('the jets on your back push you on past any hill, faster crouched, and the foot comes back on the board', () => {
  const sk = new Skater(ground());
  sk.start(0, 0, 0);
  ride(sk, 40, () => ({ push: true, jets: 1 }));
  const standing = sk.v;
  assert.ok(standing > 3 * PUSH.top, `standing up, far past what a foot can do (${(standing * 3.6).toFixed(0)} km/h, where a push does ${(PUSH.top * 3.6).toFixed(0)})`);
  assert.equal(sk.pushing, false, 'and the foot back on the board: there is nothing it could add');
  assert.equal(sk.jets, 1, 'the jets full on');
  ride(sk, 40, () => ({ push: true, jets: 1, crouch: true }));
  assert.ok(sk.v > standing + 5, `crouched down out of the wind, faster still (${(sk.v * 3.6).toFixed(0)} km/h)`);
  assert.ok(sk.v < 40, `though the air still holds them to something (${(sk.v * 3.6).toFixed(0)} km/h)`);
  assert.ok(sk.grounded && sk.down < 0, 'and the wheels on the ground the whole way');
  // let go, and the air has it off you again
  ride(sk, 30);
  assert.equal(sk.jets, 0, 'let go, and nothing is pushing you');
  assert.ok(sk.v < standing / 2, `the air taking most of it back (${(sk.v * 3.6).toFixed(0)} km/h)`);
});

test('the jets push the way the board goes: round a carve, and never fakie', () => {
  const sk = new Skater(ground());
  sk.start(0, 0, 0, 2);
  ride(sk, 3, () => ({ push: true, jets: 1, steer: 1 }));
  assert.ok(sk.heading < -0.5, `carving under them turns you round (${sk.heading.toFixed(2)} rad)`);
  assert.ok(Math.abs(Math.hypot(sk.vx, sk.vz) - sk.v) < 1e-9, 'and you go where the board points, as ever');
  // rolling backwards, the jets on your back turn you round first, as a kick does
  const back = new Skater(ground());
  back.start(0, 0, 0, 2);
  back.face = Math.PI;
  assert.ok(back.fakie, 'riding fakie');
  ride(back, 1, () => ({ push: true, jets: 1 }));
  assert.equal(back.fakie, false, 'the jets turn you round to face the way you are going');
});

test('the jets burn on in the air, carrying you a little further over a gap', () => {
  const gap = (jets) => {
    const sk = new Skater(ground());
    sk.start(0, 0, 0, 20);
    let from = 0;
    let to = 0;
    sk.on('takeoff', () => (from = sk.z));
    sk.on('land', () => (to = to || sk.z));
    const events = ride(sk, 3, (t) => (t < 1 / 60 ? { pop: true, jets } : { jets }));
    assert.deepEqual(named(events, 'crash'), [], 'landed it');
    return to - from;
  };
  const off = gap(0);
  const held = gap(1);
  assert.ok(off > 10, `an ollie at that speed goes a long way anyway (${off.toFixed(1)} m)`);
  assert.ok(held > off + 0.5, `and further with them held (${held.toFixed(1)} m, at ${JETS} m/s²)`);
});

test('steering carves you round; braking drags a foot, or slides the board out at speed', () => {
  const sk = new Skater(ground());
  sk.start(0, 0, 0, 6);
  ride(sk, 1, () => ({ steer: 1 }));
  assert.ok(sk.heading < -0.5, `steering right turns you right (${sk.heading.toFixed(2)})`);
  assert.ok(sk.v > 5, 'and carving keeps your speed');
  const fast = new Skater(ground());
  fast.start(0, 0, 0, 9);
  let slid = 0;
  ride(fast, 4, (t, s) => {
    slid = Math.max(slid, s.slide);
    return { brake: 1 };
  });
  assert.ok(slid > 0.6, `at speed, a powerslide (${slid.toFixed(2)})`);
  assert.equal(fast.v, 0, 'to a stop');
  assert.ok(fast.z < 12, `and quickly (${fast.z.toFixed(1)} m)`);
  const slow = new Skater(ground());
  slow.start(0, 0, 0, 2.5);
  let dragged = false;
  ride(slow, 0.5, (t, s) => {
    dragged ||= s.dragging && s.slide < 0.3;
    return { brake: 1 };
  });
  assert.ok(dragged, 'slowly, a foot dragged');
  const still = new Skater(ground());
  still.start(0, 0, 0);
  ride(still, 0.5, () => ({ steer: -1 }));
  assert.ok(still.yaw > 0.5 && still.v === 0, 'at a standstill, kicked round where you are');
});

test('an ollie pops you up off the ground and back down on the board', () => {
  const { sk, events, land } = ollie();
  const air = named(events, 'takeoff');
  assert.equal(air[0][1], true, 'popped');
  assert.ok(land, 'landed');
  assert.equal(land.name, 'ollie');
  assert.ok(land.points > 0);
  assert.ok(land.air.time > 0.5 && land.air.time < 0.9, `in the air a moment (${land.air.time.toFixed(2)} s)`);
  assert.ok(sk.grounded && sk.v > 3, 'and rolling on');
});

test('in the air the board flips, turns under you, and you turn with it; let go and it finishes', () => {
  const kick = ollie((t) => ({ flip: t < 0.05 ? 1 : 0 }));
  assert.equal(kick.land?.name, 'kickflip', 'a tap of W: a kickflip');
  const heel = ollie((t) => ({ flip: t < 0.05 ? -1 : 0 }));
  assert.equal(heel.land?.name, 'heelflip', 'of S: a heelflip');
  const shove = ollie((t) => ({ shove: t < 0.05 }));
  assert.equal(shove.land?.name, 'pop shove-it', 'shift: the board half way round under you');
  const tre = ollie((t) => ({ flip: t < 0.05 ? 1 : 0, shove: t < 0.35 }));
  assert.equal(tre.land?.name, '360 flip', 'a flip and a whole turn under you: a 360 flip');
  const fs = ollie((t) => ({ steer: t < 0.22 ? -1 : 0 }));
  assert.equal(fs.land?.name, 'frontside 180');
  assert.ok(fs.land.fakie && fs.sk.fakie, 'and you roll away fakie');
  assert.ok(fs.land.points > kick.land.points / 2);
  // held all the way down, the board is still flipping as you land
  const held = ollie(() => ({ flip: 1 }));
  assert.ok(held.crash, 'held too long: you bail');
  assert.match(held.crash[1], /edge|wheels up/);
});

test('keys held as you leave the ground do nothing in the air until pressed again', () => {
  const sk = new Skater(ground());
  sk.start(0, 0, 0, 4);
  const events = ride(sk, 2.5, (t) => ({ pop: t < 1 / 60, push: true, steer: 1 }));
  const land = named(events, 'land')[0]?.[1];
  assert.ok(land, 'landed');
  assert.equal(land.name, 'ollie', 'no kickflip from the push, no spin from the carve');
});

test('off the hard stuff the wheels dig in: step off slowly, thrown off fast', () => {
  const grass = (x, z) => (z > 3 ? 'ground' : 'tarmac');
  const slow = new Skater(ground({ surface: grass }));
  slow.start(0, 0, 0, 2);
  const a = ride(slow, 3);
  assert.equal(named(a, 'off')[0]?.[1], 'the grass', 'slowly: off, and run it out');
  assert.equal(named(a, 'crash').length, 0);
  const fast = new Skater(ground({ surface: grass }));
  fast.start(0, 0, 0, 6);
  const b = ride(fast, 1);
  assert.match(named(b, 'crash')[0]?.[1] || '', /into the grass/, 'fast: thrown');
  assert.ok(fast.loose, 'the board shoots off on its own');
  ride(fast, 6);
  assert.equal(fast.down, -1, 'and a moment later you are up');
  assert.equal(fast.loose, null, 'with the board back');
  // gravel rolls, badly, and a stone in it can throw you
  assert.ok(rolls('gravel') && !setsOff('gravel') && setsOff('tarmac') && !rolls('ground'));
  const gravel = new Skater(ground({ surface: () => 'gravel' }), { rnd: () => 0 });
  gravel.start(0, 0, 0, 6);
  assert.match(named(ride(gravel, 1), 'crash')[0]?.[1] || '', /stone/, 'a stone stops the wheels');
});

test('into something solid: glance off it slowly, bail into it fast', () => {
  // a wall along z = 5, standing well over the wheels
  const wall = (x, y, z, r, out) => {
    if (z + r < 5) return false;
    out.nx = 0;
    out.nz = -1;
    out.depth = z + r - 5;
    out.what = 'a wall';
    return true;
  };
  const fast = new Skater(ground({ hit: wall }));
  fast.start(0, 0, 0, 6);
  assert.match(named(ride(fast, 2), 'crash')[0]?.[1] || '', /into a wall/);
  const slow = new Skater(ground({ hit: wall }));
  slow.start(0, 0, 0.2, 2);
  const e = ride(slow, 3);
  assert.equal(named(e, 'crash').length, 0, 'slowly, no bail');
  assert.ok(slow.z <= 4.71 && slow.x > 0.5, 'glancing along it');
});

test('roll off a ledge and drop to the ground; a step up stops the wheels, so ollie up it', () => {
  // a slab 0.4 m high from z = 0 to 5
  const slab = (x, z, reach) => (z >= -2 && z < 5 && reach >= 0.4 ? 0.4 : 0);
  const sk = new Skater(ground({ height: slab }));
  sk.start(0, 0, 0, 5);
  const e = ride(sk, 3);
  assert.equal(named(e, 'crash').length, 0, 'off the end of it and down');
  assert.ok(sk.grounded && sk.y === 0 && sk.z > 7, 'rolling on beyond it');
  // the land rising in a step in front of you
  const step = (x, z) => (z > 3 ? 0.3 : 0);
  const blocked = new Skater(ground({ height: step }));
  blocked.start(0, 0, 0, 2);
  ride(blocked, 2);
  assert.ok(blocked.z < 3 && blocked.v === 0, 'stopped at the step');
  const thrown = new Skater(ground({ height: step }));
  thrown.start(0, 0, 0, 6);
  assert.ok(named(ride(thrown, 2), 'crash').length, 'too fast into it: thrown');
  const up = new Skater(ground({ height: step }));
  up.start(0, 1, 0, 4);
  ride(up, 2, (t) => ({ pop: t < 1 / 60 }));
  assert.ok(up.grounded && Math.abs(up.y - 0.3) < 1e-6 && up.down < 0, 'ollied up onto it');
});

test('what a trick is called and what it is worth', () => {
  const air = (o) => ({ time: 0.6, height: 0.5, spin: 0, flip: 0, shove: 0, popped: true, fakie: false, ...o });
  const T = Math.PI * 2;
  assert.equal(nameOf(air()), 'ollie');
  assert.equal(nameOf(air({ flip: T })), 'kickflip');
  assert.equal(nameOf(air({ flip: -2 * T })), 'double heelflip');
  assert.equal(nameOf(air({ flip: T, shove: Math.PI })), 'varial kickflip');
  assert.equal(nameOf(air({ flip: T, shove: -T })), '360 flip');
  assert.equal(nameOf(air({ flip: -T, shove: T })), 'laser flip');
  assert.equal(nameOf(air({ shove: T })), '360 shove-it');
  assert.equal(nameOf(air({ spin: -Math.PI, flip: T })), 'backside 180 kickflip');
  assert.equal(nameOf(air({ spin: 2 * Math.PI })), 'frontside 360');
  assert.equal(nameOf(air({ fakie: true, flip: -T })), 'fakie heelflip');
  assert.equal(nameOf(air({ popped: false, time: 1 })), 'big drop');
  assert.equal(nameOf(air({ popped: false, time: 0.2, height: 0.1 })), '');
  assert.equal(counts(air({ popped: false, time: 0.2, height: 0.1 })), false, 'a hop off a kerb is not an air');
  assert.ok(score(air({ flip: T })) > score(air()), 'a kickflip is worth more than an ollie');
  assert.ok(score(air({ flip: T, shove: T })) > score(air({ flip: T })), 'a 360 flip more again');
  assert.ok(score(air(), { fakie: true }) > score(air()), 'rolling away fakie, a little more');
  const clean = { skew: 0, roll: 0, shove: 0, impact: 2 };
  assert.equal(bail(clean), null);
  assert.equal(bail({ ...clean, roll: T }), null, 'a whole flip comes down wheels down');
  assert.equal(bail({ ...clean, shove: Math.PI }), null, 'half a turn under you comes down along you');
  assert.match(bail({ ...clean, roll: Math.PI }), /wheels up/);
  assert.match(bail({ ...clean, roll: 1.2 }), /edge/);
  assert.match(bail({ ...clean, shove: Math.PI / 2 }), /across/);
  assert.match(bail({ ...clean, skew: LAND.skew + 0.1 }), /sideways/);
  assert.match(bail({ ...clean, impact: LAND.impact + 1 }), /too hard/);
});

test('a line: tricks one after another, banked once you have rolled on a while, lost if you bail', () => {
  const s = new Session();
  s.landed('ollie', 50);
  s.landed('kickflip', 200);
  assert.equal(s.pending, 500, 'times how many');
  assert.equal(s.update(LINE / 2, 0, 1, 4, true), 0);
  assert.equal(s.update(LINE, 0, 2, 4, true), 500, 'banked');
  assert.equal(s.points, 500);
  s.landed('pop shove-it', 100);
  assert.equal(s.bail(), 100, 'lost');
  assert.equal(s.points, 500);
  assert.equal(s.best.name, 'kickflip');
  assert.equal(s.distance, 2);
});
