// Plan local and cross-world trips from the map without moving the player.
import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('plan a route from the map', async () => {
    await key('KeyM');
    await page.click('[data-tab="routes"]');
    const option = (prefix) => page.locator(`button[data-destination^="${prefix}"]`).first();
    const list = (name) => page.click(`.route-lists button[data-list="${name}"]`);
    const rows = () => page.locator('.route-options button').count();
    // everywhere, nearest first, and more as the end of it comes into view
    await page.waitForFunction(() => document.querySelectorAll('.route-options button').length >= 20);
    const first = await rows();
    await page.locator('.route-more').scrollIntoViewIfNeeded();
    await page.waitForFunction((n) => document.querySelectorAll('.route-options button').length > n, first, { timeout: 30000 });
    await list('launch sites');
    await option('spaceport:').waitFor();
    await list('ski');
    await option('ski:').waitFor();
    await list('hikes');
    await option('hike:vallee-blanche:view').waitFor();
    await list('video stores');
    await option('videostore:').click();
    const directions = page.locator('.route-detail ol');
    assert.match(await directions.textContent(), /Head .*direct/);
    await page.click('[data-route="follow"]');
    await frames(5);
    assert.match(await page.locator('#track').textContent(), /video/i);
    await key('KeyM');
    await page.click('[data-route="follow"]');
    await page.click('[data-route="back"]');
    await list('hikes');
    await option('hike:tignes:view').click();
    await page.waitForFunction(() => document.querySelector('.route-detail ol')?.textContent.includes('Fly to'), null, { timeout: 60000 });
    assert.match(await directions.textContent(), /Head .*Tignes/);
    const alps = await page.evaluate(() => world.airports.list().find((s) => s.for.includes('Tignes')));
    assert.ok((await directions.textContent()).includes(`Fly to ${alps.name}`));
    // Wait for the destination terrain to fill in after the cross-world jump.
    await page.waitForFunction(() => {
      const m = world.map;
      const tiles = m._tileList(m.stop, m.cx, m.cz, m.W, m.H).list;
      return tiles.every((t) => m.tiles.has(t.level, t.tx, t.tz));
    }, null, { timeout: 60000 });
    await frames(2);
    await shot('route-to-tignes');
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 700 });
    await page.click('[data-act="side"]');
    await page.locator('.route-detail [data-airfield]').first().click();
    assert.equal(await page.locator('#map-side').isVisible(), false);
    await page.click('[data-act="side"]');
    await page.click('[data-route="locate"]');
    const centered = await page.evaluate(() => {
      const p = world.map.places.get('hike:tignes:view');
      return Math.hypot(world.map.cx - p.x, world.map.cz - p.z);
    });
    assert.ok(centered < 1);
    await page.setViewportSize(viewport);
    await page.click('[data-route="back"]');
    await page.click('[data-tab="places"]');
    await key('Escape');
  });
}
