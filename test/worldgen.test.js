// The same seed must always grow the same world. A save is only the *diff*
// from the forest the seed grows, so if this drifts, every saved cabin ends
// up floating over (or buried in) somebody's hillside.
//
// Each land (src/world/lands.js) is pinned on its own: land 1's files are
// fields-<seed>.json and so on, land 2's fields-<seed>-land2.json.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { generateTerrain, generateVegetation, VEG_KINDS } from '../src/world/chunkGen.js';
import { renderTile, createVegCache } from '../src/map/mapRender.js';
import { matchesGolden, summarise } from './helpers/golden.js';

const TOL = 1e-6;
const SEEDS = [20261119, 42];
// Any fixed table will do here: what is pinned is where things are put.
const TRUNK = { pine: 0.3, broad: 0.4, birch: 0.2, bush: 0, fern: 0, rock: 0.7, log: 0 };

// The golden file for a land's share: land 1's have no suffix.
const named = (name, land) => (land > 1 ? `${name}-land${land}` : name);

for (const land of LANDS) for (const seed of SEEDS) {
  const on = land > 1 ? ` on land ${land}` : '';
  // Land 1 has always been pinned on a small square round the middle; the
  // second changes over kilometres, so it is pinned over a wider one too.
  const spans = land > 1 ? [300, 2400] : [300];

  test(`seed ${seed}${on}: the fields of the land`, () => {
    const gen = growWorld(seed, [], land);
    const out = [];
    for (const span of spans) {
      for (let z = -span; z <= span; z += span / 4) {
        for (let x = -span; x <= span; x += span / 4) {
          const h = gen.height(x, z);
          const w = gen.water;
          const p = { x, z, h, water: w.region ? [w.region, w.level] : 0, path: gen.pathMask(x, z), forest: gen.forest(x, z), species: gen.species(x, z), moist: gen.moisture(x, z) };
          if (land > 1) Object.assign(p, { groves: gen.groves(x, z), above: gen.above(x, z, h), snow: gen.snow(x, z, h) });
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
