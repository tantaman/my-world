// Hikes: K to a hike's trailhead, K again to where its photo was taken, and
// the land beyond the forest drawn from up there.
//
// Leaves: you standing at a hike's view, kilometres from where the play began.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('go on a hike', async () => {
    const hikes = await page.evaluate(() => world.hikes.list());
    assert.ok(hikes.length > 0, 'there is a hike to go on');
    const [h] = hikes;
    // the HUD points up the trail, unless you're following a mark of your own
    await page.evaluate(() => world.marks.setTracked(null));
    const near = (p, q, what) => assert.ok(Math.hypot(p.x - q.x, p.z - q.z) < 1, `${what}: at ${p.x}, ${p.z}, not ${q.x}, ${q.z}`);
    const where = () => page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, track: document.getElementById('track').textContent }));
    await key('KeyK');
    await page.evaluate(() => T.until(() => world.game.chunks.isFullyLoaded(), 60000));
    const start = await where();
    near(start, h.trailhead, 'K goes to the trailhead');
    assert.match(start.track, new RegExp(h.name), 'and the HUD points the way to the view');
    await key('KeyK');
    const drawn = await page.evaluate(() => T.until(() => world.hikes.list()[0].farView && world.game.chunks.isFullyLoaded(), 90000));
    assert.ok(drawn, 'the far view is drawn');
    await frames(60);
    const top = await where();
    near(top, h.view, 'K again goes to where the photo was taken');
    const seen = await page.evaluate(() => ({ hours: world.sky.hours, fog: world.game.pipeline.fogFar, climb: world.player.pos.y }));
    assert.ok(seen.fog > 400, `from up there you can see a long way (${Math.round(seen.fog)} m)`);
    await shot('the-view');
    return { hike: h.id, ...seen };
  });
}
