// Mounts: hear of the wild horse, find it, win it over, ride it and whistle
// it back; swim a lake on the turtle and fly the eagle.
//
// Needs: a world where none is yours yet. Leaves: all three tame, and you on
// the eagle's summit.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('find a wild horse, win it over and ride it', async () => {
    const horse = () => page.evaluate(() => world.mounts.list().find((m) => m.kind === 'horse'));
    // with no mount of your own, Z says where to look, and the map shows it
    await key('KeyZ');
    const word = await page.evaluate(() => ({ said: document.getElementById('toast').textContent, known: world.mounts.hints.stage.horse, area: world.mounts.hints.area('horse') }));
    assert.match(word.said, /wild horse.*m to the/, 'word of a horse, and which way');
    assert.equal(word.known, 1);
    assert.ok(word.area && word.area.r > 30, 'a circle on the map to look in');
    // into the circle: signs of it, and a smaller circle
    const signs = await page.evaluate(async (a) => {
      await world.teleport(a.x, a.z);
      await T.frames(5);
      return { known: world.mounts.hints.stage.horse, r: world.mounts.hints.area('horse')?.r };
    }, word.area);
    assert.ok(signs.known >= 2, 'it is close');
    // walk up beside it, and stand there with a hand out
    const h = await horse();
    await page.evaluate(async (m) => {
      await world.teleport(m.x + 2.5, m.z + 1);
      await T.frames(5);
    }, h);
    assert.equal(await page.evaluate(() => world.mounts.hints.stage.horse), 3, 'seen');
    assert.match(await page.evaluate(() => T.prompt()), /hold Z.*calm the wild horse/);
    await page.keyboard.down('KeyZ');
    const won = await page.evaluate(() => T.until(() => world.mounts.list()[0].tame, 60000));
    await page.keyboard.up('KeyZ');
    assert.ok(won, 'it trusts you');
    await frames(3);
    assert.match(await page.evaluate(() => T.prompt()), /Z ride your horse/);
    // on, and away at a gallop
    await key('KeyZ');
    assert.equal(await page.evaluate(() => world.mounts.riding), 'horse');
    assert.deepEqual(await page.evaluate(() => [world.builder.idle, world.player.character.tool]), [true, null], 'tools put away while you ride');
    await page.evaluate(() => world.look(world.player.yaw + Math.PI, 0.3));
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    const gallop = await page.evaluate(async () => {
      let most = 0;
      for (let i = 0; i < 90; i++) {
        await T.frames(1);
        most = Math.max(most, Math.hypot(world.player.vel.x, world.player.vel.z));
      }
      return most;
    });
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    await shot('riding');
    assert.ok(gallop > 8, `a gallop (${gallop.toFixed(1)} m/s)`);
    await frames(30);
    await key('KeyZ');
    assert.equal(await page.evaluate(() => world.mounts.riding), null, 'and off again');
    // from a long way off, a whistle brings it back
    const back = await page.evaluate(async () => {
      const p = world.player.pos;
      await world.teleport(p.x + 220, p.z + 40);
      await T.frames(3);
      return world.mounts.list()[0].dist;
    });
    assert.ok(back > 150);
    await key('KeyZ');
    const came = await page.evaluate(() => T.until(() => world.mounts.list()[0].dist < 4.5, 60000));
    assert.ok(came, 'it comes when called');
    return { word: word.said, signs: signs.r, gallop: Math.round(gallop * 10) / 10 };
  });

  await step('swim a lake on the turtle, and fly the eagle', async () => {
    const swum = await page.evaluate(async () => {
      const L = world.mounts.haunts.turtle.lake;
      const t = world.mounts.list().find((m) => m.kind === 'turtle');
      await world.teleport(t.x, t.z);
      world.mounts.tame('turtle');
      world.mounts.ride('turtle');
      const p = world.player.pos;
      world.look(Math.atan2(p.x - L.x, p.z - L.z), 0.3);
      await T.frames(2);
      return { x: p.x, z: p.z };
    });
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    const swimming = await page.evaluate(() => T.until(() => world.player.swimming && Math.hypot(world.player.vel.x, world.player.vel.z) > 3, 60000));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    assert.ok(swimming, 'out into the lake, swimming fast');
    await shot('turtle');
    await key('KeyZ');
    const flew = await page.evaluate(async () => {
      const e = world.mounts.haunts.eagle;
      await world.teleport(e.x + 3, e.z);
      world.mounts.tame('eagle');
      world.mounts.ride('eagle');
      await T.frames(3);
      return world.mounts.riding;
    });
    assert.equal(flew, 'eagle');
    await page.keyboard.down('Space');
    await page.keyboard.down('KeyW');
    const up = await page.evaluate(() => T.until(() => world.player.flying && world.player.height > 15, 60000));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    assert.ok(up, 'up into the air');
    await shot('eagle');
    // Z in the air brings it down, and you're let off when it lands
    await key('KeyZ');
    const down = await page.evaluate(() => T.until(() => !world.mounts.riding, 60000));
    assert.ok(down, 'down, and off');
    assert.equal(await page.evaluate(() => world.player.flying), false);
    const kept = await page.evaluate(async () => {
      await T.frames(140);
      return JSON.parse(localStorage.getItem('my-world:build:20261119')).mounts;
    });
    assert.deepEqual(Object.keys(kept.tame).sort(), ['eagle', 'horse', 'turtle'], 'all three are kept as yours');
    return { swam: true, flew: true, kept: Object.keys(kept.tame).length };
  });
}
