// The Whorl (src/whorl/): the stainless-steel slide down the middle of the
// Nautilus Lookout Tower at Owl Creek Landing, Virginia Beach. What's
// checked here: that the tower is the size it's said to be; that its ramp
// can be walked from the ground to the top deck the way the hiker stands on
// things (never a step too high, never a deck in the way of your head) and
// that its rails keep you on it; that the slide goes from the top deck to
// the ground through the south-east face without touching the ramp, the
// columns or itself; that a ride down it takes about ten seconds, keeps you
// in the tube and stops you on the run-out, whatever the frame rate; and
// that it stands where it really is, on Owl Creek Landing's real ground, dry
// and level, with Owls Creek under its footbridge.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Solids } from '../src/world/solids.js';
import { segDist } from '../src/core/geom.js';
import { TOWER, SLIDE, LAP, RISE, LEVEL_AT, MOUTH, FOOT, WHERE, rampAt, rampY, lapOf, bearingOf, apothemOf, onOctagon, decksOver, slidePath, tubeFrame, structure, tubeSolids, bridgeLine } from '../src/whorl/tower.js';
import { Ride, RIDE } from '../src/whorl/ride.js';
import { HIKES } from '../src/world/hikes.js';
import { loadHike } from '../src/world/landforms.js';
import { Landform } from '../src/world/landform.js';

// The hiker, as player.js has them: how high a step they take, how much
// room their head needs, and how wide they are (m).
const STEP_UP = 0.28;
const HEAD = 1.5;
const RADIUS = 0.32;

const solids = new Solids();
solids.set('tower', structure().solids);
solids.set('tube', tubeSolids());
const _s = { d: 0, t: 0, nx: 0, nz: 0 };
// What you'd stand on at (x, z), feet at y: the highest top within a step
// of them (or the ground, 0, under the tower).
function groundAt(x, z, y) {
  let g = 0;
  solids.forEachNear(x, z, 1, (s) => {
    segDist(x, z, s.ax, s.az, s.bx, s.bz, _s);
    if (_s.d > s.r + 0.08) return;
    const top = s.topA + (s.topB - s.topA) * _s.t;
    if (top > g && y >= top - STEP_UP) g = top;
  });
  return g;
}
// Whether anything would push you away from (x, z), feet at y.
function wall(x, z, y) {
  let hit = false;
  solids.forEachNear(x, z, 1.2 + RADIUS, (s) => {
    segDist(x, z, s.ax, s.az, s.bx, s.bz, _s);
    if (_s.d >= s.r + RADIUS) return;
    const top = s.topA + (s.topB - s.topA) * _s.t;
    if (y >= top - STEP_UP || y + HEAD < s.bottom) return;
    hit = true;
  });
  return hit;
}

// ── The tower ───────────────────────────────────────────────────────────────
test('the tower is an octagon 25 m across, six times round its ramp to a top deck 19 m up', () => {
  assert.equal(TOWER.outside * 2, 25);
  assert.equal(TOWER.levels, 6);
  assert.ok(TOWER.top > 18 && TOWER.top < 20, 'its top deck under its 20 m (65 ft)');
  assert.ok(TOWER.rampOut - TOWER.rampIn > 2, 'a ramp over two metres wide');
  assert.ok(RISE / LAP < 0.05, `a gentle ramp: ${((RISE / LAP) * 100).toFixed(1)}%`);
  const length = LAP * TOWER.levels;
  assert.ok(length > 400 && length < 560, `about half a kilometre of it (${length.toFixed(0)} m)`);
  assert.equal(TOWER.core * 2, 11, 'the open middle the slide goes down, 11 m across');
  // the octagon: flat faces north, south, east and west
  for (const b of [0, 90, 180, 270]) assert.ok(Math.abs(apothemOf(...onOctagon(b, 7)) - 7) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...onOctagon(22.5, 10)) - 10 / Math.cos(Math.PI / 8)) < 1e-9, 'its corners between');
});

test('the ramp goes round the outer ring from its foot on the south face, a lap at a time', () => {
  assert.equal(lapOf(TOWER.start), 0);
  assert.ok(Math.abs(lapOf(270) - 0.25) < 1e-9 && Math.abs(lapOf(0) - 0.5) < 1e-9, 'west, then north: clockwise');
  const [x, z] = rampAt(0, 10);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(z - 10) < 1e-9, 'its foot on the south face');
  assert.equal(rampY(0), 0);
  assert.equal(rampY(TOWER.levels), TOWER.top);
  assert.equal(rampY(LEVEL_AT + 0.01), TOWER.top, 'level at the top');
  // over any spot of the ring, a deck each time round, a lap's climb apart
  const decks = decksOver(...rampAt(2.3, 10.75));
  assert.equal(decks.length, TOWER.levels);
  for (let k = 1; k < decks.length - 1; k++) assert.ok(Math.abs(decks[k] - decks[k - 1] - RISE) < 1e-6);
  assert.ok(RISE - TOWER.deck - TOWER.beam > HEAD + 0.6, 'room over your head under the next lap');
});

test('you can walk up the ramp from the ground to the top deck and round to the slide, a step at a time', () => {
  const mid = (TOWER.rampIn + TOWER.rampOut) / 2;
  // (each stretch of deck is a capsule, whose round end reaches back over
  // the last at its own height: a few centimetres over the slope there)
  const lip = (RISE / LAP) * ((TOWER.rampOut - TOWER.rampIn) / 2) + 0.01;
  let y = 0;
  // (up to where a rail closes its top end: you turn onto the top deck before it)
  for (let u = 0; u <= TOWER.levels - 0.5 / LAP; u += 0.002) {
    const [x, z] = rampAt(u, mid);
    const g = groundAt(x, z, y);
    assert.ok(g - y <= STEP_UP, `a step you can take at ${u.toFixed(3)} laps (${(g - y).toFixed(2)} m)`);
    assert.ok(g - rampY(u) > -0.01 && g - rampY(u) < lip, `on the ramp, not the lap over or under it, at ${u.toFixed(3)} laps`);
    assert.ok(!wall(x, z, g), `nothing in the way at ${u.toFixed(3)} laps`);
    y = g;
  }
  assert.equal(y, TOWER.top);
  // off the landing onto the top deck, and round it to the slide's mouth
  const land = rampAt((LEVEL_AT + TOWER.levels) / 2, mid);
  const deck = [land[0] * 0.66, land[1] * 0.66];
  for (let f = 0; f <= 1; f += 0.02) {
    const [x, z] = [land[0] + (deck[0] - land[0]) * f, land[1] + (deck[1] - land[1]) * f];
    assert.equal(groundAt(x, z, y), TOWER.top, 'level across');
    assert.ok(!wall(x, z, y), 'and nothing in the way');
  }
  const from = bearingOf(...deck);
  const to = bearingOf(MOUTH.x, MOUTH.z);
  const a = (TOWER.core + TOWER.rampIn) / 2;
  for (let b = from; b <= to + (to < from ? 360 : 0); b += 1) {
    const [x, z] = onOctagon(b, a);
    assert.equal(groundAt(x, z, y), TOWER.top, `on the top deck at ${b % 360}°`);
    assert.ok(!wall(x, z, y), `round it at ${b % 360}°`);
  }
  assert.equal(groundAt(MOUTH.x, MOUTH.z, y), TOWER.top, 'and where you get on');
  assert.ok(!wall(MOUTH.x, MOUTH.z, y));
});

test("the rails keep you on: off either edge of the ramp, or the top deck's, is a wall", () => {
  for (let u = TOWER.railFrom / RISE + 0.01; u < TOWER.levels; u += 0.01) {
    const y = rampY(u);
    const [ox, oz] = rampAt(u, TOWER.rampOut + 0.1);
    assert.ok(wall(ox, oz, y), `the outer rail at ${u.toFixed(2)} laps`);
    if (u < LEVEL_AT - 0.01) {
      const [ix, iz] = rampAt(u, TOWER.rampIn - 0.1);
      assert.ok(wall(ix, iz, y), `the inner rail at ${u.toFixed(2)} laps`);
    }
  }
  // round the open middle, but for the mouth
  const mouth = bearingOf(MOUTH.x, MOUTH.z);
  for (let b = 0; b < 360; b += 2) {
    const [x, z] = onOctagon(b, TOWER.core + 0.1);
    const gap = Math.abs(((b - mouth + 540) % 360) - 180) < 6;
    if (!gap) assert.ok(wall(x, z, TOWER.top), `round the middle at ${b}°`);
  }
  // and you can't hop the rail (a jump of a metre)
  const [ox, oz] = rampAt(3.3, TOWER.rampOut - 0.05);
  assert.ok(wall(ox, oz, rampY(3.3) + 1), 'too high to hop');
});

// ── The slide ───────────────────────────────────────────────────────────────
const P = slidePath();
const R = SLIDE.tube + SLIDE.wall;
const axis = P.pts.map((_, i) => tubeFrame(P, i).c.slice());

test('the Whorl goes from the top deck down the middle and out through the south-east face onto the ground', () => {
  assert.ok(P.len > 52 && P.len < 60, `more than 170 feet of it (${P.len.toFixed(1)} m: ${(P.len / 0.3048).toFixed(0)} ft)`);
  const [first, last] = [P.pts[0], P.pts[P.pts.length - 1]];
  assert.ok(Math.abs(first[1] - TOWER.top) < 0.1, 'its mouth at the top deck');
  assert.ok(Math.hypot(first[0] - MOUTH.x, first[2] - MOUTH.z) < 2, "where you're stood to get on");
  assert.ok(Math.abs(last[1] - SLIDE.end) < 1e-6, 'its end just over the ground');
  assert.ok(apothemOf(last[0], last[2]) > TOWER.outside + 2, 'out past the tower');
  assert.ok(Math.abs(bearingOf(last[0], last[2]) - 135) < 1, 'to the south-east');
  for (let i = 1; i < P.pts.length; i++) assert.ok(P.pts[i][1] <= P.pts[i - 1][1] + 1e-9, 'never climbing');
  // down the middle, inside the top deck's edge
  for (let i = 0; i < P.pts.length; i++) {
    if (P.pts[i][1] < 2.5) break;
    assert.ok(apothemOf(P.pts[i][0], P.pts[i][2]) + R < TOWER.core, `in the open middle at ${P.s[i].toFixed(1)} m`);
  }
});

test('the tube is clear of the ramp over it, the columns and its own turns', () => {
  const C = structure().columns;
  for (let i = 0; i < axis.length; i++) {
    const [x, y, z] = axis[i];
    // under a deck, its top under the deck's beams; never through a deck
    for (const [dx, dz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) {
      for (const d of decksOver(x + dx, z + dz)) {
        if (d > y) assert.ok(d - TOWER.deck - TOWER.beam - (y + R) > 0.05, `under the ramp at ${P.s[i].toFixed(1)} m`);
        else assert.ok(y - R >= d - 1e-6 || P.s[i] < 1, `over the deck at ${P.s[i].toFixed(1)} m`);
      }
    }
    for (const c of C) if (y < c.top) assert.ok(Math.hypot(x - c.x, z - c.z) > R + TOWER.columns.r + 0.05, `clear of a column at ${P.s[i].toFixed(1)} m`);
    for (let j = 0; j < axis.length; j++) {
      if (Math.abs(P.s[i] - P.s[j]) < 4) continue;
      assert.ok(Math.hypot(x - axis[j][0], y - axis[j][1], z - axis[j][2]) > 2 * R + 0.5, 'its turns well apart');
    }
  }
  // and the walk up is clear of it: nothing of it in the way on the ramp
  for (let u = 0; u <= TOWER.levels; u += 0.01) {
    const [x, z] = rampAt(u, (TOWER.rampIn + TOWER.rampOut) / 2);
    for (const c of axis) assert.ok(Math.hypot(c[0] - x, c[2] - z) > 2 || c[1] + R < rampY(u) - TOWER.deck || c[1] - R > rampY(u) + HEAD, 'not across the ramp');
  }
});

// Ride it, a frame at a time. → what happened
function rideDown(dt) {
  const ride = new Ride(P);
  let most = 0; // rad up the wall
  let slow = 0; // s at a shuffle, in the tube
  let out = 0; // m furthest the hips got from the tube's middle
  let n = 0;
  while (ride.update(dt) && ++n < 1e5) {
    most = Math.max(most, Math.abs(ride.roll));
    if (ride.at.inside && ride.v <= RIDE.scoot + 1e-9) slow += dt;
    const i = Math.min(axis.length - 1, Math.round(ride.s / SLIDE.step));
    let best = Infinity;
    for (let j = Math.max(0, i - 4); j <= Math.min(axis.length - 1, i + 4); j++) best = Math.min(best, Math.hypot(ride.at.x - axis[j][0], ride.at.y - axis[j][1], ride.at.z - axis[j][2]));
    out = Math.max(out, best);
  }
  return { ride, most, slow, out };
}

test('a ride down takes about ten seconds, rides up the wall in the turns, and stops on the run-out', () => {
  const { ride, most, slow, out } = rideDown(1 / 60);
  assert.ok(ride.done);
  assert.ok(ride.t > 9 && ride.t < 13, `about ten seconds (${ride.t.toFixed(1)} s)`);
  assert.ok(ride.top > 5 && ride.top < 9, `quick, but never running away: ${ride.top.toFixed(1)} m/s at the fastest`);
  assert.ok(ride.s > P.open[1] && ride.s <= P.len, `stopped on the run-out (${ride.s.toFixed(1)} m of ${P.len.toFixed(1)})`);
  assert.ok(most > 0.5 && most <= RIDE.most, `up the wall in the turns (${((most * 180) / Math.PI).toFixed(0)}°)`);
  assert.ok(slow < 0.5, `never at a shuffle in the tube (${slow.toFixed(2)} s)`);
  assert.ok(out < SLIDE.tube - RIDE.hips + 0.08, `always in the tube (${out.toFixed(2)} m from its middle)`);
});

test('a ride goes the same at any frame rate', () => {
  const a = rideDown(1 / 120).ride;
  const b = rideDown(1 / 30).ride;
  assert.ok(Math.abs(a.t - b.t) < 0.4, `${a.t.toFixed(2)} s and ${b.t.toFixed(2)} s`);
  assert.ok(Math.abs(a.s - b.s) < 1, `stopping ${a.s.toFixed(1)} m and ${b.s.toFixed(1)} m down it`);
});

// ── Where it is ─────────────────────────────────────────────────────────────
test("it stands where it really is, on Owl Creek Landing's ground: dry and level, Owls Creek under the footbridge", async () => {
  const card = HIKES.find((h) => h.id === 'owl-creek-landing');
  assert.ok(card, 'the real place it stands on is in the world');
  assert.equal(card.scale, 1, 'life size');
  assert.deepEqual([card.middle.lat, card.middle.lon], [WHERE.lat, WHERE.lon], 'centred on the tower');
  const L = new Landform(await loadHike(card));
  const [X, Z] = card.at;
  const [bridgeFrom, bridgeTo] = bridgeLine();
  assert.ok(Math.hypot(bridgeTo[0] - card.view.x, bridgeTo[1] - card.view.z) < 2, "the walk ends where the footbridge comes off the creek, looking up at the tower");
  // its footprint: dry, and level to within a few hand's breadths
  const hs = [];
  for (let x = -TOWER.outside; x <= TOWER.outside; x += 2) {
    for (let z = -TOWER.outside; z <= TOWER.outside; z += 2) {
      hs.push(L.ground(X + x, Z + z));
      assert.ok(L.waterNear(X + x, Z + z) > 2, 'no water under the tower');
    }
  }
  assert.ok(Math.max(...hs) - Math.min(...hs) < 1, `level enough (${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} m)`);
  // the footbridge crosses Owls Creek
  let wet = 0;
  for (let f = 0; f <= 1; f += 0.02) if (L.waterNear(X + bridgeFrom[0] + (bridgeTo[0] - bridgeFrom[0]) * f, Z + bridgeFrom[1] + (bridgeTo[1] - bridgeFrom[1]) * f) < 0) wet++;
  assert.ok(wet > 3, `over the creek (${wet} of 51 points along it are over water)`);
  // and the foot of the ramp is on the ground at the end of the path
  assert.ok(Math.abs(L.ground(X + FOOT.x, Z + TOWER.rampOut) - L.ground(X, Z)) < 0.5);
});
