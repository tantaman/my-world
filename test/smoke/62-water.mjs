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
      // The ground you stand on is the land on a 1 m grid, smoothed between
      // its corners: in a stream narrower than that, it's well above the
      // very bottom of the bed. So deep enough there, too.
      const underfoot = (x, z) => {
        const i = Math.floor(x);
        const j = Math.floor(z);
        const u = x - i;
        const v = z - j;
        return (gen.height(i, j) * (1 - u) + gen.height(i + 1, j) * u) * (1 - v) + (gen.height(i, j + 1) * (1 - u) + gen.height(i + 1, j + 1) * u) * v;
      };
      let best = null;
      // Near where we are, if there is any: and if not (it depends where the
      // parts before this left us), further off, looked for more coarsely.
      for (let r = 0; r < 1600 && !best; r += r < 320 ? 3 : 8) {
        for (let a = 0; a < 6.28; a += (r < 320 ? 3 : 8) / Math.max(3, r)) {
          const x = player.pos.x + Math.cos(a) * r;
          const z = player.pos.z + Math.sin(a) * r;
          const h = gen.height(x, z);
          const speed = Math.hypot(w.flowX, w.flowZ);
          const depth = w.level - h;
          if (w.region && w.edge < -0.6 && speed > 0.6 && depth > 0.45 && depth < 1) {
            // (gen.water says the last place asked about: read it before asking about others)
            const level = w.level;
            const flow = { x, z, fx: w.flowX / speed, fz: w.flowZ / speed, depth };
            if (level - underfoot(x, z) <= 0.45) continue;
            best = flow;
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
      // The ground has to be there before standing in it means anything, and
      // how deep you are standing is read straight away: a stream is a few
      // metres wide, and given a moment the current carries you out of the
      // deep of it and into the shallows at the side, which is not the
      // question being asked.
      await T.until(() => world.game.chunks.isFullyLoaded(), 60000);
      await T.frames(4);
      const wade = p.wade;
      const current = Math.hypot(p.current.x, p.current.z);
      const x0 = p.pos.x;
      const z0 = p.pos.z;
      await T.frames(40);
      const carried = (p.pos.x - x0) * s.fx + (p.pos.z - z0) * s.fz;
      const water = world.chunks.waterAround(p.pos.x, p.pos.z, 45, { sources: [] });
      return { wade, current, carried, sources: water.count };
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
