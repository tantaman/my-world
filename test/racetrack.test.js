// Race tracks: the circuits close up and never run over themselves; where
// the tracks are (grown from the seed, and pinned, since each is a place on
// the map people track) is beside towns that may have one, inside the town's
// square and clear of what was there first; the racing surface lies over
// the ground; the car goes, stops, turns and is kept in by the barrier; and
// a race runs from the lights to the flag, with the others driving it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { toLocal } from '../src/world/frame.js';
import { Sites } from '../src/landmarks/sites.js';
import { Towns } from '../src/towns/towns.js';
import { Caves } from '../src/caves/caves.js';
import { Lines, clearOfPlaces, clearOfCaves } from '../src/railway/lines.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms } from '../src/world/landforms.js';
import { findSite as findPad, clearOf as padClear } from '../src/spaceport/site.js';
import { findSite as findStore, clearOf as storeClear } from '../src/videostore/site.js';
import { Branches } from '../src/videostore/branches.js';
import { findBuildings, overlaps } from '../src/abandoned/sites.js';
import { Airports } from '../src/airports/airports.js';
import { RING as CLUB_RING, PLAN as CLUB_PLAN } from '../src/huntclub/site.js';
import { mayReach } from '../src/airports/airports.js';
import { LAYOUTS, FOR_STYLE, Circuit, circuitOf, KERB } from '../src/racetrack/layouts.js';
import { clearOf, surfaceOf, surfaceAt, onGrounds, paddockOf, lay, LIFT, CAMBER, PADDOCK } from '../src/racetrack/site.js';
import { Tracks, layoutFor, hasTrack, TRACK } from '../src/racetrack/tracks.js';
import { Car, CAR, GROUND } from '../src/racetrack/car.js';
import { Race, RACE, profile, racingLine, bump } from '../src/racetrack/race.js';
import { matchesGolden } from './helpers/golden.js';
import { earthAtFirst } from './helpers/earth.js';
// The real Earth under the world, as the game has it when it opens (world/earth.js).
const EARTH = await earthAtFirst();

const SEED = 20261119;
const CARDS = HIKES.map(({ load, ...card }) => card);

// ── The circuits ────────────────────────────────────────────────────────────

test('every circuit closes up, bends no tighter than a car can take, and never runs over itself', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) {
    const c = new Circuit(L);
    assert.ok(c.length > 500 && c.length < 800, `${name}: ${c.length.toFixed(0)} m a lap`);
    assert.ok(c.tightest > 17, `${name}: its tightest bend is ${c.tightest.toFixed(1)} m round`);
    // the barriers either side of one part of the lap stay clear of another's
    assert.ok(c.closest() > 2 * c.barrier + 4, `${name}: two parts of the lap come ${c.closest().toFixed(1)} m apart`);
    // round it is a full turn, anticlockwise (left-handers, mostly)
    let turned = 0;
    for (let i = 0; i < c.n; i++) turned += c.k[i] * c.step;
    assert.ok(Math.abs(turned - Math.PI * 2) < 0.05, `${name}: once round, to the left`);
    // the start is on the main straight, along +x at the +z side
    const s0 = c.at(0);
    assert.ok(s0.tx > 0.97 && s0.z > 0, `${name}: the start line is on the main straight`);
    assert.ok(Math.abs(c.bend(0)) < 1 / 200, 'not in a bend');
  }
  assert.deepEqual(Object.keys(FOR_STYLE).sort(), ['village', 'western']);
  for (const list of Object.values(FOR_STYLE)) for (const name of list) assert.ok(LAYOUTS[name], name);
});

test('a point is found on the circuit where it is: how far round, and how far to the left', () => {
  const c = circuitOf('hairpin');
  const p = {};
  const near = {};
  for (let s = 3; s < c.length; s += 37) {
    for (const lat of [-9, -2, 0, 4, 10]) {
      c.at(s, p, lat);
      c.locate(p.x, p.z, near);
      const ds = Math.abs(((near.s - s + c.length * 1.5) % c.length) - c.length / 2);
      assert.ok(ds < 0.6, `round the lap (${s}, ${lat}): ${near.s.toFixed(2)}`);
      assert.ok(Math.abs(near.lat - lat) < 0.15, `to the left (${s}, ${lat}): ${near.lat.toFixed(2)}`);
      // ...and the same looking only near where it was last
      c.locate(p.x, p.z, near, s + 7, 30);
      assert.ok(Math.abs(near.lat - lat) < 0.15);
    }
  }
  // the left of the line is the infield, the right is out
  c.at(100, p, 30);
  assert.ok(c.inside(p.x, p.z), 'left: in');
  c.at(100, p, -30);
  assert.ok(!c.inside(p.x, p.z), 'right: out');
  assert.ok(c.within(p.x, p.z, 20) && !c.within(p.x, p.z, 0), 'out past the barrier');
});

// ── Where they are ──────────────────────────────────────────────────────────

// The world as the game has it: the things the tracks keep clear of, made
// the way their features make them.
function worldOf(land, seed = SEED) {
  const gen = growWorld(seed, [], land, [], EARTH);
  const start = gen.findSpawn(0, 0);
  const landforms = new Landforms(HIKES);
  const keepHike = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const sites = new Sites(gen, { start });
  const caves = new Caves({ gen, keepOff: keepHike });
  const lines = new Lines(gen, { start, keepClear: [clearOfPlaces(sites), clearOfCaves((a, b, c, d) => caves.inBox(a, b, c, d))], keepOff: keepHike });
  const towns = new Towns(gen, { start, sites, keepOff: keepHike });
  const pad = findPad(gen, start, padClear({ landforms, sites, towns, caves, lines }));
  const reserved = storeClear({ landforms, sites, towns, caves, lines, spaceport: pad });
  const store = findStore(gen, start, reserved);
  const airports = new Airports(gen, { cards: CARDS, start, keepOff: (a, b, c, d) => reserved(a, b, c, d) || overlaps([a, b, c, d], pad.box) });
  const field = (box) => airports.regions.some((g) => mayReach(g, Math.hypot((box[0] + box[2]) / 2 - g.x, (box[1] + box[3]) / 2 - g.z), Math.hypot(box[2] - box[0], box[3] - box[1]) / 2) && airports.site(g.id) && overlaps(box, airports.site(g.id).box));
  const branches = new Branches(gen, { towns, keepOff: reserved, also: (...box) => (store && overlaps(box, store.box)) || field(box) });
  const abandoned = findBuildings(gen, start, (...box) => (store && overlaps(box, store.box)) || reserved(...box));
  const startClear = CLUB_RING[1] + Math.hypot(...CLUB_PLAN.slice(2)) + 20;
  const keepOff = clearOf({
    landforms,
    sites,
    towns,
    caves,
    lines,
    spaceport: pad,
    stores: (...box) => [store, ...branches.within(...box)].filter((s) => s && overlaps(s.box, box)),
    airfield: field,
    buildings: (...box) => abandoned.filter((s) => overlaps(s.box, box)),
    start,
    startClear,
  });
  return { gen, start, startClear, sites, caves, lines, towns, keepOff };
}

let found = null; // the tracks round the start, found once for the tests that look at them
function tracksRound() {
  if (found) return found;
  const w = worldOf(LANDS[0]);
  const tracks = new Tracks(w.gen, { towns: w.towns, keepOff: w.keepOff });
  const list = [];
  let rolled = 0;
  for (let j = -4; j < 4; j++) {
    for (let i = -4; i < 4; i++) {
      const t = w.towns.cell(i, j);
      if (!t) continue;
      if (hasTrack(t, w.gen.seed)) rolled++;
      const s = tracks.forTown(t);
      if (s) list.push({ t, s, cell: [i, j] });
    }
  }
  found = { ...w, tracks, list, rolled };
  return found;
}

test('tracks stand beside some of the towns people live in, inside the town’s square, clear of what was there first, and are pinned', () => {
  const { gen, tracks, list, rolled, start, startClear, towns } = tracksRound();
  assert.ok(list.length >= 3, `there are some (${list.length} of the ${rolled} towns that might)`);
  const pinned = {};
  for (const { t, s, cell } of list) {
    const L = layoutFor(t, gen.seed);
    assert.equal(s.layout, L, `${s.name}: the layout its town's seed says`);
    assert.ok(FOR_STYLE[t.style].includes(L) && t.people > 0, `${s.name}: beside a ${t.style} town people live in`);
    assert.equal(s.id, `racetrack:${t.id}`);
    assert.ok(s.name.startsWith(t.name), 'named for its town');
    const S = towns.size;
    assert.ok(s.box[0] >= cell[0] * S && s.box[2] <= (cell[0] + 1) * S && s.box[1] >= cell[1] * S && s.box[3] <= (cell[1] + 1) * S, 'inside its town’s square');
    assert.ok(!overlaps(s.box, t.box), 'off its town');
    assert.ok(!towns.within(...s.box).some((o) => o !== t && overlaps(o.box, s.box)), 'and off any other');
    // the paddock's side faces the town, more or less
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const d = Math.hypot(t.x - s.x, t.z - s.z);
    assert.ok((fx * (t.x - s.x) + fz * (t.z - s.z)) / d > 0.9, 'its paddock towards the town');
    // well away from the start, where the hunt club may be
    const dx = Math.max(s.box[0] - start.x, 0, start.x - s.box[2]);
    const dz = Math.max(s.box[1] - start.z, 0, start.z - s.box[3]);
    assert.ok(Math.hypot(dx, dz) >= startClear, 'out of the hunt club’s ring');
    assert.equal(tracks.byId(s.id), s, 'found again by its id');
    const round = (v) => Math.round(v * 1000) / 1000;
    pinned[s.id] = { name: s.name, layout: s.layout, x: round(s.x), z: round(s.z), yaw: round(s.yaw) };
  }
  // most of the towns that might have one find somewhere for it, but not all: the land decides
  assert.ok(list.length >= rolled * 0.3, 'a fair share of the towns that might have one');
  assert.ok(TRACK.chance < 1);
  matchesGolden(`racetrack-${SEED}`, pinned, { tolerance: 1e-6 });
});

test('a track keeps the old places, the mouths of caves and the railway off its grounds', () => {
  const { list, sites, caves, lines } = tracksRound();
  for (const { s } of list) {
    const c = circuitOf(s.layout);
    const pad = paddockOf(c);
    const [x0, z0, x1, z1] = s.box;
    const l = { x: 0, z: 0 };
    for (const o of sites.within(x0, z0, x1, z1)) {
      for (const [u, v] of [[o.box[0], o.box[1]], [o.box[2], o.box[3]], [(o.box[0] + o.box[2]) / 2, (o.box[1] + o.box[3]) / 2]]) {
        toLocal(s, u, v, l);
        assert.ok(!onGrounds(c, pad.rect, l.x, l.z, 0, false), `${s.name}: ${o.name} is off its grounds`);
      }
    }
    for (const cave of caves.inBox(x0, z0, x1, z1)) {
      toLocal(s, cave.mouth.x, cave.mouth.z, l);
      assert.ok(!onGrounds(c, pad.rect, l.x, l.z, 0, false), `${s.name}: a cave's mouth is off its grounds`);
    }
    for (const line of lines.within(x0, z0, x1, z1)) {
      for (let i = 0; i < line.x.length; i += 3) {
        toLocal(s, line.x[i], line.z[i], l);
        assert.ok(!onGrounds(c, pad.rect, l.x, l.z, 0, true), `${s.name}: the railway keeps out of it, and its infield`);
      }
    }
  }
});

test('a track is the same looked for a little at a time, waiting on the railway', () => {
  const { gen, towns, keepOff, list } = tracksRound();
  const { t, s } = list[0];
  let asked = 0;
  const slow = (...box) => keepOff(...box);
  slow.points = keepOff.points;
  slow.ready = () => ++asked > 3;
  const bit = new Tracks(gen, { towns, keepOff: slow });
  assert.equal(bit.peek(t), undefined, 'not known at first');
  let rounds = 0;
  while (bit.pump(1) > 0) rounds++;
  assert.ok(rounds > 1 && asked > 3, 'it took a while');
  assert.deepEqual(bit.peek(t), s);
});

test('the racing surface lies over the ground all the way round, leaning no more than a camber', () => {
  const { gen, list } = tracksRound();
  const ground = (x, z) => gen.height(x, z);
  for (const { s } of list) {
    const c = circuitOf(s.layout);
    const surface = surfaceOf(s, ground);
    const p = {};
    const w = c.half + KERB;
    let over = Infinity;
    let grade = 0;
    for (let i = 0; i < c.n; i++) {
      assert.ok(Math.abs(surface.fall[i]) <= CAMBER + 1e-9, 'a camber, no more');
      for (const lat of [-w, -w / 2, 0, w / 2, w]) {
        c.at(i * c.step, p, lat);
        const wx = s.x + p.x * Math.cos(s.yaw) + p.z * Math.sin(s.yaw);
        const wz = s.z - p.x * Math.sin(s.yaw) + p.z * Math.cos(s.yaw);
        over = Math.min(over, surfaceAt(c, surface, i * c.step, lat) - ground(wx, wz));
      }
      grade = Math.max(grade, Math.abs(surface.mid[(i + 1) % c.n] - surface.mid[i]) / c.step);
    }
    assert.ok(over > LIFT * 0.5, `${s.name}: over the ground everywhere (${over.toFixed(2)} m at the least)`);
    assert.ok(grade < 0.22, `${s.name}: never too steep along the lap (${grade.toFixed(3)})`);
  }
  // laid over a hump, it rises over it and comes down again evenly
  const n = 60;
  const g = [0, 1, 2].map(() => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) g[j][i] = i > 25 && i < 30 ? 2 : 0;
  const laid = lay(g, [-5, 0, 5], 2);
  for (let i = 0; i < n; i++) assert.ok(laid.mid[i] >= g[1][i] + LIFT - 1e-9);
  assert.ok(laid.fill > 1 && laid.grade < 0.3, 'banked up either side of the hump');
});

// ── The car ─────────────────────────────────────────────────────────────────

// A flat world: a long straight road along +z, `half` wide, and the barrier
// `wall` m out either side.
function straight({ half = 6, wall = 13, kind = 'asphalt' } = {}) {
  return {
    under(x, z, out) {
      const d = Math.abs(x);
      out.y = 0;
      out.kind = d <= half ? kind : d <= half + KERB ? 'kerb' : 'grass';
      out.wall = d > wall - CAR.half ? { nx: -Math.sign(x), nz: 0, depth: d - (wall - CAR.half) } : null;
    },
  };
}
function drive(car, world, secs, controls) {
  for (let t = 0; t < secs; t += 1 / 60) car.step(1 / 60, controls, world);
}

test('the car gets up to speed, tops out, stops, and backs up', () => {
  const world = straight();
  const car = new Car();
  car.place(0, 0, 0, world);
  let t = 0;
  while (car.speed < 100 / 3.6 && t < 20) {
    car.step(1 / 60, { throttle: 1 }, world);
    t += 1 / 60;
  }
  assert.ok(t > 2.5 && t < 5, `0–100 km/h in ${t.toFixed(1)} s`);
  assert.ok(Math.abs(car.x) < 0.01 && car.z > 30, 'straight down the road');
  drive(car, world, 40, { throttle: 1 });
  assert.ok(car.speed > CAR.top * 0.85 && car.speed < CAR.top, `flat out: ${car.kmh.toFixed(0)} km/h`);
  const from = car.z;
  drive(car, world, 0.1, { brake: 1 });
  let s = 0;
  while (car.speed > 0.01 && s < 20) {
    car.step(1 / 60, { brake: 1 }, world);
    s += 1 / 60;
  }
  assert.ok(car.z - from < 120, `stops in ${(car.z - from).toFixed(0)} m`);
  drive(car, world, 3, { brake: 1 });
  assert.ok(car.speed < 0 && car.speed >= -CAR.reverse, 'held on, it backs up');
  // held on the grid, it goes nowhere however hard you press
  const held = new Car();
  held.place(0, 0, 0, world);
  held.held = true;
  drive(held, world, 2, { throttle: 1 });
  assert.equal(held.z, 0);
  assert.ok(held.rpm > 0.5, '...but it revs');
});

test('the faster it goes the wider it turns, and the grass slows it down', () => {
  const circle = (speed) => {
    const world = straight({ wall: 1e6 });
    const car = new Car();
    car.place(0, 0, 0, world);
    drive(car, world, 30, { throttle: 1 });
    while (car.speed > speed) car.step(1 / 60, { brake: 1 }, world);
    let yaw0 = car.yaw;
    let far = 0;
    const at = { x: car.x, z: car.z };
    for (let t = 0; t < 4; t += 1 / 60) {
      car.step(1 / 60, { steer: 1, throttle: car.speed < speed ? 1 : 0 }, world);
      far = Math.max(far, Math.hypot(car.x - at.x, car.z - at.z));
    }
    return { turned: car.yaw - yaw0, far };
  };
  const slow = circle(10);
  const fast = circle(35);
  assert.ok(slow.turned > 0, 'steering left turns it left');
  assert.ok(fast.far > slow.far * 1.8, 'wider, faster');
  // on the grass
  const world = straight({ half: 0.1, wall: 1e6 });
  const car = new Car();
  car.place(5, 0, 0, world);
  drive(car, world, 20, { throttle: 1 });
  assert.equal(car.kind, 'grass');
  assert.ok(car.speed < GROUND.grass.top + 0.5, `bogged down: ${car.kmh.toFixed(0)} km/h`);
});

test('the barrier keeps it in, stops it hard and bounces it off', () => {
  const world = straight();
  const car = new Car();
  car.place(0, 0, Math.PI / 4, world); // angled at the left-hand barrier... (+x)
  let hits = 0;
  let worst = 0;
  car.on('bump', (v) => {
    hits++;
    worst = Math.max(worst, v);
  });
  drive(car, world, 4, { throttle: 1 });
  assert.ok(hits > 0 && worst > 5, `it hits it (${worst.toFixed(1)} m/s)`);
  assert.ok(car.x < 13 - CAR.half + 0.01, 'and stays inside');
  // the handbrake steps the back out: it slides
  const slide = new Car();
  slide.place(0, 0, 0, straight({ wall: 1e6 }));
  drive(slide, straight({ wall: 1e6 }), 4, { throttle: 1 });
  let most = 0;
  for (let t = 0; t < 1; t += 1 / 60) {
    slide.step(1 / 60, { steer: 1, handbrake: true }, straight({ wall: 1e6 }));
    most = Math.max(most, Math.abs(slide.slide));
  }
  assert.ok(most > 3, `sliding sideways (${most.toFixed(1)} m/s)`);
});

// ── A race ──────────────────────────────────────────────────────────────────

// A circuit for the car to drive on, flat, as index.js makes one over a
// track's surface.
function onCircuit(c, surface) {
  let hint = null;
  const near = {};
  return {
    set hint(s) {
      hint = s;
    },
    under(x, z, out) {
      c.locate(x, z, near, hint, 30);
      out.y = 0;
      out.kind = near.d <= c.half ? surface : near.d <= c.half + KERB ? 'kerb' : 'grass';
      const most = c.barrier - CAR.half - 0.2;
      if (near.d > most) {
        const p = c.at(near.s);
        const side = Math.sign(near.lat);
        out.wall = { nx: -side * p.tz, nz: side * p.tx, depth: near.d - most };
      } else out.wall = null;
    },
  };
}

// Someone driving: round the racing line, at `pace` of the fastest it could go.
function racer(c, race, surface, pace, slot = RACE.rivals) {
  const world = onCircuit(c, surface);
  const car = new Car();
  const g = race.grid(slot);
  const p = c.at(g.run, {}, g.lat);
  car.place(p.x, p.z, Math.atan2(p.tx, p.tz), world);
  const fast = profile(c, surface);
  const here = {};
  const ahead = {};
  let hint = c.wrap(g.run);
  return {
    car,
    step(dt) {
      car.held = race.state === 'lights';
      c.locate(car.x, car.z, here, hint, 40);
      hint = here.s;
      world.hint = hint;
      const v = Math.max(0, car.speed);
      c.at(here.s + 6 + v * 0.45, ahead, 0);
      let a = Math.atan2(ahead.x - car.x, ahead.z - car.z) - car.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const want = fast[Math.floor(c.wrap(here.s + v * 0.6) / c.step) % c.n] * pace;
      car.step(dt, { steer: Math.max(-1, Math.min(1, a * 3)), throttle: v < want ? 1 : 0, brake: v > want + 1.5 ? 1 : 0 }, world);
      c.locate(car.x, car.z, here, hint, 40);
      race.follow(here.s, here.lat, car.speed);
      race.update(dt);
      for (const o of race.cars) {
        if (o.you) continue;
        const q = c.at(o.run, {}, o.lat);
        const them = { x: q.x, z: q.z, yaw: Math.atan2(q.tx, q.tz), vx: q.tx * o.v, vz: q.tz * o.v, push: 0 };
        if (bump(car, them)) o.push += them.push;
      }
    },
  };
}

test('the lights come on one a second, and go out a moment after the last', () => {
  const race = new Race(circuitOf('oval'), { surface: 'dirt', seed: 3 });
  const lit = [];
  let went = null;
  race.on('light', (n) => lit.push([n, race.clock]));
  race.on('go', () => (went = race.clock));
  for (let t = 0; t < 10 && went === null; t += 0.05) race.update(0.05);
  assert.deepEqual(lit.map(([n]) => n), [1, 2, 3, 4, 5]);
  for (let i = 1; i < lit.length; i++) assert.ok(Math.abs(lit[i][1] - lit[i - 1][1] - RACE.every) < 0.06, 'a second apart, near enough');
  const hold = went - lit[4][1];
  assert.ok(hold >= RACE.hold[0] - 0.06 && hold <= RACE.hold[1] + 0.06, `held ${hold.toFixed(2)} s, then out`);
  assert.equal(race.state, 'racing');
  // nobody moved before then
  assert.ok(race.cars.every((c) => c.run < 0));
});

test('a race runs from the lights to the flag on every circuit: quicker drivers come home first', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) {
    const c = circuitOf(name);
    const race = new Race(c, { surface: L.surface, seed: 11 });
    const me = racer(c, race, L.surface, 0.97);
    const laps = [];
    let finished = null;
    race.on('lap', (car, n, time) => car.you && laps.push(time));
    race.on('finish', (car, place) => car.you && (finished = place));
    let off = 0;
    for (let t = 0; t < 300 && race.state !== 'done'; t += 1 / 60) {
      me.step(1 / 60);
      for (const o of race.cars) if (!o.you && Math.abs(o.lat) > c.half + 0.01) off++;
    }
    assert.equal(race.state, 'done', `${name}: everyone home`);
    assert.equal(laps.length, RACE.laps, `${name}: three laps`);
    assert.ok(laps[1] > 15 && laps[1] < 45, `${name}: a lap in ${laps[1].toFixed(1)} s`);
    assert.ok(finished >= 1 && finished <= 3, `${name}: driven well from the back, you come home near the front (${finished})`);
    assert.equal(off, 0, `${name}: the others keep to the racing surface`);
    const places = race.standings().map((x) => x.place);
    assert.deepEqual([...places].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6], 'one each');
    // of the others, the quicker generally beat the slower
    const others = race.standings().filter((x) => !x.you);
    assert.ok(others[0].pace >= others[others.length - 1].pace, `${name}: the quickest of them ahead of the slowest`);
  }
});

test('driving slowly, you come last; and backing up over the line doesn’t count a lap', () => {
  const c = circuitOf('kidney');
  const race = new Race(c, { surface: 'asphalt', seed: 5 });
  const me = racer(c, race, 'asphalt', 0.6);
  for (let t = 0; t < 400 && race.state !== 'done'; t += 1 / 60) me.step(1 / 60);
  assert.equal(race.you.place, 6, 'last');
  // round the lap and back again
  const r = new Race(c, { surface: 'asphalt', seed: 5 });
  for (let t = 0; t < 7; t += 0.05) r.update(0.05);
  const start = c.wrap(r.you.run);
  for (let k = 1; k <= 20; k++) r.follow(c.wrap(start + k), 0, 5);
  for (let k = 19; k >= -10; k--) r.follow(c.wrap(start + k), 0, -5);
  r.update(0.05);
  assert.equal(r.you.laps, 0);
  assert.ok(r.you.run < 0, 'behind the line again');
});

test('the others pull out to pass someone slower, and coming together shoves you both', () => {
  const c = circuitOf('oval');
  const line = racingLine(c);
  assert.ok(line.every((v) => Math.abs(v) <= c.half - RACE.slack + 1e-9), 'the line is on the racing surface');
  // you, stopped in the middle of the track: they all go by
  const race = new Race(c, { surface: 'dirt', seed: 9 });
  for (let t = 0; t < 7; t += 0.05) race.update(0.05);
  race.you.run = 200;
  race.you.lat = 0;
  for (let t = 0; t < 40; t += 1 / 30) {
    race.you.run = 200;
    race.update(1 / 30);
  }
  assert.ok(race.cars.filter((x) => !x.you).every((x) => x.run > 220), 'all of them past you');
  // two cars nose to tail, yours going faster: you bounce back, they're shoved on
  const you = { x: 0, z: 0, yaw: 0, vx: 0, vz: 20 };
  const them = { x: 0, z: 3, yaw: 0, vx: 0, vz: 10, push: 0 };
  const moved = bump(you, them);
  assert.ok(moved > 0, 'they touch');
  assert.ok(you.vz < 20 && them.push > 0, 'you slow, they’re shoved along');
  assert.equal(bump({ x: 0, z: 0, yaw: 0, vx: 0, vz: 0 }, { x: 0, z: 10, yaw: 0, vx: 0, vz: 0 }), 0, 'apart, nothing');
});

test('the paddock sits off the circuit, towards the town, with your car on the apron', () => {
  for (const name of Object.keys(LAYOUTS)) {
    const c = circuitOf(name);
    const pad = paddockOf(c);
    const sx = c.layout.start;
    const at = (r) => [sx + r[0], pad.zb + r[1], sx + r[2], pad.zb + r[3]];
    for (const r of [PADDOCK.stand, PADDOCK.pits, PADDOCK.apron]) {
      const [x0, z0, x1, z1] = at(r);
      for (const [u, v] of [[x0, z0], [x1, z0], [(x0 + x1) / 2, z0]]) assert.ok(c.locate(u, v, {}).d >= c.barrier - 0.01, `${name}: outside the barrier`);
    }
    const car = { x: sx + PADDOCK.car.x, z: pad.zb + PADDOCK.car.z };
    const [ax0, az0, ax1, az1] = at(PADDOCK.apron);
    assert.ok(car.x > ax0 + 3 && car.x < ax1 - 3 && car.z > az0 + 2 && car.z < az1 - 2, `${name}: your car on the apron`);
    const [px0, , px1] = at(PADDOCK.pits);
    const [sx0] = at(PADDOCK.stand);
    const gate = sx + PADDOCK.gate.x;
    assert.ok(gate > px1 && gate < sx0, `${name}: the gate between the pits and the grandstand`);
    assert.ok(px0 < car.x, 'the pits behind your car');
  }
});
