// A mark left on the map: named, tracked on the HUD, and still there after a
// reload.
//
// Leaves: the world opened with &creative.

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
}
