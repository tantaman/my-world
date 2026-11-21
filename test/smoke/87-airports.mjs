// The airports: P away from an airfield opens the flights tab beside the
// map, which offers the airfield for here; picking it puts you on its apron,
// by the plane. P there lists where to fly, and picking one puts you aboard:
// it taxis out, takes off, climbs up through the cloud and over it, is
// carried across the world in the cloud, comes down out of it over the
// other airfield, lands and taxis in, and you step down onto its apron.
// (Over the clouds and in them, it's hurried along, as P does over them.)
//
// Needs: nothing in particular (there's an airfield for where you first arrive).
// Leaves: you on the apron of an airfield in another part of the world,
// beside the plane you came on.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  const made = {};
  await step('go to the airfield', async () => {
    // (found now, rather than waited for a little at a time)
    const listed = await page.evaluate(() => world.airports.list(true).length);
    assert.ok(listed >= 2, `there are airfields to fly between (${listed})`);
    await key('KeyP');
    assert.ok(await page.evaluate(() => world.map.isOpen && world.map.tab === 'flights'), 'P opens the map on its flights');
    await page.waitForFunction(() => document.querySelector('#fly-panel button[data-action="go"]'), null, { timeout: 60000 });
    await page.click('#fly-panel button[data-action="go"]');
    await page.waitForFunction(() => !world.map.isOpen && world.chunks.isFullyLoaded(), null, { timeout: 60000 });
    await frames(20);
    const there = await page.evaluate(() => {
      const p = world.player.pos;
      const near = world.airports.list()[0];
      return { name: near.name, d: Math.round(near.dist), on: world.player.underfoot && world.player.underfoot.surface, prompt: T.prompt() };
    });
    assert.ok(there.on === 'tarmac' && there.d < 60, `on the apron at ${there.name} (${JSON.stringify(there)})`);
    assert.match(there.prompt, /fly from/, 'and P would fly from here');
    await shot('the airfield');
    made.from = there.name;
    return { airfield: there.name };
  });

  await step('fly to another', async () => {
    await key('KeyP');
    await page.waitForFunction(() => document.querySelector('#fly-panel button[data-action="fly"]'), null, { timeout: 60000 });
    const to = await page.evaluate(() => document.querySelector('#fly-panel button[data-action="fly"]').dataset.field);
    await page.click(`#fly-panel button[data-field="${to}"]`);
    const trip = await page.evaluate(() => world.airports.trip);
    assert.ok(trip && trip.to === to && !(await page.evaluate(() => world.map.isOpen)), `aboard, for ${to}`);
    assert.ok(await page.evaluate(() => world.player.aboard && !world.player.character.root.visible), 'sat inside, out of sight');
    // it taxis out
    const at = await page.evaluate(() => ({ x: world.airports.flight.pose.x, z: world.airports.flight.pose.z }));
    await page.waitForFunction((at) => Math.hypot(world.airports.flight.pose.x - at.x, world.airports.flight.pose.z - at.z) > 4, at, { timeout: 180000 });
    await shot('taxiing out');
    // up, and over the clouds
    await page.evaluate(() => world.airports.hurry());
    await page.waitForFunction(() => world.airports.trip && world.airports.trip.part === 'cruise', null, { timeout: 60000 });
    await frames(10);
    const over = await page.evaluate(() => {
      const f = world.airports.flight;
      const c = world.airports.cloud;
      return { cover: c.cover, above: f.pose.y - c.at, prompt: T.prompt() };
    });
    assert.ok(over.cover > 0.95 && over.above > 30, `over a sea of cloud (${JSON.stringify(over)})`);
    assert.match(over.prompt, /sleep through it/, 'and P would sleep through it');
    await shot('over the clouds');
    // P: nod off, and down into the cloud, to be carried across
    await key('KeyP');
    await page.waitForFunction(() => world.airports.trip && world.airports.trip.part === 'down', null, { timeout: 60000 });
    await page.evaluate(() => world.airports.hurry());
    await page.waitForFunction(() => world.airports.trip && world.airports.trip.part !== 'down', null, { timeout: 60000 });
    // ...and out of it again over the other airfield, once the land there has grown
    await page.waitForFunction(() => world.airports.trip && world.airports.trip.part === 'in', null, { timeout: 180000 });
    const coming = await page.evaluate((to) => {
      const s = world.airports.airports.byId(to);
      const p = world.player.pos;
      return { d: Math.round(Math.hypot(s.x - p.x, s.z - p.z)), y: Math.round(world.airports.flight.pose.y) };
    }, to);
    assert.ok(coming.d < 3000, `coming in to it (${coming.d} m off)`);
    await frames(40);
    await shot('coming in');
    // down, and in to its apron
    await page.evaluate(() => world.airports.hurry());
    await page.waitForFunction(() => !world.airports.trip, null, { timeout: 180000 });
    await frames(10);
    const off = await page.evaluate((to) => {
      const s = world.airports.airports.byId(to);
      const p = world.player.pos;
      return { name: s.name, d: Math.round(Math.hypot(s.x - p.x, s.z - p.z)), on: world.player.underfoot && world.player.underfoot.surface, aboard: !!world.player.aboard, seen: world.player.character.root.visible };
    }, to);
    assert.ok(off.on === 'tarmac' && off.d < 40 && !off.aboard && off.seen, `stepped out onto the apron at ${off.name} (${JSON.stringify(off)})`);
    await shot('arrived');
    return { from: made.from, to: off.name };
  });
}
