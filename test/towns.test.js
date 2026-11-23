// The towns: where they are is grown from the seed (so everyone in a world
// finds the same saloon in the same street), each is laid out where the land
// suits it, they keep clear of the old places and of where people arrive,
// finding them changes nothing about the forest a save is the diff from, and
// what stands in them can be walked into.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { growWorld, LANDS } from '../src/world/lands.js';
import { generateVegetation, generateTerrain, VEG_KINDS } from '../src/world/chunkGen.js';
import { toWorld, onPlan } from '../src/world/frame.js';
import { Sites } from '../src/landmarks/sites.js';
import { Towns, CELL, bodyOf, OPEN } from '../src/towns/towns.js';
import { KINDS, KIND_IDS, BUILDINGS } from '../src/towns/kinds.js';
import { buildLot, buildStreet } from '../src/towns/buildings.js';
import { Townsfolk } from '../src/towns/people.js';
import { lookOf, buildPerson } from '../src/people/body.js';
import { layoutCave, cellOf } from '../src/caves/sites.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms, reachOf } from '../src/world/landforms.js';
import { mulberry32 } from '../src/noise.js';
import { matchesGolden } from './helpers/golden.js';
import { earthAtFirst } from './helpers/earth.js';
// The real Earth under the world, as the game has it when it opens (world/earth.js).
const EARTH = await earthAtFirst();

const SEED = 20261119;
const AREA = 3500; // m either side of the middle
const TRUNK = { pine: 0.3, broad: 0.4, birch: 0.2, bush: 0, fern: 0, rock: 0.7, log: 0 };

// The seed on each land (src/world/lands.js): the towns stand on whatever
// land they find, so the rules about where are checked on every one.
const WORLDS = LANDS.map((land) => {
  const gen = growWorld(SEED, [], land, [], EARTH);
  const sites = new Sites(gen);
  const towns = new Towns(gen, { sites });
  return { land, on: land > 1 ? ` (land ${land})` : '', gen, sites, towns, all: towns.within(-AREA, -AREA, AREA, AREA) };
});
const { gen, all } = WORLDS[0];

// A lot's corners and middle in the world.
const footprint = (lot) =>
  [
    [-lot.w / 2, -lot.d / 2],
    [lot.w / 2, -lot.d / 2],
    [-lot.w / 2, lot.d / 2],
    [lot.w / 2, lot.d / 2],
    [0, 0],
  ].map(([x, z]) => toWorld(lot, x, z));

test('the same seed puts the same towns in the same places', () => {
  const again = new Towns(growWorld(SEED, [], 1, [], EARTH)).within(-1500, -1500, 1500, 1500);
  const first = all.filter((t) => t.box[2] >= -1500 && t.box[0] <= 1500 && t.box[3] >= -1500 && t.box[1] <= 1500);
  assert.ok(first.length > 3);
  assert.deepEqual(again, first);
});

// Where the towns are and what stands in them is pinned: the ones people have
// visited or are tracking are saved by id.
for (const land of LANDS) for (const seed of [SEED, 42]) {
  test(`seed ${seed}${land > 1 ? ` on land ${land}` : ''}: where the towns are`, () => {
    const t = seed === SEED ? WORLDS[land - 1].towns : new Towns(growWorld(seed, [], land, [], EARTH));
    const list = t.within(-1500, -1500, 1500, 1500).map(({ id, kind, name, x, z, yaw, len, people, lots }) => ({
      id, kind, name, x, z, yaw, len, people,
      lots: lots.map(({ type, u, v, r, ruin }) => [type, u, v, r, ruin]),
    }));
    matchesGolden(land > 1 ? `towns-${seed}-land${land}` : `towns-${seed}`, list, { tolerance: 1e-6 });
  });
}

for (const { on, gen, all, sites } of WORLDS) {
  test(`they're rarer than the old places, and every kind turns up${on}`, () => {
    const km2 = ((2 * AREA) / 1000) ** 2;
    const perKm2 = all.length / km2;
    assert.ok(perKm2 > 0.4 && perKm2 < 1.2, `${perKm2.toFixed(2)} per km²`);
    const kinds = new Set(all.map((t) => t.kind));
    for (const k of KIND_IDS) assert.ok(kinds.has(k), `there is ${KINDS[k].a}`);
    assert.ok(all.some((t) => t.people > 0) && all.some((t) => t.people === 0), 'some have people and some are empty');
    // one to a cell, so never two on top of each other
    for (const a of all) for (const b of all) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 200, `${a.id} and ${b.id} are apart`);
  });

  test(`there's one within a run of where people arrive, but none on top of it${on}`, () => {
    const start = gen.findSpawn(0, 0);
    const d = all.map((t) => Math.hypot(t.x - start.x, t.z - start.z) - t.len / 2);
    assert.ok(Math.min(...d) > 260, 'kept clear of the start');
    assert.ok(Math.min(...d) < 1200, `the nearest is ${Math.round(Math.min(...d))} m off`);
  });

  test(`each building stands where the ground suits it, and in no one else's way${on}`, () => {
    for (const t of all) {
      const K = KINDS[t.kind];
      assert.equal(t.style, K.style);
      for (const lot of t.lots) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const p of footprint(lot)) {
          const h = gen.height(p.x, p.z);
          assert.ok(gen.water.edge > 3.9, `${t.id} ${lot.type}: dry`);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
        assert.ok(hi - lo <= BUILDINGS[lot.type].slope + 1e-9, `${t.id} ${lot.type}: the ground falls ${(hi - lo).toFixed(2)} m`);
        // not on the street, nor on another lot
        const [u0, v0, u1, v1] = t.street;
        const c = { u: lot.u, v: lot.v };
        assert.ok(!(c.u > u0 && c.u < u1 && c.v > v0 && c.v < v1), `${t.id} ${lot.type}: off the street`);
        for (const other of t.lots) if (other !== lot) assert.ok(Math.hypot(other.u - lot.u, other.v - lot.v) > 1.5, `${t.id}: ${lot.type} and ${other.type} apart`);
        // clear of the old places
        for (const s of sites.near(lot.x, lot.z, Math.hypot(lot.w, lot.d))) {
          for (const p of footprint(lot)) assert.ok(!onPlan(s, p.x, p.z), `${t.id} ${lot.type} clear of ${s.id}`);
        }
      }
      const street = t.lots.filter((l) => Math.abs(l.u) <= t.len / 2 && !OPEN[l.type]);
      assert.ok(street.length >= 4, `${t.id}: a street of buildings (${street.length})`);
    }
  });

  test(`none stands in the mouth of a cave${on}`, () => {
    let near = 0;
    for (const t of all.slice(0, 12)) {
      const [c0, r0] = cellOf(t.box[0] - 30, t.box[1] - 30);
      const [c1, r1] = cellOf(t.box[2] + 30, t.box[3] + 30);
      for (let cz = r0; cz <= r1; cz++) {
        for (let cx = c0; cx <= c1; cx++) {
          const cave = layoutCave(gen, cx, cz);
          if (!cave) continue;
          near++;
          const m = cave.mouth;
          // the lip, and a few steps either side of the way in
          for (const k of [-3, 0, 3, m.portal]) {
            const x = m.x + m.ux * k;
            const z = m.z + m.uz * k;
            assert.ok(!onPlan(t, x, z, m.w + 1, t.plan), `${t.id} keeps out of ${cave.id}`);
          }
        }
      }
    }
    assert.ok(near > 0, 'there are caves near towns to keep out of');
  });

  test(`the cells are big enough to keep a town in${on}`, () => {
    for (const t of all) {
      const [ci, cj] = t.id.split(':').slice(1).map(Number);
      assert.ok(t.box[0] > ci * CELL - 110 && t.box[2] < (ci + 1) * CELL + 110, `${t.id} in its cell across`);
      assert.ok(t.box[1] > cj * CELL - 110 && t.box[3] < (cj + 1) * CELL + 110, `${t.id} in its cell down`);
    }
  });
}

for (const land of LANDS) test(`finding them leaves the forest as the seed grows it${land > 1 ? ` (land ${land})` : ''}`, () => {
  const fresh = growWorld(SEED, [], land, [], EARTH);
  const before = generateVegetation(fresh, 3, -4, 64, TRUNK);
  const ground = generateTerrain(fresh, 3, -4, 2, 64).heights;
  new Towns(fresh).within(-1500, -1500, 1500, 1500);
  const after = generateVegetation(fresh, 3, -4, 64, TRUNK);
  for (const k of VEG_KINDS) assert.deepEqual(after.lists[k], before.lists[k], k);
  assert.deepEqual(generateTerrain(fresh, 3, -4, 2, 64).heights, ground);
  assert.equal(fresh.pads.length, 0, 'no pad is levelled for them');
});

test('no town is grown where a real place reaches, and everywhere else they are as they were', () => {
  // told from the hikes' cards alone: their land is never fetched here
  const landforms = new Landforms(HIKES);
  const keepOff = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const found = new Towns(gen, { keepOff });
  const plain = new Towns(gen);
  const cell = (x) => Math.floor(x / CELL);
  for (const card of HIKES) {
    const [ci, cj] = card.at.map(cell);
    for (const [i, j] of [[0, 0], [1, 0], [0, -1], [-1, 1]]) assert.equal(found.cell(ci + i, cj + j), null, `none on ${card.id}`);
    // a little beyond its reach, the forest's own
    const fi = cell(card.at[0] + reachOf(card) + 2 * CELL);
    if (!keepOff(fi * CELL - 110, cj * CELL - 110, (fi + 1) * CELL + 110, (cj + 1) * CELL + 110)) assert.deepEqual(found.cell(fi, cj), plain.cell(fi, cj));
  }
  assert.deepEqual(found.within(-1500, -1500, 1500, 1500), plain.within(-1500, -1500, 1500, 1500), 'the towns near the start are where they were');
});

test("a town's id finds it again, and nothing else", () => {
  const other = new Towns(growWorld(SEED, [], 1, [], EARTH));
  for (const t of all.slice(0, 6)) assert.deepEqual(other.byId(t.id), t);
  for (const bad of ['', 'town', 'town:1', 'town:x:y', 'cabin:0:0', 'castle:0:0', 42, null]) assert.equal(other.byId(bad), null, String(bad));
  const [ci, cj] = all[0].id.split(':').slice(1).map(Number);
  assert.equal(new Sites(gen).byId(`town:${ci}:${cj}`), null, "a town's id is never an old place's");
});

test('the map hears of them a few at a time, and catches up', () => {
  const t = new Towns(growWorld(SEED, [], 1, [], EARTH));
  assert.deepEqual(t.within(-2500, -2500, 2500, 2500, false), [], 'nothing known yet');
  assert.ok(t.queue.size > 10);
  while (t.pump(50) > 0);
  assert.deepEqual(t.within(-2500, -2500, 2500, 2500, false), WORLDS[0].towns.within(-2500, -2500, 2500, 2500));
});

// ── What stands there ────────────────────────────────────────────────────────
const material = new THREE.MeshBasicMaterial();
const materials = { body: material, glow: material };
const ground = (x, z) => gen.height(x, z);
// One of each building of each style, from towns across both lands.
const SAMPLES = (() => {
  const out = new Map();
  for (const { all, gen } of WORLDS) {
    for (const t of all) {
      for (const lot of t.lots) {
        const key = `${t.style}/${lot.type}${lot.ruin ? ' (fallen in)' : ''}`;
        if (!out.has(key)) out.set(key, { town: t, lot, ground: (x, z) => gen.height(x, z) });
      }
    }
  }
  return out;
})();
// What you can walk into, through a door in its front.
const DOORS = { store: 1, saloon: 1, hotel: 1, bank: 1, jail: 1, shack: 1, house: 1, shop: 1, inn: 1, tall: 1, church: 1, livery: 1, smithy: 1 };

test('every building is built, with somewhere to stand and walls to stop at', () => {
  const types = new Set([...SAMPLES.values()].map((s) => s.lot.type));
  for (const type in BUILDINGS) assert.ok(types.has(type), `there's ${BUILDINGS[type].label} somewhere`);
  for (const [key, { town, lot, ground }] of SAMPLES) {
    const built = buildLot(town, lot, ground, materials);
    let verts = 0;
    built.object.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position.array;
      verts += p.length / 3;
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${key}: a finite vertex`);
      assert.ok(o.geometry.attributes.color, `${key}: coloured`);
    });
    assert.ok(verts > 200, `${key}: ${verts} vertices`);
    assert.ok(built.solids.length > 0, `${key}: something solid`);
    const plan = { ...lot, box: [lot.x - 40, lot.z - 40, lot.x + 40, lot.z + 40], plan: [[-lot.w / 2, -lot.d / 2, lot.w / 2, lot.d / 2]] };
    for (const s of built.solids) {
      for (const v of [s.ax, s.az, s.bx, s.bz, s.r, s.bottom, s.topA, s.topB]) assert.ok(Number.isFinite(v), `${key}: a finite solid`);
      assert.ok(s.topA > s.bottom, `${key}: a solid's top is above its bottom`);
      // on its lot, or just in front of it: a hitching rail, a wagon in the street
      for (const [x, z] of [[s.ax, s.az], [s.bx, s.bz]]) assert.ok(onPlan(plan, x, z, 4.5), `${key}: its solids are on its lot`);
    }
    if (DOORS[lot.type] && !lot.ruin) {
      // a floor of boards above the ground, walls and a roof for the camera
      const y0 = ground(lot.x, lot.z);
      const floor = built.solids.filter((x) => x.surface === 'boards');
      assert.ok(floor.length >= 2, `${key}: a floor`);
      assert.ok(built.blockers.length >= 4, `${key}: walls for the camera`);
      // ...and a way in: somewhere along the front, a walk from the street
      // to inside its front wall that no wall stands in
      const [, , , z1] = bodyOf(lot);
      const level = Math.max(...floor.map((f) => f.topA)) + 1;
      let way = false;
      for (let x = -lot.w / 2 + 0.4; x < lot.w / 2 - 0.4 && !way; x += 0.1) {
        const a = toWorld(lot, x, lot.d / 2 + 1);
        const b = toWorld(lot, x, z1 - 0.8);
        way = !built.solids.some((s) => s.bottom < level && s.topA > level && segSeg(a, b, s) < s.r + 0.3);
      }
      assert.ok(way, `${key}: a door you can walk in through (ground ${y0.toFixed(1)})`);
    }
    built.object.traverse((o) => o.isMesh && o.geometry.dispose());
  }
});

test('a street is laid over the ground from end to end', () => {
  for (const t of all.slice(0, 4)) {
    const mesh = buildStreet(t, ground, material);
    const p = mesh.geometry.attributes.position;
    const n = mesh.geometry.attributes.normal;
    for (let i = 0; i < p.count; i += 7) {
      const x = p.getX(i) + mesh.position.x;
      const z = p.getZ(i) + mesh.position.z;
      const y = p.getY(i) + mesh.position.y;
      assert.ok(Math.abs(y - ground(x, z) - 0.05) < 1e-3, 'just over the ground');
      assert.ok(n.getY(i) > 0, 'facing up');
    }
    mesh.geometry.dispose();
  }
});

// ── The people ───────────────────────────────────────────────────────────────
const scene = { add() {}, remove() {} };
const lived = all.find((t) => t.people > 0 && t.style !== 'creepy');
const haunted = WORLDS.flatMap((w) => w.all).find((t) => t.people > 0 && t.style === 'creepy');

test('people are dressed for their town, and are one mesh each', () => {
  const rnd = mulberry32(5);
  for (const style of ['western', 'village', 'creepy']) {
    for (let i = 0; i < 24; i++) {
      const look = lookOf(style, rnd);
      const { mesh } = buildPerson(look, i);
      assert.ok(mesh.isSkinnedMesh, 'one skinned mesh');
      const p = mesh.geometry.attributes.position.array;
      for (let k = 0; k < p.length; k++) assert.ok(Number.isFinite(p[k]));
      const c = mesh.geometry.attributes.color.array;
      for (let k = 0; k < c.length; k++) assert.ok(Number.isFinite(c[k]) && c[k] >= 0, `${style}: coloured`);
      if (style === 'creepy') assert.ok(look.dark && look.height > 1, 'tall and dark');
      mesh.geometry.dispose();
    }
  }
});

test('people go about their town, stop for you, and say hello', () => {
  const folk = new Townsfolk(lived, { scene, ground });
  const said = [];
  folk.on('hello', (h) => said.push(h));
  assert.equal(folk.people.length, lived.people);
  const far = { x: lived.x + 5000, z: lived.z + 5000 };
  const ctx = { player: far, night: 0, hours: 13, inView: () => true };
  const from = folk.people.map((p) => [p.x, p.z]);
  for (let i = 0; i < 1200; i++) folk.update(0.05, ctx);
  assert.equal(said.length, 0, 'nobody to talk to');
  const moved = folk.people.filter((p, i) => Math.hypot(p.x - from[i][0], p.z - from[i][1]) > 3).length;
  assert.ok(moved > 0, 'some walk somewhere else');
  // walk up to someone standing about (they come and go as they please, so
  // now and then everyone is on their way somewhere: wait for one to stop)
  let p = folk.people.find((q) => !q.path.length);
  for (let i = 0; !p && i < 2400; i++) {
    folk.update(0.05, ctx);
    p = folk.people.find((q) => !q.path.length);
  }
  assert.ok(p, 'someone stops to stand about');
  folk.update(0.05, { ...ctx, player: { x: p.x + 1.5, z: p.z } });
  assert.ok(said.length === 1 && said[0].line.length > 2 && Number.isFinite(said[0].y), `they say something (${said[0] && said[0].line})`);
  // (whoever it was: someone standing beside them may have got in first)
  const greeter = folk.people.find((q) => q.x === said[0].x && q.z === said[0].z);
  assert.ok(greeter && greeter.body.waving > 0, 'and wave');
  folk.update(0.05, { ...ctx, player: { x: p.x + 1.5, z: p.z } });
  assert.equal(said.length, 1, 'once, not every frame');
  // after dark they go in
  for (let i = 0; i < 2400; i++) folk.update(0.05, { ...ctx, night: 0.9, hours: 23 });
  assert.ok(folk.people.filter((q) => q.indoors).length >= folk.people.length - 2, 'most are indoors after dark');
  for (let i = 0; i < 40; i++) folk.update(0.05, { ...ctx, night: 0, hours: 9 });
  assert.equal(folk.people.filter((q) => q.indoors).length, 0, 'and out again in the morning');
  folk.dispose();
});

test("a dark town's people only move while you aren't looking", () => {
  assert.ok(haunted, 'a dark town with someone in it');
  const folk = new Townsfolk(haunted, { scene, ground });
  const gone = [];
  folk.on('vanish', (v) => gone.push(v));
  const p = folk.people[0];
  const you = { x: p.x + 20, z: p.z };
  const at = [p.x, p.z];
  for (let i = 0; i < 400; i++) folk.update(0.05, { player: you, night: 0, hours: 13, inView: () => true });
  assert.deepEqual([p.x, p.z], at, 'watched, it stands where it is');
  for (let i = 0; i < 400; i++) folk.update(0.05, { player: you, night: 0, hours: 13, inView: () => false });
  assert.ok(Math.hypot(p.x - you.x, p.z - you.z) < 19, 'unwatched, it comes closer');
  // walk right up to it, look away, and it's gone
  you.x = p.x + 3;
  folk.update(0.05, { player: you, night: 0, hours: 13, inView: () => false });
  assert.ok(p.gone > 0 && gone.some((v) => v.x === p.x && v.z === p.z), 'and close up it is gone, with a whisper where it was');
  folk.dispose();
});

// The helpers above.
function segSeg(a, b, s) {
  // the least distance between the segments a-b and s.a-s.b, in plan
  const d = (px, pz, ax, az, bx, bz) => {
    const ex = bx - ax;
    const ez = bz - az;
    const l2 = ex * ex + ez * ez;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / l2)) : 0;
    return Math.hypot(px - ax - ex * t, pz - az - ez * t);
  };
  let best = Math.min(d(a.x, a.z, s.ax, s.az, s.bx, s.bz), d(b.x, b.z, s.ax, s.az, s.bx, s.bz), d(s.ax, s.az, a.x, a.z, b.x, b.z), d(s.bx, s.bz, a.x, a.z, b.x, b.z));
  const cross = (ox, oz, px, pz, qx, qz) => (px - ox) * (qz - oz) - (pz - oz) * (qx - ox);
  const d1 = cross(a.x, a.z, b.x, b.z, s.ax, s.az);
  const d2 = cross(a.x, a.z, b.x, b.z, s.bx, s.bz);
  const d3 = cross(s.ax, s.az, s.bx, s.bz, a.x, a.z);
  const d4 = cross(s.ax, s.az, s.bx, s.bz, b.x, b.z);
  if (d1 * d2 < 0 && d3 * d4 < 0) best = 0;
  return best;
}
