// Caves: walk into the nearest one through its mouth, on along its passages
// by headlamp, put the lamp out and light it again, leave and come back to
// find yourself still in it, and walk out again into the daylight.
//
// Leaves: you on the hillside just outside the mouth of the nearest cave.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, open, shot }) {
  await step('explore a cave', async () => {
    // The nearest cave: stand a few steps from its mouth, looking in.
    const cave = await page.evaluate(async () => {
      const { caves, player } = world;
      const near = caves.nearest(player.pos.x, player.pos.z, 900);
      if (!near) return null;
      const c = near.cave;
      const m = c.mouth;
      const yaw = Math.atan2(m.ux, m.uz);
      await world.teleport(m.x - m.ux * 4, m.z - m.uz * 4, yaw);
      world.look(yaw + Math.PI, 0.25, 5);
      await T.until(() => caves.built.has(c.id), 30000);
      // note what the HUD says on the way in
      window._said = [];
      new MutationObserver(() => window._said.push(document.getElementById('toast').textContent)).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true });
      return { id: c.id, name: c.name, built: caves.built.has(c.id), deep: c.nodes[2], out: { x: m.x - m.ux * 3, z: m.z - m.uz * 3 }, way: c.nodes[1] };
    });
    assert.ok(cave, 'there is a cave within reach');
    assert.ok(cave.built, 'and it is ready by the time you get there');
    await shot('cave-mouth');
    // Hold W: in through the mouth until there's a roof over your head.
    await page.keyboard.down('KeyW');
    const went = await page.evaluate(() => T.until(() => world.player.space && world.player.pos.y < world.chunks.heightAt(world.player.pos.x, world.player.pos.z) - 2.5, 30000));
    await page.keyboard.up('KeyW');
    assert.ok(went, 'walked in under the hill');
    // ...and on along its passages, the way the foreman walks you.
    const deep = await page.evaluate(async (c) => {
      const { player, chunks, sky, headlamp } = world;
      // round the bend at the end of the way in, not through it
      for (const to of [c.way, c.deep]) {
        player.steer = { x: to.x, z: to.z };
        await T.until(() => Math.hypot(player.pos.x - to.x, player.pos.z - to.z) < 0.5, 60000);
      }
      player.steer = null;
      await T.frames(40);
      const p = player.pos;
      return { reached: Math.hypot(p.x - c.deep.x, p.z - c.deep.z), under: chunks.heightAt(p.x, p.z) - p.y, floor: p.y - c.deep.floor, inside: !!player.space, open: sky.open, lamp: headlamp.level, said: window._said };
    }, cave);
    assert.ok(deep.reached < 0.5, `followed the passage (${deep.reached.toFixed(2)} m off)`);
    assert.ok(deep.inside && deep.under > 2.5, 'deep in the cave');
    assert.ok(Math.abs(deep.floor) < 0.5, 'on its floor');
    assert.ok(deep.open < 0.4, `out of the daylight (${deep.open.toFixed(2)})`);
    assert.ok(deep.lamp > 0.9, 'with the headlamp on');
    assert.ok(deep.said.includes(cave.name), `and told where (${deep.said.join(' · ')})`);
    await shot('cave-inside');
    await key('KeyK');
    assert.ok(await page.evaluate(() => T.until(() => world.headlamp.level < 0.05, 10000)), 'K puts the lamp out');
    await key('KeyK');
    // Leave and come back: you are where you were, under the hill.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // where you stand is noted every 2 s
    await open();
    const back = await page.evaluate((c) => ({ inside: !!world.player.space, d: Math.hypot(world.player.pos.x - c.deep.x, world.player.pos.z - c.deep.z), floor: world.player.pos.y - c.deep.floor }), cave);
    assert.ok(back.inside && back.d < 2 && Math.abs(back.floor) < 0.5, 'a reload finds you still in the cave');
    // and out again the way you came
    const out = await page.evaluate(async (c) => {
      const { player } = world;
      for (const to of [c.way, c.out]) {
        player.steer = { x: to.x, z: to.z };
        await T.until(() => Math.hypot(player.pos.x - to.x, player.pos.z - to.z) < 0.5, 60000);
      }
      player.steer = null;
      await T.frames(60);
      const place = world.map.places.get(c.id);
      const p = player.pos;
      return { inside: !!player.space, at: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), short: +Math.hypot(p.x - c.out.x, p.z - c.out.z).toFixed(2), open: world.sky.open, place: place && { kind: place.kind, name: place.name, visited: place.visited }, known: world.caves.list().length };
    }, cave);
    assert.equal(out.inside, false, `back out on the hillside (${JSON.stringify(out)})`);
    assert.ok(out.open > 0.9, 'in the daylight');
    assert.deepEqual(out.place, { kind: 'cave', name: cave.name, visited: true }, "it's on the map, and remembered as visited");
    return { ...cave, deep, back, out };
  });
}
