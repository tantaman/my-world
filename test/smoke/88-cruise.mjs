// The cruise ship: picked on the map, `go here` sets you down on the pier at
// the foot of her gangway, facing it. Walk in through the door in her side
// and you're aboard, with a stateroom of your own. A lift's doors open as you
// come up to them; inside, its buttons take you up a deck. Your stateroom's
// door opens with your key card, and in you go. At the top of the slide
// tower, a click sends you down the Corkscrew, and you come out swimming in
// the splash pool. Then she sails, with you aboard: she carries you out to
// sea, across in the fog to Maui, and in alongside there, and you walk ashore
// down her gangway.
//
// Her timetable is the clock on the wall's, so the clock is moved on (from
// the console) to have her alongside when this starts, and to the parts of
// her voyage it plays, rather than waiting for them.
//
// Needs: nothing in particular (her pier is on the map from anywhere).
// Leaves: you on the home pier at the foot of her gangway, the clock moved on.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  const where = () => page.evaluate(() => world.cruise.where);
  // where a spot in her own frame is in the world
  const at = (lx, lz) =>
    page.evaluate(
      ([lx, lz]) => {
        const s = world.cruise.site;
        const c = Math.cos(s.yaw);
        const n = Math.sin(s.yaw);
        return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c, yaw: s.yaw, y: s.y };
      },
      [lx, lz],
    );
  const tap = async (which = 'use') => {
    await page.evaluate((w) => T.tap(w), which);
  };
  const walk = async (until, ms = 60000) => {
    await page.keyboard.down('KeyW');
    const ok = await page.evaluate((src) => T.until(new Function(`return ${src}`), 60000), until);
    await page.keyboard.up('KeyW');
    await frames(3);
    void ms;
    return ok;
  };

  await step('to the ship, from the map', async () => {
    // her pier is found once the airfields in its way have been
    assert.ok(await page.evaluate(() => T.until(() => world.cruise.site, 180000)), 'there is a pier');
    const site = await page.evaluate(() => {
      const s = world.cruise.site;
      return { id: s.id, door: s.door };
    });
    // she's alongside, half a minute in
    await page.evaluate(() => world.cruise.soon('home', -30));
    assert.equal(await page.evaluate(() => world.cruise.voyage.phase), 'docked');
    await page.keyboard.press('KeyM');
    await frames(3);
    // listed in Routes, under her own chip
    await page.click('[data-tab="routes"]');
    await page.click('.route-lists button[data-list="cruise piers"]');
    await page.locator(`button[data-destination="${site.id}"]`).waitFor();
    await page.evaluate((s) => {
      world.map.centerOn(s.door.x, s.door.z);
      world.map.selectPlace(s.id);
    }, site);
    await frames(5);
    assert.match(await page.evaluate(() => document.getElementById('place-name').textContent), /Halcyon/, 'she is on the map');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    const there = await page.evaluate((s) => T.until(() => Math.hypot(world.player.pos.x - s.door.x, world.player.pos.z - s.door.z) < 1, 60000), site);
    assert.ok(there, 'go here sets you down at the foot of her gangway');
    assert.ok((await page.evaluate((s) => Math.cos(world.player.yaw - s.door.yaw), site)) > 0.99, 'facing it');
    assert.ok(await page.evaluate(() => T.until(() => world.cruise.ready, 120000)), 'she lies there, solid');
    await shot('the ship at her pier');
    return { site: site.id };
  });

  await step('aboard, through the door in her side', async () => {
    // from the gangway's landing, level with her deck 4, in through her door
    const p = await at(20.6, -22);
    await page.evaluate((p) => world.player.spawn(p.x, p.z, p.yaw - Math.PI / 2, p.yaw + Math.PI / 2, p.y + 7), p);
    await frames(5);
    assert.ok(await walk(`world.cruise.where.onShip && world.cruise.where.roomId === 'gangway'`), 'walked in');
    const w = await where();
    const yours = await page.evaluate(() => world.cruise.yours);
    assert.equal(w.deck, 4);
    assert.ok(yours > 8000 && yours < 13000, `a stateroom of your own (${yours})`);
    assert.match(await page.evaluate(() => document.getElementById('toast').textContent), /Welcome aboard/);
    return { deck: w.deck, yours };
  });

  await step('a lift, up a deck', async () => {
    // in the midships lobby, in front of a car: its doors open as you come
    const p = await at(1.7, 12 + 1.6);
    await page.evaluate((p) => world.player.spawn(p.x, p.z, p.yaw, p.yaw + Math.PI, p.y + 7), p);
    await frames(10);
    assert.ok(await walk(`(world.cruise.where.roomId || '').startsWith('lift-')`), 'into the car');
    assert.match(await page.evaluate(() => T.prompt()), /choose a deck/);
    await tap();
    assert.equal((await page.evaluate(() => world.cruise.car)).state, 'choose', 'its buttons');
    await page.keyboard.down('KeyW');
    await page.evaluate(() => T.until(() => world.cruise.car.pick === 5, 20000));
    await page.keyboard.up('KeyW');
    await frames(3);
    assert.match(await page.evaluate(() => T.prompt()), /deck 5/);
    await tap();
    assert.equal((await page.evaluate(() => world.cruise.car)).state, 'ride', 'it goes');
    await page.evaluate(() => world.cruise.hurry());
    assert.ok(await page.evaluate(() => T.until(() => world.cruise.car && world.cruise.car.state === 'here', 60000)), 'and gets there');
    await frames(10);
    const w = await where();
    assert.equal(w.deck, 5, 'on deck 5');
    await shot('in a lift');
    // out into the lobby
    await page.keyboard.down('KeyS');
    await page.evaluate(() => T.until(() => world.cruise.where.roomId && world.cruise.where.roomId.startsWith('lobby'), 20000));
    await page.keyboard.up('KeyS');
    return { deck: w.deck };
  });

  await step('your stateroom', async () => {
    const yours = await page.evaluate(() => world.cruise.yours);
    await page.evaluate((no) => world.cruise.toCabin(no), yours);
    await frames(15);
    assert.match(await page.evaluate(() => T.prompt()), new RegExp(`${yours}`), 'its door, in reach');
    await tap();
    await frames(30);
    assert.ok(await walk(`world.cruise.where.roomId === 'cabin-${yours}'`), 'in through it');
    await frames(10);
    await shot('your stateroom');
    return { yours };
  });

  await step('down a slide, into the pool', async () => {
    await page.evaluate(() => world.cruise.toSlide('corkscrew'));
    await frames(10);
    assert.match(await page.evaluate(() => T.prompt()), /Corkscrew/);
    await tap();
    assert.ok(await page.evaluate(() => !!world.cruise.slide), 'off you go');
    await frames(8);
    await shot('down the corkscrew');
    await page.evaluate(() => world.cruise.hurry());
    assert.ok(await page.evaluate(() => T.until(() => !world.cruise.slide, 60000)), 'to the bottom');
    const wet = await page.evaluate(() => T.until(() => world.player.swimming || world.player.wade > 0.5, 20000));
    assert.ok(wet, 'and into the water');
    await shot('the splash pool');
    return { swimming: await page.evaluate(() => world.player.swimming) };
  });

  await step('she sails, with you aboard', async () => {
    // out on the open deck, by the main pool
    await page.evaluate(() => world.cruise.toDeck(14));
    await frames(4);
    await page.evaluate(() => world.cruise.soon('sails', 2));
    assert.ok(await page.evaluate(() => T.until(() => world.cruise.voyage.phase === 'leaving', 30000)), 'she lets go');
    const before = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
    // a few minutes on: out along her lane
    await page.evaluate(() => world.cruise.soon('sails', -200));
    await frames(10);
    const v = await page.evaluate(() => world.cruise.voyage);
    const w = await where();
    const after = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    assert.ok(v.carried && w.onShip && w.deck === 14, `still aboard, carried (${JSON.stringify({ v, w })})`);
    assert.ok(moved > 100, `and carried out with her (${moved.toFixed(0)} m)`);
    await shot('under way');
    return { moved: Math.round(moved) };
  });

  await step('across in the fog, to Maui', async () => {
    await page.evaluate(() => world.cruise.soon('fog', 4));
    assert.ok(await page.evaluate(() => T.until(() => Math.abs(world.player.pos.x) > 100000, 60000)), 'carried across the world');
    await frames(10);
    const w = await where();
    assert.ok(w.onShip && w.deck === 14, `still aboard (${JSON.stringify(w)})`);
    const maui = await page.evaluate(() => world.cruise.berths[1]);
    assert.ok(maui, 'to her berth at Maui');
    return { maui: maui.id };
  });

  await step('alongside at Maui, and ashore down her gangway', async () => {
    await page.evaluate(() => world.cruise.soon('arrives', -10));
    assert.ok(await page.evaluate(() => T.until(() => world.cruise.voyage.phase === 'docked' && world.cruise.voyage.port === 'maui', 30000)), 'alongside');
    await frames(10);
    assert.ok((await where()).onShip, 'still aboard');
    // just inside her door, and out of it backwards, down onto the landing
    await page.evaluate(() => world.cruise.board());
    await frames(6);
    await page.keyboard.down('KeyS');
    const ashore = await page.evaluate(() => T.until(() => !world.cruise.where.onShip && world.cruise.where.pier === 1, 30000));
    await page.keyboard.up('KeyS');
    assert.ok(ashore, 'off her, at the Maui pier');
    await frames(5);
    await shot('alongside at Maui');
  });

  await step('back ashore at home', async () => {
    await page.evaluate(() => world.cruise.go(0));
    await frames(5);
    assert.equal((await where()).onShip, false);
  });
}
