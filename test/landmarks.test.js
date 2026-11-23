// The old places in the forest: where they are is grown from the seed (so
// everyone in a world finds the same cabin), they're few and far between,
// each stands somewhere that suits it, and finding them changes nothing
// about the forest a save is the diff from.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { growWorld, LANDS } from '../src/world/lands.js';
import { generateVegetation, generateTerrain, VEG_KINDS } from '../src/world/chunkGen.js';
import { toWorld, toLocal, onPlan } from '../src/world/frame.js';
import { Sites, CELL } from '../src/landmarks/sites.js';
import { KINDS, KIND_IDS } from '../src/landmarks/kinds.js';
import { buildSite } from '../src/landmarks/models.js';
import { MarkStore } from '../src/map/marks.js';
import { Places } from '../src/map/places.js';
import { matchesGolden } from './helpers/golden.js';
import { earthAtFirst } from './helpers/earth.js';
// The real Earth under the world, as the game has it when it opens (world/earth.js).
const EARTH = await earthAtFirst();

const SEED = 20261119;
const AREA = 2100; // m either side of the middle
const TRUNK = { pine: 0.3, broad: 0.4, birch: 0.2, bush: 0, fern: 0, rock: 0.7, log: 0 };

// The seed on each land (src/world/lands.js). The places stand on whatever
// land they find, so the rules about where are checked on every one.
const WORLDS = LANDS.map((land) => {
  const gen = growWorld(SEED, [], land, [], EARTH);
  const sites = new Sites(gen);
  return { land, on: land > 1 ? ` (land ${land})` : '', gen, sites, all: sites.within(-AREA, -AREA, AREA, AREA) };
});
const { gen, sites, all } = WORLDS[0];

test('the same seed puts the same places in the same spots', () => {
  const again = new Sites(growWorld(SEED, [], 1, [], EARTH)).within(-800, -800, 800, 800);
  const first = all.filter((s) => s.box[2] >= -800 && s.box[0] <= 800 && s.box[3] >= -800 && s.box[1] <= 800);
  assert.ok(first.length > 3);
  assert.deepEqual(again, first);
});

for (const land of LANDS) for (const seed of [SEED, 42]) {
  test(`seed ${seed}${land > 1 ? ` on land ${land}` : ''}: where the old places are`, () => {
    const s = seed === SEED ? WORLDS[land - 1].sites : new Sites(growWorld(seed, [], land, [], EARTH));
    const list = s.within(-900, -900, 900, 900).map(({ id, name, x, z, yaw, len }) => ({ id, name, x, z, yaw, len }));
    matchesGolden(land > 1 ? `landmarks-${seed}-land${land}` : `landmarks-${seed}`, list, { tolerance: 1e-6 });
  });
}

for (const { on, gen, all } of WORLDS) {
  test(`they're few and far between, and every kind turns up${on}`, () => {
    const km2 = ((2 * AREA) / 1000) ** 2;
    const perKm2 = all.length / km2;
    assert.ok(perKm2 > 3 && perKm2 < 9, `${perKm2.toFixed(1)} per km²`);
    const kinds = new Set(all.map((s) => s.kind));
    for (const k of KIND_IDS) assert.ok(kinds.has(k), `there is a ${k}`);
    // one to a cell, so never two on top of each other
    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 20, `${a.id} and ${b.id} are apart`);
      }
    }
  });

  test(`none where people first arrive${on}`, () => {
    const start = gen.findSpawn(0, 0);
    for (const s of all) assert.ok(Math.hypot(s.x - start.x, s.z - start.z) > 150, `${s.id} keeps clear of the start`);
  });

  test(`each stands somewhere that suits it${on}`, () => {
    const w = gen.water;
    for (const s of all) {
      const K = KINDS[s.kind];
      if (K.search === 'shore') {
        // out over the water, deep enough at the end to tie a boat
        const end = toWorld(s, 0, s.len);
        assert.ok(s.level - gen.height(end.x, end.z) >= 0.7, `${s.id}: water at the end of the dock`);
        const foot = toWorld(s, 0, -1.6);
        assert.ok(gen.height(foot.x, foot.z) - s.level < 0.6, `${s.id}: its shore end meets the ground`);
        continue;
      }
      let lo = Infinity;
      let hi = -Infinity;
      const [x0, z0, x1, z1] = K.level;
      for (const [lx, lz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [0, 0]]) {
        const p = toWorld(s, lx, lz);
        const h = gen.height(p.x, p.z);
        assert.ok(w.edge > 0.4, `${s.id}: dry ground`);
        assert.ok(gen.pathEdge > 0.4, `${s.id}: not on a footpath`);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      assert.ok(hi - lo <= K.slope + 1e-9, `${s.id}: the ground falls ${(hi - lo).toFixed(2)} m`);
      if (K.search === 'bank') {
        w.probe(s.x, s.z);
        assert.ok(w.edge < 6 && w.kind !== 'stream', `${s.id}: by a river, a pond or a lake`);
      }
    }
  });

  test(`the cells are big enough to keep a site in${on}`, () => {
    // A site's plan stays within its cell (and a little spill): what near() relies on.
    for (const s of all) {
      const [ci, cj] = s.id.split(':').slice(1).map(Number);
      assert.ok(s.box[0] > ci * CELL - 15 && s.box[2] < (ci + 1) * CELL + 15, `${s.id} in its cell across`);
      assert.ok(s.box[1] > cj * CELL - 15 && s.box[3] < (cj + 1) * CELL + 15, `${s.id} in its cell down`);
    }
  });
}

for (const land of LANDS) test(`finding them leaves the forest as the seed grows it${land > 1 ? ` (land ${land})` : ''}`, () => {
  const fresh = growWorld(SEED, [], land, [], EARTH);
  const before = generateVegetation(fresh, 3, -4, 64, TRUNK);
  const ground = generateTerrain(fresh, 3, -4, 2, 64).heights;
  new Sites(fresh).within(-1200, -1200, 1200, 1200);
  const after = generateVegetation(fresh, 3, -4, 64, TRUNK);
  for (const k of VEG_KINDS) assert.deepEqual(after.lists[k], before.lists[k], k);
  assert.deepEqual(generateTerrain(fresh, 3, -4, 2, 64).heights, ground);
  assert.equal(fresh.pads.length, 0, 'no pad is levelled for them');
});

test("a place's id finds it again, and nothing else", () => {
  const other = new Sites(growWorld(SEED, [], 1, [], EARTH));
  for (const s of all.slice(0, 12)) assert.deepEqual(other.byId(s.id), s);
  const empty = all[0].id.replace(/^[a-z]+/, (k) => (k === 'well' ? 'cabin' : 'well'));
  assert.equal(other.byId(empty), null, 'the right cell, the wrong kind');
  for (const bad of ['', 'cabin', 'castle:0:0', 'cabin:1', 'cabin:x:y', 42, null]) assert.equal(other.byId(bad), null, String(bad));
});

test('a site measures its own ground', () => {
  const s = all.find((x) => x.kind === 'cabin');
  const p = toWorld(s, 1.5, -2);
  const l = toLocal(s, p.x, p.z);
  assert.ok(Math.abs(l.x - 1.5) < 1e-9 && Math.abs(l.z + 2) < 1e-9);
  // its front faces (sin yaw, cos yaw)
  const f = toWorld(s, 0, 1);
  assert.ok(Math.abs(f.x - s.x - Math.sin(s.yaw)) < 1e-9 && Math.abs(f.z - s.z - Math.cos(s.yaw)) < 1e-9);
  assert.ok(onPlan(s, s.x, s.z));
  assert.ok(!onPlan(s, s.x + 30, s.z));
  const d = toWorld(s, 3.9, 0);
  assert.ok(onPlan(s, d.x, d.z, 0.5) && !onPlan(s, d.x, d.z));
});

test('the map hears of them a few at a time, and catches up', () => {
  const s = new Sites(growWorld(SEED, [], 1, [], EARTH));
  assert.deepEqual(s.within(-1500, -1500, 1500, 1500, false), [], 'nothing known yet');
  assert.ok(s.queue.size > 50);
  while (s.pump(50) > 0);
  assert.deepEqual(s.within(-1500, -1500, 1500, 1500, false), sites.within(-1500, -1500, 1500, 1500));
});

test('every kind is built, with somewhere to stand and walls to stop at', () => {
  const material = new THREE.MeshBasicMaterial();
  const ground = (x, z) => gen.height(x, z);
  for (const kind of KIND_IDS) {
    const s = all.find((x) => x.kind === kind);
    const built = buildSite(s, ground, material);
    let verts = 0;
    built.object.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position.array;
      verts += p.length / 3;
      for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${kind}: a finite vertex`);
      assert.ok(o.geometry.attributes.color, `${kind}: coloured`);
    });
    assert.ok(verts > 300, `${kind}: ${verts} vertices`);
    assert.ok(built.solids.length > 0, `${kind}: something solid`);
    for (const sol of built.solids) {
      for (const v of [sol.ax, sol.az, sol.bx, sol.bz, sol.r, sol.bottom, sol.topA, sol.topB]) assert.ok(Number.isFinite(v), `${kind}: a finite solid`);
      assert.ok(sol.topA > sol.bottom, `${kind}: a solid's top is above its bottom`);
      for (const [x, z] of [[sol.ax, sol.az], [sol.bx, sol.bz]]) assert.ok(onPlan(s, x, z, 0.6), `${kind}: its solids are on its plan`);
    }
    if (kind === 'cabin' || kind === 'hunting') {
      // a floor of boards, above the ground, under its roof
      const floor = built.solids.filter((x) => x.surface === 'boards');
      assert.ok(floor.length >= 3, `${kind}: a floor`);
      for (const f of floor) assert.ok(f.topA > ground((f.ax + f.bx) / 2, (f.az + f.bz) / 2) - 0.3, `${kind}: the floor is above the ground`);
      assert.ok(built.blockers.length >= 5, `${kind}: walls and a roof for the camera`);
    }
    if (kind === 'dock') {
      const boards = built.solids.filter((x) => x.surface === 'boards');
      assert.ok(boards.filter((x) => x.topA > s.level + 0.3).length >= 2, 'a deck above the water');
      assert.ok(boards.some((x) => Math.abs(x.topA - s.level) < 0.2), 'and a boat to step down into');
      assert.equal(built.bobbing.length, 1, 'a boat that rides the water');
    }
    built.object.traverse((o) => o.isMesh && o.geometry.dispose());
  }
});

test('a place on the map can be tracked like a mark', () => {
  const places = new Places();
  const place = { id: 'cabin:1:2', x: 10, z: 20, name: 'Hollis cabin', kind: 'old cabin', note: '', glyph: KINDS.cabin.glyph, visited: false };
  places.addSource({ within: () => [place], get: (id) => (id === place.id ? place : null) });
  const marks = new MarkStore();
  marks.findPlace = (id) => places.get(id);
  marks.setTracked('cabin:1:2');
  assert.equal(marks.tracked, 'cabin:1:2');
  const m = marks.trackedMark();
  assert.equal(m.name, 'Hollis cabin');
  assert.ok(m.color, 'with a colour for the HUD');
  marks.load([]);
  assert.equal(marks.tracked, 'cabin:1:2', 'a place is kept when the marks change');
  marks.setTracked('well:9:9');
  assert.equal(marks.tracked, null, "somewhere that isn't there can't be tracked");
  assert.equal(places.get('notaplace'), null, "a mark's id is never a place's");
  assert.deepEqual(places.nearest(0, 0, 100, 3).map((p) => p.place.id), ['cabin:1:2']);
});
