// Dry Wells: walk up to the gate and into the light, and you're in the
// town, one of ten, with the town's own keys (the forest's do nothing in
// there); B buys at home, and what you bought is on you and in your hands;
// W runs, the use button fires and a round to the head counts; E sets the
// charge at a site and its fuse runs down; L, L walks you back out to the
// forest.
//
// Needs: nothing in particular (the gate is a walk from where you first
// arrive, and go() takes you there from anywhere).
// Leaves: you on the paving outside the gate, the map open and shut again.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  const match = (fn, arg) => page.evaluate(fn, arg);

  await step('through the Dry Wells gate', async () => {
    // (where it is waits for what might be in its way to be found; going there finds it now)
    await page.evaluate(() => world.skirmish.go());
    const site = await page.evaluate(() => world.skirmish.site && { id: world.skirmish.site.id });
    assert.ok(site, 'there is a gate');
    assert.equal(await page.evaluate((id) => world.map.places.get(id)?.name, site.id), 'Dry Wells gate', 'on the map');
    await frames(5);
    assert.match(await page.evaluate(() => T.prompt()), /walk into the light/, 'in front of it, you’re told how');
    await shot('the-gate');
    // walk into the light
    await page.keyboard.down('KeyW');
    await page.evaluate(() => T.until(() => world.skirmish.inside, 20000));
    await page.keyboard.up('KeyW');
    await frames(3);
    const there = await match(() => {
      const m = world.skirmish.match;
      return {
        inside: world.skirmish.inside,
        state: world.skirmish.session.state,
        covered: world.game.covered,
        hud: !document.getElementById('skirmish').hidden,
        tools: getComputedStyle(document.getElementById('hotbar')).display,
        aboard: !!world.player.aboard,
        fighters: m.fighters.length,
        people: m.fighters.filter((f) => f.owner).length,
        bots: m.fighters.filter((f) => f.bot).length,
        phase: m.rounds.phase,
        side: m.sideOf(m.mine),
      };
    });
    assert.deepEqual(there, { inside: true, state: 'host', covered: true, hud: true, tools: 'none', aboard: true, fighters: 10, people: 1, bots: 9, phase: 'freeze', side: 'attack' }, 'in the town, in a bot’s place, the forest put away');
    // the keys are the town's: the map doesn't open in here
    await key('KeyM');
    assert.equal(await page.evaluate(() => world.map.isOpen), false, 'the forest’s keys do nothing here');
    return { site: site.id };
  });

  await step('buying, at home', async () => {
    await match(() => (world.skirmish.match.mine.cash = 5000));
    await key('KeyB');
    const shop = page.getByRole('dialog', { name: 'Buy' });
    assert.ok(await shop.isVisible(), 'B opens the shop');
    await key('Digit4');
    await key('Digit7');
    await key('Digit8');
    const bought = await match(() => {
      const me = world.skirmish.match.mine;
      return { main: me.kit.main, armor: me.kit.armor, helmet: me.kit.helmet, kit: me.kit.kit, cash: me.cash, held: me.held, mag: me.ammo.rifle.mag };
    });
    assert.deepEqual(bought, { main: 'rifle', armor: 100, helmet: true, kit: false, cash: 1300, held: 'main', mag: 30 }, 'a rifle, a vest and a helmet; no fuse kit for a Raider');
    await key('KeyB');
    assert.ok(await shop.isHidden(), 'and B puts it away');
    // what there is to see of it: all ten are there, dressed for their sides; you have your vest and helmet on, and the rifle in your hands
    await page.evaluate(() => T.until(() => world.skirmish.look.figures.size === 10, 30000));
    await frames(3);
    const seen = await match(() => {
      const m = world.skirmish.match;
      const look = world.skirmish.look;
      const mine = look.figures.get(m.mine.id);
      return {
        dressed: m.fighters.every((f) => look.figures.get(f.id).c.who.name === (m.sideOf(f) === 'attack' ? 'a Raider' : 'a Warden')),
        armed: m.fighters.every((f) => !!look.figures.get(f.id).held),
        vest: mine.parts.armour.visible,
        helmet: mine.parts.helmet.visible,
        inHand: look.hands.kind,
        arms: !!look.hands.arms,
      };
    });
    assert.deepEqual(seen, { dressed: true, armed: true, vest: true, helmet: true, inHand: 'rifle', arms: true }, 'and it shows');
    await shot('at-home');
    return { ...bought, ...seen };
  });

  await step('a round in the town', async () => {
    // (the play-through hurries the freeze along, and stands the bots still)
    await match(() => {
      const m = world.skirmish.match;
      for (const f of m.fighters) if (f.bot) f.bot.think = () => ({ wish: { x: 0, z: 0 } });
      world.skirmish.hurry();
    });
    await frames(3);
    assert.equal(await match(() => world.skirmish.match.rounds.phase), 'live');
    // W runs, and the forest's hiker doesn't move
    const before = await match(() => ({ me: { ...world.skirmish.match.mine.body.pos }, hiker: { ...world.player.pos } }));
    await page.keyboard.down('KeyW');
    await frames(20);
    await page.keyboard.up('KeyW');
    await frames(3);
    const after = await match(() => ({ me: { ...world.skirmish.match.mine.body.pos }, hiker: { ...world.player.pos } }));
    const ran = Math.hypot(after.me.x - before.me.x, after.me.z - before.me.z);
    assert.ok(ran > 0.5, `W runs in the town (${ran.toFixed(2)} m)`);
    assert.ok(Math.hypot(after.hiker.x - before.hiker.x, after.hiker.z - before.hiker.z) < 0.01, 'and not the hiker in the forest');
    // stand a Warden in front of you, and fire as a visitor does
    await match(() => {
      const m = world.skirmish.match;
      const me = m.mine;
      const foe = m.fighters.find((f) => f.team !== me.team);
      Object.assign(me.body.pos, { x: 0, y: 0, z: 36 });
      Object.assign(me.body.vel, { x: 0, y: 0, z: 0 });
      Object.assign(foe.body.pos, { x: -9, y: 0, z: 36 });
      me.yaw = Math.PI / 2;
      me.pitch = 0;
      me.draw = 0;
      foe.kit.helmet = false;
    });
    await frames(3);
    await page.evaluate(() => T.tap('use'));
    const fight = await match(() => {
      const me = world.skirmish.match.mine;
      return { kills: me.kills, mag: me.ammo.rifle.mag < 30, feed: document.querySelector('#skirmish .feed').textContent };
    });
    assert.equal(fight.kills, 1, 'a rifle round to the head');
    assert.ok(fight.mag, 'out of the magazine');
    assert.match(fight.feed, /You.*Karga/, 'and the feed says so');
    // R reloads
    await key('KeyR');
    assert.ok(await match(() => world.skirmish.match.mine.reloading > 0), 'R reloads');
    assert.equal(await page.evaluate(() => world.player.pos.x), after.hiker.x, '...and doesn’t send the hiker home');
    await shot('a-round');
    return fight;
  });

  await step('setting the charge', async () => {
    // (handed the charge, and set down at the Granary)
    await match(() => {
      const m = world.skirmish.match;
      const me = m.mine;
      for (const f of m.fighters) f.charge = false;
      me.charge = true;
      Object.assign(m.charge, { state: 'carried', by: me.id });
      Object.assign(me.body.pos, { x: 32, y: 0.45, z: -21.5 });
    });
    await frames(3);
    assert.match(await match(() => document.querySelector('#skirmish .cue').textContent), /hold E to set the charge/, 'at a site with the charge, you’re told how');
    await page.keyboard.down('KeyE');
    const set = await page.evaluate(() => T.until(() => world.skirmish.match.charge.state === 'planted', 30000));
    await page.keyboard.up('KeyE');
    assert.ok(set, 'holding E sets it');
    const planted = await match(() => ({ phase: world.skirmish.match.rounds.phase, site: world.skirmish.match.charge.site, fuse: Math.round(world.skirmish.match.rounds.left) }));
    assert.deepEqual(planted, { phase: 'planted', site: 'A', fuse: 40 }, 'and its fuse is the clock now');
    await shot('the-charge-set');
    // (...which the play-through runs down)
    await match(() => {
      const m = world.skirmish.match;
      Object.assign(m.mine.body.pos, { x: 0, y: 0, z: 36 });
      m.rounds.left = 0.2;
    });
    await page.evaluate(() => T.until(() => world.skirmish.match.rounds.phase === 'over', 20000));
    const won = await match(() => ({ ...world.skirmish.match.rounds.last, score: world.skirmish.match.rounds.score, charge: world.skirmish.match.charge.state }));
    assert.deepEqual(won, { side: 'attack', team: 0, why: 'exploded', score: [1, 0], charge: 'blown' }, 'it goes off, and that’s the round');
    return won;
  });

  await step('out of the town again', async () => {
    await key('KeyL');
    assert.equal(await page.evaluate(() => world.skirmish.inside), true, 'once only asks');
    await key('KeyL');
    await frames(5);
    const out = await page.evaluate(() => {
      const s = world.skirmish.site;
      const p = world.player.pos;
      return { inside: world.skirmish.inside, covered: world.game.covered, aboard: !!world.player.aboard, hud: document.getElementById('skirmish').hidden, near: Math.hypot(p.x - s.x, p.z - s.z) < 8, visited: world.skirmish.record.visited, kills: world.skirmish.record.kills };
    });
    assert.deepEqual(out, { inside: false, covered: false, aboard: false, hud: true, near: true, visited: true, kills: 1 }, 'outside the gate, on your own feet');
    // and the forest's keys are the forest's again
    await key('KeyM');
    assert.equal(await page.evaluate(() => world.map.isOpen), true, 'M opens the map');
    await key('Escape');
    await shot('outside-again');
    return out;
  });
}
