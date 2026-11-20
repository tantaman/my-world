// Water runs downhill, gathers somewhere, and stays where the land holds it.
// These are rules, not recorded answers: they hold for any seed, on any land.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { generateTerrain, WATER_STRIDE as WS } from '../src/world/chunkGen.js';
import { NET } from '../src/world/drainage.js';

const SEEDS = [20261119, 42, 7];
const AREA = 14; // cells of the drainage grid each way from the middle

function* nodes(net) {
  for (let j = -AREA; j <= AREA; j++) for (let i = -AREA; i <= AREA; i++) yield net.node(i, j);
}

// Each seed on each land, and the middle of a stretch of lake country on the
// second (where the lakes are biggest), in drainage cells.
const WORLDS = LANDS.flatMap((land) => SEEDS.map((seed) => ({ seed, land, on: land > 1 ? ` on land ${land}` : '' })));

for (const { seed, land, on } of WORLDS) {
  test(`seed ${seed}${on}: water never runs uphill`, () => {
    const gen = growWorld(seed, [], land);
    const net = gen.water.net;
    let channels = 0;
    for (const n of nodes(net)) {
      const next = net.next(n);
      if (next) assert.ok(net.level(next) <= net.level(n), `from ${n.i},${n.j} the water would climb`);
      const s = net.segment(n);
      if (!s) continue;
      channels++;
      for (let q = 1; q <= s.count; q++) assert.ok(s.W[q] <= s.W[q - 1] + 1e-9, `the channel from ${n.i},${n.j} climbs at ${q}`);
      assert.ok(Math.abs(s.W[0] - net.level(n)) < 1e-9 && Math.abs(s.W[s.count] - net.level(next)) < 1e-9, 'a channel joins its ends');
    }
    assert.ok(channels > 40, `only ${channels} channels`);
  });

  test(`seed ${seed}${on}: every stream ends in a pond, a lake, the sea or more water`, () => {
    const gen = growWorld(seed, [], land);
    const net = gen.water.net;
    let lakes = 0;
    for (const n of nodes(net)) {
      if (!net.segment(n)) continue;
      // follow it down until it stops
      let m = n;
      for (let steps = 0; net.next(m); steps++) {
        assert.ok(steps < 5000, 'water going round in circles');
        m = net.next(m);
      }
      const b = net.basin(m);
      const sea = gen.sea && net.level(m) === gen.sea.level;
      assert.ok(b || sea, `the stream from ${n.i},${n.j} runs out at ${m.i},${m.j} with nowhere to go`);
      if (b && b.kind === 'lake') lakes++;
    }
    assert.ok(lakes > 0, 'no stream reaches a lake');
  });

  test(`seed ${seed}${on}: the current runs down the channel, and water stays in its banks`, () => {
    const gen = growWorld(seed, [], land);
    const w = gen.water;
    let running = 0;
    for (let z = -400; z <= 400; z += 3) {
      for (let x = -400; x <= 400; x += 3) {
        gen.height(x, z);
        const speed = Math.hypot(w.flowX, w.flowZ);
        if (!w.region || w.edge > -0.4 || speed < 0.05) continue;
        const level = w.level;
        const fx = w.flowX / speed;
        const fz = w.flowZ / speed;
        gen.height(x + fx * 2, z + fz * 2);
        if (!w.region) continue;
        // (where the current turns sharply, that's another channel: one that
        // crosses this one, which the network lets happen now and then)
        const on = Math.hypot(w.flowX, w.flowZ);
        if (on > 0.05 && (w.flowX * fx + w.flowZ * fz) / on < 0.5) continue;
        running++;
        assert.ok(w.level <= level + 0.05, `at ${x},${z} the current runs uphill`);
      }
    }
    assert.ok(running > 100, `only ${running} points of running water`);
    // A wet vertex never sits beside dry ground lower than its water.
    for (const [cx, cz] of [[0, 0], [-2, 1], [1, 4], [3, -3], [-4, -2]]) {
      const t = generateTerrain(gen, cx, cz, 1, 64);
      const N = t.n + 1;
      for (let k = 0; k < N * N; k++) {
        if (t.wData[k * WS] < 0.5 || t.heights[k] >= t.wLevel[k]) continue;
        const i = k % N;
        for (const m of [k - 1, k + 1, k - N, k + N]) {
          if (m < 0 || m >= N * N || Math.abs((m % N) - i) > 1 || t.wData[m * WS] > 0.5) continue;
          assert.ok(t.heights[m] > t.wLevel[k] - 0.05, `water spills out of its banks in chunk ${cx},${cz}`);
        }
      }
    }
  });
}

for (const land of LANDS) test(`any part of the network can be worked out on its own${land > 1 ? `, on land ${land}` : ''}`, () => {
  // A worker that only ever sees one corner of the world must agree with one
  // that has seen it all, whatever order they came at it in.
  const a = growWorld(20261119, [], land).water.net;
  const b = growWorld(20261119, [], land).water.net;
  for (let j = AREA; j >= -AREA; j--) for (let i = AREA; i >= -AREA; i--) b.level(b.node(i, j));
  for (const [i, j] of [[3, -2], [-7, 5], [0, 0], [11, 9]]) {
    const na = a.node(i, j);
    const nb = b.node(i, j);
    assert.equal(a.acc(na), b.acc(nb));
    assert.equal(a.level(na), b.level(nb));
    assert.equal(a.next(na)?.k, b.next(nb)?.k);
  }
  assert.ok(NET.cell > 0);
});

// Lake country on the second land, for seed 20261119: the biggest lakes.
const LAKE_COUNTRY = { x: -1275, z: -85 };

for (const land of LANDS) test(`nothing that reaches a spot is missed when shaping it${land > 1 ? `, on land ${land}` : ''}`, () => {
  // Shaping a point only looks at the channels and lakes near its cell. Do it
  // again with every one in a much wider window: the land must come out the
  // same.
  const seed = 20261119;
  const quick = growWorld(seed, [], land);
  const thorough = growWorld(seed, [], land);
  const at = land > 1 ? LAKE_COUNTRY : { x: 0, z: 0 };
  const net = thorough.water.net;
  const wide = new Map();
  net.near = (ci, cj) => {
    const key = `${ci},${cj}`;
    if (wide.has(key)) return wide.get(key);
    const segs = [];
    const basins = [];
    for (let j = cj - 9; j <= cj + 9; j++) {
      for (let i = ci - 9; i <= ci + 9; i++) {
        const n = net.node(i, j);
        const s = net.segment(n);
        if (s) segs.push(s);
        const b = net.down(n) ? null : net.basin(n);
        if (b) basins.push(b);
      }
    }
    // the nearest first, as there's only room for so many
    const C = NET.cell;
    const d = (s) => Math.min(...[0, 1, 2, 3, 4].map((f) => Math.hypot(s.pts[Math.round((s.count * f) / 4) * 2] - (ci + 0.5) * C, s.pts[Math.round((s.count * f) / 4) * 2 + 1] - (cj + 0.5) * C)));
    segs.sort((a, b) => d(a) - d(b));
    const out = { segs, basins };
    wide.set(key, out);
    return out;
  };
  let wet = 0;
  for (let z = at.z - 500; z <= at.z + 500; z += 7) {
    for (let x = at.x - 500; x <= at.x + 500; x += 7) {
      const a = quick.height(x, z);
      const b = thorough.height(x, z);
      assert.ok(Math.abs(a - b) < 1e-9, `at ${x},${z} the ground is ${a} one way and ${b} the other`);
      assert.equal(quick.water.level, thorough.water.level, `at ${x},${z} the water stands differently`);
      if (quick.water.region) wet++;
    }
  }
  assert.ok(wet > 200);
});
