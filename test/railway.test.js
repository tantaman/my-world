// The railways: where they run is grown from the seed (so everyone in a
// world rides the same line), they keep to what a railway can do (gentle
// grades, curves a train can take, never under the ground or in the water),
// they keep clear of the old places, the caves' mouths and the start, and
// the trains keep a timetable that puts every train in the same place for
// everyone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { Sites, onPlan } from '../src/landmarks/sites.js';
import { Lines, CELL, DS, GRADE, BED, PLATFORM, clearOfPlaces, clearOfCaves, pointAt, nearest, ahead } from '../src/railway/lines.js';
import { Caves } from '../src/caves/caves.js';
import { CAVE } from '../src/caves/sites.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms, reachOf } from '../src/world/landforms.js';
import { Timetable, TRAIN_LEN, DWELL, SPEED } from '../src/railway/timetable.js';
import { segDist } from '../src/core/geom.js';
import { matchesGolden } from './helpers/golden.js';

const _s = { d: 0, t: 0, nx: 0, nz: 0 };

const SEED = 20261119;
// the squares surveyed: the four round the middle of the world
const SQUARES = [-1, 0];

// Real land, told from the hikes' cards alone (their land is never fetched
// here): no line, nor cave, is grown within its reach.
const landforms = new Landforms(HIKES);
const keepOff = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
// The caves in a rectangle, the way the game finds them.
function cavesOf(gen) {
  const caves = new Caves({ gen, keepOff });
  return (x0, z0, x1, z1) => caves.inBox(x0, z0, x1, z1);
}
// Lines on a world, kept clear of what the game keeps them clear of.
function linesOn(gen, sites = new Sites(gen), caves = cavesOf(gen)) {
  return new Lines(gen, { keepClear: [clearOfPlaces(sites), clearOfCaves(caves)], keepOff });
}

const WORLDS = LANDS.map((land) => {
  const gen = growWorld(SEED, [], land);
  const sites = new Sites(gen);
  const caves = cavesOf(gen);
  const lines = linesOn(gen, sites, caves);
  const all = [];
  for (const cj of SQUARES) for (const ci of SQUARES) {
    const l = lines.cell(ci, cj);
    if (l) all.push(l);
  }
  return { land, on: land > 1 ? ` (land ${land})` : '', gen, sites, caves, lines, all };
});

test('there are lines, and not everywhere', () => {
  for (const { all, on } of WORLDS) {
    assert.ok(all.length >= 1, `a line near the middle${on}`);
    assert.ok(all.length < SQUARES.length ** 2 || on, `some squares have none${on}`);
  }
});

test('the same seed grows the same lines, however the survey is run', () => {
  const { gen, all } = WORLDS[0];
  const again = linesOn(growWorld(SEED, [], 1));
  // a little at a time, the way the game does it between frames
  for (const cj of SQUARES) for (const ci of SQUARES) again.queue.add(`${ci}:${cj}`);
  let slices = 0;
  while (again.pump(1) > 0) slices++;
  assert.ok(slices > 4, 'it was surveyed in pieces');
  for (const l of all) {
    const m = again.cell(l.ci, l.cj);
    assert.ok(m, `${l.id} again`);
    assert.equal(m.name, l.name);
    assert.deepEqual([...m.h], [...l.h]);
    assert.deepEqual(
      m.stations.map((s) => [s.id, s.name, s.x, s.z]),
      l.stations.map((s) => [s.id, s.name, s.x, s.z]),
    );
  }
  assert.equal(gen.seed, SEED);
});

for (const land of LANDS) for (const seed of [SEED, 42]) {
  test(`seed ${seed}${land > 1 ? ` on land ${land}` : ''}: where the stations are`, () => {
    const lines = seed === SEED ? WORLDS[land - 1].lines : linesOn(growWorld(seed, [], land));
    const list = [];
    for (const cj of SQUARES) for (const ci of SQUARES) {
      const l = lines.cell(ci, cj);
      if (!l) continue;
      list.push({ id: l.id, name: l.name, length: l.length, trains: l.trains, stations: l.stations.map(({ id, name, x, z, side, rail }) => ({ id, name, x, z, side, rail })) });
    }
    matchesGolden(land > 1 ? `railway-${seed}-land${land}` : `railway-${seed}`, list, { tolerance: 1e-6 });
  });
}

for (const { on, gen, sites, caves, all } of WORLDS) {
  test(`a line climbs no more steeply than a train can${on}`, () => {
    for (const l of all) {
      for (let i = 0; i < l.n; i++) {
        const j = (i + 1) % l.n;
        const grade = Math.abs(l.h[j] - l.h[i]) / l.ds;
        assert.ok(grade <= GRADE + 1e-6, `${l.id} at ${i}: ${(grade * 100).toFixed(2)}%`);
      }
    }
  });

  test(`it never runs under the ground or through the water${on}`, () => {
    for (const l of all) {
      for (let i = 0; i < l.n; i++) {
        assert.ok(l.h[i] >= l.g[i] + BED - 1e-6, `${l.id} at ${i} is over the ground`);
        // ...and the ground, looked at afresh, is where the survey said
        if (i % 25) continue;
        const h = gen.height(l.x[i], l.z[i]);
        assert.ok(l.h[i] >= h + BED - 1e-6, `${l.id} at ${i}`);
        const w = gen.water;
        if (w.region > 0.5 && w.level > h) assert.ok(l.h[i] > w.level + 2, `${l.id} at ${i} is well over the water`);
      }
    }
  });

  test(`its curves are ones a train can take${on}`, () => {
    for (const l of all) {
      const span = 4;
      for (let i = 0; i < l.n; i++) {
        const a = (i - span + l.n) % l.n;
        const b = (i + span) % l.n;
        const ha = Math.atan2(l.x[i] - l.x[a], l.z[i] - l.z[a]);
        const hb = Math.atan2(l.x[b] - l.x[i], l.z[b] - l.z[i]);
        const turn = Math.abs(Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha)));
        const radius = (span * l.ds) / Math.max(turn, 1e-9);
        assert.ok(radius > 40, `${l.id} at ${i}: a ${radius.toFixed(0)} m curve`);
      }
      // and the samples are evenly spaced, all the way round
      for (let i = 0; i < l.n; i++) {
        const j = (i + 1) % l.n;
        assert.ok(Math.abs(Math.hypot(l.x[j] - l.x[i], l.z[j] - l.z[i]) - l.ds) < 0.5, `${l.id} at ${i}`);
      }
      assert.ok(Math.abs(l.ds - DS) < 0.2);
    }
  });

  test(`each keeps to its own square, clear of the start, the old places and the caves${on}`, () => {
    const start = gen.findSpawn(0, 0);
    for (const l of all) {
      const x0 = l.ci * CELL;
      const z0 = l.cj * CELL;
      assert.ok(l.box[0] > x0 && l.box[2] < x0 + CELL && l.box[1] > z0 && l.box[3] < z0 + CELL, `${l.id} is in its square`);
      const near = sites.within(l.box[0], l.box[1], l.box[2], l.box[3]);
      // a cave's mouth: the lip and the cutting into the hill behind it
      const mouths = caves(l.box[0], l.box[1], l.box[2], l.box[3]).map(({ id, mouth: m }) => ({ id, ax: m.x - m.ux * 3, az: m.z - m.uz * 3, bx: m.x + m.ux * (m.portal + 3), bz: m.z + m.uz * (m.portal + 3), r: m.w + 2.4 }));
      assert.ok(mouths.length > 0, `there are caves round ${l.id} to keep clear of`);
      for (let i = 0; i < l.n; i += 2) {
        assert.ok(Math.hypot(l.x[i] - start.x, l.z[i] - start.z) > 150, `${l.id} keeps clear of the start`);
        for (const s of near) assert.ok(!onPlan(s, l.x[i], l.z[i], 6), `${l.id} at ${i} runs through ${s.id}`);
        for (const m of mouths) assert.ok(segDist(l.x[i], l.z[i], m.ax, m.az, m.bx, m.bz, _s).d > m.r + 4, `${l.id} at ${i} runs over the mouth of ${m.id}`);
      }
      for (const st of l.stations) {
        for (const s of near) assert.ok(!onPlan(s, st.x, st.z, 6), `${st.id} stands on ${s.id}`);
        for (const m of mouths) assert.ok(segDist(st.x, st.z, m.ax, m.az, m.bx, m.bz, _s).d > m.r + 10, `${st.id} stands by the mouth of ${m.id}`);
      }
    }
  });

  test(`its stations are level, dry, and spread round it${on}`, () => {
    for (const l of all) {
      assert.ok(l.stations.length >= 3 && l.stations.length <= 5, `${l.id} has ${l.stations.length}`);
      const names = new Set(l.stations.map((s) => s.name));
      assert.equal(names.size, l.stations.length, `${l.id}'s stations have names of their own`);
      for (const st of l.stations) {
        const reach = Math.ceil(PLATFORM / l.ds);
        for (let q = -reach; q <= reach; q++) {
          const i = (st.i + q + l.n) % l.n;
          assert.ok(Math.abs(l.h[i] - st.rail) < 1e-6, `${st.id} is level along its platform`);
          assert.equal(l.wet[i], 0, `${st.id} isn't over water`);
        }
        assert.ok(Math.abs(Math.hypot(st.x - l.x[st.i], st.z - l.z[st.i])) < 1e-9);
      }
      const gaps = l.stations.map((st, k) => ahead(st.s, l.stations[(k + 1) % l.stations.length].s, l.length));
      for (const g of gaps) assert.ok(g > 250, `${l.id}: stations ${g.toFixed(0)} m apart`);
    }
  });
}

test('how far a point is from the track, and on which side', () => {
  const l = WORLDS[0].all[0];
  const out = {};
  for (const i of [0, 17, Math.floor(l.n / 2)]) {
    const p = pointAt(l, i * l.ds);
    // +x of the line's own frame is (dz, -dx)
    assert.ok(nearest(l, p.x, p.z, out));
    assert.ok(out.d < 0.05 && Math.abs(out.s - i * l.ds) < 0.5);
    assert.ok(nearest(l, p.x + p.dz * 5, p.z - p.dx * 5, out));
    assert.ok(Math.abs(out.d - 5) < 0.3 && out.side === 1, `5 m to the +x side: ${JSON.stringify(out)}`);
    assert.ok(nearest(l, p.x - p.dz * 5, p.z + p.dx * 5, out));
    assert.equal(out.side, -1);
  }
  assert.equal(nearest(l, l.box[0] - 100, l.box[1] - 100, out), false);
});

test('lines and stations are found again by id', () => {
  const { lines, all } = WORLDS[0];
  for (const l of all) {
    assert.equal(lines.byId(l.id), l);
    for (const st of l.stations) {
      assert.equal(lines.byId(st.id), st);
      assert.ok(st.id.includes(':'), 'an id the map takes for a place, not a mark');
    }
  }
  assert.equal(lines.byId('station:99999:0:0'), null);
  assert.equal(lines.byId('nonsense'), null);
});

test('the trains keep their distance and stand at the stations', () => {
  for (const { all } of WORLDS) {
    for (const l of all) {
      const tt = new Timetable(l);
      const t0 = 1.8e9;
      const prev = [];
      for (let t = t0; t < t0 + tt.period; t += 0.5) {
        const at = [];
        for (let j = 0; j < tt.trains; j++) at.push(tt.where(j, t));
        // never on top of one another
        for (let a = 0; a < at.length; a++) {
          for (let b = 0; b < at.length; b++) {
            if (a !== b) assert.ok(ahead(at[b].s, at[a].s, l.length) > TRAIN_LEN + 20, `${l.id}: trains ${a} and ${b} at ${t - t0}`);
          }
        }
        // smoothly round, never back
        at.forEach((w, j) => {
          if (prev[j]) assert.ok(ahead(prev[j].s, w.s, l.length) <= SPEED * 0.5 + 1e-6, `${l.id} train ${j} doesn't jump`);
          if (w.at >= 0) {
            const st = l.stations[w.at];
            assert.ok(Math.abs(ahead(st.s, w.s, l.length) - TRAIN_LEN / 2) < 1e-6, 'its middle at the middle of the platform');
            assert.equal(w.v, 0);
          }
        });
        prev.splice(0, prev.length, ...at);
      }
    }
  }
});

test('when the next train comes is when it comes', () => {
  const l = WORLDS[0].all[0];
  const tt = new Timetable(l);
  const t0 = 1.8e9 + 123.4;
  for (let k = 0; k < l.stations.length; k++) {
    const d = tt.due(k, t0);
    assert.ok(d.wait >= 0 && d.wait < tt.period);
    const there = tt.where(d.train, t0 + d.wait + 0.01);
    assert.equal(there.at, k, `train ${d.train} is standing at station ${k} when it's due`);
    assert.ok(Math.abs(there.leaves - (DWELL - 0.01)) < 0.05 || d.wait === 0);
  }
});

test('the track, the stations and the trains are made, and stand where the line is', async () => {
  const THREE = await import('three');
  const { buildPiece, buildStation, pieceCount, footprint, RAIL_H } = await import('../src/railway/track.js');
  const { Train, COACHES, SEATS } = await import('../src/railway/trains.js');
  const { gen, all } = WORLDS[0];
  const l = all[0];
  const ground = (x, z) => gen.height(x, z);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const finite = (object, what) => {
    let verts = 0;
    object.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position.array;
      verts += p.length / 3;
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${what}: a finite vertex`);
      assert.ok(o.geometry.attributes.color, `${what}: coloured`);
      // every vertex says what it's made of and where on its grain: one
      // short of that and the building material doesn't draw the mesh at all
      for (const [name, a] of Object.entries(o.geometry.attributes)) assert.equal(a.count, p.length / 3, `${what}: ${name} for every vertex`);
      // and faces some way: a normal of nothing is drawn black, and blooms
      const n = o.geometry.attributes.normal.array;
      for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-3, `${what}: a vertex facing some way`);
    });
    return verts;
  };
  const out = {};
  for (let p = 0; p < pieceCount(l); p += 3) {
    const b = buildPiece(l, p, ground, material);
    assert.ok(finite(b.object, `piece ${p}`) > 1000);
    for (const s of b.solids) {
      assert.ok(nearest(l, (s.ax + s.bx) / 2, (s.az + s.bz) / 2, out) && out.d < 0.5, 'its solids are along the track');
      assert.ok(Math.abs(s.topA - (l.h[out.i] - RAIL_H)) < 0.6, 'you walk along it on the ties');
      assert.ok(s.surface === 'boards' || s.surface === 'ballast');
    }
  }
  for (let i = 0; i < l.n; i += 7) {
    assert.ok(footprint(l, i) >= 1.2 && footprint(l, i) < 10, 'it takes up a few metres either side');
    assert.ok(footprint(l, i, true) <= footprint(l, i));
  }
  for (const st of l.stations) {
    const b = buildStation(l, st, ground, material, material);
    assert.ok(finite(b.object, st.name) > 1000);
    const deck = b.solids.filter((s) => s.surface === 'boards' && Math.abs(s.topA - st.deck) < 1e-9);
    assert.ok(deck.length >= 8, `${st.name}: a platform to stand on`);
    for (const s of deck) assert.ok(onPlan(st, s.ax, s.az, 1) && onPlan(st, s.bx, s.bz, 1), `${st.name}: its platform is on its plan`);
    assert.equal(b.blockers.length, 1, 'and a house the camera keeps out of');
  }
  // a train sits on the rails, its cars coupled, its seats in its coaches
  const train = new Train({ material, glow: material });
  const s = l.length * 0.37;
  train.place(l, s);
  assert.ok(finite(train.object, 'the train') > 5000);
  const at = {};
  let back = 0;
  for (const car of train.cars) {
    const g = car.group.position;
    assert.ok(nearest(l, g.x, g.z, at) && at.d < 0.25, `the ${car.kind} is on the track`);
    assert.ok(Math.abs(g.y - pointAt(l, at.s).y) < 0.15, `...and on the rails`);
    assert.ok(Math.abs(ahead(at.s, s, l.length) - back - car.len / 2) < 0.4, `the ${car.kind} is where it comes in the train`);
    back += car.len + 0.45;
  }
  const seat = {};
  for (const c of COACHES) {
    const g = train.cars[c].group.position;
    for (let k = 0; k < SEATS; k++) {
      train.seat(c, k, seat);
      assert.ok(Math.hypot(seat.x - g.x, seat.z - g.z) < 4.4 && seat.y > g.y + 1, 'each seat is up in its coach');
    }
  }
  // round the loop, it keeps on the rails
  train.place(l, s + 12.5);
  assert.ok(train.turned > 12 && train.turned < 13, 'its wheels have rolled as far as it went');
  train.dispose();
});

test('no line is grown where a real place reaches, and everywhere else they are as they were', () => {
  const { gen, lines } = WORLDS[0];
  const free = new Lines(gen, { keepClear: lines.keepClear });
  for (const card of HIKES) {
    const ci = Math.floor(card.at[0] / CELL);
    const cj = Math.floor(card.at[1] / CELL);
    assert.equal(lines.cell(ci, cj), null, `none on ${card.id}`);
    // a little beyond its reach, the forest's own
    const fi = Math.floor((card.at[0] + reachOf(card) + CELL) / CELL);
    if (!keepOff(fi * CELL, cj * CELL, (fi + 1) * CELL, (cj + 1) * CELL)) {
      const a = lines.cell(fi, cj);
      const b = free.cell(fi, cj);
      assert.deepEqual(a && a.stations.map((st) => st.id), b && b.stations.map((st) => st.id));
    }
  }
  for (const cj of SQUARES) for (const ci of SQUARES) assert.ok(!keepOff(ci * CELL, cj * CELL, (ci + 1) * CELL, (cj + 1) * CELL), 'no real place reaches the lines near the start');
  assert.ok(CAVE.cell < CELL);
});

test('a line far away is built from where it stands, and its smoke drawn from beside it', async () => {
  const THREE = await import('three');
  const { buildPiece, buildStation, pieceCount } = await import('../src/railway/track.js');
  const { Train, Smoke } = await import('../src/railway/trains.js');
  // a line, moved out to about as far as the world goes (test/far.test.js)
  const FAR = [3_987_654, -2_345_678];
  const { gen, all } = WORLDS[0];
  const l = all[0];
  const away = (b) => [b[0] + FAR[0], b[1] + FAR[1], b[2] + FAR[0], b[3] + FAR[1]];
  const far = {
    ...l,
    x: l.x.map((v) => v + FAR[0]),
    z: l.z.map((v) => v + FAR[1]),
    box: away(l.box),
    stations: l.stations.map((st) => ({ ...st, x: st.x + FAR[0], z: st.z + FAR[1], box: away(st.box) })),
  };
  const ground = (x, z) => gen.height(x - FAR[0], z - FAR[1]);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  // nothing big handed to the graphics card from out here: each mesh
  // measures from where it stands, and is put there, and the grain it's
  // drawn with is measured from near it too
  const biggest = (object) => {
    let most = 0;
    object.traverse((o) => {
      if (!o.isMesh) return;
      for (const name of ['position', 'aUV']) for (const v of o.geometry.attributes[name].array) most = Math.max(most, Math.abs(v));
    });
    return most;
  };
  const near = (object, x, z, within, what) => assert.ok(Math.hypot(object.position.x - x, object.position.z - z) <= within, `${what} is put where it is drawn`);
  for (let p = 0; p < pieceCount(far); p += 5) {
    const b = buildPiece(far, p, ground, material);
    assert.ok(biggest(b.object) < 512, `a piece of track measures from its own start`);
    near(b.object, far.x[(p * 24) % far.n], far.z[(p * 24) % far.n], 200, 'a piece of track');
  }
  for (const st of far.stations) {
    const b = buildStation(far, st, ground, material, material);
    assert.ok(biggest(b.object) < 512, `${st.name} measures from its own middle`);
    near(b.object, st.x, st.z, 1, st.name);
  }
  const train = new Train({ material, glow: material });
  train.place(far, far.length / 3);
  assert.ok(biggest(train.object) < 64, 'each car measures from its own middle');
  for (const car of train.cars) assert.ok(Math.hypot(car.group.position.x - FAR[0], car.group.position.z - FAR[1]) < 4000, 'and is put out there');
  const smoke = new Smoke({ add() {} });
  const stack = train.stack();
  for (let k = 0; k < 6; k++) smoke.puff(stack, 3, 2, 0, 1.4, 0.6);
  smoke.update(1 / 60);
  near(smoke.mesh, stack.x, stack.z, 2, 'the smoke');
  let most = 0;
  for (const v of smoke.mesh.instanceMatrix.array.subarray(0, smoke.mesh.count * 16)) most = Math.max(most, Math.abs(v));
  assert.ok(most < 1000, `puffs are measured from beside them (${most})`);
  train.dispose();
});
