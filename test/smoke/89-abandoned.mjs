// Arrive by the map, cross a real threshold, follow the central corridor,
// and walk back out through the same opening.
import assert from 'node:assert/strict';

export default async function ({ page, key, frames, step, shot, open }) {
  await step('inside the abandoned wards', async () => {
    const sites = await page.evaluate(() => world.abandoned.sites);
    assert.equal(sites.length, 2, 'both institutions found dry ground');
    for (const s of sites) {
      await key('KeyM');
      await page.evaluate((site) => {
        world.map.centerOn(site.door.x, site.door.z);
        world.map.selectPlace(site.id);
        document.querySelector('#place-card [data-act="place-go"]').click();
      }, s);
      assert.ok(await page.evaluate((site) => T.until(() => !world.map.isOpen && Math.hypot(world.player.pos.x - site.door.x, world.player.pos.z - site.door.z) < 1), s));
      await frames(5);
      await shot(s.name + ' entrance');
      // Let the room use the real audio graph while walking its floor.
      await page.evaluate(() => world.sound.setEnabled(true));
      await page.keyboard.down('KeyW');
      try {
        assert.ok(await page.evaluate((site) => T.until(() => world.abandoned.inside === site.id, 50000), s), 'walk up the steps and through the door');
        assert.ok(
          await page.evaluate((site) => T.until(() => Math.hypot(world.player.pos.x - site.door.x, world.player.pos.z - site.door.z) > 17, 30000), s),
          'past the lobby',
        );
      } finally {
        await page.keyboard.up('KeyW');
      }
      await frames(3);
      assert.ok(await page.evaluate((s) => world.map.places.get(s.id).visited, s));
      await shot(s.name);
      await page.evaluate(() => world.sound.setEnabled(false));
      if (s.kind === 'asylum') {
        await page.waitForTimeout(2500); // The local save records the player’s position every two seconds.
        await open();
        assert.equal(await page.evaluate(() => world.abandoned.inside), s.id, 'a reload keeps you on the ward floor');
      }
      await page.keyboard.down('KeyS');
      try {
        assert.ok(await page.evaluate(() => T.until(() => world.abandoned.inside === null, 50000)), 'walk out again');
      } finally {
        await page.keyboard.up('KeyS');
      }
    }
    return sites.map((s) => s.name);
  });
}
