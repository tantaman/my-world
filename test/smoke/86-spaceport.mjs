// The launch site: walk up to the rocket, F climbs aboard, a countdown and
// it lifts off to orbit; in the arena the controls are an arena shooter's
// (W runs, the view is yours, the use button fires the railgun) and a rail
// frags a bot; F, F flies you home, and you step out onto the pad. Far out
// there are others, each with its name, and the rocket there flies too.
//
// Needs: nothing in particular (the launch site is near where you first
// arrive, and go() takes you there from anywhere).
// Leaves: you on the pad at the launch site by the start, beside the rocket.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('to orbit', async () => {
    const site = await page.evaluate(() => world.spaceport.site && { id: world.spaceport.site.id });
    assert.ok(site, 'there is a launch site');
    await page.evaluate(() => world.spaceport.go());
    await frames(5);
    assert.match(await page.evaluate(() => T.prompt()), /climb aboard/, 'beside the rocket, F would climb aboard');
    await key('KeyF');
    const manifest = page.getByRole('dialog', { name: 'Choose a destination' });
    assert.ok(await manifest.isVisible(), 'the rocket offers both flights');
    await key('Escape');
    assert.ok(await manifest.isHidden(), 'you can stay on the pad');
    assert.equal(await page.evaluate(() => world.spaceport.phase), 'ground');
    await key('KeyF');
    await manifest.getByRole('button', { name: /The Orrery/ }).click();
    assert.equal(await page.evaluate(() => world.spaceport.phase), 'boarding', 'choosing the arena boards the rocket');
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
    await key('KeyF');
    await key('KeyF');
    assert.equal(await page.evaluate(() => world.spaceport.phase), 'home', 'F twice, and the capsule comes down');
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

  await step('dock at Deep Space 9', async () => {
    await page.evaluate(() => world.spaceport.go());
    await key('KeyF');
    await shot('flight-manifest');
    await page.getByRole('button', { name: /Deep Space 9/ }).click();
    const trip = await page.evaluate(() => {
      const port = world.spaceport;
      port.hurry(); port.hurry(); port.hurry();
      return { destination: port.flight.destination, phase: port.phase, match: !!port.arena, station: !!port.station };
    });
    assert.deepEqual(trip, { destination: 'ds9', phase: 'orbit', match: false, station: true });
    await frames(4);
    const hiker = () => page.evaluate(() => {
      const s = world.spaceport.station, c = world.player.character;
      return {
        docked: s.inside && c.root.visible && c.root.parent === s.scene,
        feet: c.root.position.toArray(), follow: c.root.position.distanceTo(s.camera.position),
        stride: c.phase, walking: c.moveBlend,
      };
    });
    const before = await hiker();
    assert.ok(before.docked && before.follow > 2, 'arrive on foot with the camera behind the player character');
    await shot('promenade');
    await page.keyboard.down('KeyW');
    await frames(30);
    const after = await hiker();
    assert.ok(after.docked && after.stride > before.stride && after.walking > 0.3, 'the hiker walks in the station scene');
    assert.ok(Math.hypot(after.feet[0] - before.feet[0], after.feet[2] - before.feet[2]) > 0.3, 'walked along the Promenade');
    await page.keyboard.up('KeyW');
    const stopped = await hiker();
    await page.getByRole('button', { name: /View exterior/ }).click();
    assert.equal(await page.evaluate(() => world.spaceport.station.inside), false, 'looking at the exterior');
    await shot('deep-space-9');
    await key('Enter');
    assert.deepEqual((await hiker()).feet, stopped.feet, 'return to your spot on the deck');
    await key('KeyF');
    assert.equal(await page.evaluate(() => world.spaceport.phase), 'home');
    await page.evaluate(() => world.spaceport.hurry());
    await frames(4);
    assert.ok(await page.evaluate(() => !world.spaceport.station && !world.player.aboard && !world.game.covered && document.querySelector('#space .station').hidden
      && world.player.character.root.visible && world.player.character.root.parent === world.scene), 'the hiker is home from the station');
  });

  await step('another launch site, far out', async () => {
    const { home, far } = await page.evaluate(() => {
      const sites = world.spaceport.sites;
      for (let r = 0; r < 4; r++) {
        for (let j = -r; j <= r; j++) {
          for (let i = -r; i <= r; i++) {
            const s = Math.max(Math.abs(i), Math.abs(j)) === r && sites.cell(i, j);
            if (s) return { home: sites.home.id, far: { id: s.id, name: s.name } };
          }
        }
      }
      return { home: sites.home.id, far: null };
    });
    assert.ok(far, 'there is one out there');
    await page.evaluate((id) => world.spaceport.go(id), far.id);
    await frames(40);
    const there = await page.evaluate(() => ({ id: world.spaceport.site.id, name: world.spaceport.site.name, prompt: T.prompt(), been: world.spaceport.record.been }));
    assert.equal(there.id, far.id, 'it is the one stood up now');
    assert.notEqual(there.name, 'Skyhook launch site');
    assert.match(there.prompt, /climb aboard/, 'and its rocket is ready');
    assert.ok(there.been.includes(far.id), 'remembered as somewhere you have been');
    await shot('far-launch-site');
    await page.evaluate((id) => world.spaceport.go(id), home);
    await frames(40);
    assert.equal(await page.evaluate(() => world.spaceport.site.id), home, 'and back home');
    return far;
  });
}
