// Hell: a gate found from the seed without changing what it grows, and
// under it a land laid out as the poem lays it out, whose circles never
// close, which you can walk down by its own ways and no others. Where the
// gate is, is pinned: it is on the map, and people will have been to it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { findGate, GATE, TOP } from '../src/hell/site.js';
import { HellLand, DOOR, WALL, CASTLE, STAIR } from '../src/hell/land.js';
import { HellSpace } from '../src/hell/space.js';
import { R, H, STEPS, SECTOR, SECTORS, BOLGE, LIQUID, WADE, REGIONS, TAU, regionAt, bolgiaAt, zoneAt, bankTop, bolgeOuter } from '../src/hell/plan.js';
import { WORDS, INSCRIPTION, DITCHES, ZONE_WORDS, SAID } from '../src/hell/words.js';
import { strew, CELL } from '../src/hell/furnish.js';
import { WEATHER } from '../src/hell/weather.js';
import { makeCreature, CREATURE_NAMES } from '../src/hell/creatures.js';
import { buildCave, finish } from '../src/caves/build.js';
import { layoutCave, cellOf } from '../src/caves/sites.js';
import { matchesGolden } from './helpers/golden.js';

const SEED = 20261119;
const gen = growWorld(SEED, [], 1);
const gate = findGate(gen);
const land = new HellLand({ seed: SEED, ...gate.hell });
const o = {};
// The land at a place in Hell (heights from its top), on the turn th is on.
const at = (r, th, full = false) => {
  const p = land.place(r, th);
  const s = land.sample(p.x, p.z, th, o, full);
  return { ...s, h: s.h - land.top, liq: s.liq - land.top };
};

// ── The gate ────────────────────────────────────────────────────────────────
for (const n of LANDS) for (const seed of [SEED, 42]) {
  test(`seed ${seed}, land ${n}: where the gate is`, () => {
    const g = seed === SEED && n === 1 ? gen : growWorld(seed, [], n);
    const found = findGate(g);
    assert.ok(found, 'there is a hillside for it');
    const d = Math.hypot(found.x, found.z);
    assert.ok(d >= GATE.near && d <= GATE.far, `a walk from the start (${d.toFixed(0)} m)`);
    assert.ok(g.forest(found.x, found.z) >= GATE.dark, 'in the dark of the woods');
    matchesGolden(n > 1 ? `hell-${seed}-land${n}` : `hell-${seed}`, { x: found.x, z: found.z, floor: found.floor, ux: found.ux, uz: found.uz, portal: found.portal, door: found.door, hell: found.hell }, { tolerance: 1e-6 });
  });
}

test('the gate is found the same way twice, and leaves the land as it was', () => {
  const before = [gate.x, gate.z, gate.x + 30, gate.z - 12].map((v, i, a) => gen.height(a[i & 2], a[(i & 2) + 1]));
  const again = findGate(growWorld(SEED, [], 1));
  assert.deepEqual([again.x, again.z, again.hell], [gate.x, gate.z, gate.hell]);
  const after = [gate.x, gate.z, gate.x + 30, gate.z - 12].map((v, i, a) => gen.height(a[i & 2], a[(i & 2) + 1]));
  assert.deepEqual(after, before);
});

test('the gate keeps clear of the caves, and off a real place', () => {
  const [cx, cz] = cellOf(gate.x, gate.z);
  for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
    const cave = layoutCave(gen, i, j);
    if (!cave) continue;
    const b = cave.bounds;
    const dx = Math.max(b[0] - gate.door.x, 0, gate.door.x - b[2]);
    const dz = Math.max(b[1] - gate.door.z, 0, gate.door.z - b[3]);
    assert.ok(Math.hypot(dx, dz) > 20, `${cave.name} is ${Math.hypot(dx, dz).toFixed(0)} m from the chamber`);
  }
  // somewhere a real place reaches has no gate: the next best hillside is taken
  const off = findGate(gen, (x0, z0, x1, z1) => gate.x > x0 && gate.x < x1 && gate.z > z0 && gate.z < z1);
  assert.ok(off && Math.hypot(off.x - gate.x, off.z - gate.z) > 300, 'another hillside, well away');
});

test('its passage is rock you can walk down to the door, out of the daylight', () => {
  const built = finish(buildCave(gen, gate.passage));
  const sp = built.space;
  const out = {};
  // along the middle of the way in, and on into the chamber
  let last = null;
  for (let k = 1; k <= GATE.length; k += 0.5) {
    const x = gate.x + gate.ux * k;
    const z = gate.z + gate.uz * k;
    const want = gate.floor - GATE.fall * k;
    assert.ok(sp.inside(x, z, want + 0.3, out), `${k} m in is in it`);
    assert.ok(Math.abs(out.floor - want) < 0.9, `its floor is the passage's there (${(out.floor - want).toFixed(2)} m off)`);
    if (last !== null) assert.ok(Math.abs(out.floor - last) < 0.5, 'and has no step in it');
    last = out.floor;
  }
  assert.ok(sp.light(gate.x, gate.z) > 0.9, 'daylight at the mouth');
  assert.ok(sp.light(gate.door.x, gate.door.z) < 0.1, 'and none at the door');
  assert.ok(gen.height(gate.door.x, gate.door.z) - (gate.door.floor + GATE.room.h) >= GATE.cover - 0.01, 'with a roof of earth over the chamber');
  // Hell's own door is straight under it, and the axis straight ahead
  const p = land.polar(gate.door.x, gate.door.z, 0, {});
  assert.ok(Math.abs(p.th) < 1e-9 && Math.abs(p.r - (R.wall + DOOR.depth - 2)) < 1e-6, 'the door is over the back of the cleft');
  assert.equal(land.top, TOP);
  assert.ok(TOP + 400 < -2000, 'far under any land');
});

// ── The plan ────────────────────────────────────────────────────────────────
test('the plan is the poem’s: nine circles, each inside and below the last', () => {
  const circles = REGIONS.filter((g) => g.circle).map((g) => g.circle);
  assert.deepEqual([...new Set(circles)], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let i = 1; i < REGIONS.length; i++) assert.ok(REGIONS[i].r < REGIONS[i - 1].r, `${REGIONS[i].id} is inside ${REGIONS[i - 1].id}`);
  for (let i = 1; i < STEPS.length; i++) assert.ok(STEPS[i].at < STEPS[i - 1].at && STEPS[i].hi <= STEPS[i - 1].lo + 50, 'each drop is further in');
  for (const s of STEPS) assert.ok(s.lo < s.hi, `${s.id} goes down`);
  assert.equal(regionAt(R.wall - 1).id, 'vestibule');
  assert.equal(regionAt(1).id, 'cocytus');
  assert.equal(BOLGE.n, 10);
  assert.equal(bolgeOuter(BOLGE.n), R.bank, 'ten ditches, from the cliff to the bank that girds the well');
  assert.ok(R.well < R.bank - 20 && bolgiaAt(R.bank - 5) === -1, 'and that bank is ground to stand on');
  assert.deepEqual([zoneAt(R.shelf - 1), zoneAt(300), zoneAt(200), zoneAt(50), zoneAt(R.shelf + 1)], [0, 1, 2, 3, -1]);
  assert.equal(bolgiaAt(bolgeOuter(3) - BOLGE.bank - 5), 3);
  assert.equal(bolgiaAt(bolgeOuter(3) - 5), -1, 'a bank is not a ditch');
});

test('every place has the poem’s words for it, spelled as they were', () => {
  for (const g of REGIONS) {
    const w = WORDS[g.id];
    assert.ok(w && w.title && w.lines.length, `${g.id} has a name and lines`);
    assert.ok(WEATHER[g.id], `${g.id} has its weather`);
    for (const key of ['zen', 'hor', 'glow', 'amb', 'gnd']) assert.equal(g.air[key].length, 3, `${g.id}'s air has ${key}`);
  }
  assert.equal(INSCRIPTION.length, 9);
  assert.equal(INSCRIPTION[0], 'Through me the way is to the city dolent;');
  assert.equal(INSCRIPTION[8], 'All hope abandon, ye who enter in!');
  assert.equal(SAID.stars, 'Thence we came forth to rebehold the stars.');
  assert.equal(DITCHES.length, BOLGE.n);
  assert.equal(ZONE_WORDS.length, 4);
  matchesGolden('hell-words', { INSCRIPTION, WORDS, SAID });
});

// ── The land ────────────────────────────────────────────────────────────────
test('the land stands where the plan says, with no break in it', () => {
  const mid = [
    [(R.wall + R.acheronOut) / 2, H.vestibule, 3],
    [(R.limboFoot + R.c1) / 2, H.limbo, CASTLE.knoll + 3],
    [(R.c1 + R.c2) / 2, H.c2, 3],
    [(R.c2 + R.c3) / 2, H.c3, 2],
    [(R.c3 + R.c4) / 2, H.c4, 2],
    [(R.dis + R.c6) / 2, H.dis, 2],
    [(R.wood + R.bloodIn) / 2, H.c7, 4],
    [(R.brink + R.wood) / 2, H.c7, 4],
    [R.bolge + 40, H.bolge, 2],
    [R.well - 30, H.shelf, 1],
    [1, H.centre, 1],
  ];
  for (const th of [0.7, 2.9, -1.3, 0.7 + TAU * 3]) {
    for (const [r, h, by] of mid) assert.ok(Math.abs(at(r, th).h - h) <= by, `at ${r.toFixed(0)} m, th ${th.toFixed(1)}: ${at(r, th).h.toFixed(1)} for ${h}`);
    // walk in from the wall to the middle, a quarter of a metre at a time:
    // the steepest cliff is no wall of glass, and nothing steps
    let last = at(R.wall + 20, th).h;
    for (let r = R.wall + 20; r > 0; r -= 0.25) {
      const h = at(r, th).h;
      assert.ok(Math.abs(h - last) < 6, `a break of ${(h - last).toFixed(1)} m at ${r} m, th ${th.toFixed(2)}`);
      // (where it changes fast, look closer: a slope, however steep, not a step)
      if (Math.abs(h - last) > 0.2) {
        let fine = last;
        for (let q = r + 0.25; q >= r; q -= 0.01) {
          const f = at(q, th).h;
          assert.ok(Math.abs(f - fine) < 0.3, `a step of ${(f - fine).toFixed(2)} m at ${q.toFixed(2)} m, th ${th.toFixed(2)}`);
          fine = f;
        }
      }
      last = h;
    }
  }
  // ...and on round a circle, through a way down and past a castle
  for (const r of [R.c1 + 2, R.c2 - 30, CASTLE.r + CASTLE.moat, R.c6 + 60, R.bloodIn + 30, R.wood + 3]) {
    let last = at(r, -SECTOR).h;
    for (let a = -SECTOR; a < SECTOR; a += 0.3 / r) {
      const h = at(r, a).h;
      assert.ok(Math.abs(h - last) < 3, `a break of ${(h - last).toFixed(1)} m at ${r} m, th ${a.toFixed(4)}`);
      last = h;
    }
  }
});

test('a circle does not close: one turn on is another place over the same land', () => {
  const k = 3;
  const far = k + SECTORS * 2; // the sector that lies over sector 3, two turns on
  const a = land.sector(k);
  const b = land.sector(far);
  assert.notEqual(a.pass[0] - k * SECTOR, b.pass[0] - far * SECTOR, 'its way down is somewhere else in it');
  // where one turn has a way down, the turn above it has the cliff
  const s = STEPS[0];
  const here = at(s.at, a.pass[0]).h;
  const there = at(s.at, a.pass[0] + TAU * 2).h;
  assert.ok(Math.abs(here - there) > 5, `the ramp (${here.toFixed(0)}) is the cliff (${there.toFixed(0)}) a turn on`);
  // away from its sights the land is the same on every turn...
  const calm = (k + 0.5) * SECTOR;
  for (const r of [R.c2 - 100, R.c3 - 100, R.wood + 100]) assert.ok(Math.abs(at(r, calm).h - at(r, calm + TAU * 5).h) < 1e-6);
  // ...and inside the great cliff there is one of everything
  for (const r of [R.bolge - 50, R.well + 100, 300]) {
    const x = at(r, 1.1, true);
    const y = at(r, 1.1 + TAU * 7, true);
    assert.ok(Math.abs(x.h - y.h) < 1e-6 && x.kind === y.kind && Math.abs(x.cr - y.cr) < 1e-6, `the same at ${r} m on any turn`);
  }
  // sectors are numbered without end, either way
  for (const far2 of [1e6, -1e6]) {
    const sec = land.sector(far2);
    assert.ok(sec.pass.slice(0, 5).every((p) => Math.abs(p - far2 * SECTOR) < SECTOR / 2), 'a sector a long way round has its ways down in it');
  }
});

test('where you are has a turn to it, kept as you go round', () => {
  const space = new HellSpace(land);
  const r = R.c2 - 100;
  // walk round the second circle twice, a few metres at a time
  for (let a = 0; a <= TAU * 2 + 0.001; a += 0.002) {
    const p = land.place(r, a);
    space.follow(p.x, p.z);
  }
  assert.ok(Math.abs(space.ref - TAU * 2) < 0.01, `two turns on (${space.ref.toFixed(3)})`);
  const p = land.place(r, 0.3);
  const q = land.polar(p.x, p.z, space.ref, {});
  assert.ok(Math.abs(q.th - (0.3 + TAU * 2)) < 1e-9, 'a place near you is on your turn');
  assert.ok(Math.abs(land.polar(p.x, p.z, 0, {}).th - 0.3) < 1e-9, 'and on the first, for someone there');
});

test('every way down can be walked, and nothing else can', () => {
  for (const k of [0, 1, -7, 5000]) {
    const sec = land.sector(k);
    STEPS.forEach((s, i) => {
      if (!s.pass) return assert.ok(Number.isNaN(sec.pass[i]), `${s.id} has no way down`);
      const fan = (s.hi - s.lo) / s.pass.slope - s.pass.back;
      let last = at(s.at + s.pass.back + 8, sec.pass[i]).h;
      let steepest = 0;
      for (let r = s.at + s.pass.back + 8; r > s.at - fan - 8; r -= 0.5) {
        const h = at(r, sec.pass[i]).h;
        steepest = Math.max(steepest, Math.abs(h - last) / 0.5);
        last = h;
      }
      assert.ok(steepest < 0.95, `${s.id}, sector ${k}: no steeper than ${steepest.toFixed(2)}`);
      assert.ok(Math.abs(at(s.at + s.pass.back + 8, sec.pass[i]).h - s.hi) < 3 && Math.abs(last - s.lo) < 4.5, 'from the circle above to the one below');
      // and beside it, the cliff
      const beside = sec.pass[i] + 60 / s.at;
      const drop = at(s.at + s.w / 2, beside).h - at(s.at - s.w / 2, beside).h;
      assert.ok(drop > (s.hi - s.lo) * 0.85, `a cliff of ${drop.toFixed(0)} m beside it`);
    });
  }
});

test('the rivers are where they should be, and cross only where the poem crosses them', () => {
  const sec = land.sector(0);
  const deepest = (r0, r1, th) => {
    let d = 0;
    for (let r = r0; r <= r1; r += 1) {
      const s = at(r, th);
      d = Math.max(d, s.liq - s.h);
    }
    return d;
  };
  const kindAt = (r, th) => at(r, th).kind;
  assert.equal(kindAt((R.acheronIn + R.acheronOut) / 2, 0.5), LIQUID.acheron);
  assert.equal(kindAt((R.dis + R.c4) / 2, 0.5), LIQUID.styx);
  assert.equal(kindAt((R.bloodIn + R.bloodOut) / 2, 0.5), LIQUID.blood);
  for (const th of [0, 0.5, 2, -4]) {
    assert.ok(deepest(R.acheronIn, R.acheronOut, th) > WADE + 2, 'Acheron is too deep to wade');
    assert.ok(deepest(R.dis + 10, R.dis + 60, th) > WADE + 1, 'Styx is a moat under the wall');
  }
  assert.ok(deepest(R.bloodIn, R.bloodOut, sec.ford + 60 / R.bloodIn) > WADE + 2, 'Phlegethon is deep');
  assert.ok(deepest(R.bloodIn, R.bloodOut, sec.ford) < WADE - 0.3, 'but for its ford');
  // the boat's way over Styx is clear water from the spit to the gate
  for (let r = R.dis + 12; r < R.c4 - 70; r += 3) {
    const s = at(r, sec.quay);
    assert.ok(s.liq - s.h > 1.5, `${(s.liq - s.h).toFixed(1)} m of water at ${r}`);
  }
  assert.equal(sec.quay, sec.pass[3], 'the gate of Dis is across from the way down to the marsh');
  // the brook runs between its stone margins from the river to the brink
  for (const r of [R.wood + 100, R.wood - 100, R.brink + 60]) {
    const mid = at(r, sec.brook);
    assert.equal(mid.kind, LIQUID.blood);
    assert.ok(mid.liq > mid.h, 'blood in its channel');
    const margin = at(r, sec.brook + 6.7 / r);
    assert.ok(margin.h > mid.liq + 0.5, 'and a dry margin beside it');
    // its banks slope: whoever steps into it can step out again
    let last = mid.h;
    for (let a = 0; a <= 6.7; a += 0.25) {
      const h = at(r, sec.brook + a / r).h;
      assert.ok(Math.abs(h - last) / 0.25 < 0.95, `the bank is no steeper than ${(Math.abs(h - last) / 0.25).toFixed(2)}`);
      last = h;
    }
  }
});

test('Malebolge: ten ditches, a bridge over each but the sixth, a stair down into each', () => {
  const th = land.spokes[0];
  const d = {};
  for (let i = 0; i < BOLGE.n; i++) {
    const mid = bolgeOuter(i) - BOLGE.bank - BOLGE.ditch / 2;
    const floor = at(mid, th + 0.2).h;
    assert.ok(Math.abs(floor - (bankTop(i) - BOLGE.tilt - BOLGE.deep)) < 0.6, `ditch ${i + 1} is ${BOLGE.deep} m deep`);
    assert.ok(Math.abs(at(bolgeOuter(i) - BOLGE.bank / 2, th + 0.2).h - bankTop(i)) < BOLGE.tilt, 'between banks');
    const over = land.deck(mid, th, d);
    if (i === BOLGE.broken) {
      assert.ok(!over, 'the sixth has no bridge');
      // ...but its rock lies heaped across, and can be climbed
      let last = at(bolgeOuter(i) - BOLGE.bank + 1, th).h;
      for (let r = bolgeOuter(i) - BOLGE.bank + 1; r > bolgeOuter(i) - BOLGE.bank - BOLGE.ditch - 1; r -= 0.5) {
        const h = at(r, th).h;
        assert.ok(Math.abs(h - last) / 0.5 < 1.05, `the heap is no steeper than ${(Math.abs(h - last) / 0.5).toFixed(2)}`);
        last = h;
      }
      continue;
    }
    assert.ok(over, `a bridge over ditch ${i + 1}`);
    assert.ok(d.top - land.top > bankTop(i) - BOLGE.tilt && d.under < d.top - 1, 'arched over it');
    // its roadway meets the bank at both ends
    for (const end of [0.5, BOLGE.ditch - 0.5]) {
      const r = bolgeOuter(i) - BOLGE.bank - end;
      land.deck(r, th, d);
      assert.ok(Math.abs(d.top - land.top - at(r + (end < 1 ? 1.5 : -1.5), th).h) < 1.2, 'the roadway meets the bank');
    }
    assert.ok(!land.deck(mid, th + (BOLGE.deck + 1) / mid, d), 'and is only so wide');
    // the stair: from the bank's edge to the floor, on round from the bridge
    let last = null;
    for (let a = STAIR.from; a <= STAIR.from + STAIR.run; a += 0.5) {
      const r = bolgeOuter(i) - BOLGE.bank - (STAIR.q0 + STAIR.q1) / 2;
      const h = at(r, th + a / r).h;
      if (last !== null) assert.ok(Math.abs(h - last) / 0.5 < 0.9, 'a stair you can walk');
      last = h;
    }
    assert.ok(Math.abs(last - floor) < 1, 'down to the floor');
  }
  assert.equal(at(bolgeOuter(4) - BOLGE.bank - BOLGE.ditch / 2, 1).kind, LIQUID.pitch, 'pitch in the fifth');
});

// ── Being in it ─────────────────────────────────────────────────────────────
const space = new HellSpace(land);
const RADIUS = 0.32;
// Walk from one place in Hell toward another as the player does: a step at
// a time, kept out of the walls, feet on the floor. -> where you got to.
function walk(r0, th0, r1, th1, most = 4000) {
  space.ref = th0;
  const a = land.place(r0, th0);
  const b = land.place(r1, th1);
  const p = { x: a.x, z: a.z, y: 0 };
  const io = {};
  const wall = {};
  space.inside(p.x, p.z, land.top + 250, io);
  p.y = io.floor;
  // (set down from above, onto whatever is there: a bridge, if there is one)
  if (land.deck(r0, th0, io)) p.y = io.top;
  for (let i = 0; i < most; i++) {
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) break;
    p.x += (dx / d) * 0.12;
    p.z += (dz / d) * 0.12;
    space.follow(p.x, p.z);
    space.walls(p.x, p.z, wall, p.y);
    if (wall.d < RADIUS) {
      p.x += wall.nx * (RADIUS - wall.d);
      p.z += wall.nz * (RADIUS - wall.d);
    }
    space.inside(p.x, p.z, p.y + 0.05, io);
    // you fall to the floor, but only climb what the walls let you onto
    p.y = io.floor;
  }
  const q = land.polar(p.x, p.z, space.ref, {});
  return { r: q.r, th: q.th, y: p.y - land.top };
}

test('Hell is a space of its own, far under the forest', () => {
  const out = {};
  const p = land.place(R.c2 - 100, 0.4);
  assert.ok(!space.inside(p.x, p.z, 40, out), 'not for someone on the land above');
  assert.ok(!space.inside(p.x, p.z, Infinity, out));
  space.ref = 0.4;
  assert.ok(space.inside(p.x, p.z, land.top + H.c2 + 1, out), 'for someone down there');
  assert.equal(out.floor, land.height(p.x, p.z, 0.4));
  assert.ok(out.roof > out.floor + 100, 'with the dark a long way overhead');
  assert.ok(space.air(p.x, out.floor + 3, p.z, 0.3) && !space.air(p.x, out.floor - 1, p.z, 0));
  const off = land.place(R.wall + 300, 0.4);
  assert.ok(!space.inside(off.x, off.z, land.top, out), 'and it ends at the rock');
  // on a bridge you stand on its roadway; under it, on the ditch's floor
  const mid = bolgeOuter(0) - BOLGE.bank - BOLGE.ditch / 2;
  const b = land.place(mid, land.spokes[0]);
  const d = {};
  land.deck(mid, land.spokes[0], d);
  space.inside(b.x, b.z, d.top + 0.1, out);
  assert.equal(out.floor, d.top);
  space.inside(b.x, b.z, d.top - 12, out);
  assert.ok(out.floor < d.top - 15 && Math.abs(out.roof - d.under) < 1e-9, 'under the arch');
});

test('you can walk down by the ways there are, and back up them', () => {
  const sec = land.sector(0);
  const s = STEPS[0];
  const fan = (s.hi - s.lo) / s.pass.slope - s.pass.back;
  const down = walk(s.at + s.pass.back + 12, sec.pass[0], s.at - fan - 12, sec.pass[0]);
  assert.ok(Math.abs(down.y - s.lo) < 3 && down.r < s.at - fan, `down the first way to the second circle (${down.y.toFixed(0)})`);
  const up = walk(s.at - fan - 12, sec.pass[0], s.at + s.pass.back + 12, sec.pass[0]);
  assert.ok(Math.abs(up.y - s.hi) < 3 && up.r > s.at + s.pass.back, `and back up it (${up.y.toFixed(0)})`);
  // the ruin, to the river of blood, and over it by the ford
  const ruin = STEPS[4];
  const foot = walk(ruin.at + ruin.pass.back + 10, sec.pass[4], R.bloodOut + 4, sec.pass[4]);
  assert.ok(Math.abs(foot.y - H.c7) < 3, 'down the ruin');
  const over = walk(R.bloodOut + 6, sec.ford, R.bloodIn - 8, sec.ford);
  assert.ok(over.r < R.bloodIn - 4, `over Phlegethon at the ford (${over.r.toFixed(1)}, ${over.y.toFixed(1)})`);
  // along the brook's margin through the wood and over the sand to the brink
  const margin = sec.brook + 6.7 / R.wood;
  const edge = walk(R.bloodIn - 12, margin, R.brink + 30, sec.brook + 6.7 / (R.brink + 30), 12000);
  assert.ok(edge.r < R.brink + 34, `along the brook to the brink (${edge.r.toFixed(0)})`);
  // over a bridge of Malebolge, bank to bank
  const b0 = bolgeOuter(0);
  const across = walk(b0 - 6, land.spokes[0], b0 - BOLGE.pitch - 6, land.spokes[0]);
  assert.ok(across.r < b0 - BOLGE.pitch && Math.abs(across.y - bankTop(1)) < BOLGE.tilt, 'over the first bridge to the second bank');
  // and over what is left of the sixth
  const b5 = bolgeOuter(BOLGE.broken);
  const heap = walk(b5 - 6, land.spokes[0], b5 - BOLGE.pitch - 6, land.spokes[0]);
  assert.ok(heap.r < b5 - BOLGE.pitch, `over the fallen bridge (${heap.r.toFixed(0)})`);
});

test('and nowhere else', () => {
  const sec = land.sector(0);
  const s = STEPS[0];
  // up a cliff, away from its way down
  const beside = sec.pass[0] + 80 / s.at;
  const climbed = walk(s.at - 60, beside, s.at + 40, beside);
  assert.ok(climbed.y < s.lo + 12 && climbed.r < s.at + s.w / 2, `the cliff stops you (${climbed.y.toFixed(0)} m)`);
  // ...though you can walk off the top of one (and are still in Hell at the bottom)
  const fell = walk(s.at + 40, beside, s.at - 60, beside);
  assert.ok(Math.abs(fell.y - s.lo) < 3, 'you can go off the top of it');
  // Acheron, Styx and Phlegethon on foot
  assert.ok(walk(R.acheronOut + 10, 0.3, R.acheronIn - 10, 0.3).r > R.acheronIn + 20, 'Acheron can’t be waded');
  assert.ok(walk(R.c4 - 40, 0.3, R.dis + 20, 0.3).r > R.dis + 100, 'nor Styx');
  assert.ok(walk(R.bloodOut + 6, sec.ford - 0.02, R.bloodIn - 8, sec.ford - 0.02).r > R.bloodIn + 10, 'nor Phlegethon, away from the ford');
  // the wall of Dis, from inside, away from its gate
  const wall = walk(R.dis - 30, sec.quay + 0.05, R.dis + 20, sec.quay + 0.05);
  assert.ok(wall.r < WALL.r, 'the wall of Dis stands');
  const gateway = walk(R.dis - 30, sec.quay, WALL.r + 3, sec.quay);
  assert.ok(gateway.r > WALL.r + 1, 'and its gate is open');
  // a castle's walls, and its seven gates in a line
  const out = sec.castle;
  const inn = walk(CASTLE.r + CASTLE.walls[6] + 6, out, CASTLE.r + 4, out);
  assert.ok(inn.r < CASTLE.r + 10, 'in through the seven gates');
  const c = land.place(CASTLE.r, sec.castle);
  const side = land.polar(c.x - Math.sin(sec.castle + land.turn) * (CASTLE.walls[6] + 6), c.z + Math.cos(sec.castle + land.turn) * (CASTLE.walls[6] + 6), sec.castle, {});
  const stopped = walk(side.r, side.th, CASTLE.r, sec.castle);
  const cc = land.place(stopped.r, stopped.th);
  assert.ok(Math.hypot(cc.x - c.x, cc.z - c.z) > CASTLE.walls[6] - 1, 'but not through the wall');
  // the wall of a ditch, from its floor
  const mid = bolgeOuter(2) - BOLGE.bank - BOLGE.ditch / 2;
  const stuck = walk(mid, land.spokes[0] + 0.3, bolgeOuter(2) - 4, land.spokes[0] + 0.3);
  assert.ok(stuck.y < bankTop(2) - 8, 'a ditch keeps what falls into it');
});

// ── What is on it ───────────────────────────────────────────────────────────
test('each circle is strewn with what the poem puts there, the same every time', () => {
  const count = (r, th, seed = 99) => {
    const p = land.place(r, th);
    const x0 = Math.floor(p.x / CELL) * CELL;
    const z0 = Math.floor(p.z / CELL) * CELL;
    const c = {};
    const list = [];
    strew(land, th, x0, z0, seed, (kind, x, y, z) => {
      c[kind] = (c[kind] || 0) + 1;
      list.push([kind, x, y, z]);
    });
    return { c, list };
  };
  assert.ok(count(R.c6 + 150, 0.2).c.tomb > 8, 'tombs in the sixth circle');
  assert.ok(count(R.c6 + 150, 0.2).c.flame > 8, 'and fire among them');
  const wood = count(R.wood + 170, 0.2).c;
  assert.ok(wood.thorn + wood.thorn2 + wood.thorn3 > 40, 'the wood is a wood');
  assert.ok(count(R.c4 + 140, 0.2).c.weight > 6, 'weights in the fourth');
  assert.ok((count(R.c3 + 140, 0.2).c.prone || 0) + (count(R.c3 + 140, 0.2).c.supine || 0) > 6, 'the gluttons lie in the mud');
  assert.ok(count(bolgeOuter(2) - BOLGE.bank - BOLGE.ditch / 2, 0.2).c.hole > 3, 'holes in the third ditch');
  assert.ok(count(bolgeOuter(7) - BOLGE.bank - BOLGE.ditch / 2, 0.2).c.flame > 3, 'flames in the eighth');
  assert.ok(count(430, 0.2).c.headBowed > 5 && count(180, 0.2).c.headBack > 5, 'heads in the ice');
  assert.deepEqual(count(60, 0.2).c, {}, 'and in Judecca nothing shows above it');
  assert.deepEqual(count(R.c6 + 150, 0.2).list, count(R.c6 + 150, 0.2).list, 'the same twice');
  assert.notDeepEqual(count(R.c6 + 150, 0.2, 99).list, count(R.c6 + 150, 0.2, 100).list, 'and its own on each turn');
  // nothing stands in the air or under the ground
  for (const [kind, x, y, z] of count(R.c4 + 140, 0.2).list) assert.ok(Math.abs(y - land.height(x, z, 0.2)) < 1.6, `${kind} is on the ground`);
});

test('its keepers and monsters all have a shape', () => {
  const material = {};
  for (const name of CREATURE_NAMES) {
    const g = makeCreature(name, material);
    assert.ok(g.userData.height > 0, `${name} has a height`);
    let tris = 0;
    g.traverse((m) => {
      if (!m.isMesh) return;
      tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      const pos = m.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i++) assert.ok(Number.isFinite(pos[i]), `${name} is all there`);
    });
    assert.ok(tris > 20 && tris < 30000, `${name}: ${tris} triangles`);
    for (const [part, obj] of Object.entries(g.userData.parts || {})) assert.ok(obj && obj.isObject3D, `${name}'s ${part} is a thing that can turn`);
  }
});
