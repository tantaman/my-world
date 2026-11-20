// What a new feature does from its install function, done here by hand at
// the end of the play: a tool, something for it to save, a layer of sound.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, made }) {
  // Somewhere to plant a flag: by where the cabin was built or, played on its
  // own, a few steps from where you stand.
  const middle = 'cabin' in made ? made.cabin.middle : await page.evaluate(() => ({ x: world.player.pos.x + 12, z: world.player.pos.z + 12 }));

  await step('something new plugs in', async () => {
    // What a feature would do from its install function, done here by hand:
    // a tool, something for it to save, and a layer of sound. Nothing in the
    // game was written with these in mind.
    const had = await page.evaluate(() => document.querySelectorAll('#hotbar .slot').length);
    const n = had + 1;
    const f = await page.evaluate(async () => {
      const flags = [];
      world.builder.register({
        id: 'flag',
        label: 'flag',
        short: 'flag',
        target: (b) => (b.ground ? { ok: true, prompt: '<b>click</b> plant a flag' } : null),
        work(b, t, io) {
          if (io.useTap && t) flags.push([Math.round(b.ground.p.x), Math.round(b.ground.p.z)]);
          if (io.useTap && t) world.save.touch();
          return false;
        },
      });
      world.save.register({ id: 'flags', scope: 'yours', collect: () => flags, restore: (data) => flags.push(...data) });
      let heard = 0;
      world.sound.addLayer({ name: 'flags', build() {}, update: () => heard++ });
      await T.frames(3);
      return { slots: document.querySelectorAll('#hotbar .slot').length, hint: document.getElementById('hint-tools').textContent };
    });
    assert.equal(f.slots, n, 'it is on the tool bar');
    assert.equal(f.hint, `1–${n}`);
    // the number keys go up to 9, and 0 for a tenth; past that, a tool is picked from the bar
    if (n <= 10) await key(`Digit${n % 10}`);
    else {
      await page.evaluate((i) => document.querySelectorAll('#hotbar .slot')[i - 1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), n);
      await frames(3);
    }
    assert.equal(await page.evaluate(() => T.tool()), 'flag', n <= 10 ? 'the next number key picks it' : 'and it can be picked from the bar');
    assert.equal(await page.evaluate(() => T.slot()), n, 'in a slot of its own');
    await page.evaluate((m) => T.aimGround(m.x - 6, m.z - 6, 3), middle);
    assert.equal(await page.evaluate(() => T.prompt()), 'click plant a flag', 'its prompt shows');
    await page.evaluate(() => T.tap('use'));
    await page.evaluate(() => T.frames(140)); // long enough for the change to be written down
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem(world.save.local.keyFor('build'))).flags);
    assert.equal(kept.length, 1, 'and what it made is in the save');
    await key('KeyH');
    const help = await page.evaluate(() => [...document.querySelectorAll('#help .row kbd')].map((k) => k.textContent));
    await key('KeyH');
    assert.ok(help.includes(`1 – ${n}`), 'the help panel counts it too');
    return { ...f, kept: kept.length };
  });
}
