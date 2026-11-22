// Who is hiking: picked on the settings panel (O) as a visitor would. Each of
// the others walks off at their own size, the camera down at their eye level,
// and whoever was picked last is still them when the game is opened again.
// The hiker is put back for the parts after this one.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, open, shot }) {
  await step('who is hiking', async () => {
    const who = () => page.evaluate(() => ({ id: world.player.character.who.id, size: world.player.size, eye: world.player.eye }));
    const choose = async (id) => {
      await key('KeyO');
      await page.click(`#settings [data-setting="hiker"] [data-value="${id}"]`);
      const ringed = await page.evaluate(() => document.querySelector('#settings [data-setting="hiker"] [aria-checked="true"]')?.dataset.value);
      await key('KeyO');
      return ringed;
    };
    const before = await who();
    await key('KeyO');
    const offered = await page.evaluate(() => [...document.querySelectorAll('#settings [data-setting="hiker"] [role="radio"]')].map((b) => ({ id: b.dataset.value, name: b.textContent })));
    await key('KeyO');
    const names = offered.map((o) => o.name);
    assert.ok(names.includes('Oliver') && names.includes('Elliott'), `a choice of hikers on the settings panel (${names.join(', ')})`);

    const sizes = {};
    const walked = {};
    const others = offered.filter((o) => o.id !== before.id);
    for (const { id, name } of others) {
      assert.equal(await choose(id), id, `${name} ringed once picked`);
      const them = await who();
      assert.equal(them.id, id);
      assert.ok(them.size < 1, `${name} smaller than the hiker (${them.size})`);
      assert.ok(Math.abs(them.eye / before.eye - them.size) < 0.01, `the camera at ${name}'s eye level (${them.eye.toFixed(2)} m, from ${before.eye.toFixed(2)})`);

      // off they go
      const from = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
      await page.keyboard.down('KeyW');
      await frames(40);
      await page.keyboard.up('KeyW');
      await frames(10);
      const far = await page.evaluate((f) => Math.hypot(world.player.pos.x - f.x, world.player.pos.z - f.z), from);
      assert.ok(far > 1, `${name} walks (${far.toFixed(1)} m)`);
      await shot(id);
      sizes[id] = them.size;
      walked[id] = Math.round(far * 10) / 10;
    }

    const last = others.at(-1);
    await open('&creative');
    assert.equal((await who()).id, last.id, `still ${last.name} when the game is opened again`);

    assert.equal(await choose(before.id), before.id);
    assert.equal((await who()).id, before.id, 'and back to the hiker');
    return { offered: names, sizes, walked };
  });
}
