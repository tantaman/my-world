// Hikes: the list of them (K), the way to one's trailhead and to where its
// photo was taken, and the land beyond the forest drawn from up there.
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
    // K lists the hikes; each has a way to its trailhead and to its view
    await key('KeyK');
    const listed = await page.evaluate(() => ({
      open: document.getElementById('hikes').classList.contains('open'),
      names: [...document.querySelectorAll('#hikes li .hikes-name')].map((n) => n.firstChild.textContent),
    }));
    assert.ok(listed.open, 'K opens the list of hikes');
    assert.deepEqual(listed.names, hikes.map((x) => x.name), 'and every hike is on it');
    await key('KeyK');
    assert.ok(!(await page.evaluate(() => document.getElementById('hikes').classList.contains('open'))), 'K again closes it');
    const pick = async (at) => {
      await key('KeyK');
      await page.click(`#hikes li[data-hike="${h.id}"] [data-act="${at}"]`);
      await frames(3);
    };
    // its land is fetched the first time: wait to be there, and for the forest round it
    const arrive = (to) =>
      page.evaluate((p) => T.until(() => Math.hypot(world.player.pos.x - p.x, world.player.pos.z - p.z) < 1 && world.game.chunks.isFullyLoaded(), 60000), to);
    const before = await page.evaluate(() => world.hikes.list()[0].land);
    assert.ok(!before, "a hike's land isn't fetched until you go near it");
    await pick('trailhead');
    await arrive(h.trailhead);
    const start = await where();
    near(start, h.trailhead, 'trailhead goes to the trailhead');
    assert.match(start.track, new RegExp(h.name), 'and the HUD points the way to the view');
    await pick('view');
    await arrive(h.view);
    const drawn = await page.evaluate(() => T.until(() => world.hikes.list()[0].farView && world.game.chunks.isFullyLoaded(), 90000));
    assert.ok(drawn, 'the far view is drawn');
    await frames(60);
    const top = await where();
    near(top, h.view, 'the view goes to where the photo was taken');
    const seen = await page.evaluate(() => ({ hours: world.sky.hours, fog: world.game.pipeline.fogFar, climb: world.player.pos.y }));
    assert.ok(seen.fog > 400, `from up there you can see a long way (${Math.round(seen.fog)} m)`);
    // what the forest grows of its own accord (an old cabin, a dock) keeps off a real place
    const old = await page.evaluate((v) => world.map.places.within(v.x - 600, v.z - 600, v.x + 600, v.z + 600).filter((p) => !p.id.startsWith('hike:')).map((p) => p.id), h.view);
    assert.deepEqual(old, [], 'no old place stands on the hike');
    await shot('the-view');
    return { hike: h.id, ...seen };
  });
}
