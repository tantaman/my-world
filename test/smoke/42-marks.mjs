// A mark left on the map: named, tracked on the HUD, still there after a
// reload, and somewhere to go back to with `go here`.
//
// Leaves: the world opened with &creative, you back where it found you, and
// nothing tracked on the HUD (so that what follows starts where it always
// did, and can point the way somewhere of its own).

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, open }) {
  await step('leave a mark', async () => {
    await key('KeyM');
    await frames(20);
    const box = await page.locator('#map-canvas').boundingBox();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await frames(5);
    await page.keyboard.type('the level spot');
    await page.keyboard.press('Enter');
    await frames(5);
    const made = await page.evaluate(() => world.marks.list().map((m) => m.name));
    assert.deepEqual(made, ['the level spot'], 'a click on the map leaves a mark, and it takes a name');
    await page.evaluate(() => {
      const m = world.marks.list()[0];
      world.marks.setTracked(m.id);
    });
    await key('Escape');
    await frames(5);
    const hud = await page.evaluate(() => document.getElementById('track').textContent);
    assert.match(hud, /the level spot/, 'the HUD points the way to a tracked mark');
    await page.evaluate(() => T.frames(120));
    await open('&creative');
    const kept = await page.evaluate(() => ({ names: world.marks.list().map((m) => m.name), tracked: !!world.marks.trackedMark() }));
    assert.deepEqual(kept, { names: ['the level spot'], tracked: true }, 'and it is still there after a reload');
    return kept;
  });

  await step('go to it from the map', async () => {
    const mark = await page.evaluate(() => world.marks.list()[0]);
    const was = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, yaw: world.player.yaw }));
    const away = await page.evaluate(async (m) => {
      await world.teleport(m.x + 300, m.z - 240);
      return Math.hypot(world.player.pos.x - m.x, world.player.pos.z - m.z);
    }, mark);
    assert.ok(away > 300, `a long way off (${Math.round(away)} m)`);
    await key('KeyM');
    await frames(10);
    // pick it out of the list beside the map, then go there
    await page.click(`#mark-list button[data-mark="${mark.id}"]`);
    await page.evaluate(() => T.until(() => !world.map.fly, 10000)); // let the map stop flying, so its card holds still
    await frames(5);
    await page.click('#mark-editor [data-act="go"]');
    const there = await page.evaluate((m) => T.until(() => Math.hypot(world.player.pos.x - m.x, world.player.pos.z - m.z) < 1, 60000), mark);
    assert.ok(there, 'go here stands you on the mark');
    const shut = await page.evaluate(() => ({ map: world.map.isOpen, said: document.getElementById('toast').textContent }));
    assert.equal(shut.map, false, 'and closes the map');
    assert.match(shut.said, /the level spot/, 'saying where you are');
    // Back where the next part expects you, tracking nothing: a tracked mark
    // holds the HUD's guide for good (the first source with one wins, see
    // ui/hud.js), so anything later that points the way somewhere of its own
    // would never get a look in.
    await page.evaluate((w) => {
      world.marks.setTracked(null);
      world.teleport(w.x, w.z, w.yaw);
    }, was);
    return { away: Math.round(away), said: shut.said };
  });
}
