// The launch site and the arena it goes to: where the site is (grown from
// the seed, and pinned, since it's a place on the map people track), and the
// rules of the arena — how you move, what the pads do, what a rail hits, how
// the score is kept — and that the bots can find their way round it and
// fight.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { Sites } from '../src/landmarks/sites.js';
import { Towns } from '../src/towns/towns.js';
import { Caves } from '../src/caves/caves.js';
import { Lines, clearOfPlaces, clearOfCaves } from '../src/railway/lines.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms } from '../src/world/landforms.js';
import { findSite, clearOf, LaunchSites, farSpot, FAR, PAD, SKIRT } from '../src/spaceport/site.js';
import { BOXES, PADS, NODES, LINKS, SPAWNS, FLOOR, floorAt, nodeAt, nodeById } from '../src/spaceport/orrery.js';
import { MOVE, makeBody, moveBody, launch, rayBoxes } from '../src/spaceport/mover.js';
import { Match } from '../src/spaceport/match.js';
import { Arena, RELOAD } from '../src/spaceport/arena.js';
import { route, steer } from '../src/spaceport/bots.js';
import { Flight, FLIGHT, climbHeight, homeHeight } from '../src/spaceport/flight.js';
import { matchesGolden } from './helpers/golden.js';

const SEED = 20261119;
const MAP = { boxes: BOXES, pads: PADS };
const STEP = 1 / 60;
const still = { x: 0, z: 0 };

// The world as the game has it: the things the site keeps clear of, made
// the way their features make them.
function worldOf(land) {
  const gen = growWorld(SEED, [], land);
  const start = gen.findSpawn(0, 0);
  const landforms = new Landforms(HIKES);
  const keepHike = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const sites = new Sites(gen, { start });
  const caves = new Caves({ gen, keepOff: keepHike });
  const lines = new Lines(gen, { start, keepClear: [clearOfPlaces(sites), clearOfCaves((a, b, c, d) => caves.inBox(a, b, c, d))], keepOff: keepHike });
  const towns = new Towns(gen, { start, sites, keepOff: keepHike });
  return { gen, start, landforms, keepOff: clearOf({ landforms, sites, towns, caves, lines }) };
}

test('the launch site is grown from the seed: the same every time, on flat dry ground, clear of what was there first', () => {
  for (const land of LANDS) {
    const { gen, start, keepOff } = worldOf(land);
    const site = findSite(gen, start, keepOff);
    assert.ok(site, `land ${land} has a launch site`);
    assert.deepEqual(findSite(gen, start, keepOff), site, 'and the same one again');
    const d = Math.hypot(site.x - start.x, site.z - start.z);
    assert.ok(d >= 180 && d <= 440, `a few hundred metres from the start (${d.toFixed(0)} m)`);
    gen.height(site.x, site.z);
    assert.ok(gen.water.edge >= PAD + SKIRT, 'out of the water');
    assert.ok(site.top > site.low && site.top - site.low < 3.2, `on ground that's flat enough (${(site.top - site.low).toFixed(2)} m)`);
    const reach = PAD + SKIRT;
    assert.ok(!keepOff(site.x - reach, site.z - reach, site.x + reach, site.z + reach), 'clear of everything it keeps clear of');
    // the place on the map people track is where it was
    const round = (v) => Math.round(v * 1000) / 1000;
    matchesGolden(land > 1 ? `spaceport-${SEED}-land${land}` : `spaceport-${SEED}`, { id: site.id, x: round(site.x), z: round(site.z), yaw: round(site.yaw), top: round(site.top) }, { tolerance: 1e-6 });
  }
});

test('the others are few and far between, grown from the seed, and pinned', () => {
  const { gen, start, landforms, keepOff } = worldOf(LANDS[0]);
  const away = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const launch = new LaunchSites(gen, { start, home: findSite(gen, start, keepOff), keepOff, away });
  const pinned = {};
  // the first three squares round the middle that have one
  const near = [];
  for (let j = -2; j <= 1; j++) for (let i = -2; i <= 1; i++) if (launch.spot(i, j)) near.push([i, j]);
  for (const [i, j] of near.slice(0, 3)) {
    const s = launch.cell(i, j);
    if (!s) continue;
    const d = Math.hypot(s.x - start.x, s.z - start.z);
    assert.ok(d > FAR.start - FAR.ring[1] - 20, `well away from the start (${(d / 1000).toFixed(1)} km)`);
    assert.ok(s.x >= i * FAR.cell && s.x < (i + 1) * FAR.cell && s.z >= j * FAR.cell && s.z < (j + 1) * FAR.cell, 'in its own square');
    gen.height(s.x, s.z);
    assert.ok(gen.water.edge >= PAD + SKIRT, 'out of the water');
    assert.ok(s.top - s.low < 3.2, 'on flat enough ground');
    const reach = PAD + SKIRT;
    assert.ok(!keepOff(s.x - reach, s.z - reach, s.x + reach, s.z + reach), 'clear of what was there first');
    assert.equal(launch.byId(s.id), s, 'found again by its id');
    const round = (v) => Math.round(v * 1000) / 1000;
    pinned[s.id] = { name: s.name, x: round(s.x), z: round(s.z), yaw: round(s.yaw), top: round(s.top) };
  }
  assert.ok(Object.keys(pinned).length >= 2, 'there are some');
  // places people track are where they were
  matchesGolden(`spaceport-far-${SEED}`, pinned, { tolerance: 1e-6 });
  // and none round the start but Skyhook
  assert.deepEqual(launch.within(start.x - 9000, start.z - 9000, start.x + 9000, start.z + 9000).map((s) => s.id), [launch.home.id]);
});

test('a far launch site is the same looked for a little at a time, waiting on the railway', () => {
  const { gen, start, landforms, keepOff } = worldOf(LANDS[0]);
  const away = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const outright = new LaunchSites(gen, { start, keepOff, away });
  // the railway "still being surveyed" for a while
  let asked = 0;
  const slow = (...box) => keepOff(...box);
  slow.ready = () => ++asked > 5;
  const bit = new LaunchSites(gen, { start, keepOff: slow, away });
  let at = null;
  for (let k = 0; !at; k++) if (bit.spot(k, 0)) at = [k, 0];
  assert.equal(bit.peek(...at), undefined, 'not known at first');
  let rounds = 0;
  while (bit.pump(1) > 0) rounds++;
  assert.ok(rounds > 1 && asked > 5, 'it took a while');
  assert.ok(bit.peek(...at), 'and found');
  assert.deepEqual(bit.peek(...at), outright.cell(...at));
  // a square with nothing in it isn't queued at all
  const empty = [...Array(40).keys()].map((k) => [k, 3]).find(([i, j]) => !farSpot(gen.seed, i, j));
  assert.equal(bit.peek(...empty), null);
});

test('no two launch sites within four squares of each other share a name', () => {
  for (let j = -4; j <= 4; j++) {
    for (let i = -4; i <= 4; i++) {
      const a = farSpot(SEED, i, j);
      for (let dj = -4; dj <= 4; dj++) {
        for (let di = -4; di <= 4; di++) {
          const b = (di || dj) && farSpot(SEED, i + di, j + dj);
          if (a && b) assert.notEqual(a.name, b.name, `(${i}, ${j}) and (${i + di}, ${j + dj})`);
        }
      }
    }
  }
});

test('the launch site keeps off somewhere it is told to', () => {
  const gen = growWorld(SEED, [], 2);
  const start = gen.findSpawn(0, 0);
  const first = findSite(gen, start);
  const box = first.box;
  const second = findSite(gen, start, (x0, z0, x1, z1) => x1 > box[0] && x0 < box[2] && z1 > box[1] && z0 < box[3]);
  assert.ok(second && second.id !== first.id, 'somewhere else');
  assert.ok(second.box[2] <= box[0] || second.box[0] >= box[2] || second.box[3] <= box[1] || second.box[1] >= box[3], 'clear of it');
});

// ── Moving ──────────────────────────────────────────────────────────────────

const ground = [{ x0: -100, y0: -2, z0: -100, x1: 100, y1: 0, z1: 100 }];
function stand(x = 0, z = 0, boxes = ground) {
  const b = makeBody(x, floorOf(boxes, x, z), z);
  b.grounded = true;
  return b;
}
const floorOf = (boxes, x, z) => Math.max(...boxes.filter((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1).map((b) => b.y1));

test('running: up to speed at once, and stopped at once', () => {
  const b = stand();
  for (let i = 0; i < 30; i++) moveBody(b, { x: 0, z: -1 }, false, STEP, { boxes: ground });
  // (friction takes a little off it, every step, before you push again)
  const speed = Math.hypot(b.vel.x, b.vel.z);
  assert.ok(speed > MOVE.speed * 0.93 && speed <= MOVE.speed, `running speed in half a second (${speed.toFixed(2)} m/s)`);
  for (let i = 0; i < 24; i++) moveBody(b, still, false, STEP, { boxes: ground });
  assert.ok(Math.hypot(b.vel.x, b.vel.z) < 0.01, 'and stopped in less than half of one');
});

test('a jump is about a metre and a half high, and lands', () => {
  const b = stand();
  let top = 0;
  const events = [];
  moveBody(b, still, true, STEP, { boxes: ground }, events);
  for (let i = 0; i < 120; i++) {
    moveBody(b, still, false, STEP, { boxes: ground }, events);
    top = Math.max(top, b.pos.y);
  }
  assert.ok(top > 1.35 && top < 1.55, `${top.toFixed(2)} m`);
  assert.ok(b.grounded && b.pos.y === 0, 'down again');
  assert.deepEqual(
    events.map((e) => e.what),
    ['jump', 'land'],
  );
});

test('strafe-jumping: turning while you strafe in the air carries you faster than running', () => {
  const b = stand();
  for (let i = 0; i < 30; i++) moveBody(b, { x: 0, z: -1 }, false, STEP, { boxes: ground });
  // hop after hop, wishing a little to the side of the way you're going
  for (let i = 0; i < 60 * 6; i++) {
    const v = Math.atan2(b.vel.x, b.vel.z);
    const side = i % 120 < 60 ? 1 : -1;
    const a = v + side * (Math.PI / 2 - 0.12);
    moveBody(b, { x: Math.sin(a), z: Math.cos(a) }, true, STEP, { boxes: ground });
  }
  const speed = Math.hypot(b.vel.x, b.vel.z);
  assert.ok(speed > MOVE.speed * 1.4, `${speed.toFixed(1)} m/s, against ${MOVE.speed} running`);
});

test('a step is walked up onto; a wall stops you', () => {
  const step = [...ground, { x0: -5, y0: 0, z0: -10, x1: 5, y1: 0.5, z1: -5 }];
  const b = stand(0, 0, step);
  for (let i = 0; i < 60; i++) moveBody(b, { x: 0, z: -1 }, false, STEP, { boxes: step });
  assert.ok(b.pos.z < -5 && b.pos.y === 0.5, 'up on the step');
  const wall = [...ground, { x0: -5, y0: 0, z0: -10, x1: 5, y1: 1.2, z1: -5 }];
  const c = stand(0, 0, wall);
  for (let i = 0; i < 60; i++) moveBody(c, { x: 0, z: -1 }, false, STEP, { boxes: wall });
  assert.ok(Math.abs(c.pos.z - (-5 + MOVE.half)) < 0.01 && c.pos.y === 0, 'stopped against the wall');
});

test('a throw lands where it was aimed', () => {
  const v = launch({ x: 0, y: 0, z: 0 }, { x: 30, y: 5, z: -20 }, 6);
  const t = v.t;
  const x = v.x * t;
  const z = v.z * t;
  const y = v.y * t - 0.5 * MOVE.gravity * t * t;
  assert.ok(Math.abs(x - 30) < 1e-9 && Math.abs(z + 20) < 1e-9 && Math.abs(y - 5) < 1e-9);
});

// ── The arena ───────────────────────────────────────────────────────────────

test('every jump pad in the arena brings you to rest where it says, on its platform', () => {
  for (const p of PADS) {
    const b = makeBody(p.x, p.y, p.z);
    b.grounded = true;
    let flew = false;
    for (let t = 0; t < 8; t += STEP) {
      moveBody(b, still, false, STEP, MAP);
      flew ||= !b.grounded;
      if (flew && b.grounded && Math.hypot(b.vel.x, b.vel.z) < 0.01) break;
    }
    const off = Math.hypot(b.pos.x - p.to.x, b.pos.z - p.to.z);
    assert.ok(b.grounded && Math.abs(b.pos.y - p.to.y) < 1e-6 && off < 0.8, `${p.id}: at (${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}, ${b.pos.z.toFixed(1)}), ${off.toFixed(2)} m from where it aims`);
    for (const q of PADS) assert.ok(q === p || Math.hypot(b.pos.x - q.x, b.pos.z - q.z) > q.r + MOVE.half, `${p.id} doesn't land you on ${q.id}`);
  }
});

test('the ways in are on a floor, and so is every node', () => {
  for (const s of SPAWNS) assert.ok(floorAt(s.x, s.z, Infinity, MOVE.half) > FLOOR, `spawn at ${s.x}, ${s.z}`);
  for (const n of NODES) assert.ok(Number.isFinite(nodeAt(n.id).y), n.id);
});

test('a bot can walk every way it knows, and get from any node to any other', () => {
  for (const [a, b, how] of LINKS) {
    if (how === 'fly') continue;
    for (const [from, to] of how === 'walk' ? [[a, b], [b, a]] : [[a, b]]) {
      const A = nodeAt(from);
      const B = nodeAt(to);
      const body = makeBody(A.x, A.y, A.z);
      body.grounded = true;
      const events = [];
      const wish = { x: 0, z: 0 };
      let ok = false;
      for (let t = 0; t < 10 && !ok; t += STEP) {
        if (nodeById.get(to).pad) ok = events.some((e) => e.what === 'pad');
        else ok = body.grounded && Math.hypot(B.x - body.pos.x, B.z - body.pos.z) < 0.9 && Math.abs(B.y - body.pos.y) < 0.3;
        if (ok) break;
        steer(body.pos, B, how, wish);
        moveBody(body, wish, false, STEP, MAP, events);
        assert.ok(body.pos.y > FLOOR, `${from} → ${to}: fell off`);
        assert.ok(nodeById.get(to).pad || !events.some((e) => e.what === 'pad'), `${from} → ${to}: crosses a pad`);
      }
      assert.ok(ok, `${from} → ${to}`);
    }
  }
  for (const a of NODES) for (const b of NODES) if (!a.pad && !b.pad) assert.ok(route(a.id, b.id), `${a.id} → ${b.id}`);
});

test('a rail goes through everyone in its way, and stops at a wall', () => {
  const arena = new Arena({ bots: 3, seed: 3 });
  const [me, a, b, c] = arena.fighters;
  const put = (f, x, z) => Object.assign(f.body.pos, { x, y: 0, z });
  put(me, 8, 0);
  put(a, 4, -5.5); // (off the line, in the clear)
  put(b, 0, 9.8); // in line, before the pillar
  put(c, -9, 9.8); // in line, behind it
  me.yaw = Math.atan2(8 - 0, 0 - 9.8); // (looking at b, and on past)
  me.pitch = Math.atan2(1.2 - MOVE.eye, Math.hypot(8, 9.8));
  arena.countdown = 0;
  const shot = arena.fire(me);
  assert.deepEqual(
    shot.hits.map((f) => f.name),
    [b.name],
    'b, and not the one behind the pillar',
  );
  assert.ok(!b.alive && a.alive && c.alive && me.reload === RELOAD);
  assert.equal(arena.match.byId.get('you').frags, 1);
  // two in a row: one rail takes both
  const d = new Arena({ bots: 2, seed: 4 });
  const [you, x, y] = d.fighters;
  put(you, -8, 6);
  put(x, -3, 6);
  put(y, 3, 6);
  you.yaw = -Math.PI / 2;
  you.pitch = Math.atan2(1.2 - MOVE.eye, 5);
  assert.equal(d.fire(you).hits.length, 2);
  // and the ray itself: straight down onto the dais, a metre up
  assert.equal(rayBoxes({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, BOXES), 4);
  assert.equal(rayBoxes({ x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 }, BOXES), Infinity);
});

test('the score: a frag each, one taken for a fall, the limit ends it, the lead is called', () => {
  const m = new Match(
    [
      { id: 'you', name: 'You', me: true },
      { id: 'vex', name: 'Vex' },
    ],
    { frags: 3, time: 600 },
  );
  const lead = [];
  let ended = null;
  m.on('lead', (how) => lead.push(how));
  m.on('end', (e) => (ended = e));
  m.frag('vex', 'you');
  m.frag('you', 'vex');
  m.frag('you', 'vex');
  m.frag(null, 'you'); // into the void
  assert.deepEqual(
    m.standings().map((f) => [f.name, f.frags, f.deaths]),
    [
      ['Vex', 1, 2],
      ['You', 1, 2],
    ],
  );
  assert.deepEqual(lead, ['tied', 'taken', 'tied']);
  m.frag('you', 'vex');
  m.frag('you', 'vex');
  assert.ok(m.over && ended && ended.winner.name === 'You');
  m.frag('vex', 'you');
  assert.equal(m.byId.get('you').deaths, 2, 'nothing counts once it is over');
});

test('bots on their own fight it out: they rail each other, and seldom fall', () => {
  const arena = new Arena({ bots: 4, seed: 11, rules: { frags: 10, time: 300 } });
  let rails = 0;
  let falls = 0;
  let pads = 0;
  arena.on('rail', () => rails++);
  arena.on('frag', (e) => e.how === 'void' && falls++);
  arena.on('moved', (f, e) => e.what === 'pad' && pads++);
  const you = { move: { x: 0, y: 0 }, jump: false, fire: false, turn: { yaw: 0, pitch: 0 } };
  for (let t = 0; t < 300 && !arena.over; t += STEP) arena.update(STEP, you);
  assert.ok(arena.over, `someone got to the limit (${arena.match.time.toFixed(0)} s)`);
  assert.ok(rails > 10 && pads > 0, `${rails} rails, ${pads} pads`);
  assert.ok(falls <= 3, `${falls} falls`);
  assert.ok(!arena.match.winner.me, 'and it was not you, who did nothing');
});

test('you: moving, looking, firing, coming back in', () => {
  const arena = new Arena({ bots: 0, seed: 1 });
  const me = arena.me;
  arena.update(5, null); // the countdown
  const y0 = me.yaw;
  const from = { ...me.body.pos };
  const you = { move: { x: 0, y: 1 }, jump: false, fire: false, turn: { yaw: 0.01, pitch: -0.01 } };
  for (let i = 0; i < 30; i++) arena.update(STEP, you);
  assert.ok(Math.abs(me.yaw - (y0 + 0.3)) < 1e-9 && me.pitch < 0, 'the view turns');
  assert.ok(Math.hypot(me.body.pos.x - from.x, me.body.pos.z - from.z) > 2, 'you go the way you look');
  arena.update(STEP, { ...you, move: { x: 0, y: 0 }, fire: true });
  assert.ok(me.reload > 0, 'fired');
  // into the void, and back
  me.body.pos.y = FLOOR - 1;
  arena.update(STEP, null);
  assert.ok(!me.alive && arena.match.byId.get('you').frags === -1);
  for (let i = 0; i < 80; i++) arena.update(STEP, null);
  assert.ok(!me.alive, 'waits for you');
  arena.update(STEP, { ...you, fire: true });
  assert.ok(me.alive && me.body.pos.y > FLOOR, 'back in');
});

// ── The trip ────────────────────────────────────────────────────────────────

test('the trip: aboard, a countdown, up to orbit, and home under the chute', () => {
  const f = new Flight();
  const said = [];
  f.on('phase', (p) => said.push(p));
  f.on('tick', (n) => said.push(n));
  f.on('ignite', () => said.push('ignite'));
  f.on('liftoff', () => said.push('liftoff'));
  f.board();
  for (let t = 0; t < 30; t += STEP) f.update(STEP);
  assert.deepEqual(said, ['boarding', 'countdown', 5, 4, 3, 2, 'ignite', 1, 'climb', 'liftoff', 'orbit']);
  assert.equal(f.rocketUp, 0, 'gone up out of sight');
  assert.ok(climbHeight(FLIGHT.climb) > 400, 'well up into the sky first');
  f.comeHome();
  assert.equal(f.phase, 'home');
  assert.equal(f.glare, 1);
  assert.equal(homeHeight(0), FLIGHT.from);
  for (let t = 0; t < FLIGHT.home + 1; t += STEP) f.update(STEP);
  assert.equal(f.phase, 'ground');
  assert.equal(homeHeight(FLIGHT.home), 0);
});

test('the rocket keeps its chosen destination until it lands', () => {
  const flight = new Flight();
  assert.equal(flight.board('unknown'), false);
  assert.equal(flight.phase, 'ground');
  assert.equal(flight.board('ds9'), true);
  assert.equal(flight.board('orrery'), false);
  for (let i = 0; i < 3; i++) flight.hurry();
  assert.equal(flight.phase, 'orbit');
  assert.equal(flight.destination, 'ds9');
  flight.comeHome();
  flight.hurry();
  assert.equal(flight.destination, null);
  assert.equal(flight.board(), true);
  assert.equal(flight.destination, 'orrery');
});
