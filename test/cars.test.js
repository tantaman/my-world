// Cars: how one drives (on made-up ground, so each rule can be seen alone),
// what it looks like, and where the dealerships are (grown from the seed
// beside a town's road, and pinned, since each is a place people track).

import test from 'node:test';
import assert from 'node:assert/strict';
import { Car, GRAVITY } from '../src/cars/drive.js';
import { KINDS, KIND_IDS, priceOf } from '../src/cars/kinds.js';
import { CarModel } from '../src/cars/models.js';
import { Dealers, hasDealer, lotTop, clearOf, LOT, SKIRT, DEALER } from '../src/cars/dealers.js';
import { buildLot } from '../src/cars/lot.js';
import { nearest, WIDE } from '../src/roads/roads.js';
import { onPlan, toWorld } from '../src/world/frame.js';
import { KINDS as TOWN_KINDS } from '../src/towns/kinds.js';
import { LANDS } from '../src/world/lands.js';
import { roadsWorld } from './helpers/roadsWorld.js';
import { matchesGolden } from './helpers/golden.js';

const SEED = 20261119;

// ── Driving ─────────────────────────────────────────────────────────────────

// Ground for a car: flat (or sloping `grade` up toward +z), of one kind, with
// water past `wetFrom` (z) and a trunk at `tree`.
function land({ kind = 'paved', grade = 0, wetFrom = Infinity, depth = 1, tree = null } = {}) {
  return {
    at(x, z, out) {
      out.y = z * grade;
      out.kind = kind;
      out.water = z > wetFrom ? depth : 0;
      return out;
    },
    hit(x, y, z, r, out) {
      if (!tree) return false;
      const dx = x - tree.x;
      const dz = z - tree.z;
      const d = Math.hypot(dx, dz);
      if (d >= r + 0.3) return false;
      out.nx = dx / d;
      out.nz = dz / d;
      out.depth = r + 0.3 - d;
      out.what = 'a tree';
      return true;
    },
  };
}
const drive = (car, seconds, c) => {
  for (let t = 0; t < seconds; t += 1 / 60) car.step(1 / 60, { throttle: 0, brake: 0, steer: 0, ...c });
};

test('it pulls away, and runs up to its top speed on tarmac', () => {
  for (const kind of KIND_IDS) {
    const car = new Car(kind, land());
    car.place(0, 0, 0);
    drive(car, 3, { throttle: 1 });
    assert.ok(car.v > 6 && car.z > 8, `${kind} pulls away (${car.v.toFixed(1)} m/s)`);
    drive(car, 60, { throttle: 1 });
    assert.ok(car.v > KINDS[kind].top * 0.85 && car.v <= KINDS[kind].top + 0.01, `${kind} nears its top speed (${car.v.toFixed(1)} of ${KINDS[kind].top})`);
    assert.ok(Math.abs(car.x) < 1e-6, 'straight on, steering straight');
  }
});

test('the brakes stop it, held at a standstill it backs up, and let go it stands', () => {
  const car = new Car('meridian', land());
  car.place(0, 0, 0);
  drive(car, 6, { throttle: 1 });
  const fast = car.v;
  let t = 0;
  while (car.v > 0.3 && t < 10) {
    car.step(1 / 60, { throttle: 0, brake: 1, steer: 0 });
    t += 1 / 60;
  }
  assert.ok(t < fast / KINDS.meridian.brake + 0.6, `stops in ${t.toFixed(2)} s from ${fast.toFixed(1)} m/s`);
  drive(car, 4, { brake: 1 });
  assert.ok(car.v < -2 && car.v >= -KINDS.meridian.reverse - 0.01, `backs up (${car.v.toFixed(1)} m/s)`);
  drive(car, 8, {});
  assert.ok(Math.abs(car.v) < 0.5, 'and rolls to a stop');
  drive(car, 2, {});
  assert.equal(car.v, 0, 'and stands');
});

test('it turns as tightly as its wheels allow at a crawl, and no tighter than its grip at speed', () => {
  const k = KINDS.wren;
  const slow = new Car('wren', land());
  slow.place(0, 0, 0);
  drive(slow, 2, { throttle: 0.3 });
  const v = slow.v;
  const yaw0 = slow.yaw;
  drive(slow, 0.5, { throttle: 0, steer: 1 });
  const rate = (slow.yaw - yaw0) / 0.5;
  assert.ok(rate > 0, 'steering right turns it right');
  assert.ok(rate <= (v * Math.tan(k.steer)) / k.base + 0.05, 'no tighter than its wheels');
  const fast = new Car('wren', land());
  fast.place(0, 0, 0);
  drive(fast, 20, { throttle: 1 });
  const y1 = fast.yaw;
  drive(fast, 1, { throttle: 1, steer: 1 });
  const lateral = ((fast.yaw - y1) / 1) * fast.v;
  assert.ok(lateral <= k.grip * 1.02, `round a bend at ${fast.v.toFixed(0)} m/s: ${lateral.toFixed(1)} m/s² of grip`);
});

test('off the road it goes only as fast as it can take the rough; a four-by-four much faster', () => {
  const top = (kind, ground) => {
    const car = new Car(kind, land({ kind: ground }));
    car.place(0, 0, 0);
    drive(car, 40, { throttle: 1 });
    return car.v;
  };
  assert.ok(top('meridian', 'ground') < top('meridian', 'gravel'));
  assert.ok(top('meridian', 'gravel') < top('meridian', 'paved'));
  assert.ok(top('bramble', 'ground') > top('meridian', 'ground') * 1.5, 'the Bramble off the road');
});

test('up a slope gravity holds it back; past the steepest it can climb it rolls back', () => {
  const climb = (kind, grade) => {
    const car = new Car(kind, land({ grade }));
    car.place(0, 0, 0);
    drive(car, 8, { throttle: 1 });
    return car.z;
  };
  assert.ok(climb('meridian', 0.1) > 0 && climb('meridian', 0.1) < climb('meridian', 0), 'slower up a hill');
  assert.ok(climb('meridian', 0.45) <= 0.5, 'the Meridian can’t climb one in two');
  assert.ok(climb('bramble', 0.45) > 20, 'the Bramble can');
  // standing on a hill, on its brakes, it stays put
  const car = new Car('wren', land({ grade: 0.15 }));
  car.place(0, 0, 0);
  drive(car, 3, {});
  assert.ok(Math.abs(car.z) < 0.01, 'stands on its brakes');
  assert.ok(Math.abs(Math.tan(car.pitch) - 0.15) < 0.01, 'tipped up the hill');
  void GRAVITY;
});

test('it won’t drive into water deeper than it can wade; a stream it can', () => {
  const deep = new Car('wren', land({ wetFrom: 10, depth: 0.8 }));
  deep.place(0, 0, 0);
  let warned = 0;
  deep.on('deep', () => warned++);
  drive(deep, 10, { throttle: 1 });
  assert.ok(deep.z < 10, `stops at the water (${deep.z.toFixed(1)})`);
  assert.ok(warned > 0);
  const ford = new Car('bramble', land({ wetFrom: 10, depth: 0.5 }));
  ford.place(0, 0, 0);
  drive(ford, 10, { throttle: 1 });
  assert.ok(ford.z > 20, 'the Bramble fords it');
});

test('it stops against a tree, with a bump', () => {
  const car = new Car('ridgeback', land({ tree: { x: 0, z: 40 } }));
  car.place(0, 0, 0);
  const bumps = [];
  car.on('bump', (v, what) => bumps.push([v, what]));
  drive(car, 10, { throttle: 1 });
  assert.ok(car.z < 40 - KINDS.ridgeback.len / 2 + 0.5, 'not through it');
  assert.ok(bumps.length && bumps[0][0] > 5 && bumps[0][1] === 'a tree', 'a bump, at speed');
});

test('over a crest taken fast it leaves the ground, and comes down again', () => {
  // a ramp up to z = 30, then a drop
  const ground = land();
  ground.at = (x, z, out) => {
    out.y = z < 30 ? z * 0.12 : 0;
    out.kind = 'paved';
    out.water = 0;
    return out;
  };
  const car = new Car('meridian', ground);
  car.place(0, 0, 0);
  let flew = false;
  let landed = 0;
  car.on('land', () => landed++);
  for (let t = 0; t < 8; t += 1 / 60) {
    car.step(1 / 60, { throttle: 1, brake: 0, steer: 0 });
    if (car.flying) flew = true;
  }
  assert.ok(flew && landed > 0);
  assert.ok(Math.abs(car.y) < 0.2, 'back on the ground');
});

test('a step up, a kerb or the edge of a lot, is a nudge, not a launch', () => {
  const ground = land();
  ground.at = (x, z, out) => {
    out.y = z > 20 ? 0.35 : 0;
    out.kind = 'paved';
    out.water = 0;
    return out;
  };
  const car = new Car('meridian', ground);
  car.place(0, 0, 0);
  let most = 0;
  for (let t = 0; t < 6; t += 1 / 60) {
    car.step(1 / 60, { throttle: 1, brake: 0, steer: 0 });
    most = Math.max(most, car.y - (car.z > 20 ? 0.35 : 0));
  }
  assert.ok(car.z > 40, 'over it');
  assert.ok(most < 0.4, `it rose no more than ${most.toFixed(2)} m over the ground`);
});

// ── What they look like ─────────────────────────────────────────────────────

test('every car can be made, in each of its colours, with four wheels and a seat inside it', () => {
  for (const kind of KIND_IDS) {
    const k = KINDS[kind];
    assert.ok(k.paints.length >= 3 && k.price > 0 && priceOf(kind).startsWith('$'));
    for (const paint of k.paints) {
      const m = new CarModel(kind, paint, {});
      assert.equal(m.wheels.length, 4);
    }
    const m = new CarModel(kind, k.paints[0], {});
    m.place({ x: 100, y: 5, z: -40, yaw: 0.5, pitch: 0, roll: 0, steer: 0.2, spin: 1 });
    const seat = m.seat({});
    assert.ok(Math.hypot(seat.x - 100, seat.z + 40) < k.len / 2, 'the seat is in the car');
    assert.ok(seat.y > 5 + k.clear && seat.y < 5 + k.tall, 'between its floor and its roof');
    const door = m.door({});
    assert.ok(Math.hypot(door.x - 100, door.z + 40) > k.wide / 2, 'the door is outside it');
    m.object.geometry?.dispose?.();
  }
});

// ── Where the dealerships are ───────────────────────────────────────────────

function dealersOf(seed, land = 1) {
  const w = roadsWorld(seed, land);
  const keepOff = clearOf({ gen: w.gen, reaches: w.keepHike, clear: w.there.clear, lines: w.lines, towns: w.towns });
  return { ...w, dealers: new Dealers(w.gen, { towns: w.towns, roads: w.roads, keepOff, ready: w.there.ready }) };
}

test('only towns that are kept up can have one: western towns and villages', () => {
  const { towns } = roadsWorld(SEED, 1);
  let some = 0;
  for (let j = -3; j < 3; j++) for (let i = -3; i < 3; i++) {
    const t = towns.cell(i, j);
    if (!t) continue;
    const K = TOWN_KINDS[t.kind];
    if (hasDealer(t, SEED)) {
      some++;
      assert.ok(!K.abandoned && K.style !== 'creepy', `${t.name}, a ${t.kind}`);
    }
  }
  assert.ok(some > 0 && DEALER.chance < 1);
});

test('a dealership stands beside its town’s road, on flat dry ground, clear of everything else', () => {
  const { dealers, towns, roads, gen } = dealersOf(SEED);
  const found = [];
  for (let j = -2; j < 2; j++) for (let i = -2; i < 2; i++) {
    const t = towns.cell(i, j);
    if (!t) continue;
    const d = dealers.forTown(t);
    if (!d) continue;
    found.push(d);
    assert.ok(hasDealer(t, SEED));
    const road = roads.byId(d.road);
    assert.ok(road && (road.from === t.id || road.to === t.id), `${d.name} is on one of ${t.name}’s roads`);
    // its front is just off the road
    const front = toWorld(d, 0, LOT[3]);
    const at = {};
    assert.ok(nearest(road, front.x, front.z, at) && at.d > WIDE && at.d < WIDE + 2.5, `${d.name}’s lot fronts the road (${at.d.toFixed(2)} m)`);
    // no road over the lot
    for (const r of roads.within(...d.box)) {
      for (let u = LOT[0]; u <= LOT[2]; u += 3) for (let v = LOT[1]; v <= LOT[3] - 1; v += 3) {
        const p = toWorld(d, u, v);
        assert.ok(!(nearest(r, p.x, p.z, at) && at.d < WIDE), `${r.id} doesn’t run over ${d.name}`);
      }
    }
    // flat and dry
    let lo = Infinity;
    let hi = -Infinity;
    for (let u = LOT[0]; u <= LOT[2]; u += 6) for (let v = LOT[1]; v <= LOT[3]; v += 6) {
      const p = toWorld(d, u, v);
      const h = gen.height(p.x, p.z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      assert.ok(gen.water.edge > 0, 'out of the water');
    }
    assert.ok(hi - lo < 3.2 && d.top >= hi, `${d.name} on flat ground, its top over it`);
    // its top, and its sides sloping to the ground
    assert.equal(lotTop(d, d.x, d.z, (x, z) => gen.height(x, z)), d.top);
    const edge = toWorld(d, LOT[2] + SKIRT / 2, 0);
    const side = lotTop(d, edge.x, edge.z, (x, z) => gen.height(x, z));
    assert.ok(side !== null && side < d.top && side >= gen.height(edge.x, edge.z) - 1e-9);
    assert.equal(dealers.byId(d.id), d);
  }
  assert.ok(found.length >= 1, `some near the middle (${found.length})`);
});

for (const land of LANDS) for (const seed of [SEED, 42]) {
  test(`seed ${seed}${land > 1 ? ` on land ${land}` : ''}: where the dealerships are`, () => {
    const { dealers, towns } = dealersOf(seed, land);
    const round = (v) => Math.round(v * 1000) / 1000;
    const list = [];
    for (let j = -3; j < 3; j++) for (let i = -3; i < 3; i++) {
      const t = towns.cell(i, j);
      const d = t && dealers.forTown(t);
      if (d) list.push({ id: d.id, name: d.name, road: d.road, x: round(d.x), z: round(d.z), yaw: round(d.yaw), top: round(d.top) });
    }
    matchesGolden(land > 1 ? `dealers-${seed}-land${land}` : `dealers-${seed}`, list, { tolerance: 1e-6 });
  });
}

test('a dealership looks like one: the lot, the showroom, a bay for each kind of car', () => {
  const { dealers, towns, gen } = dealersOf(SEED);
  let d = null;
  for (let j = -2; j < 2 && !d; j++) for (let i = -2; i < 2 && !d; i++) {
    const t = towns.cell(i, j);
    d = t && dealers.forTown(t);
  }
  const built = buildLot(d, (x, z) => gen.height(x, z), {});
  assert.equal(built.bays.length, KIND_IDS.length);
  assert.ok(built.solids.length > 10, 'you can walk on it, and bump into the showroom');
  for (const s of built.solids) assert.ok(Number.isFinite(s.topA) && Number.isFinite(s.bottom));
  for (const bay of built.bays) assert.ok(bay.x > LOT[0] && bay.x < LOT[2] && bay.z > LOT[1] && bay.z < LOT[3], 'its cars stand on the lot');
});
