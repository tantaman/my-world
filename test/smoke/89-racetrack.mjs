// A race track: picked on the map, `go here` sets you down at the paddock
// gate looking out at the grid. Walk up to your car on the apron and a click
// puts you in it at the back of the grid; the lights come on one by one and
// go out, and W takes you off down the straight, past the line, with the
// race card, the speed and the little map on the screen. Over the line for
// the last time, the race is over and says where you came; stopped, a click
// would race again, and a right-click gets you out, back on the apron.
//
// Needs: nothing in particular (the tracks are on the map from anywhere).
// Leaves: you on the apron by your car, out of it, one race run.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  const race = () =>
    page.evaluate(() => ({
      driving: world.racetrack.driving,
      state: world.racetrack.state(),
      card: !document.getElementById('race').hidden,
      cardText: document.getElementById('race').textContent,
      gauge: document.getElementById('race-gauge').hidden ? null : document.getElementById('race-gauge').textContent,
      prompt: T.prompt(),
      toast: document.getElementById('toast').textContent,
    }));

  let site;
  await step('to a race track, from the map', async () => {
    // the nearest town with a track, looked for outright
    site = await page.evaluate(() => {
      const towns = world.towns.towns;
      const p = world.player.pos;
      const S = towns.size;
      let best = null;
      for (let r = 0; r <= 4 && !best; r++) {
        for (let j = -r; j <= r; j++) {
          for (let i = -r; i <= r; i++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
            const t = towns.cell(Math.floor(p.x / S) + i, Math.floor(p.z / S) + j);
            const s = t && world.racetrack.tracks.forTown(t);
            if (s && (!best || Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z))) best = s;
          }
        }
      }
      return best && { id: best.id, name: best.name, layout: best.layout, door: best.door };
    });
    assert.ok(site, 'there is a race track within a few kilometres');
    await key('KeyM');
    await page.evaluate((s) => {
      world.map.centerOn(s.door.x, s.door.z);
      world.map.selectPlace(s.id);
    }, site);
    await frames(5);
    assert.equal(await page.evaluate(() => document.getElementById('place-name').textContent), site.name, 'it is on the map');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    assert.ok(await page.evaluate((s) => T.until(() => !world.map.isOpen && Math.hypot(world.player.pos.x - s.door.x, world.player.pos.z - s.door.z) < 1), site), 'go here sets you down at the paddock gate');
    assert.ok((await page.evaluate((s) => Math.cos(world.player.yaw - s.door.yaw), site)) > 0.99, 'facing the track');
    assert.ok(await page.evaluate(() => T.until(() => world.racetrack.ready, 60000)), 'the track stands there');
    await frames(10);
    assert.ok(await page.evaluate((id) => world.racetrack.record.been.includes(id), site.id), 'and you have been');
    await shot('the paddock gate');
    return site;
  });

  await step('into your car, on the grid', async () => {
    await page.evaluate(() => world.racetrack.toCar());
    await frames(6);
    let r = await race();
    assert.match(r.prompt, /get in your car/, 'by your car a click would get you in');
    assert.equal(await page.evaluate(() => world.pack.list().hand.find((r) => r.id === 'racetrack')?.word), 'race', '...and it is at hand in your pack');
    await page.evaluate(() => T.tap('use'));
    await frames(4);
    r = await race();
    assert.ok(r.driving, 'click, and you are in it');
    assert.equal(r.state.state, 'lights');
    assert.equal(r.state.position, 6, 'at the back of the grid');
    assert.ok(r.card, 'the race card is up');
    assert.ok(await page.evaluate(() => world.player.aboard !== null && world.player.character.seated !== null), 'sat in it, and it moves you');
    assert.ok(await page.evaluate(() => T.until(() => world.racetrack.state().lit >= 3, 120000)), 'the lights come on');
    const lamps = await page.evaluate(() => document.querySelectorAll('#race .lights .on').length);
    assert.ok(lamps >= 3, 'on the card too');
    await shot('on the grid, the lights on');
  });

  await step('the lights go out, and you race', async () => {
    assert.ok(await page.evaluate(() => T.until(() => world.racetrack.state().state === 'racing', 120000)), 'they go out');
    const s0 = await page.evaluate(() => world.racetrack.state().s);
    await page.keyboard.down('KeyW');
    const off = await page.evaluate(() => T.until(() => world.racetrack.state().speed > 18, 120000));
    await shot('racing');
    await page.keyboard.up('KeyW');
    assert.ok(off, 'W takes you off the line');
    const r = await race();
    assert.match(r.gauge, /km\/h/, 'how fast, bottom left');
    assert.match(r.cardText, /lap 1 of 3/, 'the card says which lap');
    assert.equal(await page.evaluate(() => document.getElementById('race-map').hidden), false, 'and the little map is up');
    assert.notEqual(r.state.s, s0, 'round the lap');
    // brake to a stop
    await page.keyboard.down('KeyS');
    const stopped = await page.evaluate(() => T.until(() => Math.abs(world.racetrack.state().speed) < 1, 60000));
    await page.keyboard.up('KeyS');
    assert.ok(stopped, 'S stops it');
    return { speed: r.state.speed, position: r.state.position };
  });

  await step('over the line on the last lap, and out', async () => {
    // (the laps driven, by hand: just short of the line on the last of them)
    await page.evaluate(() => {
      const r = world.racetrack.race;
      r.you.run = r.laps * r.c.length - 1;
    });
    assert.ok(await page.evaluate(() => T.until(() => world.racetrack.state().place > 0, 30000)), 'over the line, and placed');
    await frames(4);
    let r = await race();
    assert.match(r.cardText, /of 6/, 'where you came');
    assert.ok(await page.evaluate(() => world.racetrack.record.races === 1), 'a race run, kept');
    assert.equal(await page.evaluate(() => world.pack.list().hand.find((r) => r.id === 'racetrack')?.word), 'race again', 'stopped, another race is at hand');
    await shot('the results');
    await page.evaluate(() => T.tap('alt'));
    await frames(6);
    r = await race();
    assert.equal(r.driving, false, 'right-click, and you are out');
    assert.equal(r.card, false, 'the card is down');
    assert.ok(await page.evaluate(() => world.player.aboard === null && world.player.character.seated === null), 'on your feet');
    const by = await page.evaluate(() => {
      // the car is placed in the track's frame
      const { x, z } = world.racetrack.built.mine.object.position;
      const s = world.racetrack.site;
      const c = Math.cos(s.yaw);
      const n = Math.sin(s.yaw);
      return Math.hypot(s.x + x * c + z * n - world.player.pos.x, s.z - x * n + z * c - world.player.pos.z);
    });
    assert.ok(by < 5, 'beside your car, back on the apron');
    const mine = await page.evaluate(() => world.pack.list().yours.map((t) => t.label));
    assert.ok(mine.includes('races won'), 'your pack says how many races you have won');
  });
}
