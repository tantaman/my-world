// The Metro: from a station's entrance on the street, down the escalators
// onto its platform, under the vault; a train in, on it, along the tunnel to
// the next station and off onto its platform; up the escalators to the street.
//
// Needs: nothing in particular (the stations are on the map from anywhere).
// Leaves: you on the street at an entrance of the station after Dupont Circle.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  const here = () => page.evaluate(() => world.act.here()?.word || null);

  await step('to a station, and down the escalators', async () => {
    const st = await page.evaluate(() => world.metro.stations().find((s) => s.id === 'dupont-circle'));
    assert.ok(st && st.lines.includes('red'), 'Dupont Circle, on the Red Line');
    assert.ok(await page.evaluate(() => world.map.places.get('metro:dupont-circle')), 'on the map');
    await page.evaluate(() => world.metro.go('dupont-circle'));
    // at the top of the escalators: walk down them
    const top = await page.evaluate(() => T.until(() => world.act.here()?.word === 'down to the trains', 60000));
    assert.ok(top, 'at the entrance, the way down');
    const was = await page.evaluate(() => world.player.pos.y);
    await page.keyboard.down('KeyW');
    const down = await page.evaluate((y) => T.until(() => world.player.pos.y < y - 8, 30000), was);
    await page.keyboard.up('KeyW');
    if (!down) await page.evaluate(() => world.act.press()); // (or F at the top)
    const on = await page.evaluate(() => T.until(() => world.player.space && world.player.pos.y < world.chunks.heightAt(world.player.pos.x, world.player.pos.z) - 8, 60000));
    assert.ok(on, 'down under the street');
    await frames(30);
    await shot('a Metro platform');
    return { depth: await page.evaluate(() => +(world.chunks.heightAt(world.player.pos.x, world.player.pos.z) - world.player.pos.y).toFixed(1)) };
  });

  await step('a train in, and on it', async () => {
    assert.ok(await page.evaluate(() => world.metro.soon()), 'a train due');
    const came = await page.evaluate(() => T.until(() => world.metro.trains().some((t) => t.standing && t.at === 'dupont-circle'), 60000));
    assert.ok(came, 'it comes in and stands');
    // over to its nearest door (walked there, it might have gone before you got to it)
    assert.ok(await page.evaluate(() => world.metro.toTrain()), 'a door open onto the platform');
    const at = await here();
    assert.equal(at, 'get on', 'beside a car, F gets you on');
    await page.evaluate(() => world.act.press());
    await frames(10);
    const aboard = await page.evaluate(() => world.metro.aboard());
    assert.ok(aboard && aboard.line === 'red', 'aboard a Red Line train');
    return aboard;
  });

  await step('along the tunnel to the next station, and off', async () => {
    const next = await page.evaluate(() => world.metro.aboard().next);
    const moving = await page.evaluate(() => T.until(() => !world.metro.trains().some((t) => t.standing && t.at === 'dupont-circle'), 60000));
    assert.ok(moving, 'it pulls out');
    await frames(60);
    assert.ok(await page.evaluate(() => !!world.player.space), 'in the tunnel, under the street');
    await shot('in a Metro train');
    const arrived = await page.evaluate((id) => T.until(() => world.metro.aboard()?.at === id, 240000), next);
    assert.ok(arrived, `it stands at ${next}`);
    await page.evaluate(() => world.act.press());
    await frames(10);
    assert.equal(await page.evaluate(() => world.metro.aboard()), null, 'off it');
    assert.ok(await page.evaluate(() => !!world.player.space), 'on the platform');
    return { at: next };
  });

  await step('up to the street', async () => {
    // to the foot of the escalators at the end of the platform
    const word = await page.evaluate(() => {
      const spot = world.metro.exits().sort((a, b) => Math.hypot(a.x - world.player.pos.x, a.z - world.player.pos.z) - Math.hypot(b.x - world.player.pos.x, b.z - world.player.pos.z))[0];
      world.player.spawn(spot.x, spot.z, spot.yaw, spot.yaw + Math.PI, spot.y);
      return world.act.here()?.word;
    });
    assert.equal(word, 'up to the street', 'at the end of the platform, the way up');
    await page.evaluate(() => world.act.press());
    await frames(10);
    const out = await page.evaluate(() => ({ space: !!world.player.space, above: world.player.pos.y - world.chunks.heightAt(world.player.pos.x, world.player.pos.z) }));
    assert.ok(Math.abs(out.above) < 1.5, 'on the street');
    return out;
  });
}
