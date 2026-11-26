// The DC Improv: on the map, `go here` sets you down on Connecticut Avenue
// outside its door, and F takes you downstairs into the lobby. A stand-up
// show about to start (the club's clock moved on, from the console), and
// into the Main Showroom: the room's filling, the host comes on, and the
// words are on the screen, one line after another; F takes a seat and gets
// you up again. Then the improv in the Lounge: F shouts a suggestion when
// the host asks for one, and the scene is the one you shouted for. Heard,
// on a bus of its own. Up the stairs and out.
//
// Needs: nothing in particular (the club is on the map from anywhere).
// Leaves: you on Connecticut Avenue outside the club's door.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  const here = () => page.evaluate(() => world.act.here()?.word || null);
  // what builds the people, now (the play-through draws a frame a second or
  // two, so the frame's allowance for work that can wait is very little)
  const people = () => page.evaluate(() => {
    const c = world.improv.club;
    let n = 0;
    while (c && c.pump() && n < 80) n++;
    return n;
  });

  await step('to the door on Connecticut Avenue, and downstairs', async () => {
    const place = await page.evaluate(() => world.map.places.get('improv:dc-improv'));
    assert.ok(place && /Connecticut/.test(place.note), 'on the map');
    // (the club's open from noon: with a show coming up, whenever this is played)
    assert.ok(await page.evaluate(() => world.improv.soon('standup', 150)), 'a show coming up');
    await page.evaluate(() => world.improv.go());
    assert.ok(await page.evaluate(() => T.until(() => world.act.here()?.word === 'go in', 30000)), 'at the door, F goes in');
    assert.equal(await page.evaluate(() => world.washington.at(world.player.pos.x, world.player.pos.z)), 'paving', 'on the pavement');
    await shot('the DC Improv, on Connecticut Avenue');
    await page.evaluate(() => world.act.press());
    await frames(5);
    assert.equal(await page.evaluate(() => world.improv.room), 'lobby');
    assert.equal(await here(), 'go up to the street');
    const under = await page.evaluate(() => world.chunks.heightAt(world.player.pos.x, world.player.pos.z) - world.player.pos.y);
    assert.ok(under > 3, `downstairs, ${under.toFixed(1)} m under the street`);
    return { under: +under.toFixed(1) };
  });

  await step('a stand-up show: the room fills, the host comes on, the words on the screen', async () => {
    const id = await page.evaluate(() => world.improv.soon('standup', 12));
    await page.evaluate(() => world.improv.enter('main'));
    await people();
    assert.equal(await page.evaluate(() => world.improv.room), 'main');
    // the doors are open: people in their seats, the stage waiting
    const seated = await page.evaluate(() => world.improv.club.audiences.main.count);
    assert.ok(seated > 10, `${seated} in their seats`);
    // the show starts: the booth, then the host, each line on the screen as it's said
    const said = new Set();
    const host = await page.evaluate(() => T.until(() => world.improv.now().main?.who === 'dana', 90000));
    assert.ok(host, 'the host comes on');
    for (let i = 0; i < 40 && said.size < 2; i++) {
      const n = await page.evaluate(() => world.improv.now());
      if (n.main?.kind_of === 'line' && n.caption === n.main.line) said.add(n.caption);
      await page.waitForTimeout(500);
    }
    assert.ok(said.size >= 2, 'line after line, on the screen');
    await people();
    await frames(10);
    const on = await page.evaluate(() => [...world.improv.club.performers.entries()].filter(([, p]) => p.mesh.visible).map(([id]) => id));
    assert.ok(on.includes('dana'), `on the stage: ${on.join(', ')}`);
    await shot('the Main Showroom, the host on');
    return { show: id, said: [...said], seated };
  });

  await step('a seat, and up again', async () => {
    assert.ok(await page.evaluate(() => world.improv.toSeat()), 'beside a free seat');
    await frames(3);
    assert.equal(await here(), 'take a seat');
    await page.evaluate(() => world.act.press());
    await frames(5);
    assert.ok(await page.evaluate(() => world.improv.seated), 'sitting');
    assert.equal(await here(), 'get up');
    await page.evaluate(() => world.act.press());
    await frames(5);
    assert.equal(await page.evaluate(() => world.improv.seated), false, 'up');
    assert.equal(await page.evaluate(() => world.improv.room), 'main', 'in the aisle');
  });

  await step('the improv: shout a suggestion, and that is the scene', async () => {
    await page.evaluate(() => world.improv.soon('improv', 5));
    await page.evaluate(() => world.improv.enter('lounge'));
    await people();
    // when the host asks, F shouts one
    const asked = await page.evaluate(() => T.until(() => /^shout/.test(world.act.here()?.word || ''), 120000));
    assert.ok(asked, 'the host asks for a suggestion');
    const shouted = await page.evaluate(() => world.improv.shout());
    assert.ok(shouted, 'shouted');
    const took = await page.evaluate((s) => T.until(() => (world.improv.now().lounge?.line || '').startsWith('I heard') && world.improv.now().lounge.line.includes(s), 60000), shouted);
    assert.ok(took, `the host took “${shouted}”`);
    await people();
    await frames(10);
    await shot('the Lounge, at the improv');
    // and heard: the play-through is muted, so sound on for a moment
    const heard = await page.evaluate(async () => {
      const s = world.sound;
      s.setEnabled(true);
      if (!(await T.until(() => s.running, 5000))) return { running: false };
      await T.frames(30);
      const out = { running: true, improv: s.buses.has('improv') };
      s.setEnabled(false);
      return out;
    });
    if (heard.running) assert.ok(heard.improv, 'the room heard, on a bus of its own');
    return { shouted, heard };
  });

  await step('up the stairs to the street', async () => {
    await page.evaluate(() => world.improv.enter('lobby'));
    await frames(3);
    assert.equal(await here(), 'go up to the street');
    await page.evaluate(() => world.act.press());
    await frames(5);
    assert.equal(await page.evaluate(() => world.improv.room), null);
    assert.equal(await page.evaluate(() => world.player.space), null, 'out under the sky');
    assert.equal(await here(), 'go in', 'outside the door');
  });
}
