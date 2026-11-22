// Waterfalls: on a hike whose map has them, each is found on the land when it
// arrives, drawn, and on the map by name; standing by one, it's in front of you.
//
// Leaves: you standing where the photo of a hike with falls was taken.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  await step('waterfalls', async () => {
    const before = await page.evaluate(() => world.falls.list());
    assert.ok(before.length > 0, 'a hike has falls');
    const hike = before[0].hike;
    assert.ok(before.filter((f) => f.hike === hike).every((f) => !f.drawn), "none is drawn before its hike's land is here");
    await page.evaluate((h) => world.hikes.go(h, 'view'), hike);
    await frames(10);
    const falls = await page.evaluate((h) => world.falls.list().filter((f) => f.hike === h), hike);
    for (const f of falls) {
      assert.ok(f.drawn, `${f.name} is drawn`);
      assert.ok(f.height > 0.8, `${f.name} drops (${f.height} m)`);
    }
    // each is a place on the map, by name
    const places = await page.evaluate((fs) => fs.map((f) => world.map.places.get(f.id)), falls);
    places.forEach((p, k) => {
      assert.ok(p && p.kind === 'waterfall' && p.name === falls[k].name, `${falls[k].name} is on the map`);
    });
    // a walk that goes on past the view can be gone to the end of
    const card = await page.evaluate((h) => world.hikes.list().find((c) => c.id === h), hike);
    if (card.end) assert.ok(Number.isFinite(card.end.x) && Number.isFinite(card.end.z), 'its end is somewhere');
    await shot('falls');
    return { hike, falls: falls.map((f) => `${f.name}: ${f.height} m${f.cascade ? ' (a cascade)' : ''}`) };
  });
}
