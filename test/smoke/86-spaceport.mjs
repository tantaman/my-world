// The launch site: walk up to the rocket, T climbs aboard, a countdown and
// it lifts off to orbit; in the arena the controls are an arena shooter's
// (W runs, the view is yours, the use button fires the railgun) and a rail
// frags a bot; T, T flies you home, and you step out onto the pad.
//
// Needs: nothing in particular (the launch site is near where you first
// arrive, and go() takes you there from anywhere).
// Leaves: you on the pad at the launch site, beside the rocket.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('to orbit', async () => {
    const site = await page.evaluate(() => world.spaceport.site && { id: world.spaceport.site.id });
    assert.ok(site, 'there is a launch site');
    await page.evaluate(() => world.spaceport.go());
    await frames(5);
    assert.match(await page.evaluate(() => T.prompt()), /climb aboard/, 'beside the rocket, T would climb aboard');
    await key('KeyT');
    assert.equal(await page.evaluate(() => world.spaceport.phase), 'boarding', 'T and you climb aboard');
    assert.ok(await page.evaluate(() => !!world.player.aboard && getComputedStyle(document.getElementById('hotbar')).display === 'none'), 'carried, and the tools put away');
    // (the play-through hurries the countdown and the climb along)
    await page.evaluate(() => world.spaceport.hurry());
    await page.evaluate(() => world.spaceport.hurry());
    assert.equal(await page.evaluate(() => world.spaceport.phase), 'climb', 'lift-off');
    await frames(10);
    const up = await page.evaluate(() => world.player.pos.y - world.spaceport.site.top);
    assert.ok(up > 14, `the rocket carries you up (${up.toFixed(1)} m over the pad)`);
    await shot('lift-off');
    await page.evaluate(() => world.spaceport.hurry());
    await frames(3);
    const there = await page.evaluate(() => ({ phase: world.spaceport.phase, hud: !document.querySelector('#space .arena').hidden, covered: world.game.covered, fighters: world.spaceport.arena.fighters.length }));
    assert.deepEqual(there, { phase: 'orbit', hud: true, covered: true, fighters: 5 }, 'in orbit, the arena in place of the forest');
    return { site: site.id };
  });

  await step('a railgun deathmatch', async () => {
    await page.evaluate(() => world.spaceport.hurry()); // the countdown
    // W runs, and the forest's hiker doesn't move
    const before = await page.evaluate(() => ({ me: { ...world.spaceport.arena.me.body.pos }, hiker: { ...world.player.pos } }));
    await page.keyboard.down('KeyW');
    await frames(20);
    await page.keyboard.up('KeyW');
    await frames(3);
    const after = await page.evaluate(() => ({ me: { ...world.spaceport.arena.me.body.pos }, hiker: { ...world.player.pos } }));
    const ran = Math.hypot(after.me.x - before.me.x, after.me.z - before.me.z);
    assert.ok(ran > 0.5, `W runs in the arena (${ran.toFixed(2)} m)`);
    assert.ok(Math.hypot(after.hiker.x - before.hiker.x, after.hiker.z - before.hiker.z) < 0.01, 'and not the hiker in the forest');
    // stand a bot still in front of you, and fire as a visitor does
    await page.evaluate(() => {
      const a = world.spaceport.arena;
      const me = a.me;
      const bot = a.fighters.find((f) => !f.me && f.alive);
      for (const f of a.fighters) if (!f.me) f.bot.think = () => ({ wish: { x: 0, z: 0 }, jump: false, fire: false, yaw: f.yaw, pitch: 0 });
      Object.assign(me.body.pos, { x: 6, y: 0, z: 6 });
      Object.assign(bot.body.pos, { x: -6, y: 0, z: 6 });
      me.yaw = Math.PI / 2;
      me.pitch = Math.atan2(1.2 - 1.6, 12);
      me.reload = 0;
    });
    await page.evaluate(() => T.tap('use'));
    const fight = await page.evaluate(() => ({ frags: world.spaceport.arena.match.byId.get('you').frags, feed: document.querySelector('#space .feed').textContent }));
    assert.equal(fight.frags, 1, 'one rail, one frag');
    assert.match(fight.feed, /You railed/, 'and the feed says so');
    await shot('railed');
    return fight;
  });

  await step('home again', async () => {
    await key('KeyT');
    await key('KeyT');
    assert.equal(await page.evaluate(() => world.spaceport.phase), 'home', 'T twice, and the capsule comes down');
    await page.evaluate(() => world.spaceport.hurry());
    await frames(5);
    const back = await page.evaluate(() => {
      const s = world.spaceport.site;
      const p = world.player.pos;
      return { phase: world.spaceport.phase, aboard: !!world.player.aboard, onPad: Math.abs(p.y - s.top) < 0.05 && Math.hypot(p.x - s.x, p.z - s.z) < 9, hud: document.querySelector('#space .arena').hidden, covered: world.game.covered, record: world.spaceport.record.visited };
    });
    assert.deepEqual(back, { phase: 'ground', aboard: false, onPad: true, hud: true, covered: false, record: true }, 'down on the pad, on your own feet');
    await shot('home');
  });
}
