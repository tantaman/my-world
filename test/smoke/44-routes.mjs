// Plan local and cross-world trips from the map without moving the player,
// and find destinations by searching for them.
import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('plan a route from the map', async () => {
    await key('KeyM');
    await page.click('[data-tab="routes"]');
    const option = (prefix) => page.locator(`button[data-destination^="${prefix}"]`).first();
    const list = (name) => page.click(`.route-lists button[data-list="${name}"]`);
    const rows = () => page.locator('.route-options button').count();
    // everywhere, nearest first, and more as the end of it comes into view.
    // The places are found a little at a time, while the map is still: the
    // first twenty take about 40 s on CI, from where the parts before leave you.
    await page.waitForFunction(() => document.querySelectorAll('.route-options button').length >= 20, null, { timeout: 90000 });
    const first = await rows();
    await page.locator('.route-more').scrollIntoViewIfNeeded();
    await page.waitForFunction((n) => document.querySelectorAll('.route-options button').length > n, first, { timeout: 90000 });
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

  await step('search the destinations', async () => {
    await key('KeyM');
    await page.click('[data-tab="routes"]');
    await page.click('.route-lists button[data-list=""]');
    const search = page.locator('.route-search');
    const ids = () => page.$$eval('.route-options button', (bs) => bs.map((b) => b.dataset.destination));
    // the gate is in no list, but a search finds it by what it leads to
    await search.fill('hell');
    await page.locator('.route-options button[data-destination="hell:gate"]').waitFor();
    // a kind of place: the caves, each put in by its distance as it's found
    await search.fill('cave');
    await page.waitForFunction(() => document.querySelectorAll('.route-options button[data-destination^="cave:"]').length >= 3, null, { timeout: 60000 });
    const caves = (await ids()).filter((id) => id.startsWith('cave:')).length;
    const d = await page.$$eval('.route-options button', (bs) => bs.map((b) => Number(b.dataset.d)));
    assert.deepEqual(d, d.slice().sort((a, b) => a - b), 'nearest first');
    // something that isn't there is looked for only so far, and then further
    await page.click('.route-lists button[data-list="caves"]');
    await search.fill('qqzx');
    await page.locator('[data-route="further"]').waitFor({ timeout: 60000 });
    assert.match(await page.locator('.route-more').textContent(), /Nothing matching “qqzx” in caves within 3\.0 km/);
    assert.equal((await ids()).length, 0);
    await page.click('[data-route="further"]');
    await page.locator('.route-more', { hasText: 'within 6.0 km.' }).waitFor({ timeout: 60000 });
    await page.click('.route-lists button[data-list=""]');
    // Enter goes to the first found
    await search.fill('hell');
    await page.locator('.route-options button[data-destination="hell:gate"]').waitFor();
    await search.press('Enter');
    await page.locator('.route-detail h4', { hasText: 'Gate' }).waitFor();
    await page.click('[data-route="back"]');
    // Esc clears the box first, and only then closes the map
    await search.focus();
    await page.keyboard.press('Escape');
    assert.equal(await search.inputValue(), '');
    assert.ok(await page.locator('#map.open').count());
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#map.open').count(), 0);
    return { caves };
  });
}
