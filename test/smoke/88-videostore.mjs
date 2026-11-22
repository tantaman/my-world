// The video store: picked on the map, `go here` sets you down outside its
// doors, facing them; walk in and they slide open. A click on a box takes it
// off the shelf (into your hands, its back on the screen, a gap where it
// stood), a right-click puts it back; take two to the counter and a click
// rents them, with a receipt; drop them in the returns outside and they're
// back. Walk out with one you haven't rented, and the gate goes off.
//
// Needs: nothing in particular (the store is on the map from anywhere).
// Leaves: you on the pavement outside the store's doors, nothing in your
// hands and nothing out.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot, open }) {
  const store = () =>
    page.evaluate(() => {
      const v = world.videostore;
      return { inside: v.inside, hands: v.counter.hands.map((h) => h.title), out: v.counter.out.map((o) => o.title), prompt: T.prompt(), card: !document.getElementById('vhs').hidden, toast: document.getElementById('toast').textContent };
    });
  // where a spot in the store's own frame is in the world
  const at = (lx, lz) =>
    page.evaluate(
      ([lx, lz]) => {
        const s = world.videostore.activeSite;
        const c = Math.cos(s.yaw);
        const n = Math.sin(s.yaw);
        return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c, yaw: s.yaw, top: s.top };
      },
      [lx, lz],
    );
  const standAt = async (lx, lz, turn) => {
    const p = await at(lx, lz);
    await page.evaluate(([p, turn]) => world.player.spawn(p.x, p.z, p.yaw + turn, p.yaw + turn + Math.PI, p.top), [p, turn]);
    await frames(6);
  };
  const goFromMap = async (site) => {
    await key('KeyM');
    await page.evaluate(({ id, door }) => {
      world.map.centerOn(door.x, door.z);
      world.map.selectPlace(id);
      document.querySelector('#place-card [data-act="place-go"]').click();
    }, site);
  };

  await step('to the video store, from the map', async () => {
    const site = await page.evaluate(() => {
      const s = world.videostore.site;
      return s && { id: s.id, door: s.door };
    });
    assert.ok(site, 'there is a video store');
    await key('KeyM');
    await page.evaluate((s) => {
      world.map.centerOn(s.door.x, s.door.z);
      world.map.selectPlace(s.id);
    }, site);
    await frames(5);
    assert.match(await page.evaluate(() => document.getElementById('place-name').textContent), /Rewind Video/, 'it is on the map');
    await page.evaluate(() => document.querySelector('#place-card [data-act="place-go"]').click());
    const there = await page.evaluate((s) => T.until(() => Math.hypot(world.player.pos.x - s.door.x, world.player.pos.z - s.door.z) < 1, 60000), site);
    assert.ok(there, 'go here sets you down at its doors');
    const facing = await page.evaluate((s) => Math.cos(world.player.yaw - s.door.yaw), site);
    assert.ok(facing > 0.99, 'facing them');
    assert.equal(await page.evaluate(() => world.map.isOpen), false, 'and the map is closed');
    assert.ok(await page.evaluate(() => T.until(() => world.videostore.ready, 60000)), 'the store stands there');
    await shot('the video store');
    return { site: site.id };
  });

  await step('walk in and browse', async () => {
    // straight in through the doors, which slide open as you come
    await page.keyboard.down('KeyW');
    const inside = await page.evaluate(() => T.until(() => world.videostore.inside, 20000));
    await frames(20);
    await page.keyboard.up('KeyW');
    assert.ok(inside, 'in through the doors');
    // a box in the comedy aisle: aimed, taken, back on the screen, gone from the shelf
    const film = await page.evaluate(() => world.videostore.look('island2-w', 10, 1).title);
    await frames(6);
    let s = await store();
    assert.match(s.prompt, /take down/, 'the crosshair on a box says what a click would do');
    assert.ok(s.prompt.includes(film), `...and which film (${film})`);
    await page.evaluate(() => T.tap('use'));
    s = await store();
    assert.deepEqual(s.hands, [film], 'click, and it is in your hands');
    assert.ok(s.card, 'its box on the screen');
    assert.equal(await page.evaluate(() => world.videostore.aimed().taken), true, 'and a gap where it stood');
    await page.evaluate(() => T.tap('alt'));
    assert.deepEqual((await store()).hands, [], 'right-click puts it back');
    assert.equal(await page.evaluate(() => world.videostore.aimed().taken), false, 'on the shelf again');
    // two to rent: one off the new release wall, one sci-fi
    const out = new Set(await page.evaluate(() => world.videostore.allOut()));
    let took = [];
    for (const [face, row] of [
      ['new', 2],
      ['island3-w', 2],
    ]) {
      for (let col = 4; col < 40; col += 3) {
        const title = await page.evaluate(([f, c, r]) => world.videostore.look(f, c, r).title, [face, col, row]);
        if (out.has(title) || took.includes(title)) continue;
        await frames(4);
        await page.evaluate(() => T.tap('use'));
        took = (await store()).hands;
        break;
      }
    }
    assert.equal(took.length, 2, 'two in your hands');
    await shot('browsing');
    return { film, took };
  });

  await step('rent them at the counter', async () => {
    await page.evaluate(() => world.videostore.toCounter());
    await frames(6);
    assert.match((await store()).prompt, /rent all 2/, 'at the counter, a click would rent them');
    await page.evaluate(() => T.tap('use'));
    const s = await store();
    assert.equal(s.out.length, 2, 'rented');
    assert.equal(s.hands.length, 0, 'out of your hands');
    const receipt = await page.evaluate(async () => (await T.until(() => !document.getElementById('vhs-receipt').hidden, 10000)) && document.getElementById('vhs-receipt').textContent);
    assert.match(receipt, /TOTAL[\s\S]*\$[\d.]+[\s\S]*due back|due back[\s\S]*TOTAL/, 'with a receipt saying when they are due');
    await shot('rented');
    // and out through the doors with them, which the gate doesn't mind
    await standAt(0, 10.4, 0);
    await frames(20);
    assert.equal((await store()).out.length, 2, 'they are yours till they are due');
    return { receipt: receipt.replace(/\s+/g, ' ').trim() };
  });

  await step('discover the second branch and return the tapes there', async () => {
    const branch = await page.evaluate(() => {
      const branch = world.videostore.sites.find((s) => s.branch);
      return { id: branch.id, door: branch.door, section: branch.theme.section, listed: !!world.map.places.get(branch.id), member: world.videostore.counter.card.number };
    });
    // Earlier trips in the full play-through can already have passed the branch.
    if (branch.listed) await goFromMap(branch);
    else await page.evaluate((b) => world.teleport(b.door.x, b.door.z, b.door.yaw), branch);
    assert.ok(await page.evaluate((id) => T.until(() => world.videostore.ready && world.videostore.activeSite?.id === id && world.map.places.get(id), 60000), branch.id), 'the branch stands and has a pin');
    const offered = await page.evaluate(() => world.videostore.catalog.at('island1-w', 0, 0).section);
    assert.equal(offered, branch.section, 'the extra aisle is stocked for the specialty');
    await shot('the second Rewind branch');
    await standAt(3.1, 10.9, Math.PI);
    assert.match((await store()).prompt, /drop your 2 tapes in the returns/, 'by the drop box, a click would return them');
    await page.evaluate(() => T.tap('use'));
    assert.deepEqual((await store()).out, [], 'returned');
    assert.equal(await page.evaluate(() => world.videostore.counter.card.number), branch.member);

    await page.evaluate((id) => world.videostore.enter(id), branch.id);
    const localFilm = await page.evaluate(() => world.videostore.look('island1-w', 8, 2).title);
    await frames(5);
    await page.evaluate(() => T.tap('use'));
    assert.deepEqual((await store()).hands, [localFilm]);
    await page.evaluate(() => world.videostore.toCounter());
    await frames(5);
    await page.evaluate(() => T.tap('use'));
    assert.equal(await page.evaluate(() => world.videostore.counter.out[0]?.siteId), branch.id);
    await page.evaluate(() => world.videostore.go());
    assert.ok(await page.evaluate(() => T.until(() => world.videostore.ready && world.videostore.activeSite === world.videostore.site, 60000)));
    await standAt(3.1, 10.9, Math.PI);
    await page.evaluate(() => T.tap('use'));
    assert.deepEqual((await store()).out, [], 'a branch rental goes back at the original shop');
    return { branch: branch.id, previouslyDiscovered: branch.listed };
  });

  await step('the security gate', async () => {
    await page.evaluate(() => world.videostore.enter());
    await page.evaluate(() => world.videostore.look('left-a', 8, 2));
    await frames(4);
    await page.evaluate(() => T.tap('use'));
    assert.equal((await store()).hands.length, 1, 'a tape in your hands');
    await standAt(0, 10.2, 0); // out through the doors with it
    const caught = await page.evaluate(() => T.until(() => /rent them at the counter first/.test(document.getElementById('toast').textContent), 10000));
    assert.ok(caught, 'the gate goes off');
    assert.equal((await store()).hands.length, 0, 'and it goes back on the shelf');
    await page.evaluate(() => world.videostore.go());
  });

  await step('find the discovered branch again after reloading', async () => {
    const branch = await page.evaluate(() => world.videostore.sites.find((s) => s.branch));
    await open();
    assert.ok(await page.evaluate((id) => world.map.places.destinations().some((p) => p.id === id && p.visited), branch.id));
    await goFromMap(branch);
    assert.ok(await page.evaluate((id) => T.until(() => world.videostore.ready && world.videostore.activeSite?.id === id, 60000), branch.id));
    await page.evaluate(() => world.videostore.go());
  });
}
