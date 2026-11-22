// The swamp tour: picked on the map, `go here` sets you down at the airboat
// landing in Jean Lafitte, Louisiana, a real place a long way from the
// forest. Out along the dock the guide says hello from the boat, and a click
// there puts you in its front row with the ear defenders on, tools put
// away. The boat sets off along the way round, on the water; at its first
// stop a gator is waiting where the guide points it out, and the boat
// stands while you look. A right-click and you're run back to the dock.
// Taken somewhere else on the way round, you're off it where you are. Then
// once more, the whole way round: back at the dock you're off, and it
// counts.
//
// Needs: nothing in particular (the landing is on the map from anywhere).
// Leaves: you standing on the landing's dock in Jean Lafitte, out of the boat.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  const prompt = () => page.evaluate(() => T.prompt());
  const ride = () => page.evaluate(() => world.swamptour.ride);

  let tour = null;
  await step('to the landing, from the map', async () => {
    tour = await page.evaluate(() => world.swamptour.list()[0]);
    assert.ok(tour, 'there is a swamp tour');
    await key('KeyM');
    await page.evaluate((t) => {
      world.map.centerOn(t.x, t.z);
      world.map.selectPlace(`swamptour:${t.id}`);
    }, tour);
    await frames(5);
    assert.equal(await page.evaluate(() => document.getElementById('place-name').textContent), tour.name, 'it is on the map, by name');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    const there = await page.evaluate((t) => T.until(() => Math.hypot(world.player.pos.x - t.x, world.player.pos.z - t.z) < 40, 120000), tour);
    assert.ok(there, 'go here sets you down at the landing');
    // the way round is found once the real place's land has come
    assert.ok(await page.evaluate(() => T.until(() => world.swamptour.list()[0].ready, 120000)), 'the way round is found');
    const t = await page.evaluate(() => world.swamptour.list()[0]);
    assert.equal(await page.evaluate(() => world.country.name), 'bayou', 'in the bayou country');
    assert.ok(t.length > 1500 && t.length < 4000, `a few kilometres round (${t.length} m)`);
    assert.equal(t.gators, 4, 'with four gators to see on the way');
    return t;
  });

  await step('into the airboat', async () => {
    // the foot of the dock, then out along it to the boat
    await page.evaluate(() => world.swamptour.go());
    await frames(4);
    await page.keyboard.down('KeyW');
    const by = await page.evaluate(() => T.until(() => T.prompt().startsWith('click take the airboat tour'), 20000));
    await page.keyboard.up('KeyW');
    assert.ok(by, 'out along the dock to the boat');
    assert.match(await prompt(), /^click take the airboat tour with \w+$/);
    assert.match(await page.evaluate(() => world.swamptour.said), /^\w+: “.*(Mornin|Hey there)/, 'the guide says hello');
    await shot('the airboat at the dock');
    await page.evaluate(() => T.tap('use'));
    const r = await ride();
    assert.ok(r && r.phase === 'start', 'in the boat, and the engine starting');
    const aboard = await page.evaluate(() => ({ seated: !!world.player.character.seated, aboard: !!world.player.aboard, idle: world.builder.idle }));
    assert.deepEqual(aboard, { seated: true, aboard: true, idle: true }, 'sitting in the front row, tools put away');
    assert.match(await page.evaluate(() => world.swamptour.said), /ear muffs/);
    return r;
  });

  await step('down the bayou, to a gator', async () => {
    const off = await page.evaluate(() => T.until(() => world.swamptour.ride.phase === 'go' && world.swamptour.ride.s > 2, 30000));
    assert.ok(off, 'it sets off');
    const from = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
    // (on to just short of the first stop: it's a long way)
    await page.evaluate(() => {
      const r = world.swamptour.ride;
      world.swamptour.skip(r.next - r.s - 1.5);
    });
    const stopped = await page.evaluate(() => T.until(() => world.swamptour.ride.phase === 'halt', 30000));
    assert.ok(stopped, 'it stops at the gator');
    const r = await ride();
    assert.equal(r.v, 0, 'and stands');
    assert.equal(r.seen, 1, 'one seen');
    const g = r.gators[0];
    const P = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z, moved: 0 }));
    assert.ok(Math.hypot(P.x - from.x, P.z - from.z) > 100, 'carried a long way down the bayou');
    assert.ok(g && Math.hypot(g.x - P.x, g.z - P.z) < 15, `a gator close by (${g && Math.hypot(g.x - P.x, g.z - P.z).toFixed(1)} m)`);
    assert.match(await page.evaluate(() => world.swamptour.said), /on your (left|right)/, 'and the guide says where to look');
    const water = await page.evaluate(() => {
      const t = world.swamptour.tours[0];
      const p = world.player.pos;
      return t.land.shore(p.x, p.z);
    });
    assert.ok(water < 0, 'on the water');
    await frames(20);
    await shot('a gator on the bank');
    return { gator: g, seen: r.seen };
  });

  await step('back to the landing, and round again', async () => {
    await page.evaluate(() => T.tap('alt'));
    const back = await page.evaluate(() => ({ ride: world.swamptour.ride, aboard: !!world.player.aboard, seated: !!world.player.character.seated, record: world.swamptour.record }));
    assert.deepEqual([back.ride, back.aboard, back.seated], [null, false, false], 'out of the boat');
    assert.equal(back.record.taken, 0, 'a tour cut short is not counted');
    assert.equal(back.record.seen, 1, 'but the gator seen is');
    const onDock = await page.evaluate(() => {
      const t = world.swamptour.tours[0];
      const d = t.lay.dock;
      const p = world.player.pos;
      return { far: Math.hypot(p.x - (d.a.x + d.b.x) / 2, p.z - (d.a.z + d.b.z) / 2), y: p.y - d.top };
    });
    assert.ok(onDock.far < 6 && Math.abs(onDock.y) < 0.3, `standing on the dock (${JSON.stringify(onDock)})`);
    // taken somewhere else on the way round (the map, R): off the boat
    // where you were taken, and not back in it
    await page.evaluate(() => world.swamptour.board());
    await page.evaluate(() => T.until(() => world.swamptour.ride.phase === 'go', 30000));
    const away = await page.evaluate(async () => {
      const p = world.player.pos;
      const to = { x: p.x - 150, z: p.z - 40 };
      await world.teleport(to.x, to.z);
      await T.frames(6);
      return { ride: world.swamptour.ride, aboard: !!world.player.aboard, far: Math.hypot(world.player.pos.x - to.x, world.player.pos.z - to.z) };
    });
    assert.deepEqual([away.ride, away.aboard], [null, false], 'taken elsewhere, you are off the tour');
    assert.ok(away.far < 2, 'and stay where you were taken');
    await page.evaluate(() => world.swamptour.go());
    // and once more, all the way round
    await page.evaluate(() => world.swamptour.board());
    await page.evaluate(() => T.until(() => world.swamptour.ride.phase === 'go', 30000));
    await page.evaluate(() => world.swamptour.skip(1e6));
    const home = await page.evaluate(() => T.until(() => world.swamptour.ride === null, 60000));
    assert.ok(home, 'back at the dock, the tour is over');
    const after = await page.evaluate(() => ({ record: world.swamptour.record, aboard: !!world.player.aboard }));
    assert.equal(after.record.taken, 1, 'and it counts');
    assert.equal(after.aboard, false);
    return after.record;
  });
}
