// Animals, called up by name (the play-through runs with none): a fox, then
// one of every species.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  await step('wildlife on request', async () => {
    const said = await page.evaluate(() => world.wildlife.spawn('fox', { here: true }));
    await frames(30);
    assert.deepEqual(await page.evaluate(() => world.wildlife.list().map((a) => a.kind)), ['fox']);
    assert.match(said, /fox/);
    await shot('fox');
    // and one of everything, to see that each kind of animal turns up and gets on with it
    const about = await page.evaluate(async () => {
      world.wildlife.clear();
      const kinds = Object.keys(world.wildlife.species);
      kinds.forEach((kind, i) => world.wildlife.spawn(kind, { here: true, angle: (i / kinds.length) * 6.28, dist: 8 + (i % 4) * 4 }));
      await T.frames(120);
      const seen = new Set(world.wildlife.list().map((a) => a.kind));
      world.wildlife.clear();
      return { asked: kinds.length, missing: kinds.filter((k) => !seen.has(k)) };
    });
    assert.deepEqual(about.missing, [], 'every species spawns');
    return about;
  });
}
