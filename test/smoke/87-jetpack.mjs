// The jetpack: walk up to its rack at the launch site and F (the act key)
// straps it on; jump and hold space and the jets fire, you climb and W flies
// you along, the tools put away; shift dives, and touching down cuts the jets
// out. It's kept as yours, and F at the rack hangs it back up.
//
// Needs: nothing in particular (go() takes you to the rack from anywhere).
// Leaves: you in front of the rack at the launch site, the jetpack hung back
// up on it, as it was.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  const onBack = () => page.evaluate(() => world.player.character.back.children.some((o) => o.visible));

  // what your pack lists of it, with what else is yours
  const inPack = () => page.evaluate(() => world.pack.list().yours.filter((t) => /jetpack/.test(t.label)));
  await step('strap on the jetpack at the launch site', async () => {
    const rack = await page.evaluate(() => world.jetpack.rack && { x: world.jetpack.rack.x, z: world.jetpack.rack.z });
    assert.ok(rack, 'there is a rack');
    assert.equal(await onBack(), false, 'nothing on your back yet');
    await page.evaluate(() => world.jetpack.go());
    await frames(5);
    assert.match(await page.evaluate(() => T.prompt()), /F strap on the jetpack/, 'in front of the rack, F would strap it on');
    await shot('the rack');
    await key('KeyF');
    assert.equal(await page.evaluate(() => world.jetpack.have), true, 'F, and it is yours');
    assert.equal(await onBack(), true, 'on your back');
    assert.deepEqual(await inPack(), [{ label: 'a jetpack', note: 'on your back' }], 'and in your pack, with what else is yours');
    return rack;
  });

  await step('fly', async () => {
    const from = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
    // jump, and keep holding space. (A press that lands on a frame you aren't
    // quite on the ground is lost, as it is for anyone at the keys, who would
    // press again: so does this.)
    let lit = false;
    for (let tries = 0; tries < 5 && !lit; tries++) {
      await page.keyboard.down('Space');
      lit = await page.evaluate(() => T.until(() => world.jetpack.flying, 5000));
      if (!lit) {
        await page.keyboard.up('Space');
        await frames(10);
      }
    }
    // (if they don't, what is in the way: something else has you, or has the keys)
    const why = lit ? '' : await page.evaluate(() => {
      const p = world.player;
      return JSON.stringify({ have: world.jetpack.have, grounded: p.grounded, swimming: p.swimming, heldBy: p.rides.by, carried: !!p.carrier, aboard: !!p.aboard, keysElsewhere: world.input.blocked, map: world.map.isOpen, focus: document.activeElement?.tagName, y: +p.pos.y.toFixed(1), height: +p.height.toFixed(1) });
    });
    assert.ok(lit, `jump and hold space, and the jets fire (${why})`);
    await page.keyboard.down('KeyW');
    const up = await page.evaluate(() => T.until(() => world.player.height > 15, 60000));
    const flying = await page.evaluate(() => ({ ...world.jetpack.state(), idle: world.builder.idle, hanging: !!world.player.character.stood, prompt: T.prompt() }));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    assert.ok(up, `up into the air (${flying.height} m)`);
    assert.ok(flying.thrust > 0.5, `the jets going hard, climbing (${flying.thrust})`);
    assert.equal(flying.idle, true, 'tools put away while the jets burn');
    assert.equal(flying.hanging, true, 'hanging under it');
    assert.match(flying.prompt, /space climb · shift dive/, 'and the prompt says how to fly');
    const went = await page.evaluate((f) => Math.hypot(world.player.pos.x - f.x, world.player.pos.z - f.z), from);
    assert.ok(went > 5, `W flies you along (${went.toFixed(1)} m)`);
    await shot('jetpack');
    return { height: flying.height, went: Math.round(went) };
  });

  await step('dive, touch down, and the jets cut out', async () => {
    await page.keyboard.down('ShiftLeft');
    const down = await page.evaluate(() => T.until(() => !world.jetpack.flying, 60000));
    await page.keyboard.up('ShiftLeft');
    assert.ok(down, 'down, and the jets out');
    await frames(5);
    const after = await page.evaluate(() => ({ carried: !!world.player.carrier, flying: world.player.flying, idle: world.builder.idle, hanging: !!world.player.character.stood, have: world.jetpack.have }));
    assert.deepEqual(after, { carried: false, flying: false, idle: false, hanging: false, have: true }, 'on your own feet, the tools back, the jetpack still on');
  });

  await step('kept as yours, and hung back up', async () => {
    const kept = await page.evaluate(async () => {
      await T.frames(140);
      return JSON.parse(localStorage.getItem(world.save.local.keyFor('build'))).jetpack;
    });
    assert.deepEqual(kept, { have: true }, 'kept with the rest of what is yours');
    await page.evaluate(() => world.jetpack.go());
    await frames(5);
    assert.match(await page.evaluate(() => T.prompt()), /F hang the jetpack back up/);
    await key('KeyF');
    assert.equal(await page.evaluate(() => world.jetpack.have), false, 'back on its rack');
    assert.equal(await onBack(), false, 'off your back');
    assert.deepEqual(await inPack(), [], 'and no longer in your pack');
  });
}
