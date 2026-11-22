// Mounts: hear of the wild horse, find it, win it over, ride it and whistle
// it back; take the other two from the map rather than going looking; swim a
// lake on the turtle and fly the eagle.
//
// Needs: a world where none is yours yet. Leaves: all three tame, and you on
// the eagle's summit.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  await step('find a wild horse, win it over and ride it', async () => {
    const horse = () => page.evaluate(() => world.mounts.list().find((m) => m.kind === 'horse'));
    // with no mount of your own, Z says where to look for the nearest, and the
    // map shows it
    await key('KeyZ');
    const word = await page.evaluate(() => {
      const h = world.mounts.hints;
      const first = h.order[0];
      return { said: document.getElementById('toast').textContent, first, known: h.stage[first], area: h.area(first) };
    });
    assert.match(word.said, /word is .*m to the/, 'word of the nearest, and which way');
    assert.equal(word.known, 1);
    assert.ok(word.area && word.area.r > 30, 'a circle on the map to look in');
    // if that wasn't the horse, word of it comes in its own time: hurry it along
    word.area = await page.evaluate(() => {
      const h = world.mounts.hints;
      while (h.stage.horse === 0 && h.rumour());
      return h.area('horse');
    });
    assert.ok(word.area && word.area.r > 30, "and a circle for the horse's");
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
    assert.match(await page.evaluate(() => T.prompt()), /F ride your horse/);
    const mine = await page.evaluate(() => world.pack.list().yours.filter((t) => /^your /.test(t.label)));
    assert.equal(mine.length, 1, 'your pack lists it with what else is yours');
    assert.equal(mine[0].label, 'your horse');
    assert.match(mine[0].note, /^about \d+ m to the /, 'with where it is');
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

  // Rather than go looking for the other two: the map's option hands you all
  // three at once, each left where it lives.
  await step('acquire the rest from the map', async () => {
    await key('KeyM');
    await frames(10);
    const before = await page.evaluate(() => ({
      tame: world.mounts.list().filter((m) => m.tame).length,
      off: document.querySelector('#map .side-acts [data-action="mounts-all"]').disabled,
    }));
    assert.deepEqual(before, { tame: 1, off: false }, 'only the horse is yours, and the option is there to press');
    await page.click('#map .side-acts [data-action="mounts-all"]');
    await frames(3);
    const after = await page.evaluate(() => ({
      said: document.getElementById('toast').textContent,
      mine: world.mounts
        .list()
        .filter((m) => m.tame)
        .map((m) => m.kind)
        .sort(),
      off: document.querySelector('#map .side-acts [data-action="mounts-all"]').disabled,
      // each stays where it lives, so a whistle is what brings one to you
      home: ['turtle', 'eagle'].every((k) => {
        const m = world.mounts.list().find((x) => x.kind === k);
        const h = world.mounts.haunts[k];
        return Math.hypot(m.x - h.x, m.z - h.z) < (h.r || 0) + 40;
      }),
    }));
    assert.deepEqual(after.mine, ['eagle', 'horse', 'turtle'], 'all three are yours');
    assert.match(after.said, /yours/, 'and it says so');
    assert.equal(after.off, true, 'with nothing left in the option, it greys out');
    assert.ok(after.home, 'each is still at its haunt');
    await key('KeyM');
    await frames(3);
    return { said: after.said, mine: after.mine };
  });

  await step('swim a lake on the turtle, and fly the eagle', async () => {
    const swum = await page.evaluate(async () => {
      const L = world.mounts.haunts.turtle.lake;
      const t = world.mounts.list().find((m) => m.kind === 'turtle');
      await world.teleport(t.x, t.z);
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
      world.mounts.ride('eagle');
      await T.frames(3);
      return world.mounts.riding;
    });
    assert.equal(flew, 'eagle');
    await page.keyboard.down('Space');
    await page.keyboard.down('KeyW');
    const up = await page.evaluate(() => T.until(() => world.player.flying && world.player.height > 6, 60000));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    assert.ok(up, 'up into the air');
    await shot('eagle');
    // Z low in the air brings it down, and you're let off when it lands
    // (higher up, Z lets go of it and you glide: that's the gliding part)
    assert.match(await page.evaluate(() => T.prompt()), /F land/);
    await key('KeyZ');
    const down = await page.evaluate(() => T.until(() => !world.mounts.riding, 60000));
    assert.ok(down, 'down, and off');
    assert.equal(await page.evaluate(() => world.player.flying), false);
    const kept = await page.evaluate(async () => {
      await T.frames(140);
      return JSON.parse(localStorage.getItem(world.save.local.keyFor('build'))).mounts;
    });
    assert.deepEqual(Object.keys(kept.tame).sort(), ['eagle', 'horse', 'turtle'], 'all three are kept as yours');
    const mine = await page.evaluate(() => world.pack.list().yours.map((t) => t.label).filter((l) => /^your /.test(l)));
    assert.deepEqual(mine.sort(), ['your eagle', 'your horse', 'your turtle'], 'and all three are in your pack');
    return { swam: true, flew: true, kept: Object.keys(kept.tame).length };
  });
}
