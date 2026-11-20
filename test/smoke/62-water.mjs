// Running water: wade into the nearest stream, be carried by it, hear it,
// and splash running up it.
//
// Leaves: you standing in a stream.

import assert from 'node:assert/strict';

export default async function ({ page, step, shot }) {
  await step('wade a stream', async () => {
    // Find running water you can stand in, near where we are, and stand in it.
    const spot = await page.evaluate(() => {
      const { gen, player } = world;
      const w = gen.water;
      let best = null;
      for (let r = 0; r < 320 && !best; r += 3) {
        for (let a = 0; a < 6.28; a += 3 / Math.max(3, r)) {
          const x = player.pos.x + Math.cos(a) * r;
          const z = player.pos.z + Math.sin(a) * r;
          const h = gen.height(x, z);
          const speed = Math.hypot(w.flowX, w.flowZ);
          const depth = w.level - h;
          if (w.region && w.edge < -0.6 && speed > 0.6 && depth > 0.45 && depth < 1) {
            best = { x, z, fx: w.flowX / speed, fz: w.flowZ / speed, depth };
            break;
          }
        }
      }
      return best;
    });
    assert.ok(spot, 'there is a stream to wade within reach');
    const got = await page.evaluate(async (s) => {
      await world.teleport(s.x, s.z, Math.atan2(-s.fx, -s.fz));
      const p = world.player;
      const x0 = p.pos.x;
      const z0 = p.pos.z;
      await T.frames(40);
      const carried = (p.pos.x - x0) * s.fx + (p.pos.z - z0) * s.fz;
      const water = world.chunks.waterAround(p.pos.x, p.pos.z, 45, { sources: [] });
      return { wade: p.wade, current: Math.hypot(p.current.x, p.current.z), carried, sources: water.count };
    }, spot);
    assert.ok(got.wade > 0.2, `standing in the water (${got.wade.toFixed(2)} m)`);
    assert.ok(got.carried > 0.01, `the current carries you downstream (${got.carried.toFixed(3)} m)`);
    assert.ok(got.sources >= 1, 'the stream can be heard');
    // and running upstream through it throws water about
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    const thrown = await page.evaluate(async () => {
      let most = 0;
      for (let i = 0; i < 60; i++) {
        await T.frames(1);
        most = Math.max(most, world.splashes.live);
      }
      return most;
    });
    await shot('wading');
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    assert.ok(thrown > 0, 'running through water splashes');
    return { ...got, depth: spot.depth, thrown };
  });
}
