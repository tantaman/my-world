// The far view: in the high country you can see a long way, and down in the
// forest (the Hoh's valley, where everyone starts) the air closes in as it
// always has.
//
// Needs: nothing of what came before. Leaves: you where it found you.

import assert from 'node:assert/strict';

export default async function ({ page, step, shot }) {
  await step('the forest keeps its own horizon', async () => {
    const got = await page.evaluate(() => ({
      worthIt: world.far.worthIt(),
      drawn: world.far.list().drawn,
      fogFar: world.game.pipeline.fogFar,
    }));
    assert.equal(got.worthIt, false, 'no high country round the start, down in the valley');
    assert.deepEqual(got.drawn, [], 'so nothing is drawn far off');
    assert.equal(got.fogFar, 0, 'and the fog is where the chunks end, as ever');
    return got;
  });

  await step('from a massif you can see a long way', async () => {
    const was = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, yaw: world.player.yaw }));
    // find the highest ground round the start, from the broad height alone
    // (cheap: no water): on the real Earth, the Cascades' volcanoes
    const at = await page.evaluate(() => {
      let best = null;
      for (let x = -45000; x <= 45000; x += 1500) {
        for (let z = -45000; z <= 45000; z += 1500) {
          const h = world.gen.broadHeight(x, z, 0);
          if (!best || h > best[2]) best = [x, z, h];
        }
      }
      return best;
    });
    assert.ok(at, 'there is high country out there');
    assert.ok(at[2] > 500, `and it stands up (${Math.round(at[2])} m)`);

    await page.evaluate(async (p) => void (await world.teleport(p[0], p[1], 0)), at);
    const drawn = await page.evaluate(() => T.until(() => world.far.list().drawn.length > 0, 90000));
    assert.ok(drawn, 'the far land is drawn');
    const got = await page.evaluate(async () => {
      await T.frames(150); // the fog eases out rather than jumping
      return {
        worthIt: world.far.worthIt(),
        drawn: world.far.list().drawn,
        reach: world.far.reach(),
        fogFar: world.game.pipeline.fogFar,
        high: world.chunks.heightAt(world.player.pos.x, world.player.pos.z),
      };
    });
    assert.equal(got.worthIt, true);
    assert.ok(got.high > 500, `standing high up (${Math.round(got.high)} m)`);
    assert.ok(got.reach > 800, `land drawn a long way off (${Math.round(got.reach)} m)`);
    // the chunks reach 4 × 64 m; the air is now clear far past them
    assert.ok(got.fogFar > 600, `and the air is clear well past the chunks (${Math.round(got.fogFar)} m)`);
    await shot('far-view');

    // back where we started, so the parts after this one begin where they did
    await page.evaluate(async (w) => void (await world.teleport(w.x, w.z, w.yaw)), was);
    await page.evaluate(() => T.frames(10));
    return { at: [at[0], at[1]], reach: Math.round(got.reach), fogFar: Math.round(got.fogFar) };
  });
}
