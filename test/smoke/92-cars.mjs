// Cars: onto the lot of a dealership; beside a car on it, F (the act key),
// and it's yours, with you at the wheel; W drives it off, S stops it; F gets
// you out beside it, where it waits; F beside it, and you're back in.
//
// The dealership is a named one (pinned in test/golden/dealers-20261119.json),
// the nearest to the start, so the parts before can leave you anywhere. A lot
// faces across its town's road, into the town, so what's straight ahead of a
// car leaving it is a few dozen metres off: it's driven off for far enough to
// be under way, not to the far side of town.
//
// Needs: nothing of what came before. Leaves: you standing beside your car.

import assert from 'node:assert/strict';

// Broken Gulch's, 1.8 km east of the start
const DEALER = 'dealer:town:1:-1';
// m W is held for: well under way, short of what stands across the road
// (however quickly the frames come)
const DRIVE_TO = 8;

export default async function ({ page, step, key, frames, shot }) {
  await step('buy a car, and drive it', async () => {
    const d = await page.evaluate((id) => world.cars.go(id), DEALER);
    assert.ok(d, `there’s ${DEALER}`);
    await page.waitForFunction(() => world.chunks.isFullyLoaded(), null, { timeout: 120000 });
    await frames(20);
    const lot = await page.evaluate(() => world.cars.at && world.cars.at.name);
    assert.equal(lot, d.name, 'you’re on its lot');
    await page.evaluate(() => world.cars.toLot('ridgeback'));
    await frames(5);
    assert.ok(await page.evaluate(() => T.until(() => /buy the Ridgeback/.test(T.prompt()), 10000)), `beside it, F would buy it (${await page.evaluate(() => T.prompt())})`);
    await shot('lot');
    await key('KeyF');
    const mine = await page.evaluate(() => world.cars.mine);
    assert.ok(mine && mine.kind === 'ridgeback' && mine.driving, `it’s yours, and you’re in it (${JSON.stringify(mine)})`);
    // off it goes
    const from = { x: mine.x, z: mine.z };
    await page.keyboard.down('KeyW');
    await page.evaluate(({ from, far }) => T.until(() => Math.hypot(world.cars.mine.x - from.x, world.cars.mine.z - from.z) > far, 20000), { from, far: DRIVE_TO });
    await page.keyboard.up('KeyW');
    const going = await page.evaluate(() => ({ v: world.cars.car.v, ...world.cars.mine }));
    const went = Math.hypot(going.x - from.x, going.z - from.z);
    assert.ok(went > 5 && going.v > 1, `W drives it (${went.toFixed(1)} m, ${going.v.toFixed(1)} m/s)`);
    await shot('driving');
    // D swings it round to its right: its right hand, pointing (sin yaw, cos yaw), is (-cos yaw, sin yaw)
    await page.keyboard.down('KeyD');
    await frames(30);
    await page.keyboard.up('KeyD');
    const turned = await page.evaluate(() => world.cars.mine.yaw);
    const right = -Math.cos(going.yaw) * Math.sin(turned) + Math.sin(going.yaw) * Math.cos(turned);
    assert.ok(right > 0, `D steers it right (yaw ${going.yaw.toFixed(2)} to ${turned.toFixed(2)})`);
    // S brings it to a stop, and F gets you out beside it
    await page.keyboard.down('KeyS');
    await page.waitForFunction(() => world.cars.car.speed < 0.5, null, { timeout: 60000 });
    await page.keyboard.up('KeyS');
    await key('KeyF');
    const out = await page.evaluate(() => {
      const m = world.cars.mine;
      const p = world.player.pos;
      return { driving: m.driving, x: m.x, z: m.z, d: Math.hypot(p.x - m.x, p.z - m.z), aboard: !!world.player.aboard };
    });
    assert.ok(!out.driving && !out.aboard && out.d < 4, `out beside it (${JSON.stringify(out)})`);
    // it waits where you left it, and F beside it gets you back in
    await frames(20);
    const still = await page.evaluate(() => world.cars.mine);
    assert.ok(Math.hypot(still.x - out.x, still.z - out.z) < 0.01, 'it stays put');
    assert.ok(await page.evaluate(() => T.until(() => /get into your Ridgeback/.test(T.prompt()), 10000)), `beside it, F would get you in (${await page.evaluate(() => T.prompt())})`);
    await key('KeyF');
    assert.ok(await page.evaluate(() => world.cars.driving), 'back in');
    await key('KeyF');
    assert.ok(!(await page.evaluate(() => world.cars.driving)), 'and out again');
    return { dealer: d.name, went: +went.toFixed(1) };
  });
}
