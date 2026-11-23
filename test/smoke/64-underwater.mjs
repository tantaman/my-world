// Under the water: go out to the sea, dive in it among the fish, swim along
// under the surface, and come back up.
//
// Needs: a world new to this browser, grown on the newest land, with the
// real Earth's sea a long walk from the start (the Pacific, 7 km and more
// west of the Hoh).
// Leaves: you where it found you, out of the water.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  await step('dive in the sea', async () => {
    const back = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, yaw: world.player.yaw }));
    assert.ok(await page.evaluate(() => !!world.gen.sea), 'this world has a sea');
    // out from the start a ring at a time, a spot every 250 m, until one is
    // sea that deep
    const spot = await page.evaluate(() => {
      const s = world.player.start;
      for (let r = 0; r <= 20000; r += 250) {
        const n = Math.max(8, Math.round((2 * Math.PI * r) / 250));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const got = world.underwater.find('sea', { x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r, depth: 10, reach: 0 });
          if (got) return got;
        }
      }
      return null;
    });
    assert.ok(spot, 'there is sea deep enough to dive in within reach');
    await page.evaluate(async (s) => world.teleport(s.x, s.z), spot);
    await frames(10);
    const top = await page.evaluate(() => ({ swimming: world.player.swimming, under: world.underwater.under }));
    assert.ok(top.swimming && !top.under, 'out of your depth, you float');

    // shift takes you under, and the camera with you
    await page.keyboard.down('ShiftLeft');
    const went = await page.evaluate(() => T.until(() => world.underwater.under && world.player.under > 2.5, 90000));
    await page.keyboard.up('ShiftLeft');
    assert.ok(went, 'holding shift takes you under, and the camera with you');
    const down = await page.evaluate(async () => {
      const fish = await T.until(() => world.underwater.fish().length > 0, 60000);
      return { fish, deep: world.player.under, muffled: world.sound.muffled, schools: world.underwater.fish().map((s) => s.kind) };
    });
    assert.ok(down.fish, 'there are fish in the sea');
    assert.equal(down.muffled, 1, 'and everything from above is dulled');
    await shot('under-the-sea');

    // swim along, lying flat
    await page.keyboard.down('KeyW');
    const swam = await page.evaluate(async () => {
      const p = world.player;
      const x0 = p.pos.x;
      const z0 = p.pos.z;
      await T.frames(40);
      return { moved: Math.hypot(p.pos.x - x0, p.pos.z - z0), prone: p.prone };
    });
    await page.keyboard.up('KeyW');
    assert.ok(swam.moved > 0.3 && swam.prone > 0.3, `you swim along under the water, lying flat (${swam.moved.toFixed(2)} m, ${swam.prone.toFixed(2)})`);

    // and space brings you back up, where everything sounds as it should
    await page.keyboard.down('Space');
    const up = await page.evaluate(() => T.until(() => !world.underwater.under, 90000));
    await page.keyboard.up('Space');
    assert.ok(up, 'space brings you back up');
    assert.equal(await page.evaluate(() => world.sound.muffled), 0, 'where everything sounds as it should');

    await page.evaluate(async (b) => world.teleport(b.x, b.z, b.yaw), back);
    return { ...down, ...swam, depth: spot.depth };
  });
}
