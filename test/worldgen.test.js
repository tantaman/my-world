// The same seed must always grow the same world. A save is only the *diff*
// from the forest the seed grows, so if this drifts, every saved cabin ends
// up floating over (or buried in) somebody's hillside.
//
// Each land (src/world/lands.js) is pinned on its own: land 1's files are
// fields-<seed>.json and so on, a second land's fields-<seed>-land2.json.
// A land that is still a draft (FROZEN in lands.js) may be re-recorded.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { generateTerrain, generateVegetation, VEG_KINDS } from '../src/world/chunkGen.js';
import { renderTile, createVegCache } from '../src/map/mapRender.js';
import { matchesGolden, summarise } from './helpers/golden.js';
import { SEA } from '../src/world/sea.js';

const TOL = 1e-6;
const SEEDS = [20261119, 42];
// Any fixed table will do here: what is pinned is where things are put.
const TRUNK = { pine: 0.3, broad: 0.4, birch: 0.2, bush: 0, fern: 0, rock: 0.7, log: 0 };

// The golden file for a land's share: land 1's have no suffix.
const named = (name, land) => (land > 1 ? `${name}-land${land}` : name);

for (const land of LANDS) for (const seed of SEEDS) {
  const on = land > 1 ? ` on land ${land}` : '';
  // The land changes country over kilometres, so it is pinned over a wide
  // square as well as a small one round the middle.
  const spans = [300, 2400];

  test(`seed ${seed}${on}: the fields of the land`, () => {
    const gen = growWorld(seed, [], land);
    const out = [];
    for (const span of spans) {
      for (let z = -span; z <= span; z += span / 4) {
        for (let x = -span; x <= span; x += span / 4) {
          const h = gen.height(x, z);
          const w = gen.water;
          const p = { x, z, h, water: w.region ? [w.region, w.level] : 0, path: gen.pathMask(x, z), forest: gen.forest(x, z), species: gen.species(x, z), moist: gen.moisture(x, z) };
          Object.assign(p, { groves: gen.groves(x, z), above: gen.above(x, z, h), snow: gen.snow(x, z, h) });
          out.push(p);
        }
      }
    }
    matchesGolden(named(`fields-${seed}`, land), { spawn: gen.findSpawn(0, 0), points: out }, { tolerance: TOL });
  });

  test(`seed ${seed}${on}: terrain chunks`, () => {
    const gen = growWorld(seed, [], land);
    const out = {};
    for (const [cx, cz, step] of [[0, 0, 1], [-1, 2, 2], [3, -2, 4]]) {
      const t = generateTerrain(gen, cx, cz, step, 64);
      const sum = {};
      for (const k of Object.keys(t).sort()) sum[k] = ArrayBuffer.isView(t[k]) ? summarise(t[k]) : t[k];
      out[`${cx},${cz}@${step}`] = sum;
    }
    matchesGolden(named(`terrain-${seed}`, land), out, { tolerance: TOL });
  });

  test(`seed ${seed}${on}: what grows where`, () => {
    const gen = growWorld(seed, [], land);
    const out = {};
    for (const [cx, cz] of [[0, 0], [-2, 1], [5, -3]]) {
      const v = generateVegetation(gen, cx, cz, 64, TRUNK);
      const lists = {};
      for (const k of VEG_KINDS) lists[k] = summarise(v.lists[k], 14);
      out[`${cx},${cz}`] = { lists, colliders: summarise(v.colliders, 9) };
    }
    matchesGolden(named(`vegetation-${seed}`, land), out, { tolerance: TOL });
  });
}

for (const land of LANDS) test(`structures clear a pad and keep the forest off it${land > 1 ? `, on land ${land}` : ''}`, () => {
  const pad = { x: 120, z: -40, radius: 9 };
  const gen = growWorld(SEEDS[0], [pad], land);
  const centre = gen.height(pad.x, pad.z);
  for (const [dx, dz] of [[3, 0], [0, -4], [-2, 2]]) assert.ok(Math.abs(gen.height(pad.x + dx, pad.z + dz) - centre) < 0.05, 'the pad is flat');
  assert.ok(gen.padClearance(pad.x, pad.z) < 0, 'the middle of a pad is inside it');
  const v = generateVegetation(gen, Math.floor(pad.x / 64), Math.floor(pad.z / 64), 64, TRUNK);
  for (const k of ['pine', 'broad', 'birch', 'rock']) {
    for (let o = 0; o < v.lists[k].length; o += 7) {
      const d = Math.hypot(v.lists[k][o] - pad.x, v.lists[k][o + 2] - pad.z);
      assert.ok(d > pad.radius * 0.8, `${k} at ${d.toFixed(1)} m is on the pad`);
    }
  }
});

for (const land of LANDS) test(`the map is drawn from the same world${land > 1 ? `, on land ${land}` : ''}`, () => {
  const gen = growWorld(SEEDS[0], [], land);
  const veg = createVegCache(gen);
  const out = {};
  for (const [level, tx, tz] of [[1, 0, 0], [3, -1, 0], [-1, 2, 1]]) out[`${level}:${tx}:${tz}`] = summarise(renderTile(gen, level, tx, tz, veg), 16);
  matchesGolden(named('map-tiles', land), out);
});

// ── The sea ─────────────────────────────────────────────────────────────────
// Which lands have one: a land grown without a sea leaves gen.sea null, and
// the tests below are only for the lands that have one.
const SEA_LANDS = LANDS.filter((land) => growWorld(SEEDS[0], [], land).sea);

test('the land goes down to a sea, and knows which way it lies', () => {
  assert.deepEqual(SEA_LANDS, LANDS, 'every land this build grows has a sea');
  for (const land of SEA_LANDS) {
    const { sea } = growWorld(SEEDS[0], [], land);
    assert.ok(Number.isFinite(sea.level), `land ${land}: the sea stands at a level`);
    assert.ok(Math.abs(Math.hypot(sea.dirX, sea.dirZ) - 1) < 1e-9, `land ${land}: it lies in a direction`);
  }
});

for (const land of SEA_LANDS) for (const seed of SEEDS) {
  const on = land > 1 ? ` on land ${land}` : '';

  // Pinned along the way from the start to the sea, where the chunks near
  // the middle don't reach.
  test(`seed ${seed}${on}: the coast and the sea`, () => {
    const gen = growWorld(seed, [], land);
    const { dirX, dirZ } = gen.sea;
    const out = { points: [], chunks: {} };
    for (let d = 0; d <= 2000; d += 100) {
      const x = dirX * d;
      const z = dirZ * d;
      const h = gen.height(x, z);
      const w = gen.water;
      out.points.push({ d, h, water: w.region ? [w.region, w.level, w.kind] : 0, edge: Math.max(-500, Math.min(500, w.edge)) });
    }
    for (const k of [0.8, 1.1, 1.5]) {
      const cx = Math.floor((dirX * SEA.coastAt * k) / 64);
      const cz = Math.floor((dirZ * SEA.coastAt * k) / 64);
      const t = generateTerrain(gen, cx, cz, 2, 64);
      const v = generateVegetation(gen, cx, cz, 64, TRUNK);
      out.chunks[`${cx},${cz}`] = { heights: summarise(t.heights), wLevel: summarise(t.wLevel), wData: summarise(t.wData), rock: summarise(v.lists.rock, 8), trees: summarise(v.colliders, 8) };
    }
    matchesGolden(named(`sea-${seed}`, land), out, { tolerance: TOL });
  });
}

test('a real place out at sea stands as an island, and inland where the forest is', () => {
  for (const land of LANDS) {
    const gen = growWorld(SEEDS[0], [], land);
    assert.equal(gen.datumLevel(12.5), 12.5, `land ${land}: above the sea, where the forest is`);
    if (!gen.sea) assert.equal(gen.datumLevel(-80), -80, `land ${land}: no sea, so wherever the forest is`);
    else assert.equal(gen.datumLevel(gen.sea.level - 40), gen.sea.level + SEA.island, `land ${land}: out at sea, a little over it`);
  }
});

for (const land of SEA_LANDS) for (const seed of [...SEEDS, 7]) {
  const on = land > 1 ? ` on land ${land}` : '';

  test(`seed ${seed}${on}: you start on land, with the sea a walk away`, () => {
    const gen = growWorld(seed, [], land);
    const start = gen.findSpawn(0, 0);
    assert.ok(gen.height(start.x, start.z) > gen.sea.level + 3, 'the start is on dry land');
    // walk toward the coast until the water is over your head
    let shore = null;
    let deep = null;
    for (let d = 0; d < 2500 && !deep; d += 4) {
      const x = start.x + gen.sea.dirX * d;
      const z = start.z + gen.sea.dirZ * d;
      const h = gen.height(x, z);
      if (gen.water.kind !== 'sea' || !gen.water.region) continue;
      if (shore === null && h < gen.water.level) shore = d;
      if (gen.water.level - h > 25) deep = d;
    }
    assert.ok(shore !== null && shore > 250 && shore < 1200, `the shore is ${shore} m off`);
    assert.ok(deep !== null, 'and further out the sea is deep');
  });

  test(`seed ${seed}${on}: inland, no hollow goes below the sea, and lakes go deep`, () => {
    const gen = growWorld(seed, [], land);
    let inland = 0;
    for (let z = -3000; z <= 3000; z += 61) {
      for (let x = -3000; x <= 3000; x += 61) {
        if (gen.sea.drop(x, z) > SEA.inland[0]) continue;
        inland++;
        assert.ok(gen.broadHeight(x, z, 0) > gen.sea.level + SEA.floor * 0.9, `at ${x},${z} the land inland is below the sea`);
      }
    }
    assert.ok(inland > 1000);
    const net = gen.water.net;
    let deepest = 0;
    for (let j = -14; j <= 14; j++) {
      for (let i = -14; i <= 14; i++) {
        const n = net.node(i, j);
        if (net.down(n)) continue;
        const b = net.basin(n);
        if (b && b.kind === 'lake') deepest = Math.max(deepest, b.depth);
      }
    }
    assert.ok(deepest > 15, `the deepest lake is only ${deepest.toFixed(1)} m`);
  });
}
