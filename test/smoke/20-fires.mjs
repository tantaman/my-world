// A campfire: ring a pit, lay it, light it, feed it, put it out, take it
// apart, and find that no roof goes over one.
//
// Needs: the cabin with its roof off (10-build). Leaves it as it found it.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot, open, made }) {
  const { site, middle } = made.cabin;

  await step('a campfire', async () => {
    // In the cabin, now it has no roof: a fire wants open sky.
    const node = { x: site.x + 2, z: site.z + 1 };
    const aim = () => page.evaluate((n) => T.aimGround(n.x, n.z, 1.2), node);
    const fire = () => page.evaluate(() => {
      const f = world.fires.list.values().next().value;
      return f ? { state: world.fires.state(f).state, wood: f.wood, ash: f.ash } : null;
    });
    // ...and for the swing that did it to finish (a click mid-swing goes
    // nowhere), and a few frames more for the prompt to catch up
    const until = async (fn, arg) => {
      const ok = await page.evaluate(([f, a]) => T.until(() => new Function('a', `return (${f})(a)`)(a) && !world.builder.act, 20000), [fn.toString(), arg]);
      await frames(3);
      return ok;
    };
    const prompts = {};
    await key('Digit8');
    assert.equal(await page.evaluate(() => world.builder.tool), 'fire', '8 is the campfire');
    await aim();
    prompts.ring = await page.evaluate(() => T.prompt());
    assert.match(prompts.ring, /clear a fire pit/, `aiming at open ground (prompt: "${prompts.ring}")`);
    assert.ok(await page.evaluate(() => T.hold('use', () => world.fires.list.size === 1, 20000)), 'a ring of stones');
    await frames(3);
    assert.deepEqual(await fire(), { state: 'ring', wood: 0, ash: 0 });

    prompts.lay = await page.evaluate(() => T.prompt());
    assert.match(prompts.lay, /lay a fire/, `aiming at the ring (prompt: "${prompts.lay}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await until(() => world.fires.serialize()[0][3] === 1), 'wood laid in it');
    prompts.light = await page.evaluate(() => T.prompt());
    assert.match(prompts.light, /light it/, `(prompt: "${prompts.light}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await until(() => world.fires.serialize()[0][4] > 0), 'it is lit');
    assert.equal((await fire()).state, 'burning');
    await frames(30);
    prompts.feed = await page.evaluate(() => T.prompt());
    assert.match(prompts.feed, /put on more wood/, `(prompt: "${prompts.feed}")`);
    await page.evaluate(() => T.tap('use'));
    assert.ok(await until(() => world.fires.serialize()[0][3] === 1.5), 'more wood on it');
    const lit = await page.evaluate(() => ({ light: world.fires.lights[0].intensity, heard: world.fires.heard.length, solid: world.solids.owners.has(world.fires.list.values().next().value) }));
    assert.ok(lit.light > 0 && lit.heard === 1, 'it lights the room and can be heard');
    assert.ok(lit.solid, 'and you walk round it');
    await shot('campfire');

    // no roof over a fire
    await key('Digit7');
    await page.evaluate((m) => T.aimGround(m.x, m.z, 1.2), middle);
    prompts.roof = await page.evaluate(() => T.prompt());
    assert.match(prompts.roof, /fire ring in this room and no chimney/, `the roof goes round it (prompt: "${prompts.roof}")`);
    await page.evaluate(() => T.tap('use'));
    assert.equal(await page.evaluate(() => world.builder.buildings.list[0].roofs.length), 0, 'no roof went up');

    await key('Digit8');
    await aim();
    await page.evaluate(() => T.tap('alt'));
    assert.ok(await until(() => world.fires.serialize()[0][4] === 0), 'put out');
    const out = await fire();
    assert.equal(out.state, 'laid', 'what had not burned is left to light again');
    assert.equal(out.ash, 2);

    const kept = await page.evaluate(() => world.fires.serialize());
    await page.evaluate(() => T.frames(120));
    await open('&creative');
    assert.deepEqual(await page.evaluate(() => world.fires.serialize()), kept, 'the fire is remembered');

    await key('Digit8');
    await aim();
    prompts.take = await page.evaluate(() => T.prompt());
    assert.match(prompts.take, /take it apart/, `(prompt: "${prompts.take}")`);
    await page.evaluate(() => T.tap('alt'));
    assert.ok(await until(() => world.fires.list.size === 0), 'the ring is taken apart');
    await key('Digit7');
    await page.evaluate((m) => T.aimGround(m.x, m.z, 1.2), middle);
    prompts.roofAgain = await page.evaluate(() => T.prompt());
    assert.match(prompts.roofAgain, /raise the roof/, `and the room can be roofed again (prompt: "${prompts.roofAgain}")`);
    return { prompts: Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.replace(/\d+ min/, 'N min')])), kept: kept.map(([x, z, y, wood, lit, ash]) => [x - site.x, z - site.z, wood, lit, ash]) };
  });
}
