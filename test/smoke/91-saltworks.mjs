// Walk through the mapped entrance, play a round locally, and return outside.
import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('walk into Saltworks', async () => {
    const gate = await page.evaluate(() => world.map.places.get('arena:saltworks'));
    assert.equal(gate.name, 'Saltworks');
    await page.evaluate(() => world.saltworks.go());
    await shot('saltworks-gate');
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction(() => world.saltworks.active, null, { timeout: 8000 });
    } finally {
      await page.keyboard.up('KeyW');
    }
    await page.waitForFunction(() => world.saltworks.state?.phase === 'live');
    const roster = await page.evaluate(() => {
      const state = world.saltworks.state;
      return { humans: state.fighters.filter((f) => f.human).length, team: state.fighters[state.me].team, total: state.fighters.length };
    });
    assert.deepEqual(roster, { humans: 1, team: 0, total: 10 });
    assert.ok(await page.getByRole('region', { name: 'Saltworks' }).isVisible());
    await shot('saltworks-arena');
    return roster;
  });

  await step('move, fire, and leave the arena', async () => {
    const position = () => page.evaluate(() => {
      const state = world.saltworks.state;
      return { fighter: state.fighters[state.me], hiker: { x: world.player.pos.x, z: world.player.pos.z } };
    });
    const before = await position();
    await page.keyboard.down('KeyW');
    await frames(16);
    await page.keyboard.up('KeyW');
    const after = await position();
    assert.ok(before.fighter.pos.z - after.fighter.pos.z > 0.5);
    assert.deepEqual(before.hiker, after.hiker);
    await page.evaluate(() => T.tap('use'));
    assert.ok((await position()).fighter.ammo < 12);

    await key('Backspace');
    assert.ok(await page.evaluate(() => !world.saltworks.active && !world.player.aboard && !world.game.covered));
    await frames(5);
    assert.ok(await page.getByRole('region', { name: 'Saltworks' }).isHidden());
  });
}
