// Water runs downhill, gathers somewhere, and stays where the land holds it.
// These are rules, not recorded answers: they hold for any seed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldGen } from '../src/world/worldgen.js';
import { generateTerrain, WATER_STRIDE as WS } from '../src/world/chunkGen.js';
import { NET } from '../src/world/drainage.js';

const SEEDS = [20261119, 42, 7];
const AREA = 14; // cells of the drainage grid each way from the middle

function* nodes(net) {
  for (let j = -AREA; j <= AREA; j++) for (let i = -AREA; i <= AREA; i++) yield net.node(i, j);
}

for (const seed of SEEDS) {
  test(`seed ${seed}: water never runs uphill`, () => {
    const gen = new WorldGen(seed, []);
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

  test(`seed ${seed}: every stream ends in a pond, a lake or more water`, () => {
    const gen = new WorldGen(seed, []);
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
      assert.ok(b, `the stream from ${n.i},${n.j} runs out at ${m.i},${m.j} with nowhere to go`);
      if (b.kind === 'lake') lakes++;
    }
    assert.ok(lakes > 0, 'no stream reaches a lake');
  });

  test(`seed ${seed}: the current runs down the channel, and water stays in its banks`, () => {
    const gen = new WorldGen(seed, []);
    const w = gen.water;
    let running = 0;
    for (let z = -400; z <= 400; z += 3) {
      for (let x = -400; x <= 400; x += 3) {
        gen.height(x, z);
        const speed = Math.hypot(w.flowX, w.flowZ);
        if (!w.region || w.edge > -0.4 || speed < 0.05) continue;
        const level = w.level;
        gen.height(x + (w.flowX / speed) * 2, z + (w.flowZ / speed) * 2);
        if (!w.region) continue;
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

test('any part of the network can be worked out on its own', () => {
  // A worker that only ever sees one corner of the world must agree with one
  // that has seen it all, whatever order they came at it in.
  const a = new WorldGen(20261119, []).water.net;
  const b = new WorldGen(20261119, []).water.net;
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
