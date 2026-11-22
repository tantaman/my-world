// Cars: onto the lot of the nearest dealership; beside a car on it, click,
// and it's yours, with you at the wheel; W drives it off, S stops it; click
// gets you out beside it, where it waits; click beside it, and you're back in.
//
// Needs: nothing of what came before. Leaves: you standing beside your car.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  await step('buy a car, and drive it', async () => {
    const d = await page.evaluate(() => world.cars.go());
    assert.ok(d, 'there’s a dealership near enough');
    await page.waitForFunction(() => world.chunks.isFullyLoaded(), null, { timeout: 120000 });
    await frames(20);
    const lot = await page.evaluate(() => world.cars.at && world.cars.at.name);
    assert.equal(lot, d.name, 'you’re on its lot');
    await page.evaluate(() => world.cars.toLot('ridgeback'));
    await frames(5);
    assert.ok(await page.evaluate(() => T.until(() => /buy the Ridgeback/.test(T.prompt()), 10000)), `beside it, a click would buy it (${await page.evaluate(() => T.prompt())})`);
    await shot('lot');
    await page.evaluate(() => T.tap('use'));
    const mine = await page.evaluate(() => world.cars.mine);
    assert.ok(mine && mine.kind === 'ridgeback' && mine.driving, `it’s yours, and you’re in it (${JSON.stringify(mine)})`);
    // off it goes
    const from = { x: mine.x, z: mine.z };
    await page.keyboard.down('KeyW');
    await frames(120);
    await page.keyboard.up('KeyW');
    const going = await page.evaluate(() => ({ v: world.cars.car.v, ...world.cars.mine }));
    const went = Math.hypot(going.x - from.x, going.z - from.z);
    assert.ok(went > 5 && going.v > 1, `W drives it (${went.toFixed(1)} m, ${going.v.toFixed(1)} m/s)`);
    await shot('driving');
    // S brings it to a stop, and a click gets you out beside it
    await page.keyboard.down('KeyS');
    await page.waitForFunction(() => world.cars.car.speed < 0.5, null, { timeout: 60000 });
    await page.keyboard.up('KeyS');
    await page.evaluate(() => T.tap('use'));
    const out = await page.evaluate(() => {
      const m = world.cars.mine;
      const p = world.player.pos;
      return { driving: m.driving, x: m.x, z: m.z, d: Math.hypot(p.x - m.x, p.z - m.z), aboard: !!world.player.aboard };
    });
    assert.ok(!out.driving && !out.aboard && out.d < 4, `out beside it (${JSON.stringify(out)})`);
    // it waits where you left it, and a click beside it gets you back in
    await frames(20);
    const still = await page.evaluate(() => world.cars.mine);
    assert.ok(Math.hypot(still.x - out.x, still.z - out.z) < 0.01, 'it stays put');
    assert.ok(await page.evaluate(() => T.until(() => /get into your Ridgeback/.test(T.prompt()), 10000)), `beside it, a click would get you in (${await page.evaluate(() => T.prompt())})`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await page.evaluate(() => world.cars.driving), 'back in');
    await page.evaluate(() => T.tap('use'));
    assert.ok(!(await page.evaluate(() => world.cars.driving)), 'and out again');
    return { dealer: d.name, went: +went.toFixed(1) };
  });
}
