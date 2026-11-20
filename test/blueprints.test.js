// Blueprints: every plan that ships goes up under the same rules as building
// by hand, turned any way round; a building copied down on paper goes up
// again the same; and the foreman's arithmetic (what next, where to stand,
// how to get there) holds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Buildings } from '../src/build/buildings.js';
import { Solids } from '../src/world/solids.js';
import { JOIN_RADIUS } from '../src/build/constants.js';
import { PLANS } from '../src/blueprints/plans.js';
import { normalize, place, capture, nextJob, progress, survey, findBuilding, needs, bounds, route, crosses, standAt, grow, inside } from '../src/blueprints/plan.js';
import { Library } from '../src/blueprints/library.js';
import { validSite } from '../src/blueprints/foreman.js';
import { stillNeeded, pickTree, fellingSpot, trunkSpot, pickStone, borrowSpots, middle, RANGE, CLEAR } from '../src/blueprints/gather.js';
import { levelling, nextSpot, balance, padNodes, TOL } from '../src/blueprints/grade.js';
import { zone, clearable, lyingOn, nextClearing, clearingWords, ZONE } from '../src/blueprints/clear.js';
import { TerrainEdits } from '../src/build/terrainEdits.js';
import { PIER, DIG } from '../src/build/constants.js';
import { memoryStorage, KEYS } from '../src/core/storage.js';

const scene = { add() {}, remove() {} };
// The rules (rooms, what is seated) are worked out before the mesh is; the
// mesh is rebuilt whole after every piece, and is most of the time these
// tests would take, so they go without it.
const make = () => {
  const B = new Buildings({ scene, solids: new Solids(), material: null });
  B._rebuild = () => {};
  return B;
};

// Put a placed plan up the way the foreman does, minus the walking: ask
// what's next, check the rules agree, do it. -> the building, and the jobs.
function raise(B, placed, ground = () => 2, near = { x: 0, z: 0 }) {
  const jobs = [];
  const s = survey(placed, ground);
  for (let i = 0; i < 2000; i++) {
    const b = findBuilding(placed, B.list, JOIN_RADIUS).b;
    const job = nextJob(placed, b, near, s.first);
    jobs.push(job.type);
    if (job.type === 'done') return { b, jobs };
    if (job.type === 'notch') B.notch(job.b, job.L, job.n);
    else if (job.type === 'footing') assert.ok(B.addFooting(job.x, job.z, ground(job.x, job.z)), `a footing at ${job.x},${job.z}: ${B.footingCandidate(job.x, job.z, ground(job.x, job.z)).reason}`);
    else if (job.type === 'log') {
      const c = B.logCandidate(b, job.axis, job.line, job.s0, job.s1);
      assert.ok(c.ok, `${placed.name}: a log ${job.axis}@${job.line} ${job.s0}–${job.s1} at level ${job.k}: ${c.reason}`);
      assert.equal(c.k, job.k, `${placed.name}: the log ${job.axis}@${job.line} ${job.s0}–${job.s1} lands where the plan says`);
      B.addLog(b, job.kind, job.axis, job.line, job.s0, job.s1);
    } else if (job.type === 'roof') {
      const c = B.roofCandidate(b, job.x, job.z);
      assert.ok(c.ok, `${placed.name}: a roof over ${job.x0},${job.z0}–${job.x1},${job.z1}: ${c.reason}`);
      assert.deepEqual([c.roof.x0, c.roof.z0, c.roof.x1, c.roof.z1], [job.x0, job.z0, job.x1, job.z1], 'the room is the one in the plan');
      B.addRoof(b, c.roof);
    }
    near = { x: job.x ?? near.x, z: job.z ?? near.z };
  }
  assert.fail(`${placed.name} never finished`);
}

test('every plan that ships goes up under the rules, turned any way round', () => {
  assert.ok(PLANS.length >= 4);
  for (const plan of PLANS) {
    for (let rot = 0; rot < 4; rot++) {
      const B = make();
      const placed = place(plan, 100, -40, rot);
      const { b, jobs } = raise(B, placed);
      const why = `${plan.name}, ${rot} quarter-turns`;
      assert.equal(B.list.length, 1, why);
      assert.equal(b.footings.size, plan.footings.length, why);
      assert.equal(b.logs.length, plan.logs.length, why);
      assert.ok(b.logs.every((L) => L.seated), `${why}: every log notched in`);
      assert.equal(b.roofs.length, plan.roofs.length, why);
      assert.equal(jobs.filter((j) => j === 'footing').length, plan.footings.length);
      assert.deepEqual(progress(placed, b), { done: plan.footings.length + plan.logs.length + plan.roofs.length, total: plan.footings.length + plan.logs.length + plan.roofs.length });
      // a quarter-turn swaps the footprint's sides
      const r = placed.rect;
      const p = bounds(plan);
      assert.deepEqual(rot % 2 ? [r.x1 - r.x0, r.z1 - r.z0] : [r.z1 - r.z0, r.x1 - r.x0], rot % 2 ? [p.z1 - p.z0, p.x1 - p.x0] : [p.z1 - p.z0, p.x1 - p.x0], why);
    }
  }
});

test('doors and windows come out as openings you can see through', () => {
  const plan = PLANS.find((p) => p.name === 'Small cabin');
  const placed = place(plan, 0, 0, 0);
  const B = make();
  const { b } = raise(B, placed);
  // nothing on the front wall between the door posts from level 2 to 10
  const front = placed.logs.filter((L) => L.axis === 'x' && L.line === placed.rect.z0);
  const doorAt = placed.rect.x0 + 2;
  const across = (k) => front.some((L) => L.k === k && L.s0 < doorAt && L.s1 > doorAt);
  for (let k = 2; k <= 10; k += 2) assert.equal(across(k), false, `level ${k} is open`);
  assert.ok(across(0) && across(12), 'a sill under the door and a header over it');
  assert.equal(b.rooms.length, 1, 'the sill still closes the room');
});

test('a building copied down on paper goes up again the same, anywhere', () => {
  const A = make();
  const placed = place(PLANS[1], 30, 30, 1);
  raise(A, placed);
  const copy = capture(A.serialize()[0], 'Copied');
  assert.equal(copy.name, 'Copied');
  const B = make();
  raise(B, place(copy, -200, 7, 3));
  const shape = (Bs) => {
    const s = Bs.serialize()[0];
    const r = bounds({ footings: s.footings, logs: s.logs });
    return {
      footings: s.footings.map(([x, z]) => `${x - r.x0},${z - r.z0}`).sort(),
      logs: s.logs.length,
      roofs: s.roofs.map(([x0, z0, x1, z1]) => (x1 - x0) * (z1 - z0)),
    };
  };
  // the copy, put up unturned, is the building it was copied from
  const again = make();
  raise(again, place(copy, 0, 0, 0));
  assert.deepEqual(shape(again), shape(A));
  assert.equal(B.list[0].logs.length, PLANS[1].logs.length);
  // and copying the copy changes nothing (but the order logs of one level went on in)
  const sorted = (p) => ({ ...p, logs: p.logs.map((L) => JSON.stringify(L)).sort() });
  assert.deepEqual(sorted(capture(again.serialize()[0], 'Copied')), sorted(copy));
});

test('notches come before anything rests on a log, and work resumes where it was left', () => {
  const B = make();
  const placed = place(PLANS[0], 0, 0, 0);
  for (const f of placed.footings) B.addFooting(f.x, f.z, 2);
  const b = B.list[0];
  // lay the sills and one crossing log by hand, leave it riding high
  for (const L of placed.logs.filter((P) => P.k <= 1).slice(0, 3)) B.addLog(b, L.kind, L.axis, L.line, L.s0, L.s1);
  const job = nextJob(placed, b, { x: -5, z: -5 });
  assert.equal(job.type, 'notch');
  assert.equal(job.L.seated, false);
  B.notch(b, job.L, job.n);
  const before = progress(placed, b);
  assert.equal(before.done, placed.footings.length + 3);
  const { b: done } = raise(B, placed);
  assert.equal(done, b, 'the same building, finished');
  assert.equal(b.logs.length, placed.logs.length);
});

test('the ground decides the level, and says which corner is off', () => {
  const placed = place(PLANS[0], 0, 0, 0);
  const [a, , , d] = placed.footings;
  // one corner sits 10 cm low: starting from it puts every other pier in range
  const ground = (x, z) => (x === a.x && z === a.z ? 1.9 : 2);
  const s = survey(placed, ground);
  assert.ok(s.ok, 'all four can reach one level');
  // one corner on a bump 40 cm high: three agree, it is the odd one out
  const bump = (x, z) => (x === d.x && z === d.z ? 2.4 : 2);
  const t = survey(placed, bump);
  assert.equal(t.ok, false);
  assert.ok(Math.abs(t.y0 - 2.22) < 1e-9, 'the level suits the three on flat ground');
  const off = t.footings.filter((f) => !f.ok);
  assert.deepEqual(off.map((f) => [f.x, f.z]), [[d.x, d.z]]);
  assert.match(off[0].reason, /too high: dig it down/);
  // once a building has set the level, that is the level
  assert.match(survey(placed, () => 2, 2.6).footings[0].reason, /too low: fill it in/);
});

test('another building too close is a clash; one on the plan is the site', () => {
  const B = make();
  const placed = place(PLANS[0], 0, 0, 0);
  B.addFooting(placed.footings[0].x, placed.footings[0].z, 2);
  assert.equal(findBuilding(placed, B.list, JOIN_RADIUS).b, B.list[0]);
  assert.equal(findBuilding(placed, B.list, JOIN_RADIUS).clash, null);
  const C = make();
  C.addFooting(placed.rect.x1 + 6, placed.rect.z0, 2);
  const f = findBuilding(placed, C.list, JOIN_RADIUS);
  assert.equal(f.b, null);
  assert.equal(f.clash, C.list[0]);
  assert.equal(findBuilding(place(PLANS[0], 40, 0), C.list, JOIN_RADIUS).clash, null, 'far enough off');
});

test('the way round a building, and where to stand', () => {
  const rect = { x0: 0, z0: 0, x1: 4, z1: 3 };
  const R = grow(rect, 0.9);
  // straight there when nothing is in the way
  assert.deepEqual(route({ x: -3, z: -3 }, { x: 6, z: -2 }, R), [{ x: 6, z: -2 }]);
  // from the front to the back: round a corner or two, never through
  const from = { x: 2, z: -3 };
  const to = { x: 2, z: 6 };
  const path = route(from, to, R);
  assert.ok(path.length >= 3, 'it goes round');
  assert.deepEqual(path.at(-1), to);
  let at = from;
  for (const p of path) {
    assert.equal(crosses(at, p, R), false, `${at.x},${at.z} → ${p.x},${p.z} stays outside`);
    at = p;
  }
  // stand outside the wall you work on, on the side you're on
  assert.deepEqual(standAt(2, 0, rect, 1.2, from), { x: 2, z: -1.2 });
  assert.deepEqual(standAt(2, 3, rect, 1.2, from), { x: 2, z: 4.2 });
  const corner = standAt(0, 0, rect, 1.2, { x: -5, z: 1 });
  assert.deepEqual(corner, { x: -1.2, z: 0 });
  assert.equal(inside(standAt(2, 1.5, rect, 1.2, from), grow(rect, 1.1)), false, 'never inside');
});

test('what a plan takes, and a plan made of nonsense', () => {
  const small = needs(PLANS[0]);
  assert.equal(small.stone, 8);
  assert.ok(small.log > 50 && small.timber === 9, JSON.stringify(small));
  assert.equal(needs(PLANS[3]).log, 0, 'the timber hut is all hewn');
  assert.equal(normalize(null), null);
  assert.equal(normalize({ name: 'nothing', footings: [] }), null, 'a building needs somewhere to stand');
  const p = normalize({
    name: '  ' + 'x'.repeat(100),
    footings: [[0, 0], [0, 0], [1.5, 2], 'no', [4, 0]],
    logs: [['log', 'x', 0, 0, 4, 2], ['log', 'x', 0, 0, 4, 0], ['stone', 'x', 0, 0, 4, 0], ['log', 'y', 0, 0, 4, 0], ['log', 'x', 0, 4, 0, 0], ['log', 'x', 0, 0, 20, 0]],
    roofs: [[0, 0, 4, 3], [0, 0, 0, 3]],
  });
  assert.equal(p.name.length, 60);
  assert.deepEqual(p.footings, [[0, 0], [4, 0]]);
  assert.deepEqual(p.logs, [['log', 'x', 0, 0, 4, 0], ['log', 'x', 0, 0, 4, 2]], 'only real logs, lowest first');
  assert.deepEqual(p.roofs, [[0, 0, 4, 3]]);
});

test('your blueprints are kept in this browser, in a layout that stays put', () => {
  const storage = memoryStorage();
  const lib = new Library({ storage, key: KEYS.blueprints, builtIn: PLANS });
  assert.equal(KEYS.blueprints, 'my-world:blueprints');
  assert.deepEqual(lib.names(), PLANS.map((p) => p.name));
  assert.equal(storage.get(KEYS.blueprints), null, 'the ones that ship are not written down');
  const mine = capture({ footings: [[10, 10, 2], [14, 10, 2]], logs: [['log', 'x', 10, 10, 14, 0, []]], roofs: [] }, 'Small cabin');
  const kept = lib.add(mine);
  assert.equal(kept.name, 'Small cabin 2', 'names stay apart');
  assert.equal(lib.current.name, 'Small cabin 2', 'and it is the one in hand');
  assert.deepEqual(storage.get(KEYS.blueprints), { v: 1, plans: [{ name: 'Small cabin 2', footings: [[0, 0], [4, 0]], logs: [['log', 'x', 0, 0, 4, 0]], roofs: [] }] });
  assert.equal(lib.rename('Small cabin 2', 'Wall'), true);
  assert.equal(lib.rename('Small cabin', 'Mine now'), false, "the ones that ship aren't yours to rename");
  // another visit reads it back, and nonsense in storage is passed over
  storage.set(KEYS.blueprints, { v: 1, plans: [...storage.get(KEYS.blueprints).plans, { name: 'junk' }, 7] });
  const again = new Library({ storage, key: KEYS.blueprints, builtIn: PLANS });
  assert.deepEqual(again.names().slice(PLANS.length), ['Wall']);
  for (let i = 0; i < again.names().length; i++) again.next();
  assert.equal(again.current.name, PLANS[0].name, 'next goes round');
  assert.equal(again.remove('Wall'), true);
  assert.deepEqual(storage.get(KEYS.blueprints), { v: 1, plans: [] });
  // what you are handed is yours to change
  again.current.footings.push([99, 99]);
  assert.equal(again.current.footings.length, PLANS[0].footings.length);
});

// ── Levelling ───────────────────────────────────────────────────────────────

// A hillside as a seed would grow it, and the spade's edits over it: the
// game's own TerrainEdits, with no chunks loaded.
function hillside(height, { blockers = [], water = null } = {}) {
  const terrain = new TerrainEdits({ height }, { size: 64, chunks: new Map(), chunkAt: () => null });
  const ground = {
    height: (ix, iz) => terrain.vertexHeight(ix, iz),
    delta: (ix, iz) => terrain.delta(ix, iz),
    blocker: (ix, iz) => blockers.find((o) => (ix - o.x) ** 2 + (iz - o.z) ** 2 < o.dig * o.dig) || null,
    water: () => water,
  };
  return { terrain, ground };
}

// Level a site the way the foreman does, minus the walking: the spot most
// off grade, a spade stroke there, again, until nothing is left to move.
function levelSite(placed, { terrain, ground }, earn = false) {
  const first = levelling(placed, ground, { earn });
  let soil = 0;
  let strokes = 0;
  const skip = new Set();
  let near = { x: placed.rect.x0, z: placed.rect.z0 };
  for (;;) {
    const lv = levelling(placed, ground, { level: first.level, earn });
    const v = nextSpot(lv.work, near, skip);
    if (!v) return { first, soil, strokes };
    const r = terrain.stroke({ x: v.ix, z: v.iz, mode: v.mode, dt: 0.05, datum: lv.level, soil: earn ? soil : Infinity, blocked: (ix, iz) => !!ground.blocker(ix, iz) });
    soil += r.soil;
    if (!r.moved) skip.add(`${v.ix},${v.iz}`);
    near = { x: v.ix, z: v.iz };
    assert.ok(++strokes < 20000, 'it never got there');
  }
}

test('level ground needs no levelling', () => {
  const placed = place(PLANS[0], 0, 0, 0);
  const { ground } = hillside(() => 2);
  assert.equal(levelling(placed, ground).need, false);
  // nor does a gentle slope the piers can take up
  assert.equal(levelling(placed, hillside((x) => 2 + 0.02 * x).ground).need, false);
});

test('a hillside is levelled to one grade, and the cabin goes up on it', () => {
  for (const earn of [false, true]) {
    const placed = place(PLANS[0], 0, 0, 0);
    const site = hillside((x, z) => 2 + 0.2 * x + 0.05 * z);
    const { ground, terrain } = site;
    assert.equal(survey(placed, (x, z) => ground.height(x, z)).ok, false, 'the footings could not reach one level as it was');
    const lv = levelling(placed, ground, { earn });
    assert.equal(lv.need, true);
    assert.equal(lv.trouble, null);
    assert.ok(lv.cut > 1 && lv.fill > 0.5, `cut ${lv.cut}, fill ${lv.fill}`);
    const { first, soil } = levelSite(placed, site, earn);
    // every vertex of the pad is on grade
    for (const [ix, iz] of padNodes(placed.rect)) assert.ok(Math.abs(ground.height(ix, iz) - first.level) <= TOL + 1e-9, `${ix},${iz} is ${ground.height(ix, iz) - first.level} off grade`);
    assert.equal(levelling(placed, ground, { earn }).need, false, 'and it needs no more');
    // with soil to earn, the cut paid for the fill and there's some over
    if (earn) assert.ok(soil > 0, `soil left: ${soil}`);
    const B = make();
    raise(B, placed, (x, z) => terrain.vertexHeight(x, z));
    assert.ok(Math.abs(B.list[0].y0 - (first.level + PIER.first)) < TOL + 1e-9, 'the footings sit a pier above grade');
  }
  // earning the soil sets the grade lower: more cut than fill
  const hs = [0, 1, 2, 3];
  assert.ok(Math.abs(balance(hs) - 1.5) < 1e-9);
  assert.ok(balance(hs, true) < 1.5);
});

test('the grade levelling began to is kept with the site', () => {
  const site = { plan: PLANS[0], x: 3, z: -4, rot: 1, level: -5.5 };
  assert.deepEqual(validSite(JSON.parse(JSON.stringify(site))), site);
  assert.equal(validSite({ ...site, level: 'low' }).level, null);
  assert.equal(validSite({ ...site, level: undefined }).level, null, 'a site saved before levelling');
});

test('once a footing is in, the grade is a pier below it', () => {
  const placed = place(PLANS[0], 0, 0, 0);
  const { ground } = hillside((x) => 2 + 0.2 * x);
  const f = placed.footings[0];
  const y0 = ground.height(f.x, f.z) + PIER.first;
  const lv = levelling(placed, ground, { y0, built: new Set([`${f.x},${f.z}`]) });
  assert.equal(lv.need, true);
  assert.ok(Math.abs(lv.level - (y0 - PIER.first)) < 1e-9);
});

test("too steep, roots in the way or water, and it says so", () => {
  const placed = place(PLANS[0], 0, 0, 0);
  assert.match(levelling(placed, hillside((x) => 2 + 1.2 * x).ground).trouble, new RegExp(`too steep to level here: .* ${DIG.maxCut} m`));
  // roots by a footing on the high side: the grade moves up to suit it...
  const f = placed.footings.find((g) => g.x === placed.rect.x1);
  const roots = hillside((x) => 2 + 0.2 * x, { blockers: [{ x: f.x + 0.5, z: f.z, dig: 1.2, what: 'a pine' }] });
  const suited = levelling(placed, roots.ground);
  assert.equal(suited.trouble, null);
  assert.ok(roots.ground.height(f.x, f.z) - suited.level <= PIER.first - PIER.min + 1e-9, 'the footing by the tree is within a pier of grade');
  // ...unless a footing already in on the low side has set it
  const low = placed.footings.find((g) => g.x === placed.rect.x0);
  const y0 = roots.ground.height(low.x, low.z) + PIER.first;
  assert.match(levelling(placed, roots.ground, { y0, built: new Set([`${low.x},${low.z}`]) }).trouble, /a pine is in the way of levelling for a footing: clear it first/);
  const pond = hillside((x) => 2 + 0.2 * x, { water: 3 });
  assert.match(levelling(placed, pond.ground).trouble, /under water/);
  // and a spot to work next is never one that wouldn't move
  const lv = levelling(placed, hillside((x) => 2 + 0.2 * x).ground);
  const skip = new Set(lv.work.map((v) => `${v.ix},${v.iz}`));
  assert.equal(nextSpot(lv.work, { x: 0, z: 0 }, skip), null);
  assert.equal(nextSpot(lv.work, { x: 0, z: 0 }).mode, 'dig', 'cut before fill');
});

// ── Gathering ───────────────────────────────────────────────────────────────

test('what the rest of a plan still takes', () => {
  const placed = place(PLANS[0], 0, 0, 0);
  const all = stillNeeded(placed, null);
  assert.deepEqual(all, needs(PLANS[0]));
  const B = make();
  for (const f of placed.footings) B.addFooting(f.x, f.z, 2);
  const b = B.list[0];
  const sill = placed.logs[0];
  B.addLog(b, sill.kind, sill.axis, sill.line, sill.s0, sill.s1);
  assert.deepEqual(stillNeeded(placed, b), { stone: 0, log: all.log - (sill.s1 - sill.s0), timber: all.timber });
  assert.equal(stillNeeded(place(PLANS[3], 0, 0), null).log, 0, 'the timber hut wants no round logs');
});

test('which tree to fell, and where to stand so it falls away from the site', () => {
  const placed = place(PLANS[0], 0, 0, 0);
  const rect = placed.rect;
  const trees = [
    { x: 1, z: 1, r: 0.3, meters: 14 }, // on the site: left alone
    { x: rect.x1 + 2, z: 0, r: 0.3, meters: 14 }, // too close to the site
    { x: 12, z: 0, r: 0.3, meters: 6 },
    { x: 14, z: 2, r: 0.4, meters: 14 }, // a bigger one, a little further
    { x: 80, z: 0, r: 0.3, meters: 20 }, // out of range
  ];
  assert.deepEqual(pickTree(trees, rect, { x: 6, z: 0 }), trees[3]);
  assert.equal(pickTree(trees.slice(0, 2), rect, { x: 6, z: 0 }), null);
  const t = trees[3];
  const spot = fellingSpot(t, rect);
  const c = middle(rect);
  assert.ok(Math.hypot(spot.x - c.x, spot.z - c.z) < Math.hypot(t.x - c.x, t.z - c.z), 'between the tree and the site');
  assert.ok(Math.abs(Math.hypot(spot.x - t.x, spot.z - t.z) - (t.r + 1.1)) < 1e-9, 'an axe-length from the bark');
  // a felled trunk: swing near its foot, from beside it on your side
  const { work, stand } = trunkSpot(10, 0, 1, 0, 12, { x: 12, z: -5 });
  assert.deepEqual(work, { x: 12.5, z: 0 });
  assert.ok(stand.z < 0 && Math.abs(stand.x - 12.5) < 1e-9, 'beside it, on the near side');
  assert.equal(trunkSpot(10, 0, 1, 0, 1, { x: 0, z: 0 }).work.x, 10.5, 'a short one, near its foot');
});

test('which stone next, and where soil can be dug', () => {
  const rect = place(PLANS[0], 0, 0, 0).rect;
  const stones = [{ x: 30, z: 0 }, { x: 5, z: 5 }, { x: RANGE + 10, z: 0 }];
  assert.deepEqual(pickStone(stones, rect, { x: 0, z: 0 }), stones[1]);
  assert.deepEqual(pickStone(stones, rect, { x: 35, z: 0 }), stones[0], 'the nearest to you, within range of the site');
  assert.equal(pickStone([stones[2]], rect, { x: 0, z: 0 }), null);
  const spots = borrowSpots(rect, { x: 20, z: 0 });
  const pad = grow(rect, 1 + CLEAR - 0.01);
  assert.ok(spots.length > 8 && spots.every((s) => !inside(s, pad)), 'all clear of the pad');
  assert.ok(spots[0].x > rect.x1, 'nearest you first');
});

// ── Clearing ────────────────────────────────────────────────────────────────

test('what has to come off the site, and in what order', () => {
  const rect = place(PLANS[0], 0, 0, 0).rect;
  // trees and stumps on the footprint or close by it; nothing that stays put
  assert.equal(clearable({ x: 0, z: 0, clear: 'fell' }, rect), true);
  assert.equal(clearable({ x: rect.x1 + ZONE - 0.1, z: 0, clear: 'grub' }, rect), true);
  assert.equal(clearable({ x: rect.x1 + ZONE + 0.5, z: 0, clear: 'fell' }, rect), false, 'too far off to be in the way');
  assert.equal(clearable({ x: 0, z: 0, what: 'a boulder' }, rect), false, 'a boulder stays');
  // a trunk lying over it, or only its top end, counts; one beside it doesn't
  const Z = zone(rect);
  assert.equal(lyingOn({ x: Z.x0 - 5, z: 0 }, { x: Z.x1 + 5, z: 0 }, rect), true, 'right across it');
  assert.equal(lyingOn({ x: Z.x1 + 9, z: 0 }, { x: Z.x1 - 1, z: 0 }, rect), true, 'its top on the site');
  assert.equal(lyingOn({ x: Z.x1 + 1, z: 0 }, { x: Z.x1 + 9, z: 0 }, rect), false);
  // falling first, then down, standing, stumps, brush; nearest first within each
  const near = { x: 0, z: 0 };
  const far = { x: 3, z: 3 };
  const close = { x: 1, z: 0 };
  assert.equal(nextClearing({ falling: [far], down: [close], trees: [close], stumps: [], brush: [] }, near).type, 'wait');
  assert.equal(nextClearing({ falling: [], down: [], trees: [far, close], stumps: [close], brush: [] }, near).it, close);
  assert.equal(nextClearing({ falling: [], down: [], trees: [], stumps: [far], brush: [close] }, near).type, 'grub');
  assert.equal(nextClearing({ falling: [], down: [], trees: [], stumps: [], brush: [close] }, near).type, 'brush');
  assert.equal(nextClearing({ falling: [], down: [], trees: [], stumps: [], brush: [] }, near), null);
  assert.equal(clearingWords(2, 1), 'clearing 2 trees · a stump');
  assert.equal(clearingWords(0, 0), '');
  // a tree in the very middle is felled from your side
  const mid = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2, r: 0.3 };
  const spot = fellingSpot(mid, rect, { x: mid.x + 10, z: mid.z });
  assert.ok(spot.x > mid.x && Math.abs(spot.z - mid.z) < 1e-9, 'between it and you');
});

test('levelling looks past what will be cleared, not past what stays', () => {
  const placed = place(PLANS[0], 0, 0, 0);
  const f = placed.footings.find((g) => g.x === placed.rect.x1);
  const low = placed.footings.find((g) => g.x === placed.rect.x0);
  const y0 = 2 + 0.2 * low.x + PIER.first;
  const built = new Set([`${low.x},${low.z}`]);
  for (const [o, trouble] of [
    [{ x: f.x + 0.5, z: f.z, dig: 1.2, what: 'a pine', clear: 'fell' }, false],
    [{ x: f.x + 0.5, z: f.z, dig: 1.2, what: 'a boulder' }, true],
  ]) {
    const site = hillside((x) => 2 + 0.2 * x, { blockers: [o].filter((q) => !clearable(q, placed.rect)) });
    assert.equal(!!levelling(placed, site.ground, { y0, built }).trouble, trouble, o.what);
  }
});
