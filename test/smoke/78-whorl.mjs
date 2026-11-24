// The Whorl: picked on the map, `go here` sets you down at the foot of the
// Nautilus Lookout Tower at Owl Creek Landing, in Virginia Beach, and the
// tower stands up round you. Up its ramp on foot, a lap and more, a step at
// a time and never through it; then at the top, by the slide's mouth, F
// sits you on a mat and down you go: in the tube, round the turns, out
// under the foot of the ramp and along the run-out, and onto your feet at
// the bottom, the ride counted.
//
// Needs: nothing in particular (the Whorl is on the map from anywhere).
// Leaves: you on the ground at the end of the Whorl's run-out.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('to the Whorl, from the map', async () => {
    await key('KeyM');
    const place = await page.evaluate(() => {
      const p = world.map.places.get('whorl:the-whorl');
      world.map.centerOn(p.x, p.z);
      world.map.selectPlace(p.id);
      return p;
    });
    assert.ok(place, 'the Whorl is on the map');
    await frames(5);
    assert.equal(await page.evaluate(() => document.getElementById('place-name').textContent), 'the Whorl', 'by name');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    const there = await page.evaluate((p) => T.until(() => Math.hypot(world.player.pos.x - p.x, world.player.pos.z - p.z) < 20, 120000), place);
    assert.ok(there, 'go here sets you down at the foot of the tower');
    assert.ok(await page.evaluate(() => T.until(() => world.whorl.built, 120000)), 'and the tower stands up');
    await frames(10);
    await shot('the foot of the Nautilus Lookout Tower');
    return { at: place };
  });

  await step('up the ramp, on foot', async () => {
    // walked along the middle of the ramp, a little ahead at a time
    const walked = await page.evaluate(async () => {
      const LAPS = 1.25;
      // (from the ground at the foot of it: right over where it starts is
      // the top of it, where a teleport would put you)
      await world.whorl.go('foot');
      await T.frames(10);
      const start = { ...world.whorl.ramp(0), y: world.player.pos.y };
      let low = 0; // how far under the ramp you ever were (m)
      for (let u = 0.02; u <= LAPS; u += 0.02) {
        const to = world.whorl.ramp(u);
        world.player.steer = { x: to.x, z: to.z, run: true };
        const ok = await T.until(() => Math.hypot(world.player.pos.x - to.x, world.player.pos.z - to.z) < 1.2, 20000);
        if (!ok) return { stuck: u, y: world.player.pos.y, want: to.y };
        low = Math.max(low, to.y - world.player.pos.y);
      }
      world.player.steer = null;
      await T.frames(10);
      const end = world.whorl.ramp(LAPS);
      return { y: world.player.pos.y, want: end.y, climbed: world.player.pos.y - start.y, low, free: world.player.rides.free };
    });
    assert.ok(!walked.stuck, `walked on up (stuck ${walked.stuck} laps up, at ${walked.y} for ${walked.want})`);
    assert.ok(walked.climbed > 3.5, `up a lap and more (${walked.climbed.toFixed(1)} m)`);
    assert.ok(Math.abs(walked.y - walked.want) < 0.4 && walked.low < 0.4, 'on the ramp all the way, never through it');
    assert.ok(walked.free, 'on your own feet');
    return walked;
  });

  await step('down the Whorl', async () => {
    await page.evaluate(() => world.whorl.go('top'));
    await frames(10);
    const at = await page.evaluate(() => ({ word: world.act.here()?.word, prompt: T.prompt() }));
    assert.equal(at.word, 'slide', 'by the mouth, F would slide');
    await shot('the top of the Nautilus Lookout Tower, by the mouth of the Whorl');
    await key('KeyF');
    assert.ok(await page.evaluate(() => !!world.whorl.riding && !world.player.rides.free), 'on the mat, and off');
    assert.ok(await page.evaluate(() => T.until(() => world.whorl.riding && world.whorl.riding.s > 20, 60000)), 'down the tube');
    const inTube = await page.evaluate(() => ({ ...world.whorl.riding, y: world.player.pos.y }));
    assert.ok(inTube.inside && inTube.v > 3, `in the tube, going (${inTube.v.toFixed(1)} m/s)`);
    await shot('in the Whorl');
    assert.ok(await page.evaluate(() => T.until(() => !world.whorl.riding, 60000)), 'and out at the bottom');
    await frames(20);
    const end = await page.evaluate(() => {
      const p = world.player.pos;
      const t = world.whorl.built;
      return { rides: world.whorl.rides, quickest: world.whorl.quickest, fastest: world.whorl.fastest, free: world.player.rides.free, up: p.y - world.player.groundAt(p.x, p.z, p.y + 0.1), out: Math.hypot(p.x - t.at[0], p.z - t.at[1]) };
    });
    assert.equal(end.rides, 1, 'counted');
    assert.ok(end.quickest > 8 && end.quickest < 15, `about ten seconds down (${end.quickest.toFixed(1)} s)`);
    assert.ok(end.free && end.up < 0.3, 'on your feet, on the ground');
    assert.ok(end.out > 13.5, `out past the tower (${end.out.toFixed(1)} m from its middle)`);
    await shot('at the bottom of the Whorl');
    return end;
  });
}
