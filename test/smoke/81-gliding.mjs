// Gliding: high up on the eagle, let go of it and your hang glider opens;
// bank it round and speed it up; whistle, and the eagle catches you in the
// air; let go again over the horse's meadow and glide down to land.
//
// Needs nothing from earlier parts: it makes the eagle yours if it isn't
// already. Leaves: you on foot in the horse's meadow, the eagle somewhere
// near, waiting.

import assert from 'node:assert/strict';

// Climb on the eagle (space and W held) until this many metres up.
async function climb(page, high) {
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyW');
  const up = await page.evaluate((h) => T.until(() => world.player.flying && world.player.height > h, 60000), high);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Space');
  return up;
}

export default async function ({ page, step, key, frames, shot }) {
  await step('high on the eagle, let go of it, and your glider opens', async () => {
    await page.evaluate(async () => {
      const e = world.mounts.haunts.eagle;
      await world.teleport(e.x + 3, e.z);
      world.mounts.tame('eagle');
      world.mounts.ride('eagle');
      await T.frames(3);
    });
    assert.ok(await climb(page, 60), 'up high'); // (well clear of the trees on a hillside, however the ground rises under the glide)
    assert.match(await page.evaluate(() => T.prompt()), /F let go and glide/, 'the prompt says what F does up here');
    await key('KeyF');
    const off = await page.evaluate(() => ({
      riding: world.mounts.riding,
      gliding: world.gliding.active,
      eagle: world.mounts.list().find((m) => m.kind === 'eagle').mode,
      said: document.getElementById('toast').textContent,
      tools: world.builder.idle,
    }));
    assert.equal(off.riding, null, 'off the eagle');
    assert.equal(off.gliding, true, 'and on the glider');
    assert.equal(off.eagle, 'land', 'which flies off to wait');
    assert.match(off.said, /hang glider opens/);
    assert.equal(off.tools, true, 'tools put away');
    const opened = await page.evaluate(() => T.until(() => world.gliding.state()?.open >= 1, 10000));
    assert.ok(opened, 'the sail fills');
    await frames(30);
    const flying = await page.evaluate(() => ({
      s: world.gliding.state(),
      readout: document.getElementById('glide').textContent,
      prompt: T.prompt(),
      hanging: world.player.character.hung !== null,
    }));
    assert.ok(flying.s.height > 15 && flying.s.speed > 6, 'flying, well up');
    assert.match(flying.readout, /m up · \d+ km\/h · (sinking|climbing)/, 'how high, how fast, how fast down');
    assert.match(flying.prompt, /A D turn .* Z call your eagle/);
    assert.ok(flying.hanging, 'hanging under it');
    await shot('gliding');

    // D banks it round to the right; W speeds it up
    await page.keyboard.down('KeyD');
    await frames(60);
    const banked = await page.evaluate(() => world.gliding.state());
    await page.keyboard.up('KeyD');
    assert.ok(banked.bank > 0.3, `banked (${banked.bank})`);
    assert.ok(banked.heading < flying.s.heading - 0.2, 'and turning right');
    await page.keyboard.down('KeyW');
    await frames(120);
    const fast = await page.evaluate(() => world.gliding.state());
    await page.keyboard.up('KeyW');
    assert.ok(fast.speed > flying.s.speed + 2, `faster with the bar in (${fast.speed} m/s)`);
    return { height: flying.s.height, bank: banked.bank, fast: fast.speed };
  });

  await step('whistle, and the eagle catches you in the air', async () => {
    await key('KeyZ');
    assert.match(await page.evaluate(() => document.getElementById('toast').textContent), /coming to catch you/);
    const caught = await page.evaluate(() => T.until(() => world.mounts.riding === 'eagle', 60000));
    assert.ok(caught, 'on its back again');
    await frames(5);
    const now = await page.evaluate(() => ({ gliding: world.gliding.active, flying: world.player.flying, height: world.player.height, hanging: world.player.character.hung }));
    assert.equal(now.gliding, false, 'the glider is put away');
    assert.equal(now.hanging, null);
    assert.ok(now.flying && now.height > 3, 'still up in the air, flying the eagle');
    return { height: Math.round(now.height) };
  });

  await step('over the meadow, let go again and glide down to land', async () => {
    await page.evaluate(async () => {
      const h = world.mounts.haunts.horse;
      world.mounts.getOff();
      await world.teleport(h.x, h.z);
      world.mounts.ride('eagle');
      await T.frames(3);
    });
    assert.ok(await climb(page, 22), 'up again');
    await key('KeyF');
    assert.equal(await page.evaluate(() => world.gliding.active), true, 'gliding');
    // circle down over the meadow, then straighten up to land
    await page.keyboard.down('KeyD');
    await page.evaluate(() => T.until(() => !world.gliding.active || world.gliding.state().height < 7, 60000));
    await page.keyboard.up('KeyD');
    const landed = await page.evaluate(() => T.until(() => !world.gliding.active, 60000));
    assert.ok(landed, 'down');
    await frames(10);
    const down = await page.evaluate(() => ({
      said: document.getElementById('toast').textContent,
      aboard: world.player.aboard,
      grounded: world.player.grounded,
      root: [world.player.character.root.rotation.order, world.player.character.root.rotation.x],
      readout: document.getElementById('glide').hidden,
    }));
    assert.match(down.said, /fold(s)? up the glider|glider folds up/, 'the glider folded up');
    assert.equal(down.aboard, null, 'on your own two feet');
    assert.ok(down.grounded);
    assert.deepEqual(down.root, ['YXZ', 0], 'standing straight');
    assert.ok(down.readout, 'no readout');
    await shot('landed');
    return { said: down.said };
  });
}
