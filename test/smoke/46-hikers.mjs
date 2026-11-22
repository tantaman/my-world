// Who is hiking: picked on the settings panel (O) as a visitor would. Oliver
// walks off at his own size, the camera down at his eye level, and he is
// still Oliver when the game is opened again. The hiker is put back for the
// parts after this one.

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
    const offered = await page.evaluate(() => [...document.querySelectorAll('#settings [data-setting="hiker"] [role="radio"]')].map((b) => b.textContent));
    await key('KeyO');
    assert.ok(offered.includes('Oliver') && offered.length >= 2, `a choice of hikers on the settings panel (${offered.join(', ')})`);

    assert.equal(await choose('oliver'), 'oliver', 'Oliver ringed once picked');
    const oliver = await who();
    assert.equal(oliver.id, 'oliver');
    assert.ok(oliver.size < 0.7, `about a five-year-old's size (${oliver.size})`);
    assert.ok(oliver.eye < before.eye * 0.75, `the camera at his eye level (${oliver.eye.toFixed(2)} m, from ${before.eye.toFixed(2)})`);

    // off he goes
    const from = await page.evaluate(() => ({ x: world.player.pos.x, z: world.player.pos.z }));
    await page.keyboard.down('KeyW');
    await frames(40);
    await page.keyboard.up('KeyW');
    await frames(10);
    const walked = await page.evaluate((f) => Math.hypot(world.player.pos.x - f.x, world.player.pos.z - f.z), from);
    assert.ok(walked > 1, `he walks (${walked.toFixed(1)} m)`);
    await shot('oliver');

    await open('&creative');
    assert.equal((await who()).id, 'oliver', 'still Oliver when the game is opened again');

    assert.equal(await choose(before.id), before.id);
    assert.equal((await who()).id, before.id, 'and back to the hiker');
    return { offered, size: oliver.size, eye: Math.round(oliver.eye * 100) / 100, walked: Math.round(walked * 10) / 10 };
  });
}
